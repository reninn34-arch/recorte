import { useEffect, useState } from 'react'
import type { HabilidadVista } from '../../../shared/api'
import { Icon } from '../Icons'

/**
 * Ajustes → «Habilidades del agente»: las formas de trabajar que el agente usa según el pedido (como las skills de
 * Claude Code), lo que aprendió con cada una y el botón para añadir las tuyas.
 */
export function SeccionHabilidades({ onAviso }: { onAviso: (t: string) => void }) {
  const [lista, setLista] = useState<HabilidadVista[] | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

  useEffect(() => {
    void window.recorte.habilidades().then(setLista).catch(() => setLista([]))
  }, [])

  async function anadir(carpeta: boolean) {
    const r = await window.recorte.habilidadAnadir(carpeta)
    if (!r) return
    if (!r.ok) return onAviso(r.error ?? 'No pude añadir esa habilidad.')
    setLista(await window.recorte.habilidades())
    setAbierta(r.id ?? null)
    onAviso('Habilidad añadida: el agente la usará cuando el pedido encaje.')
  }

  if (!lista) return null
  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>Habilidades del agente</h3>
      </div>
      <div className="op-tarjeta">
        <div className="op-fila">
          <span className="op-icono"><Icon name="sparkles" size={16} /></span>
          <div className="op-fila-texto">
            <strong>Formas de trabajar que usa según lo que pides</strong>
            <span>
              Cada una dice cuándo usarla y cómo hacerlo. Al entregar, el agente apunta lo que aprendió (sobre todo lo que le
              corriges) y la próxima vez lo tiene en cuenta. También puede crear habilidades nuevas.
            </span>
            <div className="criterio-caja">
              <button className="btn small primary" onClick={() => void anadir(false)}>
                Añadir habilidad (.md)
              </button>
              <button className="btn small" onClick={() => void anadir(true)}>
                Añadir carpeta
              </button>
              <button className="btn small" onClick={() => void window.recorte.habilidadesAbrirCarpeta()}>
                Abrir carpeta
              </button>
            </div>
          </div>
        </div>
        <ul className="criterio-lista habilidades-lista">
          {lista.map((h) => (
            <li key={h.id} className="habilidad">
              <button className="habilidad-cabeza" aria-expanded={abierta === h.id} onClick={() => setAbierta(abierta === h.id ? null : h.id)}>
                <span className={`criterio-origen ${h.origen === 'usuario' ? 'dicho' : 'aprendido'}`}>{h.origen === 'usuario' ? 'Tuya' : 'Recorte'}</span>
                <span className="criterio-texto">
                  <strong>{h.nombre}</strong> <span className="tl-dim">— {h.cuando}</span>
                </span>
                {h.aprendido.length > 0 && <span className="criterio-veces">{h.aprendido.length} aprendido{h.aprendido.length === 1 ? '' : 's'}</span>}
              </button>
              {abierta === h.id && (
                <div className="habilidad-aprendido">
                  {h.aprendido.length ? (
                    <ul>
                      {[...h.aprendido].reverse().map((l) => (
                        <li key={l}>
                          <span>{l}</span>
                          <button
                            className="criterio-quitar"
                            title="Olvidar esto"
                            aria-label={`Olvidar: ${l}`}
                            onClick={() => void window.recorte.habilidadOlvidarLeccion(h.id, l).then(setLista)}
                          >
                            <Icon name="x" size={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="tl-dim">Todavía no ha aprendido nada con esta. Lo hará la próxima vez que la use.</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <p className="op-nota">
        Una habilidad es un .md con una cabecera entre dos líneas «---» (nombre y cuándo usarla) y debajo cómo hacerlo. Las
        skills de Claude Code (SKILL.md) también sirven tal cual.
      </p>
    </section>
  )
}
