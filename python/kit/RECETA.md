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

## Piezas de documental (museo, archivo, títulos de revista)
Para el estilo de mini documental (una historia contada con una obra, un objeto o una persona) hay piezas propias.
Las tres primeras van ENCIMA de lo que ya se ve (ponlas en la lista después de la escena); en el editor quedan como
rótulos sueltos que el usuario mueve y cambia.
```json
{ "tipo": "titulo", "desde": 0.1, "hasta": 2.4, "x": 0.5, "y": 0.17, "entrada": "subir", "subrayado": "#D62828", "grano": false,
  "lineas": [{ "texto": "¿Y si un hombre decidiera ir a", "tam": 0.038 },
             { "texto": "Marte?", "fuente": "cursiva", "tam": 0.2, "color": "#D62828" }] },
{ "tipo": "etiqueta", "desde": 3.8, "hasta": 5, "texto": "ELON MUSK", "x": 0.64, "y": 0.56, "fondo": "#FFD60A", "giro": -4 },
{ "tipo": "palabras", "desde": 9.6, "hasta": 11.5, "palabras": ["Riesgo", "Fracaso", "Obsesión"], "destacar": [1], "fuente": "cursiva" },
{ "tipo": "objeto", "archivo": "medios/cohete.png", "fondo": "medios/pared.jpg", "desde": 5, "hasta": 7.5, "ancho": 0.55, "giro": 38, "foco": true, "marco": true },
{ "tipo": "apiladas", "fotos": ["medios/a.jpg", "medios/b.jpg", "medios/c.jpg"], "fondo": "#1A1714", "gris": true, "desde": 7.5, "hasta": 9.5 }
```
- **titulo**: varias líneas, cada una con su `fuente`, `tam` (fracción del ancho: 0.035 una frase pequeña, 0.2 una palabra
  grande, 0.3–0.35 una palabra que llena la pantalla) y `color`. `entrada`: `subir` (línea a línea), `maquina` (letra a
  letra) o `pop` (rebota). `subrayado`: una raya de color bajo la última línea. `grano`: letras gastadas, de imprenta.
  `oscurecer` (0–1): oscurece lo de debajo. `x`, `y`: el centro del bloque.
- **etiqueta**: la tira de papel de color con un nombre (por defecto amarilla con letra negra y algo girada), entra con un «pop».
- **palabras**: palabras sueltas que aparecen una a una en distintos sitios y flotan. `destacar`: índices más grandes y en el
  color de acento. `posiciones`: `[[x, y], …]` si quieres elegir dónde cae cada una.
- **objeto**: una pieza como en un museo (un cuadro, un cohete, un producto): con `marco` (true o un color), sombra, bajo un
  `foco` de luz desde arriba y entrando con un `giro` 3D (grados) que se asienta. Sobre `fondo` (una imagen o un color).
  Usa una imagen del objeto SOLO (sin la sala): la sala la pone `fondo`.
- **apiladas**: fotos impresas con su borde blanco que caen una sobre otra, cada una algo girada; `gris` (por defecto true)
  las pasa a blanco y negro, como fotos de archivo. Pon encima un `titulo` con una palabra roja.
- Las letras: `cursiva` (Playfair Display cursiva, la serif de revista de los títulos elegantes: «Fear», «Marte?»),
  `serif` (Playfair Display recta: años, nombres), `titular` (Anton, condensada muy gruesa: «THE SCREAM», «PLAN»),
  `gruesa`, `impacto`, `normal`, `fina`. Vienen con Recorte y el editor las tiene igual.

## Transiciones con movimiento
Cada momento puede entrar con `"transicion"`: `fundido` (por defecto), `barrido-izquierda`, `barrido-derecha`, `barrido-arriba`,
`barrido-abajo` (empuja lo de antes hacia ese lado, como un paneo rápido), `zoom`, `desenfoque`, `destello` (pasa por blanco) o
`circulo`. Dura `entra` segundos (0.45 por defecto con estas). En el editor son las transiciones de cada corte. Úsalas con medida:
en los cambios de tema o de escena, con un «whoosh» en el barrido; lo demás, cortes y fundidos.
Los títulos (`titulo`) también entran `"entrada": "palabras"`: palabra a palabra, como una pregunta que se va armando.

## Reglas
- **Nada dos veces.** Con subtítulos, los textos de arriba NO repiten la frase: son títulos de diseño cortos (1–3 palabras
  clave: «2002», «Marte?», «FRACASO») con su letra y su animación, o nada. Sin `rotulo` en cada momento: el rótulo simple
  es para videos sencillos; en un documental, usa `titulo`.
