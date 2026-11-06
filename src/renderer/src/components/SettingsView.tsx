import { useEffect, useState } from 'react'
import type { ConexionResultado, EstadoAgente } from '../../../shared/api'
import type { AjustesIA } from '../../../shared/types'
import { Icon } from '../Icons'

export function SettingsView({
  onSave,
  onAviso
}: {
  onSave: () => void
  onAviso?: (texto: string) => void
}) {
  const [ia, setIa] = useState<AjustesIA | null>(null)
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [agentes, setAgentes] = useState<EstadoAgente[]>([])
  const [conectando, setConectando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    window.recorte
      .cargarAjustes()
      .then((ajustes) => {
        if (vivo) setIa(ajustes)
      })
      .catch(() => {})
    window.recorte
      .agentesEstado()
      .then((lista) => {
        if (vivo) setAgentes(lista)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  async function conectar(agente: EstadoAgente) {
    if (conectando) return
    setConectando(agente.id)
    try {
      const resultado: ConexionResultado = await window.recorte.agentesConectar(agente.id)
      if (resultado.ok) {
        // Conectado: deja el modo plan listo con este agente.
        setIa((prev) =>
          prev ? { ...prev, activa: true, proveedor: 'cli', comandoCli: agente.comando } : prev
        )
        setAgentes(await window.recorte.agentesEstado())
        onAviso?.(`${agente.nombre} conectado. Ya puedes editar con tu plan.`)
      } else {
        onAviso?.(resultado.aviso ?? resultado.error ?? `No pude conectar ${agente.nombre}.`)
      }
    } catch {
      onAviso?.(`No pude conectar ${agente.nombre}.`)
    } finally {
      setConectando(null)
    }
  }

  async function guardarIA() {
    if (!ia || guardando) return
    setGuardando(true)
    try {
      const guardados = await window.recorte.guardarAjustes(
        { activa: ia.activa, proveedor: ia.proveedor, comandoCli: ia.comandoCli, baseUrl: ia.baseUrl, modelo: ia.modelo },
        clave !== '' ? clave : undefined
      )
      setIa(guardados)
      setClave('')
      onAviso?.('Ajustes de IA guardados.')
    } catch {
      onAviso?.('No pude guardar los ajustes de IA.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <span className="eyebrow"><Icon name="settings" size={14} /> Preferencias</span>
          <h2>Render y exportación</h2>
          <p>Valores por defecto para todos los clips del proyecto.</p>
        </div>
        <button className="btn primary" onClick={onSave}>
          <Icon name="check" size={16} /> Guardar ajustes
        </button>
      </header>

      <div className="settings-grid">
        <section className="panel form-panel">
          <h3>Análisis con IA</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Mejora la elección de momentos con un modelo externo. Se envía solo la transcripción
            con tiempos, nunca el video. Sin clave, la selección local sigue funcionando.
          </p>

          <div className="agentes">
            {agentes.map((agente) => (
              <div key={agente.id} className="agente-row">
                <span className="agente-nombre">{agente.nombre}</span>
                <span
                  className={`pill ${agente.conectado ? 'ok' : ''}`}
                  title={agente.instalado ? '' : `Instálalo con: ${agente.instalar}`}
                >
                  {agente.conectado
                    ? 'Conectado'
                    : agente.instalado
                      ? 'Instalado'
                      : 'No instalado'}
                </span>
                {agente.conectado ? (
                  <button
                    className="btn small"
                    onClick={() =>
                      ia && setIa({ ...ia, activa: true, proveedor: 'cli', comandoCli: agente.comando })
                    }
                  >
                    Usar este plan
                  </button>
                ) : (
                  <button
                    className="btn small ghost"
                    onClick={() => conectar(agente)}
                    disabled={conectando !== null}
                  >
                    {conectando === agente.id ? 'Autoriza en el navegador…' : 'Conectar'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {ia && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={ia.activa}
                  onChange={(e) => setIa({ ...ia, activa: e.target.checked })}
                />
                Analizar momentos con IA al generar el lote
              </label>
              <div className="chips" style={{ marginBottom: 10 }}>
                <button
                  className={`chip ${ia.proveedor !== 'cli' ? 'is-active' : ''}`}
                  onClick={() => setIa({ ...ia, proveedor: 'api' })}
                  title="Kimi, OpenAI, Ollama u otro servidor compatible con OpenAI"
                >
                  Clave API
                </button>
                <button
                  className={`chip ${ia.proveedor === 'cli' ? 'is-active' : ''}`}
                  onClick={() => setIa({ ...ia, proveedor: 'cli' })}
                  title="Usa el plan de cualquier agente instalado en este equipo (Claude Code, Kimi Code, Codex…), sin clave API"
                >
                  Agente CLI (mi plan)
                </button>
              </div>
              {ia.proveedor === 'cli' ? (
                <>
                  <label className="field">
                    <span>Comando del agente (modo no interactivo)</span>
                    <input
                      value={ia.comandoCli}
                      onChange={(e) => setIa({ ...ia, comandoCli: e.target.value })}
                      placeholder="claude -p"
                    />
                  </label>
                  <div className="chips" style={{ marginBottom: 10 }}>
                    <button className="chip" onClick={() => setIa({ ...ia, comandoCli: 'claude -p' })}>
                      Claude Code
                    </button>
                    <button className="chip" onClick={() => setIa({ ...ia, comandoCli: 'kimi -p "@{prompt}"' })}>
                      Kimi Code
                    </button>
                    <button className="chip" onClick={() => setIa({ ...ia, comandoCli: 'codex exec' })}>
                      Codex
                    </button>
                    <button className="chip" onClick={() => setIa({ ...ia, comandoCli: 'gemini -p' })}>
                      Gemini
                    </button>
                  </div>
                  <p className="hint" style={{ marginTop: 0 }}>
                    Recorte envía la transcripción por stdin al comando y lee la respuesta de
                    stdout; el consumo va contra tu suscripción del agente, sin clave API.
                    Si tu agente toma el prompt como argumento (p. ej. Kimi), usa la marca{' '}
                    <code>{'{prompt}'}</code>: Recorte la sustituye por un archivo temporal —
                    <code>kimi -p "@{'{'}prompt{'}'}"</code>. Requisitos: el agente instalado y
                    con sesión iniciada. Si el agente falla, Recorte cae a la selección local y
                    te avisa.
                  </p>
                </>
              ) : (
                <>
                  <div className="chips" style={{ marginBottom: 10 }}>
                    <button
                      className={`chip ${ia.baseUrl.includes('kimi.com/coding') || ia.baseUrl.includes('kimi.ai/coding') ? 'is-active' : ''}`}
                      onClick={() => setIa({ ...ia, proveedor: 'api', baseUrl: 'https://api.kimi.com/coding/v1', modelo: 'kimi-for-coding' })}
                      title="Tu membresía de Kimi (Plus o superior): crea la clave en kimi.com/code. Sin facturación por uso."
                    >
                      Mi plan de Kimi
                    </button>
                    <button
                      className={`chip ${ia.baseUrl.includes('moonshot') ? 'is-active' : ''}`}
                      onClick={() => setIa({ ...ia, proveedor: 'api', baseUrl: 'https://api.moonshot.ai/v1', modelo: 'kimi-k2.6' })}
                      title="API de pago por uso de Moonshot (platform.moonshot.ai)"
                    >
                      Kimi (API)
                    </button>
                    <button
                      className={`chip ${ia.baseUrl.includes('api.openai.com') ? 'is-active' : ''}`}
                      onClick={() => setIa({ ...ia, proveedor: 'api', baseUrl: 'https://api.openai.com/v1', modelo: 'gpt-4o-mini' })}
                    >
                      OpenAI
                    </button>
                    <button
                      className={`chip ${ia.baseUrl.includes('localhost') ? 'is-active' : ''}`}
                      onClick={() => setIa({ ...ia, proveedor: 'api', baseUrl: 'http://localhost:11434/v1', modelo: 'qwen3:8b' })}
                      title="Modelo local con Ollama: no sale nada del equipo ni hace falta clave"
                    >
                      Ollama (local)
                    </button>
                  </div>
                  {(ia.baseUrl.includes('kimi.com/coding') || ia.baseUrl.includes('kimi.ai/coding')) && (
                    <p className="hint" style={{ marginTop: 0 }}>
                      Plan de Kimi: necesitas membresía Plus o superior y una clave creada en
                      kimi.com/code (consola de Kimi Code). El consumo descuenta de tu membresía,
                      no de saldo por uso. Si el servicio limita herramientas de terceros y
                      responde 403, Recorte cae a la selección local y te avisa.
                    </p>
                  )}
                  <label className="field">
                    <span>Servidor (compatible con OpenAI)</span>
                    <input
                      value={ia.baseUrl}
                      onChange={(e) => setIa({ ...ia, baseUrl: e.target.value })}
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>
                  <div className="field-row">
                    <label className="field">
                      <span>Modelo</span>
                      <input
                        value={ia.modelo}
                        onChange={(e) => setIa({ ...ia, modelo: e.target.value })}
                        placeholder="gpt-4o-mini"
                      />
                    </label>
                    <label className="field">
                      <span>Clave API</span>
                      <input
                        type="password"
                        value={clave}
                        onChange={(e) => setClave(e.target.value)}
                        placeholder={ia.tieneClave ? 'Guardada — escribe para cambiarla' : 'sk-…'}
                      />
                    </label>
                  </div>
                </>
              )}
              <div className="field-row" style={{ alignItems: 'center' }}>
                <button className="btn" onClick={guardarIA} disabled={guardando}>
                  <Icon name="check" size={15} /> {guardando ? 'Guardando…' : 'Guardar IA'}
                </button>
                <p className="hint" style={{ margin: 0 }}>
                  {ia.proveedor === 'cli'
                    ? 'Sin clave: se usa la sesión de tu agente CLI.'
                    : ia.tieneClave
                      ? ia.claveCifrada
                        ? 'Clave guardada y cifrada con el llavero del sistema.'
                        : 'Clave guardada (sin cifrado del sistema disponible).'
                      : 'Sin clave: se usará la selección local.'}
                </p>
              </div>
            </>
          )}
        </section>

        <section className="panel form-panel">
          <h3>Video</h3>
          <div className="field-row">
            <label className="field">
              <span>Resolución</span>
              <select defaultValue="1080×1920">
                <option>1080×1920</option>
                <option>720×1280</option>
                <option>2160×3840</option>
              </select>
            </label>
            <label className="field">
              <span>Fotogramas</span>
              <select defaultValue="30">
                <option>30</option>
                <option>25</option>
                <option>60</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Códec</span>
              <select defaultValue="H.264">
                <option>H.264</option>
                <option>H.265</option>
                <option>ProRes</option>
              </select>
            </label>
            <label className="field">
              <span>Calidad</span>
              <select defaultValue="Alta">
                <option>Alta</option>
                <option>Media</option>
                <option>Máxima</option>
              </select>
            </label>
          </div>
        </section>

        <section className="panel form-panel">
          <h3>Archivos</h3>
          <label className="field">
            <span>Nombre</span>
            <input defaultValue="{curso}-{clip}-{fecha}" />
          </label>
          <div className="field">
            <span>Carpeta de salida</span>
            <button className="upload-box" type="button">
              <Icon name="folder" size={18} /> Elegir carpeta
            </button>
          </div>
          <label className="check-row"><input type="checkbox" defaultChecked /> Exportar también SRT y portada</label>
          <label className="check-row"><input type="checkbox" defaultChecked /> Abrir la carpeta al terminar</label>
        </section>

        <section className="panel form-panel">
          <h3>Transcripción</h3>
          <div className="field-row">
            <label className="field">
              <span>Modelo</span>
              <select defaultValue="Medio">
                <option>Rápido</option>
                <option>Medio</option>
                <option>Preciso</option>
              </select>
            </label>
            <label className="field">
              <span>Idioma</span>
              <select defaultValue="Automático">
                <option>Automático</option>
                <option>Español</option>
                <option>Inglés</option>
                <option>Portugués</option>
              </select>
            </label>
          </div>
          <p className="hint">Todo se procesa en tu equipo. Nada se sube a la nube.</p>
        </section>
      </div>
    </div>
  )
}
