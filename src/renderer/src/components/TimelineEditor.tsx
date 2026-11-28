import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { VistaPrevia } from '../hooks/vistaprevia'
import {
  ajustarClip,
  ponerLut,
  cambiarCurva,
  ubicar,
  MODOS_FUSION,
  seguirConCapa,
  type ModoFusion,
  claveCapaEn,
  estadoCapa,
  ponerClaveCapa,
  quitarClaveCapa,
  type ParametroClaveCapa,
  ajustesEn,
  claveEn,
  PARAMETROS_CLAVE,
  ponerClave,
  quitarClave,
  type ParametroClave,
  aplicarLook,
  COLOR_NEUTRO,
  EFECTOS_VIDEO,
  filtroColorCss,
  LOOKS,
  PELICULAS,
  cambiarPista,
  cambiarVelocidad,
  PISTAS_ENCIMA,
  pistaDeCapa,
  ajustarSonidoClip,
  sonidoDe,
  LIMITES_VELOCIDAD,
  PISTAS,
  velocidadDe,
  type PistaId,
  anadirCapa,
  cambiarTexto as cambiarTextoTL,
  ajustesDe,
  anadirTexto,
  cambiarMusica,
  ponerMusica,
  LIMITES_TAMANO,
  FUENTES_TEXTO,
  MAX_FUNDIDO,
  fundirClip,
  type AjustesClip,
  type MusicaTL,
  borrarClip,
  borrarTexto,
  cambiarTexto,
  dividir,
  duplicarClip,
  duracionTimeline,
  DURACION_MINIMA,
  finSinNegro,
  conNegroHasta,
  moverClip,
  puntosIman,
  recortarClip,
  tramos,
  vozEnTimeline,
  type PosicionTexto,
  type Timeline,
  borrarVoz,
  cambiarVoz,
  silenciarClip,
  capaNueva,
  cambiarCapa,
  borrarCapa,
  anadirSonido,
  cambiarSonido,
  borrarSonido,
  DURACION_IMAGEN,
  insertarClip,
  TIPO_ARRASTRE_MEDIO,
  SONIDOS_INCLUIDOS,
  TIPOS_SONIDO,
  VOLUMEN_SONIDO,
  cambiarFiltros,
  FILTROS,
  TRANSICIONES,
  GRUPOS_TRANSICION,
  COLOR_PINTADO,
  ANIMAR_CAPA,
  TOMAS_CAMARA,
  type TipoAnimar,
  type TransicionClip,
  MOVIMIENTOS_CAPA,
  type EntradaCapa,
  type FinCapa,
  COLORES_MARCADOR,
  LIMITES_AJUSTES,
  ponerMarcador,
  cambiarMarcador,
  borrarMarcador,
  extraerRango,
  rodarCorte,
  ESTILOS_SUBTITULO,
  PLANTILLAS_TEXTO,
  subtitulosDesdeVoz,
  type PalabraVoz,
  quitarSubtitulos,
  anadirAjusteCapa,
  cambiarAjusteCapa,
  borrarAjusteCapa,
  AJUSTES_DE_CAPA,
  type AjusteDeCapa,
  cambiarAngulo,
  clipsSeguidos,
  desanidarClip,
  ponerClaveRampa,
  quitarClaveRampa,
  velocidadEnFuente,
  fuenteEnClip,
  clipEnFuente,
  cambiarZonas,
  zonaEn,
  MAX_ZONAS,
  type ZonaTL,
  ponerClaveVolumen,
  quitarClaveVolumen,
  valorClave,
  PISTAS_SONIDOS,
  deslizarContenido,
  desplazarClip,
  type ColorMarcador, unirAudio, dividirSonido, dividirVoz, dividirMusica, cambiarTramoMusica, borrarTramoMusica, tramosMusica,
  CANALES_CURVA,
  type LutClip
} from '../../../shared/timeline'
import type { OpcionesExport } from '../../../shared/api'
import type { TranscriptSegment } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon, type IconName } from '../Icons'
import { Onda } from './Onda'
import { EditorCurvas } from './EditorCurvas'
import { Medidor, Mezclador, textoLufs, useNiveles, useSonoridad } from './Mezclador'
import { useMenuContextual, type OpcionMenu } from './MenuContextual'
import { InspectorVoz, type GenerarVoz, type GrabarVoz } from './InspectorVoz'
import { EstiloTexto } from './EstiloTexto'
import { alinearPiezas, cajaDePieza, moverPiezas, type Alineacion, type Pieza } from '../grupo'
import type { Caja } from '../guias'
import { duplicarCapa, duplicarTexto, estiloDeCapa, estiloDeTexto, ordenarCapa, pegarEstiloCapa, pegarEstiloTexto, type EstiloCapa, type TextoTL } from '../../../shared/timeline'
import { cambiarTextoEn, textoEn } from '../../../shared/timeline'
import { LIMITE_BORDE_CAPA, CURVAS_CLAVE, curvaClaveCapa, type CurvaClave } from '../../../shared/timeline'
import { DURACIONES_ANIMACION, durEntradaCapa, durSalidaCapa, durSalidaTexto, porPalabras, type SalidaCapa } from '../../../shared/timeline'
import { reanclarTexto, rotuloEnMonitor } from '../rotulos'
import { resumenGrafico } from '../../../shared/grafico'
import { ValorArrastrable } from './ValorArrastrable'
import { CarrilClaves } from './CarrilClaves'
import { BarraZoom } from './BarraZoom'
import { MuestraTransicion } from './MuestraTransicion'
import { PortadaModal } from './PortadaModal'
import { AnimacionesTexto } from './AnimacionesTexto'
import { moverClave, moverClaveCapa, moverClaveRampa, moverClaveVolumen } from '../../../shared/timeline'
import { durEntradaTexto, ponerPortada } from '../../../shared/timeline'

/**
 * La timeline editable: regla, pista de video magnética, pista de textos y la voz
 * (la transcripción en tiempo de timeline). Todo cambio pasa por `historial.aplicar`,
 * así que todo se puede deshacer; mientras se arrastra, se enseña un borrador.
 */

export interface ControlExportar {
  activo: boolean
  pct: number
  hayTranscripcion: boolean
  hayArchivo: boolean
  /** El material ya es vertical: el formato «original» ya es 9:16. */
  vertical: boolean
  onExportar: (opciones: OpcionesExport) => void
  onAbrir: () => void
  /** Dónde va a quedar el MP4. */
  destino?: string
}

export type Elegido = { tipo: 'clip' | 'texto' | 'musica' | 'voz' | 'capa' | 'sonido' | 'ajuste'; id: string } | null

const IMAN_PX = 8
const PASOS_REGLA = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200]

/** 75.4 → "1:15.4" */
export function tc(segundos: number, decimas = true): string {
  const s = Math.max(0, segundos)
  const min = Math.floor(s / 60)
  const resto = s - min * 60
  const entero = Math.floor(resto)
  const base = `${min}:${String(entero).padStart(2, '0')}`
  return decimas ? `${base}.${Math.floor((resto - entero) * 10)}` : base
}

