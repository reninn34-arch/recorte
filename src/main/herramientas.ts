import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { anadirCarpetaBinarios } from './binarios'

/**
 * Las herramientas que Recorte baja con un botón (como Sloth): FFmpeg, Python y Node.js,
 * cada una en `<userData>/herramientas/`, sin instalar nada en Windows ni en el Mac ni tocar las que
 * el usuario ya tenga. Se bajan de su fuente oficial y se comprueba su huella SHA-256:
 *
 * - FFmpeg: en Windows, la compilación GPL de BtbN; en Mac, la estática de Martin Riedl (las dos traen x264 y
 *   libass, que usa toda la exportación). Recorte no la reparte: el usuario la baja de su página y la app la llama
 *   como programa aparte.
 * - Python: python-build-standalone (astral-sh), un Python completo y portátil, con pip.
 * - Node.js: el zip oficial de nodejs.org (la LTS), para instalar agentes y HyperFrames.
 */

export type IdDescargable = 'ffmpeg' | 'python' | 'node'
export const DESCARGABLES: IdDescargable[] = ['ffmpeg', 'python', 'node']

const raiz = () => join(app.getPath('userData'), 'herramientas')

const EN_MAC = process.platform === 'darwin'
/** Dónde se puede bajar: Windows (x64) y Mac (Apple Silicon o Intel). */
export const PUEDE_BAJAR = process.platform === 'win32' || EN_MAC
/** El equipo, como lo llaman los paquetes. */
const OBJETIVO: 'win-x64' | 'mac-arm64' | 'mac-x64' = EN_MAC ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64') : 'win-x64'

export function carpetas(): Record<IdDescargable, string[]> {
  if (EN_MAC) {
    return {
      ffmpeg: [join(raiz(), 'ffmpeg', 'bin')],
      python: [join(raiz(), 'python', 'bin')],
      node: [join(raiz(), 'node', 'bin')]
    }
  }
  return {
    ffmpeg: [join(raiz(), 'ffmpeg', 'bin')],
    python: [join(raiz(), 'python'), join(raiz(), 'python', 'Scripts')],
    node: [join(raiz(), 'node')]
  }
}

/** El programa de cada herramienta dentro de lo bajado. */
function programa(id: IdDescargable): string {
  if (EN_MAC) return { ffmpeg: join(raiz(), 'ffmpeg', 'bin', 'ffmpeg'), python: join(raiz(), 'python', 'bin', 'python3'), node: join(raiz(), 'node', 'bin', 'node') }[id]
  return { ffmpeg: join(raiz(), 'ffmpeg', 'bin', 'ffmpeg.exe'), python: join(raiz(), 'python', 'python.exe'), node: join(raiz(), 'node', 'node.exe') }[id]
}

export function tieneHerramienta(id: IdDescargable): boolean {
  return existsSync(programa(id))
}

/** El Python propio de Recorte, si ya se bajó. */
export function pythonPropio(): string | null {
  const exe = programa('python')
  return existsSync(exe) ? exe : null
}

/**
 * Pone las carpetas de lo ya bajado al frente del PATH del proceso: así cada `ffmpeg`,
 * `python`, `npm` que lance Recorte (y los agentes) usa la suya.
 */
export function activarHerramientas(): void {
  const partes = (process.env.PATH ?? '').split(delimiter)
  for (const id of DESCARGABLES) {
    if (!tieneHerramienta(id)) continue
    for (const dir of [...carpetas()[id]].reverse()) {
      if (!existsSync(dir)) continue
      anadirCarpetaBinarios(dir)
      if (!partes.includes(dir)) partes.unshift(dir)
    }
  }
  process.env.PATH = partes.join(delimiter)
}

// ---------------------------------------------------------------------------
// Dónde está cada descarga
// ---------------------------------------------------------------------------

interface Paquete {
  url: string
  nombre: string
  sha256: string
  tamano?: number
  version: string
}

const CABECERAS = { 'User-Agent': `Recorte/${app.getVersion()}`, Accept: 'application/vnd.github+json' }

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: CABECERAS })
  if (!r.ok) throw new Error(`No pude consultar ${new URL(url).host} (${r.status}).`)
  return (await r.json()) as T
}

