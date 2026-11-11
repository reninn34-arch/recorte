import type { RecetaEdicion, TranscriptSegment } from './types'

/**
 * La timeline: la pieza central del editor. La interfaz y los agentes trabajan sobre
 * este mismo documento; el reproductor lo sigue y el render lo exporta.
 *
 * - `clips` es la pista principal, magnética: los clips van uno tras otro, sin huecos.
 *   Su posición en la timeline sale del orden, así que borrar o recortar cierra el hueco
 *   solo (ripple), como en CapCut o en la pista principal de Final Cut.
 * - `textos` es una pista libre de rótulos con posición absoluta.
 * - `capas` va encima del video: imágenes, logos, íconos o tomas de apoyo, cada una en su sitio.
 * - `sonidos` son efectos sueltos (un «whoosh» en un corte, un «pop» al entrar un rótulo).
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
  /** Cómo entra en esos segundos: barrido, zoom, desenfoque, destello, círculo (sin él, fundido). */
  transicion?: TransicionClip
}

export const MAX_FUNDIDO = 1.5

/** Cómo entra un clip sobre el anterior (con `fundido` = lo que dura). Sin tipo, un fundido cruzado. */
export type TransicionClip =
  | 'fundido'
  | 'barrido-izquierda'
  | 'barrido-derecha'
  | 'barrido-arriba'
  | 'barrido-abajo'
  | 'zoom'
  | 'desenfoque'
  | 'destello'
  | 'circulo'

/** Las transiciones, con su nombre y la de FFmpeg (`xfade`) que la hace en el MP4. */
export const TRANSICIONES: { id: TransicionClip; nombre: string; xfade: string }[] = [
  { id: 'fundido', nombre: 'Fundido', xfade: 'fade' },
  { id: 'barrido-izquierda', nombre: 'Barrido ←', xfade: 'slideleft' },
  { id: 'barrido-derecha', nombre: 'Barrido →', xfade: 'slideright' },
  { id: 'barrido-arriba', nombre: 'Barrido ↑', xfade: 'slideup' },
  { id: 'barrido-abajo', nombre: 'Barrido ↓', xfade: 'slidedown' },
  { id: 'zoom', nombre: 'Zoom', xfade: 'zoomin' },
  { id: 'desenfoque', nombre: 'Desenfoque', xfade: 'hblur' },
  { id: 'destello', nombre: 'Destello', xfade: 'fadewhite' },
  { id: 'circulo', nombre: 'Círculo', xfade: 'circleopen' }
]

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
  /**
   * Acercamiento lento durante el clip (Ken Burns, o un dolly de cámara): cuánto crece al final, 0 a 0.3; 0 quieto.
   * Negativo, se aleja (hasta -0.3): necesita zoom para tener de dónde alejarse.
   */
  acercar?: number
  /**
   * Paneo: cuánto se desplaza el centro del encuadre al acabar el clip, -0.5 (izquierda) a 0.5 (derecha);
   * 0 quieto. Solo se nota con zoom (hace falta imagen de sobra para moverse).
   */
  panx?: number
  /** Lo mismo en vertical: -0.5 (sube) a 0.5 (baja). */
  pany?: number
  /** Cámara en mano: un vaivén suave e irregular, 0 a 1; 0 trípode. Lo cercano (capas con profundidad) se mueve más. */
  temblor?: number
  /**
   * Profundidad de campo, 0 a 1 (0 todo nítido): lo que está lejos del `foco` se desenfoca, más cuanto más lejos.
   * El fondo (el clip) está a profundidad 0; las capas, a la suya.
   */
  campo?: number
  /** La distancia enfocada, 0 (el fondo) a 1 (lo más cercano). */
  foco?: number
}

export const LIMITES_AJUSTES = {
  zoom: [1, 2, 1],
  brillo: [-0.3, 0.3, 0],
  contraste: [0.5, 1.8, 1],
  saturacion: [0, 2, 1],
  cx: [0, 1, 0.5],
  cy: [0, 1, 0.5],
  acercar: [-0.3, 0.3, 0],
  panx: [-0.5, 0.5, 0],
  pany: [-0.5, 0.5, 0],
  temblor: [0, 1, 0],
  campo: [0, 1, 0],
  foco: [0, 1, 0.5]
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
  /** El color de la caja (`#rrggbb`); sin él, negra semitransparente. */
  caja?: string
  /**
   * Posición libre: el centro del rótulo en fracción del cuadro (0 izquierda/arriba, 1 derecha/abajo).
   * Con ella manda sobre `posicion`; sin ella, va arriba, al centro o abajo.
   */
  x?: number
  y?: number
  /** La letra (una clave de FUENTES_TEXTO); sin ella, la normal. */
  fuente?: string
  /** Cómo aparece: palabra a palabra, letra a letra (máquina), con rebote (pop) o subiendo. Sin ella, de golpe. */
  animacion?: AnimacionTexto
}

export type AnimacionTexto = 'palabras' | 'maquina' | 'pop' | 'subir'
export const ANIMACIONES_TEXTO: { id: AnimacionTexto; nombre: string }[] = [
  { id: 'palabras', nombre: 'Palabra a palabra' },
  { id: 'maquina', nombre: 'Letra a letra' },
  { id: 'pop', nombre: 'Con rebote' },
  { id: 'subir', nombre: 'Subiendo' }
]

/** Segundos entre palabra y palabra (o letra y letra) de un rótulo animado: lo mismo en el monitor y en el MP4. */
export function pasoAnimacion(t: Pick<TextoTL, 'texto' | 'animacion'>): number {
  if (t.animacion === 'palabras') return Math.min(0.22, 1.4 / Math.max(1, t.texto.split(/\s+/).filter(Boolean).length))
  if (t.animacion === 'maquina') return Math.min(0.045, 1.6 / Math.max(1, t.texto.replace(/\s/g, '').length))
  return 0
}

/** Lo que dura una palabra (o una letra) en aparecer. */
export const APARECER_S = 0.15

