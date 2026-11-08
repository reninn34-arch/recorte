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

## Timeline (la pieza central del editor)

`src/shared/timeline.ts` define el documento `Timeline` que comparten la interfaz, el reproductor y,
en el siguiente paso, los agentes y el render. Se guarda en `proyecto.json` (`Project.timeline`) y el
proceso principal lo valida con `normalizarTimeline` antes de escribirlo.

- **Pista de video magnética** (`clips`): clips de la fuente uno tras otro, sin huecos. Borrar o
  recortar cierra el hueco solo.
- **Pista de textos** (`textos`): rótulos con posición absoluta en la timeline.
- **Operaciones puras**: `dividir`, `borrarClip`, `recortarClip`, `moverClip`, `duplicarClip`,
  `borrarTramo`, `anadirTexto`, `cambiarTexto`, `borrarTexto`. Cada una devuelve una timeline nueva:
  eso da deshacer/rehacer gratis (`useHistorial`, `src/renderer/src/hooks/timeline.ts`).
- **Reproductor sin render** (`useReproductor`): un `<video>` con el proxy que salta de corte en corte;
  el reloj es la timeline. Los rótulos se dibujan encima del monitor.
- **Puentes**: la receta del agente y cualquier momento se llevan a la timeline
  (`timelineDesdeReceta`, `timelineDesdeCortes`) y ahí se siguen editando a mano.

- **Exportar** (`src/main/exportar.ts`): cada clip entra como su propia entrada de FFmpeg
  (`-ss`/`-t` antes de `-i`), se unen con `concat` y los rótulos y, si se pide, los subtítulos de la
  voz se queman con ASS. Formato original o vertical 9:16. Sale a `salidas/timeline-*.mp4`.

## Chat con el agente

El agente edita la misma timeline que el usuario, conversando (`ChatAgente.tsx`):

- **Contrato** (`src/shared/chat.ts`): el agente responde `{"mensaje", "operaciones"}`. Las operaciones
  son las de la timeline (`borrar_tramo`, `quitar_pausas`, `dividir`, `mover_clip`, `recortar_clip`,
  `anadir_texto`, `cambiar_texto`, `borrar_texto`, `reconstruir`). `validarOperaciones` descarta lo que
  no encaja y `aplicarOperaciones` las ejecuta de forma pura.
- **Lo que ve el agente** (`describirTimelineParaAgente`): clips con tiempos de timeline y de fuente,
  rótulos, la voz dentro de la timeline y la que quedó fuera. Con el mensaje viaja dónde está el
  usuario (cabezal, clip o texto elegido).
- **Turno** (`src/main/chat.ts`, IPC `agente:chat`): funciona con cualquier agente CLI o API
  (`preguntarAgente` / `preguntarApi`); sin MCP ni configuración por proveedor.
- **Deshacer**: las operaciones de una respuesta se aplican en la interfaz como un solo paso del
  historial; el botón «Deshacer» del mensaje o Ctrl+Z lo revierten.
- `quitar_pausas` lo calcula Recorte con los tiempos por palabra: el agente decide, Recorte mide.
- La conversación se guarda en el proyecto (`Project.chat`, últimos 60 mensajes).

## Zoom, color y música

- Cada clip puede llevar `ajustes` (zoom 1–2, brillo, contraste, saturación). El monitor los aplica
  con CSS (`scale`, `filter`) y el export con `crop` centrado + `eq` de FFmpeg.
- `Timeline.musica` es una pista bajo toda la edición. El archivo se copia a `media/` del proyecto
  (`proyecto:importar-musica`) y `normalizarMusica` solo acepta rutas `media/<archivo>`. Se repite si
  es corta y se funde al final.
- **Ducking**: la música baja a un cuarto (−12 dB) en los tramos con voz de la transcripción, con
  rampas de 0,15 s; el monitor (`useMusica`) y el export (`envolventeDucking`) usan los mismos tramos.
  Sin transcripción, el export cae a `sidechaincompress`.
