# Recorte · contexto completo para Kimi

> **Documento de traspaso.** Léelo entero antes de proponer código o arquitectura.
> **Repo:** `C:\Users\Alex\Desktop\recorte`
> **Producto:** Recorte (nombre provisional)
> **Fecha:** 5 de noviembre de 2026
> **Estado:** motor real de ingesta, transcripción, selección y render por lote; el editor con
> timeline todavía no existe.
> **Importante:** el centro del producto es el **editor**. Los reels por lote son un flujo dentro de
> él, no el producto entero.
> **Referencia que inspiró la dirección:** Sloth 2.0 (analizada, **no copiada**).

---

## 0. Instrucciones para Kimi

Vas a entrar como arquitecto e ingeniero principal de este producto. Antes de tocar nada:

1. **Lee este documento completo.** Al final hay un mapa del repo, comandos y criterios de aceptación.
2. **No copies código, prompts, plantillas, estilos, nombres ni assets de Sloth.** La licencia de Sloth
   (Apache 2.0 + Commons Clause) prohíbe vender derivados o alojarlo como servicio sin permiso
   comercial. Recorte es un proyecto clean-room.
3. **La interfaz y los comentarios van en español.** El código y los nombres técnicos pueden ir en
   inglés cuando sea lo natural, pero el producto se escribe en español.
4. **Trabaja en incremental.** El producto actual funciona; no lo reescribas entero para perseguir la
   visión grande. Primero estabiliza, luego añade timeline, animaciones e IA.
5. **Comprueba siempre** con `npm run typecheck`, `npm run build` y `npm run prueba:e2e`.
6. **No borres trabajo del fundador.** Hay archivos de empaquetado (`electron-builder.yml`,
   `build/icon.png`, `scripts/icono.py`) que no se crearon en este hilo. Investiga antes de tocarlos.
7. **Pregunta antes de añadir dependencias caras, licencias nuevas o servicios en la nube.**
8. **Distingue lo que funciona de lo que es maqueta.** Este documento lo marca explícitamente.
9. **Esto es un editor, no un cortador.** El usuario debe poder traer cualquier video y editarlo de
   verdad: timeline, pistas, cortes, transiciones, texto, audio, efectos y animaciones. Los reels por
   lote son un flujo automatizado dentro del editor, no el producto entero. Si una decisión de
   arquitectura solo sirve para recortar, está mal orientada.

---

## 1. Resumen en una frase

**Recorte es un estudio local de edición de video con IA: recibe cualquier material —una clase, un
webinar, una entrevista o clips sueltos— y lo edita de verdad en una timeline multipista, con
subtítulos, marca, animaciones y un copiloto que ejecuta cambios reversibles sin subir nada a la nube.
Los reels por lote son el primer flujo automatizado, no el límite del producto.**

### Esto no es un cortador

Recortar es elegir un inicio y un fin. Editar es decidir qué se ve, en qué orden, con qué ritmo, qué
texto, qué audio, qué transiciones y qué capas. La diferencia técnica:

| Cortador | Editor real |
|---|---|
| Un clip, un rango, un encuadre | Varias pistas y clips en una timeline |
| Corta y exporta | Mueve, separa, une, ajusta, superpone y anima |
| Subtítulos y marca fijos | Texto, formas, imágenes, b-roll, música y efectos |
| Sin memoria de decisiones | Undo/redo, comandos y proyecto persistente |
| La IA elige un momento | La IA propone y ejecuta un plan de edición |

El usuario puede traer **cualquier video**, no solo clases. El flujo de reels sigue existiendo como
automatización, pero siempre aterriza en la timeline, donde se puede cambiar todo.

### Lo que ya existe

Un flujo real, probado de punta a punta:

```
video largo → ffprobe → miniatura → proxy 720p → transcripción local con tiempos por palabra
→ propuesta local de momentos (o LLM opcional) → revisión y ajuste → render vertical 1080×1920 con
subtítulos, marca, SRT y portada → cola y archivos persistentes
```

### Lo que falta para la visión completa

- Timeline de edición real (multipista, cortes, transiciones, texto, audio, keyframes).
- Preview de video real, no una maqueta visual.
- Animaciones y motion graphics.
- Copiloto de IA que entienda el proyecto y ejecute cambios.
- Generación de B-roll, imágenes, voz, música y traducción.
- Biblioteca de tendencias, plantillas y presets por plataforma.
- Empaquetado vendible, firma de código, licencias y actualizaciones.
- Pruebas más amplias y un repositorio Git con línea base.

---

## 2. Lo que pide el fundador, traducido a producto

| Lo que pide | Lo que significa en producto |
|---|---|
| «Que edite los videos que yo le dé» | Un editor multipista que acepta cualquier material y permite cambiarlo todo, no solo recortar. |
| «Crear reels» | Convertir una clase larga en muchos clips verticales con gancho, subtítulos y marca. |
| «Editar videos» | Una timeline real: cortar, mover, separar, unir, audio, texto, capas y previsualización. |
| «En tiempo real con ayuda de IA» | Preview fluido con proxies y un copiloto que propone y ejecuta cambios sobre la timeline. |
| «Herramientas de edición bastante buenas» | Keyframes, transiciones, máscaras, velocidad, color, audio, subtítulos, PiP, safe zones. |
| «Crear animaciones» | Títulos cinéticos, lower thirds, gráficos, mapas, logos, transiciones y plantillas animadas. |
| «Videos profesionales» | Color y audio correctos, cortes al frame, subtítulos legibles, exportación por plataforma y QC. |
| «A la tendencia» | Packs de formatos, hooks, ritmo, sonidos y estilos actualizados, sin copiar contenido ajeno. |
| «Como el proyecto que te enseñé» | La ambición de Sloth: app local, agentes visibles, estilos de video y flujo completo. No su código. |

### Frase de posicionamiento

> Para creadores que graban mucho y publican poco, **Recorte** es el estudio local que edita su
> material de verdad —timeline, capas, texto, audio, animaciones— y usa la IA para convertir una clase
> en un lote de reels, sin subir nada ni pagar por minuto.

---

## 3. Usuario, problema y promesa

### Usuario inicial

El usuario inicial es un creador de cursos con entre 10 y 100 horas de clases grabadas. Graba en
Zoom, OBS o cámara y necesita alimentar TikTok, Reels y Shorts sin contratar a un editor por cada
pieza. Pero el editor no se limita a ese caso: acepta entrevistas, webinars, podcast con video, clips
sueltos y cualquier material que el usuario quiera montar.

### Problema

Convertir una clase de 45 minutos en 10-20 clips verticales es manual: ver, marcar, cortar,
reencuadrar, subtitular, poner la marca y exportar. Las herramientas de la nube cobran por minuto,
suben todo el material y producen clips genéricos que no se parecen al curso.

### Promesa del MVP

**Una clase de 45 minutos → 10-20 reels revisables en menos de 30 minutos, con la marca del curso y
sin subir el material a ningún servidor.**

### Promesa del editor

**Cualquier video que el usuario traiga se puede abrir en una timeline, editar sin destruir el
original y exportar con la misma calidad con la que se ve en el preview. La IA acelera el montaje,
pero el control final es del usuario.**

### Promesa de la visión completa

**Un estudio local donde el creador puede pasar de material bruto a piezas publicables —reels,
explicativos, animaciones— con la IA haciendo el trabajo pesado y el humano tomando las decisiones
creativas.**

---

## 4. Producto actual: qué hay y cómo se usa

### Flujo real

1. **Importar.** El creador elige un MP4/MOV/MKV/WebM. La app lee duración, resolución, fps, rotación
   y pistas. Genera miniatura y, si el video supera 720p y 30 s, un proxy 720p en segundo plano.
