import type React from 'react'
import { trazoTexto, type AlineacionTexto, type CapaTL, type RecorteCapa, type TextoTL } from '../../shared/timeline'

/**
 * Cómo se dibujan en el monitor el estilo y el anclaje de un rótulo, y cómo se ubica en el cuadro. Lo mismo que hace
 * el MP4 con libass (exportar.ts): contorno y sombra por fuera de la letra, anclaje por el borde al alinear, giro
 * sobre el punto de anclaje.
 */

/** El centro de un elemento en fracción del cuadro del monitor (`.monitor-cuadro`, su padre). */
export function centroEnCuadro(el: Element): { x: number; y: number } {
  const caja = el.getBoundingClientRect()
  const cuadro = (el.closest('.monitor-cuadro') ?? el.parentElement!).getBoundingClientRect()
  return { x: (caja.left + caja.width / 2 - cuadro.left) / cuadro.width, y: (caja.top + caja.height / 2 - cuadro.top) / cuadro.height }
}

/** Dónde se ancla un rótulo libre (su borde izquierdo, derecho o su centro) y cómo gira sobre ese punto. */
export function anclajeRotulo(t: Pick<TextoTL, 'alineacion' | 'giro'>, giro = t.giro): React.CSSProperties {
  const dx = t.alineacion === 'izquierda' ? '0' : t.alineacion === 'derecha' ? '-100%' : '-50%'
  return {
    transform: `translate(${dx}, -50%)${giro ? ` rotate(${giro}deg)` : ''}`,
    transformOrigin: t.alineacion === 'izquierda' ? 'left center' : t.alineacion === 'derecha' ? 'right center' : 'center',
    ...(t.alineacion ? { textAlign: t.alineacion === 'izquierda' ? 'left' : 'right' } : {})
  }
}

/** El contorno, la sombra, el espaciado, las mayúsculas y la opacidad de un rótulo. */
export function estiloRotulo(t: TextoTL): React.CSSProperties {
  const trazo = trazoTexto(t)
  return {
    ...(t.mayusculas ? { textTransform: 'uppercase' } : {}),
    ...(t.espaciado ? { letterSpacing: `${t.espaciado}em` } : {}),
    ...(t.opacidad !== undefined ? { opacity: t.opacidad } : {}),
    // El contorno por fuera de la letra (como \bord): el trazo es el doble y la letra se pinta encima.
    ...(trazo
      ? {
          WebkitTextStroke: trazo.contorno > 0 ? `${(trazo.contorno * 2).toFixed(3)}em ${trazo.colorContorno}` : undefined,
          paintOrder: 'stroke fill',
          textShadow: trazo.sombra > 0 ? `${trazo.sombra}em ${trazo.sombra}em 0 ${trazo.colorSombra}` : 'none'
        }
      : {})
  }
}

/** Lo que se ve del medio de una capa: recortado y volteado. */
export function estiloMedioCapa(c: Pick<CapaTL, 'recorte' | 'voltearH' | 'voltearV'>, recorte: RecorteCapa | undefined = c.recorte, radio = 0): React.CSSProperties | undefined {
  const r = recorte
  const voltea = c.voltearH || c.voltearV
  if (!r && !voltea && radio <= 0) return undefined
  const q = r ?? { izq: 0, der: 0, arriba: 0, abajo: 0 }
  return {
    // Lo recortado no se ve y lo que queda, con sus esquinas redondeadas.
    ...(r || radio > 0 ? { clipPath: `inset(${q.arriba * 100}% ${q.der * 100}% ${q.abajo * 100}% ${q.izq * 100}%${radio > 0 ? ` round ${radio.toFixed(2)}px` : ''})` } : {}),
    // El recorte va sobre la imagen ya volteada (como el MP4: hflip antes del recorte): el volteo va en el hijo.
    ...(voltea ? { ['--voltear' as string]: `scale(${c.voltearH ? -1 : 1}, ${c.voltearV ? -1 : 1})` } : {})
  }
}

/**
 * El sitio de un rótulo al cambiar su alineación (o al darle sitio propio para girarlo): el texto no se mueve, solo
 * su punto de anclaje pasa al borde que toca. `el` es el rótulo en el monitor.
 */
export function reanclarTexto(t: TextoTL, nueva: AlineacionTexto | undefined, el: HTMLElement | null): { x: number; y: number } | null {
  if (!el) return typeof t.x === 'number' && typeof t.y === 'number' ? { x: t.x, y: t.y } : null
  const cuadro = (el.closest('.monitor-cuadro') ?? el.parentElement!).getBoundingClientRect()
  if (!cuadro.width || !cuadro.height) return null
  // Sin sitio propio no está girado: su centro es el de la caja que se ve.
  const base = typeof t.x === 'number' && typeof t.y === 'number' ? { x: t.x, y: t.y, al: t.alineacion } : { ...centroEnCuadro(el), al: undefined }
  const w = el.offsetWidth
  const lado = (a: AlineacionTexto | undefined) => (a === 'izquierda' ? -w / 2 : a === 'derecha' ? w / 2 : 0)
  const d = lado(nueva) - lado(base.al)
  const g = ((t.giro ?? 0) * Math.PI) / 180
  return { x: base.x + (d * Math.cos(g)) / cuadro.width, y: base.y + (d * Math.sin(g)) / cuadro.height }
}

/** El rótulo de un texto en el monitor, si se ve. */
export const rotuloEnMonitor = (id: string): HTMLElement | null => document.querySelector(`.monitor-rotulo[data-texto="${CSS.escape(id)}"]`)
