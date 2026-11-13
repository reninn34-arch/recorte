import type { MensajeChat, OperacionTL } from './chat'
import type { Gustos, SenalGusto } from './gustos'
import type { MusicaTL, Timeline } from './timeline'
import type { AjustesCreacion, Creacion, EstiloPropio, MensajeCreacion, ModeloAgente, PeticionCreacion } from './creacion'
import type { EstadoFlow, PedidoFlow, ResultadoFlow } from './flow'
import type { AjustesIA, Project, TranscriptSegment } from './types'

export interface OpcionesExport {
  formato: 'original' | 'vertical'
  subtitulos: boolean
  /** Solo un tramo de la timeline (la entrada y la salida del editor), en segundos. */
  desde?: number
  hasta?: number
  /** El lado corto del video: el del material, 1080 o 720 (solo achica). */
  resolucion?: 'original' | '1080' | '720'
  /** Alta (archivo grande), normal o ligera (para mandar rápido). */
  calidad?: 'alta' | 'normal' | 'ligera'
  /** Deja el volumen a la medida de las redes (−14 LUFS). */
  normalizar?: boolean
  /** Solo el sonido de la mezcla final, en WAV (sin pérdida) o MP3 (liviano): sin video. */
  soloAudio?: 'wav' | 'mp3'
}

export interface EstadoAgente {
  id: 'kimi' | 'claude' | 'codex' | 'gemini' | 'opencode' | 'antigravity'
  nombre: string
  instalado: boolean
  conectado: boolean | null
  comando: string
  instalar: string
  /** Si además de la suscripción acepta una llave de API (Claude Code). */
  admiteLlave?: boolean
  pago?: 'suscripcion' | 'llave'
  tieneLlave?: boolean
}

export interface Herramienta {
  id: string
  nombre: string
  descripcion: string
  estado: 'ok' | 'falta' | 'opcional'
  version: string | null
  /** Qué falta, en una línea. */
  detalle?: string
  /** Se instala con un botón desde Ajustes. */
  instalable?: boolean
  /** Se baja con un botón a la carpeta de Recorte (FFmpeg, Python, Node.js). */
  descargable?: boolean
  /** Si no, la página donde se descarga. */
  ayuda?: string
}

export interface EstadoSistema {
  procesador: string
  hilos: number
  memoria: number
  gpu: string | null
  disco: { libre: number; total: number } | null
  uso: { proyectos: number; creaciones: number; agentes: number }
  herramientas: Herramienta[]
}

/** Lo que mide el kit en este equipo (Ajustes › Tu equipo › Medir velocidad). */
export interface MedidaRender {
  /** Segundos por cuadro de prueba, en un núcleo. */
  por_cuadro: number
  /** Cuadros que dibuja a la vez (núcleos libres, según la memoria). */
  hilos: number
  /** El codificador H.264: h264_amf, h264_nvenc, h264_qsv o libx264 (el procesador). */
  codificador: string
  /** Si los modelos de IA (recortes, esqueleto, profundidad) van con la tarjeta gráfica. */
  modelos_gpu: boolean
  /** Lo que tardaría un documental de 50 s con escenas 3D y personajes animados, en minutos. */
  minutos_documental: number
  memoria_libre_gb: number
}

export interface Preferencias {
  avisoNotificacion: boolean
  avisoSonido: boolean
  novedadesVistas?: string
  /** Crear con IA: tras el plan, empezar sin esperar el «Hazlo» si el agente no tiene preguntas. */
  crearDirecto?: boolean
}

/** Un proveedor que trabaja solo con su llave de API (endpoint compatible con OpenAI). */
export interface ProveedorApi {
  id: 'gemini-api' | 'deepseek' | 'grok'
  nombre: string
  baseUrl: string
  /** Modelo por defecto; se puede cambiar en Ajustes. */
  modelo: string
  /** Dónde se consigue la llave. */
  donde: string
  dondeTexto: string
  plan: string
}

