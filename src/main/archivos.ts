import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { basename, extname, join } from 'node:path'
import { resolverBinario } from './binarios'

/**
 * Lo que sube el usuario antes de entrar a una creación: los .zip se descomprimen (y se
 * usan las fotos y videos que traen) y las fotos HEIC/HEIF del iPhone se convierten a JPG,
 * que es lo que entienden el navegador, HyperFrames y los agentes. El resto pasa tal cual.
 */

export const EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp']
export const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v']
export const EXT_HEIC = ['.heic', '.heif']
/** Audios: una narración grabada (también los .ogg/.opus de WhatsApp) sobre la que se arma el video. */
export const EXT_AUDIO = ['.mp3', '.wav', '.m4a', '.ogg', '.opus', '.aac', '.flac']
/**
 * Audio o video en un formato que el resto de Recorte no usa (un .mpeg de un grabador o de WhatsApp, un .avi, un .3gp de un
 * teléfono viejo…): al subirlo se mira qué trae por dentro y se pasa a uno que sí (.mp3/.m4a el audio, .mp4 el video).
 */
export const EXT_CONVERTIBLE = ['.mpeg', '.mpg', '.mpga', '.mp2', '.avi', '.wmv', '.wma', '.3gp', '.3g2', '.ts', '.mts', '.m2ts', '.flv', '.amr', '.aiff', '.aif', '.caf', '.weba', '.oga']
/** Lo que se puede elegir en «Adjuntar» (sin punto). */
export const EXTENSIONES_SUBIBLES = [...EXT_IMAGEN, ...EXT_HEIC, ...EXT_VIDEO, ...EXT_AUDIO, ...EXT_CONVERTIBLE, '.zip'].map((e) => e.slice(1))

/** Lo más que entra en una creación (una carpeta de material puede traer muchos). */
const MAX_ARCHIVOS = 80

function correr(exe: string, args: string[], timeoutMs: number): Promise<boolean> {
  return new Promise((ok) => {
    const hijo = spawn(exe, args, { windowsHide: true })
    const reloj = setTimeout(() => hijo.kill(), timeoutMs)
    hijo.on('error', () => (clearTimeout(reloj), ok(false)))
    hijo.on('close', (c) => (clearTimeout(reloj), ok(c === 0)))
  })
}

/**
 * Saca de un .zip las fotos y videos, leyéndolo aquí mismo (sin `tar`: el de Windows falla
 * con carpetas que terminan en espacio, como las de los zip de Google Drive). Solo «stored»
 * y «deflate», que es lo que usan casi todos; sin ZIP64. Los nombres se limpian: nada de
 * rutas con «..», espacios o puntos al final, ni caracteres que Windows no admite.
 */
function descomprimir(zip: string, destino: string): boolean {
  const tam = statSync(zip).size
  if (tam > 2 * 1024 ** 3) return false
  const b = readFileSync(zip)
  // Fin del directorio central: la firma 0x06054b50, buscada desde el final.
  let fin = -1
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) return false
  const total = b.readUInt16LE(fin + 10)
  let p = b.readUInt32LE(fin + 16)
  mkdirSync(destino, { recursive: true })
  const usados = new Set<string>()
  let sacados = 0
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break
    const flags = b.readUInt16LE(p + 8)
    const metodo = b.readUInt16LE(p + 10)
    const comprimido = b.readUInt32LE(p + 20)
    const largoNombre = b.readUInt16LE(p + 28)
    const largoExtra = b.readUInt16LE(p + 30)
    const largoComentario = b.readUInt16LE(p + 32)
    const local = b.readUInt32LE(p + 42)
    const nombre = b.subarray(p + 46, p + 46 + largoNombre).toString(flags & 0x800 ? 'utf8' : 'latin1')
    p += 46 + largoNombre + largoExtra + largoComentario
    const partes = nombre.split(/[\/]/).filter(Boolean)
    const base = partes[partes.length - 1] ?? ''
    if (!base || nombre.endsWith('/') || partes.includes('__MACOSX') || base.startsWith('._')) continue
    const ext = extname(base).toLowerCase()
    if (![...EXT_IMAGEN, ...EXT_VIDEO, ...EXT_HEIC].includes(ext)) continue
    if (comprimido === 0xffffffff || local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) continue
    const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28)
    const datos = b.subarray(inicio, inicio + comprimido)
    let contenido: Buffer
    try {
      if (metodo === 0) contenido = Buffer.from(datos)
      else if (metodo === 8) contenido = inflateRawSync(datos)
      else continue
    } catch {
      continue
    }
    let limpio = base.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim() || `archivo${ext}`
    while (usados.has(limpio.toLowerCase())) limpio = `${++sacados}-${limpio}`
    usados.add(limpio.toLowerCase())
    writeFileSync(join(destino, limpio), contenido)
    sacados++
  }
  return true
}

/** Los archivos dentro de una carpeta (sin la basura de macOS), en orden. */
function listar(dir: string, nivel = 0): string[] {
  const salida: string[] = []
  for (const n of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
    if (n === '__MACOSX' || n.startsWith('._') || n === '.DS_Store') continue
    const r = join(dir, n)
    if (statSync(r).isDirectory()) {
      if (nivel < 4) salida.push(...listar(r, nivel + 1))
    } else salida.push(r)
  }
  return salida
}

/** Una foto HEIC/HEIF convertida a JPG de alta calidad (FFmpeg las lee, con su orientación). */
async function heicAJpg(ruta: string, destino: string): Promise<string | null> {
  mkdirSync(destino, { recursive: true })
  const salida = join(destino, `${basename(ruta, extname(ruta))}.jpg`)
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  const ok = await correr(ffmpeg, ['-v', 'error', '-y', '-i', ruta, '-frames:v', '1', '-q:v', '2', salida], 2 * 60_000)
  return ok && existsSync(salida) ? salida : null
}

