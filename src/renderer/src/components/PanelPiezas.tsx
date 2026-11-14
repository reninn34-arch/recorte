import { useEffect, useMemo, useState } from 'react'
import type { PiezaAnimada, ValoresPieza, VariablePieza } from '../../../shared/piezas'
import { anadirCapa, cambiarCapa, duracionesDeMedios, type CapaTL, type Timeline } from '../../../shared/timeline'
import type { MedioProyecto, Project } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

let cache: PiezaAnimada[] | null = null

/**
 * «Animadas»: piezas de diseño en movimiento (títulos, rótulos, llamados, datos, transiciones, cierres con logo),
 * con los colores y el logo de la marca. Eliges una, cambias sus textos y colores, y entra en el cabezal como una capa
 * con transparencia. Si eliges una ya puesta, la cambias aquí y se vuelve a animar.
 */
export function PanelPiezas({
  proyecto,
  timeline,
  historial,
  tiempo,
  capaElegida,
  onMedios,
  onElegirCapa,
  onAviso
}: {
  proyecto: Project
  timeline: Timeline
  historial: Historial
  tiempo: number
  capaElegida?: CapaTL
  onMedios: (medios: MedioProyecto[]) => void
  onElegirCapa: (id: string) => void
  onAviso: (t: string) => void
}) {
  const [piezas, setPiezas] = useState<PiezaAnimada[]>(cache ?? [])
  const [abierta, setAbierta] = useState<string | null>(null)
  const [valores, setValores] = useState<ValoresPieza>({})
  const [duracion, setDuracion] = useState(3)
  const [animando, setAnimando] = useState(false)
  // El taller: una animación nueva (o cambios) que hace el agente conectado.
  const [pedido, setPedido] = useState('')
  const [refs, setRefs] = useState<{ ruta: string; nombre: string }[]>([])
  const [creando, setCreando] = useState(false)
  const [lineas, setLineas] = useState<string[]>([])
  const [cambios, setCambios] = useState('')
  const recargar = async (abrirId?: string) => {
    const l = await window.recorte.listarPiezas()
    cache = l
    setPiezas(l)
    if (abrirId) {
      setAbierta(abrirId)
      setValores({})
      const p = l.find((x) => x.id === abrirId)
      if (p) setDuracion(p.duracion.defecto)
    }
  }
  useEffect(() => {
    if (!cache) void recargar()
    return window.recorte.onPiezasProgreso((t) => setLineas((l) => [...l.slice(-5), t]))
  }, [])
  const crear = async (texto: string, base?: string) => {
    if (!texto.trim() || creando) return
    setCreando(true)
    setLineas([])
    try {
      const nueva = await window.recorte.crearPieza(proyecto.id, texto, refs.map((r) => r.ruta), base)
      await recargar(nueva.id)
      setPedido('')
      setCambios('')
      setRefs([])
      onAviso(`Listo: «${nueva.nombre}» quedó en «Mis animaciones». Revísala y ponla en el cabezal.`)
    } catch (e) {
      onAviso(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setCreando(false)
    }
  }
  const agregarRefs = (archivos: FileList | null) => {
    const nuevas = [...(archivos ?? [])]
      .map((f) => ({ ruta: window.recorte.rutaDeArchivo(f) ?? '', nombre: f.name }))
      .filter((r) => r.ruta)
    setRefs((r) => [...r, ...nuevas].slice(0, 8))
  }
  const enCurso = creando && (
    <div className="pz-taller-curso">
      <span className="pz-taller-puntos">
        <Icon name="sparkles" size={13} /> Tu agente está trabajando (tarda unos minutos)
      </span>
      {lineas.map((l, i) => (
        <span key={i} className="tl-dim">
          {l}
        </span>
      ))}
      <button className="btn small ghost" onClick={() => void window.recorte.pararPieza()}>
        Parar
      </button>
    </div>
  )

  // Una pieza ya puesta y elegida: se edita ella.
  const editando = capaElegida?.pieza ? capaElegida : undefined
  useEffect(() => {
    if (!editando?.pieza) return
    setAbierta(editando.pieza.id)
    setValores(editando.pieza.valores)
    setDuracion(editando.duracion)
  }, [editando?.id])

  const pieza = piezas.find((p) => p.id === abierta)
  const porCategoria = useMemo(() => {
    const m = new Map<string, PiezaAnimada[]>()
    for (const p of piezas.filter((x) => !x.subtitulos)) m.set(p.categoria, [...(m.get(p.categoria) ?? []), p])
    return [...m.entries()]
  }, [piezas])

  const abrir = (p: PiezaAnimada) => {
    setAbierta(p.id)
    setValores({})
    setDuracion(p.duracion.defecto)
  }

  const colorDe = (x: VariablePieza): string => {
    const v = valores[x.id] ?? x.defecto
    if (v === 'marca') return proyecto.brand.primary
    if (v === 'marca2') return proyecto.brand.secondary
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'
  }
  const imagenes = (proyecto.medios ?? []).filter((m) => m.tipo === 'imagen')

  const animar = async () => {
    if (!pieza || animando) return
    setAnimando(true)
    try {
      const r = await window.recorte.animarPieza(proyecto.id, pieza.id, valores, duracion)
      onMedios(r.project.medios ?? [])
      const medios = { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      if (editando) {
        historial.aplicar(cambiarCapa(timeline, editando.id, { fuente: r.medio, duracion: r.duracion, pieza: { id: pieza.id, valores } }, medios))
        onAviso(`Listo: «${pieza.nombre}» con los cambios.`)
      } else {
        const hecho = anadirCapa(
          timeline,
          { fuente: r.medio, inicio: tiempo, duracion: r.duracion, x: pieza.capa.x, y: pieza.capa.y, ancho: pieza.capa.ancho, pista: 3, pieza: { id: pieza.id, valores } },
          medios
        )
        if (hecho.timeline === timeline) {
          onAviso('No cupo en el cabezal: mueve el cabezal antes del final del video.')
          return
        }
        historial.aplicar(hecho.timeline)
        onElegirCapa(hecho.id)
        onAviso(`Listo: «${pieza.nombre}» quedó en el cabezal. Muévela o alárgala como cualquier capa.`)
      }
    } catch (e) {
      onAviso(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setAnimando(false)
    }
  }

  if (!piezas.length) return <p className="tl-dim">Cargando las animaciones…</p>

  if (pieza) {
    return (
      <div className="pz">
        <button className="ed-fila" onClick={() => setAbierta(null)}>
          <Icon name="undo" size={14} />
          <span>Todas las animaciones</span>
        </button>
        <span className="ed-seccion">{editando ? `Editando: ${pieza.nombre}` : pieza.nombre}</span>
        {pieza.muestra && <video className="pz-muestra" src={pieza.muestra} autoPlay loop muted playsInline />}
        <p className="tl-dim">{pieza.para}</p>
        {pieza.vars.map((x) => (
          <label key={x.id} className={`pz-campo ${x.tipo === 'si' ? 'pz-si' : ''}`}>
            <span>{x.nombre}</span>
            {x.tipo === 'texto' && (
              <input className="tl-texto-input" value={String(valores[x.id] ?? x.defecto)} onChange={(e) => setValores({ ...valores, [x.id]: e.target.value })} />
            )}
            {x.tipo === 'numero' && (
              <input className="tl-texto-input" type="number" value={Number(valores[x.id] ?? x.defecto)} onChange={(e) => setValores({ ...valores, [x.id]: Number(e.target.value) })} />
            )}
            {x.tipo === 'color' && (
              <span className="pz-color">
                <input type="color" className="tl-color" value={colorDe(x)} onChange={(e) => setValores({ ...valores, [x.id]: e.target.value })} />
                <button type="button" className="chip" onClick={() => setValores({ ...valores, [x.id]: 'marca' })} title="El color principal de la marca">
                  Marca
                </button>
                <button type="button" className="chip" onClick={() => setValores({ ...valores, [x.id]: 'marca2' })} title="El segundo color de la marca">
                  Marca 2
                </button>
              </span>
            )}
            {x.tipo === 'opcion' && (
              <select value={String(valores[x.id] ?? x.defecto)} onChange={(e) => setValores({ ...valores, [x.id]: e.target.value })}>
                {(x.opciones ?? []).map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            )}
            {x.tipo === 'si' && (
              <input type="checkbox" checked={(valores[x.id] ?? x.defecto) === true} onChange={(e) => setValores({ ...valores, [x.id]: e.target.checked })} />
            )}
            {x.tipo === 'imagen' && (
              <select value={String(valores[x.id] ?? x.defecto)} onChange={(e) => setValores({ ...valores, [x.id]: e.target.value })}>
                <option value="">Ninguna</option>
                {proyecto.brand.logo && <option value="marca">El logo de la marca</option>}
                {imagenes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
          </label>
        ))}
        <label className="pz-campo">
          <span>Dura (s)</span>
          <input
            className="tl-texto-input"
            type="number"
            step={0.1}
            min={pieza.duracion.min}
            max={pieza.duracion.max}
            value={duracion}
            onChange={(e) => setDuracion(Math.max(pieza.duracion.min, Math.min(pieza.duracion.max, Number(e.target.value) || pieza.duracion.defecto)))}
          />
        </label>
        {pieza.vars.some((x) => x.tipo === 'imagen') && !proyecto.brand.logo && !imagenes.length && (
          <p className="tl-dim">Para el logo: arrastra tu logo (PNG) a la biblioteca o ponlo en la marca del proyecto.</p>
        )}
        <button className="btn small primary" disabled={animando} onClick={() => void animar()}>
          <Icon name="sparkles" size={13} /> {animando ? 'Animando… (la primera vez tarda un poco)' : editando ? 'Volver a animar con los cambios' : 'Poner en el cabezal'}
        </button>
        <span className="ed-seccion">{pieza.propia ? 'Pedir cambios' : 'Hacer mi versión'}</span>
        <textarea
          className="tl-texto-input pz-pedido"
          rows={3}
          placeholder={pieza.propia ? 'Ej.: más lenta, que entre desde abajo, sin confeti, letra más grande…' : 'Ej.: igual pero con mi foto en un círculo y colores pastel'}
          value={cambios}
          disabled={creando}
          onChange={(e) => setCambios(e.target.value)}
        />
        <button className="btn small" disabled={creando || !cambios.trim()} onClick={() => void crear(cambios, pieza.id)}>
          <Icon name="sparkles" size={13} /> {pieza.propia ? 'Que mi agente la cambie' : 'Que mi agente haga mi versión'}
        </button>
        {enCurso}
        {pieza.propia && !creando && (
          <button
            className="btn small ghost"
            onClick={async () => {
              if (!window.confirm(`¿Borrar «${pieza.nombre}» de tus animaciones? Las que ya pusiste en videos se quedan.`)) return
              await window.recorte.borrarPieza(pieza.id)
              setAbierta(null)
              await recargar()
            }}
          >
            Borrar de mis animaciones
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="pz">
      <div className="pz-taller">
        <span className="ed-seccion">Crea una animación nueva</span>
        <textarea
          className="tl-texto-input pz-pedido"
          rows={3}
          placeholder="Descríbela como se la pedirías a un diseñador: qué dice, cómo entra y se mueve, el estilo y los colores. Ej.: «una cuenta regresiva del 3 al 1 con globos que explotan y luego ¡Black Friday!»"
          value={pedido}
          disabled={creando}
          onChange={(e) => setPedido(e.target.value)}
        />
        <div className="pz-taller-fila">
          <label className="btn small ghost pz-adjuntar" title="Un video o una imagen de algo que te gustó: tu agente se inspira en su estilo">
            <Icon name="paperclip" size={13} /> Referencias
            <input type="file" multiple accept="image/*,video/*" hidden onChange={(e) => agregarRefs(e.target.files)} />
          </label>
          <button className="btn small primary" disabled={creando || !pedido.trim()} onClick={() => void crear(pedido)}>
            <Icon name="sparkles" size={13} /> Que mi agente la cree
          </button>
        </div>
        {refs.length > 0 && <span className="tl-dim">Referencias: {refs.map((r) => r.nombre).join(', ')}</span>}
        {!abierta && enCurso}
      </div>
      <p className="tl-dim">O elige una lista: con tus colores y tu logo, cambias el texto y entra en el cabezal.</p>
      {porCategoria.map(([cat, lista]) => (
        <div key={cat}>
          <span className="ed-seccion">{cat}</span>
          <div className="pz-grilla">
            {lista.map((p) => (
              <button key={p.id} className="pz-tarjeta" onClick={() => abrir(p)} title={p.para}>
                {p.muestra ? (
                  <video
                    src={p.muestra}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause()
                      e.currentTarget.currentTime = 0
                    }}
                  />
                ) : (
                  <span className="pz-sin-muestra">
                    <Icon name="sparkles" size={18} />
                  </span>
                )}
                <span>{p.nombre}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
