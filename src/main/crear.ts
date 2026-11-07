import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Project } from '../shared/types'
import { pathAmpliado, resolverBinario } from './binarios'
import { estiloPorId } from '../shared/estilos'
import { matarArbol, preguntarAgente, preguntarApi, type ConfigIA } from './ia'
import type { ResultadoRender } from './render'

/**
 * Creación de video desde cero (fase 2, motor puente): el agente escribe una
 * composición HyperFrames (HTML declarativo con timing) y `hyperframes render`
 * la convierte en MP4 vertical. Cuando el motor propio esté listo, este módulo
 * solo cambia de ejecutor: el contrato con el agente se mantiene.
 */

export interface ResultadoCreacion extends ResultadoRender {
  fuente?: 'ia' | 'local'
  aviso?: string
}

function nombreSeguro(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'video'
  )
}

/** Saca el documento HTML completo de la respuesta del agente. */
export function extraerHtml(texto: string): string {
  const limpio = texto.replace(/^```(?:html)?\s*/im, '').replace(/```\s*$/m, '')
  const inicio = limpio.search(/<!doctype|<html/i)
  const fin = limpio.lastIndexOf('</html>')
  if (inicio === -1 || fin === -1) throw new Error('El agente no devolvió un documento HTML completo.')
  return limpio.slice(inicio, fin + '</html>'.length)
}

const PROMPT_CREADOR = `Eres un editor de video profesional que diseña con código. Tu herramienta es HyperFrames: HTML declarativo que se renderiza a video.

Cómo trabaja un editor profesional:
- El primer segundo decide si siguen viendo: abre con lo más fuerte, nunca con presentaciones.
- Cada video es único: la estructura sale del tema y de la petición, no de una plantilla. Dos videos tuyos no deben parecer gemelos.
- La marca del usuario manda: su nombre, su color, su tono.
- Sin relleno: el video dura lo que pide lo que hay que contar, ni un segundo más.
- El texto en pantalla refuerza; no narra todo lo que ya se ve o se oye.

Petición del usuario:
"""
__PETICION__
"""

Tipo de video — dirección editorial:
__ESTILO__

Marca: nombre "__MARCA__", color principal __COLOR__.
__MEDIOS__
Escribe UNA composición standalone completa (un solo archivo index.html), vertical 1080×1920. Reglas inviolables:
- Raíz: <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="SEGUNDOS"> con width/height: 100% en CSS, NUNCA píxeles fijos.
- Cada escena: <section class="clip" data-start="…" data-duration="…">, position absolute inset 0.
- Carga GSAP: <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
- Una sola timeline pausada registrada: const tl = gsap.timeline({ paused: true }); … window.__timelines["main"] = tl;
- Anima con fromTo (nunca CSS transform + tween a la vez); no animes visibility/autoAlpha en elementos .clip; sin Math.random ni relojes; sin <br>.
- Texto en español, grande y legible (mínimo 48 px), con el color de marca de acento.

Responde SOLO con el HTML completo, empezando por <!doctype html> y terminando en </html>.`

