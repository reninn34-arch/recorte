import type { MensajeChat } from '../../../shared/chat'
import type { Project } from '../../../shared/types'
import type { Agentes } from '../hooks/agentes'
import { Icon } from '../Icons'
import { ChatAgente, type PuenteEditor } from './ChatAgente'
import { LogoAgente, LogoProveedor, PLAN_DE } from './Logos'

/**
 * Panel del agente en el editor: qué agente edita (con su logo), el chat donde se le
 * piden cambios y, abajo, las acciones automáticas de siempre. Conectar o cambiar de
 * agente lleva a Inicio, donde están todos con un clic.
 */
export function AgentePanel({
  proyecto,
  agentes,
  puente,
  onCambiarChat,
  onCambiarAgente,
  editando,
  generando,
  renderizando,
  onEditar,
  onGenerar,
  onRenderizarEdicion,
  onAbrirAjustes
}: {
  proyecto: Project
  agentes: Agentes
  puente: React.RefObject<PuenteEditor | null>
  onCambiarChat: (id: string, mensajes: MensajeChat[]) => void
  onCambiarAgente: () => void
  editando: boolean
  generando: boolean
  renderizando: boolean
  onEditar: () => void
  onGenerar: () => void
  onRenderizarEdicion: () => void
  onAbrirAjustes: () => void
}) {
  const activo = agentes.activo
  const api = agentes.apiActivo
  const transcrita = proyecto.transcription === 'lista'

  return (
    <aside className="agente-panel">
      <div className="panel-head">
        {activo || api ? (
          <button className="agente-actual" onClick={onCambiarAgente} title="Cambiar de agente">
            {activo ? (
              <LogoAgente id={activo.id} size={30} />
            ) : api ? (
              <LogoProveedor id={api.id} size={30} />
            ) : null}
            <span className="agente-actual-texto">
              <strong>{activo?.nombre ?? api?.nombre}</strong>
              <span>{activo ? PLAN_DE[activo.id] : api?.plan}</span>
            </span>
            <span className="agente-actual-cambiar">Cambiar</span>
          </button>
        ) : (
          <div className="agente-falta">
            <div className="agente-falta-logos">
              {agentes.lista.map((a) => (
                <LogoAgente key={a.id} id={a.id} size={24} />
              ))}
            </div>
            <button className="btn primary small" onClick={onCambiarAgente}>
              Conectar mi agente
            </button>
          </div>
        )}
        <button className="btn small ghost" onClick={onAbrirAjustes} title="Ajustes avanzados (API propia)">
          <Icon name="settings" size={15} />
        </button>
      </div>

      <ChatAgente
        key={proyecto.id}
        proyecto={proyecto}
        puente={puente}
        listo={agentes.listo}
        nombreAgente={activo?.nombre ?? api?.nombre}
        onCambiarChat={onCambiarChat}
        onConectar={onCambiarAgente}
      />

      <div className="agente-rapidas">
        <span className="tl-dim">Automático</span>
        <button className="chip" onClick={onEditar} disabled={!transcrita || editando} title="El agente propone una edición completa">
          <Icon name="sparkles" size={12} /> {editando ? 'Editando…' : 'Edición completa'}
        </button>
        <button className="chip" onClick={onGenerar} disabled={!transcrita || generando} title="Busca los mejores momentos para reels">
          <Icon name="scissors" size={12} /> {generando ? 'Buscando…' : 'Proponer clips'}
        </button>
        {proyecto.receta && (
          <button className="chip" onClick={onRenderizarEdicion} disabled={renderizando}>
            <Icon name="play" size={12} /> {renderizando ? 'Renderizando…' : 'Render receta'}
          </button>
        )}
      </div>
    </aside>
  )
}
