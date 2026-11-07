import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  duracionEnVoz,
  validarGuion,
  type AdjuntoCreacion,
  type Creacion,
  type GuionCreacion,
  type MensajeCreacion,
  type PeticionCreacion
} from '../shared/creacion'
import { COSTO_CLIP, MAX_CLIPS_VEO, TOPE_CLIP_VEO } from '../shared/creacion'
import { estiloPorId } from '../shared/estilos'
import { INSTRUCCIONES_CRITERIO, leerCriterio } from '../shared/gustos'
import { resolverBinario } from './binarios'
import { ejecutar, extraerHtml } from './crear'
import { guardar } from './disco'
import { esParado, extraerJson, Parado, preguntarAgente, preguntarApi, type ConfigIA } from './ia'
import { crearPortada } from './render'
import { pedirFlow } from './flow'

/**
 * Creaciones: videos desde cero con IA. Cada una es una carpeta
 * `<userData>/creaciones/<id>/` con `creacion.json`, la composición de HyperFrames en
 * `composicion/` (con los adjuntos en `composicion/media/`) y los MP4 en `salidas/`.
 *
 * El trabajo va en dos pasos, como lo haría un editor: primero el guion por escenas
 * (barato, se cambia hablando), después la composición y el render (caro).
 */

export interface ConfigAgente {
  activa: boolean
  proveedor: 'api' | 'cli'
  comandoCli: string
  api?: ConfigIA
}

const EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp']
const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v']
export const EXTENSIONES_ADJUNTOS = [...EXT_IMAGEN, ...EXT_VIDEO].map((e) => e.slice(1))

export class Creaciones {
  readonly raiz: string

  constructor(raiz = join(app.getPath('userData'), 'creaciones')) {
    this.raiz = raiz
    mkdirSync(raiz, { recursive: true })
  }

  carpeta(id: string): string {
    if (!/^[\w-]+$/.test(id)) throw new Error('Creación inválida')
    return join(this.raiz, id)
  }

  get(id: string): Creacion | null {
    try {
      return JSON.parse(readFileSync(join(this.carpeta(id), 'creacion.json'), 'utf8')) as Creacion
    } catch {
      return null
    }
  }

