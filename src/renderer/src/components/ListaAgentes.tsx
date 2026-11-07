import { useEffect, useState } from 'react'
import { PROVEEDORES_API, type EstadoAgente, type ProveedorApi } from '../../../shared/api'
import type { Agentes } from '../hooks/agentes'
import { LogoAgente, LogoProveedor } from './Logos'

/**
 * Los agentes, uno por fila: logo, qué es y con qué cuenta trabaja, su estado (con la
 * versión instalada) y el botón para conectarlo. Claude Code elige además si paga con la
 * suscripción o con una llave de API. Abajo, los que funcionan solo con su llave.
 * `compacta` (Inicio) quita las descripciones largas y la forma de pago.
 */

const INFO: Record<EstadoAgente['id'], { marca: string; texto: string; beta?: boolean }> = {
  claude: {
    marca: 'Claude',
    texto: 'Trabaja con tu plan de pago de Claude (Pro o Max) o con una llave de API. El más fiable para guiones y edición.'
  },
  codex: {
    marca: 'ChatGPT',
    texto: 'Trabaja con tu plan de ChatGPT (Plus o Pro). La cuenta se autoriza en el navegador.'
  },
  gemini: {
    marca: 'Google',
    texto: 'Gemini CLI con tu cuenta de Google. Si prefieres no instalar nada, usa la llave gratis de AI Studio de abajo.'
  },
  kimi: { marca: 'Kimi', texto: 'Trabaja con tu membresía de Kimi Code. La cuenta se autoriza en el navegador.' },
  opencode: {
    marca: 'OpenCode',
    texto:
      'Gratis con tu cuenta de OpenCode, que se crea en su página. Sus modelos gratis tienen límites y a veces se saturan, y algunos guardan lo que les mandas: no les mandes datos privados.'
  },
  antigravity: {
    marca: 'Antigravity',
    texto: 'El agente de Google con tu cuenta y sus modelos de Gemini. Recorte lo descarga (unos 230 MB) y lo autoriza en el navegador.',
    beta: true
  }
}

const INFO_API: Record<ProveedorApi['id'], { texto: string; beta?: boolean }> = {
  'gemini-api': { texto: 'Solo tu llave gratis de AI Studio, sin instalar nada. La misma llave genera las voces de tus videos.' },
  deepseek: { texto: 'Con tu llave de DeepSeek. Se cobra por uso, del saldo de tu cuenta.', beta: true },
  grok: { texto: 'Con tu llave de xAI. Se cobra por uso.', beta: true }
}

function Estado({ agente, version }: { agente: EstadoAgente; version: string | null | undefined }) {
  const clase = agente.conectado && agente.instalado ? 'ok' : agente.instalado ? 'medio' : ''
  const texto = !agente.instalado
    ? 'No está instalado'
    : version && version !== 'instalado'
      ? version
      : agente.conectado
        ? 'Conectado'
        : 'Instalado'
  return (
    <span className="ag-estado">
      <span className={`agente-punto ${clase}`} /> {texto}
    </span>
  )
}

function textoBoton(agente: EstadoAgente, agentes: Agentes, enUso: boolean): string {
  const fase = agentes.ocupado?.id === agente.id ? agentes.ocupado.fase : null
  if (fase === 'instalando') return 'Instalando…'
  if (fase === 'autorizando') return 'Autoriza en el navegador…'
  if (fase === 'esperando') return 'Esperando tu sesión…'
  if (fase === 'activando') return 'Activando…'
  if (enUso) return 'En uso'
  if (agente.conectado && agente.instalado) return 'Usar'
  if (agente.pago === 'llave') return agente.instalado ? 'Añadir llave' : 'Instalar'
  return agente.instalado ? `Conectar con ${INFO[agente.id].marca}` : `Instalar y conectar`
}

function CampoLlave({
  placeholder,
  onGuardar,
  onCancelar,
  ayuda
}: {
  placeholder: string
  onGuardar: (llave: string) => void
  onCancelar: () => void
  ayuda?: React.ReactNode
}) {
  const [llave, setLlave] = useState('')
  return (
    <div className="ag-llave">
      <div className="ag-llave-fila">
        <input
          type="password"
          value={llave}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setLlave(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && llave.trim()) onGuardar(llave.trim())
            if (e.key === 'Escape') onCancelar()
          }}
        />
        <button className="btn small primary" disabled={!llave.trim()} onClick={() => onGuardar(llave.trim())}>
          Guardar
        </button>
        <button className="btn small ghost" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      {ayuda && <p className="ag-ayuda">{ayuda}</p>}
    </div>
  )
}

