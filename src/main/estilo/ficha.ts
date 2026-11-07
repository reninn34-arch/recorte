import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { EstiloMedido, FichaEstilo } from '../../shared/estilo'
import { validarFicha } from '../../shared/estilo'
import { guardar } from '../disco'
import { extraerJson, Parado, preguntarAgente, preguntarApi, type ConfigIA } from '../ia'
import type { ConfigAgente } from '../creaciones'

/**
 * Fase 2 (parte del agente): interpreta lo medido de la referencia y devuelve la
 * ficha de estilo (`analisis/estilo.json`). El agente recibe las hojas de contacto
 * y los fotogramas clave:
 * - CLI: como rutas absolutas dentro del prompt. Comprobado solo con Kimi Code (las abre
 *   y las ve); con Claude Code, Codex y Gemini CLI está SIN COMPROBAR. Si un agente no
 *   puede ver, responde solo con lo medido y marca "aproximada": true — la interfaz lo dice.
 * - API compatible con OpenAI: como `image_url` en base64 (preguntarApi).
 * Modo opcional: con la llave de AI Studio (la de la voz) Gemini ve el video completo
 * (Files API + generateContent, el «flash» más nuevo de la llave); si falla, se cae al
 * modo normal. Sin probar con una llave real.
 */

/** Si la lista de modelos no responde, este. */
const MODELO_GEMINI_RESPALDO = 'gemini-2.5-flash'

/**
 * El modelo «flash» más nuevo que la llave puede usar para generateContent (los nombres
 * cambian con cada generación de Gemini: mejor preguntarle a la API que fijarlo).
 */
async function modeloGeminiVideo(clave: string, senal?: AbortSignal): Promise<string> {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': clave },
      signal: senal
    })
    if (!r.ok) return MODELO_GEMINI_RESPALDO
    const datos = (await r.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
    const candidatos = (datos.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .map((n) => ({ n, v: /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(n) }))
      .filter((x) => x.v)
      .sort((a, b) => Number(b.v![1]) - Number(a.v![1]))
    return candidatos[0]?.n ?? MODELO_GEMINI_RESPALDO
  } catch {
    return MODELO_GEMINI_RESPALDO
  }
}

