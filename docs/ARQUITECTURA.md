# Recorte · arquitectura

## Capas

- **Shell:** Electron. Ventana, diálogos, sistema de archivos, protocolo de medios y actualizaciones.
- **UI:** React + TypeScript + Vite. Proyectos, clips, inspector, cola de render, marca y ajustes.
- **Núcleo:** Node. Orquesta el pipeline, guarda el proyecto y habla con FFmpeg y Python.
- **Motor de medios:** FFmpeg para ingesta, proxies, cortes y render. Python + faster-whisper para transcripción.
- **Almacenamiento:** una carpeta por proyecto con JSON y archivos derivados. Sin base de datos todavía.

## Pipeline

```
importar                                                            [hecho]
  → ffprobe (duración, resolución, fps, pistas)
  → miniatura 640 px
  → proxy 720p en segundo plano (si el video supera 720p y 30 s)
  → transcripción local con tiempos por palabra              [hecho]
  → candidatos locales (ventanas de 18-52 s)                 [hecho]
  → análisis con LLM (gancho, claridad, autonomía, puntuación) [hecho, opcional]
  → revisión humana                                           [hecho]
  → corte + reencuadre 9:16 + subtítulos + marca              [hecho]
  → render por lote                                           [hecho, en serie]
  → QC (loudness, color, safe areas, duración)                [pendiente]
  → exportación (MP4, SRT, portada, OTIO/XML)                 [MP4 + SRT + portada]
```

## Selección de momentos

Dos caminos que producen el mismo `ClipSuggestion[]`:

- **Local (por defecto).** `src/main/momentos.ts` recorre la transcripción y propone ventanas que
  empiezan y acaban en fronteras de segmento. Puntúa señales del guion: pregunta inicial, error,
  descubrimiento, lista, contraste, números y llamadas al espectador. También premia una duración
  cercana a 30 s y castiga empezar a mitad de una frase. Después elimina solapamientos: dos clips
  no comparten más del 30 % de su contenido. Es deliberadamente local y determinista: no necesita
  clave ni conexión.
- **IA (opcional).** `src/main/ia.ts` ofrece dos modos (`AjustesIA.proveedor`) y dos tareas:
  elegir momentos (`ClipSuggestion[]`) y editar el video completo (`RecetaEdicion`, fase 1):
  - `api`: envía la transcripción compacta con tiempos a una API de chat compatible con
    OpenAI. Los ajustes traen presets: plan de Kimi (`api.kimi.com/coding/v1`, descuenta de
    la membresía), Kimi API y OpenAI (pago por uso), Ollama (local, sin clave).
  - `cli`: usa la suscripción del usuario a través de cualquier agente CLI local
    (Claude Code, Kimi Code CLI, Codex, Gemini…). El comando se configura en Ajustes
    (`comandoCli`, por defecto `claude -p`); el prompt va por stdin y la respuesta se
    lee de stdout. Si el comando contiene la marca `{prompt}`, el prompt se escribe en
    un archivo temporal y la marca se sustituye por su ruta — para agentes que toman
    el prompt como argumento: `kimi -p "@{prompt}"` (verificado con Kimi Code 2.5.1
    y la membresía del usuario; `scripts/prueba-agente.mjs` prueba el camino real).
    Sin clave API ni facturación por uso. Requiere el agente instalado y con sesión
    iniciada.
  Ambos validan la respuesta igual: tiempos dentro de la clase, 5-180 s, máximo 12 clips,
  anti-solapamiento (y, en la receta, cortes acotados y valores de color/velocidad con
  pinza). Si el modelo falla, el canal cae a la selección local y devuelve un `aviso`
  para la interfaz.

Los ajustes de IA (proveedor, servidor, modelo, clave) se guardan en `userData/ajustes.json` vía
`src/main/ajustes.ts`. La clave se cifra con `safeStorage` del sistema y nunca llega al renderer:
la interfaz solo ve `tieneClave`. Solo se envía la transcripción con tiempos, nunca el video.

## Render

