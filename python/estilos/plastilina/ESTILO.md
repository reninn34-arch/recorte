---
nombre: Plastilina
orden: 1
grupo: 3d
etiqueta: 3D
para: Formas blanditas, huellas de dedos y colores pastel.
descripcion: Todo hecho de plastilina: formas redondeadas y mate, con huellas de dedos, colores pastel y luz suave de estudio. Las cosas entran aplastándose y rebotan.
vabien: productos, infantil, comida, explicar algo con cariño
colores: #f3d6c6,#f0a94a,#5da7e0
---

# Plastilina

Un mundo de plastilina hecho a mano, como una animación cuadro a cuadro de estudio pequeño. Se programa en 3D con
HyperFrames y Three.js (o CSS 3D si no alcanza).

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Sus piezas generales (la superficie, el material, amasar, el set y el reloj del stop-motion) están en
  `material.js`: úsalas tal cual. Cambia la historia, los objetos y las palabras por los del usuario.
- Si hay un personaje, mira `personaje/`: el kit de personajes del motor vestido de plastilina (Lupe camina, saluda,
  habla con su voz, señala, se sorprende y festeja).
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- **Material**: nada brilla. `MeshStandardMaterial` con `roughness` 0.85–0.95 y `metalness` 0. Encima, una textura de
  ruido fino (canvas generado) en el `bumpMap`, con `bumpScale` bajo, para que se vean las huellas de los dedos.
- **Formas**: todo redondeado, sin aristas: esferas apenas aplastadas, cápsulas, cajas con bordes muy redondos
  (`RoundedBoxGeometry` o una caja con los vértices desplazados), y una pequeña irregularidad en cada una (desplaza los
  vértices con un ruido suave) para que no parezcan de máquina.
- **Colores**: pastel y saturados a la vez (durazno, menta, cielo, mantequilla, rosa chicle). Tres o cuatro por escena.
  El fondo es una pared y un suelo de plastilina del mismo tono, con una curva entre los dos (un ciclorama).
- **Luz**: una luz principal suave y grande arriba a un lado, un relleno cálido del otro y sombras blandas en el suelo
  (sombras activadas, `PCFSoftShadowMap`). Nada de luces de colores ni brillos.
- **Cámara**: lente media (35–50 mm), poca profundidad de campo si se puede. Se mueve poco: un acercamiento lento o un
  giro corto alrededor del protagonista.

## Cómo se mueve
- Lo que entra cae o salta y **se aplasta al tocar el suelo** (escala Y 0.75 y X/Z 1.15 durante 2-3 cuadros) y rebota
  una o dos veces. Entradas escalonadas, 0,15–0,25 s entre una y otra.
- Para dar el toque de animación a mano, el movimiento puede ir a 12 cuadros por segundo (redondea el tiempo a pasos de
  1/12 s) mientras el video va a 30.
- Los objetos respiran: un latido de escala muy leve (±2 %) cuando están quietos.

## El producto o el tema
- El protagonista es el producto o el objeto del tema, modelado en plastilina con su forma reconocible y sus colores de
  marca. Si el usuario trajo fotos, van como tarjetitas de plastilina (la foto dentro de un marco blandito) o como
  textura sobre una forma simple; nunca se deforma su logo.
- Antes de modelar, busca en la biblioteca de modelos 3D; lo que hagas nuevo, guárdalo ahí.

## Texto
- Letras gruesas y redondas (Fredoka, Baloo 2 o Nunito Black), en un color oscuro del mismo tono o en blanco cálido.
- Pueden ser 3D de plastilina (`TextGeometry` con biselado grande) para el título, o planas encima para lo demás.
- Entran con el mismo rebote que los objetos. Sin sombra dura ni contorno.

## Sonido
- Golpecitos blandos (pop, plop, squish) en cada aterrizaje y una música alegre y ligera (ukelele, marimba, palmas).

## Evita
- Brillos, reflejos, metales, vidrio y texturas fotográficas: rompen la plastilina.
- Movimientos rápidos de cámara y cortes bruscos.
