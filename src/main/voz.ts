import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { alinearEscenas, textoNarracion, type Creacion, type VozCreacion } from '../shared/creacion'
import { resolverBinario } from './binarios'
import { ejecutar } from './crear'
import { duracionMedio } from './ffmpeg'
import { transcribirArchivo } from './transcribir'

/**
 * La voz de una creación. Tres orígenes, un mismo final: `composicion/media/voz.wav` y
 * los segundos en que empieza cada escena.
 *
 * - Gemini: la API de AI Studio (`/v1beta/interactions`, modelos «Flash TTS») con la clave
 *   del usuario. Devuelve un WAV completo de 24 kHz mono.
 * - Tu voz: lo que grabas en la app (WebM) o un audio que subes; FFmpeg lo pasa a WAV.
 * - Después se transcribe con Whisper (en local) para saber dónde empieza cada escena: así
 *   el video sigue a la voz, y no al revés.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta/interactions'
/** El primero es el de mejor calidad; el segundo, el ligero, por si el primero no está o no hay cuota. */
const MODELOS_VOZ = ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts']
const ESTILO = 'Narrador de video corto para redes: claro, cercano y con energía, ritmo ágil, sin exagerar.'

export const ARCHIVO_VOZ = 'media/voz.wav'

function rutaVoz(carpeta: string): string {
  return join(carpeta, 'composicion', ARCHIVO_VOZ)
}

/** Envuelve PCM 16 bits mono en un WAV, por si la API lo devuelve sin cabecera. */
function wavDesdePcm(pcm: Buffer, frecuencia = 24000): Buffer {
  const cabecera = Buffer.alloc(44)
  cabecera.write('RIFF', 0)
  cabecera.writeUInt32LE(36 + pcm.length, 4)
  cabecera.write('WAVE', 8)
  cabecera.write('fmt ', 12)
  cabecera.writeUInt32LE(16, 16)
  cabecera.writeUInt16LE(1, 20)
  cabecera.writeUInt16LE(1, 22)
  cabecera.writeUInt32LE(frecuencia, 24)
  cabecera.writeUInt32LE(frecuencia * 2, 28)
  cabecera.writeUInt16LE(2, 32)
  cabecera.writeUInt16LE(16, 34)
  cabecera.write('data', 36)
  cabecera.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([cabecera, pcm])
}

/** Busca el audio en la respuesta: `steps[].content[]` del paso `model_output`. */
function audioDe(respuesta: unknown): { datos: string; mime?: string } | null {
  const pasos = (respuesta as { steps?: unknown[] })?.steps
  if (!Array.isArray(pasos)) return null
  for (const paso of [...pasos].reverse()) {
    const p = paso as { type?: string; content?: unknown[] }
    if (p.type !== 'model_output' || !Array.isArray(p.content)) continue
    for (const c of [...p.content].reverse()) {
      const x = c as { type?: string; data?: string; mime_type?: string }
      if (x.type === 'audio' && typeof x.data === 'string') return { datos: x.data, mime: x.mime_type }
    }
  }
  return null
}

/**
 * Un 429 de Google: si es el límite por minuto (no el del día), cuántos segundos esperar (lo que pide Google, o 40);
 * null si es la cuota del día y no vale la pena esperar.
 */
export function esperaPorLimite(detalle: string): number | null {
  if (/per ?day|PerDay|daily/i.test(detalle)) return null
  const pide = Number(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(detalle)?.[1] ?? NaN)
  return Number.isFinite(pide) ? Math.min(90, Math.max(5, Math.ceil(pide))) : 40
}

/** Cuántas veces se espera el límite por minuto de una misma frase antes de darse por vencido. */
const REINTENTOS_POR_MINUTO = 6

/** Un pedido de voz a un modelo: el audio quedó en `salida`, hay que esperar (límite por minuto) o pasar al otro modelo. */
type IntentoVoz = { hecho: true } | { esperar: number } | { error: string; seguir: boolean }

