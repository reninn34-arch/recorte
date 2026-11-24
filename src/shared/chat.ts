import { normalizarGrafico, resumenGrafico, type Grafico } from './grafico'
import {
  ajustarClip,
  ajustesDe,
  anadirTexto,
  cambiarMusica,
  ponerMusica,
  borrarClip,
  borrarTexto,
  borrarTramo,
  cambiarTexto,
  borrarVoz,
  cambiarVoz,
  anadirVoz,
  silenciarClip,
  ajustarSonidoClip,
  sonidoDe,
  capaNueva,
  cambiarCapa,
  borrarCapa,
  anadirSonido,
  cambiarSonido,
  borrarSonido,
  MAX_IMAGEN,
  SONIDOS_INCLUIDOS,
  type EntradaCapa,
  type CapaTL,
  type FinCapa,
  cambiarFiltros,
  ENTRADAS_CAPA,
  SALIDAS_CAPA,
  ordenarCapa,
  esIdLetra,
  PARAMETROS_CLAVE_TEXTO,
  ponerClaveTexto,
  quitarClaveTexto,
  curvaClaveTexto,
  type ParametroClaveTexto,
  CURVAS_CLAVE,
  curvaClaveCapa,
  type CurvaClave,
  SALIDAS_TEXTO,
  type SalidaCapa,
  type SalidaTexto,
  FILTROS,
  TRANSICIONES,
  GRUPOS_TRANSICION,
  ANIMACIONES_TEXTO,
  fundirClip,
  type AnimacionTexto,
  type TransicionClip,
  FUENTES_TEXTO,
  dividir,
  duracionTimeline,
  FUENTE_PRINCIPAL,
  FUENTE_NEGRO,
  moverClip,
  nuevoId,
  recortarClip,
  timelineDesdeCortes,
  tramos,
  type PosicionTexto,
  type Timeline,
  cambiarPista,
  cambiarVelocidad,
  COLOR_NEUTRO,
  LOOKS,
  PISTAS,
  type PistaId,
  PARAMETROS_CLAVE,
  ponerClave,
  quitarClave,
  velocidadDe,
  fuenteEnClip,
  type ParametroClave,
  PARAMETROS_CLAVE_CAPA,
  ponerClaveCapa,
  quitarClaveCapa,
  type ParametroClaveCapa, anadirCapa, huellaSubtitulos, subtitulosAlDia, type SubtitulosHF,
  MODOS_FUSION,
  type ModoFusion,
  CANALES_CURVA,
  cambiarCurva,
  type CanalCurva,
  type PuntoCurva,
  ponerLut
} from './timeline'
import { INSTRUCCIONES_CRITERIO } from './gustos'
import type { TranscriptSegment } from './types'

/**
 * El chat con el agente que edita. El agente no toca la timeline directamente:
 * responde un mensaje y una lista de operaciones (este contrato). Recorte las valida y
 * las aplica en la interfaz como un solo paso de deshacer. Así cualquier agente —CLI o
 * API— edita con las mismas herramientas que el usuario, y todo se puede revertir.
 */

/** Lo que la op «color» puede cambiar de un clip (el color tipo Lumetri incluido). */
const CAMPOS_COLOR = ['brillo', 'contraste', 'saturacion', 'desenfoque', 'sepia', 'tono', 'invertir', 'exposicion', 'altas', 'sombras', 'blancos', 'negros', 'temperatura', 'tinte'] as const
/** Lo que la op «zoom» puede cambiar: la cámara, y transformar y recortar la imagen. */
const CAMPOS_CAMARA = ['zoom', 'acercar', 'cx', 'cy', 'panx', 'pany', 'temblor', 'campo', 'foco', 'escala', 'posx', 'posy', 'giro', 'recorteIzq', 'recorteDer', 'recorteArr', 'recorteAba'] as const

export type OperacionTL =
  | { op: 'borrar_tramo'; desde: number; hasta: number }
  | { op: 'quitar_pausas'; minimo?: number }
  | { op: 'dividir'; en: number }
  | { op: 'borrar_clip'; clip: number }
  | { op: 'mover_clip'; clip: number; a: number }
  | { op: 'recortar_clip'; clip: number; entrada?: number; salida?: number }
  | { op: 'anadir_texto'; inicio: number; duracion?: number; texto: string; posicion?: PosicionTexto; subtitulo?: boolean; detras?: boolean }
  | {
      op: 'cambiar_texto'
      texto_n: number
      texto?: string
      inicio?: number
      duracion?: number
      posicion?: PosicionTexto
      tamano?: number
      color?: string
      sin_caja?: boolean
      caja?: string
      fuente?: string
      animacion?: AnimacionTexto | 'golpe'
      /** El color con que se pintan las palabras («pintar»). */
      pintado?: string
      /** El color de las palabras entre *asteriscos*. */
      color_clave?: string
      /** Cuándo se dice cada palabra (segundos desde que empieza el rótulo). */
      tiempos?: number[]
      /** Posición libre: el centro del rótulo, en fracción del cuadro (0–1). */
      x?: number
      y?: number
      /** Si es un subtítulo (parte del guion que dibujan los subtítulos animados). */
      subtitulo?: boolean
      /** Va detrás de las capas (de la persona recortada). */
      detras?: boolean
      /** Sin caja: contorno y sombra (en fracción del tamaño de la letra) y sus colores; null vuelve al halo de siempre. */
      contorno?: number | null
      color_contorno?: string
      sombra?: number | null
      color_sombra?: string
      /** izquierda, derecha o centro (con posición libre: x es el borde de ese lado). */
      alineacion?: 'izquierda' | 'derecha' | 'centro'
      espaciado?: number
      mayusculas?: boolean
      opacidad?: number
      giro?: number
      /** Cómo se va; 'golpe' la quita. */
      salida?: SalidaTexto | 'golpe'
      dur_salida?: number
      oculto?: boolean
      bloqueado?: boolean
    }
  | { op: 'borrar_texto'; texto_n: number }
  /** Lo que va encima del video: un medio de la biblioteca (por su id), en su sitio y su tamaño. */
  | ({ op: 'anadir_capa'; medio: string; inicio: number } & CamposCapa)
  /**
   * Un gráfico editable (tarjeta, rótulo con caja, botón: src/shared/grafico.ts). El proceso principal lo dibuja antes de
   * aplicar y deja aquí su medio y el ancho que le toca a su tamaño de diseño; sin medio, no se pudo dibujar.
   */
  | ({ op: 'anadir_grafico'; inicio: number; grafico: Grafico; medio?: string; anchoReal?: number } & CamposCapa)
  /**
   * Cambia el diseño de un gráfico ya puesto: `grafico` con lo que cambia (lo demás se queda) o `textos` con los textos
   * nuevos en orden. El proceso principal arma el diseño final (`final`), lo dibuja y deja el medio y cuánto cambió su ancho.
   */
  | ({ op: 'cambiar_grafico'; capa_n: number; grafico?: Record<string, unknown>; textos?: string[]; final?: Grafico; medio?: string; escalaAncho?: number } & CamposCapa)
  /**
   * Una pieza animada (HyperFrames) con la marca. El proceso principal la anima antes de aplicar y deja aquí su medio
   * y lo que dura de verdad; sin medio, no se pudo animar.
   */
  | { op: 'anadir_pieza'; pieza: string; inicio: number; duracion?: number; valores?: Record<string, string | number | boolean>; medio?: string; duracionReal?: number }
  /** Una animación NUEVA a medida: la crea el agente conectado (minutos) y queda puesta y en «Mis animaciones». */
  | { op: 'crear_pieza'; peticion: string; inicio: number; duracion?: number }
  /**
   * Los subtítulos animados con HyperFrames: el estilo (una pieza de «Subtítulos») y sus valores, o "ninguno" para
   * volver al texto simple. El proceso principal los anima y deja aquí el render (si no, se animan al exportar).
   */
  /**
   * Separa del fondo a la persona de un clip y la pone encima de él (pista 3): lo que quede entre los dos se ve detrás
   * de ella. El proceso principal hace el recorte antes de aplicar y deja aquí su medio y el clip; sin medio, no se pudo.
   */
  | { op: 'recortar_persona'; clip: number; medio?: string; clipId?: string; duracionReal?: number }
  | { op: 'rotoscopiar'; clip: number; x: number; y: number; ancho: number; alto: number; medio?: string; clipId?: string; duracionReal?: number }
  | { op: 'cambiar_cielo'; clip: number; cielo: string; medio?: string; clipId?: string; duracionReal?: number }
  | { op: 'borrar_objeto'; clip: number; x: number; y: number; ancho: number; alto: number; hasta_x?: number; hasta_y?: number; medio?: string; clipId?: string; duracionReal?: number }
  | { op: 'subtitulos_animados'; estilo: string; valores?: Record<string, string | number | boolean>; render?: SubtitulosHF }
  | ({ op: 'cambiar_capa'; capa_n: number; inicio?: number } & CamposCapa)
  | { op: 'filtros'; grano?: number; polvo?: number; trama?: number; vineta?: number; parpadeo?: number }
  | { op: 'transicion'; clip?: number; tipo: TransicionClip | 'corte'; duracion?: number }
  | { op: 'borrar_capa'; capa_n: number }
  /** Un efecto de sonido incluido. Recorte copia su audio ANTES de aplicarla y le pone `audio`. */
  | { op: 'anadir_sonido'; sonido: string; inicio: number; volumen?: number; audio?: { archivo: string; duracion: number; nombre: string } }
  | { op: 'cambiar_sonido'; sonido_n: number; inicio?: number; volumen?: number }
  | { op: 'borrar_sonido'; sonido_n: number }
  | { op: 'reconstruir'; cortes: { entrada: number; salida: number }[] }
  | ({ op: 'zoom'; clip?: number } & { [K in (typeof CAMPOS_CAMARA)[number]]?: number })
  | ({ op: 'color'; clip?: number; look?: string } & { [K in (typeof CAMPOS_COLOR)[number]]?: number })
  | { op: 'velocidad'; clip: number; velocidad: number }
  | { op: 'lut'; clip?: number; intensidad?: number; quitar?: boolean; de_clip?: number }
  | { op: 'curva'; clip?: number; canal: CanalCurva; puntos: PuntoCurva[] }
  | { op: 'audio_clip'; clip: number; volumen?: number; entra?: number; sale?: number; limpio?: number }
  | { op: 'clave'; clip: number; parametro: ParametroClave; en: number; valor?: number; quitar?: boolean }
  | { op: 'clave_capa'; capa_n: number; parametro: ParametroClaveCapa; en: number; valor?: number; quitar?: boolean; curva?: CurvaClave }
  | { op: 'clave_texto'; texto_n: number; parametro: ParametroClaveTexto; en: number; valor?: number; quitar?: boolean; curva?: CurvaClave }
  | { op: 'pista'; pista: PistaId; oculta?: boolean; bloqueada?: boolean }
  | { op: 'musica'; volumen?: number; ducking?: boolean }
  | { op: 'quitar_musica' }
  | { op: 'sonido_clip'; clip: number; sonido: boolean }
  /**
   * La narración frase a frase. Si cambia lo que dice (o la voz), Recorte genera el audio nuevo
   * ANTES de aplicarla y le pone `audio` (el agente nunca lo da: se descarta si lo trae).
   */
  | { op: 'cambiar_voz'; voz_n: number; texto?: string; voz?: string; inicio?: number; volumen?: number; audio?: AudioGenerado }
  | { op: 'anadir_voz'; inicio: number; texto: string; voz?: string; audio?: AudioGenerado }
  | { op: 'borrar_voz'; voz_n: number }

/** El audio que generó Recorte para una frase (ya está en `media/` del proyecto). */
export interface AudioGenerado {
  archivo: string
  duracion: number
  voz: string
  texto: string
}

export interface MensajeChat {
  id: string
  rol: 'usuario' | 'agente'
  texto: string
  fecha: number
  /** Lo que el agente cambió, en palabras, para el historial del chat. */
  cambios?: string[]
  /** Operaciones que no se pudieron aplicar. */
  fallos?: string[]
  error?: boolean
  /** Contexto del editor al escribir (cabezal, elegido). */
  referencia?: string
  /** La timeline justo antes de este mensaje del usuario: para volver a ese punto. */
  antes?: Timeline
  /** El usuario paró al agente en este turno. */
  parado?: boolean
  /** Siguientes pasos que propone el agente (botones que el usuario puede elegir). */
  propuestas?: string[]
  /** Gustos que el agente aprendió en este turno. */
  aprendido?: string[]
}

export const MAX_MENSAJES = 60

/** Cuánta pausa se deja antes y después de cada palabra al quitar silencios. */
const MARGEN_PAUSA = 0.12

function mmss(s: number): string {
  const t = Math.max(0, s)
  const m = Math.floor(t / 60)
  const r = t - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Las pausas largas de la voz, en tiempo de timeline, listas para borrar. */
export function pausasEnTimeline(tl: Timeline, transcript: TranscriptSegment[] | undefined, minimo = 0.6): [number, number][] {
  if (!transcript?.length) return []
  const pausas: [number, number][] = []
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL) continue
    const palabras = transcript
      .flatMap((s) => s.words)
      .filter((w) => w.end > tr.clip.entrada && w.start < tr.clip.salida)
      .sort((a, b) => a.start - b.start)
    if (palabras.length === 0) continue
    // Huecos: antes de la primera palabra, entre palabras y después de la última.
    const bordes: [number, number][] = [[tr.clip.entrada, palabras[0].start]]
    for (let i = 1; i < palabras.length; i++) bordes.push([palabras[i - 1].end, palabras[i].start])
    bordes.push([palabras[palabras.length - 1].end, tr.clip.salida])
    bordes.forEach(([a, b], k) => {
      // En los bordes del clip no hace falta respiro: el silencio se quita entero.
      const desde = k === 0 ? tr.clip.entrada : Math.max(a + MARGEN_PAUSA, tr.clip.entrada)
      const hasta = k === bordes.length - 1 ? tr.clip.salida : Math.min(b - MARGEN_PAUSA, tr.clip.salida)
      if (b - a >= minimo && hasta - desde > 0.05) {
        pausas.push([tr.inicio + desde - tr.clip.entrada, tr.inicio + hasta - tr.clip.entrada])
      }
    })
  }
  return pausas
}