export function ListaAgentes({ agentes, compacta = false }: { agentes: Agentes; compacta?: boolean }) {
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const { versiones, cargarVersiones } = agentes

  useEffect(() => {
    if (!compacta && versiones === null) void cargarVersiones()
  }, [compacta, versiones, cargarVersiones])

  if (!agentes.cargado) return <p className="hint">Buscando tus agentes…</p>

  return (
    <div className={`ag-lista ${compacta ? 'is-compacta' : ''}`}>
      {agentes.lista.map((a) => {
        const info = INFO[a.id]
        const geminiConLlave = a.id === 'gemini' && agentes.apiActivo?.id === 'gemini-api'
        const enUso = agentes.activo?.id === a.id
        const ocupado = agentes.ocupado !== null
        const faltaLlave = a.pago === 'llave' && !a.tieneLlave
        return (
          <div key={a.id} className={`ag-fila ${enUso ? 'is-activo' : ''}`}>
            <LogoAgente id={a.id} size={compacta ? 34 : 38} />
            <div className="ag-cuerpo">
              <div className="ag-cabeza">
                <strong>{a.nombre}</strong>
                {info.beta && <span className="ag-beta">Beta</span>}
                {enUso && <span className="ag-uso">Edita contigo</span>}
                {geminiConLlave && <span className="ag-uso">Con tu llave</span>}
              </div>
              <p className={compacta ? 'ag-texto corto' : 'ag-texto'}>{info.texto}</p>

              {!compacta && a.admiteLlave && (
                <div className="ag-pago">
                  <span>Paga con</span>
                  <div className="ag-pago-opciones">
                    <button
                      className={a.pago !== 'llave' ? 'is-active' : ''}
                      onClick={() => void agentes.cambiarPago(a, { pago: 'suscripcion' })}
                      disabled={ocupado}
                    >
                      Tu suscripción
                    </button>
                    <button
                      className={a.pago === 'llave' ? 'is-active' : ''}
                      onClick={() => {
                        void agentes.cambiarPago(a, { pago: 'llave' })
                        if (!a.tieneLlave) setPidiendo(a.id)
                      }}
                      disabled={ocupado}
                    >
                      Llave de API
                    </button>
                  </div>
                  {a.pago === 'llave' && a.tieneLlave && (
                    <>
                      <span className="ag-ayuda">Llave guardada y cifrada en tu equipo.</span>
                      <button className="ag-enlace" onClick={() => setPidiendo(a.id)}>
                        Cambiar
                      </button>
                      <button className="ag-enlace" onClick={() => void agentes.cambiarPago(a, { llave: '' })}>
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              )}

              {pidiendo === a.id && (
                <CampoLlave
                  placeholder={a.id === 'claude' ? 'sk-ant-…' : 'Tu llave de API'}
                  ayuda={
                    a.id === 'claude' ? (
                      <>
                        Créala en{' '}
                        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                          console.anthropic.com
                        </a>
                        . Se cobra por uso a tu cuenta de Anthropic.
                      </>
                    ) : undefined
                  }
                  onCancelar={() => setPidiendo(null)}
                  onGuardar={(llave) => {
                    setPidiendo(null)
                    void agentes.cambiarPago(a, { pago: 'llave', llave })
                  }}
                />
              )}

              {agentes.errores[a.id] && <p className="ag-error">{agentes.errores[a.id]}</p>}
              {agentes.ocupado?.id === a.id && agentes.ocupado.fase === 'esperando' && (
                <button className="ag-enlace" onClick={agentes.cancelarEspera}>
                  Dejar de esperar
                </button>
              )}
            </div>
            <div className="ag-lado">
              {!compacta && <Estado agente={a} version={versiones?.[a.id]} />}
              <button
                className={`btn small ${enUso ? 'ghost' : a.conectado && a.instalado ? '' : 'primary'}`}
                disabled={enUso || ocupado}
                onClick={() => {
                  if (faltaLlave && a.instalado) setPidiendo(a.id)
                  else void agentes.conectar(a)
                }}
              >
                {textoBoton(a, agentes, enUso)}
              </button>
            </div>
          </div>
        )
      })}

      {!compacta && <p className="ag-separador">Solo con su llave de API, sin instalar nada</p>}
      {PROVEEDORES_API.map((p) => {
        const info = INFO_API[p.id]
        const enUso = agentes.apiActivo?.id === p.id
        return (
          <div key={p.id} className={`ag-fila ${enUso ? 'is-activo' : ''}`}>
            <LogoProveedor id={p.id} size={compacta ? 34 : 38} />
            <div className="ag-cuerpo">
              <div className="ag-cabeza">
                <strong>{p.nombre}</strong>
                {info.beta && <span className="ag-beta">Beta</span>}
                {enUso && <span className="ag-uso">Edita contigo</span>}
              </div>
              <p className={compacta ? 'ag-texto corto' : 'ag-texto'}>{info.texto}</p>
              {pidiendo === p.id && (
                <CampoLlave
                  placeholder="Pega tu llave"
                  ayuda={
                    <>
                      Consíguela en{' '}
                      <a href={p.donde} target="_blank" rel="noreferrer">
                        {p.dondeTexto}
                      </a>
                      .
                    </>
                  }
                  onCancelar={() => setPidiendo(null)}
                  onGuardar={(llave) => {
                    setPidiendo(null)
                    void agentes.usarProveedorApi(p, llave)
                  }}
                />
              )}
            </div>
            <div className="ag-lado">
              {!compacta && (
                <span className="ag-estado">
                  <span className={`agente-punto ${enUso ? 'ok' : ''}`} /> {enUso ? 'Llave lista' : 'Sin llave'}
                </span>
              )}
              <button
                className={`btn small ${enUso ? 'ghost' : 'primary'}`}
                disabled={enUso || agentes.ocupado !== null}
                onClick={() => setPidiendo((v) => (v === p.id ? null : p.id))}
              >
                {enUso ? 'En uso' : 'Añadir llave'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