/** El código de tiempo de Premiere: 75.4 s a 30 cuadros → "00:01:15:12". */
export function tcCuadros(segundos: number, fps = 30): string {
  const f = Math.max(1, Math.round(fps))
  const total = Math.round(Math.max(0, segundos) * f)
  const cuadro = total % f
  const s = Math.floor(total / f)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(Math.floor(s / 3600))}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}:${dos(cuadro)}`
}

/**
 * Lo que se escribe en el código de tiempo, en segundos: «00:01:02:15» (horas, minutos, segundos y cuadros), «1:02»,
 * «62.5» o «+15» / «-15» (cuadros desde `ahora`). Null si no se entiende.
 */
export function leerCodigoTiempo(texto: string, fps = 30, ahora = 0): number | null {
  const t = texto.trim().replace(',', '.')
  const f = Math.max(1, Math.round(fps))
  const relativo = t.match(/^([+-])\s*(\d+)$/)
  if (relativo) return Math.max(0, ahora + (relativo[1] === '-' ? -1 : 1) * (Number(relativo[2]) / f))
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  const partes = t.split(/[:;]/)
  if (partes.length < 2 || partes.length > 4 || partes.some((x) => !/^\d+(\.\d+)?$/.test(x))) return null
  const n = partes.map(Number)
  if (n.length === 4) return n[0] * 3600 + n[1] * 60 + n[2] + n[3] / f
  if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2]
  return n[0] * 60 + n[1]
}

/** Las herramientas de la línea de tiempo (como la paleta de Premiere). */
export type Herramienta = 'seleccion' | 'rodar' | 'deslizar' | 'desplazar' | 'cuchilla' | 'mano'
const HERRAMIENTAS: { id: Herramienta; nombre: string; tecla: string; icono: IconName; para: string }[] = [
  {
    id: 'seleccion',
    nombre: 'Selección',
    tecla: 'V',
    icono: 'seleccion',
    para: 'elegir, mover y recortar (en la pista de video, recortar un borde corre todo lo de después: es el recorte de onda)'
  },
  { id: 'rodar', nombre: 'Recorte rodado', tecla: 'N', icono: 'rodar', para: 'arrastra un corte entre dos clips: uno se alarga lo que el otro se acorta' },
  { id: 'deslizar', nombre: 'Deslizar', tecla: 'Y', icono: 'deslizar', para: 'arrastra un clip para mostrar otro tramo de su video sin moverlo ni cambiar su duración' },
  { id: 'desplazar', nombre: 'Desplazar', tecla: 'U', icono: 'desplazar', para: 'arrastra un clip entre sus vecinos: él no cambia y los de los lados se ajustan' },
  { id: 'cuchilla', nombre: 'Cuchilla', tecla: 'C', icono: 'scissors', para: 'cortar un clip donde hagas clic' },
  { id: 'mano', nombre: 'Mano', tecla: 'H', icono: 'mano', para: 'arrastrar para recorrer la línea de tiempo' }
]

function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function TimelineEditor({
  timeline,
  duracionFuente,
  duracionDe,
  nombreDe,
  onAgregarClips,
  agregandoClips,
  transcript,
  tiempo,
  reproduciendo,
  onBuscar,
  onAlternar,
  historial,
  elegido,
  onElegir,
  varios: variosFuera,
  onVarios,
  exportar,
  importarMusica,
  generarVoz,
  grabarVoz,
  onCambiarArchivo,
  onQuitarFondo,
  onAnimarCapa,
  quitandoFondo,
  medios,
  duraciones,
  ponerSonido,
  paneles,
  importarLut,
  panelMedios,
  panelSubtitulos,
  pestanasExtra,
  miniaturaDe,
  urlDe,
  ondaDe,
  onCongelar,
  congelando,
  onEstabilizar,
  estabilizando,
  onSepararPersona,
  separandoPersona,
  onBorrarObjeto,
  onCambiarCielo,
  onRecortarObjeto,
  onExportarCuadro,
  onPantallaCompleta,
  pantallaCompleta,
  sacandoCuadro,
  onAnidar,
  anidando,
  onSepararAudio,
  onPalabrasDeVoces,
  separando,
  seguirZona,
  fps = 30,
  vistaPrevia,
  portadaDe
}: {
  /** El proyecto y la medida del video, para la portada (sin ella, no se ofrece: en una demo). */
  portadaDe?: { proyectoId: string; ancho: number; alto: number }
  /** La vista previa renderizada: se marca en la regla qué tramos pesados ya están listos. */
  vistaPrevia?: VistaPrevia | null
  /** Sigue una zona tapada por el video (una cara que se mueve). */
  seguirZona?: (
    fuente: string,
    pedido: { desde: number; hasta: number; en: number; x: number; y: number; ancho: number; alto: number }
  ) => Promise<{ recorrido: { f: number; x: number; y: number }[]; perdido: number }>
  /** Separa el sonido del clip (lo pasa a la pista de sonidos). */
  /** Separa el sonido de uno o varios clips en la pista de sonidos. */
  onSepararAudio?: (ids: string | string[]) => void
  /** Las palabras de los audios de voz con sus segundos (para subtítulos al ritmo de la voz). */
  onPalabrasDeVoces?: (archivos: string[]) => Promise<Record<string, PalabraVoz[]>>
  separando?: boolean
  /** Anida varios clips seguidos en uno. */
  onAnidar?: (ids: string[]) => void
  anidando?: boolean
  /** Guarda el cuadro del cabezal como imagen. */
  onExportarCuadro?: () => void
  /** Ver el monitor a pantalla completa (o volver). */
  onPantallaCompleta?: () => void
  pantallaCompleta?: boolean
  sacandoCuadro?: boolean
  /** Estabiliza un clip de video (su tramo sale estable a la biblioteca). */
  onEstabilizar?: (clipId: string) => void
  /** El clip que se está estabilizando. */
  estabilizando?: string | null
  /** Separa a la persona del fondo del clip y la pone encima (para textos y piezas detrás de ella, o cambiar el fondo). */
  onSepararPersona?: (clipId: string) => void
  /** Recorta el objeto marcado con una zona «Recortar» (rotoscopia por clic) y lo deja encima del clip, con transparencia. */
  onRecortarObjeto?: (clipId: string) => void
  /** Cambia el cielo del clip (un cielo de la lista o la ruta de una imagen) y deja el clip con el cielo nuevo encima. */
  onCambiarCielo?: (clipId: string, cielo: string) => void
  /** Borra el objeto marcado con una zona «Borrar» del clip y deja el clip sin él encima. */
  onBorrarObjeto?: (clipId: string) => void
  /** El clip al que se le está separando la persona, y cuánto lleva (0 a 1). */
  separandoPersona?: { clip: string; pct: number } | null
  /** Congela el cuadro del cabezal: lo pone como un clip quieto ahí mismo. */
  onCongelar?: () => void
  congelando?: boolean
  /** La clave de la onda de una fuente de video (su sonido, dibujado en sus clips). */
  ondaDe?: (fuente: string) => string | undefined
  /** Los cuadros por segundo del proyecto (para el código de tiempo y el avance cuadro a cuadro). */
  fps?: number
  /** La miniatura de una fuente (el video principal o un medio), para verla dentro de sus clips. */
  miniaturaDe?: (fuente: string) => string | undefined
  /** La dirección de un archivo del proyecto (para dibujar la onda de un audio). */
  urlDe?: (archivo: string) => string
  /** Elegir un LUT (.cube) del equipo; devuelve el LUT ya copiado al proyecto, o null. */
  importarLut?: () => Promise<LutClip | null>
  /** Dónde se dibuja cada parte del editor: la biblioteca (izquierda), el inspector (derecha) y el transporte (bajo el monitor). */
  paneles: { biblioteca: HTMLElement | null; inspector: HTMLElement | null; transporte: HTMLElement | null }
  /** La pestaña «Medios» de la biblioteca (los archivos del proyecto). */
  panelMedios?: ReactNode
  /** Los subtítulos animados con HyperFrames (estilo, colores y volver a animarlos). */
  panelSubtitulos?: ReactNode
  /** Más pestañas de la biblioteca (los clips que propone la IA, la cola de renders…). */
  pestanasExtra?: { id: string; nombre: string; icono: IconName; contenido: ReactNode }[]
  timeline: Timeline
  duracionFuente: number
  /** Lo que puede durar cada fuente (el video principal, otro video, una imagen). */
  duracionDe?: (fuente: string) => number
  nombreDe?: (fuente: string) => string
  /** Agrega varios videos o imágenes y los pone al final. */
  onAgregarClips?: () => void
  agregandoClips?: boolean
  transcript?: TranscriptSegment[]
  tiempo: number
  reproduciendo: boolean
  onBuscar: (t: number) => void
  onAlternar: () => void
  historial: Historial
  elegido: Elegido
  onElegir: (e: Elegido) => void
  /** Lo elegido de más (Ctrl + clic), compartido con el monitor; sin él, la línea de tiempo lleva el suyo. */
  varios?: NonNullable<Elegido>[]
  onVarios?: React.Dispatch<React.SetStateAction<NonNullable<Elegido>[]>>
  exportar: ControlExportar
  /** Abre el selector de audio; devuelve la pista copiada al proyecto o null. */
  importarMusica: () => Promise<MusicaTL | null>
  /** Genera una frase de narración con una voz (sin agente); sin esto, la voz no se edita a mano. */
  generarVoz?: GenerarVoz
  /** Grabar una frase con tu voz (el micrófono). */
  grabarVoz?: GrabarVoz
  /** Cambia el archivo del clip por otro que elija el usuario (otra foto, otro video). */
  onCambiarArchivo?: (clipId: string) => void
  /** Quita el fondo liso de la imagen de una capa (la cambia por su recorte). */
  onQuitarFondo?: (capaId: string) => void
  /** Anima la imagen de una capa (respira, se balancea, ondea…) o la deja quieta (null). */
  onAnimarCapa?: (capaId: string, tipo: TipoAnimar | null) => void
  quitandoFondo?: boolean
  /** La biblioteca: lo que se puede poner encima del video. */
  medios?: { id: string; nombre: string; tipo: 'video' | 'imagen'; conAudio?: boolean }[]
  /** Lo que dura cada medio (para validar las capas). */
  duraciones?: Record<string, number>
  /** Copia un efecto de sonido al proyecto (uno incluido o, sin id, uno del equipo). */
  ponerSonido?: (incluido?: string) => Promise<{ archivo: string; nombre: string; duracion: number } | null>
}) {
  // Selección múltiple: lo que se suma con Ctrl o Mayús + clic (además de lo elegido). Sirve para borrar varios de una vez.
  const [variosPropios, setVariosPropios] = useState<NonNullable<Elegido>[]>([])
  const varios = variosFuera ?? variosPropios
  const setVarios = onVarios ?? setVariosPropios
  const enVarios = (id: string) => varios.some((v) => v.id === id)
  /** Con Ctrl o Mayús, el clic suma o quita de la selección en vez de elegir. Devuelve si lo hizo. */
  function sumar(e: React.PointerEvent, cual: NonNullable<Elegido>): boolean {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey) || e.button !== 0) return false
    e.preventDefault()
    e.stopPropagation()
    setVarios((antes) => {
      const base = antes.length || !elegido || elegido.tipo === 'musica' ? antes : [elegido]
      return base.some((v) => v.id === cual.id) ? base.filter((v) => v.id !== cual.id) : [...base, cual]
    })
    return true
  }
  // Elegir otra cosa con un clic normal (o nada) deshace la selección múltiple.
  useEffect(() => {
    setVarios((antes) => (antes.length && (!elegido || !antes.some((v) => v.id === elegido.id)) ? [] : antes))
  }, [elegido])
  /** Si una fuente es un video (la velocidad no tiene sentido en una foto). */
  const esVideo = (fuente: string) => fuente === 'principal' || medios?.find((m) => m.id === fuente)?.tipo === 'video'
  /** Si el clip tiene sonido que separar (un video con audio). */
  const conSonido = (fuente: string) => fuente === 'principal' || (medios?.find((m) => m.id === fuente)?.tipo === 'video' && medios.find((m) => m.id === fuente)?.conAudio !== false)
  const clasePista = (id: PistaId) => `${tl.pistas?.[id]?.bloqueada ? 'is-bloqueada' : ''} ${tl.pistas?.[id]?.oculta ? 'is-oculta' : ''}`
  // ===== Efectos: se aplican al clip elegido con un clic, o a cualquier clip arrastrándolos sobre él =====
  const [buscarEfecto, setBuscarEfecto] = useState('')
  const [cieloElegido, setCieloElegido] = useState('atardecer')
  const coincide = (x: { nombre: string; para?: string }) => {
    const q = buscarEfecto.trim().toLowerCase()
    return !q || x.nombre.toLowerCase().includes(q) || Boolean(x.para?.toLowerCase().includes(q))
  }
  type Efecto = { tipo: 'look' | 'ajustes'; ajustes: AjustesClip } | { tipo: 'transicion'; id: TransicionClip }
  const TIPO_EFECTO = 'application/x-recorte-efecto'
  function aplicarEfecto(clipId: string | undefined, efecto: Efecto) {
    if (!clipId) return
    if (efecto.tipo === 'transicion') {
      const c = timeline.clips.find((x) => x.id === clipId)
      if (!c || timeline.clips[0]?.id === clipId) return
      historial.aplicar(fundirClip(timeline, clipId, Math.max(c.fundido ?? 0, 0.45), efecto.id))
    } else historial.aplicar(efecto.tipo === 'look' ? aplicarLook(timeline, clipId, efecto.ajustes) : ajustarClip(timeline, clipId, efecto.ajustes))
    onElegir({ tipo: 'clip', id: clipId })
  }
  function arrastrarEfecto(e: React.DragEvent, efecto: Efecto) {
    e.dataTransfer.setData(TIPO_EFECTO, JSON.stringify(efecto))
    e.dataTransfer.effectAllowed = 'copy'
  }
  const [sobreClip, setSobreClip] = useState<string | null>(null)
  /** Un clip de la línea de tiempo recibe el efecto que se suelte encima. */
  const recibeEfecto = (clipId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TIPO_EFECTO)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      if (sobreClip !== clipId) setSobreClip(clipId)
    },
    onDragLeave: () => setSobreClip((v) => (v === clipId ? null : v)),
    onDrop: (e: React.DragEvent) => {
      const dato = e.dataTransfer.getData(TIPO_EFECTO)
      if (!dato) return
      e.preventDefault()
      e.stopPropagation()
      setSobreClip(null)
      try {
        aplicarEfecto(clipId, JSON.parse(dato) as Efecto)
      } catch {
        // Un arrastre que no es un efecto: nada.
      }
    }
  })
  // La pestaña abierta de la biblioteca.
  const [pestana, setPestana] = useState('medios')
  /** La pista sobre la que se está arrastrando un medio de la biblioteca. */
  const [destino, setDestino] = useState<'video' | 'encima' | null>(null)
  const [nuevaVoz, setNuevaVoz] = useState(false)
  const [panelExportar, setPanelExportar] = useState(false)
  const [formato, setFormato] = useState<OpcionesExport['formato']>('original')
  const [subtitulos, setSubtitulos] = useState(false)
  const [resolucion, setResolucion] = useState<NonNullable<OpcionesExport['resolucion']>>('original')
  const [calidad, setCalidad] = useState<NonNullable<OpcionesExport['calidad']>>('normal')
  const [soloEntradaSalida, setSoloEntradaSalida] = useState(true)
  const [normalizar, setNormalizar] = useState(true)
  const [borrador, setBorrador] = useState<Timeline | null>(null)
  const [insercion, setInsercion] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [escribiendoTc, setEscribiendoTc] = useState(false)
  const [muestraViva, setMuestraViva] = useState<TransicionClip | null>(null)
  const [portadaAbierta, setPortadaAbierta] = useState(false)

  /** Al elegir una animación de un texto, el cabezal va donde se ve y reproduce (como CapCut, que la muestra al momento). */
  function verAnimacionTexto(t: TextoTL, que: 'entrada' | 'salida' | 'bucle') {
    const desde = que === 'salida' ? Math.max(t.inicio, t.inicio + t.duracion - 1) : que === 'bucle' ? t.inicio + durEntradaTexto(t.animacion) : t.inicio
    onBuscar(desde)
    if (!reproduciendo) onAlternar()
  }
  // La paleta de herramientas, el imán, la entrada/salida (I/O) y la marca elegida.
  const [herramienta, setHerramienta] = useState<Herramienta>('seleccion')
  const [conIman, setConIman] = useState(true)
  const [rango, setRango] = useState<{ entrada?: number; salida?: number }>({})
  const [repetir, setRepetir] = useState(false)
  const [marcaElegida, setMarcaElegida] = useState<string | null>(null)
  const [cortePrevio, setCortePrevio] = useState<number | null>(null)
  const [mezclador, setMezclador] = useState(false)
  const [estiloSubs, setEstiloSubs] = useState('redes')
  /** La zona que se está siguiendo (clip y número) y el aviso del seguimiento. */
  const [siguiendo, setSiguiendo] = useState<{ clip: string; k: number } | null>(null)
  const [avisoSeguir, setAvisoSeguir] = useState('')
  // Una capa que se pone a seguir algo del video: cuál, mientras el seguidor trabaja, y lo que dijo.
  const [capaSiguiendo, setCapaSiguiendo] = useState<string | null>(null)
  const [avisoCapa, setAvisoCapa] = useState('')
  const niveles = useNiveles(reproduciendo || mezclador)
  const [sonoridad, reiniciarSonoridad] = useSonoridad(reproduciendo)
  const cuadro = 1 / Math.max(1, Math.round(fps))
  const [, forzar] = useState(0)
  const [anchoVisible, setAnchoVisible] = useState(800)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lienzoRef = useRef<HTMLDivElement | null>(null)
  const textoRef = useRef<HTMLTextAreaElement | null>(null)
  const escribiendo = useRef(false)
  const anclaZoom = useRef<{ t: number; x: number } | null>(null)

  const tl = borrador ?? timeline
  // «Encima» tiene varias pistas de video: las usadas y una libre arriba (hasta PISTAS_ENCIMA) para subir algo.
  const ALTO_FILA = 30
  const filasEncima = Math.min(PISTAS_ENCIMA, Math.max(1, ...(tl.capas ?? []).map(pistaDeCapa)) + (tl.capas?.length ? 1 : 0))
  const encimaRef = useRef<HTMLDivElement | null>(null)
  // Los sonidos también van en varias pistas (las usadas y una libre arriba), para encimar efectos.
  const filasSonidos = Math.min(PISTAS_SONIDOS, Math.max(1, ...(tl.sonidos ?? []).map((s) => s.pista ?? 1)) + (tl.sonidos?.length ? 1 : 0))
  const sonidosRef = useRef<HTMLDivElement | null>(null)
  const pistaSonidoEn = (clientY: number): number => {
    const caja = sonidosRef.current?.getBoundingClientRect()
    if (!caja) return 1
    return Math.min(filasSonidos, Math.max(1, filasSonidos - Math.floor((clientY - caja.top) / ALTO_FILA)))
  }
  /** La pista de «Encima» que hay bajo el puntero (la de arriba es la más alta). */
  const pistaEn = (clientY: number): number => {
    const caja = encimaRef.current?.getBoundingClientRect()
    if (!caja) return 1
    return Math.min(filasEncima, Math.max(1, filasEncima - Math.floor((clientY - caja.top) / ALTO_FILA)))
  }
  const total = duracionTimeline(tl)
  // La escala no se encoge sola al recortar: saltaría todo bajo el ratón. Crece si la
  // timeline crece y vuelve a ajustarse con «Ajustar» o al cambiar de proyecto.
  const escala = useRef(Math.max(1, duracionTimeline(timeline)))
  escala.current = Math.max(escala.current, duracionTimeline(timeline), 1)
  const pps = (Math.max(120, anchoVisible - 40) / escala.current) * zoom
  const zoomMax = Math.max(1, escala.current / 2)
  const ancho = Math.max(anchoVisible, total * pps + 32)

  function ajustar() {
    escala.current = Math.max(1, duracionTimeline(timeline))
    setZoom(1)
    forzar((x) => x + 1) // refresca aunque el zoom ya fuera 1
  }
  const lista = useMemo(() => tramos(tl), [tl])
  const voz = useMemo(() => vozEnTimeline(tl, transcript), [tl, transcript])

  const clipElegido = elegido?.tipo === 'clip' ? lista.find((t) => t.clip.id === elegido.id) : undefined
  const textoElegido = elegido?.tipo === 'texto' ? tl.textos.find((x) => x.id === elegido.id) : undefined
  /** El texto elegido como está en el cabezal (con sus fotogramas clave). */
  const textoAhora = textoElegido ? textoEn(textoElegido, Math.min(textoElegido.duracion, Math.max(0, tiempo - textoElegido.inicio))) : undefined
  const musicaElegida = elegido?.tipo === 'musica' ? tl.musica : undefined
  const fraseElegida = elegido?.tipo === 'voz' ? tl.voces?.find((v) => v.id === elegido.id) : undefined
  const capaElegida = elegido?.tipo === 'capa' ? tl.capas?.find((c) => c.id === elegido.id) : undefined
  const sonidoElegido = elegido?.tipo === 'sonido' ? tl.sonidos?.find((s) => s.id === elegido.id) : undefined
  const ajusteElegido = elegido?.tipo === 'ajuste' ? tl.ajustesCapa?.find((x) => x.id === elegido.id) : undefined
  const medidas = duraciones ?? {}
  // Elegir cualquier otra cosa cierra el «añadir voz».
  useEffect(() => {
    if (elegido) setNuevaVoz(false)
  }, [elegido])

  // Si lo elegido desaparece (deshacer, borrar), se suelta.
  useEffect(() => {
    if (elegido && !clipElegido && !textoElegido && !musicaElegida && !fraseElegida && !capaElegida && !sonidoElegido && !ajusteElegido && !borrador) onElegir(null)
  }, [elegido, clipElegido, textoElegido, musicaElegida, fraseElegida, capaElegida, sonidoElegido, ajusteElegido, borrador, onElegir])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observador = new ResizeObserver(() => setAnchoVisible(el.clientWidth))
    observador.observe(el)
    setAnchoVisible(el.clientWidth)
    return () => observador.disconnect()
  }, [])

  // El zoom con la rueda deja quieto el segundo que está bajo el puntero.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const ancla = anclaZoom.current
    if (!el || !ancla) return
    el.scrollLeft = Math.max(0, ancla.t * pps - ancla.x)
    anclaZoom.current = null
  }, [pps])

  // Al reproducir con zoom, la vista sigue al cabezal.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !reproduciendo) return
    const x = tiempo * pps
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 40)
  }, [tiempo, pps, reproduciendo])

  function segundoEn(clientX: number): number {
    const caja = lienzoRef.current?.getBoundingClientRect()
    if (!caja) return 0
    return Math.max(0, (clientX - caja.left) / pps)
  }

  /** Imán: pega `t` al borde más cercano (o al cabezal) si está a menos de IMAN_PX. */
  function iman(t: number, puntos: number[]): number {
    if (!conIman) return t
    puntos = [...puntos, ...(tl.marcadores ?? []).map((m) => m.t)]
    let mejor = t
    let distancia = IMAN_PX / pps
    for (const p of [...puntos, tiempo]) {
      const d = Math.abs(p - t)
      if (d < distancia) {
        distancia = d
        mejor = p
      }
    }
    return mejor
  }

  /**
   * Arrastre genérico. `mover` recibe los segundos desplazados y devuelve el borrador;
   * al soltar se aplica como un solo paso. Sin desplazamiento, es un clic.
   */
  function arrastrar(
    e: React.PointerEvent,
    mover: (dx: number, ev: PointerEvent) => Timeline | null,
    alClic?: () => void
  ) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    let movido = false
    let ultimo: Timeline | null = null

    const alMover = (ev: PointerEvent) => {
      if (!movido && Math.abs(ev.clientX - x0) < 3) return
      movido = true
      ultimo = mover((ev.clientX - x0) / pps, ev)
      setBorrador(ultimo)
    }
    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
      if (movido) ultimo = mover((ev.clientX - x0) / pps, ev)
      setBorrador(null)
      setInsercion(null)
      if (movido && ultimo) historial.aplicar(ultimo)
      else if (!movido) alClic?.()
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  // ===== Regla y fondo: mover el cabezal =====

  function arrastrarCabezal(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    onBuscar(Math.min(total, segundoEn(e.clientX)))
    if (e.currentTarget.classList.contains('tl-carril')) onElegir(null)
    const alMover = (ev: PointerEvent) => onBuscar(Math.min(total, segundoEn(ev.clientX)))
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  // ===== Pista de video =====

  function arrastrarClip(e: React.PointerEvent, id: string) {
    if (herramienta === 'cuchilla') {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const t = iman(segundoEn(e.clientX), puntosIman(timeline))
      const cortada = dividir(timeline, t)
      if (cortada !== timeline) historial.aplicar(cortada)
      return
    }
    if (herramienta === 'rodar' || herramienta === 'deslizar' || herramienta === 'desplazar') {
      editarFino(e, id)
      return
    }
    onElegir({ tipo: 'clip', id })
    const base = timeline
    const otros = tramos(base).filter((t) => t.clip.id !== id)
    arrastrar(e, (_dx, ev) => {
      const t = segundoEn(ev.clientX)
      // El destino es cuántos de los otros clips quedan a la izquierda del puntero.
      let destino = 0
      let acumulado = 0
      for (const o of otros) {
        const largo = o.fin - o.inicio
        if (t > acumulado + largo / 2) destino += 1
        acumulado += largo
      }
      setInsercion(otros.slice(0, destino).reduce((s, o) => s + (o.fin - o.inicio), 0))
      return moverClip(base, id, destino)
    })
  }

  /** Un segundo llevado al cuadro más cercano. */
  const aCuadro = (x: number) => Math.round(x / cuadro) * cuadro
  /** Lo que puede durar la fuente de un clip. */
  const limiteFuente = (fuente: string) => (duracionDe ? duracionDe(fuente) : duracionFuente)

  /**
   * Las herramientas finas sobre un clip de video: el recorte rodado corre el corte más cercano al puntero, deslizar
   * cambia el tramo que muestra y desplazar lo corre entre sus vecinos. El monitor enseña el cuadro que cambia.
   */
  function editarFino(e: React.PointerEvent, id: string, lado?: 'entrada' | 'salida') {
    const base = timeline
    const lista0 = tramos(base)
    const t = lista0.find((x) => x.clip.id === id)
    if (!t) return
    onElegir({ tipo: 'clip', id })
    if (herramienta === 'rodar') {
      const enX = segundoEn(e.clientX)
      const izquierda = lado ? lado === 'entrada' : enX - t.inicio < t.fin - enX
      const indice = izquierda ? t.indice - 1 : t.indice
      if (indice < 0 || indice >= base.clips.length - 1) return
      const corte = izquierda ? t.inicio : t.fin
      // El corte cae siempre en un cuadro (y se pega al cabezal y a las marcas con el imán).
      arrastrar(e, (dx) => {
        const r = rodarCorte(base, indice, aCuadro(iman(corte + dx, tiemposMarcas)) - corte, limiteFuente)
        onBuscar(tramos(r)[indice].fin)
        return r
      })
    } else if (herramienta === 'deslizar') {
      arrastrar(e, (dx) => {
        const r = deslizarContenido(base, id, -aCuadro(dx), limiteFuente)
        onBuscar(t.inicio)
        return r
      })
    } else {
      if (t.indice === 0 || t.indice === lista0.length - 1) return
      arrastrar(e, (dx) => {
        const r = desplazarClip(base, id, aCuadro(iman(t.inicio + dx, tiemposMarcas)) - t.inicio, limiteFuente)
        onBuscar(tramos(r)[t.indice].inicio)
        return r
      })
    }
  }

  function recortar(e: React.PointerEvent, id: string, lado: 'entrada' | 'salida') {
    if (herramienta === 'rodar') {
      editarFino(e, id, lado)
      return
    }
    onElegir({ tipo: 'clip', id })
    const base = timeline
    const tramo = tramos(base).find((t) => t.clip.id === id)
    if (!tramo) return
    const puntos = puntosIman(base)
    arrastrar(e, (dx) => {
      const limite = duracionDe ? duracionDe(tramo.clip.fuente) : duracionFuente
      // Lo arrastrado son segundos de la timeline: en la fuente, por la velocidad del clip.
      const vel = velocidadDe(tramo.clip)
      if (lado === 'entrada') return recortarClip(base, id, 'entrada', tramo.clip.entrada + dx * vel, limite)
      // El borde derecho se pega al cabezal y a los bordes de los rótulos.
      const finTl = iman(tramo.fin + dx, puntos.filter((p) => p > tramo.inicio))
      return recortarClip(base, id, 'salida', tramo.clip.entrada + (finTl - tramo.inicio) * vel, limite)
    })
  }

  // ===== Pista de textos =====

  function arrastrarTexto(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin') {
    onElegir({ tipo: 'texto', id })
    const base = timeline
    const x = base.textos.find((t) => t.id === id)
    // Bloqueado: se elige, pero no se mueve.
    if (!x || x.bloqueado) return
    const puntos = puntosIman(base, id)
    const fin = x.inicio + x.duracion
    arrastrar(
      e,
      (dx) => {
        if (modo === 'mover') {
          let inicio = x.inicio + dx
          const pegadoInicio = iman(inicio, puntos)
          const pegadoFin = iman(inicio + x.duracion, puntos)
          if (pegadoInicio !== inicio) inicio = pegadoInicio
          else if (pegadoFin !== inicio + x.duracion) inicio = pegadoFin - x.duracion
          return cambiarTexto(base, id, { inicio })
        }
        if (modo === 'inicio') {
          const inicio = Math.min(iman(x.inicio + dx, puntos), fin - DURACION_MINIMA)
          return cambiarTexto(base, id, { inicio, duracion: fin - inicio })
        }
        return cambiarTexto(base, id, { duracion: iman(fin + dx, puntos) - x.inicio })
      },
      undefined
    )
  }

  // ===== Narración: cada frase se mueve suelta =====

  function arrastrarFrase(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin' = 'mover') {
    onElegir({ tipo: 'voz', id })
    const base = timeline
    const v = base.voces?.find((x) => x.id === id)
    if (!v) return
    const puntos = puntosIman(base)
    if (modo !== 'mover') {
      // Recortar por los bordes, como un sonido: el principio corre `desde` dentro del archivo, y el final se
      // puede volver a alargar hasta donde acaba el archivo.
      const desde0 = v.desde ?? 0
      const largo = v.largo ?? desde0 + v.duracion
      arrastrar(e, (dx) => {
        if (modo === 'inicio') {
          const d = Math.max(-desde0, -v.inicio, Math.min(v.duracion - DURACION_MINIMA, iman(v.inicio + dx, puntos) - v.inicio))
          return cambiarVoz(base, id, { inicio: v.inicio + d, duracion: v.duracion - d, desde: desde0 + d, largo })
        }
        const fin = Math.min(v.inicio + largo - desde0, Math.max(v.inicio + DURACION_MINIMA, iman(v.inicio + v.duracion + dx, puntos)))
        return cambiarVoz(base, id, { duracion: fin - v.inicio, largo })
      })
      return
    }
    arrastrar(e, (dx) => cambiarVoz(base, id, { inicio: iman(v.inicio + dx, puntos) }))
  }

  /** Mueve un trozo de música o le recorta un borde (la música se repite: se alarga hasta el final del video). */
  function arrastrarMusica(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin') {
    e.stopPropagation()
    onElegir({ tipo: 'musica', id })
    const base = timeline
    const m = tramosMusica(base).find((x) => x.id === id)
    if (!m) return
    const puntos = puntosIman(base)
    const desde0 = m.desde ?? 0
    arrastrar(e, (dx) => {
      if (modo === 'mover') return cambiarTramoMusica(base, id, { inicio: Math.max(0, iman(m.inicio + dx, puntos)) })
      if (modo === 'inicio') {
        const d = Math.max(-desde0, -m.inicio, Math.min(m.duracion - DURACION_MINIMA, iman(m.inicio + dx, puntos) - m.inicio))
        return cambiarTramoMusica(base, id, { inicio: m.inicio + d, duracion: m.duracion - d, desde: desde0 + d })
      }
      return cambiarTramoMusica(base, id, { duracion: Math.max(DURACION_MINIMA, iman(m.inicio + m.duracion + dx, puntos) - m.inicio) })
    })
  }

  // ===== Encima del video y efectos de sonido: sueltos, como los rótulos =====

  function arrastrarCapa(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin') {
    onElegir({ tipo: 'capa', id })
    const base = timeline
    const c = base.capas?.find((x) => x.id === id)
    if (!c || c.bloqueado) return
    const puntos = puntosIman(base)
    const fin = c.inicio + c.duracion
    // Llevarla más allá del final alarga el video con negro (como en CapCut); si ya lo alargaba y vuelve, el negro
    // se acorta con ella. El negro es un clip más de la pista de video: se ve, se recorta y se borra.
    const finVideo = finSinNegro(base)
    const alargando = fin > finVideo + 1e-3
    const conNegro = (nuevoFin: number) => (alargando || nuevoFin > finVideo + 1e-3 ? conNegroHasta(base, nuevoFin, id) : base)
    arrastrar(e, (dx, ev) => {
      if (modo === 'mover') {
        // Arriba o abajo cambia de pista (la más alta tapa a las demás).
        const pista = pistaEn(ev.clientY)
        let inicio = c.inicio + dx
        const pegadoInicio = iman(inicio, puntos)
        const pegadoFin = iman(inicio + c.duracion, puntos)
        if (pegadoInicio !== inicio) inicio = pegadoInicio
        else if (pegadoFin !== inicio + c.duracion) inicio = pegadoFin - c.duracion
        inicio = Math.max(0, inicio)
        return cambiarCapa(conNegro(inicio + c.duracion), id, { inicio, pista }, medidas)
      }
      if (modo === 'inicio') {
        const inicio = Math.max(0, Math.min(iman(c.inicio + dx, puntos), fin - DURACION_MINIMA))
        return cambiarCapa(base, id, { inicio, duracion: fin - inicio }, medidas)
      }
      const nuevoFin = Math.max(c.inicio + DURACION_MINIMA, iman(fin + dx, puntos))
      return cambiarCapa(conNegro(nuevoFin), id, { duracion: nuevoFin - c.inicio }, medidas)
    })
  }

  /** Mueve una capa de ajuste o le cambia el principio o el final. */
  function arrastrarAjuste(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin') {
    onElegir({ tipo: 'ajuste', id })
    const base = timeline
    const x = base.ajustesCapa?.find((a) => a.id === id)
    if (!x) return
    const puntos = puntosIman(base)
    const fin = x.inicio + x.duracion
    arrastrar(e, (dx) => {
      if (modo === 'mover') return cambiarAjusteCapa(base, id, { inicio: Math.max(0, iman(x.inicio + dx, puntos)) })
      if (modo === 'inicio') {
        const inicio = Math.max(0, Math.min(iman(x.inicio + dx, puntos), fin - DURACION_MINIMA))
        return cambiarAjusteCapa(base, id, { inicio, duracion: fin - inicio })
      }
      return cambiarAjusteCapa(base, id, { duracion: iman(fin + dx, puntos) - x.inicio })
    })
  }

  function arrastrarSonido(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin' = 'mover') {
    onElegir({ tipo: 'sonido', id })
    const base = timeline
    const s = base.sonidos?.find((x) => x.id === id)
    if (!s) return
    const puntos = puntosIman(base)
    // Recortar por los bordes (para un corte en J o en L): el principio corre `desde` dentro del archivo.
    if (modo !== 'mover') {
      const desde0 = s.desde ?? 0
      const largoArchivo = s.largo ?? desde0 + s.duracion
      arrastrar(e, (dx) => {
        if (modo === 'inicio') {
          // No antes del principio del archivo ni del de la línea de tiempo, y que quede algo.
          const d = Math.max(-desde0, -s.inicio, Math.min(s.duracion - DURACION_MINIMA, iman(s.inicio + dx, puntos) - s.inicio))
          return cambiarSonido(base, id, { inicio: s.inicio + d, duracion: s.duracion - d, desde: desde0 + d })
        }
        const fin = Math.min(s.inicio + largoArchivo - desde0, Math.max(s.inicio + DURACION_MINIMA, iman(s.inicio + s.duracion + dx, puntos)))
        return cambiarSonido(base, id, { duracion: fin - s.inicio })
      })
      return
    }
    // Arriba o abajo, cambia de pista de sonidos.
    arrastrar(e, (dx, ev) => cambiarSonido(base, id, { inicio: Math.max(0, iman(s.inicio + dx, puntos)), pista: pistaSonidoEn(ev.clientY) }))
  }

  /** Pone un medio de la biblioteca encima, en el cabezal (un logo, un ícono, una toma de apoyo). */
  function accionEncima(fuente: string, inicio = tiempo, x = 0.5, y = 0.5, pista = 1) {
    const m = medios?.find((x) => x.id === fuente)
    if (!m) return
    const r = capaNueva(timeline, fuente, m.tipo, inicio, medidas, x, y)
    if (r.timeline === timeline) return
    historial.aplicar(pista > 1 ? cambiarCapa(r.timeline, r.id, { pista }, medidas) : r.timeline)
    onElegir({ tipo: 'capa', id: r.id })
  }

  /** Suelta un medio de la biblioteca: en la pista de video entra como clip; en «Encima», como capa. */
  function soltarMedio(e: React.DragEvent, pista: 'video' | 'encima') {
    setDestino(null)
    const fuente = e.dataTransfer.getData(TIPO_ARRASTRE_MEDIO)
    if (!fuente) return
    e.preventDefault()
    const t = Math.min(total, segundoEn(e.clientX))
    if (pista === 'encima') {
      if (fuente !== 'principal') accionEncima(fuente, t, 0.5, 0.5, pistaEn(e.clientY))
      return
    }
    const m = medios?.find((x) => x.id === fuente)
    const salida = fuente === 'principal' ? (duracionDe?.('principal') ?? duracionFuente) : m?.tipo === 'imagen' ? DURACION_IMAGEN : (medidas[fuente] ?? 0)
    if (salida <= 0) return
    // Entra en el corte más cercano al puntero: no parte un clip por la mitad.
    const cortes = [0, ...tramos(timeline).map((x) => x.fin)]
    const en = cortes.reduce((mejor, c) => (Math.abs(c - t) < Math.abs(mejor - t) ? c : mejor), cortes[cortes.length - 1])
    historial.aplicar(insertarClip(timeline, { fuente, entrada: 0, salida }, en).timeline)
  }
  const receptor = (pista: 'video' | 'encima') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TIPO_ARRASTRE_MEDIO)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (destino !== pista) setDestino(pista)
    },
    onDragLeave: () => setDestino(null),
    onDrop: (e: React.DragEvent) => soltarMedio(e, pista)
  })

  async function accionSonido(incluido?: string, inicio = tiempo) {
    if (!ponerSonido) return
    const s = await ponerSonido(incluido)
    if (!s) return
    const r = anadirSonido(timeline, { inicio: Math.min(inicio, Math.max(0, total - DURACION_MINIMA)), duracion: s.duracion, archivo: s.archivo, nombre: s.nombre })
    if (r.timeline === timeline) return
    historial.aplicar(r.timeline)
    onElegir({ tipo: 'sonido', id: r.id })
  }

  // ===== Acciones =====

  function accionDividir() {
    // Con un audio elegido (un sonido suelto, una frase de la narración o la música), S lo divide a él en el cabezal,
    // no al video. Si el cabezal no está sobre él, no corta nada (como en Premiere con la pista elegida).
    if (elegido?.tipo === 'sonido' || elegido?.tipo === 'voz' || elegido?.tipo === 'musica') {
      const r =
        elegido.tipo === 'sonido'
          ? dividirSonido(timeline, elegido.id, tiempo)
          : elegido.tipo === 'voz'
            ? dividirVoz(timeline, elegido.id, tiempo)
            : dividirMusica(timeline, tiempo)
      if (r.timeline !== timeline) historial.aplicar(r.timeline)
      return
    }
    historial.aplicar(dividir(timeline, tiempo))
  }

  function accionBorrar() {
    if (varios.length > 1) {
      // Varios a la vez: un solo paso de deshacer.
      let nueva = timeline
      for (const v of varios) {
        nueva =
          v.tipo === 'clip'
            ? borrarClip(nueva, v.id)
            : v.tipo === 'voz'
              ? borrarVoz(nueva, v.id)
              : v.tipo === 'capa'
                ? borrarCapa(nueva, v.id)
                : v.tipo === 'sonido'
                  ? borrarSonido(nueva, v.id)
                  : v.tipo === 'texto'
                    ? borrarTexto(nueva, v.id)
                    : v.tipo === 'ajuste'
                      ? borrarAjusteCapa(nueva, v.id)
                      : nueva
      }
      if (nueva !== timeline) historial.aplicar(nueva)
      setVarios([])
      onElegir(null)
      return
    }
    if (!elegido) return
    if ((textoElegido?.bloqueado && elegido.tipo === 'texto') || (capaElegida?.bloqueado && elegido.tipo === 'capa')) return
    if (elegido.tipo === 'clip') historial.aplicar(borrarClip(timeline, elegido.id))
    else if (elegido.tipo === 'musica') historial.aplicar(tramosMusica(timeline).length > 1 ? borrarTramoMusica(timeline, elegido.id) : ponerMusica(timeline, undefined))
    else if (elegido.tipo === 'voz') historial.aplicar(borrarVoz(timeline, elegido.id))
    else if (elegido.tipo === 'capa') historial.aplicar(borrarCapa(timeline, elegido.id))
    else if (elegido.tipo === 'sonido') historial.aplicar(borrarSonido(timeline, elegido.id))
    else if (elegido.tipo === 'ajuste') historial.aplicar(borrarAjusteCapa(timeline, elegido.id))
    else historial.aplicar(borrarTexto(timeline, elegido.id))
    onElegir(null)
  }

  function accionTexto(fuente?: string) {
    const { timeline: base, id } = anadirTexto(timeline, tiempo)
    if (base === timeline) return
    // Desde la biblioteca se elige ya con su letra.
    const nueva = fuente && fuente !== 'normal' ? cambiarTexto(base, id, { fuente }) : base
    historial.aplicar(nueva)
    onElegir({ tipo: 'texto', id })
    requestAnimationFrame(() => textoRef.current?.select())
  }

  async function accionMusica() {
    const musica = await importarMusica()
    if (!musica) return
    // Si ya había música, se conservan su volumen y su ducking.
    const previa = timeline.musica
    historial.aplicar(ponerMusica(timeline, previa ? { ...musica, volumen: previa.volumen, ducking: previa.ducking } : musica))
    onElegir({ tipo: 'musica', id: 'musica' })
  }

  /** Estira o encoge una transición arrastrando el borde de su bloque en la línea de tiempo. */
  function estirarTransicion(e: React.PointerEvent, id: string, desde: number) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    empezarAjuste()
    const base = timeline
    const mover = (ev: PointerEvent) => {
      const d = Math.max(0.1, Math.round((desde + (ev.clientX - x0) / pps) * 30) / 30)
      deslizar(fundirClip(base, id, d))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  /** Deslizadores: el primer movimiento abre un paso de deshacer y los demás lo amplían. */
  const ajustando = useRef(false)
  function deslizar(nueva: Timeline) {
    if (ajustando.current) historial.reemplazar(nueva)
    else historial.aplicar(nueva)
    ajustando.current = true
  }
  const empezarAjuste = () => (ajustando.current = false)

  /** El rombo de fotograma clave de un ajuste de la capa elegida, con sus flechas a la clave anterior y la siguiente. */
  function RomboCapa({ clave, nombre, dt, valor }: { clave: ParametroClaveCapa; nombre: string; dt: number; valor: number }) {
    if (!capaElegida) return null
    const c = capaElegida
    const lista = c.claves?.[clave] ?? []
    const aqui = claveCapaEn(c, clave, dt)
    const anterior = [...lista].reverse().find((x) => x.f < dt - 0.02)
    const siguiente = lista.find((x) => x.f > dt + 0.02)
    return (
      <span className="ed-claves" onClick={(e) => e.preventDefault()}>
        {lista.length > 0 && (
          <button className="ed-clave-ir" disabled={!anterior} title="Ir a la clave anterior" aria-label={`Clave anterior de ${nombre}`} onClick={() => anterior && onBuscar(c.inicio + anterior.f)}>
            ‹
          </button>
        )}
        <button
          className={`ed-clave ${aqui ? 'is-on' : lista.length ? 'is-animado' : ''}`}
          title={aqui ? `Quitar este fotograma clave de ${nombre}` : lista.length ? `Añadir un fotograma clave de ${nombre} en el cabezal` : `Animar ${nombre}: pone un fotograma clave en el cabezal`}
          aria-label={aqui ? `Quitar la clave de ${nombre}` : `Poner una clave de ${nombre}`}
          aria-pressed={Boolean(aqui)}
          onClick={() => historial.aplicar(aqui ? quitarClaveCapa(timeline, c.id, clave, aqui.f, medidas) : ponerClaveCapa(timeline, c.id, clave, dt, valor, medidas))}
        >
          ◆
        </button>
        {lista.length > 0 && (
          <button className="ed-clave-ir" disabled={!siguiente} title="Ir a la clave siguiente" aria-label={`Clave siguiente de ${nombre}`} onClick={() => siguiente && onBuscar(c.inicio + siguiente.f)}>
            ›
          </button>
        )}
        {/* En una clave con otra después: cómo va hasta ella (la curva de suavizado). */}
        {aqui && siguiente && (
          <select
            className="ed-curva"
            value={aqui.curva ?? 'suave'}
            title={`Cómo va ${nombre.toLowerCase()} de esta clave a la siguiente`}
            aria-label={`Curva de ${nombre} hasta la clave siguiente`}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => historial.aplicar(curvaClaveCapa(timeline, c.id, clave, aqui.f, e.target.value as CurvaClave, medidas))}
          >
            {CURVAS_CLAVE.map((x) => (
              <option key={x.id} value={x.id} title={x.para}>
                {x.nombre}
              </option>
            ))}
          </select>
        )}
      </span>
    )
  }

  /** El segundo de la fuente del clip elegido que está bajo el cabezal (dentro del clip). */
  const fuenteEnCabezal = clipElegido
    ? Math.min(clipElegido.clip.salida, Math.max(clipElegido.clip.entrada, fuenteEnClip(clipElegido.clip, tiempo - clipElegido.inicio)))
    : 0
  const esClave = (clave: string): clave is ParametroClave => (PARAMETROS_CLAVE as readonly string[]).includes(clave)

  function ajustarImagen(cambio: AjustesClip) {
    if (!clipElegido) return
    // Un ajuste con fotogramas clave no se cambia entero: se pone (o se mueve) su clave en el cabezal.
    let nueva = timeline
    const fijos: AjustesClip = {}
    for (const [clave, valor] of Object.entries(cambio) as [keyof AjustesClip, number][]) {
      if (esClave(clave) && clipElegido.clip.claves?.[clave]?.length) nueva = ponerClave(nueva, clipElegido.clip.id, clave, fuenteEnCabezal, valor)
      else fijos[clave] = valor
    }
    if (Object.keys(fijos).length) nueva = ajustarClip(nueva, clipElegido.clip.id, fijos)
    deslizar(nueva)
  }

  function accionDuplicar() {
    if (elegido?.tipo === 'clip') historial.aplicar(duplicarClip(timeline, elegido.id))
    else if (elegido?.tipo === 'capa' || elegido?.tipo === 'texto') {
      const r = elegido.tipo === 'capa' ? duplicarCapa(timeline, elegido.id, medidas) : duplicarTexto(timeline, elegido.id)
      if (r.timeline === timeline) return
      historial.aplicar(r.timeline)
      onElegir({ tipo: elegido.tipo, id: r.id })
    }
  }

  // ===== Copiar y pegar el estilo (como «Pegar atributos» de Premiere): de un texto a otro, de una capa a otra =====
  const estiloCopiado = useRef<{ tipo: 'texto'; estilo: Partial<TextoTL> } | { tipo: 'capa'; estilo: EstiloCapa } | null>(null)
  const [hayEstilo, setHayEstilo] = useState<'texto' | 'capa' | null>(null)
  function copiarEstilo(): boolean {
    if (textoElegido) estiloCopiado.current = { tipo: 'texto', estilo: estiloDeTexto(textoElegido) }
    else if (capaElegida) estiloCopiado.current = { tipo: 'capa', estilo: estiloDeCapa(capaElegida) }
    else return false
    setHayEstilo(estiloCopiado.current.tipo)
    return true
  }
  function pegarEstilo(): boolean {
    const e = estiloCopiado.current
    if (!e) return false
    // A todos los elegidos de su tipo (Ctrl + clic), o al elegido.
    const ids = (varios.length > 1 ? varios.filter((v) => v.tipo === e.tipo).map((v) => v.id) : elegido?.tipo === e.tipo ? [elegido.id] : [])
    let nueva = timeline
    for (const id of ids) {
      const x = e.tipo === 'texto' ? nueva.textos.find((t) => t.id === id) : nueva.capas?.find((c) => c.id === id)
      if (!x || x.bloqueado) continue
      nueva = e.tipo === 'texto' ? pegarEstiloTexto(nueva, id, e.estilo) : pegarEstiloCapa(nueva, id, e.estilo, medidas)
    }
    if (nueva === timeline) return false
    historial.aplicar(nueva)
    return true
  }
  /** Ocultar o bloquear una capa o un texto (no la pista entera). */
  function alternarEn(tipo: 'texto' | 'capa', id: string, campo: 'oculto' | 'bloqueado') {
    const x = tipo === 'texto' ? timeline.textos.find((t) => t.id === id) : timeline.capas?.find((c) => c.id === id)
    if (!x) return
    historial.aplicar(tipo === 'texto' ? cambiarTexto(timeline, id, { [campo]: !x[campo] }) : cambiarCapa(timeline, id, { [campo]: !x[campo] }, medidas))
  }

  // ===== Copiar, cortar y pegar (lo elegido; se pega en el cabezal) =====

  const portapapeles = useRef<
    | { tipo: 'clip'; fuente: string; entrada: number; salida: number; ajustes?: AjustesClip }
    | { tipo: 'texto'; dato: (typeof tl.textos)[number] }
    | { tipo: 'capa'; dato: NonNullable<typeof tl.capas>[number] }
    | { tipo: 'sonido'; dato: NonNullable<typeof tl.sonidos>[number] }
    | null
  >(null)

  function accionCopiar(): boolean {
    if (clipElegido) {
      const c = clipElegido.clip
      portapapeles.current = { tipo: 'clip', fuente: c.fuente, entrada: c.entrada, salida: c.salida, ...(c.ajustes ? { ajustes: c.ajustes } : {}) }
    } else if (textoElegido) portapapeles.current = { tipo: 'texto', dato: textoElegido }
    else if (capaElegida) portapapeles.current = { tipo: 'capa', dato: capaElegida }
    else if (sonidoElegido) portapapeles.current = { tipo: 'sonido', dato: sonidoElegido }
    else return false
    return true
  }

  function accionPegar() {
    const p = portapapeles.current
    if (!p) return
    if (p.tipo === 'clip') {
      const r = insertarClip(timeline, { fuente: p.fuente, entrada: p.entrada, salida: p.salida }, tiempo)
      if (r.timeline === timeline) return
      historial.aplicar(p.ajustes ? ajustarClip(r.timeline, r.id, p.ajustes) : r.timeline)
      onElegir({ tipo: 'clip', id: r.id })
    } else if (p.tipo === 'texto') {
      const { id: _id, inicio: _inicio, ...resto } = p.dato
      const r = anadirTexto(timeline, tiempo, p.dato.texto)
      if (r.timeline === timeline) return
      historial.aplicar(cambiarTextoTL(r.timeline, r.id, resto))
      onElegir({ tipo: 'texto', id: r.id })
    } else if (p.tipo === 'capa') {
      const { id: _id, ...resto } = p.dato
      const r = anadirCapa(timeline, { ...resto, inicio: tiempo }, medidas)
      if (r.timeline === timeline) return
      historial.aplicar(r.timeline)
      onElegir({ tipo: 'capa', id: r.id })
    } else {
      const { id: _id, ...resto } = p.dato
      const r = anadirSonido(timeline, { ...resto, inicio: tiempo })
      if (r.timeline === timeline) return
      historial.aplicar(r.timeline)
      onElegir({ tipo: 'sonido', id: r.id })
    }
  }

  // ===== Marcas, entrada/salida y saltos (como en Premiere) =====

  function accionMarcador() {
    if (total <= 0) return
    const r = ponerMarcador(timeline, Math.min(tiempo, total))
    if (r.timeline !== timeline) historial.aplicar(r.timeline)
    setMarcaElegida(r.id)
  }
  /** Los cortes de la pista de video (para ir de uno a otro con ↑ y ↓). */
  const cortes = useMemo(() => [...new Set(lista.flatMap((t) => [t.inicio, t.fin]))].sort((a, b) => a - b), [lista])
  function saltar(puntos: number[], adelante: boolean) {
    const destino = adelante ? puntos.find((p) => p > tiempo + cuadro / 2) : [...puntos].reverse().find((p) => p < tiempo - cuadro / 2)
    if (destino !== undefined) onBuscar(Math.min(destino, total))
  }
  const tiemposMarcas = (tl.marcadores ?? []).map((m) => m.t)
  const hayRango = rango.entrada !== undefined && rango.salida !== undefined && rango.salida - rango.entrada >= DURACION_MINIMA
  function accionExtraer() {
    if (!hayRango) return
    const r = extraerRango(timeline, rango.entrada!, rango.salida!)
    if (r === timeline) return
    historial.aplicar(r)
    onBuscar(rango.entrada!)
    setRango({})
  }
  function marcarEntrada() {
    const t = Math.min(tiempo, total)
    setRango((r) => ({ entrada: t, ...(r.salida !== undefined && r.salida > t ? { salida: r.salida } : {}) }))
  }
  function marcarSalida() {
    const t = Math.min(tiempo, total)
    setRango((r) => ({ ...(r.entrada !== undefined && r.entrada < t ? { entrada: r.entrada } : {}), salida: t }))
  }
  // «Repetir»: al llegar a la salida vuelve a la entrada (o al final, al principio).
  useEffect(() => {
    if (!reproduciendo || !repetir) return
    const desde = rango.entrada ?? 0
    const hasta = rango.salida ?? total
    if (tiempo >= hasta - cuadro / 2 || tiempo < desde - 0.5) onBuscar(desde)
  }, [tiempo, reproduciendo, repetir, rango, total, cuadro, onBuscar])
  // Si la timeline se acorta, la entrada/salida no se queda fuera.
  useEffect(() => {
    if ((rango.entrada ?? 0) > total || (rango.salida ?? 0) > total) setRango({})
  }, [total, rango])

  // ===== Menú de clic derecho =====

  const [menuCtx, abrirMenu] = useMenuContextual()
  const [escuchandoVoz, setEscuchandoVoz] = useState(false)
  /** Las acciones de este momento: el menú las llama al hacer clic, cuando lo elegido ya cambió. */
  const acciones = useRef({ accionCopiar, accionPegar, accionBorrar, accionDuplicar, copiarEstilo, pegarEstilo })
  acciones.current = { accionCopiar, accionPegar, accionBorrar, accionDuplicar, copiarEstilo, pegarEstilo }
  const copiarCortar: OpcionMenu[] = [
    { nombre: 'Copiar', atajo: 'Ctrl+C', accion: () => acciones.current.accionCopiar() },
    { nombre: 'Cortar', atajo: 'Ctrl+X', accion: () => acciones.current.accionCopiar() && acciones.current.accionBorrar() }
  ]
  const borrar = { nombre: 'Borrar', atajo: 'Supr', peligro: true, accion: () => acciones.current.accionBorrar() }

  /** Clic derecho sobre algo de la línea de tiempo: lo elige y abre su menú. */
  function menuDe(e: React.MouseEvent, cual: NonNullable<Elegido>) {
    const enVariosYa = varios.length > 1 && varios.some((v) => v.id === cual.id)
    if (enVariosYa) {
      const clipsV = varios.filter((v) => v.tipo === 'clip').map((v) => v.id)
      abrirMenu(e, [
        { tipo: 'titulo', nombre: `${varios.length} elegidos` },
        ...(onAnidar && clipsV.length === varios.length && clipsSeguidos(timeline, clipsV)
          ? [{ nombre: `Anidar los ${varios.length} en un clip`, accion: () => onAnidar(clipsV) }]
          : []),
        ...(() => {
          const conAudio = clipsV.filter((id) => {
            const c = timeline.clips.find((x) => x.id === id)
            return c && conSonido(c.fuente) && !(tl.sonidos ?? []).some((s) => s.deClip === c.id)
          })
          return onSepararAudio && conAudio.length ? [{ nombre: `Separar el audio de ${conAudio.length === 1 ? '1 clip' : `los ${conAudio.length} clips`}`, accion: () => onSepararAudio(conAudio) }] : []
        })(),
        ...(clipsV.length
          ? [
              { nombre: 'Silenciar todos', accion: () => historial.aplicar(clipsV.reduce((x, id) => silenciarClip(x, id, true), timeline)) },
              { nombre: 'Volver a oír todos', accion: () => historial.aplicar(clipsV.reduce((x, id) => silenciarClip(x, id, false), timeline)) }
            ]
          : []),
        { tipo: 'separador' },
        { nombre: `Borrar los ${varios.length}`, atajo: 'Supr', peligro: true, accion: () => acciones.current.accionBorrar() }
      ])
      return
    }
    onElegir(cual)
    const t = segundoEn(e.clientX)
    if (cual.tipo === 'clip') {
      const c = timeline.clips.find((x) => x.id === cual.id)
      if (!c) return
      const video = esVideo(c.fuente)
      abrirMenu(e, [
        { nombre: 'Dividir aquí', atajo: 'S', accion: () => historial.aplicar(dividir(timeline, t)) },
        { nombre: 'Duplicar', atajo: 'Ctrl+D', accion: () => historial.aplicar(duplicarClip(timeline, c.id)) },
        ...copiarCortar,
        { nombre: 'Pegar en el cabezal', atajo: 'Ctrl+V', desactivada: !portapapeles.current, accion: () => acciones.current.accionPegar() },
        { tipo: 'separador' },
        ...(video ? [{ nombre: c.mudo ? 'Volver a oír' : 'Silenciar', accion: () => historial.aplicar(silenciarClip(timeline, c.id, !c.mudo)) }] : []),
        ...(() => {
          if (!video || !conSonido(c.fuente) || !onSepararAudio) return []
          // Si ya se separó: volver a unirlo (como «Vincular» en Premiere).
          const suelto = (tl.sonidos ?? []).find((s) => s.deClip === c.id)
          if (suelto) return [{ nombre: 'Volver a unir el audio', accion: () => historial.aplicar(unirAudio(timeline, suelto.id)) }]
          return [
            c.rampa
              ? { nombre: 'Separar audio (quita antes la rampa de velocidad)', desactivada: true, accion: () => {} }
              : { nombre: 'Separar audio', accion: () => onSepararAudio(c.id) }
          ]
        })(),
        ...(video && onEstabilizar ? [{ nombre: 'Estabilizar', accion: () => onEstabilizar(c.id) }] : []),
        ...(video && onSepararPersona
          ? [{ nombre: (tl.capas ?? []).some((x) => x.persona?.clip === c.id) ? 'Volver a separar a la persona' : 'Separar a la persona del fondo', desactivada: Boolean(separandoPersona), accion: () => onSepararPersona(c.id) }]
          : []),
        ...(onCongelar && video ? [{ nombre: 'Congelar el cuadro del cabezal', atajo: 'Mayús+F', accion: () => onCongelar() }] : []),
        ...(video && !c.rampa
          ? [
              { tipo: 'titulo' as const, nombre: 'Velocidad' },
              ...[0.5, 1, 2].map((v) => ({ nombre: `${v}×${Math.abs(velocidadDe(c) - v) < 0.005 ? '  ✓' : ''}`, accion: () => historial.aplicar(cambiarVelocidad(timeline, c.id, v)) }))
            ]
          : []),
        ...(c.anidado ? [{ nombre: `Desanidar (${c.anidado.length} clips)`, accion: () => historial.aplicar(desanidarClip(timeline, c.id)) }] : []),
        { tipo: 'separador' },
        { ...borrar, nombre: 'Borrar y cerrar el hueco' }
      ])
      return
    }
    const nombres: Record<string, string> = { texto: 'Texto', capa: 'Capa', sonido: 'Sonido', voz: 'Frase de voz', ajuste: 'Capa de ajuste', musica: 'Música' }
    abrirMenu(e, [
      { tipo: 'titulo', nombre: nombres[cual.tipo] ?? '' },
      ...(cual.tipo === 'texto' || cual.tipo === 'capa' || cual.tipo === 'sonido' ? copiarCortar : []),
      ...(cual.tipo === 'texto' || cual.tipo === 'capa' || cual.tipo === 'sonido'
        ? [{ nombre: 'Pegar en el cabezal', atajo: 'Ctrl+V', desactivada: !portapapeles.current, accion: () => acciones.current.accionPegar() }]
        : []),
      ...(cual.tipo === 'capa' ? [{ nombre: 'Ir a su principio', accion: () => onBuscar(tl.capas?.find((x) => x.id === cual.id)?.inicio ?? tiempo) }] : []),
      ...(() => {
        // Capas y textos: duplicar, el estilo, el orden (capas), ocultar y bloquear.
        if (cual.tipo !== 'capa' && cual.tipo !== 'texto') return []
        const tipo = cual.tipo
        const x = tipo === 'capa' ? tl.capas?.find((c) => c.id === cual.id) : tl.textos.find((t) => t.id === cual.id)
        if (!x) return []
        return [
          { tipo: 'separador' as const },
          { nombre: 'Duplicar', atajo: 'Ctrl+D', desactivada: x.bloqueado, accion: () => acciones.current.accionDuplicar() },
          { nombre: 'Copiar el estilo', atajo: 'Ctrl+Alt+C', accion: () => acciones.current.copiarEstilo() },
          { nombre: 'Pegar el estilo', atajo: 'Ctrl+Alt+V', desactivada: hayEstilo !== tipo || x.bloqueado, accion: () => acciones.current.pegarEstilo() },
          ...(tipo === 'capa'
            ? [
                { tipo: 'separador' as const },
                { nombre: 'Traer al frente', accion: () => historial.aplicar(ordenarCapa(timeline, x.id, 'frente', medidas)) },
                { nombre: 'Traer adelante', accion: () => historial.aplicar(ordenarCapa(timeline, x.id, 'subir', medidas)) },
                { nombre: 'Enviar atrás', accion: () => historial.aplicar(ordenarCapa(timeline, x.id, 'bajar', medidas)) },
                { nombre: 'Enviar al fondo', accion: () => historial.aplicar(ordenarCapa(timeline, x.id, 'atras', medidas)) }
              ]
            : []),
          { tipo: 'separador' as const },
          { nombre: x.oculto ? 'Mostrar' : 'Ocultar', accion: () => alternarEn(tipo, x.id, 'oculto') },
          { nombre: x.bloqueado ? 'Desbloquear' : 'Bloquear', accion: () => alternarEn(tipo, x.id, 'bloqueado') }
        ]
      })(),
      ...(() => {
        // Una frase de la narración: dividirla en el punto del clic.
        if (cual.tipo !== 'voz') return []
        const v = tl.voces?.find((x) => x.id === cual.id)
        if (!v) return []
        return [
          { tipo: 'separador' as const },
          {
            nombre: 'Dividir aquí',
            atajo: 'S',
            desactivada: !(t > v.inicio + DURACION_MINIMA && t < v.inicio + v.duracion - DURACION_MINIMA),
            accion: () => {
              const r = dividirVoz(timeline, v.id, t)
              if (r.timeline !== timeline) historial.aplicar(r.timeline)
            }
          }
        ]
      })(),
      ...(() => {
        // Un trozo de música: dividirlo en el punto del clic.
        if (cual.tipo !== 'musica') return []
        const m = tramosMusica(tl).find((x) => x.id === cual.id)
        if (!m) return []
        return [
          {
            nombre: 'Dividir aquí',
            atajo: 'S',
            desactivada: !(t > m.inicio + DURACION_MINIMA && t < m.inicio + m.duracion - DURACION_MINIMA),
            accion: () => {
              const r = dividirMusica(timeline, t)
              if (r.timeline !== timeline) historial.aplicar(r.timeline)
            }
          }
        ]
      })(),
      ...(() => {
        // El sonido suelto (un efecto o el audio separado de un clip): dividir, volumen y volver a unirlo.
        if (cual.tipo !== 'sonido') return []
        const s = tl.sonidos?.find((x) => x.id === cual.id)
        if (!s) return []
        const vol = s.volumen ?? VOLUMEN_SONIDO
        const unible = s.deClip && timeline.clips.some((c) => c.id === s.deClip)
        return [
          { tipo: 'separador' as const },
          {
            nombre: 'Dividir aquí',
            atajo: 'S',
            desactivada: !(t > s.inicio + DURACION_MINIMA && t < s.inicio + s.duracion - DURACION_MINIMA),
            accion: () => {
              const r = dividirSonido(timeline, s.id, t)
              if (r.timeline !== timeline) historial.aplicar(r.timeline)
            }
          },
          ...(unible ? [{ nombre: 'Volver a unir al video', accion: () => historial.aplicar(unirAudio(timeline, s.id)) }] : []),
          { tipo: 'titulo' as const, nombre: 'Volumen' },
          ...[
            ['Silenciar', 0],
            ['50 %', 0.5],
            ['100 %', 1],
            ['150 %', 1.5]
          ].map(([n, v]) => ({ nombre: `${n}${Math.abs(vol - (v as number)) < 0.01 ? '  ✓' : ''}`, accion: () => historial.aplicar(cambiarSonido(timeline, s.id, { volumen: v as number })) }))
        ]
      })(),
      { tipo: 'separador' },
      borrar
    ])
  }

  /** Clic derecho en un hueco de la línea de tiempo (o en la regla): lo que se puede poner ahí. */
  function menuHueco(e: React.MouseEvent) {
    if (total <= 0) return
    const t = Math.min(total, segundoEn(e.clientX))
    abrirMenu(e, [
      { nombre: 'Pegar aquí', atajo: 'Ctrl+V', desactivada: !portapapeles.current, accion: () => (onBuscar(t), setTimeout(() => acciones.current.accionPegar(), 0)) },
      { tipo: 'separador' },
      {
        nombre: 'Añadir un texto aquí',
        atajo: 'T',
        accion: () => {
          const r = anadirTexto(timeline, t)
          if (r.timeline !== timeline) (historial.aplicar(r.timeline), onElegir({ tipo: 'texto', id: r.id }))
        }
      },
      {
        nombre: 'Añadir una capa de ajuste aquí',
        accion: () => {
          const r = anadirAjusteCapa(timeline, Math.min(t, Math.max(0, total - DURACION_MINIMA)))
          historial.aplicar(r.timeline)
          onElegir({ tipo: 'ajuste', id: r.id })
        }
      },
      {
        nombre: 'Poner una marca aquí',
        atajo: 'M',
        accion: () => {
          const r = ponerMarcador(timeline, t)
          if (r.timeline !== timeline) historial.aplicar(r.timeline)
          setMarcaElegida(r.id)
        }
      },
      { tipo: 'separador' },
      { nombre: 'Marcar la entrada aquí', atajo: 'I', accion: () => setRango((r) => ({ entrada: t, ...(r.salida !== undefined && r.salida > t ? { salida: r.salida } : {}) })) },
      { nombre: 'Marcar la salida aquí', atajo: 'O', accion: () => setRango((r) => ({ ...(r.entrada !== undefined && r.entrada < t ? { entrada: r.entrada } : {}), salida: t })) },
      ...(hayRango ? [{ nombre: 'Extraer entre la entrada y la salida', atajo: "'", accion: accionExtraer }] : []),
      { tipo: 'separador' },
      { nombre: 'Ver toda la línea de tiempo', accion: ajustar }
    ])
  }

  // ===== Teclado =====

  /**
   * Alt + flechas: mueve la capa o el texto elegido un poco (con Mayús, diez veces más). Teclas seguidas son un solo
   * paso de deshacer. Un texto sin sitio propio lo toma donde se ve.
   */
  const ultimoFino = useRef(0)
  function moverFino(tecla: string, mucho: boolean) {
    // Una milésima del cuadro: más o menos un píxel de un video de 1080.
    const paso = mucho ? 0.01 : 0.001
    const dx = tecla === 'ArrowLeft' ? -paso : tecla === 'ArrowRight' ? paso : 0
    const dy = tecla === 'ArrowUp' ? -paso : tecla === 'ArrowDown' ? paso : 0
    let nueva = timeline
    if (capaElegida) {
      const c = capaElegida
      if (c.sigue) nueva = cambiarCapa(timeline, c.id, { sigue: { ...c.sigue, dx: c.sigue.dx + dx, dy: c.sigue.dy + dy } }, medidas)
      else {
        const dt = Math.min(c.duracion, Math.max(0, tiempo - c.inicio))
        const ahora = estadoCapa(c, dt, false)
        nueva = timeline
        for (const [p, v] of [['x', ahora.x + dx], ['y', ahora.y + dy]] as const) {
          if ((p === 'x' ? dx : dy) === 0) continue
          nueva = c.claves?.[p] ? ponerClaveCapa(nueva, c.id, p, dt, v, medidas) : cambiarCapa(nueva, c.id, { [p]: Math.min(1, Math.max(0, v)) }, medidas)
        }
      }
    } else if (textoElegido) {
      const dtT = Math.min(textoElegido.duracion, Math.max(0, tiempo - textoElegido.inicio))
      const base = reanclarTexto(textoEn(textoElegido, dtT), textoElegido.alineacion, rotuloEnMonitor(textoElegido.id))
      if (!base) return
      nueva = cambiarTextoEn(timeline, textoElegido.id, { x: base.x + dx, y: base.y + dy }, dtT)
    }
    if (nueva === timeline) return
    const seguido = performance.now() - ultimoFino.current < 700
    ultimoFino.current = performance.now()
    if (seguido) historial.reemplazar(nueva)
    else historial.aplicar(nueva)
  }

  const teclas = useRef<(e: KeyboardEvent) => void>(() => {})
  teclas.current = (e: KeyboardEvent) => {
    if (esCampoDeTexto(e.target)) return
    const ctrl = e.ctrlKey || e.metaKey
    const tecla = e.key.toLowerCase()
    if (ctrl && tecla === 'z' && !e.shiftKey) historial.deshacer()
    else if (ctrl && (tecla === 'y' || (tecla === 'z' && e.shiftKey))) historial.rehacer()
    else if (ctrl && tecla === 'd') accionDuplicar()
    else if (ctrl && tecla === 'a') {
      // Todos los clips de la pista de video.
      if (!tl.clips.length) return
      setVarios(tl.clips.map((c) => ({ tipo: 'clip' as const, id: c.id })))
      if (!elegido || elegido.tipo !== 'clip') onElegir({ tipo: 'clip', id: tl.clips[0].id })
    }
    else if (ctrl && e.altKey && tecla === 'c') {
      if (!copiarEstilo()) return
    } else if (ctrl && e.altKey && tecla === 'v') {
      if (!pegarEstilo()) return
    } else if (ctrl && tecla === 'c') {
      if (!accionCopiar()) return
    } else if (ctrl && tecla === 'x') {
      if (!accionCopiar()) return
      accionBorrar()
    } else if (ctrl && tecla === 'v') {
      if (!portapapeles.current) return
      accionPegar()
    }
    // Dividir, como en CapCut (Ctrl+B) y en Premiere (Ctrl+K).
    else if (ctrl && (tecla === 'b' || tecla === 'k')) accionDividir()
    else if (ctrl) return
    else if (tecla === 'v') setHerramienta('seleccion')
    else if (tecla === 'c') setHerramienta('cuchilla')
    else if (tecla === 'f' && e.shiftKey) onCongelar?.()
    else if (tecla === 'e' && e.shiftKey) onExportarCuadro?.()
    else if (tecla === 'f' && !e.shiftKey && !e.altKey && onPantallaCompleta) onPantallaCompleta()
    else if (/^[1-9]$/.test(e.key) && tl.multicam) {
      // Multicámara: 1, 2, 3… cortan a esa toma en el cabezal (también reproduciendo, como en Premiere).
      const r = cambiarAngulo(timeline, tiempo, Number(e.key) - 1, limiteFuente)
      if (r !== timeline) historial.aplicar(r)
    }
    else if (tecla === 'n') setHerramienta('rodar')
    else if (tecla === 'y') setHerramienta('deslizar')
    else if (tecla === 'u') setHerramienta('desplazar')
    else if (tecla === 'h') setHerramienta('mano')
    else if (tecla === 'm' && e.shiftKey) saltar(tiemposMarcas, true)
    else if (tecla === 'm') accionMarcador()
    else if (tecla === 'i' && e.shiftKey) rango.entrada !== undefined && onBuscar(rango.entrada)
    else if (tecla === 'o' && e.shiftKey) rango.salida !== undefined && onBuscar(rango.salida)
    else if (tecla === 'i') marcarEntrada()
    else if (tecla === 'o') marcarSalida()
    else if (e.key === "'") accionExtraer()
    else if (tecla === 'k') reproduciendo && onAlternar()
    else if (tecla === 'l') (reproduciendo ? onBuscar(Math.min(total, tiempo + 5)) : onAlternar())
    else if (tecla === 'j') onBuscar(Math.max(0, tiempo - 5))
    else if (e.altKey && e.key.startsWith('Arrow') && (capaElegida || textoElegido)) {
      if (!(capaElegida ?? textoElegido)?.bloqueado) moverFino(e.key, e.shiftKey)
    }
    else if (e.key === 'ArrowUp') saltar(cortes, false)
    else if (e.key === 'ArrowDown') saltar(cortes, true)
    else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(zoomMax, z * 1.25))
    else if (e.key === '-') setZoom((z) => Math.max(1, z * 0.8))
    else if (e.key === ' ') {
      // Si un botón tenía el foco, Espacio también lo pulsaría: se le quita el foco.
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') (e.target as HTMLElement).blur()
      onAlternar()
    }
    else if (tecla === 's') accionDividir()
    else if (tecla === 't') accionTexto()
    else if (e.key === 'Delete' || e.key === 'Backspace') accionBorrar()
    else if (e.key === 'Escape') (herramienta !== 'seleccion' ? setHerramienta('seleccion') : (onElegir(null), setMarcaElegida(null)))
    else if (e.key === 'ArrowLeft') onBuscar(Math.max(0, tiempo - (e.shiftKey ? 1 : cuadro)))
    else if (e.key === 'ArrowRight') onBuscar(Math.min(total, tiempo + (e.shiftKey ? 1 : cuadro)))
    else if (e.key === 'Home') onBuscar(0)
    else if (e.key === 'End') onBuscar(total)
    else return
    e.preventDefault()
  }

  useEffect(() => {
    const oyente = (e: KeyboardEvent) => teclas.current(e)
    window.addEventListener('keydown', oyente)
    return () => window.removeEventListener('keydown', oyente)
  }, [])

  // ===== Zoom =====

  function rueda(e: React.WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const x = e.clientX - el.getBoundingClientRect().left
    anclaZoom.current = { t: (el.scrollLeft + x) / pps, x }
    setZoom((z) => Math.min(zoomMax, Math.max(1, z * (e.deltaY < 0 ? 1.25 : 0.8))))
  }

  /** Enseña de `t0` a `t1` (la barra de zoom): el zoom que hace falta y el desplazamiento hasta `t0`. */
  function verTramo(t0: number, t1: number) {
    const el = scrollRef.current
    if (!el) return
    const base = Math.max(120, anchoVisible - 40) / escala.current
    const z = Math.min(zoomMax, Math.max(1, el.clientWidth / Math.max(0.05, t1 - t0) / base))
    if (Math.abs(z - zoom) < 1e-9) {
      el.scrollLeft = t0 * pps
      return
    }
    anclaZoom.current = { t: t0, x: 0 }
    setZoom(z)
  }


  // La imagen con la que se ve cada efecto: la del clip elegido, o la primera de la línea de tiempo.
  const vistaEfecto = miniaturaDe?.(clipElegido?.clip.fuente ?? tl.clips[0]?.fuente ?? 'principal')
  /** La miniatura de una fuente como tira de fotogramas dentro de su bloque (oscurecida para leer el texto). */
  const fondoMini = (fuente: string): React.CSSProperties => {
    const mini = miniaturaDe?.(fuente)
    return mini
      ? { backgroundImage: `linear-gradient(#0b0c0a99, #0b0c0a99), url("${mini}")`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }
      : {}
  }

  // ===== Regla =====

  const paso = PASOS_REGLA.find((p) => p * pps >= 70) ?? PASOS_REGLA[PASOS_REGLA.length - 1]
  const marcas: number[] = []
  for (let t = 0; t <= total + 1e-6; t += paso) marcas.push(t)

  return (
    <div className="tl">
      {menuCtx}
      {mezclador && <Mezclador timeline={timeline} historial={historial} niveles={niveles} sonoridad={sonoridad} onReiniciarSonoridad={reiniciarSonoridad} onCerrar={() => setMezclador(false)} />}
      {paneles.transporte &&
        createPortal(
          <>
            <span className="tr-tc is-actual" title="Código de tiempo del cabezal: horas:minutos:segundos:cuadros">
              {tcCuadros(tiempo, fps)}
            </span>
            <div className="tr-botones" role="toolbar" aria-label="Transporte">
              <button className={`tr-boton tr-llave ${rango.entrada !== undefined ? 'is-on' : ''}`} onClick={marcarEntrada} disabled={total <= 0} title="Marcar la entrada en el cabezal (I) · Mayús+I: ir a la entrada" aria-label="Marcar entrada">
                {'{'}
              </button>
              <button className={`tr-boton tr-llave ${rango.salida !== undefined ? 'is-on' : ''}`} onClick={marcarSalida} disabled={total <= 0} title="Marcar la salida en el cabezal (O) · Mayús+O: ir a la salida" aria-label="Marcar salida">
                {'}'}
              </button>
              <span className="tr-separador" />
              <button className="tr-boton" onClick={() => onBuscar(0)} title="Ir al principio (Inicio)" aria-label="Ir al principio">
                <Icon name="inicio" size={15} />
              </button>
              <button className="tr-boton" onClick={() => onBuscar(Math.max(0, tiempo - cuadro))} title="Un cuadro atrás (←)" aria-label="Un cuadro atrás">
                <Icon name="cuadro-atras" size={15} />
              </button>
              <button className="ed-play" onClick={onAlternar} title={reproduciendo ? 'Pausa (Espacio o K)' : 'Reproducir (Espacio o L)'} aria-label={reproduciendo ? 'Pausa' : 'Reproducir'}>
                <Icon name={reproduciendo ? 'pause' : 'play'} size={18} />
              </button>
              <button className="tr-boton" onClick={() => onBuscar(Math.min(total, tiempo + cuadro))} title="Un cuadro adelante (→)" aria-label="Un cuadro adelante">
                <Icon name="cuadro-adelante" size={15} />
              </button>
              <button className="tr-boton" onClick={() => onBuscar(total)} title="Ir al final (Fin)" aria-label="Ir al final">
                <Icon name="final" size={15} />
              </button>
              <span className="tr-separador tr-extra" />
              <button className={`tr-boton tr-extra ${repetir ? 'is-on' : ''}`} onClick={() => setRepetir((r) => !r)} aria-pressed={repetir} title={hayRango ? 'Repetir entre la entrada y la salida' : 'Repetir todo el video'} aria-label="Repetir">
                <Icon name="repetir" size={15} />
              </button>
              <button className="tr-boton tr-extra" onClick={accionExtraer} disabled={!hayRango} title="Extraer: quita lo que hay entre la entrada y la salida y cierra el hueco (tecla ')" aria-label="Extraer entre entrada y salida">
                <Icon name="extraer" size={15} />
              </button>
              {onExportarCuadro && (
                <button
                  className={`tr-boton tr-extra ${sacandoCuadro ? 'is-on' : ''}`}
                  onClick={onExportarCuadro}
                  disabled={total <= 0 || sacandoCuadro}
                  title="Exportar cuadro: guarda lo que se ve en el cabezal como imagen PNG (Mayús+E)"
                  aria-label="Exportar cuadro"
                >
                  <Icon name="camara" size={15} />
                </button>
              )}
            </div>
            <span className="tr-fin">
            <span className="tr-tc" title={hayRango ? 'Lo que dura el tramo entre la entrada y la salida' : 'Lo que dura todo el video'}>
              {hayRango ? (
                <>
                  <i>{'{ }'}</i> {tcCuadros(rango.salida! - rango.entrada!, fps)}
                </>
              ) : (
                tcCuadros(total, fps)
              )}
            </span>
            {onPantallaCompleta && (
              <button
                className={`tr-boton ${pantallaCompleta ? 'is-on' : ''}`}
                onClick={onPantallaCompleta}
                title={pantallaCompleta ? 'Salir de la pantalla completa (F o Esc)' : 'Ver el monitor a pantalla completa (F)'}
                aria-label={pantallaCompleta ? 'Salir de la pantalla completa' : 'Pantalla completa'}
              >
                <Icon name={pantallaCompleta ? 'achicar' : 'pantalla'} size={15} />
              </button>
            )}
            </span>
          </>,
          paneles.transporte
        )}

      {paneles.biblioteca &&
        createPortal(
          <div className="ed-bib">
            <div className="ed-bib-tabs" role="tablist" aria-label="Biblioteca">
              {(
                [
                  { id: 'medios', nombre: 'Medios', icono: 'film' },
                  { id: 'texto', nombre: 'Texto', icono: 'type' },
                  { id: 'audio', nombre: 'Audio', icono: 'music' },
                  { id: 'efectos', nombre: 'Efectos', icono: 'sliders' },
                  ...(pestanasExtra ?? [])
                ] as { id: string; nombre: string; icono: IconName }[]
              ).map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  aria-selected={pestana === p.id}
                  className={`ed-bib-tab ${pestana === p.id ? 'is-on' : ''} ${p.id === 'efectos' && tl.filtros ? 'tiene' : ''}`}
                  onClick={() => setPestana(p.id)}
                >
                  <Icon name={p.icono} size={17} />
                  <span>{p.nombre}</span>
                </button>
              ))}
            </div>
            <div className="ed-bib-cuerpo">
              {pestana === 'medios' && (panelMedios ?? <span className="tl-dim">Este proyecto no tiene más medios.</span>)}

              {pestana === 'texto' && (
                <>
                  <span className="ed-seccion">Subtítulos</span>
                  <p className="tl-dim">
                    Un texto por frase corta, en su segundo, desde lo que se dice (la transcripción y la narración). Luego corriges o mueves cada uno como un
                    rótulo.
                  </p>
                  <div className="ed-opciones">
                    {ESTILOS_SUBTITULO.map((x) => (
                      <button key={x.id} className={`chip ${estiloSubs === x.id ? 'is-active' : ''}`} title={x.para} onClick={() => setEstiloSubs(x.id)}>
                        {x.nombre}
                      </button>
                    ))}
                  </div>
                  <button
                    className="ed-fila"
                    disabled={total <= 0 || (!transcript?.length && !tl.voces?.length)}
                    title={!transcript?.length && !tl.voces?.length ? 'Transcribe el video (o pon narración) para hacer subtítulos' : undefined}
                    onClick={async () => {
                      const estilo = ESTILOS_SUBTITULO.find((x) => x.id === estiloSubs)?.estilo ?? {}
                      // La narración se escucha para saber cuándo se dice cada palabra (la primera vez tarda un poco).
                      let palabras: Record<string, PalabraVoz[]> | undefined
                      if (tl.voces?.length && onPalabrasDeVoces) {
                        setEscuchandoVoz(true)
                        try {
                          palabras = await onPalabrasDeVoces([...new Set(tl.voces.map((v) => v.archivo))])
                        } catch {
                          palabras = undefined
                        } finally {
                          setEscuchandoVoz(false)
                        }
                      }
                      const r = subtitulosDesdeVoz(timeline, transcript, estilo, 6, palabras)
                      if (r.textos.filter((x) => x.subtitulo).length) historial.aplicar(r)
                    }}
                  >
                    <Icon name="type" size={14} />
                    <span>
                      {escuchandoVoz
                        ? 'Escuchando la voz para que cada palabra vaya a tiempo…'
                        : tl.textos.some((x) => x.subtitulo)
                          ? 'Rehacer los subtítulos con este estilo'
                          : 'Crear los subtítulos de la voz'}
                    </span>
                  </button>
                  {tl.textos.some((x) => x.subtitulo) && (
                    <button className="ed-fila" onClick={() => historial.aplicar(quitarSubtitulos(timeline))}>
                      <Icon name="trash" size={14} />
                      <span>Quitar los {tl.textos.filter((x) => x.subtitulo).length} subtítulos</span>
                    </button>
                  )}
                  {panelSubtitulos}
                  <span className="ed-seccion">Plantillas</span>
                  {PLANTILLAS_TEXTO.map((x) => (
                    <button
                      key={x.id}
                      className="ed-fila"
                      disabled={total <= 0}
                      title={`Para ${x.para}. Entra en el cabezal; luego cambias las palabras.`}
                      onClick={() => {
                        const r = anadirTexto(timeline, tiempo, x.texto)
                        if (r.timeline === timeline) return
                        historial.aplicar(cambiarTextoTL(r.timeline, r.id, x.estilo))
                        onElegir({ tipo: 'texto', id: r.id })
                      }}
                    >
                      <Icon name="plus" size={13} />
                      <span>
                        {x.nombre} <small>{x.para}</small>
                      </span>
                    </button>
                  ))}
                  <span className="ed-seccion">Añadir un texto</span>
                  <p className="tl-dim">Entra en el cabezal. Después lo mueves en el monitor y lo ajustas a la derecha.</p>
                  <div className="ed-rejilla">
                    {[
                      ...Object.entries(FUENTES_TEXTO).map(([clave, f]) => ({ clave, nombre: f.nombre, css: f.familia })),
                      // Las letras propias del proyecto (las de la marca, las que trajo el agente).
                      ...(tl.letras ?? []).map((l) => ({ clave: l.id, nombre: l.nombre, css: `Recorte ${l.id}` }))
                    ].map(({ clave, nombre, css }) => (
                      <button key={clave} className="ed-tarjeta" disabled={total <= 0} onClick={() => accionTexto(clave)} title={`Añadir un texto con la letra ${nombre} (T)`}>
                        <b style={{ fontFamily: `"${css}"` }}>Aa</b>
                        <span>{nombre}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {pestana === 'audio' && (
                <>
                  <span className="ed-seccion">Música</span>
                  <button className="ed-fila" onClick={() => void accionMusica()}>
                    <Icon name="music" size={14} />
                    <span>{tl.musica ? `Cambiar «${tl.musica.nombre}»` : 'Elegir música de tu equipo…'}</span>
                  </button>
                  {generarVoz && (
                    <>
                      <span className="ed-seccion">Narración</span>
                      <button className="ed-fila" disabled={total <= 0} onClick={() => (onElegir(null), setNuevaVoz(true))}>
                        <Icon name="sparkles" size={14} />
                        <span>Añadir una frase de voz en el cabezal</span>
                      </button>
                    </>
                  )}
                  {ponerSonido && (
                    <>
                      {TIPOS_SONIDO.map((g) => (
                        <Fragment key={g.id}>
                          <span className="ed-seccion">Sonidos · {g.nombre}</span>
                          {SONIDOS_INCLUIDOS.filter((x) => x.tipo === g.id).map((x) => (
                            <button key={x.id} className="ed-fila" disabled={total <= 0} onClick={() => void accionSonido(x.id)} title={`Lo pone en el cabezal. Para ${x.para}`}>
                              <Icon name="plus" size={13} />
                              <span>
                                {x.nombre} <small>{x.para}</small>
                              </span>
                            </button>
                          ))}
                        </Fragment>
                      ))}
                      <button className="ed-fila" disabled={total <= 0} onClick={() => void accionSonido()}>
                        <Icon name="folder" size={14} />
                        <span>Un sonido de tu equipo…</span>
                      </button>
                    </>
                  )}
                </>
              )}

              {pestana === 'efectos' && (
                <>
                  <input
                    className="ed-buscar"
                    type="search"
                    value={buscarEfecto}
                    onChange={(e) => setBuscarEfecto(e.target.value)}
                    placeholder="Buscar un efecto"
                    aria-label="Buscar un efecto"
                  />
                  <p className="tl-dim">
                    {clipElegido ? `Se aplican al clip ${clipElegido.indice + 1}. También puedes arrastrarlos a otro clip.` : 'Elige un clip y toca un efecto, o arrástralo sobre un clip de la línea de tiempo.'}
                  </p>

                  {(
                    [
                      ['Looks de color', LOOKS, 'look'],
                      ['Efectos de video', EFECTOS_VIDEO, 'ajustes']
                    ] as const
                  ).map(([titulo, lista, tipo]) => {
                    const visibles = lista.filter(coincide)
                    if (!visibles.length) return null
                    return (
                      <details key={titulo} className="ed-carpeta" open>
                        <summary>
                          {titulo} <small>{visibles.length}</small>
                        </summary>
                        <div className="ed-rejilla ed-efectos">
                          {visibles.map((x) => (
                            <button
                              key={x.id}
                              className="ed-efecto"
                              title={`Para ${x.para}`}
                              draggable
                              onDragStart={(e) => arrastrarEfecto(e, { tipo, ajustes: x.ajustes })}
                              onClick={() => aplicarEfecto(clipElegido?.clip.id, { tipo, ajustes: x.ajustes })}
                            >
                              <span className="ed-efecto-vista">
                                {vistaEfecto ? (
                                  <img
                                    src={vistaEfecto}
                                    alt=""
                                    draggable={false}
                                    style={{
                                      filter:
                                        `${filtroColorCss({ ...ajustesDe(undefined), ...COLOR_NEUTRO, ...x.ajustes } as Required<AjustesClip>)}${x.ajustes.desenfoque ? ` blur(${(x.ajustes.desenfoque * 4).toFixed(1)}px)` : ''}`.trim() ||
                                        undefined
                                    }}
                                  />
                                ) : (
                                  <Icon name="image" size={18} />
                                )}
                              </span>
                              <span>{x.nombre}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )
                  })}

                  {GRUPOS_TRANSICION.map((grupo) => {
                    const visibles = TRANSICIONES.filter((x) => x.grupo === grupo && (coincide(x) || /transici/i.test(buscarEfecto)))
                    if (!visibles.length) return null
                    return (
                      <details key={grupo} className="ed-carpeta" open={grupo === 'Disolver' || grupo === 'Deslizar' || Boolean(buscarEfecto)}>
                        <summary>
                          Transiciones · {grupo} <small>{visibles.length}</small>
                        </summary>
                        <div className="ed-rejilla ed-efectos">
                          {visibles.map((x) => (
                            <button
                              key={x.id}
                              className={`ed-efecto ${clipElegido?.clip.fundido && (clipElegido.clip.transicion ?? 'fundido') === x.id ? 'is-on' : ''}`}
                              title={`${x.nombre}: ${x.para}. Arrástrala a un corte o tócala para el clip elegido.`}
                              draggable
                              onDragStart={(e) => arrastrarEfecto(e, { tipo: 'transicion', id: x.id })}
                              onClick={() => aplicarEfecto(clipElegido?.clip.id, { tipo: 'transicion', id: x.id })}
                              onPointerEnter={() => setMuestraViva(x.id)}
                              onPointerLeave={() => setMuestraViva((v) => (v === x.id ? null : v))}
                              onFocus={() => setMuestraViva(x.id)}
                              onBlur={() => setMuestraViva((v) => (v === x.id ? null : v))}
                            >
                              <span className="ed-efecto-vista">
                                <MuestraTransicion tipo={x.id} viva={muestraViva === x.id} />
                              </span>
                              <span>{x.nombre}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    )
                  })}

                  {TOMAS_CAMARA.some(coincide) && (
                    <details className="ed-carpeta" open>
                      <summary>
                        Movimientos de cámara <small>{TOMAS_CAMARA.filter(coincide).length}</small>
                      </summary>
                      {TOMAS_CAMARA.filter(coincide).map((x) => (
                        <button
                          key={x.id}
                          className="ed-fila"
                          title={x.para}
                          draggable
                          onDragStart={(e) => arrastrarEfecto(e, { tipo: 'ajustes', ajustes: x.ajustes })}
                          onClick={() => aplicarEfecto(clipElegido?.clip.id, { tipo: 'ajustes', ajustes: x.ajustes })}
                        >
                          <Icon name="film" size={13} />
                          <span>
                            {x.nombre} <small>{x.para}</small>
                          </span>
                        </button>
                      ))}
                    </details>
                  )}

                  {(PELICULAS.some(coincide) || !buscarEfecto) && (
                    <details className="ed-carpeta" open>
                      <summary>
                        Película (todo el video) <small>{PELICULAS.filter(coincide).length}</small>
                      </summary>
                      <div className="ed-rejilla ed-efectos">
                        {PELICULAS.filter(coincide).map((x) => {
                          const puesto = FILTROS.every((f) => Math.abs((tl.filtros?.[f.id] ?? 0) - x.filtros[f.id]) < 0.005)
                          return (
                            <button key={x.id} className={`ed-efecto ed-efecto-texto ${puesto ? 'is-on' : ''}`} title={`Para ${x.para}`} onClick={() => historial.aplicar(cambiarFiltros(timeline, x.filtros))}>
                              <span className="ed-efecto-vista">
                                <Icon name="sliders" size={18} />
                              </span>
                              <span>{x.nombre}</span>
                            </button>
                          )
                        })}
                      </div>
                      {FILTROS.map((f) => (
                        <div key={f.id} className="tl-ajuste aj" title={`Para ${f.para}`}>
                          <span>
                            {f.nombre}
                            <ValorArrastrable
                              nombre={f.nombre}
                              valor={tl.filtros?.[f.id] ?? 0}
                              min={0}
                              max={1}
                              paso={0.01}
                              formato={(v) => `${Math.round(v * 100)} %`}
                              porDefecto={0}
                              onEmpezar={empezarAjuste}
                              onCambio={(v) => deslizar(cambiarFiltros(timeline, { [f.id]: v }))}
                            />
                          </span>
                        </div>
                      ))}
                    </details>
                  )}
                </>
              )}

              {pestanasExtra?.map((p) => pestana === p.id && <Fragment key={p.id}>{p.contenido}</Fragment>)}
            </div>
          </div>,
          paneles.biblioteca
        )}

      <div className="tl-barra">
        {escribiendoTc ? (
          <input
            className="tl-tc-grande tl-tc-editar"
            autoFocus
            defaultValue={tcCuadros(tiempo, fps)}
            aria-label="Ir a un momento"
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setEscribiendoTc(false)
              if (e.key !== 'Enter') return
              const t = leerCodigoTiempo(e.currentTarget.value, fps, tiempo)
              if (t !== null) onBuscar(Math.min(total, Math.max(0, t)))
              setEscribiendoTc(false)
            }}
            onBlur={() => setEscribiendoTc(false)}
          />
        ) : (
          <button
            className="tl-tc-grande"
            title="Código de tiempo del cabezal: clic para escribir a qué momento ir (00:00:05:12, 5.4, +10 cuadros…)"
            onClick={() => setEscribiendoTc(true)}
          >
            {tcCuadros(tiempo, fps)}
          </button>
        )}
        <div className="tl-paleta" role="toolbar" aria-label="Herramientas">
          {HERRAMIENTAS.map((h) => (
            <button
              key={h.id}
              className={`tl-herr ${herramienta === h.id ? 'is-on' : ''}`}
              onClick={() => setHerramienta(h.id)}
              aria-pressed={herramienta === h.id}
              title={`${h.nombre} (${h.tecla}): ${h.para}`}
              aria-label={h.nombre}
            >
              <Icon name={h.icono} size={15} />
            </button>
          ))}
          <span className="tl-paleta-sep" />
          <button
            className={`tl-herr ${conIman ? 'is-on' : ''}`}
            onClick={() => setConIman((v) => !v)}
            aria-pressed={conIman}
            title={conIman ? 'Imán activado: los clips se pegan a los bordes, al cabezal y a las marcas' : 'Imán apagado: mueves libre'}
            aria-label="Imán"
          >
            <Icon name="iman" size={15} />
          </button>
          <button className="tl-herr" onClick={accionMarcador} disabled={total <= 0} title="Añadir una marca en el cabezal (M) · Mayús+M: ir a la siguiente" aria-label="Añadir marca">
            <Icon name="marcador" size={15} />
          </button>
        </div>
        {(() => {
          const m = tl.marcadores?.find((x) => x.id === marcaElegida)
          if (!m) return null
          return (
            <span className="tl-marca-editor" aria-label="La marca elegida">
              <input
                className="tl-texto-input"
                value={m.nombre ?? ''}
                placeholder={`Marca en ${tcCuadros(m.t, fps)}`}
                onChange={(e) => historial.aplicar(cambiarMarcador(timeline, m.id, { nombre: e.target.value }))}
                aria-label="Nombre de la marca"
              />
              {(Object.keys(COLORES_MARCADOR) as ColorMarcador[]).map((c) => (
                <button
                  key={c}
                  className={`tl-marca-color ${(m.color ?? 'verde') === c ? 'is-on' : ''}`}
                  style={{ background: COLORES_MARCADOR[c] }}
                  onClick={() => historial.aplicar(cambiarMarcador(timeline, m.id, { color: c }))}
                  title={`Color ${c}`}
                  aria-label={`Color ${c}`}
                />
              ))}
              <button className="tl-boton" onClick={() => (historial.aplicar(borrarMarcador(timeline, m.id)), setMarcaElegida(null))} title="Quitar la marca" aria-label="Quitar la marca">
                <Icon name="trash" size={14} />
              </button>
              <button className="tl-boton" onClick={() => setMarcaElegida(null)} title="Cerrar" aria-label="Cerrar">
                <Icon name="x" size={14} />
              </button>
            </span>
          )
        })()}
        <span className="tl-separador" />
        <button className="tl-boton" onClick={accionDividir} title="Dividir en el cabezal (S)" disabled={total <= 0}>
          <Icon name="scissors" size={16} /> Dividir
        </button>
        {onCongelar && (
          <button className="tl-boton" onClick={onCongelar} disabled={total <= 0 || congelando} title="Congelar el cuadro del cabezal: entra ahí como un clip quieto de 2 s (Mayús+F)">
            <Icon name="pause" size={15} /> {congelando ? 'Congelando…' : 'Congelar'}
          </button>
        )}
        <button className="tl-boton" onClick={accionDuplicar} title="Duplicar el clip elegido" disabled={!clipElegido}>
          <Icon name="copy" size={16} />
        </button>
        <button className="tl-boton" onClick={accionBorrar} title="Borrar lo elegido (Supr)" disabled={!elegido}>
          <Icon name="trash" size={16} />
        </button>
        <span className="tl-separador" />
        <button className="tl-boton" onClick={historial.deshacer} title="Deshacer (Ctrl+Z)" disabled={!historial.puedeDeshacer}>
          <Icon name="undo" size={16} />
        </button>
        <button className="tl-boton" onClick={historial.rehacer} title="Rehacer (Ctrl+Shift+Z)" disabled={!historial.puedeRehacer}>
          <Icon name="redo" size={16} />
        </button>
        <span className="tl-flex" />
        <button
          className={`tl-boton tl-boton-mezclador ${mezclador ? 'is-activo' : ''}`}
          onClick={() => setMezclador((v) => !v)}
          aria-pressed={mezclador}
          title="Mezclador de audio: el volumen de cada pista y sus medidores"
        >
          <Icon name="mezclador" size={15} />
          <Medidor horizontal nivel={niveles.general} />
          {reproduciendo && Number.isFinite(sonoridad.corta) && sonoridad.corta > -70 && (
            <span className="tl-lufs" title="Sonoridad de los últimos 3 s (las redes dejan los videos en −14 LUFS)">
              {textoLufs(sonoridad.corta)} LUFS
            </span>
          )}
        </button>
        <button className="tl-boton" onClick={ajustar} title="Ver toda la línea de tiempo (para acercar: la barra de debajo, Ctrl+rueda o + y −)">
          Ajustar
        </button>
      </div>

      <div className="tl-cuerpo">
        <div className="tl-nombres">
          <span className="tl-nombre regla" />
          {PISTAS.map((p) => {
            const estado = tl.pistas?.[p.id]
            const quitar = p.audio ? 'Silenciar' : 'Ocultar'
            const poner = p.audio ? 'Volver a oír' : 'Volver a mostrar'
            return (
              <span
                key={p.id}
                className={`tl-nombre p-${p.id} ${estado?.oculta ? 'is-oculta' : ''}`}
                style={p.id === 'encima' && filasEncima > 1 ? { height: filasEncima * ALTO_FILA } : p.id === 'sonidos' && filasSonidos > 1 ? { height: filasSonidos * ALTO_FILA } : undefined}
              >
                {p.id === 'encima' && filasEncima > 1 ? (
                  <span className="tl-nombre-texto tl-nombre-filas" title="Varias pistas de video encima: arrastra una capa arriba o abajo para cambiarla de pista. La de arriba tapa a las demás.">
                    {Array.from({ length: filasEncima }, (_, i) => (
                      <i key={i}>Encima {filasEncima - i}</i>
                    ))}
                  </span>
                ) : p.id === 'sonidos' && filasSonidos > 1 ? (
                  <span className="tl-nombre-texto tl-nombre-filas" title="Varias pistas de sonidos: arrastra un efecto arriba o abajo para encimarlo con otro.">
                    {Array.from({ length: filasSonidos }, (_, i) => (
                      <i key={i}>Sonido {filasSonidos - i}</i>
                    ))}
                  </span>
                ) : p.id === 'video' && portadaDe ? (
                  <span className={`tl-portada ${tl.portada?.archivo ? 'tiene' : ''}`}>
                    <button
                      className="tl-portada-abrir"
                      title={tl.portada?.archivo ? 'La portada del video: toca para editarla' : 'Poner una portada: un momento del video o una foto, con título'}
                      onClick={() => setPortadaAbierta(true)}
                      style={tl.portada?.archivo && urlDe ? { backgroundImage: `url("${urlDe(tl.portada.archivo)}")` } : undefined}
                    >
                      <Icon name="lapiz" size={12} />
                      <span>Portada</span>
                    </button>
                    {tl.portada && (
                      <button className="tl-portada-quitar" title="Quitar la portada" aria-label="Quitar la portada" onClick={() => historial.aplicar(ponerPortada(timeline, null))}>
                        <Icon name="x" size={10} />
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="tl-nombre-texto">{p.nombre}</span>
                )}
                <button
                  className={`tl-pista-boton ${estado?.oculta ? 'is-on' : ''}`}
                  onClick={() => historial.aplicar(cambiarPista(timeline, p.id, { oculta: !estado?.oculta }))}
                  title={`${estado?.oculta ? poner : quitar} la pista ${p.nombre} (en el monitor y en el MP4)`}
                  aria-label={`${estado?.oculta ? poner : quitar} la pista ${p.nombre}`}
                  aria-pressed={Boolean(estado?.oculta)}
                >
                  <Icon name={p.audio ? (estado?.oculta ? 'volumen-no' : 'volumen') : estado?.oculta ? 'ojo-no' : 'ojo'} size={12} />
                </button>
                {p.audio && (
                  <button
                    className={`tl-pista-boton tl-pista-solo ${estado?.solo ? 'is-on' : ''}`}
                    onClick={() => historial.aplicar(cambiarPista(timeline, p.id, { solo: !estado?.solo }))}
                    title={
                      estado?.solo
                        ? `Dejar de escuchar solo ${p.nombre}`
                        : `Escuchar solo ${p.nombre}: las demás pistas de audio se callan en el editor (el MP4 suena entero)`
                    }
                    aria-label={estado?.solo ? `Dejar de escuchar solo ${p.nombre}` : `Escuchar solo ${p.nombre}`}
                    aria-pressed={Boolean(estado?.solo)}
                  >
                    S
                  </button>
                )}
                <button
                  className={`tl-pista-boton ${estado?.bloqueada ? 'is-on' : ''}`}
                  onClick={() => historial.aplicar(cambiarPista(timeline, p.id, { bloqueada: !estado?.bloqueada }))}
                  title={estado?.bloqueada ? `Desbloquear la pista ${p.nombre}` : `Bloquear la pista ${p.nombre}: no se puede tocar`}
                  aria-label={estado?.bloqueada ? `Desbloquear la pista ${p.nombre}` : `Bloquear la pista ${p.nombre}`}
                  aria-pressed={Boolean(estado?.bloqueada)}
                >
                  <Icon name={estado?.bloqueada ? 'candado' : 'candado-abierto'} size={12} />
                </button>
              </span>
            )
          })}
        </div>

        <div
          className={`tl-scroll herramienta-${herramienta}`}
          ref={scrollRef}
          onWheel={rueda}
          onPointerDownCapture={(e) => {
            if (herramienta !== 'mano' || e.button !== 0) return
            // La mano recorre la línea de tiempo sin tocar nada.
            e.preventDefault()
            e.stopPropagation()
            const el = scrollRef.current
            if (!el) return
            const x0 = e.clientX
            const s0 = el.scrollLeft
            el.classList.add('is-arrastrando')
            const mover = (ev: PointerEvent) => (el.scrollLeft = s0 - (ev.clientX - x0))
            const soltar = () => {
              el.classList.remove('is-arrastrando')
              window.removeEventListener('pointermove', mover)
              window.removeEventListener('pointerup', soltar)
            }
            window.addEventListener('pointermove', mover)
            window.addEventListener('pointerup', soltar)
          }}
          onPointerMove={(e) => herramienta === 'cuchilla' && setCortePrevio(iman(segundoEn(e.clientX), puntosIman(timeline)))}
          onPointerLeave={() => setCortePrevio(null)}
        >
          <div className="tl-lienzo" ref={lienzoRef} style={{ width: ancho }} data-pps={pps} onContextMenu={menuHueco}>
            <div className="tl-regla" onPointerDown={arrastrarCabezal}>
              {vistaPrevia?.tramos
                .filter((t) => t.pesado)
                .map((t) => {
                  const lista = vistaPrevia.listas.has(t.clave)
                  return (
                    <span
                      key={`v${t.desde}`}
                      className={`tl-vista ${lista ? 'is-lista' : 'is-falta'}`}
                      style={{ left: t.desde * pps, width: Math.max(1, (t.hasta - t.desde) * pps) }}
                      title={lista ? 'Vista previa lista: se reproduce sin trabarse' : 'Preparando la vista previa de este tramo (en pausa, en segundo plano)'}
                    />
                  )
                })}
              {marcas.map((t) => (
                <span key={t} className="tl-marca" style={{ left: t * pps }}>
                  {tc(t, paso < 1)}
                </span>
              ))}
              {(rango.entrada !== undefined || rango.salida !== undefined) && (
                <span
                  className="tl-rango"
                  style={{ left: (rango.entrada ?? 0) * pps, width: Math.max(2, ((rango.salida ?? total) - (rango.entrada ?? 0)) * pps) }}
                  title="Entre la entrada y la salida"
                />
              )}
              {(tl.marcadores ?? []).map((m) => (
                <button
                  key={m.id}
                  className={`tl-marca-m ${marcaElegida === m.id ? 'is-on' : ''}`}
                  style={{ left: m.t * pps, ['--marca' as string]: COLORES_MARCADOR[m.color ?? 'verde'] }}
                  title={`${m.nombre ? `${m.nombre} · ` : ''}${tcCuadros(m.t, fps)} (clic: ir y editar)`}
                  aria-label={`Marca ${m.nombre ?? tcCuadros(m.t, fps)}`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    onBuscar(m.t)
                    setMarcaElegida(m.id)
                  }}
                  onContextMenu={(e) =>
                    abrirMenu(e, [
                      { tipo: 'titulo', nombre: m.nombre || `Marca en ${tcCuadros(m.t, fps)}` },
                      { nombre: 'Ir a la marca', accion: () => onBuscar(m.t) },
                      { nombre: 'Quitar la marca', peligro: true, accion: () => historial.aplicar(borrarMarcador(timeline, m.id)) }
                    ])
                  }
                />
              ))}
            </div>

            <div className={`tl-carril ajuste ${clasePista('ajuste')}`} onPointerDown={arrastrarCabezal}>
              {!tl.ajustesCapa?.length && (
                <button
                  className="tl-vacio tl-vacio-boton"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const r = anadirAjusteCapa(timeline, Math.min(tiempo, Math.max(0, total - DURACION_MINIMA)))
                    historial.aplicar(r.timeline)
                    onElegir({ tipo: 'ajuste', id: r.id })
                  }}
                  disabled={total <= 0}
                >
                  + Capa de ajuste (color o desenfoque para todo lo de abajo)
                </button>
              )}
              {(tl.ajustesCapa ?? []).map((x) => (
                <div
                  key={x.id}
                  className={`tl-rotulo tl-ajuste-capa ${(elegido?.tipo === 'ajuste' && elegido.id === x.id) || enVarios(x.id) ? 'is-elegido' : ''}`}
                  style={{ left: x.inicio * pps, width: Math.max(6, x.duracion * pps - 1) }}
                  title="Capa de ajuste: cambia el color o desenfoca todo lo de abajo en este tramo"
                  onContextMenu={(e) => menuDe(e, { tipo: 'ajuste', id: x.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'ajuste', id: x.id }) || arrastrarAjuste(e, x.id, 'mover')}
                >
                  <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarAjuste(e, x.id, 'inicio')} />
                  {x.duracion * pps > 50 && <span className="tl-clip-texto">Ajuste</span>}
                  <span className="tl-asa derecha" onPointerDown={(e) => arrastrarAjuste(e, x.id, 'fin')} />
                </div>
              ))}
            </div>

            <div
              ref={encimaRef}
              className={`tl-carril encima ${filasEncima > 1 ? 'con-filas' : ''} ${destino === 'encima' ? 'is-destino' : ''} ${clasePista('encima')}`}
              style={filasEncima > 1 ? { height: filasEncima * ALTO_FILA } : undefined}
              onPointerDown={arrastrarCabezal}
              {...receptor('encima')}
            >
              {!tl.capas?.length && (
                <span className="tl-vacio">Logos, íconos o tomas encima del video: arrástralos desde Medios.</span>
              )}
              {(tl.capas ?? []).map((c) => {
                const anchoCapa = c.duracion * pps
                const nombre = c.grafico ? `Gráfico · ${resumenGrafico(c.grafico)}` : nombreDe ? nombreDe(c.fuente) : 'Capa'
                return (
                  <div
                    key={c.id}
                    className={`tl-rotulo tl-capa ${(elegido?.tipo === 'capa' && elegido.id === c.id) || enVarios(c.id) ? 'is-elegido' : ''} ${c.oculto ? 'is-oculto' : ''} ${c.bloqueado ? 'is-bloqueado' : ''}`}
                    style={{
                      left: c.inicio * pps,
                      width: Math.max(4, anchoCapa),
                      ...(filasEncima > 1 ? { top: (filasEncima - Math.min(filasEncima, pistaDeCapa(c))) * ALTO_FILA + 3, bottom: 'auto', height: ALTO_FILA - 7 } : {}),
                      ...fondoMini(c.fuente)
                    }}
                    onContextMenu={(e) => menuDe(e, { tipo: 'capa', id: c.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'capa', id: c.id }) || arrastrarCapa(e, c.id, 'mover')}
                    title={`${nombre} · ${c.duracion.toFixed(1)} s`}
                  >
                    <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarCapa(e, c.id, 'inicio')} />
                    {anchoCapa > 30 && <span className="tl-clip-texto">{c.bloqueado ? '🔒 ' : ''}{c.oculto ? '(oculta) ' : ''}{nombre}</span>}
                    {c.claves &&
                      [...new Set(Object.values(c.claves).flatMap((l) => (l ?? []).map((x) => x.f)))].map((f) => (
                        <span key={f} className="tl-clave" style={{ left: f * pps }} />
                      ))}
                    <span className="tl-asa derecha" onPointerDown={(e) => arrastrarCapa(e, c.id, 'fin')} />
                  </div>
                )
              })}
            </div>

            <div className={`tl-carril video ${destino === 'video' ? 'is-destino' : ''} ${clasePista('video')}`} onPointerDown={arrastrarCabezal} {...receptor('video')}>
              {lista.length === 0 && <span className="tl-vacio">La timeline está vacía. Deshaz (Ctrl+Z) para recuperar el material.</span>}
              {lista.map((t) => {
                const anchoClip = (t.fin - t.inicio) * pps
                return (
                  <div
                    key={t.clip.id}
                    className={`tl-clip ${t.clip.fuente !== 'principal' ? 'otra-fuente' : ''} ${elegido?.id === t.clip.id || enVarios(t.clip.id) ? 'is-elegido' : ''}`}
                    {...recibeEfecto(t.clip.id)}
                    data-efecto={sobreClip === t.clip.id ? 'si' : undefined}
                    style={{ left: t.inicio * pps, width: anchoClip, ...fondoMini(t.clip.fuente) }}
                    onContextMenu={(e) => menuDe(e, { tipo: 'clip', id: t.clip.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'clip', id: t.clip.id }) || arrastrarClip(e, t.clip.id)}
                    title={`Clip ${t.indice + 1} · ${nombreDe ? nombreDe(t.clip.fuente) : 'fuente'} ${tc(t.clip.entrada)}–${tc(t.clip.salida)}`}
                  >
                    {ondaDe && esVideo(t.clip.fuente) && !t.clip.mudo && ondaDe(t.clip.fuente) && (
                      <Onda url={ondaDe(t.clip.fuente)!} duracion={t.clip.salida - t.clip.entrada} desde={t.clip.entrada} />
                    )}
                    <span className="tl-asa izquierda" onPointerDown={(e) => recortar(e, t.clip.id, 'entrada')} />
                    {t.indice > 0 && t.clip.fundido ? (
                      <span
                        className="tl-transicion-bloque"
                        style={{ width: Math.max(6, t.clip.fundido * pps) }}
                        title={`${TRANSICIONES.find((x) => x.id === (t.clip.transicion ?? 'fundido'))?.nombre ?? 'Transición'} · ${t.clip.fundido.toFixed(2)} s. Arrastra su borde para que dure más o menos.`}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          onElegir({ tipo: 'clip', id: t.clip.id })
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          historial.aplicar(fundirClip(timeline, t.clip.id, 0))
                        }}
                      >
                        {t.clip.fundido * pps > 44 && <i>{TRANSICIONES.find((x) => x.id === (t.clip.transicion ?? 'fundido'))?.nombre}</i>}
                        <span className="tl-transicion-borde" onPointerDown={(e) => estirarTransicion(e, t.clip.id, t.clip.fundido!)} />
                      </span>
                    ) : null}
                    {anchoClip > 46 && (
                      <span className="tl-clip-texto">
                        <b>{t.indice + 1}</b>
                        {t.clip.rampa ? <i className="tl-clip-vel" title="Tiene una rampa de velocidad">rampa</i> : t.clip.velocidad ? <i className="tl-clip-vel">{t.clip.velocidad}×</i> : null}
                        {t.clip.claves ? <i className="tl-clip-vel tl-clip-anim" title="Tiene fotogramas clave">◆</i> : null}
                        {anchoClip > 120 &&
                          (t.clip.fuente !== 'principal' && nombreDe ? <> {nombreDe(t.clip.fuente)}</> : <> {tc(t.clip.entrada, false)}–{tc(t.clip.salida, false)}</>)}
                      </span>
                    )}
                    {elegido?.id === t.clip.id && anchoClip > 30 && (
                      <button
                        className="tl-clip-quitar"
                        title="Quitar este clip (Supr)"
                        aria-label="Quitar este clip"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          accionBorrar()
                        }}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                    {t.clip.claves &&
                      [...new Set(Object.values(t.clip.claves).flatMap((l) => (l ?? []).map((x) => x.f)))]
                        .filter((f) => f >= t.clip.entrada - 0.001 && f <= t.clip.salida + 0.001)
                        .map((f) => <span key={f} className="tl-clave" style={{ left: ((f - t.clip.entrada) / velocidadDe(t.clip)) * pps }} />)}
                    <span className="tl-asa derecha" onPointerDown={(e) => recortar(e, t.clip.id, 'salida')} />
                  </div>
                )
              })}
            </div>

            <div className={`tl-carril texto ${clasePista('texto')}`} onPointerDown={arrastrarCabezal}>
              {tl.textos.map((x) => (
                <div
                  key={x.id}
                  className={`tl-rotulo ${elegido?.id === x.id || enVarios(x.id) ? 'is-elegido' : ''} ${x.oculto ? 'is-oculto' : ''} ${x.bloqueado ? 'is-bloqueado' : ''}`}
                  style={{ left: x.inicio * pps, width: Math.max(4, x.duracion * pps) }}
                  onContextMenu={(e) => menuDe(e, { tipo: 'texto', id: x.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'texto', id: x.id }) || arrastrarTexto(e, x.id, 'mover')}
                  onDoubleClick={() => textoRef.current?.select()}
                  title={x.texto.replace(/\*([^*]+)\*/g, '$1')}
                >
                  <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarTexto(e, x.id, 'inicio')} />
                  <span className="tl-clip-texto">{x.bloqueado ? '🔒 ' : ''}{x.oculto ? '(oculto) ' : ''}{x.texto ? conResaltes(x.texto) : 'Texto vacío'}</span>
                  {x.claves &&
                    [...new Set(Object.values(x.claves).flatMap((l) => (l ?? []).map((k) => k.f)))]
                      .filter((f) => f >= 0 && f <= x.duracion)
                      .map((f) => <span key={f} className="tl-clave" style={{ left: f * pps }} />)}
                  <span className="tl-asa derecha" onPointerDown={(e) => arrastrarTexto(e, x.id, 'fin')} />
                </div>
              ))}
            </div>

            <div className={`tl-carril voz ${clasePista('voz')}`} onPointerDown={arrastrarCabezal}>
              {(tl.voces ?? []).map((v) => {
                const anchoFrase = v.duracion * pps
                return (
                  <div
                    key={v.id}
                    className={`tl-voz tl-frase ${(elegido?.tipo === 'voz' && elegido.id === v.id) || enVarios(v.id) ? 'is-elegido' : ''}`}
                    style={{ left: v.inicio * pps, width: Math.max(4, anchoFrase - 1) }}
                    title={v.texto || 'Narración'}
                    onContextMenu={(e) => menuDe(e, { tipo: 'voz', id: v.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'voz', id: v.id }) || arrastrarFrase(e, v.id)}
                  >
                    {urlDe && v.archivo && <Onda url={urlDe(v.archivo)} duracion={v.duracion} desde={v.desde ?? 0} />}
                    {anchoFrase > 30 && <span className="tl-clip-texto">{v.texto || 'Narración'}</span>}
                    <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarFrase(e, v.id, 'inicio')} />
                    <span className="tl-asa derecha" onPointerDown={(e) => arrastrarFrase(e, v.id, 'fin')} />
                  </div>
                )
              })}
              {voz.length === 0 && !tl.voces?.length && (
                <span className="tl-vacio">{transcript?.length ? 'Sin voz en la edición.' : 'Transcribe el video para ver aquí lo que se dice.'}</span>
              )}
              {voz.map((v) => {
                const anchoVoz = (v.fin - v.inicio) * pps
                return (
                  <div
                    key={v.id}
                    className="tl-voz"
                    style={{ left: v.inicio * pps, width: Math.max(2, anchoVoz - 1) }}
                    title={v.texto}
                  >
                    {anchoVoz > 30 && <span className="tl-clip-texto">{v.texto}</span>}
                  </div>
                )
              })}
            </div>

            <div
              ref={sonidosRef}
              className={`tl-carril sonidos ${filasSonidos > 1 ? 'con-filas' : ''} ${clasePista('sonidos')}`}
              style={filasSonidos > 1 ? { height: filasSonidos * ALTO_FILA } : undefined}
              onPointerDown={arrastrarCabezal}
            >
              {!tl.sonidos?.length && ponerSonido && (
                <button className="tl-vacio tl-vacio-boton" onPointerDown={(e) => e.stopPropagation()} onClick={() => setPestana('audio')}>
                  + Añadir un efecto de sonido
                </button>
              )}
              {(tl.sonidos ?? []).map((s) => {
                const anchoSonido = s.duracion * pps
                return (
                  <div
                    key={s.id}
                    className={`tl-voz tl-frase tl-sonido ${(elegido?.tipo === 'sonido' && elegido.id === s.id) || enVarios(s.id) ? 'is-elegido' : ''}`}
                    style={{
                      left: s.inicio * pps,
                      width: Math.max(6, anchoSonido - 1),
                      ...(filasSonidos > 1 ? { top: (filasSonidos - Math.min(filasSonidos, s.pista ?? 1)) * ALTO_FILA + 4, bottom: 'auto', height: ALTO_FILA - 8 } : {})
                    }}
                    title={`${s.nombre}${filasSonidos > 1 ? ` · pista ${s.pista ?? 1}` : ''}`}
                    onContextMenu={(e) => menuDe(e, { tipo: 'sonido', id: s.id })}
                    onPointerDown={(e) => sumar(e, { tipo: 'sonido', id: s.id }) || arrastrarSonido(e, s.id)}
                  >
                    {urlDe && <Onda url={urlDe(s.archivo)} duracion={s.duracion} desde={s.desde ?? 0} />}
                    {anchoSonido > 30 && <span className="tl-clip-texto">{s.nombre}</span>}
                    <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarSonido(e, s.id, 'inicio')} />
                    <span className="tl-asa derecha" onPointerDown={(e) => arrastrarSonido(e, s.id, 'fin')} />
                  </div>
                )
              })}
            </div>

            <div className={`tl-carril musica ${clasePista('musica')}`} onPointerDown={arrastrarCabezal}>
              {tl.musica ? (
                tramosMusica(tl).map((m, i) => (
                <div
                  key={m.id}
                  className={`tl-musica ${elegido?.tipo === 'musica' && elegido.id === m.id ? 'is-elegido' : ''}`}
                  style={{ left: m.inicio * pps, width: Math.max(4, m.duracion * pps - (tl.musica!.tramos ? 1 : 0)) }}
                  onContextMenu={(e) => menuDe(e, { tipo: 'musica', id: m.id })}
                  onPointerDown={(e) => (tl.musica!.tramos ? arrastrarMusica(e, m.id, 'mover') : (e.stopPropagation(), onElegir({ tipo: 'musica', id: m.id })))}
                  title={`${tl.musica!.nombre} · ${m.duracion.toFixed(1)} s`}
                >
                  {urlDe && <Onda url={urlDe(tl.musica!.archivo)} duracion={m.duracion} desde={m.desde ?? 0} />}
                  {(i === 0 || m.duracion * pps > 60) && (
                    <span className="tl-clip-texto">
                      <Icon name="music" size={11} /> {tl.musica!.nombre} · {Math.round(tl.musica!.volumen * 100)} %
                      {tl.musica!.ducking ? ' · baja con la voz' : ''}
                    </span>
                  )}
                  <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarMusica(e, m.id, 'inicio')} />
                  <span className="tl-asa derecha" onPointerDown={(e) => arrastrarMusica(e, m.id, 'fin')} />
                </div>
                ))
              ) : (
                <button
                  className="tl-vacio tl-vacio-boton"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void accionMusica()}
                >
                  + Añadir música
                </button>
              )}
            </div>

            {insercion !== null && <span className="tl-insercion" style={{ left: insercion * pps }} />}
            {hayRango && <span className="tl-rango-zona" style={{ left: rango.entrada! * pps, width: (rango.salida! - rango.entrada!) * pps }} />}
            {(tl.marcadores ?? []).map((m) => (
              <span key={m.id} className="tl-marca-linea" style={{ left: m.t * pps, ['--marca' as string]: COLORES_MARCADOR[m.color ?? 'verde'] }} />
            ))}
            {herramienta === 'cuchilla' && cortePrevio !== null && <span className="tl-corte-previo" style={{ left: cortePrevio * pps }} />}
            <span className="tl-cabezal" style={{ left: Math.min(tiempo, total) * pps }} />
          </div>
        </div>
      </div>
      <div className="tl-barra-zoom-fila">
        <BarraZoom scrollRef={scrollRef} pps={pps} duracion={Math.max(total, 1)} cabezal={tiempo} onVer={verTramo} onAjustar={ajustar} />
      </div>

      {portadaAbierta && portadaDe && urlDe && (
        <PortadaModal
          proyectoId={portadaDe.proyectoId}
          ancho={portadaDe.ancho}
          alto={portadaDe.alto}
          fps={fps}
          timeline={timeline}
          historial={historial}
          tiempo={tiempo}
          medios={medios ?? []}
          urlDe={urlDe}
          miniaturaDe={miniaturaDe}
          onCerrar={() => setPortadaAbierta(false)}
        />
      )}
      {paneles.inspector &&
        createPortal(
          <div className="ed-insp">
            <div className="ed-insp-cabeza">
              <b>
                {varios.length > 1
                  ? `${varios.length} elegidos`
                  : clipElegido
                  ? `Clip ${clipElegido.indice + 1}`
                  : capaElegida
                    ? capaElegida.grafico
                      ? 'Gráfico'
                      : 'Capa encima'
                    : sonidoElegido
                      ? 'Sonido'
                      : musicaElegida
                        ? 'Música'
                        : textoElegido
                          ? 'Texto'
                          : (fraseElegida || nuevaVoz) && generarVoz
                            ? 'Voz'
                            : 'Proyecto'}
              </b>
              <button
                className={`btn small ${panelExportar ? '' : 'primary'}`}
                onClick={() => setPanelExportar((v) => !v)}
                disabled={total <= 0 && !exportar.activo}
              >
                <Icon name="download" size={14} />
                {exportar.activo ? `Exportando ${Math.round(exportar.pct * 100)} %` : 'Exportar'}
              </button>
            </div>
            {panelExportar && (
              <div className="tl-exportar">
                <div className="chips">
                  <button className={`chip ${formato === 'original' || exportar.vertical ? 'is-active' : ''}`} onClick={() => setFormato('original')}>
                    {exportar.vertical ? 'Original (vertical)' : 'Original (horizontal)'}
                  </button>
                  {!exportar.vertical && (
                    <button className={`chip ${formato === 'vertical' ? 'is-active' : ''}`} onClick={() => setFormato('vertical')}>
                      Vertical 9:16, recortado al centro
                    </button>
                  )}
                </div>
                <label
                  className={`tl-check ${exportar.hayTranscripcion ? '' : 'is-off'}`}
                  title={exportar.hayTranscripcion ? undefined : 'Transcribe el video para poder quemar los subtítulos'}
                >
                  <input
                    type="checkbox"
                    checked={subtitulos && exportar.hayTranscripcion}
                    disabled={!exportar.hayTranscripcion}
                    onChange={(e) => setSubtitulos(e.target.checked)}
                  />
                  Subtítulos de la voz
                </label>
                <label className="tl-check" title="El lado corto del video (nunca se agranda)">
                  Resolución
                  <select value={resolucion} onChange={(e) => setResolucion(e.target.value as typeof resolucion)}>
                    <option value="original">La del material</option>
                    <option value="1080">1080p</option>
                    <option value="720">720p (más liviano)</option>
                  </select>
                </label>
                <label className="tl-check" title="Alta: más nítido y más pesado. Ligera: para mandar rápido por chat.">
                  Calidad
                  <select value={calidad} onChange={(e) => setCalidad(e.target.value as typeof calidad)}>
                    <option value="alta">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="ligera">Ligera</option>
                  </select>
                </label>
                <label className="tl-check" title="Deja el volumen a la medida que piden YouTube, Instagram y TikTok (−14 LUFS): ni muy bajo ni saturado">
                  <input type="checkbox" checked={normalizar} onChange={(e) => setNormalizar(e.target.checked)} />
                  Volumen para redes
                </label>
                {hayRango && (
                  <label className="tl-check" title="Exporta solo el tramo marcado con { y } en el monitor">
                    <input type="checkbox" checked={soloEntradaSalida} onChange={(e) => setSoloEntradaSalida(e.target.checked)} />
                    Solo entre la entrada y la salida ({tcCuadros(rango.salida! - rango.entrada!, fps)})
                  </label>
                )}
                {exportar.destino && (
                  <span className="tl-dim tl-destino" title={exportar.destino}>
                    Se guarda en {exportar.destino}
                  </span>
                )}
                {exportar.activo && (
                  <span className="tl-progreso">
                    <span style={{ width: `${Math.round(exportar.pct * 100)}%` }} />
                  </span>
                )}
                {exportar.hayArchivo && !exportar.activo && (
                  <button className="btn small ghost" onClick={exportar.onAbrir}>
                    <Icon name="folder" size={14} /> Ver el último
                  </button>
                )}
                <button
                  className="btn small primary"
                  disabled={exportar.activo || total <= 0}
                  onClick={() =>
                    exportar.onExportar({
                      formato: exportar.vertical ? 'original' : formato,
                      subtitulos: subtitulos && exportar.hayTranscripcion,
                      resolucion,
                      calidad,
                      normalizar,
                      ...(hayRango && soloEntradaSalida ? { desde: rango.entrada, hasta: rango.salida } : {})
                    })
                  }
                >
                  <Icon name="download" size={14} />{' '}
                  {exportar.activo ? 'Exportando…' : `Exportar MP4 · ${tc(hayRango && soloEntradaSalida ? rango.salida! - rango.entrada! : total, false)}`}
                </button>
                <label className="tl-check" title="Solo el sonido de la mezcla final (para un podcast o para mandar a mezclar)">
                  <select
                    value=""
                    disabled={exportar.activo || total <= 0}
                    onChange={(e) => {
                      const formatoAudio = e.target.value as 'wav' | 'mp3'
                      if (!formatoAudio) return
                      exportar.onExportar({
                        formato: 'original',
                        subtitulos: false,
                        normalizar,
                        soloAudio: formatoAudio,
                        ...(hayRango && soloEntradaSalida ? { desde: rango.entrada, hasta: rango.salida } : {})
                      })
                    }}
                    aria-label="Exportar solo el sonido"
                  >
                    <option value="">Solo el sonido…</option>
                    <option value="wav">WAV (sin pérdida)</option>
                    <option value="mp3">MP3 (liviano)</option>
                  </select>
                </label>
              </div>
            )}
      <div className="tl-detalle">
        {varios.length > 1 ? (
          <div className="ed-vacio">
            <p>
              Tienes {varios.length} elementos elegidos. Suma o quita con Ctrl + clic (aquí o en el monitor); un clic normal vuelve a elegir uno solo. Arrastra uno en el monitor y se mueven todos.
            </p>
            <button className="btn small" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Borrar los {varios.length}
            </button>
            {varios.some((v) => v.tipo === 'capa' || v.tipo === 'texto') && (
              <PanelAlinear
                onAlinear={(como) => {
                  const piezas = varios.filter((v): v is Pieza => v.tipo === 'capa' || v.tipo === 'texto')
                  const cajas = piezas.map((p) => ({ pieza: p, caja: cajaDePieza(p) })).filter((x): x is { pieza: Pieza; caja: Caja } => x.caja !== null)
                  const nueva = moverPiezas(timeline, alinearPiezas(cajas, como), tiempo, medidas)
                  if (nueva !== timeline) historial.aplicar(nueva)
                }}
                varias
              />
            )}
            {onAnidar && varios.every((v) => v.tipo === 'clip') && clipsSeguidos(timeline, varios.map((v) => v.id)) && (
              <button
                className="btn small"
                disabled={anidando}
                onClick={() => onAnidar(varios.map((v) => v.id))}
                title="Junta estos clips en uno solo (como una secuencia anidada): le pones un color, una zona o una rampa a todos juntos. Se puede desanidar."
              >
                <Icon name="layers" size={14} /> {anidando ? 'Anidando…' : `Anidar los ${varios.length} en un clip`}
              </button>
            )}
          </div>
        ) : clipElegido ? (
          <>
            <span>
              <b>Clip {clipElegido.indice + 1}</b> de {lista.length} · fuente {tc(clipElegido.clip.entrada)} → {tc(clipElegido.clip.salida)} ·{' '}
              {(clipElegido.fin - clipElegido.inicio).toFixed(1)} s
            </span>
            <span className="tl-flex" />
            <label className="tl-check" title="Sin su sonido: solo aporta imagen">
              <input
                type="checkbox"
                checked={Boolean(clipElegido.clip.mudo)}
                onChange={(e) => historial.aplicar(silenciarClip(timeline, clipElegido.clip.id, e.target.checked))}
              />
              Sin sonido
            </label>
            {onCambiarArchivo && (
              <button className="btn small ghost" onClick={() => onCambiarArchivo(clipElegido.clip.id)} title="Pone otra foto u otro video en este mismo lugar">
                <Icon name="image" size={14} /> Cambiar archivo
              </button>
            )}
            <button className="btn small ghost" onClick={accionDuplicar}>
              <Icon name="copy" size={14} /> Duplicar
            </button>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Borrar
            </button>
            {onSepararAudio && conSonido(clipElegido.clip.fuente) && !clipElegido.clip.rampa && (() => {
              const suelto = (tl.sonidos ?? []).find((x) => x.deClip === clipElegido.clip.id)
              return suelto ? (
                <button className="btn small ghost" onClick={() => historial.aplicar(unirAudio(timeline, suelto.id))} title="El sonido separado vuelve al clip (el clip vuelve a sonar).">
                  <Icon name="music" size={14} /> Volver a unir el audio
                </button>
              ) : (
                <button
                  className="btn small ghost"
                  disabled={separando}
                  onClick={() => onSepararAudio(clipElegido.clip.id)}
                  title="Desvincula el sonido: pasa a la pista de sonidos y lo mueves o recortas aparte de la imagen (para que la voz entre antes o se quede después del corte)."
                >
                  <Icon name="music" size={14} /> {separando ? 'Separando…' : 'Separar audio'}
                </button>
              )
            })()}
            {clipElegido.clip.anidado && (
              <button
                className="btn small ghost"
                onClick={() => historial.aplicar(desanidarClip(timeline, clipElegido.clip.id))}
                title={`Vuelve a poner los ${clipElegido.clip.anidado.length} clips de dentro (lo que le hiciste al anidado se pierde)`}
              >
                <Icon name="layers" size={14} /> Desanidar ({clipElegido.clip.anidado.length})
              </button>
            )}
            {onEstabilizar && esVideo(clipElegido.clip.fuente) && (
              <button
                className="btn small ghost"
                disabled={Boolean(estabilizando)}
                onClick={() => onEstabilizar(clipElegido.clip.id)}
                title="Quita el temblor de la cámara (recorta un poco los bordes). Tarda más o menos lo que dura el clip; el original queda en la biblioteca."
              >
                <Icon name="velocidad" size={14} /> {estabilizando === clipElegido.clip.id ? 'Estabilizando…' : 'Estabilizar'}
              </button>
            )}
            {onSepararPersona && esVideo(clipElegido.clip.fuente) && (
              <button
                className="btn small ghost"
                disabled={Boolean(separandoPersona)}
                onClick={() => onSepararPersona(clipElegido.clip.id)}
                title="Separa a la persona del fondo y la pone encima del clip: así un texto «detrás», un título o un logo se ven por detrás de ella, o le cambias o desenfocas el fondo. Tarda unos 10 segundos por cada segundo del clip."
              >
                <Icon name="seleccion" size={14} />{' '}
                {separandoPersona?.clip === clipElegido.clip.id
                  ? `Separando a la persona… ${Math.round(separandoPersona.pct * 100)} %`
                  : (tl.capas ?? []).some((x) => x.persona?.clip === clipElegido.clip.id)
                    ? 'Volver a separar a la persona'
                    : 'Separar a la persona'}
              </button>
            )}
            {onRecortarObjeto && esVideo(clipElegido.clip.fuente) && clipElegido.clip.zonas?.some((x) => x.modo === 'recortar') && (
              <button
                className="btn small ghost"
                disabled={Boolean(separandoPersona)}
                onClick={() => onRecortarObjeto(clipElegido.clip.id)}
                title="Recorta con bordes finos el objeto que rodea la zona marcada en modo «Recortar» y lo sigue por todo el clip. Queda encima del clip, con transparencia: un texto «detrás» o algo en las pistas 1 y 2 se ve por detrás de él. Pon la zona sobre el objeto al EMPEZAR el clip. Tarda unos 0,4 segundos por cuadro."
              >
                <Icon name="seleccion" size={14} />{' '}
                {separandoPersona?.clip === clipElegido.clip.id
                  ? `Recortando… ${Math.round(separandoPersona.pct * 100)} %`
                  : (tl.capas ?? []).some((x) => x.roto?.clip === clipElegido.clip.id)
                    ? 'Volver a recortar lo marcado'
                    : 'Recortar lo marcado'}
              </button>
            )}
            {onCambiarCielo && esVideo(clipElegido.clip.fuente) && (
              <div className="ed-fila">
                <select value={cieloElegido} onChange={(e) => setCieloElegido(e.target.value)} aria-label="El cielo nuevo">
                  <option value="atardecer">Atardecer</option>
                  <option value="azul">Azul</option>
                  <option value="amanecer">Amanecer</option>
                  <option value="nublado">Nublado</option>
                  <option value="noche">Noche</option>
                </select>
                <button
                  className="btn small ghost"
                  disabled={Boolean(separandoPersona)}
                  onClick={() => onCambiarCielo(clipElegido.clip.id, cieloElegido)}
                  title="Busca el cielo de la toma (lo claro o azul que toca el borde de arriba) y lo cambia por otro. Sirve en exteriores con el cielo bien visible. Tarda unos 4 segundos por cada segundo del clip."
                >
                  <Icon name="seleccion" size={14} />{' '}
                  {separandoPersona?.clip === clipElegido.clip.id
                    ? `Trabajando… ${Math.round(separandoPersona.pct * 100)} %`
                    : (tl.capas ?? []).some((x) => x.cielo?.clip === clipElegido.clip.id)
                      ? 'Volver a cambiar el cielo'
                      : 'Cambiar el cielo'}
                </button>
              </div>
            )}
            {onBorrarObjeto && esVideo(clipElegido.clip.fuente) && clipElegido.clip.zonas?.some((x) => x.modo === 'borrar') && (
              <button
                className="btn small ghost"
                disabled={Boolean(separandoPersona)}
                onClick={() => onBorrarObjeto(clipElegido.clip.id)}
                title="Rellena con lo de alrededor la zona marcada en modo «Borrar» (un logo, una marca de agua, un cartel). Si el objeto se mueve, usa «Seguir» en la zona. Tarda unos 3 segundos por cada segundo del clip."
              >
                <Icon name="seleccion" size={14} />{' '}
                {separandoPersona?.clip === clipElegido.clip.id
                  ? `Borrando… ${Math.round(separandoPersona.pct * 100)} %`
                  : (tl.capas ?? []).some((x) => x.borrado?.clip === clipElegido.clip.id)
                    ? 'Volver a borrar lo marcado'
                    : 'Borrar lo marcado'}
              </button>
            )}
            <div className="tl-ajustes">
              <details className="ed-grupo" open={Boolean(clipElegido.clip.zonas?.length)}>
                <summary className="ed-seccion">
                  Tapar una zona
                  {(clipElegido.clip.zonas?.length ?? 0) < MAX_ZONAS && (
                    <button
                      className="ed-seccion-quitar"
                      title="Difumina o tapa en negro una parte del cuadro (una cara, una placa, un dato). Muévela con los controles."
                      onClick={(e) => {
                        e.preventDefault()
                        const nueva: ZonaTL = { x: 0.5, y: 0.5, ancho: 0.3, alto: 0.3, modo: 'desenfoque', fuerza: 0.6 }
                        historial.aplicar(cambiarZonas(timeline, clipElegido.clip.id, [...(clipElegido.clip.zonas ?? []), nueva]))
                        ;(e.currentTarget.closest('details') as HTMLDetailsElement | null)?.setAttribute('open', '')
                      }}
                    >
                      + Añadir
                    </button>
                  )}
                </summary>
                {!clipElegido.clip.zonas?.length && <p className="tl-dim">Para difuminar una cara, una placa o un dato, o taparlo en negro.</p>}
                {(clipElegido.clip.zonas ?? []).map((z, k) => {
                  /** Dónde está la zona en el cabezal (si sigue algo, el punto de su recorrido). */
                  const zonaEnCabezal = (x: ZonaTL) => {
                    const en = zonaEn(x, fuenteEnCabezal)
                    return { x: en.x, y: en.y }
                  }
                  const cambiar = (cambio: Partial<ZonaTL>, suave = false) => {
                    const zonas = (clipElegido.clip.zonas ?? []).map((x, j) => (j === k ? { ...x, ...cambio } : x))
                    const r = cambiarZonas(timeline, clipElegido.clip.id, zonas)
                    if (suave) deslizar(r)
                    else historial.aplicar(r)
                  }
                  return (
                    <div key={k} className="ed-zona">
                      <div className="ed-zona-cabeza">
                        <b>Zona {k + 1}</b>
                        <select value={z.modo} onChange={(e) => cambiar({ modo: e.target.value as ZonaTL['modo'] })} aria-label={`Cómo se tapa la zona ${k + 1}`}>
                          <option value="desenfoque">Difuminar</option>
                          <option value="negro">Negro</option>
                          <option value="borrar">Borrar (rellenar)</option>
                          <option value="recortar">Recortar (rotoscopia)</option>
                        </select>
                        <button
                          className="ed-seccion-quitar"
                          onClick={() => historial.aplicar(cambiarZonas(timeline, clipElegido.clip.id, (clipElegido.clip.zonas ?? []).filter((_, j) => j !== k)))}
                        >
                          Quitar
                        </button>
                      </div>
                      {seguirZona && esVideo(clipElegido.clip.fuente) && (
                        <div className="ed-zona-seguir">
                          {z.recorrido ? (
                            <>
                              <span className="tl-dim">Sigue lo que tapa ({z.recorrido.length} puntos).</span>
                              <button className="ed-seccion-quitar" onClick={() => cambiar({ recorrido: undefined, ...zonaEnCabezal(z) })}>
                                Dejarla quieta
                              </button>
                            </>
                          ) : null}
                          <button
                            className="btn small ghost"
                            disabled={siguiendo !== null}
                            title="Pon el cabezal donde la zona tapa bien lo que quieres (una cara) y Recorte la hace seguirlo por todo el clip."
                            onClick={async () => {
                              const c = clipElegido.clip
                              const base = zonaEnCabezal(z)
                              setSiguiendo({ clip: c.id, k })
                              setAvisoSeguir('')
                              try {
                                const r = await seguirZona(c.fuente, { desde: c.entrada, hasta: c.salida, en: fuenteEnCabezal, x: base.x, y: base.y, ancho: z.ancho, alto: z.alto })
                                const actual = timeline.clips.find((x) => x.id === c.id)
                                if (!actual?.zonas?.[k]) return
                                historial.aplicar(cambiarZonas(timeline, c.id, actual.zonas.map((x, j) => (j === k ? { ...x, recorrido: r.recorrido } : x))))
                                setAvisoSeguir(r.perdido > 0.2 ? `La perdí en el ${Math.round(r.perdido * 100)} % del clip: ahí se queda quieta. Revísala.` : 'Listo: la zona sigue lo que tapa.')
                              } catch (error) {
                                setAvisoSeguir(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
                              } finally {
                                setSiguiendo(null)
                              }
                            }}
                          >
                            {siguiendo?.clip === clipElegido.clip.id && siguiendo.k === k ? 'Siguiendo…' : z.recorrido ? 'Seguir de nuevo' : 'Seguir lo que tapa'}
                          </button>
                          {avisoSeguir && siguiendo === null && <span className="tl-dim">{avisoSeguir}</span>}
                        </div>
                      )}
                      {(
                        [
                          // Si sigue algo, su centro lo pone el recorrido: se mueve arrastrándola en el monitor.
                          ...(z.recorrido ? [] : ([['x', 'Centro ↔', 0, 1], ['y', 'Centro ↕', 0, 1]] as const)),
                          ['ancho', 'Ancho', 0.02, 1],
                          ['alto', 'Alto', 0.02, 1],
                          ...(z.modo === 'desenfoque' ? ([['fuerza', 'Fuerza', 0.1, 1]] as const) : [])
                        ] as const
                      ).map(([clave, nombre, min, max]) => (
                        <div key={clave} className="tl-ajuste aj">
                          <span>
                            {nombre}
                            <ValorArrastrable
                              nombre={nombre}
                              valor={z[clave]}
                              min={min}
                              max={max}
                              paso={0.005}
                              formato={(v) => `${Math.round(v * 100)} %`}
                              onEmpezar={empezarAjuste}
                              onCambio={(v) => cambiar({ [clave]: v }, true)}
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </details>
              {esVideo(clipElegido.clip.fuente) && (
                <>
                  <span className="ed-seccion">
                    Velocidad
                    {clipElegido.clip.rampa && (
                      <button className="ed-seccion-quitar" title="Quita la rampa: el clip vuelve a su velocidad fija" onClick={() => historial.aplicar(quitarClaveRampa(timeline, clipElegido.clip.id))}>
                        Quitar rampa
                      </button>
                    )}
                  </span>
                  {(() => {
                    // Rampa de velocidad: con ◆ la velocidad cambia a lo largo del clip (cámara lenta que entra y sale).
                    const rampa = clipElegido.clip.rampa ?? []
                    const aqui = rampa.find((x) => Math.abs(x.f - fuenteEnCabezal) < 0.034)
                    const v = rampa.length ? velocidadEnFuente(clipElegido.clip, fuenteEnCabezal) : velocidadDe(clipElegido.clip)
                    return (
                      <>
                      <div
                        className={`tl-ajuste aj ${rampa.length ? 'con-claves' : ''}`}
                        title={
                          rampa.length
                            ? 'Rampa de velocidad: el valor es el del cabezal. Mueve el cabezal y cambia la velocidad para poner otra clave. El sonido del clip se calla.'
                            : 'Cámara lenta o rápida. El clip dura más o menos, y lo que viene después se corre.'
                        }
                      >
                        <span>
                          <span className="tl-ajuste-nombre">
                            Velocidad
                            <span className="ed-claves" onClick={(e) => e.preventDefault()}>
                              <button
                                className={`ed-clave ${aqui ? 'is-on' : rampa.length ? 'is-animado' : ''}`}
                                aria-pressed={Boolean(aqui)}
                                aria-label={aqui ? 'Quitar la clave de velocidad' : 'Poner una clave de velocidad'}
                                title={
                                  aqui
                                    ? 'Quitar esta clave de la rampa'
                                    : 'Rampa de velocidad: pone una clave en el cabezal. Mueve el cabezal, cambia la velocidad y el clip acelera o frena suave entre las claves.'
                                }
                                onClick={() =>
                                  historial.aplicar(
                                    aqui
                                      ? quitarClaveRampa(timeline, clipElegido.clip.id, aqui.f)
                                      : ponerClaveRampa(timeline, clipElegido.clip.id, fuenteEnCabezal, v)
                                  )
                                }
                              >
                                ◆
                              </button>
                            </span>
                          </span>
                          <ValorArrastrable
                            nombre="Velocidad"
                            valor={v}
                            min={LIMITES_VELOCIDAD[0]}
                            max={LIMITES_VELOCIDAD[1]}
                            paso={0.05}
                            formato={(x) => `${x.toFixed(2).replace(/\.?0+$/, '')}×`}
                            porDefecto={rampa.length ? undefined : 1}
                            onEmpezar={empezarAjuste}
                            onCambio={(x) =>
                              deslizar(
                                rampa.length
                                  ? ponerClaveRampa(timeline, clipElegido.clip.id, fuenteEnCabezal, x)
                                  : cambiarVelocidad(timeline, clipElegido.clip.id, x)
                              )
                            }
                          />
                        </span>
                      </div>
                      {rampa.length > 0 && (
                        <CarrilClaves
                          claves={rampa}
                          desde={clipElegido.clip.entrada}
                          hasta={clipElegido.clip.salida}
                          cabezal={fuenteEnCabezal}
                          nombre="Velocidad"
                          onIr={(f) => onBuscar(clipElegido.inicio + clipEnFuente(clipElegido.clip, f))}
                          onEmpezar={empezarAjuste}
                          onMover={(de, a) => historial.aplicar(moverClaveRampa(timeline, clipElegido.clip.id, de, a))}
                          onQuitar={(f) => historial.aplicar(quitarClaveRampa(timeline, clipElegido.clip.id, f))}
                        />
                      )}
                      </>
                    )
                  })()}
                  {!clipElegido.clip.rampa && <div className="ed-opciones">
                    {[0.25, 0.5, 1, 1.5, 2, 4].map((v) => (
                      <button
                        key={v}
                        className={`chip ${Math.abs(velocidadDe(clipElegido.clip) - v) < 0.005 ? 'is-active' : ''}`}
                        onClick={() => historial.aplicar(cambiarVelocidad(timeline, clipElegido.clip.id, v))}
                      >
                        {v}×
                      </button>
                    ))}
                  </div>}
                </>
              )}
              {esVideo(clipElegido.clip.fuente) && !clipElegido.clip.mudo && (
                <>
                  <span className="ed-seccion">
                    Sonido
                    {clipElegido.clip.sonido && (
                      <button className="btn small ghost" title="Deja el sonido como viene" onClick={() => historial.aplicar(ajustarSonidoClip(timeline, clipElegido.clip.id, { volumen: 1, entra: 0, sale: 0, limpio: 0, realce: 0, graves: 0, medios: 0, agudos: 0, comprimir: 0 }))}>
                        Restablecer
                      </button>
                    )}
                  </span>
                  {(
                    [
                      ['volumen', 'Volumen', 0, 1.5, 0.01, (v: number) => `${Math.round(v * 100)} %`, 'Más de 100 % solo se oye en el video exportado'],
                      ['entra', 'Entra fundiéndose', 0, Math.min(5, clipElegido.fin - clipElegido.inicio), 0.05, (v: number) => (v ? `${v.toFixed(1)} s` : 'no'), 'El sonido sube desde el silencio al empezar el clip'],
                      ['sale', 'Sale fundiéndose', 0, Math.min(5, clipElegido.fin - clipElegido.inicio), 0.05, (v: number) => (v ? `${v.toFixed(1)} s` : 'no'), 'El sonido baja al silencio al acabar el clip'],
                      ['limpio', 'Quitar ruido de fondo', 0, 1, 0.05, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no'), 'Quita el zumbido, el aire o el siseo. Se oye en el video exportado, no en el monitor'],
                      ['realce', 'Mejorar voz', 0, 1, 0.05, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no'), 'Más clara y pareja: quita los graves que retumban, empareja lo fuerte y lo suave y le da presencia. Se oye en el monitor y en el video exportado'],
                      ['graves', 'Graves', -12, 12, 0.5, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB` : '0'), 'Ecualizador · los sonidos bajos (120 Hz): el cuerpo de la voz, el retumbe'],
                      ['medios', 'Medios', -12, 12, 0.5, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB` : '0'), 'Ecualizador · la parte central (1 kHz): la voz más presente, o menos nasal si se baja'],
                      ['agudos', 'Agudos', -12, 12, 0.5, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} dB` : '0'), 'Ecualizador · los sonidos altos (8 kHz): el brillo; si silba en las eses, bájalo'],
                      ['comprimir', 'Compresor', 0, 1, 0.05, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no'), 'Empareja lo fuerte y lo suave: la voz se entiende igual en todo el clip. Se oye en el monitor y en el video exportado']
                    ] as const
                  ).map(([clave, nombre, min, max, paso, formato, ayuda]) => {
                    // El volumen se anima con fotogramas clave (◆), como el de Premiere.
                    const claves = clave === 'volumen' ? (clipElegido.clip.clavesVolumen ?? []) : []
                    const aqui = claves.find((x) => Math.abs(x.f - fuenteEnCabezal) < 0.034)
                    const valor = claves.length ? valorClave(claves, fuenteEnCabezal) : sonidoDe(clipElegido.clip)[clave]
                    return (
                      <Fragment key={clave}>
                      <div className={`tl-ajuste aj en-linea ${claves.length ? 'con-claves' : ''}`} title={ayuda}>
                        <span>
                          <span className="tl-ajuste-nombre">
                            {nombre}
                            {clave === 'volumen' && (
                              <span className="ed-claves" onClick={(e) => e.preventDefault()}>
                                <button
                                  className={`ed-clave ${aqui ? 'is-on' : claves.length ? 'is-animado' : ''}`}
                                  aria-pressed={Boolean(aqui)}
                                  aria-label={aqui ? 'Quitar la clave de volumen' : 'Poner una clave de volumen'}
                                  title={
                                    aqui
                                      ? 'Quitar este fotograma clave del volumen'
                                      : 'Animar el volumen: pone una clave en el cabezal. Mueve el cabezal, cambia el volumen y sube o baja solo (para bajar la música de un clip bajo una frase, por ejemplo).'
                                  }
                                  onClick={() =>
                                    historial.aplicar(
                                      aqui
                                        ? quitarClaveVolumen(timeline, clipElegido.clip.id, aqui.f)
                                        : ponerClaveVolumen(timeline, clipElegido.clip.id, fuenteEnCabezal, valor)
                                    )
                                  }
                                >
                                  ◆
                                </button>
                              </span>
                            )}
                          </span>
                          <ValorArrastrable
                            nombre={nombre}
                            valor={valor}
                            min={min}
                            max={max}
                            paso={paso}
                            formato={formato}
                            porDefecto={claves.length ? undefined : clave === 'volumen' ? 1 : 0}
                            onEmpezar={empezarAjuste}
                            onCambio={(v) =>
                              deslizar(
                                claves.length
                                  ? ponerClaveVolumen(timeline, clipElegido.clip.id, fuenteEnCabezal, v)
                                  : ajustarSonidoClip(timeline, clipElegido.clip.id, { [clave]: v })
                              )
                            }
                          />
                        </span>
                      </div>
                      {claves.length > 0 && (
                        <CarrilClaves
                          claves={claves}
                          desde={clipElegido.clip.entrada}
                          hasta={clipElegido.clip.salida}
                          cabezal={fuenteEnCabezal}
                          nombre={nombre}
                          onIr={(f) => onBuscar(clipElegido.inicio + clipEnFuente(clipElegido.clip, f))}
                          onEmpezar={empezarAjuste}
                          onMover={(de, a) => historial.aplicar(moverClaveVolumen(timeline, clipElegido.clip.id, de, a))}
                          onQuitar={(f) => historial.aplicar(quitarClaveVolumen(timeline, clipElegido.clip.id, f))}
                        />
                      )}
                      </Fragment>
                    )
                  })}
                </>
              )}
              {(
                [
                  [
                    'Encuadre',
                    [
                      ['zoom', 'Zoom', 1, 2, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['cx', 'Centro ↔', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['cy', 'Centro ↕', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`]
                    ]
                  ],
                  [
                    'Color',
                    [
                      ['exposicion', 'Exposición', -2, 2, 0.05, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}` : '0')],
                      ['contraste', 'Contraste', 0.5, 1.8, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['altas', 'Altas luces', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['sombras', 'Sombras', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['blancos', 'Blancos', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['negros', 'Negros', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['saturacion', 'Saturación', 0, 2, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['brillo', 'Brillo', -0.3, 0.3, 0.01, (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`]
                    ]
                  ],
                  [
                    'Balance de blancos',
                    [
                      ['temperatura', 'Temperatura', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? 'cálido +' : 'frío −'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['tinte', 'Tinte', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? 'magenta +' : 'verde −'}${Math.round(Math.abs(v) * 100)}` : '0')]
                    ]
                  ],
                  [
                    'Color por zonas',
                    [
                      ['zonaMatiz', 'Color elegido', 0, 360, 1, (v: number) => `${nombreMatiz(v)} · ${Math.round(v)}°`],
                      ['zonaAncho', 'Cuánto color entra', 5, 90, 1, (v: number) => `±${Math.round(v)}°`],
                      ['zonaSuave', 'Borde suave', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['zonaGiro', 'Cambiar el tono', -180, 180, 1, (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}°` : 'no')],
                      ['zonaSat', 'Saturación', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')],
                      ['zonaLuz', 'Luz', -1, 1, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}` : '0')]
                    ]
                  ],
                  [
                    'Efectos',
                    [
                      ['desenfoque', 'Desenfoque', 0, 1, 0.01, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['sepia', 'Sepia', 0, 1, 0.01, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['tono', 'Tono', -180, 180, 1, (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}°` : 'no')],
                      ['invertir', 'Negativo', 0, 1, 1, (v: number) => (v >= 0.5 ? 'sí' : 'no')]
                    ]
                  ],
                  [
                    'Transformar',
                    [
                      ['escala', 'Escala', 0.1, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                      ['posx', 'Posición ↔', -1, 1, 0.005, (v: number) => (v ? `${v > 0 ? '→' : '←'} ${Math.round(Math.abs(v) * 100)} %` : 'centro')],
                      ['posy', 'Posición ↕', -1, 1, 0.005, (v: number) => (v ? `${v > 0 ? '↓' : '↑'} ${Math.round(Math.abs(v) * 100)} %` : 'centro')],
                      ['giro', 'Rotación', -180, 180, 0.5, (v: number) => (v ? `${v > 0 ? '+' : ''}${v.toFixed(1)}°` : '0°')]
                    ]
                  ],
                  [
                    'Recortar',
                    [
                      ['recorteIzq', 'Izquierda', 0, 0.45, 0.005, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['recorteDer', 'Derecha', 0, 0.45, 0.005, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['recorteArr', 'Arriba', 0, 0.45, 0.005, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['recorteAba', 'Abajo', 0, 0.45, 0.005, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')]
                    ]
                  ],
                  [
                    'Cámara',
                    [
                      ['acercar', 'Acercar / alejar', -0.3, 0.3, 0.01, (v: number) => (v ? `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} %` : 'no')],
                      ['panx', 'Paneo ↔', -0.5, 0.5, 0.01, (v: number) => (v ? `${v > 0 ? '→' : '←'} ${Math.round(Math.abs(v) * 100)} %` : 'no')],
                      ['pany', 'Paneo ↕', -0.5, 0.5, 0.01, (v: number) => (v ? `${v > 0 ? '↓' : '↑'} ${Math.round(Math.abs(v) * 100)} %` : 'no')],
                      ['temblor', 'Cámara en mano', 0, 1, 0.05, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['campo', 'Profundidad de campo', 0, 1, 0.05, (v: number) => (v ? `${Math.round(v * 100)} %` : 'no')],
                      ['foco', 'Foco', 0, 1, 0.05, (v: number) => (v < 0.15 ? 'fondo' : v > 0.85 ? 'muy cerca' : `${Math.round(v * 100)} %`)]
                    ]
                  ]
                ] as const
              ).map(([grupo, filas]) => (
                <details key={grupo} className="ed-grupo" open={grupo === 'Encuadre' || grupo === 'Color' || filas.some(([clave]) => clipElegido.clip.ajustes?.[clave] !== undefined || Boolean((clipElegido.clip.claves as Record<string, unknown> | undefined)?.[clave]))}>
                  <summary className="ed-seccion">
                    {grupo}
                    {grupo !== 'Encuadre' && grupo !== 'Cámara' && filas.some(([clave]) => clipElegido.clip.ajustes?.[clave] !== undefined) && (
                      <button
                        className="ed-seccion-quitar"
                        title={`Dejar «${grupo}» como viene en este clip`}
                        onClick={(e) => {
                          e.preventDefault()
                          historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, Object.fromEntries(filas.map(([clave]) => [clave, LIMITES_AJUSTES[clave as keyof AjustesClip][2]]))))
                        }}
                      >
                        Quitar
                      </button>
                    )}
                  </summary>
                  {filas.map(([clave, nombre, min, max, paso, formato]) => {
                const valor = ajustesEn(clipElegido.clip, fuenteEnCabezal)[clave]
                const lista = esClave(clave) ? (clipElegido.clip.claves?.[clave] ?? []) : []
                const aqui = esClave(clave) ? claveEn(clipElegido.clip, clave, fuenteEnCabezal) : undefined
                // A qué segundo de la timeline cae una clave (para saltar a ella).
                const aTimeline = (f: number) => clipElegido.inicio + clipEnFuente(clipElegido.clip, f)
                const anterior = [...lista].reverse().find((x) => x.f < fuenteEnCabezal - 0.02)
                const siguiente = lista.find((x) => x.f > fuenteEnCabezal + 0.02)
                return (
                  <Fragment key={clave}>
                  <div className={`tl-ajuste aj ${lista.length ? 'con-claves' : ''}`}>
                    <span>
                      <span className="tl-ajuste-nombre">
                        {nombre}
                        {esClave(clave) && (
                          <span className="ed-claves" onClick={(e) => e.preventDefault()}>
                            {lista.length > 0 && (
                              <button className="ed-clave-ir" disabled={!anterior} title="Ir a la clave anterior" aria-label={`Clave anterior de ${nombre}`} onClick={() => anterior && onBuscar(aTimeline(anterior.f))}>
                                ‹
                              </button>
                            )}
                            <button
                              className={`ed-clave ${aqui ? 'is-on' : lista.length ? 'is-animado' : ''}`}
                              title={
                                aqui
                                  ? `Quitar este fotograma clave de ${nombre}`
                                  : lista.length
                                    ? `Añadir un fotograma clave de ${nombre} en el cabezal`
                                    : `Animar ${nombre}: pone un fotograma clave en el cabezal. Mueve el cabezal, cambia el valor y se anima solo.`
                              }
                              aria-label={aqui ? `Quitar la clave de ${nombre}` : `Poner una clave de ${nombre}`}
                              aria-pressed={Boolean(aqui)}
                              onClick={() =>
                                historial.aplicar(
                                  aqui
                                    ? quitarClave(timeline, clipElegido.clip.id, clave, aqui.f)
                                    : ponerClave(timeline, clipElegido.clip.id, clave, fuenteEnCabezal, valor)
                                )
                              }
                            >
                              ◆
                            </button>
                            {lista.length > 0 && (
                              <button className="ed-clave-ir" disabled={!siguiente} title="Ir a la clave siguiente" aria-label={`Clave siguiente de ${nombre}`} onClick={() => siguiente && onBuscar(aTimeline(siguiente.f))}>
                                ›
                              </button>
                            )}
                          </span>
                        )}
                      </span>
                      <ValorArrastrable
                        nombre={nombre}
                        valor={valor}
                        min={min}
                        max={max}
                        paso={paso}
                        formato={formato}
                        porDefecto={lista.length ? undefined : LIMITES_AJUSTES[clave as keyof AjustesClip][2]}
                        onEmpezar={empezarAjuste}
                        onCambio={(v) => ajustarImagen({ [clave]: v })}
                      />
                    </span>
                  </div>
                  {esClave(clave) && lista.length > 0 && (
                    <CarrilClaves
                      claves={lista}
                      desde={clipElegido.clip.entrada}
                      hasta={clipElegido.clip.salida}
                      cabezal={fuenteEnCabezal}
                      nombre={nombre}
                      onIr={(f) => onBuscar(aTimeline(f))}
                      onEmpezar={empezarAjuste}
                      onMover={(de, a) => historial.aplicar(moverClave(timeline, clipElegido.clip.id, clave, de, a))}
                      onQuitar={(f) => historial.aplicar(quitarClave(timeline, clipElegido.clip.id, clave, f))}
                    />
                  )}
                  </Fragment>
                )
              })}
                </details>
              ))}
              <span className="ed-seccion">
                LUT
                {clipElegido.clip.lut && (
                  <button className="ed-seccion-quitar" title="Quitar el LUT de este clip" onClick={() => historial.aplicar(ponerLut(timeline, clipElegido.clip.id, undefined))}>
                    Quitar
                  </button>
                )}
              </span>
              {clipElegido.clip.lut ? (
                <>
                  <span className="ed-lut-nombre" title={clipElegido.clip.lut.archivo}>
                    {clipElegido.clip.lut.nombre}
                  </span>
                  <div className="tl-ajuste aj">
                    <span>
                      Intensidad
                      <ValorArrastrable
                        nombre="Intensidad del LUT"
                        valor={clipElegido.clip.lut.intensidad}
                        min={0}
                        max={1}
                        paso={0.01}
                        formato={(v) => `${Math.round(v * 100)} %`}
                        porDefecto={1}
                        onEmpezar={empezarAjuste}
                        onCambio={(v) => deslizar(ponerLut(timeline, clipElegido.clip.id, { ...clipElegido.clip.lut!, intensidad: v }))}
                      />
                    </span>
                  </div>
                  {timeline.clips.length > 1 && (
                    <button className="btn small ghost" onClick={() => historial.aplicar(ponerLut(timeline, null, clipElegido.clip.lut))} title="El mismo LUT y la misma intensidad en todos los clips">
                      Ponerlo en todos los clips
                    </button>
                  )}
                </>
              ) : (
                <p className="tl-dim">Un look de cine o el de tu cámara en formato .cube (el de Premiere y DaVinci).</p>
              )}
              {importarLut && (
                <button
                  className="btn small"
                  onClick={async () => {
                    const id = clipElegido.clip.id
                    const lut = await importarLut()
                    if (lut) historial.aplicar(ponerLut(timeline, id, lut))
                  }}
                >
                  {clipElegido.clip.lut ? 'Cambiar el LUT…' : 'Cargar un LUT (.cube)…'}
                </button>
              )}
              <span className="ed-seccion">
                Curvas
                {clipElegido.clip.curvas && (
                  <button className="ed-seccion-quitar" title="Quitar todas las curvas de este clip" onClick={() => historial.aplicar(CANALES_CURVA.reduce((tl, c) => cambiarCurva(tl, clipElegido.clip.id, c.id, undefined), timeline))}>
                    Quitar
                  </button>
                )}
              </span>
              <EditorCurvas
                curvas={clipElegido.clip.curvas}
                onEmpezar={empezarAjuste}
                onCambio={(canal, puntos) => deslizar(cambiarCurva(timeline, clipElegido.clip.id, canal, puntos))}
              />
              <select
                value=""
                title="Un movimiento de cámara para el clip; con capas con profundidad encima se ve en 3D"
                onChange={(e) => {
                  const toma = TOMAS_CAMARA.find((x) => x.id === e.target.value)
                  if (toma) historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, toma.ajustes))
                }}
              >
                <option value="">Toma de cámara…</option>
                {TOMAS_CAMARA.map((x) => (
                  <option key={x.id} value={x.id} title={x.para}>
                    {x.nombre}
                  </option>
                ))}
              </select>
              <button
                className="btn small ghost"
                onClick={() => historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, { saturacion: 0, contraste: 1.15 }))}
              >
                B/N
              </button>
              <button
                className="btn small ghost"
                disabled={!clipElegido.clip.ajustes}
                onClick={() =>
                  historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, { zoom: 1, brillo: 0, contraste: 1, saturacion: 1, cx: 0.5, cy: 0.5, acercar: 0, panx: 0, pany: 0, temblor: 0, campo: 0, foco: 0.5 }))
                }
              >
                Restablecer
              </button>
              {clipElegido.indice > 0 && (
                <details className="ed-grupo" open>
                  <summary className="ed-seccion">
                    Transición de entrada
                    {clipElegido.clip.fundido ? (
                      <button
                        className="ed-seccion-quitar"
                        title="Sin transición: corte seco"
                        onClick={(e) => {
                          e.preventDefault()
                          historial.aplicar(fundirClip(timeline, clipElegido.clip.id, 0))
                        }}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </summary>
                  <div className="ed-transicion">
                    <span className="ed-transicion-muestra" onPointerEnter={() => setMuestraViva(clipElegido.clip.transicion ?? 'fundido')} onPointerLeave={() => setMuestraViva(null)}>
                      {clipElegido.clip.fundido ? <MuestraTransicion tipo={clipElegido.clip.transicion ?? 'fundido'} viva={muestraViva === (clipElegido.clip.transicion ?? 'fundido')} /> : <span className="ed-transicion-corte">Corte</span>}
                    </span>
                    <select
                      className="tl-transicion"
                      title="Cómo entra este clip sobre el anterior"
                      aria-label="Transición de entrada"
                      value={clipElegido.clip.fundido ? (clipElegido.clip.transicion ?? 'fundido') : 'corte'}
                      onChange={(e) => {
                        const v = e.target.value
                        historial.aplicar(
                          v === 'corte'
                            ? fundirClip(timeline, clipElegido.clip.id, 0)
                            : fundirClip(timeline, clipElegido.clip.id, Math.max(clipElegido.clip.fundido ?? 0, 0.45), v as TransicionClip)
                        )
                      }}
                    >
                      <option value="corte">Corte seco</option>
                      {GRUPOS_TRANSICION.map((g) => (
                        <optgroup key={g} label={g}>
                          {TRANSICIONES.filter((x) => x.grupo === g).map((x) => (
                            <option key={x.id} value={x.id} title={x.para}>
                              {x.nombre}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  {clipElegido.clip.fundido ? (
                    <div className="tl-ajuste aj">
                      <span>
                        Duración
                        <ValorArrastrable
                          nombre="Duración de la transición"
                          valor={clipElegido.clip.fundido}
                          min={0.1}
                          max={Math.min(MAX_FUNDIDO, (clipElegido.fin - clipElegido.inicio) / 2)}
                          paso={1 / 30}
                          formato={(v) => `${v.toFixed(2).replace('.', ',')} s`}
                          porDefecto={0.45}
                          onEmpezar={empezarAjuste}
                          onCambio={(v) => deslizar(fundirClip(timeline, clipElegido.clip.id, v))}
                        />
                      </span>
                    </div>
                  ) : null}
                  {clipElegido.clip.fundido && timeline.clips.length > 2 ? (
                    <button
                      className="btn small ghost"
                      title="La misma transición y la misma duración en todos los cortes"
                      onClick={() => historial.aplicar(fundirClip(timeline, null, clipElegido.clip.fundido!, clipElegido.clip.transicion ?? 'fundido'))}
                    >
                      Ponerla en todos los cortes
                    </button>
                  ) : null}
                </details>
              )}
            </div>
          </>
        ) : capaElegida ? (
          <>
            <Icon name="layers" size={14} />
            <b className="tl-musica-nombre">{capaElegida.grafico ? resumenGrafico(capaElegida.grafico) : nombreDe ? nombreDe(capaElegida.fuente) : 'Capa'}</b>
            {capaElegida.grafico && <p className="tl-dim">Sus textos, letra y colores se cambian en la pestaña «Gráficos» (a la izquierda).</p>}
            <label className="ed-campo"><span>Entrada</span><select
              value={capaElegida.entrada ?? 'corte'}
              title="Cómo aparece"
              onChange={(e) => {
                const v = e.target.value
                historial.aplicar(cambiarCapa(timeline, capaElegida.id, { entrada: v === 'corte' ? undefined : (v as EntradaCapa) }, medidas))
              }}
            >
              <option value="pop">Entra con pop</option>
              <option value="fundido">Entra fundiéndose</option>
              <option value="izquierda">Entra desde la izquierda</option>
              <option value="derecha">Entra desde la derecha</option>
              <option value="arriba">Baja desde arriba</option>
              <option value="abajo">Sube desde abajo</option>
              <option value="corte">Aparece de golpe</option>
            </select></label>
            {capaElegida.entrada && (
              <DuracionAnimacion
                nombre="Dura la entrada"
                valor={durEntradaCapa(capaElegida)}
                onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { durEntrada: v }, medidas))}
                empezar={empezarAjuste}
              />
            )}
            <label className="ed-campo"><span>Salida</span><select
              value={capaElegida.salida ?? 'corte'}
              title="Cómo se va al terminar"
              onChange={(e) => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { salida: e.target.value === 'corte' ? undefined : (e.target.value as SalidaCapa) }, medidas))}
            >
              <option value="corte">Se va de golpe</option>
              <option value="fundido">Se funde</option>
              <option value="encoger">Se encoge</option>
              <option value="izquierda">Sale por la izquierda</option>
              <option value="derecha">Sale por la derecha</option>
              <option value="arriba">Sale por arriba</option>
              <option value="abajo">Sale por abajo</option>
            </select></label>
            {capaElegida.salida && (
              <DuracionAnimacion
                nombre="Dura la salida"
                valor={durSalidaCapa(capaElegida)}
                onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { durSalida: v }, medidas))}
                empezar={empezarAjuste}
              />
            )}
            <label className="ed-campo">
              <span>Fusión</span>
              <select
                value={capaElegida.fusion ?? 'normal'}
                title="Cómo se mezcla con lo de debajo, como los modos de fusión de Premiere"
                onChange={(e) => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { fusion: e.target.value === 'normal' ? undefined : (e.target.value as ModoFusion) }, medidas))}
              >
                <option value="normal">Normal</option>
                {MODOS_FUSION.map((m) => (
                  <option key={m.id} value={m.id} title={`Para ${m.para}`}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            </label>
            {seguirZona && (
              <div className="ed-seguir">
                <span className="ed-seccion">Seguir algo del video</span>
                {capaElegida.sigue ? (
                  <>
                    <p className="tl-dim">La capa sigue lo que tenía debajo. Para que vaya más arriba o más abajo, arrástrala en el monitor.</p>
                    <button className="btn small ghost" onClick={() => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { sigue: undefined }, medidas))}>
                      Dejar de seguir
                    </button>
                  </>
                ) : (
                  <p className="tl-dim">Pon el cabezal donde se ve bien lo que quieres seguir, coloca la capa encima y toca el botón: irá pegada a eso aunque se mueva.</p>
                )}
                <button
                  className="btn small"
                  disabled={capaSiguiendo !== null}
                  onClick={async () => {
                    const c = capaElegida
                    const bajo = ubicar(timeline, Math.min(c.inicio + c.duracion, Math.max(c.inicio, tiempo)))
                    if (!bajo || !esVideo(bajo.clip.fuente)) {
                      setAvisoCapa('Debajo de la capa, en el cabezal, tiene que haber un clip de video.')
                      return
                    }
                    const dt = Math.min(c.duracion, Math.max(0, tiempo - c.inicio))
                    const donde = estadoCapa({ ...c, sigue: undefined }, dt, false)
                    setCapaSiguiendo(c.id)
                    setAvisoCapa('')
                    try {
                      const r = await seguirZona(bajo.clip.fuente, {
                        desde: bajo.clip.entrada,
                        hasta: bajo.clip.salida,
                        en: bajo.tFuente,
                        x: Math.min(0.95, Math.max(0.05, donde.x)),
                        y: Math.min(0.95, Math.max(0.05, donde.y)),
                        ancho: 0.12,
                        alto: 0.12
                      })
                      const nueva = seguirConCapa(timeline, c.id, r.recorrido, { entrada: bajo.clip.entrada, inicio: bajo.inicio, velocidad: bajo.clip.velocidad }, dt, medidas)
                      if (nueva === timeline) setAvisoCapa('No encontré qué seguir en el tramo de la capa.')
                      else {
                        historial.aplicar(nueva)
                        setAvisoCapa(r.perdido > 0.2 ? `Lo perdí en el ${Math.round(r.perdido * 100)} % del clip: ahí se queda quieta. Revísala.` : 'Listo: la capa sigue lo que tenía debajo.')
                      }
                    } catch (error) {
                      setAvisoCapa(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
                    } finally {
                      setCapaSiguiendo(null)
                    }
                  }}
                >
                  {capaSiguiendo === capaElegida.id ? 'Siguiendo…' : capaElegida.sigue ? 'Seguir de nuevo' : 'Seguir lo que tiene debajo'}
                </button>
                {avisoCapa && capaSiguiendo === null && <span className="tl-dim">{avisoCapa}</span>}
              </div>
            )}
            <label className="ed-campo"><span>Movimiento</span><select
              value={capaElegida.fin ? (MOVIMIENTOS_CAPA.find((m) => sinCambios(m.fin(capaElegida), capaElegida.fin!))?.id ?? 'propio') : 'quieta'}
              title="Cómo se mueve mientras está (paralaje, cruzar, subir…). Para afinar, arrastra en el monitor su silueta punteada: es dónde termina."
              onChange={(e) => {
                const v = e.target.value
                const m = MOVIMIENTOS_CAPA.find((x) => x.id === v)
                if (v === 'propio') return
                historial.aplicar(cambiarCapa(timeline, capaElegida.id, { fin: m ? m.fin(capaElegida) : undefined }, medidas))
              }}
            >
              <option value="quieta">Quieta</option>
              {MOVIMIENTOS_CAPA.map((m) => (
                <option key={m.id} value={m.id} title={m.para}>
                  {m.nombre}
                </option>
              ))}
              {capaElegida.fin && <option value="propio">Recorrido propio</option>}
            </select></label>
            <span className="ed-seccion">Fotogramas clave</span>
            <p className="tl-dim">
              Toca ◆ para animar ese ajuste: pon el cabezal en otro momento de la capa, cámbialo (aquí o arrastrándola en el monitor) y se mueve solo.
            </p>
            {(
              [
                ['ancho', 'Tamaño', 0.05, 2, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                ['x', 'Sitio ↔', capaElegida.claves?.x ? -0.5 : 0, capaElegida.claves?.x ? 1.5 : 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                ['y', 'Sitio ↕', capaElegida.claves?.y ? -0.5 : 0, capaElegida.claves?.y ? 1.5 : 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                ['opacidad', 'Opacidad', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                ['desenfoque', 'Desenfoque', 0, 1, 0.01, (v: number) => (v > 0.005 ? `${Math.round(v * 100)} %` : 'no')]
              ] as const
            ).map(([clave, nombre, min, max, paso, formato]) => {
              const dt = Math.min(capaElegida.duracion, Math.max(0, tiempo - capaElegida.inicio))
              const lista = capaElegida.claves?.[clave] ?? []
              const valor = estadoCapa(capaElegida, dt, false)[clave === 'opacidad' ? 'opacidad' : clave]
              return (
                <Fragment key={clave}>
                <div className={`tl-ajuste aj en-linea ${lista.length ? 'con-claves' : ''}`}>
                  <span>
                    <span className="tl-ajuste-nombre">
                      {nombre}
                      <RomboCapa clave={clave} nombre={nombre} dt={dt} valor={valor} />
                    </span>
                    <ValorArrastrable
                      nombre={nombre}
                      valor={valor}
                      min={min}
                      max={max}
                      paso={paso}
                      formato={formato}
                      porDefecto={lista.length ? undefined : clave === 'opacidad' ? 1 : clave === 'desenfoque' ? 0 : undefined}
                      onEmpezar={empezarAjuste}
                      onCambio={(v) =>
                        deslizar(
                          lista.length || clave === 'opacidad'
                            ? ponerClaveCapa(timeline, capaElegida.id, clave, dt, v, medidas)
                            : cambiarCapa(timeline, capaElegida.id, { [clave]: v }, medidas)
                        )
                      }
                    />
                  </span>
                </div>
                {lista.length > 0 && (
                  <CarrilClaves
                    claves={lista}
                    desde={0}
                    hasta={capaElegida.duracion}
                    cabezal={dt}
                    nombre={nombre}
                    onIr={(f) => onBuscar(capaElegida.inicio + f)}
                    onEmpezar={empezarAjuste}
                    onMover={(de, a) => historial.aplicar(moverClaveCapa(timeline, capaElegida.id, clave, de, a, medidas))}
                    onQuitar={(f) => historial.aplicar(quitarClaveCapa(timeline, capaElegida.id, clave, f, medidas))}
                  />
                )}
                </Fragment>
              )
            })}
            {capaElegida.claves?.giro?.length ? (
              <>
              <div className="tl-ajuste aj en-linea con-claves">
                <span>
                  <span className="tl-ajuste-nombre">
                    Giro
                    <RomboCapa clave="giro" nombre="Giro" dt={Math.min(capaElegida.duracion, Math.max(0, tiempo - capaElegida.inicio))} valor={estadoCapa(capaElegida, Math.max(0, tiempo - capaElegida.inicio), false).giro} />
                  </span>
                  <ValorArrastrable
                    nombre="Giro"
                    valor={estadoCapa(capaElegida, Math.max(0, tiempo - capaElegida.inicio), false).giro}
                    min={-180}
                    max={180}
                    paso={1}
                    formato={(v) => `${Math.round(v)}°`}
                    onEmpezar={empezarAjuste}
                    onCambio={(v) => deslizar(ponerClaveCapa(timeline, capaElegida.id, 'giro', Math.min(capaElegida.duracion, Math.max(0, tiempo - capaElegida.inicio)), v, medidas))}
                  />
                </span>
              </div>
              <CarrilClaves
                claves={capaElegida.claves.giro}
                desde={0}
                hasta={capaElegida.duracion}
                cabezal={Math.min(capaElegida.duracion, Math.max(0, tiempo - capaElegida.inicio))}
                nombre="Giro"
                onIr={(f) => onBuscar(capaElegida.inicio + f)}
                onEmpezar={empezarAjuste}
                onMover={(de, a) => historial.aplicar(moverClaveCapa(timeline, capaElegida.id, 'giro', de, a, medidas))}
                onQuitar={(f) => historial.aplicar(quitarClaveCapa(timeline, capaElegida.id, 'giro', f, medidas))}
              />
              </>
            ) : null}
            {!capaElegida.claves?.giro && (
              [
                ['giro', capaElegida.fin ? 'Giro al empezar' : 'Giro', capaElegida.giro ?? 0],
                ...(capaElegida.fin ? ([['giroFin', 'Giro al terminar', capaElegida.fin.giro]] as const) : [])
              ] as const
            ).map(([clave, nombre, valor]) => (
              <div key={clave} className="tl-ajuste aj en-linea">
                <span>
                  <span className="tl-ajuste-nombre">
                    {nombre}
                    {clave === 'giro' && <RomboCapa clave="giro" nombre="Giro" dt={Math.min(capaElegida.duracion, Math.max(0, tiempo - capaElegida.inicio))} valor={valor} />}
                  </span>
                  <ValorArrastrable
                    nombre={nombre}
                    valor={valor}
                    min={-180}
                    max={180}
                    paso={1}
                    formato={(v) => `${Math.round(v)}°`}
                    porDefecto={0}
                    onEmpezar={empezarAjuste}
                    onCambio={(g) =>
                      deslizar(
                        cambiarCapa(timeline, capaElegida.id, clave === 'giro' ? { giro: g } : { fin: { ...capaElegida.fin!, giro: g } }, medidas)
                      )
                    }
                  />
                </span>
              </div>
            ))}
            <div className="ed-opciones" role="group" aria-label="Voltear y recortar">
              <button className="chip" onClick={() => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { x: 0.5, y: 0.5 }, medidas))}>
                Centrar
              </button>
              <button
                className={`chip ${capaElegida.voltearH ? 'is-on' : ''}`}
                aria-pressed={capaElegida.voltearH === true}
                title="Voltear de izquierda a derecha (espejo)"
                onClick={() => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { voltearH: !capaElegida.voltearH }, medidas))}
              >
                Voltear ↔
              </button>
              <button
                className={`chip ${capaElegida.voltearV ? 'is-on' : ''}`}
                aria-pressed={capaElegida.voltearV === true}
                title="Voltear de arriba abajo"
                onClick={() => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { voltearV: !capaElegida.voltearV }, medidas))}
              >
                Voltear ↕
              </button>
              {capaElegida.recorte && (
                <button className="chip" title="Vuelve a verse entera" onClick={() => historial.aplicar(cambiarCapa(timeline, capaElegida.id, { recorte: undefined }, medidas))}>
                  Quitar el recorte
                </button>
              )}
            </div>
            <span className="ed-seccion">Esquinas, borde y sombra</span>
            <div className="tl-ajuste aj en-linea" title="0: rectas · 1: redonda del todo (un círculo o una píldora)">
              <span>
                Esquinas
                <ValorArrastrable
                  nombre="Esquinas"
                  valor={capaElegida.redondeo ?? 0}
                  min={0}
                  max={1}
                  paso={0.01}
                  formato={(v) => (v ? `${Math.round(v * 100)} %` : 'rectas')}
                  porDefecto={0}
                  onEmpezar={empezarAjuste}
                  onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { redondeo: v }, medidas))}
                />
              </span>
            </div>
            <div className="ed-fila-color">
              <div className="tl-ajuste aj en-linea" title="Un borde por dentro de lo que se ve">
                <span>
                  Borde
                  <ValorArrastrable
                    nombre="Borde"
                    valor={capaElegida.borde ?? 0}
                    min={0}
                    max={LIMITE_BORDE_CAPA}
                    paso={0.002}
                    formato={(v) => (v ? `${Math.round(v * 1000) / 10} %` : 'no')}
                    porDefecto={0}
                    onEmpezar={empezarAjuste}
                    onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { borde: v }, medidas))}
                  />
                </span>
              </div>
              <input
                type="color"
                className="tl-color"
                title="Color del borde"
                value={capaElegida.colorBorde ?? '#ffffff'}
                onPointerDown={empezarAjuste}
                onChange={(e) => deslizar(cambiarCapa(timeline, capaElegida.id, { colorBorde: e.target.value, ...(capaElegida.borde ? {} : { borde: 0.02 }) }, medidas))}
              />
            </div>
            <div className="ed-fila-color">
              <div className="tl-ajuste aj en-linea" title="Una sombra debajo, abajo a la derecha">
                <span>
                  Sombra
                  <ValorArrastrable
                    nombre="Sombra"
                    valor={capaElegida.sombraCapa ?? 0}
                    min={0}
                    max={1}
                    paso={0.01}
                    formato={(v) => (v ? `${Math.round(v * 100)} %` : 'no')}
                    porDefecto={0}
                    onEmpezar={empezarAjuste}
                    onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { sombraCapa: v }, medidas))}
                  />
                </span>
              </div>
              <input
                type="color"
                className="tl-color"
                title="Color de la sombra"
                value={capaElegida.colorSombraCapa ?? '#000000'}
                onPointerDown={empezarAjuste}
                onChange={(e) => deslizar(cambiarCapa(timeline, capaElegida.id, { colorSombraCapa: e.target.value, ...(capaElegida.sombraCapa ? {} : { sombraCapa: 0.5 }) }, medidas))}
              />
            </div>
            <PanelAlinear
              onAlinear={(como) => {
                const caja = cajaDePieza({ tipo: 'capa', id: capaElegida.id })
                if (caja) historial.aplicar(moverPiezas(timeline, alinearPiezas([{ pieza: { tipo: 'capa', id: capaElegida.id }, caja }], como), tiempo, medidas))
              }}
            />
            <PanelOrden
              tipo="capa"
              x={capaElegida}
              hayEstilo={hayEstilo === 'capa'}
              onOrden={(como) => historial.aplicar(ordenarCapa(timeline, capaElegida.id, como, medidas))}
              onAlternar={(campo) => alternarEn('capa', capaElegida.id, campo)}
              onDuplicar={accionDuplicar}
              onCopiarEstilo={copiarEstilo}
              onPegarEstilo={pegarEstilo}
            />
            <span className="tl-dim">En el monitor: las esquinas cambian el tamaño, el tirador redondo la gira y los de los lados la recortan. Alt + flechas la mueven un poco.</span>
            <div
              className="tl-ajuste aj en-linea"
              title="Escena 2.5D: la capa sigue a la cámara del clip de debajo (zoom, acercar y paneo). Lejos se mueve con el fondo; cerca, mucho más: así se nota la distancia."
            >
              <span>
                Profundidad
                <ValorArrastrable
                  nombre="Profundidad"
                  valor={capaElegida.profundidad ?? -0.05}
                  min={-0.05}
                  max={1}
                  paso={0.05}
                  formato={(v) => (v < 0 ? 'fija' : v < 0.2 ? 'lejos' : v < 0.6 ? 'media' : 'cerca')}
                  porDefecto={-0.05}
                  onEmpezar={empezarAjuste}
                  onCambio={(v) => deslizar(cambiarCapa(timeline, capaElegida.id, { profundidad: v < 0 ? undefined : v }, medidas))}
                />
              </span>
            </div>
            {onAnimarCapa && (capaElegida.animada || medios?.find((m) => m.id === capaElegida.fuente)?.tipo === 'imagen') && (
              <label className="ed-campo"><span>Animación</span><select
                value={capaElegida.animada?.tipo ?? 'quieta'}
                disabled={quitandoFondo}
                title="Anima la imagen como en After Effects (sin gastar créditos): mejor con la imagen ya sin fondo"
                onChange={(e) => onAnimarCapa(capaElegida.id, e.target.value === 'quieta' ? null : (e.target.value as TipoAnimar))}
              >
                <option value="quieta">Imagen quieta</option>
                {ANIMAR_CAPA.map((a) => (
                  <option key={a.id} value={a.id} title={`Para ${a.para}`}>
                    {a.nombre}
                  </option>
                ))}
              </select></label>
            )}
            {onQuitarFondo && medios?.find((m) => m.id === capaElegida.fuente) && (
              <button
                className="btn small ghost"
                disabled={quitandoFondo}
                onClick={() => onQuitarFondo(capaElegida.id)}
                title={
                  medios?.find((m) => m.id === capaElegida.fuente)?.tipo === 'video'
                    ? 'Llave de color: quita el fondo verde de este video (croma) y lo deja transparente sobre lo de abajo. Tarda lo que dura el video.'
                    : 'Deja solo a la persona o al objeto. Un fondo liso sale al momento; con cualquier otra foto usa un modelo (la primera vez se baja: 178 MB).'
                }
              >
                {quitandoFondo ? 'Quitando el fondo…' : medios?.find((m) => m.id === capaElegida.fuente)?.tipo === 'video' ? 'Quitar fondo verde' : 'Quitar fondo'}
              </button>
            )}
            <span className="tl-dim">
              {tc(capaElegida.inicio)} · {capaElegida.duracion.toFixed(1)} s ·{' '}
              {capaElegida.fin ? 'en pausa, la silueta punteada es dónde termina: arrástrala' : 'arrástrala en el monitor'}
            </span>
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </>
        ) : ajusteElegido ? (
          <>
            <b>Capa de ajuste</b>
            <span className="tl-dim">
              {tc(ajusteElegido.inicio)} · {ajusteElegido.duracion.toFixed(1)} s · vale para el video y las capas de abajo, no para los textos
            </span>
            <div className="ed-opciones">
              {(
                [
                  ['Blanco y negro', { saturacion: 0, contraste: 1.1 }],
                  ['Cálido', { temperatura: 0.5, saturacion: 1.1 }],
                  ['Frío', { temperatura: -0.5 }],
                  ['Oscurecer', { exposicion: -1 }],
                  ['Desenfocar', { desenfoque: 0.5 }],
                  ['Nada', {}]
                ] as const
              ).map(([nombre, aj]) => (
                <button key={nombre} className="chip" onClick={() => historial.aplicar(cambiarAjusteCapa(timeline, ajusteElegido.id, { ajustes: { ...aj } }))}>
                  {nombre}
                </button>
              ))}
            </div>
            <div className="tl-ajustes">
              {AJUSTES_DE_CAPA.map((k: AjusteDeCapa) => {
                const [min, max, neutro] = LIMITES_AJUSTES[k]
                const v = ajusteElegido.ajustes[k] ?? neutro
                const nombres: Record<AjusteDeCapa, string> = {
                  exposicion: 'Exposición',
                  contraste: 'Contraste',
                  altas: 'Altas luces',
                  sombras: 'Sombras',
                  blancos: 'Blancos',
                  negros: 'Negros',
                  saturacion: 'Saturación',
                  temperatura: 'Temperatura',
                  tinte: 'Tinte',
                  brillo: 'Brillo',
                  desenfoque: 'Desenfoque'
                }
                return (
                  <div key={k} className="tl-ajuste aj">
                    <span>
                      {nombres[k]}
                      <ValorArrastrable
                        nombre={nombres[k]}
                        valor={v}
                        min={min}
                        max={max}
                        paso={0.01}
                        formato={(x) => String(Math.round(x * 100) / 100)}
                        porDefecto={neutro}
                        onEmpezar={empezarAjuste}
                        onCambio={(x) => deslizar(cambiarAjusteCapa(timeline, ajusteElegido.id, { ajustes: { ...ajusteElegido.ajustes, [k]: x } }))}
                      />
                    </span>
                  </div>
                )
              })}
            </div>
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </>
        ) : sonidoElegido ? (
          <>
            <Icon name="sparkles" size={14} />
            <b className="tl-musica-nombre">{sonidoElegido.nombre}</b>
            <div className="tl-ajuste aj en-linea">
              <span>
                Volumen
                <ValorArrastrable
                  nombre="Volumen"
                  valor={sonidoElegido.volumen ?? VOLUMEN_SONIDO}
                  min={0}
                  max={1.5}
                  paso={0.01}
                  formato={(v) => `${Math.round(v * 100)} %`}
                  porDefecto={VOLUMEN_SONIDO}
                  onEmpezar={empezarAjuste}
                  onCambio={(v) => deslizar(cambiarSonido(timeline, sonidoElegido.id, { volumen: v }))}
                />
              </span>
            </div>
            <span className="tl-dim">
              {tc(sonidoElegido.inicio)} · {sonidoElegido.duracion.toFixed(1)} s
            </span>
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </>
        ) : musicaElegida ? (
          <>
            <Icon name="music" size={14} />
            <b className="tl-musica-nombre">{musicaElegida.nombre}</b>
            <div className="tl-ajuste aj en-linea">
              <span>
                Volumen
                <ValorArrastrable
                  nombre="Volumen de la música"
                  valor={musicaElegida.volumen}
                  min={0}
                  max={1}
                  paso={0.01}
                  formato={(v) => `${Math.round(v * 100)} %`}
                  onEmpezar={empezarAjuste}
                  onCambio={(v) => deslizar(cambiarMusica(timeline, { volumen: v }))}
                />
              </span>
            </div>
            <label className="tl-check">
              <input
                type="checkbox"
                checked={musicaElegida.ducking}
                onChange={(e) => historial.aplicar(cambiarMusica(timeline, { ducking: e.target.checked }))}
              />
              Bajar cuando hay voz
            </label>
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={() => void accionMusica()}>
              Cambiar
            </button>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </>
        ) : (fraseElegida || nuevaVoz) && generarVoz ? (
          <InspectorVoz
            frase={fraseElegida}
            timeline={timeline}
            tiempo={tiempo}
            historial={historial}
            generar={generarVoz}
            grabar={grabarVoz}
            onElegir={(id) => (setNuevaVoz(false), onElegir(id ? { tipo: 'voz', id } : null))}
            onCerrar={() => setNuevaVoz(false)}
          />
        ) : textoElegido ? (
          <>
            <textarea
              ref={textoRef}
              className="tl-texto-input tl-texto-area"
              rows={Math.min(4, Math.max(1, textoElegido.texto.split('\n').length))}
              value={textoElegido.texto}
              placeholder="Escribe el rótulo (Enter para otra línea)"
              onFocus={() => (escribiendo.current = false)}
              onChange={(e) => {
                const nueva = cambiarTexto(timeline, textoElegido.id, { texto: e.target.value })
                // La primera tecla abre el paso de deshacer; las siguientes lo amplían.
                if (escribiendo.current) historial.reemplazar(nueva)
                else historial.aplicar(nueva)
                escribiendo.current = true
              }}
            />
            <label className="ed-campo"><span>Posición</span><select
              value={typeof textoElegido.x === 'number' ? 'libre' : textoElegido.posicion}
              title="Dónde va; arrástralo en el monitor para ponerlo donde quieras"
              onChange={(e) =>
                e.target.value !== 'libre' &&
                historial.aplicar(cambiarTexto(timeline, textoElegido.id, { posicion: e.target.value as PosicionTexto }))
              }
            >
              {typeof textoElegido.x === 'number' && <option value="libre">Donde lo pusiste</option>}
              <option value="arriba">Arriba</option>
              <option value="centro">Centro</option>
              <option value="abajo">Abajo</option>
            </select></label>
            <div className="tl-ajuste aj en-linea">
              <span>
                Tamaño
                <ValorArrastrable
                  nombre="Tamaño del texto"
                  valor={textoAhora?.tamano ?? 1}
                  min={LIMITES_TAMANO[0]}
                  max={LIMITES_TAMANO[1]}
                  paso={0.05}
                  formato={(v) => `${Math.round(v * 100)} %`}
                  porDefecto={1}
                  onEmpezar={empezarAjuste}
                  onCambio={(v) => deslizar(cambiarTextoEn(timeline, textoElegido.id, { tamano: v }, Math.max(0, tiempo - textoElegido.inicio)))}
                />
              </span>
            </div>
            <label className="ed-campo"><span>Letra</span><select
              value={textoElegido.fuente ?? 'normal'}
              title="La letra"
              onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { fuente: e.target.value }))}
            >
              {Object.entries(FUENTES_TEXTO).map(([clave, f]) => (
                <option key={clave} value={clave} style={{ fontFamily: f.familia }}>
                  {f.nombre}
                </option>
              ))}
              {(tl.letras ?? []).map((l) => (
                <option key={l.id} value={l.id} style={{ fontFamily: `"Recorte ${l.id}"` }}>
                  {l.nombre} (del proyecto)
                </option>
              ))}
            </select></label>
            <input
              type="color"
              className="tl-color"
              title="Color de la letra"
              value={textoElegido.color ?? '#ffffff'}
              onPointerDown={empezarAjuste}
              onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { color: e.target.value }))}
            />
            {textoElegido.animacion === 'pintar' && (
              <label className="ed-campo" title="El color con que se pinta cada palabra cuando se dice">
                <span>Se pinta de</span>
                <input
                  type="color"
                  className="tl-color"
                  value={textoElegido.pintado ?? COLOR_PINTADO}
                  onPointerDown={empezarAjuste}
                  onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { pintado: e.target.value }))}
                />
              </label>
            )}
            {textoElegido.texto.includes('*') ? (
              <label className="ed-campo" title="El color de las palabras que van entre asteriscos">
                <span>Palabras resaltadas</span>
                <input
                  type="color"
                  className="tl-color"
                  value={textoElegido.colorClave ?? COLOR_PINTADO}
                  onPointerDown={empezarAjuste}
                  onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { colorClave: e.target.value }))}
                />
              </label>
            ) : (
              <span className="tl-dim">Para resaltar una palabra en color, escríbela entre *asteriscos*.</span>
            )}
            <span className="ed-seccion">Animación</span>
            <AnimacionesTexto
              texto={textoElegido}
              onCambio={(cambio) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, cambio))}
              onVer={(que) => verAnimacionTexto(textoElegido, que)}
              duracionSalida={
                <DuracionAnimacion
                  nombre="Dura la salida"
                  valor={durSalidaTexto(textoElegido)}
                  onCambio={(v) => deslizar(cambiarTexto(timeline, textoElegido.id, { durSalida: v }))}
                  empezar={empezarAjuste}
                />
              }
            />
            {(textoElegido.animacion === 'pintar' || porPalabras(textoElegido.animacion)) && (
              <span className="tl-dim" title="Los subtítulos hechos desde la voz saben cuándo se dice cada palabra">
                {textoElegido.tiempos ? 'Al ritmo de la voz' : 'Repartidas en lo que dura (hazlo desde la voz para que vaya con ella)'}
              </span>
            )}
            <label className="tl-check" title="Los subtítulos son el guion de los subtítulos animados (se rehacen todos juntos)">
              <input
                type="checkbox"
                checked={textoElegido.subtitulo === true}
                onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { subtitulo: e.target.checked }))}
              />
              <span>Es un subtítulo</span>
            </label>
            <label className="tl-check" title="El texto va por detrás de lo que hay encima del video: con la persona separada del fondo, queda detrás de ella">
              <input
                type="checkbox"
                checked={textoElegido.detras === true}
                onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { detras: e.target.checked }))}
              />
              <span>Detrás de la persona</span>
            </label>
            {textoElegido.detras && !(tl.capas ?? []).some((x) => x.persona) && (
              <span className="tl-dim">Para que se note, separa a la persona: elige el clip y pulsa «Separar a la persona».</span>
            )}
            <label className="tl-check" title="Sin la caja oscura: solo la letra con su borde">
              <input
                type="checkbox"
                checked={!textoElegido.sinCaja}
                onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { sinCaja: !e.target.checked }))}
              />
              Caja
            </label>
            {!textoElegido.sinCaja && (
              <input
                type="color"
                className="tl-color"
                title="Color de la caja"
                value={textoElegido.caja ?? '#000000'}
                onPointerDown={empezarAjuste}
                onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { caja: e.target.value }))}
              />
            )}
            <EstiloTexto texto={textoElegido} timeline={timeline} historial={historial} deslizar={deslizar} empezarAjuste={empezarAjuste} tiempo={tiempo} onBuscar={onBuscar} />
            <PanelAlinear
              onAlinear={(como) => {
                const caja = cajaDePieza({ tipo: 'texto', id: textoElegido.id })
                if (caja) historial.aplicar(moverPiezas(timeline, alinearPiezas([{ pieza: { tipo: 'texto', id: textoElegido.id }, caja }], como), tiempo, medidas))
              }}
            />
            <PanelOrden
              tipo="texto"
              x={textoElegido}
              hayEstilo={hayEstilo === 'texto'}
              onAlternar={(campo) => alternarEn('texto', textoElegido.id, campo)}
              onDuplicar={accionDuplicar}
              onCopiarEstilo={copiarEstilo}
              onPegarEstilo={pegarEstilo}
            />
            <span className="tl-dim">
              {tc(textoElegido.inicio)} · {textoElegido.duracion.toFixed(1)} s
            </span>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Borrar
            </button>
          </>
        ) : (
          <div className="ed-vacio">
            <p>Elige un clip, un texto, una capa o un sonido en la línea de tiempo para ajustarlo aquí.</p>
            <dl className="ed-atajos">
              <dt>Espacio</dt>
              <dd>Reproducir o pausar</dd>
              <dt>S · Ctrl+B</dt>
              <dd>Dividir en el cabezal</dd>
              <dt>Ctrl+C · X · V</dt>
              <dd>Copiar, cortar y pegar en el cabezal</dd>
              <dt>Ctrl+D</dt>
              <dd>Duplicar el clip</dd>
              <dt>Alt+flechas</dt>
              <dd>Mover un poco la capa o el texto elegido (con Mayús, más)</dd>
              <dt>Mayús al girar</dt>
              <dd>Girar de 15 en 15° con el tirador redondo</dd>
              <dt>◆</dt>
              <dd>Junto a un ajuste del clip: pone un fotograma clave para animarlo</dd>
              <dt>Ctrl+clic</dt>
              <dd>Elegir varios (Ctrl+A, todos los clips)</dd>
              <dt>+ · −</dt>
              <dd>Acercar o alejar la línea de tiempo</dd>
              <dt>T</dt>
              <dd>Añadir un texto</dd>
              <dt>Supr</dt>
              <dd>Borrar lo elegido</dd>
              <dt>← →</dt>
              <dd>Un cuadro (con Mayús, un segundo)</dd>
              <dt>Ctrl+Z</dt>
              <dd>Deshacer</dd>
              <dt>Ctrl+rueda</dt>
              <dd>Acercar la línea de tiempo</dd>
              <dt>V · C · H</dt>
              <dd>Selección, cuchilla (corta donde haces clic) y mano</dd>
              <dt>N · Y · U</dt>
              <dd>Recorte rodado, deslizar el contenido y desplazar el clip</dd>
              <dt>J · K · L</dt>
              <dd>Atrás 5 s, pausa, reproducir (otra vez L: adelante 5 s)</dd>
              <dt>I · O</dt>
              <dd>Marcar entrada y salida (con Mayús, ir a ellas)</dd>
              <dt>'</dt>
              <dd>Extraer lo que hay entre la entrada y la salida</dd>
              <dt>M</dt>
              <dd>Poner una marca (Mayús+M, ir a la siguiente)</dd>
              <dt>↑ ↓</dt>
              <dd>Ir al corte anterior o al siguiente</dd>
            </dl>
          </div>
        )}
      </div>
          </div>,
          paneles.inspector
        )}
    </div>
  )
}