- El grafo de filtros del export va en `filtro-timeline.txt` (`-/filter_complex`), así no choca con el
  límite de la línea de órdenes de Windows.
- El agente tiene `zoom`, `color`, `musica` y `quitar_musica`. No elige archivos de música: los pone
  el usuario.

Pendiente: biblioteca con varias fuentes, transiciones, velocidad, y que el agente pueda mirar fotogramas.

## Inicio y agentes

- La app arranca en **Inicio** (`Inicio.tsx`), como cualquier editor: proyectos recientes con
  miniatura y «Nuevo proyecto». No abre el último proyecto sola.
- En Inicio está el agente. Si no hay ninguno listo, el recuadro se resalta y pide conectarlo.
- `src/main/agentes.ts` conecta con un clic: si falta el programa lo baja de npm a
  `<userData>/agentes`; Kimi y Codex inician sesión en el navegador; Claude Code y Gemini CLI abren su
  ventana y la interfaz espera sus credenciales (`useAgentes`). El comando del agente queda interno:
  el usuario nunca lo escribe.

## Crear con IA

Inicio tiene dos puertas: **Editar un video** (importar → editor) y **Crear con IA** (sin material).

- **Pantalla Crear** (`CrearIA.tsx`): la petición primero, como en un chat; adjuntos (fotos o clips),
  formato (9:16 o 16:9) y duración. Los tipos de video (`src/shared/estilos.ts`) se agrupan por
  objetivo: Enseñar, Vender, Contar, Inspirar. Sin elegir ninguno, decide el agente.
- **Creación** (`src/shared/creacion.ts`, `src/main/creaciones.ts`): carpeta
  `<userData>/creaciones/<id>/` con `creacion.json`, la composición en `composicion/` (adjuntos en
  `composicion/media/`) y los MP4 en `salidas/`. El protocolo de medios la sirve como
  `recorte-media://c-<id>/…`.
- **Fases** (`EstudioCreacion.tsx`): Idea → Guion → Video → Editor.
  - `creacion:guion`: el agente propone el guion por escenas (JSON validado con `validarGuion`);
    cada mensaje del chat lo cambia.
  - `creacion:video`: el agente compone el HTML de HyperFrames a partir del guion y Recorte lo
    renderiza (`video-vN.mp4` + portada). Con el video hecho, cada mensaje edita esa composición y
    se vuelve a renderizar.
  - `creacion:editor`: el MP4 se importa como un proyecto normal (misma ingesta que «Nuevo
    proyecto») y se sigue en la timeline: cortes, rótulos, música, zoom, chat. Si ya se abrió, se
    vuelve al mismo proyecto.
- El editor ya no tiene la pestaña «Crear»; el chat del panel es la IA sobre lo que ya hay.

### Voz de las creaciones

Fase **Voz** entre Guion y Video (`PasoVoz.tsx`, `src/main/voz.ts`):

- Cada escena del guion trae `texto` (lo que se lee en pantalla) y `narracion` (lo que se dice).
- **Voz de Gemini**: API oficial de AI Studio (`POST /v1beta/interactions`, modelo
  `gemini-3.8-flash-tts` y, si falla o no hay cuota, `gemini-3.8-flash-lite-tts`) con la clave del
  usuario, guardada cifrada (`Ajustes.guardarVoz`); la interfaz solo sabe si hay clave. Una petición
  por voz.
- **Mi voz**: se graba en la app (MediaRecorder, WebM) o se sube un audio; FFmpeg lo pasa a WAV.
- Todas acaban en `composicion/media/voz.wav`. Whisper la transcribe en local y `alinearEscenas`
  reparte las palabras por escena: la voz manda los tiempos del video.
- El agente compone sin audio con esos tiempos; tras el render, FFmpeg mezcla la voz en el MP4.
- Cambiar el guion quita la voz (ya no le corresponde) y lo avisa en el chat.

