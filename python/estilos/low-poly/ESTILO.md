---
nombre: Low poly
grupo: 3d
etiqueta: 3D
para: Un mundo de caras planas, como piedra tallada.
descripcion: Todo hecho de pocas caras planas con un solo tono por cara: montañas, árboles y objetos facetados, con luz de atardecer que marca cada arista. Limpio, geométrico y amable.
vabien: viajes, naturaleza, juegos, tecnología, explicaciones
colores: #1d2340,#f28b50,#5fc7b0
---

# Low poly

Un mundo de caras planas, como piedra tallada. En 3D con HyperFrames y Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo). Cambia la historia, los objetos y
  las palabras por los del usuario.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- Geometría con pocas caras (`flatShading: true`, `IcosahedronGeometry` de detalle bajo, conos de 5-7 lados).
- Paleta corta de 5-6 colores, sin texturas; la luz direccional de lado hace que cada cara tenga su tono.
- Fondo en degradado de cielo y una niebla suave que aclara lo lejano.
- Cámara: vista de tres cuartos, un poco alta, que se desliza lenta sobre el paisaje.

## Cómo se mueve
- Las piezas aparecen creciendo desde el suelo con un pequeño rebote.
- Agua y nubes se mueven moviendo sus vértices, despacio.

## El producto o el tema
- El producto o el tema, rehecho en low poly en el centro; las fotos del usuario en un cartel facetado.

## Texto
- Letras geométricas de palo seco (Montserrat, Poppins en negrita), planas o extruidas con pocas caras.

## Sonido
- Música ambiental suave con marimba o sintetizador limpio; pequeños "pop" al aparecer piezas.

## Evita
- Superficies lisas y redondas, o texturas fotográficas: rompen el estilo.