- **Nada encima de los subtítulos.** Etiquetas, títulos y capas fuera de su franja (su `pos` ± 0.08; por defecto y 0.70–0.86).
- `armar` (y `--prueba`) devuelven `avisos` si pasa algo de esto: corrígelos antes de entregar.
- **Movimiento de cámara.** En una `foto`, `"camara": {"zoom": 1.25, "cx": 0.6, "cy": 0.4}` lleva la cámara del `encuadre` a ese
  otro encuadre, suave (un paneo, acercarse a una cara, alejarse para revelar). Úsalo en casi todas las fotos: es lo que da la
  sensación de cámara de la referencia. Movimientos lentos y en una dirección; nada de idas y vueltas.
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
- `x`, `y`: el centro de la capa (0–1 del cuadro). `ancho`: fracción del ancho (0.05–2; más de 1 sobresale del cuadro). `giro`: grados.
  `entrada`: `pop`, `fundido`, `izquierda`, `derecha`, `arriba`, `abajo` (entra deslizándose desde fuera) o `ninguna`.
- **Que se mueva**: `"fin": {"x": 1.2, "y": 0.3, "ancho": 0.3, "giro": 10}` es dónde termina (puede ser fuera del cuadro, de
  -0.5 a 1.5); va suave de un sitio al otro durante toda la capa. Así se hace el **paralaje** (varias capas recortadas, cada
  una con su deriva: el fondo se mueve poco, lo de delante más), un avión que **cruza** la pantalla, humo que **sube**, una
  foto que **se acerca** o algo que **gira**. Para una escena por capas: fondo como foto, y encima cada pieza recortada (PNG
  sin fondo) entrando en su momento, desde su lado, con un «pop» de sonido.
  Solo imágenes (un PNG con transparencia queda mejor). Que no tape caras ni subtítulos.
- `sonido`: uno de los 34 que trae Recorte (`python kit/kit.py sonidos` da la lista con para qué sirve cada uno y lo que
  dura; `--tipo` filtra). O `archivo` con uno propio. `volumen` por defecto 0.6. Los hay de seis tipos:
  - **transiciones**: `whoosh` (un cambio rápido), `swish` (algo corto que pasa), `reversa` (el aire que se recoge antes de
    un corte), `glitch` (tecnología, un fallo, un salto brusco).
  - **aparece algo**: `pop`, `pop-alto` (el siguiente de una serie), `ding` (un dato), `caching` (una oferta), `campana`
    (un logro), `interruptor`.
  - **golpes**: `impacto` (grave y largo: el título, la gran cifra, el giro), `golpe`, `gong` (algo solemne), `explosion`,
    `cristal` (algo que se rompe).
  - **tensión**: `subida` (3 s que crecen hasta un corte), `tension` (zumbido de fondo, 8 s), `latido`, `alarma`.
  - **objetos y acciones**: `maquina-escribir` (un texto que se escribe), `camara-foto` (una foto que aparece), `pagina`,
    `papel`, `reloj` (el tiempo que pasa), `pasos`, `puerta`, `monedas`, `telefono`.
  - **ambientes** (de fondo, 10 s): `lluvia`, `trafico`, `obra`, `maquinas`, `multitud`, `trueno`.
- Como un editor: un «pop» cuando entra cada logo o ícono, la `maquina-escribir` bajo un texto que se escribe, la
  `camara-foto` cuando cae una foto de archivo, un `whoosh` o un `swish` en los cortes fuertes y, en el gran momento, la
  `subida` que acaba JUSTO en el corte (`"en"` = el corte − 3) y el `impacto` en el corte. Un ambiente bajo (0.25–0.35)
  da lugar a una escena (la ciudad, la fábrica, la lluvia): ponlo seguido varias veces si la escena dura más de 10 s.
  Sin abusar: uno cada pocos segundos, y nunca encima de una frase importante de la voz.

## Por piezas: así se hace un documental con personas (el método normal)
Como un editor con sus recursos sueltos: no pidas escenas enteras con la persona dentro; pide las PIEZAS y compón.
1. **Reparto**: cada personaje, una vez, sobre verde: `kit.py imagen "<quién es, ropa, época, estilo>, full body, standing,
   facing camera, arms slightly away from the body, legs slightly apart, feet visible, neutral pose" --recorte`. Es su
   imagen principal (la marioneta). Si en la historia camina, corre o se sienta, pide también su versión DE PERFIL con la
   principal de `--ref` y anímala como **muñeco por piezas** (`"piezas": true`, ver «Muñeco por piezas»).
