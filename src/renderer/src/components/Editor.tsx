import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import { PanelHistorial } from './PanelHistorial'
import { PanelLimpieza } from './PanelLimpieza'

const CLAVE_ALTO_TL = 'recorte.altoLineaDeTiempo'
import { mediaUrl } from '../media'
import { ajustarClip, sobrescribirClip, separarAudio, sonidoUnicoMulticam, inicioEscenaMulticam, anidarClips, clipsSeguidos, cambiarATramo, ubicar, capaNueva, cambiarCapa, cambiarFuente, escalaAnimada, type TipoAnimar, duracionTimeline, DURACION_IMAGEN, insertarClip, MAX_IMAGEN, quitarFuente, timelineDesdeCortes, timelineDesdeReceta, timelineInicial, timelineVacia, timelineActiva, type Timeline } from '../../../shared/timeline'
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
    for (const m of proyecto.medios ?? []) lista[m.id] = { url: mediaUrl(proyecto.id, `medio/${m.id}`), tipo: m.tipo }
    return lista
  }, [proyecto.id, proyecto.proxy, proyecto.medios])
  // Lo que suena y se ve es la timeline sin las pistas silenciadas (los clips no cambian de sitio).
  const activa = useMemo(() => timelineActiva(timeline), [timeline])
  const reproductor = useReproductor(activa, proyecto.id, fuentes)
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
  async function separarAudioDe(clipId: string) {
    const c = timeline.clips.find((x) => x.id === clipId)
    if (!c || separando) return
    if (c.rampa || Math.abs((c.velocidad ?? 1) - 1) > 0.005) {
      onAviso('Para separar el sonido, el clip tiene que ir a velocidad normal.')
      return
    }
    setSeparando(true)
    try {
      const r = await window.recorte.extraerAudio(proyecto.id, c.fuente, c.entrada, c.salida)
      historial.aplicar(separarAudio(timeline, clipId, r.archivo, r.nombre, r.duracion))
      onAviso('Listo: el sonido quedó aparte en la pista de sonidos. Muévelo o recórtalo sin tocar la imagen.')
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
    <div className="editor ed" style={altoTL ? { gridTemplateRows: `minmax(0, 1fr) auto ${altoTL}px` } : undefined}>
      <div className="ed-arriba">
        <aside className="ed-panel ed-biblioteca" ref={setPanelBiblioteca} aria-label="Biblioteca" />
        <section className="ed-centro">
          <div className="ed-visor">
            <Monitor
              proyecto={proyecto}
              timeline={timeline}
              reproductor={reproductor}
              fuentes={fuentes}
              medios={duraciones}
              historial={historial}
              elegido={elegido}
              onElegir={elegir}
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
        fps={proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? proyecto.source.fps : 30}
        paneles={{ biblioteca: panelBiblioteca, inspector: panelInspector, transporte: panelTransporte }}
        miniaturaDe={miniaturaDe}
        urlDe={proyecto.demo ? undefined : (archivo) => mediaUrl(proyecto.id, archivo)}
        ondaDe={proyecto.demo ? undefined : (fuente) => `onda:${proyecto.id}:${fuente}`}
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
          {
            id: 'ia',
            nombre: 'IA',
            icono: 'sparkles',
            contenido: (
              <>
                {!proyecto.demo && <PanelLimpieza timeline={timeline} historial={historial} transcript={proyecto.transcript} onAviso={onAviso} />}
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
        separando={separando}
        onAnidar={proyecto.demo ? undefined : (ids) => void anidar(ids)}
        anidando={anidando}
        onExportarCuadro={proyecto.demo ? undefined : () => void exportarCuadro()}
        seguirZona={proyecto.demo ? undefined : (fuente, pedido) => window.recorte.seguirZona(proyecto.id, fuente, pedido)}
        sacandoCuadro={sacandoCuadro}
        onEstabilizar={proyecto.demo ? undefined : (clipId) => void estabilizar(clipId)}
        estabilizando={estabilizando}
        congelando={congelando}
        onAnimarCapa={proyecto.demo ? undefined : (capaId, tipo) => void animarCapa(capaId, tipo)}
        quitandoFondo={quitandoFondo}
        medios={proyecto.demo ? undefined : (proyecto.medios ?? []).map((m) => ({ id: m.id, nombre: m.nombre, tipo: m.tipo }))}
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
