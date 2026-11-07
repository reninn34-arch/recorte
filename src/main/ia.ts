import { spawn, type ChildProcess } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ClipSuggestion, RecetaEdicion, TranscriptSegment } from '../shared/types'
import { pathAmpliado } from './binarios'
import { validarReceta } from './receta'

/**
 * Análisis y edición con un LLM externo. Dos caminos:
 * - API de chat compatible con OpenAI (Kimi, OpenAI, Ollama, LM Studio…), con clave.
 * - Agente CLI local (Claude Code, Kimi Code CLI…), con la suscripción del usuario.
 *
 * La clave la pasa el proceso principal; este módulo no la lee del disco ni la expone.
 * Si el modelo responde mal, lanza Error y el llamador cae a la selección local.
 */

const MAX_CLIPS = 12
const DURACION_MIN = 5
const DURACION_MAX = 180
const LIMITE_CARACTERES = 24_000

export interface ConfigIA {
  baseUrl: string
  modelo: string
  clave: string
}

function mmss(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Transcripción compacta con tiempos; si no cabe, muestrea segmentos uniformes. */
function guionCompacto(transcript: TranscriptSegment[]): string {
  const lineas = transcript.map(
    (segmento) => `[${mmss(segmento.start)}] ${segmento.text.replace(/\s+/g, ' ').trim()}`
  )
  let texto = lineas.join('\n')
  if (texto.length <= LIMITE_CARACTERES) return texto

  const factor = texto.length / LIMITE_CARACTERES
  const paso = Math.max(2, Math.ceil(factor))
  texto = lineas.filter((_, indice) => indice % paso === 0).join('\n')
  return texto.slice(0, LIMITE_CARACTERES)
}

export function extraerJson(texto: string): unknown {
  // Prueba cada «{» o «[» en orden: el texto de alrededor puede traer corchetes que no son JSON
  // (un enlace en Markdown, «[nota]»…) y no por eso hay que rendirse.
  let primerError: unknown = null
  for (let i = texto.search(/[[{]/); i !== -1; ) {
    try {
      return jsonDesde(texto, i)
    } catch (e) {
      primerError ??= e
    }
    const siguiente = texto.slice(i + 1).search(/[[{]/)
    i = siguiente === -1 ? -1 : i + 1 + siguiente
  }
  throw primerError ?? new Error('La respuesta no contiene JSON.')
}

function jsonDesde(texto: string, inicio: number): unknown {
  // Recorre respetando cadenas para encontrar el cierre que empareja.
  const apertura = texto[inicio]
  const cierre = apertura === '{' ? '}' : ']'
  let profundidad = 0
  let enCadena = false
  let escapado = false
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]
    if (enCadena) {
      if (escapado) escapado = false
      else if (c === '\\') escapado = true
      else if (c === '"') enCadena = false
      continue
    }
    if (c === '"') enCadena = true
    else if (c === apertura) profundidad++
    else if (c === cierre) {
      profundidad--
      if (profundidad === 0) return JSON.parse(texto.slice(inicio, i + 1))
    }
  }
  throw new Error('El JSON de la respuesta está incompleto.')
}

// ---------------------------------------------------------------------------
// Transporte: una sola implementación por camino, compartida por clips y receta
// ---------------------------------------------------------------------------

/**
 * Pregunta a un agente CLI local (Claude Code, Kimi Code CLI, Codex, Gemini…).
 * El prompt va por stdin para no topar con el límite de la línea de comandos de
 * Windows; la respuesta se lee de stdout. No toca claves API ni facturación por uso.
 *
 * El comando lo escribe el usuario en Ajustes (por defecto `claude -p`). Debe ser
 * un modo no interactivo que lea el prompt de stdin y escriba la respuesta en stdout.
 * Si el comando contiene `{prompt}`, el prompt se escribe en un archivo temporal y la
 * marca se sustituye por su ruta — para agentes como Kimi (`kimi -p "@{prompt}"`) que
 * toman el prompt como argumento en vez de por stdin.
 */
/** Variables extra para el proceso de un agente (p. ej. ANTHROPIC_API_KEY si paga con llave). */
let entornoAgentes: (orden: string) => Promise<Record<string, string>> = async () => ({})
export function definirEntornoAgentes(fn: (orden: string) => Promise<Record<string, string>>): void {
  entornoAgentes = fn
}
/** Las variables extra de un agente (las usa también el modo agente, que lo lanza aparte). */
export function entornoParaAgente(orden: string): Promise<Record<string, string>> {
  return entornoAgentes(orden).catch(() => ({}))
}

// ---------------------------------------------------------------------------
// Parar al agente: cada trabajo largo tiene su clave («chat:<proyecto>»,
// «creacion:<id>») y su señal. Parar corta el proceso del agente (con todo lo que
// lanzó) o la petición a la API: deja de gastar en ese mismo instante.
// ---------------------------------------------------------------------------

/** El fallo de un agente en palabras del usuario (sesión caducada, límite del plan…). */
const SESION_CAIDA = /authenticat|oauth|session expired|not logged in|unauthori[sz]ed|\b401\b|credential|please run \/?login|invalid api key/i

/** Quien quiera enterarse de que la sesión de un agente se cayó (index.ts: marca y refresca Inicio). */
let alCaerSesion: ((orden: string) => void) | null = null
export function avisarSesionCaida(cb: (orden: string) => void): void {
  alCaerSesion = cb
}

/** Como explicarFallo, pero sabiendo qué agente falló: si fue la sesión, lo avisa para reconectar. */
export function falloDeAgente(orden: string, texto: string): string {
  if (!rechazoPorPolitica(texto) && SESION_CAIDA.test(texto)) alCaerSesion?.(orden)
  return explicarFallo(texto)
}

export function explicarFallo(texto: string): string {
  const rechazo = rechazoPorPolitica(texto)
  if (rechazo) return rechazo
  if (SESION_CAIDA.test(texto)) {
    return 'La sesión de tu agente caducó o se cerró. Vuelve a conectarlo en Inicio (botón «Conectar») e inténtalo otra vez.'
  }
  if (/rate.?limit|usage limit|quota|\b429\b|too many requests|limit reached/i.test(texto)) {
    return 'Tu agente llegó al límite de uso de su plan por ahora. Espera un rato o usa otro agente.'
  }
  return texto
}

/**
 * Si el proveedor no dejó ni empezar porque su filtro de contenido rechazó el pedido (p. ej.
 * Antigravity/Google: «The prompt could not be submitted… Generative AI Prohibited Use policy»),
 * lo dice en claro y qué probar. Si no, null.
 */
export function rechazoPorPolitica(texto: string): string | null {
  if (!/prohibited use policy|could not be submitted|sensitive words|content (policy|filter)|safety (filter|policy|system)|usage polic(y|ies)|violat\w* .{0,40}polic/i.test(texto)) return null
  return 'El filtro de contenido de tu agente rechazó el pedido antes de empezar (no llegó a mirar tus archivos). ' +
    'Suele pasar con fotos de cuerpo o con palabras sobre la cara o la piel de una persona. ' +
    'Prueba a describirlo de forma más neutra (por ejemplo «que no se reconozca a la persona» en vez de hablar de su cara o su cuerpo) ' +
    'o usa otro agente (Claude Code, Codex o Kimi) para este video.'
}

export class Parado extends Error {
  constructor() {
    super('Lo paraste.')
    this.name = 'Parado'
  }
}
export const esParado = (e: unknown): boolean => e instanceof Error && e.name === 'Parado'

const trabajos = new Map<string, AbortController>()

export function empezarTrabajo(clave: string): AbortSignal {
  trabajos.get(clave)?.abort()
  const c = new AbortController()
  trabajos.set(clave, c)
  return c.signal
}
export function pararTrabajo(clave: string): boolean {
  const c = trabajos.get(clave)
  if (!c) return false
  c.abort()
  return true
}
export function terminarTrabajo(clave: string, senal: AbortSignal): void {
  if (trabajos.get(clave)?.signal === senal) trabajos.delete(clave)
}

/** Mata un proceso y sus hijos (con `shell: true` en Windows, `kill` solo mata el cmd). */
export function matarArbol(hijo: ChildProcess): void {
  if (hijo.exitCode !== null || hijo.pid === undefined) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { windowsHide: true }).on('error', () => hijo.kill())
  } else {
    hijo.kill('SIGTERM')
  }
}

export async function preguntarAgente(
  prompt: string,
  comando: string,
  timeoutMs = 300_000,
  senal?: AbortSignal
): Promise<string> {
  if (senal?.aborted) throw new Parado()
  let orden = comando.trim()
  if (!orden) throw new Error('Falta el comando del agente. Revísalo en Ajustes.')
  // Marca interna: Antigravity no es un CLI de texto; se habla ACP con su servidor.
  if (orden === 'antigravity:acp') {
    const { preguntarAntigravity } = await import('./antigravity')
    return preguntarAntigravity(prompt, timeoutMs, senal)
  }

  let archivoPrompt: string | null = null
  if (orden.includes('{prompt}')) {
    archivoPrompt = join(tmpdir(), `recorte-prompt-${Date.now()}.txt`)
    writeFileSync(archivoPrompt, prompt, 'utf8')
    orden = orden.replaceAll('{prompt}', `"${archivoPrompt}"`)
  }

  const extra = await entornoAgentes(orden).catch(() => ({}))
  return new Promise<string>((resolver, rechazar) => {
    const limpiar = () => {
      if (archivoPrompt) {
        try {
          unlinkSync(archivoPrompt)
        } catch {
          // El temporal se limpia solo con el tiempo; no es grave.
        }
      }
    }
    const hijo = spawn(orden, {
      windowsHide: true,
      shell: true,
      env: { ...process.env, ...extra, PATH: pathAmpliado() }
    })
    let texto = ''
    let error = ''
    let cerrado = false
    const temporizador = setTimeout(() => {
      if (!cerrado) {
        matarArbol(hijo)
        limpiar()
        rechazar(new Error(`El agente tardó demasiado (${Math.round(timeoutMs / 1000)} s): ${orden}`))
      }
    }, timeoutMs)
    const alParar = () => {
      if (cerrado) return
      cerrado = true
      clearTimeout(temporizador)
      matarArbol(hijo)
      limpiar()
      rechazar(new Parado())
    }
    senal?.addEventListener('abort', alParar, { once: true })

    hijo.stdout.on('data', (b: Buffer) => (texto += b.toString('utf8')))
    hijo.stderr.on('data', (b: Buffer) => (error += b.toString('utf8')))
    hijo.on('error', () => {
      clearTimeout(temporizador)
      limpiar()
      rechazar(
        new Error(
          `No pude lanzar «${orden}». Comprueba que el agente está instalado y que has iniciado sesión en él.`
        )
      )
    })
    hijo.on('close', (codigo) => {
      senal?.removeEventListener('abort', alParar)
      if (cerrado) return
      cerrado = true
      clearTimeout(temporizador)
      limpiar()
      if (codigo === 0 && texto.trim()) resolver(texto)
      else {
        // Lo que dijo el agente al fallar (o lo último que imprimió), y qué se lanzó: sin eso
        // «terminó con código 1» no sirve para saber qué pasó.
        const dijo = (error.trim() || texto.trim()).slice(-300)
        rechazar(new Error(dijo ? falloDeAgente(orden, dijo) : `El agente («${orden.slice(0, 80)}») terminó con código ${codigo} sin decir nada.`))
      }
    })
    if (archivoPrompt) {
      hijo.stdin.end()
    } else {
      hijo.stdin.write(prompt, 'utf8')
      hijo.stdin.end()
    }
  })
}

/** Pregunta a una API de chat compatible con OpenAI. Timeout de 120 s. Con `imagenes`
 *  (rutas absolutas a JPG/PNG) manda contenido multimodal con `image_url` en base64. */
export async function preguntarApi(
  promptSistema: string,
  promptUsuario: string,
  config: ConfigIA,
  senal?: AbortSignal,
  imagenes?: string[]
): Promise<string> {
  if (senal?.aborted) throw new Parado()
  const base = config.baseUrl.replace(/\/+$/, '')
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), 120_000)
  const alParar = () => controlador.abort()
  senal?.addEventListener('abort', alParar, { once: true })

  // Contenido del usuario: texto solo, o texto + imágenes (modelos con visión).
  let contenidoUsuario: unknown = promptUsuario
  if (imagenes?.length) {
    const partes: unknown[] = [{ type: 'text', text: promptUsuario }]
    const { readFileSync } = await import('node:fs')
    for (const ruta of imagenes.slice(0, 8)) {
      try {
        const b64 = readFileSync(ruta).toString('base64')
        const tipo = /\.png$/i.test(ruta) ? 'image/png' : /\.webp$/i.test(ruta) ? 'image/webp' : 'image/jpeg'
        partes.push({ type: 'image_url', image_url: { url: `data:${tipo};base64,${b64}` } })
      } catch {
        // Si una imagen no se puede leer, va sin ella.
      }
    }
    if (partes.length > 1) contenidoUsuario = partes
  }

  try {
    const respuesta = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controlador.signal,
      headers: {
        'Content-Type': 'application/json',
        // Identificación honesta: algunos planes (p. ej. Kimi Code) filtran por cliente.
        'User-Agent': 'Recorte/0.1.0',
        Authorization: `Bearer ${config.clave}`
      },
      body: JSON.stringify({
        model: config.modelo,
        temperature: 0.4,
        messages: [
          { role: 'system', content: promptSistema },
          { role: 'user', content: contenidoUsuario }
        ]
      })
    })

    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 300)
      throw new Error(`El proveedor respondió ${respuesta.status}: ${detalle}`)
    }

    const datos = (await respuesta.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const contenido = datos.choices?.[0]?.message?.content
    if (!contenido) throw new Error('La respuesta del modelo vino vacía.')
    return contenido
  } catch (error) {
    if (senal?.aborted) throw new Parado()
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('El modelo tardó demasiado (120 s). Prueba con un modelo más rápido.')
    }
    throw error
  } finally {
    clearTimeout(temporizador)
    senal?.removeEventListener('abort', alParar)
  }
}

