import { useEffect, useMemo, useState } from 'react'
import { ESTILOS, type EstiloCatalogo, type GrupoEstilo } from '../../../shared/estilos'
import { Icon, type IconName } from '../Icons'

/**
 * La sección «Estilos», como una tienda de skills: buscas, ves la vista previa y lo añades. Lo añadido sale como
 * tarjeta debajo de la caja del inicio, y el agente lo sigue al hacer el video (y aprende de lo que le corriges).
 * «+ Crear un estilo» guarda uno tuyo contado con palabras (o pegando un prompt que te guste).
 */

const FILTROS: { id: 'todos' | GrupoEstilo | 'mios' | 'anadidos'; nombre: string }[] = [
  { id: 'todos', nombre: 'Todos' },
  { id: '3d', nombre: '3D' },
  { id: 'vender', nombre: 'Vender' },
  { id: 'ensenar', nombre: 'Enseñar' },
  { id: 'contar', nombre: 'Contar' },
  { id: 'inspirar', nombre: 'Inspirar' },
  { id: 'mios', nombre: 'Creados por mí' },
  { id: 'anadidos', nombre: 'Añadidos' }
]

/**
 * Los tipos básicos (Clase o tutorial, Promo, Historia…): siempre están en las tarjetas del inicio; aquí salen para
 * verlos junto a los demás, con su categoría.
 */
const ICONO_BASICO = new Map(ESTILOS.map((e) => [e.id, e.icono as IconName]))
const BASICOS: EstiloCatalogo[] = ESTILOS.filter((e) => e.id !== 'libre').map((e) => ({
  id: e.id,
  nombre: e.nombre,
  grupo: e.grupo,
  etiqueta: 'BÁSICO',
  para: e.descripcion,
  descripcion: e.descripcion,
  vabien: '',
  colores: [],
  origen: 'recorte',
  anadido: true,
  lecciones: 0
}))
const esBasico = (e: EstiloCatalogo): boolean => e.etiqueta === 'BÁSICO' && ICONO_BASICO.has(e.id)

const sinAcentos = (t: string): string => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** La vista previa de un estilo: su video si lo tiene; si no, un dibujo con sus colores. */
export function VistaEstilo({ estilo, viva = true, className = '' }: { estilo: EstiloCatalogo; viva?: boolean; className?: string }) {
  if (esBasico(estilo)) {
    return (
      <span className={`te-vista is-icono ${className}`}>
        <Icon name={ICONO_BASICO.get(estilo.id)!} size={className.includes('is-grande') ? 54 : 34} />
      </span>
    )
  }
  const [fondo, a, b] = estilo.colores
  if (estilo.vista && viva) {
    return (
      <span className={`te-vista ${className}`} style={{ background: fondo }}>
        <video src={estilo.vista} poster={estilo.poster} muted loop autoPlay playsInline preload="metadata" />
      </span>
    )
  }
  if (estilo.poster) {
    return (
      <span className={`te-vista ${className}`} style={{ background: fondo }}>
        <img src={estilo.poster} alt="" loading="lazy" />
      </span>
    )
  }
  return (
    <span className={`te-vista is-dibujo ${className}`} style={{ background: `radial-gradient(circle at 50% 35%, color-mix(in srgb, ${fondo} 80%, white), ${fondo})` }}>
      <span className="te-forma uno" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${a} 55%, white), ${a} 70%)` }} />
      <span className="te-forma dos" style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in srgb, ${b} 55%, white), ${b} 70%)` }} />
    </span>
  )
}

