import { useEffect } from 'react'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

export function PlayerModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const archivo = project.proxy ?? 'fuente'

  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [onClose])

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body" onClick={(evento) => evento.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">
          <Icon name="x" size={18} />
        </button>
        <video src={mediaUrl(project.id, archivo)} controls autoPlay />
        <div className="modal-foot">
          <strong>{project.name}</strong>
          <span>{project.source.name}</span>
        </div>
      </div>
    </div>
  )
}
