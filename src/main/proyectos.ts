import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Project, TranscriptSegment } from '../shared/types'
import { guardar } from './disco'

/**
 * Un proyecto es una carpeta con `proyecto.json`, la miniatura, el proxy y la transcripción.
 * El video original no se copia: se referencia por ruta, como en un editor de escritorio.
 */
export class Proyectos {
  readonly raiz: string

  constructor(raiz = join(app.getPath('userData'), 'proyectos')) {
    this.raiz = raiz
    mkdirSync(raiz, { recursive: true })
  }

  carpeta(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new Error('Proyecto inválido')
    return join(this.raiz, id)
  }

  private archivo(id: string): string {
    return join(this.carpeta(id), 'proyecto.json')
  }

  private transcripcion(id: string): string {
    return join(this.carpeta(id), 'transcripcion.json')
  }

  list(): Project[] {
    const items: Project[] = []
    for (const entrada of readdirSync(this.raiz, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue
      const proyecto = this.get(entrada.name)
      if (proyecto) items.push(proyecto)
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** La metadata, sin la transcripción: los listados no cargan megabytes de palabras. */
  get(id: string): Project | null {
    try {
      return JSON.parse(readFileSync(this.archivo(id), 'utf8')) as Project
    } catch {
      return null
    }
  }

  /** El proyecto completo, con su transcripción si ya existe. */
  abrir(id: string): Project | null {
    const proyecto = this.get(id)
    if (!proyecto) return null
    const transcript = this.leerTranscripcion(id)
    if (transcript) proyecto.transcript = transcript
    return proyecto
  }

  leerTranscripcion(id: string): TranscriptSegment[] | null {
    const ruta = this.transcripcion(id)
    if (!existsSync(ruta)) return null
    try {
      return JSON.parse(readFileSync(ruta, 'utf8')) as TranscriptSegment[]
    } catch {
      return null
    }
  }

  create(proyecto: Project): Project {
    mkdirSync(this.carpeta(proyecto.id), { recursive: true })
    this.save(proyecto)
    return proyecto
  }

  /** Guarda la metadata. La transcripción vive aparte, en `transcripcion.json`. */
  save(proyecto: Project): void {
    const { transcript: _, ...meta } = proyecto
    proyecto.updatedAt = Date.now()
    meta.updatedAt = proyecto.updatedAt
    guardar(this.archivo(proyecto.id), JSON.stringify(meta, null, 2))
  }

  guardarTranscripcion(id: string, transcript: TranscriptSegment[]): void {
    guardar(this.transcripcion(id), JSON.stringify(transcript))
  }
}