/** Si un recorrido es el mismo que otro (para reconocer el movimiento elegido en el menú). */
/** Alinear con el cuadro (una sola) o entre ellas (varias), y repartirlas. */
function PanelAlinear({ onAlinear, varias = false }: { onAlinear: (como: Alineacion) => void; varias?: boolean }) {
  const boton = (como: Alineacion, nombre: string, titulo: string) => (
    <button className="chip" title={titulo} onClick={() => onAlinear(como)}>
      {nombre}
    </button>
  )
  const con = varias ? 'entre ellas' : 'con el cuadro'
  return (
    <div className="ed-campo" role="group" aria-label="Alinear">
      <span>Alinear {con}</span>
      <div className="ed-opciones">
        {boton('izquierda', '⇤ Izq.', `A la izquierda, ${con}`)}
        {boton('centro', '↔ Centro', `Al centro, ${con}`)}
        {boton('derecha', 'Der. ⇥', `A la derecha, ${con}`)}
        {boton('arriba', '⤒ Arriba', `Arriba, ${con}`)}
        {boton('medio', '↕ Medio', `Al medio, ${con}`)}
        {boton('abajo', 'Abajo ⤓', `Abajo, ${con}`)}
        {varias && boton('repartir-h', 'Repartir ↔', 'El mismo espacio entre cada una, de izquierda a derecha (tres o más)')}
        {varias && boton('repartir-v', 'Repartir ↕', 'El mismo espacio entre cada una, de arriba abajo (tres o más)')}
      </div>
    </div>
  )
}

