import { useEffect, useState } from 'react'
import type { EstadoMcp } from '../../../shared/api'
import { Icon } from '../Icons'
import { LogoAgente } from './Logos'

/**
 * Ajustes › Recorte desde tu agente: el servidor MCP para que Claude Code (u otro agente) vea y
 * edite tus proyectos. Un botón lo registra en Claude Code; para los demás, su configuración.
 */
export function SeccionMcp({ onAviso }: { onAviso: (texto: string) => void }) {
  const [estado, setEstado] = useState<EstadoMcp | null>(null)
  const [conectando, setConectando] = useState(false)
  const [conectado, setConectado] = useState(false)
  const [verConfig, setVerConfig] = useState(false)

  useEffect(() => {
    void window.recorte
      .mcpEstado()
      .then((e) => {
        setEstado(e)
        setConectado(e.claudeConectado)
      })
      .catch(() => setEstado(null))
  }, [])

  async function conectarClaude() {
    setConectando(true)
    try {
      const r = await window.recorte.mcpConectarClaude()
      if (r.ok) {
        setConectado(true)
        onAviso('Listo: Claude Code ya puede manejar Recorte. Ábrelo y pídele, por ejemplo, «abre mi proyecto en Recorte y pon el logo arriba a la derecha».')
      } else onAviso(r.error ?? 'No pude conectarlo.')
    } finally {
      setConectando(false)
    }
  }

  async function copiar(texto: string, que: string) {
    try {
      await navigator.clipboard.writeText(texto)
      onAviso(`${que} copiado.`)
    } catch {
      onAviso('No pude copiarlo.')
    }
  }

  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>Recorte desde tu agente</h3>
      </div>
      <div className="op-tarjeta">
        <div className="op-fila">
          <LogoAgente id="claude" size={36} />
          <div className="op-fila-texto">
            <strong>Claude Code</strong>
            <span>Que Claude vea y edite tus proyectos de Recorte: rótulos, logos encima, sonidos, cortes, exportar.</span>
          </div>
          <div className="op-fila-lado">
            {conectado ? (
              <span className="ag-estado"><span className="agente-punto ok" /> Conectado</span>
            ) : (
              <button className="btn small primary" onClick={() => void conectarClaude()} disabled={conectando || !estado?.activo || !estado.claudeInstalado}>
                {conectando ? 'Conectando…' : estado && !estado.claudeInstalado ? 'Instala Claude Code' : 'Conectar'}
              </button>
            )}
          </div>
        </div>
        <div className="op-fila op-subfila">
          <span className="op-icono"><Icon name="settings" size={15} /></span>
          <div className="op-fila-texto">
            <strong>
              <span className={`agente-punto ${estado?.activo ? 'ok' : 'medio'}`} /> {estado?.activo ? 'Activo mientras Recorte está abierto' : (estado?.error ?? 'Arrancando…')}
            </strong>
            <span>
              Solo en tu equipo ({estado?.url ?? '…'}), con una contraseña que se generó sola. Otro agente (Codex, Claude en el
              escritorio, Cursor…) se conecta con esta configuración.
            </span>
            {verConfig && estado && <pre className="op-codigo">{estado.configJson}</pre>}
          </div>
          <div className="op-fila-lado">
            <button className="btn small ghost" onClick={() => setVerConfig((v) => !v)} disabled={!estado}>
              {verConfig ? 'Ocultar' : 'Ver'}
            </button>
            <button className="btn small ghost" onClick={() => estado && void copiar(estado.configJson, 'La configuración')} disabled={!estado}>
              <Icon name="copy" size={13} /> Copiar
            </button>
            <button
              className="btn small ghost"
              title="Los agentes conectados tendrán que volver a conectarse"
              onClick={async () => {
                setEstado(await window.recorte.mcpNuevaContrasena())
                setConectado(false)
                onAviso('Contraseña nueva. Vuelve a conectar tus agentes.')
              }}
            >
              Nueva contraseña
            </button>
          </div>
        </div>
      </div>
      <p className="op-nota">
        Lo que haga el agente aparece en tu editor y se deshace con Ctrl+Z. Por ahora no genera voz ni clips con créditos.
      </p>
    </section>
  )
}
