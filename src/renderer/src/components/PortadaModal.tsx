import { useEffect, useMemo, useRef, useState } from 'react'
import { duracionTimeline, FUENTES_TEXTO, ponerPortada, type PortadaTL, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'
import { ValorArrastrable } from './ValorArrastrable'
import { tcCuadros } from './TimelineEditor'

/**
 * La portada del video, como en CapCut: un momento del video (con todo lo que hay encima) o una foto de la
 * biblioteca, con un título si se quiere. Se compone aquí, a la medida del video, y se guarda en el proyecto: al
 * exportar va pegada al MP4 como su miniatura y, si se elige, también en su primer cuadro.
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
  /** El cabezal, para «usar este momento». */
  tiempo: number
  medios: { id: string; nombre: string; tipo: 'video' | 'imagen' }[]
  urlDe: (archivo: string) => string
  miniaturaDe?: (fuente: string) => string | undefined
  onCerrar: () => void
}) {
  const total = Math.max(0.1, duracionTimeline(timeline))
  const inicial: PortadaTL = timeline.portada ?? { origen: 'cuadro', t: Math.min(tiempo, total - 1 / fps), alInicio: true }
  const [p, setP] = useState<PortadaTL>({ letra: 'titular', tamano: 0.09, color: '#ffffff', contorno: '#000000', y: 0.78, ...inicial })
  const [fondo, setFondo] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const lienzo = useRef<HTMLCanvasElement>(null)
  const fotos = medios.filter((m) => m.tipo === 'imagen')
  const cambiar = (cambio: Partial<PortadaTL>) => setP((x) => ({ ...x, ...cambio }))

  // El fondo: el cuadro de ese momento (lo pinta FFmpeg, con todo lo de encima) o la foto elegida.
  useEffect(() => {
    setError('')
    if (p.origen === 'imagen') {
      setFondo(p.fuente ? urlDe(`medio/${p.fuente}`) : null)
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
    }, 350)
    return () => {
      vivo = false
      clearTimeout(id)
    }
    // El cuadro solo cambia con el momento o la fuente (no con el título).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.origen, p.t, p.fuente, proyectoId])

  // La imagen del fondo, cargada (con permiso para leer sus píxeles al guardar).
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!fondo) {
      setImagen(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImagen(img)
    img.onerror = () => setError('No pude cargar la imagen.')
    img.src = fondo
  }, [fondo])

  const letra = FUENTES_TEXTO[p.letra ?? 'titular'] ?? FUENTES_TEXTO.normal
  const fuenteCss = useMemo(
    () => `${letra.cursiva ? 'italic ' : ''}${letra.negrita ? 700 : 400} ${Math.round((p.tamano ?? 0.09) * alto)}px "${letra.familia}", Arial, sans-serif`,
    [letra, p.tamano, alto]
  )

  // Pinta la portada a la medida del video (la vista la reduce).
  useEffect(() => {
    let vivo = true
    void document.fonts.load(fuenteCss).catch(() => undefined).then(() => {
      if (vivo && lienzo.current) pintarPortada(lienzo.current, imagen, p, fuenteCss, ancho, alto)
    })
    return () => {
      vivo = false
    }
  }, [imagen, p, fuenteCss, ancho, alto])

  async function guardar() {
    if (!lienzo.current || !imagen) return
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

  return (
    <div className="portada-fondo" role="dialog" aria-modal="true" aria-labelledby="portada-titulo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="portada-caja">
        <div className="portada-cabeza">
          <b id="portada-titulo">Portada</b>
          <span className="tl-dim">La miniatura del video, antes de darle a reproducir.</span>
          <button className="tl-boton" onClick={onCerrar} aria-label="Cerrar" title="Cerrar">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="portada-cuerpo">
          <div className="portada-vista" style={{ aspectRatio: `${ancho} / ${alto}` }}>
            <canvas ref={lienzo} width={ancho} height={alto} />
            {(cargando || !imagen) && <span className="portada-cargando">{p.origen === 'imagen' && !p.fuente ? 'Elige una foto' : 'Sacando el cuadro…'}</span>}
          </div>
          <div className="portada-ajustes">
            <div className="portada-pestanas" role="tablist">
              <button role="tab" aria-selected={p.origen === 'cuadro'} className={p.origen === 'cuadro' ? 'is-on' : ''} onClick={() => cambiar({ origen: 'cuadro', t: p.t ?? Math.min(tiempo, total) })}>
                Del video
              </button>
              <button role="tab" aria-selected={p.origen === 'imagen'} className={p.origen === 'imagen' ? 'is-on' : ''} onClick={() => cambiar({ origen: 'imagen', fuente: p.fuente ?? fotos[0]?.id })}>
                Una foto
              </button>
            </div>
            {p.origen === 'cuadro' ? (
              <div className="portada-momento">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, total - 1 / fps)}
                  step={1 / fps}
                  value={p.t ?? 0}
                  aria-label="Momento del video"
                  onChange={(e) => cambiar({ t: Number(e.target.value) })}
                />
                <span className="portada-tc">{tcCuadros(p.t ?? 0, fps)}</span>
                <button className="btn small ghost" onClick={() => cambiar({ t: Math.min(tiempo, total - 1 / fps) })} title="El momento donde está el cabezal">
                  Usar el cabezal
                </button>
              </div>
            ) : fotos.length ? (
              <div className="portada-fotos">
                {fotos.map((m) => (
                  <button key={m.id} className={p.fuente === m.id ? 'is-on' : ''} title={m.nombre} onClick={() => cambiar({ fuente: m.id })}>
                    <img src={miniaturaDe?.(m.id) ?? urlDe(`medio/${m.id}`)} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="tl-dim">No hay fotos en este proyecto: añade una en «Medios» y vuelve aquí.</p>
            )}
            {p.origen === 'imagen' && p.fuente && (
              <>
                <div className="tl-ajuste aj">
                  <span>
                    Encuadre ↔
                    <ValorArrastrable nombre="Encuadre horizontal" valor={p.cx ?? 0.5} min={0} max={1} paso={0.01} formato={(v) => `${Math.round(v * 100)} %`} porDefecto={0.5} onCambio={(v) => cambiar({ cx: v })} />
                  </span>
                </div>
                <div className="tl-ajuste aj">
                  <span>
                    Encuadre ↕
                    <ValorArrastrable nombre="Encuadre vertical" valor={p.cy ?? 0.5} min={0} max={1} paso={0.01} formato={(v) => `${Math.round(v * 100)} %`} porDefecto={0.5} onCambio={(v) => cambiar({ cy: v })} />
                  </span>
                </div>
              </>
            )}

            <span className="ed-seccion">Título</span>
            <textarea className="portada-texto" rows={2} value={p.texto ?? ''} placeholder="Escribe un título (opcional)" onChange={(e) => cambiar({ texto: e.target.value })} />
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
                <ValorArrastrable nombre="Tamaño del título" valor={p.tamano ?? 0.09} min={0.02} max={0.4} paso={0.005} formato={(v) => `${Math.round(v * 1000) / 10} %`} porDefecto={0.09} onCambio={(v) => cambiar({ tamano: v })} />
              </span>
            </div>
            <div className="tl-ajuste aj">
              <span>
                Altura
                <ValorArrastrable nombre="Altura del título" valor={p.y ?? 0.78} min={0} max={1} paso={0.01} formato={(v) => `${Math.round(v * 100)} %`} porDefecto={0.78} onCambio={(v) => cambiar({ y: v })} />
              </span>
            </div>
            <div className="portada-colores">
              <label title="Color de la letra">
                Letra <input type="color" value={p.color ?? '#ffffff'} onChange={(e) => cambiar({ color: e.target.value })} />
              </label>
              <label title="Color del contorno">
                Contorno <input type="color" value={p.contorno ?? '#000000'} onChange={(e) => cambiar({ contorno: e.target.value })} />
              </label>
            </div>
            <label className="portada-inicio">
              <input type="checkbox" checked={Boolean(p.alInicio)} onChange={(e) => cambiar({ alInicio: e.target.checked })} />
              <span>
                También en el primer cuadro del video
                <small>Instagram, TikTok y WhatsApp toman ese de miniatura. Dura un solo cuadro.</small>
              </span>
            </label>
            {error && <p className="portada-error">{error}</p>}
            <div className="portada-botones">
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
              <span className="tl-flex" />
              <button className="btn small ghost" onClick={onCerrar}>
                Cancelar
              </button>
              <button className="btn small primary" disabled={!imagen || guardando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Guardar portada'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pinta la portada: el fondo cubriendo el cuadro (recortado por su encuadre) y el título con su contorno. */
export function pintarPortada(c: HTMLCanvasElement, img: HTMLImageElement | null, p: PortadaTL, fuente: string, ancho: number, alto: number): void {
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, ancho, alto)
  if (img && img.naturalWidth) {
    const escala = Math.max(ancho / img.naturalWidth, alto / img.naturalHeight)
    const w = img.naturalWidth * escala
    const h = img.naturalHeight * escala
    ctx.drawImage(img, (ancho - w) * (p.cx ?? 0.5), (alto - h) * (p.cy ?? 0.5), w, h)
  }
  const texto = (p.texto ?? '').trim()
  if (!texto) return
  const tam = Math.round((p.tamano ?? 0.09) * alto)
  ctx.font = fuente
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  // Las líneas que escribió y, si alguna no cabe en el 90 % del ancho, partida por palabras.
  const lineas: string[] = []
  for (const parrafo of texto.split(/\n/)) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (actual && ctx.measureText(prueba).width > ancho * 0.9) {
        lineas.push(actual)
        actual = palabra
      } else actual = prueba
    }
    lineas.push(actual)
  }
  const alto1 = tam * 1.12
  const y0 = (p.y ?? 0.78) * alto - ((lineas.length - 1) * alto1) / 2
  lineas.forEach((l, i) => {
    const y = y0 + i * alto1
    if (p.contorno) {
      ctx.strokeStyle = p.contorno
      ctx.lineWidth = Math.max(2, tam * 0.16)
      ctx.strokeText(l, ancho / 2, y)
    }
    ctx.fillStyle = p.color ?? '#ffffff'
    ctx.fillText(l, ancho / 2, y)
  })
}