2. **Decorados**: cada lugar, VACÍO: `kit.py imagen "<el lugar>, empty, no people, <estilo>"`. Un decorado sirve para
   varias escenas (otro encuadre, otra luz no). Para que tenga espacio de verdad, ármalo POR PLANOS: el fondo lejano
   (cielo, pared del fondo), el plano medio (la casa, el taller) y lo de delante (una mesa, una valla, plantas) como
   piezas sueltas sobre verde con `--recorte`, cada una en su capa con su `profundidad` (0.1 el fondo, 0.4–0.6 el medio,
   0.8–1 lo de delante, con algo de `desenfoque`). Así la cámara 3D separa los planos y el personaje queda ENTRE ellos.
   Si ya tienes el decorado entero, `kit.py separar` lo parte en planos solo.
3. **Acciones**: si en una escena hace algo concreto (tallar, mirar el fuego, empujar una máquina), pide al personaje
   haciéndolo, sobre verde y con su imagen principal de referencia: `kit.py imagen "the same man as in the reference,
   <acción>, full body" --ref medios/ole-recorte.png --recorte`. Misma cara, otra pose.
4. **Utilería**: los objetos que se mueven o entran solos (un juguete, un ladrillo, humo), sobre verde con `--recorte`.
5. **Componer** cada escena: `python kit/kit.py componer <decorado> <personaje.png> --x 0.4 --pies 0.93 --alto 0.62
   [--gesto peso] [--planos 2]` pone al personaje en el suelo del decorado, con el color y la luz del decorado y su sombra,
   y te da el "momento" y las "capas" listos. Varía el plano entre escenas: entero (`--pies 0.92 --alto 0.6`), medio
   (`--pies 1.3 --alto 1.05`: cortado por la cintura, sin sombra) y, para un primer plano, pide un retrato suyo con --ref.
- **Que no se repita**: la misma pose del personaje en muchas escenas se ve pegada; cambia de acción, de plano o de lado
  (`armar` avisa si la misma silueta sale en muchas capas). Lo normal: imagen principal para 1–2 escenas y una acción
  distinta para cada escena importante.
- Las piezas son gratis (Nano Banana) pero tardan un minuto cada una: reutiliza decorados y acciones.

## Escenas vivas: de una imagen plana a una escena con la persona animada (cuando ya tienes la imagen entera)
`python kit/kit.py escena medios/img-x.jpg [--gesto peso] [--planos 2] [--zoom 1.15]` hace en una orden lo que un editor
haría a mano en After Effects:
1. recorta a la persona (o al sujeto principal) de la imagen,
2. consigue el escenario SIN ella: lo pide a Recorte editando la misma imagen (no gasta créditos; tarda un minuto) o, si
   no se puede, rellena el hueco (`--limpio otra.png` si ya tienes el escenario vacío; `--sin-flow` para no pedirlo),
3. parte el escenario en planos por distancia,
4. mira su esqueleto (marioneta),
y devuelve `"momento"` (la foto del escenario con su encuadre y cámara) y `"capas"` (los planos con su profundidad y la
persona con su gesto), calzados como en la imagen original. Cópialos a la receta con sus `desde`/`hasta`; puedes cambiar
la cámara (movimientos cortos), el gesto, una secuencia de gestos o añadir su entrada.
- El gesto por lo que hace: `peso` (por defecto: trabaja, mira, posa), `hablar` (cuenta algo a cámara), `asentir`,
  `ladear`, y con los brazos libres `senalar`, `saludar`, `explicar`.
- Úsalo con imágenes enteras que ya tengas (las del usuario, una foto de archivo). Para lo que vas a generar, mejor por
  piezas (arriba). Una sucesión de fotos con zoom se ve barata: `armar` avisa si el video es casi todo fotos planas.
- **La misma persona, la misma cara**: genera primero al protagonista (de frente, brazos algo separados) y pasa esa
  imagen con `--ref` en cada escena donde vuelva a salir ("the same man as in the reference"). Sin eso, cada imagen trae
  otra cara.