type CamposCapa = {
  duracion?: number
  x?: number
  y?: number
  ancho?: number
  entrada?: EntradaCapa | 'corte'
  giro?: number
  fin?: Partial<FinCapa> | null
  /** null: deja de seguir a la cámara (fija en la pantalla). */
  profundidad?: number | null
  /** En qué pista de «Encima» va (1 a 3). */
  pista?: number
  /** Cómo se mezcla con lo de debajo; null vuelve a normal. */
  fusion?: ModoFusion | null
  desenfoque?: number
  /** Lo recortado de cada lado (fracción del medio); null lo quita. */
  recorte?: { izq?: number; der?: number; arriba?: number; abajo?: number } | null
  voltear_h?: boolean
  voltear_v?: boolean
  /** Cómo se va; 'corte' quita la salida. */
  salida?: SalidaCapa | 'corte'
  dur_entrada?: number
  dur_salida?: number
  oculto?: boolean
  bloqueado?: boolean
  /** Su lugar en la pila de su pista: al frente, al fondo, una más arriba o una más abajo. */
  orden?: 'frente' | 'atras' | 'subir' | 'bajar'
  redondeo?: number
  borde?: number
  color_borde?: string
  sombra?: number
  color_sombra?: string
}

/** Lo que se puede cambiar de una capa, validado (sin `inicio`). `fin: null` quita el movimiento. */
function camposCapa(x: Record<string, unknown>): CamposCapa {
  const fin = x.fin && typeof x.fin === 'object' ? (x.fin as Record<string, unknown>) : null
  const finX = num(x.fin_x) ?? (fin ? num(fin.x) : null)
  const finY = num(x.fin_y) ?? (fin ? num(fin.y) : null)
  const finAncho = num(x.fin_ancho) ?? (fin ? num(fin.ancho) : null)
  const finGiro = num(x.fin_giro) ?? (fin ? num(fin.giro) : null)
  const hayFin = finX !== null || finY !== null || finAncho !== null || finGiro !== null
  return {
    ...(num(x.duracion) !== null ? { duracion: num(x.duracion)! } : {}),
    ...(num(x.x) !== null ? { x: num(x.x)! } : {}),
    ...(num(x.y) !== null ? { y: num(x.y)! } : {}),
    ...(num(x.ancho) !== null ? { ancho: num(x.ancho)! } : {}),
    ...(num(x.giro) !== null ? { giro: num(x.giro)! } : {}),
    ...(x.profundidad === null || x.profundidad === 'fija' ? { profundidad: null } : num(x.profundidad) !== null ? { profundidad: num(x.profundidad)! } : {}),
    ...(num(x.pista) !== null ? { pista: num(x.pista)! } : {}),
    ...(x.fusion === null || x.fusion === 'normal' ? { fusion: null } : typeof x.fusion === 'string' && MODOS_FUSION.some((m) => m.id === x.fusion) ? { fusion: x.fusion as ModoFusion } : {}),
    ...(num(x.desenfoque) !== null ? { desenfoque: num(x.desenfoque)! } : {}),
    ...(x.recorte === null
      ? { recorte: null }
      : x.recorte && typeof x.recorte === 'object'
        ? {
            recorte: Object.fromEntries(
              (['izq', 'der', 'arriba', 'abajo'] as const).filter((k) => num((x.recorte as Record<string, unknown>)[k]) !== null).map((k) => [k, num((x.recorte as Record<string, unknown>)[k])!])
            )
          }
        : {}),
    ...(typeof x.voltear_h === 'boolean' ? { voltear_h: x.voltear_h } : {}),
    ...(x.salida === 'corte' || (typeof x.salida === 'string' && SALIDAS_CAPA.includes(x.salida as SalidaCapa)) ? { salida: x.salida as SalidaCapa | 'corte' } : {}),
    ...(num(x.dur_entrada) !== null ? { dur_entrada: num(x.dur_entrada)! } : {}),
    ...(num(x.dur_salida) !== null ? { dur_salida: num(x.dur_salida)! } : {}),
    ...(typeof x.oculto === 'boolean' ? { oculto: x.oculto } : {}),
    ...(typeof x.bloqueado === 'boolean' ? { bloqueado: x.bloqueado } : {}),
    ...(x.orden === 'frente' || x.orden === 'atras' || x.orden === 'subir' || x.orden === 'bajar' ? { orden: x.orden } : {}),
    ...(num(x.redondeo) !== null ? { redondeo: num(x.redondeo)! } : {}),
    ...(num(x.borde) !== null ? { borde: num(x.borde)! } : {}),
    ...(typeof x.color_borde === 'string' && /^#[0-9a-f]{6}$/i.test(x.color_borde) ? { color_borde: x.color_borde } : {}),
    ...(num(x.sombra) !== null ? { sombra: num(x.sombra)! } : {}),
    ...(typeof x.color_sombra === 'string' && /^#[0-9a-f]{6}$/i.test(x.color_sombra) ? { color_sombra: x.color_sombra } : {}),
    ...(typeof x.voltear_v === 'boolean' ? { voltear_v: x.voltear_v } : {}),
    ...(x.entrada === 'corte' || (typeof x.entrada === 'string' && ENTRADAS_CAPA.includes(x.entrada as EntradaCapa)) ? { entrada: x.entrada as EntradaCapa | 'corte' } : {}),
    ...(x.fin === null || x.quieta === true
      ? { fin: null }
      : hayFin
        ? {
            fin: {
              ...(finX !== null ? { x: finX } : {}),
              ...(finY !== null ? { y: finY } : {}),
              ...(finAncho !== null ? { ancho: finAncho } : {}),
              ...(finGiro !== null ? { giro: finGiro } : {})
            }
          }
        : {})
  }
}

/** Valida la forma de lo que devolvió el agente. Lo que no encaja se descarta. */

export function validarOperaciones(crudo: unknown): OperacionTL[] {
  if (!Array.isArray(crudo)) return []
  const ops: OperacionTL[] = []
  for (const o of crudo.slice(0, 200)) {
    if (!o || typeof o !== 'object') continue
    const x = o as Record<string, unknown>
    const pos = (v: unknown): PosicionTexto | undefined => (v === 'arriba' || v === 'centro' || v === 'abajo' ? v : undefined)
    switch (x.op) {
      case 'borrar_tramo': {
        const d = num(x.desde), h = num(x.hasta)
        if (d !== null && h !== null) ops.push({ op: 'borrar_tramo', desde: d, hasta: h })
        break
      }
      case 'quitar_pausas':
        ops.push({ op: 'quitar_pausas', minimo: num(x.minimo) ?? undefined })
        break
      case 'dividir': {
        const en = num(x.en)
        if (en !== null) ops.push({ op: 'dividir', en })
        break
      }
      case 'borrar_clip': {
        const c = num(x.clip)
        if (c !== null) ops.push({ op: 'borrar_clip', clip: c })
        break
      }
      case 'mover_clip': {
        const c = num(x.clip), a = num(x.a)
        if (c !== null && a !== null) ops.push({ op: 'mover_clip', clip: c, a })
        break
      }
      case 'recortar_clip': {
        const c = num(x.clip)
        if (c !== null) ops.push({ op: 'recortar_clip', clip: c, entrada: num(x.entrada) ?? undefined, salida: num(x.salida) ?? undefined })
        break
      }
      case 'anadir_texto': {
        const i = num(x.inicio)
        if (i !== null && typeof x.texto === 'string' && x.texto.trim()) {
          ops.push({ op: 'anadir_texto', inicio: i, duracion: num(x.duracion) ?? undefined, texto: x.texto.slice(0, 200), posicion: pos(x.posicion), ...(typeof x.subtitulo === 'boolean' ? { subtitulo: x.subtitulo } : {}), ...(typeof x.detras === 'boolean' ? { detras: x.detras } : {}) })
        }
        break
      }
      case 'cambiar_texto': {
        const n = num(x.texto_n)
        if (n !== null) {
          ops.push({
            op: 'cambiar_texto',
            texto_n: n,
            texto: typeof x.texto === 'string' ? x.texto.slice(0, 200) : undefined,
            inicio: num(x.inicio) ?? undefined,
            duracion: num(x.duracion) ?? undefined,
            posicion: pos(x.posicion),
            tamano: num(x.tamano) ?? undefined,
            color: typeof x.color === 'string' && /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : undefined,
            sin_caja: typeof x.sin_caja === 'boolean' ? x.sin_caja : undefined,
            caja: typeof x.caja === 'string' && /^#[0-9a-f]{6}$/i.test(x.caja) ? x.caja : undefined,
            fuente: typeof x.fuente === 'string' && (x.fuente in FUENTES_TEXTO || esIdLetra(x.fuente)) ? x.fuente : undefined,
            animacion: x.animacion === 'golpe' || ANIMACIONES_TEXTO.some((a) => a.id === x.animacion) ? (x.animacion as AnimacionTexto | 'golpe') : undefined,
            pintado: typeof x.pintado === 'string' && /^#[0-9a-f]{6}$/i.test(x.pintado) ? x.pintado : undefined,
            color_clave: typeof x.color_clave === 'string' && /^#[0-9a-f]{6}$/i.test(x.color_clave) ? x.color_clave : undefined,
            tiempos: Array.isArray(x.tiempos) && x.tiempos.every((y) => typeof y === 'number' && Number.isFinite(y)) ? (x.tiempos as number[]).slice(0, 200) : undefined,
            ...(num(x.x) !== null && num(x.y) !== null ? { x: num(x.x)!, y: num(x.y)! } : {}),
            ...(typeof x.subtitulo === 'boolean' ? { subtitulo: x.subtitulo } : {}),
            ...(typeof x.detras === 'boolean' ? { detras: x.detras } : {}),
            ...(x.contorno === null ? { contorno: null } : num(x.contorno) !== null ? { contorno: num(x.contorno)! } : {}),
            ...(typeof x.color_contorno === 'string' && /^#[0-9a-f]{6}$/i.test(x.color_contorno) ? { color_contorno: x.color_contorno } : {}),
            ...(x.sombra === null ? { sombra: null } : num(x.sombra) !== null ? { sombra: num(x.sombra)! } : {}),
            ...(typeof x.color_sombra === 'string' && /^#[0-9a-f]{6}$/i.test(x.color_sombra) ? { color_sombra: x.color_sombra } : {}),
            ...(x.alineacion === 'izquierda' || x.alineacion === 'derecha' || x.alineacion === 'centro' ? { alineacion: x.alineacion } : {}),
            ...(num(x.espaciado) !== null ? { espaciado: num(x.espaciado)! } : {}),
            ...(typeof x.mayusculas === 'boolean' ? { mayusculas: x.mayusculas } : {}),
            ...(num(x.opacidad) !== null ? { opacidad: num(x.opacidad)! } : {}),
            ...(num(x.giro) !== null ? { giro: num(x.giro)! } : {}),
            ...(x.salida === 'golpe' || SALIDAS_TEXTO.some((s) => s.id === x.salida) ? { salida: x.salida as SalidaTexto | 'golpe' } : {}),
            ...(num(x.dur_salida) !== null ? { dur_salida: num(x.dur_salida)! } : {}),
            ...(typeof x.oculto === 'boolean' ? { oculto: x.oculto } : {}),
            ...(typeof x.bloqueado === 'boolean' ? { bloqueado: x.bloqueado } : {})
          })
        }
        break
      }
      case 'transicion': {
        const tipo = x.tipo === 'corte' || TRANSICIONES.some((t) => t.id === x.tipo) ? (x.tipo as TransicionClip | 'corte') : null
        if (!tipo) break
        ops.push({ op: 'transicion', tipo, ...(num(x.clip) !== null ? { clip: num(x.clip)! } : {}), ...(num(x.duracion) !== null ? { duracion: num(x.duracion)! } : {}) })
        break
      }
      case 'filtros': {
        const f: Record<string, number> = {}
        for (const id of ['grano', 'polvo', 'trama', 'vineta', 'parpadeo']) if (num(x[id]) !== null) f[id] = num(x[id])!
        if (Object.keys(f).length) ops.push({ op: 'filtros', ...f })
        break
      }
      case 'anadir_capa': {
        const i = num(x.inicio)
        if (i === null || typeof x.medio !== 'string' || !x.medio) break
        ops.push({ op: 'anadir_capa', medio: x.medio, inicio: i, ...camposCapa(x) })
        break
      }
      case 'anadir_grafico': {
        const i = num(x.inicio)
        const g = normalizarGrafico(x.grafico)
        if (i === null || !g) break
        ops.push({ op: 'anadir_grafico', inicio: i, grafico: g, ...camposCapa(x) })
        break
      }
      case 'cambiar_grafico': {
        const n = num(x.capa_n)
        const g = x.grafico && typeof x.grafico === 'object' && !Array.isArray(x.grafico) ? (x.grafico as Record<string, unknown>) : undefined
        const textos = Array.isArray(x.textos) ? x.textos.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 400)) : undefined
        if (n === null || (!g && !textos?.length)) break
        ops.push({ op: 'cambiar_grafico', capa_n: n, ...(g ? { grafico: g } : {}), ...(textos?.length ? { textos } : {}), ...camposCapa(x) })
        break
      }
      case 'anadir_pieza': {
        const i = num(x.inicio)
        if (i === null || typeof x.pieza !== 'string' || !/^[\w-]{1,60}$/.test(x.pieza)) break
        const valores: Record<string, string | number | boolean> = {}
        if (x.valores && typeof x.valores === 'object') {
          for (const [k, v] of Object.entries(x.valores as Record<string, unknown>)) {
            if (/^[\w-]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) valores[k] = typeof v === 'string' ? v.slice(0, 500) : v
          }
        }
        ops.push({ op: 'anadir_pieza', pieza: x.pieza, inicio: i, ...(num(x.duracion) !== null ? { duracion: num(x.duracion)! } : {}), valores })
        break
      }
      case 'recortar_persona': {
        const n = num(x.clip)
        if (n !== null) ops.push({ op: 'recortar_persona', clip: n })
        break
      }
      case 'rotoscopiar': {
        const n = num(x.clip)
        const [cx, cy, an, al] = [num(x.x), num(x.y), num(x.ancho), num(x.alto)]
        if (n === null || cx === null || cy === null || an === null || al === null || an <= 0 || al <= 0) break
        const fr = (v: number) => Math.min(Math.max(v, 0), 1)
        ops.push({ op: 'rotoscopiar', clip: n, x: fr(cx), y: fr(cy), ancho: fr(an), alto: fr(al) })
        break
      }
      case 'cambiar_cielo': {
        const n = num(x.clip)
        if (n !== null && typeof x.cielo === 'string' && x.cielo.trim() && x.cielo.length <= 400) ops.push({ op: 'cambiar_cielo', clip: n, cielo: x.cielo.trim() })
        break
      }
      case 'borrar_objeto': {
        const n = num(x.clip)
        const [cx, cy, an, al] = [num(x.x), num(x.y), num(x.ancho), num(x.alto)]
        if (n === null || cx === null || cy === null || an === null || al === null || an <= 0 || al <= 0) break
        const fr = (v: number) => Math.min(Math.max(v, 0), 1)
        const hx = num(x.hasta_x)
        const hy = num(x.hasta_y)
        ops.push({ op: 'borrar_objeto', clip: n, x: fr(cx), y: fr(cy), ancho: fr(an), alto: fr(al), ...(hx !== null && hy !== null ? { hasta_x: fr(hx), hasta_y: fr(hy) } : {}) })
        break
      }
      case 'subtitulos_animados': {
        if (typeof x.estilo !== 'string' || !/^[\w-]{1,60}$/.test(x.estilo)) break
        const valores: Record<string, string | number | boolean> = {}
        if (x.valores && typeof x.valores === 'object') {
          for (const [k, v] of Object.entries(x.valores as Record<string, unknown>)) {
            if (/^[\w-]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) valores[k] = typeof v === 'string' ? v.slice(0, 200) : v
          }
        }
        ops.push({ op: 'subtitulos_animados', estilo: x.estilo, valores })
        break
      }
      case 'crear_pieza': {
        const i = num(x.inicio)
        if (i === null || typeof x.peticion !== 'string' || !x.peticion.trim()) break
        ops.push({ op: 'crear_pieza', peticion: x.peticion.trim().slice(0, 1500), inicio: i, ...(num(x.duracion) !== null ? { duracion: num(x.duracion)! } : {}) })
        break
      }
      case 'cambiar_capa': {
        const n = num(x.capa_n)
        if (n !== null) ops.push({ op: 'cambiar_capa', capa_n: n, ...(num(x.inicio) !== null ? { inicio: num(x.inicio)! } : {}), ...camposCapa(x) })
        break
      }
      case 'borrar_capa': {
        const n = num(x.capa_n)
        if (n !== null) ops.push({ op: 'borrar_capa', capa_n: n })
        break
      }
      case 'anadir_sonido': {
        const i = num(x.inicio)
        if (i === null || typeof x.sonido !== 'string' || !SONIDOS_INCLUIDOS.some((s) => s.id === x.sonido)) break
        ops.push({ op: 'anadir_sonido', sonido: x.sonido, inicio: i, ...(num(x.volumen) !== null ? { volumen: num(x.volumen)! } : {}) })
        break
      }
      case 'cambiar_sonido': {
        const n = num(x.sonido_n)
        if (n !== null) ops.push({ op: 'cambiar_sonido', sonido_n: n, ...(num(x.inicio) !== null ? { inicio: num(x.inicio)! } : {}), ...(num(x.volumen) !== null ? { volumen: num(x.volumen)! } : {}) })
        break
      }
      case 'borrar_sonido': {
        const n = num(x.sonido_n)
        if (n !== null) ops.push({ op: 'borrar_sonido', sonido_n: n })
        break
      }
      case 'borrar_texto': {
        const n = num(x.texto_n)
        if (n !== null) ops.push({ op: 'borrar_texto', texto_n: n })
        break
      }
      case 'zoom': {
        // La cámara del clip: zoom, acercamiento lento, hacia dónde y paneo (lo que no venga no cambia).
        const campos = (CAMPOS_CAMARA).filter((k) => num(x[k]) !== null)
        if (campos.length) ops.push({ op: 'zoom', clip: num(x.clip) ?? undefined, ...Object.fromEntries(campos.map((k) => [k, num(x[k])!])) })
        break
      }
      case 'color': {
        // El color y los efectos del clip (lo que no venga no cambia); un `look` los pone todos de una vez.
        const campos = (CAMPOS_COLOR).filter((k) => num(x[k]) !== null)
        const look = typeof x.look === 'string' && LOOKS.some((l) => l.id === x.look) ? x.look : undefined
        if (campos.length || look) ops.push({ op: 'color', clip: num(x.clip) ?? undefined, ...(look ? { look } : {}), ...Object.fromEntries(campos.map((k) => [k, num(x[k])!])) })
        break
      }
      case 'clave_capa': {
        const c = num(x.capa_n)
        const en = num(x.en)
        const valor = num(x.valor)
        const parametro = PARAMETROS_CLAVE_CAPA.find((p) => p === x.parametro)
        if (c !== null && en !== null && parametro && (valor !== null || x.quitar === true))
          ops.push({
            op: 'clave_capa',
            capa_n: c,
            parametro,
            en,
            ...(valor !== null ? { valor } : {}),
            ...(x.quitar === true ? { quitar: true } : {}),
            ...(typeof x.curva === 'string' && CURVAS_CLAVE.some((k) => k.id === x.curva) ? { curva: x.curva as CurvaClave } : {})
          })
        break
      }
      case 'clave_texto': {
        const t = num(x.texto_n)
        const en = num(x.en)
        const valor = num(x.valor)
        const parametro = PARAMETROS_CLAVE_TEXTO.find((p) => p === x.parametro)
        if (t !== null && en !== null && parametro && (valor !== null || x.quitar === true))
          ops.push({
            op: 'clave_texto',
            texto_n: t,
            parametro,
            en,
            ...(valor !== null ? { valor } : {}),
            ...(x.quitar === true ? { quitar: true } : {}),
            ...(typeof x.curva === 'string' && CURVAS_CLAVE.some((k) => k.id === x.curva) ? { curva: x.curva as CurvaClave } : {})
          })
        break
      }
      case 'clave': {
        const c = num(x.clip)
        const en = num(x.en)
        const valor = num(x.valor)
        const parametro = PARAMETROS_CLAVE.find((p) => p === x.parametro)
        if (c !== null && en !== null && parametro && (valor !== null || x.quitar === true))
          ops.push({ op: 'clave', clip: c, parametro, en, ...(valor !== null ? { valor } : {}), ...(x.quitar === true ? { quitar: true } : {}) })
        break
      }
      case 'audio_clip': {
        const c = num(x.clip)
        const cambio = Object.fromEntries((['volumen', 'entra', 'sale', 'limpio'] as const).flatMap((k) => (num(x[k]) !== null ? [[k, num(x[k])!]] : [])))
        if (c !== null && Object.keys(cambio).length) ops.push({ op: 'audio_clip', clip: c, ...cambio })
        break
      }
      case 'lut': {
        const intensidad = num(x.intensidad)
        if (intensidad !== null || x.quitar === true || num(x.de_clip) !== null)
          ops.push({ op: 'lut', clip: num(x.clip) ?? undefined, ...(intensidad !== null ? { intensidad } : {}), ...(x.quitar === true ? { quitar: true } : {}), ...(num(x.de_clip) !== null ? { de_clip: num(x.de_clip)! } : {}) })
        break
      }
      case 'curva': {
        const canal = CANALES_CURVA.find((c) => c.id === x.canal)?.id
        const puntos = Array.isArray(x.puntos)
          ? (x.puntos as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))
          : null
        if (canal && puntos) ops.push({ op: 'curva', clip: num(x.clip) ?? undefined, canal, puntos })
        break
      }
      case 'velocidad': {
        const c = num(x.clip)
        const v = num(x.velocidad)
        if (c !== null && v !== null) ops.push({ op: 'velocidad', clip: c, velocidad: v })
        break
      }
      case 'pista': {
        if (typeof x.pista === 'string' && PISTAS.some((p) => p.id === x.pista) && (typeof x.oculta === 'boolean' || typeof x.bloqueada === 'boolean'))
          ops.push({ op: 'pista', pista: x.pista as PistaId, ...(typeof x.oculta === 'boolean' ? { oculta: x.oculta } : {}), ...(typeof x.bloqueada === 'boolean' ? { bloqueada: x.bloqueada } : {}) })
        break
      }
      case 'musica': {
        const v = num(x.volumen)
        const d = typeof x.ducking === 'boolean' ? x.ducking : undefined
        if (v !== null || d !== undefined) ops.push({ op: 'musica', volumen: v ?? undefined, ducking: d })
        break
      }
      case 'quitar_musica':
        ops.push({ op: 'quitar_musica' })
        break
      case 'sonido_clip': {
        const c = num(x.clip)
        if (c !== null && typeof x.sonido === 'boolean') ops.push({ op: 'sonido_clip', clip: c, sonido: x.sonido })
        break
      }
      case 'cambiar_voz': {
        const n = num(x.voz_n)
        if (n === null) break
        ops.push({
          op: 'cambiar_voz',
          voz_n: n,
          texto: typeof x.texto === 'string' && x.texto.trim() ? x.texto.replace(/\s+/g, ' ').trim().slice(0, 600) : undefined,
          voz: typeof x.voz === 'string' && x.voz.trim() ? x.voz.trim().slice(0, 40) : undefined,
          inicio: num(x.inicio) ?? undefined,
          volumen: num(x.volumen) ?? undefined
        })
        break
      }
      case 'anadir_voz': {
        const i = num(x.inicio)
        if (i !== null && typeof x.texto === 'string' && x.texto.trim()) {
          ops.push({
            op: 'anadir_voz',
            inicio: i,
            texto: x.texto.replace(/\s+/g, ' ').trim().slice(0, 600),
            voz: typeof x.voz === 'string' && x.voz.trim() ? x.voz.trim().slice(0, 40) : undefined
          })
        }
        break
      }
      case 'borrar_voz': {
        const n = num(x.voz_n)
        if (n !== null) ops.push({ op: 'borrar_voz', voz_n: n })
        break
      }
      case 'reconstruir': {
        if (!Array.isArray(x.cortes)) break
        const cortes = x.cortes
          .map((c) => ({ entrada: num((c as Record<string, unknown>)?.entrada), salida: num((c as Record<string, unknown>)?.salida) }))
          .filter((c): c is { entrada: number; salida: number } => c.entrada !== null && c.salida !== null)
        if (cortes.length) ops.push({ op: 'reconstruir', cortes })
        break
      }
    }
  }
  return ops
}

/**
 * Aplica las operaciones en orden; cada una ve la timeline que dejó la anterior.
 * Los `borrar_tramo` seguidos se aplican del último al primero, así sus tiempos se
 * refieren todos a la timeline de antes y no se corren entre sí.
 */
export function aplicarOperaciones(
  inicial: Timeline,
  ops: OperacionTL[],
  contexto: { duracionFuente: number; transcript?: TranscriptSegment[]; medios?: Record<string, number> }
): { timeline: Timeline; cambios: string[]; fallos: string[] } {
  const medios = { [FUENTE_PRINCIPAL]: contexto.duracionFuente, ...(contexto.medios ?? {}) }
  let tl = inicial
  const cambios: string[] = []
  const fallos: string[] = []
  const lista = [...ops]

  for (let i = 0; i < lista.length; i++) {
    // Agrupa una racha de borrar_tramo y la aplica de atrás hacia delante.
    if (lista[i].op === 'borrar_tramo') {
      let j = i
      while (j < lista.length && lista[j].op === 'borrar_tramo') j++
      const tramosBorrar = (lista.slice(i, j) as Extract<OperacionTL, { op: 'borrar_tramo' }>[])
        .map((o) => [Math.min(o.desde, o.hasta), Math.max(o.desde, o.hasta)] as const)
        .sort((a, b) => b[0] - a[0])
      let total = 0
      for (const [a, b] of tramosBorrar) {
        const antes = duracionTimeline(tl)
        tl = borrarTramo(tl, a, b)
        total += antes - duracionTimeline(tl)
      }
      if (total > 0) cambios.push(tramosBorrar.length === 1 ? `Quité ${mmss(tramosBorrar[0][0])}–${mmss(tramosBorrar[0][1])}` : `Quité ${tramosBorrar.length} tramos (${total.toFixed(1)} s)`)
      else fallos.push('Los tramos a borrar no caían dentro de la timeline.')
      i = j - 1
      continue
    }

    const o = lista[i]
    const clipEn = (n: number) => tl.clips[Math.round(n) - 1]
    const textoEn = (n: number) => tl.textos[Math.round(n) - 1]

    switch (o.op) {
      case 'quitar_pausas': {
        const pausas = pausasEnTimeline(tl, contexto.transcript, Math.max(0.3, o.minimo ?? 0.6))
        if (!pausas.length) {
          fallos.push(contexto.transcript?.length ? 'No encontré pausas largas.' : 'Para quitar pausas hace falta transcribir el video.')
          break
        }
        const antes = duracionTimeline(tl)
        for (const [a, b] of [...pausas].sort((x, y) => y[0] - x[0])) tl = borrarTramo(tl, a, b)
        cambios.push(`Quité ${pausas.length} pausas (${(antes - duracionTimeline(tl)).toFixed(1)} s)`)
        break
      }
      case 'dividir': {
        const nueva = dividir(tl, o.en)
        if (nueva === tl) fallos.push(`No pude dividir en ${mmss(o.en)}.`)
        else cambios.push(`Dividí en ${mmss(o.en)}`)
        tl = nueva
        break
      }
      case 'borrar_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = borrarClip(tl, c.id)
          cambios.push(`Borré el clip ${o.clip}`)
        }
        break
      }
      case 'mover_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = moverClip(tl, c.id, Math.round(o.a) - 1)
          cambios.push(`Moví el clip ${o.clip} a la posición ${o.a}`)
        }
        break
      }
      case 'recortar_clip': {
        const c = clipEn(o.clip)
        if (!c) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        if (o.entrada !== undefined) tl = recortarClip(tl, c.id, 'entrada', o.entrada, contexto.duracionFuente)
        if (o.salida !== undefined) tl = recortarClip(tl, c.id, 'salida', o.salida, contexto.duracionFuente)
        cambios.push(`Recorté el clip ${o.clip}`)
        break
      }
      case 'anadir_texto': {
        const r = anadirTexto(tl, o.inicio, o.texto)
        if (r.timeline === tl) {
          fallos.push('No pude añadir el texto: la timeline está vacía.')
          break
        }
        tl = cambiarTexto(r.timeline, r.id, { duracion: o.duracion ?? 3, posicion: o.posicion ?? 'abajo', ...(o.subtitulo ? { subtitulo: true } : {}), ...(o.detras ? { detras: true } : {}) })
        cambios.push(`Añadí el texto «${o.texto}» en ${mmss(o.inicio)}`)
        break
      }
      case 'cambiar_texto': {
        const t = textoEn(o.texto_n)
        if (!t) {
          fallos.push(`No existe el texto ${o.texto_n}.`)
          break
        }
        const cambio: Parameters<typeof cambiarTexto>[2] = {}
        if (o.texto !== undefined) cambio.texto = o.texto
        if (o.inicio !== undefined) cambio.inicio = o.inicio
        if (o.duracion !== undefined) cambio.duracion = o.duracion
        if (o.posicion !== undefined) cambio.posicion = o.posicion
        if (o.tamano !== undefined) cambio.tamano = o.tamano
        if (o.color !== undefined) cambio.color = o.color
        if (o.sin_caja !== undefined) cambio.sinCaja = o.sin_caja
        if (o.caja !== undefined) cambio.caja = o.caja
        if (o.fuente !== undefined) cambio.fuente = o.fuente
        if (o.animacion !== undefined) cambio.animacion = o.animacion === 'golpe' ? undefined : o.animacion
        if (o.pintado !== undefined) cambio.pintado = o.pintado
        if (o.color_clave !== undefined) cambio.colorClave = o.color_clave
        if (o.tiempos !== undefined) cambio.tiempos = o.tiempos
        if (o.subtitulo !== undefined) cambio.subtitulo = o.subtitulo
        if (o.detras !== undefined) cambio.detras = o.detras
        if (o.x !== undefined && o.y !== undefined && o.posicion === undefined) {
          cambio.x = o.x
          cambio.y = o.y
        }
        if (o.contorno !== undefined) cambio.contorno = o.contorno ?? undefined
        if (o.color_contorno !== undefined) cambio.colorContorno = o.color_contorno
        if (o.sombra !== undefined) cambio.sombra = o.sombra ?? undefined
        if (o.color_sombra !== undefined) cambio.colorSombra = o.color_sombra
        if (o.alineacion !== undefined) cambio.alineacion = o.alineacion === 'centro' ? undefined : o.alineacion
        if (o.espaciado !== undefined) cambio.espaciado = o.espaciado
        if (o.mayusculas !== undefined) cambio.mayusculas = o.mayusculas
        if (o.opacidad !== undefined) cambio.opacidad = o.opacidad
        if (o.giro !== undefined) cambio.giro = o.giro
        if (o.salida !== undefined) cambio.salida = o.salida === 'golpe' ? undefined : o.salida
        if (o.dur_salida !== undefined) cambio.durSalida = o.dur_salida
        if (o.oculto !== undefined) cambio.oculto = o.oculto
        if (o.bloqueado !== undefined) cambio.bloqueado = o.bloqueado
        // Girar o alinear pide un sitio propio: si no lo tiene, el del centro de su posición de siempre.
        if ((o.giro || (o.alineacion && o.alineacion !== 'centro')) && typeof t.x !== 'number' && cambio.x === undefined) {
          cambio.x = 0.5
          cambio.y = t.posicion === 'arriba' ? 0.12 : t.posicion === 'centro' ? 0.5 : 0.86
        }
        tl = cambiarTexto(tl, t.id, cambio)
        cambios.push(`Cambié el texto ${o.texto_n}`)
        break
      }
      case 'borrar_texto': {
        const t = textoEn(o.texto_n)
        if (!t) fallos.push(`No existe el texto ${o.texto_n}.`)
        else {
          tl = borrarTexto(tl, t.id)
          cambios.push(`Borré el texto «${t.texto}»`)
        }
        break
      }
      case 'anadir_capa': {
        if (o.medio === FUENTE_PRINCIPAL || contexto.medios?.[o.medio] === undefined) {
          fallos.push(`No hay ningún medio «${o.medio}» en la biblioteca.`)
          break
        }
        const tipo = medios[o.medio] >= MAX_IMAGEN ? 'imagen' : 'video'
        const r = capaNueva(tl, o.medio, tipo, o.inicio, medios, o.x ?? 0.5, o.y ?? 0.5)
        if (r.timeline === tl) {
          fallos.push('La capa nueva cae fuera del video.')
          break
        }
        const { inicio: _i, ...resto } = o
        const nueva = r.timeline.capas?.find((c) => c.id === r.id)
        tl = cambiarCapa(r.timeline, r.id, cambioDeCapa(resto, nueva), medios)
        cambios.push(`Puse encima «${o.medio}» en ${mmss(o.inicio)}`)
        break
      }
      case 'anadir_grafico': {
        if (!o.medio || !o.anchoReal) {
          fallos.push(`No pude dibujar el gráfico «${resumenGrafico(o.grafico)}».`)
          break
        }
        if (medios[o.medio] === undefined) medios[o.medio] = MAX_IMAGEN
        const { op: _op, inicio, grafico, medio, anchoReal, ...campos } = o
        const r = anadirCapa(
          tl,
          { fuente: medio, inicio, duracion: campos.duracion ?? 3, x: campos.x ?? 0.5, y: campos.y ?? 0.5, ancho: campos.ancho ?? anchoReal, pista: campos.pista ?? 3, grafico, entrada: 'pop' },
          medios
        )
        if (r.timeline === tl) {
          fallos.push('El gráfico cae fuera del video.')
          break
        }
        const nueva = r.timeline.capas?.find((c) => c.id === r.id)
        tl = cambiarCapa(r.timeline, r.id, cambioDeCapa(campos, nueva), medios)
        cambios.push(`Puse el gráfico «${resumenGrafico(grafico)}» en ${mmss(inicio)}`)
        break
      }
      case 'cambiar_grafico': {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c?.grafico) {
          fallos.push(c ? `La capa ${o.capa_n} no es un gráfico (usa cambiar_capa).` : `No existe la capa ${o.capa_n}.`)
          break
        }
        if (!o.medio || !o.final) {
          fallos.push(`No pude dibujar el gráfico de la capa ${o.capa_n}.`)
          break
        }
        if (medios[o.medio] === undefined) medios[o.medio] = MAX_IMAGEN
        const { op: _op, capa_n: _n, grafico: _g, textos: _t, final, medio, escalaAncho, ...campos } = o
        const ancho = campos.ancho ?? Math.min(1, Math.max(0.05, c.ancho * (escalaAncho ?? 1)))
        tl = cambiarCapa(tl, c.id, { fuente: medio, grafico: final, ancho }, medios)
        const ya = tl.capas?.find((x) => x.id === c.id)
        if (Object.keys(campos).length) tl = cambiarCapa(tl, c.id, cambioDeCapa(campos, ya), medios)
        cambios.push(`Cambié el gráfico de la capa ${o.capa_n}: «${resumenGrafico(final)}»`)
        break
      }
      case 'anadir_pieza': {
        if (!o.medio || !o.duracionReal) {
          fallos.push(`No pude animar «${o.pieza}».`)
          break
        }
        // Queda en el mapa de medios: si no, la siguiente pieza de este mismo pedido borraría a esta al normalizar.
        medios[o.medio] = o.duracionReal
        const r = anadirCapa(tl, { fuente: o.medio, inicio: o.inicio, duracion: o.duracionReal, x: 0.5, y: 0.5, ancho: 1, pista: 3, pieza: { id: o.pieza, valores: o.valores ?? {} } }, medios)
        if (r.timeline === tl) {
          fallos.push(`«${o.pieza}» cae fuera del video.`)
          break
        }
        tl = r.timeline
        cambios.push(`Puse la animación «${o.pieza}» en ${mmss(o.inicio)}`)
        break
      }
      case 'recortar_persona': {
        if (!o.medio || !o.clipId || !o.duracionReal) {
          fallos.push(`No pude separar a la persona del clip ${o.clip}.`)
          break
        }
        // Donde esté el clip ahora (otra operación de este pedido pudo moverlo).
        const tr = tramos(tl).find((x) => x.clip.id === o.clipId)
        if (!tr) {
          fallos.push(`El clip ${o.clip} ya no está: no puse a su persona.`)
          break
        }
        medios[o.medio] = o.duracionReal
        // Una sola por clip: la anterior (de otro recorte del mismo clip) se va.
        for (const vieja of (tl.capas ?? []).filter((c) => c.persona?.clip === o.clipId)) tl = borrarCapa(tl, vieja.id)
        const r = anadirCapa(tl, { fuente: o.medio, inicio: tr.inicio, duracion: Math.min(o.duracionReal, tr.fin - tr.inicio), x: 0.5, y: 0.5, ancho: 1, pista: 3, persona: { clip: o.clipId } }, medios)
        if (r.timeline === tl) {
          fallos.push(`No pude poner a la persona del clip ${o.clip}.`)
          break
        }
        tl = r.timeline
        cambios.push(`Separé a la persona del clip ${o.clip} y la puse encima (lo que va en las pistas 1 y 2 y los textos «detrás» quedan detrás de ella)`)
        break
      }
      case 'rotoscopiar': {
        if (!o.medio || !o.clipId || !o.duracionReal) {
          fallos.push(`No pude recortar el objeto del clip ${o.clip}.`)
          break
        }
        const tr = tramos(tl).find((x) => x.clip.id === o.clipId)
        if (!tr) {
          fallos.push(`El clip ${o.clip} ya no está: no recorté su objeto.`)
          break
        }
        medios[o.medio] = o.duracionReal
        // Un objeto puede recortarse más de uno por clip; el mismo (misma caja) se reemplaza.
        const clave = `${o.x.toFixed(2)},${o.y.toFixed(2)}`
        for (const vieja of (tl.capas ?? []).filter((c) => c.roto?.clip === o.clipId && c.roto?.clave === clave)) tl = borrarCapa(tl, vieja.id)
        const r = anadirCapa(tl, { fuente: o.medio, inicio: tr.inicio, duracion: Math.min(o.duracionReal, tr.fin - tr.inicio), x: 0.5, y: 0.5, ancho: 1, pista: 3, roto: { clip: o.clipId, clave } }, medios)
        if (r.timeline === tl) {
          fallos.push(`No pude poner el objeto recortado del clip ${o.clip}.`)
          break
        }
        tl = r.timeline
        cambios.push(`Recorté el objeto del clip ${o.clip} y lo puse encima (lo que va en las pistas 1 y 2 y los textos «detrás» quedan detrás de él)`)
        break
      }
      case 'cambiar_cielo': {
        if (!o.medio || !o.clipId || !o.duracionReal) {
          fallos.push(`No pude cambiar el cielo del clip ${o.clip}.`)
          break
        }
        const tr = tramos(tl).find((x) => x.clip.id === o.clipId)
        if (!tr) {
          fallos.push(`El clip ${o.clip} ya no está: no cambié su cielo.`)
          break
        }
        medios[o.medio] = o.duracionReal
        for (const vieja of (tl.capas ?? []).filter((c) => c.cielo?.clip === o.clipId)) tl = borrarCapa(tl, vieja.id)
        const r = anadirCapa(tl, { fuente: o.medio, inicio: tr.inicio, duracion: Math.min(o.duracionReal, tr.fin - tr.inicio), x: 0.5, y: 0.5, ancho: 1, pista: 3, cielo: { clip: o.clipId } }, medios)
        if (r.timeline === tl) {
          fallos.push(`No pude poner el cielo nuevo del clip ${o.clip}.`)
          break
        }
        tl = r.timeline
        cambios.push(`Cambié el cielo del clip ${o.clip} por «${o.cielo}»`)
        break
      }
      case 'borrar_objeto': {
        if (!o.medio || !o.clipId || !o.duracionReal) {
          fallos.push(`No pude borrar el objeto del clip ${o.clip}.`)
          break
        }
        const tr = tramos(tl).find((x) => x.clip.id === o.clipId)
        if (!tr) {
          fallos.push(`El clip ${o.clip} ya no está: no borré el objeto.`)
          break
        }
        medios[o.medio] = o.duracionReal
        // Un solo borrado por clip: el anterior se va (el nuevo ya se hizo sobre el clip tal como se ve, sin él).
        for (const vieja of (tl.capas ?? []).filter((c) => c.borrado?.clip === o.clipId)) tl = borrarCapa(tl, vieja.id)
        const r = anadirCapa(tl, { fuente: o.medio, inicio: tr.inicio, duracion: Math.min(o.duracionReal, tr.fin - tr.inicio), x: 0.5, y: 0.5, ancho: 1, pista: 3, borrado: { clip: o.clipId } }, medios)
        if (r.timeline === tl) {
          fallos.push(`No pude poner el clip ${o.clip} sin el objeto.`)
          break
        }
        tl = r.timeline
        cambios.push(`Borré el objeto del clip ${o.clip}: lo rellené con lo que lo rodea`)
        break
      }
      case 'subtitulos_animados': {
        if (o.estilo === 'ninguno') {
          const { subtitulosHF: _s, ...resto } = tl
          tl = resto
          cambios.push('Los subtítulos vuelven a ser texto simple')
          break
        }
        if (!tl.textos.some((t) => t.subtitulo)) {
          fallos.push('No hay subtítulos: créalos primero desde la voz.')
          break
        }
        const antes = tl.subtitulosHF?.pieza === o.estilo ? tl.subtitulosHF.valores : {}
        tl = { ...tl, subtitulosHF: { pieza: o.estilo, valores: { ...antes, ...(o.valores ?? {}) } } }
        // Con el render hecho para esta misma timeline, quedan animados al día.
        if (o.render?.medio && o.render.huella === huellaSubtitulos(tl)) {
          tl = { ...tl, subtitulosHF: { ...tl.subtitulosHF!, ...o.render } }
          if (o.render.duracion) medios[o.render.medio] = o.render.duracion
        }
        cambios.push(`Los subtítulos van animados con el estilo «${o.estilo}»`)
        break
      }
      case 'crear_pieza': {
        fallos.push('No se pudo crear la animación nueva.')
        break
      }
      case 'cambiar_capa': {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c) {
          fallos.push(`No existe la capa ${o.capa_n}.`)
          break
        }
        tl = cambiarCapa(tl, c.id, { ...(o.inicio !== undefined ? { inicio: o.inicio } : {}), ...cambioDeCapa(o, c) }, medios)
        if (o.orden) tl = ordenarCapa(tl, c.id, o.orden, medios)
        cambios.push(`Cambié la capa ${o.capa_n}`)
        break
      }
      case 'transicion': {
        const c = o.clip !== undefined ? tl.clips[Math.round(o.clip) - 1] : null
        if (o.clip !== undefined && (!c || Math.round(o.clip) === 1)) {
          fallos.push(!c ? `No existe el clip ${o.clip}.` : 'El primer clip no tiene nada antes: no lleva transición.')
          break
        }
        tl = fundirClip(tl, c ? c.id : null, o.tipo === 'corte' ? 0 : (o.duracion ?? 0.45), o.tipo === 'corte' ? undefined : o.tipo)
        cambios.push(o.tipo === 'corte' ? `Corte seco ${c ? `en el clip ${o.clip}` : 'en todos los cortes'}` : `Transición «${o.tipo}» ${c ? `al entrar el clip ${o.clip}` : 'en todos los cortes'}`)
        break
      }
      case 'filtros': {
        const { op: _op, ...f } = o
        tl = cambiarFiltros(tl, f)
        const puestos = FILTROS.filter((x) => (tl.filtros?.[x.id] ?? 0) > 0).map((x) => `${x.nombre.toLowerCase()} ${Math.round((tl.filtros?.[x.id] ?? 0) * 100)} %`)
        cambios.push(puestos.length ? `Filtros: ${puestos.join(', ')}` : 'Quité los filtros')
        break
      }
      case 'borrar_capa': {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c) fallos.push(`No existe la capa ${o.capa_n}.`)
        else {
          tl = borrarCapa(tl, c.id)
          cambios.push(`Quité la capa ${o.capa_n}`)
        }
        break
      }
      case 'anadir_sonido': {
        if (!o.audio) {
          fallos.push(`No pude poner el sonido «${o.sonido}».`)
          break
        }
        const r = anadirSonido(tl, { inicio: o.inicio, duracion: o.audio.duracion, archivo: o.audio.archivo, nombre: o.audio.nombre, ...(o.volumen !== undefined ? { volumen: o.volumen } : {}) })
        if (r.timeline === tl) fallos.push('El sonido cae fuera del video.')
        else cambios.push(`Puse el sonido «${o.audio.nombre}» en ${mmss(o.inicio)}`)
        tl = r.timeline
        break
      }
      case 'cambiar_sonido': {
        const s = tl.sonidos?.[Math.round(o.sonido_n) - 1]
        if (!s) {
          fallos.push(`No existe el sonido ${o.sonido_n}.`)
          break
        }
        tl = cambiarSonido(tl, s.id, { ...(o.inicio !== undefined ? { inicio: o.inicio } : {}), ...(o.volumen !== undefined ? { volumen: o.volumen } : {}) })
        cambios.push(`Ajusté el sonido ${o.sonido_n}`)
        break
      }
      case 'borrar_sonido': {
        const s = tl.sonidos?.[Math.round(o.sonido_n) - 1]
        if (!s) fallos.push(`No existe el sonido ${o.sonido_n}.`)
        else {
          tl = borrarSonido(tl, s.id)
          cambios.push(`Quité el sonido «${s.nombre}»`)
        }
        break
      }
      case 'clave_capa': {
        const capa = tl.capas?.[o.capa_n - 1]
        if (!capa) {
          fallos.push(`No existe la capa ${o.capa_n}.`)
          break
        }
        const nueva =
          o.quitar || o.valor === undefined
            ? quitarClaveCapa(tl, capa.id, o.parametro, o.en, medios)
            : o.curva
              ? curvaClaveCapa(ponerClaveCapa(tl, capa.id, o.parametro, o.en, o.valor, medios), capa.id, o.parametro, o.en, o.curva, medios)
              : ponerClaveCapa(tl, capa.id, o.parametro, o.en, o.valor, medios)
        if (nueva === tl) fallos.push(`No pude ${o.quitar ? 'quitar' : 'poner'} esa clave en la capa ${o.capa_n}.`)
        else {
          tl = nueva
          cambios.push(o.quitar ? `Quité la clave de ${o.parametro} de la capa ${o.capa_n} en ${o.en} s` : `Capa ${o.capa_n}: ${o.parametro} = ${o.valor} en ${o.en} s`)
        }
        break
      }
      case 'clave_texto': {
        const t = textoEn(o.texto_n)
        if (!t) {
          fallos.push(`No existe el texto ${o.texto_n}.`)
          break
        }
        let nueva = o.quitar || o.valor === undefined ? quitarClaveTexto(tl, t.id, o.parametro, o.en) : ponerClaveTexto(tl, t.id, o.parametro, o.en, o.valor)
        if (o.curva && !o.quitar) nueva = curvaClaveTexto(nueva, t.id, o.parametro, o.en, o.curva)
        if (nueva === tl) fallos.push(`No pude ${o.quitar ? 'quitar' : 'poner'} esa clave en el texto ${o.texto_n}.`)
        else {
          tl = nueva
          cambios.push(o.quitar ? `Quité la clave de ${o.parametro} del texto ${o.texto_n} en ${o.en} s` : `Texto ${o.texto_n}: ${o.parametro} = ${o.valor} en ${o.en} s`)
        }
        break
      }
      case 'clave': {
        const destino = clipEn(o.clip)
        if (!destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        // `en` son segundos desde que empieza el clip en la timeline; la clave se guarda en el segundo de su fuente.
        const f = fuenteEnClip(destino, o.en)
        const nueva = o.quitar || o.valor === undefined ? quitarClave(tl, destino.id, o.parametro, f) : ponerClave(tl, destino.id, o.parametro, f, o.valor)
        if (nueva === tl) fallos.push(`No pude ${o.quitar ? 'quitar' : 'poner'} esa clave en el clip ${o.clip}.`)
        else {
          tl = nueva
          cambios.push(o.quitar ? `Quité la clave de ${o.parametro} del clip ${o.clip} en ${o.en} s` : `Clip ${o.clip}: ${o.parametro} = ${o.valor} en ${o.en} s`)
        }
        break
      }
      case 'audio_clip': {
        const destino = clipEn(o.clip)
        if (!destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        const { op: _op, clip: _clip, ...cambio } = o
        tl = ajustarSonidoClip(tl, destino.id, cambio)
        const s = sonidoDe(tl.clips.find((c) => c.id === destino.id))
        cambios.push(`Sonido del clip ${o.clip}: volumen ${Math.round(s.volumen * 100)} %${s.entra ? `, entra en ${s.entra} s` : ''}${s.sale ? `, sale en ${s.sale} s` : ''}${s.limpio ? `, ruido de fondo −${Math.round(s.limpio * 100)} %` : ''}`)
        break
      }
      case 'lut': {
        const destino = o.clip === undefined ? null : clipEn(o.clip)
        if (o.clip !== undefined && !destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        // El LUT que se pone: el de otro clip (de_clip), o el que ya tiene cada uno con otra intensidad.
        const modelo = o.de_clip !== undefined ? clipEn(o.de_clip)?.lut : undefined
        if (o.de_clip !== undefined && !modelo) {
          fallos.push(`El clip ${o.de_clip} no tiene LUT que copiar.`)
          break
        }
        let hechos = 0
        for (const c of destino ? [destino] : tl.clips) {
          const base = modelo ?? c.lut
          if (!base && !o.quitar) continue
          tl = ponerLut(tl, c.id, o.quitar ? undefined : { ...base!, ...(o.intensidad !== undefined ? { intensidad: o.intensidad } : {}) })
          hechos++
        }
        if (!hechos) fallos.push('Ningún clip tiene LUT: el usuario lo carga en el inspector del clip («Cargar un LUT»).')
        else cambios.push(o.quitar ? `Quité el LUT ${destino ? `del clip ${o.clip}` : 'de todos los clips'}` : `LUT ${destino ? `del clip ${o.clip}` : 'en los clips'}${o.intensidad !== undefined ? ` al ${Math.round(o.intensidad * 100)} %` : ''}`)
        break
      }
      case 'curva': {
        const destino = o.clip === undefined ? null : clipEn(o.clip)
        if (o.clip !== undefined && !destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        for (const c of destino ? [destino] : tl.clips) tl = cambiarCurva(tl, c.id, o.canal, o.puntos.length ? o.puntos : undefined)
        cambios.push(`${o.puntos.length ? 'Puse' : 'Quité'} la curva ${CANALES_CURVA.find((c) => c.id === o.canal)!.nombre.toLowerCase()} ${destino ? `al clip ${o.clip}` : 'a todos los clips'}`)
        break
      }
      case 'velocidad': {
        const destino = clipEn(o.clip)
        if (!destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        const nueva = cambiarVelocidad(tl, destino.id, o.velocidad)
        if (nueva === tl) fallos.push(`El clip ${o.clip} ya va a esa velocidad.`)
        else {
          tl = nueva
          cambios.push(`Puse el clip ${o.clip} a ${o.velocidad}×`)
        }
        break
      }
      case 'pista': {
        const p = PISTAS.find((x) => x.id === o.pista)!
        tl = cambiarPista(tl, o.pista, { ...(o.oculta !== undefined ? { oculta: o.oculta } : {}), ...(o.bloqueada !== undefined ? { bloqueada: o.bloqueada } : {}) })
        if (o.oculta !== undefined) cambios.push(o.oculta ? `${p.audio ? 'Silencié' : 'Oculté'} la pista ${p.nombre}` : `${p.audio ? 'Volví a activar' : 'Volví a mostrar'} la pista ${p.nombre}`)
        if (o.bloqueada !== undefined) cambios.push(o.bloqueada ? `Bloqueé la pista ${p.nombre}` : `Desbloqueé la pista ${p.nombre}`)
        break
      }
      case 'zoom':
      case 'color': {
        const destino = o.clip === undefined ? null : clipEn(o.clip)
        if (o.clip !== undefined && !destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        const cambio =
          o.op === 'zoom'
            ? Object.fromEntries(
                (CAMPOS_CAMARA).filter((k) => o[k] !== undefined).map((k) => [k, o[k]])
              )
            : {
                // Un look pone el color en neutro y luego lo suyo; después, lo que se pida suelto.
                ...(o.look ? { ...COLOR_NEUTRO, ...(LOOKS.find((l) => l.id === o.look)?.ajustes ?? {}) } : {}),
                ...Object.fromEntries((CAMPOS_COLOR).filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))
              }
        tl = ajustarClip(tl, destino ? destino.id : null, cambio)
        const donde = destino ? `al clip ${o.clip}` : 'a todos los clips'
        if (o.op === 'zoom')
          cambios.push(
            o.zoom !== undefined && o.panx === undefined && o.pany === undefined && o.acercar === undefined
              ? `Puse zoom ${Math.round(Math.min(2, Math.max(1, o.zoom)) * 100)} % ${donde}`
              : `Moví la cámara ${donde}`
          )
        else cambios.push(o.saturacion === 0 ? `Pasé a blanco y negro ${donde.replace('al ', 'el ').replace('a todos', 'todos')}` : `Ajusté el color ${donde}`)
        break
      }
      case 'musica': {
        if (!tl.musica) {
          fallos.push('Todavía no hay música: añádela con el botón «Música» de la timeline.')
          break
        }
        tl = cambiarMusica(tl, { ...(o.volumen !== undefined ? { volumen: o.volumen } : {}), ...(o.ducking !== undefined ? { ducking: o.ducking } : {}) })
        const partes: string[] = []
        if (o.volumen !== undefined) partes.push(`volumen ${Math.round(tl.musica!.volumen * 100)} %`)
        if (o.ducking !== undefined) partes.push(o.ducking ? 'baja con la voz' : 'volumen fijo')
        cambios.push(`Música: ${partes.join(', ')}`)
        break
      }
      case 'quitar_musica': {
        if (!tl.musica) break
        tl = ponerMusica(tl, undefined)
        cambios.push('Quité la música')
        break
      }
      case 'sonido_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = silenciarClip(tl, c.id, !o.sonido)
          cambios.push(o.sonido ? `Devolví el sonido al clip ${o.clip}` : `Quité el sonido del clip ${o.clip}`)
        }
        break
      }
      case 'cambiar_voz': {
        const v = tl.voces?.[Math.round(o.voz_n) - 1]
        if (!v) {
          fallos.push(`No existe la frase de voz ${o.voz_n}.`)
          break
        }
        if ((o.texto !== undefined || o.voz !== undefined) && !o.audio) {
          fallos.push(`No pude generar la voz nueva de la frase ${o.voz_n}.`)
          break
        }
        tl = cambiarVoz(tl, v.id, {
          ...(o.audio ? { archivo: o.audio.archivo, duracion: o.audio.duracion, texto: o.audio.texto, voz: o.audio.voz } : {}),
          ...(o.inicio !== undefined ? { inicio: o.inicio } : {}),
          ...(o.volumen !== undefined ? { volumen: o.volumen } : {})
        })
        cambios.push(o.audio ? `Rehice la frase ${o.voz_n}: «${o.audio.texto}» (${o.audio.voz})` : `Ajusté la frase de voz ${o.voz_n}`)
        break
      }
      case 'anadir_voz': {
        if (!o.audio) {
          fallos.push(`No pude generar la frase «${o.texto}».`)
          break
        }
        const r = anadirVoz(tl, { inicio: o.inicio, duracion: o.audio.duracion, archivo: o.audio.archivo, texto: o.audio.texto, voz: o.audio.voz })
        if (r.timeline === tl) fallos.push('La frase nueva cae fuera del video.')
        else cambios.push(`Añadí la frase «${o.audio.texto}» en ${mmss(o.inicio)}`)
        tl = r.timeline
        break
      }
      case 'borrar_voz': {
        const v = tl.voces?.[Math.round(o.voz_n) - 1]
        if (!v) fallos.push(`No existe la frase de voz ${o.voz_n}.`)
        else {
          tl = borrarVoz(tl, v.id)
          cambios.push(`Quité la frase «${v.texto || o.voz_n}»`)
        }
        break
      }
      case 'reconstruir': {
        const cortes = o.cortes
          .map((c) => ({ start: Math.max(0, Math.min(c.entrada, c.salida)), end: Math.min(contexto.duracionFuente, Math.max(c.entrada, c.salida)) }))
          .filter((c) => c.end - c.start >= 0.1)
        if (!cortes.length) {
          fallos.push('Los cortes del material no eran válidos.')
          break
        }
        const nueva = timelineDesdeCortes(cortes)
        // Solo cambia la pista de video: la música, la voz, las capas, los sonidos, los rótulos y las marcas
        // que sigan cabiendo se conservan (antes se perdían y había que volver a ponerlos).
        const total = duracionTimeline(nueva)
        const cabe = <T extends { inicio: number }>(x: T) => x.inicio < total
        tl = {
          ...tl,
          clips: nueva.clips,
          textos: tl.textos.filter(cabe).map((t) => ({ ...t, id: t.id || nuevoId('texto') })),
          ...(tl.capas ? { capas: tl.capas.filter(cabe) } : {}),
          ...(tl.sonidos ? { sonidos: tl.sonidos.filter(cabe) } : {}),
          ...(tl.voces ? { voces: tl.voces.filter(cabe) } : {}),
          ...(tl.ajustesCapa ? { ajustesCapa: tl.ajustesCapa.filter(cabe) } : {}),
          ...(tl.marcadores ? { marcadores: tl.marcadores.filter((m) => m.t < total) } : {})
        }
        cambios.push(`Armé la edición con ${cortes.length} ${cortes.length === 1 ? 'corte' : 'cortes'} del material (${total.toFixed(1)} s)`)
        break
      }
    }
  }
  return { timeline: tl, cambios, fallos }
}

