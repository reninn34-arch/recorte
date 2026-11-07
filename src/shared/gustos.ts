/**
 * El criterio que Recorte va formando con cada usuario. Tres fuentes:
 * - «dicho»: lo que el usuario escribe en Ajustes («me gustan los títulos cortos»).
 * - «aprendido»: lo que el agente saca de la conversación (una preferencia que dura,
 *   no un pedido puntual) y lo devuelve en `aprendido`.
 * - señales: lo que el usuario hace con las propuestas del agente (deshace un cambio,
 *   corrige un mensaje y lo reenvía, elige una propuesta). Las señales no son gustos:
 *   el agente las lee y, si ve un patrón, lo convierte en un gusto aprendido.
 * Además se cuentan los usos de Crear con IA (formato, duración, tipo) para que la
 * caja empiece con lo que más usa.
 * Todo vive en el equipo del usuario y se puede ver, borrar o apagar en Ajustes.
 */

export interface Gusto {
  id: string
  texto: string
  origen: 'dicho' | 'aprendido'
  /** Cuántas veces se confirmó (el agente lo volvió a ver, o el usuario lo repitió). */
  veces: number
  fecha: number
}

export interface SenalGusto {
  tipo: 'deshizo' | 'corrigio' | 'eligio' | 'paro'
  /** En palabras: «Añadí zoom 1.3 al clip 2», «"más rápido" → "más lento"». */
  detalle: string
  fecha: number
}

export interface UsosCreacion {
  formato: Record<string, number>
  duracion: Record<string, number>
  estilo: Record<string, number>
}

export interface Gustos {
  /** Apagado, no se aprende nada nuevo ni se le cuenta al agente. */
  activo: boolean
  lista: Gusto[]
  senales: SenalGusto[]
  usos: UsosCreacion
}

export const GUSTOS_VACIOS: Gustos = {
  activo: true,
  lista: [],
  senales: [],
  usos: { formato: {}, duracion: {}, estilo: {} }
}

export const MAX_GUSTOS = 40
export const MAX_SENALES = 25

/** Para comparar gustos parecidos: minúsculas, sin tildes ni puntuación. */
export function claveGusto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Lo más usado de cada cosa (para empezar la caja de Crear con eso). */
export function favorito(cuentas: Record<string, number>): string | null {
  let mejor: string | null = null
  let n = 0
  for (const [k, v] of Object.entries(cuentas)) if (v > n) (mejor = k), (n = v)
  return n >= 2 ? mejor : null
}

/**
 * El bloque que va en el prompt del agente. Los gustos más confirmados y recientes
 * primero; las señales recientes para que el agente saque conclusiones.
 */
export function gustosParaPrompt(g: Gustos): string {
  if (!g.activo) return ''
  const lista = [...g.lista].sort((a, b) => b.veces - a.veces || b.fecha - a.fecha).slice(0, 20)
  const senales = g.senales.slice(-10)
  if (!lista.length && !senales.length) return ''
  const partes = ['LO QUE SABES DEL GUSTO DE ESTE USUARIO (respétalo salvo que ahora pida otra cosa):']
  if (lista.length) for (const x of lista) partes.push(`- ${x.texto}${x.veces > 1 ? ` (visto ${x.veces} veces)` : ''}`)
  else partes.push('- (todavía nada seguro)')
  if (senales.length) {
    partes.push('Lo que hizo hace poco con tus propuestas (si ves un patrón, apréndelo):')
    const nombre = { deshizo: 'Deshizo', corrigio: 'Corrigió su pedido', eligio: 'Eligió tu propuesta', paro: 'Te paró en' }
    for (const s of senales) partes.push(`- ${nombre[s.tipo]}: ${s.detalle}`)
  }
  return partes.join('\n')
}

/** Lo que se le pide al agente para que proponga y aprenda (va en sus instrucciones). */
export const INSTRUCCIONES_CRITERIO = `Además, en el mismo JSON:
- "propuestas": de 0 a 3 siguientes pasos que le propones al usuario, como frases cortas que él podría decirte tal cual («Pon un título al inicio», «Hazlo más rápido»). Que sean concretas y distintas entre sí; si no hay nada útil que proponer, [].
- "aprendido": de 0 a 2 preferencias DURADERAS del usuario que acabas de descubrir (lo que dice que le gusta o no, o un patrón en lo que deshace o corrige), escritas como regla general corta: «Prefiere títulos cortos y en mayúsculas», «No le gusta el zoom». Nada puntual de este video; nada que ya esté en lo que sabes de él. Si no hay, [].`

/** Lee y limpia lo que el agente devuelve en `propuestas` y `aprendido`. */
export function leerCriterio(datos: unknown): { propuestas: string[]; aprendido: string[] } {
  const d = (datos && typeof datos === 'object' ? datos : {}) as { propuestas?: unknown; aprendido?: unknown }
  const lista = (x: unknown, max: number, largo: number) =>
    Array.isArray(x)
      ? x
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 2)
          .map((s) => s.trim().slice(0, largo))
          .slice(0, max)
      : []
  return { propuestas: lista(d.propuestas, 3, 90), aprendido: lista(d.aprendido, 2, 140) }
}
