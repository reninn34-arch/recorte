import { useEffect, useState } from 'react'
import type { EstadoAgente } from '../../../shared/api'
import type { AjustesIA, Project } from '../../../shared/types'
import { describirReceta } from '../../../shared/receta'
import { Icon } from '../Icons'

/**
 * Panel del agente: conexión y cambio de plan a la vista, con un clic, sin abrir
 * Ajustes. Cada agente es una fila: si no está conectado, el clic lo conecta
 * (Kimi abre el navegador para autorizar); si está conectado, el clic lo activa
 * como el plan que edita. Ajustes queda solo para lo avanzado (API, comando a mano).
 */
export function AgentePanel({
  proyecto,
  editando,
  generando,
  renderizando,
  onEditar,
  onGenerar,
  onRenderizarEdicion,
  onAbrirAjustes,
  onAviso
}: {
  proyecto: Project
  editando: boolean
  generando: boolean
  renderizando: boolean
  onEditar: () => void
  onGenerar: () => void
  onRenderizarEdicion: () => void
  onAbrirAjustes: () => void
  onAviso: (texto: string) => void
}) {
  const [agentes, setAgentes] = useState<EstadoAgente[]>([])
  const [ajustes, setAjustes] = useState<AjustesIA | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    Promise.all([window.recorte.agentesEstado(), window.recorte.cargarAjustes()])
      .then(([lista, ajs]) => {
        if (!vivo) return
        setAgentes(lista)
        setAjustes(ajs)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  /** El plan que está editando ahora: modo CLI y este comando. */
  function enUso(agente: EstadoAgente): boolean {
    return (
      ajustes?.activa === true &&
      ajustes.proveedor === 'cli' &&
      ajustes.comandoCli === agente.comando
    )
  }

  async function usar(agente: EstadoAgente) {
    if (!ajustes || ocupado) return
    setOcupado(agente.id)
    try {
      const guardados = await window.recorte.guardarAjustes({
        activa: true,
        proveedor: 'cli',
        comandoCli: agente.comando,
        baseUrl: ajustes.baseUrl,
        modelo: ajustes.modelo
      })
      setAjustes(guardados)
      onAviso(`Ahora editas con ${agente.nombre}.`)
    } catch {
      onAviso('No pude cambiar de plan.')
    } finally {
      setOcupado(null)
    }
  }

  async function conectarYUsar(agente: EstadoAgente) {
    if (ocupado) return
    setOcupado(agente.id)
    try {
      const resultado = await window.recorte.agentesConectar(agente.id)
      if (resultado.ok) {
        setAgentes(await window.recorte.agentesEstado())
        await usar(agente)
      } else {
        onAviso(resultado.aviso ?? resultado.error ?? `No pude conectar ${agente.nombre}.`)
      }
    } catch {
      onAviso(`No pude conectar ${agente.nombre}.`)
    } finally {
      setOcupado(null)
    }
  }

  const activo = agentes.find((a) => enUso(a))
  const transcrita = proyecto.transcription === 'lista'
  const receta = proyecto.receta

  return (
    <aside className="agente-panel">
      <div className="panel-head">
        <div>
          <h2>Agente</h2>
          <p>{activo ? `${activo.nombre} está editando` : 'Elige tu plan con un clic'}</p>
        </div>
        <button className="btn small ghost" onClick={onAbrirAjustes} title="Ajustes avanzados (API, comando a mano)">
          <Icon name="settings" size={15} />
        </button>
      </div>

      <div className="agente-lista">
        {agentes.map((agente) => (
          <button
            key={agente.id}
            className={`agente-item ${enUso(agente) ? 'is-active' : ''}`}
            onClick={() => (agente.conectado ? usar(agente) : conectarYUsar(agente))}
            disabled={ocupado !== null || (!agente.instalado && !agente.conectado)}
            title={
              agente.instalado
                ? agente.conectado
                  ? 'Clic para editar con este plan'
                  : 'Clic para conectar'
                : `No instalado. Instálalo con: ${agente.instalar}`
            }
          >
            <span
              className={`agente-punto ${agente.conectado ? 'ok' : agente.instalado ? 'medio' : ''}`}
            />
            <span className="agente-item-nombre">{agente.nombre}</span>
            <span className="agente-item-estado">
              {ocupado === agente.id
                ? agente.conectado
                  ? 'Activando…'
                  : 'Autoriza en el navegador…'
                : enUso(agente)
                  ? 'En uso'
                  : agente.conectado
                    ? 'Usar'
                    : agente.instalado
                      ? 'Conectar'
                      : 'No instalado'}
            </span>
          </button>
        ))}
      </div>

      <div className="agente-acciones">
        <button className="btn primary" onClick={onEditar} disabled={!transcrita || editando}>
          <Icon name="sparkles" size={15} /> {editando ? 'Editando…' : 'Editar este video'}
        </button>
        <button className="btn" onClick={onGenerar} disabled={!transcrita || generando}>
          <Icon name="scissors" size={15} /> {generando ? 'Buscando…' : 'Proponer clips'}
        </button>
        {receta && (
          <button className="btn" onClick={onRenderizarEdicion} disabled={renderizando}>
            <Icon name="play" size={15} /> {renderizando ? 'Renderizando…' : 'Renderizar edición'}
          </button>
        )}
      </div>

      {!transcrita && (
        <p className="hint">Transcribe el material primero: el agente trabaja sobre la transcripción.</p>
      )}

      {receta && (
        <div className="agente-receta">
          <h3>{receta.titulo}</h3>
          {receta.resumen && <p className="hint">{receta.resumen}</p>}
          <ul className="hint" style={{ paddingLeft: 18, margin: '6px 0' }}>
            {describirReceta(receta).map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
