---
nombre: Escenario con foco
grupo: 3d
etiqueta: 3D
para: Un teatrito de noche con la historia bajo dos focos.
descripcion: Un pequeño teatro de terciopelo rojo, de noche, con tablas gastadas y haces de luz entre el humo. La historia se cuenta con recortes de cartón sobre palitos que entran y salen de escena.
vabien: historias, anuncios de lanzamiento, efemérides, cuentos, presentaciones
colores: #120607,#b3122a,#f6c56b
---

# Escenario con foco

Un teatrito de noche con la historia bajo dos focos. En 3D con HyperFrames y Three.js.

## Cómo se hace: con el motor 3D de Recorte y la escena de referencia
Este estilo trae una **escena de referencia completa** en esta misma carpeta: `escena.js` (la imagen) y `guion.js`
(los tiempos y el sonido). Está hecha con el motor 3D de Recorte (`motor3d/`, lee `motor3d/LEEME.md` entero: ahí
está el método paso a paso, el `index.html` de la composición y cómo sacar el sonido).
- Léela entera antes de planear. De ella copia el ASPECTO: materiales, luz, cámara, acabado (`ACABADO`) y la forma de
  moverse. Reutiliza sus piezas generales (las que están arriba en el archivo): `equipoDeLuces` (lámparas con haz
  visible que se corta donde toca algo, y el polvo), `carton` (recortes de cartón grueso pintado), `colgado` (bajan
  de varas), `enRanura` (entran por el piso), el teatro y el atril. Cambia la historia, los recortes y los carteles
  por los del usuario.
- Cuenta como un teatro: un cuadro por idea, y el cambio de cuadro se hace a la vista (bajan y suben decorados,
  entran recortes, se tira la tarjeta del atril y cambia el color de la luz), nunca con un corte. El seguidor dice
  dónde mirar; el color de las luces dice dónde y cuándo estamos; la tarjeta del atril nombra el cuadro con pocas
  palabras.
- Si algo de esta guía choca con la escena de referencia, manda la referencia: es la que se ve bien.

## Cómo se ve
- El escenario: telón de terciopelo carmesí con pliegues pesados, bambalinas oscuras, tablas de madera con marcas.
- La luz: dos o tres focos cálidos desde arriba (`SpotLight` con cono marcado y niebla/`FogExp2` para que se vea el haz), el resto casi negro.
- Los personajes y objetos: recortes planos de cartón pintado con canto visible, montados en palitos o colgados de hilos.
- Cámara: desde la platea, a la altura de las primeras filas; siluetas de butacas en el borde de abajo.

## Cómo se mueve
- El telón se abre al empezar y se cierra al final.
- Los recortes entran desde los lados o bajan colgados, con un leve vaivén.
- Los focos siguen al protagonista; al cambiar de escena se apaga uno y se enciende otro.

## El producto o el tema
- El producto o el tema es el protagonista bajo el foco principal; las fotos del usuario, como cuadros pintados en el decorado.

## Texto
- Letras de cartel de teatro (Abril Fatface, Playfair Display) en un rótulo colgado o pintado sobre el telón.

## Sonido
- Murmullo de público al inicio, el roce del telón, música de caja de música o piano de época.

## Evita
- Luz pareja por todo el escenario: lo que lo hace mágico es la oscuridad alrededor de los focos.