/** Orden (capas), ocultar, bloquear, duplicar y el estilo de una capa o un texto. */
function PanelOrden({
  tipo,
  x,
  hayEstilo,
  onOrden,
  onAlternar,
  onDuplicar,
  onCopiarEstilo,
  onPegarEstilo
}: {
  tipo: 'capa' | 'texto'
  x: { oculto?: boolean; bloqueado?: boolean }
  hayEstilo: boolean
  onOrden?: (como: 'frente' | 'atras' | 'subir' | 'bajar') => void
  onAlternar: (campo: 'oculto' | 'bloqueado') => void
  onDuplicar: () => void
  onCopiarEstilo: () => void
  onPegarEstilo: () => void
}) {
  return (
    <>
      {onOrden && (
        <div className="ed-campo" role="group" aria-label="Orden">
          <span>Orden en su pista</span>
          <div className="ed-opciones">
            <button className="chip" title="Encima de todas las de su pista" onClick={() => onOrden('frente')}>Al frente</button>
            <button className="chip" title="Encima de la siguiente que se cruza con ella" onClick={() => onOrden('subir')}>Adelante</button>
            <button className="chip" title="Debajo de la anterior que se cruza con ella" onClick={() => onOrden('bajar')}>Atrás</button>
            <button className="chip" title="Debajo de todas las de su pista" onClick={() => onOrden('atras')}>Al fondo</button>
          </div>
        </div>
      )}
      <div className="ed-opciones" role="group" aria-label={tipo === 'capa' ? 'La capa' : 'El texto'}>
        <button className={`chip ${x.oculto ? 'is-on' : ''}`} aria-pressed={Boolean(x.oculto)} title="No se ve en el monitor ni en el video, sin borrarlo" onClick={() => onAlternar('oculto')}>
          {x.oculto ? 'Mostrar' : 'Ocultar'}
        </button>
        <button className={`chip ${x.bloqueado ? 'is-on' : ''}`} aria-pressed={Boolean(x.bloqueado)} title="Que no se mueva ni se cambie sin querer" onClick={() => onAlternar('bloqueado')}>
          {x.bloqueado ? 'Desbloquear' : 'Bloquear'}
        </button>
        <button className="chip" title="Ctrl+D: la copia va justo después" disabled={x.bloqueado} onClick={onDuplicar}>Duplicar</button>
        <button className="chip" title={`Ctrl+Alt+C: copia el estilo de ${tipo === 'capa' ? 'esta capa' : 'este texto'}`} onClick={onCopiarEstilo}>Copiar estilo</button>
        <button className="chip" title={`Ctrl+Alt+V: le pone el estilo copiado (a varios con Ctrl + clic)`} disabled={!hayEstilo || x.bloqueado} onClick={onPegarEstilo}>Pegar estilo</button>
      </div>
    </>
  )
}

