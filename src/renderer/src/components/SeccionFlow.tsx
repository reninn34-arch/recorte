import { useEffect, useState } from 'react'
import type { EstadoFlow } from '../../../shared/flow'
import { Icon } from '../Icons'
import { LogoAgente } from './Logos'

/**
 * Google Flow en Ajustes, como en Sloth: con qué cuentas genera (la de la voz y las que se
 * agregan), cuánto queda y cuánto se usó, y los dos interruptores que decide cada quien.
 */

function hace(t?: number): string {
  if (!t) return 'créditos sin leer'
  const min = Math.round((Date.now() - t) / 60_000)
  return min < 1 ? 'leído ahora' : min < 60 ? `leído hace ${min} min` : `leído hace ${Math.round(min / 60)} h`
}

function Interruptor({ activo, onCambiar }: { activo: boolean; onCambiar: (v: boolean) => void }) {
  return (
    <span className="op-interruptor">
      <button role="switch" aria-checked={activo} className={activo ? 'is-on' : ''} onClick={() => onCambiar(!activo)}>
        <i />
      </button>
    </span>
  )
}

export function SeccionFlow({ onAviso }: { onAviso: (t: string) => void }) {
  const [e, setE] = useState<EstadoFlow | null>(null)

  useEffect(() => {
    void window.recorte.flowEstado().then(setE).catch(() => {})
  }, [])

  // Mientras entras con otra cuenta o se leen los créditos, el estado se mira cada 2 s.
  useEffect(() => {
    if (!e?.agregando && !e?.leyendo) return
    const reloj = setInterval(() => void window.recorte.flowEstado().then(setE).catch(() => {}), 2000)
    return () => clearInterval(reloj)
  }, [e?.agregando, e?.leyendo])

  if (!e) return null
  const creditos = e.cuentas.reduce((t, c) => t + (c.creditos ?? 0), 0)
  const sinLeer = e.cuentas.some((c) => c.creditos === null)

  async function actualizar() {
    setE({ ...e!, leyendo: true })
    setE(await window.recorte.flowLeerSaldos())
  }

  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>Google Flow</h3>
      </div>
      <div className="op-tarjeta">
        <div className="op-fila">
          <LogoAgente id="gemini" size={36} />
          <div className="op-fila-texto">
            <strong>Google Flow</strong>
            <span>
              Veo y Nano Banana con {e.cuentas.length === 1 ? 'una cuenta' : `${e.cuentas.length} cuentas`}
              {e.cuentas.length ? ` · quedan ${creditos} créditos${sinLeer ? ' (sin leer todas)' : ''}` : ''}
            </span>
            <span>
              Hoy: {e.uso.hoy.videos} videos ({e.uso.hoy.creditos} créditos) · este mes: {e.uso.mes.videos} videos ({e.uso.mes.creditos}{' '}
              créditos) ·{' '}
              <button className="op-enlace en-linea" onClick={() => void actualizar()} disabled={e.leyendo || !e.cuentas.length}>
                {e.leyendo ? 'Leyendo créditos…' : 'Actualizar créditos'}
              </button>
            </span>
          </div>
          <div className="op-fila-lado">
            <button className="btn small" onClick={async () => setE(await window.recorte.flowAgregarCuenta())} disabled={e.agregando || !e.navegador}>
              {e.agregando ? 'Entra en la ventana de Edge…' : 'Agregar cuenta'}
            </button>
          </div>
        </div>

        {e.cuentas.map((c) => (
          <div key={c.correo} className="op-fila op-subfila">
            <span className="op-icono"><Icon name="settings" size={15} /></span>
            <div className="op-fila-texto">
              <strong>
                <span className={`agente-punto ${c.descansa ? 'aviso' : 'ok'}`} /> {c.correo}
              </strong>
              <span>
                {c.generando
                  ? 'Generando…'
                  : c.descansa
                    ? c.descansa.motivo === 'creditos'
                      ? 'Sin créditos para videos por ahora (las imágenes siguen)'
                      : c.descansa.motivo === 'sesion'
                        ? 'Perdió la sesión: vuelve a conectarla'
                        : 'Flow la frenó un rato'
                    : 'Lista'}
                {c.deLaVoz ? ' · la de la voz' : ''} · {c.creditos === null ? 'créditos sin leer' : `${c.creditos} créditos, ${hace(c.leido)}`}
              </span>
            </div>
            <div className="op-fila-lado">
              <button className="btn small ghost" onClick={() => void window.recorte.flowAbrir(c.correo)} title="Ábrelo una vez para aceptar el aviso de Flow">
                Abrir Flow
              </button>
              {!c.deLaVoz && (
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    try {
                      setE(await window.recorte.flowQuitarCuenta(c.correo))
                    } catch (x) {
                      onAviso(x instanceof Error ? x.message : String(x))
                    }
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
        ))}

        {!e.cuentas.length && (
          <div className="op-fila op-subfila">
            <div className="op-fila-texto">
              <span>Conecta tu cuenta de Google en Voz (arriba) o agrega una aquí: Flow genera con ella.</span>
            </div>
          </div>
        )}

        <div className="op-fila">
          <div className="op-fila-texto">
            <strong>Ayudar a mejorar Flow</strong>
            <span>
              Encendido, Google usa lo que generes para mejorar sus productos y su IA, y sus revisores pueden verlo. Se aplica en tu
              siguiente pedido. {e.aportar === undefined ? 'Mientras no lo toques, Recorte deja lo que tenga tu cuenta.' : ''}
            </span>
          </div>
          <div className="op-fila-lado">
            <Interruptor activo={e.aportar === true} onCambiar={async (v) => setE(await window.recorte.flowAjustes({ aportar: v }))} />
          </div>
        </div>
        <div className="op-fila">
          <div className="op-fila-texto">
            <strong>Tengo los derechos de las imágenes que mando</strong>
            <span>Sin esto, Flow solo recibe texto: no puede repetir tu personaje ni seguir el estilo de tus fotos.</span>
          </div>
          <div className="op-fila-lado">
            <Interruptor activo={e.derechos} onCambiar={async (v) => setE(await window.recorte.flowAjustes({ derechos: v }))} />
          </div>
        </div>
      </div>
      {e.error && <p className="ag-error">{e.error}</p>}
      <p className="op-nota">
        El agente genera imágenes y videos con tus cuentas de Google: la de la voz y las que agregues aquí, hasta 50. Las imágenes son
        gratis; los videos gastan créditos de Flow, y si una cuenta se queda sin ellos Recorte sigue con otra. Agrega solo cuentas tuyas:
        Google puede limitar o bloquear las que usa de más.
      </p>
    </section>
  )
}
