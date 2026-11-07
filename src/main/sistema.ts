import { app } from 'electron'
import { exec, spawn } from 'node:child_process'
import { mkdirSync, statfsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { join } from 'node:path'
import type { EstadoSistema, Herramienta } from '../shared/api'
import { pathAmpliado, resolverBinario } from './binarios'
import { rutaFfmpeg } from './ffmpeg'
import { buscarPython, rutaScriptPython } from './transcribir'
import { edgeExe } from './vozgoogle'
import { descargarHerramienta } from './herramientas'
import { matarArbol } from './ia'

/**
 * Lo que Ajustes enseña del equipo: el procesador, la memoria y la tarjeta gráfica, el
 * espacio en disco y lo que ocupa Recorte, y las herramientas que usan los videos (con su
 * versión, o qué falta y cómo instalarlo).
 */

function correr(orden: string, limite = 20000): Promise<{ ok: boolean; salida: string }> {
  return new Promise((resolver) => {
    exec(orden, { timeout: limite, windowsHide: true, env: { ...process.env, PATH: pathAmpliado() }, maxBuffer: 4 * 1024 * 1024 }, (e, stdout, stderr) =>
      resolver({ ok: !e, salida: `${stdout}${stderr}` })
    )
  })
}

const version = (texto: string): string | null => /\d+\.\d+(?:\.\d+)?/.exec(texto)?.[0] ?? null

let gpu: string | null | undefined
async function nombreGpu(): Promise<string | null> {
  if (gpu !== undefined) return gpu
  if (process.platform === 'win32') {
    const r = await correr('powershell -NoProfile -Command "(Get-CimInstance Win32_VideoController).Name"', 15000)
    gpu = r.ok ? r.salida.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' · ') || null : null
  } else {
    gpu = null
  }
  return gpu
}

async function tamano(ruta: string, limite = 20000): Promise<number> {
  let total = 0
  let vistos = 0
  const pila = [ruta]
  while (pila.length && vistos < limite) {
    const actual = pila.pop()!
    let entradas
    try {
      entradas = await readdir(actual, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entradas) {
      vistos += 1
      const p = join(actual, e.name)
      if (e.isDirectory()) pila.push(p)
      else if (e.isFile()) total += await stat(p).then((s) => s.size, () => 0)
    }
  }
  return total
}

const enWindows = process.platform === 'win32'

async function herramientas(): Promise<Herramienta[]> {
  const python = await buscarPython()
  const comandoPython = python ? [python.cmd, ...python.args].map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' ') : null
  const [ff, py, paquetes, hf, npm] = await Promise.all([
    correr(`"${rutaFfmpeg()}" -version`),
    comandoPython ? correr(`${comandoPython} --version`) : Promise.resolve({ ok: false, salida: '' }),
    comandoPython
      ? correr(
          `${comandoPython} -c "import importlib.util as u;print('FALTAN:'+','.join(m for m in ['faster_whisper','numpy','cv2'] if u.find_spec(m) is None))"`
        )
      : Promise.resolve({ ok: false, salida: '' }),
    resolverBinario('hyperframes') ? correr('hyperframes --version', 30000) : Promise.resolve({ ok: false, salida: '' }),
    correr('npm --version')
  ])
  const faltan = /FALTAN:(.*)/.exec(paquetes.salida)?.[1]?.trim() ?? null
  const nombresPaquetes: Record<string, string> = { faster_whisper: 'faster-whisper', numpy: 'NumPy', cv2: 'OpenCV' }

  return [
    {
      id: 'ffmpeg',
      nombre: 'FFmpeg',
      descripcion: 'Lee, corta, mezcla y exporta los videos. Lo usa todo Recorte.',
      estado: ff.ok ? 'ok' : 'falta',
      version: ff.ok ? version(ff.salida.split('\n')[0]) : null,
      detalle: ff.ok ? undefined : 'No está',
      descargable: !ff.ok && enWindows,
      ayuda: ff.ok || enWindows ? undefined : 'https://ffmpeg.org/download.html'
    },
    {
      id: 'python',
      nombre: 'Python',
      descripcion: 'Corre la transcripción en tu equipo y el seguimiento de caras.',
      estado: py.ok ? 'ok' : 'falta',
      version: py.ok ? version(py.salida) : null,
      descargable: !py.ok && enWindows,
      ayuda: py.ok || enWindows ? undefined : 'https://www.python.org/downloads/'
    },
    {
      id: 'paquetes-python',
      nombre: 'Paquetes de Python',
      descripcion: 'faster-whisper (transcribir y sincronizar la voz), NumPy y OpenCV (caras).',
      estado: !comandoPython ? 'falta' : faltan === '' ? 'ok' : 'falta',
      version: faltan === '' ? 'Listos' : null,
      detalle:
        faltan && faltan !== '' ? `Faltan ${faltan.split(',').map((m) => nombresPaquetes[m] ?? m).join(', ')}` : !comandoPython ? 'Primero instala Python' : undefined,
      instalable: Boolean(comandoPython) && faltan !== ''
    },
    {
      id: 'hyperframes',
      nombre: 'HyperFrames',
      descripcion: 'Convierte en video lo que diseña el agente en «Crear con IA».',
      estado: hf.ok ? 'ok' : 'falta',
      version: hf.ok ? (version(hf.salida) ?? 'instalado') : null,
      instalable: !hf.ok && npm.ok
    },
    {
      id: 'node',
      nombre: 'Node.js',
      descripcion: 'Con npm, Recorte baja los agentes y HyperFrames.',
      estado: npm.ok ? 'ok' : 'falta',
      version: npm.ok ? `npm ${version(npm.salida) ?? ''}`.trim() : null,
      descargable: !npm.ok && enWindows,
      ayuda: npm.ok || enWindows ? undefined : 'https://nodejs.org/'
    },
    {
      id: 'edge',
      nombre: 'Microsoft Edge',
      descripcion: 'Opcional: para entrar con tu cuenta de Google en la voz de AI Studio.',
      estado: edgeExe() ? 'ok' : 'opcional',
      version: edgeExe() ? 'instalado' : null
    }
  ]
}

