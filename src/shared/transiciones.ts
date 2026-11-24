import type { TransicionClip } from './timeline'

/**
 * Cómo se ve en el monitor una transición, cuadro a cuadro, con las mismas fórmulas que `xfade` de FFmpeg (el MP4):
 * el clip que entra y el que sale (su último cuadro, quieto, como en el MP4) como dos capas con su desplazamiento,
 * escala, opacidad, máscara y recorte, y el color del fondo. Así el monitor y el video exportado coinciden.
 *
 * `q` va de 0 (empieza) a 1 (ya entró). FFmpeg usa `progress` = 1 − q.
 */

export interface CapaTransicion {
  /** Desplazamiento en fracciones del cuadro. */
  x: number
  y: number
  escalaX: number
  escalaY: number
  opacidad: number
  /** Una `mask-image` de CSS (alfa = cuánto se ve), o nada. */
  mascara?: string
  /** Un `clip-path` de CSS, o nada. */
  recorte?: string
  /** Cuánto pasa a blanco y negro (0 a 1). */
  gris: number
  /** Desenfoque horizontal (fracción del ancho del cuadro) y su corrimiento a la izquierda. */
  desenfoqueX: number
  visible: boolean
}

export interface VistaTransicion {
  entra: CapaTransicion
  sale: CapaTransicion
  /** El color de debajo de las dos (negro, o blanco al pasar por blanco). */
  fondo: string
  /** La que sale va encima (destapar, cerrar, aplastar). */
  saleEncima: boolean
}

const quieta = (): CapaTransicion => ({ x: 0, y: 0, escalaX: 1, escalaY: 1, opacidad: 1, gris: 0, desenfoqueX: 0, visible: true })

const pinza = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
/** El `smoothstep` de FFmpeg. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = pinza((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Paradas de un degradado de máscara: alfa en cada posición (0 a 1) de su recorrido. */
function paradas(alfa: (u: number) => number, n = 40, unidad = '%', escala = 100): string {
  const xs: string[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    xs.push(`rgba(0,0,0,${pinza(alfa(u), 0, 1).toFixed(4)}) ${(u * escala).toFixed(3)}${unidad}`)
  }
  return xs.join(', ')
}

/**
 * Pasar por negro o por blanco: cuánto se ve del que sale y del que entra a lo largo de la transición (49 puntos, de
 * q = 0 a 1), medido en el `fadeblack` de FFmpeg cuadro a cuadro (su código no da exactamente esto).
 */
const PASO_COLOR_SALE = [1.000, 0.941, 0.835, 0.697, 0.531, 0.370, 0.217, 0.083, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const PASO_COLOR_ENTRA = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.008, 0.028, 0.055, 0.071, 0.098, 0.126, 0.154, 0.189, 0.217, 0.256, 0.283, 0.323, 0.362, 0.394, 0.433, 0.472, 0.504, 0.543, 0.583, 0.618, 0.657, 0.685, 0.717, 0.744, 0.772, 0.791, 0.819, 0.839, 0.858, 0.886, 0.906, 0.925, 0.953, 0.972, 1]
function enTabla(tabla: number[], q: number): number {
  const x = pinza(q, 0, 1) * (tabla.length - 1)
  const i = Math.min(tabla.length - 2, Math.floor(x))
  return tabla[i] + (tabla[i + 1] - tabla[i]) * (x - i)
}