/** Lo que imprime un programa (para leer a ffprobe), o null si falló. */
function salidaDe(exe: string, args: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((ok) => {
    let texto = ''
    const hijo = spawn(exe, args, { windowsHide: true })
    const reloj = setTimeout(() => hijo.kill(), timeoutMs)
    hijo.stdout.on('data', (b: Buffer) => (texto += b.toString('utf8')))
    hijo.on('error', () => (clearTimeout(reloj), ok(null)))
    hijo.on('close', (c) => (clearTimeout(reloj), ok(c === 0 ? texto : null)))
  })
}

/**
 * Un audio o video en un formato que Recorte no usa, pasado a uno que sí: se mira qué trae (ffprobe). Con imagen en
 * movimiento, un .mp4; solo sonido, un .mp3 si ya es MP3 por dentro (se copia, sin perder calidad) o un .m4a. null si no
 * trae ni lo uno ni lo otro, o no se pudo.
 */
export async function convertirMedio(ruta: string, destino: string): Promise<string | null> {
  const ffprobe = resolverBinario('ffprobe') ?? 'ffprobe'
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  const info = await salidaDe(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:stream_disposition=attached_pic', '-of', 'json', ruta], 60_000)
  if (!info) return null
  let pistas: { codec_type?: string; codec_name?: string; disposition?: { attached_pic?: number } }[] = []
  try {
    pistas = (JSON.parse(info) as { streams?: typeof pistas }).streams ?? []
  } catch {
    return null
  }
  // La portada de un audio (una imagen pegada) no cuenta como video.
  const video = pistas.some((p) => p.codec_type === 'video' && !p.disposition?.attached_pic)
  const audio = pistas.find((p) => p.codec_type === 'audio')
  if (!video && !audio) return null
  mkdirSync(destino, { recursive: true })
  // «Your ready.mp3.mpeg» → «Your ready.mp3»: sin repetir la extensión que ya traía el nombre.
  const nombre = basename(ruta, extname(ruta)).replace(/\.(mp3|m4a|wav|aac|mp4|mov)$/i, '')
  let salida: string
  let args: string[]
  if (video) {
    salida = join(destino, `${nombre}.mp4`)
    args = ['-v', 'error', '-y', '-i', ruta, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', salida]
  } else if (audio?.codec_name === 'mp3') {
    salida = join(destino, `${nombre}.mp3`)
    args = ['-v', 'error', '-y', '-i', ruta, '-map', '0:a:0', '-c:a', 'copy', salida]
  } else {
    salida = join(destino, `${nombre}.m4a`)
    args = ['-v', 'error', '-y', '-i', ruta, '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', salida]
  }
  const ok = await correr(ffmpeg, args, 20 * 60_000)
  return ok && existsSync(salida) ? salida : null
}

/**
 * Deja la lista lista para usar: abre los zip, convierte los HEIC y descarta lo que no sirve.
 * `trabajo` es una carpeta temporal donde quedan los archivos convertidos o descomprimidos.
 */
export async function prepararArchivos(rutas: string[], trabajo: string): Promise<{ listos: string[]; descartados: string[] }> {
  const listos: string[] = []
  const descartados: string[] = []
  let n = 0
  const tratar = async (ruta: string, deCarpeta = false): Promise<void> => {
    if (listos.length >= MAX_ARCHIVOS) return
    // Una carpeta de material: entra todo lo que sirva de dentro (también subcarpetas).
    if (statSync(ruta).isDirectory()) {
      const antes = listos.length
      const archivos = listar(ruta)
      for (const a of archivos) await tratar(a, true)
      if (listos.length === antes) descartados.push(`${basename(ruta)} (la carpeta no tiene fotos ni videos)`)
      else if (listos.length >= MAX_ARCHIVOS && archivos.length > listos.length - antes) descartados.push(`${basename(ruta)}: solo entran ${MAX_ARCHIVOS} archivos`)
      return
    }
    const ext = extname(ruta).toLowerCase()
    if (EXT_IMAGEN.includes(ext) || EXT_VIDEO.includes(ext) || EXT_AUDIO.includes(ext)) {
      listos.push(ruta)
    } else if (EXT_HEIC.includes(ext)) {
      const jpg = await heicAJpg(ruta, join(trabajo, `heic-${++n}`))
      if (jpg) listos.push(jpg)
      else descartados.push(`${basename(ruta)} (no pude convertir la foto HEIC)`)
    } else if (EXT_CONVERTIBLE.includes(ext)) {
      const convertido = await convertirMedio(ruta, join(trabajo, `medio-${++n}`))
      if (convertido) listos.push(convertido)
      else descartados.push(`${basename(ruta)} (no pude leer su audio ni su video)`)
    } else if (ext === '.zip') {
      const dentro = join(trabajo, `zip-${++n}`)
      if (!descomprimir(ruta, dentro)) {
        descartados.push(`${basename(ruta)} (no pude abrir el zip)`)
        return
      }
      const archivos = listar(dentro)
      const antes = listos.length
      for (const a of archivos) await tratar(a)
      if (listos.length === antes) descartados.push(`${basename(ruta)} (no traía fotos ni videos)`)
    } else if (!deCarpeta) {
      // Dentro de una carpeta, lo que no es foto o video (documentos, textos…) se salta sin avisar.
      descartados.push(`${basename(ruta)} (formato que Recorte no usa)`)
    }
  }
  for (const r of rutas) if (existsSync(r)) await tratar(r)
  return { listos, descartados }
}
