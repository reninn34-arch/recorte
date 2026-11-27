import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { timelineActiva, type Timeline } from '../shared/timeline'
import type { Project } from '../shared/types'
import { claveCuadro, claveSalida, esClaveVista, firmaProyecto, tramosVista, type TramoVista } from '../shared/vistaprevia'
import { duracionTimeline, tramos } from '../shared/timeline'
import { exportarTimeline } from './exportar'
import { rutaFfmpeg } from './ffmpeg'

/**
 * Un cuadro del MP4 (BT.709, rango de video) a JPG con su color tal cual: el JPG se lee como BT.601 de rango completo,
 * y sin convertirlo bien sale más saturado que el video.
 */
const A_JPG = ['-vf', 'scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt601:out_range=pc', '-pix_fmt', 'yuvj420p', '-q:v', '2']

interface Almacen {
  get(id: string): Project | null
  carpeta(id: string): string
}

/** Cuántos tramos se guardan como mucho por proyecto (los más viejos se borran). */
const MAXIMO_TRAMOS = 400

/**
 * Renderiza en segundo plano, de uno en uno, los tramos pesados de la timeline que aún no tienen su vista previa (ver
 * shared/vistaprevia.ts). Empieza por el tramo donde está el cabezal. Se pausa mientras se reproduce (para no quitarle
 * fuerza al monitor) y cada pedido nuevo reemplaza al anterior del mismo proyecto (la timeline cambió).
 */
export class VistaPrevia {
  private pedidos = new Map<string, { timeline: Timeline; desde: number }>()
  private pausados = new Set<string>()
  /** Tramos que no se pudieron renderizar: no se reintentan en esta sesión. */
  private fallidos = new Set<string>()
  private trabajando = false
  /** Cuadros fijos pedidos: tienen prioridad, mientras tanto no se empiezan tramos. */
  private cuadrosEnCurso = 0

  private proyectos: Almacen
  private alListo: (id: string, clave: string) => void

  constructor(proyectos: Almacen, alListo: (id: string, clave: string) => void) {
    this.proyectos = proyectos
    this.alListo = alListo
  }

  carpeta(id: string): string {
    return join(this.proyectos.carpeta(id), 'vista-previa')
  }

  /** Cuáles de estas claves ya tienen su video. */
  existentes(id: string, claves: string[]): string[] {
    const dir = this.carpeta(id)
    return claves.filter((c) => esClaveVista(c) && existsSync(join(dir, `${c}.mp4`)))
  }

  preparar(id: string, timeline: Timeline, desde: number): void {
    this.pausados.delete(id)
    this.pedidos.set(id, { timeline, desde })
    void this.trabajar()
  }

  /**
   * El cuadro fijo del monitor en pausa (ver claveCuadro): el video de debajo en el segundo `t`, con todo su color, sin
   * capas ni textos. Devuelve su clave y su archivo dentro del proyecto, o null si no hace falta o no se pudo.
   */
  async cuadro(id: string, timeline: Timeline, t: number): Promise<{ clave: string; archivo: string } | null> {
    const proyecto = this.proyectos.get(id)
    if (!proyecto) return null
    const fps = proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? proyecto.source.fps : 30
    const clave = claveCuadro(timeline, t, firmaProyecto(proyecto), fps)
    if (!clave) return null
    const archivo = `vista-previa/cuadro-${clave}.jpg`
    const final = join(this.proyectos.carpeta(id), archivo)
    if (existsSync(final)) return { clave, archivo }
    this.cuadrosEnCurso++
    const base: Timeline = { ...timelineActiva(timeline), textos: [], capas: [], ajustesCapa: [] }
    delete base.filtros
    delete base.subtitulosHF
    const tmp = mkdtempSync(join(tmpdir(), 'recorte-cuadro-'))
    try {
      const r = await exportarTimeline(proyecto, base, this.proyectos.carpeta(id), { formato: 'original', subtitulos: false, desde: t, hasta: t + Math.max(0.12, 3 / fps), resolucion: '720', calidad: 'alta', segundoPlano: true }, () => {}, tmp)
      if (!r.ok || !r.output || !existsSync(r.output)) return null
      mkdirSync(this.carpeta(id), { recursive: true })
      const codigo = await new Promise<number | null>((ok) => {
        const hijo = spawn(rutaFfmpeg(), ['-v', 'error', '-y', '-i', r.output!, '-frames:v', '1', ...A_JPG, final], { windowsHide: true })
        hijo.on('error', () => ok(null))
        hijo.on('close', ok)
      })
      return codigo === 0 && existsSync(final) ? { clave, archivo } : null
    } catch {
      return null
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      this.cuadrosEnCurso--
      void this.trabajar()
    }
  }

