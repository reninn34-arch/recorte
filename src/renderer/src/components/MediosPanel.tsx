import { DURACION_IMAGEN } from '../../../shared/timeline'
import type { MedioProyecto, Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * La biblioteca del proyecto: el video principal y los videos e imágenes que agregues.
 * Cada uno se pone en la timeline (al final o en el cabezal) o se quita del proyecto.
 */

function mmss(s: number): string {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

export function MediosPanel({
  proyecto,
  agregando,
  onAgregar,
  onPoner,
  onQuitar
}: {
  proyecto: Project
  agregando: boolean
  onAgregar: () => void
  /** Pone el medio (o el video principal, `principal`) en la timeline. */
  onPoner: (fuente: string, donde: 'final' | 'cabezal') => void
  onQuitar: (medio: MedioProyecto) => void
}) {
  const medios = proyecto.medios ?? []
  const usos = (id: string) => (proyecto.timeline?.clips ?? []).filter((c) => c.fuente === id).length

  return (
    <div className="medios">
      <div className="medios-cabeza">
        <div>
          <strong>Medios del proyecto</strong>
          <span className="tl-dim">
            {medios.length + 1} {medios.length ? 'archivos' : 'archivo'} · agrega todos los videos e imágenes que quieras usar
          </span>
        </div>
        <button className="btn primary small" onClick={onAgregar} disabled={agregando || proyecto.demo}>
          <Icon name="plus" size={14} /> {agregando ? 'Agregando…' : 'Agregar videos o imágenes'}
        </button>
      </div>

      <div className="medios-grid">
        <div className="medio">
          <span className="medio-mini">
            {proyecto.thumbnail ? <img src={mediaUrl(proyecto.id, proyecto.thumbnail)} alt="" /> : <Icon name="film" size={20} />}
            <span className="inicio-duracion">{mmss(proyecto.source.duration)}</span>
          </span>
          <span className="medio-nombre" title={proyecto.source.path}>
            {proyecto.source.name}
          </span>
          <span className="tl-dim">Video principal · {usos('principal')} en la timeline</span>
          <div className="medio-botones">
            <button className="btn small" onClick={() => onPoner('principal', 'final')}>
              Al final
            </button>
            <button className="btn small ghost" onClick={() => onPoner('principal', 'cabezal')}>
              En el cabezal
            </button>
          </div>
        </div>

        {medios.map((m) => (
          <div key={m.id} className="medio">
            <span className="medio-mini">
              {m.tipo === 'imagen' ? (
                <img src={mediaUrl(proyecto.id, `medio/${m.id}`)} alt="" />
              ) : m.miniatura ? (
                <img src={mediaUrl(proyecto.id, m.miniatura)} alt="" />
              ) : (
                <Icon name="film" size={20} />
              )}
              <span className="inicio-duracion">{m.tipo === 'imagen' ? 'Imagen' : mmss(m.duracion)}</span>
            </span>
            <span className="medio-nombre" title={m.ruta}>
              {m.nombre}
            </span>
            <span className="tl-dim">
              {m.tipo === 'imagen' ? `Imagen · entra de ${DURACION_IMAGEN} s` : m.conAudio ? 'Video con sonido' : 'Video sin sonido'} · {usos(m.id)} en la
              timeline
            </span>
            <div className="medio-botones">
              <button className="btn small" onClick={() => onPoner(m.id, 'final')}>
                Al final
              </button>
              <button className="btn small ghost" onClick={() => onPoner(m.id, 'cabezal')}>
                En el cabezal
              </button>
              <button className="btn small ghost medio-quitar" onClick={() => onQuitar(m)} title="Quitar del proyecto (el archivo no se borra)">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
