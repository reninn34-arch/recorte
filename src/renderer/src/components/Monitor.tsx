import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'
import { LienzoLut } from './LienzoLut'
import { Medidores } from './Medidores'
import { aplicarCadena } from '../audio'
import type { VistaPrevia } from '../hooks/vistaprevia'
import type { TramoVista } from '../../../shared/vistaprevia'
import {
  ajustesDe,
  APARECER_S,
  pasoAnimacion,
  tiemposPalabras,
  COLOR_PINTADO,
  partesClave,
  sinMarcas,
  vistaTransicion,
  capaNueva,
  estadoCapa,
  aplicarParalaje,
  camaraEn,
  referenciaParalaje,
  DESENFOQUE_MAX,
  desenfoqueCapaEn,
  volumenClipEn,
  sonidoDe,
  desenfoqueDeCampo,
  TIPO_ARRASTRE_MEDIO,
  cambiarCapa,
  cambiarTexto,
  capasEn,
  FUENTES_TEXTO,
  textosEn,
  ubicar,
  VOLUMEN_SONIDO,
  type CapaTL,
  type FiltrosTL,
  type SonidoTL,
  type TextoTL,
  type Timeline,
  timelineActiva,
  filtroColorCss,
  curvasColor,
  hayMovimiento,
  ajustesDeCapa,
  zonaEnPixeles,
  zonaEn,
  cambiarZonas,
  type ZonaTL,
  DESENFOQUE_CLIP,
  ajustesEn,
  ponerClaveCapa,
  CAPA_SUBTITULOS,
  letraOscura,
  MODOS_FUSION,
  curvasDeClip,
  normalizarRecorte,
  marcoCapa,
  SOMBRA_CAPA,
  porPalabras,
  letraDe,
  salidaTexto,
  textoEn,
  cambiarTextoEn,
  DESENFOQUE_TEXTO,
  type RecorteCapa
} from '../../../shared/timeline'
import { useMusica, useSincronizar, useTamano, useVoces, type FuentesVista, type Historial, type Reproductor } from '../hooks/timeline'
import type { Elegido } from './TimelineEditor'
import { anclajeRotulo, centroEnCuadro, estiloMedioCapa, estiloRotulo } from '../rotulos'
import { cajaEnCuadro, imanEje, objetivosIman, ZONA_ACCION, ZONA_TITULO, type Caja, type TipoGuia } from '../guias'
import { moverPiezas, type Pieza } from '../grupo'

/** Lo que se está moviendo en el monitor, antes de soltarlo: su sitio y su ancho. */
type Borrador = {
  tipo: 'capa' | 'texto'
  id: string
  x: number
  y: number
  ancho?: number
  fin?: boolean
  /** Girando: el giro nuevo (grados). */
  giro?: number
  /** Agrandando un texto: su tamaño nuevo. */
  tamano?: number
  /** Recortando una capa: su recorte nuevo. */
  recorte?: RecorteCapa
} | null

/** Lo que hace un arrastre: mover, cambiar el tamaño (desde una esquina), girar o recortar un lado. */
type ModoArrastre = 'mover' | 'ancho' | 'giro' | 'recorte-izq' | 'recorte-der' | 'recorte-arriba' | 'recorte-abajo'

