import { pausasEnTimeline } from './chat'
import { borrarTramo, clipEnFuente, duracionTimeline, extraerRango, FUENTE_PRINCIPAL, tramos, type Timeline } from './timeline'
import type { TranscriptSegment } from './types'

/**
 * Limpieza automática de una toma hablada (lo que en Premiere se hace a mano, o con «Texto › Pausas»): quitar los
 * silencios, las muletillas («eh», «mmm») y las palabras repetidas («que que»), con la transcripción.
 */

/** Las muletillas que se quitan si no se dice otra cosa (sin las que también son palabras normales, como «este»). */
export const MULETILLAS = ['eh', 'ehh', 'ehm', 'em', 'emm', 'mm', 'mmm', 'hmm', 'ah', 'aah', 'uh', 'um', 'mhm']

const normal = (x: string) =>
  x
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñ0-9 ]/g, '')
    .trim()

type Palabra = { texto: string; inicio: number; fin: number }

/** Las palabras de la voz en tiempo de la timeline (de los clips del video principal que suenan). */
function palabrasEnTimeline(tl: Timeline, transcript: TranscriptSegment[] | undefined): Palabra[] {
  const salida: Palabra[] = []
  if (!transcript?.length) return salida
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL || tr.clip.mudo) continue
    for (const s of transcript)
      for (const w of s.words) {
        if (w.end <= tr.clip.entrada || w.start >= tr.clip.salida) continue
        salida.push({
          texto: normal(w.text),
          inicio: tr.inicio + clipEnFuente(tr.clip, Math.max(w.start, tr.clip.entrada)),
          fin: tr.inicio + clipEnFuente(tr.clip, Math.min(w.end, tr.clip.salida))
        })
      }
  }
  return salida.sort((a, b) => a.inicio - b.inicio)
}

/** Los tramos con muletillas (una palabra o una frase como «o sea»), con un respiro mínimo a cada lado. */
export function muletillasEnTimeline(tl: Timeline, transcript: TranscriptSegment[] | undefined, lista: string[] = MULETILLAS): [number, number][] {
  const p = palabrasEnTimeline(tl, transcript)
  const frases = lista.map((x) => normal(x).split(/\s+/).filter(Boolean)).filter((x) => x.length)
  const tramosM: [number, number][] = []
  for (let i = 0; i < p.length; i++) {
    for (const f of frases) {
      if (f.every((w, k) => p[i + k]?.texto === w)) {
        tramosM.push([p[i].inicio - 0.02, p[i + f.length - 1].fin + 0.02])
        break
      }
    }
  }
  return tramosM
}

/** Las palabras dichas dos veces seguidas («que que», «el el»): se quita la primera. */
export function repeticionesEnTimeline(tl: Timeline, transcript: TranscriptSegment[] | undefined): [number, number][] {
  const p = palabrasEnTimeline(tl, transcript)
  const salida: [number, number][] = []
  for (let i = 1; i < p.length; i++) {
    if (p[i].texto && p[i].texto === p[i - 1].texto && p[i].inicio - p[i - 1].fin < 0.8) salida.push([p[i - 1].inicio, p[i].inicio])
  }
  return salida
}

/** Junta los tramos que se tocan o se pisan. */
function juntar(tramosX: [number, number][]): [number, number][] {
  const orden = [...tramosX].sort((a, b) => a[0] - b[0])
  const salida: [number, number][] = []
  for (const [a, b] of orden) {
    const ultimo = salida[salida.length - 1]
    if (ultimo && a <= ultimo[1] + 0.02) ultimo[1] = Math.max(ultimo[1], b)
    else salida.push([Math.max(0, a), b])
  }
  return salida
}

export interface Limpieza {
  silencios: boolean
  /** Lo que dura un silencio para quitarlo (s). */
  minimo: number
  muletillas: boolean
  lista: string[]
  repeticiones: boolean
}

/** Lo que encontraría la limpieza: cuántos de cada cosa y los segundos que se ahorran. */
export function buscarLimpieza(tl: Timeline, transcript: TranscriptSegment[] | undefined, l: Limpieza) {
  const silencios = l.silencios ? pausasEnTimeline(tl, transcript, Math.max(0.3, l.minimo)) : []
  const muletillas = l.muletillas ? muletillasEnTimeline(tl, transcript, l.lista) : []
  const repeticiones = l.repeticiones ? repeticionesEnTimeline(tl, transcript) : []
  const todos = juntar([...silencios, ...muletillas, ...repeticiones])
  return { silencios: silencios.length, muletillas: muletillas.length, repeticiones: repeticiones.length, tramos: todos, segundos: todos.reduce((s, [a, b]) => s + b - a, 0) }
}

/**
 * Quita lo encontrado, del final al principio (así los segundos de lo que falta no se corren). Lo de las otras pistas
 * (textos, capas, sonidos) se corre con el video, como al extraer.
 */
export function aplicarLimpieza(tl: Timeline, tramosX: [number, number][]): Timeline {
  let r = tl
  for (const [a, b] of [...tramosX].sort((x, y) => y[0] - x[0])) {
    const hasta = Math.min(b, duracionTimeline(r))
    if (hasta - a < 0.05) continue
    const extraido = extraerRango(r, a, hasta)
    r = extraido !== r ? extraido : borrarTramo(r, a, hasta)
  }
  return r
}
