import { useEffect, useState } from 'react'
import { NOMBRE_ESFUERZO, type AgenteId, type EleccionTarea, type ModeloAgente } from '../../../shared/creacion'
import type { EstadoAgente } from '../../../shared/api'
import { Icon } from '../Icons'
import { LogoAgente } from './Logos'

/**
 * Elegir quién hace el trabajo: a la izquierda los agentes conectados, a la derecha los
 * modelos del que se mira (tal como los dice el agente: nombre, para qué sirve y si es el
 * recomendado), con las versiones anteriores plegadas y, abajo, el esfuerzo del modelo
 * elegido. Elegir un modelo con esfuerzos deja el menú abierto para ajustar el esfuerzo.
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
  useEffect(
    () =>
      // Si el agente suma o quita modelos mientras la app está abierta, la lista cambia sola.
      window.recorte.onModelosCambiaron((id, m) => {
        catalogos.set(id as AgenteId, m)
        setVersion((v) => v + 1)
      }),
    []
  )
  useEffect(() => {
    // Siempre se vuelve a pedir al abrir: el proceso principal responde al instante con lo
    // recordado y lo pone al día de fondo (así un modelo nuevo aparece sin reiniciar).
    for (const id of ids) pedir(id)
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
  const [visto, setVisto] = useState<AgenteId | undefined>(valor?.agente ?? agentes[0]?.id)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const [verPago, setVerPago] = useState(false)
  const a = agentes.find((x) => x.id === visto) ?? agentes[0]
  if (!a) return <p className="cc-nota">Conecta un agente en Inicio para elegir su modelo.</p>

  const lista = modelos[a.id] ?? []
  const hayGratis = lista.some((m) => m.gratis)
  const elegidoAqui = valor?.agente === a.id
  // OpenCode trae decenas: primero los gratis y los de pago a un clic.
  const porPrecio = hayGratis && !verPago ? lista.filter((m) => m.gratis || (elegidoAqui && valor?.modelo === m.id)) : lista
  const principales = porPrecio.filter((m) => !m.anterior || (elegidoAqui && valor?.modelo === m.id))
  const anteriores = porPrecio.filter((m) => m.anterior && !(elegidoAqui && valor?.modelo === m.id))
  const modeloElegido = elegidoAqui && valor?.modelo ? lista.find((m) => m.id === valor.modelo) : undefined

  const fila = (m: ModeloAgente) => {
    const elegido = elegidoAqui && valor?.modelo === m.id
    return (
      <button
        key={m.id}
        type="button"
        className={`em-modelo ${elegido ? 'is-elegido' : ''}`}
        onClick={() => {
          onElegir({ agente: a.id, modelo: m.id, ...(m.esfuerzoDefecto ? { esfuerzo: m.esfuerzoDefecto } : {}) })
          if (!m.esfuerzos.length) cerrar()
        }}
      >
        <span className="em-modelo-texto">
          <span className="em-modelo-nombre">
            {m.nombre}
            {m.recomendado && <span className="em-etiqueta">Recomendado</span>}
            {m.gratis && <span className="em-etiqueta is-gratis">Gratis</span>}
          </span>
          {m.descripcion && <span className="em-modelo-desc">{m.descripcion}</span>}
        </span>
        {elegido && <Icon name="check" size={14} />}
      </button>
    )
  }

  return (
    <div className="em">
      <div className="em-agentes" role="tablist" aria-label="Agentes conectados">
        {agentes.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.id === a.id}
            className={`em-agente ${x.id === a.id ? 'is-visto' : ''} ${valor?.agente === x.id ? 'is-elegido' : ''}`}
            onClick={() => (setVisto(x.id), setVerAnteriores(false), setVerPago(false))}
          >
            <LogoAgente id={x.id} size={18} />
            <span>{x.nombre.replace(/ Code$| CLI$| · Google$/, '')}</span>
          </button>
        ))}
      </div>

      <div className="em-lado">
        <div className="em-cabeza">
          <span>Modelos de {a.nombre}</span>
          <button type="button" className="cc-refrescar" title="Volver a preguntar sus modelos" aria-label={`Volver a preguntar los modelos de ${a.nombre}`} onClick={() => refrescar(a.id)}>
            <Icon name="undo" size={12} />
          </button>
        </div>
        <div className="em-modelos">
          <button
            type="button"
            className={`em-modelo ${elegidoAqui && !valor?.modelo && !valor?.esfuerzo ? 'is-elegido' : ''}`}
            onClick={() => (onElegir({ agente: a.id }), cerrar())}
          >
            <span className="em-modelo-texto">
              <span className="em-modelo-nombre">Su modelo de siempre</span>
              <span className="em-modelo-desc">El que {a.nombre} usa si no le dices otro</span>
            </span>
            {elegidoAqui && !valor?.modelo && !valor?.esfuerzo && <Icon name="check" size={14} />}
          </button>
          {cargando.includes(a.id) && !lista.length && <span className="cc-nota">Preguntando a {a.nombre} qué modelos tiene…</span>}
          {!cargando.includes(a.id) && !lista.length && <span className="cc-nota">{a.nombre} no dijo sus modelos: usa el suyo.</span>}
          {principales.map(fila)}
          {anteriores.length > 0 &&
            (verAnteriores ? (
              <>
                <span className="em-separador">Versiones anteriores</span>
                {anteriores.map(fila)}
              </>
            ) : (
              <button type="button" className="em-mas" onClick={() => setVerAnteriores(true)}>
                Versiones anteriores ({anteriores.length}) <Icon name="chevron" size={11} />
              </button>
            ))}
          {hayGratis && lista.length > porPrecio.length && (
            <button type="button" className="em-mas" onClick={() => setVerPago(true)}>
              Ver los de pago ({lista.length - porPrecio.length}) · gastan saldo <Icon name="chevron" size={11} />
            </button>
          )}
          {a.id === 'antigravity' && lista.length === 1 && (
            <span className="cc-nota">Antigravity solo ofrece este modelo a tu cuenta cuando trabaja desde otra app.</span>
          )}
        </div>

        {modeloElegido && modeloElegido.esfuerzos.length > 0 && (
          <div className="em-esfuerzo">
            <span>Esfuerzo</span>
            <div className="em-esfuerzos" role="radiogroup" aria-label={`Esfuerzo de ${modeloElegido.nombre}`}>
              {modeloElegido.esfuerzos.map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={valor?.esfuerzo === e}
                  className={valor?.esfuerzo === e ? 'is-elegido' : ''}
                  onClick={() => (onElegir({ agente: a.id, modelo: modeloElegido.id, esfuerzo: e }), cerrar())}
                >
                  {NOMBRE_ESFUERZO[e] ?? e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