## Escena 2.5D (un paisaje por capas, con distancia)
En la referencia los escenarios no son una foto: son 4–5 recortes a distintas distancias (cielo, montañas, el lago con la
casa, la bandera, la persona). Cada uno entra a su momento y, cuando la cámara se mueve, lo cercano se desplaza más que lo
lejano. Así se arma:
1. **El fondo, lo más lejano** (el cielo con nubes, una pared): una `foto` a pantalla completa con su cámara. Para que se
   note la distancia la cámara TIENE que moverse: `"encuadre": {"zoom": 1.25, "cx": 0.45}` y `"camara": {"zoom": 1.35,
   "cx": 0.55}` (un paneo lento con un poco de acercamiento, en una dirección).
2. **Cada plano, por separado y sin fondo**: `kit.py imagen "montañas nevadas, solas" --recorte`, otra para la casa, la
   bandera y la persona (Nano Banana no gasta créditos). Pide cada pieza entera y sola, con el mismo estilo y la misma luz.
   Si solo tienes una foto del paisaje entero (en vertical, como el video), `python kit/kit.py separar <foto> --planos 3`
   la parte en planos por distancia (un modelo local de 99 MB que se baja una vez; rellena lo que queda detrás): devuelve
   `fondo` (úsalo como la `foto`, con `"encuadre": {"zoom": Z, "cx": 0.5, "cy": 0.5}` y su `camara`) y `planos`, cada uno
   un PNG para una capa en `x` 0.5, `y` 0.5, `ancho` Z × `ancho_capa` (los planos traen margen alrededor), `"entrada":
   "ninguna"` y la `profundidad` que trae. Mira `mapa` (claro = cerca) y los planos antes de usarlos: con dibujos o con
   niebla el modelo se equivoca; si un plano sale mal, mejor genera esa pieza por separado. Movimientos de cámara CORTOS
   (cx o cy no más de 0.08 por toma, zoom no más de 0.15): detrás de cada plano solo hay relleno. Puedes cortar a otro
   encuadre de la misma escena con otra `foto` del mismo `fondo`: las capas la siguen calzadas.
3. **Cada pieza como capa con `"profundidad"`** (0 a 1): sigue a la cámara de la foto de debajo; 0 se mueve pegada al fondo,
   1 (muy cerca) se mueve y crece 2,5 veces más. Una guía: montañas 0.1–0.2, una casa o un árbol a media distancia 0.4–0.5,
   la persona 0.4–0.6, algo en primer plano (una rama, una barandilla, hierba) 0.8–1 con `"desenfoque": 0.4`. Sin
   `profundidad`, la capa queda fija en la pantalla (logos, sellos, textos): no la pongas en esos.
4. **Que se arme ante los ojos**: cada pieza entra en su momento (la bandera `"entrada": "izquierda"`, la casa `"abajo"`, la
   persona con `"fundido"`), con unas décimas entre una y otra, y un «whoosh» suave en las que llegan de un lado. Anímalas
   (`"animar": "ondear"` la bandera, `"balanceo"` la persona). `"desenfoque"` (0 a 1) deja fuera de foco lo que está muy cerca.
```json
"momentos": [{ "tipo": "foto", "archivo": "medios/cielo.png", "desde": 4.0, "hasta": 7.5,
               "encuadre": { "zoom": 1.2, "cx": 0.42 }, "camara": { "zoom": 1.32, "cx": 0.58 } }],
"capas": [
  { "archivo": "medios/montanas-recorte.png", "desde": 4.0, "hasta": 7.5, "x": 0.5, "y": 0.62, "ancho": 1.0, "entrada": "fundido", "profundidad": 0.15 },
  { "archivo": "medios/casa-recorte.png", "desde": 4.3, "hasta": 7.5, "x": 0.25, "y": 0.8, "ancho": 0.45, "entrada": "abajo", "profundidad": 0.45 },
  { "archivo": "medios/bandera-recorte.png", "desde": 4.5, "hasta": 7.5, "x": 0.15, "y": 0.5, "ancho": 0.3, "entrada": "izquierda", "profundidad": 0.5, "animar": "ondear" },
  { "archivo": "medios/persona-recorte.png", "desde": 4.2, "hasta": 7.5, "x": 0.55, "y": 0.62, "ancho": 0.7, "entrada": "fundido", "profundidad": 0.6, "animar": "balanceo" }
]
```
- Lo que va después en `capas` se dibuja encima: de lo lejano a lo cercano.
- Una escena puede tener varias tomas: varias `foto` seguidas con la MISMA imagen de fondo y distinto encuadre o cámara.
  Las capas con profundidad siguen a cada una (en el corte se recolocan calzadas con el fondo y luego se mueven con su
  paralaje).
