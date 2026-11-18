import { useRef, useState } from 'react'
import { CANALES_CURVA, curvaPuntos, type CanalCurva, type CurvasTL, type PuntoCurva } from '../../../shared/timeline'

const LADO = 200
const RADIO = 5

/**
 * Las curvas de color de un clip dibujadas a mano, como las de Lumetri en Premiere: la de luz (RGB) y una por canal.
 * Clic en la curva añade un punto, arrastrarlo lo mueve, doble clic lo quita. Lo que se ve aquí es lo que sale.
 */
export function EditorCurvas({
  curvas,
  onCambio,
  onEmpezar
}: {
  curvas: CurvasTL | undefined
  /** Con la curva nueva de un canal (sin puntos de más: solo los que puso el usuario). */
  onCambio: (canal: CanalCurva, puntos: PuntoCurva[] | undefined) => void
  /** Antes de arrastrar: para que todo el arrastre sea un solo paso de deshacer. */
  onEmpezar: () => void
}) {
  const [canal, setCanal] = useState<CanalCurva>('rgb')
  const svg = useRef<SVGSVGElement | null>(null)
  const puntos = curvas?.[canal] ?? []
  const todos: PuntoCurva[] = [[0, 0], ...puntos, [1, 1]]
  const color = { rgb: '#e8e8e8', r: '#ff5a5a', g: '#4fd27a', b: '#5a8cff' }[canal]

  const enSvg = (e: { clientX: number; clientY: number }): PuntoCurva => {
    const r = svg.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))]
  }

  function arrastrar(e: React.PointerEvent, indice: number, lista: PuntoCurva[]) {
    e.preventDefault()
    e.stopPropagation()
    const mover = (ev: PointerEvent) => {
      const [x, y] = enSvg(ev)
      // No puede pasar a sus vecinos (la curva siempre va hacia la derecha).
      const antes = indice > 0 ? lista[indice - 1][0] + 0.01 : 0.01
      const despues = indice < lista.length - 1 ? lista[indice + 1][0] - 0.01 : 0.99
      const nueva = lista.map((p, i) => (i === indice ? ([Math.min(despues, Math.max(antes, x)), y] as PuntoCurva) : p))
      onCambio(canal, nueva)
    }
    const soltar = () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
  }

  // La curva tal como sale (los mismos puntos que el MP4), para dibujarla.
  const muestra = curvaPuntos(puntos, 64)
  const camino = muestra.map((v, i) => `${i ? 'L' : 'M'}${((i / (muestra.length - 1)) * LADO).toFixed(1)},${((1 - v) * LADO).toFixed(1)}`).join(' ')

  return (
    <div className="ed-curvas">
      <div className="ed-curvas-canales" role="tablist" aria-label="Canal de la curva">
        {CANALES_CURVA.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={canal === c.id}
            className={`chip ${canal === c.id ? 'is-active' : ''} ${curvas?.[c.id]?.length ? 'tiene' : ''}`}
            onClick={() => setCanal(c.id)}
            title={c.para}
          >
            {c.nombre}
          </button>
        ))}
      </div>
      <svg
        ref={svg}
        className="ed-curvas-lienzo"
        viewBox={`0 0 ${LADO} ${LADO}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          // Un punto nuevo donde se hizo clic, y se arrastra de una vez.
          const [x, y] = enSvg(e)
          if (x < 0.02 || x > 0.98) return
          onEmpezar()
          const nueva = [...puntos, [x, y] as PuntoCurva].sort((p, q) => p[0] - q[0])
          onCambio(canal, nueva)
          arrastrar(e, nueva.findIndex((p) => p[0] === x), nueva)
        }}
      >
        {[0.25, 0.5, 0.75].map((k) => (
          <g key={k} className="ed-curvas-reja">
            <line x1={k * LADO} y1={0} x2={k * LADO} y2={LADO} />
            <line x1={0} y1={k * LADO} x2={LADO} y2={k * LADO} />
          </g>
        ))}
        <line className="ed-curvas-diagonal" x1={0} y1={LADO} x2={LADO} y2={0} />
        <path d={camino} fill="none" stroke={color} strokeWidth={2} />
        {todos.slice(1, -1).map(([x, y], i) => (
          <circle
            key={i}
            cx={x * LADO}
            cy={(1 - y) * LADO}
            r={RADIO}
            fill={color}
            className="ed-curvas-punto"
            onPointerDown={(e) => {
              onEmpezar()
              arrastrar(e, i, puntos)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              const quedan = puntos.filter((_, j) => j !== i)
              onCambio(canal, quedan.length ? quedan : undefined)
            }}
          >
            <title>Arrástralo; doble clic lo quita</title>
          </circle>
        ))}
      </svg>
      <div className="ed-curvas-pie">
        <span className="tl-dim">Clic añade un punto · doble clic lo quita</span>
        {puntos.length > 0 && (
          <button className="ed-seccion-quitar" onClick={() => onCambio(canal, undefined)}>
            Restablecer
          </button>
        )}
      </div>
    </div>
  )
}
