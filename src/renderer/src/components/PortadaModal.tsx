import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { duracionTimeline, FUENTES_TEXTO, ponerPortada, type PortadaTL, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon, type IconName } from '../Icons'
import { coloresDeImagen, Desplegable, ListaLetras, SelectorColor } from './PortadaHerramientas'
import { tcCuadros } from './TimelineEditor'

/** Los estilos de título listos: se tocan y se aplican; luego se puede cambiar cada cosa. */
const ESTILOS: { id: string; nombre: string; cambio: Partial<PortadaTL> }[] = [
  { id: 'clasico', nombre: 'Clásico', cambio: { letra: 'titular', color: '#ffffff', contorno: '#000000', caja: undefined } },
  { id: 'amarillo', nombre: 'Amarillo', cambio: { letra: 'impacto', color: '#ffe11a', contorno: '#000000', caja: undefined } },
  { id: 'caja-negra', nombre: 'Caja negra', cambio: { letra: 'negra', color: '#ffffff', contorno: undefined, caja: '#111111' } },
  { id: 'caja-roja', nombre: 'Caja roja', cambio: { letra: 'gruesa', color: '#ffffff', contorno: undefined, caja: '#e3262e' } },
  { id: 'caja-blanca', nombre: 'Caja blanca', cambio: { letra: 'negra', color: '#111111', contorno: undefined, caja: '#ffffff' } },
  { id: 'elegante', nombre: 'Elegante', cambio: { letra: 'elegante', color: '#ffffff', contorno: undefined, caja: undefined } }
]

type Modo = 'cuadro' | 'archivo' | 'imagen'
/** El recuadro del título en píxeles del video: su centro, su tamaño sin girar y su giro. */
type Caja = { cx: number; cy: number; w: number; h: number; giro: number }

/** La letra del título en CSS, a la medida del video. */
export function fuenteDe(p: PortadaTL, alto: number): string {
  const l = FUENTES_TEXTO[p.letra ?? 'titular'] ?? FUENTES_TEXTO.normal
  const negrita = p.negrita ?? l.negrita
  const cursiva = p.cursiva ?? l.cursiva
  return `${cursiva ? 'italic ' : ''}${negrita ? 700 : 400} ${Math.round((p.tamano ?? 0.07) * alto)}px "${l.familia}", Arial, sans-serif`
}

/**
 * La portada del video, en dos pasos como en CapCut: primero se elige la imagen (un cuadro del video en su tira, una
 * imagen de una carpeta o una foto de la biblioteca) y luego se diseña a pantalla completa, con el título como un objeto
 * que se toca, se arrastra, se agranda y se gira en la vista. Se guarda en el proyecto: al exportar va pegada al MP4 como
 * su miniatura y, si se elige, en su primer cuadro.
 */