### Copiar un estilo (video de referencia)

En la caja de Crear hay un segundo botón redondo (icono de película) para subir **un video de
referencia**: se copia su estilo de edición; el video no entra en la pieza final. Con referencia,
la creación gana la fase **Estilo** (la primera) y `Creacion` guarda `referencia`, `ficha` y
`viabilidad`. La referencia se convierte a `analisis/referencia.mp4` (H.264, ≤1080p).
Tus videos entran **completos** a `media/` (hasta 30 min, antes se cortaban a 20 s) y la composición
usa trozos con `data-media-start`.

- **Análisis local, sin gastar créditos** (`src/main/estilo/`):
  - `material.ts`: los videos del usuario se analizan una vez —también sin referencia, antes de
    escribir el guion— (caché por tamaño y fecha en
    `analisis/material.json`): planos por detección de escena de FFmpeg, miniaturas y una hoja de
    contacto. Respeta «Parar» (mata el FFmpeg en marcha).
  - `referencia.ts`: la referencia se mide igual y además loudness, silencios, 8 colores medios,
    hasta 24 fotogramas (`ref-NN.jpg`) y 3 hojas de contacto, y transcripción Whisper. Resultado en
    `analisis/estilo-medido.json`.
  - `ficha.ts`: el agente de la tarea «guion» estudia los fotogramas y lo medido, y devuelve la
    **ficha de estilo** (JSON validado con `validarFicha`, en `analisis/estilo.json`). Los agentes
    CLI reciben las rutas absolutas de las imágenes en el prompt; por API van en base64 (máx. 8).
    Si el agente no ve imágenes o falla, la ficha se arma solo con lo medido (`aproximada: true`).
    Modo opcional `gemini`: con la clave de AI Studio, el «flash» más nuevo que liste la API ve el
    video completo junto con lo medido (Files API: subida resumable, espera a ACTIVE,
    `generateContent`, borrado). Sin probar con una llave real. Ver imágenes por ruta: comprobado
    con Kimi; con Claude Code, Codex y Gemini CLI, sin comprobar. Si no se da ritmo, la ficha lleva
    el medido.
  - `viabilidad.ts`: cruza la ficha con lo conectado hoy (Flow, ChatGPT, voz, HyperFrames) y con la
    creación (¿hay material?) y da un porcentaje por recurso (material 30, motion 15, subtítulos 15,
    recorte 10, imagen 10, clip 10, voz 5, música 5). Solo marca «sí» lo que Recorte hace hoy:
    subtítulos palabra por palabra cuentan como «parcial» (salen por frase) y los recortes de
    persona se sustituyen (aún no se quita el fondo).
- **Interfaz** (`PasoEstilo.tsx`): ficha editable a mano en ritmo y subtítulos
  (`estilo:ficha-guardar`), informe de viabilidad con «Conectar en Ajustes», «Ya lo conecté»
  (`estilo:viabilidad` recalcula sin volver a analizar) y «Continuar así» (`estilo:continuar` pasa
  al guion).
- **El guion y la composición reciben el estilo**: `promptGuion` y `promptComposicion` insertan
  `bloqueEstiloGuion(ficha, medido)` y `resumenMaterial(videos)` — el agente puede pedir trozos
  concretos del material por archivo y segundos.
- IPC: `dialog:open-referencia`, `creacion:nueva` (acepta `referencia`), `estilo:analizar`,
  `estilo:continuar`, `estilo:viabilidad`, `estilo:ficha-guardar`.

## Ajustes

`Opciones.tsx` reúne todo lo que conecta Recorte, en una columna:

