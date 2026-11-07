/**
 * Una creación: un video hecho desde cero con IA, sin material importado.
 * Avanza por fases que el usuario ve en el estudio:
 *   estilo → (solo con referencia) se analiza el material y la referencia, y se
 *            muestra la ficha de estilo y qué se puede copiar;
 *   guion  → el agente propone las escenas y se cambian hablando con él;
 *   voz    → la narración: una voz de Gemini, tu voz grabada o subida, o ninguna;
 *   video  → el agente compone (HyperFrames) y Recorte renderiza;
 *   listo  → el MP4 existe; se puede rehacer con más pedidos o abrir en el editor.
 * Abrir en el editor convierte el MP4 en un proyecto normal, con su timeline.
 */

import type { FichaEstilo, Viabilidad } from './estilo'

export type FormatoCreacion = 'vertical' | 'horizontal'
export type FaseCreacion = 'estilo' | 'guion' | 'voz' | 'video' | 'listo'

/** Los agentes que Recorte sabe conectar. */
export type AgenteId = 'kimi' | 'claude' | 'codex' | 'gemini' | 'opencode' | 'antigravity'
/** Cuánto modelo poner en una tarea: rápido cuesta menos, máximo piensa más. */
export type NivelModelo = 'rapido' | 'equilibrado' | 'maximo'
/** Elección para una tarea: qué agente la hace y con qué nivel. */
export interface EleccionTarea {
  agente: AgenteId
  nivel?: NivelModelo
}
/**
 * Quién hace cada paso de la creación. Vacío (optimizado): el agente activo
 * hace todo con su modelo por defecto.
 */
export interface TareasCreacion {
  guion?: EleccionTarea
  video?: EleccionTarea
}

export interface EscenaGuion {
  /** Lo que se lee en pantalla (corto). */
  texto: string
  /** Lo que se dice en voz: la narración de la escena. */
  narracion?: string
  /** Lo que se ve: tipografía, forma, foto adjunta… */
  visual: string
  /** Imagen a generar en Google Flow para esta escena (la descripción). */
  imagen?: string
  /** Clip de video a generar con Veo para esta escena (la descripción). */
  clip?: string
  /** Lo que ya generó Flow para la escena, dentro de la composición (`media/…`). */
  medio?: { archivo: string; tipo: 'imagen' | 'video' }
  duracion: number
}

export interface GuionCreacion {
  titulo: string
  escenas: EscenaGuion[]
}

export interface AdjuntoCreacion {
  /** Ruta dentro de la composición (`media/<archivo>`). */
  archivo: string
  nombre: string
  tipo: 'imagen' | 'video'
  /** Lo que dura, si es video (segundos). */
  duracion?: number
}

export interface MensajeCreacion {
  id: string
  rol: 'usuario' | 'agente'
  texto: string
  fecha: number
  error?: boolean
  /** Siguientes pasos que propone el agente (botones). */
  propuestas?: string[]
  /** Gustos que aprendió en este paso. */
  aprendido?: string[]
}

export interface VozCreacion {
  origen: 'gemini' | 'propia'
  /** Relativa a la composición (`media/voz.wav`). */
  archivo: string
  /** Nombre de la voz de Gemini, si es generada. */
  vozGemini?: string
  duracion: number
  /** En qué segundo de la voz empieza cada escena (alineado con la transcripción). */
  inicios: number[]
}

/** Voces de Gemini que suenan bien narrando en español (hay 30; estas son las más útiles). */
export const VOCES_GEMINI: { id: string; descripcion: string }[] = [
  { id: 'Kore', descripcion: 'Firme' },
  { id: 'Puck', descripcion: 'Animada' },
  { id: 'Charon', descripcion: 'Informativa' },
  { id: 'Aoede', descripcion: 'Ligera' },
  { id: 'Leda', descripcion: 'Juvenil' },
  { id: 'Fenrir', descripcion: 'Entusiasta' },
  { id: 'Sulafat', descripcion: 'Cálida' },
  { id: 'Achird', descripcion: 'Amigable' },
  { id: 'Gacrux', descripcion: 'Madura' },
  { id: 'Iapetus', descripcion: 'Clara' },
  { id: 'Sadaltager', descripcion: 'Sabia' },
  { id: 'Zephyr', descripcion: 'Brillante' }
]

