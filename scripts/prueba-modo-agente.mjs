import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba del modo agente de Crear con IA, con un «Claude» de prueba (no el real: no gasta
 * el plan de nadie). El falso se pone primero en el PATH, registra cómo lo lanzan, «mira»
 * la entrada y fabrica un video con FFmpeg. Comprueba:
 * 1. la creación en modo agente copia los archivos tal cual a trabajo/entrada y empieza en «plan»;
 * 2. el plan sale del agente, con «Hazlo»; el agente corre en trabajo/ con el manual y sus opciones;
 * 3. hacer: el video se revisa (dura, mide, 5 fotogramas), se publica en salidas/ y pasa a «listo»;
 * 4. un cambio por el chat hace la versión 2 pasándole el pedido al agente.
 * Uso: npm run build && node scripts/prueba-modo-agente.mjs (hace falta FFmpeg en el PATH).
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9339
const datos = mkdtempSync(join(tmpdir(), 'recorte-modoagente-'))
const medios = mkdtempSync(join(tmpdir(), 'recorte-modoagente-medios-'))
writeFileSync(join(datos, 'ajustes.json'), JSON.stringify({ carpetaVideos: join(datos, 'videos') }))

// El Claude de prueba y su lanzador (claude.cmd en Windows).
const binFalso = join(medios, 'bin')
spawnSync(process.platform === 'win32' ? 'cmd' : 'mkdir', process.platform === 'win32' ? ['/c', 'mkdir', binFalso] : ['-p', binFalso])
writeFileSync(join(binFalso, 'claude-falso.mjs'), String.raw`// Se hace pasar por Claude Code en modo agente: registra cómo lo lanzaron, «mira» la entrada
// y, si le piden hacer, fabrica un video con FFmpeg en salida/ y escribe resultado.json.
import { appendFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
let prompt = ''
process.stdin.on('data', (d) => (prompt += d))
process.stdin.on('end', async () => {
  const cwd = process.cwd()
  const cambio = /LO QUE PIDE AHORA EL USUARIO: (.*)/.exec(prompt)
  appendFileSync(
    process.env.REGISTRO_FALSO,
    JSON.stringify({ args: process.argv.slice(2), cwd, manual: existsSync(join(cwd, 'CLAUDE.md')), plan: prompt.includes('TODAVÍA NO HAGAS'), cambio: cambio ? cambio[1] : null }) + '\n'
  )
  const ev = (o) => console.log(JSON.stringify(o))
  if (existsSync(join(process.env.REGISTRO_FALSO, '..', 'fondo.txt'))) {
    // Deja un proceso de fondo con su salida abierta 30 s (un render que se queda corriendo).
    const { spawn } = await import('node:child_process')
    spawn(process.execPath, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'inherit', detached: true }).unref()
  }
  if (existsSync(join(process.env.REGISTRO_FALSO, '..', 'filtro.txt'))) {
    // Como responde Antigravity cuando el filtro de Google rechaza el pedido (respuesta normal, sin JSON).
    ev({ type: 'result', result: "The prompt could not be submitted. The prompt contains sensitive words that violate Google's [Generative AI Prohibited Use policy](https://policies.google.com/terms/generative-ai/use-policy). Try rephrasing the prompt." })
    return
  }
  if (existsSync(join(process.env.REGISTRO_FALSO, '..', 'fallar.txt'))) {
    ev({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired and could not be refreshed' })
    return
  }
  const entrada = readdirSync(join(cwd, 'entrada'))
  ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: join(cwd, 'entrada', entrada[0] || 'nada') } }] } })
  if (prompt.includes('TODAVÍA NO HAGAS')) {
    ev({ type: 'assistant', message: { content: [{ type: 'text', text: 'Miré las imágenes: el croma es #C0FF72.' }] } })
    ev({
      type: 'result',
      result: JSON.stringify({
        entendi: 'Una comparativa con ' + entrada.length + ' archivo(s), conservando el croma.',
        pasos: ['Medir el croma', 'Animar el deslizador', 'Comprobar fotogramas'],
        preguntas: [],
        herramienta: 'Python + FFmpeg'
      })
    })
    return
  }
  ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { description: 'Renderizar el video con FFmpeg' } }] } })
  const img = join(cwd, 'entrada', entrada[0])
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-loop', '1', '-i', img, '-t', '3',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xC0FF72,format=yuv420p',
    '-r', '30', '-c:v', 'libx264', join(cwd, 'salida', 'final.mp4')
  ])
  ev({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { description: 'Sacar fotogramas a revision/ y mirarlos' } }] } })
  writeFileSync(
    join(cwd, 'resultado.json'),
    JSON.stringify({ archivo: 'salida/final.mp4', resumen: 'Hice la comparativa de 3 s sobre croma.', comprobaciones: ['Duración 3 s y 1080×1920', 'Croma uniforme fuera de la foto'] })
  )
  ev({ type: 'result', result: 'Listo.' })
})
`)
if (process.platform === 'win32') writeFileSync(join(binFalso, 'claude.cmd'), '@node "%~dp0claude-falso.mjs" %*\r\n')
else {
  writeFileSync(join(binFalso, 'claude'), `#!/bin/sh\nexec node "${join(binFalso, 'claude-falso.mjs')}" "$@"\n`)
  spawnSync('chmod', ['+x', join(binFalso, 'claude')])
}
const registroFalso = join(medios, 'llamadas.log')