- **Agentes** (`ListaAgentes.tsx`, la misma lista que Inicio en versión compacta): logo oficial,
  qué cuenta usa, versión instalada (`agentes:versiones`), botón «Conectar con…», el último error y,
  para Claude Code, «Paga con: Tu suscripción | Llave de API». Con llave, el proceso del agente recibe
  `ANTHROPIC_API_KEY` (`definirEntornoAgentes` en `ia.ts`); la llave se guarda cifrada.
- **Voz**: la cuenta de Google (Edge) o la llave de AI Studio.
- **Avisos**: notificación y sonido cuando termina un trabajo largo y Recorte no está a la vista.
- **Tu equipo**, **Espacio en disco** y **Herramientas de video** (`src/main/sistema.ts`): procesador,
  memoria, tarjeta gráfica, disco libre y lo que ocupa Recorte; FFmpeg, Python, sus paquetes,
  HyperFrames, Node y Edge con su versión. Los paquetes de Python y HyperFrames se instalan con un botón.
- **Avanzado · API propia**: cualquier servidor compatible con OpenAI.

Los logos están en `src/renderer/src/assets/logos/` (Lobe Icons, MIT, y Simple Icons, CC0; ver
`LICENCIAS.md`).

## Google Flow

Imágenes (Nano Banana, no gastan créditos) y videos (Veo, sí) con las cuentas de Google del usuario.
Flow no tiene API: Recorte maneja su página como lo haría la persona.

- `src/main/edgeperfil.ts`: un Edge por perfil. Para entrar con Google solo mira por CDP directo
  (sin Playwright) y usa un puerto libre ya elegido, nunca 0. La voz y Flow comparten el perfil de la
  cuenta de la voz y su turno, así no abren dos Edge sobre la misma sesión.
- `src/main/flowpagina.ts`: entrar al proyecto de Recorte en Flow (o crearlo), elegir tipo, formato,
  x1 y modelo, leer el costo, escribir la petición, esperar la tarjeta y bajarla. Los botones se
  reconocen por su icono (no cambia con el idioma); la ventana es angosta para que Flow enseñe su
  compositor directo, que dice el costo.
- `src/main/flow.ts`: cuentas (la de la voz y las agregadas en `<userData>/flow/cuentas/<id>/`),
  saldos, uso de hoy y del mes, y el reparto: hasta 3 a la vez; si Flow no empieza un pedido (no
  gastó) la cuenta descansa y el pedido pasa a otra. Nunca pasa del tope de créditos del pedido.
- «Ayudar a mejorar Flow» solo se toca si el usuario lo eligió en Ajustes; sin «Tengo los derechos»
  no se mandan imágenes de referencia. Aceptar el aviso de Flow la primera vez lo hace la persona
  («Abrir Flow»).
- En **Crear con IA**, «Imágenes con Flow» y «Clips con Veo» hacen que el guion pida `imagen` o
  `clip` por escena; antes de componer, Recorte los genera (`generarMedioFlow`), los guarda en
  `media/flow-escena-N.*` y el diseñador los usa. Rehacer el video no vuelve a gastar.

Pendiente: generar B-roll desde el editor (necesita varias fuentes en la timeline).

## Voz montada, carpeta de videos, medios y borrar

- **Poner la voz en un video hecho** (`src/main/montajevoz.ts`): sin agente ni tokens. La voz manda:
  cada escena dura lo que su frase (hasta ×1,25 más lenta y luego quieta en su último cuadro), cada
  frase entra con su escena, y la voz se limpia (paso alto, compresión, −16 LUFS). Cada escena y cada
  frase entran como su propia entrada de FFmpeg: sacar varios trozos de una sola entrada lo bloquea.
  Se hace solo al terminar una voz si ya hay video, con el botón «Poner la voz en el video» o si el
  chat lo pide (`pideMontarVoz`). Una creación que quedó en «video» al cerrar la app se destraba sola.
- **Carpeta de tus videos** (`src/main/carpetas.ts`): por defecto `Videos\Recorte`, se elige en
  Inicio la primera vez o en Ajustes. Exportar escribe ahí (una subcarpeta por proyecto) y cada video
  creado con IA se copia ahí.
