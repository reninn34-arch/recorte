import type { CSSProperties } from 'react'
import type { CapaTransicion } from '../../shared/transiciones'

/** El estilo de una de las dos capas de una transición (la que entra o la que sale), con su orden encima o debajo. */
export function estiloCapaTransicion(c: CapaTransicion, idFiltro: string, ancho: number, z: number): CSSProperties {
  const mover = c.x || c.y || c.desenfoqueX
  const escalar = c.escalaX !== 1 || c.escalaY !== 1
  const filtros = `${c.gris > 0.001 ? `grayscale(${c.gris.toFixed(4)}) ` : ''}${c.desenfoqueX > 0 && ancho > 0 ? `url(#${idFiltro})` : ''}`.trim()
  return {
    zIndex: z,
    // Oculta con opacidad (no con visibility: el video de dentro se marca visible y se vería igual).
    opacity: !c.visible ? 0 : c.opacidad < 1 ? Math.max(0, c.opacidad) : undefined,
    transform:
      mover || escalar
        ? `${mover ? `translate(${((c.x - c.desenfoqueX / 2) * 100).toFixed(3)}%, ${(c.y * 100).toFixed(3)}%) ` : ''}${escalar ? `scale(${c.escalaX.toFixed(4)}, ${c.escalaY.toFixed(4)})` : ''}`.trim()
        : undefined,
    transformOrigin: c.origen ? `${(c.origen[0] * 100).toFixed(4)}% ${(c.origen[1] * 100).toFixed(4)}%` : undefined,
    clipPath: c.recorte,
    maskImage: c.mascara,
    WebkitMaskImage: c.mascara,
    maskSize: c.mascara ? '100% 100%' : undefined,
    WebkitMaskSize: c.mascara ? '100% 100%' : undefined,
    filter: filtros || undefined
  }
}
