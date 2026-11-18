import { existsSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

/**
 * La configuración de Codex (`~/.codex/config.toml`) dañada deja a Codex sin arrancar: ni
 * conectar, ni hacer videos, ni imágenes («Error loading configuration: …config.toml:1:3276:
 * key with no value»). Recorte no escribe ese archivo, pero si otro programa o una edición a
 * mano lo rompe, Recorte lo aparta (renombrado, sin borrar nada) y sigue, y avisa.
 *
 * Quién juzga si está dañado es el propio Codex (`codex login status` carga la configuración
 * igual que el resto de órdenes), no un lector de TOML de Recorte que podría no coincidir con
 * el suyo y apartar una configuración buena. Se vuelve a mirar solo si el archivo cambió.
 */

export const carpetaCodex = () => process.env.CODEX_HOME || join(homedir(), '.codex')

const ERROR_CONFIG = /Error loading config(?:uration)?:\s*([^\r\n]*)/i

/** Si `salida` es el error de Codex con su configuración dañada, aparta ese archivo y devuelve el aviso. */
export function apartarConfigDanada(salida: string, ahora = new Date()): string | null {
  const m = ERROR_CONFIG.exec(salida)
  if (!m) return null
  const detalle = m[1].trim()
  const carpeta = resolve(carpetaCodex())
  const nombrada = /^(.+?\.toml)(?::\d+)/i.exec(detalle)?.[1]
  // Solo se toca un .toml de la carpeta de Codex; si el error no dice cuál, es config.toml.
  const ruta =
    nombrada && resolve(nombrada).toLowerCase().startsWith(carpeta.toLowerCase()) ? resolve(nombrada) : join(carpeta, 'config.toml')
  if (!existsSync(ruta)) return null
  const sello = ahora.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const destino = `${ruta}.danado-${sello}`
  try {
    renameSync(ruta, destino)
  } catch {
    return null
  }
  return `La configuración de Codex (${basename(ruta)}) estaba dañada y no lo dejaba arrancar. La aparté como ${basename(destino)} (no se borró nada) y seguí sin ella.`
}

let revisada = ''

/**
 * Antes de usar Codex: si su config.toml cambió desde la última vez, pregunta a Codex si la
 * puede cargar y, si no, la aparta. Devuelve el aviso para el usuario, o null si no hizo nada.
 */
export async function sanearConfigCodex(correr: (orden: string) => Promise<{ salida: string }>): Promise<string | null> {
  const ruta = join(carpetaCodex(), 'config.toml')
  let firma: string
  try {
    const s = statSync(ruta)
    firma = `${s.mtimeMs}-${s.size}`
  } catch {
    return null
  }
  if (firma === revisada) return null
  const { salida } = await correr('codex login status')
  const aviso = apartarConfigDanada(salida)
  if (!aviso) revisada = firma
  return aviso
}