- **Medios** (`Project.medios`, `MediosPanel.tsx`): varios videos e imágenes por proyecto. Los clips
  los nombran por `fuente`; el reproductor cambia de archivo al cambiar de fuente y lleva su propio
  reloj en las imágenes; la exportación lee cada clip de su archivo, las imágenes como cuadro fijo y
  con silencio donde no hay sonido. Quitar un medio quita sus clips; la × del clip elegido lo quita.
- **Borrar** proyectos y creaciones desde Inicio: van a la Papelera (`shell.trashItem`).
- **Caja de Crear con IA** (`CajaCrear.tsx`): quién lo hace (optimizado o agente y modelo por paso),
  formato, duración, imágenes y clips de Flow con su modelo y costo, y confirmar derechos.
- **Parar al agente** (`ia.ts`: `empezarTrabajo`/`pararTrabajo`): cada trabajo largo tiene su clave
  (`chat:<proyecto>`, `creacion:<id>`) y una señal. Parar mata el proceso del agente con todo lo que
  lanzó (`taskkill /T` en Windows), corta la petición a la API, saca de la fila de Flow lo que aún no
  empezó y detiene el render. Lo que ya se genera en Flow termina (cortarlo no devuelve créditos).
- **Editar, reenviar y volver** en el chat del editor: cada mensaje del usuario guarda la timeline de
  antes (`MensajeChat.antes`). Volver a un mensaje borra lo que vino después y, si el agente cambió
  algo, deja la timeline como estaba en un solo paso de deshacer.

## Tu criterio: el agente propone y aprende

- `shared/gustos.ts` + `main/gustos.ts` (`<userData>/gustos.json`): gustos «dichos» (Ajustes → Tu
  criterio) y «aprendidos» (el agente los devuelve en `aprendido`), señales de lo que el usuario hace
  con las propuestas (deshace, corrige y reenvía, elige, para) y cuántas veces usa cada formato,
  duración y tipo en Crear con IA.
- Cada prompt (chat del editor, guion y composición) lleva `bloqueGustos()`. El agente responde
  también `propuestas` (botones con siguientes pasos) y `aprendido` (preferencias duraderas, no
  pedidos puntuales). Las señales no son gustos: el agente las lee y, si ve un patrón, lo aprende.
- Todo se ve, se borra y se apaga en Ajustes. La caja de Crear empieza con lo que más usa.

## Publicar una versión (instalador y actualizaciones)

- `electron-builder.yml` publica en GitHub Releases (`reninn34-arch/recorte`); la app instalada usa
  `electron-updater` (`main/actualizar.ts`): revisa al abrir y cada 4 h, baja en segundo plano y
  muestra «Recorte X está lista · Reiniciar y actualizar» (si no, se instala al cerrar).
- Para sacar una versión: `npm version patch` (o `minor`) y `git push --follow-tags`. El workflow
  `.github/workflows/release.yml` compila el instalador en Windows y crea el release con `gh`
  (instalador, `.blockmap` y `latest.yml`). No uses `--publish always` de electron-builder: sube
  los archivos en paralelo y puede crear dos releases con la misma etiqueta.
- El repositorio tiene que ser público para que la app lea los releases sin token.
- El instalador no está firmado: Windows SmartScreen avisa la primera vez («Más información →
  Ejecutar de todas formas»). Firmarlo requiere un certificado de firma de código.

## Novedades, iconos e imágenes con ChatGPT

- `shared/novedades.ts`: lo nuevo de cada versión. La ventana `Novedades.tsx` se abre una vez tras
  actualizar (`Preferencias.novedadesVistas`) y desde Ajustes → Versión; el workflow saca de ahí las
  notas del release (`scripts/notas-version.mjs`) y el aviso de versión nueva muestra su resumen.
  **Antes de `npm version`, agrega la entrada de la versión nueva arriba del todo.**
