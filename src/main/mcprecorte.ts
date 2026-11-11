import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aplicarOperaciones, describirTimelineParaAgente, OPERACIONES_DOC, validarOperaciones, type OperacionTL } from '../shared/chat'
import type { RenderResultado, TranscripcionResultado } from '../shared/api'
import { COSTO_CLIP, MAX_CLIPS_VEO, textoMuestra, VOCES_GEMINI, type Creacion, type PeticionCreacion } from '../shared/creacion'
import { MODELOS_IMAGEN, modelosVideoVigentes, type PedidoFlow, type ResultadoFlow } from '../shared/flow'
import { duracionesDeMedios, duracionTimeline, normalizarTimeline, timelineInicial, ventanaTimeline, type Timeline } from '../shared/timeline'
import type { Project } from '../shared/types'
import { exportarTimeline } from './exportar'
import { rutaFfmpeg } from './ffmpeg'
import type { HerramientaMcp, ResultadoHerramienta } from './mcp'
import type { Proyectos } from './proyectos'

/**
 * Las herramientas MCP de Recorte (fase 6.2): ver y editar proyectos desde un agente de fuera.
 * Lo que el agente cambia queda en la timeline, editable a mano y con Ctrl+Z en el editor.
 * Lo que gasta créditos (voz nueva, Flow) no está aquí todavía (6.3, con confirmación).
 */

export interface ContextoMcp {
  proyectos: Proyectos
  listarCreaciones: () => Creacion[]
  ingerir: (ruta: string) => Promise<{ project: Project }>
  agregarRutas: (id: string, rutas: string[]) => Promise<{ project: Project; agregados: string[]; fallos: string[] }>
  transcribir: (id: string) => Promise<TranscripcionResultado>
  exportar: (id: string, timeline: Timeline, opciones: { formato: 'original' | 'vertical'; subtitulos: boolean }) => Promise<RenderResultado>
  /** Copia un efecto de sonido incluido al proyecto. */
  copiarSonido: (id: string, sonido: string) => Promise<{ archivo: string; duracion: number; nombre: string } | null>
  /** El proyecto cambió por fuera: la interfaz lo recoge (si está abierto, como un paso de deshacer). */
  avisarCambio: (proyecto: Project, quien: string, conTimeline?: boolean) => void
  /** Trae la ventana de Recorte al frente con el proyecto abierto en el editor. */
  abrirEnApp: (id: string) => void
  // ===== Crear por MCP (6.3) =====
  creaciones: {
    nueva: (p: PeticionCreacion) => Promise<Creacion>
    get: (id: string) => Creacion | null
    carpeta: (id: string) => string
  }
  /** Si el agente de la creación está trabajando: desde cuándo y su último aviso. */
  trabajando: (id: string) => { desde: number; pct?: number; texto?: string } | null
  /** Un turno de la charla del plan (con «Hazlo directo», sigue con el video). Empieza y vuelve ya. */
  charlar: (id: string, texto?: string) => void
  /** «Hazlo» (o un cambio sobre lo hecho). Empieza y vuelve ya. */
  hacer: (id: string, texto?: string) => void
  /** Sigue una creación en pausa por el límite de uso. */
  seguir: (id: string) => void
  parar: (id: string) => boolean
  /** El proyecto del editor de una creación con video. */
  alEditor: (id: string) => Promise<Project>
  abrirCreacionEnApp: (id: string) => void
  voz: {
    conectada: () => Promise<boolean>
    porDefecto: () => Promise<string>
    generar: (texto: string, voz: string, salida: string) => Promise<void>
    carpetaMuestras: string
    duracion: (ruta: string) => Promise<number>
    /** Genera el audio de las operaciones de voz (les pone `audio`); devuelve lo que falló. */
    delChat: (id: string, tl: Timeline, ops: OperacionTL[]) => Promise<string[]>
  }
  flow: {
    conectado: () => boolean
    derechos: () => boolean
    generar: (pedido: PedidoFlow, carpeta: string) => Promise<ResultadoFlow>
  }
}

export const INSTRUCCIONES_MCP = `Recorte es un editor de video de escritorio que está abierto en el equipo del usuario.
Con estas herramientas ves y editas sus proyectos: lo que cambias aparece al momento en su editor,
y el usuario lo puede retocar a mano o deshacerlo con Ctrl+Z. Empieza con listar_proyectos y
ver_proyecto; usa ver_cuadro para mirar cómo queda un momento antes y después de cambiarlo.
Exportar escribe un MP4 en su carpeta de Videos. Habla con el usuario en español.

Para un video nuevo hecho por el agente de Recorte: crear_video, luego ver_creacion hasta que deje de
trabajar (tarda minutos; espera entre consultas), contesta lo que pregunte con hablar_con_agente y,
cuando el plan esté bien, hacer_video. Al terminar, pasar_al_editor da el proyecto para retocarlo.
Lo que gasta créditos o cuota (voz nueva, clips de Flow) devuelve primero cuánto cuesta y un código:
díselo al usuario con el costo y, solo si acepta, repite la llamada con ese "confirmacion".`

/** La timeline que de verdad tiene el proyecto: la pendiente (aún no aplicada en el editor) manda. */
function timelineDe(p: Project): Timeline {
  const base = p.timelinePendiente ?? p.timeline ?? timelineInicial(p.source.duration)
  return normalizarTimeline(base, p.source.duration, duracionesDeMedios(p.medios))
}

function nombresDe(p: Project): Record<string, string> {
  return Object.fromEntries((p.medios ?? []).map((m) => [m.id, `${m.tipo === 'imagen' ? 'imagen' : 'video'} «${m.nombre}»`]))
}

