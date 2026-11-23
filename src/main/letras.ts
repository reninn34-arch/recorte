import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import type { LetraTL } from '../shared/timeline'

/**
 * Las letras propias de un proyecto (un .ttf o .otf que trae el agente, como la Montserrat de una marca): se copian a
 * `fuentes/` del proyecto y se leen su nombre y sus medidas. El monitor las carga con @font-face y el MP4 (libass) las
 * busca por su nombre en esa misma carpeta (fontsdir), así los dos dibujan la misma letra.
 */

/** Lo que dice el archivo de una letra: su nombre completo (con el que la busca libass), su alto de línea y si es cursiva. */
export interface InfoLetra {
  /** El nombre completo (nameID 4, p. ej. «Montserrat ExtraBold»): libass la encuentra por él. */
  familia: string
  /** Su alto de línea en emes, como lo usa libass (usWinAscent + usWinDescent de OS/2, entre unitsPerEm). */
  linea: number
  cursiva: boolean
}

/** Lee el nombre y las medidas de una letra TrueType u OpenType. Null si no es una letra que se pueda leer. */
export function leerLetra(ruta: string): InfoLetra | null {
  try {
    const b = readFileSync(ruta)
    const firma = b.readUInt32BE(0)
    // TrueType (0x00010000 o «true») u OpenType con CFF («OTTO»).
    if (firma !== 0x00010000 && firma !== 0x74727565 && firma !== 0x4f54544f) return null
    const n = b.readUInt16BE(4)
    const tablas = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const p = 12 + i * 16
      tablas.set(b.toString('latin1', p, p + 4), b.readUInt32BE(p + 8))
    }
    const head = tablas.get('head')
    const os2 = tablas.get('OS/2')
    const name = tablas.get('name')
    if (head === undefined || name === undefined) return null
    const unidades = b.readUInt16BE(head + 18) || 1000
    // libass mide el alto de línea con usWinAscent + usWinDescent (si no, con hhea).
    let linea = 0
    let cursiva = false
    if (os2 !== undefined) {
      linea = (b.readUInt16BE(os2 + 74) + b.readUInt16BE(os2 + 76)) / unidades
      cursiva = (b.readUInt16BE(os2 + 62) & 1) === 1
    }
    if (!(linea > 0.5 && linea < 4)) {
      const hhea = tablas.get('hhea')
      if (hhea !== undefined) linea = (b.readInt16BE(hhea + 4) - b.readInt16BE(hhea + 6)) / unidades
    }
    if (!(linea > 0.5 && linea < 4)) linea = 1.2
    // Los nombres: el de Windows (plataforma 3, UTF-16) en inglés si lo hay; si no, el primero que haya.
    const cuenta = b.readUInt16BE(name + 2)
    const textos = name + b.readUInt16BE(name + 4)
    const nombres = new Map<number, { texto: string; ingles: boolean }>()
    for (let i = 0; i < cuenta; i++) {
      const r = name + 6 + i * 12
      const plataforma = b.readUInt16BE(r)
      const idioma = b.readUInt16BE(r + 4)
      const id = b.readUInt16BE(r + 6)
      const largo = b.readUInt16BE(r + 8)
      const desde = textos + b.readUInt16BE(r + 10)
      if (id !== 1 && id !== 4) continue
      let texto = ''
      if (plataforma === 3 || plataforma === 0) {
        for (let k = 0; k + 1 < largo; k += 2) texto += String.fromCharCode(b.readUInt16BE(desde + k))
      } else if (plataforma === 1) texto = b.toString('latin1', desde, desde + largo)
      else continue
      const ingles = plataforma === 3 ? idioma === 0x409 : plataforma === 1 ? idioma === 0 : false
      const antes = nombres.get(id)
      if (texto.trim() && (!antes || (!antes.ingles && ingles))) nombres.set(id, { texto: texto.trim(), ingles })
    }
    const familia = nombres.get(4)?.texto ?? nombres.get(1)?.texto
    return familia ? { familia, linea: Math.round(linea * 1000) / 1000, cursiva } : null
  } catch {
    return null
  }
}

/**
 * Copia una letra a `fuentes/` del proyecto (una vez: si ya está la misma, la reusa) y devuelve su ficha para la
 * timeline. Null si el archivo no es una letra.
 */
export function registrarLetra(carpetaProyecto: string, ruta: string): LetraTL | null {
  if (!existsSync(ruta) || !/\.(ttf|otf)$/i.test(ruta)) return null
  const info = leerLetra(ruta)
  if (!info) return null
  const contenido = readFileSync(ruta)
  const huella = createHash('sha1').update(contenido).digest('hex').slice(0, 8)
  const nombreArchivo = `${basename(ruta, extname(ruta)).replace(/[^\w.-]+/g, '-').slice(0, 60)}-${huella}${extname(ruta).toLowerCase()}`
  const destino = join(carpetaProyecto, 'fuentes')
  mkdirSync(destino, { recursive: true })
  if (!existsSync(join(destino, nombreArchivo))) copyFileSync(ruta, join(destino, nombreArchivo))
  return {
    id: `letra-${huella}`,
    nombre: info.familia,
    familia: info.familia,
    archivo: `fuentes/${nombreArchivo}`,
    linea: info.linea,
    ...(info.cursiva ? { cursiva: true } : {})
  }
}
