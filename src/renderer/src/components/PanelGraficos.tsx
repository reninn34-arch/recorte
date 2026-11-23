import { useEffect, useRef, useState } from 'react'
import { esDibujoGrafico, PLANTILLAS_GRAFICO, plantillaConMarca, resumenGrafico, type ElementoGrafico, type Grafico, type TextoGrafico } from '../../../shared/grafico'
import { anadirCapa, cambiarCapa, duracionesDeMedios, FUENTES_TEXTO, type CapaTL, type Timeline } from '../../../shared/timeline'
import type { MedioProyecto, Project } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

const sinPrefijo = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

/**
 * «Gráficos»: tarjetas, rótulos con su caja, botones… hechos de textos editables, como los gráficos esenciales de
 * Premiere o los textos con diseño de CapCut. Se elige una plantilla (con los colores de la marca) y entra en el
 * cabezal como una capa; si eliges un gráfico ya puesto, aquí cambias sus textos, letra, colores, caja y sombra, y se
 * vuelve a dibujar al momento (la capa se queda en su sitio y a su escala).
 */
export function PanelGraficos({
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
  const editando = capaElegida?.grafico ? capaElegida : undefined
  const [borrador, setBorrador] = useState<Grafico | null>(editando?.grafico ?? null)
  const [dibujando, setDibujando] = useState(false)
  // El último diseño que se mandó a dibujar (para no dibujar dos veces lo mismo, ni pisar lo que llegó de deshacer).
  const enviado = useRef<string>('')
  const ultimo = useRef({ timeline, editando, proyecto })
  ultimo.current = { timeline, editando, proyecto }

  // Al elegir otro gráfico (o deshacer): el borrador es el de la capa. Mientras se dibuja lo que escribiste, no se
  // pisa (la capa todavía tiene el diseño anterior).
  const capaDelBorrador = useRef<string | null>(null)
  useEffect(() => {
    if (!editando?.grafico) {
      capaDelBorrador.current = null
      setBorrador(null)
      return
    }
    const json = JSON.stringify(editando.grafico)
    if (capaDelBorrador.current !== editando.id || json !== enviado.current) {
      capaDelBorrador.current = editando.id
      enviado.current = json
      setBorrador(editando.grafico)
    }
  }, [editando?.id, editando?.grafico])

  const anchoVideo = proyecto.source.width || 1080

  // Cambiar el diseño: se vuelve a dibujar un momento después de dejar de escribir.
  useEffect(() => {
    if (!borrador || !editando) return
    const json = JSON.stringify(borrador)
    if (json === enviado.current) return
    const t = setTimeout(async () => {
      enviado.current = json
      setDibujando(true)
      try {
        const r = await window.recorte.dibujarGrafico(proyecto.id, borrador, ultimo.current.timeline.letras)
        onMedios(r.project.medios ?? [])
        const { timeline: tl, editando: capa } = ultimo.current
        if (!capa) return
        // Que siga a su escala: si el dibujo nuevo es más ancho (más texto), la capa también.
        const viejo = r.project.medios?.find((m) => m.id === capa.fuente) ?? proyecto.medios?.find((m) => m.id === capa.fuente)
        const natural = viejo && viejo.ancho > 0 ? viejo.ancho / anchoVideo : r.ancho
        const ancho = Math.min(1, Math.max(0.05, capa.ancho * (r.ancho / natural)))
        enviado.current = JSON.stringify(r.grafico)
        historial.aplicar(cambiarCapa(tl, capa.id, { fuente: r.medio, grafico: r.grafico, ancho }, { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }))
      } catch (e) {
        onAviso(sinPrefijo(e))
      } finally {
        setDibujando(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [borrador])

  const poner = async (id: string) => {
    const p = PLANTILLAS_GRAFICO.find((x) => x.id === id)
    if (!p || dibujando) return
    setDibujando(true)
    try {
      const g = plantillaConMarca(p.grafico, proyecto.brand)
      const r = await window.recorte.dibujarGrafico(proyecto.id, g, timeline.letras)
      onMedios(r.project.medios ?? [])
      const hecho = anadirCapa(
        timeline,
        { fuente: r.medio, inicio: tiempo, duracion: 3, x: 0.5, y: p.y, ancho: r.ancho, pista: 3, grafico: r.grafico, entrada: 'pop' },
        { principal: proyecto.source.duration, ...duracionesDeMedios(r.project.medios) }
      )
      if (hecho.timeline === timeline) {
        onAviso('No cupo en el cabezal: mueve el cabezal antes del final del video.')
        return
      }
      enviado.current = JSON.stringify(r.grafico)
      historial.aplicar(hecho.timeline)
      onElegirCapa(hecho.id)
      onAviso(`Listo: «${p.nombre}» quedó en el cabezal. Cambia sus textos aquí; muévela o alárgala como cualquier capa.`)
    } catch (e) {
      onAviso(sinPrefijo(e))
    } finally {
      setDibujando(false)
    }
  }

  if (!editando || !borrador) {
    return (
      <div className="pz">
        <span className="ed-seccion">Gráficos con texto editable</span>
        <p className="tl-dim">Tarjetas, rótulos y botones con su caja. Entran en el cabezal con los colores de la marca; luego cambias todo.</p>
        <div className="gr-plantillas">
          {PLANTILLAS_GRAFICO.map((p) => (
            <button key={p.id} className="ed-fila" disabled={dibujando} onClick={() => void poner(p.id)}>
              <Icon name="type" size={14} />
              <span>{p.nombre}</span>
            </button>
          ))}
        </div>
        {dibujando && <p className="tl-dim">Dibujando…</p>}
      </div>
    )
  }

  const g = borrador
  const cambiar = (c: Partial<Grafico>) => setBorrador({ ...g, ...c })
  const cambiarElemento = (i: number, c: Partial<TextoGrafico> | Partial<ElementoGrafico>) =>
    setBorrador({ ...g, elementos: g.elementos.map((e, j) => (j === i ? ({ ...e, ...c } as ElementoGrafico) : e)) })
  const quitarElemento = (i: number) => g.elementos.length > 1 && setBorrador({ ...g, elementos: g.elementos.filter((_, j) => j !== i) })
  const moverElemento = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= g.elementos.length) return
    const l = [...g.elementos]
    ;[l[i], l[j]] = [l[j], l[i]]
    setBorrador({ ...g, elementos: l })
  }
  const textoBase = g.elementos.find((e): e is TextoGrafico => e.tipo === 'texto')
  const imagenes = (proyecto.medios ?? []).filter((m) => m.tipo === 'imagen' && !esDibujoGrafico(m.ruta))
  const letras = [...Object.entries(FUENTES_TEXTO).map(([id, f]) => ({ id, nombre: f.nombre })), ...(timeline.letras ?? []).map((l) => ({ id: l.id, nombre: l.nombre }))]
  const numero = (v: string, d: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d)

  return (
    <div className="pz gr">
      <span className="ed-seccion">
        Gráfico: {resumenGrafico(g)} {dibujando && <span className="tl-dim">· dibujando…</span>}
      </span>
      {g.elementos.map((e, i) => (
        <div key={i} className="gr-elemento">
          <div className="gr-cabeza">
            <span>{e.tipo === 'texto' ? `Texto ${i + 1}` : `Imagen ${i + 1}`}</span>
            <span className="gr-acciones">
              <button className="chip" title="Subir" disabled={i === 0} onClick={() => moverElemento(i, -1)}>
                ↑
              </button>
              <button className="chip" title="Bajar" disabled={i === g.elementos.length - 1} onClick={() => moverElemento(i, 1)}>
                ↓
              </button>
              <button className="chip" title="Quitar" disabled={g.elementos.length < 2} onClick={() => quitarElemento(i)}>
                <Icon name="trash" size={12} />
              </button>
            </span>
          </div>
          {e.tipo === 'texto' ? (
            <>
              <textarea className="tl-texto-input gr-texto" rows={Math.min(4, e.texto.split('\n').length)} value={e.texto} onChange={(x) => cambiarElemento(i, { texto: x.target.value })} />
              <div className="gr-fila">
                <label className="pz-campo">
                  <span>Tamaño</span>
                  <input className="tl-texto-input" type="number" min={8} max={600} value={e.tamano} onChange={(x) => cambiarElemento(i, { tamano: numero(x.target.value, e.tamano) })} />
                </label>
                <label className="pz-campo">
                  <span>Grosor</span>
                  <select value={e.peso} onChange={(x) => cambiarElemento(i, { peso: Number(x.target.value) })}>
                    <option value={400}>Normal</option>
                    <option value={600}>Media</option>
                    <option value={700}>Negrita</option>
                    <option value={900}>Negra</option>
                  </select>
                </label>
                <label className="pz-campo">
                  <span>Color</span>
                  <input type="color" className="tl-color" value={e.color} onChange={(x) => cambiarElemento(i, { color: x.target.value })} />
                </label>
              </div>
              <div className="gr-fila">
                <label className="pz-campo">
                  <span>Letra</span>
                  <select value={e.fuente ?? 'normal'} onChange={(x) => cambiarElemento(i, { fuente: x.target.value === 'normal' ? undefined : x.target.value })}>
                    {letras.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="gr-chips">
                  <button className={`chip ${e.mayusculas ? 'is-on' : ''}`} title="Mayúsculas" onClick={() => cambiarElemento(i, { mayusculas: !e.mayusculas || undefined })}>
                    AA
                  </button>
                  <button className={`chip ${e.cursiva ? 'is-on' : ''}`} title="Cursiva" onClick={() => cambiarElemento(i, { cursiva: !e.cursiva || undefined })}>
                    <i>I</i>
                  </button>
                  <button
                    className={`chip ${e.caja ? 'is-on' : ''}`}
                    title="Una caja detrás de este texto (para resaltarlo)"
                    onClick={() => cambiarElemento(i, { caja: e.caja ? undefined : { color: '#ffd60a', radio: 12, margenX: 18, margenY: 4 } })}
                  >
                    Caja
                  </button>
                  <button
                    className={`chip ${e.contorno ? 'is-on' : ''}`}
                    title="Contorno de la letra"
                    onClick={() => cambiarElemento(i, e.contorno ? { contorno: undefined, colorContorno: undefined } : { contorno: 3, colorContorno: '#000000' })}
                  >
                    Contorno
                  </button>
                </span>
              </div>
              {e.caja && (
                <div className="gr-fila">
                  <label className="pz-campo">
                    <span>Color de la caja</span>
                    <input type="color" className="tl-color" value={e.caja.color} onChange={(x) => cambiarElemento(i, { caja: { ...e.caja!, color: x.target.value } })} />
                  </label>
                  <label className="pz-campo">
                    <span>Esquinas</span>
                    <input type="range" min={0} max={80} value={e.caja.radio} onChange={(x) => cambiarElemento(i, { caja: { ...e.caja!, radio: Number(x.target.value) } })} />
                  </label>
                </div>
              )}
              {e.contorno !== undefined && (
                <div className="gr-fila">
                  <label className="pz-campo">
                    <span>Contorno</span>
                    <input type="range" min={1} max={16} step={0.5} value={e.contorno} onChange={(x) => cambiarElemento(i, { contorno: Number(x.target.value) })} />
                  </label>
                  <label className="pz-campo">
                    <span>Su color</span>
                    <input type="color" className="tl-color" value={e.colorContorno ?? '#000000'} onChange={(x) => cambiarElemento(i, { colorContorno: x.target.value })} />
                  </label>
                </div>
              )}
              <label className="pz-campo">
                <span>Entre letras</span>
                <input type="range" min={-0.05} max={0.4} step={0.01} value={e.espaciado ?? 0} onChange={(x) => cambiarElemento(i, { espaciado: Number(x.target.value) || undefined })} />
              </label>
            </>
          ) : (
            <div className="gr-fila">
              <label className="pz-campo">
                <span>Imagen</span>
                <select value={e.medio} onChange={(x) => cambiarElemento(i, { medio: x.target.value })}>
                  {proyecto.brand.logo && <option value="logo">El logo de la marca</option>}
                  {imagenes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pz-campo">
                <span>Alto</span>
                <input className="tl-texto-input" type="number" min={8} max={1600} value={e.alto} onChange={(x) => cambiarElemento(i, { alto: numero(x.target.value, e.alto) })} />
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="gr-fila">
        <button
          className="ed-fila"
          onClick={() =>
            setBorrador({
              ...g,
              elementos: [...g.elementos, { tipo: 'texto', texto: 'Texto', tamano: textoBase ? Math.round(textoBase.tamano * 0.6) : 48, peso: 400, color: textoBase?.color ?? '#ffffff', ...(textoBase?.fuente ? { fuente: textoBase.fuente } : {}) }]
            })
          }
        >
          <Icon name="plus" size={14} />
          <span>Texto</span>
        </button>
        {(proyecto.brand.logo || imagenes.length > 0) && (
          <button className="ed-fila" onClick={() => setBorrador({ ...g, elementos: [{ tipo: 'imagen', medio: proyecto.brand.logo ? 'logo' : imagenes[0].id, alto: 120 }, ...g.elementos] })}>
            <Icon name="image" size={14} />
            <span>Imagen o logo</span>
          </button>
        )}
      </div>

      <span className="ed-seccion">Caja</span>
      <div className="gr-fila">
        <label className="pz-campo">
          <span>Cómo van</span>
          <select value={g.disposicion} onChange={(x) => cambiar({ disposicion: x.target.value === 'fila' ? 'fila' : 'columna' })}>
            <option value="columna">Uno debajo del otro</option>
            <option value="fila">En fila</option>
          </select>
        </label>
        <label className="pz-campo">
          <span>Alinear</span>
          <select value={g.alinear} onChange={(x) => cambiar({ alinear: x.target.value as Grafico['alinear'] })}>
            <option value="izquierda">{g.disposicion === 'fila' ? 'Arriba' : 'Izquierda'}</option>
            <option value="centro">Al centro</option>
            <option value="derecha">{g.disposicion === 'fila' ? 'Abajo' : 'Derecha'}</option>
          </select>
        </label>
      </div>
      <label className="pz-campo pz-si">
        <span>Fondo</span>
        <input type="checkbox" checked={Boolean(g.fondo)} onChange={(x) => cambiar({ fondo: x.target.checked ? { color: proyecto.brand.primary || '#111111', radio: 24 } : undefined })} />
      </label>
      {g.fondo && (
        <>
          <div className="gr-fila">
            <label className="pz-campo">
              <span>Color</span>
              <input type="color" className="tl-color" value={g.fondo.color} onChange={(x) => cambiar({ fondo: { ...g.fondo!, color: x.target.value } })} />
            </label>
            <label className="pz-campo">
              <span>Degradado</span>
              <span className="pz-color">
                <input type="checkbox" checked={Boolean(g.fondo.color2)} onChange={(x) => cambiar({ fondo: { ...g.fondo!, color2: x.target.checked ? proyecto.brand.secondary || '#ffffff' : undefined, angulo: x.target.checked ? 90 : undefined } })} />
                {g.fondo.color2 && <input type="color" className="tl-color" value={g.fondo.color2} onChange={(x) => cambiar({ fondo: { ...g.fondo!, color2: x.target.value } })} />}
              </span>
            </label>
            <label className="pz-campo">
              <span>Borde</span>
              <span className="pz-color">
                <input type="checkbox" checked={Boolean(g.fondo.borde)} onChange={(x) => cambiar({ fondo: { ...g.fondo!, borde: x.target.checked ? 4 : undefined, colorBorde: x.target.checked ? '#ffffff' : undefined } })} />
                {g.fondo.borde !== undefined && <input type="color" className="tl-color" value={g.fondo.colorBorde ?? '#ffffff'} onChange={(x) => cambiar({ fondo: { ...g.fondo!, colorBorde: x.target.value } })} />}
              </span>
            </label>
          </div>
          <label className="pz-campo">
            <span>Esquinas</span>
            <input type="range" min={0} max={200} value={g.fondo.radio} onChange={(x) => cambiar({ fondo: { ...g.fondo!, radio: Number(x.target.value) } })} />
          </label>
          <label className="pz-campo">
            <span>Opacidad del fondo</span>
            <input type="range" min={0.1} max={1} step={0.05} value={g.fondo.opacidad ?? 1} onChange={(x) => cambiar({ fondo: { ...g.fondo!, opacidad: Number(x.target.value) >= 0.995 ? undefined : Number(x.target.value) } })} />
          </label>
        </>
      )}
      <div className="gr-fila">
        <label className="pz-campo">
          <span>Margen a los lados</span>
          <input type="range" min={0} max={160} value={g.margenX} onChange={(x) => cambiar({ margenX: Number(x.target.value) })} />
        </label>
        <label className="pz-campo">
          <span>Arriba y abajo</span>
          <input type="range" min={0} max={160} value={g.margenY} onChange={(x) => cambiar({ margenY: Number(x.target.value) })} />
        </label>
      </div>
      <label className="pz-campo">
        <span>Entre elementos</span>
        <input type="range" min={0} max={120} value={g.separacion} onChange={(x) => cambiar({ separacion: Number(x.target.value) })} />
      </label>
      <div className="gr-fila">
        <label className="pz-campo">
          <span>Barra de color</span>
          <select value={g.acento?.lado ?? ''} onChange={(x) => cambiar({ acento: x.target.value ? { lado: x.target.value as 'izquierda', color: g.acento?.color ?? (proyecto.brand.primary || '#ffd60a'), grosor: g.acento?.grosor ?? 12 } : undefined })}>
            <option value="">Sin barra</option>
            <option value="izquierda">A la izquierda</option>
            <option value="arriba">Arriba</option>
            <option value="abajo">Abajo</option>
          </select>
        </label>
        {g.acento && <input type="color" className="tl-color" value={g.acento.color} onChange={(x) => cambiar({ acento: { ...g.acento!, color: x.target.value } })} />}
      </div>
      <label className="pz-campo">
        <span>Sombra</span>
        <input type="range" min={0} max={1} step={0.05} value={g.sombra ?? 0} onChange={(x) => cambiar({ sombra: Number(x.target.value) || undefined, colorSombra: Number(x.target.value) ? g.colorSombra : undefined })} />
      </label>
      <p className="tl-dim">Muévela, agrándala, anímala o dale entrada y salida como a cualquier capa.</p>
    </div>
  )
}