2. **Transcribir.** Python + faster-whisper transcribe en local con tiempos por palabra. La app
   muestra progreso y guarda `transcripcion.json`.
3. **Generar lote.** La app propone hasta 12 momentos con título, gancho, puntuación, motivo, inicio
   y fin. Usa heurísticas locales y, si el creador lo activa, un LLM (API compatible con OpenAI o el
   CLI de Claude con su suscripción). Si el modelo falla, cae a la selección local sin romper el flujo.
4. **Revisar.** El creador elige un clip, ajusta título, gancho, estilo de subtítulo y encuadre.
5. **Renderizar.** FFmpeg corta, reencuadra a 1080×1920, quema subtítulos con la marca y guarda MP4 +
   SRT + portada JPG. Se puede renderizar un clip o el lote completo; la cola muestra el progreso y
   permite abrir la carpeta del archivo.
6. **Persistir.** El proyecto, la transcripción, los clips y las salidas sobreviven al reinicio.

> **Hoy** cada proyecto nace de **un** video. El editor objetivo debe aceptar varios assets —video,
> imagen y audio— en el mismo proyecto; el modelo de timeline de la sección 11 ya está pensado así.

### Pantallas

- **Sidebar:** Proyectos, Marca, Ajustes y proyectos recientes con estado de transcripción.
- **Workspace:** tarjeta de la clase (miniatura, metadatos, progreso), lista de clips sugeridos y cola
  de render.
- **Inspector:** preview estilizada del clip, título, gancho, estilo de subtítulo, encuadre, datos de
  salida y botón de render.
- **Marca:** nombre, colores, tipografía y logo; preview de cómo se vería un reel.
- **Ajustes:** la IA (proveedor, servidor, modelo y clave) persiste y se cifra con el llavero del
  sistema. Resolución, fps, códec, calidad, nombres, carpeta y transcripción siguen siendo maqueta.
- **Proyecto de ejemplo:** si no hay proyectos reales, la app muestra un curso de fotografía con clips
  de demostración. Está marcado con `demo: true` y un badge «Ejemplo».

### Lo que es real

| Área | Estado | Detalle |
|---|---|---|
| Importación | Real | ffprobe, carpeta de proyecto, miniatura, proxy en segundo plano |
| Transcripción | Real | faster-whisper, VAD, tiempos por palabra, idioma detectado |
| Persistencia | Real | JSON atómico por proyecto, transcripción separada |
| Selección de momentos | Real, local + IA opcional | Heurísticas de guion; LLM opcional (API compatible con OpenAI, clave del usuario) con fallback local |
| Edición de clip | Real, básica | Título, gancho, estilo de subtítulo, encuadre |
| Render | Real, por lote | 1080×1920, ASS, SRT, portada JPG, marca, progreso |
| Cola | Real | Lote en serie con progreso conjunto; sin cancelación |
| Encuadre cara | Real | Detección Haar con caché por clip; cae al centro si no hay cara |
| Reproductor | Real | Modal con el proxy o el original y rangos HTTP |
| Marca | Parcial | Nombre y colores se aplican al render; logo y tipografía no |
| Ajustes | Parcial | La IA persiste en `ajustes.json` y cifra la clave con el llavero; resolución, códec y carpeta siguen siendo maqueta |

---

## 5. Estado técnico verificado

### Comandos

```powershell
cd C:\Users\Alex\Desktop\recorte
npm run typecheck   # OK
npm run build       # OK
npm run prueba:e2e  # OK
```

### Prueba end-to-end

La prueba abre Electron con depuración remota, importa un video de 40 s, transcribe, genera momentos,
renderiza y recarga la interfaz. Resultado de la última ejecución:

```
proyectos al abrir: 0
importado: clase prueba
video: 1920×1080 · 40 s · 30 fps
miniatura: sí
transcripción: ok · 10 segmentos · idioma es
momentos: 1
clip: «El primer error es grabar sin pensar en el corte vertical» · 4–33 s · puntuación 84
motivo: Señala un error · tiene una lista · dura 29 s
render: ...\salidas\el-primer-error-es-grabar-sin-pensar-en-el-corte-vertica-0-3294.mp4
mp4: 1080×1920 · 28.8 s
reabierto: lista · 10 segmentos · proxy sí · clips 1 · primer clip listo
archivos: miniatura.jpg, proxy.mp4, proyecto.json, salidas, sub-c-420-3294.ass, transcripcion.json
salidas: ...mp4, ...srt
prueba: ok
```

La muestra estable queda en `out/e2e/clip.mp4` y `out/e2e/clip.srt` para inspección. Es una ejecución
de referencia: la versión actual añade portada JPG y render por lote.

### Entorno probado

- Windows 11.
- Node.js 24.19.0.
- Electron 45.2.2.
- React 19.3.1.
- TypeScript 7.0.2.
- Vite 8.3.5 + electron-vite 6.0.0.
- FFmpeg/ffprobe 9.0 full build (gyan.dev).
- Python 3.13.7.
- faster-whisper 1.2.1.
- Modelo `small` ya descargado en la caché de Hugging Face.

### Nota importante sobre PyAV

`faster-whisper` 1.2.1 llama a `av.open(..., metadata_errors="ignore")`, que PyAV 19 ya no acepta. Para
no degradar el entorno del usuario, `python/transcribir.py` decodifica el audio con FFmpeg a 16 kHz
mono y le pasa las muestras a Whisper. **No volver a depender de PyAV para leer el archivo.**

---

## 6. Arquitectura actual

### Stack

- **Shell:** Electron 45.
- **UI:** React 19 + TypeScript 7 + Vite 8.
- **Núcleo:** Node (proceso principal).
- **Medios:** FFmpeg/ffprobe.
- **Transcripción:** Python + faster-whisper.
- **Persistencia:** una carpeta por proyecto con JSON y archivos derivados.
- **Protocolo de medios:** `recorte-media://<projectId>/<archivo>` con soporte de rangos.

### Procesos

```
Renderer (React)
  │  contextBridge: window.recorte
  ▼
Preload (API tipada)
  │  ipcRenderer.invoke / eventos
  ▼
Main (Node + Electron)
  ├── Proyectos (JSON atómico)
  ├── FFmpeg (probe, miniatura, proxy)
  ├── Transcribir (spawn Python)
  ├── Momentos (heurísticas)
  ├── Render (ASS + FFmpeg)
  └── Protocolo recorte-media
        │
        ├── video original (por ruta)
        ├── proxy.mp4
        ├── miniatura.jpg
        └── salidas/*.mp4
```

### Archivos clave

| Archivo | Responsabilidad |
|---|---|
| `src/main/index.ts` | Ventana, IPC, orquestación del pipeline, cola de render |
| `src/main/ffmpeg.ts` | ffprobe, miniatura, proxy, progreso |
| `src/main/transcribir.ts` | Descubrir Python, lanzar el script, progreso y errores |
| `src/main/momentos.ts` | Selección local de momentos y puntuación |
| `src/main/ia.ts` | Análisis opcional con LLM: API compatible con OpenAI o CLI de Claude |
| `src/main/ajustes.ts` | Ajustes persistentes y clave cifrada con `safeStorage` |
| `src/main/caras.ts` | Detección de caras con caché y fallback al centro |
| `src/main/render.ts` | Subtítulos ASS, SRT, reencuadre, portada y render vertical |
| `src/main/proyectos.ts` | Guardar/listar/abrir proyectos; transcripción aparte |
| `src/main/disco.ts` | Escritura atómica de JSON |
| `src/main/media.ts` | Protocolo `recorte-media` con range y validación de rutas |
| `src/preload/index.ts` | Puente seguro entre renderer y main |
| `src/shared/types.ts` | Modelo de datos |
| `src/shared/api.ts` | Contrato IPC |
| `src/renderer/src/App.tsx` | Estado de la app y flujos principales |
| `src/renderer/src/components/*` | Sidebar, topbar, tarjeta, lista, inspector, cola, vistas |
| `python/transcribir.py` | Transcripción con faster-whisper |
| `python/caras.py` | Detección Haar de la cara principal con OpenCV |
| `scripts/prueba-e2e.mjs` | Prueba real vía CDP |
| `electron-builder.yml` | Configuración de empaquetado (sin verificar) |