/**
 * Las letras de los rótulos. Son fuentes que trae Windows: el monitor (CSS) y el render
 * (libass) usan la misma, así lo que se ve es lo que se exporta.
 */
export const FUENTES_TEXTO: Record<string, { nombre: string; familia: string; negrita: boolean; cursiva?: boolean }> = {
  normal: { nombre: 'Normal', familia: 'Arial', negrita: true },
  fina: { nombre: 'Fina', familia: 'Segoe UI', negrita: false },
  gruesa: { nombre: 'Gruesa', familia: 'Arial Black', negrita: false },
  impacto: { nombre: 'Impacto', familia: 'Impact', negrita: false },
  elegante: { nombre: 'Elegante', familia: 'Playfair Display', negrita: true },
  cursiva: { nombre: 'Cursiva', familia: 'Playfair Display', negrita: true, cursiva: true },
  titular: { nombre: 'Titular', familia: 'Anton', negrita: false },
  maquina: { nombre: 'Máquina', familia: 'Courier New', negrita: true }
}

export const LIMITES_TAMANO = [0.5, 6] as const
const COLOR_HEX = /^#[0-9a-f]{6}$/i

/** El estilo de un rótulo, limpio: lo neutro no se guarda. */
function estiloTexto(t: Partial<TextoTL>): Pick<TextoTL, 'tamano' | 'color' | 'sinCaja' | 'fuente' | 'caja' | 'animacion'> {
  const tamano = typeof t.tamano === 'number' && Number.isFinite(t.tamano) ? Math.round(pinza(t.tamano, LIMITES_TAMANO[0], LIMITES_TAMANO[1]) * 100) / 100 : 1
  const color = typeof t.color === 'string' && COLOR_HEX.test(t.color) ? t.color.toLowerCase() : '#ffffff'
  return {
    ...(Math.abs(tamano - 1) > 0.005 ? { tamano } : {}),
    ...(color !== '#ffffff' ? { color } : {}),
    ...(t.sinCaja === true ? { sinCaja: true } : {}),
    ...(typeof t.caja === 'string' && COLOR_HEX.test(t.caja) ? { caja: t.caja.toLowerCase() } : {}),
    ...(typeof t.fuente === 'string' && t.fuente !== 'normal' && t.fuente in FUENTES_TEXTO ? { fuente: t.fuente } : {}),
    ...(t.animacion && ANIMACIONES_TEXTO.some((a) => a.id === t.animacion) ? { animacion: t.animacion } : {})
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

/** Cómo entra una capa: con un pequeño rebote o fundiéndose; sin él, de golpe. */
export type EntradaCapa = 'pop' | 'fundido' | 'izquierda' | 'derecha' | 'arriba' | 'abajo'
export const ENTRADAS_CAPA: EntradaCapa[] = ['pop', 'fundido', 'izquierda', 'derecha', 'arriba', 'abajo']

/** Dónde termina una capa que se mueve: va de su sitio, tamaño y giro de inicio a estos, suavemente. */
export interface FinCapa {
  x: number
  y: number
  ancho: number
  /** Grados (positivo = a favor del reloj). */
  giro: number
}

/**
 * Algo encima del video (una pista apilada): una imagen, un logo, un ícono o una toma de apoyo
 * de la biblioteca, en su sitio y su tamaño. Va suelta, como un rótulo.
 */
export interface CapaTL {
  id: string
  /** Un medio del proyecto (imagen o video). */
  fuente: FuenteId
  /** Segundo de la timeline donde aparece. */
  inicio: number
  duracion: number
  /** El centro, en fracción del cuadro: 0 (izquierda/arriba) a 1 (derecha/abajo). */
  x: number
  y: number
  /** El ancho, en fracción del ancho del cuadro: 0.05 a 1 (1 = de borde a borde). */
  ancho: number
  entrada?: EntradaCapa
  /** Si es un video: el segundo del medio desde donde se ve. */
  desde?: number
  /** Giro al empezar, en grados (positivo = a favor del reloj). */
  giro?: number
  /** Si se mueve: dónde, de qué tamaño y con qué giro termina (si no, se queda quieta). */
  fin?: FinCapa
  /**
   * Una imagen recortada animada (respira, se balancea, ondea, flota, humo): `fuente` es su animación en
   * bucle (un WebM con transparencia) y `base` la imagen de la que sale, para cambiarla o volver a ella.
   */
  animada?: { tipo: TipoAnimar; base: FuenteId; escala?: number }
  /**
   * Escena 2.5D: a qué distancia está la capa, 0 (pegada al fondo: se mueve con él) a 1 (muy cerca de la
   * cámara: se mueve y crece 2,5 veces más que el fondo). Sin ella, la capa no sigue a la cámara.
   */
  profundidad?: number
  /** Desenfoque (como lo que está fuera de foco, muy cerca o muy lejos), 0 a 1; 0 nítida. */
  desenfoque?: number
}

export type TipoAnimar =
  | 'respirar'
  | 'balanceo'
  | 'ondear'
  | 'flotar'
  | 'humo'
  | 'hablar'
  | 'asentir'
  | 'ladear'
  | 'peso'
  | 'saludar'
  | 'senalar'
  | 'explicar'
/**
 * Cómo se puede animar una imagen recortada sin gastar créditos: deformándola (respira, ondea…) o, si es una
 * persona, como marioneta por huesos (`marioneta`: mueve la cabeza, los brazos, el peso del cuerpo).
 */
export const ANIMAR_CAPA: { id: TipoAnimar; nombre: string; para: string; marioneta?: boolean }[] = [
  { id: 'respirar', nombre: 'Respira', para: 'una persona quieta que respira' },
  { id: 'balanceo', nombre: 'Se balancea', para: 'una persona de pie que se mece' },
  { id: 'ondear', nombre: 'Ondea', para: 'una bandera o una tela al viento' },
  { id: 'flotar', nombre: 'Flota', para: 'algo que sube y baja despacio' },
  { id: 'humo', nombre: 'Humo', para: 'humo, nubes o fuego que se agitan' },
  { id: 'hablar', nombre: 'Marioneta: habla', para: 'una persona que cuenta algo: mueve la cabeza y las manos', marioneta: true },
  { id: 'asentir', nombre: 'Marioneta: asiente', para: 'una persona que dice que sí con la cabeza', marioneta: true },
  { id: 'ladear', nombre: 'Marioneta: ladea la cabeza', para: 'una persona que duda o escucha', marioneta: true },
  { id: 'peso', nombre: 'Marioneta: cambia el peso', para: 'una persona de pie que pasa el peso de un pie al otro', marioneta: true },
  { id: 'saludar', nombre: 'Marioneta: saluda', para: 'una persona que saluda con la mano (brazos separados del cuerpo)', marioneta: true },
  { id: 'senalar', nombre: 'Marioneta: señala', para: 'una persona que señala a un lado (brazos separados del cuerpo)', marioneta: true },
  { id: 'explicar', nombre: 'Marioneta: explica', para: 'una persona que abre los brazos al explicar (brazos separados)', marioneta: true }
]
/** La animación deja un margen del 8 % por lado: la capa animada mide esto más para que la imagen se vea igual. */
export const MARGEN_ANIMAR = 1.16
/** Cuánto más ancha que su imagen es una capa animada (la marioneta deja sitio a los brazos según el gesto). */
export function escalaAnimada(c: Pick<CapaTL, 'animada'>): number {
  return c.animada?.escala ?? MARGEN_ANIMAR
}

/**
 * Los filtros de todo el video, de 0 (nada) a 1 (fuerte): el aspecto de película o de imprenta
 * de los documentales. Se ven en el monitor y salen igual en el MP4.
 */
export interface FiltrosTL {
  /** Grano de película que se mueve. */
  grano?: number
  /** Motas de polvo y rayas que aparecen y desaparecen. */
  polvo?: number
  /** Trama de puntos de imprenta, como una revista. */
  trama?: number
  /** Bordes oscuros. */
  vineta?: number
  /** La luz que tiembla un poco, como un proyector. */
  parpadeo?: number
}

export const FILTROS: { id: keyof FiltrosTL; nombre: string; para: string }[] = [
  { id: 'grano', nombre: 'Grano', para: 'el grano de película' },
  { id: 'polvo', nombre: 'Polvo', para: 'motas y rayas de película vieja' },
  { id: 'trama', nombre: 'Trama', para: 'los puntos de imprenta de una revista' },
  { id: 'vineta', nombre: 'Viñeta', para: 'los bordes oscuros' },
  { id: 'parpadeo', nombre: 'Parpadeo', para: 'la luz que tiembla, como un proyector' }
]

/** Un efecto de sonido suelto en su segundo (su audio está en `media/`). */
export interface SonidoTL {
  id: string
  inicio: number
  duracion: number
  /** Ruta relativa dentro de la carpeta del proyecto (`media/…`). */
  archivo: string
  nombre: string
  /** 0 a 1.5; sin él, 0.6 (por debajo de la voz). */
  volumen?: number
}

export const VOLUMEN_SONIDO = 0.6

export interface Timeline {
  version: 1
  clips: ClipTL[]
  textos: TextoTL[]
  musica?: MusicaTL
  /** La narración, frase a frase. */
  voces?: VozTL[]
  /** Lo que va encima del video (imágenes, logos, íconos, tomas de apoyo). */
  capas?: CapaTL[]
  /** Efectos de sonido sueltos. */
  sonidos?: SonidoTL[]
  /** Grano, polvo, trama, viñeta y parpadeo de todo el video. */
  filtros?: FiltrosTL
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
      ...(typeof c.fundido === 'number' && c.fundido >= 0.05 ? { fundido: Math.round(pinza(c.fundido, 0.1, Math.min(MAX_FUNDIDO, (s - e) / 2)) * 100) / 100 } : {}),
      ...(typeof c.fundido === 'number' && c.fundido >= 0.05 && c.transicion && c.transicion !== 'fundido' && TRANSICIONES.some((x) => x.id === c.transicion)
        ? { transicion: c.transicion }
        : {})
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
      ...estiloTexto(t),
      ...posicionLibre(t)
    })
  }
  const musica = normalizarMusica(crudo.musica)
  const voces = normalizarVoces(crudo.voces, total)
  const capas = normalizarCapas(crudo.capas, total, { [FUENTE_PRINCIPAL]: duracionFuente, ...otras })
  const sonidos = normalizarSonidos(crudo.sonidos, total)
  const filtros = normalizarFiltros(crudo.filtros)
  return {
    version: 1,
    clips,
    textos,
    ...(musica ? { musica } : {}),
    ...(voces.length ? { voces } : {}),
    ...(capas.length ? { capas } : {}),
    ...(sonidos.length ? { sonidos } : {}),
    ...(filtros ? { filtros } : {})
  }
}