export const PROVEEDORES_API: ProveedorApi[] = [
  {
    id: 'gemini-api',
    nombre: 'Gemini · AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelo: 'gemini-2.5-flash',
    donde: 'https://aistudio.google.com/apikey',
    dondeTexto: 'aistudio.google.com/apikey',
    plan: 'Tu llave de AI Studio · gratis con límites · también genera las voces'
  },
  {
    id: 'deepseek',
    nombre: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelo: 'deepseek-chat',
    donde: 'https://platform.deepseek.com/api_keys',
    dondeTexto: 'platform.deepseek.com',
    plan: 'Tu llave de DeepSeek · se cobra por uso, del saldo de tu cuenta'
  },
  {
    id: 'grok',
    nombre: 'Grok · xAI',
    baseUrl: 'https://api.x.ai/v1',
    modelo: 'grok-4',
    donde: 'https://console.x.ai',
    dondeTexto: 'console.x.ai',
    plan: 'Tu llave de xAI · se cobra por uso'
  }
]

export interface ConexionResultado {
  ok: boolean
  error?: string
  aviso?: string
  /** El inicio de sesión sigue en otra ventana: la interfaz espera las credenciales. */
  pendiente?: boolean
}

/** La voz con la cuenta de Google (AI Studio abierto en Edge, manejado por la app). */
export interface EstadoVozGoogle {
  correo: string | null
  conectando: boolean
  /** Navegador que se usa para entrar (hoy siempre Edge). */
  navegador: string | null
  error?: string
}

export type FaseProgreso = 'ingesta' | 'transcripcion' | 'render' | 'exportar' | 'creacion'

export interface EstadoActualizacion {
  /** desarrollo: no es la app instalada; al-dia: no hay nada nuevo; lista: bajada, falta reiniciar. */
  fase: 'nada' | 'desarrollo' | 'buscando' | 'al-dia' | 'bajando' | 'lista' | 'error'
  /** La versión que corre ahora. */
  version: string
  /** La versión nueva, si hay. */
  nueva?: string
  pct?: number
  revisado?: number
  error?: string
  /** El resumen de la versión nueva (de las notas del release). */
  notas?: string
}