`src/main/render.ts` produce un MP4 vertical de 1080×1920:

- Corte por `-ss`/`-t` sobre el original, sin recomprimir el material completo.
- `centro`: escala para cubrir y recorta el centro.
- `cara`: sigue la cara principal con detección Haar muestreada cada 0,5 s, interpolación y
  suavizado (`python/caras.py`); el crop se anima con una expresión por tramos en FFmpeg. Si no
  hay caras o falta OpenCV, cae al recorte central sin fallar.
- `division`: fondo desenfocado a pantalla completa y video original encima.
- Subtítulos quemados desde los tiempos por palabra, agrupados en bloques de 3-5 palabras.
- Estilo ASS con el color principal de la marca, borde oscuro y nombre del curso arriba.
- MP4 H.264 + AAC con `faststart` y un SRT con los mismos bloques.
- Portada JPG extraída del MP4 ya renderizado (~1,2 s), con subtítulos y marca visibles.
- Progreso por `-progress pipe:1` y carpeta `salidas/` dentro del proyecto.

### Render de una RecetaEdicion (fase 1)

`renderReceta()` ejecuta la edición completa que propone un agente:

- `filter_complex` con un `trim`/`atrim` por corte, reencuadre vertical por centro,
  color (`eq`), velocidad (`setpts`/`atempo`) y unión con `concat` (corte seco) o con
  cadena `xfade`/`acrossfade` de 0,4 s (fundido).
- Los captions se remapean al tiempo final (velocidad y fundidos descontados) y se
  queman al final de la cadena con el mismo estilo ASS de marca.
- Salida: `salidas/edicion-<título>.mp4` + SRT + portada JPG. La interfaz muestra la
  receta en lenguaje humano (`describirReceta`, en `src/shared/receta.ts`) antes de
  renderizar; el validador estricto está en `src/main/receta.ts` y el respaldo local
  (`recetaLocal`) arma una edición mínima con el mejor momento si el agente falla.

La salida queda registrada en `ClipSuggestion.output`, así que la cola y el botón «Abrir»
sobreviven al reinicio.

El render por lote (`proyecto:renderizar-lote`) procesa los clips pendientes **en serie**: un
FFmpeg a la vez, para no saturar el equipo. Toma por defecto todos los clips que no estén
`listo` (los errores anteriores reintentan) o una lista de ids. Antes de cada clip relee el
proyecto del disco, así los cambios de título, gancho o marca hechos durante el lote se respetan
en el siguiente render. Cada evento de progreso lleva `lote: { indice, total }` para que la
interfaz muestre el avance conjunto, y mientras un lote corre se rechazan renders sueltos del
mismo proyecto (`enLote`).

### Creación desde cero con HyperFrames (fase 2, motor puente)

`crearVideo()` (`src/main/crear.ts`) genera un video sin usar el material fuente:

- El agente (CLI o API, la misma configuración de Ajustes) recibe la petición del usuario más la
  marca del proyecto y escribe una **composición HyperFrames standalone**: un solo `index.html`
  vertical 1080×1920 con escenas `.clip`, GSAP por CDN y una timeline pausada en
  `window.__timelines`.
- **Material del usuario** (opción «Incluir fragmentos de mi video»): `extraerFragmentos()` corta
  hasta 3 fragmentos de 5 s repartidos a lo largo del fuente (H.264 1080p máx + AAC con la voz) en
  `creaciones/<nombre>/media/`, y el prompt incluye el contrato de medios de HyperFrames: cada
  `<video>` es su propia escena con `data-start`/`data-duration` en el propio elemento (nunca en un
  envoltorio), `data-has-audio="true"` para conservar la voz, y prohibido llamar play()/seek() desde
  el código. El agente intercala titulares y formas entre los fragmentos.
- **Tipos de video** (`src/shared/estilos.ts`): tarjetas de tema (clase, lista, promo, historia,
  noticia, receta, motivacional, libre). Cada tipo lleva una guía editorial propia —estructura,
  ritmo y cierre— que se inyecta en el prompt; el agente actúa como editor profesional que adapta
  el criterio al tema y a la marca del usuario. El usuario elige la tarjeta en la pestaña «Crear».
