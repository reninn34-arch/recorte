import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba de humo del flujo real: abre la app compilada, importa un video,
 * transcribe y comprueba los archivos del proyecto.
 *
 * Uso: npm run prueba:e2e
 * Video: VIDEO_PRUEBA=<ruta> (por defecto, el de la carpeta temporal de pruebas).
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9333
const marca = Date.now()
const datos = join(tmpdir(), `recorte-e2e-${marca}`)
const captura = join(tmpdir(), `recorte-e2e-${marca}.png`)
const video =
  process.env.VIDEO_PRUEBA ??
  join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'opencode', 'recorte-test', 'clase-prueba.mp4')

if (!existsSync(join(raiz, 'out', 'main', 'index.js'))) {
  console.error('Falta la compilación. Ejecuta «npm run build» antes de la prueba.')
  process.exit(1)
}

if (!existsSync(video)) {
  console.error(`No encuentro el video de prueba: ${video}`)
  console.error('Genera uno o define VIDEO_PRUEBA con otra ruta.')
  process.exit(1)
}

mkdirSync(datos, { recursive: true })

// Si la prueba se lanza desde una terminal basada en Electron, el hijo heredaría
// ELECTRON_RUN_AS_NODE y arrancaría como Node en vez de como aplicación.
const entorno = { ...process.env, RECORTE_MODELO: process.env.RECORTE_MODELO ?? 'small' }
delete entorno.ELECTRON_RUN_AS_NODE

const electron = spawn(
  electronPath,
  ['.', `--remote-debugging-port=${puerto}`, `--user-data-dir=${datos}`],
  {
    cwd: raiz,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: entorno
  }
)

let registros = ''
electron.stdout.on('data', (dato) => (registros += dato.toString()))
electron.stderr.on('data', (dato) => (registros += dato.toString()))