  /**
   * El último cuadro del clip que sale en la transición del clip `indice`, con todo su color y su encuadre (sin capas ni
   * textos): el MP4 lo deja quieto debajo mientras entra el siguiente, y el monitor lo enseña igual.
   */
  async cuadroSalida(id: string, timeline: Timeline, indice: number): Promise<{ clave: string; archivo: string } | null> {
    const proyecto = this.proyectos.get(id)
    if (!proyecto) return null
    const fps = proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? proyecto.source.fps : 30
    const clave = claveSalida(timeline, indice, firmaProyecto(proyecto), fps)
    if (!clave) return null
    const archivo = `vista-previa/salida-${clave}.jpg`
    const final = join(this.proyectos.carpeta(id), archivo)
    if (existsSync(final)) return { clave, archivo }
    // Solo el clip que sale (y el de antes, por si entraba con transición): su último cuadro es el del final.
    const activa = timelineActiva(timeline)
    const clips = activa.clips.slice(Math.max(0, indice - 2), indice)
    const base: Timeline = { ...activa, clips, textos: [], capas: [], ajustesCapa: [], voces: [], sonidos: [] }
    delete base.musica
    delete base.filtros
    delete base.subtitulosHF
    delete base.marcadores
    const fin = duracionTimeline(base)
    if (!(fin > 0) || !tramos(base).length) return null
    this.cuadrosEnCurso++
    const tmp = mkdtempSync(join(tmpdir(), 'recorte-salida-'))
    try {
      const desde = Math.max(0, fin - Math.max(0.2, 4 / fps))
      const r = await exportarTimeline(proyecto, base, this.proyectos.carpeta(id), { formato: 'original', subtitulos: false, desde, hasta: fin, resolucion: '720', calidad: 'alta', segundoPlano: true }, () => {}, tmp)
      if (!r.ok || !r.output || !existsSync(r.output)) return null
      mkdirSync(this.carpeta(id), { recursive: true })
      const codigo = await new Promise<number | null>((ok) => {
        const hijo = spawn(rutaFfmpeg(), ['-v', 'error', '-y', '-sseof', '-0.5', '-i', r.output!, '-update', '1', ...A_JPG, final], { windowsHide: true })
        hijo.on('error', () => ok(null))
        hijo.on('close', ok)
      })
      return codigo === 0 && existsSync(final) ? { clave, archivo } : null
    } catch {
      return null
    } finally {
      rmSync(tmp, { recursive: true, force: true })
      this.cuadrosEnCurso--
      void this.trabajar()
    }
  }

  /** Deja de empezar tramos nuevos (el que está en curso termina). */
  pausar(id: string): void {
    this.pausados.add(id)
  }

  private async trabajar(): Promise<void> {
    if (this.trabajando) return
    this.trabajando = true
    try {
      for (let sig = this.siguiente(); sig; sig = this.siguiente()) await this.renderizar(sig.id, sig.proyecto, sig.timeline, sig.tramo)
    } finally {
      this.trabajando = false
    }
  }

  private siguiente(): { id: string; proyecto: Project; timeline: Timeline; tramo: TramoVista } | null {
    if (this.cuadrosEnCurso > 0) return null
    for (const [id, p] of this.pedidos) {
      if (this.pausados.has(id)) continue
      const proyecto = this.proyectos.get(id)
      if (!proyecto) {
        this.pedidos.delete(id)
        continue
      }
      const dir = this.carpeta(id)
      const faltan = tramosVista(p.timeline, firmaProyecto(proyecto)).filter(
        (t) => t.pesado && !this.fallidos.has(t.clave) && !existsSync(join(dir, `${t.clave}.mp4`))
      )
      if (!faltan.length) {
        this.pedidos.delete(id)
        continue
      }
      // Primero el tramo del cabezal y los que siguen; los de antes, al final.
      const orden = (t: TramoVista) => (t.hasta <= p.desde ? 1e9 + t.desde : t.desde)
      faltan.sort((a, b) => orden(a) - orden(b))
      return { id, proyecto, timeline: p.timeline, tramo: faltan[0] }
    }
    return null
  }

  private async renderizar(id: string, proyecto: Project, timeline: Timeline, tramo: TramoVista): Promise<void> {
    const tmp = mkdtempSync(join(tmpdir(), 'recorte-vista-'))
    try {
      const r = await exportarTimeline(
        proyecto,
        timeline,
        this.proyectos.carpeta(id),
        // Lo que se ve al reproducir: a 1080 y con calidad alta (a 720 y ligera se veía a manchas en lo oscuro).
        { formato: 'original', subtitulos: false, desde: tramo.desde, hasta: tramo.hasta, resolucion: '1080', calidad: 'alta', segundoPlano: true },
        () => {},
        tmp
      )
      if (!r.ok || !r.output || !existsSync(r.output)) {
        this.fallidos.add(tramo.clave)
        return
      }
      const dir = this.carpeta(id)
      mkdirSync(dir, { recursive: true })
      const final = join(dir, `${tramo.clave}.mp4`)
      try {
        renameSync(r.output, final)
      } catch {
        copyFileSync(r.output, final)
      }
      this.recortar(dir)
      this.alListo(id, tramo.clave)
    } catch {
      this.fallidos.add(tramo.clave)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }

  /** Si hay demasiados tramos guardados, se borran los más viejos (de versiones de la timeline que ya no están). */
  private recortar(dir: string): void {
    try {
      const archivos = readdirSync(dir).filter((f) => f.endsWith('.mp4'))
      if (archivos.length <= MAXIMO_TRAMOS) return
      const viejos = archivos.map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => a.t - b.t)
      for (const { f } of viejos.slice(0, archivos.length - MAXIMO_TRAMOS)) rmSync(join(dir, f), { force: true })
    } catch {
      // Sin poder limpiar no pasa nada: se intenta la próxima vez.
    }
  }
}