- La composición se guarda en `creaciones/<nombre>/index.html` (queda inspeccionable y editable)
  y `hyperframes render` la convierte en `salidas/creado-<nombre>.mp4` (30 fps).
- Si el agente falla, se renderiza una plantilla de marca local; si falta HyperFrames, el error
  dice cómo instalarlo (`npm i -g hyperframes`).
- `src/main/binarios.ts` (`resolverBinario`, `pathAmpliado`) encuentra binarios globales aunque
  no estén en el PATH del usuario: `%APPDATA%\npm`, el npm-global de Daimon, WinGet Links y el
  glob de winget para ffmpeg. Se usa en todos los procesos hijo (agente, hyperframes, login).
- El resultado queda en `Project.creacionSalida`.

## Almacenamiento

Cada proyecto vive en `app.getPath('userData')/proyectos/<id>/`:

```
proyecto.json       metadata del proyecto (sin la transcripción)
transcripcion.json  segmentos y palabras con tiempos
miniatura.jpg       primer fotograma útil
proxy.mp4           copia 720p para preview
salidas/            MP4, SRT y portadas JPG renderizados
sub-<clip>.ass      subtítulos temporales del render
caras-<clip>.json   caché del seguimiento de cara por clip
```

El video original **no se copia**: `proyecto.source.path` lo referencia. La carpeta del proyecto
se puede mover o borrar sin tocar el material del creador.

`proyecto.json` se escribe con temporal + reemplazo atómico (`src/main/disco.ts`). La transcripción
se guarda aparte para que listar proyectos no cargue megabytes de palabras.

## Modelo de datos

```ts
Project
  id, name, createdAt, updatedAt
  source: { path, name, duration, width, height, fps, thumbnail? }
  transcript?: TranscriptSegment[]
  clips: ClipSuggestion[]
  brand: BrandKit
  transcription: 'pendiente' | 'transcribiendo' | 'lista' | 'error'
  transcriptionError?, language?, proxy?, thumbnail?, demo?
  receta?: RecetaEdicion, recetaSalida?, creacionSalida?

TranscriptSegment
  id, start, end, text, words: { text, start, end }[]

ClipSuggestion
  id, start, end, title, hook, score, reason
  status, captionStyle, reframe, output, cover

BrandKit
  name, primary, secondary, font, logo
```

## Protocolo de medios

La interfaz no recibe rutas del sistema. Los archivos se sirven con:

```
recorte-media://<projectId>/fuente        video original
recorte-media://<projectId>/proxy.mp4     proxy del proyecto
recorte-media://<projectId>/miniatura.jpg miniatura
```

El handler (`src/main/media.ts`) valida el id, impide salir de la carpeta del proyecto y soporta
rangos HTTP para que el reproductor pueda buscar.

## IPC

| Canal | Función |
|---|---|
| `dialog:open-video` | Elegir un video |
| `proyecto:crear` | ffprobe + carpeta + miniatura + proxy en segundo plano |
| `proyecto:listar` | Listado ligero, ordenado por `updatedAt` |
| `proyecto:abrir` | Proyecto completo con transcripción |
| `proyecto:guardar` | Guardado con retardo desde la interfaz |
| `proyecto:transcribir` | Ejecuta Python y guarda `transcripcion.json` |
| `proyecto:generar` | Propone momentos (IA si está activada; si no, heurísticas locales) |
| `ajustes:cargar` | Ajustes de IA sin la clave (solo `tieneClave`) |
| `ajustes:guardar` | Guarda ajustes y cifra la clave con safeStorage |
| `proyecto:renderizar` | Renderiza un clip y guarda el MP4 y el SRT |
| `proyecto:renderizar-lote` | Renderiza en serie todos los clips pendientes (o los ids indicados) |
| `proyecto:abrir-salida` | Revela el MP4 en el explorador del sistema |
| `proyecto:crear-video` | Crea un video desde cero: agente → composición HyperFrames → MP4 |
| `proyecto:abrir-creacion` | Revela el MP4 creado en el explorador |
| `progreso` (evento) | Ingesta, transcripción y render en vivo |

