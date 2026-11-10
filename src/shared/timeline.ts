import type { RecetaEdicion, TranscriptSegment } from './types'

/**
 * La timeline: la pieza central del editor. La interfaz y los agentes trabajan sobre
 * este mismo documento; el reproductor lo sigue y el render lo exporta.
 *
 * - `clips` es la pista principal, magnética: los clips van uno tras otro, sin huecos.
 *   Su posición en la timeline sale del orden, así que borrar o recortar cierra el hueco
 *   solo (ripple), como en CapCut o en la pista principal de Final Cut.
 * - `textos` es una pista libre de rótulos con posición absoluta.
 *
 * Todo aquí es puro y sin dependencias de Node ni del DOM: cada operación devuelve una
 * timeline nueva y nunca muta la anterior (eso hace posible deshacer).
 */

/** Fuente del clip. Hoy, `principal` es el video del proyecto; mañana, la biblioteca. */
export type FuenteId = string
export const FUENTE_PRINCIPAL: FuenteId = 'principal'

export interface ClipTL {
  id: string
  fuente: FuenteId
  /** Segundo del material fuente donde empieza el clip. */
  entrada: number
  /** Segundo del material fuente donde acaba el clip. */
  salida: number
  /** Zoom y color del clip; sin él, el clip se ve tal cual. */
  ajustes?: AjustesClip
  /** Sin su sonido: un tramo que solo aporta imagen (la voz y la música van en sus pistas). */
  mudo?: boolean
  /** Entra fundiéndose sobre el clip anterior, en estos segundos (0.1 a 1.5). */
  fundido?: number
}

export const MAX_FUNDIDO = 1.5

/** Lo que se le puede cambiar a la imagen de un clip. Los valores neutros no cambian nada. */
export interface AjustesClip {
  /** 1 (sin zoom) a 2 (el doble), centrado. */
  zoom?: number
  /** -0.3 (más oscuro) a 0.3 (más claro); 0 neutro. */
  brillo?: number
  /** 0.5 (plano) a 1.8 (duro); 1 neutro. */
  contraste?: number
  /** 0 (blanco y negro) a 2 (muy vivo); 1 neutro. */
  saturacion?: number
  /** El punto de la imagen que queda al centro al acercar: 0 (izquierda) a 1 (derecha); 0.5 neutro. */
  cx?: number
  /** Lo mismo en vertical: 0 (arriba) a 1 (abajo); 0.5 neutro. */
  cy?: number
  /** Acercamiento lento durante el clip (Ken Burns): cuánto crece al final, 0 a 0.3; 0 quieto. */
  acercar?: number
}

export const LIMITES_AJUSTES = {
  zoom: [1, 2, 1],
  brillo: [-0.3, 0.3, 0],
  contraste: [0.5, 1.8, 1],
  saturacion: [0, 2, 1],
  cx: [0, 1, 0.5],
  cy: [0, 1, 0.5],
  acercar: [0, 0.3, 0]
} as const satisfies Record<keyof AjustesClip, readonly [number, number, number]>

/** Una pista de música bajo toda la edición (se repite si es corta y se funde al final). */
export interface MusicaTL {
  /** Ruta relativa dentro de la carpeta del proyecto (p. ej. `media/musica.mp3`). */
  archivo: string
  nombre: string
  /** 0 a 1. */
  volumen: number
  /** Si baja sola mientras hay voz. */
  ducking: boolean
}

export type PosicionTexto = 'arriba' | 'centro' | 'abajo'

export interface TextoTL {
  id: string
  /** Segundo de la timeline donde aparece. */
  inicio: number
  duracion: number
  texto: string
  posicion: PosicionTexto
  /** Tamaño relativo al normal: 0.5 (la mitad) a 2.5; sin él, 1. */
  tamano?: number
  /** Color de la letra (`#rrggbb`); sin él, blanco. */
  color?: string
  /** Sin la caja oscura de detrás: solo la letra con su borde. */
  sinCaja?: boolean
  /** La letra (una clave de FUENTES_TEXTO); sin ella, la normal. */
  fuente?: string
}

/**
 * Las letras de los rótulos. Son fuentes que trae Windows: el monitor (CSS) y el render
 * (libass) usan la misma, así lo que se ve es lo que se exporta.
 */