- Usa la escena 2.5D en los momentos clave (la presentación del protagonista, el lugar donde pasa todo), no en cada foto.
- En el editor llega igual: la foto con su paneo y cada pieza en «Encima» con su profundidad (el usuario la cambia).

### Cámara 3D (tomas, cámara en mano y profundidad de campo)
La cámara de la `foto` de fondo es la de toda la escena: las capas con `profundidad` la siguen según su distancia, así
que cada toma se ve en 3D. Elige la toma por lo que cuenta la frase:
- **Acercarse (dolly in)**: `"encuadre": {"zoom": 1.1}`, `"camara": {"zoom": 1.3}`: tensión, entrar en el tema.
- **Alejarse (dolly out)**: `"encuadre": {"zoom": 1.35}`, `"camara": {"zoom": 1.05}`: revelar el lugar, cerrar una idea.
- **Travelling**: el mismo zoom (1.25) y `cx` de 0.35 a 0.65: lo cercano pasa más rápido que lo lejano.
- **Grúa**: `cy` de 0.75 a 0.3 (sube de los pies al cielo) o al revés (baja hacia el protagonista).
- **Empuje a un detalle**: de zoom 1.05 a 1.4 hacia el punto (`cx`, `cy`) que importa.
- `"temblor": 0.3` en la foto: **cámara en mano** (un vaivén suave e irregular; 0.2–0.4 da atmósfera de documental, más
  marea). Lo cercano tiembla más. No en todas: en los momentos de tensión o de «reportaje».
- `"campo": 0.6, "foco": 0.55` en la foto: **profundidad de campo**. Lo que está a la profundidad del `foco` (0 el fondo, 1 lo
  más cercano) se ve nítido y lo demás se desenfoca según `campo` (0 a 1). Enfoca al protagonista (su `profundidad`): el
  fondo se va a bokeh y la escena gana distancia. Lo hace solo; no pongas además `desenfoque` en cada capa.
- Una toma por momento, lenta y en una dirección; cambia de toma con el corte, como un operador de cámara.
- **Nada tapa un texto**: una capa que se mueve (con su recorrido, su entrada o el paralaje de la cámara) puede acabar
  encima de una etiqueta o un título. `armar` lo mira cada 0,2 s y avisa: aparta uno de los dos o baja su profundidad.
- **Nunca un cuadro vacío**: una foto que es solo un fondo (una pared, un haz de luz, una sala oscura) necesita algo
  encima TODO el rato que se ve (un título, una pieza, una capa). `armar` avisa si queda vacía.

## Revisar, ubicar y cambiar (como un editor)
- `python kit/kit.py revisar salida/x.mp4 [--referencia entrada/ref.mp4]` → en `revision/`: `revisar-ritmo.jpg` (dos
  cuadros por segundo, una fila cada 5 s), `revisar-cortes.jpg` (7 cuadros seguidos en cada corte: el movimiento),
  `revisar-referencia.jpg` (tu video a la izquierda y la referencia a la derecha, en las mismas posiciones) y
  `revisar.md` (cortes por segundo frente a la referencia, plano más largo, tramos casi vacíos, destellos y la lista de
  lo que hay que mirar). Úsalo antes de entregar.
- `python kit/kit.py donde "la bandera"` → las piezas de la receta que nombra el usuario, con sus segundos y su cuadro
  del último render en `revision/donde-N.jpg`. Úsalo en cada cambio para ubicar de qué habla.
- **Render en paralelo**: `armar` dibuja varios cuadros a la vez (uno por núcleo libre, sin pasarse de la memoria) y va
  diciendo cuánto falta; al final dice cuánto tardó. No lances dos `armar` a la vez: se quitan los núcleos el uno al otro.
- **Render quirúrgico**: `armar` recuerda lo último que renderizó; si armas la receta cambiada a OTRO archivo de
  salida, solo vuelve a dibujar los segundos de las piezas que cambiaron y copia el resto de aquel video (dice cuántos
  cuadros dibujó). Si cambias algo de todo el video (tamaño, filtros, la letra de los subtítulos), lo hace entero.
  `--todo` lo fuerza entero.
- **No se gasta dos veces**: `kit.py imagen`/`clip` con el mismo pedido y las mismas referencias devuelven lo que ya se
  generó (`"reutilizado": true`); `--nuevo` pide otra versión. `kit.py voz` solo pide las frases nuevas o cambiadas
  (las demás se reutilizan); `--nueva` las pide todas otra vez (si el usuario cambió de voz).

