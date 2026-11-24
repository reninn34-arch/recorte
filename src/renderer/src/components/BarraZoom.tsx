import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * La barra de desplazamiento con zoom de debajo de la línea de tiempo (como la de Premiere): la ventana es lo que se
 * ve. Se arrastra para recorrer, sus tiradores la estiran o la encogen (acercan o alejan) y doble clic lo ve todo.
 */
export function BarraZoom({
  scrollRef,
  pps,
  duracion,
  cabezal,
  onVer,
  onAjustar
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  /** Píxeles por segundo de la línea de tiempo. */
  pps: number
  /** Los segundos que mide todo el lienzo. */
  duracion: number
  cabezal: number
  /** Enseña de `t0` a `t1` (cambia el zoom y el desplazamiento). */
  onVer: (t0: number, t1: number) => void
  onAjustar: () => void
}) {
  const barra = useRef<HTMLDivElement>(null)
  const [vista, setVista] = useState({ t0: 0, t1: duracion })

  // Lo que se ve, al desplazar, al cambiar el zoom o el tamaño.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const medir = () => setVista({ t0: el.scrollLeft / pps, t1: (el.scrollLeft + el.clientWidth) / pps })
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => {
      el.removeEventListener('scroll', medir)
      observador.disconnect()
    }
  }, [scrollRef, pps, duracion])

  const largo = Math.max(1e-6, duracion)
  const t0 = Math.max(0, Math.min(vista.t0, largo))
  const t1 = Math.max(t0, Math.min(vista.t1, largo))
  const todo = t0 <= 0.001 && t1 >= largo - 0.001

  function arrastrar(e: React.PointerEvent, modo: 'mover' | 'izq' | 'der') {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const caja = barra.current?.getBoundingClientRect()
    const el = scrollRef.current
    if (!caja || !el) return
    const segPorPx = largo / Math.max(1, caja.width)
    const x0 = e.clientX
    const inicio = { t0, t1, scroll: el.scrollLeft }
    const minimo = 0.25
    const mover = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) * segPorPx
      if (modo === 'mover') el.scrollLeft = inicio.scroll + dt * pps
      else if (modo === 'izq') onVer(Math.max(0, Math.min(inicio.t1 - minimo, inicio.t0 + dt)), inicio.t1)
      else onVer(inicio.t0, Math.min(largo, Math.max(inicio.t0 + minimo, inicio.t1 + dt)))
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  const pct = (t: number) => `${((t / largo) * 100).toFixed(3)}%`

  return (
    <div
      ref={barra}
      className="tl-barra-zoom"
      title="Arrastra para recorrer · los bordes acercan o alejan · doble clic: verlo todo"
      onDoubleClick={onAjustar}
      onPointerDown={(e) => {
        // Un clic fuera de la ventana la centra ahí.
        if (e.button !== 0 || e.target !== e.currentTarget) return
        const caja = e.currentTarget.getBoundingClientRect()
        const t = ((e.clientX - caja.left) / Math.max(1, caja.width)) * largo
        const el = scrollRef.current
        if (el) el.scrollLeft = Math.max(0, (t - (t1 - t0) / 2) * pps)
      }}
    >
      <span className="tl-barra-zoom-cabezal" style={{ left: pct(Math.min(cabezal, largo)) }} />
      <div
        className={`tl-barra-zoom-ventana ${todo ? 'is-todo' : ''}`}
        style={{ left: pct(t0), width: pct(t1 - t0) }}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-label="Lo que se ve de la línea de tiempo"
        aria-valuemin={0}
        aria-valuemax={Math.round(largo)}
        aria-valuenow={Math.round(t0)}
        onPointerDown={(e) => arrastrar(e, 'mover')}
      >
        <span className="tl-barra-zoom-tirador izq" onPointerDown={(e) => arrastrar(e, 'izq')} />
        <span className="tl-barra-zoom-tirador der" onPointerDown={(e) => arrastrar(e, 'der')} />
      </div>
    </div>
  )
}
