import { Icon } from '../Icons'

export function TopBar({
  name,
  onImport,
  onBatch,
  puedeGenerar,
  importando,
  generando,
  onInicio
}: {
  name: string
  onImport: () => void
  onBatch: () => void
  puedeGenerar: boolean
  importando: boolean
  generando: boolean
  onInicio: () => void
}) {
  return (
    <header className="topbar">
      <div className="crumbs">
        <button className="crumb-muted crumb-boton" onClick={onInicio}>Proyectos</button>
        <Icon name="chevron" size={14} />
        <strong>{name}</strong>
      </div>

      <div className="topbar-actions">
        <span className="pill"><span className="dot" /> Local</span>
        <button className="btn ghost" onClick={onImport} disabled={importando}>
          <Icon name="upload" size={16} /> {importando ? 'Importando…' : 'Nuevo proyecto'}
        </button>
        <button className="btn primary" onClick={onBatch} disabled={!puedeGenerar || generando}>
          <Icon name="sparkles" size={16} /> {generando ? 'Buscando momentos…' : 'Generar lote'}
        </button>
      </div>
    </header>
  )
}