export function PortadaModal({
  proyectoId,
  ancho,
  alto,
  fps,
  timeline,
  historial,
  tiempo,
  medios,
  urlDe,
  miniaturaDe,
  onCerrar
}: {
  proyectoId: string
  ancho: number
  alto: number
  fps: number
  timeline: Timeline
  historial: Historial
  /** El cabezal: el momento con el que empieza si aún no hay portada. */
  tiempo: number
  medios: { id: string; nombre: string; tipo: 'video' | 'imagen' }[]
  urlDe: (archivo: string) => string
  miniaturaDe?: (fuente: string) => string | undefined
  onCerrar: () => void
}) {
  const total = Math.max(0.1, duracionTimeline(timeline))
  const ultimo = Math.max(0, total - 1 / fps)
  const base = useMemo<PortadaTL>(
    () => ({ letra: 'titular', tamano: 0.07, color: '#ffffff', contorno: '#000000', x: 0.5, y: 0.8, ...(timeline.portada ?? { origen: 'cuadro', t: Math.min(tiempo, ultimo), alInicio: true }) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [p, setP] = useState<PortadaTL>(base)
  // Con una portada hecha, se abre directo en el diseño; si no, primero se elige la imagen.
  const [paso, setPaso] = useState<'elegir' | 'disenar'>(timeline.portada ? 'disenar' : 'elegir')
  const [desdeDiseno, setDesdeDiseno] = useState(Boolean(timeline.portada))
  const [modo, setModo] = useState<Modo>(base.origen)
  const [fondo, setFondo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [tira, setTira] = useState<{ t: number; archivo: string }[]>([])
  /** Mientras se arrastra en la tira: el cuadro pequeño más cercano, para verlo al momento. */
  const [rapido, setRapido] = useState<string | null>(null)
  const [nombreFoto, setNombreFoto] = useState('')
  const [elegido, setElegido] = useState(false)
  const [editando, setEditando] = useState(false)
  const [guia, setGuia] = useState<{ v: boolean; h: boolean }>({ v: false, h: false })
  const [preguntarSalir, setPreguntarSalir] = useState(false)
  const [caja, setCaja] = useState<Caja | null>(null)
  const [escala, setEscala] = useState(1)
  const lienzo = useRef<HTMLCanvasElement>(null)
  const fotos = medios.filter((m) => m.tipo === 'imagen')
  const cambiar = useCallback((cambio: Partial<PortadaTL>) => setP((x) => ({ ...x, ...cambio })), [])
  const hayTexto = Boolean((p.texto ?? '').trim())
  const cambiado = JSON.stringify(p) !== JSON.stringify(base)

  // La tira de cuadros, una vez.
  useEffect(() => {
    let vivo = true
    void window.recorte
      .portadaTira(proyectoId, timeline, 16)
      .then((r) => vivo && setTira(r.cuadros))
      .catch(() => {})
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId])

  // El fondo: el cuadro exacto de ese momento (lo pinta FFmpeg, con todo lo de encima), la imagen subida o la foto.
  useEffect(() => {
    setError('')
    if (p.origen === 'imagen') {
      setFondo(p.fuente ? urlDe(`medio/${p.fuente}`) : null)
      return
    }
    if (p.origen === 'archivo') {
      setFondo(p.foto ? urlDe(p.foto) : null)
      return
    }
    let vivo = true
    setCargando(true)
    const id = window.setTimeout(() => {
      void window.recorte
        .portadaCuadro(proyectoId, timeline, p.t ?? 0)
        .then((r) => {
          if (!vivo) return
          if (r.ok && r.archivo) setFondo(urlDe(r.archivo))
          else setError(r.error ?? 'No pude sacar ese cuadro.')
        })
        .catch((e) => vivo && setError(String(e)))
        .finally(() => vivo && setCargando(false))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.origen, p.t, p.fuente, p.foto, proyectoId])

  // En «Subir imagen» o «De la biblioteca» sin nada elegido, la vista no enseña el cuadro de antes.
  const sinElegir = paso === 'elegir' && ((modo === 'archivo' && p.origen !== 'archivo') || (modo === 'imagen' && p.origen !== 'imagen'))
  const imagen = useImagen(sinElegir ? null : (rapido ?? fondo), setError)
  const deFoto = useMemo(() => coloresDeImagen(imagen), [imagen])
  const fuenteCss = fuenteDe(p, alto)

  // Pinta la portada a la medida del video (la vista la muestra reducida, con su forma). Al elegir la imagen y mientras
  // se escribe, sin el título: ahí se ve el cuadro limpio o el texto que se está escribiendo.
  useEffect(() => {
    let vivo = true
    void document.fonts
      .load(fuenteCss)
      .catch(() => undefined)
      .then(() => {
        if (vivo && lienzo.current) setCaja(pintarPortada(lienzo.current, imagen, p, ancho, alto, paso === 'elegir' || editando))
      })
    return () => {
      vivo = false
    }
  }, [imagen, p, fuenteCss, ancho, alto, paso, editando])

  // Cuánto se achica el video en la vista (para escribir encima con la misma medida).
  useLayoutEffect(() => {
    const c = lienzo.current
    if (!c || paso !== 'disenar') return
    const medir = () => setEscala(c.getBoundingClientRect().height / alto || 1)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(c)
    return () => ro.disconnect()
  }, [paso, alto])

  const salir = useCallback(() => {
    if (cambiado) setPreguntarSalir(true)
    else onCerrar()
  }, [cambiado, onCerrar])

  // El teclado en el diseño: Supr borra el título elegido, Escape lo suelta (o pregunta si salir).
  useEffect(() => {
    if (paso !== 'disenar' || editando || preguntarSalir) return
    const tecla = (e: KeyboardEvent) => {
      const en = e.target as HTMLElement
      if (en.closest('input, textarea, select')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && elegido) {
        e.preventDefault()
        cambiar({ texto: '' })
        setElegido(false)
      } else if (e.key === 'Escape') {
        if (elegido) setElegido(false)
        else salir()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [paso, editando, elegido, preguntarSalir, cambiar, salir])

  /** De un punto de la pantalla a píxeles del video. */
  function enVideo(clientX: number, clientY: number) {
    const r = lienzo.current!.getBoundingClientRect()
    return { x: ((clientX - r.left) / r.width) * ancho, y: ((clientY - r.top) / r.height) * alto }
  }
  /** Un punto del video en el marco del título (sin su giro, desde su centro). */
  function enCaja(x: number, y: number, c: Caja) {
    const a = (-c.giro * Math.PI) / 180
    const dx = x - c.cx
    const dy = y - c.cy
    return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }
  }

  /** Arrastrar algo en la vista hasta soltarlo. */
  function arrastrar(e: React.PointerEvent, mover: (ev: PointerEvent) => void, alSoltar?: () => void) {
    e.preventDefault()
    e.stopPropagation()
    const mov = (ev: PointerEvent) => mover(ev)
    const soltar = () => {
      window.removeEventListener('pointermove', mov)
      window.removeEventListener('pointerup', soltar)
      alSoltar?.()
    }
    window.addEventListener('pointermove', mov)
    window.addEventListener('pointerup', soltar)
  }

  /** Tocar la vista: sobre el título lo elige y lo mueve; fuera lo suelta y, con una imagen, la encuadra. */
  function tocarVista(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !lienzo.current) return
    const pt = enVideo(e.clientX, e.clientY)
    const margen = 14 / escala
    const local = caja ? enCaja(pt.x, pt.y, caja) : null
    const sobreTexto = caja && local && Math.abs(local.x) <= caja.w / 2 + margen && Math.abs(local.y) <= caja.h / 2 + margen
    if (sobreTexto) {
      setElegido(true)
      const inicio = { x: p.x ?? 0.5, y: p.y ?? 0.8 }
      const r = lienzo.current.getBoundingClientRect()
      const x0 = e.clientX
      const y0 = e.clientY
      const iman = 8 / r.width
      arrastrar(
        e,
        (ev) => {
          let x = Math.min(1, Math.max(0, inicio.x + (ev.clientX - x0) / r.width))
          let y = Math.min(1, Math.max(0, inicio.y + (ev.clientY - y0) / r.height))
          const v = Math.abs(x - 0.5) < iman
          const h = Math.abs(y - 0.5) < (8 / r.height)
          if (v) x = 0.5
          if (h) y = 0.5
          setGuia({ v, h })
          cambiar({ x, y })
        },
        () => setGuia({ v: false, h: false })
      )
      return
    }
    setElegido(false)
    if (p.origen === 'cuadro' || !imagen) return
    // Lo que sobra de la imagen a cada lado (en píxeles de la vista), para encuadrarla.
    const r = lienzo.current.getBoundingClientRect()
    const esc = Math.max(ancho / imagen.naturalWidth, alto / imagen.naturalHeight)
    const sobraX = ((imagen.naturalWidth * esc - ancho) * r.width) / ancho
    const sobraY = ((imagen.naturalHeight * esc - alto) * r.height) / alto
    const inicio = { cx: p.cx ?? 0.5, cy: p.cy ?? 0.5 }
    const x0 = e.clientX
    const y0 = e.clientY
    arrastrar(e, (ev) =>
      cambiar({
        cx: sobraX > 1 ? Math.min(1, Math.max(0, inicio.cx - (ev.clientX - x0) / sobraX)) : inicio.cx,
        cy: sobraY > 1 ? Math.min(1, Math.max(0, inicio.cy - (ev.clientY - y0) / sobraY)) : inicio.cy
      })
    )
  }

  /** Las esquinas agrandan la letra (y su caja, si tiene ancho propio). */
  function escalar(e: React.PointerEvent) {
    if (!caja) return
    const c = caja
    const pt = enVideo(e.clientX, e.clientY)
    const d0 = Math.max(4, Math.hypot(pt.x - c.cx, pt.y - c.cy))
    const tam0 = p.tamano ?? 0.07
    const ancho0 = p.ancho
    arrastrar(e, (ev) => {
      const q = enVideo(ev.clientX, ev.clientY)
      const f = Math.hypot(q.x - c.cx, q.y - c.cy) / d0
      const tamano = Math.min(0.4, Math.max(0.02, tam0 * f))
      const real = tamano / tam0
      cambiar({ tamano, ...(ancho0 !== undefined ? { ancho: Math.min(1, Math.max(0.1, ancho0 * real)) } : {}) })
    })
  }

  /** Los lados cambian el ancho de la caja: hasta dónde llega una línea antes de partirse. */
  function ensanchar(e: React.PointerEvent) {
    if (!caja) return
    const c = caja
    arrastrar(e, (ev) => {
      const q = enVideo(ev.clientX, ev.clientY)
      const l = enCaja(q.x, q.y, c)
      cambiar({ ancho: Math.min(1, Math.max(0.1, (Math.abs(l.x) * 2) / ancho)) })
    })
  }

  /** El tirador de arriba lo gira; cerca de 0, 45, 90… se queda derecho. */
  function girar(e: React.PointerEvent) {
    if (!caja || !lienzo.current) return
    const c = caja
    const r = lienzo.current.getBoundingClientRect()
    const centro = { x: r.left + (c.cx / ancho) * r.width, y: r.top + (c.cy / alto) * r.height }
    arrastrar(e, (ev) => {
      let g = (Math.atan2(ev.clientY - centro.y, ev.clientX - centro.x) * 180) / Math.PI + 90
      if (g > 180) g -= 360
      const cerca = Math.round(g / 45) * 45
      if (Math.abs(g - cerca) < 4) g = cerca
      cambiar({ giro: Math.round(g * 10) / 10 })
    })
  }

  /** La tira: arrastrar elige el momento; mientras, se ve el cuadro pequeño más cercano y al soltar, el exacto. */
  function arrastrarTira(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    const enT = (clientX: number) => Math.min(ultimo, Math.max(0, ((clientX - r.left) / r.width) * total))
    const cerca = (t: number) => tira.reduce<{ t: number; archivo: string } | null>((m, c) => (!m || Math.abs(c.t - t) < Math.abs(m.t - t) ? c : m), null)
    let t = enT(e.clientX)
    const ver = () => {
      const c = cerca(t)
      setRapido(c ? urlDe(c.archivo) : null)
      cambiar({ origen: 'cuadro', t: Math.round(t * fps) / fps })
    }
    ver()
    arrastrar(
      e,
      (ev) => {
        t = enT(ev.clientX)
        ver()
      },
      () => {
        cambiar({ origen: 'cuadro', t: Math.round(t * fps) / fps })
        setRapido(null)
      }
    )
  }

  async function subirImagen() {
    setError('')
    const r = await window.recorte.portadaImportar(proyectoId)
    if (r.ok && r.archivo) {
      setNombreFoto(r.nombre ?? '')
      cambiar({ origen: 'archivo', foto: r.archivo, cx: 0.5, cy: 0.5 })
    } else if (r.error) setError(r.error)
  }

  async function guardar() {
    if (!imagen || rapido) return
    setEditando(false)
    setGuardando(true)
    setError('')
    try {
      // Se compone aparte, completa y a la medida del video, aunque la vista esté a medio escribir.
      const c = document.createElement('canvas')
      c.width = ancho
      c.height = alto
      await document.fonts.load(fuenteCss).catch(() => undefined)
      pintarPortada(c, imagen, p, ancho, alto, false)
      const r = await window.recorte.portadaGuardar(proyectoId, c.toDataURL('image/png'))
      if (!r.ok || !r.archivo) throw new Error(r.error ?? 'No pude guardar la portada.')
      historial.aplicar(ponerPortada(timeline, { ...p, texto: (p.texto ?? '').trim() ? p.texto : undefined, archivo: r.archivo }))
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  const elegirModo = (m: Modo) => {
    setModo(m)
    if (m === 'cuadro') cambiar({ origen: 'cuadro', t: p.t ?? Math.min(tiempo, ultimo) })
    else if (m === 'imagen' && fotos.length) cambiar({ origen: 'imagen', fuente: p.fuente ?? fotos[0].id })
    else if (m === 'archivo' && p.foto) cambiar({ origen: 'archivo' })
  }

  /** Pone un título nuevo en el centro (o elige el que hay) y entra a escribirlo. */
  function anadirTitulo() {
    if (!hayTexto) cambiar({ texto: 'Tu título', x: 0.5, y: 0.5 })
    setElegido(true)
    setEditando(true)
  }

  const vertical = alto > ancho

  if (paso === 'elegir') {
    return (
      <div className="portada-fondo" role="dialog" aria-modal="true" aria-labelledby="portada-titulo" onMouseDown={(e) => e.target === e.currentTarget && (desdeDiseno ? setPaso('disenar') : onCerrar())}>
        <div className="pe-caja">
          <div className="pe-cabeza">
            <b id="portada-titulo">Elegir la imagen de la portada</b>
            <button className="tl-boton" onClick={() => (desdeDiseno ? setPaso('disenar') : onCerrar())} aria-label="Cerrar" title="Cerrar">
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className={`pe-vista ${vertical ? 'es-vertical' : ''}`}>
            {modo === 'archivo' && !p.foto ? (
              <button className="pe-subir" onClick={() => void subirImagen()} style={{ aspectRatio: `${ancho} / ${alto}` }}>
                <span className="pe-mas">
                  <Icon name="plus" size={20} />
                </span>
                <b>Elige una imagen de tu equipo</b>
                <small>PNG, JPG o WebP · mejor con la forma del video ({vertical ? '9:16' : ancho === alto ? '1:1' : '16:9'})</small>
              </button>
            ) : (
              <div className="portada-marco">
                <canvas ref={lienzo} width={ancho} height={alto} />
                {((cargando && !rapido) || !imagen) && <span className="portada-cargando">{modo === 'imagen' && !p.fuente ? 'Elige una foto' : 'Sacando el cuadro…'}</span>}
              </div>
            )}
          </div>
          <div className="pe-modos" role="tablist">
            <button role="tab" aria-selected={modo === 'cuadro'} className={modo === 'cuadro' ? 'is-on' : ''} onClick={() => elegirModo('cuadro')}>
              Del video
            </button>
            <button role="tab" aria-selected={modo === 'archivo'} className={modo === 'archivo' ? 'is-on' : ''} onClick={() => elegirModo('archivo')}>
              Subir imagen
            </button>
            {fotos.length > 0 && (
              <button role="tab" aria-selected={modo === 'imagen'} className={modo === 'imagen' ? 'is-on' : ''} onClick={() => elegirModo('imagen')}>
                De la biblioteca
              </button>
            )}
          </div>
          <div className="pe-abajo">
            {modo === 'cuadro' && (
              <div className="portada-tira" onPointerDown={arrastrarTira} title="Arrastra para elegir el momento">
                <div className="portada-tira-cuadros">
                  {tira.length ? tira.map((c) => <img key={c.archivo} src={urlDe(c.archivo)} alt="" draggable={false} />) : <span className="tl-dim">Preparando los cuadros…</span>}
                </div>
                <span className="portada-tira-marca" style={{ left: `${((p.t ?? 0) / total) * 100}%` }}>
                  <i>{tcCuadros(p.t ?? 0, fps)}</i>
                </span>
              </div>
            )}
            {modo === 'archivo' && p.foto && (
              <div className="pe-archivo">
                <span className="tl-dim">{nombreFoto || 'Imagen elegida'}</span>
                <button className="btn small ghost" onClick={() => void subirImagen()}>
                  Elegir otra…
                </button>
              </div>
            )}
            {modo === 'imagen' && (
              <div className="portada-fotos">
                {fotos.map((m) => (
                  <button key={m.id} className={p.fuente === m.id && p.origen === 'imagen' ? 'is-on' : ''} title={m.nombre} onClick={() => cambiar({ origen: 'imagen', fuente: m.id, cx: 0.5, cy: 0.5 })}>
                    <img src={miniaturaDe?.(m.id) ?? urlDe(`medio/${m.id}`)} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {error && <p className="portada-error pe-error">{error}</p>}
          <div className="pe-pie">
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={() => (desdeDiseno ? setPaso('disenar') : onCerrar())}>
              Cancelar
            </button>
            <button
              className="btn small primary"
              disabled={!imagen || Boolean(rapido) || sinElegir}
              onClick={() => {
                setPaso('disenar')
                setDesdeDiseno(true)
              }}
            >
              {desdeDiseno ? 'Usar esta imagen' : 'Editar portada'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const letra = FUENTES_TEXTO[p.letra ?? 'titular'] ?? FUENTES_TEXTO.normal
  const tam = Math.round((p.tamano ?? 0.07) * alto)
  const margenTexto = tam * 0.28
  const alinear = p.alinear ?? 'centro'
  const pct = (v: number, de: number) => `${(v / de) * 100}%`
  const ponerTam = (px: number) => cambiar({ tamano: Math.min(0.4, Math.max(0.02, px / alto)) })
  const SIGUIENTE: Record<string, 'izquierda' | 'centro' | 'derecha'> = { izquierda: 'centro', centro: 'derecha', derecha: 'izquierda' }
  const ICONO_ALINEAR: Record<string, IconName> = { izquierda: 'alinear-izq', centro: 'alinear-centro', derecha: 'alinear-der' }
  /** Pone el título contra un borde (o al medio) de la portada, dentro del margen seguro. */
  const aPagina = (lado: 'arriba' | 'medio' | 'abajo' | 'izq' | 'centro' | 'der') => {
    if (!caja) return
    const mx = (caja.w / 2) / ancho + 0.06
    const my = (caja.h / 2) / alto + 0.06
    if (lado === 'arriba') cambiar({ y: my })
    if (lado === 'medio') cambiar({ y: 0.5 })
    if (lado === 'abajo') cambiar({ y: 1 - my })
    if (lado === 'izq') cambiar({ x: mx })
    if (lado === 'centro') cambiar({ x: 0.5 })
    if (lado === 'der') cambiar({ x: 1 - mx })
  }

  return (
    <div className="pd-fondo" role="dialog" aria-modal="true" aria-labelledby="portada-titulo">
      <div className="pd-cabeza">
        <b id="portada-titulo">Portada</b>
        <span className="tl-dim">Lo que se ve del video antes de darle a reproducir.</span>
      </div>

      <div className="pd-cuerpo">
        <aside className="pd-panel" aria-label="Texto e imagen">
          <span className="pd-titulo">Texto</span>
          <button className="pd-anadir" onClick={anadirTitulo} style={{ fontFamily: `"${FUENTES_TEXTO.titular.familia}", Arial` }}>
            {hayTexto ? 'Editar el título' : 'Añadir un título'}
          </button>
          <span className="pd-sub">Estilos</span>
          <div className="pd-estilos">
            {ESTILOS.map((s) => {
              const l = FUENTES_TEXTO[s.cambio.letra ?? 'titular']
              const activo = hayTexto && p.letra === s.cambio.letra && p.color === s.cambio.color && (p.caja ?? '') === (s.cambio.caja ?? '')
              return (
                <button
                  key={s.id}
                  title={s.nombre}
                  aria-label={`Estilo ${s.nombre}`}
                  className={activo ? 'is-on' : ''}
                  onClick={() => {
                    cambiar({ ...s.cambio, caja: s.cambio.caja, contorno: s.cambio.contorno, negrita: undefined, cursiva: undefined, ...(hayTexto ? {} : { texto: 'Tu título', x: 0.5, y: 0.5 }) })
                    setElegido(true)
                  }}
                >
                  <span
                    style={{
                      fontFamily: `"${l.familia}", Arial`,
                      fontWeight: l.negrita ? 700 : 400,
                      fontStyle: l.cursiva ? 'italic' : 'normal',
                      color: s.cambio.color,
                      background: s.cambio.caja ?? 'transparent',
                      WebkitTextStroke: s.cambio.contorno ? `1px ${s.cambio.contorno}` : undefined,
                      paintOrder: 'stroke fill',
                      padding: s.cambio.caja ? '1px 7px' : undefined,
                      borderRadius: 4
                    }}
                  >
                    Título
                  </span>
                </button>
              )
            })}
          </div>

          <span className="pd-titulo">Imagen</span>
          <button className="pd-imagen" onClick={() => setPaso('elegir')} title="Elegir otro momento del video u otra imagen">
            {fondo && <img src={fondo} alt="" draggable={false} />}
            <span>
              <b>Cambiar la imagen</b>
              <small>{p.origen === 'cuadro' ? `Cuadro en ${tcCuadros(p.t ?? 0, fps)}` : p.origen === 'archivo' ? 'Imagen subida · arrástrala para encuadrarla' : 'Foto de la biblioteca · arrástrala para encuadrarla'}</small>
            </span>
          </button>
        </aside>

        <div className="pd-escenario" onPointerDown={(e) => e.target === e.currentTarget && setElegido(false)}>
          {elegido && hayTexto && (
            <div className="pd-barra" role="toolbar" aria-label="Formato del título">
              <Desplegable
                titulo="Letra"
                className="pd-letra"
                ancho={264}
                boton={
                  <>
                    <span style={{ fontFamily: `"${letra.familia}", Arial`, fontWeight: letra.negrita ? 700 : 400, fontStyle: letra.cursiva ? 'italic' : 'normal' }}>{letra.nombre}</span>
                    <Icon name="chevron" size={12} />
                  </>
                }
              >
                {(cerrar) => (
                  <ListaLetras
                    valor={p.letra ?? 'titular'}
                    onCambio={(l) => {
                      cambiar({ letra: l, negrita: undefined, cursiva: undefined })
                      cerrar()
                    }}
                  />
                )}
              </Desplegable>
              <div className="pd-tam" title="Tamaño (píxeles del video)">
                <button className="pt-boton" aria-label="Más pequeño" onClick={() => ponerTam(tam - 4)}>
                  <Icon name="menos" size={13} />
                </button>
                <input
                  aria-label="Tamaño"
                  value={tam}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n > 0) ponerTam(n)
                  }}
                />
                <button className="pt-boton" aria-label="Más grande" onClick={() => ponerTam(tam + 4)}>
                  <Icon name="plus" size={13} />
                </button>
              </div>
              <span className="pd-sep" />
              <button className={`pt-boton ${(p.negrita ?? letra.negrita) ? 'is-on' : ''}`} title="Negrita" aria-label="Negrita" aria-pressed={p.negrita ?? letra.negrita} onClick={() => cambiar({ negrita: !(p.negrita ?? letra.negrita) })}>
                <Icon name="negrita" size={15} />
              </button>
              <button className={`pt-boton ${(p.cursiva ?? letra.cursiva) ? 'is-on' : ''}`} title="Cursiva" aria-label="Cursiva" aria-pressed={Boolean(p.cursiva ?? letra.cursiva)} onClick={() => cambiar({ cursiva: !(p.cursiva ?? letra.cursiva) })}>
                <Icon name="cursiva" size={15} />
              </button>
              <button className={`pt-boton ${p.mayusculas ? 'is-on' : ''}`} title="Todo en mayúsculas" aria-label="Todo en mayúsculas" aria-pressed={Boolean(p.mayusculas)} onClick={() => cambiar({ mayusculas: !p.mayusculas })}>
                <Icon name="mayusculas" size={16} />
              </button>
              <Desplegable titulo="Color de la letra" ancho={252} boton={<span className="pd-color" style={{ background: p.color ?? '#ffffff' }} />}>
                {() => <SelectorColor valor={p.color ?? '#ffffff'} onCambio={(c) => cambiar({ color: c })} deFoto={deFoto} />}
              </Desplegable>
              <button className="pt-boton" title="Alinear las líneas" aria-label={`Alinear las líneas (ahora: ${alinear})`} onClick={() => cambiar({ alinear: SIGUIENTE[alinear] === 'centro' ? undefined : SIGUIENTE[alinear] })}>
                <Icon name={ICONO_ALINEAR[alinear]} size={15} />
              </button>
              <span className="pd-sep" />
              <Desplegable titulo="Contorno y caja" activo={Boolean(p.contorno || p.caja)} ancho={252} boton={<Icon name="efectos" size={15} />}>
                {() => (
                  <div className="pd-efectos">
                    <EfectoColor nombre="Contorno" valor={p.contorno} porDefecto="#000000" deFoto={deFoto} onCambio={(c) => cambiar({ contorno: c })} />
                    <EfectoColor nombre="Caja detrás" valor={p.caja} porDefecto="#111111" deFoto={deFoto} onCambio={(c) => cambiar({ caja: c })} />
                  </div>
                )}
              </Desplegable>
              <Desplegable titulo="Posición" ancho={220} boton={<Icon name="mover" size={15} />}>
                {() => (
                  <div className="pd-posicion">
                    <span className="pt-sub">En la portada</span>
                    <div className="pd-posicion-rejilla">
                      {(
                        [
                          ['arriba', 'Arriba', 'pagina-arriba'],
                          ['izq', 'Izquierda', 'pagina-izq'],
                          ['medio', 'Al medio', 'pagina-medio'],
                          ['centro', 'Al centro', 'pagina-centro'],
                          ['abajo', 'Abajo', 'pagina-abajo'],
                          ['der', 'Derecha', 'pagina-der']
                        ] as const
                      ).map(([lado, nombre, icono]) => (
                        <button key={lado} onClick={() => aPagina(lado)}>
                          <Icon name={icono} size={14} /> {nombre}
                        </button>
                      ))}
                    </div>
                    <span className="pt-sub">Giro</span>
                    <div className="pd-giro">
                      <input aria-label="Giro en grados" value={Math.round((p.giro ?? 0) * 10) / 10} onChange={(e) => Number.isFinite(Number(e.target.value)) && cambiar({ giro: Math.max(-180, Math.min(180, Number(e.target.value))) })} />°
                      <button className="btn small ghost" onClick={() => cambiar({ giro: undefined })} disabled={!p.giro}>
                        Enderezar
                      </button>
                    </div>
                  </div>
                )}
              </Desplegable>
              <button
                className="pt-boton"
                title="Borrar el título (Supr)"
                aria-label="Borrar el título"
                onClick={() => {
                  cambiar({ texto: '' })
                  setElegido(false)
                  setEditando(false)
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          )}

          <div className={`pd-marco ${vertical ? 'es-vertical' : ''}`}>
            <canvas ref={lienzo} width={ancho} height={alto} />
            <div className={`pd-capa ${p.origen !== 'cuadro' ? 'se-encuadra' : ''}`} onPointerDown={tocarVista} onDoubleClick={() => elegido && setEditando(true)}>
              {guia.v && <span className="pd-guia v" />}
              {guia.h && <span className="pd-guia h" />}
              {elegido && hayTexto && caja && !editando && (
                <div
                  className="pd-sel"
                  style={{ left: pct(caja.cx - caja.w / 2, ancho), top: pct(caja.cy - caja.h / 2, alto), width: pct(caja.w, ancho), height: pct(caja.h, alto), transform: `rotate(${caja.giro}deg)` }}
                >
                  <span className="pd-tir esquina nw" onPointerDown={escalar} />
                  <span className="pd-tir esquina ne" onPointerDown={escalar} />
                  <span className="pd-tir esquina sw" onPointerDown={escalar} />
                  <span className="pd-tir esquina se" onPointerDown={escalar} />
                  <span className="pd-tir lado w" onPointerDown={ensanchar} />
                  <span className="pd-tir lado e" onPointerDown={ensanchar} />
                  <span className="pd-girar" onPointerDown={girar} title="Girar">
                    <Icon name="girar" size={12} />
                  </span>
                </div>
              )}
              {editando && caja && (
                <EscribirTitulo
                  p={p}
                  caja={caja}
                  ancho={ancho}
                  alto={alto}
                  escala={escala}
                  margen={margenTexto}
                  onCambio={(texto) => cambiar({ texto })}
                  onTerminar={() => {
                    setEditando(false)
                    if (!(p.texto ?? '').trim()) setElegido(false)
                  }}
                />
              )}
            </div>
            {((cargando && !rapido) || !imagen) && <span className="portada-cargando">Sacando el cuadro…</span>}
          </div>
          {!hayTexto && (
            <p className="pd-pista tl-dim">
              Toca <b>Añadir un título</b> o un estilo. Luego arrástralo, agrándalo desde las esquinas y haz doble clic para escribir.
            </p>
          )}
        </div>
      </div>

      <div className="pd-pie">
        <label className="portada-inicio">
          <input type="checkbox" checked={Boolean(p.alInicio)} onChange={(e) => cambiar({ alInicio: e.target.checked })} />
          <span>
            También en el primer cuadro del video
            <small>Instagram, TikTok y WhatsApp toman ese de miniatura. Dura un solo cuadro.</small>
          </span>
        </label>
        {error && <p className="portada-error">{error}</p>}
        <span className="tl-flex" />
        {timeline.portada && (
          <button
            className="btn small ghost"
            onClick={() => {
              historial.aplicar(ponerPortada(timeline, null))
              onCerrar()
            }}
          >
            Quitar la portada
          </button>
        )}
        <button className="btn small ghost" onClick={salir}>
          Cancelar
        </button>
        <button className="btn small primary" disabled={!imagen || guardando || Boolean(rapido) || cargando} onClick={() => void guardar()}>
          {guardando ? 'Guardando…' : 'Guardar portada'}
        </button>
      </div>

      {preguntarSalir && (
        <div className="pd-preguntar" role="alertdialog" aria-modal="true" aria-labelledby="pd-salir-titulo" onMouseDown={(e) => e.target === e.currentTarget && setPreguntarSalir(false)}>
          <div className="pd-preguntar-caja">
            <b id="pd-salir-titulo">¿Salir sin guardar?</b>
            <span className="tl-dim">Los cambios de la portada se pierden.</span>
            <div className="pd-preguntar-botones">
              <button className="btn small ghost" autoFocus onClick={() => setPreguntarSalir(false)}>
                Seguir editando
              </button>
              <button className="btn small peligro" onClick={onCerrar}>
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Un efecto de color que se pone o se quita (contorno, caja), con su selector. */
function EfectoColor({ nombre, valor, porDefecto, deFoto, onCambio }: { nombre: string; valor?: string; porDefecto: string; deFoto: string[]; onCambio: (c: string | undefined) => void }) {
  return (
    <div className="pd-efecto">
      <div className="pd-efecto-cabeza">
        <span>{nombre}</span>
        <button className="pt-boton" title={valor ? `Quitar ${nombre.toLowerCase()}` : `Poner ${nombre.toLowerCase()}`} aria-label={valor ? `Quitar ${nombre.toLowerCase()}` : `Poner ${nombre.toLowerCase()}`} onClick={() => onCambio(valor ? undefined : porDefecto)}>
          <Icon name={valor ? 'menos' : 'plus'} size={13} />
        </button>
      </div>
      {valor && <SelectorColor valor={valor} onCambio={onCambio} deFoto={deFoto} />}
    </div>
  )
}

/** Escribir el título encima de la vista, con su letra, su tamaño y su giro. */
function EscribirTitulo({
  p,
  caja,
  ancho,
  alto,
  escala,
  margen,
  onCambio,
  onTerminar
}: {
  p: PortadaTL
  caja: Caja
  ancho: number
  alto: number
  escala: number
  margen: number
  onCambio: (texto: string) => void
  onTerminar: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const l = FUENTES_TEXTO[p.letra ?? 'titular'] ?? FUENTES_TEXTO.normal
  const tam = (p.tamano ?? 0.07) * alto
  const w = p.ancho !== undefined ? p.ancho * ancho : ancho * 0.88 + margen * 2
  useLayoutEffect(() => {
    const t = ref.current
    if (!t) return
    t.style.height = '0px'
    t.style.height = `${t.scrollHeight}px`
  }, [p.texto, tam, escala, w])
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <textarea
      ref={ref}
      className="pd-escribir"
      value={p.texto ?? ''}
      spellCheck={false}
      aria-label="Título de la portada"
      onChange={(e) => onCambio(e.target.value)}
      onBlur={onTerminar}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault()
          onTerminar()
        }
      }}
      style={{
        left: `${(caja.cx / ancho) * 100}%`,
        top: `${(caja.cy / alto) * 100}%`,
        width: `${(w / ancho) * 100}%`,
        transform: `translate(-50%, -50%) rotate(${caja.giro}deg)`,
        padding: `0 ${margen * escala}px`,
        fontFamily: `"${l.familia}", Arial, sans-serif`,
        fontWeight: (p.negrita ?? l.negrita) ? 700 : 400,
        fontStyle: (p.cursiva ?? l.cursiva) ? 'italic' : 'normal',
        fontSize: `${tam * escala}px`,
        lineHeight: 1.18,
        color: p.color ?? '#ffffff',
        textAlign: p.alinear === 'izquierda' ? 'left' : p.alinear === 'derecha' ? 'right' : 'center',
        textTransform: p.mayusculas ? 'uppercase' : 'none',
        WebkitTextStroke: p.contorno ? `${Math.max(1, tam * 0.08 * escala)}px ${p.contorno}` : undefined,
        paintOrder: 'stroke fill',
        background: p.caja ? `${p.caja}cc` : 'rgba(0, 0, 0, 0.25)'
      }}
    />
  )
}

/** Una imagen cargada (con permiso para leer sus píxeles al guardar); se queda la anterior mientras llega la nueva. */
function useImagen(url: string | null, onError: (e: string) => void): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) {
      setImg(null)
      return
    }
    let vivo = true
    const nueva = new Image()
    nueva.crossOrigin = 'anonymous'
    nueva.onload = () => vivo && setImg(nueva)
    nueva.onerror = () => vivo && onError('No pude cargar la imagen.')
    nueva.src = url
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])
  return img
}

/**
 * Pinta la portada: el fondo cubriendo el cuadro (con su encuadre) y el título, con su caja o su contorno, alineado y
 * girado. Devuelve el recuadro del título (en píxeles del video), para tocarlo en la vista; `sinTexto` deja solo el fondo.
 */
export function pintarPortada(c: HTMLCanvasElement, img: HTMLImageElement | null, p: PortadaTL, ancho: number, alto: number, sinTexto = false): Caja | null {
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ancho, alto)
  if (img && img.naturalWidth) {
    const escala = Math.max(ancho / img.naturalWidth, alto / img.naturalHeight)
    const w = img.naturalWidth * escala
    const h = img.naturalHeight * escala
    ctx.drawImage(img, (ancho - w) * (p.cx ?? 0.5), (alto - h) * (p.cy ?? 0.5), w, h)
  }
  let texto = (p.texto ?? '').trim()
  if (!texto) return null
  if (p.mayusculas) texto = texto.toLocaleUpperCase('es')
  const tam = Math.round((p.tamano ?? 0.07) * alto)
  const margen = tam * 0.28
  ctx.font = fuenteDe(p, alto)
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // Las líneas que escribió y, si alguna no cabe en el ancho de su caja, partida por palabras.
  const limite = p.ancho !== undefined ? Math.max(10, p.ancho * ancho - margen * 2) : ancho * 0.88
  const lineas: string[] = []
  for (const parrafo of texto.split(/\n/)) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && ctx.measureText(prueba).width > limite) {
        lineas.push(actual)
        actual = palabra
      } else actual = prueba
    }
    lineas.push(actual)
  }
  const anchos = lineas.map((l) => ctx.measureText(l).width)
  const interior = p.ancho !== undefined ? limite : Math.max(...anchos)
  const alto1 = tam * 1.18
  const h = alto1 * lineas.length
  const cx = (p.x ?? 0.5) * ancho
  const cy = (p.y ?? 0.8) * alto
  const giro = p.giro ?? 0
  const alinear = p.alinear ?? 'centro'
  const xDe = (i: number) => (alinear === 'izquierda' ? -interior / 2 : alinear === 'derecha' ? interior / 2 - anchos[i] : -anchos[i] / 2)
  if (!sinTexto) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((giro * Math.PI) / 180)
    ctx.textAlign = 'left'
    if (p.caja) {
      ctx.fillStyle = p.caja
      lineas.forEach((_, i) => redondeado(ctx, xDe(i) - margen, -h / 2 + i * alto1, anchos[i] + margen * 2, alto1, tam * 0.16))
    }
    lineas.forEach((l, i) => {
      const y = -h / 2 + (i + 0.5) * alto1
      if (p.contorno) {
        ctx.strokeStyle = p.contorno
        ctx.lineWidth = Math.max(2, tam * 0.16)
        ctx.strokeText(l, xDe(i), y)
      }
      ctx.fillStyle = p.color ?? '#ffffff'
      ctx.fillText(l, xDe(i), y)
    })
    ctx.restore()
  }
  return { cx, cy, w: interior + margen * 2, h, giro }
}

function redondeado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
  ctx.fill()
}
