import { ajustesDe, duracionTimeline, timelineActiva, tramos, ubicar, zonaColorActiva, type Timeline } from './timeline'
import type { Project } from './types'

/**
 * La vista previa renderizada del monitor (como el «render de vista previa» de Premiere o el caché de DaVinci): la
 * timeline se parte en tramos de unos segundos y los que pesan (capas, piezas animadas, filtros, textos animados) se
 * renderizan en segundo plano a un MP4 liviano. Al reproducir, el monitor muestra ese video en vez de componer todo en
 * vivo. Cada tramo tiene una clave sacada de lo que contiene: si se edita, cambia la clave y se vuelve a renderizar.
 */

/** Lo que dura cada tramo, en segundos. */
export const LARGO_VISTA = 4
/** Sube si cambia cómo se renderiza (y así no se usan los tramos viejos). */
const VERSION_VISTA = 2

export interface TramoVista {
  desde: number
  hasta: number
  /** Huella de lo que hay en el tramo: es el nombre de su archivo (`vista-previa/<clave>.mp4`). */
  clave: string
  /** Tiene algo que cuesta componer en vivo: merece renderizarse. */
  pesado: boolean
}

/** Lo del proyecto que cambia el render de un tramo (el video y los medios de los que sale). */
export function firmaProyecto(p: Pick<Project, 'source' | 'medios'>): string {
  return JSON.stringify([VERSION_VISTA, p.source.path, p.source.width, p.source.height, p.source.fps, (p.medios ?? []).map((m) => [m.id, m.ruta])])
}

/** Una huella corta y estable de un texto (FNV-1a en dos carriles de 32 bits): igual en la interfaz y en el proceso principal. */
function huella(texto: string): string {
  let a = 0x811c9dc5
  let b = 0x9e3779b9 ^ texto.length
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    a = Math.imul(a ^ c, 16777619)
    b = Math.imul(b ^ c, 2246822519)
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0')
}

/** Un elemento con tiempo (texto, capa, capa de ajuste) que pisa el tramo, con su inicio contado desde el tramo. */
function enTramo<T extends { inicio: number; duracion: number }>(lista: T[] | undefined, desde: number, hasta: number): T[] {
  return (lista ?? []).filter((x) => x.inicio < hasta && x.inicio + x.duracion > desde).map((x) => ({ ...x, inicio: x.inicio - desde }))
}

/** Los tramos de la timeline (la que se ve y suena), con su clave. */
export function tramosVista(timeline: Timeline, firma: string): TramoVista[] {
  const tl = timelineActiva(timeline)
  const total = duracionTimeline(tl)
  const lista = tramos(tl)
  // Lo que cambia la imagen de todo el video (no el sonido: la voz, la música y los efectos no van en la vista previa).
  const global = JSON.stringify([tl.filtros ?? null, tl.subtitulosHF ?? null, tl.multicam ?? null])
  const salida: TramoVista[] = []
  for (let i = 0; i * LARGO_VISTA < total - 0.1; i++) {
    const desde = i * LARGO_VISTA
    const hasta = Math.min(total, desde + LARGO_VISTA)
    // Los clips que se ven en el tramo (y el de antes, por la transición de entrada), donde caen dentro de él. Con los
    // clips originales: sus identificadores no cambian entre una vez y otra (cortar la timeline daría unos nuevos).
    const k = lista.findIndex((t) => t.fin > desde)
    const clips = lista
      .slice(Math.max(0, k - 1))
      .filter((t) => t.inicio < hasta)
      .map((t) => [t.clip, +(t.inicio - desde).toFixed(4), +(t.fin - desde).toFixed(4)])
    const textos = enTramo(tl.textos, desde, hasta)
    const capas = enTramo(tl.capas, desde, hasta)
    const ajustes = enTramo(tl.ajustesCapa, desde, hasta)
    const pesado = Boolean(capas.length || ajustes.length || tl.filtros || textos.some((t) => t.animacion) || lista.some((t) => t.inicio < hasta && t.fin > desde && (t.clip.zonas?.length || zonaColorActiva(ajustesDe(t.clip)))))
    salida.push({ desde, hasta, pesado, clave: huella(JSON.stringify([firma, hasta - desde, global, clips, textos, capas, ajustes])) })
  }
  return salida
}

/**
 * El cuadro fijo del monitor en pausa, para lo que el monitor no sabe pintar en vivo (el color por zonas): la clave del
 * video de debajo en el segundo `t` (sin capas ni textos, que el monitor sigue poniendo encima), o null si no hace falta.
 */
export function claveCuadro(timeline: Timeline, t: number, firma: string, fps: number): string | null {
  const tl = timelineActiva(timeline)
  const u = ubicar(tl, t)
  if (!u || !zonaColorActiva(ajustesDe(u.clip))) return null
  const previo = u.indice > 0 ? tl.clips[u.indice - 1] : null
  const cuadro = Math.round((t - u.inicio) * fps)
  return huella(JSON.stringify([firma, 'cuadro', u.clip, previo, cuadro]))
}

/**
 * La clave del último cuadro del clip que sale en la transición del clip `indice` (el que queda quieto debajo, como en
 * el MP4): depende de ese clip y del anterior a él (por si aún entraba con su propia transición).
 */
export function claveSalida(timeline: Timeline, indice: number, firma: string, fps: number): string | null {
  const tl = timelineActiva(timeline)
  const clip = tl.clips[indice]
  const sale = tl.clips[indice - 1]
  if (!clip?.fundido || !sale) return null
  return huella(JSON.stringify([firma, 'salida', fps, sale, indice > 1 ? tl.clips[indice - 2] : null]))
}

/** Una clave válida (para no leer ni escribir fuera de la carpeta del caché). */
export const esClaveVista = (c: string): boolean => /^[a-f0-9]{16}$/.test(c)
