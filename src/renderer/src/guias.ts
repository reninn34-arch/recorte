/**
 * Las guías del monitor: la zona segura (como Premiere y HyperFrames) y el imán que pega lo que se arrastra a los
 * bordes, al centro, a los tercios, a la zona segura y a las otras capas y textos. Todo en fracción del cuadro. Son
 * solo ayuda para colocar: no salen en el video.
 */

/** La zona segura de acción (lo visible): el 90 % del cuadro, un 5 % por lado. */
export const ZONA_ACCION = 0.05
/** La zona segura de títulos (textos y lo importante): el 80 % del cuadro, un 10 % por lado. */
export const ZONA_TITULO = 0.1

/** Una caja en fracción del cuadro. */
export interface Caja {
  izq: number
  der: number
  arriba: number
  abajo: number
}

/** A qué se pega lo que se arrastra en cada eje: cada línea con su tipo (para dibujarla distinta). */
export interface Objetivos {
  x: { v: number; tipo: TipoGuia }[]
  y: { v: number; tipo: TipoGuia }[]
}
export type TipoGuia = 'cuadro' | 'zona' | 'objeto'

/** Las líneas del cuadro (bordes, centro y tercios), la zona segura si se ve y los bordes y centros de las demás cajas. */
export function objetivosIman(otras: Caja[], conZona: boolean): Objetivos {
  const cuadro = [0, 1 / 3, 0.5, 2 / 3, 1]
  const zona = conZona ? [ZONA_ACCION, ZONA_TITULO, 1 - ZONA_TITULO, 1 - ZONA_ACCION] : []
  const x: Objetivos['x'] = [...cuadro.map((v) => ({ v, tipo: 'cuadro' as const })), ...zona.map((v) => ({ v, tipo: 'zona' as const }))]
  const y: Objetivos['y'] = [...cuadro.map((v) => ({ v, tipo: 'cuadro' as const })), ...zona.map((v) => ({ v, tipo: 'zona' as const }))]
  for (const c of otras) {
    x.push({ v: c.izq, tipo: 'objeto' }, { v: (c.izq + c.der) / 2, tipo: 'objeto' }, { v: c.der, tipo: 'objeto' })
    y.push({ v: c.arriba, tipo: 'objeto' }, { v: (c.arriba + c.abajo) / 2, tipo: 'objeto' }, { v: c.abajo, tipo: 'objeto' })
  }
  return { x, y }
}

/**
 * Pega una posición en un eje: `pos` es el punto de anclaje y `puntos` dónde quedan, respecto a él, el borde de un
 * lado, el centro y el del otro. Si alguno queda a menos de `umbral` de una línea, se corre lo justo para tocarla.
 * Devuelve la posición y las líneas que toca (para verlas).
 */
export function imanEje(pos: number, puntos: number[], lineas: { v: number; tipo: TipoGuia }[], umbral: number): { pos: number; guias: { v: number; tipo: TipoGuia }[] } {
  let mejor: { d: number } | null = null
  for (const p of puntos)
    for (const l of lineas) {
      const d = l.v - (pos + p)
      if (Math.abs(d) < umbral && (!mejor || Math.abs(d) < Math.abs(mejor.d) - 1e-9)) mejor = { d }
    }
  if (!mejor) return { pos, guias: [] }
  const final = pos + mejor.d
  // Todas las líneas que toca ya pegado (un borde y el centro de otra capa a la vez, por ejemplo).
  const guias = lineas.filter((l) => puntos.some((p) => Math.abs(final + p - l.v) < 1e-6))
  return { pos: final, guias: guias.filter((g, i) => guias.findIndex((o) => Math.abs(o.v - g.v) < 1e-6) === i) }
}

/** La caja de un elemento del monitor en fracción del cuadro. */
export function cajaEnCuadro(r: DOMRect, cuadro: DOMRect): Caja {
  return { izq: (r.left - cuadro.left) / cuadro.width, der: (r.right - cuadro.left) / cuadro.width, arriba: (r.top - cuadro.top) / cuadro.height, abajo: (r.bottom - cuadro.top) / cuadro.height }
}