async function texto(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': CABECERAS['User-Agent'] } })
  if (!r.ok) throw new Error(`No pude leer las huellas (${r.status}).`)
  return r.text()
}

interface ReleaseGitHub {
  tag_name: string
  assets: { name: string; browser_download_url: string; size: number; digest?: string | null }[]
}

/** La huella del archivo: la que da GitHub (`digest`) o la del archivo de sumas del release. */
async function huellaDe(rel: ReleaseGitHub, nombre: string, sumas: RegExp): Promise<string> {
  const asset = rel.assets.find((a) => a.name === nombre)
  if (asset?.digest?.startsWith('sha256:')) return asset.digest.slice(7).toLowerCase()
  const archivo = rel.assets.find((a) => sumas.test(a.name))
  if (!archivo) throw new Error('El release no trae huellas para comprobar la descarga.')
  const linea = (await texto(archivo.browser_download_url)).split(/\r?\n/).find((l) => l.trim().endsWith(nombre))
  const h = linea?.trim().split(/\s+/)[0]
  if (!h || !/^[a-f0-9]{64}$/i.test(h)) throw new Error('No encontré la huella de la descarga.')
  return h.toLowerCase()
}

async function paqueteFfmpegWindows(): Promise<Paquete> {
  const rel = await json<ReleaseGitHub>('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest')
  // La versión estable más nueva (nX.Y), no la de desarrollo («master»).
  const candidatos = rel.assets
    .map((a) => ({ a, m: /^ffmpeg-n(\d+)\.(\d+)(?:\.\d+)?-latest-win64-gpl-[\d.]+\.zip$/.exec(a.name) }))
    .filter((x) => x.m)
    .sort((x, y) => Number(y.m![1]) - Number(x.m![1]) || Number(y.m![2]) - Number(x.m![2]))
  const elegido = candidatos[0]?.a ?? rel.assets.find((a) => a.name === 'ffmpeg-master-latest-win64-gpl.zip')
  if (!elegido) throw new Error('No encontré FFmpeg para Windows en su página.')
  return {
    url: elegido.browser_download_url,
    nombre: elegido.name,
    tamano: elegido.size,
    sha256: await huellaDe(rel, elegido.name, /^checksums\.sha256$/),
    version: /n(\d+\.\d+)/.exec(elegido.name)?.[1] ?? 'última'
  }
}

/** Los dos programas de FFmpeg para Mac (vienen en zips aparte), con su huella. La versión de «release» más nueva. */
export async function paquetesFfmpegMac(): Promise<Paquete[]> {
  const arq = OBJETIVO === 'mac-arm64' ? 'arm64' : 'amd64'
  const salida: Paquete[] = []
  for (const nombre of ['ffmpeg', 'ffprobe']) {
    // La dirección «latest» redirige a la carpeta de la versión; se lee a dónde llegó (sin bajar el archivo).
    const r = await fetch(`https://ffmpeg.martin-riedl.de/redirect/latest/macos/${arq}/release/${nombre}.zip`, { headers: { 'User-Agent': CABECERAS['User-Agent'], Range: 'bytes=0-0' } })
    await r.body?.cancel().catch(() => {})
    if (!r.ok || !r.url.endsWith(`/${nombre}.zip`)) throw new Error(`No encontré ${nombre} para Mac en su página (${r.status}).`)
    const h = (await texto(`${r.url}.sha256`)).trim().split(/\s+/)[0]
    if (!/^[a-f0-9]{64}$/i.test(h)) throw new Error('No encontré la huella de FFmpeg.')
    salida.push({ url: r.url, nombre: `${nombre}.zip`, sha256: h.toLowerCase(), version: /\/(\d+\.\d+(?:\.\d+)?)\/[^/]+$/.exec(r.url)?.[1] ?? /_(\d+\.\d+(?:\.\d+)?)\/[^/]+$/.exec(r.url)?.[1] ?? 'última' })
  }
  return salida
}

const TRIPLETE_PYTHON = { 'win-x64': 'x86_64-pc-windows-msvc', 'mac-arm64': 'aarch64-apple-darwin', 'mac-x64': 'x86_64-apple-darwin' } as const

