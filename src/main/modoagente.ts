import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { Creacion } from '../shared/creacion'
import {
  MAX_REGISTRO,
  validarEntrega,
  validarPlan,
  type EstadoModoAgente,
  type PlanAgente,
  type ResultadoAgente
} from '../shared/modoagente'
import { agenteDeOrden } from './agentes'
import { pathAmpliado, resolverBinario } from './binarios'
import { ejecutar } from './crear'
import { probeVideo } from './ffmpeg'
import { entornoParaAgente, explicarFallo, extraerJson, matarArbol, Parado } from './ia'
import { buscarPython } from './transcribir'

/**
 * El modo agente (ver shared/modoagente.ts). Cada creación en este modo tiene su carpeta
 * `trabajo/` con los archivos originales del usuario en `entrada/`, un manual de trabajo
 * (AGENTS.md y CLAUDE.md: lo leen Claude Code, Codex, Kimi y OpenCode) y `salida/`, donde
 * el agente deja lo que hace. El agente se lanza con su carpeta como directorio de trabajo
 * y con permiso para usar herramientas sin preguntar, pero solo dentro de ella.
 */

export interface ConfigModoAgente {
  activa: boolean
  proveedor: 'api' | 'cli'
  comandoCli: string
}

export const carpetaTrabajo = (carpeta: string): string => join(carpeta, 'trabajo')

const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v']
const EXT_IMAGEN = ['.png', '.jpg', '.jpeg', '.webp']

/** Un nombre de archivo sin sorpresas para la línea de comandos (sin espacios ni tildes). */
export function nombreLimpio(nombre: string, i: number): string {
  const ext = extname(nombre).toLowerCase()
  const base = basename(nombre, extname(nombre))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${String(i + 1).padStart(2, '0')}-${base || 'archivo'}${ext}`
}

/** Copia los archivos del usuario tal cual (sin convertir: el color y la calidad exactos). */
export function copiarEntrada(rutas: string[], carpeta: string): { archivo: string; nombre: string; tipo: 'imagen' | 'video' }[] {
  const entrada = join(carpetaTrabajo(carpeta), 'entrada')
  mkdirSync(entrada, { recursive: true })
  mkdirSync(join(carpetaTrabajo(carpeta), 'salida'), { recursive: true })
  const copiados: { archivo: string; nombre: string; tipo: 'imagen' | 'video' }[] = []
  for (const [i, ruta] of rutas.slice(0, 20).entries()) {
    if (!existsSync(ruta)) continue
    const ext = extname(ruta).toLowerCase()
    const tipo = EXT_VIDEO.includes(ext) ? 'video' : EXT_IMAGEN.includes(ext) ? 'imagen' : null
    if (!tipo) continue
    const destino = nombreLimpio(basename(ruta), i)
    copyFileSync(ruta, join(entrada, destino))
    copiados.push({ archivo: `trabajo/entrada/${destino}`, nombre: basename(ruta), tipo })
  }
  return copiados
}

// ---------------------------------------------------------------------------
// El manual de trabajo
// ---------------------------------------------------------------------------

async function herramientasDisponibles(): Promise<string[]> {
  const ffmpeg = resolverBinario('ffmpeg')
  const ffprobe = resolverBinario('ffprobe')
  const hf = resolverBinario('hyperframes')
  const py = await buscarPython()
  const lineas = [
    `- FFmpeg: ${ffmpeg ? `"${ffmpeg}"` : '`ffmpeg` (del PATH)'}${ffprobe ? ` · ffprobe: "${ffprobe}"` : ''}. Cortar, unir, escalar, filtros, mezclar audio, sacar fotogramas, medir.`,
    py
      ? `- Python: ${[py.cmd, ...py.args].map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' ')} (trae NumPy y OpenCV; si te falta un paquete como Pillow, instálalo con \`-m pip install\`). Para animar píxel a píxel: genera los cuadros y pásalos a FFmpeg por tubería (rawvideo rgb24).`
      : '- Python: no está instalado (no lo uses).',
    hf
      ? `- HyperFrames: "${hf}" (HTML + GSAP renderizado a video: tipografía, motion graphics, diseño). \`hyperframes render <carpeta> -o salida/x.mp4\`.`
      : '- HyperFrames: no está instalado (no lo uses).'
  ]
  return lineas
}