## Filtros de todo el video
`"filtros": {"grano": 0.3, "polvo": 0.2, "trama": 0.4, "vineta": 0.5, "parpadeo": 0.1}` (0 a 1): grano de película, polvo
y rayas, trama de puntos de imprenta, viñeta y parpadeo de proyector. Van encima de la escena y de las capas y debajo de los
subtítulos; en el editor quedan como sus «Filtros» y el usuario los sube, los baja o los quita. Un documental de archivo:
grano 0.3, polvo 0.25, viñeta 0.5; un aire de revista: trama 0.4. NUNCA los quemes con un script aparte.

## La música (si el usuario no trae)
Recorte trae una biblioteca de música libre (CC0: sirve para cualquier video, sin dar crédito ni pagar). No sintetices
música propia salvo que no haya otra cosa:
- `python kit/kit.py musica [--animo tensa|epica|emotiva|alegre|calma|misterio] [--duracion 50]` → las pistas con su
  estilo (clásica o moderna) y su duración.
- `python kit/kit.py musica --usar <archivo>` → la copia a `medios/` y te da su ruta para `"musica": {"archivo": …}`.
- Clásica para documentales, historia y relatos; moderna para promociones, tecnología y redes. Pon cada cambio de escena
  en un golpe de la música (`kit.py golpes <la pista>`).

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
- `python kit/kit.py imagen "descripción" --recorte` → la pide sola sobre verde croma y le quita el fondo: además de `archivo`
  devuelve `recorte`, un PNG con transparencia para usarlo como capa (una persona, un avión, una bandera, un cohete). Así se
  arman las escenas por capas con paralaje: fondo como foto y cada pieza recortada encima, entrando y moviéndose.
- **Animar una imagen recortada SIN gastar créditos** (como el «Puppet» de After Effects): en la capa,
  `"animar": "respirar"` (una persona quieta), `"balanceo"` (de pie, se mece desde los pies), `"ondear"` (una bandera o
  tela, desde el asta a la izquierda), `"flotar"` (sube y baja) o `"humo"` (humo, nubes, fuego); o
  `"animar": {"tipo": "ondear", "fuerza": 0.7}` (0 a 1; 0.5 es natural). Va en bucle y se combina con su recorrido (`fin`).
  Úsalo en casi todas las piezas recortadas: la bandera ondea, el personaje respira o se balancea, el humo se agita. En el
  editor llega animada (el usuario cambia el movimiento o la deja quieta). `python kit/kit.py animar <png> --tipo ondear`
  la deja como WebM si la necesitas suelta.
- **Marioneta (una persona que se mueve por huesos, SIN créditos)**: como el «Puppet» o Duik de After Effects. Un modelo
  local (134 MB, se baja una vez) encuentra el esqueleto (cabeza, cuello, hombros, codos, muñecas, manos, caderas,
  rodillas) y la figura se deforma por huesos. En la capa, `"animar"` con un gesto:
  `"hablar"` (cabeza y manos al contar algo: el de la narración), `"asentir"`, `"ladear"` (la cabeza: duda, escucha),
  `"peso"` (pasa el peso de un pie al otro), y con los brazos separados del cuerpo `"saludar"`, `"senalar"` (a un lado) y
  `"explicar"` (abre los brazos al hablar). `{"tipo": "senalar", "lado": "derecha", "fuerza": 0.6}` elige el brazo (en
  pantalla) y la fuerza (0 a 1).
  1. Genera al personaje PARA la marioneta: `kit.py imagen "… de frente, cuerpo entero, los brazos relajados y separados
     del cuerpo (las manos a un palmo de las caderas), piernas algo abiertas, fondo liso" --recorte`. Con los brazos
     cruzados o pegados solo puede mover la cabeza, el tronco y el peso.
  2. `python kit/kit.py esqueleto medios/persona-recorte.png` → `dibujo` (el esqueleto pintado encima: MÍRALO), `puntos` y
     `gestos` (los que puede hacer). Si un punto está mal, corrígelo en la capa: `"animar": {"tipo": "hablar", "puntos":
     {"codo_d": [0.2, 0.41]}}` (en fracción de la imagen; los nombres son los de `puntos`).
  3. La capa animada es más ancha que la imagen (deja sitio a los brazos): el kit lo ajusta solo; tú pon el `ancho` de la
     persona como siempre.
  4. **Varios gestos seguidos, en UNA capa** (nunca cortes la capa para cambiar de gesto: parpadea):
     `"animar": [{"tipo": "hablar", "hasta": 1.2}, {"tipo": "senalar", "lado": "derecha"}]` (`hasta` en segundos desde que
     aparece la capa; el último sigue hasta el final). Pasa de un gesto al otro suave (0,4 s) y el brazo sube y se queda.
  5. Que el gesto quepa: con `senalar` o `saludar` hacia un lado, deja sitio a ese lado (la persona más al centro o el
     gesto hacia el otro lado); `armar` avisa si el brazo sale del cuadro.
  6. Los textos, lejos de sus brazos: con `saludar`, `senalar` o `explicar`, `armar` avisa si una palabra o un título cae
     donde se mueven (el brazo lo taparía). Ponlos por encima de la cabeza o a un lado, fuera de su alcance.
  Límites: la cabeza no gira de perfil ni los dedos se articulan, y la marioneta no mueve las piernas: para caminar,
  correr, saltar o sentarse usa el **muñeco por piezas** (abajo). Combina la marioneta con la escena 2.5D: la persona
  como capa con `profundidad` y su gesto.