export const FUENTES_TEXTO: Record<string, { nombre: string; familia: string; negrita: boolean }> = {
  normal: { nombre: 'Normal', familia: 'Arial', negrita: true },
  fina: { nombre: 'Fina', familia: 'Segoe UI', negrita: false },
  gruesa: { nombre: 'Gruesa', familia: 'Arial Black', negrita: false },
  impacto: { nombre: 'Impacto', familia: 'Impact', negrita: false },
  elegante: { nombre: 'Elegante', familia: 'Georgia', negrita: true },
  maquina: { nombre: 'Máquina', familia: 'Courier New', negrita: true }
}

export const LIMITES_TAMANO = [0.5, 2.5] as const
const COLOR_HEX = /^#[0-9a-f]{6}$/i

/** El estilo de un rótulo, limpio: lo neutro no se guarda. */
function estiloTexto(t: Partial<TextoTL>): Pick<TextoTL, 'tamano' | 'color' | 'sinCaja' | 'fuente'> {
  const tamano = typeof t.tamano === 'number' && Number.isFinite(t.tamano) ? Math.round(pinza(t.tamano, LIMITES_TAMANO[0], LIMITES_TAMANO[1]) * 100) / 100 : 1
  const color = typeof t.color === 'string' && COLOR_HEX.test(t.color) ? t.color.toLowerCase() : '#ffffff'
  return {
    ...(Math.abs(tamano - 1) > 0.005 ? { tamano } : {}),
    ...(color !== '#ffffff' ? { color } : {}),
    ...(t.sinCaja === true ? { sinCaja: true } : {}),
    ...(typeof t.fuente === 'string' && t.fuente !== 'normal' && t.fuente in FUENTES_TEXTO ? { fuente: t.fuente } : {})
  }
}

/**
 * Una frase de la narración: su propio audio en su segundo de la timeline. Va suelta (como
 * un rótulo): se mueve, se borra o se vuelve a generar sin tocar las demás.
 */
export interface VozTL {
  id: string
  /** Segundo de la timeline donde empieza a sonar. */
  inicio: number
  /** Lo que dura su audio. */
  duracion: number
  /** Ruta relativa dentro de la carpeta del proyecto (p. ej. `media/voz-01.wav`). */
  archivo: string
  /** Lo que dice (para verlo en la pista y poder regenerarla). */
  texto: string
  /** 0 a 1.5; sin él, 1. */
  volumen?: number
  /** La voz de Gemini con la que se generó, si se sabe. */
  voz?: string
}

export interface Timeline {
  version: 1
  clips: ClipTL[]
  textos: TextoTL[]
  musica?: MusicaTL
  /** La narración, frase a frase. */
  voces?: VozTL[]
}

/** Un clip con su lugar en la timeline ya calculado. */
export interface Tramo {
  clip: ClipTL
  indice: number
  inicio: number
  fin: number
}

/** Duración mínima de un clip o un texto, en segundos. */
export const DURACION_MINIMA = 0.1
const EPSILON = 1e-4

export function nuevoId(prefijo: string): string {
  return `${prefijo}-${globalThis.crypto.randomUUID().slice(0, 8)}`
}

function pinza(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor))
}

const largo = (c: ClipTL): number => c.salida - c.entrada

// ===== Crear =====

export function timelineVacia(): Timeline {
  return { version: 1, clips: [], textos: [] }
}

/** El punto de partida al abrir un video: todo el material en un solo clip. */
export function timelineInicial(duracionFuente: number): Timeline {
  if (!(duracionFuente > DURACION_MINIMA)) return timelineVacia()
  return {
    version: 1,
    clips: [{ id: nuevoId('clip'), fuente: FUENTE_PRINCIPAL, entrada: 0, salida: duracionFuente }],
    textos: []
  }
}

/** Una lista de cortes del material (la receta del agente, un momento) en clips. */
export function timelineDesdeCortes(cortes: { start: number; end: number }[], titulo?: string): Timeline {
  const clips = cortes
    .filter((c) => c.end - c.start >= DURACION_MINIMA)
    .map((c) => ({ id: nuevoId('clip'), fuente: FUENTE_PRINCIPAL, entrada: c.start, salida: c.end }))
  const tl: Timeline = { version: 1, clips, textos: [] }
  if (titulo && clips.length > 0) {
    tl.textos.push({
      id: nuevoId('texto'),
      inicio: 0,
      duracion: Math.min(3, duracionTimeline(tl)),
      texto: titulo,
      posicion: 'arriba'
    })
  }
  return tl
}