/** El giro elegido con el ratón: con Mayús, de 15 en 15; si no, se pega a 0, 90, 180 y −90 cuando está cerca. */
/** Un color #rrggbb con transparencia, para CSS. */
function conAlfa(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function giroConIman(grados: number, mayus: boolean): number {
  let g = ((((grados + 180) % 360) + 360) % 360) - 180
  if (mayus) g = Math.round(g / 15) * 15
  else {
    const recto = Math.round(g / 90) * 90
    if (Math.abs(g - recto) < 3) g = recto
  }
  return Math.round((g === -180 ? 180 : g) * 10) / 10
}

/** A menos de estos píxeles de una guía (un borde, el centro, un tercio, la zona segura, otra capa), se pega a ella. */
const IMAN_PX = 6

/** Las guías que se ven mientras se arrastra algo: verticales (x) y horizontales (y). */
type Guias = { v: { v: number; tipo: TipoGuia }[]; h: { v: number; tipo: TipoGuia }[] }
const SIN_GUIAS: Guias = { v: [], h: [] }

/**
 * El monitor: la timeline sin renderizar. Dentro, un cuadro con la forma del video final donde
 * van las capas encima y los rótulos; se eligen con un clic y se mueven arrastrándolos (como en
 * la exportación, su sitio es una fracción del cuadro).
 */
export function Monitor({
  proyecto,
  timeline,
  reproductor,
  fuentes,
  medios,
  historial,
  elegido,
  onElegir,
  varios = [],
  onVarios,
  vistaPrevia
}: {
  proyecto: Project
  timeline: Timeline
  reproductor: Reproductor
  fuentes: FuentesVista
  /** Lo que dura cada medio (para validar las capas). */
  medios: Record<string, number>
  historial: Historial
  elegido: Elegido
  onElegir: (e: Elegido) => void
  /** Lo elegido de más con Ctrl o Mayús + clic (compartido con la línea de tiempo): se mueve junto. */
  varios?: NonNullable<Elegido>[]
  onVarios?: React.Dispatch<React.SetStateAction<NonNullable<Elegido>[]>>
  /** Los tramos ya renderizados: al reproducir, se ve ese video en vez de componer las capas en vivo. */
  vistaPrevia?: VistaPrevia | null
}) {
  // El tramo de vista previa bajo el cabezal (si ya está hecho) y el siguiente (cargado y quieto, para seguir sin pausa).
  const listo = (t?: TramoVista) => (t && t.pesado && vistaPrevia?.listas.has(t.clave) ? t : undefined)
  const iTramo = reproductor.reproduciendo && vistaPrevia ? vistaPrevia.tramos.findIndex((t) => reproductor.tiempo >= t.desde && reproductor.tiempo < t.hasta) : -1
  const vistaAhora = iTramo >= 0 ? listo(vistaPrevia!.tramos[iTramo]) : undefined
  const vistaLuego = iTramo >= 0 ? listo(vistaPrevia!.tramos[iTramo + 1]) : undefined
  const src = proyecto.demo ? undefined : mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente')
  const enImagen = Boolean(reproductor.imagen)
  // Lo que se ve y suena: sin las pistas ocultas o silenciadas (lo que se edita es `timeline`, entera).
  const vista = useMemo(() => timelineActiva(timeline, { conSolo: true }), [timeline])
  // Con el tramo ya renderizado, lo de encima viene en ese video: no se compone en vivo.
  // Cada texto como está ahora (con sus fotogramas clave: sitio, tamaño, giro, opacidad).
  const rotulos = vistaAhora ? [] : textosEn(vista, reproductor.tiempo).map((r) => textoEn(r, reproductor.tiempo - r.inicio))
  const vacia = timeline.clips.length === 0
  const musicaRef = useMusica(vista, reproductor, proyecto.transcript)
  const urlDe = useCallback((archivo: string) => mediaUrl(proyecto.id, archivo), [proyecto.id])
  const vocesRef = useVoces(vista, reproductor, urlDe)
  const ubicado = ubicar(vista, reproductor.tiempo)
  const clipActual = ubicado?.clip
  // Un clip mudo solo aporta imagen: su sonido va en las pistas de voz y música.
  useEffect(() => {
    if (reproductor.videoRef.current) reproductor.videoRef.current.muted = Boolean(clipActual?.mudo || clipActual?.rampa?.length)
  }, [clipActual?.id, clipActual?.mudo, clipActual?.rampa, reproductor.videoRef])
  // El volumen del clip con sus fundidos (el monitor llega hasta 1; por encima solo se oye en el MP4).
  const volumenClip = ubicado && clipActual ? Math.min(1, volumenClipEn(clipActual, reproductor.tiempo - ubicado.inicio, ubicado.fin - ubicado.inicio, ubicado.tFuente)) : 1
  useEffect(() => {
    if (reproductor.videoRef.current) reproductor.videoRef.current.volume = volumenClip
  }, [volumenClip, reproductor.videoRef])
  // La cadena de sonido del clip (mejorar voz, ecualizador, compresor) en el video que suena: la misma del MP4. El
  // contexto de audio solo arranca con un clic (al reproducir): si aún no está, se reintenta un momento después.
  const sonidoClip = clipActual ? sonidoDe(clipActual) : null
  const firmaSonido = sonidoClip ? JSON.stringify(sonidoClip) : ''
  useEffect(() => {
    const el = reproductor.videoRef.current
    if (!el || !sonidoClip) return
    let intentos = 0
    let id = 0
    const probar = () => {
      if (!aplicarCadena(el, sonidoClip) && intentos++ < 5) id = window.setTimeout(probar, 300)
    }
    probar()
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaSonido, reproductor.activo, reproductor.reproduciendo, reproductor.videoRef])
  // Zoom, encuadre, acercamiento y color del clip bajo el cabezal; en el render son crop,
  // zoompan y eq de FFmpeg.
  // Con fotogramas clave, los ajustes son los de este instante.
  const a = ubicado ? ajustesEn(clipActual, ubicado.tFuente) : ajustesDe(clipActual)
  const largoClip = ubicado ? ubicado.fin - ubicado.inicio : 1
  const enClip = ubicado ? reproductor.tiempo - ubicado.inicio : 0
  // La cámara del clip: zoom, acercamiento lento y paneo (el punto hacia el que se acerca se desplaza).
  const cam = camaraEn(a, enClip / Math.max(0.01, largoClip), enClip)
  const z = cam.z
  // La transición de entrada: el clip entra sobre negro (en el render, sobre el clip anterior), con su tipo
  // (fundido, barrido, zoom, desenfoque, destello, círculo).
  const tr = clipActual?.fundido && ubicado && ubicado.indice > 0 && enClip < clipActual.fundido ? vistaTransicion(clipActual.transicion, enClip / clipActual.fundido) : null
  const fundido = tr ? tr.opacidad : 1
  const clipPrevio = tr && ubicado ? timeline.clips[ubicado.indice - 1] : undefined
  const previoUrl = clipPrevio && fuentes[clipPrevio.fuente]?.tipo === 'imagen' ? fuentes[clipPrevio.fuente].url : undefined
  // El color tipo Lumetri: la misma curva por canal que el MP4 (lut1d), como filtro SVG.
  const idCurvas = `curvas-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const curvas = curvasDeClip(clipActual, a)
  // Recortar y transformar: la imagen entera (ya con su zoom) se recorta, se escala, se gira y se corre.
  const movimiento: React.CSSProperties | undefined = hayMovimiento(a)
    ? {
        transform: `translate(${(a.posx * 100).toFixed(3)}%, ${(a.posy * 100).toFixed(3)}%) rotate(${a.giro.toFixed(2)}deg) scale(${a.escala.toFixed(4)})`,
        clipPath: `inset(${(a.recorteArr * 100).toFixed(3)}% ${(a.recorteDer * 100).toFixed(3)}% ${(a.recorteAba * 100).toFixed(3)}% ${(a.recorteIzq * 100).toFixed(3)}%)`
      }
    : undefined
  // El LUT del clip (no en una demo, que no tiene carpeta).
  const conLut = Boolean(clipActual?.lut && !proyecto.demo && !vacia)
  const imagenRef = useRef<HTMLImageElement | null>(null)
  const estiloImagen: React.CSSProperties = {
    visibility: vacia ? 'hidden' : 'visible',
    transform:
      z !== 1 || tr
        ? `${tr && (tr.x || tr.y) ? `translate(${(tr.x * 100).toFixed(2)}%, ${(tr.y * 100).toFixed(2)}%) ` : ''}scale(${(z * (tr?.escala ?? 1)).toFixed(4)})`
        : undefined,
    clipPath: tr?.circulo != null ? `circle(${(tr.circulo * 75).toFixed(2)}% at 50% 50%)` : undefined,
    transformOrigin: cam.cx !== 0.5 || cam.cy !== 0.5 ? `${(cam.cx * 100).toFixed(3)}% ${(cam.cy * 100).toFixed(3)}%` : undefined,
    opacity: fundido < 1 ? fundido : undefined,
    // El color y los efectos del clip (los mismos filtros que salen en el MP4) y, en una transición, su desenfoque.
    filter: `${tr?.desenfoque ? `blur(${tr.desenfoque.toFixed(1)}px) ` : ''}${curvas ? `url(#${idCurvas}) ` : ''}${filtroColorCss(a)}`.trim() || undefined
  }

  // El cuadro del video final dentro del monitor (el video se ve con object-fit: contain).
  const monitorRef = useRef<HTMLDivElement>(null)
  const tam = useTamano(monitorRef)
  const proporcion = (proyecto.source.width || 16) / (proyecto.source.height || 9)
  const cw = tam ? Math.min(tam.w, tam.h * proporcion) : 0
  const ch = cw / proporcion
  // Las capas de ajuste que tocan ahora: el mismo filtro para el video y para las capas (los textos quedan limpios).
  const ajustesAhora = (vista.ajustesCapa ?? []).filter((x) => reproductor.tiempo >= x.inicio && reproductor.tiempo < x.inicio + x.duracion)
  const curvasAjuste = ajustesAhora.map((x) => curvasColor(ajustesDeCapa(x)))
  const filtroAjuste =
    ajustesAhora
      .map((x, k) => {
        const aj = ajustesDeCapa(x)
        return `${curvasAjuste[k] ? `url(#${idCurvas}-aj${k}) ` : ''}${filtroColorCss(aj)}${aj.desenfoque > 0.005 ? ` blur(${(aj.desenfoque * DESENFOQUE_CLIP * cw).toFixed(2)}px)` : ''}`.trim()
      })
      .filter(Boolean)
      .join(' ') || undefined
  // Profundidad de campo: el fondo (a profundidad 0) se desenfoca si el foco está más cerca.
  const fondoBorroso = desenfoqueDeCampo(a, 0)
  if (a.desenfoque > 0.005) estiloImagen.filter = `${estiloImagen.filter ?? ''} blur(${(a.desenfoque * DESENFOQUE_CLIP * cw).toFixed(2)}px)`.trim()
  if (fondoBorroso > 0.005) estiloImagen.filter = `${estiloImagen.filter ?? ''} blur(${(fondoBorroso * DESENFOQUE_MAX * cw).toFixed(2)}px)`.trim()
  // El tamaño de letra sigue al de la exportación (una fracción del lado corto).
  const letra = Math.min(cw, ch) * (ch > cw ? 0.06 : 0.065) * 0.93

  const [borrador, setBorrador] = useState<Borrador>(null)
  // Mientras se arrastra un grupo: lo que se corren los demás del grupo (el arrastrado va con su borrador).
  const [desplazo, setDesplazo] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null)
  const corrido = (id: string): React.CSSProperties => (desplazo?.ids.has(id) ? { translate: `${(desplazo.dx * cw).toFixed(1)}px ${(desplazo.dy * ch).toFixed(1)}px` } : {})
  const enGrupo = (id: string) => varios.length > 1 && varios.some((v) => v.id === id)
  // Los medidores de color (forma de onda, vectorscopio, histograma): se recuerda si estaban abiertos.
  const [verMedidores, setVerMedidores] = useState(() => {
    try {
      return localStorage.getItem('recorte:medidores') === '1'
    } catch {
      return false
    }
  })
  const alternarMedidores = () =>
    setVerMedidores((v) => {
      try {
        localStorage.setItem('recorte:medidores', v ? '0' : '1')
      } catch {
        // Sin almacenamiento: se olvida al cerrar.
      }
      return !v
    })
  // Una zona tapada que se está moviendo o agrandando con el ratón (se aplica al soltar).
  const [zonaMovida, setZonaMovida] = useState<{ k: number; z: ZonaTL } | null>(null)
  /** Mueve (o, desde su esquina, agranda) una zona tapada del clip elegido. */
  function arrastrarZona(e: React.PointerEvent, k: number, z: ZonaTL, modo: 'mover' | 'tamano') {
    if (e.button !== 0 || !cw || !clipActual) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const y0 = e.clientY
    const clipId = clipActual.id
    let ultima: ZonaTL = z
    const calcular = (ev: PointerEvent): ZonaTL => {
      const dx = (ev.clientX - x0) / cw
      const dy = (ev.clientY - y0) / ch
      if (modo === 'tamano') {
        // Desde la esquina: crece hacia ese lado y el centro acompaña.
        const ancho = Math.max(0.02, Math.min(1, z.ancho + dx))
        const alto = Math.max(0.02, Math.min(1, z.alto + dy))
        return { ...z, ancho, alto, x: z.x + (ancho - z.ancho) / 2, y: z.y + (alto - z.alto) / 2 }
      }
      return { ...z, x: Math.max(0, Math.min(1, z.x + dx)), y: Math.max(0, Math.min(1, z.y + dy)) }
    }
    const mover = (ev: PointerEvent) => {
      ultima = calcular(ev)
      setZonaMovida({ k, z: ultima })
    }
    const soltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      ultima = calcular(ev)
      setZonaMovida(null)
      const clip = timeline.clips.find((c) => c.id === clipId)
      if (!clip?.zonas) return
      // Una zona que sigue algo: se corre todo su recorrido lo que se movió (y toma el tamaño nuevo).
      const dx = ultima.x - z.x
      const dy = ultima.y - z.y
      const nueva = (x: ZonaTL): ZonaTL =>
        x.recorrido
          ? { ...x, ancho: ultima.ancho, alto: ultima.alto, recorrido: x.recorrido.map((p) => ({ ...p, x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) })) }
          : ultima
      historial.aplicar(cambiarZonas(timeline, clipId, clip.zonas.map((x, j) => (j === k ? nueva(x) : x))))
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }
  const [guia, setGuia] = useState<Guias>(SIN_GUIAS)
  // La zona segura (acción 90 %, títulos 80 %): se recuerda si estaba a la vista.
  const [verZona, setVerZona] = useState(() => {
    try {
      return localStorage.getItem('recorte:zonaSegura') === '1'
    } catch {
      return false
    }
  })
  const alternarZona = () =>
    setVerZona((v) => {
      try {
        localStorage.setItem('recorte:zonaSegura', v ? '0' : '1')
      } catch {
        // Sin almacenamiento, dura lo que dura la sesión.
      }
      return !v
    })
  const capas = vistaAhora ? [] : capasEn(vista, reproductor.tiempo)
  const [soltando, setSoltando] = useState(false)

  /** Un medio de la biblioteca soltado sobre el monitor: queda encima, donde se soltó. */
  function soltar(e: React.DragEvent) {
    setSoltando(false)
    const fuente = e.dataTransfer.getData(TIPO_ARRASTRE_MEDIO)
    const f = fuentes[fuente]
    if (!fuente || fuente === 'principal' || !f) return
    e.preventDefault()
    const cuadro = (e.currentTarget as HTMLElement).querySelector('.monitor-cuadro')?.getBoundingClientRect()
    const x = cuadro ? Math.max(0, Math.min(1, (e.clientX - cuadro.left) / cuadro.width)) : 0.5
    const y = cuadro ? Math.max(0, Math.min(1, (e.clientY - cuadro.top) / cuadro.height)) : 0.5
    const r = capaNueva(timeline, fuente, f.tipo, reproductor.tiempo, medios, x, y)
    if (r.timeline === timeline) return
    historial.aplicar(r.timeline)
    onElegir({ tipo: 'capa', id: r.id })
  }

  /**
   * Mueve una capa o un rótulo con el ratón; desde una esquina cambia su tamaño (el ancho de la capa, el tamaño del
   * texto), desde el tirador de arriba lo gira y desde los lados recorta la capa.
   */
  function arrastrar(
    e: React.PointerEvent,
    tipo: 'capa' | 'texto',
    id: string,
    inicio: { x: number; y: number; ancho?: number; giro?: number; tamano?: number; recorte?: RecorteCapa },
    modo: ModoArrastre = 'mover',
    /** Mueve dónde TERMINA una capa que se mueve (su silueta punteada). */
    fin = false
  ) {
    if (e.button !== 0 || !cw) return
    e.preventDefault()
    e.stopPropagation()
    // Ctrl o Mayús + clic: lo suma al grupo (o lo quita), como en la línea de tiempo.
    if (modo === 'mover' && !fin && (e.ctrlKey || e.metaKey || e.shiftKey) && onVarios) {
      onVarios((antes) => {
        const base = antes.length || !elegido || elegido.tipo === 'musica' ? antes : [elegido]
        return base.some((v) => v.id === id) ? base.filter((v) => v.id !== id) : [...base, { tipo, id }]
      })
      return
    }
    // Bloqueado: se elige, pero no se mueve ni se cambia.
    if ((tipo === 'capa' ? timeline.capas?.find((c) => c.id === id) : timeline.textos.find((t) => t.id === id))?.bloqueado) {
      onElegir({ tipo, id })
      return
    }
    const x0 = e.clientX
    const y0 = e.clientY
    let movido = false
    let ultimo: Borrador = null
    // El punto sobre el que se agranda y gira (el centro de la capa, el punto de anclaje del texto), en la pantalla.
    const cuadro = monitorRef.current?.querySelector('.monitor-cuadro')?.getBoundingClientRect()
    const px = (cuadro?.left ?? 0) + inicio.x * cw
    const py = (cuadro?.top ?? 0) + inicio.y * ch
    const dist0 = Math.max(4, Math.hypot(x0 - px, y0 - py))
    const angulo0 = Math.atan2(y0 - py, x0 - px)
    // Para recortar: lo que mide la capa sin girar y hacia dónde apunta.
    const caja = (e.currentTarget as HTMLElement).closest('.monitor-capa') as HTMLElement | null
    const [wCaja, hCaja] = [Math.max(1, caja?.offsetWidth ?? 1), Math.max(1, caja?.offsetHeight ?? 1)]
    const rad = ((inicio.giro ?? 0) * Math.PI) / 180
    // Si es parte de un grupo (Ctrl + clic), se mueven todas las del grupo lo mismo.
    const grupo: Pieza[] | null =
      modo === 'mover' && !fin && varios.length > 1 && varios.some((v) => v.id === id)
        ? varios.filter((v): v is Pieza => v.tipo === 'capa' || v.tipo === 'texto')
        : null
    // Para el imán: dónde quedan los bordes de lo que se arrastra respecto a su punto de anclaje, y las demás cajas.
    const propio = (e.currentTarget as HTMLElement).closest('.monitor-capa, .monitor-rotulo') as HTMLElement | null
    const iman = (() => {
      if (modo !== 'mover' || !propio || !cuadro) return null
      const visible = (propio.querySelector(':scope > .monitor-capa-marco') as HTMLElement | null) ?? propio
      const c = cajaEnCuadro(visible.getBoundingClientRect(), cuadro)
      const otras: Caja[] = []
      monitorRef.current?.querySelectorAll('.monitor-cuadro .monitor-capa, .monitor-cuadro .monitor-rotulo').forEach((el) => {
        if (el === propio || el.closest('.monitor-capa-grupo') === propio.closest('.monitor-capa-grupo') && propio.classList.contains('monitor-capa')) return
        const r = el.getBoundingClientRect()
        // Lo que ocupa todo el cuadro (la persona recortada, los subtítulos animados) no sirve de guía.
        if (!r.width || (r.width >= cw * 0.98 && r.height >= ch * 0.98)) return
        otras.push(cajaEnCuadro(r, cuadro))
      })
      return {
        x: [c.izq - inicio.x, (c.izq + c.der) / 2 - inicio.x, c.der - inicio.x],
        y: [c.arriba - inicio.y, (c.arriba + c.abajo) / 2 - inicio.y, c.abajo - inicio.y],
        objetivos: objetivosIman(otras, verZona)
      }
    })()
    const calcular = (ev: PointerEvent): Borrador => {
      if (modo === 'ancho') {
        const k = Math.hypot(ev.clientX - px, ev.clientY - py) / dist0
        if (tipo === 'texto') return { tipo, id, x: inicio.x, y: inicio.y, tamano: Math.round(Math.max(0.5, Math.min(6, (inicio.tamano ?? 1) * k)) * 100) / 100 }
        const ancho = Math.max(0.05, Math.min(2, (inicio.ancho ?? 0.3) * k))
        return { tipo, id, x: inicio.x, y: inicio.y, ancho, fin }
      }
      if (modo === 'giro') {
        const g = (inicio.giro ?? 0) + ((Math.atan2(ev.clientY - py, ev.clientX - px) - angulo0) * 180) / Math.PI
        return { tipo, id, x: inicio.x, y: inicio.y, ...(inicio.ancho !== undefined ? { ancho: inicio.ancho } : {}), giro: giroConIman(g, ev.shiftKey), fin }
      }
      if (modo.startsWith('recorte-')) {
        // El movimiento en los ejes de la capa (girada), en fracción de lo que mide.
        const dx = ev.clientX - x0
        const dy = ev.clientY - y0
        const lx = (dx * Math.cos(rad) + dy * Math.sin(rad)) / wCaja
        const ly = (-dx * Math.sin(rad) + dy * Math.cos(rad)) / hCaja
        const r0 = inicio.recorte ?? { izq: 0, der: 0, arriba: 0, abajo: 0 }
        const r = { ...r0 }
        if (modo === 'recorte-izq') r.izq = r0.izq + lx
        if (modo === 'recorte-der') r.der = r0.der - lx
        if (modo === 'recorte-arriba') r.arriba = r0.arriba + ly
        if (modo === 'recorte-abajo') r.abajo = r0.abajo - ly
        return { tipo, id, x: inicio.x, y: inicio.y, ancho: inicio.ancho, recorte: normalizarRecorte(r) ?? { izq: 0, der: 0, arriba: 0, abajo: 0 } }
      }
      // El final de un recorrido puede quedar fuera del cuadro (para salir volando).
      const [lo, hi] = fin ? [-0.5, 1.5] : [0, 1]
      let x = Math.max(lo, Math.min(hi, inicio.x + (ev.clientX - x0) / cw))
      let y = Math.max(lo, Math.min(hi, inicio.y + (ev.clientY - y0) / ch))
      // El imán (Alt lo suelta, para colocarlo libre).
      if (iman && !ev.altKey) {
        const ix = imanEje(x, iman.x, iman.objetivos.x, IMAN_PX / cw)
        const iy = imanEje(y, iman.y, iman.objetivos.y, IMAN_PX / ch)
        x = ix.pos
        y = iy.pos
        setGuia({ v: ix.guias, h: iy.guias })
      } else setGuia(SIN_GUIAS)
      if (grupo) setDesplazo({ ids: new Set(grupo.map((p) => p.id).filter((g) => g !== id)), dx: x - inicio.x, dy: y - inicio.y })
      return { tipo, id, x, y, ...(inicio.ancho !== undefined ? { ancho: inicio.ancho } : {}), fin }
    }
    const alMover = (ev: PointerEvent) => {
      if (!movido && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return
      movido = true
      ultimo = calcular(ev)
      setBorrador(ultimo)
    }
    /** Una capa con fotogramas clave: lo que tiene claves se cambia en el cabezal; lo demás, fijo. */
    const moverConClaves = (capa: CapaTL, b: { x: number; y: number; ancho?: number }) => {
      const dt = reproductor.tiempo - capa.inicio
      let tl = timeline
      const fijos: Partial<CapaTL> = {}
      for (const [p, v] of [['x', b.x], ['y', b.y], ['ancho', b.ancho]] as const) {
        if (v === undefined) continue
        if (capa.claves?.[p]) tl = ponerClaveCapa(tl, capa.id, p, dt, v, medios)
        else fijos[p] = v
      }
      return Object.keys(fijos).length ? cambiarCapa(tl, capa.id, fijos, medios) : tl
    }
    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
      if (movido) ultimo = calcular(ev)
      setBorrador(null)
      setGuia(SIN_GUIAS)
      setDesplazo(null)
      // Soltar fuera de lo que se arrastró dispara un clic en el monitor (que reproduce): ese clic no cuenta.
      if (movido) {
        const parar = (c: MouseEvent) => c.stopPropagation()
        window.addEventListener('click', parar, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', parar, { capture: true }), 0)
      }
      if (movido && ultimo && grupo) {
        // El grupo entero, lo mismo que se movió el que se arrastró (lo bloqueado se queda).
        const dx = ultimo.x - inicio.x
        const dy = ultimo.y - inicio.y
        historial.aplicar(moverPiezas(timeline, grupo.map((p) => ({ ...p, dx, dy })), reproductor.tiempo, medios))
        return
      }
      if (movido && ultimo) {
        const b = ultimo
        const capa = tipo === 'capa' ? timeline.capas?.find((c) => c.id === id) : undefined
        const dt = capa ? Math.min(capa.duracion, Math.max(0, reproductor.tiempo - capa.inicio)) : 0
        // Un texto con fotogramas clave se cambia en su clave del cabezal.
        const texto = tipo === 'texto' ? timeline.textos.find((t) => t.id === id) : undefined
        const dtTexto = texto ? Math.min(texto.duracion, Math.max(0, reproductor.tiempo - texto.inicio)) : 0
        if (modo === 'giro' && b.giro !== undefined) {
          historial.aplicar(
            tipo === 'texto'
              ? cambiarTextoEn(timeline, id, { x: b.x, y: b.y, giro: b.giro }, dtTexto)
              : capa?.claves?.giro
                ? ponerClaveCapa(timeline, id, 'giro', dt, b.giro, medios)
                : b.fin && capa?.fin
                  ? cambiarCapa(timeline, id, { fin: { ...capa.fin, giro: b.giro } }, medios)
                  : cambiarCapa(timeline, id, { giro: b.giro }, medios)
          )
        } else if (modo === 'ancho' && tipo === 'capa' && b.ancho !== undefined) {
          // Solo el tamaño (el sitio de la capa, o la distancia a lo que sigue, no cambia).
          historial.aplicar(
            capa?.claves?.ancho
              ? ponerClaveCapa(timeline, id, 'ancho', dt, b.ancho, medios)
              : b.fin && capa?.fin
                ? cambiarCapa(timeline, id, { fin: { ...capa.fin, ancho: b.ancho } }, medios)
                : cambiarCapa(timeline, id, { ancho: b.ancho }, medios)
          )
        } else if (b.tamano !== undefined) historial.aplicar(cambiarTextoEn(timeline, id, { tamano: b.tamano }, dtTexto))
        else if (b.recorte) historial.aplicar(cambiarCapa(timeline, id, { recorte: b.recorte }, medios))
        else historial.aplicar(
          tipo === 'capa'
            ? capa?.sigue && !b.fin
              ? // Una capa que sigue algo: arrastrarla cambia a qué distancia va de eso (el arrastre parte de su x, y).
                cambiarCapa(timeline, id, { sigue: { ...capa.sigue, dx: capa.sigue.dx + (b.x - capa.x), dy: capa.sigue.dy + (b.y - capa.y) }, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) }, medios)
              : capa?.claves
              ? moverConClaves(capa, b)
              : b.fin && capa?.fin
              ? cambiarCapa(timeline, id, { fin: { ...capa.fin, x: b.x, y: b.y, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) } }, medios)
              : cambiarCapa(timeline, id, { x: b.x, y: b.y, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) }, medios)
            : cambiarTextoEn(timeline, id, { x: b.x, y: b.y }, dtTexto)
        )
      }
      onElegir({ tipo, id })
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  return (
    <div
      className={`monitor ${soltando ? 'is-destino' : ''}`}
      ref={monitorRef}
      onClick={reproductor.alternar}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TIPO_ARRASTRE_MEDIO)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!soltando) setSoltando(true)
      }}
      onDragLeave={() => setSoltando(false)}
      onDrop={soltar}
    >
      {src ? (
        <>
          {/* El video va en un lienzo del tamaño exacto del cuadro y que recorta lo que sobra: así el zoom y las
              transiciones (un barrido, el círculo) se mueven dentro del cuadro y no por el negro de los lados. */}
          <div className="monitor-lienzo" style={cw > 0 ? { width: cw, height: ch, filter: filtroAjuste } : undefined}>
            {/* Durante una transición, la foto del clip anterior queda debajo (sale empujada, se acerca o se
                funde), como en el MP4: sin ella, cada corte con transición parpadeaba a negro. */}
            {previoUrl && tr && (
              <img
                className="monitor-imagen"
                src={previoUrl}
                alt=""
                style={{
                  transform: `translate(${(tr.previo.x * 100).toFixed(2)}%, ${(tr.previo.y * 100).toFixed(2)}%) scale(${tr.previo.escala.toFixed(4)})`,
                  opacity: tr.previo.opacidad
                }}
              />
            )}
            <div className="monitor-movimiento" style={movimiento}>
              {/* Dos <video>: mientras uno suena, el otro ya está en el clip que sigue, y en el corte solo se cambia. */}
              {([0, 1] as const).map((i) => (
                <video
                  key={i}
                  className="monitor-video"
                  ref={reproductor.videos[i]}
                  data-pista-audio="video"
                  crossOrigin="anonymous"
                  preload="auto"
                  style={{ ...estiloImagen, visibility: vacia || enImagen || reproductor.activo !== i || conLut ? 'hidden' : 'visible' }}
                  {...reproductor.eventos}
                />
              ))}
              {enImagen && <img ref={imagenRef} className="monitor-imagen" src={reproductor.imagen!} alt="" crossOrigin="anonymous" style={{ ...estiloImagen, ...(conLut ? { visibility: 'hidden' } : {}) }} />}
              {/* Con LUT: el cuadro pasa por él con WebGL (el mismo LUT que el MP4) y tapa al video o la foto. */}
              {conLut && (
                <LienzoLut
                  url={mediaUrl(proyecto.id, clipActual!.lut!.archivo)}
                  intensidad={clipActual!.lut!.intensidad}
                  estilo={estiloImagen}
                  fuente={() => (enImagen ? imagenRef.current : reproductor.videos[reproductor.activo]?.current ?? null)}
                />
              )}
              {/* En pausa, lo que el monitor no pinta en vivo (el color por zonas): el cuadro ya pintado, con su encuadre. */}
              {vistaPrevia?.cuadro && !reproductor.reproduciendo && !enImagen && <img className="monitor-imagen monitor-fijo" src={vistaPrevia.cuadro} alt="" />}
              {/* Las zonas tapadas del clip: lo mismo que el MP4 (un recuadro difuminado o en negro). */}
              {!vacia &&
                clipActual?.zonas?.map((z0, k) => {
                  // Si sigue algo, su sitio es el de este momento de su recorrido.
                  const z = zonaMovida?.k === k ? zonaMovida.z : ubicado ? zonaEn(z0, ubicado.tFuente) : z0
                  // Con el clip elegido, la zona se mueve arrastrándola y se agranda desde su esquina.
                  const editable = elegido?.tipo === 'clip' && elegido.id === clipActual.id
                  const r = zonaEnPixeles(z, proyecto.source.width || 1920, proyecto.source.height || 1080)
                  const anchoFuente = proyecto.source.width || 1920
                  const alto = proyecto.source.height || 1080
                  const radio = Math.max(1, Math.floor((z.fuerza * Math.min(r.w, r.h)) / 5))
                  return (
                    <span
                      key={k}
                      className={`monitor-zona ${z.modo === 'negro' ? 'is-negro' : ''} ${z.modo === 'borrar' ? 'is-borrar' : ''} ${z.modo === 'recortar' ? 'is-recortar' : ''} ${editable ? 'is-editable' : ''}`}
                      title={editable ? `Zona ${k + 1}: arrástrala para moverla; desde la esquina, cambia su tamaño` : undefined}
                      onPointerDown={editable ? (e) => arrastrarZona(e, k, z, 'mover') : undefined}
                      onClick={editable ? (e) => e.stopPropagation() : undefined}
                      style={{
                        left: `${(r.x / anchoFuente) * 100}%`,
                        top: `${(r.y / alto) * 100}%`,
                        width: `${(r.w / anchoFuente) * 100}%`,
                        height: `${(r.h / alto) * 100}%`,
                        ...(z.modo === 'desenfoque' ? { backdropFilter: `blur(${((radio * 0.9 * cw) / anchoFuente).toFixed(1)}px)` } : {})
                      }}
                    >
                      {editable && <span className="monitor-zona-esquina" onPointerDown={(e) => arrastrarZona(e, k, z, 'tamano')} onClick={(e) => e.stopPropagation()} />}
                    </span>
                  )
                })}
            </div>
            {curvasAjuste.some(Boolean) && (
              <svg className="monitor-curvas" width="0" height="0" aria-hidden="true" focusable="false">
                {curvasAjuste.map(
                  (c, k) =>
                    c && (
                      <filter key={k} id={`${idCurvas}-aj${k}`} colorInterpolationFilters="sRGB">
                        <feComponentTransfer>
                          <feFuncR type="table" tableValues={c.r.join(' ')} />
                          <feFuncG type="table" tableValues={c.g.join(' ')} />
                          <feFuncB type="table" tableValues={c.b.join(' ')} />
                        </feComponentTransfer>
                      </filter>
                    )
                )}
              </svg>
            )}
            {curvas && (
              <svg className="monitor-curvas" width="0" height="0" aria-hidden="true" focusable="false">
                <filter id={idCurvas} colorInterpolationFilters="sRGB">
                  <feComponentTransfer>
                    <feFuncR type="table" tableValues={curvas.r.join(' ')} />
                    <feFuncG type="table" tableValues={curvas.g.join(' ')} />
                    <feFuncB type="table" tableValues={curvas.b.join(' ')} />
                  </feComponentTransfer>
                </filter>
              </svg>
            )}
          </div>
        </>
      ) : (
        <div className="monitor-vacio"><Icon name="play" size={28} /></div>
      )}
      {vista.musica && !proyecto.demo && (
        <audio ref={musicaRef} data-pista-audio="musica" crossOrigin="anonymous" src={mediaUrl(proyecto.id, vista.musica.archivo)} preload="auto" loop />
      )}
      {vista.voces?.length && !proyecto.demo ? <audio ref={vocesRef} data-pista-audio="voz" crossOrigin="anonymous" preload="auto" /> : null}
      {!proyecto.demo &&
        (vista.sonidos ?? []).map((s) => (
          <SonidoVista key={s.id} sonido={s} url={urlDe(s.archivo)} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} />
        ))}
      {/* Las letras propias del proyecto (las de la marca, las que trae el agente): el mismo archivo que usa el MP4. */}
      {timeline.letras?.length ? (
        <style>
          {timeline.letras
            .map((l) => `@font-face { font-family: "Recorte ${l.id}"; src: url("${mediaUrl(proyecto.id, l.archivo)}"); font-display: block; }`)
            .join(' ')}
        </style>
      ) : null}
      {cw > 0 && (
        <div className="monitor-cuadro" style={{ width: cw, height: ch, ['--rotulo' as string]: `${letra.toFixed(1)}px` }}>
          {capas.map((c) => {
            const f = fuentes[c.fuente]
            if (!f) return null
            const elegida = elegido?.tipo === 'capa' && elegido.id === c.id
            // Elegida y en pausa, una capa que se mueve se ve en su sitio de INICIO (sólida) y en el
            // de FIN (silueta punteada), las dos para arrastrarlas. Si no, donde va en este momento.
            const editando = elegida && !reproductor.reproduciendo
            const b = borrador?.tipo === 'capa' && borrador.id === c.id ? borrador : null
            const e0 = editando && !c.claves ? estadoCapa(c, 0, false) : estadoCapa(c, reproductor.tiempo - c.inicio, reproductor.reproduciendo)
            // Escena 2.5D: con profundidad, la capa sigue a la cámara del clip de debajo (más cuanto más cerca).
            const ref = editando ? null : referenciaParalaje(timeline, c)
            const e = ref ? { ...e0, ...aplicarParalaje(ref, c.profundidad ?? 0, c.inicio, reproductor.tiempo, e0) } : e0
            const x = b && !b.fin ? b.x : e.x
            const y = b && !b.fin ? b.y : e.y
            const ancho = b && !b.fin ? (b.ancho ?? e.ancho) : e.ancho
            const fin = editando && c.fin && !c.claves ? { ...c.fin, ...(b?.fin ? { x: b.x, y: b.y, ancho: b.ancho ?? c.fin.ancho } : {}) } : null
            // Las esquinas, el borde y la sombra, en píxeles de lo que se ve de ella (como el MP4).
            const rc = b?.recorte ?? c.recorte ?? { izq: 0, der: 0, arriba: 0, abajo: 0 }
            const medio = proyecto.medios?.find((m) => m.id === c.fuente)
            const aspecto = medio?.ancho && medio.alto ? medio.alto / medio.ancho : 1
            const marco = marcoCapa(c, ancho * cw * (1 - rc.izq - rc.der), ancho * cw * aspecto * (1 - rc.arriba - rc.abajo))
            const sombra = c.sombraCapa ? `drop-shadow(${marco.corre.toFixed(2)}px ${marco.corre.toFixed(2)}px ${(marco.sigma * 2).toFixed(2)}px ${conAlfa(c.colorSombraCapa ?? '#000000', SOMBRA_CAPA.opacidad)})` : ''
            const borrosa = desenfoqueCapaEn(timeline, c, reproductor.tiempo - c.inicio)
            return (
              <div
                key={c.id}
                className="monitor-capa-grupo"
                // Los subtítulos animados y la persona recortada ocupan todo el cuadro: no se agarran (se eligen en la timeline).
                style={{ ...(filtroAjuste ? { filter: filtroAjuste } : {}), ...(c.id === CAPA_SUBTITULOS || c.persona || c.borrado || c.cielo || c.roto ? { pointerEvents: 'none' } : {}) }}
              >
                {fin && (
                  <>
                    <svg className="monitor-recorrido" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <line x1={x * 100} y1={y * 100} x2={fin.x * 100} y2={fin.y * 100} />
                    </svg>
                    <div
                      className="monitor-capa is-fin"
                      title="Dónde termina: arrástrala"
                      style={{ left: `${fin.x * 100}%`, top: `${fin.y * 100}%`, width: `${fin.ancho * 100}%`, transform: `translate(-50%, -50%) rotate(${fin.giro}deg)` }}
                      onClick={(ev) => ev.stopPropagation()}
                      onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.fin!.x, y: c.fin!.y, ancho: c.fin!.ancho }, 'mover', true)}
                    >
                      {f.tipo === 'imagen' ? <img src={f.url} alt="" draggable={false} /> : <span className="monitor-capa-hueco" />}
                      <span
                        className="monitor-capa-esquina"
                        title="Arrastra para cambiar el tamaño final"
                        onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.fin!.x, y: c.fin!.y, ancho: c.fin!.ancho }, 'ancho', true)}
                      />
                    </div>
                  </>
                )}
              <div
                className={`monitor-capa ${elegida ? 'is-elegida' : ''} ${enGrupo(c.id) ? 'en-grupo' : ''}`}
                data-capa={c.id}
                style={{
                  ...corrido(c.id),
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${ancho * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${b && !b.fin && b.giro !== undefined ? b.giro : e.giro}deg) scale(${e.escala})`,
                  opacity: e.opacidad,
                  mixBlendMode: (MODOS_FUSION.find((m) => m.id === c.fusion)?.css ?? undefined) as React.CSSProperties['mixBlendMode'],
                  filter: `${sombra}${borrosa > 0.005 ? ` blur(${(borrosa * DESENFOQUE_MAX * cw).toFixed(2)}px)` : ''}`.trim() || undefined
                }}
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.x, y: c.y, ancho: c.ancho })}
              >
                {/* Lo recortado no se ve y la imagen va volteada si lo pide: lo mismo que el MP4 (drawbox, hflip, vflip). */}
                <div className="monitor-capa-medio" style={estiloMedioCapa(c, b?.recorte, marco.radio)}>
                  {f.tipo === 'imagen' ? (
                    <img src={f.url} alt="" draggable={false} />
                  ) : (
                    <CapaVideo capa={c} url={f.url} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} largo={medios[c.fuente]} />
                  )}
                </div>
                {/* El borde, por dentro de lo que se ve y con sus mismas esquinas. */}
                {marco.borde > 0 && (
                  <span
                    className="monitor-capa-borde"
                    style={{
                      left: `${rc.izq * 100}%`,
                      right: `${rc.der * 100}%`,
                      top: `${rc.arriba * 100}%`,
                      bottom: `${rc.abajo * 100}%`,
                      borderWidth: `${marco.borde.toFixed(2)}px`,
                      borderColor: c.colorBorde ?? '#ffffff',
                      borderRadius: `${marco.radio.toFixed(2)}px`
                    }}
                  />
                )}
                {/* El marco de lo que se ve de la capa (sirve al imán aunque no esté elegida); con ella elegida, sus tiradores. */}
                {(
                  <TiradoresCapa
                    recorte={b?.recorte ?? c.recorte}
                    elegida={elegida}
                    editable={elegida && !reproductor.reproduciendo && !c.bloqueado}
                    giro={b && !b.fin ? b.giro : undefined}
                    onArrastrar={(ev, modo) =>
                      arrastrar(ev, 'capa', c.id, modo === 'mover' ? { x: c.x, y: c.y, ancho: c.ancho } : { x, y, ancho, giro: e.giro, recorte: c.recorte }, modo)
                    }
                  />
                )}
              </div>
              </div>
            )
          })}
          {tr && tr.blanco > 0 && <div className="monitor-filtros" style={{ background: '#fff', opacity: tr.blanco }} aria-hidden />}
          {/* Los rótulos van debajo de los filtros (el grano y el polvo también los gastan, como en el kit); los
              subtítulos, encima y limpios. Igual que el MP4. */}
          {[...rotulos.filter((r) => !r.subtitulo), 'filtros' as const, ...rotulos.filter((r) => r.subtitulo)].map((r) => {
            if (r === 'filtros')
              return timeline.filtros && !vistaAhora ? <FiltrosVista key="filtros" filtros={timeline.filtros} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} ancho={cw} alto={ch} /> : null
            const b = borrador?.tipo === 'texto' && borrador.id === r.id ? borrador : null
            const propia = typeof r.x === 'number' && typeof r.y === 'number' ? { x: r.x, y: r.y } : null
            // Agrandándolo, se queda donde estaba (arriba, al centro o abajo si no tiene sitio propio).
            const libre = b && b.tamano === undefined ? b : propia
            const elegida = elegido?.tipo === 'texto' && elegido.id === r.id
            return (
              <span
                key={r.id}
                className={`monitor-rotulo ${libre ? 'libre' : r.posicion} ${r.sinCaja ? 'sin-caja' : ''} ${r.sinCaja && letraOscura(r) ? 'tinta' : ''} ${elegida || enGrupo(r.id) ? 'is-elegida' : ''} ${r.detras ? 'detras' : ''}`}
                data-texto={r.id}
                style={{
                  ...corrido(r.id),
                  ...(libre ? { left: `${libre.x * 100}%`, top: `${libre.y * 100}%`, ...anclajeRotulo(r, b?.giro) } : {}),
                  ...estiloRotulo(r),
                  ...(reproductor.reproduciendo && (r.salida || animaEntero(r.animacion)) ? estiloAnimado(r, reproductor.tiempo - r.inicio, libre ? String(anclajeRotulo(r, b?.giro).transform) : null) : {}),
                  ...((b?.tamano ?? r.tamano) ? { fontSize: `calc(var(--rotulo) * ${b?.tamano ?? r.tamano})` } : {}),
                  ...(r.color ? { color: r.color } : {}),
                  ...(r.caja && !r.sinCaja ? { background: r.caja } : {}),
                  ...(() => {
                    // La letra: una de la lista o una propia del proyecto (registrada abajo con @font-face).
                    const f = letraDe(r.fuente, timeline.letras)
                    return f ? { fontFamily: `"${f.css}", Arial, sans-serif`, fontWeight: f.negrita ? 700 : 400, fontStyle: f.cursiva ? 'italic' : 'normal' } : {}
                  })()
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => arrastrar(e, 'texto', r.id, libre ?? centroEnCuadro(e.currentTarget))}
              >
                {reproductor.reproduciendo && r.animacion ? <TextoAnimado texto={r} dt={reproductor.tiempo - r.inicio} /> : <ConClave texto={r} />}
                {elegida && !reproductor.reproduciendo && !r.bloqueado && (
                  <>
                    <span
                      className="monitor-tirador esquina se"
                      title="Arrastra para cambiar el tamaño de la letra"
                      onPointerDown={(e) => {
                        const el = e.currentTarget.closest('.monitor-rotulo') as HTMLElement
                        arrastrar(e, 'texto', r.id, { ...(propia ?? centroEnCuadro(el)), tamano: r.tamano ?? 1 }, 'ancho')
                      }}
                    />
                    <span
                      className="monitor-tirador giro"
                      title="Arrastra para girarlo (con Mayús, de 15 en 15°)"
                      onPointerDown={(e) => {
                        const el = e.currentTarget.closest('.monitor-rotulo') as HTMLElement
                        arrastrar(e, 'texto', r.id, { ...(propia ?? centroEnCuadro(el)), giro: r.giro ?? 0 }, 'giro')
                      }}
                    >
                      {b?.giro !== undefined && <span className="monitor-grados">{Math.round(b.giro)}°</span>}
                    </span>
                  </>
                )}
              </span>
            )
          })}
          {verZona && <ZonaSegura />}
          {guia.v.map((g) => (
            <span key={`v${g.v}`} className={`monitor-guia v is-${g.tipo}`} style={{ left: `${g.v * 100}%` }} />
          ))}
          {guia.h.map((g) => (
            <span key={`h${g.v}`} className={`monitor-guia h is-${g.tipo}`} style={{ top: `${g.v * 100}%` }} />
          ))}
        </div>
      )}
      {cw > 0 && (vistaAhora || vistaLuego) && (
        <div className="monitor-cuadro monitor-vista" style={{ width: cw, height: ch }} aria-hidden>
          {[vistaAhora, vistaLuego].map((t) =>
            t ? (
              <VideoVista
                key={t.clave}
                url={mediaUrl(proyecto.id, `vista-previa/${t.clave}.mp4`)}
                esperado={t === vistaAhora ? reproductor.tiempo - t.desde : 0}
                activo={t === vistaAhora}
                reproduciendo={reproductor.reproduciendo && t === vistaAhora}
              />
            ) : null
          )}
        </div>
      )}
      {src && !vacia && !proyecto.demo && (
        <button
          className={`monitor-medidores-boton ${verMedidores ? 'is-on' : ''}`}
          title="Medidores de color: forma de onda, vectorscopio e histograma"
          aria-pressed={verMedidores}
          onClick={(e) => {
            e.stopPropagation()
            alternarMedidores()
          }}
        >
          <Icon name="sliders" size={14} />
        </button>
      )}
      {src && !vacia && (
        <button
          className={`monitor-medidores-boton monitor-zona-boton ${verZona ? 'is-on' : ''}`}
          title="Zona segura: el recuadro de fuera (90 %) es lo que se ve siempre; el de dentro (80 %), donde van los textos y lo importante. Al arrastrar, las cosas se pegan a sus bordes (Alt para soltarlas). No sale en el video."
          aria-pressed={verZona}
          onClick={(e) => {
            e.stopPropagation()
            alternarZona()
          }}
        >
          <Icon name="zonaSegura" size={14} />
        </button>
      )}
      {verMedidores && src && !vacia && !proyecto.demo && (
        <Medidores
          video={reproductor.videoRef.current}
          // El color del clip y de las capas de ajuste, como lo pinta el monitor (sin los desenfoques).
          filtro={[estiloImagen.filter, filtroAjuste].filter(Boolean).join(' ').replace(/blur([^)]*)/g, '').trim()}
          tiempo={reproductor.tiempo}
          reproduciendo={reproductor.reproduciendo}
        />
      )}
      {!reproductor.reproduciendo && src && !vacia && (
        <span className="monitor-play"><Icon name="play" size={26} /></span>
      )}
    </div>
  )
}