- **Muñeco por piezas (el personaje ENTERO se mueve, SIN créditos)**: como un muñeco articulado o el «cut-out» de los
  animadores. El kit corta al personaje en piezas rígidas (cabeza, torso, brazos, antebrazos, manos, muslos, piernas y
  pies), cada una gira sobre su bisagra sin estirarse, y cada unión lleva una tapa redonda (al girar no se abre un hueco).
  El cuerpo sube o baja solo para que los pies sigan en el suelo. Es lo mejor para juguetes (LEGO, figuras), dibujos y
  personajes de cuerpo entero; la marioneta suave queda mejor para una persona real hablando de medio cuerpo.
  En la capa: `"piezas": true` y `"animar"` con cualquier gesto de la marioneta o uno de piernas: `"caminar"`,
  `"correr"`, `"saltar"` (se agacha, salta con los brazos arriba y cae), `"agacharse"`, `"sentarse"` (pon la silla o
  el banco en el decorado, detrás), `"patear"` y `"bailar"`. Los de piernas ya usan las piezas solos.
  1. **Dos imágenes del mismo personaje** (la segunda con la primera de `--ref`, misma cara y ropa):
     - DE FRENTE, para hablar, saludar, saltar o bailar: `kit.py imagen "<personaje>, full body, standing, facing camera,
       arms slightly away from the body, legs slightly apart, feet visible, plain background" --recorte`.
     - DE PERFIL, para caminar, correr, patear o sentarse (de frente, caminar apenas se nota): `kit.py imagen "the same
       <personaje> as in the reference, full body, side view facing right, standing straight, arms slightly away from the
       body, both legs and feet visible" --ref medios/<de-frente>.png --recorte`. Si va hacia la izquierda, `"espejo"` no
       hace falta: pide `facing left`.
     Cuerpo entero SIEMPRE (con los pies dentro de la imagen): sin pies no puede mover las piernas.
  2. `python kit/kit.py muneco medios/<personaje>.png` → `dibujo` (cada pieza en un color, con sus bisagras en círculos:
     MÍRALO), `vista` (frente o perfil), `mira_a` y `gestos`. Si una pieza quedó mal (un brazo cortado por el codo
     equivocado), corrige sus puntos como en la marioneta: `"animar": {"tipo": "caminar", "puntos": {"rodilla_d": [0.4,
     0.7]}}`. Con un juguete o un dibujo el modelo puede fallar: si `muneco` no encuentra las piernas o los puntos están
     fuera de sitio, dáselos TODOS en `puntos` (nariz, hombro_i/d, codo_i/d, muneca_i/d, mano_i/d, cadera_i/d,
     rodilla_i/d, tobillo_i/d, punta_i/d), mirando la imagen.
  3. **Que avance**: caminar y correr son en el sitio (como en una cinta); para que cruce la escena, mueve la capa con
     `"fin": {"x": …}` en la dirección en que mira. Velocidad creíble: caminando, cruza el cuadro en 5–7 s; corriendo, en
     2–3 s. Al revés (mirando a un lado y avanzando al otro) parece que patina.
     Con `componer … --gesto caminar` la capa ya sale como muñeco; si le pones `fin`, ponle el MISMO desplazamiento en
     x a su sombra (la capa anterior), o la sombra se queda atrás.
  4. Secuencias en UNA capa, como la marioneta: `"animar": [{"tipo": "caminar", "hasta": 3}, {"tipo": "hablar"}]`
     (llega caminando y se pone a hablar; para que se pare donde habla, que el `fin` de la capa llegue ahí y la capa
     siguiente empiece en ese sitio). Un personaje de perfil que habla gira la cabeza poco: para hablarle a la cámara,
     cambia a la imagen de frente en el corte siguiente.
  5. Escena 2.5D: el muñeco va como una capa más, con su `profundidad`, delante del decorado y detrás de lo que tenga
     delante (una mesa, una valla).