/** La receta del agente como timeline editable (la velocidad y el color aún no viajan). */
export function timelineDesdeReceta(receta: RecetaEdicion): Timeline {
  return timelineDesdeCortes(receta.cortes, receta.titulo)
}

/**
 * Valida una timeline que viene del disco o de un agente: tiempos dentro del material,
 * ids presentes, textos dentro de la duración. Lo inválido se descarta, no se adivina.
 */
export function normalizarTimeline(entrada: unknown, duracionFuente: number, otras: Record<string, number> = {}): Timeline {
  const crudo = (entrada ?? {}) as Partial<Timeline>
  const clips: ClipTL[] = []
  for (const c of Array.isArray(crudo.clips) ? crudo.clips : []) {
    if (!c || typeof c.entrada !== 'number' || typeof c.salida !== 'number') continue
    const fuente = typeof c.fuente === 'string' && c.fuente ? c.fuente : FUENTE_PRINCIPAL
    // Un clip de un medio que ya no está en el proyecto se descarta.
    const limite = fuente === FUENTE_PRINCIPAL ? duracionFuente : otras[fuente]
    if (limite === undefined) continue
    const e = pinza(c.entrada, 0, limite)
    const s = pinza(c.salida, 0, limite)
    if (s - e < DURACION_MINIMA) continue
    const ajustes = normalizarAjustes(c.ajustes)
    clips.push({
      id: typeof c.id === 'string' && c.id ? c.id : nuevoId('clip'),
      fuente,
      entrada: e,
      salida: s,
      ...(ajustes ? { ajustes } : {}),
      ...(c.mudo === true ? { mudo: true } : {}),
      ...(typeof c.fundido === 'number' && c.fundido >= 0.05 ? { fundido: Math.round(pinza(c.fundido, 0.1, Math.min(MAX_FUNDIDO, (s - e) / 2)) * 100) / 100 } : {})
    })
  }
  const total = clips.reduce((t, c) => t + largo(c), 0)
  const textos: TextoTL[] = []
  for (const t of Array.isArray(crudo.textos) ? crudo.textos : []) {
    if (!t || typeof t.inicio !== 'number' || typeof t.duracion !== 'number') continue
    const inicio = pinza(t.inicio, 0, Math.max(0, total - DURACION_MINIMA))
    const duracion = pinza(t.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio))
    textos.push({
      id: typeof t.id === 'string' && t.id ? t.id : nuevoId('texto'),
      inicio,
      duracion,
      texto: typeof t.texto === 'string' ? t.texto : '',
      posicion: t.posicion === 'arriba' || t.posicion === 'centro' ? t.posicion : 'abajo',
      ...estiloTexto(t)
    })
  }
  const musica = normalizarMusica(crudo.musica)
  const voces = normalizarVoces(crudo.voces, total)
  return { version: 1, clips, textos, ...(musica ? { musica } : {}), ...(voces.length ? { voces } : {}) }
}

/** Las frases de voz válidas: con su audio dentro de `media/` y que empiecen dentro de la timeline. */
export function normalizarVoces(entrada: unknown, total: number): VozTL[] {
  const voces: VozTL[] = []
  for (const v of Array.isArray(entrada) ? (entrada as Partial<VozTL>[]) : []) {
    if (!v || typeof v.inicio !== 'number' || typeof v.duracion !== 'number' || typeof v.archivo !== 'string') continue
    if (!/^media\/[\w.-]+$/.test(v.archivo) || v.archivo.includes('..')) continue
    if (!(v.duracion > 0) || v.inicio >= total - DURACION_MINIMA / 2) continue
    voces.push({
      id: typeof v.id === 'string' && v.id ? v.id : nuevoId('voz'),
      inicio: Math.max(0, v.inicio),
      duracion: v.duracion,
      archivo: v.archivo,
      texto: typeof v.texto === 'string' ? v.texto.slice(0, 600) : '',
      ...(typeof v.volumen === 'number' && Number.isFinite(v.volumen) && Math.abs(v.volumen - 1) > 1e-3 ? { volumen: pinza(v.volumen, 0, 1.5) } : {}),
      ...(typeof v.voz === 'string' && v.voz ? { voz: v.voz.slice(0, 40) } : {})
    })
  }
  return voces.sort((a, b) => a.inicio - b.inicio)
}

