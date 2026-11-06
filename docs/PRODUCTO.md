# Recorte · producto

## Qué es

Recorte es un estudio local de edición de video con IA. Acepta cualquier material —una clase, un
webinar, una entrevista o clips sueltos— y lo monta en una timeline multipista. Los reels por lote son
el primer flujo automatizado: convierten una clase larga en muchas piezas cortas, pero todas aterrizan
en el editor, donde se puede cambiar el corte, el orden, el texto, el audio y las capas.

## Qué no es

- Un cortador de clips con una capa de IA encima.
- Un clon de Sloth, Premiere o Resolve.
- Un SaaS que sube todo el material por defecto.
- Un generador que escupe videos sin control humano.

## Quién

El usuario inicial es un creador de cursos con entre 10 y 100 horas de clases grabadas. Graba en Zoom,
OBS o cámara y necesita alimentar TikTok, Reels y Shorts sin contratar a un editor por cada pieza. El
editor también sirve para entrevistas, webinars, podcast con video y cualquier material que el usuario
quiera montar.

## Problema

Convertir una clase de 45 minutos en 10-20 clips verticales es manual: ver, marcar, cortar,
reencuadrar, subtitular, poner la marca y exportar. Y cuando el clip automático no queda bien, las
herramientas actuales obligan a saltar a otro programa. Las de la nube cobran por minuto, suben todo
el material y producen piezas genéricas que no se parecen al curso.

## Promesa

**Del material bruto a piezas publicables en una sola app.**

- **Lote:** una clase de 45 minutos → 10-20 reels revisables en menos de 30 minutos, con la marca del
  curso y sin subir el material a ningún servidor.
- **Editor:** cualquier video se abre en una timeline, se edita sin destruir el original y se exporta
  con la misma calidad que se ve en el preview.

## Flujo

1. **Importar.** El creador elige un video. Recorte lee duración, resolución y pistas, genera miniatura
   y proxy.
2. **Transcribir.** En local, con tiempos por palabra y detección de idioma.
3. **Proponer.** El análisis divide la transcripción en momentos candidatos y devuelve título, gancho,
   inicio, fin, puntuación y motivo. La primera versión es local; el LLM entra después como mejora
   opcional.
4. **Montar.** El clip propuesto se abre en la timeline. El creador ajusta el corte, el orden, el
   encuadre, el estilo de subtítulo, el texto, el audio y las capas.
5. **Renderizar.** Un clip o el lote completo, en vertical 1080×1920, con subtítulos, título, logo y
   barra de progreso.
6. **Exportar.** MP4, SRT, portada y un proyecto editable para Premiere/Resolve.

## MVP

- Importar varios MP4/MOV/MKV/WebM, imágenes y audio en el mismo proyecto.
- Transcribir en local.
- Timeline con 2 pistas de video, 1 de audio y 1 de subtítulos/overlay.
- Cortar, mover, separar, trim, ripple, snap y undo/redo.
- Preview con proxy y audio sincronizado.
- Sugerir clips con puntuación y gancho.
- Editar título, gancho, corte, estilo de subtítulo y encuadre.
- Renderizar un clip o un lote de 10-20 clips.
- Kit de marca: colores, tipografía y logo.
- Exportar MP4 + SRT + portada.

## Fuera del MVP

- Edición multicámara.
- Color grading avanzado y mezcla de audio profesional.
- Biblioteca completa de motion graphics (entran plantillas básicas después).
- Generación de video con IA (B-roll, voz, música) en la primera versión.
- Publicación directa a TikTok/Instagram/YouTube.
- Colaboración y nube.

## Métricas

- Tiempo hasta el primer clip exportado.
- Tiempo hasta el primer montaje manual exportado.
- Clips aprobados por clase.
- Porcentaje de renders sin error.
- Retención a 4 semanas.
- Clips publicados por semana.

## Precio

Local-first, sin coste por minuto. La hipótesis inicial es una licencia mensual baja o un pago único
con actualizaciones, con una versión de prueba que permita exportar un clip completo.