### Almacenamiento

```
app.getPath('userData')/proyectos/<id>/
  proyecto.json       metadata (sin transcripción)
  transcripcion.json  segmentos y palabras con tiempos
  miniatura.jpg       primer fotograma útil
  proxy.mp4           copia 720p para preview
  salidas/            MP4, SRT y portada JPG renderizados
  sub-<clip>.ass      subtítulos temporales del render
  caras-<clip>.json   caché de centros de cara por clip
```

Los ajustes de la app viven aparte, en `app.getPath('userData')/ajustes.json`; la clave del LLM se
guarda cifrada con `safeStorage` cuando el sistema lo permite.

El video original **no se copia**: `source.path` lo referencia. Esto ahorra disco pero obliga a
gestionar el caso de que el archivo se mueva o se borre.

### IPC actual

| Canal | Función |
|---|---|
| `dialog:open-video` | Elegir un video |
| `proyecto:crear` | ffprobe + carpeta + miniatura + proxy en segundo plano |
| `proyecto:listar` | Listado ligero, ordenado por `updatedAt` |
| `proyecto:abrir` | Proyecto completo con transcripción |
| `proyecto:guardar` | Guardado con retardo desde la interfaz |
| `proyecto:transcribir` | Ejecuta Python y guarda `transcripcion.json` |
| `ajustes:cargar` | Devuelve los ajustes de IA (nunca la clave) |
| `ajustes:guardar` | Guarda proveedor, modelo y clave cifrada |
| `proyecto:generar` | Propone momentos con heurísticas o LLM y cae a local si falla |
| `proyecto:renderizar` | Renderiza un clip, guarda MP4/SRT/portada y avisa progreso |
| `proyecto:renderizar-lote` | Renderiza en serie todos los clips pendientes |
| `proyecto:abrir-salida` | Revela el MP4 en el explorador |
| `progreso` (evento) | Ingesta, transcripción, lote y render en vivo |

### Seguridad actual

- `contextIsolation: true`, `nodeIntegration: false`.
- Preload expone solo una API tipada.
- El protocolo de medios valida el id y evita salir de la carpeta del proyecto.
- `abrir-salida` valida que el MP4 esté dentro del proyecto.
- `sandbox: false` porque el preload necesita Node; se puede endurecer más adelante.
- No hay CSP en `index.html`; añadirla antes de distribución.
- No hay validación de esquema de los objetos que llegan por IPC.

---

## 7. Modelo de datos actual

```ts
type ClipStatus = 'sugerido' | 'elegido' | 'renderizando' | 'listo' | 'error'
type Encuadre = 'cara' | 'centro' | 'division'
type TranscriptionStatus = 'pendiente' | 'transcribiendo' | 'lista' | 'error'

interface SourceVideo {
  path: string
  name: string
  duration: number
  width: number
  height: number
  fps: number
  thumbnail?: string
}

interface Word { text: string; start: number; end: number }

interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  words: Word[]
}

interface ClipSuggestion {
  id: string
  start: number
  end: number
  title: string
  hook: string
  score: number
  reason: string
  status: ClipStatus
  captionStyle: string
  reframe: Encuadre
  output?: string
  cover?: string
}

interface BrandKit {
  name: string
  primary: string
  secondary: string
  font: string
  logo?: string
}

interface Project {
  id: string
  name: string
  source: SourceVideo
  transcript?: TranscriptSegment[]
  clips: ClipSuggestion[]
  brand: BrandKit
  createdAt: number
  updatedAt: number
  transcription: TranscriptionStatus
  transcriptionError?: string
  language?: string
  proxy?: string
  thumbnail?: string
  demo?: boolean
}

interface AjustesIA {
  activa: boolean
  proveedor: 'api' | 'claude'
  baseUrl: string
  modelo: string
  tieneClave: boolean
  claveCifrada: boolean
}
```

### Deuda del modelo

- No hay `version` de esquema ni migraciones.
- `output` guarda una ruta absoluta; si se mueve el proyecto, se rompe. Debería ser relativa.
- `source.path` es absoluta; falta un flujo de «relink».
- `ClipSuggestion` mezcla sugerencia, estado de render y salida.
- No hay timeline, pistas, efectos, keyframes, assets, marcadores ni historial.
- No hay ajustes de render persistidos (calidad, carpeta de salida, presets). Los de IA sí persisten.
- La transcripción se carga entera en memoria y se envía por IPC; en clases de 2 h puede pesar.
- `ids` de clips se derivan de tiempos (`c-420-3294`); pueden colisionar entre proyectos.
- El estado de la UI vive en `App.tsx`; crecerá mal cuando entre la timeline.

---

## 8. Pipeline actual en detalle

### Ingesta

`ffprobe -show_format -show_streams` → duración, dimensiones, fps, rotación, audio. La miniatura se
toma a los 2 s o en la mitad si el video es corto. El proxy se genera a 720p con H.264 CRF 26 y AAC
96k, en segundo plano, solo si `height > 720 && duration > 30`.

### Transcripción

`python/transcribir.py`:

1. FFmpeg decodifica el audio a 16 kHz mono float32.
2. `WhisperModel(modelo, device="auto", compute_type="auto")`.
3. `transcribe(..., word_timestamps=True, vad_filter=True, beam_size=5)`.
4. Escribe `transcripcion.json` con `language`, `duration` y `segments[]`.
5. Emite líneas `PROGRESO <pct> <texto>` para la interfaz.

Modelo por defecto `small`; se puede cambiar con `RECORTE_MODELO`.

### Momentos

`src/main/momentos.ts` recorre la transcripción y genera ventanas de 18-52 s que empiezan y acaban en
fronteras de segmento. Puntúa:

- Pregunta inicial, error, descubrimiento, lista, contraste, números, llamada al espectador.
- Duración cercana a 30 s.
- Empezar a mitad de frase resta; cerrar con puntuación suma.
- Elimina solapamientos: dos clips no comparten más del 30 % de su contenido.
- Máximo 12 clips.

Es local, determinista y sin coste. `src/main/ia.ts` añade un análisis opcional con LLM (API
compatible con OpenAI o CLI de Claude) que devuelve JSON validado; si falla, se usa la selección local.

### Render

`src/main/render.ts`:

1. Agrupa palabras en bloques de 3-5 palabras / 30 caracteres, cortando por pausas y puntuación.
2. Genera un `.ass` con:
   - `PlayResX 1080`, `PlayResY 1920`.
   - Fuente Arial 64, color principal de la marca, borde oscuro, sombra, margen inferior 250.
   - Nombre del curso arriba a la izquierda.
3. Genera un `.srt` con los mismos bloques.
4. FFmpeg:
   - `-ss`/`-t` para cortar.
   - `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920` para centro/cara.
   - `division`: fondo desenfocado + video original encima.
   - `subtitles=<archivo>.ass` para quemar.
   - H.264 CRF 20, 30 fps, AAC 160k, `faststart`.
5. Progreso con `-progress pipe:1` (`out_time_us`).
6. Salida en `salidas/<slug>-<id>.mp4`.

**Encuadre `cara`:** muestrea el tramo cada 0,5 s con OpenCV Haar (`python/caras.py`), interpola y
suaviza los centros, y anima el crop con una expresión por tramos en FFmpeg. Se cachea por clip
(`caras-<clip>.json`) y cae al recorte central si no hay caras, Python u OpenCV.

