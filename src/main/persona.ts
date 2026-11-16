import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { duracionesDeMedios, normalizarTimeline, tramos, type Timeline } from '../shared/timeline'
import type { Project } from '../shared/types'
import { pathAmpliado } from './binarios'
import { exportarTimeline } from './exportar'
import { rutaFfmpeg } from './ffmpeg'
import { buscarPython, rutaScriptPython } from './transcribir'

/**
 * Separa del fondo a la persona de un clip de la timeline. El clip se renderiza solo y TAL COMO SE VE (su recorte, su
 * zoom, su cámara, su color y su velocidad) y el kit le quita el fondo cuadro a cuadro: sale un WebM con transparencia
 * que, puesto encima del mismo clip y a pantalla completa, calza exacto. Lo que quede entre los dos se ve detrás de ella.
 * El resultado se guarda por lo que es el clip: si no cambió, no se vuelve a hacer.
 */
export async function recortarPersonaDeClip(
  proyecto: Project,
  carpetaProyecto: string,
  tl: Timeline,
  clipId: string,
  onProgreso: (pct: number, texto?: string) => void = () => {},
  senal?: AbortSignal
): Promise<{ archivo: string; inicio: number; duracion: number }> {
  return trabajarClip(proyecto, carpetaProyecto, tl, clipId, { tipo: 'persona' }, onProgreso, senal)
}

/** La caja de un objeto en fracciones del cuadro (x, y = el centro). */
export interface ZonaObjeto {
  x: number
  y: number
  ancho: number
  alto: number
  /** Si se mueve: su caja en cada momento del clip, [segundo, x, y, ancho, alto]. */
  recorrido?: number[][]
}

/**
 * Borra un objeto (un logo, una marca de agua, un cartel que se coló) de un clip, tal como se ve: lo rellena con lo que
 * lo rodea. Si el objeto se mueve, `hasta` es la caja donde termina el clip. Sale un MP4 que va encima del mismo clip.
 */
export async function borrarObjetoDeClip(
  proyecto: Project,
  carpetaProyecto: string,
  tl: Timeline,
  clipId: string,
  zona: ZonaObjeto,
  hasta?: ZonaObjeto,
  onProgreso: (pct: number, texto?: string) => void = () => {},
  senal?: AbortSignal
): Promise<{ archivo: string; inicio: number; duracion: number }> {
  return trabajarClip(proyecto, carpetaProyecto, tl, clipId, { tipo: 'borrar', zona, hasta }, onProgreso, senal)
}

/**
 * Cambia el cielo de un clip, tal como se ve: una imagen o «azul», «atardecer», «nublado», «noche», «amanecer». Sale un MP4
 * que va encima del mismo clip.
 */
export async function cambiarCieloDeClip(
  proyecto: Project,
  carpetaProyecto: string,
  tl: Timeline,
  clipId: string,
  cielo: string,
  onProgreso: (pct: number, texto?: string) => void = () => {},
  senal?: AbortSignal
): Promise<{ archivo: string; inicio: number; duracion: number }> {
  return trabajarClip(proyecto, carpetaProyecto, tl, clipId, { tipo: 'cielo', cielo }, onProgreso, senal)
}

/**
 * Recorta un objeto de un clip (rotoscopia por clic), tal como se ve: `zona` es su caja al empezar el clip (SAM 2 saca su
 * máscara de ahí y lo sigue cuadro a cuadro). Sale un WebM con transparencia que va encima del mismo clip.
 */
export async function recortarObjetoDeClip(
  proyecto: Project,
  carpetaProyecto: string,
  tl: Timeline,
  clipId: string,
  zona: ZonaObjeto,
  onProgreso: (pct: number, texto?: string) => void = () => {},
  senal?: AbortSignal
): Promise<{ archivo: string; inicio: number; duracion: number }> {
  return trabajarClip(proyecto, carpetaProyecto, tl, clipId, { tipo: 'roto', zona }, onProgreso, senal)
}

type Trabajo = { tipo: 'persona' } | { tipo: 'roto'; zona: ZonaObjeto } | { tipo: 'borrar'; zona: ZonaObjeto; hasta?: ZonaObjeto } | { tipo: 'cielo'; cielo: string }

