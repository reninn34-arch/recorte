---
nombre: Diorama miniatura
orden: 3
grupo: 3d
etiqueta: 3D
para: Un mundo chiquito visto desde arriba, con el fondo desenfocado.
descripcion: Una maqueta en miniatura sobre una base, vista desde arriba en diagonal, con el fondo y el frente desenfocados como una foto macro. Todo parece de juguete y muy detallado.
vabien: negocios locales, recorridos, ciudades, procesos con varios pasos
colores: #cfe6c4,#c8553f,#f2e3c4
---

# Diorama miniatura

Una maqueta de juguete sobre una base (un cuadrado o un círculo de tierra), como las de un escaparate, hecha en 3D con
HyperFrames y Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo: la base de tierra, `caja`, `casa`, `arbol`,
  `persona`, `farol` y `crecer`). Cambia la historia, los objetos y
  las palabras por los del usuario.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- **La base**: una losa con canto visible (tierra, pasto o madera) que flota sobre un fondo liso. Todo lo demás vive
  encima de ella.
- **Formas**: casitas, árboles, personas y vehículos pequeños y simples (cajas, conos y cilindros redondeados), con
  colores vivos y un poco de brillo de plástico pintado (`roughness` 0.5–0.6).
- **Desenfoque de miniatura**: el truco que vende el tamaño. Profundidad de campo fuerte (`BokehPass` o un desenfoque
  por profundidad) con una franja nítida en el medio, o, si no alcanza, desenfoca arriba y abajo del cuadro.
- **Luz**: sol cálido de media tarde con sombras nítidas y cielo claro como ambiental. Puede pasar a noche con
  ventanitas encendidas para un giro.
- **Cámara**: desde arriba en diagonal (45-60°), lente larga (60–85 mm) para aplanar un poco. Gira despacio alrededor
  de la base o se acerca a un rincón.

## Cómo se mueve
- Las piezas **crecen desde el suelo** con un rebote (escala 0 → 1.1 → 1) una tras otra, o caen desde arriba como
  piezas de juguete.
- La vida pequeña: un auto que da la vuelta, una persona que camina, humo de una chimenea, árboles que se mecen.
- Para cambiar de escena, la cámara se va a otra base que está al lado (todo es un mismo mundo de bases).

## El producto o el tema
- El negocio o el tema es el centro de la maqueta (la tienda, la clínica, la fábrica) con su letrero y sus colores.
  Las fotos del usuario van como cartelitos o pantallas dentro de la maqueta. El producto, en grande al lado de la
  maqueta, se ve gigante (un buen recurso de humor).

## Texto
- Plano y limpio encima (Inter Tight, Manrope o DM Sans en negrita), arriba o abajo, sobre la zona desenfocada. O como
  letreros dentro de la maqueta.

## Sonido
- Ambiente de ciudad o de campo chiquito (pajaritos, campanita, autos lejos) y una música ligera de juguete.

## Evita
- Cámara a la altura de los ojos o lentes muy abiertas: se pierde la miniatura.
- Texturas fotográficas en las piezas: todo es de maqueta pintada.