El proceso principal es dueño de `proxy`, `thumbnail`, `transcription`, `transcriptionError` y
`language`: al guardar desde la interfaz se conservan los valores del disco para no pisar trabajo
en curso.

## Dependencias del equipo

- **FFmpeg y ffprobe** en el `PATH`. Se pueden apuntar con `RECORTE_FFMPEG` y `RECORTE_FFPROBE`.
  La build debe incluir **libass** para quemar los subtítulos.
- **Python 3.10+** con `faster-whisper` y `numpy` (`python/requirements.txt`). Se puede apuntar con
  `RECORTE_PYTHON`.
- **Modelo de voz:** `small` por defecto; se cambia con `RECORTE_MODELO` (`tiny`, `base`, `small`,
  `medium`, `large-v3`).
- **HyperFrames** (`npm i -g hyperframes`) para la creación de video desde cero (fase 2). No hace
  falta que esté en el PATH del usuario: `src/main/binarios.ts` lo busca en las carpetas globales
  habituales de npm.

El audio se decodifica con FFmpeg a 16 kHz mono y se le pasa a Whisper como muestras. Así no se
depende de PyAV para leer el archivo y se evita la incompatibilidad de `faster-whisper` 1.2.1 con
PyAV 19.

## Decisiones

- **Sin Remotion en el MVP.** El render sale de FFmpeg + subtítulos ASS + overlays. Evita una
  dependencia con licencia propia y mantiene el instalador pequeño. Si más adelante hace falta
  motion graphics, se evalúa con su licencia.
- **Sin nube.** Los archivos no salen del equipo. Eso es parte de la propuesta y elimina costes de
  almacenamiento y egreso.
- **JSON antes que SQLite.** Un proyecto por carpeta es fácil de inspeccionar, copiar y recuperar.
  SQLite entra cuando haya consultas, historial o escrituras concurrentes que lo justifiquen.
- **LLM opcional, con respaldo local.** La selección por defecto es local y determinista. El
  análisis con modelo usa la clave API del usuario (guardada cifrada) o la suscripción de
  cualquier agente CLI local que tenga instalado, envía solo la transcripción y cae a las
  heurísticas si falla.
- **Seguimiento de cara local y con respaldo.** La detección usa un cascade Haar de OpenCV
  muestreado cada 0,5 s, con interpolación de huecos y suavizado; el resultado se cachea por
  clip (`caras-<clip>.json`) y se invalida si cambian los tiempos. Si no hay Python, OpenCV o
  caras, el encuadre `cara` cae al recorte central sin bloquear el render.
- **Clean-room.** Este proyecto no reutiliza código, skills, prompts, plantillas ni assets de Sloth.
  La licencia de Sloth prohíbe vender derivados sin permiso.
- **FFmpeg LGPL.** Distribuir una build LGPL y cumplir sus avisos. Revisar patentes de códecs antes
  de vender en cada país.

## Hitos

1. **Esqueleto visual.** Interfaz, navegación, datos de ejemplo, diálogo de importación. (hecho)
2. **Ingesta real.** FFprobe, miniatura, proxy, transcripción local y persistencia en JSON. (hecho)
3. **Selección.** Candidatos locales, lista revisable y edición de título, gancho, subtítulo y
   encuadre. (hecho; análisis con LLM opcional incluido)
4. **Render.** Reencuadre 9:16, subtítulos, marca y primer MP4 vertical con SRT. (hecho)
5. **Lote.** Cola de varios clips, progreso conjunto, portada y nombres. (hecho)
6. **Editor.** Timeline multipista, preview real, comandos, undo/redo y exportación WYSIWYG.
   (siguiente: es el centro del producto, no un extra)
7. **Empaquetado.** Instalador, primeros tres beta, medición de tiempos. (instalador NSIS
   generado con `npm run package`, sin firma de código; beta y medición pendientes)
