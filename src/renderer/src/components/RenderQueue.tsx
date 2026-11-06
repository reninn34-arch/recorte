import type { RenderJob } from '../../../shared/types'
import { Icon } from '../Icons'

export function RenderQueue({
  jobs,
  pendientes = 0,
  lote = null,
  onRenderLote,
  onOpen
}: {
  jobs: RenderJob[]
  /** Clips del proyecto que aún no tienen MP4 (sugerido, elegido o error). */
  pendientes?: number
  /** Progreso conjunto del lote en marcha, o null si no hay lote. */
  lote?: { indice: number; total: number } | null
  onRenderLote?: () => void
  onOpen?: (job: RenderJob) => void
}) {
  const listos = jobs.filter((job) => job.status === 'listo').length

  return (
    <section className="queue">
      <div className="queue-head">
        <h3>Cola de render</h3>
        <div className="queue-actions">
          <span>
            {listos === 1 ? '1 listo' : `${listos} listos`} ·{' '}
            {jobs.length === 1 ? '1 en total' : `${jobs.length} en total`}
          </span>
          {lote ? (
            <span className="queue-lote">
              Renderizando {lote.indice} de {lote.total}
            </span>
          ) : (
            pendientes > 0 && (
              <button className="btn small" onClick={onRenderLote} title="Renderizar todos los clips pendientes">
                <Icon name="sparkles" size={14} /> Renderizar lote ({pendientes})
              </button>
            )
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="queue-empty">
          <Icon name="film" size={18} />
          <span>Los clips que renderices aparecen aquí.</span>
        </div>
      ) : (
        <div className="queue-list">
          {jobs.map((job) => (
            <div className="queue-item" key={job.id}>
              <span className={`queue-icon ${job.status}`}>
                <Icon
                  name={job.status === 'listo' ? 'check' : job.status === 'error' ? 'x' : 'film'}
                  size={15}
                />
              </span>
              <span className="queue-title">{job.title}</span>
              <span className="queue-progress"><span style={{ width: `${job.progress}%` }} /></span>
              <span className="queue-status">
                {job.status === 'renderizando' ? `${job.progress}%` : job.status}
              </span>
              {job.status === 'listo' && job.output ? (
                <button className="queue-open" onClick={() => onOpen?.(job)} title="Mostrar el MP4">
                  <Icon name="folder" size={13} /> Abrir
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