/** Lo que dura una entrada o una salida, de 0,1 a 2 s. */
function DuracionAnimacion({ nombre, valor, onCambio, empezar }: { nombre: string; valor: number; onCambio: (v: number) => void; empezar: () => void }) {
  return (
    <div className="tl-ajuste aj en-linea">
      <span>
        {nombre}
        <ValorArrastrable
          nombre={nombre}
          valor={valor}
          min={DURACIONES_ANIMACION[0]}
          max={DURACIONES_ANIMACION[1]}
          paso={0.05}
          formato={(v) => `${v.toFixed(2).replace('.', ',')} s`}
          onEmpezar={empezar}
          onCambio={onCambio}
        />
      </span>
    </div>
  )
}

function sinCambios(a: FinCapa, b: FinCapa): boolean {
  return Math.abs(a.x - b.x) < 0.002 && Math.abs(a.y - b.y) < 0.002 && Math.abs(a.ancho - b.ancho) < 0.002 && Math.abs(a.giro - b.giro) < 0.1
}

/** El nombre del color de un tono (para el color por zonas). */
function nombreMatiz(h: number): string {
  const x = ((h % 360) + 360) % 360
  if (x < 15 || x >= 345) return 'Rojos'
  if (x < 45) return 'Naranjas y piel'
  if (x < 75) return 'Amarillos'
  if (x < 150) return 'Verdes'
  if (x < 200) return 'Cianes y cielo'
  if (x < 260) return 'Azules'
  if (x < 290) return 'Violetas'
  return 'Magentas'
}

/** El texto de un rótulo con sus palabras resaltadas (`*así*`) en color y sin los asteriscos. */
function conResaltes(texto: string): React.ReactNode[] {
  return texto.split(/(\*[^*]+\*)/g).map((trozo, i) =>
    /^\*[^*]+\*$/.test(trozo) ? (
      <b key={i} className="tl-resalte">
        {trozo.slice(1, -1)}
      </b>
    ) : (
      trozo
    )
  )
}
