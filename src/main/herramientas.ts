import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { anadirCarpetaBinarios } from './binarios'

/**
 * Las herramientas que Recorte baja con un botón (como Sloth): FFmpeg, Python y Node.js,
 * cada una en `<userData>/herramientas/`, sin instalar nada en Windows ni tocar las que
 * el usuario ya tenga. Se bajan de su fuente oficial y se comprueba su huella SHA-256:
 *
 * - FFmpeg: la compilación GPL de BtbN (trae x264, que usa toda la exportación). Recorte
 *   no la reparte: el usuario la baja de su página y la app la llama como programa aparte.
 * - Python: python-build-standalone (astral-sh), un Python completo y portátil, con pip.
 * - Node.js: el zip oficial de nodejs.org (la LTS), para instalar agentes y HyperFrames.
 */

export type IdDescargable = 'ffmpeg' | 'python' | 'node'
export const DESCARGABLES: IdDescargable[] = ['ffmpeg', 'python', 'node']

const raiz = () => join(app.getPath('userData'), 'herramientas')

export function carpetas(): Record<IdDescargable, string[]> {
  return {
    ffmpeg: [join(raiz(), 'ffmpeg', 'bin')],
    python: [join(raiz(), 'python'), join(raiz(), 'python', 'Scripts')],
    node: [join(raiz(), 'node')]
  }
}

export function tieneHerramienta(id: IdDescargable): boolean {
  const exe = { ffmpeg: join(raiz(), 'ffmpeg', 'bin', 'ffmpeg.exe'), python: join(raiz(), 'python', 'python.exe'), node: join(raiz(), 'node', 'node.exe') }[id]
  return existsSync(exe)
}

/** El Python propio de Recorte, si ya se bajó. */
export function pythonPropio(): string | null {
  const exe = join(raiz(), 'python', 'python.exe')
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

async function paqueteFfmpeg(): Promise<Paquete> {
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

async function paquetePython(): Promise<Paquete> {
  const rel = await json<ReleaseGitHub>('https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest')
  // 3.12: todos los paquetes de Recorte (faster-whisper, OpenCV) tienen ruedas para ella.
  const elegido = rel.assets
    .filter((a) => /^cpython-3\.12\.\d+\+\d+-x86_64-pc-windows-msvc-install_only\.tar\.gz$/.test(a.name))
    .sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }))[0]
  if (!elegido) throw new Error('No encontré Python 3.12 para Windows en su página.')
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
  const lts = lista.find((v) => v.lts && v.files.includes('win-x64-zip'))
  if (!lts) throw new Error('No encontré Node.js para Windows.')
  const nombre = `node-${lts.version}-win-x64.zip`
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

/** Descomprime con el `tar` de Windows (lee .zip y .tar.gz). */
function descomprimir(archivo: string, destino: string): Promise<void> {
  mkdirSync(destino, { recursive: true })
  return new Promise((ok, mal) => {
    const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    const hijo = spawn(tar, ['-xf', archivo, '-C', destino], { windowsHide: true })
    let error = ''
    hijo.stderr.on('data', (b: Buffer) => (error += b.toString('utf8')))
    hijo.on('error', () => mal(new Error('No pude descomprimir (falta tar de Windows).')))
    hijo.on('close', (c) => (c === 0 ? ok() : mal(new Error(`No pude descomprimir: ${error.trim().slice(-200)}`))))
  })
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
    if (process.platform !== 'win32') throw new Error('Por ahora solo se baja en Windows.')
    onProgreso(0, 'Buscando la última versión')
    const p = id === 'ffmpeg' ? await paqueteFfmpeg() : id === 'python' ? await paquetePython() : await paqueteNode()
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