async function trabajarClip(
  proyecto: Project,
  carpetaProyecto: string,
  tl: Timeline,
  clipId: string,
  trabajo: Trabajo,
  onProgreso: (pct: number, texto?: string) => void,
  senal?: AbortSignal
): Promise<{ archivo: string; inicio: number; duracion: number }> {
  const borrar = trabajo.tipo === 'borrar'
  const cambiaCielo = trabajo.tipo === 'cielo'
  const roto = trabajo.tipo === 'roto'
  const queHace = roto ? 'Recortando el objeto' : borrar ? 'Borrando el objeto' : cambiaCielo ? 'Cambiando el cielo' : 'Separando a la persona del fondo'
  // Un cielo que es una imagen: si la imagen cambia, el resultado también.
  const sello = trabajo.tipo === 'cielo' && existsSync(trabajo.cielo) ? statSync(trabajo.cielo).mtimeMs : 0
  const caja = (z: ZonaObjeto) => [z.x, z.y, z.ancho, z.alto].map((n) => Math.round(Math.min(Math.max(n, 0), 1) * 10000) / 10000).join(',')
  const tramo = tramos(tl).find((t) => t.clip.id === clipId)
  if (!tramo) throw new Error('Ese clip ya no está en la timeline.')
  const py = await buscarPython()
  const kit = rutaScriptPython(join('kit', 'kit.py'))
  if (!py || !existsSync(kit)) throw new Error('Hace falta Python para recortar a la persona (Ajustes › Sistema).')
  // El clip solo, sin la transición con el anterior (la capa cubre su tramo entero).
  const { fundido: _f, transicion: _t, ...solo } = tramo.clip
  const dentro = normalizarTimeline({ version: 1, clips: [solo], textos: [] }, proyecto.source.duration, duracionesDeMedios(proyecto.medios))
  if (!dentro.clips.length) throw new Error('Ese clip ya no tiene material.')
  const { id: _id, ...sinId } = dentro.clips[0]
  const huella = createHash('sha1')
    .update(JSON.stringify({ clip: sinId, fuente: proyecto.source.path, ancho: proyecto.source.width, alto: proyecto.source.height, v: 1, ...(trabajo.tipo === 'borrar' ? { zona: trabajo.zona, hasta: trabajo.hasta, metodo: 'sam2' } : {}), ...(trabajo.tipo === 'cielo' ? { cielo: trabajo.cielo, sello } : {}), ...(trabajo.tipo === 'roto' ? { roto: trabajo.zona } : {}) }))
    .digest('hex')
    .slice(0, 12)
  const media = join(carpetaProyecto, 'media')
  mkdirSync(media, { recursive: true })
  const archivo = join(media, roto ? `objeto-${huella}.webm` : borrar ? `sin-objeto-${huella}.mp4` : cambiaCielo ? `cielo-${huella}.mp4` : `persona-${huella}.webm`)
  const lugar = { archivo, inicio: tramo.inicio, duracion: tramo.fin - tramo.inicio }
  if (existsSync(archivo)) return lugar

  const tmp = mkdtempSync(join(tmpdir(), 'recorte-persona-'))
  try {
    onProgreso(0.02, 'Preparando el clip')
    const r = await exportarTimeline(proyecto, dentro, carpetaProyecto, { formato: 'original', subtitulos: false, calidad: 'alta' }, (pct) => onProgreso(0.02 + pct * 0.18, 'Preparando el clip'), tmp)
    if (!r.ok || !r.output || !existsSync(r.output)) throw new Error(r.error ?? 'No pude preparar el clip.')
    onProgreso(0.2, queHace)
    const extension = (borrar || cambiaCielo) && !roto ? 'mp4' : 'webm'
    const temporal = join(tmp, `resultado.${extension}`)
    const rutaJson = join(tmp, 'recorrido.json')
    if (trabajo.tipo === 'borrar' && trabajo.zona.recorrido?.length) writeFileSync(rutaJson, JSON.stringify(trabajo.zona.recorrido), 'utf8')
    const cita = (x: string) => (/[\s"&()^]/.test(x) ? `"${x}"` : x)
    /** Corre el kit sobre el clip preparado (entero o un tramo: desde y hasta, en segundos) y deja el resultado en `destino`. */
    const correrKit = (destino: string, tramoClip?: { desde: number; hasta: number; cajaArchivo?: string }, alPct: (f: number) => void = () => {}) =>
      new Promise<void>((resolver, rechazar) => {
      const rango = tramoClip ? ['--desde', tramoClip.desde.toFixed(3), '--hasta', tramoClip.hasta.toFixed(3), '--tolerante'] : []
      const orden = [[py.cmd, ...py.args].map(cita).join(' '), cita(kit), ...(trabajo.tipo === 'borrar' ? ['borrar-objeto', cita(r.output!), '--zona', caja(trabajo.zona), ...(trabajo.zona.recorrido?.length ? ['--recorrido', cita(rutaJson)] : []), ...(trabajo.hasta ? ['--hasta-zona', caja(trabajo.hasta)] : []), ...(tramoClip?.cajaArchivo ? ['--caja-archivo', cita(tramoClip.cajaArchivo)] : []), ...rango.filter((x) => x !== '--tolerante'), '--salida', cita(destino)] : trabajo.tipo === 'roto' ? ['rotoscopia', cita(r.output!), '--caja', caja(trabajo.zona), ...(tramoClip?.cajaArchivo ? ['--caja-archivo', cita(tramoClip.cajaArchivo)] : []), ...rango, '--salida', cita(destino)] : trabajo.tipo === 'cielo' ? ['cambiar-cielo', cita(r.output!), '--cielo', cita(trabajo.cielo), ...rango, '--salida', cita(destino)] : ['recortar-persona', cita(r.output!), ...rango, '--salida', cita(destino)])].join(' ')
      const hijo = spawn(orden, { cwd: tmp, shell: true, windowsHide: true, env: { ...process.env, PATH: pathAmpliado(), PYTHONIOENCODING: 'utf-8' } })
      let dicho = ''
      const alParar = () => {
        if (process.platform === 'win32' && hijo.pid) spawn('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { windowsHide: true })
        else hijo.kill()
        rechazar(new Error('Lo paraste.'))
      }
      senal?.addEventListener('abort', alParar, { once: true })
      // La primera vez baja el modelo (178 MB): sin tope corto. Cada tramo (30 s) tiene su tope; el trabajo entero no.
      const reloj = setTimeout(alParar, 45 * 60_000)
      const leer = (b: Buffer) => {
        const t = b.toString('utf8')
        dicho = (dicho + t).slice(-3000)
        const m = [...t.matchAll(/PROGRESO ([\d.]+)/g)].pop()
        if (m) alPct(Number(m[1]))
        else if (/Bajando el modelo/.test(t)) onProgreso(0.2, 'Bajando el modelo para recortar (178 MB, una sola vez)')
      }
      hijo.stdout.on('data', leer)
      hijo.stderr.on('data', leer)
      hijo.on('error', (e) => rechazar(e))
      hijo.on('close', (codigo) => {
        clearTimeout(reloj)
        senal?.removeEventListener('abort', alParar)
        if (codigo === 0 && existsSync(destino)) return resolver()
        const motivo = dicho.trim().split(/\r?\n/).filter((l) => l.trim() && !/^PROGRESO/.test(l)).pop() ?? ''
        rechazar(new Error(motivo && motivo.length < 300 ? motivo : roto ? 'No pude recortar el objeto.' : borrar ? 'No pude borrar el objeto.' : cambiaCielo ? 'No pude cambiar el cielo.' : 'No pude separar a la persona del fondo.'))
      })
    })
    // Un clip corto va de una vez. Uno largo se hace por tramos que se guardan: si se corta (o lo paras), al volver a
    // pedirlo sigue desde el último tramo y no desde cero.
    const trozo = Number(process.env.RECORTE_TROZO) > 0 ? Number(process.env.RECORTE_TROZO) : 30
    const largo = lugar.duracion
    if (largo <= trozo * 1.5) {
      await correrKit(temporal, undefined, (f) => onProgreso(0.2 + f * 0.78, queHace))
    } else {
      const n = Math.ceil(largo / trozo)
      const parciales = join(media, `parciales-${huella}`)
      mkdirSync(parciales, { recursive: true })
      const piezas: string[] = []
      for (let i = 0; i < n; i++) {
        const pieza = join(parciales, `${String(i).padStart(4, '0')}.${extension}`)
        piezas.push(pieza)
        if (existsSync(pieza)) continue
        const hecho = join(tmp, `tramo-${i}.${extension}`)
        // Un objeto que se sigue: cada tramo empieza donde terminó el anterior.
        const previa = i > 0 ? `${piezas[i - 1]}.caja.json` : undefined
        await correrKit(hecho, { desde: i * trozo, hasta: Math.min(largo, (i + 1) * trozo), ...((roto || borrar) && previa && existsSync(previa) ? { cajaArchivo: previa } : {}) }, (f) => onProgreso(0.2 + ((i + f) / n) * 0.78, `${queHace} (tramo ${i + 1} de ${n})`))
        copyFileSync(hecho, pieza)
        if (existsSync(`${hecho}.caja.json`)) copyFileSync(`${hecho}.caja.json`, `${pieza}.caja.json`)
        rmSync(hecho, { force: true })
      }
      onProgreso(0.98, 'Juntando los tramos')
      const lista = join(tmp, 'tramos.txt')
      writeFileSync(lista, piezas.map((x) => `file '${x.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'), 'utf8')
      await new Promise<void>((resolver, rechazar) => {
        const h = spawn(rutaFfmpeg(), ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', temporal], { windowsHide: true })
        let err = ''
        h.stderr.on('data', (b: Buffer) => (err = (err + b.toString('utf8')).slice(-500)))
        h.on('error', rechazar)
        h.on('close', (c) => (c === 0 && existsSync(temporal) ? resolver() : rechazar(new Error(err.trim().split(/\r?\n/).pop() || 'No pude juntar los tramos.'))))
      })
      rmSync(parciales, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    }
    // Entero o nada: se mueve al final (un WebM a medias no queda como si estuviera hecho).
    copyFileSync(temporal, archivo)
    onProgreso(1, 'Listo')
    return lugar
  } finally {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  }
}
