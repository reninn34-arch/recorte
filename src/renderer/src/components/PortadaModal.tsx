import { useEffect, useMemo, useRef, useState } from 'react'
import { duracionTimeline, FUENTES_TEXTO, ponerPortada, type PortadaTL, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'
import { ValorArrastrable } from './ValorArrastrable'
import { tcCuadros } from './TimelineEditor'

/** Los estilos de título listos (como los de CapCut): se tocan y se aplican; luego se puede cambiar cada cosa. */
const ESTILOS: { id: string; nombre: string; cambio: Partial<PortadaTL> }[] = [
  { id: 'clasico', nombre: 'Clásico', cambio: { letra: 'titular', color: '#ffffff', contorno: '#000000', caja: undefined } },
  { id: 'amarillo', nombre: 'Amarillo', cambio: { letra: 'impacto', color: '#ffe11a', contorno: '#000000', caja: undefined } },
  { id: 'caja-negra', nombre: 'Caja negra', cambio: { letra: 'negra', color: '#ffffff', contorno: undefined, caja: '#111111' } },
  { id: 'caja-roja', nombre: 'Caja roja', cambio: { letra: 'gruesa', color: '#ffffff', contorno: undefined, caja: '#e3262e' } },
  { id: 'caja-blanca', nombre: 'Caja blanca', cambio: { letra: 'negra', color: '#111111', contorno: undefined, caja: '#ffffff' } },
  { id: 'elegante', nombre: 'Elegante', cambio: { letra: 'elegante', color: '#ffffff', contorno: undefined, caja: undefined } }
]

type Modo = 'cuadro' | 'archivo' | 'imagen'

/**
 * La portada del video, como en CapCut: un cuadro del video (elegido en su tira de cuadros), una imagen de una carpeta
 * del usuario o una foto de la biblioteca, con un título que se arrastra encima. Se compone aquí, a la medida del
 * video, y se guarda en el proyecto: al exportar va pegada al MP4 como su miniatura y, si se elige, en su primer cuadro.
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
  const inicial: PortadaTL = timeline.portada ?? { origen: 'cuadro', t: Math.min(tiempo, ultimo), alInicio: true }
  const [p, setP] = useState<PortadaTL>({ letra: 'titular', tamano: 0.07, color: '#ffffff', contorno: '#000000', x: 0.5, y: 0.8, ...inicial })
  const [modo, setModo] = useState<Modo>(inicial.origen)
  const [fondo, setFondo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [tira, setTira] = useState<{ t: number; archivo: string }[]>([])
  /** Mientras se arrastra en la tira: el cuadro pequeño más cercano, para verlo al momento. */
  const [rapido, setRapido] = useState<string | null>(null)
  const [nombreFoto, setNombreFoto] = useState('')
  const lienzo = useRef<HTMLCanvasElement>(null)
  const caja = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const fotos = medios.filter((m) => m.tipo === 'imagen')
  const cambiar = (cambio: Partial<PortadaTL>) => setP((x) => ({ ...x, ...cambio }))

  // La tira de cuadros, una vez.
  useEffect(() => {
    let vivo = true
    void window.recorte
      .portadaTira(proyectoId, timeline, 14)
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
  const sinElegir = (modo === 'archivo' && p.origen !== 'archivo') || (modo === 'imagen' && p.origen !== 'imagen')
  const imagen = useImagen(sinElegir ? null : (rapido ?? fondo), setError)
  const letra = FUENTES_TEXTO[p.letra ?? 'titular'] ?? FUENTES_TEXTO.normal
  const fuenteCss = useMemo(
    () => `${letra.cursiva ? 'italic ' : ''}${letra.negrita ? 700 : 400} ${Math.round((p.tamano ?? 0.07) * alto)}px "${letra.familia}", Arial, sans-serif`,
    [letra, p.tamano, alto]
  )

  // Pinta la portada a la medida del video (la vista la muestra reducida, con su forma).
  useEffect(() => {
    let vivo = true
    void document.fonts
      .load(fuenteCss)
      .catch(() => undefined)
      .then(() => {
        if (vivo && lienzo.current) caja.current = pintarPortada(lienzo.current, imagen, p, fuenteCss, ancho, alto)
      })
    return () => {
      vivo = false
    }
  }, [imagen, p, fuenteCss, ancho, alto])

  /** Arrastrar en la vista: el título se mueve; fuera de él, una imagen se encuadra. */
  function arrastrarVista(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 || !lienzo.current) return
    const r = lienzo.current.getBoundingClientRect()
    const fx = (e.clientX - r.left) / r.width
    const fy = (e.clientY - r.top) / r.height
    const c = caja.current
    const sobreTexto = c && fx * ancho >= c.x - 12 && fx * ancho <= c.x + c.w + 12 && fy * alto >= c.y - 12 && fy * alto <= c.y + c.h + 12
    const moverImagen = !sobreTexto && p.origen !== 'cuadro' && imagen
    if (!sobreTexto && !moverImagen) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    const y0 = e.clientY
    const inicio = { x: p.x ?? 0.5, y: p.y ?? 0.8, cx: p.cx ?? 0.5, cy: p.cy ?? 0.5 }
    // Lo que sobra de la imagen a cada lado (en píxeles de la vista), para encuadrarla.
    const escala = imagen ? Math.max(ancho / imagen.naturalWidth, alto / imagen.naturalHeight) : 1
    const sobraX = imagen ? ((imagen.naturalWidth * escala - ancho) * r.width) / ancho : 0
    const sobraY = imagen ? ((imagen.naturalHeight * escala - alto) * r.height) / alto : 0
    const mover = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      const dy = ev.clientY - y0
      if (sobreTexto) cambiar({ x: Math.min(1, Math.max(0, inicio.x + dx / r.width)), y: Math.min(1, Math.max(0, inicio.y + dy / r.height)) })
      else
        cambiar({
          cx: sobraX > 1 ? Math.min(1, Math.max(0, inicio.cx - dx / sobraX)) : inicio.cx,
          cy: sobraY > 1 ? Math.min(1, Math.max(0, inicio.cy - dy / sobraY)) : inicio.cy
        })
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
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
    }
    ver()
    const mover = (ev: PointerEvent) => {
      t = enT(ev.clientX)
      ver()
      cambiar({ origen: 'cuadro', t: Math.round(t * fps) / fps })
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      cambiar({ origen: 'cuadro', t: Math.round(t * fps) / fps })
      setRapido(null)
    }
    cambiar({ origen: 'cuadro', t: Math.round(t * fps) / fps })
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
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
    if (!lienzo.current || !imagen || rapido) return
    setGuardando(true)
    setError('')
    try {
      const r = await window.recorte.portadaGuardar(proyectoId, lienzo.current.toDataURL('image/png'))
      if (!r.ok || !r.archivo) throw new Error(r.error ?? 'No pude guardar la portada.')
      historial.aplicar(ponerPortada(timeline, { ...p, archivo: r.archivo }))
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
  const vertical = alto > ancho

  return (
    <div className="portada-fondo" role="dialog" aria-modal="true" aria-labelledby="portada-titulo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="portada-caja">
        <div className="portada-cabeza">
          <b id="portada-titulo">Portada</b>
          <span className="tl-dim">Lo que se ve del video antes de darle a reproducir.</span>
          <button className="tl-boton" onClick={onCerrar} aria-label="Cerrar" title="Cerrar">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="portada-cuerpo">
          <div className="portada-izq">
            <div className="portada-modos" role="tablist">
              <button role="tab" aria-selected={modo === 'cuadro'} className={modo === 'cuadro' ? 'is-on' : ''} onClick={() => elegirModo('cuadro')}>
                <Icon name="film" size={14} /> Cuadro del video
              </button>
              <button role="tab" aria-selected={modo === 'archivo'} className={modo === 'archivo' ? 'is-on' : ''} onClick={() => elegirModo('archivo')}>
                <Icon name="download" size={14} /> Subir imagen
              </button>
              {fotos.length > 0 && (
                <button role="tab" aria-selected={modo === 'imagen'} className={modo === 'imagen' ? 'is-on' : ''} onClick={() => elegirModo('imagen')}>
                  <Icon name="image" size={14} /> De la biblioteca
                </button>
              )}
            </div>
            <div className={`portada-escenario ${vertical ? 'es-vertical' : ''}`}>
              <div className="portada-marco">
                <canvas ref={lienzo} width={ancho} height={alto} onPointerDown={arrastrarVista} className={p.origen !== 'cuadro' ? 'se-encuadra' : ''} />
                {((cargando && !rapido) || !imagen) && (
                  <span className="portada-cargando">
                    {modo === 'archivo' && !p.foto ? 'Sube una imagen' : modo === 'imagen' && !p.fuente ? 'Elige una foto' : 'Sacando el cuadro…'}
                  </span>
                )}
              </div>
            </div>
            {modo === 'cuadro' && (
              <div className="portada-tira-caja">
                <div className="portada-tira" onPointerDown={arrastrarTira} title="Arrastra para elegir el momento">
                  {tira.length ? (
                    tira.map((c) => <img key={c.archivo} src={urlDe(c.archivo)} alt="" draggable={false} />)
                  ) : (
                    <span className="tl-dim">Preparando los cuadros…</span>
                  )}
                  <span className="portada-tira-marca" style={{ left: `${((p.t ?? 0) / total) * 100}%` }} />
                </div>
                <div className="portada-tira-pie">
                  <span className="portada-tc">{tcCuadros(p.t ?? 0, fps)}</span>
                  <button className="btn small ghost" onClick={() => cambiar({ origen: 'cuadro', t: Math.min(tiempo, ultimo) })} title="El momento donde está el cabezal">
                    Usar el cabezal
                  </button>
                </div>
              </div>
            )}
            {modo === 'archivo' && (
              <div className="portada-subir">
                <button className="btn primary" onClick={() => void subirImagen()}>
                  <Icon name="download" size={14} /> {p.foto ? 'Elegir otra imagen…' : 'Elegir una imagen de mi equipo…'}
                </button>
                <span className="tl-dim">{p.foto ? `${nombreFoto || 'Imagen elegida'} · arrástrala en la vista para encuadrarla` : 'PNG, JPG o WebP, de cualquier carpeta.'}</span>
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

          <div className="portada-der">
            <span className="ed-seccion">Título</span>
            <textarea className="portada-texto" rows={2} value={p.texto ?? ''} placeholder="Escribe el título de la portada" onChange={(e) => cambiar({ texto: e.target.value })} />
            <div className="portada-estilos">
              {ESTILOS.map((s) => {
                const l = FUENTES_TEXTO[s.cambio.letra ?? 'titular']
                return (
                  <button
                    key={s.id}
                    title={s.nombre}
                    onClick={() => cambiar({ ...s.cambio, caja: s.cambio.caja, contorno: s.cambio.contorno })}
                    className={p.letra === s.cambio.letra && p.color === s.cambio.color && (p.caja ?? '') === (s.cambio.caja ?? '') ? 'is-on' : ''}
                  >
                    <span
                      style={{
                        fontFamily: `"${l.familia}", Arial`,
                        fontWeight: l.negrita ? 700 : 400,
                        fontStyle: l.cursiva ? 'italic' : 'normal',
                        color: s.cambio.color,
                        background: s.cambio.caja ?? 'transparent',
                        WebkitTextStroke: s.cambio.contorno ? `0.6px ${s.cambio.contorno}` : undefined,
                        padding: s.cambio.caja ? '0 5px' : undefined,
                        borderRadius: 3
                      }}
                    >
                      Aa
                    </span>
                    <small>{s.nombre}</small>
                  </button>
                )
              })}
            </div>
            <label className="ed-campo">
              <span>Letra</span>
              <select value={p.letra ?? 'titular'} onChange={(e) => cambiar({ letra: e.target.value })}>
                {Object.entries(FUENTES_TEXTO).map(([id, f]) => (
                  <option key={id} value={id}>
                    {f.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="tl-ajuste aj">
              <span>
                Tamaño
                <ValorArrastrable nombre="Tamaño del título" valor={p.tamano ?? 0.07} min={0.02} max={0.4} paso={0.005} formato={(v) => `${Math.round(v * 1000) / 10} %`} porDefecto={0.07} onCambio={(v) => cambiar({ tamano: v })} />
              </span>
            </div>
            <div className="portada-colores">
              <label title="Color de la letra">
                <input type="color" value={p.color ?? '#ffffff'} onChange={(e) => cambiar({ color: e.target.value })} /> Letra
              </label>
              <label title="Contorno de la letra">
                <input type="checkbox" checked={Boolean(p.contorno)} onChange={(e) => cambiar({ contorno: e.target.checked ? '#000000' : undefined })} />
                {p.contorno && <input type="color" value={p.contorno} onChange={(e) => cambiar({ contorno: e.target.value })} />} Contorno
              </label>
              <label title="Una caja de color detrás del título">
                <input type="checkbox" checked={Boolean(p.caja)} onChange={(e) => cambiar({ caja: e.target.checked ? '#111111' : undefined })} />
                {p.caja && <input type="color" value={p.caja} onChange={(e) => cambiar({ caja: e.target.value })} />} Caja
              </label>
            </div>
            <div className="portada-posicion">
              <span className="tl-dim">Arrastra el título en la vista para moverlo.</span>
              <button className="btn small ghost" onClick={() => cambiar({ x: 0.5 })}>
                Centrar
              </button>
            </div>

            <label className="portada-inicio">
              <input type="checkbox" checked={Boolean(p.alInicio)} onChange={(e) => cambiar({ alInicio: e.target.checked })} />
              <span>
                También en el primer cuadro del video
                <small>Instagram, TikTok y WhatsApp toman ese de miniatura. Dura un solo cuadro.</small>
              </span>
            </label>
            {error && <p className="portada-error">{error}</p>}
            <span className="tl-flex" />
            <div className="portada-botones">
              {timeline.portada && (
                <button
                  className="btn small ghost"
                  onClick={() => {
                    historial.aplicar(ponerPortada(timeline, null))
                    onCerrar()
                  }}
                >
                  Quitar
                </button>
              )}
              <span className="tl-flex" />
              <button className="btn small ghost" onClick={onCerrar}>
                Cancelar
              </button>
              <button className="btn small primary" disabled={!imagen || guardando || Boolean(rapido) || cargando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Guardar portada'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
 * Pinta la portada: el fondo cubriendo el cuadro (con su encuadre) y el título, con su caja o su contorno. Devuelve el
 * recuadro del título (en píxeles del video), para arrastrarlo.
 */
export function pintarPortada(
  c: HTMLCanvasElement,
  img: HTMLImageElement | null,
  p: PortadaTL,
  fuente: string,
  ancho: number,
  alto: number
): { x: number; y: number; w: number; h: number } | null {
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ancho, alto)
  if (img && img.naturalWidth) {
    const escala = Math.max(ancho / img.naturalWidth, alto / img.naturalHeight)
    const w = img.naturalWidth * escala
    const h = img.naturalHeight * escala
    ctx.drawImage(img, (ancho - w) * (p.cx ?? 0.5), (alto - h) * (p.cy ?? 0.5), w, h)
  }
  const texto = (p.texto ?? '').trim()
  if (!texto) return null
  const tam = Math.round((p.tamano ?? 0.07) * alto)
  ctx.font = fuente
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // Las líneas que escribió y, si alguna no cabe en el 88 % del ancho, partida por palabras.
  const lineas: string[] = []
  for (const parrafo of texto.split(/\n/)) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && ctx.measureText(prueba).width > ancho * 0.88) {
        lineas.push(actual)
        actual = palabra
      } else actual = prueba
    }
    lineas.push(actual)
  }
  const alto1 = tam * 1.18
  const cx = (p.x ?? 0.5) * ancho
  const y0 = (p.y ?? 0.8) * alto - ((lineas.length - 1) * alto1) / 2
  const anchos = lineas.map((l) => ctx.measureText(l).width)
  const margen = tam * 0.28
  if (p.caja) {
    ctx.fillStyle = p.caja
    lineas.forEach((_, i) => {
      const w = anchos[i] + margen * 2
      const y = y0 + i * alto1
      redondeado(ctx, cx - w / 2, y - alto1 / 2, w, alto1, tam * 0.16)
    })
  }
  lineas.forEach((l, i) => {
    const y = y0 + i * alto1
    if (p.contorno) {
      ctx.strokeStyle = p.contorno
      ctx.lineWidth = Math.max(2, tam * 0.16)
      ctx.strokeText(l, cx, y)
    }
    ctx.fillStyle = p.color ?? '#ffffff'
    ctx.fillText(l, cx, y)
  })
  const w = Math.max(...anchos) + margen * 2
  return { x: cx - w / 2, y: y0 - alto1 / 2, w, h: alto1 * lineas.length }
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