async function paquetePython(): Promise<Paquete> {
  const rel = await json<ReleaseGitHub>('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest')
  // 3.12: todos los paquetes de Recorte (faster-whisper, OpenCV) tienen ruedas para ella.
  const elegido = rel.assets
    .filter((a) => new RegExp(`^cpython-3\\.12\\.\\d+\\+\\d+-${TRIPLETE_PYTHON[OBJETIVO]}-install_only\\.tar\\.gz$`).test(a.name))
    .sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }))[0]
  if (!elegido) throw new Error('No encontré Python 3.12 para este equipo en su página.')
  return {
    url: elegido.browser_download_url,
    nombre: elegido.name,
    tamano: elegido.size,
    sha256: await huellaDe(rel, elegido.name, /^SHA256SUMS$/),
    version: /cpython-(3\.12\.\d+)/.exec(elegido.name)?.[1] ?? '3.12'
  }
}

async function paqueteNode(): Promise<Paquete> {
  const lista = await json<{ version: string; lts: string | false; files: string[] }[]>('https://nodejs.org/dist/index.json')
  const archivo = { 'win-x64': 'win-x64-zip', 'mac-arm64': 'osx-arm64-tar', 'mac-x64': 'osx-x64-tar' }[OBJETIVO]
  const lts = lista.find((v) => v.lts && v.files.includes(archivo))
  if (!lts) throw new Error('No encontré Node.js para este equipo.')
  const nombre = { 'win-x64': `node-${lts.version}-win-x64.zip`, 'mac-arm64': `node-${lts.version}-darwin-arm64.tar.gz`, 'mac-x64': `node-${lts.version}-darwin-x64.tar.gz` }[OBJETIVO]
  const sumas = await texto(`https://nodejs.org/dist/${lts.version}/SHASUMS256.txt`)
  const h = sumas.split(/\r?\n/).find((l) => l.trim().endsWith(` ${nombre}`))?.trim().split(/\s+/)[0]
  if (!h) throw new Error('No encontré la huella de Node.js.')
  return { url: `https://nodejs.org/dist/${lts.version}/${nombre}`, nombre, sha256: h.toLowerCase(), version: lts.version.replace(/^v/, '') }
}

// ---------------------------------------------------------------------------
// Bajar, comprobar y descomprimir
// ---------------------------------------------------------------------------

async function bajar(p: Paquete, destino: string, onProgreso: (pct: number, texto: string) => void, senal?: AbortSignal): Promise<void> {
  const r = await fetch(p.url, { headers: { 'User-Agent': CABECERAS['User-Agent'] }, signal: senal })
  if (!r.ok || !r.body) throw new Error(`La descarga falló (${r.status}).`)
  const total = Number(r.headers.get('content-length')) || p.tamano || 0
  const hash = createHash('sha256')
  const archivo = createWriteStream(destino)
  let hecho = 0
  let ultimo = 0
  const lector = r.body.getReader()
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      hash.update(value)
      hecho += value.length
      if (!archivo.write(value)) await new Promise<void>((ok) => archivo.once('drain', ok))
      if (total && Date.now() - ultimo > 250) {
        ultimo = Date.now()
        onProgreso(hecho / total, `Bajando ${Math.round(hecho / 1e6)} de ${Math.round(total / 1e6)} MB`)
      }
    }
  } finally {
    await new Promise<void>((ok) => archivo.end(ok))
  }
  const obtenida = hash.digest('hex')
  if (obtenida !== p.sha256) {
    rmSync(destino, { force: true })
    throw new Error('La descarga llegó dañada (no coincide su huella). Prueba otra vez.')
  }
}

/** Descomprime con el `tar` del sistema (el de Windows y el de Mac leen .zip y .tar.gz). */
function descomprimir(archivo: string, destino: string): Promise<void> {
  mkdirSync(destino, { recursive: true })
  return new Promise((ok, mal) => {
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    const hijo = spawn(tar, ['-xf', archivo, '-C', destino], { windowsHide: true })
    let error = ''
    hijo.stderr.on('data', (b: Buffer) => (error += b.toString('utf8')))
    hijo.on('error', () => mal(new Error('No pude descomprimir (falta el programa tar del sistema).')))
    hijo.on('close', (c) => (c === 0 ? ok() : mal(new Error(`No pude descomprimir: ${error.trim().slice(-200)}`))))
  })
}

