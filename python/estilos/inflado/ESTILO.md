---
nombre: Inflado
orden: 6
grupo: 3d
etiqueta: 3D
para: Todo como globo brillante, con rebotes.
descripcion: Objetos y letras inflados como globos de vinilo brillante, con colores vivos, que entran inflándose, rebotan y se aprietan entre sí. Divertido y llamativo.
vabien: ofertas, cumpleaños, marcas jóvenes, redes sociales, lanzamientos alegres
colores: #ffd7e8,#ff5c9d,#4aa8f0
---

# Inflado

Todo parece un globo de vinilo inflado: brillante, gordito y elástico. En 3D con HyperFrames y Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo). Cambia la historia, los objetos y
  las palabras por los del usuario.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- **Material**: plástico brillante: `MeshPhysicalMaterial` con `roughness` 0.15–0.25, `clearcoat` 1 y
  `clearcoatRoughness` bajo, colores saturados. Un entorno (`RoomEnvironment`) para los reflejos blancos grandes.
- **Formas**: todo hinchado: letras y objetos con biselado enorme y redondo (`TextGeometry` con `bevelSize` grande,
  o geometrías infladas desplazando los vértices hacia afuera por su normal), con pliegues suaves donde se juntan.
- **Colores**: rosa chicle, celeste, amarillo, lila o los de la marca, muy vivos. Fondo de un color pastel liso o con
  un degradado suave.
- **Luz**: principal grande y blanca arriba, que deja un reflejo ancho y claro en cada forma, y sombras suaves.
- **Cámara**: frontal, cerca; se mueve con pequeños empujones que siguen a los rebotes.

## Cómo se mueve
- Las cosas **se inflan** al entrar (escala de 0 a 1.15 con un ease elástico y vuelta a 1) o caen y rebotan
  aplastándose. Pequeñas sacudidas de gelatina al chocar.
- Se aprietan entre sí: al llegar una nueva, las demás se corren un poco y se deforman.
- Al salir pueden desinflarse o salir volando como un globo que se suelta.

## El producto o el tema
- El producto o el logo inflado, con su forma reconocible. Las fotos del usuario van en un marco inflado redondo, como
  un flotador.

## Texto
- Letras gordas y redondas (Rubik Bubbles, Fredoka o Baloo 2), mejor en 3D infladas para el título. Lo demás, plano
  en un tono oscuro del color de fondo. Sin contornos duros.

## Sonido
- Inflar, pops y chirridos de globo en cada entrada, y una música pop alegre con golpes marcados.

## Evita
- Materiales mate o metálicos: todo es vinilo brillante.
- Movimientos rígidos o lineales: todo rebota.
