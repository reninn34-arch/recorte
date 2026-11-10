/**
 * Tipos de video (tarjetas de tema). Cada tipo es una guía editorial que Recorte
 * inyecta en el prompt del agente: estructura, ritmo y cierre cambian según lo que
 * el usuario quiere contar. Catálogo propio de Recorte — el concepto de «estilos
 * como tarjetas» viene de la referencia del fundador, el contenido es nuestro.
 */

export interface EstiloVideo {
  id: string
  nombre: string
  icono: string
  /** Lo que ve el usuario en la tarjeta. */
  descripcion: string
  /** La dirección editorial que recibe el agente. */
  guia: string
  /** Para qué sirve: así se agrupan las tarjetas en «Crear con IA». */
  grupo: GrupoEstilo
  /**
   * Un estilo visual propio que se guarda la primera vez que sale bien y se reutiliza en los
   * siguientes videos (la carpeta `plantilla/` del agente): todos se ven igual y gastan menos.
   */
  plantilla?: boolean
  /** Todo se hace con código (sin imágenes ni clips generados): la caja los apaga al elegirla. */
  sinGenerados?: boolean
}

export type GrupoEstilo = 'libre' | 'ensenar' | 'vender' | 'contar' | 'inspirar'

export const GRUPOS: { id: Exclude<GrupoEstilo, 'libre'>; nombre: string }[] = [
  { id: 'ensenar', nombre: 'Enseñar' },
  { id: 'vender', nombre: 'Vender' },
  { id: 'contar', nombre: 'Contar' },
  { id: 'inspirar', nombre: 'Inspirar' }
]

