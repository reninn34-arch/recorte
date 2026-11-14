import type { OperacionTL } from './chat'

/**
 * La revisión del audio de una edición: lo que suena mal y cómo arreglarlo. Sale de medir el sonido de verdad (no de
 * la transcripción sola), así encuentra lo que un oído nota y un editor apurado no: una palabra que el corte se come
 * (suena a que la persona se ahoga), un corte seco que hace clic, respiraciones fuertes, ruido de fondo, silencios
 * largos y saturación.
 */

export type TipoProblemaAudio = 'palabra-cortada' | 'corte-seco' | 'voz-cortada' | 'respiracion' | 'ruido' | 'silencio' | 'saturado'

/** Cómo se arregla: operaciones sobre la timeline (como las del agente) o procesar el audio de una frase de voz. */
export type ArregloAudio =
  | { tipo: 'ops'; ops: OperacionTL[] }
  | { tipo: 'voz'; voz: string; accion: 'respiraciones' | 'limpiar'; ventanas?: [number, number][] }

export interface ProblemaAudio {
  id: string
  tipo: TipoProblemaAudio
  /** Segundo de la timeline donde se oye (para ir ahí). */
  t: number
  /** Qué pasa, en palabras del usuario. */
  texto: string
  /** Cómo se arregla y qué hace el botón. Sin él, solo se avisa. */
  arreglo?: ArregloAudio
  etiqueta?: string
  /** Lo grave que es: 2 se nota mucho, 1 se nota, 0 un detalle. */
  peso: 0 | 1 | 2
}

export const NOMBRE_PROBLEMA: Record<TipoProblemaAudio, string> = {
  'palabra-cortada': 'Palabra cortada',
  'corte-seco': 'Corte seco',
  'voz-cortada': 'Frase cortada',
  respiracion: 'Respiraciones fuertes',
  ruido: 'Ruido de fondo',
  silencio: 'Silencio largo',
  saturado: 'Sonido saturado'
}
