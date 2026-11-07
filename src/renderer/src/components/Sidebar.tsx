import type { Project } from '../../../shared/types'
import { Icon, type IconName } from '../Icons'

const items: { id: string; label: string; icon: IconName }[] = [
  { id: 'inicio', label: 'Inicio', icon: 'folder' },
  { id: 'proyectos', label: 'Editor', icon: 'film' },
  { id: 'crear', label: 'Crear con IA', icon: 'sparkles' },
  { id: 'marca', label: 'Marca', icon: 'palette' },
  { id: 'ajustes', label: 'Ajustes', icon: 'settings' }
]

export function Sidebar({
  active,
  onChange,
  proyectos,
  activo,
  onAbrir,
  onNuevo
}: {
  active: string
  onChange: (id: string) => void
  proyectos: Project[]
  activo: string
  onAbrir: (id: string) => void
  onNuevo: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="brand" onClick={() => onChange('inicio')} role="button" title="Inicio">
        <span className="brand-mark"><Icon name="scissors" size={17} /></span>
        <span className="brand-name">recorte</span>
      </div>

      <button className="btn primary sidebar-nuevo" onClick={onNuevo}>
        <Icon name="upload" size={16} /> <span>Nuevo proyecto</span>
      </button>

      <nav className="nav">
        {items.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? 'is-active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="recientes">
        <span className="recientes-title">Recientes</span>
        {proyectos.length === 0 ? (
          <p className="recientes-vacio">Importa una clase para empezar.</p>
        ) : (
          proyectos.slice(0, 5).map((proyecto) => (
            <button
              key={proyecto.id}
              className={`reciente ${proyecto.id === activo ? 'is-active' : ''}`}
              onClick={() => onAbrir(proyecto.id)}
              title={proyecto.name}
            >
              <span className={`reciente-dot ${proyecto.transcription}`} />
              <span>{proyecto.name}</span>
            </button>
          ))
        )}
      </div>

      <div className="sidebar-foot">
        <div className="local-badge"><span className="dot" /> Todo en tu equipo</div>
        <p>Sin subir tus clases a la nube.</p>
      </div>
    </aside>
  )
}