export function vistaTransicion(tipo: TransicionClip | undefined, q0: number): VistaTransicion {
  const q = pinza(q0, 0, 1)
  const P = 1 - q
  const entra = quieta()
  const sale = quieta()
  const v: VistaTransicion = { entra, sale, fondo: '#000', saleEncima: false }
  // Una máscara con borde suave en una dirección: alfa(u) del que entra, u de 0 a 1 por el cuadro.
  const lineal = (hacia: string, alfa: (u: number) => number) => (entra.mascara = `linear-gradient(${hacia}, ${paradas(alfa)})`)
  switch (tipo) {
    case 'a-negro':
    case 'destello': {
      // El que entra, encima con su peso; el que sale, debajo, con el suyo (sobre el fondo).
      entra.opacidad = enTabla(PASO_COLOR_ENTRA, q)
      sale.opacidad = entra.opacidad < 1 ? pinza(enTabla(PASO_COLOR_SALE, q) / (1 - entra.opacidad), 0, 1) : 0
      v.fondo = tipo === 'destello' ? '#fff' : '#000'
      return v
    }
    case 'gris': {
      const s1 = smoothstep(0.8, 1, P)
      const s2 = smoothstep(0.2, 1, P)
      sale.gris = 1 - s1
      entra.gris = s2
      entra.opacidad = 1 - P
      return v
    }
    case 'desenfoque': {
      // Desenfoque horizontal que crece hasta la mitad y baja, mientras se funden.
      const prog = P <= 0.5 ? P * 2 : (1 - P) * 2
      entra.desenfoqueX = sale.desenfoqueX = 0.5 * prog
      entra.opacidad = 1 - P
      return v
    }
    // Empujar: el que entra llega desde un lado y empuja al anterior.
    case 'barrido-izquierda':
      entra.x = P
      sale.x = -q
      return v
    case 'barrido-derecha':
      entra.x = -P
      sale.x = q
      return v
    case 'barrido-arriba':
      entra.y = P
      sale.y = -q
      return v
    case 'barrido-abajo':
      entra.y = -P
      sale.y = q
      return v
    // Tapar: el que entra pasa por encima del anterior, que no se mueve.
    case 'tapar-izquierda':
      entra.x = P
      return v
    case 'tapar-derecha':
      entra.x = -P
      return v
    case 'tapar-arriba':
      entra.y = P
      return v
    case 'tapar-abajo':
      entra.y = -P
      return v
    // Destapar: el anterior se va y deja ver el que entra, quieto debajo.
    case 'destapar-izquierda':
      sale.x = -q
      v.saleEncima = true
      return v
    case 'destapar-derecha':
      sale.x = q
      v.saleEncima = true
      return v
    case 'destapar-arriba':
      sale.y = -q
      v.saleEncima = true
      return v
    case 'destapar-abajo':
      sale.y = q
      v.saleEncima = true
      return v
    // Cortinas: un borde recto.
    case 'cortina-izquierda':
      entra.recorte = `inset(0 0 0 ${(P * 100).toFixed(3)}%)`
      return v
    case 'cortina-derecha':
      entra.recorte = `inset(0 ${(P * 100).toFixed(3)}% 0 0)`
      return v
    case 'cortina-arriba':
      entra.recorte = `inset(${(P * 100).toFixed(3)}% 0 0 0)`
      return v
    case 'cortina-abajo':
      entra.recorte = `inset(0 0 ${(P * 100).toFixed(3)}% 0)`
      return v
    // Barridos suaves: el borde difuminado de FFmpeg (smoothstep de una franja del ancho del cuadro).
    case 'suave-izquierda':
      lineal('to right', (u) => smoothstep(0, 1, 1 + u - 2 * P))
      return v
    case 'suave-derecha':
      lineal('to right', (u) => smoothstep(0, 1, 2 - u - 2 * P))
      return v
    case 'suave-arriba':
      lineal('to bottom', (u) => smoothstep(0, 1, 1 + u - 2 * P))
      return v
    case 'suave-abajo':
      lineal('to bottom', (u) => smoothstep(0, 1, 2 - u - 2 * P))
      return v
    case 'abrir-vertical':
      lineal('to right', (u) => smoothstep(0, 1, 2 - Math.abs(2 * u - 1) - 2 * P))
      return v
    case 'cerrar-vertical':
      lineal('to right', (u) => smoothstep(0, 1, 1 + Math.abs(2 * u - 1) - 2 * P))
      return v
    case 'abrir-horizontal':
      lineal('to bottom', (u) => smoothstep(0, 1, 2 - Math.abs(2 * u - 1) - 2 * P))
      return v
    case 'cerrar-horizontal':
      lineal('to bottom', (u) => smoothstep(0, 1, 1 + Math.abs(2 * u - 1) - 2 * P))
      return v
    case 'reloj': {
      // El ángulo de FFmpeg es atan2(x, y) desde abajo; el de CSS, desde arriba en el sentido del reloj: θ = 180° − α.
      const alfa = (u: number) => {
        const theta = Math.PI - u * 2 * Math.PI
        return smoothstep(0, 1, theta - (P - 0.5) * Math.PI * 2.5)
      }
      entra.mascara = `conic-gradient(from 0deg at 50% 50%, ${paradas(alfa, 120, 'deg', 360)})`
      return v
    }
    case 'circulo-cierra':
      entra.mascara = `radial-gradient(circle farthest-corner at 50% 50%, ${paradas((r) => smoothstep(0, 1, r + 1.5 - 3 * P))})`
      return v
    case 'iris-negro': {
      // Se cierra en un círculo sobre negro hasta la mitad y luego abre el siguiente.
      const r = (2 * Math.abs(P - 0.5)) ** 3
      const quien = P < 0.5 ? entra : sale
      if (P < 0.5) sale.visible = false
      else {
        entra.visible = false
        v.saleEncima = true
      }
      quien.recorte = `circle(${((r * 100) / Math.SQRT2).toFixed(3)}% at 50% 50%)`
      return v
    }
    case 'cuadro-negro': {
      const m = (0.5 - Math.abs(P - 0.5)) * 100
      const quien = P < 0.5 ? entra : sale
      if (P < 0.5) sale.visible = false
      else {
        entra.visible = false
        v.saleEncima = true
      }
      quien.recorte = `inset(${m.toFixed(3)}%)`
      return v
    }
    case 'zoom': {
      // El anterior se mete en el centro (zoom ×1/zf) y el siguiente aparece fundiéndose.
      const zf = smoothstep(0.5, 1, P)
      sale.escalaX = sale.escalaY = 1 / Math.max(zf, 0.01)
      entra.opacidad = 1 - smoothstep(0, 0.5, P)
      return v
    }
    case 'aplastar-vertical':
      sale.escalaY = P
      sale.visible = P > 0
      v.saleEncima = true
      return v
    case 'aplastar-horizontal':
      sale.escalaX = P
      sale.visible = P > 0
      v.saleEncima = true
      return v
    case 'circulo':
      entra.mascara = `radial-gradient(circle farthest-corner at 50% 50%, ${paradas((r) => 1 - smoothstep(0, 1, r + 3 * P - 1.5))})`
      return v
    default:
      // Fundido: B encima con opacidad q.
      entra.opacidad = q
      return v
  }
}
