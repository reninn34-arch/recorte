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
import { capaNueva, cambiarCapa, cambiarFuente, duracionTimeline, DURACION_IMAGEN, insertarClip, MAX_IMAGEN, quitarFuente, timelineDesdeCortes, timelineDesdeReceta, timelineInicial, timelineVacia, type Timeline } from '../../../shared/timeline'
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
      historial.aplicar(cambiarCapa(timeline, capaId, { fuente: r.medio }, { ...duraciones, [r.medio]: MAX_IMAGEN }))
      onAviso('Listo: la capa ya no tiene fondo. El original sigue en la biblioteca.')
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

  const pestañas: { id: Herramienta; nombre: string }[] = [
    { id: 'edicion', nombre: 'Edición del agente' },
    { id: 'clips', nombre: `Clips (${proyecto.clips.length})` },
    { id: 'medios', nombre: `Medios (${(proyecto.medios?.length ?? 0) + 1})` },
    { id: 'cola', nombre: `Cola (${cola.length})` }
  ]

  return (
    <div className="editor">
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
