import { useEffect, useRef, useState } from 'react'
import type { Creacion, EstiloPropio, PeticionCreacion } from '../../../shared/creacion'
import { ESTILOS, type EstiloCatalogo } from '../../../shared/estilos'
import { VistaEstilo } from './TiendaEstilos'
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
  onAjustes,
  onEstilos,
  estiloInicial,
  onEstiloUsado
}: {
  proyectos: Project[]
  agentes: Agentes
  creaciones: Creacion[]
  creando: boolean
  onCrear: (p: PeticionCreacion) => void
  onAbrir: (id: string) => void
  onAbrirCreacion: (id: string) => void
  onAjustes: () => void
  /** Abre la sección «Estilos». */
  onEstilos: () => void
  /** El estilo elegido con «Probar ya» en la sección «Estilos» (cat-<id>). */
  estiloInicial?: string | null
  onEstiloUsado?: () => void
}) {
  const sinAgente = agentes.cargado && !agentes.listo
  const [estilo, setEstilo] = useState(estiloInicial ?? 'libre')
  // Los estilos de la sección «Estilos» (los añadidos salen como tarjetas).
  const [catalogo, setCatalogo] = useState<EstiloCatalogo[]>([])
  const [encima, setEncima] = useState<string | null>(null)
  useEffect(() => {
    window.recorte.estilosCatalogo().then(setCatalogo).catch(() => setCatalogo([]))
  }, [])
  useEffect(() => {
    if (!estiloInicial) return
    setEstilo(estiloInicial)
    onEstiloUsado?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estiloInicial])
  // El carrusel de tarjetas: flechas a los lados cuando hay más de las que caben.
  const rejilla = useRef<HTMLDivElement>(null)
  const [bordes, setBordes] = useState({ izq: false, der: false })
  const medir = (): void => {
    const r = rejilla.current
    if (!r) return
    const izq = r.scrollLeft > 4
    const der = r.scrollLeft + r.clientWidth < r.scrollWidth - 4
    setBordes((b) => (b.izq === izq && b.der === der ? b : { izq, der }))
  }
  useEffect(() => {
    const r = rejilla.current
    if (!r) return
    const o = new ResizeObserver(medir)
    o.observe(r)
    Array.from(r.children).forEach((c) => o.observe(c))
    return () => o.disconnect()
  })
  const mover = (lado: number): void => rejilla.current?.scrollBy({ left: lado * rejilla.current.clientWidth * 0.8, behavior: 'smooth' })
  const delCatalogo = catalogo.find((e) => `cat-${e.id}` === estilo)
  const elegido = ESTILOS.find((e) => e.id === estilo) ?? (delCatalogo ? { id: estilo, nombre: delCatalogo.nombre, descripcion: delCatalogo.descripcion } : undefined)
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

        <section className="ini-tarjetas" aria-label="Empieza con un estilo">
          <div className="ini-tarjetas-cabeza">
            <span>Empieza con un estilo</span>
            <button className="ini-ver-estilos" onClick={onEstilos}>
              Ver todos los estilos <Icon name="chevron" size={12} />
            </button>
          </div>
          <div className={`ini-carrusel ${bordes.izq ? 'hay-izq' : ''} ${bordes.der ? 'hay-der' : ''}`}>
          {bordes.izq && (
            <button className="ini-flecha is-izq" onClick={() => mover(-1)} aria-label="Ver las tarjetas anteriores">
              <Icon name="chevron" size={16} />
            </button>
          )}
          <div
            ref={rejilla}
            className="ini-tarjetas-rejilla"
            onScroll={medir}
            onWheel={(e) => {
              // Una sola fila: la rueda del mouse la mueve de lado.
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
            }}
          >
            {ESTILOS.filter((e) => e.id !== 'libre').map((e) => (
              <button
                key={e.id}
                className={`ini-tarjeta ${estilo === e.id && !propio ? 'is-on' : ''}`}
                onClick={() => (setPropio(null), setEstilo(estilo === e.id ? 'libre' : e.id))}
                title={e.descripcion}
              >
                <span className="ini-tarjeta-vista is-icono">
                  <Icon name={e.icono as IconName} size={22} />
                </span>
                <span className="ini-tarjeta-nombre">{e.nombre}</span>
              </button>
            ))}
            {catalogo
              .filter((e) => e.anadido)
              .map((e) => (
                <button
                  key={e.id}
                  className={`ini-tarjeta ${estilo === `cat-${e.id}` && !propio ? 'is-on' : ''}`}
                  onClick={() => (setPropio(null), setEstilo(estilo === `cat-${e.id}` ? 'libre' : `cat-${e.id}`))}
                  onMouseEnter={() => setEncima(e.id)}
                  onMouseLeave={() => setEncima(null)}
                  title={e.descripcion}
                >
                  <span className="ini-tarjeta-vista">
                    <VistaEstilo estilo={e} viva={encima === e.id || estilo === `cat-${e.id}`} />
                    <span className="ini-tarjeta-sello">{e.etiqueta}</span>
                  </span>
                  <span className="ini-tarjeta-nombre">{e.nombre}</span>
                </button>
              ))}
            {propios.map((p) => (
              <span key={p.id} className={`ini-tarjeta is-propio ${propio === p.id ? 'is-on' : ''}`}>
                <button className="ini-tarjeta-boton" onClick={() => setPropio(propio === p.id ? null : p.id)} title={`Tu estilo, de: ${p.descripcion}`}>
                  <span className="ini-tarjeta-vista is-icono">
                    <Icon name="layers" size={22} />
                    <span className="ini-tarjeta-sello">MÍO</span>
                  </span>
                  <span className="ini-tarjeta-nombre">{p.nombre}</span>
                </button>
                <button
                  className="ini-tarjeta-quitar"
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
            <button className="ini-tarjeta is-mas" onClick={onEstilos}>
              <span className="ini-tarjeta-vista is-icono">
                <Icon name="plus" size={22} />
              </span>
              <span className="ini-tarjeta-nombre">Más estilos</span>
            </button>
          </div>
          {bordes.der && (
            <button className="ini-flecha is-der" onClick={() => mover(1)} aria-label="Ver más tarjetas">
              <Icon name="chevron" size={16} />
            </button>
          )}
          </div>
        </section>
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
