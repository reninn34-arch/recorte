import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Creacion } from '../../shared/creacion'
import type { AnalisisMaterial, EscenaMaterial, MaterialAnalizado } from '../../shared/estilo'
import { resolverBinario } from '../binarios'
import { ejecutar } from '../crear'
import { guardar } from '../disco'
import { probeVideo } from '../ffmpeg'
import { Parado } from '../ia'
import { transcribirArchivo } from '../transcribir'

/**
 * Fase 1 de «Copiar un estilo»: analiza el material del usuario en local, sin gastar
 * tokens. Por cada video adjunto: datos técnicos (ffprobe), transcripción con tiempos
 * (la de transcribir.ts), cortes de plano con FFmpeg y una miniatura por plano, y una
 * hoja de contacto. Todo queda en `<creacion>/analisis/` y se cachea: si el archivo
 * no cambió (tamaño + fecha), no se repite. Se puede parar con la señal de ia.ts.
 */

const ffmpeg = (): string => resolverBinario('ffmpeg') ?? 'ffmpeg'

/** Umbral del detector de planos (scene score de FFmpeg). */
const UMBRAL_PLANO = 0.3
/** Planos más cortos que esto se funden con el anterior (parpadeos del detector). */
const PLANO_MIN = 0.5
/** Como mucho tantos planos por video (y una miniatura por plano). */
const MAX_PLANOS = 48

/** Los tiempos de corte que ve FFmpeg con select=scene, en segundos, sin repetidos. */
export function leerCortes(salidaFfmpeg: string, minimoEntreCortes = 0.4): number[] {
  const cortes: number[] = []
  for (const m of salidaFfmpeg.matchAll(/pts_time:([\d.]+)/g)) {
    const t = Number(m[1])
    if (!Number.isFinite(t)) continue
    if (cortes.length && t - cortes[cortes.length - 1] < minimoEntreCortes) continue
    cortes.push(t)
  }
  return cortes
}

/** De los tiempos de corte a planos [inicio, fin), fundiendo los diminutos. */
export function planosDesde(cortes: number[], duracion: number): { inicio: number; fin: number }[] {
  const bordes = [0, ...cortes.filter((t) => t > PLANO_MIN && t < duracion - 0.2), duracion]
  const planos: { inicio: number; fin: number }[] = []
  for (let i = 0; i < bordes.length - 1; i++) {
    const inicio = Math.round(bordes[i] * 100) / 100
    const fin = Math.round(bordes[i + 1] * 100) / 100
    if (fin - inicio < PLANO_MIN && planos.length) planos[planos.length - 1].fin = fin
    else planos.push({ inicio, fin })
  }
  return planos.slice(0, MAX_PLANOS)
}

/** Detecta los planos de un video con FFmpeg (select=scene) y devuelve los cortes. */
export async function detectarPlanos(ruta: string, cwd: string, senal?: AbortSignal): Promise<{ inicio: number; fin: number }[]> {
  const info = await probeVideo(ruta)
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-hide_banner', '-i', `"${ruta}"`, '-vf', `select='gt(scene\\,${UMBRAL_PLANO})',showinfo`, '-an', '-f', 'null', '-'],
    cwd,
    10 * 60_000,
    senal
  )
  if (senal?.aborted) throw new Parado()
  return planosDesde(leerCortes(r.salida), info.duration)
}

/** Una miniatura JPG pequeña (≤ 480 px de ancho) en un segundo del video. */
export async function miniatura(ruta: string, segundo: number, salida: string, cwd: string, senal?: AbortSignal): Promise<boolean> {
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-y', '-v', 'error', '-ss', segundo.toFixed(2), '-i', `"${ruta}"`, '-frames:v', '1', '-vf', `scale='min(480,iw)':-2`, '-q:v', '4', `"${salida}"`],
    cwd,
    60_000,
    senal
  )
  return r.codigo === 0 && existsSync(salida)
}

/** Hoja de contacto 4×4 con fotogramas repartidos a lo largo del video. */
export async function hojaContacto(ruta: string, duracion: number, salida: string, cwd: string, senal?: AbortSignal): Promise<boolean> {
  const intervalo = Math.max(1, Math.ceil(duracion / 16))
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vf', `fps=1/${intervalo},scale=320:-2,tile=4x4:margin=4:padding=4:color=black`, '-frames:v', '1', '-q:v', '4', `"${salida}"`],
    cwd,
    120_000,
    senal
  )
  return r.codigo === 0 && existsSync(salida)
}

interface CacheMaterial {
  videos: MaterialAnalizado[]
}

function leerCache(archivo: string): CacheMaterial | null {
  try {
    return JSON.parse(readFileSync(archivo, 'utf8')) as CacheMaterial
  } catch {
    return null
  }
}