export async function estadoSistema(): Promise<EstadoSistema> {
  const datos = app.getPath('userData')
  let disco: EstadoSistema['disco'] = null
  try {
    const s = statfsSync(datos)
    disco = { libre: s.bavail * s.bsize, total: s.blocks * s.bsize }
  } catch {
    // Sin statfs (raro): no se enseña.
  }
  const [lista, nombreG, proyectos, creaciones, agentes] = await Promise.all([
    herramientas(),
    nombreGpu(),
    tamano(join(datos, 'proyectos')),
    tamano(join(datos, 'creaciones')),
    tamano(join(datos, 'agentes'))
  ])
  return {
    procesador: cpus()[0]?.model.trim() ?? 'Procesador',
    hilos: cpus().length,
    memoria: totalmem(),
    gpu: nombreG,
    disco,
    uso: { proyectos, creaciones, agentes },
    herramientas: lista
  }
}

/**
 * pip como proceso directo (no `exec`): sin entrada, sin barra de progreso y leyendo su
 * salida en vivo para contar qué baja. Con `exec` se quedaba colgado hasta el límite.
 */
function pip(
  python: { cmd: string; args: string[] },
  args: string[],
  onProgreso: (pct: number, texto: string) => void,
  limite = 30 * 60_000
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolver) => {
    const hijo = spawn(
      python.cmd,
      [...python.args, '-m', 'pip', ...args, '--disable-pip-version-check', '--no-input', '--progress-bar', 'off', '--no-warn-script-location'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: pathAmpliado(), PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' } }
    )
    let salida = ''
    let vistos = 0
    const leer = (b: Buffer) => {
      const t = b.toString('utf8')
      salida = (salida + t).slice(-8000)
      for (const m of t.matchAll(/(?:Downloading|Using cached)\s+(\S+?)(?:-\d[^\s]*)?\.(?:whl|tar\.gz)/g)) {
        vistos += 1
        onProgreso(Math.min(0.85, 0.05 + vistos * 0.03), `Bajando ${m[1].replace(/_/g, '-')}`)
      }
      if (/Installing collected packages/.test(t)) onProgreso(0.9, 'Instalando los paquetes')
    }
    hijo.stdout.on('data', leer)
    hijo.stderr.on('data', leer)
    const reloj = setTimeout(() => {
      matarArbol(hijo)
      resolver({ ok: false, error: 'pip tardó demasiado (30 min). Revisa tu conexión y prueba otra vez.' })
    }, limite)
    hijo.on('error', (e) => {
      clearTimeout(reloj)
      resolver({ ok: false, error: e.message })
    })
    hijo.on('close', (codigo) => {
      clearTimeout(reloj)
      resolver(codigo === 0 ? { ok: true } : { ok: false, error: salida.trim().split(/\r?\n/).slice(-4).join(' ').slice(-300) })
    })
  })
}

/**
 * Instala lo que se puede desde la app: baja FFmpeg, Python o Node.js a la carpeta de
 * Recorte (ver herramientas.ts), o instala los paquetes de Python y HyperFrames.
 */
export async function instalarHerramienta(
  id: string,
  onProgreso: (pct: number, texto: string) => void = () => {}
): Promise<{ ok: boolean; error?: string }> {
  if (id === 'ffmpeg' || id === 'python' || id === 'node') {
    try {
      await descargarHerramienta(id, onProgreso)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  if (id === 'paquetes-python') {
    const python = await buscarPython()
    if (!python) return { ok: false, error: 'Primero descarga Python (justo arriba).' }
    onProgreso(0.05, 'Preparando faster-whisper, NumPy y OpenCV (unos minutos)')
    return pip(python, ['install', '-r', rutaScriptPython('requirements.txt')], onProgreso)
  }
  if (id === 'hyperframes') {
    const destino = join(app.getPath('userData'), 'agentes')
    mkdirSync(destino, { recursive: true })
    onProgreso(0.1, 'Instalando HyperFrames')
    const r = await correr(`npm install --no-audit --no-fund --prefix "${destino}" hyperframes@latest`, 10 * 60_000)
    return r.ok && resolverBinario('hyperframes') ? { ok: true } : { ok: false, error: r.salida.trim().slice(-300) || 'npm no pudo instalarlo.' }
  }
  return { ok: false, error: 'Eso se instala desde su página.' }
}
