import { useEffect, useState } from 'react'
import type { TransicionClip } from '../../../shared/timeline'
import { vistaTransicion } from '../../../shared/transiciones'
import { estiloCapaTransicion } from '../transicionCss'

/**
 * La muestra de una transición en el panel: dos cuadros (A sale, B entra) con la misma fórmula que el monitor y el
 * MP4. Quieta a mitad de camino; al pasar el ratón, se repite entera.
 */
export function MuestraTransicion({ tipo, viva }: { tipo: TransicionClip; viva: boolean }) {
  const [q, setQ] = useState(0.5)
  useEffect(() => {
    if (!viva) {
      setQ(0.5)
      return
    }
    let id = 0
    const t0 = performance.now()
    // 1,2 s de transición y 0,4 s quieta al final, en bucle.
    const paso = (ahora: number) => {
      const t = ((ahora - t0) / 1000) % 1.6
      setQ(Math.min(1, t / 1.2))
      id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [viva])
  const v = vistaTransicion(tipo, q)
  const ancho = 84
  return (
    <span className="tr-muestra" style={{ background: v.fondo }} aria-hidden="true">
      <span className="tr-muestra-a" style={estiloCapaTransicion(v.sale, `tr-muestra-${tipo}-a`, ancho, v.saleEncima ? 2 : 0)}>
        A
      </span>
      <span className="tr-muestra-b" style={estiloCapaTransicion(v.entra, `tr-muestra-${tipo}-b`, ancho, 1)}>
        B
      </span>
      {(v.entra.desenfoqueX > 0 || v.sale.desenfoqueX > 0) && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          {(['a', 'b'] as const).map((k) => (
            <filter key={k} id={`tr-muestra-${tipo}-${k}`} x="-50%" width="200%">
              <feGaussianBlur stdDeviation={`${(((k === 'a' ? v.sale : v.entra).desenfoqueX * ancho) / 3.4).toFixed(2)} 0`} />
            </filter>
          ))}
        </svg>
      )}
    </span>
  )
}