export const ESTILOS: EstiloVideo[] = [
  {
    id: 'libre',
    grupo: 'libre',
    nombre: 'Libre',
    icono: 'sparkles',
    descripcion: 'El editor decide la estructura según lo que le pidas.',
    guia: `No hay molde: decide la estructura según la petición. Elige el ritmo que el tema pida y una sola idea fuerte por escena.`
  },
  {
    id: 'leccion',
    grupo: 'ensenar',
    nombre: 'Clase o tutorial',
    icono: 'film',
    descripcion: 'Enseñar algo: pasos, errores comunes, cómo se hace.',
    guia: `Estructura de enseñanza:
- Abre con la promesa ("esto vas a aprender") en el primer segundo, no con presentaciones.
- Numera los pasos o errores con titulares grandes; un punto por escena.
- Si hay videos del usuario, cada tramo enseña UN punto, con su titular encima.
- Cierra con la idea que debe recordar y la marca.`
  },
  {
    id: 'explicativo3d',
    grupo: 'ensenar',
    nombre: 'Explicativo 3D',
    icono: 'cubo',
    descripcion: 'Un mundo 3D animado con personaje, íconos y texto palabra por palabra.',
    plantilla: true,
    sinGenerados: true,
    guia: `Explicativo 3D animado (motion graphics en 3D, como un video educativo de marca). NADA de fotos ni clips
realistas generados: todo se programa. Herramienta: HyperFrames con Three.js para el 3D (o CSS 3D si no alcanza).
- Guion: el del usuario palabra por palabra, o su narración grabada; si no trae ninguno, escríbelo tú (gancho que
  contradice lo que cree el espectador, el problema, la explicación y la llamada a la acción).
- Personaje: UN objeto 3D estilizado que representa el tema (en salud dental, una boca de caricatura con labios y dientes;
  en otro tema, su objeto: una muela, un frasco, un auto…), suave, brillante y con los colores de la marca. Es el
  protagonista: se abre, gira, se acerca y muestra cada problema (la mancha, el desgaste, el diente roto…).
- Dos ambientes: uno oscuro (azul marino profundo, luz de estudio y suelo con reflejo) para el problema y otro claro
  (blanco con celeste) para la solución. El paso de uno a otro marca el giro del guion.
- Íconos 3D redondeados, estilo app y del color de la marca, que entran con un pequeño rebote para cada idea
  (un ojo, un diente, un escáner de cara, una carpeta clínica, una cámara…).
- Texto arriba y centrado, palabra por palabra al ritmo de la voz, en minúsculas naturales, con la palabra clave
  resaltada (una caja suave de color). El primer titular puede ir grande y en mayúsculas.
- Tarjetitas que resumen la idea («Timidez ≠ Tus dientes», «Todos blancos» tachado en rojo) y, si el usuario trajo
  fotos, en marco blanco con su pie de foto. Nada de texto escrito dentro del 3D.
- Cámara con movimientos suaves y continuos que se acercan a cada detalle; sin cortes bruscos.
- Cierre: el logo del usuario (si lo adjuntó) en su fondo, sin texto encima.
- Duración: la de la narración; cada frase es un momento de la animación.`
  },
  {
    id: 'lista',
    grupo: 'ensenar',
    nombre: 'Lista o top',
    icono: 'layers',
    descripcion: '«3 errores», «5 tips», «top 7»: conteo con ritmo.',
    guia: `Estructura de conteo:
- El número manda: gigante, con el color de marca, entrando con fuerza.
- Cada ítem es un golpe: titular corto, pausa mínima, siguiente.
- Si hay videos del usuario, alterna el número en pantalla y el tramo que lo demuestra.
- Deja el mejor para el final y cierra con pregunta o invitación.`
  },
  {
    id: 'promo',
    grupo: 'vender',
    nombre: 'Promo o producto',
    icono: 'play',
    descripcion: 'Vender o anunciar: beneficio, prueba, llamada a la acción.',
    guia: `Estructura de venta honesta:
- Abre con el beneficio, no con el producto ("graba mejor en la mitad de tiempo").
- Muestra la prueba: si hay videos o fotos del usuario, son la demostración.
- Una sola llamada a la acción al cierre, clara y con la marca.
- Ritmo ágil: ninguna escena pasa de 3 segundos sin que algo cambie.`
  },
  {
    id: 'historia',
    grupo: 'contar',
    nombre: 'Historia',
    icono: 'clock',
    descripcion: 'Contar algo que pasó: conflicto, tensión, desenlace.',
    guia: `Estructura narrativa:
- Abre en medio del conflicto o con la pregunta que sostiene la historia.
- Sube la tensión por escenas: cada una revela algo y deja una pregunta abierta.
- El texto en pantalla marca los giros ("y entonces…", "pero nadie esperaba esto").
- Desenlace corto y cierre con la lección o la marca.`
  },
  {
    id: 'noticia',
    grupo: 'contar',
    nombre: 'Noticia o análisis',
    icono: 'search',
    descripcion: 'Qué pasó, por qué importa y qué sigue.',
    guia: `Estructura informativa:
- Titular primero: lo que pasó, en una frase grande y clara.
- Después el contexto mínimo para entenderlo y por qué le importa al que mira.
- Los datos se ven: números grandes, una cifra por escena.
- Cierra con qué sigue o qué puede hacer el espectador, con la marca.`
  },
  {
    id: 'receta',
    grupo: 'vender',
    nombre: 'Comida o receta',
    icono: 'palette',
    descripcion: 'Ingredientes, proceso y un resultado que dé hambre.',
    guia: `Estructura de cocina:
- Abre con el plato terminado o la promesa ("la pasta más fácil del mundo").
- Ingredientes como lista visual breve; el proceso en pasos numerados.
- Si hay videos del usuario, cada tramo muestra un paso con su rótulo encima.
- Cierra con el resultado y la marca. Ritmo vivo, cortes cortos.`
  },
  {
    id: 'motivacion',
    grupo: 'inspirar',
    nombre: 'Motivacional',
    icono: 'chevron',
    descripcion: 'Frases con peso, ritmo y un cierre que empuja.',
    guia: `Estructura de impacto:
- Una frase por escena, grande y centrada: el texto ES el video.
- Ritmo de tambor: cada escena golpea más fuerte que la anterior.
- Pausas dramáticas antes de la frase clave.
- Cierra con la frase que se lleva el espectador y la marca.`
  }
]

export function estiloPorId(id: string | undefined): EstiloVideo {
  return ESTILOS.find((e) => e.id === id) ?? ESTILOS[0]
}
