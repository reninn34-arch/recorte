import type { ClipSuggestion, Encuadre, Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { tiempo } from '../format'

const estilos = ['Editorial', 'Impacto', 'Limpio', 'Caja']

const encuadres: { id: Encuadre; label: string }[] = [
  { id: 'cara', label: 'Cara' },
  { id: 'centro', label: 'Centro' },
  { id: 'division', label: 'División' }
]

export function Inspector({
  clip,
  project,
  onChange,
  onRender,
  rendering = false
}: {
  clip?: ClipSuggestion
  project: Project
  onChange: (cambio: Partial<ClipSuggestion>) => void
  onRender: () => void
  rendering?: boolean
}) {
  if (!clip) {
    return (
      <aside className="inspector">
        <div className="panel-head compact">
          <div>
            <h2>Clip</h2>
            <p>Revisa y ajusta antes de renderizar</p>
          </div>
        </div>

        <div className="inspector-empty">
          <span className="clip-empty-icon"><Icon name="film" size={20} /></span>
          <strong>Ningún clip seleccionado</strong>
          <p>Cuando la clase tenga momentos sugeridos, elige uno de la lista para verlo y ajustarlo aquí.</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <div className="panel-head compact">
        <div>
          <h2>Clip</h2>
          <p>Revisa y ajusta antes de renderizar</p>
        </div>
      </div>

      <div className="preview">
        <div className="preview-frame">
          <div className="preview-glow" />
          <span className="preview-brand">{project.brand.name}</span>
          <span className="preview-caption">{clip.hook}</span>
          <span className="preview-play"><Icon name="play" size={16} /></span>
          <span className="preview-bar" style={{ background: project.brand.primary }} />
        </div>
        <div className="preview-controls">
          <span>{tiempo(clip.start)} – {tiempo(clip.end)}</span>
          <span>{Math.round(clip.end - clip.start)} s · 9:16</span>
        </div>
      </div>

      <label className="field">
        <span>Título del clip</span>
        <input value={clip.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>

      <label className="field">
        <span>Gancho</span>
        <textarea rows={3} value={clip.hook} onChange={(e) => onChange({ hook: e.target.value })} />
      </label>

      <div className="field">
        <span>Estilo de subtítulo</span>
        <div className="chips">
          {estilos.map((estilo) => (
            <button
              key={estilo}
              className={`chip ${clip.captionStyle === estilo ? 'is-active' : ''}`}
              onClick={() => onChange({ captionStyle: estilo })}
            >
              {estilo}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Encuadre vertical</span>
        <div className="chips">
          {encuadres.map((encuadre) => (
            <button
              key={encuadre.id}
              className={`chip ${clip.reframe === encuadre.id ? 'is-active' : ''}`}
              onClick={() => onChange({ reframe: encuadre.id })}
            >
              {encuadre.label}
            </button>
          ))}
        </div>
      </div>

      <div className="export-box">
        <div className="export-row"><span>Salida</span><strong>1080×1920 · 30 fps</strong></div>
        <div className="export-row"><span>Formato</span><strong>MP4 · H.264</strong></div>
        <div className="export-row"><span>Extras</span><strong>SRT + portada</strong></div>
      </div>

      <button className="btn primary wide" onClick={onRender} disabled={rendering}>
        <Icon name="sparkles" size={16} /> {rendering ? 'Renderizando…' : 'Renderizar este clip'}
      </button>
      <p className="inspector-note">
        {clip.status === 'listo'
          ? 'Este clip ya tiene un MP4. Puedes volver a renderizarlo con otros ajustes.'
          : 'Salida vertical 1080×1920 con subtítulos y la marca del curso.'}
      </p>
    </aside>
  )
}