/** Analiza un video si cambió (o si no estaba); si no, devuelve lo cacheado. */
async function analizarVideo(
  archivoRel: string,
  nombre: string,
  ruta: string,
  analisis: string,
  carpeta: string,
  previo: MaterialAnalizado | undefined,
  onProgreso: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<MaterialAnalizado> {
  const st = statSync(ruta)
  if (previo && previo.tamano === st.size && previo.fecha === Math.round(st.mtimeMs) && previo.escenas.length) return previo
  if (senal?.aborted) throw new Parado()

  const base = basename(archivoRel).replace(/[^\w.-]+/g, '_')
  const info = await probeVideo(ruta)

  onProgreso(0.1, `Buscando los planos de «${nombre}»`)
  const planos = await detectarPlanos(ruta, carpeta, senal)

  const escenas: EscenaMaterial[] = []
  for (const [i, p] of planos.entries()) {
    if (senal?.aborted) throw new Parado()
    const archivoMini = join(analisis, `${base}-plano-${i + 1}.jpg`)
    const medio = p.inicio + (p.fin - p.inicio) / 2
    if (await miniatura(ruta, medio, archivoMini, carpeta, senal)) {
      escenas.push({ inicio: p.inicio, fin: p.fin, miniatura: `analisis/${base}-plano-${i + 1}.jpg` })
    }
    onProgreso(0.1 + (0.3 * (i + 1)) / planos.length, `Planos de «${nombre}» (${i + 1}/${planos.length})`)
  }

  onProgreso(0.45, `Hoja de contacto de «${nombre}»`)
  const archivoHoja = join(analisis, `${base}-hoja.jpg`)
  const hoja = (await hojaContacto(ruta, info.duration, archivoHoja, carpeta, senal)) ? `analisis/${base}-hoja.jpg` : null

  let transcripcion: { inicio: number; texto: string }[] = []
  if (info.hasAudio) {
    onProgreso(0.55, `Escuchando «${nombre}»`)
    const salida = join(analisis, `${base}-transcripcion.json`)
    const r = await transcribirArchivo(ruta, salida, (pct, t) => onProgreso(0.55 + pct * 0.4, t ?? `Escuchando «${nombre}»`), senal)
    if (senal?.aborted) throw new Parado()
    if (r.ok && r.transcript) {
      transcripcion = r.transcript
        .map((s) => ({ inicio: Math.round(s.start * 10) / 10, texto: s.text.replace(/\s+/g, ' ').trim() }))
        .filter((s) => s.texto)
    }
  }

  return {
    archivo: archivoRel,
    nombre,
    duracion: Math.round(info.duration * 100) / 100,
    ancho: info.width,
    alto: info.height,
    fps: info.fps,
    conAudio: info.hasAudio,
    transcripcion,
    escenas,
    hoja,
    tamano: st.size,
    fecha: Math.round(st.mtimeMs)
  }
}

/**
 * Analiza los videos adjuntos de una creación y guarda `analisis/material.json`.
 * Devuelve el análisis completo (cacheado por archivo: tamaño + fecha).
 */
export async function analizarMaterialCreacion(
  c: Creacion,
  carpeta: string,
  onProgreso: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<AnalisisMaterial> {
  const analisis = join(carpeta, 'analisis')
  mkdirSync(analisis, { recursive: true })
  const archivoJson = join(analisis, 'material.json')
  const cache = leerCache(archivoJson)

  const videos = c.adjuntos.filter((a) => a.tipo === 'video')
  const resultado: MaterialAnalizado[] = []
  for (const [i, a] of videos.entries()) {
    if (senal?.aborted) throw new Parado()
    const ruta = join(carpeta, 'composicion', a.archivo)
    if (!existsSync(ruta)) continue
    const previo = cache?.videos.find((v) => v.archivo === a.archivo)
    const base = i / Math.max(1, videos.length)
    const analizado = await analizarVideo(
      a.archivo,
      a.nombre,
      ruta,
      analisis,
      carpeta,
      previo,
      (pct, texto) => onProgreso(base + (pct * 1) / Math.max(1, videos.length), texto),
      senal
    )
    resultado.push(analizado)
  }

  const datos: AnalisisMaterial = { videos: resultado, hecho: Date.now() }
  guardar(archivoJson, JSON.stringify(datos, null, 2))
  return datos
}

/** Lee el análisis guardado, si existe. */
export function leerAnalisisMaterial(carpeta: string): AnalisisMaterial | null {
  const datos = leerCache(join(carpeta, 'analisis', 'material.json'))
  return datos && Array.isArray(datos.videos) ? { videos: datos.videos, hecho: 0 } : null
}
