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
import type { EstadoModoAgente, PlanAgente } from './modoagente'

export type FormatoCreacion = 'vertical' | 'horizontal'
export type FaseCreacion = 'plan' | 'estilo' | 'guion' | 'voz' | 'video' | 'listo'
/** guiado: guion → voz → video (HyperFrames). agente: el agente trabaja con herramientas (ver modoagente.ts). */
export type ModoCreacion = 'guiado' | 'agente'

/** Los agentes que Recorte sabe conectar. */
export type AgenteId = 'kimi' | 'claude' | 'codex' | 'gemini' | 'opencode' | 'antigravity'
/** Cuánto modelo poner en una tarea: rápido cuesta menos, máximo piensa más. */
export type NivelModelo = 'rapido' | 'equilibrado' | 'maximo'
/** Elección para una tarea: qué agente la hace y con qué nivel. */
export interface EleccionTarea {
  agente: AgenteId
  /** Lo de antes (rápido/equilibrado/máximo): se sigue entendiendo si no hay `modelo`. */
  nivel?: NivelModelo
  /** El modelo concreto, del catálogo del agente (p. ej. «opus», «opencode/big-pickle»). */
  modelo?: string
  /** Cuánto piensa (low, medium, high, xhigh, max…), si el modelo lo admite. */
  esfuerzo?: string
}

/** Un modelo que ofrece un agente, tal como lo dice el propio agente. */
export interface ModeloAgente {
  id: string
  nombre: string
  /** Los esfuerzos que admite (vacío: no se elige). */
  esfuerzos: string[]
  esfuerzoDefecto?: string
  /** No gasta saldo (OpenCode). */
  gratis?: boolean
  /** Para qué sirve, en una línea. */
  descripcion?: string
  /** El que el agente recomienda (el suyo por defecto). */
  recomendado?: boolean
  /** Una versión anterior de una familia que ya tiene otra más nueva: va en «Anteriores». */
  anterior?: boolean
}

/** Lo que el usuario lee de cada esfuerzo. */
export const NOMBRE_ESFUERZO: Record<string, string> = {
  none: 'Sin pensar',
  minimal: 'Mínimo',
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  xhigh: 'Muy alto',
  max: 'Máximo',
  ultra: 'Ultra'
}

/** Solo letras, números y . - _ / : (va en la línea de comandos del agente). */
export const ID_SEGURO = /^[\w.\-/:]{1,120}$/
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
  /** «audio»: una narración grabada (solo en modo agente): el video se arma sobre ella. */
  tipo: 'imagen' | 'video' | 'audio'
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
  /** El plan tal como quedó en este turno de la charla (se dibuja con sus pasos y «Hazlo»). */
  plan?: PlanAgente
  /**
   * Un cambio rápido sobre la timeline del editor (sin rehacer el video): lo que se cambió y
   * lo que no se pudo. Lo hace el chat del editor con operaciones; se deshace con Ctrl+Z.
   */
  cambios?: string[]
  fallos?: string[]
  /** Imágenes y clips que el agente generó en este turno (rutas dentro de la creación). */
  medios?: string[]
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
  /** La narración exacta que se grabó o generó. Si el guion cambia, esta voz queda vieja. */
  texto?: string
  /** El guion cambió después de crear la voz: hay que rehacerla antes de usarla. */
  desactualizada?: boolean
}

/** Las 30 voces de Gemini TTS; las descripciones son nuestras, para elegir de un vistazo. */
export const VOCES_GEMINI: { id: string; descripcion: string }[] = [
  { id: 'Zephyr', descripcion: 'Brillante' },
  { id: 'Puck', descripcion: 'Animada' },
  { id: 'Charon', descripcion: 'Informativa' },
  { id: 'Kore', descripcion: 'Firme' },
  { id: 'Fenrir', descripcion: 'Entusiasta' },
  { id: 'Leda', descripcion: 'Juvenil' },
  { id: 'Orus', descripcion: 'Segura' },
  { id: 'Aoede', descripcion: 'Ligera' },
  { id: 'Callirrhoe', descripcion: 'Serena' },
  { id: 'Autonoe', descripcion: 'Natural' },
  { id: 'Enceladus', descripcion: 'Grave' },
  { id: 'Iapetus', descripcion: 'Clara' },
  { id: 'Umbriel', descripcion: 'Profunda' },
  { id: 'Algieba', descripcion: 'Cálida' },
  { id: 'Despina', descripcion: 'Dulce' },
  { id: 'Erinome', descripcion: 'Suave' },
  { id: 'Algenib', descripcion: 'Directa' },
  { id: 'Rasalgethi', descripcion: 'Expresiva' },
  { id: 'Laomedeia', descripcion: 'Fresca' },
  { id: 'Achernar', descripcion: 'Amable' },
  { id: 'Alnilam', descripcion: 'Rotunda' },
  { id: 'Schedar', descripcion: 'Pausada' },
  { id: 'Gacrux', descripcion: 'Madura' },
  { id: 'Pulcherrima', descripcion: 'Elegante' },
  { id: 'Achird', descripcion: 'Amigable' },
  { id: 'Zubenelgenubi', descripcion: 'Relajada' },
  { id: 'Vindemiatrix', descripcion: 'Reflexiva' },
  { id: 'Sadachbia', descripcion: 'Viva' },
  { id: 'Sadaltager', descripcion: 'Sabia' },
  { id: 'Sulafat', descripcion: 'Cercana' }
]

