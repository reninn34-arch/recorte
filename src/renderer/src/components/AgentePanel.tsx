import type { MensajeChat } from '../../../shared/chat'
import type { AjustesCreacion } from '../../../shared/creacion'
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
  onAjustesChat,
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
  onAjustesChat: (id: string, ajustes: AjustesCreacion) => void
  onCambiarAgente: () => void
  editando: boolean
  generando: boolean
  renderizando: boolean
  onEditar: () => void
  onGenerar: () => void
  onRenderizarEdicion: () => void
  onAbrirAjustes: () => void
}) {
  // El que eligió en la caja de este chat (si sigue conectado); si no, el de siempre.
  const elegido = proyecto.chatAjustes?.tareas?.video?.agente
  const activo = (elegido && agentes.lista.find((a) => a.id === elegido && a.conectado && a.instalado)) || agentes.activo
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
              <span title={activo ? PLAN_DE[activo.id] : api?.plan}>{activo ? 'Mira, edita y comprueba' : 'Llave de API · solo texto'}</span>
            </span>
            <span className="agente-actual-cambiar" aria-hidden="true">
              <Icon name="chevron" size={14} />
            </span>
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
        agentes={agentes}
        onAjustesChat={onAjustesChat}
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