/**
 * Los campos de una operación de capa como cambio de `cambiarCapa` («corte» = sin entrada). Lo que
 * falte del final del recorrido sale de lo que ya tenía (o de cómo empieza: así basta con «fin_x»).
 */
function cambioDeCapa(o: CamposCapa, actual?: CapaTL): Partial<Omit<CapaTL, 'id'>> {
  const x = o.x ?? actual?.x ?? 0.5
  const y = o.y ?? actual?.y ?? 0.5
  const ancho = o.ancho ?? actual?.ancho ?? 0.3
  const giro = o.giro ?? actual?.giro ?? 0
  const base = actual?.fin ?? { x, y, ancho, giro }
  return {
    ...(o.duracion !== undefined ? { duracion: o.duracion } : {}),
    ...(o.x !== undefined ? { x: o.x } : {}),
    ...(o.y !== undefined ? { y: o.y } : {}),
    ...(o.ancho !== undefined ? { ancho: o.ancho } : {}),
    ...(o.giro !== undefined ? { giro: o.giro } : {}),
    ...(o.profundidad !== undefined ? { profundidad: o.profundidad ?? undefined } : {}),
    ...(o.pista !== undefined ? { pista: o.pista } : {}),
    ...(o.fusion !== undefined ? { fusion: o.fusion ?? undefined } : {}),
    ...(o.desenfoque !== undefined ? { desenfoque: o.desenfoque } : {}),
    ...(o.recorte === null ? { recorte: undefined } : o.recorte ? { recorte: { izq: 0, der: 0, arriba: 0, abajo: 0, ...actual?.recorte, ...o.recorte } } : {}),
    ...(o.voltear_h !== undefined ? { voltearH: o.voltear_h } : {}),
    ...(o.salida !== undefined ? { salida: o.salida === 'corte' ? undefined : o.salida } : {}),
    ...(o.dur_entrada !== undefined ? { durEntrada: o.dur_entrada } : {}),
    ...(o.dur_salida !== undefined ? { durSalida: o.dur_salida } : {}),
    ...(o.oculto !== undefined ? { oculto: o.oculto } : {}),
    ...(o.bloqueado !== undefined ? { bloqueado: o.bloqueado } : {}),
    ...(o.redondeo !== undefined ? { redondeo: o.redondeo } : {}),
    ...(o.borde !== undefined ? { borde: o.borde } : {}),
    ...(o.color_borde !== undefined ? { colorBorde: o.color_borde } : {}),
    ...(o.sombra !== undefined ? { sombraCapa: o.sombra } : {}),
    ...(o.color_sombra !== undefined ? { colorSombraCapa: o.color_sombra } : {}),
    ...(o.voltear_v !== undefined ? { voltearV: o.voltear_v } : {}),
    ...(o.entrada !== undefined ? { entrada: o.entrada === 'corte' ? undefined : o.entrada } : {}),
    ...(o.fin === null ? { fin: undefined } : o.fin ? { fin: { ...base, ...o.fin } } : {})
  }
}