### Cola

La cola de la UI se deriva de los clips con estado `listo`, `error` o `renderizando`. El lote
(`proyecto:renderizar-lote`) procesa todos los pendientes en serie con progreso conjunto, y cada
clip genera también su portada JPG. No hay:

- Pausa, cancelación o reintento automático.
- Persistencia de trabajos en cola (los clips renderizados sí vuelven al reabrir).
- Prioridad, concurrencia o límite de CPU.
- Nombres por plantilla ni carpeta de destino configurable.

---

## 9. Limitaciones y deuda técnica

| Área | Problema | Impacto | Prioridad |
|---|---|---|---|
| Empaquetado | Sin firma de código ni prueba en Windows limpio | Aviso de SmartScreen al instalar | Alta |
| Empaquetado | FFmpeg/Python no se bundelean ni se detectan con instalación guiada | El cliente no arranca el flujo | Alta |
| Git | El proyecto no es un repositorio | Sin historial ni rollback | Alta |
| Preview | No hay video real en la timeline; el inspector es una maqueta | No se puede editar de verdad | Alta |
| Timeline | No existe | Bloquea edición profesional | Alta |
| Animaciones | No existen | Bloquea la visión de motion graphics | Media |
| IA | Análisis de momentos con LLM, pero sin copiloto ni generación | Falta el salto a editor asistido | Media |
| Tendencias | No hay packs ni presets | Menos percepción de producto actual | Media |
| Marca | Logo y tipografía no se aplican al render | Menos personalización | Media |
| Ajustes | La IA persiste; el resto es maqueta | Confunde al usuario | Media |
| Persistencia | JSON sin versión ni migraciones | Riesgo al evolucionar | Media |
| Rutas | `output` y `source.path` absolutas | Se rompen al mover archivos | Media |
| Rendimiento | Transcripción y JSON en memoria; sin workers | Clases largas pueden ir lentas | Media |
| Pruebas | Solo e2e; sin unitarios de momentos/render | Regresiones silenciosas | Media |
| Seguridad | Sin CSP, sin validación de esquema IPC | Superficie de ataque | Media |
| Accesibilidad | Sin auditoría | Excluye usuarios | Baja |
| i18n | Solo español | Limita mercado | Baja |
| Actualizaciones | Sin auto-update ni crash reporting | Soporte manual | Baja |
| Firma | Sin certificado de código | Avisos de Windows/Mac | Baja |

---

## 10. Visión objetivo: el estudio completo

### North star

Un creador abre la app con una clase de 45 minutos y sale con:

- 10-20 reels revisables, con marca y subtítulos.
- 1-3 explicativos verticales u horizontales.
- Animaciones y plantillas aplicadas.
- Una timeline donde puede ajustar todo.
- Exportaciones por plataforma y un proyecto editable.
- Todo procesado en local, con IA opcional y sin pagar por minuto.

### Pilares

1. **Editor con timeline.** El corazón: pistas, clips, cortes, capas, keyframes y control real.
2. **Reels por lote.** El primer flujo automatizado: de material largo a muchas piezas cortas.
3. **Animaciones y motion graphics.** Títulos, gráficos, transiciones, lower thirds, logos.
4. **Copiloto de IA.** Entiende el proyecto, propone y ejecuta cambios reversibles.
5. **Marca y plantillas.** Consistencia visual y velocidad.
6. **Tendencias.** Formatos, hooks, ritmo y estilos actuales, con licencias claras.
7. **Exportación profesional.** Presets, QC, SRT, portadas, OTIO/XML.
8. **Local-first.** Privacidad y coste predecible; nube solo opcional.

### Lo que NO es

- Un clon de Sloth.
- Un clon de Premiere/Resolve.
- Un cortador de clips con una capa de IA encima.
- Un SaaS que sube todos los archivos por defecto.
- Un generador de video que escupe piezas sin control humano.
- Una app que depende de una sola API de IA.

---

## 11. Editor de video: requisitos y arquitectura propuesta

### MVP de timeline

Para no construir un Premiere desde cero, el primer editor debe tener:

- 2 pistas de video, 1 de audio, 1 de subtítulos/overlay.
- Cortar, separar, mover, eliminar y unir clips.
- Trim de entrada/salida con handles.
- Ripple delete y snap a bordes/marcadores.
- Zoom de timeline, scroll horizontal y vertical.
- Undo/redo ilimitado durante la sesión.
- Preview con proxy a 540p/720p y audio sincronizado.
- Guardado automático y carga del proyecto.
- Atajos: espacio, J/K/L, I/O, S, Delete, Ctrl+Z/Y, +/-.
- Exportar el timeline a MP4 y SRT.

### Modelo de timeline propuesto

```ts
interface TimelineProject {
  id: string
  version: number
  name: string
  fps: number
  width: number
  height: number
  sampleRate: number
  media: MediaAsset[]
  tracks: Track[]
  markers: Marker[]
  brand: BrandKit
  createdAt: number
  updatedAt: number
}

interface MediaAsset {
  id: string
  path: string
  type: 'video' | 'audio' | 'image'
  duration: number
  width?: number
  height?: number
  fps?: number
  proxy?: string
  waveform?: string
  thumbnail?: string
}

interface Track {
  id: string
  type: 'video' | 'audio' | 'caption' | 'overlay'
  name: string
  muted?: boolean
  locked?: boolean
  clips: TimelineClip[]
}

interface TimelineClip {
  id: string
  assetId?: string
  start: number        // posición en la timeline
  duration: number
  in: number           // punto de entrada en el asset
  out: number
  speed: number
  transform: { x: number; y: number; scale: number; rotation: number; opacity: number }
  effects: Effect[]
  transitionIn?: Transition
  transitionOut?: Transition
  keyframes: Keyframe[]
  text?: TextLayer
}

interface Effect {
  id: string
  type: string
  params: Record<string, number | string | boolean>
}

interface Keyframe {
  property: string
  time: number
  value: number | string
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring'
}

interface TextLayer {
  text: string
  style: string
  align: 'left' | 'center' | 'right'
  safeZone: boolean
}
```

### Preview en tiempo real

No usar FFmpeg para el preview de cada frame. La arquitectura recomendada:

- **Video:** elementos `<video>` con proxies, o `WebCodecs` + `VideoFrame` para control fino.
- **Composición:** Canvas 2D o WebGL/WebGPU para transformaciones, máscaras, blend modes y shaders.
- **Audio:** WebAudio para mezcla, ganancia, fades y medidores.
- **Timeline:** canvas virtualizado para waveforms y clips; React solo para la estructura.
- **Caché:** frames renderizados, proxies, sprites de miniaturas y waveforms.
- **Sincronización:** `requestVideoFrameCallback`, reloj de audio maestro, scrub con `seeking`.
- **Determinismo:** la misma función de composición debe poder renderizar a frame fijo sin depender
  de `Date.now()` ni del reloj de pared.

### Render de exportación

Dos caminos, híbridos:

1. **Cortes simples:** FFmpeg `concat`/`trim`/`scale`/`subtitles` para velocidad.
2. **Composición compleja:** renderizar frame a frame con el mismo compositor del preview
   (Canvas/WebGL/Three/Lottie) y enviar los frames a FFmpeg por `rawvideo` o a un encoder
   (WebCodecs/ffmpeg.wasm/ProRes). Esto garantiza WYSIWYG.

Para el MVP de timeline, el camino 1 cubre cortes, subtítulos y transformaciones simples. El camino 2
entra con animaciones, máscaras y efectos.

### Estado y undo/redo

