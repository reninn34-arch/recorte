/**
 * LUT 3D en formato .cube (el de Premiere, DaVinci y casi todos los packs de looks): leerlo, mezclarlo con la imagen
 * original (su intensidad) y volver a escribirlo. El monitor lo aplica con WebGL y el MP4 con lut3d de FFmpeg, sobre
 * los mismos números.
 */

export interface Lut3D {
  /** Puntos por lado (17, 33, 65…). */
  tamano: number
  /** r, g, b de cada punto, de 0 a 1, con el rojo variando más rápido (el orden del .cube). */
  datos: Float32Array
  titulo?: string
}

/** El tamaño más grande que se acepta (65³ ya son 274 625 puntos). */
export const MAX_TAMANO_LUT = 65

/** Lee un .cube 3D. Lanza un error que se puede enseñar si no lo es. */
export function leerCube(texto: string): Lut3D {
  let tamano = 0
  let titulo: string | undefined
  let min = [0, 0, 0]
  let max = [1, 1, 1]
  const valores: number[] = []
  for (const linea0 of texto.split(/\r?\n/)) {
    const linea = linea0.trim()
    if (!linea || linea.startsWith('#')) continue
    const [clave, ...resto] = linea.split(/\s+/)
    const mayus = clave.toUpperCase()
    if (mayus === 'TITLE') titulo = linea.slice(5).trim().replace(/^"|"$/g, '')
    else if (mayus === 'LUT_3D_SIZE') tamano = Number(resto[0])
    else if (mayus === 'LUT_1D_SIZE') throw new Error('Es un LUT de 1D: hace falta uno 3D (LUT_3D_SIZE).')
    else if (mayus === 'DOMAIN_MIN') min = resto.slice(0, 3).map(Number)
    else if (mayus === 'DOMAIN_MAX') max = resto.slice(0, 3).map(Number)
    else if (/^[-+.\d]/.test(clave)) {
      const tres = [clave, ...resto].slice(0, 3).map(Number)
      if (tres.length === 3 && tres.every(Number.isFinite)) valores.push(...tres)
    }
  }
  if (!Number.isInteger(tamano) || tamano < 2 || tamano > MAX_TAMANO_LUT) throw new Error('No es un LUT 3D válido (falta LUT_3D_SIZE o es demasiado grande).')
  if (valores.length !== tamano * tamano * tamano * 3) throw new Error(`El LUT dice ${tamano}³ puntos pero trae ${Math.floor(valores.length / 3)}.`)
  // Lo llevamos todo a 0–1.
  const datos = new Float32Array(valores.length)
  for (let i = 0; i < valores.length; i++) {
    const c = i % 3
    const v = (valores[i] - min[c]) / Math.max(1e-6, max[c] - min[c])
    datos[i] = Math.min(1, Math.max(0, v))
  }
  return { tamano, datos, ...(titulo ? { titulo } : {}) }
}

/** El LUT mezclado con la imagen original: intensidad 1 es el LUT tal cual, 0 no cambia nada. */
export function mezclarLut(lut: Lut3D, intensidad: number): Lut3D {
  const k = Math.min(1, Math.max(0, intensidad))
  if (k >= 0.999) return lut
  const n = lut.tamano
  const datos = new Float32Array(lut.datos.length)
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) {
        const i = ((b * n + g) * n + r) * 3
        const id = [r / (n - 1), g / (n - 1), b / (n - 1)]
        for (let c = 0; c < 3; c++) datos[i + c] = id[c] + (lut.datos[i + c] - id[c]) * k
      }
  return { ...lut, datos }
}

export function escribirCube(lut: Lut3D): string {
  const filas: string[] = ['TITLE "Recorte"', `LUT_3D_SIZE ${lut.tamano}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1']
  for (let i = 0; i < lut.datos.length; i += 3) filas.push(`${lut.datos[i].toFixed(6)} ${lut.datos[i + 1].toFixed(6)} ${lut.datos[i + 2].toFixed(6)}`)
  return filas.join(String.fromCharCode(10)) + String.fromCharCode(10)
}

/** El color que da el LUT a un color (0 a 1), por interpolación trilineal (lo mismo que hacen lut3d y WebGL). */
export function aplicarLut(lut: Lut3D, rgb: [number, number, number]): [number, number, number] {
  const n = lut.tamano
  const p = rgb.map((v) => Math.min(1, Math.max(0, v)) * (n - 1))
  const i0 = p.map((v) => Math.min(n - 2, Math.floor(v)))
  const f = p.map((v, c) => v - i0[c])
  const en = (r: number, g: number, b: number, c: number) => lut.datos[((b * n + g) * n + r) * 3 + c]
  const salida: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    let v = 0
    for (let db = 0; db < 2; db++)
      for (let dg = 0; dg < 2; dg++)
        for (let dr = 0; dr < 2; dr++) {
          const w = (dr ? f[0] : 1 - f[0]) * (dg ? f[1] : 1 - f[1]) * (db ? f[2] : 1 - f[2])
          v += w * en(i0[0] + dr, i0[1] + dg, i0[2] + db, c)
        }
    salida[c] = v
  }
  return salida
}