/** Lo que el agente ve de la timeline: clips, textos y la voz en tiempo de timeline. */
export function describirTimelineParaAgente(
  tl: Timeline,
  transcript: TranscriptSegment[] | undefined,
  duracionFuente: number,
  limite = 30_000,
  /** El nombre de cada medio del proyecto (para que sepa qué foto o qué video es cada clip). */
  nombres: Record<string, string> = {}
): string {
  const lineas: string[] = []
  lineas.push(`Material fuente: ${duracionFuente.toFixed(1)} s. Timeline: ${duracionTimeline(tl).toFixed(1)} s.`)
  lineas.push('Clips (pista de video, en orden, sin huecos):')
  for (const tr of tramos(tl)) {
    const a = ajustesDe(tr.clip)
    const extra = tr.clip.ajustes
      ? ` [zoom ${a.zoom}, brillo ${a.brillo}, contraste ${a.contraste}, saturación ${a.saturacion}]`
      : ''
    const origen =
      tr.clip.fuente === FUENTE_PRINCIPAL
        ? 'video principal'
        : tr.clip.fuente === FUENTE_NEGRO
          ? 'negro (el usuario alargó el video para que lo de encima siga)'
          : (nombres[tr.clip.fuente] ?? 'otro medio')
    lineas.push(
      `  ${tr.indice + 1}. timeline ${tr.inicio.toFixed(2)}–${tr.fin.toFixed(2)} ← ${origen} ${tr.clip.entrada.toFixed(2)}–${tr.clip.salida.toFixed(2)}${extra}${tr.clip.mudo ? ' (sin sonido)' : tr.clip.sonido ? ` (sonido: ${JSON.stringify(tr.clip.sonido)})` : ''}`
    )
  }
  if (tl.clips.length === 0) lineas.push('  (vacía)')
  lineas.push('Textos (rótulos):')
  tl.textos.forEach((t, i) => {
    const estilo = [
      t.tamano ? `tamaño ${t.tamano}` : '',
      t.color ? `color ${t.color}` : '',
      t.sinCaja ? 'sin caja' : t.caja ? `caja ${t.caja}` : '',
      t.fuente ? `letra ${tl.letras?.find((l) => l.id === t.fuente) ? `${t.fuente} (${tl.letras.find((l) => l.id === t.fuente)!.nombre})` : t.fuente}` : '',
      t.contorno !== undefined ? `contorno ${t.contorno}${t.colorContorno ? ` ${t.colorContorno}` : ''}` : '',
      t.sombra !== undefined ? `sombra ${t.sombra}${t.colorSombra ? ` ${t.colorSombra}` : ''}` : '',
      t.alineacion ? `alineado a la ${t.alineacion}` : '',
      t.espaciado ? `espaciado ${t.espaciado}` : '',
      t.mayusculas ? 'mayúsculas' : '',
      t.opacidad !== undefined ? `opacidad ${t.opacidad}` : '',
      t.giro ? `giro ${t.giro}°` : '',
      t.animacion ? `entra: ${t.animacion}` : '',
      t.salida ? `sale: ${t.salida}${t.durSalida ? ` (${t.durSalida} s)` : ''}` : '',
      t.oculto ? 'OCULTO (no se ve)' : '',
      t.claves ? `claves: ${Object.entries(t.claves).map(([k, l]) => `${k} ${(l ?? []).map((c) => `${c.v}@${c.f}s${c.curva ? ` ${c.curva}` : ''}`).join(' → ')}`).join('; ')}` : '',
      t.bloqueado ? 'bloqueado' : '',
      t.subtitulo ? 'subtítulo' : ''
    ].filter(Boolean)
    const donde = typeof t.x === 'number' && typeof t.y === 'number' ? `en x ${t.x} y ${t.y}` : t.posicion
    lineas.push(`  ${i + 1}. ${t.inicio.toFixed(2)}–${(t.inicio + t.duracion).toFixed(2)} ${donde}: «${t.texto.replace(/\n/g, ' / ')}»${estilo.length ? ` [${estilo.join(', ')}]` : ''}`)
  })
  if (tl.textos.length === 0) lineas.push('  (ninguno)')
  if (tl.letras?.length) lineas.push(`Letras propias del proyecto (para "fuente" en cambiar_texto): ${tl.letras.map((l) => `${l.id} = ${l.nombre}`).join(', ')}.`)
  if (tl.subtitulosHF) {
    lineas.push(
      `Subtítulos animados con HyperFrames: estilo «${tl.subtitulosHF.pieza}» ${JSON.stringify(tl.subtitulosHF.valores)} (${subtitulosAlDia(tl) ? 'al día' : 'por volver a animar'}); los textos de subtítulo son su guion.`
    )
  }
  const biblioteca = Object.entries(nombres)
  if (biblioteca.length) {
    lineas.push('Medios de la biblioteca (para «anadir_capa», por su id):')
    for (const [id, nombre] of biblioteca) lineas.push(`  ${id}: ${nombre}`)
  }
  if (tl.capas?.length) {
    lineas.push('Encima del video (capas, de abajo a arriba; x, y = su centro y ancho, en fracción del cuadro):')
    tl.capas.forEach((c, i) =>
      lineas.push(
        `  ${i + 1}. ${c.inicio.toFixed(2)}–${(c.inicio + c.duracion).toFixed(2)} ${nombres[c.fuente] ?? c.fuente} (${c.fuente}) en x ${c.x} y ${c.y}, ancho ${c.ancho}${c.giro ? `, giro ${c.giro}°` : ''}, ${c.entrada ?? 'sin entrada'}` +
          (c.profundidad != null ? `, profundidad ${c.profundidad}` : '') +
          (c.pista ? `, pista ${c.pista}` : '') +
          (c.desenfoque ? `, desenfoque ${c.desenfoque}` : '') +
          (c.recorte ? `, recorte ${JSON.stringify(c.recorte)}` : '') +
          (c.salida ? `, sale: ${c.salida}` : '') +
          (c.orden ? `, orden ${c.orden} en su pista` : '') +
          (c.redondeo ? `, esquinas ${c.redondeo}` : '') +
          (c.borde ? `, borde ${c.borde} ${c.colorBorde ?? '#ffffff'}` : '') +
          (c.sombraCapa ? `, sombra ${c.sombraCapa} ${c.colorSombraCapa ?? '#000000'}` : '') +
          (c.oculto ? ', OCULTA (no se ve)' : '') +
          (c.bloqueado ? ', bloqueada' : '') +
          (c.durEntrada || c.durSalida ? `, dura la entrada ${c.durEntrada ?? 'normal'} y la salida ${c.durSalida ?? 'normal'}` : '') +
          (c.grafico ? `, GRÁFICO EDITABLE (cámbialo con cambiar_grafico): ${JSON.stringify(c.grafico)}` : '') +
          (c.voltearH ? ', volteada ↔' : '') +
          (c.voltearV ? ', volteada ↕' : '') +
          (c.fin ? ` → termina en x ${c.fin.x} y ${c.fin.y}, ancho ${c.fin.ancho}${c.fin.giro ? `, giro ${c.fin.giro}°` : ''}` : '')
      )
    )
  }
  if (tl.filtros) lineas.push(`Filtros de todo el video: ${FILTROS.filter((f) => tl.filtros?.[f.id]).map((f) => `${f.id} ${tl.filtros![f.id]}`).join(', ')}.`)
  if (tl.sonidos?.length) {
    lineas.push('Efectos de sonido:')
    tl.sonidos.forEach((s, i) => lineas.push(`  ${i + 1}. ${s.inicio.toFixed(2)} «${s.nombre}»${s.volumen !== undefined ? ` volumen ${s.volumen}` : ''}`))
  }
  if (tl.voces?.length) {
    lineas.push('Narración (frases de voz generadas, cada una con su audio):')
    tl.voces.forEach((v, i) =>
      lineas.push(`  ${i + 1}. ${v.inicio.toFixed(2)}–${(v.inicio + v.duracion).toFixed(2)}${v.voz ? ` voz ${v.voz}` : ''}${v.volumen !== undefined ? ` volumen ${v.volumen}` : ''}${v.desde !== undefined || v.largo !== undefined ? ' (pedazo: el usuario la dividió o recortó; suena solo parte de su texto)' : ''}: «${v.texto}»`)
    )
  }
  lineas.push(
    tl.musica
      ? `Música: «${tl.musica.nombre}», volumen ${tl.musica.volumen.toFixed(2)}, ${tl.musica.ducking ? 'baja cuando hay voz' : 'volumen fijo'}${tl.musica.tramos ? `; el usuario la cortó: suena solo en ${tl.musica.tramos.map((m) => `${mmss(m.inicio)}–${mmss(m.inicio + m.duracion)}`).join(', ')}` : ''}.`
      : 'Música: ninguna (se pone con el botón «Música» o, por MCP, con poner_audio).'
  )

  // Un proyecto del agente: sus clips salen de la versión limpia de SU video (mismo tiempo que el
  // principal), no del principal. Lo que se dice va entonces en tiempo de timeline, tal cual.
  const delPrincipal = tl.clips.some((c) => c.fuente === FUENTE_PRINCIPAL)
  const mismoTiempo = Math.abs(duracionTimeline(tl) - duracionFuente) < 0.5
  if (transcript?.length && !delPrincipal && mismoTiempo) {
    lineas.push('Lo que se dice en el video (la narración, en tiempo de timeline) [timeline] texto:')
    for (const s of transcript) lineas.push(`  [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text.replace(/\s+/g, ' ').trim()}`)
  } else if (transcript?.length) {
    // La voz en tiempo de timeline, por frases, con los tiempos de fuente para reconstruir.
    lineas.push('Voz dentro de la timeline [timeline | fuente] texto:')
    const voz: string[] = []
    for (const tr of tramos(tl)) {
      // La transcripción es del video principal: los clips de otros medios no la llevan.
      if (tr.clip.fuente !== FUENTE_PRINCIPAL) continue
      for (const seg of transcript) {
        if (seg.end <= tr.clip.entrada || seg.start >= tr.clip.salida) continue
        const ini = Math.max(seg.start, tr.clip.entrada)
        const fin = Math.min(seg.end, tr.clip.salida)
        const palabras = seg.words.filter((w) => w.end > ini && w.start < fin).map((w) => w.text)
        const texto = (palabras.length ? palabras.join(' ') : seg.text).replace(/\s+/g, ' ').trim()
        if (texto) voz.push(`  [${(tr.inicio + ini - tr.clip.entrada).toFixed(2)} | ${ini.toFixed(2)}–${fin.toFixed(2)}] ${texto}`)
      }
    }
    lineas.push(...voz)
    // Lo que quedó fuera de la timeline también sirve para reconstruir.
    const dentro = (t: number) => tl.clips.some((c) => c.fuente === FUENTE_PRINCIPAL && t >= c.entrada && t < c.salida)
    const fuera = transcript.filter((s) => !dentro((s.start + s.end) / 2))
    if (fuera.length) {
      lineas.push('Voz del material que NO está en la timeline [fuente] texto:')
      for (const s of fuera) lineas.push(`  [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text.replace(/\s+/g, ' ').trim()}`)
    }
  } else if (!tl.voces?.length) {
    lineas.push('El video aún no está transcrito: no sabes qué se dice.')
  }

  const texto = lineas.join('\n')
  return texto.length > limite ? `${texto.slice(0, limite)}\n… (recortado)` : texto
}

