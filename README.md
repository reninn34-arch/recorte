# Recorte

**De material largo a piezas publicables. Y de vuelta al editor.**

Recorte es un estudio local de edición de video con IA. Hoy convierte una clase o un webinar en un lote de reels verticales con subtítulos y marca. El siguiente hito es la timeline: abrir cualquier video y montarlo de verdad, sin saltar a otro programa.

## Por qué

Los creadores de cursos graban horas de material y publican poco. Las herramientas actuales suben el video a la nube, cobran por minuto y pierden la identidad del curso. Recorte trabaja en tu computadora, con tu marca y por lote.

## Producto

- Importa MP4, MOV, MKV o WebM.
- Transcribe en local con tiempos por palabra.
- Propone clips con título, gancho, puntuación y motivo. Por defecto con heurísticas locales;
  opcionalmente con un LLM compatible con OpenAI y tu propia clave (Ajustes → Análisis con IA).
- Reencuadre vertical con seguimiento de cara.
- Subtítulos, títulos, logo y barra de progreso con el kit de marca.
- Render por lote a 1080×1920.
- Exporta MP4, SRT, portada y un proyecto editable.

## Stack

- Electron + React + TypeScript + Vite.
- FFmpeg para ingesta, proxies, cortes y render.
- Python para transcripción (faster-whisper), escenas y seguimiento de cara.
- Una carpeta por proyecto con JSON y archivos derivados.
- LLM con clave del usuario para elegir los mejores momentos.

## Requisitos

- Node.js 22 o superior.
- FFmpeg y ffprobe en el `PATH`.
- Python 3.10 o superior con `faster-whisper`, `numpy` y `opencv-python-headless`.

```bash
python -m pip install -r python/requirements.txt
```

Se puede apuntar a otras rutas con `RECORTE_FFMPEG`, `RECORTE_FFPROBE`, `RECORTE_PYTHON` y
`RECORTE_MODELO`.

## Arrancar

```bash
npm install
npm run dev
```

## Comprobar

```bash
npm run typecheck   # tipos del proceso principal y de la interfaz
npm run build       # compilación de producción
npm run prueba:e2e  # importa, transcribe, propone, renderiza y captura la app real
```

La prueba end-to-end necesita un video de muestra. Por defecto usa
`%LOCALAPPDATA%\Temp\opencode\recorte-test\clase-prueba.mp4`; se puede cambiar con
`VIDEO_PRUEBA=<ruta>`.

## Empaquetar

```bash
npm run package   # genera release/Recorte-<versión>-setup.exe (NSIS)
```

El instalador no incluye FFmpeg ni Python: siguen siendo requisitos del equipo. Si el
antivirus o el indexador de Windows bloquean la extracción de Electron durante el empaquetado
(EPERM/EBUSY en `win-unpacked`), apunta la salida a una carpeta no indexada:

```bash
npx electron-builder -c.directories.output=%LOCALAPPDATA%\Temp\recorte-release
```

## Estado

El primer ciclo completo ya funciona de punta a punta:

- FFprobe lee duración, resolución, fps y rotación.
- Se genera miniatura y, si hace falta, un proxy 720p en segundo plano.
- La transcripción corre en local con tiempos por palabra y se guarda por proyecto.
- La app propone hasta 12 momentos, con título, gancho, puntuación y motivo.
- El creador revisa el corte y ajusta título, gancho, estilo de subtítulo y encuadre.
- El render produce MP4 verticales 1080×1920 con subtítulos y marca, más SRT y portada JPG por clip.
- El render por lote procesa todos los clips pendientes en serie, con progreso conjunto.
- La cola, el progreso y los archivos sobreviven al reinicio.

La selección de momentos funciona sin claves (heurísticas locales) y, si activas la IA en
Ajustes, con cualquier API compatible con OpenAI. Ver `docs/ARQUITECTURA.md`.

## Licencia

Proyecto nuevo, sin código de Sloth. Licencia por definir antes de publicar.