export interface Progreso {
  id: string
  fase: FaseProgreso
  pct: number
  texto?: string
  clipId?: string
  /** Posición dentro de un render por lote: clip actual y total. */
  lote?: { indice: number; total: number }
  /** Creaciones: cuándo empezó este paso (ms), para que el reloj no vuelva a cero al salir y entrar. */
  desde?: number
  /** Modo agente: lo último que hizo el agente, en vivo. */
  registro?: string[]
  /** Modo agente: en qué paso del plan va (1 = el primero). */
  paso?: number
  /** Modo agente: los pasos del plan mientras se hace (llegan antes de que la creación se refresque). */
  pasos?: string[]
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

export interface TurnoChat {
  ok: boolean
  mensaje: string
  operaciones: OperacionTL[]
  error?: string
  /** El usuario lo paró: no respondió nada ni cambió nada. */
  parado?: boolean
  /** Siguientes pasos que propone el agente. */
  propuestas?: string[]
  /** Gustos nuevos que aprendió en este turno. */
  aprendido?: string[]
}

/** El servidor MCP de Recorte (para que un agente de fuera maneje la app). */
export interface EstadoMcp {
  activo: boolean
  url: string
  contrasena: string
  error?: string
  claudeInstalado: boolean
  /** Claude Code ya lo tiene registrado con esta dirección y contraseña. */
  claudeConectado: boolean
  /** La configuración para otros agentes (formato `mcpServers`). */
  configJson: string
}

export interface RecorteApi {
  openVideo: () => Promise<string | null>
  crearProyecto: (ruta: string) => Promise<IngestaResultado>
  listarProyectos: () => Promise<Project[]>
  abrirProyecto: (id: string) => Promise<Project | null>
  guardarProyecto: (project: Project) => Promise<void>
  /** Manda el proyecto a la Papelera (el video original no se toca). */
  borrarProyecto: (id: string) => Promise<boolean>
  borrarCreacion: (id: string) => Promise<boolean>
  /** Abre el selector y agrega varios videos o imágenes a la biblioteca del proyecto. */
  agregarMedios: (id: string) => Promise<{ project: Project; agregados: string[]; fallos: string[] } | null>
  /** Quita el fondo liso de una imagen de la biblioteca: devuelve el proyecto con el recorte (un medio nuevo) y su id. */
  quitarFondo: (id: string, medio: string) => Promise<{ project: Project; medio: string }>
  /** Anima una imagen recortada (respirar, balanceo, ondear, flotar, humo): devuelve la animación (un medio nuevo). */
  animarImagen: (id: string, medio: string, tipo: string) => Promise<{ project: Project; medio: string; escala: number; avisos?: string[] }>
  /** Estabiliza el tramo de un video que usa un clip: la toma estable entra a la biblioteca (empieza en `desde` de la original). */
  estabilizar: (id: string, fuente: string, desde: number, hasta: number) => Promise<{ project: Project; medio: string; desde: number }>
  /** Guarda el cuadro del cabezal (con todo lo de encima) como PNG en la carpeta de videos del proyecto. */
  exportarCuadro: (id: string, timeline: unknown, segundo: number) => Promise<{ ok: boolean; archivo?: string; error?: string }>
  /** Sigue una zona de un video desde el segundo `en` (su centro en cada momento, en fracciones del cuadro). */
  seguirZona: (
    id: string,
    fuente: string,
    pedido: { desde: number; hasta: number; en: number; x: number; y: number; ancho: number; alto: number }
  ) => Promise<{ recorrido: { f: number; x: number; y: number }[]; perdido: number }>
  /** Anida varios clips seguidos: los renderiza en un video de la biblioteca (para ponerlo como un solo clip). */
  anidar: (id: string, clips: unknown[]) => Promise<{ project: Project; medio: string; duracion: number }>
  /** Multicámara: cuánto está corrida cada toma respecto de la primera, por su sonido (y cuánto se parecen, 0 a 1). */
  sincronizar: (id: string, fuentes: string[]) => Promise<{ fuente: string; desfase: number; confianza: number }[]>
  /** Saca el sonido de un tramo de un video a la carpeta del proyecto (para separarlo del clip). */
  extraerAudio: (id: string, fuente: string, desde: number, hasta: number) => Promise<{ archivo: string; duracion: number; nombre: string }>
  /** Saca el cuadro de un video (en ese segundo de su fuente) a la biblioteca como imagen, para congelarlo. */
  congelarCuadro: (id: string, fuente: string, segundo: number) => Promise<{ project: Project; medio: string }>
  /** La ruta en el disco de un archivo soltado o pegado (de Windows). */
  rutaDeArchivo: (archivo: File) => string | null
  /** Importa archivos soltados o pegados: videos y fotos a la biblioteca, audios a la carpeta del proyecto. */
  importarRutas: (
    id: string,
    rutas: string[]
  ) => Promise<{ project: Project; agregados: string[]; audios: { archivo: string; nombre: string; duracion: number }[]; fallos: string[] }>
  /** Los picos del audio de una fuente (50 por segundo, 0 a 1) para dibujar su onda; null si no tiene sonido. */
  ondaDe: (id: string, fuente: string) => Promise<number[] | null>
  /** Quita un medio del proyecto y sus clips de la timeline (el archivo no se toca). */
  quitarMedio: (id: string, medio: string) => Promise<Project>
  transcribir: (id: string) => Promise<TranscripcionResultado>
  generarClips: (id: string) => Promise<AnalisisResultado>
  cargarAjustes: () => Promise<AjustesIA>
  /** `clave` undefined conserva la actual; '' la borra. */
  guardarAjustes: (ajustes: Omit<AjustesIA, 'tieneClave' | 'claveCifrada'>, clave?: string) => Promise<AjustesIA>
  agentesEstado: () => Promise<EstadoAgente[]>
  /** Los modelos del agente con sus esfuerzos, tal como los dice el agente (se recuerdan un día). */
  agentesModelos: (id: string, forzar?: boolean) => Promise<ModeloAgente[]>
  /** Cuando un agente suma o quita modelos (se revisa al abrir y cada hora). */
  onModelosCambiaron: (cb: (id: string, modelos: ModeloAgente[]) => void) => () => void
  agentesConectar: (id: string) => Promise<ConexionResultado>
  agentesDesconectar: (id: string) => Promise<ConexionResultado>
  agentesDesactivar: () => Promise<AjustesIA>
  /** La versión instalada de cada agente (corre `--version`: tarda unos segundos). */
  agentesVersiones: () => Promise<Record<string, string | null>>
  /** Pagar con la suscripción o con una llave de API (`llave` vacía la borra). */
  agentesPago: (id: string, cambio: { pago?: 'suscripcion' | 'llave'; llave?: string }) => Promise<EstadoAgente[]>
  sistemaEstado: () => Promise<EstadoSistema>
  /** Mide cuánto tardaría este equipo en renderizar un video del agente (unos segundos). */
  sistemaMedirRender: () => Promise<MedidaRender>
  sistemaInstalar: (id: string) => Promise<{ ok: boolean; error?: string }>
  sistemaAbrirDatos: () => Promise<void>
  /** Dónde quedan tus videos: la carpeta elegida (o la propuesta) y si ya la elegiste. */
  carpetaEstado: () => Promise<{ ruta: string; elegida: boolean }>
  /** Abre el selector de carpetas; null si se cancela. */
  carpetaElegir: () => Promise<{ ruta: string; elegida: boolean } | null>
  carpetaUsarPropuesta: () => Promise<{ ruta: string; elegida: boolean }>
  carpetaAbrir: (ruta?: string) => Promise<void>
  /** Google Flow: cuentas, créditos y los dos interruptores de Ajustes. */
  flowEstado: () => Promise<EstadoFlow>
  flowAjustes: (cambio: { aportar?: boolean; derechos?: boolean }) => Promise<EstadoFlow>
  flowAgregarCuenta: () => Promise<EstadoFlow>
  flowQuitarCuenta: (correo: string) => Promise<EstadoFlow>
  flowAbrir: (correo: string) => Promise<void>
  flowLeerSaldos: () => Promise<EstadoFlow>
  /** Genera una imagen o un video en Flow; lo deja en la carpeta del proyecto o la creación. */
  flowGenerar: (destino: { creacion?: string; proyecto?: string }, pedido: PedidoFlow) => Promise<ResultadoFlow & { relativo: string }>
  preferenciasCargar: () => Promise<Preferencias>
  preferenciasGuardar: (cambio: Partial<Preferencias>) => Promise<Preferencias>
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
  /** Exporta la timeline tal como se ve en el monitor. */
  exportarTimeline: (id: string, timeline: Timeline, opciones: OpcionesExport) => Promise<RenderResultado>
  abrirExportacion: (id: string) => Promise<boolean>
  /** Elige un audio, lo copia a `media/` del proyecto y devuelve la pista lista para la timeline. */
  /** Genera una frase de narración con una voz de Gemini y la deja en el proyecto (sin agente). */
  vozFrase: (id: string, pedido: { texto: string; voz?: string }) => Promise<{ archivo: string; duracion: number; texto: string; voz: string }>
  /** Una frase grabada con tu voz en el editor (el audio del micrófono): queda en el proyecto. */
  vozGrabada: (id: string, datos: Uint8Array, texto: string) => Promise<{ archivo: string; duracion: number; texto: string }>
  /** La URL de la muestra de una voz de Gemini (la genera la primera vez). */
  vozMuestra: (voz: string) => Promise<string>
  importarMusica: (id: string) => Promise<{ ok: boolean; musica?: MusicaTL; error?: string } | null>
  /** Copia un efecto de sonido al proyecto: uno incluido (su id) o, sin id, uno que elija el usuario. */
  mcpEstado: () => Promise<EstadoMcp>
  mcpConectarClaude: () => Promise<{ ok: boolean; error?: string }>
  mcpNuevaContrasena: () => Promise<EstadoMcp>
  /** Un agente cambió un proyecto por MCP (la interfaz lo recoge). Devuelve cómo dejar de escuchar. */
  onProyectoExterno: (cb: (e: { proyecto: Project; quien: string; conTimeline: boolean }) => void) => () => void
  /** Un agente pidió mostrar un proyecto en el editor. */
  onAbrirProyecto: (cb: (id: string) => void) => () => void
  /** Un agente de fuera (MCP) pide enseñar una creación con su chat. */
  onAbrirCreacion: (cb: (id: string) => void) => () => void
  ponerSonido: (id: string, incluido?: string) => Promise<{ ok: boolean; sonido?: { archivo: string; nombre: string; duracion: number }; error?: string } | null>
  /** Crear con IA: videos desde cero, sin material importado. */
  elegirAdjuntos: () => Promise<string[]>
  /** Una carpeta de material: el agente recibe todas sus fotos y videos. */
  elegirCarpeta: () => Promise<string | null>
  /** El video de referencia cuyo estilo se copia (uno; no entra en el video). */
  elegirReferencia: () => Promise<string | null>
  creacionesListar: () => Promise<Creacion[]>
  creacionAbrir: (id: string) => Promise<Creacion | null>
  /** Las creaciones en las que el agente trabaja ahora, con cuándo empezó (ms). */
  creacionEnCurso: () => Promise<Record<string, number>>
  creacionNueva: (peticion: PeticionCreacion) => Promise<Creacion>
  /** Copiar un estilo: analiza el material y la referencia, y saca la ficha (modo 'gemini': Gemini ve el video completo). */
  /** Modo agente: el agente mira los archivos y propone un plan (o pregunta). */
  agentePlan: (id: string, pedido?: string) => Promise<Creacion>
  /** Modo agente: hace (o cambia) el video con herramientas, se comprueba y entrega. */
  agenteHacer: (id: string, pedido?: string) => Promise<Creacion>
  /** Sigue una creación que se quedó sin uso del plan a mitad, desde donde iba (con el agente que esté elegido). */
  agenteSeguir: (id: string) => Promise<Creacion>
  /** Lo que se cambia en la caja del chat a mitad de la creación; vale desde el siguiente turno. */
  creacionAjustar: (id: string, cambios: AjustesCreacion) => Promise<Creacion>
  /** Más fotos, videos o carpetas para el agente (desde el «+» del chat). */
  creacionAdjuntar: (id: string, rutas: string[]) => Promise<Creacion>
  /** Deja en la conversación los mensajes de un cambio rápido sobre la timeline. */
  creacionAnotar: (id: string, mensajes: Partial<MensajeCreacion>[]) => Promise<Creacion>
  /** «Así está bien»: la versión n es la buena (si no es la vigente, vuelve a ella). */
  creacionAprobar: (id: string, n: number) => Promise<Creacion>
  /** Vuelve a la versión n: su video y su receta pasan a ser los vigentes. */
  creacionVolver: (id: string, n: number) => Promise<Creacion>
  /** Un video nuevo con el estilo de esta creación (su versión aprobada, o la n). */
  creacionOtroAsi: (id: string, peticion: string, n?: number) => Promise<Creacion>
  /** «Mis estilos»: los estilos guardados desde videos que salieron bien. */
  estilosPropios: () => Promise<EstiloPropio[]>
  guardarEstiloPropio: (id: string, nombre: string, n?: number) => Promise<EstiloPropio>
  borrarEstiloPropio: (id: string) => Promise<EstiloPropio[]>
  estiloAnalizar: (id: string, modo?: 'gemini') => Promise<Creacion>
  /** Deja la fase Estilo y pasa al guion. */
  estiloContinuar: (id: string) => Promise<Creacion>
  /** Recalcula qué se puede copiar con lo conectado ahora (sin volver a analizar). */
  estiloViabilidad: (id: string) => Promise<Creacion>
  /** Edita a mano lo básico de la ficha (subtítulos y ritmo). */
  estiloFichaGuardar: (
    id: string,
    cambios: { subtitulos?: { lleva?: boolean; modo?: 'palabra' | 'frase' }; ritmoSegundos?: number }
  ) => Promise<Creacion>
  /** Propone el guion, o lo cambia si hay `pedido`. */
  creacionGuion: (id: string, pedido?: string) => Promise<Creacion>
  /** Compone y renderiza; con `pedido` cambia el video ya hecho. */
  creacionVideo: (id: string, pedido?: string) => Promise<Creacion>
  /** Lleva el MP4 al editor como un proyecto con su timeline. */
  creacionAlEditor: (id: string) => Promise<Project>
  creacionMostrar: (id: string) => Promise<boolean>
  /** La voz: clave de AI Studio (nunca vuelve a la interfaz), voz elegida y cuenta de Google. */
  vozEstado: () => Promise<{ tieneClave: boolean; vozGemini?: string; delAgente?: boolean; google?: EstadoVozGoogle }>
  vozGuardar: (cambio: { clave?: string; vozGemini?: string }) => Promise<{ tieneClave: boolean; vozGemini?: string }>
  /** Entrar con la cuenta de Google para la voz (abre Edge; el login lo hace la persona). */
  vozGoogleConectar: () => Promise<EstadoVozGoogle>
  vozGoogleDesconectar: () => Promise<EstadoVozGoogle>
  creacionVozGemini: (id: string, voz: string) => Promise<Creacion>
  /** Audio grabado en la app (WebM) o elegido del disco (sin `datos`, abre el selector). */
  creacionVozPropia: (id: string, datos?: Uint8Array) => Promise<Creacion | null>
  creacionQuitarVoz: (id: string) => Promise<Creacion>
  /** Pone la voz en el video ya hecho, sin agente (FFmpeg). */
  creacionMontarVoz: (id: string) => Promise<Creacion>
  /** Un turno del chat: el agente responde y propone operaciones sobre la timeline. */
  chatAgente: (
    id: string,
    timeline: Timeline,
    historial: MensajeChat[],
    peticion: string,
    referencia?: string
  ) => Promise<TurnoChat>
  /** El criterio que la app aprendió del usuario (se ve y se borra en Ajustes). */
  gustos: () => Promise<Gustos>
  gustoAgregar: (texto: string) => Promise<Gustos>
  gustoQuitar: (id: string) => Promise<Gustos>
  gustosActivar: (activo: boolean) => Promise<Gustos>
  gustosOlvidar: () => Promise<Gustos>
  /** Lo que hizo el usuario con una propuesta del agente (el agente lo lee para aprender). */
  gustoSenal: (tipo: SenalGusto['tipo'], detalle: string) => Promise<void>
  /** Para al agente del chat de ese proyecto (deja de gastar al instante). */
  pararAgente: (id: string) => Promise<boolean>
  /** Para lo que el agente esté haciendo en esa creación (guion, Flow, render). */
  creacionParar: (id: string) => Promise<boolean>
  /** Si se pueden hacer imágenes con la cuenta de ChatGPT (Codex instalado y con sesión). */
  chatgptEstado: () => Promise<{ instalado: boolean; conectado: boolean; conCuenta: boolean }>
  /** Actualizaciones desde GitHub Releases (solo en la app instalada). */
  actualizacionEstado: () => Promise<EstadoActualizacion>
  actualizacionBuscar: () => Promise<EstadoActualizacion>
  /** Cierra, instala la versión ya bajada y vuelve a abrir Recorte. */
  actualizacionInstalar: () => Promise<void>
  onActualizacion: (cb: (e: EstadoActualizacion) => void) => () => void
  /** Progreso de una herramienta que se baja o se instala desde Ajustes. */
  onHerramienta: (cb: (p: { id: string; pct: number; texto: string }) => void) => () => void
  /** La sesión de un agente se cayó mientras trabajaba: hay que volver a conectarlo. */
  onSesionCaida: (cb: (id: EstadoAgente['id']) => void) => () => void
  /** El tamaño de la interfaz: automático (según la ventana) o fijo. */
  interfazEstado: () => Promise<{ automatica: boolean; escala: number }>
  /** Fija el tamaño (0.7 a 2.2) o lo vuelve automático (null). */
  interfazEscala: (valor: number | null) => Promise<{ automatica: boolean; escala: number }>
  onInterfaz: (cb: (e: { automatica: boolean; escala: number }) => void) => () => void
  onProgreso: (cb: (p: Progreso) => void) => () => void
  platform: string
}
