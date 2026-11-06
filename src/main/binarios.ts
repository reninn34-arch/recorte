import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Localización de binarios externos (ffmpeg, kimi, hyperframes…).
 * La app instalada no hereda el PATH de una terminal: hay que buscar en las
 * carpetas donde caen los instaladores globales habituales de Windows.
 */

function candidatos(): string[] {
  const appData = process.env.APPDATA ?? ''
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const dirs = [
    join(appData, 'npm'),
    join(appData, 'kimi-desktop', 'daimon-share', 'daimon', 'npm-global'),
    join(localAppData, 'Microsoft', 'WinGet', 'Links')
  ]

  // FFmpeg por winget no crea accesos en Links; vive en Packages\Gyan.FFmpeg_*\ffmpeg-*\bin
  const paquetes = join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  try {
    for (const paquete of readdirSync(paquetes)) {
      if (!paquete.startsWith('Gyan.FFmpeg')) continue
      const dentro = join(paquetes, paquete)
      for (const version of readdirSync(dentro)) {
        const bin = join(dentro, version, 'bin')
        if (existsSync(join(bin, 'ffmpeg.exe'))) dirs.push(bin)
      }
    }
  } catch {
    // Sin winget o sin ffmpeg: no pasa nada, el PATH del proceso sigue.
  }

  return dirs.filter((d) => existsSync(d))
}

/** PATH del proceso más las carpetas candidatas, para hijos con shell. */
export function pathAmpliado(): string {
  return [...candidatos(), process.env.PATH ?? ''].join(delimiter)
}

/** Ruta completa del ejecutable si está en PATH o en las candidatas; null si no. */
export function resolverBinario(nombre: string): string | null {
  const exe = process.platform === 'win32' ? `${nombre}.cmd` : nombre
  for (const dir of candidatos()) {
    const ruta = join(dir, exe)
    if (existsSync(ruta)) return ruta
  }
  // Puede estar en el PATH heredado (sesiones de terminal, desarrollo).
  const path = process.env.PATH ?? ''
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    for (const candidato of process.platform === 'win32' ? [exe, `${nombre}.exe`, nombre] : [nombre]) {
      const ruta = join(dir, candidato)
      if (existsSync(ruta)) return ruta
    }
  }
  return null
}
