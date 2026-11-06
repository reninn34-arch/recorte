import { app } from 'electron'
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Progreso } from '../shared/api'
import type { Project, TranscriptSegment } from '../shared/types'
import { rutaFfmpeg } from './ffmpeg'

const exec = promisify(execFile)

export interface ResultadoTranscripcion {
  ok: boolean
  error?: string
  transcript?: TranscriptSegment[]
  language?: string
}

export async function buscarPython(): Promise<{ cmd: string; args: string[] } | null> {
  const candidatos: { cmd: string; args: string[] }[] = []
  if (process.env.RECORTE_PYTHON) candidatos.push({ cmd: process.env.RECORTE_PYTHON, args: [] })
  candidatos.push({ cmd: 'python', args: [] }, { cmd: 'py', args: ['-3'] })

  for (const candidato of candidatos) {
    try {
      await exec(candidato.cmd, [...candidato.args, '--version'], { timeout: 5000, windowsHide: true })
      return candidato
    } catch {
      // Sigue con el siguiente.
    }
  }
  return null
}

export function rutaScriptPython(nombre: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'python', nombre)
    : join(app.getAppPath(), 'python', nombre)
}

function rutaScript(): string {
  return rutaScriptPython('transcribir.py')
}

export async function transcribir(
  proyecto: Project,
  carpeta: string,
  onProgreso: (p: Progreso) => void
): Promise<ResultadoTranscripcion> {
  const python = await buscarPython()
  if (!python) {
    return { ok: false, error: 'No encontré Python. Instala Python 3.10 o superior y vuelve a intentarlo.' }
  }

  const script = rutaScript()
  if (!existsSync(script)) {
    return { ok: false, error: `Falta el script de transcripción en ${script}.` }
  }

  if (!existsSync(proyecto.source.path)) {
    return { ok: false, error: 'El video original ya no está en esa ruta. Vuelve a importarlo.' }
  }

  const salida = join(carpeta, 'transcripcion.json')
  const modelo = process.env.RECORTE_MODELO ?? 'small'
  const args = [
    ...python.args,
    script,
    proyecto.source.path,
    salida,
    '--modelo',
    modelo,
    '--ffmpeg',
    rutaFfmpeg()
  ]

  onProgreso({ id: proyecto.id, fase: 'transcripcion', pct: 0.01, texto: 'Preparando la transcripción' })

  return new Promise((resolve) => {
    const hijo = spawn(python.cmd, args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    })

    let error = ''
    let pendiente = ''
    let resuelto = false
    const terminar = (resultado: ResultadoTranscripcion) => {
      if (resuelto) return
      resuelto = true
      resolve(resultado)
    }

    const procesarLinea = (linea: string) => {
      const progreso = /^PROGRESO\s+([\d.]+)\s*(.*)$/.exec(linea)
      if (progreso) {
        onProgreso({
          id: proyecto.id,
          fase: 'transcripcion',
          pct: Math.min(Number(progreso[1]), 1),
          texto: progreso[2] || undefined
        })
      }
      if (linea.startsWith('ERROR ')) error = linea.slice(6).trim()
    }

    const leer = (texto: string) => {
      pendiente += texto
      const lineas = pendiente.split(/\r?\n/)
      pendiente = lineas.pop() ?? ''
      for (const linea of lineas) procesarLinea(linea)
    }

    hijo.stdout.on('data', (buf) => leer(buf.toString('utf8')))
    hijo.stderr.on('data', (buf) => {
      // faster-whisper escribe ahí el progreso de la descarga del modelo.
      const texto = buf.toString('utf8')
      const descarga = /(\d+)%/.exec(texto)
      if (descarga) {
        onProgreso({
          id: proyecto.id,
          fase: 'transcripcion',
          pct: Math.min(0.15, Number(descarga[1]) / 100 * 0.15),
          texto: 'Descargando el modelo de voz'
        })
      }
    })

    hijo.on('error', (e) => terminar({ ok: false, error: e.message }))

    hijo.on('close', async (codigo) => {
      leer('\n')
      if (codigo !== 0) {
        terminar({ ok: false, error: error || `La transcripción terminó con código ${codigo}.` })
        return
      }
      try {
        const datos = JSON.parse(await readFile(salida, 'utf8')) as {
          language?: string
          segments?: TranscriptSegment[]
        }
        onProgreso({ id: proyecto.id, fase: 'transcripcion', pct: 1, texto: 'Transcripción lista' })
        terminar({ ok: true, transcript: datos.segments ?? [], language: datos.language })
      } catch (e) {
        terminar({
          ok: false,
          error: `No pude leer la transcripción: ${e instanceof Error ? e.message : String(e)}`
        })
      }
    })
  })
}
