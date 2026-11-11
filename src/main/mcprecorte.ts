import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aplicarOperaciones, describirTimelineParaAgente, OPERACIONES_DOC, validarOperaciones, type OperacionTL } from '../shared/chat'
import type { RenderResultado, TranscripcionResultado } from '../shared/api'
import type { Creacion } from '../shared/creacion'
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
}

export const INSTRUCCIONES_MCP = `Recorte es un editor de video de escritorio que está abierto en el equipo del usuario.
Con estas herramientas ves y editas sus proyectos: lo que cambias aparece al momento en su editor,
y el usuario lo puede retocar a mano o deshacerlo con Ctrl+Z. Empieza con listar_proyectos y
ver_proyecto; usa ver_cuadro para mirar cómo queda un momento antes y después de cambiarlo.
Exportar escribe un MP4 en su carpeta de Videos. Habla con el usuario en español.`

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
          lineas.push('', 'Creaciones del agente de Recorte (se editan cuando se abren en el editor, que crea su proyecto):')
          for (const c of creaciones) lineas.push(`- ${c.nombre} · ${c.fase}${c.salida ? ' · con video' : ''}${c.proyectoEditor ? ` · proyecto ${c.proyectoEditor}` : ''}`)
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
        '\n\nPor aquí todavía no se genera voz nueva (cambiar_voz con "texto" o "voz", anadir_voz): gasta créditos y llegará con confirmación del usuario.',
      esquema: {
        type: 'object',
        properties: {
          proyecto: proyectoArg,
          operaciones: { type: 'array', items: { type: 'object' }, description: 'Las operaciones, por ejemplo [{"op":"anadir_texto","inicio":1.5,"texto":"Hola"}].' }
        },
        required: ['proyecto', 'operaciones']
      },
      correr: async (args, sesion) => {
        const p = buscar(args.proyecto)
        const ops = validarOperaciones(args.operaciones)
        if (!ops.length) return fallo('No entendí ninguna operación. Revisa el formato (mira la descripción de esta herramienta).')
        const conVoz = ops.filter((o) => o.op === 'anadir_voz' || (o.op === 'cambiar_voz' && (o.texto !== undefined || o.voz !== undefined)))
        if (conVoz.length) return fallo('Generar voz nueva todavía no se puede por aquí (gasta créditos). Pídeselo al usuario en el editor de Recorte.')
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
      descripcion: 'Trae Recorte al frente con el proyecto abierto en el editor, para que el usuario lo vea.',
      esquema: { type: 'object', properties: { proyecto: proyectoArg }, required: ['proyecto'] },
      correr: async (args) => {
        const p = buscar(args.proyecto)
        ctx.abrirEnApp(p.id)
        return ok(`«${p.name}» está abierto en Recorte.`)
      }
    }
  ]
}
