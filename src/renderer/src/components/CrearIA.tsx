import { useEffect, useState } from 'react'
import type { EstiloPropio, PeticionCreacion } from '../../../shared/creacion'
import { ESTILOS, GRUPOS } from '../../../shared/estilos'
import type { Agentes } from '../hooks/agentes'
import { Icon, type IconName } from '../Icons'
import { CajaCrear } from './CajaCrear'
import { LogoAgente, LogoProveedor } from './Logos'

/**
 * «Crear con IA»: primero la petición, como en un chat (la caja con todas sus opciones
 * está en `CajaCrear`). Los tipos de video orientan al agente pero no estorban: si no
 * eliges ninguno, él decide la estructura.
 */
export function CrearIA({
  agentes,
  creando,
  onCrear,
  onVolver,
  onConectar
}: {
  agentes: Agentes
  creando: boolean
  onCrear: (p: PeticionCreacion) => void
  onVolver: () => void
  onConectar: () => void
}) {
  const [estilo, setEstilo] = useState('libre')
  const elegido = ESTILOS.find((e) => e.id === estilo)
  // «Mis estilos»: los guardados desde videos que salieron bien.
  const [propios, setPropios] = useState<EstiloPropio[]>([])
  const [propio, setPropio] = useState<string | null>(null)
  const miEstilo = propios.find((p) => p.id === propio)
  useEffect(() => {
    window.recorte.estilosPropios().then(setPropios).catch(() => setPropios([]))
  }, [])

  return (
    <div className="crear">
      <header className="inicio-cabeza">
        <button className="btn small ghost boton-volver" onClick={onVolver}>
          <Icon name="chevron" size={14} /> Inicio
        </button>
        {agentes.activo || agentes.apiActivo ? (
          <span className="crear-agente">
            {agentes.activo ? (
              <LogoAgente id={agentes.activo.id} size={22} />
            ) : agentes.apiActivo ? (
              <LogoProveedor id={agentes.apiActivo.id} size={22} />
            ) : null}{' '}
            {agentes.activo?.nombre ?? agentes.apiActivo?.nombre}
          </span>
        ) : (
          <button className="btn small primary" onClick={onConectar}>
            Conectar mi agente
          </button>
        )}
      </header>

      <div className="crear-cuerpo">
        <h1>{miEstilo ? `Con tu estilo «${miEstilo.nombre}»` : elegido && elegido.id !== 'libre' ? elegido.nombre : '¿Qué video quieres hacer?'}</h1>
        <p className="crear-sub">
          {miEstilo
            ? 'Cuenta de qué trata el video nuevo: el agente usa las mismas letras, colores, ritmo, cámara y música de aquel.'
            : elegido && elegido.id !== 'libre'
              ? elegido.descripcion
              : 'Cuéntaselo como a un editor. Elige quién lo hace y con qué voz; lo ves avanzar paso a paso en el chat.'}
        </p>

        <CajaCrear
          agentes={agentes}
          creando={creando}
          estilo={miEstilo ? miEstilo.estilo : estilo}
          base={miEstilo ? { propio: miEstilo.id } : undefined}
          onCrear={onCrear}
          onConectar={onConectar}
        />

        {propios.length > 0 && (
          <div className="crear-estilos">
            <div className="crear-estilos-cabeza">
              <span>Mis estilos</span>
            </div>
            <div className="crear-grupo crear-propios">
              {propios.map((p) => (
                <span key={p.id} className="crear-propio">
                  <button
                    className={`crear-estilo ${propio === p.id ? 'is-active' : ''}`}
                    onClick={() => setPropio(propio === p.id ? null : p.id)}
                    title={`De: ${p.descripcion}`}
                  >
                    <Icon name="layers" size={14} />
                    <span>
                      <b>{p.nombre}</b>
                      <small>{p.descripcion}</small>
                    </span>
                  </button>
                  <button
                    className="crear-propio-borrar"
                    aria-label={`Borrar el estilo ${p.nombre}`}
                    title="Borrar este estilo (el video del que salió no se toca)"
                    onClick={() => {
                      if (!window.confirm(`¿Borrar el estilo «${p.nombre}»? El video del que salió no se toca.`)) return
                      if (propio === p.id) setPropio(null)
                      window.recorte.borrarEstiloPropio(p.id).then(setPropios).catch(() => undefined)
                    }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="crear-estilos">
          <div className="crear-estilos-cabeza">
            <span>Tipo de video</span>
            <button className={`chip ${estilo === 'libre' ? 'is-active' : ''}`} onClick={() => setEstilo('libre')}>
              <Icon name="sparkles" size={12} /> Que decida el agente
            </button>
          </div>
          <div className="crear-grupos">
            {GRUPOS.map((g) => (
              <div key={g.id} className="crear-grupo">
                <span className="crear-grupo-nombre">{g.nombre}</span>
                {ESTILOS.filter((e) => e.grupo === g.id).map((e) => (
                  <button
                    key={e.id}
                    className={`crear-estilo ${estilo === e.id ? 'is-active' : ''}`}
                    onClick={() => setEstilo(estilo === e.id ? 'libre' : e.id)}
                    title={e.descripcion}
                  >
                    <Icon name={e.icono as IconName} size={14} />
                    <span>
                      <b>{e.nombre}</b>
                      <small>{e.descripcion}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
