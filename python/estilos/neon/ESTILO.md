---
nombre: Neón
orden: 4
grupo: 3d
etiqueta: 3D
para: Tubos de luz que se encienden en un cuarto oscuro.
descripcion: Letreros y siluetas de tubos de neón que se encienden con parpadeo en una pared oscura, con su resplandor y su reflejo en el suelo mojado. Nocturno y llamativo.
vabien: bares, eventos, música, ofertas, marcas jóvenes
colores: #0d0816,#ff4fd8,#3fe0ff
---

# Neón

Letreros de neón en una pared oscura, de noche. En 3D con HyperFrames y Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo). Cambia la historia, los objetos y
  las palabras por los del usuario.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- **Los tubos**: el objeto y el texto dibujados con un trazo continuo de tubo (`TubeGeometry` sobre una curva, radio
  pequeño y parejo), con `MeshBasicMaterial` o emisivo fuerte del color del neón.
- **El resplandor**: lo que lo vuelve neón. Bloom (`UnrealBloomPass`) con fuerza alta y radio medio; si no alcanza,
  una copia del trazo más gruesa, borrosa y transparente detrás.
- **La pared**: ladrillo o cemento oscuro casi negro, que el neón ilumina de su color (luces puntuales del mismo color
  cerca de cada letrero). Suelo con reflejo, como mojado.
- **Colores**: dos o tres neones (rosa, celeste, amarillo o verde ácido) sobre negro azulado. Los soportes metálicos y
  los cables del letrero, apenas visibles.
- **Cámara**: de frente al letrero, con un desplazamiento lento de lado para que cambie el reflejo; o recorre varios
  letreros por la pared.

## Cómo se mueve
- **Se encienden con parpadeo**: 2-4 destellos irregulares (encendido-apagado de 1-3 cuadros) y luego firmes. Una
  letra puede quedar fallando de vez en cuando.
- Los trazos también pueden **dibujarse** como si la luz recorriera el tubo.
- Al cambiar de idea, unos se apagan y otros se encienden; nunca cortes de imagen bruscos.

## El producto o el tema
- La silueta del producto o del logo hecha con tubo, al lado del texto. Las fotos del usuario van en un marco de neón
  o como un cartel iluminado por el neón (con su color reflejado).

## Texto
- Letras de trazo continuo, como escritas a mano (Pacifico, Yellowtail o una de palo seco redonda como Comfortaa para
  lo serio), hechas con el mismo tubo. Lo secundario, plano y blanco tenue.

## Sonido
- El zumbido eléctrico y el clic de encendido en cada letrero, y una música synthwave o house suave.

## Evita
- Fondo claro o mucha luz general: el neón solo luce en la oscuridad.
- Más de tres colores de neón a la vez.
