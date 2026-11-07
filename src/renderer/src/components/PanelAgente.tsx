import type { Creacion } from '../../../shared/creacion'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * El centro del estudio en modo agente: el plan que propone (con «Hazlo»), lo que va
 * haciendo mientras trabaja y, al terminar, los fotogramas que sacó Recorte para revisar
 * y lo que el agente dice que comprobó. El video en sí lo muestra el estudio, como siempre.
 */
export function PanelAgente({
  creacion,
  trabajando,
  progreso,
  onPlan,
  onHacer,
  onParar
}: {
  creacion: Creacion
  trabajando: boolean
  progreso: { pct: number; texto?: string } | null
  onPlan: () => void
  onHacer: () => void
  onParar: () => void
}) {
  const c = creacion
  const a = c.agente
  const plan = a?.plan
  const res = a?.resultado

  if (trabajando) {
    return (
      <div className="estudio-progreso panel-agente">
        <span>{c.fase === 'plan' ? 'El agente está mirando tus archivos' : 'El agente está trabajando'}</span>
        <span className="tl-progreso">
          <span style={{ width: `${Math.round((progreso?.pct ?? 0.05) * 100)}%` }} />
        </span>
        {a?.registro.length ? (
          <ol className="pa-registro">
            {a.registro.slice(-10).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          <span className="tl-dim">{progreso?.texto ?? 'Empezando…'}</span>
        )}
        <span className="tl-dim">Mira los archivos, hace, comprueba sus fotogramas y corrige antes de entregarte. Puede tardar varios minutos.</span>
        <button className="btn small ghost" onClick={onParar}>
          Parar
        </button>
      </div>
    )
  }

  return (
    <>
      {!res && plan && (
        <div className="estudio-guion pa-plan">
          <div className="estudio-guion-cabeza">
            <h2>Plan</h2>
            {plan.herramienta && <span className="tl-dim">Con {plan.herramienta}</span>}
            <span className="tl-flex" />
            {!plan.preguntas.length && (
              <button className="btn primary" onClick={onHacer}>
                <Icon name="play" size={15} /> Hazlo
              </button>
            )}
          </div>
          <p className="pa-entendi">{plan.entendi}</p>
          {plan.pasos.length > 0 && (
            <ol className="pa-pasos">
              {plan.pasos.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          )}
          {plan.preguntas.length > 0 && (
            <div className="pa-preguntas">
              <b>Antes de hacerlo necesita saber:</b>
              <ul>
                {plan.preguntas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <span className="tl-dim">Contéstale en el chat, o</span>{' '}
              <button className="btn small ghost" onClick={onHacer}>
                hazlo con lo más sensato
              </button>
            </div>
          )}
          {!plan.preguntas.length && <span className="tl-dim">Si quieres otra cosa, díselo en el chat y rehace el plan.</span>}
        </div>
      )}

      {!res && !plan && (
        <div className="estudio-vacio">
          <p>El agente todavía no propuso un plan.</p>
          <button className="btn primary" onClick={onPlan}>
            <Icon name="sparkles" size={15} /> Pedir el plan
          </button>
        </div>
      )}

      {res && (
        <div className="estudio-guion pa-resultado">
          {res.tipo === 'imagen' && <img className="pa-imagen" src={mediaUrl(`c-${c.id}`, res.archivo)} alt="" />}
          <div className="estudio-guion-cabeza">
            <h2>Revisión</h2>
            <span className="tl-dim">
              {res.tipo === 'video' && res.duracion ? `${res.duracion.toFixed(1)} s · ${res.ancho}×${res.alto}` : 'Imagen'} · versión {c.version}
            </span>
          </div>
          {res.tipo === 'video' && res.revision.length > 0 && (
            <div className="pa-fotogramas">
              {res.revision.map((r) => (
                <img key={r} src={mediaUrl(`c-${c.id}`, r)} alt="" />
              ))}
            </div>
          )}
          {res.comprobaciones.length > 0 && (
            <ul className="pe-lista">
              {res.comprobaciones.map((x, i) => (
                <li key={i} className="ok">
                  <Icon name="check" size={13} />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          )}
          <span className="tl-dim">¿Algo no te gusta? Díselo en el chat: cambia solo eso y conserva lo demás.</span>
        </div>
      )}
    </>
  )
}