/** Los filtros válidos (0 a 1); lo que está en 0 no se guarda. Sin ninguno, undefined. */
export function normalizarFiltros(entrada: unknown): FiltrosTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const x = entrada as Record<string, unknown>
  const out: FiltrosTL = {}
  for (const { id } of FILTROS) {
    const v = x[id]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0.005) out[id] = Math.round(pinza(v, 0, 1) * 100) / 100
  }
  return Object.keys(out).length ? out : undefined
}

/** Cambia los filtros del video (un valor 0 quita ese filtro). */
export function cambiarFiltros(tl: Timeline, cambio: FiltrosTL): Timeline {
  const filtros = normalizarFiltros({ ...(tl.filtros ?? {}), ...cambio })
  const { filtros: _antes, ...resto } = tl
  return filtros ? { ...resto, filtros } : resto
}

/** La posición libre de un rótulo, si la tiene y es válida. */
function posicionLibre(t: Partial<TextoTL>): Pick<TextoTL, 'x' | 'y'> {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  return ok(t.x) && ok(t.y) ? { x: Math.round(pinza(t.x, 0, 1) * 1000) / 1000, y: Math.round(pinza(t.y, 0, 1) * 1000) / 1000 } : {}
}

/** Las capas válidas: de un medio que existe, dentro de la timeline y del cuadro. */
export function normalizarCapas(entrada: unknown, total: number, medios: Record<string, number>): CapaTL[] {
  const capas: CapaTL[] = []
  for (const c of Array.isArray(entrada) ? (entrada as Partial<CapaTL>[]) : []) {
    if (!c || typeof c.inicio !== 'number' || typeof c.duracion !== 'number' || typeof c.fuente !== 'string') continue
    if (medios[c.fuente] === undefined || c.inicio >= total - DURACION_MINIMA / 2) continue
    const inicio = pinza(c.inicio, 0, Math.max(0, total - DURACION_MINIMA))
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
    capas.push({
      id: typeof c.id === 'string' && c.id ? c.id : nuevoId('capa'),
      fuente: c.fuente,
      inicio,
      duracion: pinza(c.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio)),
      x: Math.round(pinza(num(c.x, 0.5), 0, 1) * 1000) / 1000,
      y: Math.round(pinza(num(c.y, 0.5), 0, 1) * 1000) / 1000,
      ancho: Math.round(pinza(num(c.ancho, 0.3), 0.05, 2) * 1000) / 1000,
      ...(c.entrada && ENTRADAS_CAPA.includes(c.entrada) ? { entrada: c.entrada } : {}),
      ...(typeof c.desde === 'number' && c.desde > 0 ? { desde: Math.min(c.desde, Math.max(0, medios[c.fuente] - DURACION_MINIMA)) } : {}),
      ...(Math.abs(num(c.giro, 0)) > 0.05 ? { giro: Math.round(pinza(num(c.giro, 0), -720, 720) * 10) / 10 } : {}),
      ...(c.fin && typeof c.fin === 'object'
        ? {
            fin: {
              // Fuera del cuadro se puede (entrar o salir volando), hasta media pantalla.
              x: Math.round(pinza(num(c.fin.x, num(c.x, 0.5)), -0.5, 1.5) * 1000) / 1000,
              y: Math.round(pinza(num(c.fin.y, num(c.y, 0.5)), -0.5, 1.5) * 1000) / 1000,
              ancho: Math.round(pinza(num(c.fin.ancho, num(c.ancho, 0.3)), 0.05, 2) * 1000) / 1000,
              giro: Math.round(pinza(num(c.fin.giro, num(c.giro, 0)), -720, 720) * 10) / 10
            }
          }
        : {}),
      ...(c.animada && medios[c.animada.base] !== undefined && ANIMAR_CAPA.some((a) => a.id === c.animada!.tipo)
        ? {
            animada: {
              tipo: c.animada.tipo,
              base: c.animada.base,
              ...(typeof c.animada.escala === 'number' && c.animada.escala >= 1 && c.animada.escala <= 4 ? { escala: c.animada.escala } : {})
            }
          }
        : {}),
      ...(typeof c.profundidad === 'number' && Number.isFinite(c.profundidad) ? { profundidad: Math.round(pinza(c.profundidad, 0, 1) * 100) / 100 } : {}),
      ...(num(c.desenfoque, 0) > 0.005 ? { desenfoque: Math.round(pinza(num(c.desenfoque, 0), 0, 1) * 100) / 100 } : {})
    })
  }
  return capas.sort((a, b) => a.inicio - b.inicio)
}

