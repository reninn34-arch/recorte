# Estilos de Recorte

Cada carpeta es un estilo de la sección «Estilos» de la app: el usuario lo añade y le sale como tarjeta debajo de la caja.

- `ESTILO.md`: arriba, entre `---`, su ficha (lo que ve el usuario); debajo, la guía que sigue el agente.
  - `nombre`, `grupo` (`3d`, `vender`, `ensenar`, `contar` o `inspirar`), `etiqueta` (lo que sale en la esquina de la
    tarjeta), `para` (una línea), `descripcion` (dos o tres frases), `vabien` (con qué temas encaja), `colores` (tres,
    separados por comas: el fondo y los dos tonos de la vista previa cuando no hay video).
- `escena.js` y `guion.js`: la escena de referencia hecha con el motor 3D (`python/motor3d/`). Solo se publican los
  estilos que la tienen: la prueba de estilos falla si falta.
- `vista.mp4` y `vista.jpg`: la vista previa (4:3 como las tarjetas, sin sonido), sacada de la escena con
  `node scripts/motor3d.mjs vista <id>`.

Todo esto es de Recorte, escrito desde cero. Los estilos que el usuario crea se guardan igual en
`<datos de Recorte>/estilos-catalogo/` y lo aprendido de cada uno en `<datos de Recorte>/habilidades/estilo-<id>/`.
