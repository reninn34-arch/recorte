import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { MedioProyecto, Project } from '../shared/types'
import { crearProxy, probeVideo, type VideoInfo } from './ffmpeg'

/** Los códecs que el monitor (Chromium) lee bien sin esfuerzo; con otros (HEVC, ProRes, MPEG-2…) se hace una copia. */
const CODECS_LIVIANOS = new Set(['h264', 'vp8', 'vp9', 'av1'])

/**
 * Un video de la biblioteca necesita copia liviana para el monitor si es más grande que 1080p o de un códec pesado o que el
 * monitor no lee. Con varias pistas de video a la vez, un 4K sin copia es lo que más hace trabar la reproducción.
 */
export function necesitaProxy(info: Pick<VideoInfo, 'width' | 'height' | 'codec'>): boolean {
  if (Math.max(info.width, info.height) > 1920 || Math.min(info.width, info.height) > 1080) return true
  return Boolean(info.codec) && !CODECS_LIVIANOS.has(String(info.codec).toLowerCase())
}

interface Almacen {
  abrir(id: string): Project | null
  save(p: Project): void
  carpeta(id: string): string
}

let cola: Promise<void> = Promise.resolve()
const enCola = new Set<string>()

/**
 * Revisa los videos de la biblioteca de un proyecto y hace, en segundo plano y de uno en uno, la copia liviana de los que la
 * necesitan. Cuando una está lista la guarda en el proyecto y avisa (`alCambiar`) para que el monitor la use.
 */
export function prepararProxysDeMedios(
  proyectos: Almacen,
  id: string,
  alCambiar: (proyecto: Project) => void,
  alProgreso: (pct: number, texto: string) => void = () => {}
): void {
  const pendientes = (proyectos.abrir(id)?.medios ?? []).filter((m) => m.tipo === 'video' && m.proxy === undefined && !enCola.has(`${id}/${m.id}`))
  for (const medio of pendientes) {
    const clave = `${id}/${medio.id}`
    enCola.add(clave)
    cola = cola.then(() => hacerUno(proyectos, id, medio, alCambiar, alProgreso)).finally(() => enCola.delete(clave))
  }
}

async function hacerUno(proyectos: Almacen, id: string, medio: MedioProyecto, alCambiar: (p: Project) => void, alProgreso: (pct: number, texto: string) => void) {
  const guardar = (valor: string) => {
    const actual = proyectos.abrir(id)
    const m = actual?.medios?.find((x) => x.id === medio.id)
    if (!actual || !m) return
    m.proxy = valor
    proyectos.save(actual)
    alCambiar(actual)
  }
  try {
    if (!existsSync(medio.ruta)) return // el original no está: se vuelve a intentar cuando esté
    const info = await probeVideo(medio.ruta)
    if (!necesitaProxy(info)) return guardar('')
    const carpeta = join(proyectos.carpeta(id), 'medios')
    mkdirSync(carpeta, { recursive: true })
    const relativo = `medios/${medio.id}-proxy.mp4`
    const destino = join(proyectos.carpeta(id), relativo)
    const temporal = destino + '.haciendo.mp4'
    alProgreso(0, `Preparando «${medio.nombre}» para el monitor`)
    await crearProxy(medio.ruta, temporal, info.duration, (pct) => alProgreso(pct, `Preparando «${medio.nombre}» para el monitor`))
    // Entera o nada: nunca una copia a medias.
    rmSync(destino, { force: true })
    renameSync(temporal, destino)
    guardar(relativo)
    alProgreso(1, 'Listo')
  } catch {
    // Sin copia, el monitor usa el original; se vuelve a intentar al abrir el proyecto otra vez.
  }
}