export function TiendaEstilos({ onAviso, onProbar }: { onAviso: (t: string) => void; onProbar: (id: string) => void }) {
  const [lista, setLista] = useState<EstiloCatalogo[] | null>(null)
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]['id']>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    window.recorte
      .estilosCatalogo()
      .then((l) => {
        setLista(l)
        setElegido((e) => e ?? l[0]?.id ?? null)
      })
      .catch(() => setLista([]))
  }, [])

  const todos = useMemo(() => (lista ? [...lista, ...BASICOS] : null), [lista])
  // Solo las categorías que tienen algo (y que no repiten «Todos»).
  const filtros = FILTROS.filter((f) => {
    if (f.id === 'todos' || f.id === 'anadidos') return true
    const n = (todos ?? []).filter((e) => (f.id === 'mios' ? e.origen === 'usuario' : e.grupo === f.id)).length
    return n > 0 && n < (todos?.length ?? 0)
  })
  const visibles = useMemo(() => {
    const q = sinAcentos(busqueda.trim())
    return (todos ?? []).filter((e) => {
      if (filtro === 'anadidos' && !e.anadido) return false
      if (filtro === 'mios' && e.origen !== 'usuario') return false
      if (filtro !== 'todos' && filtro !== 'anadidos' && filtro !== 'mios' && e.grupo !== filtro) return false
      return !q || sinAcentos(`${e.nombre} ${e.para} ${e.descripcion} ${e.vabien}`).includes(q)
    })
  }, [todos, filtro, busqueda])
  const detalle = todos?.find((e) => e.id === elegido) ?? null
  const anadidos = todos?.filter((e) => e.anadido).length ?? 0

  async function alternar(e: EstiloCatalogo) {
    try {
      setLista(e.anadido ? await window.recorte.estiloQuitar(e.id) : await window.recorte.estiloAnadir(e.id))
      onAviso(e.anadido ? `Quitaste «${e.nombre}» de tus tarjetas.` : `«${e.nombre}» ya está en tus tarjetas, debajo de la caja.`)
    } catch {
      onAviso('No pude guardar el cambio.')
    }
  }

  async function borrar(e: EstiloCatalogo) {
    if (!window.confirm(`¿Borrar tu estilo «${e.nombre}»? Lo que aprendió el agente con él se queda.`)) return
    setLista(await window.recorte.estiloBorrar(e.id))
    setElegido(null)
  }

  return (
    <div className="te">
      <div className="te-cabeza">
        <div className="te-titulo">
          <h1>Estilos</h1>
          <p>Añade los que te gusten: salen como tarjetas debajo de la caja y el agente los sigue al hacer tu video.</p>
        </div>
        <label className="te-buscar">
          <Icon name="search" size={14} />
          <input value={busqueda} onChange={(ev) => setBusqueda(ev.target.value)} placeholder="Buscar: plastilina, neón, producto…" aria-label="Buscar un estilo" />
        </label>
        <button className="btn te-crear" onClick={() => setCreando(true)}>
          <Icon name="plus" size={15} /> Crear un estilo
        </button>
      </div>

      <div className="te-filtros" role="tablist" aria-label="Qué estilos ver">
        {filtros.map((f) => (
          <button key={f.id} role="tab" aria-selected={filtro === f.id} className={`te-filtro ${filtro === f.id ? 'is-on' : ''}`} onClick={() => setFiltro(f.id)}>
            {f.id === 'anadidos' ? `Añadidos (${anadidos})` : f.nombre}
          </button>
        ))}
      </div>

      <div className="te-cuerpo">
        <div className="te-rejilla">
          {lista === null && <p className="te-nada">Cargando los estilos…</p>}
          {lista !== null && !visibles.length && (
            <p className="te-nada">{busqueda ? `Nada con «${busqueda}». Prueba otra palabra o crea tu estilo.` : 'Aquí no hay estilos todavía.'}</p>
          )}
          {visibles.map((e) => (
            <div
              key={e.id}
              className={`te-tarjeta ${e.anadido ? 'is-anadido' : ''} ${elegido === e.id ? 'is-elegido' : ''}`}
              onClick={() => setElegido(e.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setElegido(e.id)}
              aria-label={`Ver ${e.nombre}`}
            >
              <span className="te-tarjeta-vista">
                <VistaEstilo estilo={e} />
                <span className="te-etiqueta">{e.etiqueta}</span>
              </span>
              <span className="te-tarjeta-pie">
                <span className="te-tarjeta-fila">
                  <strong>{e.nombre}</strong>
                  {esBasico(e) ? (
                    <span className="te-anadir is-on is-fijo" title="Siempre está en tus tarjetas del inicio">
                      <Icon name="check" size={12} /> Siempre
                    </span>
                  ) : (
                  <button
                    className={`te-anadir ${e.anadido ? 'is-on' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      void alternar(e)
                    }}
                    title={e.anadido ? 'Quitar de tus tarjetas' : 'Añadir a tus tarjetas'}
                  >
                    {e.anadido ? (
                      <>
                        <Icon name="check" size={12} /> Añadido
                      </>
                    ) : (
                      <>
                        <Icon name="plus" size={12} /> Añadir
                      </>
                    )}
                  </button>
                  )}
                </span>
                <span className="te-para">{e.para}</span>
              </span>
            </div>
          ))}
        </div>

        {detalle && (
          <aside className="te-detalle" aria-label={`Detalle de ${detalle.nombre}`}>
            <VistaEstilo estilo={detalle} className="is-grande" />
            <div className="te-detalle-texto">
              <div className="te-detalle-fila">
                <strong>{detalle.nombre}</strong>
                <span className="te-sello">{esBasico(detalle) ? 'Básico' : `${detalle.etiqueta} · ${detalle.origen === 'recorte' ? 'Recorte' : 'Tuyo'}`}</span>
              </div>
              <p>{detalle.descripcion}</p>
              <ul>
                {detalle.vabien && (
                  <li>
                    <Icon name="check" size={13} /> Va bien con: {detalle.vabien}
                  </li>
                )}
                {esBasico(detalle) && (
                  <li>
                    <Icon name="check" size={13} /> Siempre está en tus tarjetas del inicio: le da al agente la estructura del video
                  </li>
                )}
                <li>
                  <Icon name="check" size={13} /> Usa tu material: tus fotos, tu logo y tu producto, en este estilo
                </li>
                <li>
                  <Icon name="check" size={13} /> {detalle.grupo === '3d' ? 'Sin créditos: el 3D se hace en tu equipo' : 'Lo hace tu agente con lo que elijas en la caja'}
                </li>
                {detalle.lecciones > 0 && (
                  <li>
                    <Icon name="sparkles" size={13} /> Aprendió {detalle.lecciones} {detalle.lecciones === 1 ? 'cosa' : 'cosas'} de tus videos (en Ajustes → Aprendizaje)
                  </li>
                )}
              </ul>
              <div className="te-detalle-botones">
                {!esBasico(detalle) && (
                  <button className={`btn ${detalle.anadido ? 'ghost' : 'primary'}`} onClick={() => void alternar(detalle)}>
                    {detalle.anadido ? 'Quitar de mis tarjetas' : 'Añadir a mis tarjetas'}
                  </button>
                )}
                <button className={`btn ${esBasico(detalle) ? 'primary' : 'ghost'}`} onClick={() => onProbar(esBasico(detalle) ? detalle.id : `cat-${detalle.id}`)}>
                  Probar ya
                </button>
              </div>
              {detalle.origen === 'usuario' && (
                <button className="te-borrar" onClick={() => void borrar(detalle)}>
                  <Icon name="trash" size={13} /> Borrar este estilo
                </button>
              )}
            </div>
          </aside>
        )}
      </div>

      {creando && (
        <CrearEstilo
          onCerrar={() => setCreando(false)}
          onCreado={(l, id, nombre) => {
            setLista(l)
            setElegido(id)
            setCreando(false)
            onAviso(`Guardé «${nombre}» y ya está en tus tarjetas.`)
          }}
        />
      )}
    </div>
  )
}

function CrearEstilo({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (l: EstiloCatalogo[], id: string, nombre: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [grupo, setGrupo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    setError(null)
    try {
      const r = await window.recorte.estiloCrear({ nombre, descripcion, grupo: grupo || undefined })
      if (r.id) onCreado(r.catalogo, r.id, nombre.trim())
      else setError(r.error ?? 'No pude guardarlo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="confirmar-fondo" onClick={() => !guardando && onCerrar()}>
      <div className="confirmar te-dialogo" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-label="Crear un estilo">
        <h3>Crear un estilo</h3>
        <p>Cuéntale al agente cómo se ve y cómo se mueve. También puedes pegar un prompt de estilo que te guste: queda solo en tu equipo.</p>
        <label className="te-campo">
          <span>Nombre</span>
          <input value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Mi marca en dorado y negro" maxLength={60} autoFocus />
        </label>
        <label className="te-campo">
          <span>Cómo es</span>
          <textarea
            value={descripcion}
            onChange={(ev) => setDescripcion(ev.target.value)}
            rows={8}
            placeholder="Fondo negro mate, letras finas en mayúsculas, el producto gira despacio bajo un foco y cada texto entra con un fundido lento…"
          />
        </label>
        <label className="te-campo">
          <span>Tipo</span>
          <select value={grupo} onChange={(ev) => setGrupo(ev.target.value)}>
            <option value="">Que lo decida Recorte</option>
            <option value="3d">3D</option>
            <option value="vender">Vender</option>
            <option value="ensenar">Enseñar</option>
            <option value="contar">Contar</option>
            <option value="inspirar">Inspirar</option>
          </select>
        </label>
        {error && <p className="te-error">{error}</p>}
        <div className="confirmar-botones">
          <button className="btn small ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button className="btn small primary" onClick={() => void guardar()} disabled={guardando || !nombre.trim() || descripcion.trim().length < 20}>
            {guardando ? 'Guardando…' : 'Guardar y añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}