/** Pinza cada ajuste a su rango y quita los neutros; sin nada que cambiar, undefined. */
export function normalizarAjustes(entrada: unknown): AjustesClip | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const crudo = entrada as Record<string, unknown>
  const salida: AjustesClip = {}
  for (const clave of Object.keys(LIMITES_AJUSTES) as (keyof AjustesClip)[]) {
    const v = crudo[clave]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const [min, max, neutro] = LIMITES_AJUSTES[clave]
    const valor = Math.round(pinza(v, min, max) * 1000) / 1000
    if (Math.abs(valor - neutro) > 1e-3) salida[clave] = valor
  }
  return Object.keys(salida).length ? salida : undefined
}

/** La música solo puede apuntar a un archivo dentro de la carpeta del proyecto. */
export function normalizarMusica(entrada: unknown): MusicaTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const m = entrada as Record<string, unknown>
  if (typeof m.archivo !== 'string' || !/^media\/[\w.-]+$/.test(m.archivo) || m.archivo.includes('..')) return undefined
  return {
    archivo: m.archivo,
    nombre: typeof m.nombre === 'string' && m.nombre ? m.nombre.slice(0, 120) : m.archivo.slice(6),
    volumen: typeof m.volumen === 'number' && Number.isFinite(m.volumen) ? pinza(m.volumen, 0, 1) : 0.35,
    ducking: m.ducking !== false
  }
}

// ===== Leer =====

export function duracionTimeline(tl: Timeline): number {
  return tl.clips.reduce((total, c) => total + largo(c), 0)
}

export function tramos(tl: Timeline): Tramo[] {
  let inicio = 0
  return tl.clips.map((clip, indice) => {
    const tramo = { clip, indice, inicio, fin: inicio + largo(clip) }
    inicio = tramo.fin
    return tramo
  })
}

/** Qué clip suena en el segundo `t` de la timeline y a qué segundo de la fuente equivale. */
export function ubicar(tl: Timeline, t: number): (Tramo & { tFuente: number }) | null {
  const lista = tramos(tl)
  if (lista.length === 0) return null
  const ultimo = lista[lista.length - 1]
  const tiempo = pinza(t, 0, ultimo.fin)
  const tramo = lista.find((x) => tiempo < x.fin - EPSILON) ?? ultimo
  return { ...tramo, tFuente: tramo.clip.entrada + (tiempo - tramo.inicio) }
}

/** Los ajustes que se ven: los del clip con los neutros por defecto. */
export function ajustesDe(clip: ClipTL | undefined): Required<AjustesClip> {
  return {
    zoom: clip?.ajustes?.zoom ?? 1,
    brillo: clip?.ajustes?.brillo ?? 0,
    contraste: clip?.ajustes?.contraste ?? 1,
    saturacion: clip?.ajustes?.saturacion ?? 1,
    cx: clip?.ajustes?.cx ?? 0.5,
    cy: clip?.ajustes?.cy ?? 0.5,
    acercar: clip?.ajustes?.acercar ?? 0
  }
}

/** Cuánto zoom lleva el clip en un punto de su recorrido (0 al empezar, 1 al acabar). */
export function zoomEn(a: Required<AjustesClip>, avance: number): number {
  return a.zoom * (1 + a.acercar * Math.min(1, Math.max(0, avance)))
}

/** Pone o quita el fundido de entrada de un clip (0 lo quita). */
export function fundirClip(tl: Timeline, id: string | null, segundos: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c, i) => {
      if ((id !== null && c.id !== id) || (id === null && i === 0)) return c
      const { fundido: _antes, ...resto } = c
      const d = Math.round(pinza(segundos, 0, Math.min(MAX_FUNDIDO, largo(c) / 2)) * 100) / 100
      return d >= 0.1 ? { ...resto, fundido: d } : resto
    })
  }
}

export function textosEn(tl: Timeline, t: number): TextoTL[] {
  return tl.textos.filter((x) => t >= x.inicio && t < x.inicio + x.duracion)
}

/** Bordes a los que se pega lo que se arrastra (imán): cortes y rótulos. */
export function puntosIman(tl: Timeline, excluirTexto?: string): number[] {
  const puntos = new Set<number>([0])
  for (const tr of tramos(tl)) {
    puntos.add(tr.inicio)
    puntos.add(tr.fin)
  }
  for (const x of tl.textos) {
    if (x.id === excluirTexto) continue
    puntos.add(x.inicio)
    puntos.add(x.inicio + x.duracion)
  }
  return [...puntos]
}

