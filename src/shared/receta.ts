import type { RecetaEdicion } from './types'

/**
 * Utilidades puras sobre la RecetaEdicion: las usa el proceso principal
 * (render) y la interfaz (vista de revisión). Sin dependencias de Node.
 */

/** Duración del fundido cruzado entre cortes, en segundos. */
export const FUNDIDO_S = 0.4

/** Duración final de la edición tal como la renderiza FFmpeg. */
export function duracionReceta(receta: RecetaEdicion): number {
  const velocidad = receta.velocidad ?? 1
  const bruta = receta.cortes.reduce((total, c) => total + (c.end - c.start), 0) / velocidad
  const fundidos = receta.transicion === 'fundido' ? (receta.cortes.length - 1) * FUNDIDO_S : 0
  return Math.max(0.5, bruta - fundidos)
}

function mmss(segundos: number): string {
  const total = Math.max(0, Math.round(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Descripción legible para la vista de revisión. */
export function describirReceta(receta: RecetaEdicion): string[] {
  const lineas: string[] = []
  const velocidad = receta.velocidad ?? 1

  lineas.push(
    receta.cortes.length === 1
      ? `1 corte: ${mmss(receta.cortes[0].start)}–${mmss(receta.cortes[0].end)}`
      : `${receta.cortes.length} cortes: ${receta.cortes.map((c) => `${mmss(c.start)}–${mmss(c.end)}`).join(', ')}`
  )

  const color = receta.color
  const brillo = color?.brillo ?? 0
  const contraste = color?.contraste ?? 1
  const saturacion = color?.saturacion ?? 1
  if (brillo !== 0 || contraste !== 1 || saturacion !== 1) {
    const partes: string[] = []
    if (brillo !== 0) partes.push(`brillo ${brillo > 0 ? '+' : ''}${brillo.toFixed(2)}`)
    if (contraste !== 1) partes.push(`contraste ×${contraste.toFixed(2)}`)
    if (saturacion !== 1) partes.push(`saturación ×${saturacion.toFixed(2)}`)
    lineas.push(`Color: ${partes.join(', ')}`)
  }

  if (velocidad !== 1) lineas.push(`Velocidad ×${velocidad.toFixed(2)}`)
  if (receta.cortes.length > 1) {
    lineas.push(receta.transicion === 'fundido' ? 'Transición: fundido cruzado' : 'Transición: corte seco')
  }
  lineas.push(receta.captions ? 'Subtítulos quemados con tu marca' : 'Sin subtítulos')
  lineas.push(`Duración final aproximada: ${Math.round(duracionReceta(receta))} s`)

  return lineas
}