async function pedirVoz(modelo: string, texto: string, voz: string, clave: string, salida: string): Promise<IntentoVoz> {
  const controlador = new AbortController()
  const reloj = setTimeout(() => controlador.abort(), 180_000)
  try {
    const r = await fetch(API, {
      method: 'POST',
      signal: controlador.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
      body: JSON.stringify({
        model: modelo,
        input: [
          {
            type: 'user_input',
            content: [{ type: 'text', text: texto, annotations: [{ type: 'speech_metadata', style: ESTILO }] }]
          }
        ],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: voz }] }
      })
    })
    if (!r.ok) {
      const completo = await r.text()
      const detalle = completo.slice(0, 300)
      if (r.status === 400 || r.status === 401 || r.status === 403) {
        throw new Error(
          r.status === 400 && /api key/i.test(detalle)
            ? 'La clave de AI Studio no es válida. Revísala en el paso Voz.'
            : `Google rechazó la petición (${r.status}): ${detalle}`
        )
      }
      if (r.status === 429) {
        // El límite por minuto se espera; el del día no (se prueba el otro modelo).
        const espera = esperaPorLimite(completo)
        return espera !== null ? { esperar: espera } : { error: 'Se acabó la cuota de voz de tu clave por hoy.', seguir: true }
      }
      // 404 (modelo no disponible): se prueba el siguiente.
      return { error: `Google respondió ${r.status}: ${detalle}`, seguir: true }
    }
    const audio = audioDe(await r.json())
    if (!audio) return { error: 'La respuesta de Google no trajo audio.', seguir: true }
    const bytes = Buffer.from(audio.datos, 'base64')
    writeFileSync(salida, bytes.subarray(0, 4).toString('ascii') === 'RIFF' ? bytes : wavDesdePcm(bytes))
    return { hecho: true }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { error: 'Google tardó demasiado en generar la voz.', seguir: true }
    throw error
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Una frase con la voz de Gemini (la clave de AI Studio del usuario). Si Google pide esperar por el límite de voces por
 * minuto, se espera lo que dice y se vuelve a pedir (hasta REINTENTOS_POR_MINUTO veces); con la cuota del día, el modelo
 * ligero; si tampoco, el error.
 */
export async function generarVozGemini(
  texto: string,
  voz: string,
  clave: string,
  salida: string,
  alEsperar: (segundos: number) => void = () => {},
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<void> {
  let ultimoError = ''
  for (const modelo of MODELOS_VOZ) {
    for (let intento = 0; ; intento++) {
      const r = await pedirVoz(modelo, texto, voz, clave, salida)
      if ('hecho' in r) return
      if ('esperar' in r) {
        if (intento >= REINTENTOS_POR_MINUTO) {
          ultimoError = 'Google sigue pidiendo esperar (límite de voces por minuto). Prueba en unos minutos.'
          break
        }
        alEsperar(r.esperar)
        await dormir(r.esperar * 1000)
        continue
      }
      ultimoError = r.error
      break
    }
  }
  throw new Error(ultimoError || 'No pude generar la voz.')
}

/** Lleva cualquier audio (WebM grabado, MP3, M4A…) a WAV mono 48 kHz dentro de la composición. */
export async function convertirAVoz(entrada: string, carpeta: string): Promise<void> {
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  const r = await ejecutar(
    [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${entrada}"`, '-vn', '-ac', '1', '-ar', '48000', '-t', '600', `"${rutaVoz(carpeta)}"`],
    carpeta,
    180_000
  )
  if (r.codigo !== 0) throw new Error(`No pude leer ese audio: ${r.salida.trim().slice(-200)}`)
}

/** Con `voz.wav` ya en su sitio: mide, transcribe y alinea las escenas. */
export async function prepararVoz(
  c: Creacion,
  carpeta: string,
  origen: VozCreacion['origen'],
  vozGemini: string | undefined,
  onProgreso: (pct: number, texto: string) => void
): Promise<VozCreacion> {
  const archivo = rutaVoz(carpeta)
  if (!existsSync(archivo) || !c.guion) throw new Error('Falta la voz o el guion.')
  // Un WAV no tiene pista de video: se mide la duración del archivo, no la del video.
  const duracion = await duracionMedio(archivo)
  if (!(duracion > 0.5)) throw new Error('La voz salió vacía o demasiado corta.')

  onProgreso(0.6, 'Escuchando la voz para sincronizar las escenas')
  const t = await transcribirArchivo(archivo, join(carpeta, 'voz.json'), (pct) => onProgreso(0.6 + pct * 0.35, 'Sincronizando escenas'))
  const inicioPalabras = t.ok ? (t.transcript ?? []).flatMap((s) => s.words.map((w) => w.start)).sort((a, b) => a - b) : []
  return {
    origen,
    archivo: ARCHIVO_VOZ,
    ...(vozGemini ? { vozGemini } : {}),
    duracion: Math.round(duracion * 100) / 100,
    // Sin transcripción (sin Python), se reparte el tiempo a partes iguales.
    inicios: alinearEscenas(c.guion, inicioPalabras, duracion),
    // La narración que dice esta voz: si el guion cambia, se sabe que quedó vieja.
    texto: textoNarracion(c.guion)
  }
}
