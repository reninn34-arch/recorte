import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Timeline } from '../shared/timeline'
import type { Project } from '../shared/types'
import { esClaveVista, firmaProyecto, tramosVista, type TramoVista } from '../shared/vistaprevia'
import { exportarTimeline } from './exportar'

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
        { formato: 'original', subtitulos: false, desde: tramo.desde, hasta: tramo.hasta, resolucion: '720', calidad: 'ligera' },
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
