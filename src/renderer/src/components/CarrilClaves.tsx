import { useRef, useState } from 'react'
import { avanceCurva, type ClaveTL } from '../../../shared/timeline'

/**
 * La mini línea de tiempo de un ajuste animado, debajo de su fila (como en «Controles de efectos»):
 * sus fotogramas clave como rombos, la curva de cómo cambia el valor y el cabezal.
 * Un clic lleva el cabezal ahí; un rombo se arrastra para moverlo en el tiempo; doble clic lo quita.
 */
export function CarrilClaves({
  claves,
  desde,
  hasta,
  cabezal,
  nombre,
  onIr,
  onMover,
  onQuitar,
  onEmpezar
}: {
  claves: ClaveTL[]
  /** El tramo que se ve, en las mismas unidades que las claves. */
  desde: number
  hasta: number
  cabezal: number
  nombre: string
  onIr: (f: number) => void
  onMover: (de: number, a: number) => void
  onQuitar: (f: number) => void
  /** Abre un paso de deshacer antes de mover. */
  onEmpezar: () => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const gesto = useRef<{ f: number; actual: number; x: number; movido: boolean; id: number } | null>(null)
  const [moviendo, setMoviendo] = useState<number | null>(null)
  const largo = Math.max(1e-6, hasta - desde)
  const pct = (f: number) => `${(Math.min(1, Math.max(0, (f - desde) / largo)) * 100).toFixed(3)}%`
  // Al cuadro (30 por segundo), como el resto de la edición.
  const aF = (clientX: number) => {
    const r = caja.current!.getBoundingClientRect()
    const f = desde + Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))) * largo
    return Math.round(f * 30) / 30
  }

  // La forma del valor a lo largo del tramo, entre el mínimo y el máximo de sus claves.
  const vs = claves.map((x) => x.v)
  const vMin = Math.min(...vs)
  const vMax = Math.max(...vs)
  const alto = (v: number) => (vMax - vMin < 1e-9 ? 50 : 85 - ((v - vMin) / (vMax - vMin)) * 70)
  const valorEn = (f: number) => {
    if (f <= claves[0].f) return claves[0].v
    const ultima = claves[claves.length - 1]
    if (f >= ultima.f) return ultima.v
    const i = claves.findIndex((x) => x.f > f)
    const a = claves[i - 1]
    const b = claves[i]
    return a.v + (b.v - a.v) * avanceCurva(a.curva, (f - a.f) / Math.max(1e-6, b.f - a.f))
  }
  const puntos = Array.from({ length: 61 }, (_, i) => {
    const f = desde + (largo * i) / 60
    return `${((i / 60) * 100).toFixed(2)},${alto(valorEn(f)).toFixed(2)}`
  }).join(' ')

  return (
    <div
      ref={caja}
      className="aj-carril"
      role="group"
      aria-label={`Fotogramas clave de ${nombre}`}
      title="Clic: lleva el cabezal ahí · arrastra un rombo para moverlo · doble clic en un rombo lo quita"
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('.aj-carril-clave')) return
        onIr(aF(e.clientX))
      }}
    >
      <svg className="aj-carril-curva" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={puntos} />
      </svg>
      <span className="aj-carril-cabezal" style={{ left: pct(cabezal) }} />
      {claves.map((k) => {
        const f = moviendo !== null && gesto.current?.f === k.f ? moviendo : k.f
        const aqui = Math.abs(k.f - cabezal) < 0.034
        return (
          <button
            key={k.f}
            type="button"
            className={`aj-carril-clave ${aqui ? 'is-aqui' : ''}`}
            style={{ left: pct(f) }}
            aria-label={`Clave de ${nombre} en ${k.f.toFixed(2)} s`}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              gesto.current = { f: k.f, actual: k.f, x: e.clientX, movido: false, id: e.pointerId }
            }}
            onPointerMove={(e) => {
              const g = gesto.current
              if (!g || g.id !== e.pointerId) return
              if (!g.movido && Math.abs(e.clientX - g.x) < 3) return
              g.movido = true
              g.actual = aF(e.clientX)
              setMoviendo(g.actual)
            }}
            onPointerUp={(e) => {
              const g = gesto.current
              if (!g || g.id !== e.pointerId) return
              gesto.current = null
              setMoviendo(null)
              if (!g.movido) onIr(g.f)
              else if (Math.abs(g.actual - g.f) > 1e-6) {
                onEmpezar()
                onMover(g.f, g.actual)
                onIr(g.actual)
              }
            }}
            onPointerCancel={() => {
              gesto.current = null
              setMoviendo(null)
            }}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onQuitar(k.f)
            }}
          />
        )
      })}
    </div>
  )
}
