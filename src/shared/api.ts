import type { AjustesIA, Project, TranscriptSegment } from './types'

export interface EstadoAgente {
  id: 'kimi' | 'claude' | 'codex' | 'gemini'
  nombre: string
  instalado: boolean
  conectado: boolean | null
  comando: string
  instalar: string
}

export interface ConexionResultado {
  ok: boolean
  error?: string
  aviso?: string
}

export type FaseProgreso = 'ingesta' | 'transcripcion' | 'render'

export interface Progreso {
  id: string
  fase: FaseProgreso
  pct: number
  texto?: string
  clipId?: string
  /** Posición dentro de un render por lote: clip actual y total. */
  lote?: { indice: number; total: number }
}

export interface IngestaResultado {
  project: Project
  videoUrl: string
  thumbnailUrl?: string
}

export interface TranscripcionResultado {
  ok: boolean
  error?: string
  project?: Project
  transcript?: TranscriptSegment[]
}

export interface AnalisisResultado {
  ok: boolean
  error?: string
  project?: Project
  /** 'ia' si los momentos salieron del modelo; 'local' si se usaron las heurísticas. */
  fuente?: 'ia' | 'local'
  /** Aviso no fatal, p. ej. «la IA falló y se usó la selección local». */
  aviso?: string
}

export interface RenderResultado {
  ok: boolean
  error?: string
  project?: Project
  output?: string
  cover?: string
}

export interface RenderLoteResultado {
  ok: boolean
  error?: string
  project?: Project
  renderizados: number
  fallidos: number
}

export interface RecorteApi {
  openVideo: () => Promise<string | null>
  crearProyecto: (ruta: string) => Promise<IngestaResultado>
  listarProyectos: () => Promise<Project[]>
  abrirProyecto: (id: string) => Promise<Project | null>
  guardarProyecto: (project: Project) => Promise<void>
  transcribir: (id: string) => Promise<TranscripcionResultado>
  generarClips: (id: string) => Promise<AnalisisResultado>
  cargarAjustes: () => Promise<AjustesIA>
  /** `clave` undefined conserva la actual; '' la borra. */
  guardarAjustes: (ajustes: Omit<AjustesIA, 'tieneClave' | 'claveCifrada'>, clave?: string) => Promise<AjustesIA>
  agentesEstado: () => Promise<EstadoAgente[]>
  agentesConectar: (id: string) => Promise<ConexionResultado>
  renderizarClip: (id: string, clipId: string) => Promise<RenderResultado>
  renderizarLote: (id: string, clipIds?: string[]) => Promise<RenderLoteResultado>
  /** Fase 1: el agente propone una RecetaEdicion y queda en el proyecto. */
  editarConAgente: (id: string) => Promise<AnalisisResultado>
  renderizarEdicion: (id: string) => Promise<RenderResultado>
  abrirEdicion: (id: string) => Promise<boolean>
  /** Fase 2: el agente diseña una composición HyperFrames y se renderiza a MP4. */
  crearVideo: (
    id: string,
    peticion: string,
    opciones?: { incluirMaterial?: boolean; estilo?: string }
  ) => Promise<RenderResultado & { fuente?: 'ia' | 'local'; aviso?: string }>
  abrirCreacion: (id: string) => Promise<boolean>
  abrirSalida: (id: string, clipId: string) => Promise<boolean>
  onProgreso: (cb: (p: Progreso) => void) => () => void
  platform: string
}
