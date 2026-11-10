import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OpcionesExport, Progreso } from '../../../shared/api'
import type { ClipSuggestion, MedioProyecto, Project, RenderJob } from '../../../shared/types'
import { ClipList } from './ClipList'
import { EdicionCard } from './EdicionCard'
import { Inspector } from './Inspector'
import { RenderQueue } from './RenderQueue'
import { SourceCard } from './SourceCard'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'
import { ajustesDe, cambiarFuente, zoomEn, FUENTES_TEXTO, DURACION_IMAGEN, insertarClip, MAX_IMAGEN, quitarFuente, textosEn, ubicar, timelineDesdeCortes, timelineDesdeReceta, timelineInicial, timelineVacia, type Timeline } from '../../../shared/timeline'
import { useHistorial, useMusica, useReproductor, useVoces, type FuentesVista, type Reproductor } from '../hooks/timeline'
import { MediosPanel } from './MediosPanel'
import { TimelineEditor, type Elegido } from './TimelineEditor'
import type { PuenteEditor } from './ChatAgente'

/**
 * Cara de editor: monitor + línea de tiempo + herramientas.
 * Las funciones viejas (clips, edición con agente, cola) viven como
 * herramientas bajo la línea de tiempo; el video manda.
 */

function Monitor({
  proyecto,
  timeline,
  reproductor
}: {
  proyecto: Project
  timeline: Timeline
  reproductor: Reproductor
}) {
  const src = proyecto.demo ? undefined : mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente')
  const enImagen = Boolean(reproductor.imagen)
  const rotulos = textosEn(timeline, reproductor.tiempo)
  const vacia = timeline.clips.length === 0
  const musicaRef = useMusica(timeline, reproductor, proyecto.transcript)
  const urlDe = useCallback((archivo: string) => mediaUrl(proyecto.id, archivo), [proyecto.id])
  const vocesRef = useVoces(timeline, reproductor, urlDe)
  const ubicado = ubicar(timeline, reproductor.tiempo)
  const clipActual = ubicado?.clip
  // Un clip mudo solo aporta imagen: su sonido va en las pistas de voz y música.
  useEffect(() => {
    if (reproductor.videoRef.current) reproductor.videoRef.current.muted = Boolean(clipActual?.mudo)
  }, [clipActual?.id, clipActual?.mudo, reproductor.videoRef])
  // Zoom, encuadre, acercamiento y color del clip bajo el cabezal; en el render son crop,
  // zoompan y eq de FFmpeg.
  const a = ajustesDe(clipActual)
  const largoClip = ubicado ? ubicado.fin - ubicado.inicio : 1
  const enClip = ubicado ? reproductor.tiempo - ubicado.inicio : 0
  const z = zoomEn(a, enClip / Math.max(0.01, largoClip))
  // El fundido de entrada: el clip aparece sobre negro (en el render, sobre el clip anterior).
  const fundido = clipActual?.fundido && ubicado && ubicado.indice > 0 ? Math.min(1, enClip / clipActual.fundido) : 1
  const estiloImagen: React.CSSProperties = {
    visibility: vacia ? 'hidden' : 'visible',
    transform: z !== 1 ? `scale(${z})` : undefined,
    transformOrigin: a.cx !== 0.5 || a.cy !== 0.5 ? `${a.cx * 100}% ${a.cy * 100}%` : undefined,
    opacity: fundido < 1 ? fundido : undefined,
    filter:
      a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1
        ? `brightness(${(1 + a.brillo * 1.5).toFixed(3)}) contrast(${a.contraste}) saturate(${a.saturacion})`
        : undefined
  }

  return (
    <div className="monitor" onClick={reproductor.alternar}>
      {src ? (
        <>
          <video
            ref={reproductor.videoRef}
            preload="auto"
            style={{ ...estiloImagen, visibility: vacia || enImagen ? 'hidden' : 'visible' }}
            {...reproductor.eventos}
          />
          {enImagen && <img className="monitor-imagen" src={reproductor.imagen!} alt="" style={estiloImagen} />}
        </>
      ) : (
        <div className="monitor-vacio"><Icon name="play" size={28} /></div>
      )}
      {timeline.musica && !proyecto.demo && (
        <audio ref={musicaRef} src={mediaUrl(proyecto.id, timeline.musica.archivo)} preload="auto" loop />
      )}
      {timeline.voces?.length && !proyecto.demo ? <audio ref={vocesRef} preload="auto" /> : null}
      {rotulos.map((r) => (
        <span
          key={r.id}
          className={`monitor-rotulo ${r.posicion} ${r.sinCaja ? 'sin-caja' : ''}`}
          style={{
            ...(r.tamano ? { fontSize: `calc(clamp(12px, 3.4cqw, 44px) * ${r.tamano})` } : {}),
            ...(r.color ? { color: r.color } : {}),
            ...(r.fuente && FUENTES_TEXTO[r.fuente]
              ? { fontFamily: `"${FUENTES_TEXTO[r.fuente].familia}", Arial, sans-serif`, fontWeight: FUENTES_TEXTO[r.fuente].negrita ? 700 : 400 }
              : {})
          }}
        >
          {r.texto}
        </span>
      ))}
      {!reproductor.reproduciendo && src && !vacia && (
        <span className="monitor-play"><Icon name="play" size={26} /></span>
      )}
    </div>
  )
}