/** Un tramo ya renderizado: mudo (el sonido sigue saliendo de las pistas) y al compás del cabezal. */
function VideoVista({ url, esperado, activo, reproduciendo }: { url: string; esperado: number; activo: boolean; reproduciendo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useSincronizar(ref, esperado, reproduciendo, 0)
  return <video ref={ref} src={url} muted preload="auto" className={activo ? undefined : 'is-oculto'} />
}

/** Una toma de apoyo encima: un video mudo que sigue al cabezal. */
function CapaVideo({ capa, url, tiempo, reproduciendo, largo }: { capa: CapaTL; url: string; tiempo: number; reproduciendo: boolean; largo?: number }) {
  const ref = useRef<HTMLVideoElement>(null)
  // Un clip más corto que la capa vuelve a empezar (como en el MP4).
  const t = (capa.desde ?? 0) + Math.max(0, tiempo - capa.inicio)
  useSincronizar(ref, largo && largo > 0.1 ? t % largo : t, reproduciendo)
  return <video ref={ref} src={url} muted preload="auto" />
}

/** Un efecto de sonido: suena solo en su tramo. */
function SonidoVista({ sonido, url, tiempo, reproduciendo }: { sonido: SonidoTL; url: string; tiempo: number; reproduciendo: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const dentro = tiempo >= sonido.inicio && tiempo < sonido.inicio + sonido.duracion
  useSincronizar(ref, dentro ? tiempo - sonido.inicio + (sonido.desde ?? 0) : null, reproduciendo, sonido.volumen ?? VOLUMEN_SONIDO)
  return <audio ref={ref} data-pista-audio="sonidos" crossOrigin="anonymous" src={url} preload="auto" />
}

/**
 * Los filtros del video en el monitor, como en el MP4: la viñeta y la trama son degradados; el
 * grano y el polvo, un lienzo que cambia en cada cuadro al reproducir; el parpadeo, un velo que tiembla.
 */
function FiltrosVista({ filtros, tiempo, reproduciendo, ancho, alto }: { filtros: FiltrosTL; tiempo: number; reproduciendo: boolean; ancho: number; alto: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { grano = 0, polvo = 0, trama = 0, vineta = 0, parpadeo = 0 } = filtros
  useEffect(() => {
    const cv = lienzo.current
    if (!cv || (!grano && !polvo)) return
    const w = Math.max(16, Math.round(ancho / 3))
    const h = Math.max(16, Math.round(alto / 3))
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let cuadro = 0
    let vivo = true
    const pintar = () => {
      const img = ctx.createImageData(w, h)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        // Grano: gris al azar alrededor del medio (se mezcla en «overlay»); polvo: alguna mota blanca.
        const g = 128 + (Math.random() - 0.5) * 255 * grano
        const mota = polvo && Math.random() > 1 - 0.0016 * polvo
        const v = mota ? 255 : g
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = mota ? 255 : grano ? 255 : 0
      }
      ctx.putImageData(img, 0, 0)
      // La raya vertical que salta de sitio, como en el MP4.
      if (polvo && cuadro % 7 > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillRect((cuadro * 97) % w, 0, 1, h)
      }
      cuadro++
    }
    pintar()
    if (!reproduciendo) return
    const id = window.setInterval(() => vivo && pintar(), 1000 / 24)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [grano, polvo, reproduciendo, ancho, alto])
  const brillo = parpadeo ? 0.045 * parpadeo * Math.sin(tiempo * 31) * Math.sin(tiempo * 7.3) : 0
  const punto = Math.max(2, ancho / 180)
  return (
    <div className="monitor-filtros" aria-hidden>
      {trama > 0 && (
        <div
          className="monitor-filtro"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.85) 30%, rgba(255,255,255,0.6) 62%)',
            backgroundSize: `${punto}px ${punto}px`,
            mixBlendMode: 'overlay',
            opacity: 0.45 * trama
          }}
        />
      )}
      {(grano > 0 || polvo > 0) && <canvas ref={lienzo} className="monitor-filtro" style={{ mixBlendMode: grano ? 'overlay' : 'screen', opacity: Math.min(1, 0.35 + 0.5 * Math.max(grano, polvo)) }} />}
      {vineta > 0 && (
        <div className="monitor-filtro" style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(70 - 30 * vineta)}%, rgba(0,0,0,${(0.9 * vineta).toFixed(2)}) 100%)` }} />
      )}
      {brillo !== 0 && <div className="monitor-filtro" style={{ background: brillo > 0 ? '#fff' : '#000', opacity: Math.abs(brillo) }} />}
    </div>
  )
}

/** Un rótulo que aparece palabra a palabra, letra a letra, con rebote o subiendo (como en el MP4). */
/** El texto con sus palabras resaltadas (las de entre *asteriscos*) en su color. */
function ConClave({ texto }: { texto: TextoTL }) {
  const partes = partesClave(texto.texto)
  if (partes.length <= 1 && !partes[0]?.clave) return <>{sinMarcas(texto.texto)}</>
  return (
    <>
      {partes.map((p, i) =>
        p.clave ? (
          <span key={i} style={{ color: texto.colorClave ?? COLOR_PINTADO }}>
            {p.texto}
          </span>
        ) : (
          <Fragment key={i}>{p.texto}</Fragment>
        )
      )}
    </>
  )
}

/**
 * Un rótulo yéndose (salidaTexto): su opacidad (por la suya), su escala y su desenfoque. Se encoge hacia su punto de
 * anclaje, como en el MP4 (arriba, abajo o su sitio propio).
 */
/** Las entradas que mueven el rótulo entero (con su caja, como en el MP4): no las de palabra o letra a letra. */
const animaEntero = (a: TextoTL['animacion']): boolean => a === 'pop' || a === 'rotulo' || a === 'subir' || a === 'desenfoque'

/** Cómo está la entrada de un rótulo que se anima entero `dt` segundos después de aparecer (lo mismo que animarAss). */
function entradaEntera(r: TextoTL, dt: number): { opacidad: number; escala: number; sube: number; desenfoque: number } {
  if (r.animacion === 'pop') {
    const e = dt < 0.13 ? 0.45 + (dt / 0.13) * 0.72 : dt < 0.24 ? 1.17 - ((dt - 0.13) / 0.11) * 0.17 : 1
    return { opacidad: Math.min(1, dt / 0.08), escala: e, sube: 0, desenfoque: 0 }
  }
  if (r.animacion === 'rotulo') return { opacidad: Math.min(1, dt / 0.15), escala: 0.86 + 0.14 * Math.min(1, dt / 0.2), sube: 0, desenfoque: 0 }
  if (r.animacion === 'subir') return { opacidad: Math.min(1, dt / 0.25), escala: 1, sube: Math.max(0, 1 - dt / 0.35), desenfoque: 0 }
  if (r.animacion === 'desenfoque') return { opacidad: Math.min(1, dt / 0.25), escala: 1, sube: 0, desenfoque: DESENFOQUE_TEXTO * (1 - Math.min(1, dt / 0.35)) }
  return { opacidad: 1, escala: 1, sube: 0, desenfoque: 0 }
}

/**
 * Un rótulo entrando o yéndose, entero (la letra y su caja, como el MP4): su opacidad (por la suya), su escala, lo que
 * sube y su desenfoque. Se escala sobre su punto de anclaje, después de colocarlo.
 */
function estiloAnimado(r: TextoTL, dt: number, transformLibre: string | null): React.CSSProperties {
  const s = salidaTexto(r, dt)
  const e = animaEntero(r.animacion) ? entradaEntera(r, dt) : { opacidad: 1, escala: 1, sube: 0, desenfoque: 0 }
  const escala = s.escala * e.escala
  const base = transformLibre ?? (r.posicion === 'centro' ? 'translate(-50%, -50%)' : 'translateX(-50%)')
  // Con caja, el MP4 la centra en su sitio (y la escala sobre su centro); sin caja, arriba o abajo se ancla en su borde.
  const borde = !transformLibre && r.sinCaja && r.posicion !== 'centro'
  const desenfoque = s.desenfoque + e.desenfoque
  return {
    opacity: (r.opacidad ?? 1) * s.opacidad * e.opacidad,
    ...(escala !== 1 || e.sube > 0
      ? {
          transform: `${base}${e.sube > 0 ? ` translateY(${(e.sube * 0.6).toFixed(3)}em)` : ''}${escala !== 1 ? ` scale(${escala.toFixed(4)})` : ''}`,
          ...(borde ? { transformOrigin: r.posicion === 'arriba' ? 'center top' : 'center bottom' } : {})
        }
      : {}),
    ...(desenfoque > 0.0005 ? { filter: `blur(${desenfoque.toFixed(3)}em)` } : {})
  }
}

/** Lo que tarda cada palabra en pasar de borrosa a nítida (como el MP4: PALABRA_NITIDA_S en exportar.ts). */
const PALABRA_NITIDA_S = 0.3

function TextoAnimado({ texto, dt }: { texto: TextoTL; dt: number }) {
  // Las que mueven el rótulo entero las hace estiloAnimado sobre el rótulo (con su caja): aquí, la letra quieta.
  if (animaEntero(texto.animacion)) return <ConClave texto={texto} />
  const paso = pasoAnimacion(texto)
  const tiempos = tiemposPalabras(texto)
  if (texto.animacion === 'pintar') {
    // Karaoke: la frase entera en su color y cada palabra se rellena del color pintado mientras se dice (como el MP4).
    const pintado = texto.pintado ?? COLOR_PINTADO
    let k = 0
    return (
      <>
        {sinMarcas(texto.texto).split(/(\s+)/).map((x, i) => {
          if (!x || /^\s+$/.test(x)) return x
          const w = tiempos[k++]
          const p = w ? Math.max(0, Math.min(1, (dt - w.inicio) / w.dura)) : 0
          return (
            <span key={i} className="texto-pintar">
              {x}
              <span className="texto-pintar-color" aria-hidden style={{ color: pintado, clipPath: `inset(-20% ${((1 - p) * 100).toFixed(2)}% -20% -2%)` }}>
                {x}
              </span>
            </span>
          )
        })}
      </>
    )
  }
  // Palabra a palabra (con su color si está entre *asteriscos*) o letra a letra.
  const piezas =
    porPalabras(texto.animacion)
      ? partesClave(texto.texto).flatMap((p) => p.texto.split(/(\s+)/).map((x) => ({ x, clave: p.clave })))
      : Array.from(sinMarcas(texto.texto)).map((x) => ({ x, clave: false }))
  let n = 0
  return (
    <>
      {piezas.map(({ x, clave }, i) => {
        if (!x || /^\s+$/.test(x)) return x
        const desde = porPalabras(texto.animacion) ? (tiempos[n]?.inicio ?? n * paso) : n * paso
        n++
        // De borrosa a nítida: aparece y se aclara a la vez (\blur en el MP4).
        const nitida = texto.animacion === 'palabras-desenfoque'
        const op = Math.max(0, Math.min(1, (dt - desde) / (nitida ? PALABRA_NITIDA_S : APARECER_S)))
        return (
          <span
            key={i}
            style={{
              opacity: op,
              ...(nitida && op < 1 ? { display: 'inline-block', filter: `blur(${(DESENFOQUE_TEXTO * (1 - op)).toFixed(3)}em)` } : {}),
              ...(clave ? { color: texto.colorClave ?? COLOR_PINTADO } : {})
            }}
          >
            {x}
          </span>
        )
      })}
    </>
  )
}

/**
 * Los tiradores de la capa elegida: las cuatro esquinas cambian su tamaño (sobre su centro), el de arriba la gira y
 * los de los lados la recortan (como en Canva). Van sobre lo que se ve de ella (lo recortado no cuenta).
 */
function TiradoresCapa({
  recorte,
  elegida,
  editable,
  giro,
  onArrastrar
}: {
  recorte: RecorteCapa | undefined
  elegida: boolean
  editable: boolean
  /** Mientras se gira: el giro, para verlo en grados. */
  giro: number | undefined
  onArrastrar: (e: React.PointerEvent, modo: ModoArrastre) => void
}) {
  const r = recorte ?? { izq: 0, der: 0, arriba: 0, abajo: 0 }
  const marco: React.CSSProperties = { left: `${r.izq * 100}%`, right: `${r.der * 100}%`, top: `${r.arriba * 100}%`, bottom: `${r.abajo * 100}%` }
  return (
    <span className={`monitor-capa-marco ${elegida ? 'is-elegida' : ''}`} style={marco}>
      {editable && (
        <>
          {(['nw', 'ne', 'sw', 'se'] as const).map((k) => (
            <span key={k} className={`monitor-tirador esquina ${k}`} title="Arrastra para cambiar el tamaño" onPointerDown={(e) => onArrastrar(e, 'ancho')} />
          ))}
          {(
            [
              ['izq', 'Arrastra para recortar por la izquierda'],
              ['der', 'Arrastra para recortar por la derecha'],
              ['arriba', 'Arrastra para recortar por arriba'],
              ['abajo', 'Arrastra para recortar por abajo']
            ] as const
          ).map(([k, titulo]) => (
            <span key={k} className={`monitor-tirador lado ${k}`} title={titulo} onPointerDown={(e) => onArrastrar(e, `recorte-${k}`)} />
          ))}
          <span className="monitor-tirador giro" title="Arrastra para girarla (con Mayús, de 15 en 15°)" onPointerDown={(e) => onArrastrar(e, 'giro')}>
            {giro !== undefined && <span className="monitor-grados">{Math.round(giro)}°</span>}
          </span>
        </>
      )}
    </span>
  )
}

/** La zona segura, como en Premiere y HyperFrames: acción (90 %) y títulos (80 %), con una marca en el medio de cada lado. */
function ZonaSegura() {
  const caja = (m: number) => {
    const a = m * 100
    const b = 100 - a
    return (
      <>
        <rect x={a} y={a} width={b - a} height={b - a} />
        <line x1={50} y1={a} x2={50} y2={a + 2} />
        <line x1={50} y1={b} x2={50} y2={b - 2} />
        <line x1={a} y1={50} x2={a + 1.2} y2={50} />
        <line x1={b} y1={50} x2={b - 1.2} y2={50} />
      </>
    )
  }
  return (
    <svg className="monitor-zona-segura" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <g className="accion">{caja(ZONA_ACCION)}</g>
      <g className="titulo">{caja(ZONA_TITULO)}</g>
    </svg>
  )
}