- Iconos: `Icons.tsx` usa Lucide (ISC) con los nombres de la app.
- Imágenes con ChatGPT (`main/imagenchatgpt.ts`): con Codex conectado con la cuenta de ChatGPT, se le
  pide usar su herramienta de imágenes y se toma el archivo de `~/.codex/generated_images`. Una a la
  vez. El modelo lo pone OpenAI (no se puede elegir versión).

## Herramientas que se bajan con un botón

- `main/herramientas.ts`: FFmpeg (compilación GPL de BtbN, trae x264), Python 3.12 portátil
  (python-build-standalone, con pip) y Node.js LTS (zip de nodejs.org) se bajan a
  `<userData>/herramientas/<id>` desde su página oficial, se comprueba su SHA-256 (el `digest` de
  GitHub o el archivo de sumas) y se descomprimen con el `tar` de Windows.
- `activarHerramientas()` pone sus carpetas al frente del PATH del proceso al arrancar y tras cada
  descarga: todo lo que lanza Recorte (`ffmpeg`, `python`, `npm`, los agentes) usa la suya.
  `buscarPython()` prueba primero el Python propio.
- Ajustes → Herramientas de video: «Descargar» por herramienta (con progreso por el canal
  `herramienta`) e «Instalar todo lo que falta» (FFmpeg → Python → paquetes → Node → HyperFrames).
- Recorte no reparte FFmpeg en su instalador: el usuario lo baja de su página y la app lo llama
  como programa aparte.

## Modo agente (Crear con IA)

En la caja de Crear, **Agente | Guiado**. Guiado es el flujo de siempre (guion → voz → video con
HyperFrames). En **Agente**, el agente conectado trabaja como un editor con herramientas:

- `main/modoagente.ts`: cada creación tiene `trabajo/` con los archivos del usuario **tal cual** en
  `entrada/` (sin convertir), un manual (`AGENTS.md` y `CLAUDE.md`, mismo texto: lo leen Claude Code,
  Codex, Kimi y OpenCode) con las herramientas disponibles (rutas de FFmpeg, Python, HyperFrames) y
  el método: entender → mirar los archivos → medir → elegir herramienta → hacer → **comprobar con
  fotogramas** → entregar `resultado.json`.
- `comandoAgentico()` lanza el agente en `trabajo/` con permiso para usar herramientas sin preguntar,
  según el agente: Claude Code `--permission-mode acceptEdits --allowedTools "Bash Read Write Edit
  Glob Grep" --output-format stream-json --verbose` (solo escribe en su carpeta; el stream-json se ve
  en vivo); Kimi `--auto`; Codex `-s workspace-write -C <carpeta>`; OpenCode `--auto --dir`; Gemini
  CLI `--yolo` (sin probar). **Antigravity** va por ACP: Recorte le hace de «manos» (`Manos` en
  `antigravity.ts`): `fs/read_text_file`, `fs/write_text_file` y `terminal/*` (create, output,
  wait_for_exit, kill, release; ver agentclientprotocol.com), solo dentro de `trabajo/`; en vez de
  las fotos originales recibe las hojas del vistazo como imágenes en el pedido. Las API sin
  herramientas no pueden usar este modo.
- **Vistazo** (`prepararVistazo`, en segundos y una sola vez): `trabajo/vistazo/` con `fotos.jpg`
  (todas las fotos en miniatura 360×480, mismo formato de color, en hoja de hasta 4 columnas),
  `video-NN.jpg` (12 fotogramas por video), `audio-NN.wav` (16 kHz mono) y `LEEME.txt`. El manual
  pide mirar eso antes que los originales; el plan es solo un vistazo (sin medir a fondo ni
  renderizar, límite 30 min) y deja apuntes en `notas.md` que «hacer» reutiliza.
