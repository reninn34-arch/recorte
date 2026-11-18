import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OpcionesExport, Progreso } from '../../../shared/api'
import type { ClipSuggestion, MedioProyecto, Project, RenderJob } from '../../../shared/types'
import { ClipList } from './ClipList'
import { EdicionCard } from './EdicionCard'
import { Inspector } from './Inspector'
import { RenderQueue } from './RenderQueue'
import { SourceCard } from './SourceCard'
import { Icon } from '../Icons'
import { PanelMulticam } from './Multicam'
import { MonitorOrigen } from './MonitorOrigen'
import { useMenuContextual } from './MenuContextual'
import { PanelHistorial } from './PanelHistorial'
import { PanelLimpieza } from './PanelLimpieza'
import { PanelAudio } from './PanelAudio'
import { PanelPiezas } from './PanelPiezas'
import { SubtitulosAnimados } from './SubtitulosAnimados'

const CLAVE_ALTO_TL = 'recorte.altoLineaDeTiempo'
import { mediaUrl } from '../media'
import { useVistaPrevia } from '../hooks/vistaprevia'
import { ajustarClip, anadirCapa, borrarCapa, duracionesDeMedios, ponerMusica, anadirSonido, sobrescribirClip, separarAudio, sonidoUnicoMulticam, inicioEscenaMulticam, anidarClips, clipsSeguidos, cambiarATramo, ubicar, capaNueva, cambiarCapa, cambiarFuente, escalaAnimada, type TipoAnimar, duracionTimeline, DURACION_IMAGEN, insertarClip, MAX_IMAGEN, quitarFuente, timelineDesdeCortes, timelineDesdeReceta, timelineInicial, timelineVacia, timelineActiva, type Timeline } from '../../../shared/timeline'
import { useHistorial, useReproductor, type FuentesVista } from '../hooks/timeline'
import { Monitor } from './Monitor'
import { MediosPanel } from './MediosPanel'
import { TimelineEditor, type Elegido } from './TimelineEditor'
import type { PuenteEditor } from './ChatAgente'

/**
 * Cara de editor: monitor + línea de tiempo + herramientas.
 * Las funciones viejas (clips, edición con agente, cola) viven como
 * herramientas bajo la línea de tiempo; el video manda.
 */


