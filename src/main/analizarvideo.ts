import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolverBinario } from './binarios'
import { guardar } from './disco'
import { buscarPython, rutaScriptPython } from './transcribir'

/**
 * Un video toma por toma con `python/kit/analizar.py` (en local, sin gastar): cortes, movimiento de cámara, encuadre,
 * de dónde sale la imagen, luz y color, texto encima, tempo y si los cortes caen en el golpe. Lo usan «Copiar un
 * estilo» (la referencia), el MCP y el agente. Deja en `salida/` ANALISIS.md, tomas.md, tomas/ y analisis.json, y no
 * repite si el video no cambió.
 */

export interface TomaAnalizada {
  n: number
  inicio: number
  fin: number
  duracion: number
  camara: { tipo: string; detalle: string }
  encuadre: { tipo: string; caras: number; posicion?: string }
  origen: { tipo: string; confianza: string; pruebas: string[] }
  accion: string
  luz: number
  nitidez: number
  color: { hex: string; saturacion: number; temperatura: string } | null
  texto: string[]
  fallos: string[]
  foto: string | null
  volumen?: number | null
  corte_en_golpe?: boolean
}

export interface VideoAnalizado {
  archivo: string
  video: { duracion: number; ancho: number; alto: number; fps: number; audio: boolean }
  resumen: Record<string, unknown>
  ritmo: {
    tempo: number | null
    ritmo_marcado: boolean
    cortes_en_golpe: number
    cortes: number
    por_azar: number
    cortes_con_golpe_fuerte: number
    al_ritmo: boolean
  } | null
  tomas: TomaAnalizada[]
  /** El resumen para leer (ANALISIS.md). */
  md: string
  /** Una línea por toma (tomas.md). */
  tomasMd: string
  /** La carpeta con todo (absoluta). */
  carpeta: string
}

const VERSION = 1

function leer(carpeta: string): VideoAnalizado | null {
  try {
    const datos = JSON.parse(readFileSync(join(carpeta, 'analisis.json'), 'utf8')) as Omit<VideoAnalizado, 'md' | 'tomasMd' | 'carpeta'>
    return {
      ...datos,
      md: readFileSync(join(carpeta, 'ANALISIS.md'), 'utf8'),
      tomasMd: readFileSync(join(carpeta, 'tomas.md'), 'utf8'),
      carpeta
    }
  } catch {
    return null
  }
}

/** Lo que ya está analizado de ese video (mismo tamaño y fecha), o null. */
export function analisisGuardado(ruta: string, salida: string): VideoAnalizado | null {
  try {
    const st = statSync(ruta)
    const f = JSON.parse(readFileSync(join(salida, '.fuente.json'), 'utf8')) as { tamano: number; fecha: number; version: number }
    if (f.tamano !== st.size || f.fecha !== st.mtimeMs || f.version !== VERSION) return null
  } catch {
    return null
  }
  return leer(salida)
}

export async function analizarVideo(
  ruta: string,
  salida: string,
  onProgreso?: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<VideoAnalizado> {
  if (!existsSync(ruta)) throw new Error(`No existe el video: ${ruta}`)
  const hecho = analisisGuardado(ruta, salida)
  if (hecho) return hecho
  const python = await buscarPython()
  if (!python) throw new Error('Hace falta Python para analizar videos (Ajustes → Herramientas de video).')
  const script = rutaScriptPython(join('kit', 'analizar.py'))
  if (!existsSync(script)) throw new Error('Falta python/kit/analizar.py en esta instalación de Recorte.')
  mkdirSync(salida, { recursive: true })
  const args = [...python.args, script, ruta, '--salida', salida, '--progreso']
  const ffmpeg = resolverBinario('ffmpeg')
  const ffprobe = resolverBinario('ffprobe')
  if (ffmpeg) args.push('--ffmpeg', ffmpeg)
  if (ffprobe) args.push('--ffprobe', ffprobe)

  await new Promise<void>((resolver, rechazar) => {
    const hijo = spawn(python.cmd, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } })
    let errores = ''
    let resto = ''
    const parar = () => hijo.kill()
    senal?.addEventListener('abort', parar)
    const tope = setTimeout(() => hijo.kill(), 20 * 60_000)
    hijo.stderr.setEncoding('utf8')
    hijo.stderr.on('data', (t: string) => {
      resto += t
      const lineas = resto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) {
        const m = /^PROGRESO ([\d.]+) (.*)$/.exec(l)
        if (m) onProgreso?.(Number(m[1]), m[2])
        else errores += l + '\n'
      }
    })
    hijo.stdout.resume()
    hijo.on('error', (e) => rechazar(e))
    hijo.on('close', (codigo) => {
      clearTimeout(tope)
      senal?.removeEventListener('abort', parar)
      if (senal?.aborted) return rechazar(new Error('Lo paraste.'))
      if (codigo === 0) return resolver()
      const ultima = errores.trim().split(/\r?\n/).pop() ?? ''
      rechazar(new Error(`No pude analizar el video${ultima ? `: ${ultima.slice(0, 300)}` : ''}.`))
    })
  })
  const datos = leer(salida)
  if (!datos) throw new Error('El análisis no dejó sus archivos.')
  const st = statSync(ruta)
  guardar(join(salida, '.fuente.json'), JSON.stringify({ tamano: st.size, fecha: st.mtimeMs, version: VERSION }))
  return datos
}

/** Los análisis que están en marcha (para no lanzar dos veces el mismo). */
const enCurso = new Map<string, Promise<VideoAnalizado>>()

/**
 * Los videos del proyecto toma por toma, para el chat del editor: el principal y los de la biblioteca (hasta 4),
 * con los tiempos de su FUENTE. Lo que no esté listo en `esperaMs` sigue analizándose de fondo y entra en el
 * turno siguiente. Sin Python o si falla, sale vacío: el chat funciona igual.
 */
export async function tomasDelProyecto(
  proyecto: { source: { path: string; name: string; duration: number }; medios?: { id: string; ruta: string; nombre: string; tipo: string; duracion: number }[] },
  carpeta: string,
  esperaMs = 12_000
): Promise<string> {
  const videos = [
    { id: 'principal', ruta: proyecto.source.path, nombre: proyecto.source.name, duracion: proyecto.source.duration },
    ...(proyecto.medios ?? []).filter((m) => m.tipo === 'video' && m.ruta !== proyecto.source.path)
  ]
    .filter((v) => v.duracion > 0 && v.duracion <= 20 * 60 && existsSync(v.ruta))
    .slice(0, 4)
  const partes = await Promise.all(
    videos.map(async (v) => {
      const salida = join(carpeta, 'analisis', v.id)
      let a = analisisGuardado(v.ruta, salida)
      if (!a) {
        let p = enCurso.get(salida)
        if (!p) {
          p = analizarVideo(v.ruta, salida).finally(() => enCurso.delete(salida))
          p.catch(() => {})
          enCurso.set(salida, p)
        }
        a = await Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), esperaMs))])
      }
      if (!a) return ''
      const resumen = a.md.split('## Para seguir')[0].replace(/^# .*\r?\n/, '').trim()
      const filas = a.tomasMd.split(/\r?\n/).filter((l) => /^\d+ \|/.test(l)).slice(0, 40)
      return `### ${v.id === 'principal' ? 'Video principal' : `Medio ${v.id}`} «${v.nombre}» (tiempos de su FUENTE)\n${resumen}\n` +
        `n | tiempo | cámara | encuadre | origen | luz y color | texto | sonido | fallos | foto\n${filas.join('\n')}`
    })
  )
  return partes.filter(Boolean).join('\n\n')
}
