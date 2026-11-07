import { useEffect, useState } from 'react'
import type { EstadoSistema, Herramienta, Preferencias } from '../../../shared/api'
import type { AjustesIA } from '../../../shared/types'
import type { Agentes } from '../hooks/agentes'
import { Icon } from '../Icons'
import { ListaAgentes } from './ListaAgentes'
import { LogoAgente, LogoHerramienta } from './Logos'
import { SeccionFlow } from './SeccionFlow'
import { SeccionCriterio } from './SeccionCriterio'
import { FilaVersion } from './AvisoActualizacion'
import { CarpetaVideos } from './CarpetaVideos'

/**
 * Ajustes: todo lo que conecta Recorte con el mundo, en una columna. Los agentes (con
 * su forma de pago), la voz, los avisos, lo que da el equipo, el disco y las herramientas
 * de video con su versión. Al final, una API propia para quien la necesite.
 */

type EstadoVoz = Awaited<ReturnType<typeof window.recorte.vozEstado>>

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`
}

function Seccion({ titulo, extra, children, nota }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>{titulo}</h3>
        {extra}
      </div>
      <div className="op-tarjeta">{children}</div>
      {nota && <p className="op-nota">{nota}</p>}
    </section>
  )
}

function Interruptor({ activo, onCambiar, etiqueta }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <label className="op-interruptor">
      <span>{etiqueta}</span>
      <button role="switch" aria-checked={activo} className={activo ? 'is-on' : ''} onClick={() => onCambiar(!activo)}>
        <i />
      </button>
    </label>
  )
}

function FilaHerramienta({ h, onInstalar, instalando }: { h: Herramienta; onInstalar: () => void; instalando: boolean }) {
  const logo = h.id === 'ffmpeg' || h.id === 'python' || h.id === 'node' ? h.id : null
  return (
    <div className="op-fila">
      {logo ? (
        <LogoHerramienta id={logo} size={36} />
      ) : h.id === 'paquetes-python' ? (
        <LogoHerramienta id="python" size={36} />
      ) : (
        <span className="op-icono"><Icon name={h.id === 'hyperframes' ? 'film' : 'search'} size={17} /></span>
      )}
      <div className="op-fila-texto">
        <strong>{h.nombre}</strong>
        <span>{h.descripcion}</span>
      </div>
      <div className="op-fila-lado">
        <span className="ag-estado">
          <span className={`agente-punto ${h.estado === 'ok' ? 'ok' : h.estado === 'falta' ? 'aviso' : ''}`} />
          {h.estado === 'ok' ? h.version : h.estado === 'opcional' ? 'Opcional' : (h.detalle ?? 'No está')}
        </span>
        {h.estado === 'falta' && h.instalable && (
          <button className="btn small primary" onClick={onInstalar} disabled={instalando}>
            {instalando ? 'Instalando…' : 'Instalar'}
          </button>
        )}
        {h.estado === 'falta' && !h.instalable && h.ayuda && (
          <a className="btn small" href={h.ayuda} target="_blank" rel="noreferrer">
            Descargar
          </a>
        )}
      </div>
    </div>
  )
}

function ApiPropia({ agentes, onAviso }: { agentes: Agentes; onAviso: (t: string) => void }) {
  const [abierta, setAbierta] = useState(false)
  const [ia, setIa] = useState<AjustesIA | null>(null)
  const [clave, setClave] = useState('')
  useEffect(() => {
    if (abierta && !ia) void window.recorte.cargarAjustes().then(setIa)
  }, [abierta, ia])

  async function guardar() {
    if (!ia) return
    try {
      const g = await window.recorte.guardarAjustes(
        { activa: true, proveedor: 'api', comandoCli: ia.comandoCli, baseUrl: ia.baseUrl, modelo: ia.modelo },
        clave || undefined
      )
      setIa(g)
      setClave('')
      await agentes.refrescar()
      onAviso('Tu API propia está lista: ya edita tus videos.')
    } catch {
      onAviso('No pude guardar la API.')
    }
  }

  return (
    <section className="op-seccion">
      <button className="op-desplegar" onClick={() => setAbierta((v) => !v)}>
        <h3>Avanzado · API propia</h3>
        <Icon name="chevron" size={14} />
      </button>
      {abierta && ia && (
        <div className="op-tarjeta op-api">
          <p className="op-nota">Cualquier servidor compatible con OpenAI: Ollama en tu equipo, OpenAI, Kimi o el tuyo.</p>
          <div className="chips">
            {[
              ['Ollama (local)', 'http://localhost:11434/v1', 'qwen3:8b'],
              ['OpenAI', 'https://api.openai.com/v1', 'gpt-4o-mini'],
              ['Plan de Kimi', 'https://api.kimi.com/coding/v1', 'kimi-for-coding']
            ].map(([nombre, url, modelo]) => (
              <button key={url} className={`chip ${ia.baseUrl === url ? 'is-active' : ''}`} onClick={() => setIa({ ...ia, baseUrl: url, modelo })}>
                {nombre}
              </button>
            ))}
          </div>
          <label className="field">
            <span>Servidor</span>
            <input value={ia.baseUrl} onChange={(e) => setIa({ ...ia, baseUrl: e.target.value })} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Modelo</span>
              <input value={ia.modelo} onChange={(e) => setIa({ ...ia, modelo: e.target.value })} />
            </label>
            <label className="field">
              <span>Llave</span>
              <input
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                placeholder={ia.tieneClave ? 'Guardada · escribe para cambiarla' : 'No hace falta para Ollama'}
              />
            </label>
          </div>
          <button className="btn primary small" onClick={() => void guardar()}>
            Guardar y usar
          </button>
        </div>
      )}
    </section>
  )
}

export function Opciones({ agentes, onAviso, onVolver }: { agentes: Agentes; onAviso: (t: string) => void; onVolver?: () => void }) {
  const [sistema, setSistema] = useState<EstadoSistema | null>(null)
  const [midiendo, setMidiendo] = useState(false)
  const [instalando, setInstalando] = useState<string | null>(null)
  const [voz, setVoz] = useState<EstadoVoz | null>(null)
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [clave, setClave] = useState('')
  const [prefs, setPrefs] = useState<Preferencias | null>(null)

  async function medir() {
    setMidiendo(true)
    try {
      setSistema(await window.recorte.sistemaEstado())
    } finally {
      setMidiendo(false)
    }
  }

  useEffect(() => {
    void medir()
    void window.recorte.vozEstado().then(setVoz).catch(() => {})
    void window.recorte.preferenciasCargar().then(setPrefs).catch(() => {})
  }, [])

  async function instalar(id: string) {
    setInstalando(id)
    try {
      const r = await window.recorte.sistemaInstalar(id)
      onAviso(r.ok ? 'Instalado.' : `No pude instalarlo: ${r.error ?? ''}`)
      await medir()
    } finally {
      setInstalando(null)
    }
  }

  async function prefsCambio(cambio: Partial<Preferencias>) {
    setPrefs(await window.recorte.preferenciasGuardar(cambio))
  }

  async function conectarGoogle() {
    await window.recorte.vozGoogleConectar()
    setVoz(await window.recorte.vozEstado())
    const desde = Date.now()
    while (Date.now() - desde < 5 * 60_000) {
      await new Promise((r) => setTimeout(r, 2000))
      const e = await window.recorte.vozEstado().catch(() => null)
      if (!e) continue
      setVoz(e)
      if (e.google?.correo || !e.google?.conectando) break
    }
  }

  const uso = sistema ? sistema.uso.proyectos + sistema.uso.creaciones + sistema.uso.agentes : 0

  return (
    <div className="opciones">
      <div className="op-columna">
        {onVolver && (
          <button className="btn small ghost boton-volver op-volver" onClick={onVolver}>
            <Icon name="chevron" size={14} /> Inicio
          </button>
        )}
        <h2 className="op-encabezado">Ajustes</h2>

        <Seccion titulo="Tus videos">
          <CarpetaVideos modo="ajustes" />
        </Seccion>

        <section className="op-seccion">
          <div className="op-titulo">
            <h3>Agentes</h3>
          </div>
          <div className="op-tarjeta">
            <ListaAgentes agentes={agentes} />
          </div>
          <p className="op-nota">
            Cada agente se descarga la primera vez que lo eliges. Claude y ChatGPT necesitan un plan de pago o una llave de API;
            OpenCode, solo tu cuenta, que es gratis. Los demás, la cuenta o la llave de cada uno.
          </p>
        </section>

        <Seccion
          titulo="Voz"
          nota="Al hacer un video eliges en el paso Voz si la grabas tú o la genera Gemini. La sesión de Google vive en un perfil aparte: ningún agente la usa."
        >
          <div className="op-fila">
            <LogoAgente id="gemini" size={36} />
            <div className="op-fila-texto">
              <strong>Google AI Studio</strong>
              <span>Gemini 3.8 Flash TTS · 30 voces · con tu cuenta de Google o tu llave gratis</span>
            </div>
            <div className="op-fila-lado">
              {voz?.google?.correo ? (
                <>
                  <span className="ag-estado"><span className="agente-punto ok" /> {voz.google.correo}</span>
                  <button
                    className="btn small ghost"
                    onClick={async () => {
                      await window.recorte.vozGoogleDesconectar()
                      setVoz(await window.recorte.vozEstado())
                    }}
                  >
                    Salir
                  </button>
                </>
              ) : voz?.google?.conectando ? (
                <span className="ag-estado"><span className="agente-punto medio" /> Entra en la ventana de Edge…</span>
              ) : (
                <button className="btn small primary" onClick={() => void conectarGoogle()} disabled={!voz?.google?.navegador}>
                  Conectar cuenta
                </button>
              )}
            </div>
          </div>
          <div className="op-fila op-subfila">
            <span className="op-icono"><Icon name="settings" size={15} /></span>
            <div className="op-fila-texto">
              <strong>Llave de AI Studio</strong>
              <span>
                {voz?.delAgente
                  ? 'Usa la llave del agente Gemini · AI Studio.'
                  : voz?.tieneClave
                    ? 'Guardada y cifrada en tu equipo.'
                    : 'Sin llave. Con la cuenta de arriba no hace falta.'}
              </span>
              {pidiendoClave && (
                <div className="ag-llave-fila">
                  <input type="password" value={clave} placeholder="AIza…" autoFocus onChange={(e) => setClave(e.target.value)} />
                  <button
                    className="btn small primary"
                    disabled={!clave.trim()}
                    onClick={async () => {
                      await window.recorte.vozGuardar({ clave: clave.trim() })
                      setClave('')
                      setPidiendoClave(false)
                      setVoz(await window.recorte.vozEstado())
                      onAviso('Llave de AI Studio guardada.')
                    }}
                  >
                    Guardar
                  </button>
                </div>
              )}
            </div>
            <div className="op-fila-lado">
              {!voz?.delAgente && (
                <button className="btn small" onClick={() => setPidiendoClave((v) => !v)}>
                  {voz?.tieneClave ? 'Cambiar' : 'Añadir llave'}
                </button>
              )}
              {voz?.tieneClave && !voz.delAgente && (
                <button
                  className="btn small ghost"
                  onClick={async () => {
                    await window.recorte.vozGuardar({ clave: '' })
                    setVoz(await window.recorte.vozEstado())
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
          </div>
          {!voz?.google?.navegador && voz && (
            <p className="op-nota op-dentro">Para entrar con tu cuenta de Google hace falta Microsoft Edge; con la llave no.</p>
          )}
        </Seccion>

        <SeccionFlow onAviso={onAviso} />

        <SeccionCriterio onAviso={onAviso} />

        <Seccion titulo="Avisos">
          <div className="op-fila">
            <span className="op-icono"><Icon name="clock" size={16} /></span>
            <div className="op-fila-texto">
              <strong>Cuando termina un trabajo largo</strong>
              <span>Te avisa si estás en otra cosa: transcribir, crear un video con IA o exportar.</span>
            </div>
            <div className="op-fila-lado">
              {prefs && (
                <>
                  <Interruptor etiqueta="Notificación" activo={prefs.avisoNotificacion} onCambiar={(v) => void prefsCambio({ avisoNotificacion: v })} />
                  <Interruptor etiqueta="Sonido" activo={prefs.avisoSonido} onCambiar={(v) => void prefsCambio({ avisoSonido: v })} />
                </>
              )}
            </div>
          </div>
        </Seccion>

        <Seccion
          titulo="Tu equipo"
          extra={
            <button className="op-enlace" onClick={() => void medir()} disabled={midiendo}>
              {midiendo ? 'Midiendo…' : 'Medir otra vez'}
            </button>
          }
          nota="Todo se hace en tu computadora: la transcripción, el seguimiento de caras y el render."
        >
          <div className="op-fila">
            <span className="op-icono"><Icon name="sliders" size={16} /></span>
            <div className="op-fila-texto">
              <strong>{sistema?.procesador ?? 'Midiendo…'}</strong>
              <span>
                {sistema ? `${sistema.hilos} hilos · ${gb(sistema.memoria)} de memoria${sistema.gpu ? ` · ${sistema.gpu}` : ''}` : ' '}
              </span>
            </div>
          </div>
          <div className="op-fila">
            <span className="op-icono"><Icon name="search" size={16} /></span>
            <div className="op-fila-texto">
              <strong>Transcripción con Whisper, en el procesador</strong>
              <span>Tiempos por palabra para subtítulos, la pista de voz y sincronizar la narración.</span>
            </div>
          </div>
          <div className="op-fila">
            <span className="op-icono"><Icon name="play" size={16} /></span>
            <div className="op-fila-texto">
              <strong>El render</strong>
              <span>FFmpeg exporta la timeline en H.264; HyperFrames renderiza lo que crea la IA.</span>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Versión">
          <FilaVersion />
        </Seccion>

        <Seccion titulo="Espacio en disco">
          <div className="op-fila">
            <span className="op-icono"><Icon name="folder" size={16} /></span>
            <div className="op-fila-texto">
              <strong>{sistema?.disco ? `${gb(sistema.disco.libre)} libres de ${gb(sistema.disco.total)}` : 'Midiendo…'}</strong>
              <span>
                {sistema
                  ? `Recorte ocupa ${gb(uso)}: proyectos ${gb(sistema.uso.proyectos)}, creaciones ${gb(sistema.uso.creaciones)}, agentes ${gb(sistema.uso.agentes)}. Tus videos originales no se copian.`
                  : ' '}
              </span>
            </div>
            <div className="op-fila-lado">
              <button className="btn small" onClick={() => void window.recorte.sistemaAbrirDatos()}>
                Abrir carpeta
              </button>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Herramientas de video">
          {sistema ? (
            sistema.herramientas.map((h) => (
              <FilaHerramienta key={h.id} h={h} instalando={instalando === h.id} onInstalar={() => void instalar(h.id)} />
            ))
          ) : (
            <div className="op-fila"><span className="tl-dim">Revisando…</span></div>
          )}
        </Seccion>

        <ApiPropia agentes={agentes} onAviso={onAviso} />
      </div>
    </div>
  )
}