- Store central (Zustand + Immer o Redux Toolkit).
- Comandos serializables: `AddClip`, `TrimClip`, `MoveClip`, `DeleteClip`, `ApplyTemplate`.
- Historial con snapshots o patches; límite configurable.
- Autosave con debounce y checkpoint antes de operaciones destructivas.
- El copiloto de IA emite los mismos comandos que la UI, con confirmación y undo.

### Persistencia

- **Ahora:** JSON por proyecto, suficiente para el MVP.
- **Timeline:** SQLite (better-sqlite3) para proyectos, assets, historial y trabajos; JSON/OTIO para
  exportar/importar.
- Migraciones versionadas.
- Rutas relativas al proyecto y relink de originales.
- Carpeta de caché separada, borrable.

### Rendimiento

- Proxies 540p/720p para preview.
- Worker threads para tareas pesadas (momentos, waveforms, escenas).
- Child processes para FFmpeg/Python.
- GPU para preview y, si se puede, para encode.
- Cola con límite de concurrencia y prioridad.
- Cancelación real de FFmpeg (`kill`) y limpieza de temporales.
- Medir: tiempo de importación, transcripción, primer frame, scrub, render por minuto de video.

---

## 12. Animaciones y motion graphics

### Requisitos

- Títulos cinéticos: palabra por palabra, typewriter, highlight, scale, blur, glitch.
- Lower thirds y callouts.
- Transiciones: cut, dissolve, slide, whip, zoom, glitch, shine.
- Formas, líneas, flechas, charts, mapas y contadores.
- Logos y stings.
- Subtítulos animados con la marca.
- Plantillas parametrizables (texto, colores, duración, estilo).
- Keyframes con easing y curvas.
- Preview en tiempo real y render determinista.
- Exportación con alfa para overlays (WebM/ProRes 4444) cuando haga falta.

### Opciones técnicas

| Opción | Pros | Contras | Licencia |
|---|---|---|---|
| Canvas/WebGL propio | Control total, WYSIWYG, sin dependencia | Más trabajo inicial | Propia |
| GSAP | Animaciones potentes y maduras | No es un renderer; hay que capturar frames | Verificar licencia actual |
| Lottie | Animaciones vectoriales ligeras | No todo se puede hacer; depende de After Effects | MIT (lottie-web) |
| Three.js | 3D, shaders, logos | Más complejidad y peso | MIT |
| PixiJS | 2D WebGL rápido | Ecosistema de edición limitado | MIT |
| Remotion | React → video, muy productivo | Licencia comercial para empresas; no entra en el MVP | Comercial |
| FFmpeg filters | Simple, rápido para lo básico | Limitado para motion graphics | LGPL |
| Blender | 3D profesional | Pipeline externo, pesado | GPL (salida libre) |

**Recomendación:** empezar con Canvas/WebGL + GSAP/Lottie para plantillas 2D; evaluar Remotion solo
si el volumen de animaciones lo justifica y se paga su licencia. No meter Remotion en el MVP.

### Formato de plantilla

```json
{
  "id": "titulo-kinetic-lime",
  "name": "Título cinético",
  "category": "title",
  "duration": 3.5,
  "variables": ["texto", "colorPrincipal", "colorAcento", "fuente"],
  "layers": [
    { "type": "text", "animation": "word-by-word", "easing": "ease-out" },
    { "type": "shape", "animation": "wipe" }
  ],
  "safeZones": { "top": 220, "bottom": 320 }
}
```

---

## 13. IA: copiloto, generación y automatización

### Principio

La IA no debe ser un chat pegado al lado. Debe ser un **operador del proyecto** con herramientas
tipadas, contexto y permisos. Cada acción debe ser reversible.

### Arquitectura

```
Renderer (chat / comandos)
  → Main (orquestador de IA)
    → Proveedor (OpenAI / Anthropic / Google / local)
    → Herramientas tipadas sobre el proyecto
    → Timeline store (comandos + undo)
    → Cola de render / generación
```

- Claves en el proceso principal, nunca en el renderer.
- Guardar claves con `safeStorage` del sistema o llavero.
- Streaming de respuestas y progreso de herramientas.
- Coste estimado por operación; presupuesto configurable.
- Fallback local (Ollama/llama.cpp) y heurísticas cuando no hay clave.
- Registro de acciones para auditoría y undo.

### Herramientas del copiloto

| Herramienta | Qué hace |
|---|---|
| `buscar_momentos` | Propone clips desde la transcripción |
| `crear_clip` | Añade un clip a la timeline |
| `cortar_silencio` | Elimina pausas largas |
| `quitar_muletillas` | Detecta «eh», «este», «o sea» |
| `generar_subtitulos` | Crea/estiliza subtítulos |
| `aplicar_plantilla` | Aplica un pack de estilo |
| `reescribir_gancho` | Propone 3 ganchos alternativos |
| `generar_broll` | Genera imagen/video de apoyo |
| `generar_voz` | TTS o clonación con consentimiento |
| `mezclar_musica` | Añade música con ducking |
| `traducir` | Subtítulos o doblaje |
| `exportar` | Lanza el render con un preset |

### Funciones de IA por prioridad

1. **Selección y gancho** (texto): mejores momentos, títulos, hooks, razones.
2. **Subtítulos**: corrección, puntuación, estilo, traducción.
3. **Corte automático**: silencios, muletillas, repeticiones, respiraciones.
4. **Reencuadre**: detección de cara/persona, seguimiento, safe zones.
5. **B-roll e imágenes**: generar o buscar material con licencia.
6. **Voz**: TTS, clonación consentida, doblaje.
7. **Música/SFX**: biblioteca con licencia y mezcla automática.
8. **Auto-edit desde brief**: «haz 5 reels de 30 s sobre luz, tono directo».
9. **Variantes A/B**: hooks, títulos, portadas y ritmo.
10. **Tendencias**: sugerir formato/estructura según el tema y la plataforma.

### Guardrails

- No inventar afirmaciones del curso; citar la transcripción.
- No clonar voces sin consentimiento verificable.
- No usar música/trends sin licencia.
- No enviar material a la nube sin consentimiento explícito.
- Mostrar coste y proveedor antes de una operación cara.
- Toda acción de la IA pasa por undo.
- Evaluar con un set dorado de clases y medir calidad, no solo velocidad.

### Prompts: qué pueden hacer y qué no

Un prompt no edita video. Un prompt **decide y frasea**: elige un momento, propone un gancho, describe
un plan de edición o explica por qué un corte funciona. La edición real la ejecuta el motor de
timeline mediante comandos tipados. Confundir ambas cosas es el error más caro de este producto.

#### Dónde sí sirven los prompts

- **Fraseados:** ganchos, títulos, descripciones, CTAs, nombres de capítulos y textos de portada.
- **Plan de edición:** convertir «hazme un reel de 30 s sobre luz» en una lista de acciones.
- **Crítica:** revisar un clip y proponer mejoras concretas.
- **Clasificación:** detectar intención, tema, tono y plataforma.
- **Traducción y adaptación:** mantener sentido y ritmo, no solo palabras.

#### La regla de oro

El modelo debe devolver **JSON validado contra un esquema**, no texto libre con instrucciones. Por
ejemplo:

```json
{
  "plan": [
    { "accion": "crear_clip", "asset": "clase", "in": 312.4, "out": 341.8 },
    { "accion": "insertar_broll", "en": 6.2, "tipo": "imagen", "prompt": "pizarra con tres pasos" },
    { "accion": "aplicar_plantilla", "clip": "c1", "plantilla": "subtitulo-editorial" },
    { "accion": "mezclar_musica", "pista": "musica", "volumen": 0.18 }
  ]
}
```

La app valida cada acción, la aplica como comando reversible y muestra el resultado en la timeline.
Si una acción no es válida, se rechaza antes de tocar el proyecto.

