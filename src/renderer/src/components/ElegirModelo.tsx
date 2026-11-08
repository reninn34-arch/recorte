import { useEffect, useState } from 'react'
import { NOMBRE_ESFUERZO, type AgenteId, type EleccionTarea, type ModeloAgente } from '../../../shared/creacion'
import type { EstadoAgente } from '../../../shared/api'
import { Icon } from '../Icons'
import { LogoAgente } from './Logos'

/**
 * Los modelos de cada agente conectado, tal como los dice el agente, con sus esfuerzos
 * (bajo, medio, alto…). Elegir un modelo lo deja con su esfuerzo de siempre; elegir un
 * esfuerzo cierra el menú. Los catálogos se recuerdan mientras la app está abierta.
 */

const catalogos = new Map<AgenteId, ModeloAgente[]>()

/** Los catálogos de estos agentes: lo recordado al instante y lo que falte, al llegar. */
export function useCatalogos(ids: AgenteId[]): { modelos: Partial<Record<AgenteId, ModeloAgente[]>>; cargando: AgenteId[]; refrescar: (id: AgenteId) => void } {
  const [, setVersion] = useState(0)
  const [cargando, setCargando] = useState<AgenteId[]>([])
  const clave = ids.join(',')
  const pedir = (id: AgenteId, forzar = false) => {
    setCargando((c) => (c.includes(id) ? c : [...c, id]))
    void window.recorte
      .agentesModelos(id, forzar)
      .then((m) => {
        catalogos.set(id, m)
        setVersion((v) => v + 1)
      })
      .catch(() => {})
      .finally(() => setCargando((c) => c.filter((x) => x !== id)))
  }
  useEffect(() => {
    for (const id of ids) if (!catalogos.has(id)) pedir(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return {
    modelos: Object.fromEntries(ids.filter((id) => catalogos.has(id)).map((id) => [id, catalogos.get(id)!])),
    cargando,
    refrescar: (id) => pedir(id, true)
  }
}

/** «Opus 5.5 · Alto»: el modelo (con su nombre del catálogo) y el esfuerzo de una elección. */
export function nombreModelo(e: EleccionTarea): string | null {
  if (!e.modelo && !e.esfuerzo) return null
  const m = e.modelo ? catalogos.get(e.agente)?.find((x) => x.id === e.modelo) : undefined
  const nombre = e.modelo ? (m?.nombre ?? e.modelo) : ''
  const esfuerzo = e.esfuerzo ? (NOMBRE_ESFUERZO[e.esfuerzo] ?? e.esfuerzo) : ''
  return [nombre, esfuerzo].filter(Boolean).join(' · ')
}

export function ElegirModelo({
  agentes,
  valor,
  onElegir,
  cerrar
}: {
  agentes: EstadoAgente[]
  valor: EleccionTarea | null
  onElegir: (e: EleccionTarea) => void
  cerrar: () => void
}) {
  const { modelos, cargando, refrescar } = useCatalogos(agentes.map((a) => a.id))
  const [verPago, setVerPago] = useState<Partial<Record<AgenteId, boolean>>>({})

  return (
    <>
      {agentes.map((a) => {
        const lista = modelos[a.id] ?? []
        const hayGratis = lista.some((m) => m.gratis)
        // OpenCode trae decenas: primero los gratis y los de pago a un clic.
        const visibles = hayGratis && !verPago[a.id] ? lista.filter((m) => m.gratis || (valor?.agente === a.id && valor.modelo === m.id)) : lista
        return (
          <div key={a.id} className="cc-grupo">
            <span className="cc-grupo-nombre">
              <LogoAgente id={a.id} size={16} /> {a.nombre}
              <button
                type="button"
                className="cc-refrescar"
                title="Volver a preguntar sus modelos"
                aria-label={`Volver a preguntar los modelos de ${a.nombre}`}
                onClick={() => refrescar(a.id)}
              >
                <Icon name="undo" size={11} />
              </button>
            </span>
            <button
              type="button"
              className={`cc-opcion ${valor?.agente === a.id && !valor.modelo && !valor.esfuerzo ? 'is-elegida' : ''}`}
              onClick={() => (onElegir({ agente: a.id }), cerrar())}
            >
              <span className="cc-opcion-texto">Su modelo de siempre</span>
              {valor?.agente === a.id && !valor.modelo && !valor.esfuerzo && <Icon name="check" size={13} />}
            </button>
            {cargando.includes(a.id) && !lista.length && <span className="cc-nota">Preguntando a {a.nombre} qué modelos tiene…</span>}
            {!cargando.includes(a.id) && !lista.length && <span className="cc-nota">{a.nombre} no dijo sus modelos: usa el suyo.</span>}
            {visibles.map((m) => {
              const elegido = valor?.agente === a.id && valor.modelo === m.id
              return (
                <div key={m.id} className={`cc-modelo ${elegido ? 'is-elegida' : ''}`}>
                  <button
                    type="button"
                    className={`cc-opcion ${elegido ? 'is-elegida' : ''}`}
                    onClick={() => {
                      onElegir({ agente: a.id, modelo: m.id, ...(m.esfuerzoDefecto ? { esfuerzo: m.esfuerzoDefecto } : {}) })
                      if (!m.esfuerzos.length) cerrar()
                    }}
                  >
                    <span className="cc-opcion-texto">{m.nombre}</span>
                    {m.gratis && <span className="cc-opcion-nota">gratis</span>}
                    {elegido && <Icon name="check" size={13} />}
                  </button>
                  {m.esfuerzos.length > 0 && (
                    <div className="cc-esfuerzos" role="group" aria-label={`Esfuerzo de ${m.nombre}`}>
                      {m.esfuerzos.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={`cc-esfuerzo ${elegido && valor?.esfuerzo === e ? 'is-elegido' : ''}`}
                          onClick={() => (onElegir({ agente: a.id, modelo: m.id, esfuerzo: e }), cerrar())}
                        >
                          {NOMBRE_ESFUERZO[e] ?? e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {hayGratis && lista.length > visibles.length && (
              <button type="button" className="cc-opcion cc-mas" onClick={() => setVerPago((v) => ({ ...v, [a.id]: true }))}>
                <span className="cc-opcion-texto">Ver los de pago ({lista.length - visibles.length})</span>
                <span className="cc-opcion-nota">gastan saldo</span>
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
