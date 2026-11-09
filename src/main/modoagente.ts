import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path'
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
import { entornoParaAgente, extraerJson, falloDeAgente, matarArbol, Parado, rechazoPorPolitica } from './ia'
import { buscarPython, rutaScriptPython } from './transcribir'

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
  for (const [i, ruta] of rutas.slice(0, 30).entries()) {
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

/**
 * Copia el kit (python/kit: kit.py y RECETA.md) a la carpeta de trabajo, con las rutas de FFmpeg
 * que debe usar. Devuelve si quedó (sin Python no sirve y no se ofrece).
 */
function copiarKit(trabajo: string): boolean {
  const origen = rutaScriptPython('kit')
  if (!existsSync(join(origen, 'kit.py'))) return false
  const destino = join(trabajo, 'kit')
  mkdirSync(destino, { recursive: true })
  for (const n of ['kit.py', 'RECETA.md']) copyFileSync(join(origen, n), join(destino, n))
  // El FFmpeg de Recorte, aunque no esté en el PATH del agente.
  writeFileSync(join(destino, 'rutas.json'), JSON.stringify({ ffmpeg: resolverBinario('ffmpeg'), ffprobe: resolverBinario('ffprobe') }))
  return true
}

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
  const conKit = copiarKit(trabajo)
  const { ancho, alto } = c.formato === 'horizontal' ? { ancho: 1920, alto: 1080 } : { ancho: 1080, alto: 1920 }
  const manual = `# Manual de trabajo de Recorte

Eres el editor de video de Recorte. Trabajas en ESTA carpeta y en ninguna otra. Hablas en español.

## Lo que tienes
- \`entrada/\`: los archivos originales del usuario (no los modifiques ni los borres).
- \`salida/\`: donde dejas el resultado final.
- \`revision/\`: donde sacas fotogramas de tu resultado para comprobarlo.
- \`vistazo/\`: lo que preparó Recorte para mirar rápido (miniaturas, fotogramas, audio y LEEME.txt).
- \`notas.md\`: tus apuntes del plan (lo que ya viste y mediste).
${conKit ? '- `kit/`: piezas probadas de Recorte para hacer el video sin programarlo (lee `kit/RECETA.md`).\n' : ''}- Cualquier otro archivo de trabajo (scripts, composiciones, temporales) va aquí mismo, en esta carpeta.

Herramientas:
${(await herramientasDisponibles()).join('\n')}

## Trabaja rápido (como un editor con oficio)
- Mira primero \`vistazo/\` (léete \`vistazo/LEEME.txt\`): hojas con todas las fotos en miniatura y fotogramas de cada
  video, y el audio en WAV ligero. Abre un original de \`entrada/\` solo si necesitas un detalle concreto, y entonces
  recorta esa zona en vez de mirar la foto entera.
- Una pregunta, una medición corta: un script de segundos (ffprobe, el volumen cada 0,1 s, los golpes, el color de
  una zona). No recorras videos fotograma a fotograma ni repitas lo que ya mediste.
- Antes del render completo, genera unos pocos fotogramas clave, míralos y corrige. Renderiza entero solo al final.
- Si hay \`notas.md\`, léelo: es lo que ya miraste en el plan. Apunta ahí lo que midas (tiempos, colores, zonas).

${
    conKit
      ? `## El kit: úsalo primero
Con \`kit/\` no programas el video: escribes \`receta.json\` (qué foto o video, cuándo, con qué rótulo y efecto) y
\`python kit/kit.py armar receta.json\` lo hace en UNA pasada, con la música, y deja \`revision/hoja-final.jpg\`.
Trae fotos a pantalla completa con encuadre y acercamiento, video, antes/después (deslizar, lado, arriba), collage,
frases con brillo, rótulos, desenfocar zonas, fundidos y la música recortada. Lee \`kit/RECETA.md\` (es corto).
- \`python kit/kit.py golpes <audio-o-video>\`: los golpes de la música y el tempo, para poner cada momento en su golpe.
- \`python kit/kit.py encuadre <foto> --zoom 1.3 --cx .5 --cy .5\`: cómo queda una foto a pantalla completa.
- \`python kit/kit.py armar receta.json --prueba 0.5,3,8\`: solo esos fotogramas, en segundos, para corregir antes.
Escribe código propio solo para lo que el kit no tenga, y aun así usa el kit para el resto.

`
      : ''
  }## El método (síguelo siempre)
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
    case 'gemini': {
      // `-p` lleva valor: sin él, el siguiente flag (`-m`, `--yolo`) se toma como el prompt.
      // El pedido llega por stdin y `-p` se le suma al final (así lo documenta `gemini --help`).
      const sinP = b.replace(/\s-p(?=\s|$)/, '')
      return { agente, orden: `${sinP} --yolo -p "Sigue al pie de la letra las instrucciones de arriba."` }
    }
    case 'antigravity':
      // Por ACP: Recorte le hace de «manos» (archivos y terminal) solo dentro de su carpeta.
      return { agente, orden: b }
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
  imagenes: string[] = [],
  entregaLista?: () => boolean
): Promise<string> {
  const respuesta = await lanzarAgente(orden, cwd, prompt, onLinea, senal, timeoutMs, imagenes, entregaLista)
  // Un rechazo del filtro de contenido llega como respuesta «normal» y corta: dilo en claro.
  const rechazo = respuesta.length < 1500 ? rechazoPorPolitica(respuesta) : null
  if (rechazo) throw new Error(rechazo)
  return respuesta
}

