import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba real del camino «agente CLI»: configura Kimi Code (`kimi -p "@{prompt}"`),
 * pide una RecetaEdicion de verdad y la renderiza. Requiere `kimi` con sesión
 * iniciada. Uso: node scripts/prueba-agente.mjs
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9334
const marca = Date.now()
const datos = join(tmpdir(), `recorte-agente-${marca}`)
const video =
  process.env.VIDEO_PRUEBA ??
  join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'opencode', 'recorte-test', 'clase-prueba.mp4')

if (!existsSync(join(raiz, 'out', 'main', 'index.js'))) {
  console.error('Falta la compilación. Ejecuta «npm run build» antes.')
  process.exit(1)
}
if (!existsSync(video)) {
  console.error(`No encuentro el video de prueba: ${video}`)
  process.exit(1)
}

mkdirSync(datos, { recursive: true })

const entorno = { ...process.env, RECORTE_MODELO: process.env.RECORTE_MODELO ?? 'small' }
delete entorno.ELECTRON_RUN_AS_NODE

const electron = spawn(
  electronPath,
  ['.', `--remote-debugging-port=${puerto}`, `--user-data-dir=${datos}`],
  { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], env: entorno }
)

let registros = ''
electron.stdout.on('data', (d) => (registros += d.toString()))
electron.stderr.on('data', (d) => (registros += d.toString()))

async function esperarPagina() {
  for (let intento = 0; intento < 160; intento += 1) {
    try {
      const respuesta = await fetch(`http://127.0.0.1:${puerto}/json/list`)
      const lista = await respuesta.json()
      const pagina = lista.find((tab) => tab.type === 'page' && !tab.url.startsWith('devtools://'))
      if (pagina?.webSocketDebuggerUrl) return pagina
    } catch {
      // Todavía no está lista.
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
      ws.addEventListener('error', () => fallo(new Error('No pude conectar.')), { once: true })
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
    throw new Error(
      resultado.exceptionDetails.exception?.description ?? resultado.exceptionDetails.text
    )
  }
  return resultado.result.value
}

let cliente

try {
  const pagina = await esperarPagina()
  cliente = conectar(pagina.webSocketDebuggerUrl)
  await cliente.listo
  await cliente.enviar('Runtime.enable')
  await new Promise((listo) => setTimeout(listo, 1200))

  // 1. Configurar el agente CLI real (Kimi Code con la sesión del usuario).
  const ajustes = await evaluar(
    cliente,
    `window.recorte.guardarAjustes(${JSON.stringify({
      activa: true,
      proveedor: 'cli',
      comandoCli: 'kimi -p "@{prompt}"',
      baseUrl: '',
      modelo: ''
    })})`
  )
  console.log(`ajustes: proveedor ${ajustes.proveedor} · comando «${ajustes.comandoCli}»`)

  // 2. Importar y transcribir.
  const ingesta = await evaluar(cliente, `window.recorte.crearProyecto(${JSON.stringify(video)})`)
  const idProyecto = ingesta.project.id
  console.log(`importado: ${ingesta.project.name} · ${Math.round(ingesta.project.source.duration)} s`)

  const transcripcion = await evaluar(
    cliente,
    `window.recorte.transcribir(${JSON.stringify(idProyecto)})`
  )
  if (!transcripcion.ok) throw new Error(transcripcion.error ?? 'La transcripción falló.')
  console.log(`transcripción: ok · ${transcripcion.transcript?.length ?? 0} segmentos`)

  // 3. El agente propone la edición de verdad.
  const edicion = await evaluar(
    cliente,
    `window.recorte.editarConAgente(${JSON.stringify(idProyecto)})`
  )
  if (!edicion.ok) throw new Error(edicion.error ?? 'No se generó la edición.')
  const receta = edicion.project.receta
  console.log(`fuente: ${edicion.fuente}${edicion.aviso ? ` · aviso: ${edicion.aviso}` : ''}`)
  console.log(`receta: «${receta?.titulo}» · ${receta?.cortes.length} corte(s) · ` +
    `transición ${receta?.transicion} · velocidad ×${receta?.velocidad}`)
  if (receta?.resumen) console.log(`resumen del agente: ${receta.resumen}`)
  if (edicion.fuente !== 'ia') {
    throw new Error('La edición no vino del agente (se usó el respaldo local).')
  }

  // 4. Renderizar la edición del agente.
  const render = await evaluar(
    cliente,
    `window.recorte.renderizarEdicion(${JSON.stringify(idProyecto)})`
  )
  if (!render.ok) throw new Error(render.error ?? 'El render de la edición falló.')
  console.log(`render: ${render.output}`)

  const sonda = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', render.output],
    { encoding: 'utf8' }
  )
  if (sonda.status !== 0) throw new Error('ffprobe no pudo leer la edición.')
  const pista = JSON.parse(sonda.stdout).streams?.[0]
  console.log(`mp4: ${pista.width}×${pista.height} · ${Number(pista.duration).toFixed(1)} s`)
  if (pista.width !== 1080 || pista.height !== 1920) throw new Error('La edición no salió en 1080×1920.')

  // 5. El agente diseña un video desde cero (composición HyperFrames) y se renderiza.
  console.log('creación: el agente está diseñando la composición (puede tardar ~1 min)…')
  const creacion = await evaluar(
    cliente,
    `window.recorte.crearVideo(${JSON.stringify(idProyecto)}, "Una tarjeta de título para un reel sobre 3 errores al grabar clases")`
  )
  if (!creacion.ok) throw new Error(creacion.error ?? 'La creación del video falló.')
  console.log(`creación: fuente ${creacion.fuente}${creacion.aviso ? ` · aviso: ${creacion.aviso}` : ''}`)
  console.log(`creado: ${creacion.output}`)
  if (creacion.fuente !== 'ia') {
    throw new Error('La composición no vino del agente (se usó la plantilla local).')
  }

  const sonda2 = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', creacion.output],
    { encoding: 'utf8' }
  )
  if (sonda2.status !== 0) throw new Error('ffprobe no pudo leer el video creado.')
  const pista2 = JSON.parse(sonda2.stdout).streams?.[0]
  console.log(`mp4 creado: ${pista2.width}×${pista2.height} · ${Number(pista2.duration).toFixed(1)} s`)
  if (pista2.width !== 1080 || pista2.height !== 1920) throw new Error('El video creado no salió en 1080×1920.')

  console.log('prueba agente: ok')
} catch (error) {
  console.error(`prueba agente: error · ${error instanceof Error ? error.message : String(error)}`)
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
  try {
    rmSync(datos, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch {
    console.warn(`aviso: no pude borrar ${datos}`)
  }
}
