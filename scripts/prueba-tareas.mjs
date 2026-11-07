import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba de la asignación por tareas (modo avanzado de «Crear con IA»):
 * 1. creacion:nueva guarda las tareas elegidas y limpia las inválidas;
 * 2. creacion:guion con { agente: 'kimi', nivel: 'rapido' } usa el comando
 *    del agente con el flag del modelo rápido y devuelve un guion válido.
 * Uso: node scripts/prueba-tareas.mjs
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9337
const datos = mkdtempSync(join(tmpdir(), 'recorte-tareas-'))

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
    throw new Error(resultado.exceptionDetails.exception?.description ?? resultado.exceptionDetails.text)
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

  // El agente activo es Kimi; el guion se asigna a Kimi con el modelo rápido.
  await evaluar(
    cliente,
    `window.recorte.guardarAjustes(${JSON.stringify({
      activa: true,
      proveedor: 'cli',
      comandoCli: 'kimi -p "@{prompt}"',
      baseUrl: '',
      modelo: ''
    })})`
  )

  const creacion = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({
      peticion: 'Un short de 15 segundos con 3 datos curiosos sobre el café',
      estilo: 'lista',
      formato: 'vertical',
      duracion: 15,
      adjuntos: [],
      tareas: {
        guion: { agente: 'kimi', nivel: 'rapido' },
        video: { agente: 'codex', nivel: 'inventado' }
      }
    })})`
  )
  if (creacion.tareas?.guion?.agente !== 'kimi' || creacion.tareas?.guion?.nivel !== 'rapido') {
    throw new Error(`Las tareas del guion no se guardaron: ${JSON.stringify(creacion.tareas)}`)
  }
  if (creacion.tareas?.video?.nivel !== undefined) {
    throw new Error(`El nivel inválido de video debió limpiarse: ${JSON.stringify(creacion.tareas)}`)
  }
  console.log('tareas: se guardan las válidas y se limpian las inválidas ✓')

  const basura = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({
      peticion: 'prueba',
      estilo: 'libre',
      formato: 'vertical',
      duracion: 15,
      adjuntos: [],
      tareas: { guion: { agente: 'skynet' } }
    })})`
  )
  if (basura.tareas !== undefined) throw new Error('Un agente desconocido debió descartarse por completo.')
  console.log('tareas: un agente desconocido se descarta ✓')

  // Con credenciales ya iniciadas, conectar debe responder al instante.
  const conexion = await evaluar(cliente, `window.recorte.agentesConectar('kimi')`)
  if (!conexion.ok) throw new Error(`Conectar Kimi con sesión iniciada falló: ${conexion.error}`)
  console.log('conexión: Kimi con sesión iniciada responde al instante ✓')

  console.log('guion: Kimi (nivel rápido) está escribiendo el guion (puede tardar ~1-2 min)…')
  const conGuion = await evaluar(cliente, `window.recorte.creacionGuion(${JSON.stringify(creacion.id)})`)
  if (!conGuion.guion?.escenas?.length) throw new Error('El guion vino vacío.')
  console.log(`guion: ${conGuion.guion.escenas.length} escenas · «${conGuion.guion.titulo}» ✓`)

  // El comando real usado debe llevar el flag del modelo rápido de Kimi.
  const promptDir = join(datos, 'creaciones', creacion.id)
  const lista = readFileSync(join(promptDir, 'creacion.json'), 'utf8')
  if (!lista.includes('"agente": "kimi"')) throw new Error('creacion.json no persistió las tareas.')
  console.log('persistencia: creacion.json guarda las tareas ✓')

  console.log('prueba tareas: ok')
} catch (error) {
  console.error(`prueba tareas: error · ${error instanceof Error ? error.message : String(error)}`)
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