const ok = (texto: string): ResultadoHerramienta => ({ texto })
const fallo = (texto: string): ResultadoHerramienta => ({ texto, error: true })
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export function herramientasRecorte(ctx: ContextoMcp): HerramientaMcp[] {
  /** Busca un proyecto por id o por nombre (sin distinguir mayúsculas). */
  const buscar = (dado: unknown): Project => {
    const q = texto(dado)
    if (!q) throw new Error('Falta «proyecto» (su id o su nombre; míralos con listar_proyectos).')
    const porId = /^[\w-]+$/.test(q) ? ctx.proyectos.abrir(q) : null
    if (porId) return porId
    const lista = ctx.proyectos.list()
    const igual = lista.filter((p) => p.name.toLowerCase() === q.toLowerCase())
    const parecidos = igual.length ? igual : lista.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    if (parecidos.length === 1) return ctx.proyectos.abrir(parecidos[0].id)!
    if (parecidos.length > 1) throw new Error(`Hay ${parecidos.length} proyectos que se llaman así: ${parecidos.map((p) => `${p.name} (${p.id})`).join(', ')}. Usa su id.`)
    throw new Error(`No hay ningún proyecto «${q}». Míralos con listar_proyectos.`)
  }

  const proyectoArg = { type: 'string', description: 'El id del proyecto o su nombre.' }

  /**
   * Lo que gasta créditos o cuota pide permiso: la primera llamada devuelve el costo y un código;
   * solo la segunda, con el mismo pedido y ese código, lo hace. Así el agente tiene que preguntar.
   */
  const pendientes = new Map<string, { clave: string; expira: number }>()
  const confirmado = (clave: string, args: Record<string, unknown>): boolean => {
    const codigo = texto(args.confirmacion).toUpperCase()
    const p = codigo ? pendientes.get(codigo) : undefined
    if (!p || p.clave !== clave || p.expira < Date.now()) return false
    pendientes.delete(codigo)
    return true
  }
  const pedirPermiso = (clave: string, gasto: string): ResultadoHerramienta => {
    for (const [k, v] of pendientes) if (v.expira < Date.now()) pendientes.delete(k)
    const codigo = randomBytes(3).toString('hex').toUpperCase()
    pendientes.set(codigo, { clave, expira: Date.now() + 30 * 60_000 })
    return ok(
      `Esto gasta: ${gasto}\nTodavía no hice nada. Pregúntale al usuario si está de acuerdo (dile el costo). ` +
        `Si dice que sí, vuelve a llamar a esta herramienta con lo mismo y "confirmacion": "${codigo}" (vale 30 minutos).`
    )
  }
  /** Las creaciones cuyo gasto (voz, clips) el usuario ya aceptó mientras la app sigue abierta. */
  const autorizadas = new Set<string>()
  const gastoDeCreacion = (c: Pick<Creacion, 'vozElegida' | 'flow'>): string => {
    const partes: string[] = []
    if (c.vozElegida) partes.push(`la narración con la voz ${c.vozElegida} de Gemini (usa la cuota de tu cuenta de voz)`)
    if (c.flow?.videos) {
      const modelo = c.flow.modeloVideo ?? modelosVideoVigentes()[0]
      const costo = COSTO_CLIP[modelo] ?? 20
      partes.push(`hasta ${MAX_CLIPS_VEO} clips de ${modelo} en Google Flow (${costo} créditos cada uno, hasta ${costo * MAX_CLIPS_VEO}; el plan dirá cuántos)`)
    }
    return partes.join(' y ')
  }
  const buscarCreacion = (dado: unknown): Creacion => {
    const q = texto(dado)
    if (!q) throw new Error('Falta «creacion» (su id; míralo con listar_proyectos).')
    const porId = /^[\w-]+$/.test(q) ? ctx.creaciones.get(q) : null
    if (porId) return porId
    const parecidos = ctx.listarCreaciones().filter((c) => c.nombre.toLowerCase().includes(q.toLowerCase()))
    if (parecidos.length === 1) return parecidos[0]
    if (parecidos.length > 1) throw new Error(`Hay ${parecidos.length} creaciones que se llaman así: ${parecidos.map((c) => `${c.nombre} (${c.id})`).join(', ')}. Usa su id.`)
    throw new Error(`No hay ninguna creación «${q}». Míralas con listar_proyectos.`)
  }
  const creacionArg = { type: 'string', description: 'El id de la creación (sale en listar_proyectos y al crearla).' }
  const confirmacionArg = { type: 'string', description: 'El código que te dio la primera llamada, solo si el usuario aceptó el gasto.' }
  /** Cómo va una creación, en texto: la conversación reciente, el plan y si sigue trabajando. */
  const describirCreacion = (c: Creacion, mensajes = 8): string => {
    const t = ctx.trabajando(c.id)
    const flow = c.flow ? [c.flow.imagenes ? 'imágenes' : '', c.flow.videos ? `clips (${c.flow.modeloVideo ?? modelosVideoVigentes()[0]})` : ''].filter(Boolean).join(' y ') : 'no'
    const lineas = [
      `Creación «${c.nombre}» (id ${c.id}) · ${c.formato} · fase ${c.fase}${c.version ? ` · versión ${c.version}` : ''}.`,
      `Voz: ${c.vozElegida ?? 'sin narración'}. Flow: ${flow}. ${c.directo ? 'Hazlo directo.' : 'Pregúntame antes.'}`
    ]
    if (t) {
      const min = Math.max(0, Math.round((Date.now() - t.desde) / 60_000))
      lineas.push(`TRABAJANDO desde hace ${min} min${t.texto ? `: ${t.texto}` : ''}${typeof t.pct === 'number' ? ` (${Math.round(t.pct * 100)} %)` : ''}. Vuelve a mirar en un par de minutos.`)
    } else if (c.agente?.pausa) {
      lineas.push(`EN PAUSA: se acabó el uso del plan del agente${c.agente.pausa.reanudar ? `; sigue solo el ${new Date(c.agente.pausa.reanudar).toLocaleString('es')}` : ''}. Con hacer_video y "seguir": true continúa ya.`)
    } else {
      lineas.push('Esperando al usuario.')
    }
    const plan = c.agente?.plan
    if (plan?.pasos.length) {
      lineas.push('', `Plan: ${plan.entendi}`)
      plan.pasos.forEach((p, i) => lineas.push(`  ${i < (c.agente?.paso ?? 0) ? '[x]' : '[ ]'} ${i + 1}. ${p}`))
      if (plan.preguntas.length) lineas.push(`  Preguntas: ${plan.preguntas.join(' ')}`)
    }
    const recientes = c.mensajes.slice(-mensajes)
    if (recientes.length) {
      lineas.push('', `Conversación (últimos ${recientes.length} de ${c.mensajes.length}):`)
      for (const m of recientes) {
        lineas.push(`- ${m.rol === 'usuario' ? 'Usuario' : 'Agente'}${m.error ? ' (error)' : ''}: ${m.texto.slice(0, 1500)}`)
        if (m.propuestas?.length) lineas.push(`  Opciones que propone: ${m.propuestas.map((x) => `«${x}»`).join(', ')}`)
        if (m.medios?.length) lineas.push(`  Generó: ${m.medios.map((x) => join(ctx.creaciones.carpeta(c.id), x)).join(', ')}`)
      }
    }
    if (c.salida) {
      lineas.push('', `Video: ${c.copia ?? join(ctx.creaciones.carpeta(c.id), c.salida)}${c.proyectoEditor ? ` · proyecto del editor ${c.proyectoEditor}` : ' · aún sin proyecto del editor (pasar_al_editor)'}.`)
    }
    return lineas.join('\n')
  }

  return [
    {
      nombre: 'listar_proyectos',
      descripcion: 'Los proyectos del editor (id, nombre, duración, si está transcrito, último MP4) y las creaciones del agente de Recorte.',
      esquema: { type: 'object', properties: {} },
      soloLee: true,
      correr: async () => {
        const lineas = ['Proyectos (el más reciente primero):']
        for (const p of ctx.proyectos.list().slice(0, 60)) {
          const tl = timelineDe(p)
          lineas.push(
            `- ${p.name} · id ${p.id} · ${duracionTimeline(tl).toFixed(1)} s en la timeline · ${p.medios?.length ?? 0} medios · ` +
              `${p.transcription === 'lista' ? 'transcrito' : 'sin transcribir'}${p.timelineSalida ? ` · último MP4: ${p.timelineSalida}` : ''}`
          )
        }
        const creaciones = ctx.listarCreaciones().slice(0, 30)
        if (creaciones.length) {
          lineas.push('', 'Creaciones del agente de Recorte (míralas con ver_creacion; para retocarlas a mano, pasar_al_editor da su proyecto):')
          for (const c of creaciones) {
            lineas.push(`- ${c.nombre} · id ${c.id} · ${ctx.trabajando(c.id) ? 'trabajando' : c.fase}${c.salida ? ' · con video' : ''}${c.proyectoEditor ? ` · proyecto ${c.proyectoEditor}` : ''}`)
          }
        }
        return ok(lineas.join('\n'))
      }
    },
    {
      nombre: 'ver_proyecto',
      descripcion:
        'Todo lo que tiene un proyecto: sus pistas (clips, rótulos, capas encima, narración, sonidos, música) con sus tiempos, ' +
        'los medios de su biblioteca con su id y lo que se dice en el video (si está transcrito).',
      esquema: { type: 'object', properties: { proyecto: proyectoArg }, required: ['proyecto'] },
      soloLee: true,
      correr: async (args) => {
        const p = buscar(args.proyecto)
        const tl = timelineDe(p)
        const cabeza = [
          `Proyecto «${p.name}» (id ${p.id}). Video principal: ${p.source.name}, ${p.source.width}×${p.source.height}.`,
          p.medios?.length ? `Biblioteca: ${p.medios.map((m) => `${m.id} = ${m.tipo} «${m.nombre}»${m.tipo === 'video' ? ` (${m.duracion.toFixed(1)} s)` : ''}`).join('; ')}.` : 'Biblioteca: solo el video principal.',
          p.timelineSalida ? `Último MP4 exportado: ${p.timelineSalida}` : 'Aún no se ha exportado.',
          ''
        ]
        return ok(cabeza.join('\n') + describirTimelineParaAgente(tl, p.transcript, p.source.duration, 60_000, nombresDe(p)))
      }
    },
    {
      nombre: 'ver_cuadro',
      descripcion:
        'Una imagen de cómo se ve el video exportado en un segundo de la timeline: con capas, rótulos y color, tal cual saldría. ' +
        'Úsala para comprobar un cambio (dónde quedó un logo, si un rótulo tapa algo).',
      esquema: {
        type: 'object',
        properties: { proyecto: proyectoArg, segundo: { type: 'number', description: 'Segundo de la timeline.' } },
        required: ['proyecto', 'segundo']
      },
      soloLee: true,
      correr: async (args) => {
        const p = buscar(args.proyecto)
        const tl = timelineDe(p)
        const total = duracionTimeline(tl)
        const t = typeof args.segundo === 'number' ? Math.max(0, Math.min(args.segundo, total - 0.05)) : 0
        const tmp = mkdtempSync(join(tmpdir(), 'recorte-cuadro-'))
        try {
          const ventana = ventanaTimeline(tl, t, Math.min(total, t + 0.4))
          const r = await exportarTimeline(p, ventana, ctx.proyectos.carpeta(p.id), { formato: 'original', subtitulos: false }, () => {}, tmp)
          if (!r.ok || !r.output) return fallo(r.error ?? 'No pude sacar el cuadro.')
          const jpg = join(tmp, 'cuadro.jpg')
          spawnSync(rutaFfmpeg(), ['-v', 'error', '-y', '-i', r.output, '-frames:v', '1', '-vf', "scale='min(960,iw)':-2", '-q:v', '4', jpg])
          if (!existsSync(jpg)) return fallo('No pude sacar el cuadro.')
          return { texto: `Cuadro del segundo ${t.toFixed(2)} de ${total.toFixed(1)}.`, imagen: { datos: readFileSync(jpg).toString('base64'), tipo: 'image/jpeg' } }
        } finally {
          rmSync(tmp, { recursive: true, force: true })
        }
      }
    },
    {
      nombre: 'editar_timeline',
      descripcion:
        'Cambia la timeline de un proyecto con una lista de operaciones (se aplican en orden, como un solo paso que el usuario ' +
        'puede deshacer con Ctrl+Z). Mira antes ver_proyecto: los números de clip, rótulo, capa y sonido son los que salen ahí.\n\n' +
        OPERACIONES_DOC +
        '\n\nLa voz nueva (cambiar_voz con "texto" o "voz", anadir_voz) se genera con Gemini y gasta cuota: la primera llamada ' +
        'devuelve el costo y un código; repítela con "confirmacion" si el usuario acepta. Las voces están en ver_voces.',
      esquema: {
        type: 'object',
        properties: {
          proyecto: proyectoArg,
          operaciones: { type: 'array', items: { type: 'object' }, description: 'Las operaciones, por ejemplo [{"op":"anadir_texto","inicio":1.5,"texto":"Hola"}].' },
          confirmacion: confirmacionArg
        },
        required: ['proyecto', 'operaciones']
      },
      correr: async (args, sesion) => {
        const p = buscar(args.proyecto)
        const ops = validarOperaciones(args.operaciones)
        if (!ops.length) return fallo('No entendí ninguna operación. Revisa el formato (mira la descripción de esta herramienta).')
        const conVoz = ops.filter((o) => o.op === 'anadir_voz' || (o.op === 'cambiar_voz' && (o.texto !== undefined || o.voz !== undefined)))
        let fallosVoz: string[] = []
        if (conVoz.length) {
          if (!(await ctx.voz.conectada())) return fallo('No hay voz conectada: el usuario tiene que conectar su cuenta de Google o su llave de AI Studio en Ajustes → Voz.')
          const clave = `voz:${p.id}:${JSON.stringify(args.operaciones)}`
          if (!confirmado(clave, args)) {
            const caracteres = conVoz.reduce((n, o) => n + ('texto' in o && typeof o.texto === 'string' ? o.texto.length : 80), 0)
            return pedirPermiso(clave, `${conVoz.length === 1 ? 'una frase' : `${conVoz.length} frases`} de voz nueva con Gemini (unos ${caracteres} caracteres de la cuota de tu cuenta de voz).`)
          }
          fallosVoz = await ctx.voz.delChat(p.id, timelineDe(p), ops as OperacionTL[])
        }
        // Los efectos de sonido incluidos se copian al proyecto antes de aplicar.
        for (const o of ops as OperacionTL[]) {
          if (o.op !== 'anadir_sonido') continue
          const s = await ctx.copiarSonido(p.id, o.sonido)
          if (s) o.audio = s
        }
        const antes = timelineDe(p)
        const r = aplicarOperaciones(antes, ops, { duracionFuente: p.source.duration, transcript: p.transcript, medios: duracionesDeMedios(p.medios) })
        if (r.timeline !== antes && r.cambios.length) {
          const actual = ctx.proyectos.get(p.id)!
          actual.timeline = r.timeline
          delete actual.timelinePendiente
          actual.updatedAt = Date.now()
          ctx.proyectos.save(actual)
          ctx.avisarCambio(actual, sesion.cliente, true)
        }
        const partes = [
          r.cambios.length ? `Hecho: ${r.cambios.join('; ')}.` : 'No cambió nada.',
          r.fallos.length ? `No se pudo: ${r.fallos.join(' ')}` : '',
          fallosVoz.length ? `Voz que no salió: ${fallosVoz.join(' ')}` : '',
          `La timeline dura ahora ${duracionTimeline(r.timeline).toFixed(1)} s.`
        ]
        return { texto: partes.filter(Boolean).join('\n'), ...(r.cambios.length === 0 && r.fallos.length ? { error: true } : {}) }
      }
    },
    {
      nombre: 'agregar_medios',
      descripcion:
        'Agrega videos o imágenes del equipo a la biblioteca de un proyecto (por su ruta completa). Después se usan con ' +
        'editar_timeline: como capa encima ("anadir_capa" con su id) o como clip. Devuelve el id de cada uno.',
      esquema: {
        type: 'object',
        properties: { proyecto: proyectoArg, rutas: { type: 'array', items: { type: 'string' }, description: 'Rutas completas de los archivos (mp4, mov, mkv, webm, m4v, jpg, png, webp).' } },
        required: ['proyecto', 'rutas']
      },
      correr: async (args, sesion) => {
        const p = buscar(args.proyecto)
        const rutas = (Array.isArray(args.rutas) ? args.rutas : []).filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim())
        const malas = rutas.filter((r) => !existsSync(r) || !/\.(mp4|mov|mkv|webm|m4v|jpe?g|png|webp)$/i.test(r))
        const buenas = rutas.filter((r) => !malas.includes(r))
        if (!buenas.length) return fallo(malas.length ? `No encuentro (o no es video ni imagen): ${malas.join(', ')}` : 'Faltan las rutas.')
        const r = await ctx.agregarRutas(p.id, buenas)
        ctx.avisarCambio(r.project, sesion.cliente)
        const nuevos = (r.project.medios ?? []).filter((m) => r.agregados.includes(m.id))
        return ok(
          [
            nuevos.length ? `Agregados: ${nuevos.map((m) => `${m.id} = ${m.tipo} «${m.nombre}»`).join('; ')}.` : 'No agregué nada.',
            [...malas, ...r.fallos].length ? `No pude: ${[...malas, ...r.fallos].join(', ')}.` : ''
          ]
            .filter(Boolean)
            .join('\n')
        )
      }
    },
    {
      nombre: 'crear_proyecto',
      descripcion: 'Crea un proyecto nuevo en el editor a partir de un video del equipo (su ruta completa). La timeline empieza con el video entero.',
      esquema: { type: 'object', properties: { ruta: { type: 'string', description: 'Ruta completa del video.' } }, required: ['ruta'] },
      correr: async (args, sesion) => {
        const ruta = texto(args.ruta)
        if (!ruta || !existsSync(ruta)) return fallo(`No encuentro «${ruta}».`)
        const { project } = await ctx.ingerir(ruta)
        project.timeline = timelineInicial(project.source.duration)
        ctx.proyectos.save(project)
        ctx.avisarCambio(project, sesion.cliente)
        return ok(`Proyecto «${project.name}» creado (id ${project.id}), ${project.source.duration.toFixed(1)} s. Transcríbelo para saber qué se dice.`)
      }
    },
    {
      nombre: 'transcribir',
      descripcion: 'Transcribe lo que se dice en el video principal del proyecto (en el equipo, sin gastar créditos; tarda según lo largo). Después ver_proyecto muestra el texto con sus tiempos.',
      esquema: { type: 'object', properties: { proyecto: proyectoArg }, required: ['proyecto'] },
      correr: async (args, sesion) => {
        const p = buscar(args.proyecto)
        const r = await ctx.transcribir(p.id)
        if (!r.ok) return fallo(r.error ?? 'No pude transcribirlo.')
        if (r.project) ctx.avisarCambio(r.project, sesion.cliente)
        return ok(`Transcrito: ${r.transcript?.length ?? 0} frases. Míralas con ver_proyecto.`)
      }
    },
    {
      nombre: 'exportar',
      descripcion: 'Exporta la timeline del proyecto a MP4 (en la carpeta de Videos del usuario) y devuelve la ruta. Puede tardar un par de minutos.',
      esquema: {
        type: 'object',
        properties: {
          proyecto: proyectoArg,
          formato: { type: 'string', enum: ['original', 'vertical'], description: '«vertical» recorta un video horizontal a 9:16. Por defecto, el formato original.' },
          subtitulos: { type: 'boolean', description: 'Quemar subtítulos de lo que se dice (necesita la transcripción).' }
        },
        required: ['proyecto']
      },
      correr: async (args, sesion) => {
        const p = buscar(args.proyecto)
        const r = await ctx.exportar(p.id, timelineDe(p), { formato: args.formato === 'vertical' ? 'vertical' : 'original', subtitulos: args.subtitulos === true })
        if (!r.ok || !r.output) return fallo(r.error ?? 'No pude exportarlo.')
        if (r.project) ctx.avisarCambio(r.project, sesion.cliente)
        return ok(`Listo: ${r.output}`)
      }
    },
    {
      nombre: 'abrir_en_recorte',
      descripcion: 'Trae Recorte al frente con un proyecto abierto en el editor, o con una creación y su chat, para que el usuario lo vea.',
      esquema: { type: 'object', properties: { proyecto: proyectoArg, creacion: creacionArg } },
      correr: async (args) => {
        if (texto(args.creacion)) {
          const c = buscarCreacion(args.creacion)
          ctx.abrirCreacionEnApp(c.id)
          return ok(`La creación «${c.nombre}» está abierta en Recorte.`)
        }
        const p = buscar(args.proyecto)
        ctx.abrirEnApp(p.id)
        return ok(`«${p.name}» está abierto en Recorte.`)
      }
    },
    ...herramientasDeCrear()
  ]

  /** Fase 6.3: crear un video con el agente de Recorte, la voz y Flow (con confirmación del gasto). */
  function herramientasDeCrear(): HerramientaMcp[] {
    return [
      {
        nombre: 'ver_voces',
        descripcion: 'Las voces de Gemini para narrar (id y cómo suena), la que usa el usuario por defecto, si tiene la voz conectada y qué muestras ya hay para oír.',
        esquema: { type: 'object', properties: {} },
        soloLee: true,
        correr: async () => {
          const muestras = existsSync(ctx.voz.carpetaMuestras) ? readdirSync(ctx.voz.carpetaMuestras) : []
          const lineas = [
            (await ctx.voz.conectada()) ? 'La voz está conectada.' : 'La voz NO está conectada (Ajustes → Voz en Recorte): no se puede generar narración.',
            `Por defecto: ${await ctx.voz.porDefecto()}.`,
            '',
            ...VOCES_GEMINI.map((v) => {
              const m = muestras.find((n) => n === `${v.id}.wav`)
              return `- ${v.id}: ${v.descripcion}${m ? ` · muestra: ${join(ctx.voz.carpetaMuestras, m)}` : ''}`
            }),
            '',
            'Para oír una que no tiene muestra: probar_voz.'
          ]
          return ok(lineas.join('\n'))
        }
      },
      {
        nombre: 'probar_voz',
        descripcion: 'Genera una muestra corta de una voz de Gemini (un WAV para que el usuario la oiga) y devuelve su ruta. Cada voz se genera una sola vez; después sale gratis.',
        esquema: {
          type: 'object',
          properties: {
            voz: { type: 'string', description: 'El id de la voz (ver_voces).' },
            confirmacion: confirmacionArg
          },
          required: ['voz']
        },
        correr: async (args) => {
          const voz = VOCES_GEMINI.find((v) => v.id.toLowerCase() === texto(args.voz).toLowerCase())
          if (!voz) return fallo(`No conozco la voz «${texto(args.voz)}». Mira ver_voces.`)
          const ruta = join(ctx.voz.carpetaMuestras, `${voz.id}.wav`)
          if (existsSync(ruta)) return ok(`Muestra de ${voz.id} (${voz.descripcion}): ${ruta}`)
          if (!(await ctx.voz.conectada())) return fallo('No hay voz conectada: el usuario tiene que conectarla en Recorte, Ajustes → Voz.')
          const clave = `muestra:${voz.id}`
          if (!confirmado(clave, args)) return pedirPermiso(clave, `una muestra de unos 8 segundos con la voz ${voz.id} (poca cuota de tu cuenta de voz de Gemini).`)
          mkdirSync(ctx.voz.carpetaMuestras, { recursive: true })
          try {
            await ctx.voz.generar(textoMuestra(voz.id), voz.id, ruta)
          } catch (e) {
            rmSync(ruta, { force: true })
            return fallo(`No pude generar la muestra: ${e instanceof Error ? e.message : String(e)}`)
          }
          return ok(`Muestra de ${voz.id} (${voz.descripcion}): ${ruta}`)
        }
      },
      {
        nombre: 'crear_video',
        descripcion:
          'Empieza un video nuevo con el agente de Recorte (el mismo de la caja de crear de la app): mira el material, conversa el plan ' +
          'y, con «Hazlo», arma el video y lo entrega editable en el editor. Vuelve al momento: el agente trabaja solo y tarda minutos; ' +
          'sigue con ver_creacion. Con "directo": true empieza el video sin esperar el «Hazlo». La voz y los clips de Flow gastan: ' +
          'la primera llamada devuelve el costo y un código de confirmación.',
        esquema: {
          type: 'object',
          properties: {
            peticion: { type: 'string', description: 'Qué video quiere el usuario, con sus palabras (tema, tono, para quién, dónde se publica).' },
            formato: { type: 'string', enum: ['vertical', 'horizontal'], description: 'vertical 9:16 (TikTok, Reels, Shorts) u horizontal 16:9 (YouTube). Por defecto, vertical.' },
            duracion: { type: 'number', description: 'Segundos que debería durar, si el usuario lo dijo. Si no, lo decide el material.' },
            archivos: { type: 'array', items: { type: 'string' }, description: 'Rutas completas de fotos, videos, audios, carpetas o .zip con el material.' },
            voz: { type: 'string', description: 'Id de una voz de Gemini para narrar (ver_voces). Sin esto, va sin narración (o con el audio que traiga el material).' },
            imagenes: { type: 'boolean', description: 'Que el agente pueda generar imágenes con Google Flow (no gastan créditos).' },
            clips: { type: 'boolean', description: 'Que el agente pueda generar clips de video con Google Flow (gastan créditos).' },
            modelo_clips: { type: 'string', description: `Modelo de los clips: ${modelosVideoVigentes().join(', ')}.` },
            directo: { type: 'boolean', description: 'Empezar el video sin esperar el «Hazlo» (el agente decide lo que dude).' },
            confirmacion: confirmacionArg
          },
          required: ['peticion']
        },
        correr: async (args) => {
          const peticion = texto(args.peticion)
          if (!peticion) return fallo('Falta «peticion»: qué video quiere el usuario.')
          const archivos = (Array.isArray(args.archivos) ? args.archivos : []).filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim())
          const faltan = archivos.filter((r) => !existsSync(r))
          if (faltan.length) return fallo(`No encuentro: ${faltan.join(', ')}`)
          let vozElegida: string | undefined
          if (texto(args.voz)) {
            vozElegida = VOCES_GEMINI.find((v) => v.id.toLowerCase() === texto(args.voz).toLowerCase())?.id
            if (!vozElegida) return fallo(`No conozco la voz «${texto(args.voz)}». Mira ver_voces.`)
            if (!(await ctx.voz.conectada())) return fallo('No hay voz conectada en Recorte (Ajustes → Voz): crea el video sin "voz" o pide al usuario que la conecte.')
          }
          const quiereFlow = args.imagenes === true || args.clips === true
          if (quiereFlow && !ctx.flow.conectado()) return fallo('No hay cuentas de Google Flow conectadas (Ajustes → Google Flow en Recorte): créalo sin imágenes ni clips o pide al usuario que la conecte.')
          const modeloVideo = texto(args.modelo_clips)
          if (modeloVideo && !modelosVideoVigentes().includes(modeloVideo)) return fallo(`Modelo de clips desconocido. Usa uno de: ${modelosVideoVigentes().join(', ')}.`)
          const flow = quiereFlow ? { imagenes: args.imagenes === true, videos: args.clips === true, ...(modeloVideo ? { modeloVideo } : {}) } : undefined
          const gasto = gastoDeCreacion({ vozElegida, flow })
          const clave = `crear:${JSON.stringify({ ...args, confirmacion: undefined })}`
          if (gasto && !confirmado(clave, args)) return pedirPermiso(clave, `${gasto}. Además el agente usa el plan de tu agente (Claude Code, Codex…).`)
          const duracion = typeof args.duracion === 'number' && args.duracion > 0 ? Math.min(600, Math.round(args.duracion)) : 0
          const c = await ctx.creaciones.nueva({
            peticion: peticion.slice(0, 4000),
            estilo: 'libre',
            formato: args.formato === 'horizontal' ? 'horizontal' : 'vertical',
            duracion,
            adjuntos: archivos,
            modo: 'agente',
            ...(flow ? { flow } : {}),
            ...(vozElegida ? { vozElegida } : {}),
            ...(args.directo === true ? { directo: true } : {})
          })
          if (gasto) autorizadas.add(c.id)
          ctx.charlar(c.id)
          return ok(
            `Creación «${c.nombre}» empezada (id ${c.id}). El agente de Recorte está mirando el material y preparando ${args.directo === true ? 'el plan y luego el video' : 'el plan'}: ` +
              'tarda unos minutos. Mira cómo va con ver_creacion (espera un par de minutos entre consultas). El usuario también lo ve en Recorte (abrir_en_recorte).'
          )
        }
      },
      {
        nombre: 'ver_creacion',
        descripcion: 'Cómo va una creación: si el agente sigue trabajando (y en qué), su plan con los pasos hechos, lo último de la conversación con las opciones que propone y el video entregado.',
        esquema: { type: 'object', properties: { creacion: creacionArg, mensajes: { type: 'number', description: 'Cuántos mensajes recientes mostrar (por defecto 8).' } }, required: ['creacion'] },
        soloLee: true,
        correr: async (args) => {
          const c = buscarCreacion(args.creacion)
          const n = typeof args.mensajes === 'number' ? Math.max(1, Math.min(40, Math.round(args.mensajes))) : 8
          return ok(describirCreacion(c, n))
        }
      },
      {
        nombre: 'hablar_con_agente',
        descripcion:
          'Le escribe al agente de una creación (la charla del plan): contestar sus preguntas, elegir una de sus opciones o pedir otra idea. ' +
          'Vuelve al momento; su respuesta sale en ver_creacion. Para empezar el video usa hacer_video.',
        esquema: {
          type: 'object',
          properties: { creacion: creacionArg, mensaje: { type: 'string', description: 'Lo que dice el usuario.' }, confirmacion: confirmacionArg },
          required: ['creacion', 'mensaje']
        },
        correr: async (args) => {
          const c = buscarCreacion(args.creacion)
          const msg = texto(args.mensaje)
          if (!msg) return fallo('Falta «mensaje».')
          if (ctx.trabajando(c.id)) return fallo('El agente sigue trabajando: espera (ver_creacion) o páralo con parar_agente.')
          const permiso = permisoDeCreacion(c, 'hablar', args)
          if (permiso) return permiso
          ctx.charlar(c.id, msg)
          return ok('Mensaje enviado. El agente está pensando: mira su respuesta con ver_creacion en un par de minutos.')
        }
      },
      {
        nombre: 'hacer_video',
        descripcion:
          '«Hazlo»: el agente de la creación arma el video según el plan (o, si ya hay video, aplica el cambio que pidas rehaciéndolo). ' +
          'Tarda varios minutos; vuelve al momento y lo sigues con ver_creacion. Con "seguir": true continúa una creación en pausa por el límite de uso. ' +
          'Para retoques pequeños sobre un video hecho es mejor pasar_al_editor y editar_timeline (no rehace nada).',
        esquema: {
          type: 'object',
          properties: {
            creacion: creacionArg,
            cambio: { type: 'string', description: 'Solo si ya hay video: qué cambiar al rehacerlo.' },
            seguir: { type: 'boolean', description: 'Seguir donde iba tras el límite de uso.' },
            confirmacion: confirmacionArg
          },
          required: ['creacion']
        },
        correr: async (args) => {
          const c = buscarCreacion(args.creacion)
          if (ctx.trabajando(c.id)) return fallo('El agente ya está trabajando: espera (ver_creacion) o páralo con parar_agente.')
          const permiso = permisoDeCreacion(c, 'hacer', args)
          if (permiso) return permiso
          if (args.seguir === true) {
            if (!c.agente?.pausa) return fallo('Esa creación no está en pausa.')
            ctx.seguir(c.id)
            return ok('Sigue donde iba. Míralo con ver_creacion.')
          }
          if (!c.agente?.plan && !c.salida) return fallo('Todavía no hay plan: espera a que el agente lo proponga (ver_creacion) o háblale con hablar_con_agente.')
          const cambio = texto(args.cambio)
          ctx.hacer(c.id, cambio || 'Hazlo')
          return ok(`${c.salida ? 'El agente está rehaciendo el video' : 'El agente está haciendo el video'}: suele tardar de 5 a 20 minutos. Míralo con ver_creacion (cada pocos minutos).`)
        }
      },
      {
        nombre: 'parar_agente',
        descripcion: 'Para al agente de una creación (lo que ya hizo queda; la versión anterior del video sigue intacta).',
        esquema: { type: 'object', properties: { creacion: creacionArg }, required: ['creacion'] },
        correr: async (args) => {
          const c = buscarCreacion(args.creacion)
          return ctx.parar(c.id) ? ok('Parado.') : ok('No estaba trabajando.')
        }
      },
      {
        nombre: 'pasar_al_editor',
        descripcion:
          'Abre el video entregado de una creación como proyecto del editor (cada foto, rótulo, frase de voz y la música en su pista) y devuelve su id, ' +
          'para verlo con ver_proyecto y retocarlo con editar_timeline. Si ya existía, mete la versión nueva en el mismo proyecto.',
        esquema: { type: 'object', properties: { creacion: creacionArg }, required: ['creacion'] },
        correr: async (args, sesion) => {
          const c = buscarCreacion(args.creacion)
          if (ctx.trabajando(c.id)) return fallo('El agente sigue trabajando: espera a que entregue (ver_creacion).')
          if (!c.salida) return fallo('Todavía no hay video entregado.')
          const p = await ctx.alEditor(c.id)
          ctx.avisarCambio(p, sesion.cliente, Boolean(p.timelinePendiente))
          return ok(`Proyecto «${p.name}» (id ${p.id}). Míralo con ver_proyecto.`)
        }
      },
      {
        nombre: 'generar_con_flow',
        descripcion:
          'Genera una imagen (Nano Banana, no gasta créditos) o un clip de video de 8 s (Veo, gasta créditos) con las cuentas de Google Flow ' +
          'del usuario y lo agrega a la biblioteca de un proyecto; devuelve su id para usarlo con editar_timeline. Tarda de uno a varios minutos.',
        esquema: {
          type: 'object',
          properties: {
            proyecto: proyectoArg,
            tipo: { type: 'string', enum: ['imagen', 'video'] },
            prompt: { type: 'string', description: 'Qué se ve, en detalle (sujeto, encuadre, luz, estilo, movimiento si es clip).' },
            modelo: { type: 'string', description: `Imagen: ${MODELOS_IMAGEN.join(', ')}. Video: ${modelosVideoVigentes().join(', ')}. Por defecto, el primero.` },
            formato: { type: 'string', enum: ['9:16', '16:9', '1:1'], description: 'Por defecto, el del video del proyecto.' },
            confirmacion: confirmacionArg
          },
          required: ['proyecto', 'tipo', 'prompt']
        },
        correr: async (args, sesion) => {
          const p = buscar(args.proyecto)
          const tipo = args.tipo === 'video' ? 'video' : args.tipo === 'imagen' ? 'imagen' : null
          const prompt = texto(args.prompt).slice(0, 2000)
          if (!tipo || !prompt) return fallo('Faltan «tipo» (imagen o video) y «prompt».')
          if (!ctx.flow.conectado()) return fallo('No hay cuentas de Google Flow conectadas: el usuario las conecta en Recorte, Ajustes → Google Flow.')
          const lista = tipo === 'video' ? modelosVideoVigentes() : MODELOS_IMAGEN
          const modelo = texto(args.modelo) || lista[0]
          if (!lista.includes(modelo)) return fallo(`Modelo desconocido. Para ${tipo}: ${lista.join(', ')}.`)
          const formato = typeof args.formato === 'string' && ['9:16', '16:9', '1:1'].includes(args.formato) ? args.formato : p.source.height > p.source.width ? '9:16' : '16:9'
          const costo = tipo === 'video' ? (COSTO_CLIP[modelo] ?? 20) : 0
          if (costo > 0) {
            const clave = `flow:${p.id}:${modelo}:${formato}:${prompt}`
            if (!confirmado(clave, args)) return pedirPermiso(clave, `un clip de ${modelo} en Google Flow: unos ${costo} créditos de tus cuentas.`)
          }
          const tmp = mkdtempSync(join(tmpdir(), 'recorte-flow-'))
          try {
            const r = await ctx.flow.generar({ tipo, prompt, formato, modelo, ...(costo ? { tope: costo } : {}) }, tmp)
            const agregado = await ctx.agregarRutas(p.id, [r.archivo])
            ctx.avisarCambio(agregado.project, sesion.cliente)
            const medio = (agregado.project.medios ?? []).find((m) => agregado.agregados.includes(m.id))
            if (!medio) return fallo(`Se generó pero no pude agregarlo: ${agregado.fallos.join(', ') || 'archivo inválido'}.`)
            return ok(`Listo: ${medio.id} = ${medio.tipo} «${medio.nombre}»${r.creditos ? ` (gastó ${r.creditos} créditos de ${r.correo})` : ''}. Úsalo con editar_timeline.`)
          } catch (e) {
            return fallo(`Flow no pudo: ${e instanceof Error ? e.message : String(e)}`)
          } finally {
            rmSync(tmp, { recursive: true, force: true })
          }
        }
      }
    ]
  }

  /** Antes de un turno del agente de una creación que gasta (voz, clips): permiso una vez por creación. */
  function permisoDeCreacion(c: Creacion, que: string, args: Record<string, unknown>): ResultadoHerramienta | null {
    const gasto = gastoDeCreacion(c)
    if (!gasto || autorizadas.has(c.id)) return null
    const clave = `creacion:${c.id}:${que}`
    if (confirmado(clave, args)) {
      autorizadas.add(c.id)
      return null
    }
    return pedirPermiso(clave, `${gasto} (lo aceptas una vez para esta creación).`)
  }
}