- **Un personaje que se mueve de verdad** (gesticula, camina; solo si el usuario acepta gastar créditos): `python kit/kit.py clip
  "descripción del movimiento" --ref medios/personaje.png --recorte` pide a Flow un clip de 8 s sobre verde croma a partir
  de su imagen y le quita el verde: devuelve `recorte`, un WebM con transparencia. Úsalo como cualquier capa
  (`"capas": [{"archivo": "medios/clip-…-recorte.webm", …}]`, con su recorrido y su entrada); si la capa dura más, el clip
  vuelve a empezar. GASTA créditos (como cualquier clip): solo para el personaje principal o un momento clave.
- `python kit/kit.py recortar-video <clip>` quita el verde de un clip que ya tengas sobre croma.
- `python kit/kit.py recortar <imagen>` quita el fondo de una imagen que ya tengas: si es liso (verde, blanco, un color), al
  momento; si no (una sala, la calle), con un modelo que encuentra al sujeto principal (la primera vez se baja, 178 MB).
  Mira el resultado antes de usarlo: si se coló algo del fondo, pide la pieza con `--recorte`.
- `python kit/kit.py clip "descripción" [--ref …]` → `{"archivo": "medios/clip-….mp4"}` (varios minutos; GASTA créditos: solo los del guion gráfico que aprobó el usuario).
- Describe bien: sujeto, acción, encuadre (vertical u horizontal ya va solo), luz y estilo. Sin texto escrito dentro de la imagen:
  los rótulos los pones tú en la receta (así el usuario los edita).
- `--ref` usa fotos del usuario como referencia (que se parezca a su producto, su local, su cara); hasta 3.
- Pide varias a la vez con `&` o en paralelo si las necesitas todas: Recorte las reparte entre sus cuentas.
- Úsalas en la receta como cualquier archivo: `{"tipo": "foto", "archivo": "medios/img-….png", …}` o `{"tipo": "video", "archivo": "medios/clip-….mp4", …}`.
- Si responde que el usuario no eligió generar, o falla, sigue con lo que tienes y dilo en el resumen.

## Videos hechos con código (plantillas 3D, HyperFrames, Three.js)
Cuando el video no sale de una receta (el «Explicativo 3D», por ejemplo), el kit igual pone las piezas finas:
- `python kit/kit.py ritmo <voz.wav> --palabras <transcripción.json>`: la voz grabada con ritmo de video. Deja las
  pausas en 0,35 s (0,5 s tras un punto) sin tocar las palabras y, solo si habla muy lento, la acelera un poco sin
  cambiar el tono. Deja `voz/voz-ritmo.wav` y `voz/voz-ritmo-palabras.json` (los tiempos nuevos).
- `python kit/kit.py palabras <json de palabras> --guion guion.txt [--salida plantilla/palabras.json]`: cada palabra
  con su `desde`/`hasta` y las `frases` (texto, desde, hasta y qué palabras abarca). Las palabras son las del guion
  (bien escritas); los tiempos, los de la voz. Lo que el guion tiene y no se oye se avisa y no entra.
- `python kit/kit.py modelos [--buscar diente]`: los modelos 3D guardados (lee `modelos-3d/LEEME.md`).
- `python kit/kit.py mezclar mezcla.json`: el sonido sobre el video ya renderizado (la imagen no se toca):

      {"video": "salida/render.mp4", "salida": "salida/final.mp4",
       "voz": {"archivo": "voz/voz-ritmo.wav", "en": 0},
       "musica": {"archivo": "medios/<pista>.mp3", "volumen": 0.18},
       "sonidos": [{"sonido": "pop", "en": 2.4, "volumen": 0.5}, {"sonido": "whoosh", "en": 9.8, "volumen": 0.4}],
       "audio_del_video": false}

  La música baja sola mientras habla la voz y se funde al final; los efectos son los de `kit.py sonidos` (o
  `"archivo"`). Pon cada efecto en el segundo en que entra lo que suena (el `desde` de su palabra en palabras.json).
