import type { MensajeChat } from './chat'
import type { Timeline } from './timeline'

/** Un video o una imagen que el usuario agregó al proyecto; sus clips lo nombran por `id`. */
export interface MedioProyecto {
  id: string
  /** Ruta absoluta del archivo original (no se copia). */
  ruta: string
  nombre: string
  tipo: 'video' | 'imagen'
  /** Segundos; en una imagen, lo más que puede durar su clip. */
  duracion: number
  ancho: number
  alto: number
  conAudio: boolean
  /** Miniatura dentro de la carpeta del proyecto (`medios/<id>.jpg`). */
  miniatura?: string
}

export type ClipStatus = 'sugerido' | 'elegido' | 'renderizando' | 'listo' | 'error'

export type Encuadre = 'cara' | 'centro' | 'division'

export type TranscriptionStatus = 'pendiente' | 'transcribiendo' | 'lista' | 'error'

export interface SourceVideo {
  path: string
  name: string
  duration: number
  width: number
  height: number
  fps: number
  thumbnail?: string
}

export interface Word {
  text: string
  start: number
  end: number
}

export interface TranscriptSegment {
  id: string
  start: number
  end: number
  text: string
  words: Word[]
}

export interface ClipSuggestion {
  id: string
  start: number
  end: number
  title: string
  hook: string
  score: number
  reason: string
  status: ClipStatus
  captionStyle: string
  reframe: Encuadre
  output?: string
  cover?: string
}

export interface BrandKit {
  name: string
  primary: string
  secondary: string
  font: string
  logo?: string
}

export interface Project {
  id: string
  name: string
  source: SourceVideo
  transcript?: TranscriptSegment[]
  clips: ClipSuggestion[]
  brand: BrandKit
  createdAt: number
  updatedAt: number
  transcription: TranscriptionStatus
  transcriptionError?: string
  language?: string
  proxy?: string
  thumbnail?: string
  demo?: boolean
  /** Edición completa propuesta por un agente (fase 1). */
  receta?: RecetaEdicion
  /** MP4 de la receta ya renderizada. */
  recetaSalida?: string
  /** MP4 de un video creado desde cero con HyperFrames (fase 2). */
  creacionSalida?: string
  /** La edición viva: lo que se ve en el monitor y lo que se exporta. */
  timeline?: Timeline
  /**
   * Una versión nueva del agente que todavía no se puso en la timeline: el editor la aplica
   * como un paso de deshacer (Ctrl+Z vuelve a la versión anterior, con lo retocado a mano).
   */
  timelinePendiente?: Timeline
  /** Más videos e imágenes del proyecto, además del principal (la biblioteca de Medios). */
  medios?: MedioProyecto[]
  /** Último MP4 exportado desde la timeline. */
  timelineSalida?: string
  /** La conversación con el agente que edita este proyecto. */
  chat?: MensajeChat[]
}

/**
 * Receta de edición: el documento que un agente produce para editar el material.
 * Todo lo que el agente decide cabe aquí; Recorte valida y ejecuta.
 */
export interface RecetaEdicion {
  titulo: string
  /** Segmentos del material fuente, en orden de aparición en la edición. */
  cortes: { start: number; end: number }[]
  color?: {
    /** -0.3 (más oscuro) a 0.3 (más claro). */
    brillo?: number
    /** 0.6 (plano) a 1.6 (punchy). */
    contraste?: number
    /** 0 (blanco y negro) a 2.5 (muy vivo). */
    saturacion?: number
  }
  /** 0.75 a 1.5; 1 deja la velocidad original. */
  velocidad?: number
  /** Entre cortes: corte seco o fundido cruzado de 0,4 s. */
  transicion?: 'corte' | 'fundido'
  captions: boolean
  /** Explicación del agente en lenguaje humano, para la vista de revisión. */
  resumen?: string
}

export interface RenderJob {
  id: string
  clipId: string
  title: string
  progress: number
  status: 'en cola' | 'renderizando' | 'listo' | 'error'
  output?: string
}

/**
 * Ajustes del análisis con IA. La clave nunca viaja a la interfaz:
 * se guarda cifrada en el proceso principal y solo se expone `tieneClave`.
 */
export interface AjustesIA {
  activa: boolean
  /** 'api': endpoint compatible con OpenAI. 'cli': tu plan vía un agente local (Claude Code, Kimi CLI…). */
  proveedor: 'api' | 'cli'
  /** Comando del agente CLI en modo 'cli' (el prompt se envía por stdin). Ej.: `claude -p`. */
  comandoCli: string
  baseUrl: string
  modelo: string
  tieneClave: boolean
  claveCifrada: boolean
}
