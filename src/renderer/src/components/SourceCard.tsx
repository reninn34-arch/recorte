import type { Progreso } from '../../../shared/api'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { tiempo } from '../format'
import { mediaUrl } from '../media'

function duracion(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`
  return `${Math.round(segundos / 60)} min`
}

export function SourceCard({
  proyecto,
  progreso,
  onTranscribir,
  onPlay
}: {
  proyecto: Project
  progreso: Progreso | null
  onTranscribir: () => void
  onPlay: () => void
}) {
  const { source } = proyecto
  const miniatura = proyecto.thumbnail ? mediaUrl(proyecto.id, proyecto.thumbnail) : null
  const transcribiendo = proyecto.transcription === 'transcribiendo'
  const ingesta = progreso?.fase === 'ingesta' && progreso.pct < 1
  const pct = transcribiendo
    ? progreso?.fase === 'transcripcion' ? progreso.pct : 0
    : ingesta ? progreso!.pct : 0
  const texto = transcribiendo
    ? progreso?.fase === 'transcripcion' ? progreso.texto : 'Transcribiendo…'
    : ingesta ? progreso!.texto : ''

  return (
    <section className="source-card">
      <button className="source-art" onClick={onPlay} title="Reproducir">
        {miniatura ? (
          <img className="source-img" src={miniatura} alt="" />
        ) : (
          <div className="source-art-lines" />
        )}
        <span className="source-play"><Icon name="play" size={18} /></span>
        <span className="source-duration">{tiempo(source.duration)}</span>
        {proyecto.demo && <span className="source-demo">Ejemplo</span>}
      </button>

      <div className="source-info">
        <div className="eyebrow"><Icon name="film" size={14} /> Clase importada</div>
        <h1>{proyecto.name}</h1>
        <p>{source.name} · {source.width}×{source.height} · {source.fps} fps</p>

        <div className="source-tags">
          {proyecto.transcription === 'lista' && (
            <span className="tag ok"><Icon name="check" size={13} /> Transcrito</span>
          )}
          {proyecto.language && <span className="tag">{proyecto.language.toUpperCase()}</span>}
          <span className="tag">{duracion(source.duration)}</span>
          {proyecto.transcription === 'error' && <span className="tag error">Error al transcribir</span>}
        </div>

        {(ingesta || transcribiendo) && (
          <div className="source-progress">
            <div className="bar"><span style={{ width: `${Math.round(pct * 100)}%` }} /></div>
            <span>{texto} · {Math.round(pct * 100)}%</span>
          </div>
        )}

        {proyecto.transcription === 'error' && (
          <p className="source-error">{proyecto.transcriptionError}</p>
        )}

        {!proyecto.demo && proyecto.transcription !== 'lista' && !transcribiendo && (
          <button className="btn primary source-action" onClick={onTranscribir}>
            <Icon name="sparkles" size={16} />
            {proyecto.transcription === 'error' ? 'Reintentar transcripción' : 'Transcribir clase'}
          </button>
        )}
      </div>

      <div className="source-side">
        <span className="source-side-label">Momentos</span>
        <strong>{proyecto.clips.length}</strong>
        <span className="source-side-label">
          {proyecto.transcription === 'lista' ? 'Transcrito' : 'Sin transcribir'}
        </span>
      </div>
    </section>
  )
}
