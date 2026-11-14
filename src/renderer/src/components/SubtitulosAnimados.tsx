import { useEffect, useState } from 'react'
import type { PiezaAnimada, ValoresPieza, VariablePieza } from '../../../shared/piezas'
import { huellaSubtitulos, subtitulosAlDia, type Timeline } from '../../../shared/timeline'
import type { MedioProyecto, Project } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

const sinPrefijo = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * Subtítulos animados con HyperFrames: los textos de subtítulo siguen siendo el guion (se corrigen a mano en la
 * timeline) y un estilo de HyperFrames los dibuja encima. Si se corrige algo, se vuelven a animar (al exportar, solos).
 * Tu agente puede crear estilos nuevos como crea animaciones.
 */
export function SubtitulosAnimados({
  proyecto,
  timeline,
  historial,
  onMedios,
  onAviso
}: {
  proyecto: Project
  timeline: Timeline
  historial: Historial
  onMedios: (medios: MedioProyecto[]) => void
  onAviso: (t: string) => void
}) {
  const [estilos, setEstilos] = useState<PiezaAnimada[]>([])
  const [animando, setAnimando] = useState(false)
  const [pct, setPct] = useState(0)
  const [pedido, setPedido] = useState('')
  const [creando, setCreando] = useState(false)
  const [lineas, setLineas] = useState<string[]>([])
  const recargar = async () => setEstilos((await window.recorte.listarPiezas()).filter((p) => p.subtitulos))
  useEffect(() => {
    void recargar()
    const a = window.recorte.onProgreso((p) => {
      if (p.id === proyecto.id && p.fase === 'subtitulos') setPct(p.pct)
    })
    const b = window.recorte.onPiezasProgreso((t) => setLineas((l) => [...l.slice(-4), t]))
    return () => {
      a()
      b()
    }
  }, [proyecto.id])

  const s = timeline.subtitulosHF
  const hay = timeline.textos.some((x) => x.subtitulo)
  const elegido = estilos.find((p) => p.id === s?.pieza)
  const alDia = subtitulosAlDia(timeline)

  const elegir = (p: PiezaAnimada | null) => {
    if (!p) {
      const { subtitulosHF: _s, ...resto } = timeline
      historial.aplicar(resto)
      return
    }
    historial.aplicar({ ...timeline, subtitulosHF: { pieza: p.id, valores: s?.pieza === p.id ? s.valores : {} } })
  }
  const cambiar = (id: string, valor: string | number | boolean) => {
    if (!s) return
    historial.aplicar({ ...timeline, subtitulosHF: { ...s, valores: { ...s.valores, [id]: valor } } })
  }
  const animar = async () => {
    if (!s || animando) return
    setAnimando(true)
    setPct(0)
    try {
      const huella = huellaSubtitulos(timeline)
      const r = await window.recorte.animarSubtitulos(proyecto.id, timeline)
      onMedios(r.project.medios ?? [])
      // Si mientras tanto no se cambiaron, quedan al día.
      if (huellaSubtitulos(timeline) === huella) historial.aplicar({ ...timeline, subtitulosHF: r.timeline.subtitulosHF })
      onAviso('Listo: los subtítulos están animados. Si corriges uno, vuelve a animarlos (al exportar se hace solo).')
    } catch (e) {
      onAviso(sinPrefijo(e))
    } finally {
      setAnimando(false)
    }
  }
  const crear = async () => {
    if (!pedido.trim() || creando) return
    setCreando(true)
    setLineas([])
    try {
      const nueva = await window.recorte.crearPieza(
        proyecto.id,
        `ESTILO DE SUBTÍTULOS (lee «Estilos de subtítulos» en tu guía: "subtitulos": true en pieza.json y dibuja las frases de v.frases). Lo que pide: ${pedido.trim()}`,
        []
      )
      await recargar()
      setPedido('')
      if (nueva.subtitulos) historial.aplicar({ ...timeline, subtitulosHF: { pieza: nueva.id, valores: {} } })
      onAviso(`Listo: «${nueva.nombre}» quedó entre tus estilos de subtítulos.`)
    } catch (e) {
      onAviso(sinPrefijo(e))
    } finally {
      setCreando(false)
    }
  }

  const valorDe = (x: VariablePieza) => s?.valores[x.id] ?? x.defecto
  const colorDe = (x: VariablePieza): string => {
    const v = valorDe(x)
    if (v === 'marca') return proyecto.brand.primary
    if (v === 'marca2') return proyecto.brand.secondary
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'
  }

  return (
    <div className="pz sub-hf">
      <span className="ed-seccion">Animarlos con HyperFrames</span>
      <p className="tl-dim">
        Un estilo animado dibuja tus subtítulos encima del video. Los textos siguen aquí: si corriges uno, se vuelven a animar con el cambio.
      </p>
      <div className="ed-opciones">
        <button className={`chip ${!s ? 'is-active' : ''}`} onClick={() => elegir(null)} title="Los subtítulos como texto, con el estilo de arriba">
          Texto simple
        </button>
        {estilos.map((p) => (
          <button key={p.id} className={`chip ${s?.pieza === p.id ? 'is-active' : ''}`} title={p.para} onClick={() => elegir(p)}>
            {p.propia ? '★ ' : ''}
            {p.nombre}
          </button>
        ))}
      </div>
      {elegido && (
        <>
          {elegido.muestra && <video className="pz-muestra" src={elegido.muestra} autoPlay loop muted playsInline />}
          <p className="tl-dim">{elegido.para}</p>
          {elegido.vars.map((x) => (
            <label key={x.id} className={`pz-campo ${x.tipo === 'si' ? 'pz-si' : ''}`}>
              <span>{x.nombre}</span>
              {x.tipo === 'texto' && <input className="tl-texto-input" value={String(valorDe(x))} onChange={(e) => cambiar(x.id, e.target.value)} />}
              {x.tipo === 'numero' && (
                <input className="tl-texto-input" type="number" value={Number(valorDe(x))} onChange={(e) => cambiar(x.id, Number(e.target.value))} />
              )}
              {x.tipo === 'si' && <input type="checkbox" checked={valorDe(x) === true} onChange={(e) => cambiar(x.id, e.target.checked)} />}
              {x.tipo === 'color' && (
                <span className="pz-color">
                  <input type="color" className="tl-color" value={colorDe(x)} onChange={(e) => cambiar(x.id, e.target.value)} />
                  <button type="button" className="chip" onClick={() => cambiar(x.id, 'marca')} title="El color principal de la marca">
                    Marca
                  </button>
                  <button type="button" className="chip" onClick={() => cambiar(x.id, 'marca2')} title="El segundo color de la marca">
                    Marca 2
                  </button>
                </span>
              )}
              {x.tipo === 'opcion' && (
                <select value={String(valorDe(x))} onChange={(e) => cambiar(x.id, e.target.value)}>
                  {(x.opciones ?? []).map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
          {!hay ? (
            <p className="tl-dim">Primero crea los subtítulos de la voz (arriba).</p>
          ) : alDia ? (
            <p className="sub-hf-estado is-ok">
              <Icon name="check" size={13} /> Animados y al día
            </p>
          ) : (
            <>
              <p className="sub-hf-estado">
                {s?.medio ? 'Cambiaste algo: mientras no los vuelvas a animar se ven como texto.' : 'Aún no están animados: por ahora se ven como texto.'}
              </p>
              <button className="btn small primary" disabled={animando} onClick={() => void animar()}>
                <Icon name="sparkles" size={13} /> {animando ? `Animando… ${Math.round(pct * 100)} %` : 'Animar los subtítulos'}
              </button>
            </>
          )}
        </>
      )}
      <span className="ed-seccion">Un estilo nuevo</span>
      <textarea
        className="tl-texto-input pz-pedido"
        rows={3}
        placeholder="Descríbelo: cómo entra cada frase o palabra, la letra, los colores. Ej.: «palabra por palabra en una cinta amarilla que se desliza, con la palabra clave temblando»"
        value={pedido}
        disabled={creando}
        onChange={(e) => setPedido(e.target.value)}
      />
      <button className="btn small" disabled={creando || !pedido.trim()} onClick={() => void crear()}>
        <Icon name="sparkles" size={13} /> Que mi agente lo cree
      </button>
      {creando && (
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
      )}
    </div>
  )
}
