import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba enfocada de la fase 2 (crear video con HyperFrames) reutilizando un
 * user-data-dir que ya tiene un proyecto con transcripción. Útil para iterar
 * sin repetir ingesta + transcripción.
 * Uso: node scripts/prueba-crear.mjs [userDataDir]
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9335
const datos =
  process.argv[2] ?? join(process.env.LOCALAPPDATA ?? tmpdir(), 'Temp', 'recorte-agente-1793937853079')

if (!existsSync(join(raiz, 'out', 'main', 'index.js'))) {
  console.error('Falta la compilación. Ejecuta «npm run build» antes.')
  process.exit(1)
}

const entorno = { ...process.env }
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
  console.log(`ajustes: proveedor ${ajustes.proveedor}`)

  const proyectos = await evaluar(cliente, 'window.recorte.listarProyectos()')
  if (!proyectos.length) throw new Error('No hay proyectos en el user-data-dir dado.')
  const idProyecto = proyectos[0].id
  console.log(`proyecto: ${proyectos[0].name}`)

  console.log('creación: el agente está diseñando la composición (puede tardar ~2 min)…')
  const creacion = await evaluar(
    cliente,
    `window.recorte.crearVideo(${JSON.stringify(idProyecto)}, "3 errores al grabar clases, intercalando fragmentos de mi video con el conteo", { incluirMaterial: true, estilo: 'lista' })`
  )
  if (!creacion.ok) throw new Error(creacion.error ?? 'La creación del video falló.')
  console.log(`creación: fuente ${creacion.fuente}${creacion.aviso ? ` · aviso: ${creacion.aviso}` : ''}`)
  console.log(`creado: ${creacion.output}`)
  if (creacion.fuente !== 'ia') {
    throw new Error('La composición no vino del agente (se usó la plantilla local).')
  }

  // La composición debe referenciar los fragmentos extraídos del material.
  const { readFileSync } = await import('node:fs')
  const { dirname, basename } = await import('node:path')
  const baseSalida = basename(creacion.output).replace(/^creado-/, '').replace(/\.mp4$/, '')
  const rutaHtml = join(dirname(dirname(creacion.output)), 'creaciones', baseSalida, 'index.html')
  const html = readFileSync(rutaHtml, 'utf8')
  if (!html.includes('media/frag-')) {
    throw new Error('La composición del agente no incluyó los fragmentos del material.')
  }
  console.log('composición: referencia fragmentos del material ✓')

  const sonda = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,duration', '-of', 'json', creacion.output],
    { encoding: 'utf8' }
  )
  if (sonda.status !== 0) throw new Error('ffprobe no pudo leer el video creado.')
  const pistas = JSON.parse(sonda.stdout).streams ?? []
  const pista = pistas.find((s) => s.codec_type === 'video')
  console.log(`mp4 creado: ${pista.width}×${pista.height} · ${Number(pista.duration).toFixed(1)} s`)
  if (pista.width !== 1080 || pista.height !== 1920) throw new Error('El video creado no salió en 1080×1920.')
  if (!pistas.some((s) => s.codec_type === 'audio')) {
    throw new Error('El video creado no tiene audio (los fragmentos llevan la voz del usuario).')
  }
  console.log('audio: la voz de los fragmentos quedó en el MP4 ✓')

  console.log('prueba crear: ok')
} catch (error) {
  console.error(`prueba crear: error · ${error instanceof Error ? error.message : String(error)}`)
  if (registros.trim()) console.error(registros.trim().slice(-3000))
  process.exitCode = 1
} finally {
  cliente?.cerrar()
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(electron.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    electron.kill()
  }
}