#### ¿Se pueden usar prompts de GitHub?

Depende de cuáles y de su licencia:

| Origen | Uso permitido | Qué hacer |
|---|---|---|
| MIT, Apache 2.0, CC0 | Sí, con aviso de licencia | Adaptar la estructura, no copiar el texto literal |
| CC BY | Sí, con atribución | Atribuir en el aviso legal o en la documentación |
| CC BY-NC | No para vender | Evitar en un producto comercial |
| Sin licencia | No asumir permiso | Escribir uno propio desde cero |
| Prompts de Sloth | No | Clean-room: ni copiados ni «fraseados» |

**Sobre «frasearlos»:** reescribir un prompt ajeno no lo convierte automáticamente en propio. Si la
estructura, los ejemplos y las instrucciones son un calco, sigue siendo un derivado. La forma segura
es escribir el prompt desde el problema: qué decisión debe tomar el modelo, qué contexto recibe, qué
esquema devuelve y cómo se evalúa.

#### Biblioteca propia de prompts

Hoy el prompt de momentos vive dentro de `src/main/ia.ts`. El primer paso es extraerlo a
`src/main/ia/prompts/` sin cambiar su comportamiento, y añadir un archivo por tarea:

```
sistema.md            rol, límites y tono
plan-edicion.md       brief → acciones de timeline
ganchos.md            titulares y primeras frases
titulos.md            nombres de clips y capítulos
descripcion.md        texto para publicar
critica.md            revisión de un clip
```

Cada prompt debe incluir: objetivo, contexto permitido, formato de salida, ejemplos propios y
criterios de rechazo. Se versiona con el código y se prueba con un set dorado de 20 fragmentos.

---

## 14. Tendencias y adaptación por plataforma

### Qué significa «a la tendencia»

No es scrapear TikTok sin permiso. Es tener una biblioteca curada de:

- Formatos y estructuras: hook + problema + 3 pasos + CTA.
- Ritmo: duración media de plano, cortes por minuto, pausas.
- Estilos de subtítulo y títulos.
- Transiciones y efectos.
- Portadas y primeros frames.
- Sonidos y música con licencia.
- Presets por plataforma: TikTok, Reels, Shorts, LinkedIn, YouTube.

### Trend pack

```json
{
  "id": "problema-solucion-30s",
  "name": "Problema → solución",
  "platform": ["tiktok", "reels", "shorts"],
  "duration": [25, 40],
  "structure": ["hook", "problema", "demostracion", "cta"],
  "pacing": { "cutsPerMinute": 18, "avgShot": 2.2 },
  "captions": "editorial-bold",
  "safeZones": { "top": 220, "bottom": 320 },
  "music": "licenciada",
  "variables": ["tema", "promesa", "prueba"]
}
```

### Producto

- Biblioteca de packs incluidos y actualizables.
- El creador puede importar una referencia (video propio o URL permitida) y extraer ritmo,
  estructura y estilo, no el contenido.
- El copiloto sugiere 2-3 packs según tema, audience y plataforma.
- Variantes A/B de hook, portada y duración.
- Feedback loop: el creador marca qué funcionó; la app aprende preferencias, no espía.

### Legal

- Música: solo bibliotecas con licencia comercial.
- Tendencias: no copiar audio/video de terceros; inspirarse en estructura y ritmo.
- Plataformas: respetar términos de API y derechos de autor.
- Si se analiza una URL, pedir permiso y no descargar contenido no autorizado.

---

## 15. Exportación, QC y presets

### Formatos

- MP4 H.264 (compatibilidad) y H.265/AV1 cuando el cliente lo pida.
- Vertical 1080×1920, horizontal 1920×1080, cuadrado 1080×1080, 4:5.
- 30/60 fps; el proyecto manda.
- Audio AAC 48 kHz, loudness normalizado.
- SRT/VTT; subtítulos quemados o sidecar.
- Portada PNG/JPG.
- OTIO/XML/EDL para Premiere/Resolve.
- Proyecto exportable (JSON + assets referenciados o copiados).
- Overlay con alfa (WebM/ProRes 4444) para motion graphics.

### Presets por plataforma

| Plataforma | Formato | Duración | Notas |
|---|---|---|---|
| TikTok | 1080×1920 | 15-60 s | Safe zones arriba/abajo, captions grandes |
| Reels | 1080×1920 | 15-90 s | Similar, cuidado con UI |
| Shorts | 1080×1920 | <60 s | Título y CTA |
| LinkedIn | 1080×1080 o 1920×1080 | 30-90 s | Más sobrio, subtítulos |
| YouTube | 1920×1080 | variable | Miniatura y capítulos |

### QC automático

- Resolución, fps, duración y relación de aspecto.
- Loudness integrado (-14 LUFS para plataformas; -16 para podcast).
- Picos y clipping.
- Subtítulos fuera de safe zone o demasiado largos.
- Fotogramas negros/silencios al inicio o final.
- Texto ilegible por contraste.
- Archivos faltantes o rutas rotas.
- Peso y tiempo de subida estimados.

---

## 16. Roadmap recomendado

### Fase 0 · Estabilizar el MVP actual (1-2 semanas)

- Arreglar y verificar el instalador en Windows limpio.
- Incluir `python/transcribir.py`, FFmpeg LGPL + libass y una estrategia para Python.
- `git init`, `.gitignore` correcto, commit de línea base.
- Añadir `version` al JSON y migraciones.
- Guardar rutas relativas y relink de originales.
- Render por lote con cola persistente, cancelación y reintento.
- Tests unitarios de `momentos` y `render` (ASS/SRT, duración, safe zones).
- CSP y validación de esquema IPC.

**Criterio de aceptación:** un usuario instala, importa una clase, transcribe, genera 10 clips y
renderiza el lote sin tocar la terminal.

### Fase 1 · Editor mínimo con timeline (4-6 semanas)

- Modelo de timeline y store con undo/redo.
- Preview con proxy, audio y scrub.
- 2 pistas de video + audio + subtítulos.
- Cortar, mover, trim, separar, ripple, snap.
- Guardado/carga y autosave.
- Exportar timeline a MP4 + SRT.

**Criterio:** el usuario importa un video cualquiera, lo monta a mano en la timeline y exporta un MP4
sin salir de la app. Sin este hito no hay editor; solo un cortador.

### Fase 2 · Lote de reels sobre el editor (2-4 semanas)

- Selección múltiple y «Renderizar lote».
- Progreso por clip y global.
- Nombres por plantilla, carpeta de salida, portada.
- Presets TikTok/Reels/Shorts.
- Reintento de fallos y cancelación.
- Vista de resultados con abrir carpeta/reproducir.
- Cada clip del lote se abre en la timeline para ajustarlo.

**Criterio:** 10 clips de una clase de 45 min salen en una sola operación, con MP4 + SRT + portada, y
cada uno se puede retocar en la timeline antes de exportar.

### Fase 3 · Animaciones y marca (6-10 semanas)

- Keyframes y curvas.
- Plantillas de títulos, lower thirds, transiciones y subtítulos.
- Editor de estilo de subtítulos.
- Logo, tipografía y safe zones.
- Preview WYSIWYG y render determinista.

**Criterio:** 5 plantillas profesionales aplicables a cualquier clip, con marca y exportación limpia.

### Fase 4 · Copiloto de IA (6-12 semanas)

- Chat con contexto de proyecto.
- Herramientas tipadas y undo.
- Reescritura de hooks/títulos.
- Corte de silencios/muletillas.
- B-roll/imágenes y voz.
- Auto-edit desde brief.
- Coste y proveedor visibles.

**Criterio:** el creador pide «convierte esta clase en 5 reels sobre luz» y obtiene una timeline
revisable, no un video final sin control.