async function lanzarAgente(
  orden: string,
  cwd: string,
  prompt: string,
  onLinea: (texto: string) => void,
  senal: AbortSignal | undefined,
  timeoutMs: number,
  imagenes: string[],
  entregaLista?: () => boolean
): Promise<string> {
  if (senal?.aborted) throw new Parado()
  if (orden.startsWith('antigravity:acp')) {
    const [{ trabajarAntigravity }, { opcionesAntigravity }] = await Promise.all([import('./antigravity'), import('./modelos')])
    return trabajarAntigravity(prompt, cwd, onLinea, senal, timeoutMs, imagenes, opcionesAntigravity(orden)).catch((e: unknown) => {
      if (e instanceof Parado) throw e
      throw new Error(falloDeAgente(orden, e instanceof Error ? e.message : String(e)))
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
    let ultimaSalida = Date.now()
    let graciaFinal: ReturnType<typeof setTimeout> | null = null
    const fin = (e?: Error) => {
      if (cerrado) return
      cerrado = true
      clearTimeout(reloj)
      clearInterval(vigia)
      if (graciaFinal) clearTimeout(graciaFinal)
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
    // El agente ya dio su respuesta final (Claude: evento «result») pero no sale porque dejó
    // algo de fondo (un servidor, un render, un shell): se le da un respiro y se cierra.
    const alDarFinal = () => {
      if (graciaFinal || cerrado) return
      graciaFinal = setTimeout(() => {
        if (cerrado) return
        matarArbol(hijo)
        terminar(0)
      }, 10_000)
    }
    // Los agentes sin evento final (Codex, Kimi, Gemini, OpenCode): si ya escribió
    // resultado.json con un archivo nuevo y lleva un rato callado, terminó aunque no salga.
    const vigia = setInterval(() => {
      if (cerrado || !entregaLista) return
      if (Date.now() - ultimaSalida > 90_000 && entregaLista()) {
        onLinea('El agente entregó y quedó esperando: Recorte cierra su sesión')
        matarArbol(hijo)
        terminar(0)
      }
    }, 5000)
    hijo.stdout.on('data', (b: Buffer) => {
      ultimaSalida = Date.now()
      const t = b.toString('utf8')
      todo += t
      resto += t
      const lineas = resto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) {
        const d = describirEvento(l)
        if (d?.error) errorFinal = d.error
        else if (d?.final !== undefined) {
          final = d.final
          alDarFinal()
        } else if (d?.texto) onLinea(d.texto)
      }
    })
    let restoErr = ''
    hijo.stderr.on('data', (b: Buffer) => {
      ultimaSalida = Date.now()
      const t = b.toString('utf8')
      error = (error + t).slice(-2000)
      // Codex, Kimi y Gemini cuentan lo que hacen por stderr: que se vea el avance igual
      // que con Claude (si no, la barra parece colgada durante minutos).
      restoErr += t
      const lineas = restoErr.split(/\r?\n/)
      restoErr = lineas.pop() ?? ''
      for (const l of lineas) {
        const limpia = l.replace(/\x1b\[[0-9;]*m/g, '').trim()
        if (limpia.length > 3 && !/^(\[?\d{4}-\d\d-\d\d|debug|trace)/i.test(limpia)) onLinea(limpia.slice(0, 160))
      }
    })
    hijo.on('error', () => fin(new Error(`No pude lanzar el agente («${comando.slice(0, 60)}»).`)))
    const terminar = (codigo: number | null) => {
      if (cerrado) return
      if (resto.trim()) {
        const d = describirEvento(resto)
        resto = ''
        if (d?.error) errorFinal = d.error
        else if (d?.final !== undefined) final = d.final
      }
      // Si ya respondió (evento final) o dejó su entrega, el código de salida no importa:
      // pudo cerrarlo Recorte o morir al cerrar lo que dejó de fondo.
      const yaEntrego = final !== null || Boolean(entregaLista?.())
      const fallo = errorFinal ?? (codigo === 0 || yaEntrego ? null : (error.trim() || todo.trim()).slice(-300) || `El agente terminó con código ${codigo} sin decir nada.`)
      if (fallo) fin(new Error(falloDeAgente(orden, fallo)))
      else fin()
    }
    hijo.on('close', terminar)
    // 'close' espera a que se cierre su salida, y un proceso que el agente dejó de fondo (un
    // render, un servidor) la mantiene abierta: el agente ya terminó pero Recorte seguía
    // esperando hasta el límite. Al salir el agente, se da un respiro para lo último y se cierra.
    hijo.on('exit', (codigo) => setTimeout(() => terminar(codigo), 1500))
    if (archivoPrompt) hijo.stdin.end()
    else hijo.stdin.end(prompt, 'utf8')
  })
}

// ---------------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// El vistazo: lo que Recorte prepara para que el agente no tenga que abrir los originales
// ---------------------------------------------------------------------------

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/**
 * `trabajo/vistazo/`: una hoja con todas las fotos en miniatura (fotos.jpg), una hoja de
 * fotogramas por video (video-NN.jpg), el audio de cada video en WAV ligero (audio-NN.wav,
 * 16 kHz mono, para medir golpes o transcribir rápido) y LEEME.txt con qué es cada cosa.
 * Mirar esto cuesta segundos; abrir las fotos de 12 MP y recorrer los videos, minutos.
 */
export async function prepararVistazo(c: Creacion, carpeta: string): Promise<string[]> {
  const trabajo = carpetaTrabajo(carpeta)
  const dir = join(trabajo, 'vistazo')
  const leeme = join(dir, 'LEEME.txt')
  const hojas: string[] = []
  if (existsSync(leeme)) {
    for (const n of readdirSync(dir)) if (/^(fotos|video-\d+)\.jpg$/.test(n)) hojas.push(join(dir, n))
    return hojas
  }
  mkdirSync(join(dir, 'tmp'), { recursive: true })
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  const lineas: string[] = ['Vistazo que preparó Recorte (míralo antes que los originales de entrada/):', '']

  const fotos = c.adjuntos.filter((a) => a.tipo === 'imagen')
  if (fotos.length) {
    const lista: string[] = []
    for (const a of fotos) {
      // Numeradas seguidas (solo las que salen): una secuencia con huecos se corta ahí.
      const mini = join(dir, 'tmp', `m${String(lista.length + 1).padStart(2, '0')}.jpg`)
      // Todas del mismo tamaño y formato de color (las JPG del móvil y las HEIC convertidas
      // no coinciden, y FFmpeg corta la hoja al primer cambio).
      const r = await ejecutar(
        [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${join(carpeta, a.archivo)}"`, '-frames:v', '1', '-vf',
          `"scale=360:480:force_original_aspect_ratio=decrease,pad=360:480:(ow-iw)/2:(oh-ih)/2:black,format=yuvj420p"`, '-q:v', '4', `"${mini}"`],
        trabajo,
        60_000
      )
      if (r.codigo === 0 && existsSync(mini)) lista.push(`  ${lista.length + 1}. ${a.archivo.replace(/^trabajo\//, '')} («${a.nombre}»)`)
    }
    const columnas = Math.min(4, Math.max(1, lista.length))
    const filas = Math.ceil(lista.length / columnas)
    const r = !lista.length ? { codigo: 1 } : await ejecutar(
      [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${join(dir, 'tmp', 'm%02d.jpg')}"`, '-vf', `tile=${columnas}x${filas}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', `"${join(dir, 'fotos.jpg')}"`],
      trabajo,
      60_000
    )
    if (r.codigo === 0) {
      hojas.push(join(dir, 'fotos.jpg'))
      lineas.push(`fotos.jpg: las ${lista.length} fotos en miniatura, de izquierda a derecha y de arriba abajo:`, ...lista, '')
    }
  }

  for (const [i, a] of c.adjuntos.filter((x) => x.tipo === 'video').entries()) {
    const n = String(i + 1).padStart(2, '0')
    const ruta = join(carpeta, a.archivo)
    let info = ''
    try {
      const v = await probeVideo(ruta)
      info = `${mmss(v.duration)} (${v.duration.toFixed(2)} s), ${v.width}×${v.height}, ${v.hasAudio ? 'con audio' : 'sin audio'}`
      const fps = Math.max(0.05, 12 / Math.max(1, v.duration))
      const r = await ejecutar(
        [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vf', `fps=${fps.toFixed(4)},scale=240:-2,tile=6x2:padding=4:color=white`, '-frames:v', '1', '-q:v', '4', `"${join(dir, `video-${n}.jpg`)}"`],
        trabajo,
        120_000
      )
      if (r.codigo === 0) hojas.push(join(dir, `video-${n}.jpg`))
      if (v.hasAudio) {
        await ejecutar([`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vn', '-ac', '1', '-ar', '16000', `"${join(dir, `audio-${n}.wav`)}"`], trabajo, 120_000)
      }
    } catch {
      info = 'no se pudo leer'
    }
    lineas.push(
      `video-${n}.jpg: 12 fotogramas repartidos de ${a.archivo.replace(/^trabajo\//, '')} («${a.nombre}») — ${info}.`,
      ...(existsSync(join(dir, `audio-${n}.wav`)) ? [`audio-${n}.wav: su audio en WAV 16 kHz mono (para medir golpes o transcribir rápido).`] : []),
      ''
    )
  }
  rmSync(join(dir, 'tmp'), { recursive: true, force: true })
  writeFileSync(leeme, lineas.join('\n'), 'utf8')
  return hojas
}

/** Lo que ven en el pedido los agentes que reciben imágenes (Antigravity): las hojas del vistazo, no los originales. */
async function imagenesDeEntrada(c: Creacion, carpeta: string): Promise<string[]> {
  return prepararVistazo(c, carpeta)
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
  onLinea('Recorte prepara un vistazo de tus archivos')
  await prepararVistazo(c, carpeta)
  const prompt = `Lee AGENTS.md (tu manual). Esto es SOLO EL PLAN: un vistazo rápido, de pocos minutos.
Mira vistazo/LEEME.txt y las hojas de vistazo/ (miniaturas y fotogramas), entiende el pedido y propón cómo lo harás.
TODAVÍA NO HAGAS EL VIDEO: no midas el audio a fondo, no hagas pruebas ni renders y no crees nada en salida/.
Escribe en notas.md, en pocas líneas, lo que viste (qué es cada archivo y lo importante de cada uno) para usarlo después.

${contexto(c)}

Responde SOLO con JSON, sin texto alrededor:
{"entendi": "qué vas a hacer, en 1-2 frases, con los datos que mediste", "pasos": ["paso corto", "…"], "preguntas": ["solo si de verdad no puedes decidir algo importante"], "herramienta": "Kit de Recorte | FFmpeg | Python + FFmpeg | HyperFrames | …"}`
  const respuesta = await trabajarAgente(cmd.orden, trabajo, prompt, onLinea, senal, 30 * 60_000, await imagenesDeEntrada(c, carpeta))
  let datos: unknown = null
  try {
    datos = extraerJson(respuesta)
  } catch {
    // Sin JSON: que se vea lo que dijo el agente, no un error de formato.
  }
  const plan = validarPlan(datos)
  if (!plan) {
    const dijo = respuesta.replace(/\s+/g, ' ').trim().slice(0, 300)
    throw new Error(dijo ? `El agente no devolvió el plan. Dijo: «${dijo}»` : 'El agente no devolvió un plan.')
  }
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
  await prepararVistazo(c, carpeta)
  const desde = Date.now()
  // Un cambio sobre un video ya hecho no repite el método entero: toca solo lo pedido
  // (menos tiempo y menos créditos del plan del usuario).
  const prompt =
    hay && pedido
      ? `ESTO ES UN CAMBIO sobre un video que ya hiciste, no un video nuevo. Tu manual sigue en AGENTS.md por si lo necesitas.

${contexto(c)}

YA HICISTE ESTA VERSIÓN: ${hay.archivo.replace(/^salidas\//, '')} (lo que dijiste: ${hay.resumen}). Tus archivos de trabajo (receta.json, scripts, composiciones) siguen en esta carpeta.

LO QUE PIDE AHORA EL USUARIO: ${pedido}

Cómo trabajar para no gastar de más:
- No vuelvas a mirar vistazo/ ni entrada/ ni a medir lo que ya mediste (está en notas.md), y no rehagas el plan.
- Abre el archivo de trabajo que produjo la versión anterior, cambia SOLO lo que se pide y conserva todo lo demás tal cual.
- Renderiza a un archivo NUEVO en salida/ (otro nombre, p. ej. con -v2), mira 2 o 3 fotogramas de lo que cambiaste y entrega.
Al terminar escribe resultado.json como dice el manual y termina (no dejes servidores ni procesos abiertos).`
      : `Lee AGENTS.md (tu manual) y sigue el método completo, del paso 1 al 7. Empieza por notas.md y vistazo/: no repitas lo que ya viste.

${contexto(c)}
${plan ? `\nEL PLAN QUE EL USUARIO APROBÓ:\n${plan.entendi}\n${plan.pasos.map((p) => `- ${p}`).join('\n')}\n` : ''}${hay ? `\nYA HICISTE UNA VERSIÓN: ${hay.archivo.replace(/^salidas\//, '')} (lo que dijiste: ${hay.resumen}). Tus archivos de trabajo siguen en esta carpeta: parte de ellos y cambia solo lo que se pide, conservando lo que al usuario le gustó.\n` : ''}${pedido ? `\nLO QUE PIDE AHORA EL USUARIO: ${pedido}\n` : ''}
Cuando termines y lo hayas comprobado mirando los fotogramas, escribe resultado.json como dice el manual y termina (no dejes servidores ni previsualizaciones abiertas).`
  const entregaLista = () => fecha(resultadoJson) >= desde && archivoEntregado(carpeta, desde) !== null
  return trabajarAgente(cmd.orden, trabajo, prompt, onLinea, senal, 40 * 60_000, await imagenesDeEntrada(c, carpeta), entregaLista)
}

// ---------------------------------------------------------------------------
// La revisión de Recorte (independiente del agente)
// ---------------------------------------------------------------------------

/** Dentro de la carpeta de trabajo (el agente no puede entregar archivos de fuera). */
const dentroDe = (base: string, ruta: string): boolean => {
  const r = resolve(ruta).toLowerCase()
  const b = resolve(base).toLowerCase()
  return r === b || r.startsWith(b.endsWith(sep) ? b : b + sep)
}

const esArchivo = (ruta: string): boolean => {
  try {
    return statSync(ruta).isFile()
  } catch {
    return false
  }
}

const fecha = (ruta: string): number => {
  try {
    return statSync(ruta).mtimeMs
  } catch {
    return 0
  }
}

/**
 * El archivo que entregó el agente en ESTA ronda: el de resultado.json o, si no, el más
 * nuevo de salida/. Con `desde`, solo vale lo que se escribió después de empezar: así una
 * edición fallida nunca «entrega» el video anterior ni un fotograma de revisión.
 */
export function archivoEntregado(
  carpeta: string,
  desde = 0
): { ruta: string; entrega: ReturnType<typeof validarEntrega> } | null {
  const trabajo = carpetaTrabajo(carpeta)
  const fresco = (ruta: string) => !desde || fecha(ruta) >= desde - 2000
  const valido = (ruta: string) =>
    dentroDe(trabajo, ruta) && esArchivo(ruta) && [...EXT_VIDEO, ...EXT_IMAGEN].includes(extname(ruta).toLowerCase())
  let entrega = validarEntrega({})
  try {
    entrega = validarEntrega(JSON.parse(readFileSync(join(trabajo, 'resultado.json'), 'utf8')))
  } catch {
    // Sin resultado.json: se busca en salida/.
  }
  if (entrega.archivo) {
    // Los agentes escriben la ruta de muchas formas: «salida/x.mp4», «./salida/x.mp4»,
    // «trabajo/salida/x.mp4», con comillas o absoluta. Todas valen si quedan dentro de trabajo/.
    const raw = entrega.archivo.trim().replace(/^['"`]|['"`]$/g, '').replace(/\\/g, '/')
    const relativa = raw.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/^trabajo\//i, '')
    const candidatas = [
      isAbsolute(entrega.archivo.trim()) ? resolve(entrega.archivo.trim()) : null,
      join(trabajo, relativa),
      join(trabajo, 'salida', basename(raw))
    ].filter(Boolean) as string[]
    for (const r of candidatas) if (valido(r) && fresco(r)) return { ruta: r, entrega }
  }
  const salida = join(trabajo, 'salida')
  if (!existsSync(salida)) return null
  const candidatos = readdirSync(salida)
    .map((n) => join(salida, n))
    .filter((r) => valido(r) && fresco(r))
    .map((ruta) => ({ ruta, fecha: fecha(ruta) }))
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
  version: number,
  desde = 0
): Promise<{ resultado?: ResultadoAgente; problemas: string[] }> {
  const hallado = archivoEntregado(carpeta, desde)
  if (!hallado) {
    return {
      problemas: [
        desde
          ? 'No dejaste un archivo nuevo en salida/ en esta ronda (resultado.json no apunta a nada nuevo).'
          : 'No dejaste ningún archivo final en salida/ ni en resultado.json.'
      ]
    }
  }
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
      if (!revision.length) {
        // Intento de fotograma al inicio como respaldo
        const archivo0 = `agente-v${version}-r0.jpg`
        const r0 = await ejecutar(
          [`"${ffmpeg}"`, '-y', '-v', 'error', '-ss', '0', '-i', `"${hallado.ruta}"`, '-frames:v', '1', '-vf', `scale='min(540,iw)':-2`, '-q:v', '4', `"${join(salidas, archivo0)}"`],
          carpeta,
          30_000
        )
        if (r0.codigo === 0 && existsSync(join(salidas, archivo0))) revision.push(`salidas/${archivo0}`)
      }
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
