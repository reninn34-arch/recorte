import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rutaFfmpeg } from './ffmpeg'

let conVidstab: Promise<boolean> | null = null

/** Si el FFmpeg del equipo trae vid.stab (el estabilizador de dos pasadas); si no, se usa `deshake`. */
function tieneVidstab(): Promise<boolean> {
  conVidstab ??= new Promise((resolver) => {
    const hijo = spawn(rutaFfmpeg(), ['-hide_banner', '-filters'], { windowsHide: true })
    let texto = ''
    hijo.stdout.on('data', (b: Buffer) => (texto += b.toString()))
    hijo.on('error', () => resolver(false))
    hijo.on('close', () => resolver(/vidstabdetect/.test(texto) && /vidstabtransform/.test(texto)))
  })
  return conVidstab
}

function correr(args: string[], cwd: string, alAvanzar?: (segundo: number) => void): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(rutaFfmpeg(), args, { cwd, windowsHide: true })
    let errores = ''
    hijo.stderr.on('data', (b: Buffer) => {
      const t = b.toString()
      errores = (errores + t).slice(-2000)
      const m = /time=(\d+):(\d+):([\d.]+)/.exec(t)
      if (m && alAvanzar) alAvanzar(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]))
    })
    hijo.on('error', rechazar)
    hijo.on('close', (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(errores.trim().split('\n').pop() || 'FFmpeg falló'))))
  })
}

/**
 * Estabiliza el tramo `desde`–`hasta` de un video (como «Estabilizador de deformación» de Premiere): con vid.stab analiza
 * el movimiento y lo suaviza, recortando un poco los bordes para que no se vea negro; sin vid.stab, `deshake`. Deja un
 * MP4 nuevo en `carpeta` (con su sonido) y devuelve su ruta.
 */
export async function estabilizarTramo(
  ruta: string,
  desde: number,
  hasta: number,
  carpeta: string,
  alAvanzar?: (fraccion: number) => void
): Promise<string> {
  mkdirSync(carpeta, { recursive: true })
  const nombre = `estable-${randomUUID().slice(0, 8)}`
  const salida = join(carpeta, `${nombre}.mp4`)
  const largo = Math.max(0.1, hasta - desde)
  const corte = ['-ss', desde.toFixed(3), '-t', largo.toFixed(3), '-i', ruta]
  const codifica = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart']
  if (await tieneVidstab()) {
    // El análisis se guarda junto a la toma (nombre sin rutas: FFmpeg corre en esa carpeta).
    const trf = `${nombre}.trf`
    await correr(['-y', '-v', 'error', '-stats', ...corte, '-vf', `vidstabdetect=shakiness=6:accuracy=12:result=${trf}`, '-f', 'null', '-'], carpeta, (s) =>
      alAvanzar?.(Math.min(0.5, (s / largo) * 0.5))
    )
    await correr(
      ['-y', '-v', 'error', '-stats', ...corte, '-vf', `vidstabtransform=input=${trf}:smoothing=24:zoom=3:optzoom=1,unsharp=5:5:0.5`, ...codifica, salida],
      carpeta,
      (s) => alAvanzar?.(0.5 + Math.min(0.5, (s / largo) * 0.5))
    )
    rmSync(join(carpeta, trf), { force: true })
  } else {
    await correr(['-y', '-v', 'error', '-stats', ...corte, '-vf', 'deshake=rx=32:ry=32:edge=mirror', ...codifica, salida], carpeta, (s) => alAvanzar?.(Math.min(1, s / largo)))
  }
  if (!existsSync(salida)) throw new Error('No pude estabilizar ese clip.')
  return salida
}