### Fase 5 · Tendencias y escala (8-12 semanas)

- Trend packs y biblioteca.
- Presets por plataforma.
- Variantes A/B.
- Feedback de rendimiento.
- Render en nube opcional.
- Colaboración y comentarios.

### Fase 6 · Producto comercial (continuo)

- Licenciamiento y pagos.
- Onboarding y tutoriales.
- Auto-update y crash reporting.
- Soporte y documentación.
- Firma de código Windows/macOS.
- Analítica opt-in y privacidad.

> Los rangos son orientativos para una persona o un equipo muy pequeño. La calidad y la deuda
> técnica mandan; no prometer fechas antes de validar cada fase.

---

## 17. Prioridades inmediatas (próximos 14 días)

> El empaquetado y el lote en serie ya se hicieron el 5-nov. Lo que falta para que el producto sea un
> editor —y no un cortador— es lo primero de esta lista.

1. **Diseño técnico de la timeline.** Elegir preview (WebCodecs vs `<video>`), store, modelo de
   comandos y render determinista antes de escribir la UI.
2. **Prototipo de timeline real.** Importar un video cualquiera, dos pistas, cortar/mover/trim y
   preview con proxy. Sin esto, el producto sigue siendo un cortador.
3. **Git y línea base.** `git init`, commit, etiqueta `v0.1.0`.
4. **Esquema versionado y rutas relativas.** Evitar proyectos rotos.
5. **Pruebas unitarias** de momentos, ASS/SRT y QC.
6. **Decisión de identidad visual.** Revisar parecido con Sloth; definir logo, paleta y tipografía.
7. **Windows limpio y firma.** El instalador existe; falta probarlo sin Node/Python/FFmpeg y firmarlo.
8. **Tres creadores beta.** Validar el flujo actual y el editor.

---

## 18. Empaquetado: estado y checklist

### Lo que hay

- `electron-builder.yml` con `appId: com.recorte.app`, `productName: Recorte`, target NSIS.
- `files: [out/**, package.json]` y `extraResources: python/` (transcribir, caras, requirements).
- `build/icon.png` generado por `scripts/icono.py` (Pillow).
- `release/Recorte-0.1.0-setup.exe` (~122 MB).
- Verificado el 5-nov: el paquete contiene `Recorte.exe`, `resources/app.asar` con la app real y
  `resources/python/`. Las carpetas `win-unpacked*` sueltas del repo son restos de ejecuciones
  interrumpidas por el antivirus; se pueden borrar cuando Windows las suelte.

### Diagnóstico

Resuelto: los builds salían incompletos porque Windows Defender/SearchIndexer bloqueaba
`default_app.asar` al extraer Electron en el Escritorio (EPERM/EBUSY). Empaquetar con salida a
`%LOCALAPPDATA%\Temp` lo evita:

```powershell
npx electron-builder -c.directories.output=$env:LOCALAPPDATA\Temp\recorte-release
```

### Checklist para arreglarlo

- [x] `npm run build` antes de empaquetar.
- [x] Verificar que `out/main/index.js`, `out/preload/index.js` y `out/renderer/index.html` existen.
- [x] Confirmar `main` en `package.json`.
- [x] Añadir `extraResources` para `python/transcribir.py`, `python/caras.py` y `python/requirements.txt`.
- [ ] Decidir si se bundlea Python + faster-whisper o se detecta/instala.
- [ ] Bundlear FFmpeg LGPL con libass o detectarlo y guiar la instalación.
- [ ] Incluir avisos de licencia de FFmpeg, libass, Python y modelos.
- [ ] Probar el instalador en una máquina Windows limpia (sin Node/Python/FFmpeg).
- [ ] Verificar `app.asar`, recursos, icono, accesos directos y desinstalación.
- [ ] Firmar el ejecutable y el instalador.
- [ ] Añadir auto-update o un mecanismo de actualización manual.
- [ ] Medir tamaño final y tiempo de instalación.

---

## 19. Legal y licencias

### Sloth

- Sloth se distribuye con Apache 2.0 + Commons Clause.
- La Commons Clause prohíbe vender Sloth, un fork modificado, alojarlo como servicio o vender soporte
  sin licencia comercial de su autor.
- Se pueden vender los videos creados con Sloth.
- Apache 2.0 no concede derechos de marca.
- **Recorte es clean-room:** no se copió código, skills, prompts, plantillas, estilos, assets ni
  nombres. Si se quiere reutilizar algo, primero hay que pedir licencia.

### Terceros

- **FFmpeg:** build LGPL, avisos incluidos; revisar patentes de H.264/H.265 en el país de venta.
- **libass:** parte del stack de subtítulos; incluir avisos.
- **Remotion:** licencia comercial para uso empresarial; no usar sin licencia.
- **GSAP/Lottie/Three/Pixi:** verificar licencia y atribuciones.
- **Fuentes:** usar OFL o licencias que permitan incrustar; Inter es OFL, pero verificar cada una.
- **Música/SFX:** solo bibliotecas con licencia comercial; nada de audio de trends sin permiso.
- **IA:** revisar términos de cada proveedor; consentimiento para clonar voces; leyes de deepfake.
- **Privacidad:** local por defecto; si se sube algo, consentimiento, cifrado y política de datos.
- **Marca:** buscar «Recorte» antes de invertir en identidad; puede haber conflictos.

---

## 20. Negocio y métricas

### Modelo hipotético

- Licencia local mensual baja o pago único con actualizaciones.
- Prueba que permita exportar un clip completo.
- IA: el cliente pone su clave o paga un pack de créditos.
- Nube opcional para render/generación pesada, nunca obligatoria.
- Upsell: packs de plantillas, formación, soporte.

### Métricas

- Tiempo hasta el primer clip exportado.
- Clips aprobados por clase.
- Porcentaje de renders sin error.
- Retención a 4 semanas.
- Clips publicados por semana.
- Coste por clip (CPU local, API, soporte).
- NPS y motivos de abandono.

### Canales

- Creadores de cursos en español (YouTube, comunidades, plataformas de formación).
- Agencias de contenido educativo.
- Partnerships con escuelas online.
- Contenido propio: «cómo convertí mi clase en 12 reels».

---

## 21. Decisiones abiertas

1. **Nombre definitivo.** «Recorte» es provisional; verificar marca.
2. **Identidad visual.** La paleta actual (carbón + lima) puede parecerse a Sloth. Decidir si se
   mantiene o se diferencia.
3. **Plataforma inicial.** Windows primero; macOS/Linux después.
4. **Precio.** Pago único vs suscripción; prueba; límites.
5. **Nube.** Solo local vs híbrido opcional.
6. **Modelos de IA.** OpenAI, Anthropic, Google, locales; coste y privacidad.
7. **Remotion.** ¿Se paga licencia o se construye el compositor propio?
8. **Timeline.** Construir propia vs adaptar una librería; invertir en UX.
9. **Python/FFmpeg.** Bundlear todo vs detectar/instalar; tamaño vs fricción.
10. **Música/trends.** Presupuesto de licencias y fuentes.
11. **Alcance de «tiempo real».** ¿Preview fluido, generación en vivo o ambas?
12. **Referencia visual.** Adjuntar capturas/links del proyecto que se mostró para afinar el estilo.
13. **Equipo y plazo.** Una persona vs equipo; presupuesto.
14. **Colaboración.** ¿Multiusuario o solo local por ahora?

---

## 22. Referencia: Sloth 2.0

Se analizó Sloth 2.0 como inspiración de producto, no como base de código. Lo que interesa de su
enfoque:

- App local donde cada skill es una card y el agente trabaja a la vista.
- Sesiones con agentes, proveedores, costo y errores visibles.
- Estudio de video con estilos, lotes, portadas y galerías.
- Módulos de redes, navegador, Ideas, radar y comunidad.
- Fuerte integración con el sistema de archivos y herramientas locales.
- Sensación de «estudio» más que de «chat».

