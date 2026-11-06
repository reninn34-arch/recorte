import { useRef, useState } from 'react'
import type { Progreso } from '../../../shared/api'
import type { ClipSuggestion, Project, RenderJob } from '../../../shared/types'
import { ClipList } from './ClipList'
import { CrearPanel } from './CrearPanel'
import { EdicionCard } from './EdicionCard'
import { Inspector } from './Inspector'
import { RenderQueue } from './RenderQueue'
import { SourceCard } from './SourceCard'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * Cara de editor: monitor + línea de tiempo + herramientas.
 * Las funciones viejas (clips, edición con agente, cola) viven como
 * herramientas bajo la línea de tiempo; el video manda.
 */

function mmss(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function Monitor({
  proyecto,
  videoRef,
  onTiempo
}: {
  proyecto: Project
  videoRef: React.RefObject<HTMLVideoElement | null>
  onTiempo: (t: number) => void
}) {
  const [sonando, setSonando] = useState(false)
  const src = proyecto.demo ? undefined : mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente')

  function alternar() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void video.play()
    else video.pause()
  }

  return (
    <div className="monitor" onClick={alternar}>
      {src ? (
        <video
          ref={videoRef}
          src={src}
          onTimeUpdate={(e) => onTiempo(e.currentTarget.currentTime)}
          onPlay={() => setSonando(true)}
          onPause={() => setSonando(false)}
        />
      ) : (
        <div className="monitor-vacio"><Icon name="play" size={28} /></div>
      )}
      {!sonando && src && (
        <span className="monitor-play"><Icon name="play" size={26} /></span>
      )}
    </div>
  )
}

function Pista({
  etiqueta,
  duracion,
  bloques,
  tiempo,
  onBuscar,
  tono
}: {
  etiqueta: string
  duracion: number
  bloques: { id: string; start: number; end: number; titulo: string }[]
  tiempo: number
  onBuscar: (t: number) => void
  tono: 'edicion' | 'clips' | 'subs'
}) {
  function buscar(e: React.MouseEvent<HTMLDivElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    onBuscar(((e.clientX - caja.left) / caja.width) * duracion)
  }

  return (
    <div className="pista">
      <span className="pista-nombre">{etiqueta}</span>
      <div className="pista-carril" onClick={buscar}>
        {bloques.map((b) => (
          <span
            key={b.id}
            className={`pista-bloque ${tono}`}
            title={`${b.titulo} · ${mmss(b.start)}–${mmss(b.end)}`}
            style={{
              left: `${(b.start / duracion) * 100}%`,
              width: `${Math.max(0.8, ((b.end - b.start) / duracion) * 100)}%`
            }}
          />
        ))}
        <span className="playhead" style={{ left: `${(tiempo / duracion) * 100}%` }} />
      </div>
    </div>
  )
}

function Timeline({
  proyecto,
  tiempo,
  onBuscar
}: {
  proyecto: Project
  tiempo: number
  onBuscar: (t: number) => void
}) {
  const duracion = Math.max(1, proyecto.source.duration)
  const paso = duracion > 240 ? 30 : duracion > 90 ? 10 : 5
  const marcas: number[] = []
  for (let t = 0; t <= duracion; t += paso) marcas.push(t)

  const cortes = (proyecto.receta?.cortes ?? []).map((c, i) => ({
    id: `corte-${i}`,
    start: c.start,
    end: c.end,
    titulo: proyecto.receta?.titulo ?? 'Corte'
  }))
  const clips = proyecto.clips.map((c: ClipSuggestion) => ({
    id: c.id,
    start: c.start,
    end: c.end,
    titulo: c.title
  }))
  const subs = (proyecto.transcript ?? [])
    .filter((s) => s.text.trim())
    .map((s, i) => ({ id: `sub-${i}`, start: s.start, end: s.end, titulo: s.text.trim() }))

  function buscarEnRegla(e: React.MouseEvent<HTMLDivElement>) {
    const caja = e.currentTarget.getBoundingClientRect()
    onBuscar(Math.min(duracion, Math.max(0, ((e.clientX - caja.left) / caja.width) * duracion)))
  }

  return (
    <div className="timeline">
      <div className="timeline-regla" onClick={buscarEnRegla}>
        {marcas.map((t) => (
          <span key={t} className="marca-tiempo" style={{ left: `${(t / duracion) * 100}%` }}>
            {mmss(t)}
          </span>
        ))}
        <span className="playhead regla" style={{ left: `${(tiempo / duracion) * 100}%` }} />
      </div>
      {cortes.length > 0 && (
        <Pista etiqueta="Edición" duracion={duracion} bloques={cortes} tiempo={tiempo} onBuscar={onBuscar} tono="edicion" />
      )}
      <Pista etiqueta="Momentos" duracion={duracion} bloques={clips} tiempo={tiempo} onBuscar={onBuscar} tono="clips" />
      {subs.length > 0 && (
        <Pista etiqueta="Voz" duracion={duracion} bloques={subs} tiempo={tiempo} onBuscar={onBuscar} tono="subs" />
      )}
      <div className="timeline-pie">
        <span>{mmss(tiempo)} / {mmss(duracion)}</span>
      </div>
    </div>
  )
}

type Herramienta = 'crear' | 'edicion' | 'clips' | 'medios' | 'cola'

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
  onCrear,
  creando,
  onAbrirCreacion,
  onTranscribir,
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
  onCrear: (peticion: string, opciones: { incluirMaterial: boolean; estilo: string }) => void
  creando: boolean
  onAbrirCreacion: () => void
  onTranscribir: () => void
  cola: RenderJob[]
  pendientesLote: number
  lote: { indice: number; total: number } | null
  onRenderLote: () => void
  onAbrirSalida: (job: RenderJob) => void
  textoVacio: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [tiempo, setTiempo] = useState(0)
  const [herramienta, setHerramienta] = useState<Herramienta>('crear')

  function buscar(t: number) {
    if (videoRef.current) videoRef.current.currentTime = t
    setTiempo(t)
  }

  const pestañas: { id: Herramienta; nombre: string }[] = [
    { id: 'crear', nombre: 'Crear' },
    { id: 'edicion', nombre: 'Edición del agente' },
    { id: 'clips', nombre: `Clips (${proyecto.clips.length})` },
    { id: 'medios', nombre: 'Medios' },
    { id: 'cola', nombre: `Cola (${cola.length})` }
  ]

  return (
    <div className="editor">
      <Monitor proyecto={proyecto} videoRef={videoRef} onTiempo={setTiempo} />
      <Timeline proyecto={proyecto} tiempo={tiempo} onBuscar={buscar} />

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

        {herramienta === 'crear' && (
          <CrearPanel
            proyecto={proyecto}
            creando={creando}
            onCrear={onCrear}
            onAbrir={onAbrirCreacion}
          />
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
        {herramienta === 'medios' && (
          <SourceCard
            proyecto={proyecto}
            progreso={progreso}
            onTranscribir={onTranscribir}
            onPlay={() => buscar(0)}
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