export async function escribirManual(carpeta: string, c: Creacion): Promise<void> {
  const trabajo = carpetaTrabajo(carpeta)
  mkdirSync(join(trabajo, 'salida'), { recursive: true })
  mkdirSync(join(trabajo, 'revision'), { recursive: true })
  const { ancho, alto } = c.formato === 'horizontal' ? { ancho: 1920, alto: 1080 } : { ancho: 1080, alto: 1920 }
  const manual = `# Manual de trabajo de Recorte

Eres el editor de video de Recorte. Trabajas en ESTA carpeta y en ninguna otra. Hablas en español.

## Lo que tienes
- \`entrada/\`: los archivos originales del usuario (no los modifiques ni los borres).
- \`salida/\`: donde dejas el resultado final.
- \`revision/\`: donde sacas fotogramas de tu resultado para comprobarlo.
- Cualquier otro archivo de trabajo (scripts, composiciones, temporales) va aquí mismo, en esta carpeta.

Herramientas:
${(await herramientasDisponibles()).join('\n')}

## El método (síguelo siempre)
1. **Entiende el pedido.** ¿Es un video para redes, un recurso para otro editor (sin textos, con croma…),
   una pieza corta? No impongas un formato: haz lo que se pide.
2. **Mira los archivos de verdad.** Abre cada imagen de \`entrada/\` y míralas. De los videos, usa ffprobe y
   saca fotogramas con FFmpeg para verlos. Si hay transcripción en el pedido, úsala.
3. **Mide lo que importe, no lo adivines.** Colores exactos (con Python), posiciones, tamaños, duraciones.
   Si hay un fondo de croma, mide su color exacto y CONSÉRVALO intacto: nada semitransparente, sombras ni
   brillos sobre el croma (se mezclan y luego no se recorta limpio).
4. **Elige la herramienta.** FFmpeg para montar y cortar; Python + FFmpeg para animar con control de cada
   píxel; HyperFrames para diseño, tipografía y motion graphics.
5. **Hazlo** y deja el resultado en \`salida/\`.
6. **Compruébalo antes de entregar.** Saca fotogramas del resultado (inicio, momentos clave y final) a
   \`revision/\`, MÍRALOS y mide lo que se pueda (duración, tamaño, que nada se recorte, que el croma siga
   uniforme si lo hay). Si algo falla, corrígelo y vuelve a comprobar. No entregues sin mirar.
7. **Entrega** escribiendo \`resultado.json\` en esta carpeta:
   \`{"archivo": "salida/<nombre>", "resumen": "qué hiciste, en 1-3 frases", "comprobaciones": ["qué comprobaste y cómo salió", "…"]}\`

## Formato por defecto (salvo que el pedido diga otra cosa)
Video ${ancho}×${alto} (${c.formato === 'horizontal' ? '16:9' : '9:16 vertical'}), 30 fps, H.264 (libx264, yuv420p, \`-movflags +faststart\`), audio AAC si hay audio.
Con croma en H.264 4:2:0, alinea los bordes del croma a píxeles pares (el color se guarda en bloques de 2×2).

## Reglas
- No salgas de esta carpeta, no borres nada de \`entrada/\` y no toques archivos del sistema.
- No bajes material de internet con derechos de terceros ni gastes créditos de servicios de pago.
- Si algo del pedido es ambiguo, elige lo más sensato para el objetivo y dilo en el resumen.
- Textos en pantalla solo si el pedido los pide o el tipo de video claramente los necesita.
`
  writeFileSync(join(trabajo, 'AGENTS.md'), manual, 'utf8')
  writeFileSync(join(trabajo, 'CLAUDE.md'), manual, 'utf8')
}

