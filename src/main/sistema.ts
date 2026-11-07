import { app } from 'electron'
import { exec } from 'node:child_process'
import { mkdirSync, statfsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { join } from 'node:path'
import type { EstadoSistema, Herramienta } from '../shared/api'
import { pathAmpliado, resolverBinario } from './binarios'
import { rutaFfmpeg } from './ffmpeg'
import { buscarPython, rutaScriptPython } from './transcribir'
import { edgeExe } from './vozgoogle'

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

async function herramientas(): Promise<Herramienta[]> {
  const python = await buscarPython()
  const comandoPython = python ? [python.cmd, ...python.args].join(' ') : null
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
      ayuda: ff.ok ? undefined : 'https://ffmpeg.org/download.html'
    },
    {
      id: 'python',
      nombre: 'Python',
      descripcion: 'Corre la transcripción en tu equipo y el seguimiento de caras.',
      estado: py.ok ? 'ok' : 'falta',
      version: py.ok ? version(py.salida) : null,
      ayuda: py.ok ? undefined : 'https://www.python.org/downloads/'
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
      ayuda: npm.ok ? undefined : 'https://nodejs.org/'
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

/** Instala lo que se puede instalar desde la app (los paquetes de Python y HyperFrames). */
export async function instalarHerramienta(id: string): Promise<{ ok: boolean; error?: string }> {
  if (id === 'paquetes-python') {
    const python = await buscarPython()
    if (!python) return { ok: false, error: 'Primero instala Python 3.10 o superior.' }
    const r = await correr(`${[python.cmd, ...python.args].join(' ')} -m pip install -r "${rutaScriptPython('requirements.txt')}"`, 20 * 60_000)
    return r.ok ? { ok: true } : { ok: false, error: r.salida.trim().slice(-300) }
  }
  if (id === 'hyperframes') {
    const destino = join(app.getPath('userData'), 'agentes')
    mkdirSync(destino, { recursive: true })
    const r = await correr(`npm install --no-audit --no-fund --prefix "${destino}" hyperframes@latest`, 10 * 60_000)
    return r.ok && resolverBinario('hyperframes') ? { ok: true } : { ok: false, error: r.salida.trim().slice(-300) || 'npm no pudo instalarlo.' }
  }
  return { ok: false, error: 'Eso se instala desde su página.' }
}
