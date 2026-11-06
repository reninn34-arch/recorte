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
}

export const ESTILOS: EstiloVideo[] = [
  {
    id: 'libre',
    nombre: 'Libre',
    icono: 'sparkles',
    descripcion: 'El editor decide la estructura según lo que le pidas.',
    guia: `No hay molde: decide la estructura según la petición. Elige el ritmo que el tema pida y una sola idea fuerte por escena.`
  },
  {
    id: 'leccion',
    nombre: 'Clase o tutorial',
    icono: 'film',
    descripcion: 'Enseñar algo: pasos, errores comunes, cómo se hace.',
    guia: `Estructura de enseñanza:
- Abre con la promesa ("esto vas a aprender") en el primer segundo, no con presentaciones.
- Numera los pasos o errores con titulares grandes; un punto por escena.
- Si hay fragmentos del usuario, cada fragmento enseña UN punto, con su titular encima.
- Cierra con la idea que debe recordar y la marca.`
  },
  {
    id: 'lista',
    nombre: 'Lista o top',
    icono: 'layers',
    descripcion: '«3 errores», «5 tips», «top 7»: conteo con ritmo.',
    guia: `Estructura de conteo:
- El número manda: gigante, con el color de marca, entrando con fuerza.
- Cada ítem es un golpe: titular corto, pausa mínima, siguiente.
- Si hay fragmentos, alterna tarjeta numerada y fragmento que la demuestra.
- Deja el mejor para el final y cierra con pregunta o invitación.`
  },
  {
    id: 'promo',
    nombre: 'Promo o producto',
    icono: 'play',
    descripcion: 'Vender o anunciar: beneficio, prueba, llamada a la acción.',
    guia: `Estructura de venta honesta:
- Abre con el beneficio, no con el producto ("graba mejor en la mitad de tiempo").
- Muestra la prueba: si hay fragmentos del usuario, son la demostración.
- Una sola llamada a la acción al cierre, clara y con la marca.
- Ritmo ágil: ninguna escena pasa de 3 segundos sin que algo cambie.`
  },
  {
    id: 'historia',
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
    nombre: 'Comida o receta',
    icono: 'palette',
    descripcion: 'Ingredientes, proceso y un resultado que dé hambre.',
    guia: `Estructura de cocina:
- Abre con el plato terminado o la promesa ("la pasta más fácil del mundo").
- Ingredientes como lista visual breve; el proceso en pasos numerados.
- Si hay fragmentos, cada uno muestra un paso con su rótulo encima.
- Cierra con el resultado y la marca. Ritmo vivo, cortes cortos.`
  },
  {
    id: 'motivacion',
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
