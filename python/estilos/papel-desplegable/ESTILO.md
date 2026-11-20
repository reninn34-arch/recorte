---
nombre: Papel desplegable
grupo: 3d
etiqueta: 3D
para: Capas de papel que se levantan como un libro pop-up.
descripcion: Escenas de papel recortado en capas que se levantan y se pliegan como un libro desplegable. Bordes con grosor, sombras cortas entre capas y colores de cartulina.
vabien: historias, recorridos, explicar un proceso, marcas cálidas
colores: #f1e9db,#e4604f,#3f8fcf
---

# Papel desplegable

Un libro pop-up: cada escena son capas de papel recortado que se levantan desde una página, en 3D con HyperFrames y
Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo). Cambia la historia, los objetos y
  las palabras por los del usuario.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- **Material**: cartulina mate. Cada pieza es una forma plana (`ShapeGeometry` extruida 1-2 mm con `ExtrudeGeometry`,
  sin biselado) con `MeshStandardMaterial` `roughness` 1, y una textura de fibra de papel muy suave en el `map`.
- **Capas**: 4 a 7 planos a distintas profundidades, como un teatrito: fondo, horizonte, edificios o árboles, el
  protagonista y algún detalle delante. Las piezas recortadas tienen siluetas simples con bordes un poco irregulares.
- **Colores**: cartulina (crema, terracota, mostaza, azul medio, verde salvia); un tono por capa, oscureciendo hacia
  atrás para dar profundidad. El papel blanco del borde se ve en el canto.
- **Luz**: una direccional cálida de lado y arriba, que deja **sombras cortas y nítidas** entre capas (lo que da la
  sensación de papel), y una ambiental suave.
- **Cámara**: de frente o un poco desde arriba, como mirando un libro abierto. Se acerca a la escena o la recorre de
  lado despacio.

## Cómo se mueve
- Las piezas se **levantan girando sobre su borde de abajo**, como al abrir la página (rotación X de -90° a 0° con un
  rebote pequeño al final), de atrás hacia adelante.
- Entre escenas, la página **se da vuelta** (una rotación grande sobre el lomo) o las capas se pliegan hacia atrás.
- Detalles que se deslizan por ranuras (un sol que sube, un auto que cruza) como pestañas de papel.

## El producto o el tema
- El protagonista también es de papel: su silueta recortada con sus colores. Las fotos del usuario van como
  recortes pegados (con un borde blanco de tijera) o como una postal dentro de la escena.

## Texto
- Letras recortadas de papel (Bricolage Grotesque, Archivo Black o una serif gruesa como Fraunces), que se levantan
  igual que las piezas, o escritas sobre una tira de papel. Sin sombras fuera de la que hace la luz.

## Sonido
- Papel que se dobla, se desliza y se da vuelta en cada movimiento, y una música suave de cuerdas o piano.

## Evita
- Brillos, degradados digitales y sombras difusas grandes: el papel tiene sombras cortas.
- Muchas capas pequeñas a la vez: mejor pocas piezas grandes y claras.