/** Los sonidos válidos: con su audio dentro de `media/` y que empiecen dentro de la timeline. */
export function normalizarSonidos(entrada: unknown, total: number): SonidoTL[] {
  const sonidos: SonidoTL[] = []
  for (const s of Array.isArray(entrada) ? (entrada as Partial<SonidoTL>[]) : []) {
    if (!s || typeof s.inicio !== 'number' || typeof s.duracion !== 'number' || typeof s.archivo !== 'string') continue
    if (!/^media\/[\w.-]+$/.test(s.archivo) || s.archivo.includes('..')) continue
    if (!(s.duracion > 0) || s.inicio >= total - DURACION_MINIMA / 2) continue
    sonidos.push({
      id: typeof s.id === 'string' && s.id ? s.id : nuevoId('sonido'),
      inicio: Math.max(0, s.inicio),
      duracion: s.duracion,
      archivo: s.archivo,
      nombre: typeof s.nombre === 'string' && s.nombre ? s.nombre.slice(0, 60) : 'Sonido',
      ...(typeof s.volumen === 'number' && Number.isFinite(s.volumen) && Math.abs(s.volumen - VOLUMEN_SONIDO) > 1e-3 ? { volumen: pinza(s.volumen, 0, 1.5) } : {})
    })
  }
  return sonidos.sort((a, b) => a.inicio - b.inicio)
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
    acercar: clip?.ajustes?.acercar ?? 0,
    panx: clip?.ajustes?.panx ?? 0,
    pany: clip?.ajustes?.pany ?? 0,
    temblor: clip?.ajustes?.temblor ?? 0,
    campo: clip?.ajustes?.campo ?? 0,
    foco: clip?.ajustes?.foco ?? 0.5
  }
}

/** Cámara en mano: cuánto se mueve (fracción del cuadro con temblor 1) y cuánto zoom de más le deja sitio. */
export const TEMBLOR_AMPLITUD = 0.007
export const TEMBLOR_ZOOM = 0.04
/**
 * El vaivén de la cámara en mano en el segundo `s` del clip, de -1 a 1 en cada eje: tres ondas lentas que no
 * se repiten a la vista. Igual en el monitor, el MP4 (las mismas ondas en FFmpeg) y el kit.
 */