// ---------------------------------------------------------------------------
// Selección de momentos (fase 0)
// ---------------------------------------------------------------------------

function solapan(a: ClipSuggestion, b: ClipSuggestion): boolean {
  const interseccion = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
  const menor = Math.min(a.end - a.start, b.end - b.start)
  return menor > 0 && interseccion / menor > 0.5
}

function validarClips(datos: unknown, duracion: number): ClipSuggestion[] {
  const lista =
    Array.isArray(datos) ? datos
    : datos && typeof datos === 'object' && Array.isArray((datos as { clips?: unknown[] }).clips) ? (datos as { clips: unknown[] }).clips
    : null
  if (!lista) throw new Error('La respuesta no tiene una lista de clips.')

  const clips: ClipSuggestion[] = []
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    const bruto = item as Record<string, unknown>
    const start = Number(bruto.start)
    const end = Number(bruto.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue

    const inicio = Math.max(0, Math.min(start, duracion))
    const fin = Math.max(0, Math.min(end, duracion))
    if (fin - inicio < DURACION_MIN || fin - inicio > DURACION_MAX) continue

    const titulo = String(bruto.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
    const gancho = String(bruto.hook ?? '').replace(/\s+/g, ' ').trim().slice(0, 140)
    if (!titulo) continue

    clips.push({
      id: `ia-${Math.round(inicio * 100)}-${Math.round(fin * 100)}`,
      start: Math.round(inicio * 1000) / 1000,
      end: Math.round(fin * 1000) / 1000,
      title: titulo,
      hook: gancho || titulo,
      score: Math.max(60, Math.min(98, Math.round(Number(bruto.score) || 75))),
      reason: String(bruto.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Elegido por la IA',
      status: 'sugerido',
      captionStyle: 'Editorial',
      reframe: 'cara'
    })
  }

  clips.sort((a, b) => b.score - a.score)

  const elegidos: ClipSuggestion[] = []
  for (const clip of clips) {
    if (elegidos.length >= MAX_CLIPS) break
    if (elegidos.some((elegido) => solapan(elegido, clip))) continue
    elegidos.push(clip)
  }
  return elegidos
}

const PROMPT_SISTEMA = `Eres un editor de video experto en TikTok, Reels y Shorts para creadores de cursos en español.
Recibes la transcripción de una clase con tiempos [m:ss]. Elige los mejores momentos para reels verticales.

Criterios:
- Gancho claro en los primeros 3 segundos del clip.
- El momento se entiende solo, sin contexto previo.
- Empieza y termina en frases completas.
- Duración ideal: 20-50 segundos (nunca menos de ${DURACION_MIN} ni más de ${DURACION_MAX}).
- Variedad: no elijas momentos que se solapen.

Responde SOLO con JSON, sin markdown ni explicaciones:
{"clips":[{"start":segundos,"end":segundos,"title":"título corto","hook":"frase gancho","score":0-100,"reason":"por qué funciona"}]}`

export async function proponerClipsConAgente(
  transcript: TranscriptSegment[],
  duracion: number,
  comando: string
): Promise<ClipSuggestion[]> {
  const guion = guionCompacto(transcript)
  if (!guion) throw new Error('La transcripción está vacía.')

  const prompt = `${PROMPT_SISTEMA}\n\nDuración total de la clase: ${Math.round(duracion)} segundos.\n\nTranscripción:\n${guion}`
  const salida = await preguntarAgente(prompt, comando)

  const clips = validarClips(extraerJson(salida), duracion)
  if (clips.length === 0) throw new Error('El agente no propuso momentos válidos.')
  return clips
}

export async function proponerClipsConIA(
  transcript: TranscriptSegment[],
  duracion: number,
  config: ConfigIA
): Promise<ClipSuggestion[]> {
  const guion = guionCompacto(transcript)
  if (!guion) throw new Error('La transcripción está vacía.')

  const contenido = await preguntarApi(
    PROMPT_SISTEMA,
    `Duración total de la clase: ${Math.round(duracion)} segundos.\n\nTranscripción:\n${guion}`,
    config
  )

  const clips = validarClips(extraerJson(contenido), duracion)
  if (clips.length === 0) throw new Error('El modelo no propuso momentos válidos.')
  return clips
}

// ---------------------------------------------------------------------------
// Edición completa (fase 1): el agente produce una RecetaEdicion
// ---------------------------------------------------------------------------

const PROMPT_RECETA = `Eres un editor de video experto en TikTok, Reels y Shorts para creadores de cursos en español.
Recibes la transcripción de una clase con tiempos [m:ss] y su duración. Tu trabajo es EDITAR un reel vertical
completo: decides los cortes del material original, su orden, el color, la velocidad y las transiciones.

Reglas:
- Cada corte es un rango [start, end] en segundos dentro del material (5 a 180 s en total entre todos).
- Los cortes deben contar una idea completa, con gancho al inicio.
- color: brillo (-0.3 a 0.3), contraste (0.6 a 1.6), saturacion (0 a 2.5). Omite lo que no quieras tocar.
- velocidad: 0.75 a 1.5 (1 = original). Úsala solo si mejora el ritmo.
- transicion: "corte" o "fundido" (fundido cruzado de 0,4 s entre cortes).
- captions: true si el video habla a cámara (casi siempre).
- resumen: una frase para el usuario explicando tu edición.

Responde SOLO con JSON, sin markdown ni explicaciones:
{"titulo":"título corto","cortes":[{"start":0,"end":12}],"color":{"contraste":1.1},"velocidad":1,"transicion":"corte","captions":true,"resumen":"…"}`

function promptReceta(transcript: TranscriptSegment[], duracion: number): string {
  const guion = guionCompacto(transcript)
  if (!guion) throw new Error('La transcripción está vacía.')
  return `Duración total de la clase: ${Math.round(duracion)} segundos.\n\nTranscripción:\n${guion}`
}

export async function proponerRecetaConAgente(
  transcript: TranscriptSegment[],
  duracion: number,
  comando: string
): Promise<RecetaEdicion> {
  const salida = await preguntarAgente(`${PROMPT_RECETA}\n\n${promptReceta(transcript, duracion)}`, comando)
  return validarReceta(extraerJson(salida), duracion)
}

export async function proponerRecetaConIA(
  transcript: TranscriptSegment[],
  duracion: number,
  config: ConfigIA
): Promise<RecetaEdicion> {
  const contenido = await preguntarApi(PROMPT_RECETA, promptReceta(transcript, duracion), config)
  return validarReceta(extraerJson(contenido), duracion)
}