- La barra del panel es de **tiempo**: lo que lleva frente a lo habitual (plan ~5 min, hacer
  ~15 min), en ámbar y con aviso si se pasa; el avance real es la lista de lo último que hizo. La
  hora de inicio la guarda el proceso principal (`inicioCreacion`, va en cada `Progreso` como
  `desde`, y `creacion:en-curso`), así que salir y volver no reinicia el reloj; el registro va en vivo
  (`Progreso.registro`). Cada creación lleva su «trabajando» y su progreso en App.
- El agente se da por terminado al **salir** su proceso (+1,5 s), no al cerrarse su salida: un
  proceso que dejó de fondo (un render) mantenía `close` abierto hasta el límite.
- **Kit** (`python/kit/kit.py` + `RECETA.md`, se copia a `trabajo/kit/` con `rutas.json` de
  FFmpeg): el agente escribe `receta.json` (momentos `foto`, `video`, `comparar`, `collage`,
  `texto`, con rótulos, encuadre, brillo, desenfoques y la música) y `kit.py armar` lo hace en una
  pasada (NumPy + Pillow → FFmpeg) y deja `revision/hoja-final.jpg`; `--prueba` saca fotogramas
  sueltos en segundos; `golpes` mide los golpes de la música. Prueba: `npm run prueba:kit`.

## Modelos y esfuerzo por agente

`main/catalogo.ts` pregunta a cada agente qué modelos tiene (se recuerda un día en
`catalogo-modelos.json`): Claude Code con la petición de control `initialize` por stream-json
(`supportedEffortLevels`, sin mandar nada al modelo), OpenCode con `opencode models --verbose`
(precio 0 = gratis, `variants` = esfuerzos) y Antigravity con las `configOptions` de una sesión ACP
(`model` y `thought_level`; se aplican con `session/set_config_option`). Kimi y Gemini CLI llevan
los conocidos. `EleccionTarea` guarda `modelo` y `esfuerzo` (solo ids seguros, `ID_SEGURO`) y
`comandoConEleccion` (modelos.ts) los pone en el comando: `--model/--effort` (Claude), `-m/--variant`
(OpenCode), `-m` (Kimi, Gemini, Codex); Antigravity los lleva en su marca
(`antigravity:acp --model x --effort y`). En la interfaz: `ElegirModelo.tsx` dentro de «Por paso».
- Pasos (IPC `agente:plan`, `agente:hacer`): primero un **plan corto** (JSON `entendi/pasos/
  preguntas/herramienta`, sin producir nada) con el botón «Hazlo»; luego **hacer**. Recorte revisa la
  entrega por su cuenta (`revisarYPublicar`: que abra, cuánto dura y mide, 5 fotogramas) y, si falla,
  el agente corrige una vez. El final va a `salidas/agente-vN` y a la carpeta de videos. Un mensaje
  en el chat después del resultado es un **cambio**: el agente parte de sus archivos y toca solo eso.
- Los fallos de sesión o límite del plan se traducen (`explicarFallo` en `ia.ts`) para el usuario.
- `PanelAgente.tsx`: plan, registro en vivo de lo que hace, y la revisión (fotogramas y
  comprobaciones). Prueba: `npm run prueba:modo-agente` (con un «Claude» de prueba en el PATH).
- Probado de punta a punta con el agente de prueba. Con agentes reales: pendiente (la sesión de
  Claude Code de la máquina de desarrollo estaba caducada).

## Archivos que sube el usuario: zip y HEIC

`main/archivos.ts` (`prepararArchivos`) prepara los adjuntos de Crear con IA (guiado y agente):
los `.zip` se leen en la propia app (stored/deflate, sin ZIP64; el `tar` de Windows falla con
carpetas que terminan en espacio, como las de Google Drive) y se sacan solo fotos y videos con los
nombres limpios; las fotos HEIC/HEIF se pasan a JPG con FFmpeg. Lo que no sirve se avisa en el
primer mensaje de la creación.
