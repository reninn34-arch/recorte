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
