import { tramos, type Timeline } from '../../shared/timeline'
import type { Elegido } from './components/TimelineEditor'

/**
 * Dónde está el usuario en el editor, en palabras para el agente: el segundo del cabezal y lo que tiene elegido. El
 * editor se lo cuenta a Recorte en todo momento; el chat y el MCP (`ver_proyecto`) se lo dan al agente, así entiende
 * «cambia esto» o «corta aquí» sin que el usuario tenga que decírselo.
 */
export function describirDonde(timeline: Timeline, tiempo: number, elegido: Elegido, nombreDe?: (fuente: string) => string): string {
  const partes = [`cabezal en ${tiempo.toFixed(2)} s de la timeline`]
  if (!elegido) return partes.join('; ')
  if (elegido.tipo === 'clip') {
    const t = tramos(timeline).find((x) => x.clip.id === elegido.id)
    if (t) partes.push(`clip ${t.indice + 1} elegido (timeline ${t.inicio.toFixed(2)}–${t.fin.toFixed(2)}, fuente ${t.clip.entrada.toFixed(2)}–${t.clip.salida.toFixed(2)})`)
  } else if (elegido.tipo === 'texto') {
    const i = timeline.textos.findIndex((x) => x.id === elegido.id)
    if (i >= 0) partes.push(`texto ${i + 1} elegido («${timeline.textos[i].texto}», ${timeline.textos[i].inicio.toFixed(2)}–${(timeline.textos[i].inicio + timeline.textos[i].duracion).toFixed(2)} s)`)
  } else if (elegido.tipo === 'capa') {
    const i = (timeline.capas ?? []).findIndex((x) => x.id === elegido.id)
    const c = timeline.capas?.[i]
    if (c) partes.push(`capa ${i + 1} elegida («${nombreDe ? nombreDe(c.fuente) : c.fuente}», ${c.inicio.toFixed(2)}–${(c.inicio + c.duracion).toFixed(2)} s)`)
  } else if (elegido.tipo === 'sonido') {
    const i = (timeline.sonidos ?? []).findIndex((x) => x.id === elegido.id)
    if (i >= 0) partes.push(`sonido ${i + 1} elegido (en ${timeline.sonidos![i].inicio.toFixed(2)} s)`)
  } else if (elegido.tipo === 'voz') {
    const i = (timeline.voces ?? []).findIndex((x) => x.id === elegido.id)
    if (i >= 0) partes.push(`frase de voz ${i + 1} elegida («${timeline.voces![i].texto.slice(0, 80)}»)`)
  } else if (elegido.tipo === 'ajuste') {
    const i = (timeline.ajustesCapa ?? []).findIndex((x) => x.id === elegido.id)
    if (i >= 0) partes.push(`capa de ajuste ${i + 1} elegida`)
  } else if (elegido.tipo === 'musica') {
    partes.push('la música elegida')
  }
  return partes.join('; ')
}
