import type { BrandKit, Project } from '../../../shared/types'
import { Icon } from '../Icons'

export function BrandView({
  project,
  onChange,
  onSave
}: {
  project: Project
  onChange: (cambio: Partial<BrandKit>) => void
  onSave: () => void
}) {
  const { brand } = project

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="eyebrow"><Icon name="palette" size={14} /> Identidad</span>
          <h2>Marca del curso</h2>
          <p>Lo que se repite en cada reel: colores, tipografía y logo.</p>
        </div>
        <button className="btn primary" onClick={onSave}>
          <Icon name="check" size={16} /> Guardar marca
        </button>
      </header>

      <div className="brand-grid">
        <section className="panel form-panel">
          <label className="field">
            <span>Nombre</span>
            <input value={brand.name} onChange={(e) => onChange({ name: e.target.value })} />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Color principal</span>
              <input
                type="color"
                value={brand.primary}
                onChange={(e) => onChange({ primary: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Color de acento</span>
              <input
                type="color"
                value={brand.secondary}
                onChange={(e) => onChange({ secondary: e.target.value })}
              />
            </label>
          </div>

          <label className="field">
            <span>Tipografía</span>
            <select value={brand.font} onChange={(e) => onChange({ font: e.target.value })}>
              <option>Inter</option>
              <option>Manrope</option>
              <option>DM Sans</option>
              <option>Space Grotesk</option>
            </select>
          </label>

          <div className="field">
            <span>Logo</span>
            <button className="upload-box" type="button">
              <Icon name="upload" size={18} /> Subir SVG o PNG
            </button>
          </div>
        </section>

        <section className="brand-preview-wrap">
          <span className="preview-label">Así se ve en un reel</span>
          <div
            className="brand-preview"
            style={{ background: `radial-gradient(circle at 50% 30%, ${brand.primary}33, #10130c 62%)` }}
          >
            <span className="preview-brand">{brand.name}</span>
            <span className="preview-caption" style={{ color: brand.primary }}>
              La luz no se arregla en Photoshop
            </span>
            <span className="preview-play"><Icon name="play" size={16} /></span>
            <span className="preview-bar" style={{ background: brand.secondary }} />
          </div>
          <p className="preview-label">El subtítulo y la barra usan los colores de la marca.</p>
        </section>
      </div>
    </div>
  )
}