/** El nombre visible de una voz de Gemini. */
export function nombreVozGemini(id: string | undefined): string {
  return id?.trim() || 'Kore'
}

/** El guion como se dice en voz: la narración de cada escena, una por línea. */
export function textoNarracion(g: GuionCreacion): string {
  return g.escenas.map((e) => (e.narracion || e.texto).trim()).filter(Boolean).join('\n')
}

/**
 * La voz ya no corresponde al guion actual. Las voces creadas antes de guardar
 * `texto` no se pueden comprobar: se dan por buenas.
 */
export function vozDesactualizada(c: Creacion): boolean {
  if (!c.voz) return false
  if (c.voz.desactualizada) return true
  return Boolean(c.voz.texto && c.guion && !mismaNarracion(c.voz.texto, textoNarracion(c.guion)))
}

/**
 * Dos narraciones dicen lo mismo en voz (sin contar mayúsculas, puntuación ni saltos de
 * línea): una coma de más no obliga a rehacer ni a volver a grabar la voz.
 */
export function mismaNarracion(a: string, b: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return n(a) === n(b)
}

/** La voz que se puede usar con el guion actual (nada si quedó vieja). */
export function vozVigente(c: Creacion): VozCreacion | undefined {
  return c.voz && !vozDesactualizada(c) ? c.voz : undefined
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
  /** Cómo se hace: guiado (por defecto en las viejas) o con el agente trabajando con herramientas. */
  modo?: ModoCreacion
  /** El estado del modo agente: plan, registro y resultado. */
  agente?: EstadoModoAgente
  /** Modo agente: la voz de Gemini que el usuario eligió para narrar (sin ella, sin narración). */
  vozElegida?: string
  /** Modo agente: tras el plan, si no hay preguntas, se hace sin esperar el «Hazlo». */
  directo?: boolean
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
  /** Guiado o agente (por defecto, guiado). */
  modo?: ModoCreacion
  /** Quién hace cada paso (modo avanzado); sin esto manda el agente activo. */
  tareas?: TareasCreacion
  /** Imágenes (gratis) y clips de Veo (gastan créditos) generados en Google Flow. */
  flow?: FlowCreacion
  /** La voz de Gemini que narra, elegida en la caja (sin esto, el video va sin narración). */
  vozElegida?: string
  /** Hacerlo directo: tras el plan, si el agente no tiene preguntas, empieza sin esperar el «Hazlo». */
  directo?: boolean
}

/** Lo que se puede cambiar de la caja a mitad de una creación (null = quitarlo). */
export interface AjustesCreacion {
  vozElegida?: string | null
  directo?: boolean
  flow?: FlowCreacion | null
  tareas?: TareasCreacion | null
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
  // 720p y 10 s, lo que Flow pone por defecto (visto en Flow: 60 puntos por dos clips).
  'Omni 1.2 Flash': 30,
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

/**
 * El cambio que pide el usuario sobre un video hecho toca el guion (lo que se dice o se
 * lee, las escenas, la duración) o es solo de aspecto (color, letra, animación, ritmo).
 * Ante la duda se trata como visual: así un retoque no reescribe el guion, ni rehace la
 * voz, ni vuelve a pedir imágenes a Flow (que es lo que gasta créditos).
 */
export function cambiaElGuion(texto: string): boolean {
  // Sin tildes y con espacios alrededor: los límites de palabra de JS no entienden «ó».
  const t = ` ${texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ')} `
  const hay = (re: RegExp) => re.test(t)
  return (
    // Lo que se dice o se lee.
    hay(/ (guion|narracion|narra|narrador|locucion|frase|frases|palabra|palabras|titulo|subtitulo|mensaje|cta|idioma|traduce|traducelo|traduccion|ingles|ortografia|errata|typo|texto|textos|dice|diga|digan|decir|escriba) /) ||
    // Escenas que entran o salen.
    hay(/ (agrega|agregale|anade|anadele|pon|ponle|mete|quita|quitale|elimina|borra|saca|une|junta|divide|separa|cambia|cambiale) ([a-z0-9]+ ){0,2}(escena|escenas|parte|partes|seccion|final|inicio|intro|cierre) /) ||
    // La duración.
    hay(/ (mas|menos) (corto|corta|largo|larga|breve|segundos) | \d+ (s|seg|segundos) | duracion | dure /) ||
    // Imágenes o clips nuevos (eso sí hay que pedirlo a Flow).
    hay(/ (otra|otras|nueva|nuevas|cambia|cambiale) ([a-z0-9]+ ){0,2}(imagen|imagenes|foto|fotos|clip|clips) /)
  )
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