const mmss = (s: number): string => {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

const INSTRUCCION_FICHA = `Eres un director de video analizando el ESTILO DE EDICIÓN de un video de referencia.
No analices el tema ni el contenido: solo CÓMO está editado, para copiar ese estilo en otro video.

Recibes mediciones hechas en local (planos, cortes por minuto, volumen, silencios, colores) e
imágenes del video (hojas de contacto y fotogramas clave). A partir de todo eso responde SOLO con
JSON, sin markdown ni explicaciones, con esta forma:
{
  "resumen": "el estilo en una frase",
  "subtitulos": {"lleva": true, "posicion": "abajo centro", "tamano": "grande", "color": "blanco con borde negro", "modo": "palabra", "mayusculas": true},
  "tipografia": "descripción corta",
  "zooms": "ninguno|pocos|frecuentes",
  "broll": "qué B-roll usa y con qué frecuencia",
  "recortesPersona": false,
  "textos": "qué textos en pantalla y cómo entran",
  "motion": "qué motion graphics lleva",
  "transiciones": "corte|fundido|mixtas",
  "musica": "tipo de música y efectos",
  "gancho": "qué pasa en los primeros 3 segundos",
  "recursos": [{"tipo": "material|motion|subtitulos|recorte|imagen_generada|clip_generado|voz|musica", "cuantos": 1, "descripcion": "corta"}],
  "aproximada": false
}
En "recursos" lista lo que el estilo NECESITA para copiarse (los tipos exactos de la lista).
Si NO puedes ver las imágenes, responde igualmente usando solo las mediciones y pon "aproximada": true.`

/** Lo medido, compacto, para el prompt. */
function medidoParaPrompt(medido: EstiloMedido): string {
  const lineas: string[] = [
    `Duración: ${medido.duracion} s · Formato: ${medido.formato} (${medido.ancho}×${medido.alto})`,
    `Planos: ${medido.planos.length}, corte cada ~${medido.medianaPlano} s (mediana; promedio ${medido.promedioPlano} s), ${medido.cortesPorMinuto} cortes/min.`,
    `Duración de los planos (s): ${medido.duraciones.slice(0, 40).join(', ')}${medido.duraciones.length > 40 ? '…' : ''}`,
    medido.conVoz ? `Tiene voz. Volumen integrado: ${medido.volumen ?? '?'} LUFS.` : 'No se oye voz clara.',
    medido.silencios.length
      ? `Silencios: ${medido.silencios.slice(0, 10).map((s) => `${mmss(s.inicio)}-${mmss(s.fin)}`).join(', ')}`
      : 'Sin silencios de medio segundo o más.',
    medido.colores.length ? `Colores dominantes: ${medido.colores.join(', ')}` : ''
  ].filter(Boolean)
  if (medido.transcripcion.length) {
    lineas.push('Lo que se dice (con tiempos):')
    for (const t of medido.transcripcion.slice(0, 60)) lineas.push(`[${mmss(t.inicio)}] ${t.texto}`)
  }
  return lineas.join('\n')
}

/** Una ficha mínima armada solo con lo medido, si el agente falla del todo. */
export function fichaDesdeMedido(medido: EstiloMedido, nota?: string): FichaEstilo {
  return {
    ...(nota ? { nota } : {}),
    subtitulos: { lleva: false },
    resumen: `Ritmo medido: corte cada ~${medido.medianaPlano} s (${Math.round(medido.cortesPorMinuto)} cortes/min)${medido.conVoz ? ', con voz' : ', sin voz clara'}, formato ${medido.formato}.`,
    recursos: [
      { tipo: 'material', cuantos: Math.max(1, medido.planos.length), descripcion: 'Planos cortados con el ritmo medido.' },
      ...(medido.conVoz ? [{ tipo: 'voz' as const, cuantos: 1, descripcion: 'La referencia habla: el video llevará voz.' }] : [])
    ],
    aproximada: true
  }
}

/**
 * Interpreta la referencia con el agente del usuario (CLI o API). Devuelve la ficha
 * validada y la guarda en `analisis/estilo.json`. Si el agente falla, devuelve la
 * ficha mínima hecha solo con lo medido (aproximada).
 */
export async function interpretarEstilo(
  carpeta: string,
  medido: EstiloMedido,
  config: ConfigAgente,
  senal?: AbortSignal
): Promise<FichaEstilo> {
  const analisis = join(carpeta, 'analisis')
  // Las imágenes que verá el agente: hojas de contacto y hasta 8 fotogramas clave.
  const imagenesRel = [...medido.hojas, ...medido.fotogramas.slice(0, 8)]
  const imagenesAbs = imagenesRel.map((r) => join(carpeta, r)).filter((r) => existsSync(r))

  let ficha: FichaEstilo | null = null
  let nota = 'No hay ningún agente conectado: esta ficha sale solo de lo medido. Conecta uno en Inicio y vuelve a analizar.'
  if (config.activa) {
    const listaImagenes = imagenesAbs.length
      ? `\n\nImágenes de la referencia (ábrelas con tu herramienta de lectura de imágenes, una a una):\n${imagenesAbs.map((r) => `- ${r}`).join('\n')}\nLa primera(s) son hojas de contacto 4×4 en orden temporal; el resto, fotogramas clave por plano.`
      : '\n\n(No hay imágenes disponibles: responde solo con las mediciones y pon "aproximada": true.)'
    const prompt = `${INSTRUCCION_FICHA}\n\nMediciones de la referencia:\n${medidoParaPrompt(medido)}${config.proveedor === 'cli' ? listaImagenes : ''}`
    try {
      const texto =
        config.proveedor === 'cli'
          ? await preguntarAgente(prompt, config.comandoCli, 10 * 60_000, senal)
          : await preguntarApi('Eres un director de video y respondes solo con JSON.', prompt, config.api!, senal, imagenesAbs)
      ficha = validarFicha(extraerJson(texto))
      if (!ficha) {
        console.error('[estilo] la respuesta del agente no parece una ficha:', texto.slice(0, 300))
        nota = 'Tu agente respondió, pero no con una ficha de estilo: esta sale solo de lo medido. Prueba «Volver a analizar».'
      }
    } catch (e) {
      if (e instanceof Parado) throw e
      // Si el agente falla, abajo va la ficha mínima con lo medido, diciendo por qué.
      const motivo = e instanceof Error ? e.message : String(e)
      console.error('[estilo] el agente no dio una ficha válida:', motivo)
      nota = `Tu agente falló al estudiar la referencia (${motivo.slice(0, 120)}): esta ficha sale solo de lo medido. Prueba «Volver a analizar».`
    }
  }
  if (!ficha) ficha = fichaDesdeMedido(medido, nota)
  guardar(join(analisis, 'estilo.json'), JSON.stringify(ficha, null, 2))
  return ficha
}

/** Lee la ficha guardada, si existe. */
export function leerFicha(carpeta: string): FichaEstilo | null {
  try {
    return validarFicha(JSON.parse(readFileSync(join(carpeta, 'analisis', 'estilo.json'), 'utf8')))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Modo Gemini con el video completo (Files API). Documentación oficial:
// https://ai.google.dev/gemini-api/docs/video-understanding (REST, resumable upload).
// ---------------------------------------------------------------------------

interface ArchivoGemini {
  name: string
  uri: string
  mimeType: string
  state?: string
}

async function esperarActivo(nombre: string, clave: string, senal?: AbortSignal): Promise<void> {
  // Los videos pasan por PROCESSING antes de poder usarse; se espera hasta 3 min.
  const limite = Date.now() + 3 * 60_000
  while (Date.now() < limite) {
    if (senal?.aborted) throw new Parado()
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${nombre}`, {
      headers: { 'x-goog-api-key': clave },
      signal: senal
    })
    if (!r.ok) throw new Error(`No pude leer el estado del video subido (${r.status}).`)
    const f = (await r.json()) as ArchivoGemini
    if (f.state === 'ACTIVE') return
    if (f.state === 'FAILED') throw new Error('Gemini no pudo procesar el video.')
    await new Promise((ok) => setTimeout(ok, 3000))
  }
  throw new Error('El video tardó demasiado en quedar listo en Gemini.')
}

/** Sube el video a la Files API de Gemini y devuelve su referencia. */
async function subirVideoGemini(ruta: string, clave: string, senal?: AbortSignal): Promise<ArchivoGemini> {
  const bytes = statSync(ruta).size
  if (bytes > 2 * 1024 * 1024 * 1024) throw new Error('El video pasa de 2 GB, el máximo de la Files API.')

  // Paso 1: abrir la subida resumible.
  const inicio = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    signal: senal,
    headers: {
      'x-goog-api-key': clave,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes),
      'X-Goog-Upload-Header-Content-Type': 'video/mp4',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: 'referencia-recorte' } })
  })
  if (!inicio.ok) throw new Error(`Gemini no aceptó la subida (${inicio.status}).`)
  const urlSubida = inicio.headers.get('x-goog-upload-url')
  if (!urlSubida) throw new Error('Gemini no devolvió la URL de subida.')

  // Paso 2: subir los bytes y cerrar.
  const datos = readFileSync(ruta)
  const subida = await fetch(urlSubida, {
    method: 'POST',
    signal: senal,
    headers: {
      'Content-Length': String(bytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: new Uint8Array(datos)
  })
  if (!subida.ok) throw new Error(`La subida del video falló (${subida.status}).`)
  const info = (await subida.json()) as { file?: ArchivoGemini }
  if (!info.file?.uri) throw new Error('Gemini no devolvió la referencia del video.')
  if (info.file.state !== 'ACTIVE') await esperarActivo(info.file.name, clave, senal)
  return info.file
}

/**
 * «Analizar con Gemini viendo el video completo»: con la llave de AI Studio (la misma
 * de la voz), Gemini ve la referencia entera y devuelve la ficha. Si algo falla, lanza
 * error y el llamador cae al modo normal (medido + agente).
 */
export async function analizarConGeminiVideo(
  rutaVideo: string,
  medido: EstiloMedido,
  clave: string,
  carpeta: string,
  senal?: AbortSignal
): Promise<FichaEstilo> {
  if (senal?.aborted) throw new Parado()
  const modelo = await modeloGeminiVideo(clave, senal)
  const archivo = await subirVideoGemini(rutaVideo, clave, senal)
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      signal: senal,
      headers: { 'x-goog-api-key': clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { file_data: { mime_type: archivo.mimeType || 'video/mp4', file_uri: archivo.uri } },
              {
                text: `${INSTRUCCION_FICHA}\n\nEl video de referencia es el archivo adjunto. Míralo completo (imagen y sonido).\n\nLo que Recorte ya midió de él (úsalo, es exacto):\n${medidoParaPrompt(medido)}`
              }
            ]
          }
        ]
      })
    })
    if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const datos = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const texto = datos.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const ficha = validarFicha(extraerJson(texto))
    if (!ficha) throw new Error('Gemini no devolvió una ficha válida.')
    guardar(join(carpeta, 'analisis', 'estilo.json'), JSON.stringify(ficha, null, 2))
    return ficha
  } finally {
    // El archivo subido se borra: solo sirvió para este análisis (vive 48 h si no).
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${archivo.name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': clave }
    }).catch(() => {})
  }
}