/**
 * La transcripción vista desde la timeline: cada segmento que cae dentro de un clip,
 * recortado al clip y llevado a tiempo de timeline.
 */
export function vozEnTimeline(
  tl: Timeline,
  transcript: TranscriptSegment[] | undefined
): { id: string; inicio: number; fin: number; texto: string }[] {
  if (!transcript?.length) return []
  const salida: { id: string; inicio: number; fin: number; texto: string }[] = []
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL) continue
    for (const seg of transcript) {
      if (seg.end <= tr.clip.entrada || seg.start >= tr.clip.salida) continue
      const palabras = seg.words.filter((w) => w.end > tr.clip.entrada && w.start < tr.clip.salida)
      const texto = (palabras.length ? palabras.map((w) => w.text).join(' ') : seg.text).trim()
      if (!texto) continue
      const inicio = tr.inicio + Math.max(seg.start, tr.clip.entrada) - tr.clip.entrada
      const fin = tr.inicio + Math.min(seg.end, tr.clip.salida) - tr.clip.entrada
      salida.push({ id: `${tr.clip.id}-${seg.id}`, inicio, fin, texto })
    }
  }
  return salida
}

// ===== Editar =====

/** Mantiene los rótulos dentro de la duración cuando la timeline se acorta. */
function ajustarTextos(textos: TextoTL[], total: number): TextoTL[] {
  return textos
    .filter((x) => x.inicio < total - DURACION_MINIMA / 2)
    .map((x) => (x.inicio + x.duracion > total ? { ...x, duracion: Math.max(DURACION_MINIMA, total - x.inicio) } : x))
}

function conClips(tl: Timeline, clips: ClipTL[]): Timeline {
  const total = clips.reduce((t, c) => t + largo(c), 0)
  // Las frases que quedan fuera al acortar se van, como los rótulos.
  const voces = tl.voces?.filter((v) => v.inicio < total - DURACION_MINIMA / 2)
  const { voces: _antes, ...resto } = tl
  return { ...resto, clips, textos: ajustarTextos(tl.textos, total), ...(voces?.length ? { voces } : {}) }
}

/** Divide el clip que está bajo el segundo `t`. Devuelve la misma timeline si no cabe. */
export function dividir(tl: Timeline, t: number): Timeline {
  const u = ubicar(tl, t)
  if (!u) return tl
  if (u.tFuente - u.clip.entrada < DURACION_MINIMA || u.clip.salida - u.tFuente < DURACION_MINIMA) return tl
  const izquierda: ClipTL = { ...u.clip, salida: u.tFuente }
  const derecha: ClipTL = { ...u.clip, id: nuevoId('clip'), entrada: u.tFuente }
  const clips = [...tl.clips]
  clips.splice(u.indice, 1, izquierda, derecha)
  return { ...tl, clips }
}

/** Quita un clip y cierra el hueco. */
export function borrarClip(tl: Timeline, id: string): Timeline {
  if (!tl.clips.some((c) => c.id === id)) return tl
  return conClips(tl, tl.clips.filter((c) => c.id !== id))
}

/**
 * Mueve un borde del clip a un segundo nuevo de la fuente. El otro borde no se mueve
 * y lo que viene después se corre (ripple).
 */
export function recortarClip(
  tl: Timeline,
  id: string,
  lado: 'entrada' | 'salida',
  segundoFuente: number,
  duracionFuente: number
): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    if (lado === 'entrada') return { ...c, entrada: pinza(segundoFuente, 0, c.salida - DURACION_MINIMA) }
    return { ...c, salida: pinza(segundoFuente, c.entrada + DURACION_MINIMA, duracionFuente) }
  })
  return conClips(tl, clips)
}

/** Lleva un clip a otra posición de la pista principal. */
export function moverClip(tl: Timeline, id: string, destino: number): Timeline {
  const origen = tl.clips.findIndex((c) => c.id === id)
  if (origen < 0) return tl
  const clips = [...tl.clips]
  const [clip] = clips.splice(origen, 1)
  clips.splice(pinza(destino, 0, clips.length), 0, clip)
  return { ...tl, clips }
}