type Herramienta = 'edicion' | 'clips' | 'medios' | 'cola'

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
  textoVacio
}: {
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
  const [herramienta, setHerramienta] = useState<Herramienta>('clips')
  const [elegido, setElegido] = useState<Elegido>(null)
  const elegir = useCallback((e: Elegido) => setElegido(e), [])
  const timeline = proyecto.timeline ?? timelineVacia()
  const historial = useHistorial(timeline, onCambiarTimeline, proyecto.id)
  const fuentes = useMemo<FuentesVista>(() => {
    const lista: FuentesVista = { principal: { url: mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente'), tipo: 'video' } }
    for (const m of proyecto.medios ?? []) lista[m.id] = { url: mediaUrl(proyecto.id, `medio/${m.id}`), tipo: m.tipo }
    return lista
  }, [proyecto.id, proyecto.proxy, proyecto.medios])
  const reproductor = useReproductor(timeline, proyecto.id, fuentes)
  const [agregando, setAgregando] = useState(false)

  const duracionDe = (fuente: string) => {
    if (fuente === 'principal') return proyecto.source.duration
    const m = proyecto.medios?.find((x) => x.id === fuente)
    return m ? (m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion) : 0
  }
  const nombreDe = (fuente: string) => (fuente === 'principal' ? proyecto.source.name : (proyecto.medios?.find((x) => x.id === fuente)?.nombre ?? '?'))

  /** Pone un medio en la timeline (entero; una imagen, 4 s). Se puede deshacer. */
  function poner(fuente: string, donde: 'final' | 'cabezal', base = timeline) {
    const m = proyecto.medios?.find((x) => x.id === fuente)
    const salida = fuente === 'principal' ? proyecto.source.duration : m?.tipo === 'imagen' ? DURACION_IMAGEN : (m?.duracion ?? 0)
    if (salida <= 0) return base
    const r = insertarClip(base, { fuente, entrada: 0, salida }, donde === 'cabezal' ? reproductor.tiempo : undefined)
    return r.timeline
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

  const pestañas: { id: Herramienta; nombre: string }[] = [
    { id: 'edicion', nombre: 'Edición del agente' },
    { id: 'clips', nombre: `Clips (${proyecto.clips.length})` },
    { id: 'medios', nombre: `Medios (${(proyecto.medios?.length ?? 0) + 1})` },
    { id: 'cola', nombre: `Cola (${cola.length})` }
  ]

  return (
    <div className="editor">
      <Monitor proyecto={proyecto} timeline={timeline} reproductor={reproductor} />
      <TimelineEditor
        key={proyecto.id}
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
        onCambiarArchivo={proyecto.demo ? undefined : (clipId) => void cambiarArchivo(clipId)}
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

      <div className="herramientas">
        <div className="herramientas-tabs">
          {pestañas.map((p) => (
            <button
              key={p.id}
              className={`chip ${herramienta === p.id ? 'is-active' : ''}`}
              onClick={() => setHerramienta(p.id)}
            >
              {p.nombre}
            </button>
          ))}
        </div>

        {herramienta === 'edicion' && proyecto.receta && (
          <div className="herramienta-accion">
            <span>La edición del agente se puede seguir editando a mano.</span>
            <button className="btn small" onClick={() => proyecto.receta && llevarATimeline(timelineDesdeReceta(proyecto.receta))}>
              <Icon name="layers" size={14} /> Llevar a la timeline
            </button>
          </div>
        )}
        {herramienta === 'edicion' && (
          <EdicionCard
            proyecto={proyecto}
            editando={editando}
            renderizando={renderizando}
            onEditar={onEditar}
            onRenderizar={onRenderizarEdicion}
            onAbrir={onAbrirEdicion}
          />
        )}
        {herramienta === 'clips' && clip && (
          <div className="herramienta-accion">
            <span>«{clip.title}» · {Math.round(clip.end - clip.start)} s</span>
            <button
              className="btn small"
              onClick={() => llevarATimeline(timelineDesdeCortes([{ start: clip.start, end: clip.end }], clip.title))}
            >
              <Icon name="layers" size={14} /> Abrir en la timeline
            </button>
          </div>
        )}
        {herramienta === 'clips' && (
          <div className="herramienta-clips">
            <ClipList
              clips={proyecto.clips}
              proyectoId={proyecto.demo ? undefined : proyecto.id}
              selected={seleccion}
              onSelect={onSelect}
              vacio={textoVacio}
            />
            {clip && (
              <Inspector
                clip={clip}
                project={proyecto}
                onChange={onCambiarClip}
                onRender={onRenderClip}
                rendering={renderizando || lote !== null}
              />
            )}
          </div>
        )}
        {herramienta === 'medios' && !proyecto.demo && (
          <div className="herramienta-accion">
            <span>La timeline parte del video completo; vuelve a él cuando quieras.</span>
            <button className="btn small" onClick={() => llevarATimeline(timelineInicial(proyecto.source.duration))}>
              <Icon name="film" size={14} /> Todo el material a la timeline
            </button>
          </div>
        )}
        {herramienta === 'medios' && (
          <MediosPanel
            proyecto={proyecto}
            agregando={agregando}
            onAgregar={() => void agregarMedios()}
            onPoner={(fuente, donde) => {
              const tl = poner(fuente, donde)
              if (tl !== timeline) historial.aplicar(tl)
            }}
            onQuitar={(m) => void quitarMedio(m)}
          />
        )}
        {herramienta === 'medios' && (
          <SourceCard
            proyecto={proyecto}
            progreso={progreso}
            onTranscribir={onTranscribir}
            onPlay={() => reproductor.buscar(0)}
          />
        )}
        {herramienta === 'cola' && (
          <RenderQueue
            jobs={cola}
            pendientes={pendientesLote}
            lote={lote}
            onRenderLote={onRenderLote}
            onOpen={onAbrirSalida}
          />
        )}
      </div>
    </div>
  )
}