/** Las operaciones sobre la timeline: las usa el chat del editor y el MCP. */
export const OPERACIONES_DOC = `Operaciones disponibles (los tiempos van en segundos con decimales):
- {"op":"borrar_tramo","desde":T,"hasta":T}  borra un tramo de la TIMELINE (lo de después se corre). Varios seguidos se aplican del último al primero, así que usa los tiempos de la timeline actual.
- {"op":"quitar_pausas","minimo":0.6}  quita los silencios de la voz más largos que "minimo" (Recorte los calcula con precisión con la transcripción; úsala en vez de calcular tú las pausas).
- {"op":"dividir","en":T}  divide el clip bajo el segundo T de la timeline.
- {"op":"borrar_clip","clip":N}  borra el clip N (numerados desde 1).
- {"op":"mover_clip","clip":N,"a":M}  lleva el clip N a la posición M.
- {"op":"recortar_clip","clip":N,"entrada":F,"salida":F}  cambia los bordes del clip N en tiempo de FUENTE (uno o ambos).
- {"op":"anadir_texto","inicio":T,"duracion":S,"texto":"…","posicion":"arriba|centro|abajo"}  añade un rótulo en tiempo de timeline.
- {"op":"cambiar_texto","texto_n":N, "texto":"…", "inicio":T, "duracion":S, "posicion":"…"}  cambia el rótulo N.
- {"op":"borrar_texto","texto_n":N}
- {"op":"reconstruir","cortes":[{"entrada":F,"salida":F}, …]}  rehace la pista de video con estos tramos de la FUENTE, en este orden (para resúmenes, versiones cortas o reordenar por contenido). Los clips nuevos salen sin zoom ni color.
- {"op":"zoom","clip":N,"zoom":Z}  acercamiento centrado del clip N, de 1 (nada) a 2 (el doble). Sin "clip", a todos. Para enfatizar una frase: divide antes y después y pon zoom 1.15–1.3 a ese clip (punch-in).
  La misma op mueve la CÁMARA del clip (lo que no pongas no cambia): "acercar" (acercamiento lento durante el clip, 0 a 0.3; negativo se ALEJA, hasta -0.3, con zoom 1.3 o más), "cx","cy" (hacia qué punto, 0 a 1) y "panx","pany" (paneo: cuánto se desplaza ese punto al acabar, -0.5 a 0.5; necesita zoom 1.15 o más para tener imagen de sobra). "temblor" (cámara en mano, 0 a 1; 0.3 es sutil) y "campo" + "foco" (profundidad de campo: "foco" es la distancia nítida, 0 el fondo a 1 lo más cercano; lo demás se desenfoca según "campo", 0 a 1). Con capas con profundidad encima, todo esto se ve en 3D. Ej.: {"op":"zoom","clip":3,"zoom":1.2,"acercar":0.06,"panx":0.2,"temblor":0.3,"campo":0.6,"foco":0.6}. Y transforma la imagen como en Premiere: "escala" (0.1 a 1, achica con negro alrededor; para agrandar, "zoom"), "posx","posy" (-1 a 1, la corre en fracción del cuadro), "giro" (grados) y "recorteIzq","recorteDer","recorteArr","recorteAba" (0 a 0.45, recorta ese borde a negro).
- {"op":"color","clip":N,"brillo":B,"contraste":C,"saturacion":S}  brillo -0.3 a 0.3 (0 neutro), contraste 0.5 a 1.8 (1 neutro), saturación 0 (blanco y negro) a 2 (1 neutro). Sin "clip", a todos. Pon solo lo que cambies. También corrige el color como en Lumetri: "exposicion" (-2 a 2 pasos), "altas", "sombras", "blancos", "negros" (-1 a 1; sombras +0.3 abre una cara oscura), "temperatura" (-1 frío a 1 cálido) y "tinte" (-1 verde a 1 magenta).
  La misma op pone EFECTOS al clip: "desenfoque" 0 a 1 (0.35 para un fondo bajo un texto), "sepia" 0 a 1 (foto antigua), "tono" -180 a 180 (gira los colores), "invertir" 1 (negativo; 0 lo quita).
  Y un LOOK de color completo con "look" (sustituye al color y los efectos que tuviera): ${LOOKS.map((l) => `${l.id} (${l.para})`).join(', ')}. Para un flash en negativo: divide medio segundo y ponle "invertir":1.
- {"op":"clave","clip":N,"parametro":"zoom|cx|cy|brillo|contraste|saturacion|escala|posx|posy|giro|exposicion|altas|sombras|blancos|negros|temperatura|tinte|desenfoque|sepia|tono","en":S,"valor":V}  FOTOGRAMA CLAVE: ese ajuste del clip N vale V en el segundo S (contado desde que empieza el clip) y cambia suave hasta la siguiente clave. Con dos o más claves animas a mano: un zoom que entra y vuelve a salir (zoom 1 en 0, 1.4 en 1.5, 1 en 3), el encuadre que va de una cara a otra (cx, cy), un fundido a oscuro (brillo 0 → -0.3), el color que se apaga (saturacion 1 → 0), la imagen que se achica a una esquina (escala 1 → 0.4 con posx/posy) o que gira (giro). Hasta 12 claves por ajuste. "quitar":true en vez de "valor" borra la de ese segundo.
- {"op":"clave_capa","capa_n":N,"parametro":"x|y|ancho|giro|opacidad","en":S,"valor":V}  FOTOGRAMA CLAVE de una capa encima: en el segundo S (desde que aparece la capa) vale V, y cambia suave hasta la siguiente. x, y de -0.5 a 1.5 (fuera del cuadro para entrar o salir volando), ancho 0.05 a 2, giro en grados, opacidad 0 a 1. Así se hace un recorrido con curvas (varias claves de x e y), algo que crece y se encoge, un logo que aparece y se desvanece (opacidad 0 → 1 → 0). Mandan sobre "fin_x"… de anadir_capa. "quitar":true borra la de ese segundo. "curva" dice cómo va de esa clave a la siguiente: "suave" (la de siempre), "lineal", "acelera" (para salir), "frena" (para entrar) o "rebote" (llega, se pasa un poco y vuelve).
- {"op":"clave_texto","texto_n":N,"parametro":"x|y|tamano|giro|opacidad","en":S,"valor":V,"curva":"…"}  FOTOGRAMA CLAVE de un texto: en el segundo S (desde que aparece el texto) vale V. x, y su sitio (-0.5 a 1.5: puede entrar o salir volando), tamano 0.5 a 6, giro en grados, opacidad 0 a 1. Así un título cruza la pantalla, crece mientras se lee o gira y se desvanece. Con la misma "curva" que las capas. "quitar":true borra la de ese segundo.
- {"op":"audio_clip","clip":N,"volumen":V,"entra":S,"sale":S,"limpio":L}  el sonido de un clip de VIDEO: «volumen» 0 a 1.5 (1 como viene), «entra» y «sale» segundos de fundido de entrada y de salida (0 a 5), «limpio» 0 a 1 para quitar el ruido de fondo (zumbido, aire, siseo; 0.5 suele bastar). Solo los campos que cambian.
- {"op":"lut","clip":N,"intensidad":0.6}  el LUT (.cube) que el usuario cargó en un clip: "intensidad" 0 a 1, "quitar":true lo quita, "de_clip":M copia el LUT del clip M a este (sin "clip", a todos). No puedes cargar un LUT nuevo: si lo pide, dile que lo cargue en el inspector del clip («Cargar un LUT»).
- {"op":"curva","clip":N,"canal":"rgb|r|g|b","puntos":[[x,y],…]}  CURVAS de color dibujadas, como las de Lumetri: cada punto [entrada, salida] de 0 a 1 (los extremos 0,0 y 1,1 van solos), hasta 8. "rgb" es la luz (una S suave [[0.25,0.2],[0.75,0.8]] da contraste de cine; [[0.5,0.58]] aclara los medios); "r", "g", "b" cada canal (subir el azul en las sombras [[0.25,0.3]] da un look frío). "puntos":[] la quita. Sin "clip", a todos.
- {"op":"velocidad","clip":N,"velocidad":V}  cámara lenta o rápida de un clip de VIDEO: 0.25 a 4 (1 normal; 0.5 la mitad de rápido, 2 el doble). El clip dura más o menos y lo que sigue se corre. En una foto no hace nada.
- {"op":"pista","pista":"encima|video|texto|voz|sonidos|musica","oculta":true|false}  oculta (encima, texto) o silencia (video, voz, sonidos, musica) una pista entera, en el monitor y en el MP4, sin borrar lo que tiene. "bloqueada":true la protege de cambios a mano.
- {"op":"musica","volumen":V,"ducking":true|false}  volumen 0 a 1 de la música ya puesta (bajo la voz suele ir bien 0.2–0.4); ducking hace que baje sola cuando hay voz.
- {"op":"quitar_musica"}
- {"op":"sonido_clip","clip":N,"sonido":true|false}  quita o devuelve el sonido propio del clip N.
- {"op":"cambiar_texto","texto_n":N,"tamano":1.5,"color":"#ffcc00","sin_caja":true,"caja":"#0a2540","fuente":"gruesa"}  también cambia el estilo del rótulo: tamano 0.5–6 (1 normal; 4–6 para una palabra que llena la pantalla), color #rrggbb, sin_caja (solo la letra con borde), caja (el color de la caja, #rrggbb), fuente: normal, gruesa, titular (condensada muy gruesa, para palabras enormes), impacto, elegante (serif de revista), cursiva (serif cursiva de revista), maquina. Para varias líneas usa \\n en "texto". Palabras resaltadas: en "texto" pon entre asteriscos las palabras clave («No es *timidez*») y "color_clave":"#rrggbb" les da su color. "animacion": cómo aparece: "rotulo" (aparece fundiéndose y crece un poco: limpio y profesional), "palabras" (palabra a palabra), "pintar" (la frase entera y cada palabra se pinta de color cuando se dice, como un karaoke; "pintado":"#rrggbb" es ese color, amarillo si no), "maquina" (letra a letra), "pop" (rebota), "subir" o "golpe" (de golpe). "tiempos": [s, s, …] dice cuándo se dice cada palabra (segundos desde que empieza el rótulo, uno por palabra): con ellos «palabras» y «pintar» van al ritmo exacto de la voz.
- {"op":"cambiar_voz","voz_n":N,"texto":"…","voz":"Kore","inicio":T,"volumen":V}  cambia la frase de narración N. Con "texto" o "voz", Recorte vuelve a generar SOLO esa frase (con la voz que ya tenía si no das otra). "inicio" la mueve, "volumen" 0–1.5.
- {"op":"anadir_voz","inicio":T,"texto":"…","voz":"Kore"}  añade una frase de narración nueva en el segundo T (sin "voz", la de las demás frases).
- {"op":"borrar_voz","voz_n":N}
- {"op":"cambiar_texto","texto_n":N,"x":0.5,"y":0.3}  pone el rótulo donde quieras: x, y son su centro en fracción del cuadro (0 izquierda/arriba, 1 derecha/abajo). Para volver a arriba, centro o abajo, usa "posicion".
- {"op":"cambiar_texto","texto_n":N,"sin_caja":true,"contorno":0.08,"color_contorno":"#000000","sombra":0.05,"color_sombra":"#000000","alineacion":"izquierda","espaciado":0.05,"mayusculas":true,"opacidad":0.9,"giro":-8}  más estilo: sin caja, "contorno" (grosor 0–0.25 del tamaño de la letra; 0 sin contorno) y "sombra" (lo que se separa, 0–0.25) con sus colores, en vez del halo oscuro de siempre (null vuelve al halo). "alineacion" izquierda, derecha o centro: con x, y, x es el borde de ese lado. "espaciado" entre letras (−0.1 a 0.5), "mayusculas", "opacidad" 0–1 y "giro" en grados a favor del reloj (−180 a 180; gira sobre su punto x, y). "salida":"fundido|encoger|desenfoque|golpe" es cómo se va al terminar y "dur_salida" lo que tarda (0.1–2 s). Más entradas en "animacion": "desenfoque" (de borroso a nítido) y "palabras-desenfoque" (palabra a palabra, cada una de borrosa a nítida, al ritmo de "tiempos").
- {"op":"anadir_capa","medio":"ID","inicio":T,"duracion":S,"x":0.5,"y":0.5,"ancho":0.25,"giro":0,"entrada":"pop|fundido|izquierda|derecha|arriba|abajo|corte"}  pone encima del video un medio de la biblioteca (un logo, un ícono, una foto, una toma de apoyo), por su id. x, y = su centro y ancho = su ancho, en fracción del cuadro; giro en grados. "pop" (por defecto) entra rebotando; úsalo para logos e íconos que aparecen cuando se nombran. "izquierda/derecha/arriba/abajo" entra deslizándose desde fuera. No tapes caras ni manos que importan.
  Para que SE MUEVA mientras está, di dónde termina: "fin_x","fin_y","fin_ancho","fin_giro" (lo que no pongas, igual que al empezar; se puede terminar fuera del cuadro, de -0.5 a 1.5). Va suave de un sitio al otro durante toda su duración. Ejemplos: un avión que cruza ("x":-0.2 → "fin_x":1.2), paralaje (un fondo que se desliza 0.04 y crece 1.05), una foto que se acerca ("fin_ancho" 1.3 veces el ancho), algo que gira ("fin_giro":15). Con "quieta":true deja de moverse.
  ESCENA 2.5D: "profundidad" de 0 a 1 hace que la capa siga a la cámara del clip de debajo (su zoom, acercamiento y paneo): 0 se mueve pegada al fondo, 1 (muy cerca) se mueve y crece 2,5 veces más. Así un paisaje armado con recortes (montañas 0.2, una casa 0.5, una bandera 0.6, la persona 0.4) se siente con distancia cuando la cámara se mueve. "profundidad":"fija" la vuelve a pegar a la pantalla (para logos y textos). "desenfoque" de 0 a 1: fuera de foco, para lo que está muy cerca (un primer plano) o muy lejos.
  FUSIÓN: "fusion" mezcla la capa con lo de debajo, como en Premiere: ${MODOS_FUSION.map((m) => `${m.id} (${m.para})`).join(', ')}; "normal" lo quita. Así una textura de papel con multiplicar, o luz, fuego y polvo sobre fondo negro con pantalla, se funden sin recortarlos.
  PISTAS: "pista" 1 a 3 es en qué pista de video de «Encima» va la capa (sin ella, la 1): las de una pista más alta tapan a las de abajo. Úsalo para apilar varias cosas a la vez (una toma de apoyo en la 1, un marco en la 2 y el logo en la 3).
- {"op":"anadir_grafico","inicio":T,"duracion":S,"x":0.5,"y":0.5,"grafico":{…}}  pone un GRÁFICO EDITABLE: una tarjeta con palabra clave, un rótulo con su caja, un botón de llamada a la acción, un dato, el logo con un texto. Es TEXTO DE VERDAD con su caja diseñada (como los gráficos de Premiere o los textos de CapCut): el usuario cambia después las palabras, la letra y los colores en la pestaña «Gráficos». Úsalo en vez de una imagen hecha con el texto dentro. Entra con pop; lleva "entrada", "salida", "ancho" (sin él, su tamaño de diseño), claves… como cualquier capa.
  "grafico": {"disposicion":"columna|fila","alinear":"izquierda|centro|derecha","separacion":12,"margenX":40,"margenY":28,"ancho":PX opcional,
    "fondo":{"color":"#rrggbb","color2":"#rrggbb" (degradado, opcional),"angulo":90,"radio":24,"opacidad":1,"borde":0,"colorBorde":"#ffffff"} (sin fondo, solo los textos),
    "acento":{"lado":"izquierda|arriba|abajo","color":"#rrggbb","grosor":12} (una barra de color, como en un rótulo de nombre),
    "sombra":0.5,
    "elementos":[{"tipo":"texto","texto":"PALABRA","tamano":84,"peso":900,"color":"#ffffff","fuente":"normal|gruesa|titular|… o el id de una letra propia","mayusculas":true,"espaciado":0.02,"contorno":3,"colorContorno":"#000000","caja":{"color":"#ffd60a","radio":12,"margenX":18,"margenY":4},"anchoMax":PX},
                 {"tipo":"imagen","medio":"ID de una imagen de la biblioteca o logo","alto":120}]}
  Las medidas van en píxeles de un cuadro de 1080 de ancho (un texto grande, 80–110; uno chico, 36–48). Usa los colores y la letra de la marca.
- {"op":"cambiar_grafico","capa_n":N,"textos":["NUEVA","Otra línea"]}  cambia los textos de un gráfico ya puesto, en orden; o "grafico":{…} con solo lo que cambia (fondo, acento, sombra, alinear… o "elementos" enteros). Se vuelve a dibujar y queda en su sitio y a su escala.
- {"op":"anadir_pieza","pieza":"ID","inicio":T,"duracion":S,"valores":{…}}  pone una PIEZA ANIMADA de diseño en movimiento (con los colores y el logo de la marca; se anima sola en unos segundos). Es lo que hace que un video se vea hecho por un editor de motion: úsalas con criterio, una por momento importante. "valores" cambia sus datos (colores #rrggbb, "marca" o "marca2"; sin ellos, los de la marca). Las piezas:
  titulo-impacto (2.6 s: abrir o cambiar de tema; "texto", "etiqueta" arriba opcional, "conFondo" true/false)
  rotulo-inferior (4 s: presentar a alguien o un lugar; "nombre", "cargo")
  frase-pildora (3 s: una frase clave, cada palabra marcada en una píldora; "texto", "tiempos" "0,0.4,0.9" con cuándo se dice cada palabra)
  lista-checks (4 s: lo que se ofrece; "titulo", "item1".."item4")
  dato-contador (3 s: un número que sube; "numero", "prefijo", "sufijo", "texto")
  sello-oferta (2.6 s: precio, descuento o «¡Nuevo!»; "texto", "subtexto")
  llamado-accion (3.2 s: que hagan algo, antes del final; "texto" del botón, "subtexto" con @usuario o dirección)
  barrido-marca (1.1 s: transición; ponla con su centro justo en un corte, inicio = corte − 0.55)
  destellos (2 s: celebrar un momento; "x","y" en % desde dónde salen)
  cierre-logo (2.4 s: el final, con el logo; "texto" eslogan opcional, "conFondo" true para tapar el video)
- {"op":"rotoscopiar","clip":N,"x":0.5,"y":0.5,"ancho":0.3,"alto":0.5}  RECORTA UN OBJETO del clip (una persona, un coche, un producto, una mano: lo que sea) con bordes finos y lo sigue por todo el clip; queda encima del mismo clip, así un texto «detrás» (cambiar_texto con "detras":true) o lo que pongas en las pistas 1 y 2 se ve por detrás del objeto, o le cambias el fondo. La caja va en fracciones del cuadro al EMPEZAR el clip (x,y = el CENTRO del objeto, ancho y alto lo que mide, un poco más grande que él); míralo antes con ver_cuadro. Tarda (unos 0,4 s por cuadro). Con más de un objeto, pídelos uno por uno. Si cambias el recorte o el color del clip después, vuelve a pedirlo.
- {"op":"cambiar_cielo","clip":N,"cielo":"atardecer"}  CAMBIA EL CIELO del clip: "azul", "atardecer", "amanecer", "nublado", "noche" o la ruta de una imagen de cielo. Busca el cielo (lo claro o azul que toca el borde de arriba, lejos de la cámara) y lo reemplaza; se corre despacio. Sirve en tomas de exterior con el cielo bien visible; no en interiores ni con árboles muy encima del horizonte (el follaje fino queda con orillas). Tarda (unos 4 s por segundo de clip). Si cambias el recorte o el color del clip después, vuelve a pedirlo.
- {"op":"borrar_objeto","clip":N,"x":0.85,"y":0.9,"ancho":0.2,"alto":0.1}  BORRA UN OBJETO del clip (un logo, una marca de agua, un cartel, algo que se coló): la caja va en fracciones del cuadro (x,y = el CENTRO del objeto, 0 a 1; ancho y alto, lo que mide). Mira antes un cuadro (ver_cuadro) para medir bien la caja, un poco más grande que el objeto. La caja es la del objeto AL EMPEZAR el clip: Recorte saca su forma exacta (SAM 2) y lo sigue solo aunque se mueva, así que no hace falta decir hacia dónde va (si aun así quieres, "hasta_x" y "hasta_y" son su centro al final). Rellena con lo que lo rodea, así que va bien con objetos chicos o medianos sobre fondos parejos; algo muy grande (una persona de cerca) queda borroso. Si no lo encuentra en el primer cuadro, dice que ajustes la caja. Tarda (unos 3 s por segundo de clip). Después de esto no cambies el recorte ni el color del clip: se vuelve a pedir.
- {"op":"recortar_persona","clip":N}  SEPARA A LA PERSONA DEL FONDO en ese clip (tarda: unos 10 s por segundo de clip) y la pone encima de él, calzada. Con eso: (1) TEXTO DETRÁS DE LA PERSONA: un cambiar_texto o anadir_texto con "detras":true se ve por detrás de su cabeza y su cuerpo (el título grande que la persona tapa: úsalo con letra gruesa y grande, "tamano" 2 o más, sin caja, donde la persona lo tape en parte); (2) lo que pongas en las pistas 1 y 2 (anadir_pieza, anadir_capa) también queda detrás de ella; (3) FONDO DESENFOCADO O CAMBIADO: desenfoca el clip, o pon una imagen a pantalla completa en la pista 1, y la persona sigue nítida encima. Hazlo en clips donde se ve bien a la persona (no de muy lejos ni saliendo del cuadro). Si después cambias el recorte, el zoom o el color del clip, vuelve a pedirlo.
- {"op":"subtitulos_animados","estilo":"subtitulos-rotulo","valores":{"colorClave":"#72f9fd"}}  SUBTÍTULOS ANIMADOS con HyperFrames: los textos de subtítulo (los que hiciste desde la voz) siguen siendo el guion y el estilo los dibuja encima, frase a frase y al ritmo de cada palabra; las palabras entre *asteriscos* van resaltadas. Estilos: subtitulos-rotulo (bloque oscuro, letra gruesa, la frase crece un poco; "colorCaja","colorTexto","colorClave","mayusculas","y","tamano"), subtitulos-pildora (palabra a palabra con la que suena sobre una píldora; "colorPildora","colorTexto","colorClave","mayusculas","y","tamano"), subtitulos-palabra (de a 1-3 palabras enormes al centro; "colorTexto","colorClave","porGrupo","y","tamano") y los que el usuario creó. "estilo":"ninguno" vuelve al texto simple. Si corriges un subtítulo con cambiar_texto, se vuelven a animar solos. Un texto que va con la voz pero no está marcado como subtítulo se marca con cambiar_texto "subtitulo":true (y anadir_texto acepta "subtitulo":true); "subtitulo":false lo saca.
- {"op":"crear_pieza","peticion":"…","inicio":T,"duracion":S}  (solo en el chat de Recorte) una animación NUEVA a medida cuando ninguna de las de arriba sirve o el usuario pide algo distinto: describe con detalle cómo debe verse y moverse (estilo, ritmo, colores, qué textos lleva). La crea tu agente con HyperFrames en unos minutos, queda puesta en el segundo T y guardada para reusarla.
- {"op":"cambiar_capa","capa_n":N, …los mismos campos…}  y {"op":"borrar_capa","capa_n":N}. También "recorte":{"izq":0.1,"der":0,"arriba":0.2,"abajo":0} (lo que se oculta de cada lado del medio, en fracción; la capa no se mueve ni cambia de tamaño; null lo quita), "voltear_h":true (espejo) y "voltear_v":true. "salida":"fundido|encoger|izquierda|derecha|arriba|abajo|corte" es cómo se va al terminar (corte: de golpe), y "dur_entrada" / "dur_salida" lo que duran la entrada y la salida (0.1–2 s). "orden":"frente|atras|subir|bajar" la pone encima o debajo de las demás de su pista. "redondeo" 0–1 (esquinas redondeadas; 1 = un círculo o una píldora: ideal para una foto de perfil), "borde" 0–0.2 (grosor por dentro, en fracción de su ancho) con "color_borde", y "sombra" 0–1 con "color_sombra". "oculto":true la esconde sin borrarla y "bloqueado":true evita que el usuario la mueva sin querer (también en cambiar_texto). Respeta lo que el usuario dejó bloqueado: no lo cambies salvo que te lo pida.
- {"op":"transicion","clip":N,"tipo":"${TRANSICIONES.map((x) => x.id).join('|')}|corte","duracion":0.45}  cómo entra el clip N sobre el anterior (sin "clip": en todos los cortes). Por familias: ${GRUPOS_TRANSICION.map((g) => `${g.toLowerCase()} (${TRANSICIONES.filter((x) => x.grupo === g).map((x) => `${x.id}: ${x.para}`).join('; ')})`).join('. ')}. corte = sin transición. Con medida: un documental rápido usa cortes secos y alguna transición en los cambios de tema.
- {"op":"filtros","grano":0.3,"polvo":0.2,"trama":0.4,"vineta":0.5,"parpadeo":0.1}  filtros para TODO el video, de 0 (nada) a 1 (fuerte): grano de película, polvo y rayas, trama de puntos de imprenta, viñeta (bordes oscuros) y parpadeo de proyector. Un 0 quita ese filtro. Para un aire de documental o de archivo: grano 0.3, polvo 0.2, viñeta 0.5; trama 0.4 para un aire de revista.
- {"op":"anadir_sonido","sonido":"ID","inicio":T,"volumen":0.6}  un efecto de sonido de los que trae Recorte, por su id:
${SONIDOS_INCLUIDOS.map((s) => `  ${s.id} (${s.para})`).join(String.fromCharCode(10))}
  Úsalos con medida: en lo que aparece o cambia, no en cada corte. Los ambientes (lluvia, trafico, obra, maquinas, multitud) van de fondo, más bajos (volumen 0.3). La subida y la reversa terminan en seco: ponlas para que acaben justo en el corte (inicio = corte − su duración).
- {"op":"cambiar_sonido","sonido_n":N,"inicio":T,"volumen":V}  y {"op":"borrar_sonido","sonido_n":N}
Las voces son de Gemini: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat. Cambia solo las frases que el usuario pide: cada frase nueva gasta voz.`

