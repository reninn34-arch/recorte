import type { RecetaEdicion, TranscriptSegment } from '../shared/types'
import { proponerClips } from './momentos'

/**
 * Receta de edición (fase 1): el agente decide cortes, color, velocidad,
 * transiciones y captions; aquí se valida todo antes de tocar FFmpeg.
 * Si el agente falla, `recetaLocal` produce una edición mínima honesta.
 * Las utilidades puras (duración, descripción) viven en `src/shared/receta.ts`.
 */

const MAX_CORTES = 20
const CORTE_MIN = 0.5

function numero(valor: unknown, min: number, max: number, defecto: number): number {
  const n = Number(valor)
  if (!Number.isFinite(n)) return defecto
  return Math.min(max, Math.max(min, n))
}

/** Valida y normaliza la respuesta del agente. Lanza Error si no sirve. */
export function validarReceta(datos: unknown, duracion: number): RecetaEdicion {
  if (!datos || typeof datos !== 'object') throw new Error('La receta no es un objeto.')
  const bruto = datos as Record<string, unknown>

  const lista = Array.isArray(bruto.cortes) ? bruto.cortes : null
  if (!lista || lista.length === 0) throw new Error('La receta no tiene cortes.')

  const cortes: { start: number; end: number }[] = []
  for (const item of lista.slice(0, MAX_CORTES)) {
    if (!item || typeof item !== 'object') continue
    const corte = item as Record<string, unknown>
    const start = Number(corte.start)
    const end = Number(corte.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const inicio = Math.max(0, Math.min(start, duracion))
    const fin = Math.max(0, Math.min(end, duracion))
    if (fin - inicio < CORTE_MIN) continue
    cortes.push({
      start: Math.round(inicio * 1000) / 1000,
      end: Math.round(fin * 1000) / 1000
    })
  }
  if (cortes.length === 0) throw new Error('Ningún corte cae dentro del material.')

  const titulo = String(bruto.titulo ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90)

  const colorBruto = (bruto.color ?? {}) as Record<string, unknown>
  const color = {
    brillo: numero(colorBruto.brillo, -0.3, 0.3, 0),
    contraste: numero(colorBruto.contraste, 0.6, 1.6, 1),
    saturacion: numero(colorBruto.saturacion, 0, 2.5, 1)
  }

  return {
    titulo: titulo || 'Edición del agente',
    cortes,
    color,
    velocidad: numero(bruto.velocidad, 0.75, 1.5, 1),
    transicion: bruto.transicion === 'fundido' ? 'fundido' : 'corte',
    captions: bruto.captions !== false,
    resumen: String(bruto.resumen ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300) || undefined
  }
}

/** Respaldo local: edición mínima con el mejor clip de la selección determinista. */
export function recetaLocal(transcript: TranscriptSegment[], duracion: number): RecetaEdicion {
  const mejor = proponerClips(transcript, duracion)[0]
  const cortes = mejor
    ? [{ start: mejor.start, end: mejor.end }]
    : [{ start: 0, end: Math.min(duracion, 30) }]
  return {
    titulo: mejor?.title ?? 'Edición local',
    cortes,
    velocidad: 1,
    transicion: 'corte',
    captions: true,
    resumen: 'El agente no estaba disponible, así que armé una edición simple con el mejor momento detectado localmente.'
  }
}
