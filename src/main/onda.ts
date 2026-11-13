import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { rutaFfmpeg } from './ffmpeg'

/** Picos por segundo (los mismos que dibuja la onda de la línea de tiempo). */
export const PICOS_POR_SEGUNDO = 50
const MUESTRAS = 4000

const enCurso = new Map<string, Promise<number[] | null>>()

/**
 * Los picos de volumen del audio de un archivo (0 a 1, 50 por segundo), para dibujar su onda sin cargar el video en la
 * interfaz. FFmpeg decodifica solo el audio, en mono y a 4 kHz; el resultado queda guardado junto al proyecto.
 * null si el archivo no tiene sonido.
 */
export function picosDeArchivo(ruta: string, carpetaCache: string): Promise<number[] | null> {
  let info
  try {
    info = statSync(ruta)
  } catch {
    return Promise.resolve(null)
  }
  const clave = createHash('sha1').update(`${ruta}|${info.size}|${info.mtimeMs}`).digest('hex').slice(0, 16)
  const cache = join(carpetaCache, 'ondas', `${clave}.json`)
  if (existsSync(cache)) {
    try {
      const guardado = JSON.parse(readFileSync(cache, 'utf8')) as { picos: number[] | null }
      return Promise.resolve(guardado.picos)
    } catch {
      // Un archivo roto se vuelve a calcular.
    }
  }
  const hecho = enCurso.get(cache)
  if (hecho) return hecho
  const promesa = new Promise<number[] | null>((resolver) => {
    const hijo = spawn(rutaFfmpeg(), ['-v', 'error', '-i', ruta, '-vn', '-ac', '1', '-ar', String(MUESTRAS), '-f', 'f32le', '-'], { windowsHide: true })
    const trozos: Buffer[] = []
    hijo.stdout.on('data', (b: Buffer) => trozos.push(b))
    hijo.stderr.on('data', () => {})
    hijo.on('error', () => resolver(null))
    hijo.on('close', () => {
      const datos = Buffer.concat(trozos)
      const n = Math.floor(datos.length / 4)
      if (!n) {
        guardar(cache, null)
        return resolver(null)
      }
      const paso = MUESTRAS / PICOS_POR_SEGUNDO
      const picos: number[] = []
      for (let i = 0; i < n; i += paso) {
        let max = 0
        for (let j = i; j < Math.min(n, i + paso); j++) {
          const v = Math.abs(datos.readFloatLE(j * 4))
          if (v > max) max = v
        }
        picos.push(Math.round(Math.min(1, max) * 1000) / 1000)
      }
      guardar(cache, picos)
      resolver(picos)
    })
  }).finally(() => enCurso.delete(cache))
  enCurso.set(cache, promesa)
  return promesa
}

function guardar(archivo: string, picos: number[] | null): void {
  try {
    mkdirSync(join(archivo, '..'), { recursive: true })
    writeFileSync(archivo, JSON.stringify({ picos }), 'utf8')
  } catch {
    // Sin caché, se calcula otra vez la próxima vez.
  }
}
