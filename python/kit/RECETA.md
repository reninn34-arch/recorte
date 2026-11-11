# La receta del kit

Un JSON que describe el video; `python kit/kit.py armar receta.json` lo hace en una sola pasada (música incluida)
y deja `revision/hoja-final.jpg`. Con `--prueba 0.5,3,8` saca solo esos fotogramas a `revision/` en segundos:
úsalo para ajustar antes del render. Las rutas son relativas a la receta (p. ej. `entrada/01-foto.jpg`).

```json
{
  "ancho": 1080, "alto": 1920, "fps": 30,
  "duracion": 13.3,
  "fuente": "fina",
  "color_texto": "#F5F2EC", "color_acento": "#D4AF5A", "fondo": "#0E1210",
  "transicion": 0.22,
  "fundido_final": 0.5,
  "musica": { "archivo": "entrada/07-musica.mp4", "desde": 0, "hasta": 10.8, "fundido": 0.2, "en": 0, "volumen": 1 },
  "salida": "salida/final.mp4",
  "momentos": [
    { "tipo": "foto", "archivo": "entrada/01-antes.jpg", "desde": 0.2, "hasta": 1.8, "rotulo": "Antes",
      "encuadre": { "zoom": 1.3, "cx": 0.47, "cy": 0.52 } },
    { "tipo": "foto", "archivo": "entrada/03-despues.jpg", "desde": 1.8, "hasta": 3.5, "rotulo": "Después", "brillo": true },
    { "tipo": "comparar", "antes": "entrada/01-antes.jpg", "despues": "entrada/03-despues.jpg", "desde": 3.5, "hasta": 6,
      "modo": "deslizar", "rotulos": ["Antes", "Después"], "brillo": true },
    { "tipo": "video", "archivo": "entrada/05-clip.mp4", "inicio": 2.0, "desde": 6, "hasta": 9, "rotulo": "Así se hace" },
    { "tipo": "collage", "desde": 9, "hasta": 13.3, "columnas": 3, "fotos": ["entrada/01-antes.jpg", "…"],
      "rotulos": ["antes", "…"], "brillo": [2], "tapar": { "0": [[0.8, 0, 1, 0.2]] } },
    { "tipo": "texto", "desde": 10.8, "hasta": 13.3, "lineas": ["UN PROBLEMA DE AÑOS", "NO SE RESUELVE", "EN UN DÍA"],
      "destacar": 2, "oscurecer": 0.72 }
  ]
}
```

## Las piezas (`tipo`)
- **foto**: a pantalla completa, con acercamiento lento (`"acercar": false` lo quita). `encuadre`: `zoom` (1 = cubre
  justo; 1.3 = más cerca), `cx`/`cy` (0–1, el punto de la foto que queda al centro). `rotulo` arriba (o
  `"rotulo_pos": "abajo"`), `brillo` (barrido de luz), `tapar`: zonas a desenfocar `[x0, y0, x1, y1]` en fracciones.
- **video**: un tramo a pantalla completa desde `inicio` (segundos del original). Sin su audio.
- **comparar**: antes y después. `modo`: `deslizar` (una línea destapa el después), `lado` o `arriba`.
- **collage**: fotos enteras en rejilla (`columnas`), con `rotulos` debajo, entrando escalonadas; `brillo`: índices.
- **texto**: frase en `lineas`; `destacar` agranda una (color de acento, con línea debajo). `oscurecer` (0–1)
  oscurece y desenfoca lo de debajo; sin él, va sobre el fondo. `"brillo": false` quita el barrido sobre el texto.

## Reglas
- Lo que va más abajo en la lista se dibuja encima. Cada momento entra con un fundido de `transicion` s y se queda
  ese mismo tiempo de más, para que lo siguiente entre encima sin hueco.
- Pon cada `desde` en un golpe de la música: `python kit/kit.py golpes <audio-o-video>` da los golpes y el tempo.
- Para elegir el encuadre de una foto: `python kit/kit.py encuadre entrada/x.jpg --zoom 1.3 --cx .45 --cy .5`.
- `fuente`: `fina`, `normal`, `negrita`, `gruesa` o la ruta de un .ttf.
- Si algo no está en el kit, escríbelo tú (Python + FFmpeg) y usa el kit para lo demás.

