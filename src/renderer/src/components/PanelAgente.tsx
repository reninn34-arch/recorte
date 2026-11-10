import { useEffect, useRef, useState } from 'react'
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
  desde: desdeTrabajo,
  progreso,
  onPlan,
  onHacer,
  onParar
}: {
  creacion: Creacion
  trabajando: boolean
  /** Cuándo empezó el agente (ms), lo dice el proceso principal: salir y volver no reinicia el reloj. */
  desde?: number
  progreso: { pct: number; texto?: string; registro?: string[]; paso?: number; pasos?: string[] } | null
  onPlan: () => void
  onHacer: () => void
  onParar: () => void
}) {
  const c = creacion
  const a = c.agente
  const plan = a?.plan
  const res = a?.resultado
  // Cuánto lleva trabajando, desde la hora real de inicio (si no llegó aún, desde que se ve).
  const visto = useRef<number | null>(null)
  const [, latido] = useState(0)
  useEffect(() => {
    if (!trabajando) {
      visto.current = null
      return
    }
    visto.current = Date.now()
    const reloj = setInterval(() => latido((x) => x + 1), 1000)
    return () => clearInterval(reloj)
  }, [trabajando])
  const inicio = desdeTrabajo ?? visto.current
  const lleva = trabajando && inicio ? Math.max(0, Math.floor((Date.now() - inicio) / 1000)) : 0
  // Lo que va haciendo llega en vivo con el progreso; la creación guardada solo se refresca al final.
  const registro = progreso?.registro ?? a?.registro ?? []
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  // La barra es de TIEMPO, no un porcentaje inventado: se llena hasta lo que suele tardar
  // este paso y, si se pasa, lo dice. El avance real es la lista de lo que va haciendo.
  // Con «hazlo directo», el plan y el video van en la misma llamada: los pasos dicen que ya está haciendo.
  const enPlan = c.fase === 'plan' && !progreso?.pasos?.length
  const habitual = enPlan ? 5 * 60 : 15 * 60
  const pasado = lleva > habitual

  if (trabajando) {
    return (
      <div className="estudio-progreso panel-agente">
        <span>
          {enPlan ? 'El agente está mirando tus archivos' : 'El agente está trabajando'} · lleva {mm(lleva)}
          <span className="tl-dim"> de ~{habitual / 60} min habituales</span>
        </span>
        <span className={`tl-progreso ${pasado ? 'is-pasado' : ''}`} title="Tiempo transcurrido frente a lo que suele tardar este paso">
          <span style={{ width: `${Math.min(100, Math.round((lleva / habitual) * 100))}%` }} />
        </span>
        {pasado && (
          <span className="pa-pasado">
            Está tardando más de lo habitual. Mira abajo lo último que hizo: si sigue avanzando, espera; si lleva mucho en lo
            mismo, puedes pararlo.
          </span>
        )}
        {registro.length ? (
          <ol className="pa-registro">
            {registro.slice(-10).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          <span className="tl-dim">{progreso?.texto ?? 'Empezando…'}</span>
        )}
        <span className="tl-dim">
          {enPlan
            ? 'En el plan solo mira un vistazo de tus archivos y te propone cómo hacerlo.'
            : 'Hace el video, saca fotogramas para comprobarlo y corrige antes de entregarte.'}
        </span>
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