/** El guion como se dice en voz: la narración de cada escena, una por línea. */
export function textoNarracion(g: GuionCreacion): string {
  return g.escenas.map((e) => (e.narracion || e.texto).trim()).filter(Boolean).join('\n')
}

const palabras = (t: string): string[] => t.split(/\s+/).map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)

/**
 * Dónde empieza cada escena en la voz. Reparte las palabras transcritas según cuántas
 * tiene la narración de cada escena: tolera que Whisper oiga alguna palabra de más o de menos.
 */
export function alinearEscenas(g: GuionCreacion, inicioPalabras: number[], duracion: number): number[] {
  const porEscena = g.escenas.map((e) => palabras(e.narracion || e.texto).length)
  const total = porEscena.reduce((a, b) => a + b, 0)
  if (!total || !inicioPalabras.length) return g.escenas.map((_, i) => (duracion * i) / g.escenas.length)
  const inicios: number[] = []
  let acumulado = 0
  for (const n of porEscena) {
    const indice = Math.min(inicioPalabras.length - 1, Math.round((acumulado / total) * inicioPalabras.length))
    inicios.push(inicios.length === 0 ? 0 : Math.max(inicios[inicios.length - 1] + 0.3, inicioPalabras[indice]))
    acumulado += n
  }
  return inicios.map((t) => Math.min(t, Math.max(0, duracion - 0.3)))
}

/** Duración de la escena `i` según la voz. */
export function duracionEnVoz(v: VozCreacion, i: number): number {
  const fin = i + 1 < v.inicios.length ? v.inicios[i + 1] : v.duracion
  return Math.max(0.3, fin - v.inicios[i])
}

export interface Creacion {
  id: string
  nombre: string
  peticion: string
  estilo: string
  formato: FormatoCreacion
  /** Duración objetivo en segundos. */
  duracion: number
  adjuntos: AdjuntoCreacion[]
  fase: FaseCreacion
  /** Video de referencia cuyo estilo se copia (copiado a `analisis/`; no entra en el video). */
  referencia?: { archivo: string; nombre: string }
  /** La ficha de estilo que salió de la referencia (también en `analisis/estilo.json`). */
  ficha?: FichaEstilo
  /** El último informe de viabilidad calculado (se recalcula al conectar cosas). */
  viabilidad?: Viabilidad
  guion?: GuionCreacion
  voz?: VozCreacion
  mensajes: MensajeCreacion[]
  /** MP4 más reciente, relativo a la carpeta de la creación (`salidas/…`). */
  salida?: string
  /** Portada del MP4 (`salidas/…jpg`). */
  portada?: string
  /** Cuántas veces se renderizó. */
  version: number
  /** Quién hace el guion y el video, si el usuario lo eligió (modo avanzado). */
  tareas?: TareasCreacion
  flow?: FlowCreacion
  /** La versión del video que ya lleva la voz montada (sin rediseñar). */
  vozMontada?: number
  /** Dónde quedó la copia del último video en la carpeta del usuario. */
  copia?: string
  /** Qué MP4 se llevó al editor la última vez: si cambia, se abre uno nuevo. */
  editorSalida?: string
  /** Proyecto del editor creado a partir de esta creación. */
  proyectoEditor?: string
  createdAt: number
  updatedAt: number
}

export interface PeticionCreacion {
  peticion: string
  estilo: string
  formato: FormatoCreacion
  duracion: number
  /** Rutas absolutas elegidas por el usuario; se copian a la creación. */
  adjuntos: string[]
  /** Ruta absoluta del video de referencia cuyo estilo se copia (no entra en el video). */
  referencia?: string
  /** Quién hace cada paso (modo avanzado); sin esto manda el agente activo. */
  tareas?: TareasCreacion
  /** Imágenes (gratis) y clips de Veo (gastan créditos) generados en Google Flow. */
  flow?: FlowCreacion
}

