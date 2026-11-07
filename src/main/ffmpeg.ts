import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

export interface VideoInfo {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export const rutaFfmpeg = (): string => process.env.RECORTE_FFMPEG ?? 'ffmpeg'
export const rutaFfprobe = (): string => process.env.RECORTE_FFPROBE ?? 'ffprobe'

function fpsDe(cadena?: string): number {
  if (!cadena) return 0
  const [num, den] = cadena.split('/').map(Number)
  if (!num) return 0
  const fps = den ? num / den : num
  return Math.round(fps * 100) / 100
}

export async function probeVideo(ruta: string): Promise<VideoInfo> {
  const { stdout } = await exec(
    rutaFfprobe(),
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', ruta],
    { maxBuffer: 16 * 1024 * 1024 }
  )

  const datos = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{
      codec_type?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      r_frame_rate?: string
      duration?: string
      side_data_list?: Array<{ rotation?: number }>
    }>
  }

  const video = datos.streams?.find((s) => s.codec_type === 'video')
  if (!video) throw new Error('El archivo no tiene pista de video.')

  const rotacion = Math.abs(Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0))
  const girado = rotacion === 90 || rotacion === 270

  return {
    duration: Number(datos.format?.duration ?? video.duration ?? 0),
    width: Number(girado ? video.height : video.width ?? 0),
    height: Number(girado ? video.width : video.height ?? 0),
    fps: fpsDe(video.avg_frame_rate ?? video.r_frame_rate),
    hasAudio: datos.streams?.some((s) => s.codec_type === 'audio') ?? false
  }
}

/** Duración de cualquier audio o video, en segundos (0 si no se puede leer). */
export async function duracionMedio(ruta: string): Promise<number> {
  try {
    const { stdout } = await exec(rutaFfprobe(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', ruta], {
      timeout: 30_000
    })
    const d = Number(stdout.trim())
    return Number.isFinite(d) ? d : 0
  } catch {
    return 0
  }
}

export async function crearMiniatura(ruta: string, salida: string, segundo: number): Promise<void> {
  await exec(
    rutaFfmpeg(),
    [
      '-y',
      '-ss', String(Math.max(0, segundo)),
      '-i', ruta,
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '3',
      salida
    ],
    { maxBuffer: 4 * 1024 * 1024 }
  )
}

/** Genera un proxy 720p para que la vista previa no cargue el original de 4K. */
export function crearProxy(
  ruta: string,
  salida: string,
  duracion: number,
  onProgreso: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(
      rutaFfmpeg(),
      [
        '-y',
        '-i', ruta,
        '-vf', "scale=-2:'min(720,ih)'",
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '26',
        // Un fotograma clave por segundo: la timeline salta entre cortes y
        // buscar en el proxy debe ser casi instantáneo.
        '-g', '30',
        '-keyint_min', '30',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        salida
      ],
      { windowsHide: true }
    )

    let cola = ''
    let error = ''

    hijo.stderr.on('data', (buf) => {
      const texto = buf.toString()
      cola = (cola + texto).slice(-4000)
      if (duracion > 0) {
        const tiempos = [...cola.matchAll(/time=(\d+):(\d+):(\d+\.\d+)/g)]
        const ultimo = tiempos.at(-1)
        if (ultimo) {
          const seg = Number(ultimo[1]) * 3600 + Number(ultimo[2]) * 60 + Number(ultimo[3])
          onProgreso(Math.min(seg / duracion, 0.99))
        }
      }
      if (texto.includes('Error')) error = texto
    })

    hijo.on('error', reject)
    hijo.on('close', (codigo) => {
      if (codigo === 0) resolve()
      else reject(new Error(error.trim() || `FFmpeg terminó con código ${codigo}.`))
    })
  })
}