## Subtítulos (una pista editable)
Los subtítulos van en la receta, NUNCA quemados con un script aparte: así el usuario los ve y los edita uno a uno en el
editor de Recorte (texto, letra, color y caja). Lo mismo con los rótulos: usa `rotulo` en cada momento o un momento
`texto`; no los dibujes con código propio.
```json
"subtitulos": {
  "frases": [{ "texto": "Si en las fotos sonríes", "desde": 0.4, "hasta": 1.9 }, { "texto": "con la boca cerrada,", "desde": 1.9, "hasta": 3.1 }],
  "fuente": "negrita", "tam": 62, "color": "#FFFFFF", "caja": "#0A2540", "pos": 0.78
}
```
- Una frase cada 3–6 palabras, partiendo en la puntuación; cada una dura lo que se dice (sin huecos ni solapes).
- Con narración, saca los tiempos de las palabras (el .json de la transcripción o lo que devuelve `kit.py voz`).
- `caja`: el color de la caja (`null` = sin caja, solo la letra con borde). `pos`: la altura (0 arriba, 1 abajo).
- Cubre TODO lo que se dice, de principio a fin: si cambias escenas, revisa que ninguna frase quede sin subtítulo.

## Capas encima y efectos de sonido (también editables)
Logos, íconos, sellos o una foto pequeña encima del video van en `"capas"`, y los efectos de sonido en `"sonidos"`.
NUNCA los pegues con un script aparte: así quedan en las pistas «Encima» y «Sonidos» del editor y el usuario los mueve.
```json
"capas": [{ "archivo": "entrada/logo.png", "desde": 2.0, "hasta": 4.5, "x": 0.5, "y": 0.32, "ancho": 0.3, "entrada": "pop" }],
"sonidos": [{ "sonido": "pop", "en": 2.0 }, { "sonido": "whoosh", "en": 6.0, "volumen": 0.5 }, { "archivo": "entrada/campana.wav", "en": 9 }]
```
- `x`, `y`: el centro de la capa (0–1 del cuadro). `ancho`: fracción del ancho (0.05–1). `entrada`: `pop`, `fundido` o `ninguna`.
  Solo imágenes (un PNG con transparencia queda mejor). Que no tape caras ni subtítulos.
- `sonido`: uno de los que trae Recorte: `whoosh` (un cambio rápido), `pop` (algo que aparece), `pop-alto` (el siguiente
  de una serie), `ding` (un dato, un acierto), `caching` (una oferta). O `archivo` con uno propio. `volumen` por defecto 0.6.
- Un «pop» cuando entra cada logo o ícono, un «whoosh» en los cortes fuertes; sin abusar (uno cada pocos segundos).

## La voz (narración)
Recorte genera la narración con la voz que eligió el usuario; tú solo escribes qué dice.
1. Escribe `voz/narracion.txt` con UNA frase por línea (una por momento, natural y hablada, ~2,5 palabras por segundo).
2. `python kit/kit.py voz voz/narracion.txt` → devuelve cada frase con su `archivo` y su `duracion` (tarda unos segundos por frase).
3. Haz que cada momento dure lo que su frase (más un respiro de 0,2–0,4 s) y ponlas en la receta:
   `"voz": [{ "archivo": "voz/ab12cd34-01.wav", "en": 0.3 }, { "archivo": "voz/ab12cd34-02.wav", "en": 3.9 }]`
   (`en` = el segundo del video donde empieza; `volumen` opcional). Con voz, la música baja sola a 0.25 salvo que pongas su `volumen`.
- Para cambiar lo que dice UNA frase: un archivo con solo esa línea, `kit.py voz` otra vez, y reemplaza su entrada en `"voz"`.
  No vuelvas a pedir las que no cambian.
- Si `kit.py voz` responde que el usuario eligió sin voz, o falla, sigue sin narración y dilo en el resumen. No uses otra voz ni otro TTS.

## Imágenes y clips generados
Si el usuario eligió generar imágenes o clips (lo dice AGENTS.md), Recorte los hace con SUS cuentas (Google Flow o ChatGPT):
- `python kit/kit.py imagen "descripción" [--ref entrada/01-foto.jpg]` → `{"archivo": "medios/img-….png"}` (unos segundos o un minuto).
- `python kit/kit.py clip "descripción" [--ref …]` → `{"archivo": "medios/clip-….mp4"}` (varios minutos; GASTA créditos: solo los del guion gráfico que aprobó el usuario).
- Describe bien: sujeto, acción, encuadre (vertical u horizontal ya va solo), luz y estilo. Sin texto escrito dentro de la imagen:
  los rótulos los pones tú en la receta (así el usuario los edita).
- `--ref` usa fotos del usuario como referencia (que se parezca a su producto, su local, su cara); hasta 3.
- Pide varias a la vez con `&` o en paralelo si las necesitas todas: Recorte las reparte entre sus cuentas.
- Úsalas en la receta como cualquier archivo: `{"tipo": "foto", "archivo": "medios/img-….png", …}` o `{"tipo": "video", "archivo": "medios/clip-….mp4", …}`.
- Si responde que el usuario no eligió generar, o falla, sigue con lo que tienes y dilo en el resumen.