async function esperarPagina() {
  for (let intento = 0; intento < 160; intento += 1) {
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`)
      const lista = await respuesta.json()
      const pagina = lista.find((tab) => tab.type === 'page' && !tab.url.startsWith('devtools://'))
      if (pagina?.webSocketDebuggerUrl) return pagina
    } catch {
      // La ventana todavía no está lista.
    }
    await new Promise((listo) => setTimeout(listo, 250))
  }
  throw new Error('No apareció la ventana de Electron.')
}

function conectar(url) {
  const ws = new WebSocket(url)
  let siguiente = 0
  const pendientes = new Map()

  ws.addEventListener('message', (evento) => {
    const mensaje = JSON.parse(evento.data)
    const pendiente = pendientes.get(mensaje.id)
    if (!pendiente) return
    pendientes.delete(mensaje.id)
    if (mensaje.error) pendiente.rechazar(new Error(mensaje.error.message))
    else pendiente.resolver(mensaje.result)
  })

  return {
    listo: new Promise((listo, fallo) => {
      ws.addEventListener('open', listo, { once: true })
      ws.addEventListener('error', () => fallo(new Error('No pude conectar con la ventana.')), {
        once: true
      })
    }),
    enviar(metodo, parametros = {}) {
      return new Promise((resolver, rechazar) => {
        const id = ++siguiente
        pendientes.set(id, { resolver, rechazar })
        ws.send(JSON.stringify({ id, method: metodo, params: parametros }))
      })
    },
    cerrar() {
      ws.close()
    }
  }
}

async function evaluar(cliente, expresion) {
  const resultado = await cliente.enviar('Runtime.evaluate', {
    expression: expresion,
    awaitPromise: true,
    returnByValue: true
  })
  if (resultado.exceptionDetails) {
    const detalle =
      resultado.exceptionDetails.exception?.description ?? resultado.exceptionDetails.text
    throw new Error(detalle)
  }
  return resultado.result.value
}

let cliente
let idProyecto

try {
  const pagina = await esperarPagina()
  cliente = conectar(pagina.webSocketDebuggerUrl)
  await cliente.listo
  await cliente.enviar('Runtime.enable')
  await cliente.enviar('Page.enable')
  await new Promise((listo) => setTimeout(listo, 1200))

  const iniciales = await evaluar(cliente, 'window.recorte.listarProyectos()')
  console.log(`proyectos al abrir: ${iniciales.length}`)

  const ingesta = await evaluar(
    cliente,
    `window.recorte.crearProyecto(${JSON.stringify(video)})`
  )
  idProyecto = ingesta.project.id
  console.log(`importado: ${ingesta.project.name}`)
  console.log(
    `video: ${ingesta.project.source.width}×${ingesta.project.source.height} · ` +
      `${Math.round(ingesta.project.source.duration)} s · ${ingesta.project.source.fps} fps`
  )
  console.log(`miniatura: ${ingesta.project.thumbnail ? 'sí' : 'no'}`)

  const transcripcion = await evaluar(
    cliente,
    `window.recorte.transcribir(${JSON.stringify(idProyecto)})`
  )
  console.log(
    `transcripción: ${transcripcion.ok ? 'ok' : 'error'} · ` +
      `${transcripcion.transcript?.length ?? 0} segmentos · idioma ${transcripcion.project?.language ?? '?'}`
  )
  if (!transcripcion.ok) throw new Error(transcripcion.error ?? 'La transcripción falló.')

  const analisis = await evaluar(
    cliente,
    `window.recorte.generarClips(${JSON.stringify(idProyecto)})`
  )
  if (!analisis.ok) throw new Error(analisis.error ?? 'No se generaron momentos.')

  const primerClip = analisis.project.clips[0]
  console.log(`momentos: ${analisis.project.clips.length}`)
  console.log(
    `clip: «${primerClip.title}» · ${Math.round(primerClip.start)}–${Math.round(primerClip.end)} s · ` +
      `puntuación ${primerClip.score}`
  )
  console.log(`motivo: ${primerClip.reason}`)

  const render = await evaluar(
    cliente,
    `window.recorte.renderizarClip(${JSON.stringify(idProyecto)}, ${JSON.stringify(primerClip.id)})`
  )
  if (!render.ok) throw new Error(render.error ?? 'El render falló.')
  console.log(`render: ${render.output}`)

  const sonda = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height,duration',
      '-of',
      'json',
      render.output
    ],
    { encoding: 'utf8' }
  )
  if (sonda.status !== 0) throw new Error('ffprobe no pudo leer el MP4 renderizado.')
  const videoRender = JSON.parse(sonda.stdout).streams?.[0]
  if (!videoRender) throw new Error('El MP4 no tiene pista de video.')
  console.log(
    `mp4: ${videoRender.width}×${videoRender.height} · ${Number(videoRender.duration).toFixed(1)} s`
  )
  if (videoRender.width !== 1080 || videoRender.height !== 1920) {
    throw new Error('El MP4 no salió en 1080×1920.')
  }

  const muestra = join(raiz, 'out', 'e2e')
  mkdirSync(muestra, { recursive: true })
  copyFileSync(render.output, join(muestra, 'clip.mp4'))
  const rutaSrt = render.output.replace(/\.mp4$/, '.srt')
  if (existsSync(rutaSrt)) copyFileSync(rutaSrt, join(muestra, 'clip.srt'))
  const rutaPortada = render.output.replace(/\.mp4$/, '.jpg')
  if (!existsSync(rutaPortada)) throw new Error('Falta la portada JPG del clip.')
  copyFileSync(rutaPortada, join(muestra, 'clip.jpg'))
  console.log(`muestra: ${join(muestra, 'clip.mp4')}`)

  // Render por lote: los dos momentos siguientes, en serie.
  const restantes = analisis.project.clips.slice(1, 3).map((clip) => clip.id)
  if (restantes.length > 0) {
    const lote = await evaluar(
      cliente,
      `window.recorte.renderizarLote(${JSON.stringify(idProyecto)}, ${JSON.stringify(restantes)})`
    )
    console.log(`lote: ${lote.renderizados} ok · ${lote.fallidos} con error`)
    if (!lote.ok) throw new Error(lote.error ?? 'El render por lote falló.')
    if (lote.renderizados !== restantes.length) {
      throw new Error(`El lote debía renderizar ${restantes.length} clips.`)
    }
  }

  // Fase 1: edición con agente (respaldo local) + render de la receta.
  const edicion = await evaluar(
    cliente,
    `window.recorte.editarConAgente(${JSON.stringify(idProyecto)})`
  )
  if (!edicion.ok) throw new Error(edicion.error ?? 'No se generó la edición.')
  console.log(
    `edición: «${edicion.project.receta?.titulo}» · ` +
      `${edicion.project.receta?.cortes.length ?? 0} corte(s) · fuente ${edicion.fuente ?? '?'}`
  )

  // Forzamos una receta de dos cortes con fundido para ejercitar el camino xfade.
  const proyectoConReceta = edicion.project
  proyectoConReceta.receta = {
    titulo: 'Prueba e2e fundido',
    cortes: [
      { start: 4, end: 18 },
      { start: 20, end: 33 }
    ],
    color: { brillo: 0.02, contraste: 1.1, saturacion: 1.2 },
    velocidad: 1.1,
    transicion: 'fundido',
    captions: true
  }
  await evaluar(cliente, `window.recorte.guardarProyecto(${JSON.stringify(proyectoConReceta)})`)

  const renderEdicion = await evaluar(
    cliente,
    `window.recorte.renderizarEdicion(${JSON.stringify(idProyecto)})`
  )
  if (!renderEdicion.ok) throw new Error(renderEdicion.error ?? 'El render de la edición falló.')
  if (!renderEdicion.project?.recetaSalida) throw new Error('La edición no guardó su salida.')
  console.log(`render edición: ${renderEdicion.output}`)

  const sondaEdicion = spawnSync(
    'ffprobe',
    [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'json', renderEdicion.output
    ],
    { encoding: 'utf8' }
  )
  if (sondaEdicion.status !== 0) throw new Error('ffprobe no pudo leer la edición.')
  const videoEdicion = JSON.parse(sondaEdicion.stdout).streams?.[0]
  const duracionEsperada = (18 - 4 + 33 - 20) / 1.1 - 0.4
  console.log(
    `mp4 edición: ${videoEdicion.width}×${videoEdicion.height} · ` +
      `${Number(videoEdicion.duration).toFixed(1)} s (esperados ≈ ${duracionEsperada.toFixed(1)} s)`
  )
  if (videoEdicion.width !== 1080 || videoEdicion.height !== 1920) {
    throw new Error('La edición no salió en 1080×1920.')
  }
  if (Math.abs(Number(videoEdicion.duration) - duracionEsperada) > 1.5) {
    throw new Error('La duración de la edición no cuadra con la receta.')
  }
  copyFileSync(renderEdicion.output, join(muestra, 'edicion.mp4'))

  await cliente.enviar('Page.reload', { ignoreCache: true })
  await new Promise((listo) => setTimeout(listo, 2200))

  const abierto = await evaluar(
    cliente,
    `window.recorte.abrirProyecto(${JSON.stringify(idProyecto)})`
  )
  console.log(
    `reabierto: ${abierto.transcription} · ${abierto.transcript?.length ?? 0} segmentos · ` +
      `proxy ${abierto.proxy ? 'sí' : 'no'} · clips ${abierto.clips.length} · ` +
      `primer clip ${abierto.clips[0]?.status ?? 'sin estado'}`
  )

  const carpeta =
    [
      join(datos, 'proyectos', idProyecto),
      join(process.env.APPDATA ?? '', 'recorte', 'proyectos', idProyecto)
    ].find((ruta) => existsSync(join(ruta, 'proyecto.json'))) ?? null

  if (!carpeta) throw new Error('No encuentro la carpeta del proyecto en disco.')

  const archivos = readdirSync(carpeta).sort()
  console.log(`archivos: ${archivos.join(', ')}`)
  if (!archivos.includes('transcripcion.json')) throw new Error('Falta transcripcion.json.')
  if (!archivos.includes('miniatura.jpg')) throw new Error('Falta miniatura.jpg.')
  if (!archivos.includes('proxy.mp4')) throw new Error('Falta proxy.mp4.')

  const archivosSalida = readdirSync(join(carpeta, 'salidas')).sort()
  console.log(`salidas: ${archivosSalida.join(', ')}`)
  if (!archivosSalida.some((archivo) => archivo.endsWith('.mp4'))) {
    throw new Error('Falta el MP4 renderizado.')
  }
  if (!archivosSalida.some((archivo) => archivo.endsWith('.srt'))) {
    throw new Error('Falta el SRT renderizado.')
  }
  if (!archivosSalida.some((archivo) => archivo.endsWith('.jpg'))) {
    throw new Error('Falta la portada JPG.')
  }

  const imagen = await cliente.enviar('Page.captureScreenshot', { format: 'png' })
  writeFileSync(captura, Buffer.from(imagen.data, 'base64'))
  console.log(`captura: ${captura}`)
  console.log('prueba: ok')
} catch (error) {
  console.error(`prueba: error · ${error instanceof Error ? error.message : String(error)}`)
  if (registros.trim()) console.error(registros.trim().slice(-3000))
  process.exitCode = 1
} finally {
  cliente?.cerrar()
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(electron.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    electron.kill()
  }

  await new Promise((listo) => setTimeout(listo, 700))

  if (datos.startsWith(tmpdir())) {
    if (process.env.RECORTE_E2E_CONSERVAR === '1') {
      console.log(`datos conservados: ${datos}`)
    } else {
      try {
        rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
      } catch {
        console.warn(`aviso: no pude borrar la carpeta temporal ${datos}`)
      }
    }
  }

  if (idProyecto) {
    const enAppData = join(process.env.APPDATA ?? '', 'recorte', 'proyectos', idProyecto)
    try {
      if (existsSync(enAppData)) rmSync(enAppData, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
    } catch {
      console.warn(`aviso: no pude borrar el proyecto de prueba ${enAppData}`)
    }
  }
}