/** En Mac, FFmpeg y FFprobe vienen en zips aparte: cada uno trae su programa suelto y se juntan en `ffmpeg/bin`. */
async function descargarFfmpegMac(onProgreso: (pct: number, texto: string) => void, senal?: AbortSignal): Promise<{ version: string }> {
  const paquetes = await paquetesFfmpegMac()
  const base = raiz()
  const temporal = join(base, '.bajando-ffmpeg')
  rmSync(temporal, { recursive: true, force: true })
  mkdirSync(temporal, { recursive: true })
  try {
    const nuevo = join(temporal, 'ffmpeg')
    mkdirSync(join(nuevo, 'bin'), { recursive: true })
    for (const [i, p] of paquetes.entries()) {
      const archivo = join(temporal, p.nombre)
      await bajar(p, archivo, (x, t) => onProgreso((i + x) * 0.45, t), senal)
      onProgreso(0.45 * (i + 1), 'Descomprimiendo')
      const fuera = join(temporal, `fuera-${i}`)
      await descomprimir(archivo, fuera)
      const programa = p.nombre.replace(/\.zip$/, '')
      const dentro = join(fuera, programa)
      if (!existsSync(dentro)) throw new Error('El paquete no trae lo que esperaba.')
      renameSync(dentro, join(nuevo, 'bin', programa))
      chmodSync(join(nuevo, 'bin', programa), 0o755)
    }
    const final = join(base, 'ffmpeg')
    rmSync(final, { recursive: true, force: true })
    renameSync(nuevo, final)
    if (!tieneHerramienta('ffmpeg')) throw new Error('El paquete no trae lo que esperaba.')
    activarHerramientas()
    onProgreso(1, 'Listo')
    return { version: paquetes[0].version }
  } finally {
    rmSync(temporal, { recursive: true, force: true })
  }
}

const enCurso = new Map<IdDescargable, Promise<{ version: string }>>()

export function descargarHerramienta(
  id: IdDescargable,
  onProgreso: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<{ version: string }> {
  const ya = enCurso.get(id)
  if (ya) return ya
  const trabajo = (async () => {
    if (!PUEDE_BAJAR) throw new Error('Por ahora solo se baja en Windows y en Mac.')
    onProgreso(0, 'Buscando la última versión')
    if (id === 'ffmpeg' && EN_MAC) return descargarFfmpegMac(onProgreso, senal)
    const p = id === 'ffmpeg' ? await paqueteFfmpegWindows() : id === 'python' ? await paquetePython() : await paqueteNode()
    const base = raiz()
    const temporal = join(base, `.bajando-${id}`)
    rmSync(temporal, { recursive: true, force: true })
    mkdirSync(temporal, { recursive: true })
    try {
      const archivo = join(temporal, p.nombre)
      await bajar(p, archivo, (x, t) => onProgreso(x * 0.9, t), senal)
      onProgreso(0.92, 'Descomprimiendo')
      const fuera = join(temporal, 'fuera')
      await descomprimir(archivo, fuera)
      // Cada paquete trae una sola carpeta arriba (ffmpeg-n8…, python, node-v22…).
      const dentro = readdirSync(fuera, { withFileTypes: true }).filter((d) => d.isDirectory())
      const carpeta = dentro.length === 1 ? join(fuera, dentro[0].name) : fuera
      const final = join(base, id)
      rmSync(final, { recursive: true, force: true })
      renameSync(carpeta, final)
      if (!tieneHerramienta(id)) throw new Error('El paquete no trae lo que esperaba.')
      if (EN_MAC) for (const d of carpetas()[id]) if (existsSync(d)) for (const f of readdirSync(d)) try { chmodSync(join(d, f), 0o755) } catch { /* un archivo que no se puede: se sigue */ }
      activarHerramientas()
      onProgreso(1, 'Listo')
      return { version: p.version }
    } finally {
      rmSync(temporal, { recursive: true, force: true })
    }
  })()
  enCurso.set(id, trabajo)
  trabajo.finally(() => enCurso.delete(id)).catch(() => {})
  return trabajo
}