Lo que **no** se debe copiar:

- Código, skills, prompts, plantillas, nombres, assets, estilos visuales o estructura interna.
- Su modelo de licencia o su marca.
- Su arquitectura exacta.

La lección es la ambición: **una app local, visual y potente donde la IA hace trabajo real y el
usuario ve lo que pasa.** Recorte debe lograr esa sensación con su propio producto, su propio flujo y
su propia identidad.

---

## 23. Mapa del repo y comandos

```
recorte/
  package.json
  electron.vite.config.ts
  electron-builder.yml
  build/icon.png
  src/
    main/
      index.ts
      ffmpeg.ts
      transcribir.ts
      momentos.ts
      ia.ts
      ajustes.ts
      caras.ts
      render.ts
      proyectos.ts
      disco.ts
      media.ts
    preload/index.ts
    shared/
      types.ts
      api.ts
    renderer/
      index.html
      src/
        App.tsx
        data.ts
        format.ts
        media.ts
        Icons.tsx
        styles.css
        components/
          Sidebar.tsx
          TopBar.tsx
          SourceCard.tsx
          ClipList.tsx
          Inspector.tsx
          RenderQueue.tsx
          PlayerModal.tsx
          BrandView.tsx
          SettingsView.tsx
          Toast.tsx
  python/
    transcribir.py
    caras.py
    requirements.txt
  scripts/
    prueba-e2e.mjs
    icono.py
  docs/
    PRODUCTO.md
    ARQUITECTURA.md
    CONTEXTO-KIMI.md
  out/          (build, ignorado)
  release/      (instalador, ignorado)
```

### Comandos

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm run prueba:e2e
npm run package
```

### Variables de entorno

| Variable | Uso |
|---|---|
| `RECORTE_FFMPEG` | Ruta a ffmpeg |
| `RECORTE_FFPROBE` | Ruta a ffprobe |
| `RECORTE_PYTHON` | Ruta a Python |
| `RECORTE_MODELO` | tiny/base/small/medium/large-v3 |
| `VIDEO_PRUEBA` | Video para la prueba e2e |
| `RECORTE_E2E_CONSERVAR=1` | No borrar los temporales de la prueba |

### Dependencias externas

- FFmpeg + ffprobe con libass.
- Python 3.10+ con faster-whisper y numpy.
- Modelo de Whisper (se descarga la primera vez; `small` ya está en caché).
- Fuente Arial para el render actual (o una fuente OFL bundleada más adelante).

---

## 24. Pruebas y criterios de aceptación

### Lo que ya se prueba

- `npm run typecheck`: tipos de main, preload, shared y renderer.
- `npm run build`: main, preload y renderer.
- `npm run prueba:e2e`:
  - Abre Electron aislado con `--user-data-dir`.
  - Importa un video.
  - Verifica miniatura, proxy, transcripción y momentos.
  - Renderiza un clip.
  - Comprueba 1080×1920 y duración.
  - Verifica archivos y recarga la UI.
  - Guarda una captura.

### Lo que falta probar

- Momentos con transcripciones largas y diversas.
- ASS/SRT con acentos, comillas, saltos y signos.
- Clips sin audio, con audio mono, con audio 5.1.
- Videos verticales, 4:3, con rotación, con HDR.
- Cancelación y reintento de render.
- Cola con varios clips.
- Instalador en máquina limpia.
- macOS/Linux.
- Accesibilidad y teclado.
- Límites de memoria con clases de 2 h.

### Definición de terminado para el MVP vendible

- [ ] Instalador firmado que funcione en Windows limpio.
- [ ] Importar cualquier video y editarlo en una timeline con al menos dos pistas.
- [ ] Cortar, mover, separar y ajustar clips con undo/redo.
- [ ] Preview con proxy sincronizado y exportación WYSIWYG.
- [ ] Importar, transcribir y generar 10 clips sin terminal.
- [ ] Renderizar el lote completo con progreso y cancelación.
- [ ] MP4 + SRT + portada por clip.
- [ ] Proyecto persistente y recuperable.
- [ ] Errores claros si falta FFmpeg/Python/modelo.
- [ ] Licencias y avisos incluidos.
- [ ] Tres creadores beta lo usan sin ayuda.

---

## 25. Glosario

- **Proxy:** copia de baja resolución para editar/previsualizar sin cargar el original.
- **OTIO:** OpenTimelineIO, formato abierto para intercambiar timelines.
- **NLE:** editor de video no lineal (Premiere, Resolve, Final Cut).
- **ASS:** formato de subtítulos con estilos, usado por libass para quemar texto.
- **SRT:** subtítulos simples con tiempos.
- **Safe zone:** zona visible sin que la UI de la plataforma tape el contenido.
- **Loudness:** nivel de audio percibido; las plataformas normalizan.
- **Keyframe:** valor de una propiedad en un instante, con interpolación.
- **B-roll:** material de apoyo que no es el plano principal.
- **Lower third:** rótulo en la parte inferior con nombre/cargo.
- **WYSIWYG:** lo que ves en el preview es lo que sale en el render.
- **Clean-room:** reconstrucción independiente sin copiar la implementación original.

---

## 26. Prompt sugerido para Kimi

Copia esto junto con el documento:

> Eres el arquitecto e ingeniero principal de **Recorte**, un estudio local de edición de video con IA.
> Lee `docs/CONTEXTO-KIMI.md` completo antes de responder. No copies código, prompts, plantillas,
> estilos ni assets de Sloth. La interfaz y los comentarios van en español. El producto ya tiene
> ingesta, transcripción, selección local de momentos y render por lote; lo que falta —y es el centro
> del producto— es un **editor real con timeline**, no un cortador de clips.
>
> Quiero que cualquier persona pueda traer un video y editarlo de verdad: pistas, cortes, mover,
> separar, transiciones, texto, audio, efectos y animaciones. La IA debe proponer y ejecutar planes de
> edición reversibles sobre esa timeline; los prompts frasean y deciden, pero no editan por sí solos.
> Nada de subir el material a la nube.
>
> Primero entrégame:
> 1. Un diagnóstico del estado actual y de los riesgos, distinguiendo lo que ya funciona de lo que es
>    maqueta.
> 2. La arquitectura propuesta para timeline + preview en tiempo real + render determinista, con el
>    modelo de datos y la capa de comandos.
> 3. Un roadmap por fases con criterios de aceptación, poniendo la timeline antes que el lote.
> 4. Las decisiones que debo tomar antes de escribir código.
> 5. Qué prompts merece la pena tener, cómo se validan y qué licencias permiten reutilizarlos.
>
> Después, si te lo pido, implementa la siguiente fase en el repo `C:\Users\Alex\Desktop\recorte`
> siguiendo las convenciones existentes. Comprueba con `npm run typecheck`, `npm run build` y
> `npm run prueba:e2e`. No borres trabajo del fundador ni añadas dependencias caras sin preguntar.

---

## 27. Cierre

Recorte ya no es una maqueta: hay un pipeline real que importa, transcribe, propone, renderiza y
persiste. Pero eso es el motor, no el producto. Lo que sigue es construir el editor de verdad —la
timeline, el preview, los comandos, las capas— y después ponerle encima la IA, las animaciones y las
tendencias, sin perder la promesa que lo hace defendible:

**todo en tu equipo, con tu marca, sin pagar por minuto.**

La secuencia correcta es estabilizar lo que ya funciona, cerrar el lote, construir la timeline y
después añadir la IA y las animaciones encima. Saltar directo a un clon de Premiere con IA es la
forma más rápida de no lanzar nada.