export const INSTRUCCIONES_AGENTE = `Eres el editor de video de Recorte. Editas la timeline del usuario hablando con él en español.
Respondes SOLO con un objeto JSON, sin texto alrededor:
{"mensaje": "lo que le dices al usuario, breve", "operaciones": [ ... ]}

${OPERACIONES_DOC}

Las operaciones se aplican en orden y cada una ve la timeline que dejó la anterior.
Corta siempre en fronteras de frase: usa los tiempos de la voz. No inventes contenido que no está en la transcripción.
Si el usuario solo pregunta algo, responde con "operaciones": [].
No puedes elegir ni crear archivos de música: si no hay música y la piden, dile que la añada con el botón «Música» y que luego tú la ajustas.
Si algo no se puede hacer con estas operaciones, dilo en el mensaje y no lo simules.

Acabado profesional (cuando pidan «dale estilo», «que se vea pro», animaciones, títulos o un cierre): piensa como un editor
de motion, no como una plantilla. Con las piezas animadas (anadir_pieza):
- Un título al empezar (titulo-impacto) con la idea del video en 2 a 5 palabras sacadas de lo que se dice, en el primer segundo.
- Un rótulo (rotulo-inferior) cuando se presenta a alguien o un lugar, no tapando caras.
- La frase más importante con frase-pildora y sus "tiempos" sacados de la transcripción (cuándo se dice cada palabra).
- Si hay una lista de cosas, lista-checks; si hay una cifra, dato-contador; si hay un precio o descuento, sello-oferta.
- El llamado a la acción (llamado-accion) antes del final, con lo que de verdad pide el video (visitar, escribir, seguir).
- El cierre con el logo (cierre-logo, "conFondo": true) en los últimos 2–3 segundos.
- Como mucho una pieza a la vez y nunca encima de otra; deja aire entre ellas. Un barrido-marca solo en un cambio de tema.
- Acompáñalas con efectos de sonido suaves (whoosh al entrar, pop al aparecer un logo, ding en un dato), volumen 0.3–0.5.
Usa los textos reales del video (sin inventar datos, precios ni usuarios). Si falta algo (el @usuario, una dirección), pon
la pieza sin ese dato y dile al usuario en el mensaje qué poner.

${INSTRUCCIONES_CRITERIO}`