// ---------------------------------------------------------------------------
// Lanzar al agente en su carpeta
// ---------------------------------------------------------------------------

/**
 * El comando para que el agente trabaje solo dentro de `cwd`, con herramientas y sin
 * preguntar. Null si ese agente no puede trabajar así (Antigravity por ACP, o una API).
 */
export function comandoAgentico(base: string, cwd: string): { orden: string; agente: string } | null {
  const agente = agenteDeOrden(base)
  const b = base.trim()
  switch (agente) {
    case 'claude':
      // acceptEdits: escribe solo dentro de su directorio de trabajo; stream-json para ver qué hace.
      return {
        agente,
        orden: `${b} --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" --output-format stream-json --verbose`
      }
    case 'kimi':
      return { agente, orden: b.replace(/^kimi\b/, 'kimi --auto') }
    case 'codex':
      // workspace-write: el sandbox de Codex solo deja escribir en su carpeta. Lee el prompt de stdin (-).
      return { agente, orden: `${b} --skip-git-repo-check -s workspace-write -C "${cwd}" -` }
    case 'opencode':
      return { agente, orden: `${b} --auto --dir "${cwd}"` }
    case 'gemini':
      // Sin probar: Gemini CLI no estaba instalado al escribir esto.
      return { agente, orden: `${b} --yolo` }
    case 'antigravity':
      // Por ACP: Recorte le hace de «manos» (archivos y terminal) solo dentro de su carpeta.
      return { agente, orden: 'antigravity:acp' }
    default:
      return null
  }
}

