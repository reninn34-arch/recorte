import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Creacion } from '../shared/creacion'
import { vozVigente } from '../shared/creacion'
import { resolverBinario } from './binarios'
import { ejecutar } from './crear'
import { duracionMedio, rutaFfprobe } from './ffmpeg'
import { crearPortada } from './render'

/**
 * Pone la voz en un video ya hecho, sin agente y sin rediseñar: la edición la hace Recorte
 * con FFmpeg, como un editor.
 *
 * - La voz manda el ritmo: cada escena dura lo que su frase. Si la frase es más larga que la
 *   escena, la escena va un poco más lenta (hasta ×1,25) y después se queda quieta en su
 *   último cuadro, con el texto ya en pantalla, hasta que la frase termina.
 * - Cada frase entra al empezar su escena; si es más corta, queda una pausa natural.
 * - La voz se limpia: sin retumbe grave, compresión suave y volumen de redes (−16 LUFS).
 *
 * Las escenas del video salen de la composición (`data-start`/`data-duration` de cada
 * `<section class="clip">`); si no cuadran con el guion, del guion escalado al video.
 */

const LENTO_MAX = 1.25
const COLA_S = 0.4

interface Tramo {
  inicio: number
  fin: number
}

/** Las escenas del video, de la composición HTML. */
function escenasDelVideo(c: Creacion, carpeta: string, duracionVideo: number): Tramo[] {
  const n = c.guion?.escenas.length ?? 0
  try {
    const html = readFileSync(join(carpeta, 'composicion', 'index.html'), 'utf8')
    const secciones = [...html.matchAll(/<section\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((t) => /class="[^"]*\bclip\b/.test(t))
      .map((t) => ({ inicio: Number(/data-start="([\d.]+)"/.exec(t)?.[1]), dur: Number(/data-duration="([\d.]+)"/.exec(t)?.[1]) }))
      .filter((s) => Number.isFinite(s.inicio) && Number.isFinite(s.dur) && s.dur > 0)
      .sort((a, b) => a.inicio - b.inicio)
    if (secciones.length === n && n > 0) {
      return secciones.map((s, i) => ({
        inicio: Math.min(s.inicio, duracionVideo),
        fin: Math.min(i + 1 < secciones.length ? secciones[i + 1].inicio : s.inicio + s.dur, duracionVideo)
      }))
    }
  } catch {
    // Sin composición: se usa el guion.
  }
  const total = c.guion!.escenas.reduce((t, e) => t + e.duracion, 0) || 1
  let t = 0
  return c.guion!.escenas.map((e) => {
    const inicio = t
    t += (e.duracion / total) * duracionVideo
    return { inicio, fin: t }
  })
}

async function tieneAudio(ruta: string): Promise<boolean> {
  const r = await ejecutar([`"${rutaFfprobe()}"`, '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', `"${ruta}"`], process.cwd(), 30_000)
  return r.codigo === 0 && r.salida.trim().length > 0
}

export interface ResultadoMontaje {
  salida: string
  portada?: string
  mensaje: string
  duracion: number
}

export async function montarVozEnVideo(
  c: Creacion,
  carpeta: string,
  onProgreso: (pct: number, texto: string) => void
): Promise<ResultadoMontaje> {
  const v = vozVigente(c)
  if (!c.salida || !v || !c.guion) throw new Error('Hacen falta el video y una voz que coincida con el guion.')
  const video = join(carpeta, c.salida)
  const voz = join(carpeta, 'composicion', v.archivo)
  if (!existsSync(video) || !existsSync(voz)) throw new Error('No encuentro el video o la voz en la carpeta de la creación.')
  onProgreso(0.1, 'Poniendo la voz en el video')

  const duracionVideo = await duracionMedio(video)
  const escenas = escenasDelVideo(c, carpeta, duracionVideo)
  // Cuánto dura cada frase en la voz (de un inicio al siguiente).
  const frases = v.inicios.map((ini, i) => ({ inicio: ini, fin: i + 1 < v.inicios.length ? v.inicios[i + 1] : v.duracion }))

  // Cada escena del video y cada frase de la voz entran como su propia entrada, recortada
  // antes de leerla (-ss/-t): sacar varios trozos de una misma entrada bloquea a FFmpeg.
  const entradas: string[] = []
  const partes: string[] = []
  const audios: string[] = []
  const originales: string[] = []
  let t = 0
  let lentas = 0
  let quietas = 0
  const conAudio = await tieneAudio(video)
  escenas.forEach((e, i) => {
    const largoVideo = Math.max(0.1, e.fin - e.inicio)
    const frase = frases[i] ?? { inicio: 0, fin: 0 }
    const largoFrase = Math.max(0, frase.fin - frase.inicio) + (i === escenas.length - 1 ? COLA_S : 0)
    const lento = largoFrase > largoVideo ? Math.min(LENTO_MAX, largoFrase / largoVideo) : 1
    const quieta = Math.max(0, largoFrase - largoVideo * lento)
    const largo = largoVideo * lento + quieta
    if (lento > 1.001) lentas += 1
    if (quieta > 0.05) quietas += 1

    const iv = entradas.length / 6
    entradas.push('-ss', e.inicio.toFixed(3), '-t', largoVideo.toFixed(3), '-i', `"${video}"`)
    partes.push(
      `[${iv}:v]setpts=(PTS-STARTPTS)*${lento.toFixed(4)}` +
        `${quieta > 0.01 ? `,tpad=stop_mode=clone:stop_duration=${quieta.toFixed(3)}` : ''},fps=30,format=yuv420p,` +
        `trim=duration=${largo.toFixed(3)}[v${i}]`
    )
    if (conAudio) {
      // El sonido que ya tenía el video sigue a su imagen, bajito bajo la voz.
      partes.push(
        `[${iv}:a]asetpts=PTS-STARTPTS,atempo=${(1 / lento).toFixed(4)},apad=whole_dur=${largo.toFixed(3)},` +
          `atrim=0:${largo.toFixed(3)},volume=0.3[o${i}]`
      )
      originales.push(`[o${i}]`)
    }
    if (frase.fin > frase.inicio) {
      const ia = entradas.length / 6
      entradas.push('-ss', frase.inicio.toFixed(3), '-t', (frase.fin - frase.inicio).toFixed(3), '-i', `"${voz}"`)
      partes.push(`[${ia}:a]asetpts=PTS-STARTPTS,aresample=48000,adelay=${Math.round(t * 1000)}:all=1[f${i}]`)
      audios.push(`[f${i}]`)
    }
    t += largo
  })
  const total = t
  partes.push(`${escenas.map((_, i) => `[v${i}]`).join('')}concat=n=${escenas.length}:v=1:a=0[vout]`)
  partes.push(
    `${audios.join('')}amix=inputs=${audios.length}:normalize=0:duration=longest,highpass=f=80,` +
      `acompressor=threshold=-20dB:ratio=3:attack=5:release=150:makeup=2,loudnorm=I=-16:TP=-1.5:LRA=11,` +
      `aresample=48000,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[voz]`
  )
  if (conAudio) {
    partes.push(`${originales.join('')}concat=n=${originales.length}:v=0:a=1[orig]`)
    partes.push('[voz][orig]amix=inputs=2:duration=first:normalize=0[aout]')
  } else {
    partes.push('[voz]anull[aout]')
  }

  const version = c.version + 1
  const nombre = `video-v${version}.mp4`
  const salida = join(carpeta, 'salidas', nombre)
  const filtro = join(carpeta, 'montaje-voz.txt')
  writeFileSync(filtro, partes.join(';\n'), 'utf8')
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  onProgreso(0.4, 'Ajustando cada escena a su frase')
  const r = await ejecutar(
    [`"${ffmpeg}"`, '-y', '-nostdin', '-v', 'error', ...entradas, '-/filter_complex', `"${filtro}"`,
      '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', `"${salida}"`],
    carpeta,
    10 * 60_000
  )
  if (r.codigo !== 0 || !existsSync(salida)) throw new Error(`No pude poner la voz: ${r.salida.trim().slice(-300)}`)
  onProgreso(0.9, 'Preparando la portada')
  const portadaAbs = await crearPortada(salida, total)
  if (portadaAbs && !portadaAbs.endsWith(`video-v${version}.jpg`)) copyFileSync(portadaAbs, join(carpeta, 'salidas', `video-v${version}.jpg`))

  const detalles: string[] = []
  if (lentas) detalles.push(`${lentas} ${lentas === 1 ? 'escena va' : 'escenas van'} un poco más lentas`)
  if (quietas) detalles.push(`${quietas} se ${quietas === 1 ? 'queda' : 'quedan'} quieta${quietas === 1 ? '' : 's'} al final hasta que termina su frase`)
  return {
    salida: `salidas/${nombre}`,
    portada: portadaAbs ? `salidas/video-v${version}.jpg` : undefined,
    duracion: total,
    mensaje:
      `Puse la voz en tu video sin rediseñarlo (sin agente, sin gastar tokens): cada frase entra con su escena` +
      `${detalles.length ? `; ${detalles.join(' y ')}` : ''}. La voz va limpia y con el volumen de redes. ` +
      `Ahora dura ${total.toFixed(1)} s (versión ${version}).`
  }
}