export function duplicarClip(tl: Timeline, id: string): Timeline {
  const indice = tl.clips.findIndex((c) => c.id === id)
  if (indice < 0) return tl
  const clips = [...tl.clips]
  clips.splice(indice + 1, 0, { ...tl.clips[indice], id: nuevoId('clip') })
  return { ...tl, clips }
}

/** Borra un tramo de la timeline (de `desde` a `hasta`) partiendo los clips que toque. */
export function borrarTramo(tl: Timeline, desde: number, hasta: number): Timeline {
  const a = Math.min(desde, hasta)
  const b = Math.max(desde, hasta)
  if (b - a < DURACION_MINIMA / 2) return tl
  const clips: ClipTL[] = []
  for (const tr of tramos(tl)) {
    if (tr.fin <= a || tr.inicio >= b) {
      clips.push(tr.clip)
      continue
    }
    const corteA = tr.clip.entrada + Math.max(0, a - tr.inicio)
    const corteB = tr.clip.entrada + Math.min(largo(tr.clip), b - tr.inicio)
    if (corteA - tr.clip.entrada >= DURACION_MINIMA) clips.push({ ...tr.clip, salida: corteA })
    if (tr.clip.salida - corteB >= DURACION_MINIMA) {
      clips.push({ ...tr.clip, id: corteA - tr.clip.entrada >= DURACION_MINIMA ? nuevoId('clip') : tr.clip.id, entrada: corteB })
    }
  }
  return conClips(tl, clips)
}

/** Cambia zoom o color de un clip (o de todos si `id` es null). Los valores se pinzan. */
export function ajustarClip(tl: Timeline, id: string | null, cambio: AjustesClip): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (id !== null && c.id !== id) return c
      const ajustes = normalizarAjustes({ ...ajustesDe(c), ...cambio })
      const { ajustes: _viejos, ...resto } = c
      return ajustes ? { ...resto, ajustes } : resto
    })
  }
}

export function ponerMusica(tl: Timeline, musica: MusicaTL | undefined): Timeline {
  const { musica: _vieja, ...resto } = tl
  const valida = normalizarMusica(musica)
  return valida ? { ...resto, musica: valida } : resto
}

export function cambiarMusica(tl: Timeline, cambio: Partial<Pick<MusicaTL, 'volumen' | 'ducking'>>): Timeline {
  if (!tl.musica) return tl
  return ponerMusica(tl, { ...tl.musica, ...cambio })
}

/** Lo que dura un clip de imagen al ponerlo (luego se estira como cualquier clip). */
export const DURACION_IMAGEN = 4
/** Lo más que puede durar un clip de imagen. */
export const MAX_IMAGEN = 600

/**
 * Pone un clip de `fuente` en la timeline: al final, o en el segundo `en` (si cae dentro de
 * un clip, lo divide y entra en medio). Devuelve la timeline y el id del clip nuevo.
 */
export function insertarClip(
  tl: Timeline,
  nuevo: { fuente: FuenteId; entrada: number; salida: number },
  en?: number
): { timeline: Timeline; id: string } {
  const clip: ClipTL = { id: nuevoId('clip'), fuente: nuevo.fuente, entrada: nuevo.entrada, salida: Math.max(nuevo.entrada + DURACION_MINIMA, nuevo.salida) }
  if (en === undefined || tl.clips.length === 0 || en >= duracionTimeline(tl) - EPSILON) {
    return { timeline: { ...tl, clips: [...tl.clips, clip] }, id: clip.id }
  }
  let base = en <= EPSILON ? tl : dividir(tl, en)
  // El clip nuevo entra justo después del que acaba en `en`.
  const lista = tramos(base)
  let indice = en <= EPSILON ? 0 : lista.findIndex((t) => Math.abs(t.fin - en) < 0.02) + 1
  if (indice <= 0) indice = lista.findIndex((t) => t.inicio >= en - EPSILON)
  if (indice < 0) indice = lista.length
  const clips = [...base.clips]
  clips.splice(indice, 0, clip)
  base = { ...base, clips }
  return { timeline: base, id: clip.id }
}

/** Lo que puede durar cada medio del proyecto (para validar y recortar sus clips). */
export function duracionesDeMedios(medios?: { id: string; tipo: 'video' | 'imagen'; duracion: number }[]): Record<string, number> {
  return Object.fromEntries((medios ?? []).map((m) => [m.id, m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion]))
}