/** Plantilla de respaldo: tarjeta de marca con el texto de la petición. */
function plantillaLocal(peticion: string, proyecto: Project): string {
  const titulo = peticion.replace(/[<>&"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || proyecto.name
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <title>${titulo}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: #0b0c0a; color: #fff; font-family: Inter, system-ui, sans-serif; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      .clip { position: absolute; inset: 0; display: grid; place-items: center; }
      h1 { margin: 0; font-size: 84px; line-height: 1.1; text-align: center; padding: 0 90px; }
      .marca { position: absolute; top: 64px; left: 0; right: 0; text-align: center; font-size: 30px; letter-spacing: 6px; color: ${proyecto.brand.primary}; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="5">
      <section class="clip" data-start="0" data-duration="5">
        <span class="marca">${proyecto.brand.name.toLocaleUpperCase('es')}</span>
        <h1 id="titulo" style="color: #fff">${titulo}</h1>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#titulo", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, 0.2);
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>`
}

interface Fragmento {
  archivo: string
  duracion: number
}

/**
 * Corta hasta 3 fragmentos de 5 s del material fuente, repartidos a lo largo
 * del video, y los deja como H.264 + AAC dentro de la composición. Así el
 * agente puede incrustar el material real del usuario en las escenas.
 */
async function extraerFragmentos(proyecto: Project, carpetaCreacion: string): Promise<Fragmento[]> {
  const ffmpeg = resolverBinario('ffmpeg')
  if (!ffmpeg || !existsSync(proyecto.source.path)) return []

  const duracionFuente = proyecto.source.duration
  if (duracionFuente < 8) return []

  const total = duracionFuente >= 60 ? 3 : duracionFuente >= 25 ? 2 : 1
  const duracion = Math.min(5, duracionFuente / (total + 1) - 1)
  if (duracion < 2) return []

  const carpetaMedia = join(carpetaCreacion, 'media')
  mkdirSync(carpetaMedia, { recursive: true })

  const fragmentos: Fragmento[] = []
  for (let i = 0; i < total; i += 1) {
    const inicio = Math.max(
      0,
      Math.min(duracionFuente - duracion, (duracionFuente * (i + 1)) / (total + 1) - duracion / 2)
    )
    const salida = join(carpetaMedia, `frag-${i + 1}.mp4`)
    const resultado = await ejecutar(
      [
        `"${ffmpeg}"`, '-y', '-v', 'error',
        '-ss', inicio.toFixed(2), '-t', duracion.toFixed(2),
        '-i', `"${proyecto.source.path}"`,
        '-vf', "scale='min(1080,iw)':-2",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-c:a', 'aac', '-movflags', '+faststart',
        `"${salida}"`
      ],
      carpetaCreacion,
      120_000
    )
    if (resultado.codigo === 0 && existsSync(salida)) {
      fragmentos.push({ archivo: `media/frag-${i + 1}.mp4`, duracion })
    }
  }
  return fragmentos
}

/** Bloque del prompt que enseña al agente a incrustar los fragmentos. */
function bloqueMedios(fragmentos: Fragmento[]): string {
  if (fragmentos.length === 0) {
    return '\nDuración: de 5 a 12 segundos, solo con texto y formas CSS (sin imágenes ni videos).\n'
  }
  const lista = fragmentos.map((f) => `- ${f.archivo} (${f.duracion.toFixed(1)} s, con la voz del usuario)`).join('\n')
  const total = fragmentos.reduce((suma, f) => suma + f.duracion, 0)
  return `
Tienes estos fragmentos reales del video del usuario, ya dentro de la carpeta de la composición:
${lista}

Reglas para incrustarlos (HyperFrames es estricto aquí):
- Cada <video> es su propia escena a nivel raíz: <video id="frag1" class="clip" src="${fragmentos[0].archivo}" playsinline data-has-audio="true" data-start="X" data-duration="${fragmentos[0].duracion.toFixed(1)}" data-track-index="0"></video>
- NUNCA pongas data-start en un elemento que envuelva a un <video> (nada de <section data-start> alrededor). El timing va SOLO en el <video>.
- No llames play(), pause() ni seek desde tu código: HyperFrames controla la reproducción.
- Puedes vestir los fragmentos con texto y formas ENCIMA (elementos posicionados absolute en escenas posteriores o hermanas), títulos que entran y salen, marcos con el color de marca.
- Estructura sugerida: intro de texto (1-2 s) → fragmentos en secuencia → cierre con marca (1-2 s). Duración total ≈ ${(total + 3).toFixed(0)} segundos.
`
}

export function ejecutar(
  args: string[],
  cwd: string,
  timeoutMs: number,
  senal?: AbortSignal
): Promise<{ codigo: number; salida: string }> {
  return new Promise((resolver) => {
    if (senal?.aborted) return resolver({ codigo: -1, salida: 'Lo paraste.' })
    const hijo = spawn(args.join(' '), {
      cwd,
      windowsHide: true,
      shell: true,
      env: { ...process.env, PATH: pathAmpliado() }
    })
    let salida = ''
    const temporizador = setTimeout(() => {
      hijo.kill()
      resolver({ codigo: -1, salida: `${salida}\nTiempo agotado.` })
    }, timeoutMs)
    hijo.stdout.on('data', (b: Buffer) => (salida += b.toString('utf8')))
    hijo.stderr.on('data', (b: Buffer) => (salida += b.toString('utf8')))
    hijo.on('error', (e) => {
      clearTimeout(temporizador)
      resolver({ codigo: -1, salida: e.message })
    })
    const alParar = () => matarArbol(hijo)
    senal?.addEventListener('abort', alParar, { once: true })
    hijo.on('close', (codigo) => {
      clearTimeout(temporizador)
      senal?.removeEventListener('abort', alParar)
      resolver({ codigo: codigo ?? -1, salida })
    })
  })
}

/**
 * Flujo completo: petición → agente escribe la composición (o plantilla local)
 * → hyperframes render → MP4 en salidas/.
 */
export async function crearVideo(
  proyecto: Project,
  peticion: string,
  config: { activa: boolean; proveedor: 'api' | 'cli'; comandoCli: string; api?: ConfigIA },
  carpeta: string,
  onProgreso: (pct: number, texto?: string) => void,
  opciones: { incluirMaterial?: boolean; estilo?: string } = {}
): Promise<ResultadoCreacion> {
  const hf = resolverBinario('hyperframes')
  if (!hf) {
    return {
      ok: false,
      error: 'Falta HyperFrames. Instálalo con: npm i -g hyperframes'
    }
  }

  const base = nombreSeguro(peticion)
  const carpetaCreacion = join(carpeta, 'creaciones', base)
  const salidas = join(carpeta, 'salidas')
  mkdirSync(carpetaCreacion, { recursive: true })
  mkdirSync(salidas, { recursive: true })

  let fragmentos: Fragmento[] = []
  let aviso: string | undefined
  if (opciones.incluirMaterial) {
    onProgreso(0.03, 'Cortando fragmentos de tu video')
    fragmentos = await extraerFragmentos(proyecto, carpetaCreacion)
    if (fragmentos.length === 0) {
      aviso = 'No pude extraer fragmentos del material (¿sigue el archivo en su ruta?). Creé solo con texto y formas.'
    }
  }

  let html: string
  let fuente: 'ia' | 'local' = 'local'

  if (config.activa) {
    onProgreso(0.05, 'El agente está diseñando el video')
    const prompt = PROMPT_CREADOR.replace('__PETICION__', peticion)
      .replace('__MARCA__', proyecto.brand.name)
      .replace('__COLOR__', proyecto.brand.primary)
      .replace('__ESTILO__', estiloPorId(opciones.estilo).guia)
      .replace('__MEDIOS__', bloqueMedios(fragmentos))
    try {
      const respuesta =
        config.proveedor === 'cli'
          ? await preguntarAgente(prompt, config.comandoCli, 600_000)
          : await preguntarApi(
              'Eres un editor de video profesional que diseña con código y responde solo con HTML.',
              prompt,
              config.api!
            )
      html = extraerHtml(respuesta)
      fuente = 'ia'
    } catch (error) {
      const fallo = `El agente no pudo diseñar (${error instanceof Error ? error.message : String(error)}). Usé la plantilla de marca.`
      aviso = aviso ? `${aviso} ${fallo}` : fallo
      html = plantillaLocal(peticion, proyecto)
    }
  } else {
    html = plantillaLocal(peticion, proyecto)
  }

  writeFileSync(join(carpetaCreacion, 'index.html'), html, 'utf8')

  const salida = join(salidas, `creado-${base}.mp4`)
  onProgreso(0.15, 'Renderizando con HyperFrames')

  const resultado = await ejecutar(
    [`"${hf}"`, 'render', `"${carpetaCreacion}"`, '-o', `"${salida}"`, '--fps', '30'],
    carpeta,
    10 * 60_000
  )
  if (resultado.codigo !== 0) {
    return {
      ok: false,
      error: `HyperFrames no pudo renderizar: ${resultado.salida.trim().slice(-400)}`,
      fuente,
      aviso
    }
  }

  onProgreso(1, 'Video creado')
  return { ok: true, output: salida, fuente, aviso }
}
