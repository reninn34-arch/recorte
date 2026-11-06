import type { ClipSuggestion } from '../../../shared/types'
import { Icon } from '../Icons'
import { tiempo } from '../format'

function Estado({ status }: { status: ClipSuggestion['status'] }) {
  if (status === 'listo') return <span className="clip-state done"><Icon name="check" size={15} /></span>
  if (status === 'elegido') return <span className="clip-state chosen"><Icon name="check" size={15} /></span>
  if (status === 'error') return <span className="clip-state error"><Icon name="x" size={15} /></span>
  return <span className="clip-state"><Icon name="chevron" size={15} /></span>
}

export function ClipList({
  clips,
  proyectoId,
  selected,
  onSelect,
  vacio
}: {
  clips: ClipSuggestion[]
  proyectoId?: string
  selected: string
  onSelect: (id: string) => void
  vacio: string
}) {
  return (
    <section className="panel clips-panel">
      <div className="panel-head">
        <div>
          <h2>Clips sugeridos</h2>
          <p>
            {clips.length === 1
              ? '1 momento encontrado en la clase'
              : `${clips.length} momentos encontrados en la clase`}
          </p>
        </div>
        {clips.length > 0 && (
          <button className="btn small ghost" title="Próximo hito: filtros por duración y puntuación">
            <Icon name="sliders" size={15} /> Filtrar
          </button>
        )}
      </div>

      {clips.length === 0 ? (
        <div className="clip-empty">
          <span className="clip-empty-icon"><Icon name="sparkles" size={20} /></span>
          <strong>Sin clips todavía</strong>
          <p>{vacio}</p>
        </div>
      ) : (
        <div className="clip-list">
          {clips.map((clip, indice) => (
            <button
              key={clip.id}
              className={`clip-row ${selected === clip.id ? 'is-selected' : ''}`}
              onClick={() => onSelect(clip.id)}
            >
              <span className="clip-thumb" data-tone={indice % 5}>
                {clip.cover && proyectoId ? (
                  <img
                    className="clip-thumb-img"
                    src={`recorte-media://${proyectoId}/salidas/${clip.cover.split(/[\\/]/).pop()}`}
                    alt=""
                  />
                ) : null}
                <span className="clip-thumb-play"><Icon name="play" size={12} /></span>
                <span className="clip-thumb-time">{tiempo(clip.end - clip.start)}</span>
              </span>

              <span className="clip-main">
                <span className="clip-title">{clip.title}</span>
                <span className="clip-meta">{tiempo(clip.start)} – {tiempo(clip.end)} · {clip.hook}</span>
              </span>

              <span className={`score ${clip.score >= 90 ? 'hot' : clip.score >= 82 ? 'warm' : ''}`}>
                {clip.score}
              </span>

              <Estado status={clip.status} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