/** Una línea legible de un evento de stream-json de Claude Code (o null si no aporta). */
export function describirEvento(linea: string): { texto?: string; final?: string; error?: string } | null {
  let ev: Record<string, unknown>
  try {
    ev = JSON.parse(linea) as Record<string, unknown>
  } catch {
    const t = linea.trim()
    return t ? { texto: t.slice(0, 200) } : null
  }
  if (ev.type === 'result') {
    const res = typeof ev.result === 'string' ? ev.result : ''
    // Claude marca los fallos (sesión caducada, límite del plan…) con is_error en el evento final.
    if (ev.is_error === true) return { error: res || 'El agente terminó con un error.' }
    return { final: res }
  }
  if (ev.type !== 'assistant') return null
  const contenido = ((ev.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[]
  for (const parte of contenido) {
    if (parte.type === 'tool_use') {
      const entrada = (parte.input ?? {}) as Record<string, unknown>
      const detalle =
        typeof entrada.description === 'string'
          ? entrada.description
          : typeof entrada.command === 'string'
            ? entrada.command
            : typeof entrada.file_path === 'string'
              ? basename(entrada.file_path)
              : ''
      return { texto: `${parte.name}: ${String(detalle).replace(/\s+/g, ' ').slice(0, 160)}` }
    }
    if (parte.type === 'text' && typeof parte.text === 'string' && parte.text.trim()) {
      return { texto: parte.text.replace(/\s+/g, ' ').trim().slice(0, 200) }
    }
  }
  return null
}

/** Lanza al agente en su carpeta y devuelve lo que respondió al final. Se puede parar. */
export async function trabajarAgente(
  orden: string,
  cwd: string,
  prompt: string,
  onLinea: (texto: string) => void,
  senal?: AbortSignal,
  timeoutMs = 40 * 60_000,
  imagenes: string[] = []
): Promise<string> {
  if (senal?.aborted) throw new Parado()
  if (orden === 'antigravity:acp') {
    const { trabajarAntigravity } = await import('./antigravity')
    return trabajarAntigravity(prompt, cwd, onLinea, senal, timeoutMs, imagenes).catch((e: unknown) => {
      if (e instanceof Parado) throw e
      throw new Error(explicarFallo(e instanceof Error ? e.message : String(e)))
    })
  }
  let comando = orden
  let archivoPrompt: string | null = null
  if (comando.includes('{prompt}')) {
    archivoPrompt = join(tmpdir(), `recorte-agente-${Date.now()}.txt`)
    writeFileSync(archivoPrompt, prompt, 'utf8')
    comando = comando.replaceAll('{prompt}', archivoPrompt)
  }
  const extra = await entornoParaAgente(comando)
  return new Promise<string>((resolver, rechazar) => {
    const hijo = spawn(comando, { cwd, shell: true, windowsHide: true, env: { ...process.env, ...extra, PATH: pathAmpliado() } })
    let resto = ''
    let todo = ''
    let final: string | null = null
    let errorFinal: string | null = null
    let error = ''
    let cerrado = false
    const limpiar = () => {
      if (archivoPrompt) {
        try {
          unlinkSync(archivoPrompt)
        } catch {
          // Se borra solo con el tiempo.
        }
      }
    }
    const fin = (e?: Error) => {
      if (cerrado) return
      cerrado = true
      clearTimeout(reloj)
      senal?.removeEventListener('abort', alParar)
      limpiar()
      if (e) rechazar(e)
      else resolver(final ?? todo)
    }
    const reloj = setTimeout(() => {
      matarArbol(hijo)
      fin(new Error(`El agente tardó demasiado (${Math.round(timeoutMs / 60_000)} min).`))
    }, timeoutMs)
    const alParar = () => {
      matarArbol(hijo)
      fin(new Parado())
    }
    senal?.addEventListener('abort', alParar, { once: true })
    hijo.stdout.on('data', (b: Buffer) => {
      const t = b.toString('utf8')
      todo += t
      resto += t
      const lineas = resto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) {
        const d = describirEvento(l)
        if (d?.error) errorFinal = d.error
        else if (d?.final !== undefined) final = d.final
        else if (d?.texto) onLinea(d.texto)
      }
    })
    hijo.stderr.on('data', (b: Buffer) => (error = (error + b.toString('utf8')).slice(-2000)))
    hijo.on('error', () => fin(new Error(`No pude lanzar el agente («${comando.slice(0, 60)}»).`)))
    hijo.on('close', (codigo) => {
      if (resto.trim()) {
        const d = describirEvento(resto)
        if (d?.error) errorFinal = d.error
        else if (d?.final !== undefined) final = d.final
      }
      const fallo = errorFinal ?? (codigo === 0 ? null : (error.trim() || todo.trim()).slice(-300) || `El agente terminó con código ${codigo} sin decir nada.`)
      if (fallo) fin(new Error(explicarFallo(fallo)))
      else fin()
    })
    if (archivoPrompt) hijo.stdin.end()
    else hijo.stdin.end(prompt, 'utf8')
  })
}

// ---------------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------------

/** Las imágenes que subió el usuario (rutas absolutas), para los agentes que las reciben en el pedido. */
function imagenesDeEntrada(c: Creacion, carpeta: string): string[] {
  return c.adjuntos.filter((a) => a.tipo === 'imagen').map((a) => join(carpeta, a.archivo))
}

function contexto(c: Creacion): string {
  const archivos = c.adjuntos.length
    ? c.adjuntos.map((a) => `- ${a.archivo.replace(/^trabajo\//, '')} (${a.tipo === 'imagen' ? 'imagen' : 'video'}, «${a.nombre}»)`).join('\n')
    : '- (ninguno: el usuario no subió archivos)'
  const charla = c.mensajes
    .slice(-12)
    .map((m) => `${m.rol === 'usuario' ? 'Usuario' : 'Tú'}: ${m.texto}`)
    .join('\n')
  return `PEDIDO ORIGINAL DEL USUARIO:\n"""\n${c.peticion}\n"""\n\nArchivos en entrada/:\n${archivos}\n\nFormato elegido en la app: ${c.formato === 'horizontal' ? 'horizontal 16:9' : 'vertical 9:16'}, unos ${c.duracion} s (orientativo: manda lo que pida el usuario).${charla ? `\n\nConversación hasta ahora:\n${charla}` : ''}`
}

/** Paso 1: el agente mira los archivos y propone un plan corto (o pregunta). No produce nada. */
export async function pasoPlan(
  c: Creacion,
  carpeta: string,
  config: ConfigModoAgente,
  onLinea: (t: string) => void,
  senal?: AbortSignal
): Promise<PlanAgente> {
  const trabajo = carpetaTrabajo(carpeta)
  const cmd = config.activa && config.proveedor === 'cli' ? comandoAgentico(config.comandoCli, trabajo) : null
  if (!cmd) throw new Error('El modo agente necesita un agente que trabaje con herramientas (Claude Code, Antigravity, Kimi, Codex u OpenCode). Conéctalo en Inicio.')
  await escribirManual(carpeta, c)
  const prompt = `Lee AGENTS.md (tu manual) y sigue sus pasos 1 a 3: entiende el pedido, mira de verdad los archivos de entrada/ y mide lo que importe.
TODAVÍA NO HAGAS EL VIDEO ni crees archivos en salida/.

${contexto(c)}

Responde SOLO con JSON, sin texto alrededor:
{"entendi": "qué vas a hacer, en 1-2 frases, con los datos que mediste", "pasos": ["paso corto", "…"], "preguntas": ["solo si de verdad no puedes decidir algo importante"], "herramienta": "FFmpeg | Python + FFmpeg | HyperFrames | …"}`
  const respuesta = await trabajarAgente(cmd.orden, trabajo, prompt, onLinea, senal, 15 * 60_000, imagenesDeEntrada(c, carpeta))
  const plan = validarPlan(extraerJson(respuesta))
  if (!plan) throw new Error('El agente no devolvió un plan.')
  return plan
}

/** Paso 2: el agente hace (o cambia) el video siguiendo el plan, se comprueba y entrega. */
export async function pasoHacer(
  c: Creacion,
  carpeta: string,
  config: ConfigModoAgente,
  pedido: string | undefined,
  onLinea: (t: string) => void,
  senal?: AbortSignal
): Promise<string> {
  const trabajo = carpetaTrabajo(carpeta)
  const cmd = config.activa && config.proveedor === 'cli' ? comandoAgentico(config.comandoCli, trabajo) : null
  if (!cmd) throw new Error('El modo agente necesita un agente que trabaje con herramientas (Claude Code, Antigravity, Kimi, Codex u OpenCode). Conéctalo en Inicio.')
  await escribirManual(carpeta, c)
  const resultadoJson = join(trabajo, 'resultado.json')
  if (existsSync(resultadoJson)) rmSync(resultadoJson, { force: true })
  const plan = c.agente?.plan
  const hay = c.agente?.resultado
  const prompt = `Lee AGENTS.md (tu manual) y sigue el método completo, del paso 1 al 7.

${contexto(c)}
${plan ? `\nEL PLAN QUE EL USUARIO APROBÓ:\n${plan.entendi}\n${plan.pasos.map((p) => `- ${p}`).join('\n')}\n` : ''}${hay ? `\nYA HICISTE UNA VERSIÓN: ${hay.archivo.replace(/^salidas\//, '')} (lo que dijiste: ${hay.resumen}). Tus archivos de trabajo siguen en esta carpeta: parte de ellos y cambia solo lo que se pide, conservando lo que al usuario le gustó.\n` : ''}${pedido ? `\nLO QUE PIDE AHORA EL USUARIO: ${pedido}\n` : ''}
Cuando termines y lo hayas comprobado mirando los fotogramas, escribe resultado.json como dice el manual.`
  return trabajarAgente(cmd.orden, trabajo, prompt, onLinea, senal, 40 * 60_000, imagenesDeEntrada(c, carpeta))
}

// ---------------------------------------------------------------------------
// La revisión de Recorte (independiente del agente)
// ---------------------------------------------------------------------------

/** El archivo que entregó el agente: el de resultado.json o, si no, el más nuevo de salida/. */
export function archivoEntregado(carpeta: string): { ruta: string; entrega: ReturnType<typeof validarEntrega> } | null {
  const trabajo = carpetaTrabajo(carpeta)
  let entrega = validarEntrega({})
  try {
    entrega = validarEntrega(JSON.parse(readFileSync(join(trabajo, 'resultado.json'), 'utf8')))
  } catch {
    // Sin resultado.json: se busca en salida/.
  }
  if (entrega.archivo) {
    const ruta = join(trabajo, entrega.archivo.replace(/^\.?[\\/]/, ''))
    if (existsSync(ruta) && statSync(ruta).isFile()) return { ruta, entrega }
  }
  const salida = join(trabajo, 'salida')
  if (!existsSync(salida)) return null
  const candidatos = readdirSync(salida)
    .filter((n) => [...EXT_VIDEO, ...EXT_IMAGEN].includes(extname(n).toLowerCase()))
    .map((n) => ({ ruta: join(salida, n), fecha: statSync(join(salida, n)).mtimeMs }))
    .sort((a, b) => b.fecha - a.fecha)
  return candidatos[0] ? { ruta: candidatos[0].ruta, entrega } : null
}

/**
 * Revisa el resultado por su cuenta: que exista y se abra, cuánto dura y mide, y saca
 * fotogramas para que el usuario lo vea. Copia el final a `salidas/` con su versión.
 */
export async function revisarYPublicar(
  c: Creacion,
  carpeta: string,
  version: number
): Promise<{ resultado?: ResultadoAgente; problemas: string[] }> {
  const hallado = archivoEntregado(carpeta)
  if (!hallado) return { problemas: ['No dejaste ningún archivo final en salida/ ni en resultado.json.'] }
  const ext = extname(hallado.ruta).toLowerCase()
  const tipo: ResultadoAgente['tipo'] = EXT_IMAGEN.includes(ext) ? 'imagen' : 'video'
  const problemas: string[] = []
  const salidas = join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })
  const nombre = `agente-v${version}${ext}`
  copyFileSync(hallado.ruta, join(salidas, nombre))

  let info: { duracion?: number; ancho?: number; alto?: number } = {}
  const revision: string[] = []
  if (tipo === 'video') {
    try {
      const v = await probeVideo(hallado.ruta)
      info = { duracion: Math.round(v.duration * 100) / 100, ancho: v.width, alto: v.height }
      if (!(v.duration > 0.2)) problemas.push(`El video dura ${v.duration} s: está vacío o roto.`)
      if (!v.width || !v.height) problemas.push('El video no tiene imagen.')
    } catch (e) {
      problemas.push(`El archivo no se puede abrir como video (${e instanceof Error ? e.message.slice(0, 120) : 'error'}).`)
    }
    if (!problemas.length && info.duracion) {
      const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
      const momentos = [0.05, 0.25, 0.5, 0.75, 0.97].map((f) => Math.max(0, info.duracion! * f))
      for (const [i, t] of momentos.entries()) {
        const archivo = `agente-v${version}-r${i + 1}.jpg`
        const r = await ejecutar(
          [`"${ffmpeg}"`, '-y', '-v', 'error', '-ss', t.toFixed(2), '-i', `"${hallado.ruta}"`, '-frames:v', '1', '-vf', `scale='min(540,iw)':-2`, '-q:v', '4', `"${join(salidas, archivo)}"`],
          carpeta,
          60_000
        )
        if (r.codigo === 0 && existsSync(join(salidas, archivo))) revision.push(`salidas/${archivo}`)
      }
      if (!revision.length) problemas.push('No pude sacar ni un fotograma del video.')
    }
  } else {
    revision.push(`salidas/${nombre}`)
  }
  if (problemas.length) return { problemas }
  return {
    problemas,
    resultado: {
      archivo: `salidas/${nombre}`,
      tipo,
      resumen: hallado.entrega.resumen || 'Listo.',
      comprobaciones: hallado.entrega.comprobaciones,
      revision,
      ...info
    }
  }
}

/** Añade líneas al registro (las últimas MAX_REGISTRO). */
export function anotar(estado: EstadoModoAgente, linea: string): void {
  estado.registro = [...estado.registro, linea].slice(-MAX_REGISTRO)
}
