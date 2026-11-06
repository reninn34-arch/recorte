import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { ESTILOS } from '../../../shared/estilos'
import { Icon, type IconName } from '../Icons'

/**
 * Creación desde cero (fase 2, motor puente): eliges el tipo de video, describes
 * lo que quieres y el agente —dirigido como un editor profesional— diseña una
 * composición HyperFrames que se renderiza a MP4 vertical.
 */
export function CrearPanel({
  proyecto,
  creando,
  onCrear,
  onAbrir
}: {
  proyecto: Project
  creando: boolean
  onCrear: (peticion: string, opciones: { incluirMaterial: boolean; estilo: string }) => void
  onAbrir: () => void
}) {
  const [peticion, setPeticion] = useState('')
  const [estilo, setEstilo] = useState('libre')
  const [incluirMaterial, setIncluirMaterial] = useState(true)
  const puedeMaterial = !proyecto.demo && proyecto.source.duration >= 8

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Crear video</h2>
          <p>
            Elige el tipo de video, cuéntale al editor qué quieres y lo diseña como
            una composición animada (HyperFrames) que se renderiza a MP4 vertical.
          </p>
        </div>
      </div>

      <div className="estilos">
        {ESTILOS.map((e) => (
          <button
            key={e.id}
            className={`estilo-card ${estilo === e.id ? 'is-active' : ''}`}
            onClick={() => setEstilo(e.id)}
            disabled={creando}
            title={e.descripcion}
          >
            <Icon name={e.icono as IconName} size={16} />
            <span className="estilo-nombre">{e.nombre}</span>
            <span className="estilo-desc">{e.descripcion}</span>
          </button>
        ))}
      </div>

      <textarea
        className="crear-texto"
        rows={3}
        placeholder="Ej.: un reel sobre 3 errores al grabar clases, intercalando mi material con titulares"
        value={peticion}
        onChange={(e) => setPeticion(e.target.value)}
        disabled={creando}
      />

      <div className="field-row" style={{ alignItems: 'center' }}>
        <button
          className="btn primary"
          onClick={() => onCrear(peticion, { incluirMaterial: incluirMaterial && puedeMaterial, estilo })}
          disabled={creando || !peticion.trim()}
        >
          <Icon name="sparkles" size={15} /> {creando ? 'Creando…' : 'Crear video'}
        </button>
        {proyecto.creacionSalida && (
          <button className="btn ghost" onClick={onAbrir}>
            <Icon name="folder" size={15} /> Abrir MP4
          </button>
        )}
      </div>

      {puedeMaterial && (
        <label className="crear-material">
          <input
            type="checkbox"
            checked={incluirMaterial}
            onChange={(e) => setIncluirMaterial(e.target.checked)}
            disabled={creando}
          />
          <span>Incluir fragmentos de mi video (con su voz) dentro de la composición</span>
        </label>
      )}

      <p className="hint">
        El editor tarda unos minutos: primero piensa la estructura y luego se renderiza.
        Si no hay agente conectado, se usa una plantilla de marca sencilla.
      </p>
    </section>
  )
}