export function vaiven(s: number): { x: number; y: number } {
  const P = 2 * Math.PI
  return {
    x: 0.6 * Math.sin(P * 0.53 * s) + 0.3 * Math.sin(P * 1.37 * s + 1.3) + 0.1 * Math.sin(P * 3.1 * s + 2.1),
    y: 0.6 * Math.sin(P * 0.41 * s + 0.7) + 0.3 * Math.sin(P * 1.13 * s + 2.4) + 0.1 * Math.sin(P * 2.7 * s + 0.4)
  }
}

/** Cuánto se desenfoca algo a la profundidad `p` con la profundidad de campo del clip (0 a 1). */
export function desenfoqueDeCampo(a: Required<AjustesClip>, p: number): number {
  return a.campo > 0 ? Math.min(1, a.campo * Math.abs(p - a.foco) * 1.5) : 0
}

/**
 * La cámara de un clip en un punto de su recorrido (0 al empezar, 1 al acabar): el zoom y el punto
 * hacia el que se acerca (cx, cy), con el paneo suave (empieza y acaba despacio). Igual en el MP4.
 */
export function camaraEn(a: Required<AjustesClip>, avance: number, segundos = 0): { z: number; cx: number; cy: number } {
  const q = Math.min(1, Math.max(0, avance))
  const e = 3 * q * q - 2 * q * q * q
  const z = zoomEn(a, q)
  // La cámara en mano mueve el encuadre una fracción fija del cuadro: en el punto de zoom, eso es más cuanto menos zoom.
  const v = a.temblor ? vaiven(segundos) : { x: 0, y: 0 }
  const k = a.temblor ? (TEMBLOR_AMPLITUD * a.temblor) / Math.max(1e-3, z - 1) : 0
  return { z, cx: Math.min(1, Math.max(0, a.cx + a.panx * e + k * v.x)), cy: Math.min(1, Math.max(0, a.cy + a.pany * e + k * v.y)) }
}

/** Cuánto zoom lleva el clip en un punto de su recorrido (0 al empezar, 1 al acabar). */
export function zoomEn(a: Required<AjustesClip>, avance: number): number {
  return Math.max(1, a.zoom * (1 + a.acercar * Math.min(1, Math.max(0, avance)))) * (1 + TEMBLOR_ZOOM * a.temblor)
}

/**
 * Pone o quita la transición de entrada de un clip (0 segundos la quita: corte seco). `tipo` cambia
 * cómo entra (barrido, zoom…); sin él, se queda el que tenía. Con `id` null, a todos menos el primero.
 */
export function fundirClip(tl: Timeline, id: string | null, segundos: number, tipo?: TransicionClip): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c, i) => {
      if ((id !== null && c.id !== id) || (id === null && i === 0)) return c
      const { fundido: _antes, transicion: tipoAntes, ...resto } = c
      const d = Math.round(pinza(segundos, 0, Math.min(MAX_FUNDIDO, largo(c) / 2)) * 100) / 100
      const t = tipo ?? tipoAntes
      return d >= 0.1 ? { ...resto, fundido: d, ...(t && t !== 'fundido' ? { transicion: t } : {}) } : resto
    })
  }
}

/**
 * Cómo se ve en el monitor el clip que entra con su transición, `p` de 0 (empieza) a 1 (ya entró):
 * desplazamiento, escala, desenfoque, opacidad, recorte en círculo y un velo blanco (destello).
 */
