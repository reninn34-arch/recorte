import { useEffect, useState } from 'react'
import type { Creacion, EstiloPropio, PeticionCreacion } from '../../../shared/creacion'
import { ESTILOS } from '../../../shared/estilos'
import type { Project } from '../../../shared/types'
import type { Agentes } from '../hooks/agentes'
import { Icon, type IconName } from '../Icons'
import { mediaUrl } from '../media'
import { CajaCrear } from './CajaCrear'
import { CarpetaVideos } from './CarpetaVideos'
import { ListaAgentes } from './ListaAgentes'

/**
 * El inicio, como al abrir un chat con un agente: «¿Qué video hacemos hoy?» y la caja para pedirlo (con su «+»,
 * formato, voz, agente y «Pregúntame antes»), los tipos de video y tus estilos para orientar al agente, y tus últimos
 * videos. Si no hay agente conectado, conectarlo es lo primero que se ve, con un clic y sin comandos.
 */

function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function Inicio({
  proyectos,
  agentes,
  creaciones,
  creando,
  onCrear,
  onAbrir,
  onAbrirCreacion,
  onAjustes
}: {
  proyectos: Project[]
  agentes: Agentes
  creaciones: Creacion[]
  creando: boolean
  onCrear: (p: PeticionCreacion) => void
  onAbrir: (id: string) => void
  onAbrirCreacion: (id: string) => void
  onAjustes: () => void
}) {
  const sinAgente = agentes.cargado && !agentes.listo
  const [estilo, setEstilo] = useState('libre')
  const elegido = ESTILOS.find((e) => e.id === estilo)
  // «Mis estilos»: los guardados desde videos que salieron bien.
  const [propios, setPropios] = useState<EstiloPropio[]>([])
  const [propio, setPropio] = useState<string | null>(null)
  const miEstilo = propios.find((p) => p.id === propio)
  useEffect(() => {
    window.recorte.estilosPropios().then(setPropios).catch(() => setPropios([]))
  }, [])

  // Tus últimos videos: los de las conversaciones (con su portada) y los que editas a mano.
  const deChats = new Set(creaciones.map((c) => c.proyectoEditor).filter(Boolean))
  const recientes = [
    ...creaciones.filter((c) => c.portada || c.salida).map((c) => ({ tipo: 'creacion' as const, id: c.id, fecha: c.updatedAt, c })),
    ...proyectos.filter((p) => !deChats.has(p.id)).map((p) => ({ tipo: 'proyecto' as const, id: p.id, fecha: p.updatedAt, p }))
  ]
    .sort((a, b) => b.fecha - a.fecha)
    .slice(0, 5)

  return (
    <div className="ini">
      <div className="ini-centro">
        <h1>{miEstilo ? `Con tu estilo «${miEstilo.nombre}»` : elegido && elegido.id !== 'libre' ? elegido.nombre : '¿Qué video hacemos hoy?'}</h1>
        <p className="ini-sub">
          {miEstilo
            ? 'Cuenta de qué trata el video nuevo: el agente usa las mismas letras, colores, ritmo, cámara y música de aquel.'
            : elegido && elegido.id !== 'libre'
              ? elegido.descripcion
              : 'Cuéntamelo como a una persona. Con el «+» me das tu audio, fotos o un video para editar.'}
        </p>

        <CarpetaVideos modo="aviso" />

        <div className="ini-caja">
          <CajaCrear
            agentes={agentes}
            creando={creando}
            estilo={miEstilo ? miEstilo.estilo : estilo}
            base={miEstilo ? { propio: miEstilo.id } : undefined}
            onCrear={onCrear}
            onConectar={onAjustes}
          />
        </div>

        {sinAgente && (
          <section className="ini-agente" aria-label="Conecta tu agente">
            <h2>Conecta tu agente</h2>
            <p>Elige con qué cuenta trabaja la IA. Recorte lo instala y abre el inicio de sesión: sin comandos ni claves.</p>
            <ListaAgentes agentes={agentes} compacta />
          </section>
        )}

        <div className="ini-estilos" role="group" aria-label="Tipo de video">
          {ESTILOS.filter((e) => e.id !== 'libre').map((e) => (
            <button
              key={e.id}
              className={`ini-chip ${estilo === e.id && !propio ? 'is-on' : ''}`}
              onClick={() => (setPropio(null), setEstilo(estilo === e.id ? 'libre' : e.id))}
              title={e.descripcion}
            >
              <Icon name={e.icono as IconName} size={13} /> {e.nombre}
            </button>
          ))}
          {propios.map((p) => (
            <span key={p.id} className={`ini-chip is-propio ${propio === p.id ? 'is-on' : ''}`}>
              <button className="ini-chip-boton" onClick={() => setPropio(propio === p.id ? null : p.id)} title={`Tu estilo, de: ${p.descripcion}`}>
                <Icon name="layers" size={13} /> {p.nombre}
              </button>
              <button
                className="ini-chip-quitar"
                aria-label={`Borrar el estilo ${p.nombre}`}
                title="Borrar este estilo (el video del que salió no se toca)"
                onClick={() => {
                  if (!window.confirm(`¿Borrar el estilo «${p.nombre}»? El video del que salió no se toca.`)) return
                  if (propio === p.id) setPropio(null)
                  window.recorte.borrarEstiloPropio(p.id).then(setPropios).catch(() => undefined)
                }}
              >
                <Icon name="x" size={10} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {recientes.length > 0 && (
        <section className="ini-recientes" aria-label="Tus últimos videos">
          <h2>Tus últimos videos</h2>
          <div className="ini-recientes-fila">
            {recientes.map((r) =>
              r.tipo === 'creacion' ? (
                <button key={r.id} className="ini-video" onClick={() => onAbrirCreacion(r.id)} title={r.c.peticion}>
                  <span className={`ini-video-miniatura ${r.c.formato}`}>
                    {r.c.portada ? <img src={mediaUrl(`c-${r.c.id}`, r.c.portada)} alt="" loading="lazy" /> : <Icon name="sparkles" size={22} />}
                  </span>
                  <span className="ini-video-nombre">{r.c.guion?.titulo ?? r.c.nombre}</span>
                </button>
              ) : (
                <button key={r.id} className="ini-video" onClick={() => onAbrir(r.id)} title={r.p.source.path}>
                  <span className="ini-video-miniatura">
                    {r.p.thumbnail ? <img src={mediaUrl(r.p.id, r.p.thumbnail)} alt="" loading="lazy" /> : <Icon name="film" size={22} />}
                    <span className="ini-video-duracion">{duracion(r.p.source.duration)}</span>
                  </span>
                  <span className="ini-video-nombre">{r.p.name}</span>
                </button>
              )
            )}
          </div>
        </section>
      )}
    </div>
  )
}