/** Quita de la timeline todos los clips de una fuente (al quitar un medio del proyecto). */
export function quitarFuente(tl: Timeline, fuente: FuenteId): Timeline {
  return conClips(tl, tl.clips.filter((c) => c.fuente !== fuente))
}

export function anadirTexto(tl: Timeline, inicio: number, texto = 'Texto'): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const id = nuevoId('texto')
  if (total < DURACION_MINIMA) return { timeline: tl, id }
  const desde = pinza(inicio, 0, Math.max(0, total - DURACION_MINIMA))
  const nuevo: TextoTL = {
    id,
    inicio: desde,
    duracion: Math.min(3, total - desde),
    texto,
    posicion: 'abajo'
  }
  return { timeline: { ...tl, textos: [...tl.textos, nuevo] }, id }
}

/** Cambia un rótulo; posición y duración siempre quedan dentro de la timeline. */
export function cambiarTexto(tl: Timeline, id: string, cambio: Partial<Omit<TextoTL, 'id'>>): Timeline {
  const total = duracionTimeline(tl)
  return {
    ...tl,
    textos: tl.textos.map((x) => {
      if (x.id !== id) return x
      const { tamano: _t, color: _c, sinCaja: _s, fuente: _f, ...base } = { ...x, ...cambio }
      const nuevo: TextoTL = { ...base, ...estiloTexto({ ...x, ...cambio }) }
      nuevo.inicio = pinza(nuevo.inicio, 0, Math.max(0, total - DURACION_MINIMA))
      nuevo.duracion = pinza(nuevo.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - nuevo.inicio))
      return nuevo
    })
  }
}

export function borrarTexto(tl: Timeline, id: string): Timeline {
  return { ...tl, textos: tl.textos.filter((x) => x.id !== id) }
}

// ===== La narración =====

/** En qué tramos suena la narración (para bajar la música y dibujar la pista). */
export function tramosDeVoces(tl: Timeline): { inicio: number; fin: number }[] {
  return (tl.voces ?? []).map((v) => ({ inicio: v.inicio, fin: v.inicio + v.duracion }))
}

/** Cambia una frase (su segundo, su volumen, su texto o su audio). Siempre empieza dentro de la timeline. */
export function cambiarVoz(tl: Timeline, id: string, cambio: Partial<Omit<VozTL, 'id'>>): Timeline {
  if (!tl.voces?.some((v) => v.id === id)) return tl
  const total = duracionTimeline(tl)
  const voces = normalizarVoces(
    tl.voces.map((v) => (v.id === id ? { ...v, ...cambio, inicio: pinza((cambio.inicio ?? v.inicio), 0, Math.max(0, total - DURACION_MINIMA)) } : v)),
    total
  )
  return { ...tl, voces }
}

export function borrarVoz(tl: Timeline, id: string): Timeline {
  if (!tl.voces?.some((v) => v.id === id)) return tl
  const voces = tl.voces.filter((v) => v.id !== id)
  const { voces: _antes, ...resto } = tl
  return voces.length ? { ...resto, voces } : resto
}

/** Quita el sonido de un clip o se lo devuelve. */
export function silenciarClip(tl: Timeline, id: string, mudo: boolean): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const { mudo: _antes, ...resto } = c
      return mudo ? { ...resto, mudo: true } : resto
    })
  }
}

/** Añade una frase de narración (su audio ya está en `media/`). Devuelve la timeline y su id. */
export function anadirVoz(tl: Timeline, frase: Omit<VozTL, 'id'>): { timeline: Timeline; id: string } {
  const id = nuevoId('voz')
  const voces = normalizarVoces([...(tl.voces ?? []), { ...frase, id }], duracionTimeline(tl))
  if (!voces.some((v) => v.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, voces }, id }
}

/**
 * Cambia el archivo de un clip por otro medio del proyecto (otra foto, otro video) sin mover
 * nada: conserva su lugar y su duración. `duracionNueva` es lo que dura el medio nuevo
 * (en una imagen, lo que se quiera); si es más corto que el clip, el clip se acorta.
 */
export function cambiarFuente(tl: Timeline, id: string, fuente: FuenteId, duracionNueva: number): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    const cuanto = Math.min(largo(c), Math.max(DURACION_MINIMA, duracionNueva))
    // Otra foto: desde 0. Otro video: desde su principio (el punto de entrada anterior no significa nada en el nuevo).
    return { ...c, fuente, entrada: 0, salida: cuanto }
  })
  return conClips(tl, clips)
}