// Una foto de prueba: verde croma con un cuadro en medio.
const foto = join(medios, 'antes.png')
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xC0FF72:s=1125x2000', '-vf', 'drawbox=x=180:y=430:w=766:h=644:color=0x804020@1:t=fill', '-frames:v', '1', foto])
if (r.status !== 0) throw new Error('No pude generar la foto de prueba con FFmpeg.')

const entorno = { ...process.env, REGISTRO_FALSO: registroFalso, PATH: `${binFalso}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
delete entorno.ELECTRON_RUN_AS_NODE
const electron = spawn(electronPath, ['.', `--remote-debugging-port=${puerto}`, `--user-data-dir=${datos}`], { cwd: raiz, stdio: ['ignore', 'pipe', 'pipe'], env: entorno })
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

async function evaluar(cliente, expresion, timeoutMs = 0) {
  const resultado = await cliente.enviar('Runtime.evaluate', {
    expression: expresion,
    awaitPromise: true,
    returnByValue: true,
    ...(timeoutMs ? { timeout: timeoutMs } : {})
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
  await evaluar(cliente, `window.recorte.guardarAjustes(${JSON.stringify({ activa: true, proveedor: 'cli', comandoCli: 'claude -p', baseUrl: '', modelo: '' })})`)

  const c = await evaluar(cliente, `window.recorte.creacionNueva(${JSON.stringify({ peticion: 'Comparativa conservando el croma', estilo: 'libre', formato: 'vertical', duracion: 15, adjuntos: [foto], modo: 'agente' })})`)
  if (c.modo !== 'agente' || c.fase !== 'plan') throw new Error(`Debió empezar en modo agente y fase plan: ${c.modo}/${c.fase}`)
  const carpeta = join(datos, 'creaciones', c.id)
  if (!existsSync(join(carpeta, c.adjuntos[0].archivo))) throw new Error('La foto no se copió a trabajo/entrada.')
  if (readFileSync(join(carpeta, c.adjuntos[0].archivo)).length !== readFileSync(foto).length) throw new Error('La foto debió copiarse tal cual (sin convertir).')
  console.log('modo agente: archivos tal cual en trabajo/entrada y fase plan ✓')

  const conPlan = await evaluar(cliente, `window.recorte.agentePlan(${JSON.stringify(c.id)})`)
  if (!conPlan.agente?.plan?.pasos?.length) throw new Error('No hubo plan.')
  if (!conPlan.mensajes.at(-1).propuestas?.includes('Hazlo')) throw new Error('El plan debió ofrecer «Hazlo».')
  if (!conPlan.agente.registro.some((l) => l.startsWith('Read:'))) throw new Error('El registro debió mostrar lo que hizo el agente.')
  console.log('plan del agente con «Hazlo» y registro en vivo ✓')
  // El vistazo: Recorte prepara miniaturas y LEEME para que el agente no abra los originales.
  for (const f of ['LEEME.txt', 'fotos.jpg']) {
    if (!existsSync(join(carpeta, 'trabajo', 'vistazo', f))) throw new Error(`Falta vistazo/${f}.`)
  }
  if (!readFileSync(join(carpeta, 'trabajo', 'vistazo', 'LEEME.txt'), 'utf8').includes('fotos.jpg')) throw new Error('El LEEME del vistazo no describe las fotos.')
  if (!readFileSync(join(carpeta, 'trabajo', 'AGENTS.md'), 'utf8').includes('Trabaja rápido')) throw new Error('El manual no explica cómo trabajar rápido.')
  // El kit: copiado a la carpeta de trabajo, con las rutas de FFmpeg, y el manual dice que se use primero.
  for (const n of ['kit.py', 'RECETA.md', 'rutas.json']) if (!existsSync(join(carpeta, 'trabajo', 'kit', n))) throw new Error(`Falta kit/${n} en la carpeta de trabajo.`)
  if (!readFileSync(join(carpeta, 'trabajo', 'AGENTS.md'), 'utf8').includes('El kit: úsalo primero')) throw new Error('El manual no presenta el kit.')
  console.log('kit: copiado a trabajo/kit y presentado en el manual ✓')
  console.log('vistazo preparado (miniaturas y LEEME) y manual con el método rápido ✓')

  const hecha = await evaluar(cliente, `window.recorte.agenteHacer(${JSON.stringify(c.id)})`, 5 * 60_000)
  const res = hecha.agente?.resultado
  if (hecha.fase !== 'listo' || !res) throw new Error(`Debió terminar listo con resultado: ${hecha.fase} · ${hecha.mensajes.at(-1)?.texto}`)
  if (Math.abs(res.duracion - 3) > 0.2 || res.ancho !== 1080 || res.alto !== 1920) throw new Error(`La revisión midió mal: ${res.duracion} s ${res.ancho}×${res.alto}`)
  if (res.revision.length !== 5 || !res.revision.every((x) => existsSync(join(carpeta, x)))) throw new Error('Faltan los 5 fotogramas de la revisión.')
  if (hecha.salida !== 'salidas/agente-v1.mp4' || !existsSync(join(carpeta, hecha.salida))) throw new Error('El video no se publicó en salidas/.')
  if (!res.comprobaciones.length) throw new Error('Debió traer lo que comprobó el agente.')
  console.log(`hacer: revisado (${res.duracion} s, ${res.ancho}×${res.alto}, 5 fotogramas) y publicado ✓`)

  const cambiada = await evaluar(cliente, `window.recorte.agenteHacer(${JSON.stringify(c.id)}, 'Haz el brillo más fino')`, 5 * 60_000)
  if (cambiada.version !== 2 || cambiada.salida !== 'salidas/agente-v2.mp4') throw new Error(`El cambio debió hacer la versión 2: v${cambiada.version} ${cambiada.salida}`)
  console.log('cambio por el chat: versión 2 ✓')

  const llamadas = readFileSync(registroFalso, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  if (llamadas.length !== 3) throw new Error(`Esperaba 3 llamadas al agente (plan, hacer, cambio); hubo ${llamadas.length}.`)
  for (const l of llamadas) {
    if (!l.cwd.replace(/\\/g, '/').endsWith('/trabajo')) throw new Error(`El agente debió trabajar en trabajo/: ${l.cwd}`)
    if (!l.manual) throw new Error('Faltaba el manual (CLAUDE.md) en la carpeta.')
    if (!l.args.includes('acceptEdits') || !l.args.includes('stream-json')) throw new Error(`Opciones del agente: ${l.args.join(' ')}`)
  }
  if (!llamadas[0].plan || llamadas[1].plan || llamadas[2].cambio !== 'Haz el brillo más fino') throw new Error('El plan, el hacer y el cambio no llegaron como debían.')
  console.log('el agente corrió en su carpeta, con el manual y sus opciones, y recibió el cambio ✓')

  // El modelo y el esfuerzo elegidos llegan al comando del agente; lo que no es un id seguro se descarta.
  const conModelo = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({ peticion: 'Con modelo elegido', estilo: 'libre', formato: 'vertical', duracion: 15, adjuntos: [foto], modo: 'agente', tareas: { video: { agente: 'claude', modelo: 'sonnet', esfuerzo: 'low' }, guion: { agente: 'claude', modelo: 'opus; rm -rf x' } } })})`
  )
  if (conModelo.tareas?.video?.modelo !== 'sonnet' || conModelo.tareas?.video?.esfuerzo !== 'low') throw new Error(`No se guardó el modelo elegido: ${JSON.stringify(conModelo.tareas)}`)
  if (conModelo.tareas?.guion?.modelo !== undefined) throw new Error('Un modelo con caracteres raros debió descartarse.')
  const claudeConectado = (await evaluar(cliente, 'window.recorte.agentesEstado()')).find((a) => a.id === 'claude')?.conectado
  if (claudeConectado) {
    await evaluar(cliente, `window.recorte.agentePlan(${JSON.stringify(conModelo.id)})`)
    const ultima = readFileSync(registroFalso, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).at(-1)
    const args = ultima.args.join(' ')
    if (!/--model sonnet/.test(args) || !/--effort low/.test(args)) throw new Error(`El agente no recibió el modelo y el esfuerzo: ${args}`)
    console.log('modelo y esfuerzo elegidos: llegan al agente (--model sonnet --effort low) ✓')
  } else {
    console.log('modelo y esfuerzo: se guardan y se limpian ✓ (Claude Code sin sesión en esta PC: no se comprueba el comando)')
  }

  // Si la sesión del agente caducó, el usuario lo lee en claro (no un trozo de JSON).
  writeFileSync(join(medios, 'fallar.txt'), '1')
  await evaluar(cliente, `(window.__caidas = [], window.recorte.onSesionCaida((id) => window.__caidas.push(id)), true)`)
  const caducada = await evaluar(cliente, `window.recorte.agentePlan(${JSON.stringify(c.id)})`)
  const aviso = caducada.mensajes.at(-1)
  if (!aviso.error || !/sesión de tu agente caducó/.test(aviso.texto)) throw new Error(`Aviso de sesión caducada: ${aviso.texto}`)
  console.log('sesión caducada: se avisa en claro ✓')
  // …y la interfaz se entera (Inicio vuelve a mostrar «Conectar») y Claude Code deja de contar como conectado.
  const caidas = await evaluar(cliente, 'window.__caidas')
  if (!caidas.includes('claude')) throw new Error(`La interfaz no recibió la sesión caída: ${JSON.stringify(caidas)}`)
  const estado = await evaluar(cliente, 'window.recorte.agentesEstado()')
  if (estado.find((a) => a.id === 'claude')?.conectado) throw new Error('Claude Code sigue contando como conectado tras caerse su sesión.')
  const avisoInicio = await evaluar(cliente, `document.body.innerText.includes('Pulsa «Conectar» en Inicio')`)
  if (!avisoInicio) throw new Error('No salió el aviso para reconectar.')
  console.log('sesión caída: la interfaz lo sabe, avisa y pide reconectar ✓')

  // Si el filtro de contenido del proveedor rechaza el pedido, se explica (no «Unexpected token»).
  unlinkSync(join(medios, 'fallar.txt'))
  writeFileSync(join(medios, 'filtro.txt'), '1')
  const filtrado = await evaluar(cliente, `window.recorte.agentePlan(${JSON.stringify(c.id)})`)
  const avisoFiltro = filtrado.mensajes.at(-1)
  if (!avisoFiltro.error || !/filtro de contenido/.test(avisoFiltro.texto) || /Unexpected token/.test(avisoFiltro.texto)) {
    throw new Error(`Aviso del filtro de contenido: ${avisoFiltro.texto}`)
  }
  console.log('rechazo del filtro de contenido: se explica en claro ✓')

  // Si el agente deja algo corriendo de fondo, su respuesta llega igual (antes se esperaba a que acabara).
  unlinkSync(join(medios, 'filtro.txt'))
  writeFileSync(join(medios, 'fondo.txt'), '1')
  const t0 = Date.now()
  const conFondo = await evaluar(cliente, `window.recorte.agentePlan(${JSON.stringify(c.id)})`)
  const tardo = (Date.now() - t0) / 1000
  if (!conFondo.agente?.plan || conFondo.mensajes.at(-1)?.error) throw new Error(`Con un proceso de fondo, el plan no llegó: ${conFondo.mensajes.at(-1)?.texto}`)
  if (tardo > 15) throw new Error(`Con un proceso de fondo, el plan tardó ${tardo.toFixed(1)} s (esperó al proceso de fondo).`)
  console.log(`con un proceso de fondo abierto, el plan llega en ${tardo.toFixed(1)} s ✓`)
  console.log('prueba modo agente: ok')
} catch (error) {
  console.error(`prueba modo agente: error · ${error instanceof Error ? error.message : String(error)}`)
  if (registros.trim()) console.error(registros.trim().slice(-3000))
  process.exitCode = 1
} finally {
  cliente?.cerrar()
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(electron.pid), '/T', '/F'], { stdio: 'ignore' })
  else electron.kill()
  for (const dir of [datos, medios]) {
    for (let i = 0; i < 10; i += 1) {
      try {
        rmSync(dir, { recursive: true, force: true })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
}