export interface FlowCreacion {
  imagenes: boolean
  videos: boolean
  /** El modelo de Flow para las imágenes y para los clips (si no, el primero de cada lista). */
  modeloImagen?: string
  modeloVideo?: string
}

/** El nombre del modelo que usa cada agente en cada nivel (lo que ve el usuario). */
export const MODELOS_AGENTE: Record<AgenteId, Partial<Record<NivelModelo, string>>> = {
  claude: { rapido: 'Haiku', equilibrado: 'Sonnet', maximo: 'Opus' },
  kimi: { rapido: 'K2.7 Highspeed', equilibrado: 'K2.8', maximo: 'K3.1 Pro' },
  gemini: { rapido: '2.5 Flash', maximo: '2.5 Pro' },
  codex: {},
  opencode: {},
  antigravity: {}
}

/** Lo que cuesta un clip de 8 s en cada modelo de video de Flow (créditos, visto en Flow). */
export const COSTO_CLIP: Record<string, number> = {
  'Veo 3.1 - Lite': 10,
  'Veo 3.1 - Fast': 20,
  'Veo 3.1 - Quality': 100,
  'Omni 1.1 Flash': 6
}

/** Lo más que se generan con Veo por video, y lo más que cuesta cada clip. */
export const MAX_CLIPS_VEO = 3
export const TOPE_CLIP_VEO = 20

/** «Pon la voz», «intégrala al video», «agrega el audio»…: se resuelve con el montaje, sin agente. */
export function pideMontarVoz(texto: string): boolean {
  const t = texto.toLowerCase()
  return /\b(voz|narraci[oó]n|audio|locuci[oó]n)\b|int[eé]gra(lo|la)|j[uú]nta(lo|la)/.test(t) &&
    /(pon|integr|agreg|a[nñ]ad|mete|coloc|sincroniz|junt|mezcl|incluy|usa)/.test(t) &&
    !/(cambia|otra voz|m[aá]s r[aá]pid|m[aá]s lent|rehaz|redise)/.test(t)
}

export const DURACIONES = [15, 30, 60, 90]

export function duracionGuion(g: GuionCreacion | undefined): number {
  return g ? g.escenas.reduce((t, e) => t + e.duracion, 0) : 0
}

/** Valida el guion que devuelve el agente; lo inválido se descarta. */
export function validarGuion(crudo: unknown): GuionCreacion | null {
  if (!crudo || typeof crudo !== 'object') return null
  const g = crudo as Record<string, unknown>
  const escenas: EscenaGuion[] = []
  for (const e of Array.isArray(g.escenas) ? g.escenas.slice(0, 30) : []) {
    if (!e || typeof e !== 'object') continue
    const x = e as Record<string, unknown>
    const texto = typeof x.texto === 'string' ? x.texto.trim().slice(0, 400) : ''
    const narracion = typeof x.narracion === 'string' ? x.narracion.trim().slice(0, 1200) : ''
    const imagen = typeof x.imagen === 'string' && x.imagen.trim() ? x.imagen.trim().slice(0, 600) : ''
    const clip = typeof x.clip === 'string' && x.clip.trim() ? x.clip.trim().slice(0, 600) : ''
    const visual = typeof x.visual === 'string' ? x.visual.trim().slice(0, 300) : ''
    const duracion = typeof x.duracion === 'number' && Number.isFinite(x.duracion) ? Math.min(20, Math.max(0.8, x.duracion)) : 3
    if (texto || visual || narracion) {
      escenas.push({
        texto,
        ...(narracion ? { narracion } : {}),
        visual,
        ...(imagen ? { imagen } : {}),
        ...(clip ? { clip } : {}),
        duracion: Math.round(duracion * 10) / 10
      })
    }
  }
  if (!escenas.length) return null
  const titulo = typeof g.titulo === 'string' && g.titulo.trim() ? g.titulo.trim().slice(0, 100) : 'Video'
  return { titulo, escenas }
}
