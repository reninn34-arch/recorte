import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ClipSuggestion, Project } from '../shared/types'
import { buscarPython, rutaScriptPython } from './transcribir'

const exec = promisify(execFile)

export interface PuntoCara {
  t: number
  x: number
  y: number
}

interface CacheCaras {
  start: number
  end: number
  puntos: PuntoCara[]
}

function rutaCache(carpeta: string, clip: ClipSuggestion): string {
  return join(carpeta, `caras-${clip.id.replace(/[^\w-]/g, '')}.json`)
}

/**
 * Devuelve los centros de cara del tramo del clip, en coordenadas del video original.
 * Devuelve [] si no hay Python, OpenCV o caras: el render cae al recorte central.
 * El resultado se guarda en la carpeta del proyecto y se reutiliza mientras no
 * cambien los tiempos del clip.
 */
export async function detectarCaras(
  proyecto: Project,
  clip: ClipSuggestion,
  carpeta: string
): Promise<PuntoCara[]> {
  const cache = rutaCache(carpeta, clip)

  if (existsSync(cache)) {
    try {
      const datos = JSON.parse(await readFile(cache, 'utf8')) as CacheCaras
      if (datos.start === clip.start && datos.end === clip.end && Array.isArray(datos.puntos)) {
        return datos.puntos
      }
    } catch {
      // Caché corrupta: se recalcula.
    }
  }

  const python = await buscarPython()
  if (!python) return []

  const script = rutaScriptPython('caras.py')
  if (!existsSync(script) || !existsSync(proyecto.source.path)) return []

  const temporal = `${cache}.tmp`
  try {
    await exec(
      python.cmd,
      [
        ...python.args,
        script,
        proyecto.source.path,
        temporal,
        '--inicio',
        String(clip.start),
        '--fin',
        String(clip.end)
      ],
      {
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
      }
    )
    const datos = JSON.parse(await readFile(temporal, 'utf8')) as { puntos?: PuntoCara[] }
    const puntos = Array.isArray(datos.puntos) ? datos.puntos : []
    const resultado: CacheCaras = { start: clip.start, end: clip.end, puntos }
    await writeFile(cache, JSON.stringify(resultado), 'utf8')
    await rm(temporal, { force: true })
    return puntos
  } catch {
    await rm(temporal, { force: true }).catch(() => {})
    return []
  }
}