  listar(): Creacion[] {
    const lista: Creacion[] = []
    for (const e of readdirSync(this.raiz, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const c = this.get(e.name)
      if (c) lista.push(c)
    }
    return lista.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  guardar(c: Creacion): Creacion {
    c.updatedAt = Date.now()
    guardar(join(this.carpeta(c.id), 'creacion.json'), JSON.stringify(c, null, 2))
    return c
  }

  /** Crea la carpeta, copia los adjuntos (los videos, a H.264) y guarda la petición. */
  async nueva(p: PeticionCreacion): Promise<Creacion> {
    const id = randomUUID()
    const carpeta = this.carpeta(id)
    const media = join(carpeta, 'composicion', 'media')
    mkdirSync(media, { recursive: true })
    mkdirSync(join(carpeta, 'salidas'), { recursive: true })

    const adjuntos: AdjuntoCreacion[] = []
    for (const [i, ruta] of p.adjuntos.slice(0, 12).entries()) {
      if (!existsSync(ruta)) continue
      const ext = extname(ruta).toLowerCase()
      if (EXT_IMAGEN.includes(ext)) {
        const archivo = `adjunto-${i + 1}${ext === '.jpeg' ? '.jpg' : ext}`
        copyFileSync(ruta, join(media, archivo))
        adjuntos.push({ archivo: `media/${archivo}`, nombre: basename(ruta), tipo: 'imagen' })
      } else if (EXT_VIDEO.includes(ext)) {
        const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
        const archivo = `adjunto-${i + 1}.mp4`
        // Hasta 20 s por clip, en H.264 + AAC: lo que HyperFrames reproduce sin sorpresas.
        const r = await ejecutar(
          [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-t', '20', '-vf', `"scale='min(1080,iw)':-2"`,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart', `"${join(media, archivo)}"`],
          carpeta,
          180_000
        )
        if (r.codigo === 0) adjuntos.push({ archivo: `media/${archivo}`, nombre: basename(ruta), tipo: 'video' })
      }
    }

    const nombre = p.peticion.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Video con IA'
    const ahora = Date.now()
    return this.guardar({
      id,
      nombre,
      peticion: p.peticion.trim().slice(0, 4000),
      estilo: p.estilo,
      formato: p.formato === 'horizontal' ? 'horizontal' : 'vertical',
      duracion: Math.min(180, Math.max(5, Math.round(p.duracion) || 30)),
      adjuntos,
      fase: 'guion',
      mensajes: [],
      version: 0,
      ...(p.tareas && (p.tareas.guion || p.tareas.video) ? { tareas: p.tareas } : {}),
      ...(p.flow && (p.flow.imagenes || p.flow.videos)
        ? {
            flow: {
              imagenes: Boolean(p.flow.imagenes),
              videos: Boolean(p.flow.videos),
              ...(typeof p.flow.modeloImagen === 'string' ? { modeloImagen: p.flow.modeloImagen.slice(0, 60) } : {}),
              ...(typeof p.flow.modeloVideo === 'string' ? { modeloVideo: p.flow.modeloVideo.slice(0, 60) } : {})
            }
          }
        : {}),
      createdAt: ahora,
      updatedAt: ahora
    })
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function dimensiones(c: Creacion): { ancho: number; alto: number } {
  return c.formato === 'horizontal' ? { ancho: 1920, alto: 1080 } : { ancho: 1080, alto: 1920 }
}

/** Lo que el guionista sabe de Google Flow, si el usuario lo eligió. */
function bloqueFlowGuion(c: Creacion): string {
  if (!c.flow?.imagenes && !c.flow?.videos) return ''
  const partes: string[] = ['Puedes pedir material generado con Google Flow para las escenas:']
  if (c.flow.imagenes) {
    partes.push('- "imagen": descripción de una imagen (foto realista, ilustración, producto…) para esa escena. Úsala donde una imagen cuente más que tipografía; no en todas. Describe sujeto, encuadre, luz y estilo, sin texto dentro de la imagen.')
  }
  if (c.flow.videos) {
    partes.push(`- "clip": descripción de un clip de video corto (Veo, 8 s) para una escena clave. Gasta créditos del usuario: como mucho ${MAX_CLIPS_VEO} clips en todo el video, solo donde el movimiento real importe.`)
  }
  return `${partes.join('\n')}\n\n`
}

/** Lo que Flow ya generó, para el diseñador. */
function listaFlow(c: Creacion): string {
  const con = (c.guion?.escenas ?? []).map((e, i) => ({ e, i })).filter(({ e }) => e.medio)
  if (!con.length) return ''
  return `\nMaterial generado con Google Flow para escenas concretas (úsalo en su escena, a pantalla completa o como fondo, con object-fit: cover):\n${con
    .map(({ e, i }) => `- escena ${i + 1}: ${e.medio!.archivo} (${e.medio!.tipo === 'imagen' ? 'imagen' : 'clip de video sin audio que se usa como <video> muted'})`)
    .join('\n')}\n`
}

/**
 * Genera en Flow lo que pide el guion y aún no existe (cada escena guarda lo suyo en
 * `medio`, así rehacer el video no vuelve a gastar). Si algo falla, el video sigue sin eso.
 */
export async function generarMedioFlow(
  c: Creacion,
  carpeta: string,
  onProgreso: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<string[]> {
  if (!c.guion || (!c.flow?.imagenes && !c.flow?.videos)) return []
  const formato = c.formato === 'horizontal' ? '16:9' : '9:16'
  const destino = join(carpeta, 'composicion', 'media')
  const pendientes = c.guion.escenas
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.medio && ((c.flow!.videos && e.clip) || (c.flow!.imagenes && e.imagen)))
  let clips = c.guion.escenas.filter((e) => e.medio?.tipo === 'video').length
  const fallos: string[] = []
  let hechas = 0
  await Promise.all(
    pendientes.map(async ({ e, i }) => {
      const esClip = Boolean(c.flow!.videos && e.clip && clips < MAX_CLIPS_VEO)
      if (esClip) clips += 1
      const prompt = esClip ? e.clip! : e.imagen
      if (!prompt) return
      try {
        const modelo = esClip ? c.flow!.modeloVideo : c.flow!.modeloImagen
        // El tope de cada clip es lo que cuesta su modelo (nunca menos que el tope de siempre).
        const tope = esClip ? Math.max(TOPE_CLIP_VEO, COSTO_CLIP[modelo ?? ''] ?? 0) : undefined
        const r = await pedirFlow(
          { tipo: esClip ? 'video' : 'imagen', prompt, formato, ...(modelo ? { modelo } : {}), ...(tope ? { tope } : {}) },
          destino,
          senal
        )
        const nombre = `flow-escena-${i + 1}${extname(r.archivo)}`
        renameSync(r.archivo, join(destino, nombre))
        e.medio = { archivo: `media/${nombre}`, tipo: esClip ? 'video' : 'imagen' }
      } catch (x) {
        if (esParado(x)) return
        fallos.push(`escena ${i + 1}: ${x instanceof Error ? x.message : String(x)}`)
      } finally {
        hechas += 1
        onProgreso(0.05 + (hechas / pendientes.length) * 0.2, `Generando en Google Flow (${hechas}/${pendientes.length})`)
      }
    })
  )
  if (senal?.aborted) throw new Parado()
  return fallos
}

function listaAdjuntos(c: Creacion): string {
  if (!c.adjuntos.length) return 'Sin material del usuario: todo es tipografía, formas y color.'
  return `Material del usuario (úsalo, es lo que hace único el video):\n${c.adjuntos
    .map((a) => `- ${a.archivo} (${a.tipo === 'imagen' ? 'foto' : 'clip de video con su audio'}, «${a.nombre}»)`)
    .join('\n')}`
}

function conversacion(mensajes: MensajeCreacion[]): string {
  return mensajes
    .slice(-10)
    .map((m) => `${m.rol === 'usuario' ? 'Usuario' : 'Tú'}: ${m.texto}`)
    .join('\n')
}

function guionTexto(g: GuionCreacion): string {
  return g.escenas
    .map((e, i) => `${i + 1}. (${e.duracion} s) Pantalla: «${e.texto}»${e.narracion ? ` · Voz: «${e.narracion}»` : ''} · Visual: ${e.visual}`)
    .join('\n')
}

/** Los tiempos que manda la voz: escena por escena, de la narración ya grabada. */
function guionConVoz(c: Creacion): string {
  if (!c.guion || !c.voz) return ''
  const v = c.voz
  return c.guion.escenas
    .map((e, i) => `${i + 1}. empieza en ${v.inicios[i]?.toFixed(2) ?? '?'} s, dura ${duracionEnVoz(v, i).toFixed(2)} s · Pantalla: «${e.texto}» · Se oye: «${e.narracion ?? e.texto}» · Visual: ${e.visual}`)
    .join('\n')
}

function promptGuion(c: Creacion, pedido?: string, gustos = ''): string {
  const estilo = estiloPorId(c.estilo)
  return `Eres el guionista y director de un video corto. Diseñas el guion por escenas antes de que se produzca.

Petición original del usuario:
"""
${c.peticion}
"""

Tipo de video: ${estilo.nombre}. Dirección editorial:
${estilo.guia}

Formato: ${c.formato === 'vertical' ? 'vertical 9:16 (TikTok, Reels, Shorts)' : 'horizontal 16:9 (YouTube)'}. Duración objetivo: unos ${c.duracion} segundos.
${listaAdjuntos(c)}
${c.guion ? `\nGuion actual:\n${guionTexto(c.guion)}\n` : ''}${c.mensajes.length ? `\nConversación:\n${conversacion(c.mensajes)}\n` : ''}${pedido ? `\nCAMBIO QUE PIDE AHORA EL USUARIO: ${pedido}\n` : ''}
${gustos ? `\n${gustos}\n` : ''}${bloqueFlowGuion(c)}Reglas: el primer segundo engancha; una idea por escena; "texto" es lo que se lee en pantalla y es corto (máximo ~12 palabras); "narracion" es lo que dice la voz en esa escena, natural y hablado (unas 2,5 palabras por segundo de la escena), y no repite el texto palabra por palabra; la suma de duraciones se acerca a la duración objetivo; en "visual" di qué se ve, y si usas material del usuario nombra su archivo (media/…).
${INSTRUCCIONES_CRITERIO}
Responde SOLO con JSON:
{"mensaje": "una o dos frases para el usuario sobre lo que hiciste", "propuestas": ["…"], "aprendido": [], "guion": {"titulo": "…", "escenas": [{"texto": "…", "narracion": "…", "visual": "…", ${c.flow?.imagenes ? '"imagen": "…", ' : ''}${c.flow?.videos ? '"clip": "…", ' : ''}"duracion": 3}]}}`
}

function promptComposicion(c: Creacion, htmlPrevio: string | null, pedido?: string, gustos = ''): string {
  const { ancho, alto } = dimensiones(c)
  const estilo = estiloPorId(c.estilo)
  const reglas = `Reglas inviolables de HyperFrames:
- Raíz: <div id="root" data-composition-id="main" data-start="0" data-width="${ancho}" data-height="${alto}" data-duration="SEGUNDOS"> con width/height: 100% en CSS, NUNCA píxeles fijos en la raíz.
- <meta name="viewport" content="width=${ancho}, height=${alto}" />
- Cada escena: <section class="clip" data-start="…" data-duration="…">, position absolute inset 0.
- Carga GSAP: <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
- Una sola timeline pausada: const tl = gsap.timeline({ paused: true }); … window.__timelines["main"] = tl;
- Anima con fromTo (nunca CSS transform + tween a la vez); no animes visibility/autoAlpha en elementos .clip; sin Math.random ni relojes; sin <br>.
- Fotos del usuario: <img src="media/…"> dentro de su escena, object-fit: cover; puedes moverlas despacio (Ken Burns) con fromTo de scale.
- Clips de video del usuario: cada <video> es su propia escena a nivel raíz: <video class="clip" src="media/…" playsinline data-has-audio="true" data-start="X" data-duration="D" data-track-index="0"></video>. Nunca envuelvas un <video> en un elemento con data-start; nunca llames play/pause/seek.
- Texto en español, grande y legible (mínimo ${c.formato === 'vertical' ? 56 : 48} px).`

  const voz = c.voz
    ? `
La narración ya está grabada y Recorte la mezcla después del render: NO pongas <audio> ni sonido en la composición.
Los tiempos los manda la voz; respeta estos inicios y duraciones por escena:
${guionConVoz(c)}
La composición dura exactamente ${(c.voz.duracion + 0.4).toFixed(2)} s (data-duration de la raíz).`
    : ''

  if (htmlPrevio && pedido) {
    return `Eres un editor de video que diseña con código (HyperFrames). Este es el video actual, como HTML:

${htmlPrevio}

El usuario pide este cambio: ${pedido}
${c.mensajes.length ? `\nConversación previa:\n${conversacion(c.mensajes)}\n` : ''}
Aplica el cambio y conserva todo lo demás.${voz}${gustos ? `\n${gustos}\n` : ''} ${reglas}

Responde SOLO con el HTML completo, de <!doctype html> a </html>.`
  }

  return `Eres un editor de video profesional que diseña con código. Tu herramienta es HyperFrames: HTML declarativo que se renderiza a video.

Produce este guion aprobado por el usuario, escena por escena, respetando textos y duraciones:
Título: ${c.guion?.titulo ?? c.nombre}
${c.guion ? guionTexto(c.guion) : c.peticion}

Petición original: ${c.peticion}
Tipo de video: ${estilo.nombre}. ${estilo.guia}
${listaAdjuntos(c)}${listaFlow(c)}
${voz}${gustos ? `\n${gustos}` : ''}
Dirección: el primer segundo es lo más fuerte; cada escena tiene su propia composición (no repitas el mismo layout); color con intención y contraste; tipografía con jerarquía; movimientos con easing, sin relleno.
${reglas}

Responde SOLO con el HTML completo, de <!doctype html> a </html>.`
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

async function preguntar(prompt: string, sistema: string, config: ConfigAgente, senal?: AbortSignal): Promise<string> {
  if (!config.activa) throw new Error('Conecta un agente en Inicio para crear videos con IA.')
  return config.proveedor === 'cli'
    ? preguntarAgente(prompt, config.comandoCli, 10 * 60_000, senal)
    : preguntarApi(sistema, prompt, config.api!, senal)
}

/** Propone o cambia el guion. Devuelve el guion nuevo y el mensaje del agente. */
export async function pasoGuion(
  c: Creacion,
  config: ConfigAgente,
  pedido?: string,
  senal?: AbortSignal,
  gustos = ''
): Promise<{ guion: GuionCreacion; mensaje: string; propuestas: string[]; aprendido: string[] }> {
  const texto = await preguntar(promptGuion(c, pedido, gustos), 'Eres guionista de video y respondes solo con JSON.', config, senal)
  const datos = extraerJson(texto) as { mensaje?: unknown; guion?: unknown }
  const guion = validarGuion(datos.guion ?? datos)
  if (!guion) throw new Error('El agente no devolvió un guion válido.')
  const mensaje = typeof datos.mensaje === 'string' && datos.mensaje.trim() ? datos.mensaje.trim() : `Guion listo: ${guion.escenas.length} escenas.`
  return { guion, mensaje, ...leerCriterio(datos) }
}

/**
 * Compone (o cambia) el video y lo renderiza. Con `pedido` y una composición previa,
 * el agente edita esa composición en vez de empezar de cero.
 */
export async function pasoVideo(
  c: Creacion,
  carpeta: string,
  config: ConfigAgente,
  onProgreso: (pct: number, texto: string) => void,
  pedido?: string,
  senal?: AbortSignal,
  gustos = ''
): Promise<{ salida: string; portada?: string; mensaje: string }> {
  const hf = resolverBinario('hyperframes')
  if (!hf) throw new Error('Falta HyperFrames para renderizar. Instálalo con: npm i -g hyperframes')

  const composicion = join(carpeta, 'composicion')
  const archivoHtml = join(composicion, 'index.html')
  const previo = pedido && existsSync(archivoHtml) ? readFileSync(archivoHtml, 'utf8') : null

  // Primero lo que el guion pide a Google Flow (solo al componer de nuevo, no en un cambio).
  const fallosFlow = previo ? [] : await generarMedioFlow(c, carpeta, onProgreso, senal)
  onProgreso(0.25, previo ? 'El agente está aplicando tu cambio' : 'El agente está diseñando las escenas')
  const respuesta = await preguntar(
    promptComposicion(c, previo, pedido, gustos),
    'Eres un editor de video que diseña con código y responde solo con HTML.',
    config,
    senal
  )
  const html = extraerHtml(respuesta)
  guardar(archivoHtml, html)

  const version = c.version + 1
  const nombre = `video-v${version}.mp4`
  const salidaAbs = join(carpeta, 'salidas', nombre)
  onProgreso(0.45, 'Renderizando el video')
  const r = await ejecutar([`"${hf}"`, 'render', `"${composicion}"`, '-o', `"${salidaAbs}"`, '--fps', '30'], carpeta, 15 * 60_000, senal)
  if (senal?.aborted) throw new Parado()
  if (r.codigo !== 0 || !existsSync(salidaAbs)) {
    throw new Error(`HyperFrames no pudo renderizar: ${r.salida.trim().slice(-400)}`)
  }
  if (c.voz) {
    // La voz entra al final: el video manda en la duración y la voz se rellena con silencio.
    onProgreso(0.9, 'Mezclando la voz')
    const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
    const conVoz = join(carpeta, 'salidas', `video-v${version}-voz.mp4`)
    const m = await ejecutar(
      [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${salidaAbs}"`, '-i', `"${join(composicion, c.voz.archivo)}"`,
        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-shortest',
        '-movflags', '+faststart', `"${conVoz}"`],
      carpeta,
      180_000
    )
    if (m.codigo !== 0 || !existsSync(conVoz)) throw new Error(`No pude mezclar la voz: ${m.salida.trim().slice(-200)}`)
    renameSync(conVoz, salidaAbs)
  }
  onProgreso(0.95, 'Preparando la portada')
  const portadaAbs = await crearPortada(salidaAbs, c.duracion)
  return {
    salida: `salidas/${nombre}`,
    portada: portadaAbs ? `salidas/${basename(portadaAbs)}` : undefined,
    mensaje:
      (previo ? `Hecho: versión ${version} con tu cambio.` : `Tu video está listo (versión ${version}).`) +
      (fallosFlow.length ? ` Google Flow no pudo con: ${fallosFlow.join('; ')}.` : '')
  }
}