export function Editor({
  proyecto,
  progreso,
  seleccion,
  onSelect,
  clip,
  onCambiarClip,
  onRenderClip,
  renderizando,
  editando,
  generando,
  onEditar,
  onRenderizarEdicion,
  onAbrirEdicion,
  onTranscribir,
  onCambiarTimeline,
  exportando,
  onExportar,
  onAbrirExportacion,
  puente,
  onAviso,
  carpetaVideos,
  onMedios,
  cola,
  pendientesLote,
  lote,
  onRenderLote,
  onAbrirSalida,
  textoVacio,
  onPendienteAplicada
}: {
  /** La versión nueva del agente ya se puso en la timeline: se quita de pendiente. */
  onPendienteAplicada: () => void
  proyecto: Project
  progreso: Progreso | null
  seleccion: string
  onSelect: (id: string) => void
  clip: ClipSuggestion | undefined
  onCambiarClip: (cambio: Partial<ClipSuggestion>) => void
  onRenderClip: () => void
  renderizando: boolean
  editando: boolean
  generando: boolean
  onEditar: () => void
  onRenderizarEdicion: () => void
  onAbrirEdicion: () => void
  onTranscribir: () => void
  onCambiarTimeline: (timeline: Timeline) => void
  exportando: boolean
  onExportar: (opciones: OpcionesExport) => void
  onAbrirExportacion: () => void
  puente: React.RefObject<PuenteEditor | null>
  onAviso: (texto: string) => void
  carpetaVideos?: string
  /** La biblioteca de medios cambió (el proceso principal la guarda). */
  onMedios: (medios: MedioProyecto[]) => void
  cola: RenderJob[]
  pendientesLote: number
  lote: { indice: number; total: number } | null
  onRenderLote: () => void
  onAbrirSalida: (job: RenderJob) => void
  textoVacio: string
}) {
  // Los paneles del editor: la línea de tiempo dibuja en ellos su biblioteca, su inspector y el transporte.
  const [panelBiblioteca, setPanelBiblioteca] = useState<HTMLElement | null>(null)
  const [panelInspector, setPanelInspector] = useState<HTMLElement | null>(null)
  const [panelTransporte, setPanelTransporte] = useState<HTMLElement | null>(null)
  const [elegido, setElegido] = useState<Elegido>(null)
  // El alto de la línea de tiempo (arrastrando el divisor); null: el de siempre.
  const [altoTL, setAltoTL] = useState<number | null>(() => {
    try {
      const v = Number(localStorage.getItem(CLAVE_ALTO_TL))
      return v >= 150 ? v : null
    } catch {
      return null
    }
  })
  const elegir = useCallback((e: Elegido) => setElegido(e), [])
  const timeline = proyecto.timeline ?? timelineVacia()
  const historial = useHistorial(timeline, onCambiarTimeline, proyecto.id)
  const fuentes = useMemo<FuentesVista>(() => {
    const lista: FuentesVista = { principal: { url: mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente'), tipo: 'video' } }
    for (const m of proyecto.medios ?? []) lista[m.id] = { url: mediaUrl(proyecto.id, `medio/${m.id}`) + (m.proxy ? '?copia=1' : ''), tipo: m.tipo }
    return lista
  }, [proyecto.id, proyecto.proxy, proyecto.medios])
  // Lo que suena y se ve es la timeline sin las pistas silenciadas (los clips no cambian de sitio).
  const activa = useMemo(() => timelineActiva(timeline), [timeline])
  const reproductor = useReproductor(activa, proyecto.id, fuentes)
  // Los tramos pesados ya renderizados: el monitor los reproduce sin componerlos en vivo.
  const vistaPrevia = useVistaPrevia(proyecto, timeline, reproductor.reproduciendo, reproductor.tiempo)
  const [agregando, setAgregando] = useState(false)

  // Una versión nueva del agente llega como timeline pendiente: entra como un paso más, así
  // Ctrl+Z vuelve a la versión anterior con lo que retocaste a mano.
  useEffect(() => {
    const nueva = proyecto.timelinePendiente
    if (!nueva) return
    reproductor.pausar()
    historial.aplicar(nueva)
    setElegido(null)
    // El cabezal se queda donde estaba si sigue cabiendo (un retoque del agente no te saca de ahí).
    if (reproductor.tiempo >= duracionTimeline(nueva)) reproductor.buscar(0)
    onPendienteAplicada()
    onAviso('El agente cambió la timeline. Ctrl+Z vuelve a como estaba, con tus retoques.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id, proyecto.timelinePendiente])

  const duracionDe = (fuente: string) => {
    if (fuente === 'principal') return proyecto.source.duration
    const m = proyecto.medios?.find((x) => x.id === fuente)
    return m ? (m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion) : 0
  }
  /** Lo que dura cada medio (una imagen, lo que se quiera): para validar capas y clips. */
  const duraciones = useMemo(() => {
    const d: Record<string, number> = { principal: proyecto.source.duration }
    for (const m of proyecto.medios ?? []) d[m.id] = m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion
    return d
  }, [proyecto.source.duration, proyecto.medios])
  const nombreDe = (fuente: string) => (fuente === 'principal' ? proyecto.source.name : (proyecto.medios?.find((x) => x.id === fuente)?.nombre ?? '?'))

  /** La miniatura de cada fuente, para verla dentro de sus clips en la línea de tiempo. */
  const miniaturaDe = (fuente: string): string | undefined => {
    if (proyecto.demo) return undefined
    if (fuente === 'principal') return proyecto.thumbnail ? mediaUrl(proyecto.id, proyecto.thumbnail) : undefined
    const m = proyecto.medios?.find((x) => x.id === fuente)
    if (!m) return undefined
    return m.tipo === 'imagen' ? mediaUrl(proyecto.id, `medio/${m.id}`) : m.miniatura ? mediaUrl(proyecto.id, m.miniatura) : undefined
  }

  /** Pone un medio en la timeline (entero; una imagen, 4 s) o encima del video. Se puede deshacer. */
  function poner(fuente: string, donde: 'final' | 'cabezal' | 'encima', base = timeline) {
    const m = proyecto.medios?.find((x) => x.id === fuente)
    if (donde === 'encima') {
      if (!m) return base
      const r = capaNueva(base, m.id, m.tipo, reproductor.tiempo, duraciones)
      if (r.timeline !== base) setElegido({ tipo: 'capa', id: r.id })
      return r.timeline
    }
    const salida = fuente === 'principal' ? proyecto.source.duration : m?.tipo === 'imagen' ? DURACION_IMAGEN : (m?.duracion ?? 0)
    if (salida <= 0) return base
    const r = insertarClip(base, { fuente, entrada: 0, salida }, donde === 'cabezal' ? reproductor.tiempo : undefined)
    return r.timeline
  }

  /** Quita el fondo de la imagen de una capa: el recorte entra a la biblioteca y la capa pasa a usarlo. */
  const [quitandoFondo, setQuitandoFondo] = useState(false)
  async function quitarFondo(capaId: string) {
    const capa = timeline.capas?.find((c) => c.id === capaId)
    if (!capa || quitandoFondo) return
    setQuitandoFondo(true)
    try {
      const r = await window.recorte.quitarFondo(proyecto.id, capa.fuente)
      onMedios(r.project.medios ?? [])
      // Un video sin fondo (WebM con transparencia) dura lo que el original; una imagen, lo que haga falta.
      const nuevo = r.project.medios?.find((m) => m.id === r.medio)
      const dura = nuevo?.tipo === 'video' && nuevo.duracion > 0 ? nuevo.duracion : MAX_IMAGEN
      historial.aplicar(cambiarCapa(timeline, capaId, { fuente: r.medio }, { ...duraciones, [r.medio]: dura }))
      onAviso(`Listo: ${nuevo?.tipo === 'video' ? 'el video ya no tiene el fondo verde' : 'la capa ya no tiene fondo'}. El original sigue en la biblioteca.`)
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setQuitandoFondo(false)
    }
  }

  /**
   * Congelar cuadro: el cuadro del cabezal sale como imagen y entra ahí mismo como un clip quieto de 2 s, con el color
   * y el encuadre del clip de donde sale.
   */
  const [congelando, setCongelando] = useState(false)
  /** El video abierto en el monitor de origen (o ninguno). */
  const [origen, setOrigen] = useState<string | null>(null)
  /** Separar el audio de un clip: su sonido pasa a la pista de sonidos y el clip queda mudo. */
  const [separando, setSeparando] = useState(false)
  /** Separa el sonido de uno o varios clips de video (con su velocidad) en la pista de sonidos, en un solo paso. */
  async function separarAudioDe(ids: string | string[]) {
    const lista = (Array.isArray(ids) ? ids : [ids]).map((id) => timeline.clips.find((x) => x.id === id)).filter((c): c is NonNullable<typeof c> => !!c)
    if (!lista.length || separando) return
    const conRampa = lista.filter((c) => c.rampa)
    if (conRampa.length === lista.length) {
      onAviso('Ese clip tiene una rampa de velocidad: quítala (o ponle una velocidad fija) para separar su sonido.')
      return
    }
    setSeparando(true)
    try {
      let tl = timeline
      for (const c of lista.filter((x) => !x.rampa)) {
        const r = await window.recorte.extraerAudio(proyecto.id, c.fuente, c.entrada, c.salida, c.velocidad ?? 1)
        tl = separarAudio(tl, c.id, r.archivo, r.nombre, r.duracion)
      }
      historial.aplicar(tl)
      const n = lista.length - conRampa.length
      onAviso(
        `Listo: ${n === 1 ? 'el sonido quedó' : `el sonido de los ${n} clips quedó`} aparte en la pista de sonidos. Muévelo o recórtalo sin tocar la imagen` +
          (conRampa.length ? ` (${conRampa.length} con rampa de velocidad no se separaron).` : '. Clic derecho en él: «Volver a unir al video».')
      )
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setSeparando(false)
    }
  }
  /** Anidar: los clips seguidos elegidos pasan a ser uno (renderizado), con los de dentro guardados para desanidar. */
  const [anidando, setAnidando] = useState(false)
  async function anidar(ids: string[]) {
    const indices = clipsSeguidos(timeline, ids)
    if (!indices || anidando) {
      if (!indices) onAviso('Para anidar, elige dos o más clips seguidos de la pista de video (Ctrl + clic).')
      return
    }
    setAnidando(true)
    try {
      const r = await window.recorte.anidar(proyecto.id, indices.map((i) => timeline.clips[i]))
      onMedios(r.project.medios ?? [])
      const hecho = anidarClips(timeline, ids, r.medio, r.duracion)
      historial.aplicar(hecho.timeline)
      onAviso(`Listo: ${indices.length} clips quedaron en uno. Puedes desanidarlo cuando quieras.`)
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setAnidando(false)
    }
  }
  /** Exportar cuadro: el cuadro del cabezal, con todo lo de encima, como PNG en la carpeta de videos. */
  const [sacandoCuadro, setSacandoCuadro] = useState(false)
  async function exportarCuadro() {
    if (sacandoCuadro) return
    setSacandoCuadro(true)
    try {
      const r = await window.recorte.exportarCuadro(proyecto.id, timeline, reproductor.tiempo)
      onAviso(r.ok && r.archivo ? `Guardé el cuadro en ${r.archivo}` : (r.error ?? 'No pude guardar el cuadro.'))
    } catch (error) {
      onAviso(error instanceof Error ? error.message : String(error))
    } finally {
      setSacandoCuadro(false)
    }
  }
  /** Estabiliza el clip: su tramo sale estable a la biblioteca y el clip pasa a usarlo, con sus ajustes y sus claves. */
  const [estabilizando, setEstabilizando] = useState<string | null>(null)
  async function estabilizar(clipId: string) {
    const c = timeline.clips.find((x) => x.id === clipId)
    if (!c || estabilizando) return
    setEstabilizando(clipId)
    try {
      const r = await window.recorte.estabilizar(proyecto.id, c.fuente, c.entrada, c.salida)
      onMedios(r.project.medios ?? [])
      historial.aplicar(cambiarATramo(timeline, clipId, r.medio, r.desde))
      onAviso('Listo: el clip quedó estabilizado (con los bordes un poco recortados). El original sigue en la biblioteca.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setEstabilizando(null)
    }
  }
  /**
   * Separa a la persona del fondo del clip: su recorte (tal como se ve el clip) queda encima de él, en la pista 3. Lo
   * que vaya en las pistas 1 y 2 y los textos «detrás» se ven por detrás de ella.
   */
  const [recortandoPersona, setRecortandoPersona] = useState<{ clip: string; pct: number } | null>(null)
  async function separarPersona(clipId: string) {
    if (recortandoPersona || !timeline.clips.some((x) => x.id === clipId)) return
    setRecortandoPersona({ clip: clipId, pct: 0 })
    const dejar = window.recorte.onProgreso((p) => {
      if (p.id === proyecto.id && p.fase === 'persona') setRecortandoPersona({ clip: clipId, pct: p.pct })
    })
    try {
      const r = await window.recorte.recortarPersona(proyecto.id, timeline, clipId)
      onMedios(r.project.medios ?? [])
      const medios = { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      // Una por clip: si ya tenía, se cambia por la nueva.
      const sinVieja = (timeline.capas ?? []).filter((c) => c.persona?.clip === clipId).reduce((t, c) => borrarCapa(t, c.id), timeline)
      const hecho = anadirCapa(sinVieja, { fuente: r.medio, inicio: r.inicio, duracion: r.duracion, x: 0.5, y: 0.5, ancho: 1, pista: 3, persona: { clip: clipId } }, medios)
      if (hecho.timeline === sinVieja) throw new Error('No pude poner el recorte en la timeline.')
      historial.aplicar(hecho.timeline)
      onAviso('Listo: la persona quedó encima de su clip. Marca «Detrás de la persona» en un texto, o pon algo en las pistas 1 o 2, y se verá por detrás de ella.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      dejar()
      setRecortandoPersona(null)
    }
  }
  /** Recorta el objeto de la zona «Recortar» del clip (rotoscopia por clic): queda encima del clip, con transparencia. */
  async function recortarObjeto(clipId: string) {
    if (recortandoPersona || !timeline.clips.some((x) => x.id === clipId)) return
    setRecortandoPersona({ clip: clipId, pct: 0 })
    const dejar = window.recorte.onProgreso((p) => {
      if (p.id === proyecto.id && p.fase === 'persona') setRecortandoPersona({ clip: clipId, pct: p.pct })
    })
    try {
      const r = await window.recorte.recortarObjeto(proyecto.id, timeline, clipId)
      onMedios(r.project.medios ?? [])
      const medios = { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      const z = timeline.clips.find((x) => x.id === clipId)?.zonas?.find((x) => x.modo === 'recortar')
      const clave = z ? `${z.x.toFixed(2)},${z.y.toFixed(2)}` : undefined
      const hecho = anadirCapa(timeline, { fuente: r.medio, inicio: r.inicio, duracion: r.duracion, x: 0.5, y: 0.5, ancho: 1, pista: 3, roto: { clip: clipId, ...(clave ? { clave } : {}) } }, medios)
      if (hecho.timeline === timeline) throw new Error('No pude poner el objeto recortado en la timeline.')
      historial.aplicar(hecho.timeline)
      onAviso('Listo: el objeto quedó recortado encima del clip. Marca «Detrás de la persona» en un texto, o pon algo en las pistas 1 o 2, y se verá por detrás de él.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      dejar()
      setRecortandoPersona(null)
    }
  }
  /** Cambia el cielo del clip: el clip con el cielo nuevo queda encima del original. */
  async function cambiarCielo(clipId: string, cielo: string) {
    if (recortandoPersona || !timeline.clips.some((x) => x.id === clipId)) return
    setRecortandoPersona({ clip: clipId, pct: 0 })
    const dejar = window.recorte.onProgreso((p) => {
      if (p.id === proyecto.id && p.fase === 'persona') setRecortandoPersona({ clip: clipId, pct: p.pct })
    })
    try {
      const r = await window.recorte.cambiarCielo(proyecto.id, timeline, clipId, cielo)
      onMedios(r.project.medios ?? [])
      const medios = { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      const sinVieja = (timeline.capas ?? []).filter((c) => c.cielo?.clip === clipId).reduce((t, c) => borrarCapa(t, c.id), timeline)
      const hecho = anadirCapa(sinVieja, { fuente: r.medio, inicio: r.inicio, duracion: r.duracion, x: 0.5, y: 0.5, ancho: 1, pista: 3, cielo: { clip: clipId } }, medios)
      if (hecho.timeline === sinVieja) throw new Error('No pude poner el cielo nuevo en la timeline.')
      historial.aplicar(hecho.timeline)
      onAviso('Listo: el cielo ya es otro. Si cambias el recorte o el color del clip, vuelve a pedirlo.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      dejar()
      setRecortandoPersona(null)
    }
  }
  /** Borra el objeto de la zona «Borrar» del clip: el clip sin él queda encima del original. */
  async function borrarObjeto(clipId: string) {
    if (recortandoPersona || !timeline.clips.some((x) => x.id === clipId)) return
    setRecortandoPersona({ clip: clipId, pct: 0 })
    const dejar = window.recorte.onProgreso((p) => {
      if (p.id === proyecto.id && p.fase === 'persona') setRecortandoPersona({ clip: clipId, pct: p.pct })
    })
    try {
      const r = await window.recorte.borrarObjeto(proyecto.id, timeline, clipId)
      onMedios(r.project.medios ?? [])
      const medios = { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      const sinVieja = (timeline.capas ?? []).filter((c) => c.borrado?.clip === clipId).reduce((t, c) => borrarCapa(t, c.id), timeline)
      const hecho = anadirCapa(sinVieja, { fuente: r.medio, inicio: r.inicio, duracion: r.duracion, x: 0.5, y: 0.5, ancho: 1, pista: 3, borrado: { clip: clipId } }, medios)
      if (hecho.timeline === sinVieja) throw new Error('No pude poner el clip sin el objeto en la timeline.')
      historial.aplicar(hecho.timeline)
      onAviso('Listo: el objeto ya no está. Si cambias el recorte o el color del clip, vuelve a pulsar «Borrar lo marcado».')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      dejar()
      setRecortandoPersona(null)
    }
  }
  async function congelar() {
    const u = ubicar(timeline, reproductor.tiempo)
    if (!u || congelando) return
    if (u.clip.fuente !== 'principal' && proyecto.medios?.find((m) => m.id === u.clip.fuente)?.tipo !== 'video') {
      onAviso('Ese clip ya es una imagen quieta.')
      return
    }
    setCongelando(true)
    try {
      const r = await window.recorte.congelarCuadro(proyecto.id, u.clip.fuente, u.tFuente)
      onMedios(r.project.medios ?? [])
      const puesto = insertarClip(timeline, { fuente: r.medio, entrada: 0, salida: 2 }, reproductor.tiempo)
      const { zoom, cx, cy, ...resto } = u.clip.ajustes ?? {}
      const ajustes = { ...resto, ...(zoom !== undefined ? { zoom } : {}), ...(cx !== undefined ? { cx } : {}), ...(cy !== undefined ? { cy } : {}) }
      historial.aplicar(Object.keys(ajustes).length ? ajustarClip(puesto.timeline, puesto.id, ajustes) : puesto.timeline)
      onAviso('Listo: el cuadro quedó congelado 2 s en el cabezal. Alárgalo o acórtalo arrastrando su borde.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setCongelando(false)
    }
  }

  /**
   * Anima la imagen de una capa (o la devuelve quieta): la animación entra a la biblioteca y la capa pasa a
   * usarla, un poco más ancha porque la animación trae margen alrededor. La imagen original se guarda.
   */
  async function animarCapa(capaId: string, tipo: TipoAnimar | null) {
    const capa = timeline.capas?.find((c) => c.id === capaId)
    if (!capa || quitandoFondo) return
    const base = capa.animada?.base ?? capa.fuente
    const anchoBase = capa.animada ? capa.ancho / escalaAnimada(capa) : capa.ancho
    if (!tipo) {
      if (capa.animada) historial.aplicar(cambiarCapa(timeline, capaId, { fuente: base, animada: undefined, ancho: anchoBase }, duraciones))
      return
    }
    setQuitandoFondo(true)
    try {
      const r = await window.recorte.animarImagen(proyecto.id, base, tipo)
      onMedios(r.project.medios ?? [])
      const largo = r.project.medios?.find((m) => m.id === r.medio)?.duracion ?? 4
      historial.aplicar(
        cambiarCapa(timeline, capaId, { fuente: r.medio, animada: { tipo, base, escala: r.escala || escalaAnimada({}) }, ancho: Math.min(2, anchoBase * (r.escala || escalaAnimada({}))) }, { ...duraciones, [r.medio]: largo })
      )
      onAviso(r.avisos?.length ? r.avisos.join(' ') : 'Listo: la capa ya se mueve. Vuelve a «Quieta» cuando quieras.')
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setQuitandoFondo(false)
    }
  }

  /** Pone otra foto u otro video en el lugar de un clip (el primero que elija), sin mover lo demás. */
  async function cambiarArchivo(clipId: string) {
    if (agregando) return
    setAgregando(true)
    try {
      const r = await window.recorte.agregarMedios(proyecto.id)
      const m = r?.project.medios?.find((x) => x.id === r.agregados[0])
      if (!r || !m) return
      onMedios(r.project.medios ?? [])
      historial.aplicar(cambiarFuente(timeline, clipId, m.id, m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion))
    } catch (error) {
      onAviso(`No pude cambiarlo: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAgregando(false)
    }
  }

  /** Agrega varios archivos a la biblioteca y los pone al final de la timeline. */
  async function agregarMedios() {
    if (agregando || proyecto.demo) return
    setAgregando(true)
    try {
      const r = await window.recorte.agregarMedios(proyecto.id)
      if (!r) return
      onMedios(r.project.medios ?? [])
      let tl = timeline
      for (const mid of r.agregados) {
        const m = r.project.medios?.find((x) => x.id === mid)
        if (!m) continue
        tl = insertarClip(tl, { fuente: m.id, entrada: 0, salida: m.tipo === 'imagen' ? DURACION_IMAGEN : m.duracion }).timeline
      }
      if (tl !== timeline) historial.aplicar(tl)
      onAviso(
        `${r.agregados.length} ${r.agregados.length === 1 ? 'archivo agregado' : 'archivos agregados'} al final de la timeline.` +
          (r.fallos.length ? ` No pude leer: ${r.fallos.join(', ')}.` : '')
      )
    } catch (error) {
      onAviso(`No pude agregarlos: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setAgregando(false)
    }
  }

  async function quitarMedio(m: MedioProyecto) {
    try {
      const p = await window.recorte.quitarMedio(proyecto.id, m.id)
      onMedios(p.medios ?? [])
      const tl = quitarFuente(timeline, m.id)
      if (tl.clips.length !== timeline.clips.length) historial.aplicar(tl)
      onAviso(`Quité «${m.nombre}» del proyecto${tl.clips.length !== timeline.clips.length ? ' y sus clips de la timeline' : ''}. El archivo sigue en tu equipo.`)
    } catch (error) {
      onAviso(`No pude quitarlo: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  puente.current = {
    timeline,
    tiempo: reproductor.tiempo,
    elegido,
    aplicar: historial.aplicar,
    deshacer: historial.deshacer
  }

  /** Reemplaza la timeline entera (receta, momento): se puede deshacer. */
  function llevarATimeline(nueva: Timeline) {
    reproductor.pausar()
    historial.aplicar(nueva)
    setElegido(null)
    reproductor.buscar(0)
  }

  // Clic derecho en el monitor.
  const [menuMonitor, abrirMenuMonitor] = useMenuContextual()
  // ===== Archivos de Windows soltados o pegados en el editor =====
  const [soltando, setSoltando] = useState(false)
  // El monitor (con su barra) a pantalla completa.
  const centroRef = useRef<HTMLElement>(null)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)
  useEffect(() => {
    const al = () => setPantallaCompleta(!!document.fullscreenElement && document.fullscreenElement === centroRef.current)
    document.addEventListener('fullscreenchange', al)
    return () => document.removeEventListener('fullscreenchange', al)
  }, [])
  const alternarPantalla = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void centroRef.current?.requestFullscreen().catch(() => {})
  }
  /**
   * Importa archivos de fuera y los pone donde se soltaron: en la pista de video (en ese segundo), encima, en la de
   * sonidos o de música, o en el monitor (como capa, ahí mismo). Soltados en otra parte, van a la biblioteca (y los
   * audios, como sonido en el cabezal).
   */
  async function importarArchivos(archivos: File[], donde: Element | null, x: number, y: number) {
    const rutas = archivos.map((f) => window.recorte.rutaDeArchivo(f)).filter((r): r is string => Boolean(r))
    if (!rutas.length || proyecto.demo) return
    const carril = donde?.closest('.tl-carril')
    const lienzo = document.querySelector('.tl-lienzo')
    const pps = Number((lienzo as HTMLElement | null)?.dataset.pps) || 0
    const enLinea = carril && lienzo && pps ? Math.max(0, (x - lienzo.getBoundingClientRect().left) / pps) : reproductor.tiempo
    const monitor = donde?.closest('.monitor')
    try {
      const r = await window.recorte.importarRutas(proyecto.id, rutas)
      onMedios(r.project.medios ?? [])
      const nuevos = (r.project.medios ?? []).filter((m) => r.agregados.includes(m.id))
      const dur: Record<string, number> = { ...duraciones, ...Object.fromEntries(nuevos.map((m) => [m.id, m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion])) }
      let tl = timeline
      let t = enLinea
      for (const m of nuevos) {
        if (carril?.classList.contains('video')) {
          tl = insertarClip(tl, { fuente: m.id, entrada: 0, salida: m.tipo === 'imagen' ? DURACION_IMAGEN : m.duracion }, t).timeline
          t += m.tipo === 'imagen' ? DURACION_IMAGEN : m.duracion
        } else if (carril?.classList.contains('encima') || monitor) {
          const cuadro = document.querySelector('.monitor-cuadro')?.getBoundingClientRect()
          const px = monitor && cuadro ? Math.max(0, Math.min(1, (x - cuadro.left) / cuadro.width)) : 0.5
          const py = monitor && cuadro ? Math.max(0, Math.min(1, (y - cuadro.top) / cuadro.height)) : 0.5
          tl = capaNueva(tl, m.id, m.tipo, monitor ? reproductor.tiempo : t, dur, px, py).timeline
        }
      }
      for (const a of r.audios) {
        if (carril?.classList.contains('musica')) tl = ponerMusica(tl, { archivo: a.archivo, nombre: a.nombre, volumen: 0.3, ducking: true })
        else tl = anadirSonido(tl, { inicio: carril?.classList.contains('sonidos') ? enLinea : reproductor.tiempo, duracion: a.duracion, largo: a.duracion, archivo: a.archivo, nombre: a.nombre, volumen: 1 }).timeline
      }
      if (tl !== timeline) historial.aplicar(tl)
      const partes = [
        nuevos.length ? `${nuevos.length} ${nuevos.length === 1 ? 'archivo' : 'archivos'} a la biblioteca` : '',
        r.audios.length ? `${r.audios.length} ${r.audios.length === 1 ? 'audio' : 'audios'} a ${carril?.classList.contains('musica') ? 'la música' : 'los sonidos'}` : ''
      ].filter(Boolean)
      onAviso(`${partes.length ? `Listo: ${partes.join(' y ')}.` : 'No pude agregar esos archivos.'}${r.fallos.length ? ` No pude leer: ${r.fallos.join(', ')}.` : ''}`)
    } catch (error) {
      onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    }
  }
  // Pegar archivos copiados en el Explorador (Ctrl+V): van a la biblioteca (o a los sonidos) y al cabezal.
  const pegarRef = useRef<(e: ClipboardEvent) => void>(() => {})
  pegarRef.current = (e: ClipboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA'].includes(el.tagName))) return
    const archivos = [...(e.clipboardData?.files ?? [])]
    if (!archivos.length) return
    e.preventDefault()
    void importarArchivos(archivos, document.querySelector('.tl-carril.video'), 0, 0)
  }
  useEffect(() => {
    const oyente = (e: ClipboardEvent) => pegarRef.current(e)
    window.addEventListener('paste', oyente)
    return () => window.removeEventListener('paste', oyente)
  }, [])

  /** Arrastrar el divisor entre el monitor y la línea de tiempo (como entre paneles en Premiere). */
  function arrastrarDivisor(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.preventDefault()
    const editor = e.currentTarget.parentElement
    if (!editor) return
    const caja = editor.getBoundingClientRect()
    const tlActual = editor.querySelector('.tl')?.getBoundingClientRect().height ?? 260
    const y0 = e.clientY
    let alto = tlActual
    const mover = (ev: PointerEvent) => {
      alto = Math.round(Math.min(caja.height - 240, Math.max(150, tlActual - (ev.clientY - y0))))
      setAltoTL(alto)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      try {
        localStorage.setItem(CLAVE_ALTO_TL, String(alto))
      } catch {
        // Sin almacenamiento, el alto dura lo que dura la sesión.
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  return (
    <div
      className={`editor ed ${soltando ? 'soltando-archivos' : ''}`}
      data-soltar="Suéltalos en la línea de tiempo, en el monitor o en la biblioteca"
      style={altoTL ? { gridTemplateRows: `minmax(0, 1fr) auto ${altoTL}px` } : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files') || proyecto.demo) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!soltando) setSoltando(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltando(false)
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setSoltando(false)
        void importarArchivos([...e.dataTransfer.files], e.target as Element, e.clientX, e.clientY)
      }}
    >
      <div className="ed-arriba">
        <aside className="ed-panel ed-biblioteca" ref={setPanelBiblioteca} aria-label="Biblioteca" />
        <section className={`ed-centro ${pantallaCompleta ? 'is-completa' : ''}`} ref={centroRef}>
          <div
            className="ed-visor"
            onContextMenu={(e) =>
              abrirMenuMonitor(e, [
                { nombre: reproductor.reproduciendo ? 'Pausa' : 'Reproducir', atajo: 'Espacio', accion: reproductor.alternar },
                { nombre: 'Ir al principio', atajo: 'Inicio', accion: () => reproductor.buscar(0) },
                { nombre: pantallaCompleta ? 'Salir de la pantalla completa' : 'Pantalla completa', atajo: 'F', accion: alternarPantalla },
                { tipo: 'separador' },
                ...(proyecto.demo
                  ? []
                  : [
                      { nombre: 'Guardar este cuadro como imagen', atajo: 'Mayús+E', accion: () => void exportarCuadro() },
                      { nombre: 'Congelar este cuadro', atajo: 'Mayús+F', accion: () => void congelar() }
                    ])
              ])
            }
          >
            {menuMonitor}
            <Monitor
              proyecto={proyecto}
              timeline={timeline}
              reproductor={reproductor}
              fuentes={fuentes}
              medios={duraciones}
              historial={historial}
              elegido={elegido}
              onElegir={elegir}
              vistaPrevia={vistaPrevia}
            />
          </div>
          <div className="ed-transporte" ref={setPanelTransporte} />
        </section>
        <aside className="ed-panel ed-inspector" ref={setPanelInspector} aria-label="Ajustes de lo elegido" />
      </div>
      <div
        className="ed-divisor"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Cambiar el alto de la línea de tiempo"
        title="Arrastra para agrandar la línea de tiempo o el monitor · doble clic: tamaño normal"
        onPointerDown={arrastrarDivisor}
        onDoubleClick={() => {
          setAltoTL(null)
          try {
            localStorage.removeItem(CLAVE_ALTO_TL)
          } catch {
            // Nada que olvidar.
          }
        }}
      />
      <TimelineEditor
        key={proyecto.id}
        vistaPrevia={vistaPrevia}
        fps={proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? proyecto.source.fps : 30}
        paneles={{ biblioteca: panelBiblioteca, inspector: panelInspector, transporte: panelTransporte }}
        miniaturaDe={miniaturaDe}
        urlDe={proyecto.demo ? undefined : (archivo) => mediaUrl(proyecto.id, archivo)}
        ondaDe={proyecto.demo ? undefined : (fuente) => `onda:${proyecto.id}:${fuente}`}
        panelSubtitulos={
          proyecto.demo ? undefined : <SubtitulosAnimados proyecto={proyecto} timeline={timeline} historial={historial} onMedios={onMedios} onAviso={onAviso} />
        }
        panelMedios={
          <>
            {origen && fuentes[origen] && (
              <MonitorOrigen
                key={origen}
                url={fuentes[origen].url}
                nombre={origen === 'principal' ? proyecto.source.name : (proyecto.medios?.find((m) => m.id === origen)?.nombre ?? 'Video')}
                duracion={origen === 'principal' ? proyecto.source.duration : (duraciones[origen] ?? 0)}
                fps={proyecto.source.fps > 0 ? proyecto.source.fps : 30}
                onInsertar={(entrada, salida) => {
                  const r = insertarClip(timeline, { fuente: origen, entrada, salida }, reproductor.tiempo)
                  historial.aplicar(r.timeline)
                  onAviso('Insertado en el cabezal: lo que venía después se corrió.')
                }}
                onSobrescribir={(entrada, salida) => {
                  const r = sobrescribirClip(timeline, { fuente: origen, entrada, salida }, reproductor.tiempo)
                  historial.aplicar(r.timeline)
                  onAviso('Sobrescrito en el cabezal: tapó lo que había ahí.')
                }}
                onCerrar={() => setOrigen(null)}
              />
            )}
            <MediosPanel
              proyecto={proyecto}
              onVer={proyecto.demo ? undefined : (fuente) => setOrigen(fuente)}
              agregando={agregando}
              onAgregar={() => void agregarMedios()}
              onPoner={(fuente, donde) => {
                const tl = poner(fuente, donde)
                if (tl !== timeline) historial.aplicar(tl)
              }}
              onQuitar={(m) => void quitarMedio(m)}
            />
            {!proyecto.demo && (
              <button className="ed-fila" onClick={() => llevarATimeline(timelineInicial(proyecto.source.duration))} title="La línea de tiempo vuelve a ser el video completo">
                <Icon name="film" size={14} />
                <span>Todo el material a la línea de tiempo</span>
              </button>
            )}
            <SourceCard proyecto={proyecto} progreso={progreso} onTranscribir={onTranscribir} onPlay={() => reproductor.buscar(0)} />
          </>
        }
        pestanasExtra={[
          {
            id: 'historial',
            nombre: 'Historial',
            icono: 'undo' as const,
            contenido: (
              <PanelHistorial
                historial={historial}
                version={timeline}
                nombreDe={(f) => (f === 'principal' ? proyecto.source.name : (proyecto.medios?.find((m) => m.id === f)?.nombre ?? 'medio'))}
              />
            )
          },
          ...(proyecto.demo
            ? []
            : [
                {
                  id: 'multicam',
                  nombre: 'Cámaras',
                  icono: 'film' as const,
                  contenido: (
                    <PanelMulticam
                      timeline={timeline}
                      historial={historial}
                      fuentes={fuentes}
                      nombres={[
                        { fuente: 'principal', nombre: proyecto.name },
                        ...(proyecto.medios ?? []).filter((m) => m.tipo === 'video').map((m) => ({ fuente: m.id, nombre: m.nombre }))
                      ]}
                      tiempo={reproductor.tiempo}
                      reproduciendo={reproductor.reproduciendo}
                      duracionDe={(f) => (f === 'principal' ? proyecto.source.duration : duraciones[f] ?? 0)}
                      sincronizar={(lista) => window.recorte.sincronizar(proyecto.id, lista)}
                      sonidoUnico={async (n) => {
                        const mc = timeline.multicam
                        const inicio = inicioEscenaMulticam(timeline)
                        if (!mc || inicio === null) throw new Error('El primer clip no es una de las tomas.')
                        const a = mc.angulos[n]
                        const dura = duracionTimeline(timeline)
                        const r = await window.recorte.extraerAudio(proyecto.id, a.fuente, Math.max(0, inicio + a.desfase), inicio + a.desfase + dura)
                        historial.aplicar(sonidoUnicoMulticam(timeline, r.archivo, r.nombre, r.duracion))
                      }}
                    />
                  )
                }
              ]),
          ...(proyecto.demo
            ? []
            : [
                {
                  id: 'animadas',
                  nombre: 'Animadas',
                  icono: 'sparkles' as const,
                  contenido: (
                    <PanelPiezas
                      proyecto={proyecto}
                      timeline={timeline}
                      historial={historial}
                      tiempo={reproductor.tiempo}
                      capaElegida={elegido?.tipo === 'capa' ? timeline.capas?.find((c) => c.id === elegido.id) : undefined}
                      onMedios={onMedios}
                      onElegirCapa={(id) => elegir({ tipo: 'capa', id })}
                      onAviso={onAviso}
                    />
                  )
                }
              ]),
          {
            id: 'ia',
            nombre: 'IA',
            icono: 'sparkles',
            contenido: (
              <>
                {!proyecto.demo && <PanelLimpieza timeline={timeline} historial={historial} transcript={proyecto.transcript} onAviso={onAviso} />}
                {!proyecto.demo && <PanelAudio proyecto={proyecto} timeline={timeline} historial={historial} onBuscar={reproductor.buscar} onAviso={onAviso} />}
                <span className="ed-seccion">Edición del agente</span>
                {proyecto.receta && (
                  <button className="ed-fila" onClick={() => proyecto.receta && llevarATimeline(timelineDesdeReceta(proyecto.receta))}>
                    <Icon name="layers" size={14} />
                    <span>Llevar la edición del agente a la línea de tiempo</span>
                  </button>
                )}
                <EdicionCard proyecto={proyecto} editando={editando} renderizando={renderizando} onEditar={onEditar} onRenderizar={onRenderizarEdicion} onAbrir={onAbrirEdicion} />
                <span className="ed-seccion">Clips que propone la IA ({proyecto.clips.length})</span>
                {clip && (
                  <button className="ed-fila" onClick={() => llevarATimeline(timelineDesdeCortes([{ start: clip.start, end: clip.end }], clip.title))}>
                    <Icon name="layers" size={14} />
                    <span>Abrir «{clip.title}» en la línea de tiempo</span>
                  </button>
                )}
                <ClipList clips={proyecto.clips} proyectoId={proyecto.demo ? undefined : proyecto.id} selected={seleccion} onSelect={onSelect} vacio={textoVacio} />
                {clip && <Inspector clip={clip} project={proyecto} onChange={onCambiarClip} onRender={onRenderClip} rendering={renderizando || lote !== null} />}
                <span className="ed-seccion">Cola de renders ({cola.length})</span>
                <RenderQueue jobs={cola} pendientes={pendientesLote} lote={lote} onRenderLote={onRenderLote} onOpen={onAbrirSalida} />
              </>
            )
          }
        ]}
        timeline={timeline}
        duracionFuente={proyecto.source.duration}
        duracionDe={duracionDe}
        nombreDe={nombreDe}
        onAgregarClips={() => void agregarMedios()}
        agregandoClips={agregando}
        transcript={proyecto.transcript}
        tiempo={reproductor.tiempo}
        reproduciendo={reproductor.reproduciendo}
        onBuscar={reproductor.buscar}
        onAlternar={reproductor.alternar}
        historial={historial}
        elegido={elegido}
        onElegir={elegir}
        generarVoz={
          proyecto.demo
            ? undefined
            : async (texto, voz) => {
                try {
                  return await window.recorte.vozFrase(proyecto.id, { texto, ...(voz ? { voz } : {}) })
                } catch (error) {
                  onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
                  return null
                }
              }
        }
        grabarVoz={
          proyecto.demo
            ? undefined
            : async (datos, texto) => {
                try {
                  return await window.recorte.vozGrabada(proyecto.id, datos, texto)
                } catch (error) {
                  onAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
                  return null
                }
              }
        }
        onCambiarArchivo={proyecto.demo ? undefined : (clipId) => void cambiarArchivo(clipId)}
        onQuitarFondo={proyecto.demo ? undefined : (capaId) => void quitarFondo(capaId)}
        onCongelar={proyecto.demo ? undefined : () => void congelar()}
        onSepararAudio={proyecto.demo ? undefined : (clipId) => void separarAudioDe(clipId)}
        onPalabrasDeVoces={proyecto.demo ? undefined : (archivos) => window.recorte.palabrasDeVoces(proyecto.id, archivos)}
        separando={separando}
        onAnidar={proyecto.demo ? undefined : (ids) => void anidar(ids)}
        anidando={anidando}
        onExportarCuadro={proyecto.demo ? undefined : () => void exportarCuadro()}
        onPantallaCompleta={alternarPantalla}
        pantallaCompleta={pantallaCompleta}
        seguirZona={proyecto.demo ? undefined : (fuente, pedido) => window.recorte.seguirZona(proyecto.id, fuente, pedido)}
        sacandoCuadro={sacandoCuadro}
        onEstabilizar={proyecto.demo ? undefined : (clipId) => void estabilizar(clipId)}
        onSepararPersona={proyecto.demo ? undefined : (clipId) => void separarPersona(clipId)}
        separandoPersona={recortandoPersona}
        onRecortarObjeto={proyecto.demo ? undefined : (clipId) => void recortarObjeto(clipId)}
        onCambiarCielo={proyecto.demo ? undefined : (clipId, cielo) => void cambiarCielo(clipId, cielo)}
        onBorrarObjeto={proyecto.demo ? undefined : (clipId) => void borrarObjeto(clipId)}
        estabilizando={estabilizando}
        congelando={congelando}
        onAnimarCapa={proyecto.demo ? undefined : (capaId, tipo) => void animarCapa(capaId, tipo)}
        quitandoFondo={quitandoFondo}
        medios={proyecto.demo ? undefined : (proyecto.medios ?? []).map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo, conAudio: m.conAudio }))}
        duraciones={duraciones}
        ponerSonido={
          proyecto.demo
            ? undefined
            : async (incluido) => {
                const r = await window.recorte.ponerSonido(proyecto.id, incluido)
                if (r && !r.ok) onAviso(r.error ?? 'No pude poner el sonido.')
                return r?.ok && r.sonido ? r.sonido : null
              }
        }
        importarLut={
          proyecto.demo
            ? undefined
            : async () => {
                const r = await window.recorte.importarLut(proyecto.id)
                if (r && !r.ok) onAviso(r.error ?? 'No pude cargar el LUT.')
                return r?.ok && r.lut ? r.lut : null
              }
        }
        importarMusica={async () => {
          const r = await window.recorte.importarMusica(proyecto.id)
          if (r && !r.ok) onAviso(r.error ?? 'No pude añadir la música.')
          return r?.ok && r.musica ? r.musica : null
        }}
        exportar={{
          activo: exportando,
          pct: progreso?.fase === 'exportar' ? progreso.pct : 0,
          hayTranscripcion: Boolean(proyecto.transcript?.length),
          hayArchivo: Boolean(proyecto.timelineSalida),
          vertical: proyecto.source.height > proyecto.source.width,
          onExportar: (opciones) => {
            reproductor.pausar()
            onExportar(opciones)
          },
          onAbrir: onAbrirExportacion,
          destino: carpetaVideos ? `${carpetaVideos}\\${proyecto.name.replace(/[<>:"/\\|?*]/g, ' ').trim()}` : undefined
        }}
      />

    </div>
  )
}
