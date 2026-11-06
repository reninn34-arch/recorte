import type { Project } from '../../../shared/types'
import { describirReceta } from '../../../shared/receta'
import { Icon } from '../Icons'

/**
 * Vista de revisión de la RecetaEdicion (fase 1): el agente propone, el usuario
 * lee en lenguaje humano qué se va a hacer y decide si renderiza.
 */
export function EdicionCard({
  proyecto,
  editando,
  renderizando,
  onEditar,
  onRenderizar,
  onAbrir
}: {
  proyecto: Project
  editando: boolean
  renderizando: boolean
  onEditar: () => void
  onRenderizar: () => void
  onAbrir: () => void
}) {
  const receta = proyecto.receta
  const transcrita = proyecto.transcription === 'lista'

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Edición con agente</h2>
          <p>El agente decide cortes, color, ritmo y captions; tú revisas antes de renderizar.</p>
        </div>
        <button className="btn small" onClick={onEditar} disabled={!transcrita || editando || renderizando}>
          <Icon name="sparkles" size={15} /> {editando ? 'Editando…' : receta ? 'Reeditar' : 'Editar con agente'}
        </button>
      </div>

      {!transcrita ? (
        <p className="hint">Primero transcribe la clase: la edición sale de la transcripción.</p>
      ) : !receta ? (
        <p className="hint">
          Todavía no hay edición. Pulsa «Editar con agente» y el agente conectado en Ajustes
          (o la selección local, si no hay ninguno) propondrá una edición completa.
        </p>
      ) : (
        <>
          <h3 style={{ marginTop: 0 }}>{receta.titulo}</h3>
          {receta.resumen && <p className="hint">{receta.resumen}</p>}
          <ul className="hint" style={{ paddingLeft: 18, margin: '8px 0' }}>
            {describirReceta(receta).map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
          <div className="field-row" style={{ alignItems: 'center' }}>
            <button className="btn primary" onClick={onRenderizar} disabled={renderizando || editando}>
              <Icon name="play" size={15} /> {renderizando ? 'Renderizando…' : 'Renderizar edición'}
            </button>
            {proyecto.recetaSalida && (
              <button className="btn ghost" onClick={onAbrir}>
                <Icon name="folder" size={15} /> Abrir MP4
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