export function vistaTransicion(
  tipo: TransicionClip | undefined,
  p: number
): {
  x: number
  y: number
  escala: number
  desenfoque: number
  opacidad: number
  circulo: number | null
  blanco: number
  /** El clip anterior, debajo: cómo sale (se empuja en un barrido, se acerca en el zoom, se queda en un fundido). */
  previo: { x: number; y: number; escala: number; opacidad: number }
} {
  const q = pinza(p, 0, 1)
  const e = 1 - (1 - q) ** 3
  const quieto = { x: 0, y: 0, escala: 1, opacidad: 1 }
  const base = { x: 0, y: 0, escala: 1, desenfoque: 0, opacidad: 1, circulo: null as number | null, blanco: 0, previo: quieto }
  switch (tipo) {
    case 'barrido-izquierda':
      return { ...base, x: 1 - e, previo: { ...quieto, x: -e } }
    case 'barrido-derecha':
      return { ...base, x: -(1 - e), previo: { ...quieto, x: e } }
    case 'barrido-arriba':
      return { ...base, y: 1 - e, previo: { ...quieto, y: -e } }
    case 'barrido-abajo':
      return { ...base, y: -(1 - e), previo: { ...quieto, y: e } }
    case 'zoom':
      return { ...base, escala: 1.25 - 0.25 * e, opacidad: q, previo: { ...quieto, escala: 1 + 0.35 * e } }
    case 'desenfoque':
      return { ...base, desenfoque: (1 - q) * 14, opacidad: Math.min(1, q * 1.6) }
    case 'destello':
      return { ...base, opacidad: q < 0.5 ? 0 : 1, blanco: 1 - Math.abs(2 * q - 1), previo: { ...quieto, opacidad: q < 0.5 ? 1 : 0 } }
    case 'circulo':
      return { ...base, circulo: e }
    default:
      return { ...base, opacidad: q }
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
  const capas = tl.capas
    ?.filter((c) => c.inicio < total - DURACION_MINIMA / 2)
    .map((c) => (c.inicio + c.duracion > total ? { ...c, duracion: Math.max(DURACION_MINIMA, total - c.inicio) } : c))
  const sonidos = tl.sonidos?.filter((s) => s.inicio < total - DURACION_MINIMA / 2)
  const { voces: _antes, capas: _c, sonidos: _s, ...resto } = tl
  return {
    ...resto,
    clips,
    textos: ajustarTextos(tl.textos, total),
    ...(voces?.length ? { voces } : {}),
    ...(capas?.length ? { capas } : {}),
    ...(sonidos?.length ? { sonidos } : {})
  }
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
  const sin = conClips(tl, tl.clips.filter((c) => c.fuente !== fuente))
  // Sus capas encima también se van.
  return sin.capas?.some((c) => c.fuente === fuente) ? sin.capas.filter((c) => c.fuente === fuente).reduce((t, c) => borrarCapa(t, c.id), sin) : sin
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
      const { tamano: _t, color: _c, sinCaja: _s, fuente: _f, caja: _k, x: _x, y: _y, animacion: _a, ...base } = { ...x, ...cambio }
      // Elegir arriba, centro o abajo suelta la posición libre; mover el rótulo la fija.
      const libre = cambio.posicion !== undefined && cambio.x === undefined ? {} : posicionLibre({ ...x, ...cambio })
      const nuevo: TextoTL = { ...base, ...estiloTexto({ ...x, ...cambio }), ...libre }
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

// ===== Lo que va encima del video (capas) =====

/** Las capas visibles en el segundo `t`, de abajo a arriba. */
export function capasEn(tl: Timeline, t: number): CapaTL[] {
  return (tl.capas ?? []).filter((c) => t >= c.inicio && t < c.inicio + c.duracion)
}

/** Pone un medio encima del video. `medios`: lo que dura cada uno (para validar). */
export function anadirCapa(tl: Timeline, capa: Omit<CapaTL, 'id'>, medios: Record<string, number>): { timeline: Timeline; id: string } {
  const id = nuevoId('capa')
  const capas = normalizarCapas([...(tl.capas ?? []), { ...capa, id }], duracionTimeline(tl), medios)
  if (!capas.some((c) => c.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, capas }, id }
}

/**
 * Una capa nueva con lo de siempre: una imagen 3 s y al 25 % del ancho, un video hasta 5 s y al
 * 40 %, con «pop», en el segundo `t` y donde se suelte (`x`, `y`; por defecto, al centro).
 */
export function capaNueva(
  tl: Timeline,
  fuente: string,
  tipo: 'video' | 'imagen',
  t: number,
  medios: Record<string, number>,
  x = 0.5,
  y = 0.5
): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const inicio = Math.max(0, Math.min(t, total - DURACION_MINIMA))
  const largo = tipo === 'imagen' ? 3 : Math.min(Math.max(DURACION_MINIMA, medios[fuente] ?? 3), 5)
  return anadirCapa(
    tl,
    { fuente, inicio, duracion: Math.min(largo, Math.max(DURACION_MINIMA, total - inicio)), x, y, ancho: tipo === 'imagen' ? 0.25 : 0.4, entrada: 'pop' },
    medios
  )
}

export function cambiarCapa(tl: Timeline, id: string, cambio: Partial<Omit<CapaTL, 'id'>>, medios: Record<string, number>): Timeline {
  if (!tl.capas?.some((c) => c.id === id)) return tl
  const capas = normalizarCapas(
    tl.capas.map((c) => {
      if (c.id !== id) return c
      const nueva = { ...c, ...cambio }
      // `entrada: undefined` en el cambio la quita (entra de golpe); `fin: undefined`, el movimiento.
      if ('entrada' in cambio && !cambio.entrada) delete nueva.entrada
      if ('fin' in cambio && !cambio.fin) delete nueva.fin
      if ('animada' in cambio && !cambio.animada) delete nueva.animada
      if ('profundidad' in cambio && cambio.profundidad == null) delete nueva.profundidad
      return nueva
    }),
    duracionTimeline(tl),
    medios
  )
  return { ...tl, capas }
}

export function borrarCapa(tl: Timeline, id: string): Timeline {
  if (!tl.capas?.some((c) => c.id === id)) return tl
  const capas = tl.capas.filter((c) => c.id !== id)
  const { capas: _antes, ...resto } = tl
  return capas.length ? { ...resto, capas } : resto
}

/** Lo que tarda en llegar una capa que entra desde un lado. */
export const ENTRADA_LADO_S = 0.45
const suave = (p: number) => 3 * p * p - 2 * p * p * p
const frena = (p: number) => 1 - (1 - p) ** 3

/** Dónde arranca una capa que entra desde un lado (fuera del cuadro). */
export function origenLado(c: Pick<CapaTL, 'entrada' | 'ancho'>): { x?: number; y?: number } {
  if (c.entrada === 'izquierda') return { x: -c.ancho / 2 - 0.02 }
  if (c.entrada === 'derecha') return { x: 1 + c.ancho / 2 + 0.02 }
  if (c.entrada === 'arriba') return { y: -0.35 }
  if (c.entrada === 'abajo') return { y: 1.35 }
  return {}
}

/**
 * Dónde está una capa `dt` segundos después de aparecer: su recorrido (de su sitio a `fin`, suave) y
 * su entrada (pop, fundido o desde un lado). `conEntrada: false` la deja sin la entrada (para editarla).
 */
export function estadoCapa(c: CapaTL, dt: number, conEntrada = true): { x: number; y: number; ancho: number; giro: number; escala: number; opacidad: number } {
  const p = c.fin ? suave(pinza(dt / Math.max(DURACION_MINIMA, c.duracion), 0, 1)) : 0
  const f = c.fin
  let x = f ? c.x + (f.x - c.x) * p : c.x
  let y = f ? c.y + (f.y - c.y) * p : c.y
  const ancho = f ? c.ancho + (f.ancho - c.ancho) * p : c.ancho
  const giro = f ? (c.giro ?? 0) + (f.giro - (c.giro ?? 0)) * p : (c.giro ?? 0)
  if (!conEntrada) return { x, y, ancho, giro, escala: 1, opacidad: 1 }
  const lado = origenLado(c)
  if (lado.x !== undefined || lado.y !== undefined) {
    const k = frena(pinza(dt / ENTRADA_LADO_S, 0, 1))
    if (lado.x !== undefined) x = lado.x + (x - lado.x) * k
    if (lado.y !== undefined) y = lado.y + (y - lado.y) * k
  }
  const { escala, opacidad } = animacionCapa(c, dt)
  return { x, y, ancho, giro, escala, opacidad }
}

// ===== Escena 2.5D =====

/** Cuánto más que el fondo se mueve una capa muy cercana (profundidad 1): 1 + PARALAJE veces. */
export const PARALAJE = 1.5
/** El desenfoque más fuerte (1), en fracción del ancho del cuadro (es la desviación del desenfoque gaussiano). */
export const DESENFOQUE_MAX = 0.012

/**
 * El clip sobre el que está una capa con profundidad (el que hay bajo ella cuando aparece): su cámara
 * es la de la escena. La capa sigue a ese clip aunque dure más que él (se queda en su último encuadre).
 */
export function referenciaParalaje(tl: Timeline, c: CapaTL): { inicio: number; largo: number; ajustes: Required<AjustesClip> } | null {
  if (c.profundidad == null) return null
  const base = ubicar(tl, c.inicio + 1e-3)
  if (!base) return null
  return { inicio: base.inicio, largo: Math.max(0.01, base.fin - base.inicio), ajustes: ajustesDe(base.clip) }
}

/**
 * Dónde se ve una capa con profundidad en el segundo `t`: el fondo pasa de su encuadre al aparecer la
 * capa al de ahora (escala A y desplazamiento B), y la capa hace lo mismo multiplicado por su cercanía.
 * Un punto u del cuadro se ve en z·u_img − (z−1)·cx (el zoom hacia cx, como el crop y el CSS).
 */
export function aplicarParalaje(
  ref: { inicio: number; largo: number; ajustes: Required<AjustesClip> },
  profundidad: number,
  inicioCapa: number,
  t: number,
  e: { x: number; y: number; ancho: number }
): { x: number; y: number; ancho: number } {
  const r = camaraEn(ref.ajustes, (inicioCapa - ref.inicio) / ref.largo, inicioCapa - ref.inicio)
  const k = camaraEn(ref.ajustes, (t - ref.inicio) / ref.largo, Math.min(ref.largo, Math.max(0, t - ref.inicio)))
  const A = k.z / r.z
  const bx = A * (r.z - 1) * r.cx - (k.z - 1) * k.cx
  const by = A * (r.z - 1) * r.cy - (k.z - 1) * k.cy
  const m = 1 + PARALAJE * Math.min(1, Math.max(0, profundidad))
  return { x: e.x + m * (A * e.x + bx - e.x), y: e.y + m * (A * e.y + by - e.y), ancho: e.ancho * Math.pow(A, m) }
}

/**
 * El desenfoque con que se ve una capa: el suyo más el de la profundidad de campo del clip de debajo (si la
 * capa tiene profundidad).
 */
export function desenfoqueCapa(tl: Timeline, c: CapaTL): number {
  const ref = referenciaParalaje(tl, c)
  return Math.min(1, (c.desenfoque ?? 0) + (ref ? desenfoqueDeCampo(ref.ajustes, c.profundidad ?? 0) : 0))
}

/**
 * Tomas de cámara listas para un clip (con sus capas con profundidad, se ven en 3D): cambian zoom, acercamiento
 * y paneo. Lo demás del clip (color, temblor, foco) se queda.
 */
export const TOMAS_CAMARA: { id: string; nombre: string; para: string; ajustes: AjustesClip }[] = [
  { id: 'dolly-in', nombre: 'Acercarse (dolly in)', para: 'la cámara avanza hacia la escena: lo cercano crece más', ajustes: { zoom: 1.1, acercar: 0.18, panx: 0, pany: 0, cx: 0.5, cy: 0.5 } },
  { id: 'dolly-out', nombre: 'Alejarse (dolly out)', para: 'la cámara retrocede y revela', ajustes: { zoom: 1.35, acercar: -0.22, panx: 0, pany: 0, cx: 0.5, cy: 0.5 } },
  { id: 'travelling-derecha', nombre: 'Travelling →', para: 'la cámara se desliza a la derecha: lo cercano pasa más rápido', ajustes: { zoom: 1.25, acercar: 0.03, panx: 0.35, pany: 0, cx: 0.3, cy: 0.5 } },
  { id: 'travelling-izquierda', nombre: 'Travelling ←', para: 'la cámara se desliza a la izquierda', ajustes: { zoom: 1.25, acercar: 0.03, panx: -0.35, pany: 0, cx: 0.7, cy: 0.5 } },
  { id: 'grua-arriba', nombre: 'Grúa ↑', para: 'la cámara sube (de los pies al cielo)', ajustes: { zoom: 1.25, acercar: 0.02, panx: 0, pany: -0.4, cx: 0.5, cy: 0.75 } },
  { id: 'grua-abajo', nombre: 'Grúa ↓', para: 'la cámara baja hacia el protagonista', ajustes: { zoom: 1.25, acercar: 0.04, panx: 0, pany: 0.4, cx: 0.5, cy: 0.25 } },
  { id: 'empuje', nombre: 'Empuje a un detalle', para: 'avanza hacia un punto y lo encuadra', ajustes: { zoom: 1.05, acercar: 0.3, panx: 0.12, pany: -0.1, cx: 0.45, cy: 0.5 } }
]

/** Movimientos de una capa listos para usar (desde su sitio actual). */
export const MOVIMIENTOS_CAPA: { id: string; nombre: string; para: string; fin: (c: CapaTL) => FinCapa }[] = [
  { id: 'deriva', nombre: 'Deriva lenta', para: 'paralaje: se desliza un poco, como si la cámara se moviera', fin: (c) => ({ x: c.x + 0.05, y: c.y, ancho: c.ancho * 1.06, giro: c.giro ?? 0 }) },
  { id: 'acercar', nombre: 'Se acerca', para: 'crece despacio hacia la cámara', fin: (c) => ({ x: c.x, y: c.y, ancho: Math.min(1.5, c.ancho * 1.35), giro: c.giro ?? 0 }) },
  { id: 'cruzar', nombre: 'Cruza volando', para: 'atraviesa la pantalla de izquierda a derecha (un avión, un pájaro)', fin: (c) => ({ x: 1 + c.ancho / 2 + 0.05, y: c.y - 0.08, ancho: c.ancho, giro: c.giro ?? 0 }) },
  { id: 'subir', nombre: 'Sube', para: 'sube despacio (humo, un cohete)', fin: (c) => ({ x: c.x, y: c.y - 0.12, ancho: c.ancho, giro: c.giro ?? 0 }) },
  { id: 'girar', nombre: 'Gira', para: 'gira un poco mientras está', fin: (c) => ({ x: c.x, y: c.y, ancho: c.ancho, giro: (c.giro ?? 0) + 12 }) }
]

/** Cuánto ha crecido una capa en su entrada (0 a 1) y su opacidad, `dt` segundos después de aparecer. */
export function animacionCapa(c: CapaTL, dt: number): { escala: number; opacidad: number } {
  if (c.entrada === 'pop') {
    // Entra pequeña, se pasa un poco y se asienta (como un «pop»), en 0,24 s.
    const escala = dt < 0.13 ? 0.45 + (dt / 0.13) * 0.72 : dt < 0.24 ? 1.17 - ((dt - 0.13) / 0.11) * 0.17 : 1
    return { escala, opacidad: Math.min(1, dt / 0.08) }
  }
  if (c.entrada === 'fundido') return { escala: 1, opacidad: Math.min(1, dt / 0.35) }
  return { escala: 1, opacidad: 1 }
}

// ===== Efectos de sonido =====

export function anadirSonido(tl: Timeline, sonido: Omit<SonidoTL, 'id'>): { timeline: Timeline; id: string } {
  const id = nuevoId('sonido')
  const sonidos = normalizarSonidos([...(tl.sonidos ?? []), { ...sonido, id }], duracionTimeline(tl))
  if (!sonidos.some((s) => s.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, sonidos }, id }
}

export function cambiarSonido(tl: Timeline, id: string, cambio: Partial<Omit<SonidoTL, 'id'>>): Timeline {
  if (!tl.sonidos?.some((s) => s.id === id)) return tl
  return { ...tl, sonidos: normalizarSonidos(tl.sonidos.map((s) => (s.id === id ? { ...s, ...cambio } : s)), duracionTimeline(tl)) }
}

export function borrarSonido(tl: Timeline, id: string): Timeline {
  if (!tl.sonidos?.some((s) => s.id === id)) return tl
  const sonidos = tl.sonidos.filter((s) => s.id !== id)
  const { sonidos: _antes, ...resto } = tl
  return sonidos.length ? { ...resto, sonidos } : resto
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

/** El tipo de dato con que un medio de la biblioteca se arrastra a la timeline o al monitor. */
export const TIPO_ARRASTRE_MEDIO = 'application/x-recorte-medio'

// ===== Efectos de sonido incluidos (python/sonidos/<id>.wav) =====

export const SONIDOS_INCLUIDOS: { id: string; nombre: string; para: string }[] = [
  { id: 'whoosh', nombre: 'Whoosh', para: 'un cambio rápido, algo que entra volando' },
  { id: 'pop', nombre: 'Pop', para: 'un logo o un ícono que aparece' },
  { id: 'pop-alto', nombre: 'Pop agudo', para: 'otro ícono, o el siguiente de una serie' },
  { id: 'ding', nombre: 'Ding', para: 'un dato, un acierto, un precio' },
  { id: 'caching', nombre: 'Caja registradora', para: 'una oferta, un descuento, una venta' }
]

/**
 * Solo el tramo `desde`–`hasta` de la timeline, empezando en 0: los clips recortados y los
 * rótulos, capas, frases y sonidos que caen dentro, corridos. Sin música. Sirve para ver un cuadro.
 */
export function ventanaTimeline(tl: Timeline, desde: number, hasta: number): Timeline {
  const total = duracionTimeline(tl)
  const a = Math.max(0, Math.min(desde, total))
  const b = Math.max(a, Math.min(hasta, total))
  let corta = b < total ? borrarTramo(tl, b, total) : tl
  corta = a > 0 ? borrarTramo(corta, 0, a) : corta
  const dentro = <T extends { inicio: number; duracion: number }>(x: T): T | null => {
    const ini = Math.max(x.inicio, a)
    const fin = Math.min(x.inicio + x.duracion, b)
    return fin - ini > 0.01 ? { ...x, inicio: ini - a, duracion: fin - ini } : null
  }
  const capas = (tl.capas ?? []).map((c) => {
    const d = dentro(c)
    if (!d) return null
    // Si se mueve y la ventana la corta, su recorrido empieza y acaba donde va en esos segundos.
    const recorrido = c.fin && (c.inicio < a || c.inicio + c.duracion > b)
      ? (() => {
          const ini = estadoCapa(c, Math.max(0, a - c.inicio), false)
          const fin = estadoCapa(c, Math.min(c.duracion, b - c.inicio), false)
          return { x: ini.x, y: ini.y, ancho: ini.ancho, giro: ini.giro, fin: { x: fin.x, y: fin.y, ancho: fin.ancho, giro: fin.giro } }
        })()
      : {}
    // Si la capa ya venía de antes, su video sigue desde donde iba y su entrada ya pasó.
    return c.inicio < a ? { ...d, ...recorrido, desde: (c.desde ?? 0) + (a - c.inicio), entrada: undefined } : { ...d, ...recorrido }
  })
  const { musica: _m, ...resto } = corta
  return {
    ...resto,
    textos: tl.textos.map(dentro).filter((x): x is TextoTL => x !== null),
    ...(tl.voces?.length ? { voces: tl.voces.map(dentro).filter((x): x is VozTL => x !== null) } : {}),
    capas: capas.filter((x): x is CapaTL => x !== null),
    ...(tl.sonidos?.length ? { sonidos: tl.sonidos.map(dentro).filter((x): x is SonidoTL => x !== null) } : {})
  }
}
