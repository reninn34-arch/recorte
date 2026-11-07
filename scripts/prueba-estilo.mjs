import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

/**
 * Prueba de «Copiar un estilo» (fases 1 y 2: análisis + ficha + viabilidad, sin montar video):
 * 1. calcularViabilidad es coherente con y sin Flow/ChatGPT (función pura, compilada al vuelo);
 * 2. creacion:nueva con referencia entra en la fase Estilo; sin referencia, nada cambia;
 * 3. estilo:analizar genera material.json (escenas con miniaturas) y estilo-medido.json
 *    coherente (referencia cortando cada 1,5 s → mediana entre 1,2 y 1,8), más ficha y viabilidad;
 * 4. Parar mata el FFmpeg en marcha.
 * El material (2 min con escenas y tono) y la referencia (30 s, cortes cada 1,5 s) se generan
 * con FFmpeg en una carpeta temporal. Uso: npm run build && node scripts/prueba-estilo.mjs
 * (hace falta FFmpeg en PATH y RECORTE_PYTHON para la escucha con Whisper).
 */

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9338
const datos = mkdtempSync(join(tmpdir(), 'recorte-estilo-'))
const medios = mkdtempSync(join(tmpdir(), 'recorte-estilo-medios-'))

function ffmpeg(args, descripcion) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
  if (r.status !== 0) throw new Error(`No pude generar ${descripcion}: ${r.stderr?.toString().slice(-300)}`)
}

// Material: 2 min, un corte cada 4 s (30 escenas de color) con tono. Entra completo en la
// creación, así que el análisis debe ver los 30 planos.
const material = join(medios, 'material.mp4')
{
  const colores = ['0xcc2222', '0x22cc44', '0x2244cc', '0xcccc22', '0xcc22cc', '0x22cccc']
  const entradas = Array.from({ length: 30 }, (_, i) => ['-f', 'lavfi', '-i', `color=c=${colores[i % colores.length]}:s=1280x720:d=4:r=30`]).flat()
  const cadena = Array.from({ length: 30 }, (_, i) => `[${i}:v]`).join('')
  ffmpeg(
    [...entradas, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=120',
      '-filter_complex', `${cadena}concat=n=30:v=1:a=0[v]`,
      '-map', '[v]', '-map', '30:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', material],
    'el material de prueba'
  )
}

// Referencia: 30 s, cortes cada 1,5 s (20 planos alternando dos colores).
const referencia = join(medios, 'referencia.mp4')
{
  const entradas = Array.from({ length: 20 }, (_, i) => ['-f', 'lavfi', '-i', `color=c=${i % 2 ? '0x111111' : '0xeeeeee'}:s=1080x1920:d=1.5:r=30`]).flat()
  const cadena = Array.from({ length: 20 }, (_, i) => `[${i}:v]`).join('')
  ffmpeg(
    [...entradas, '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30',
      '-filter_complex', `${cadena}concat=n=20:v=1:a=0[v]`,
      '-map', '[v]', '-map', '20:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', referencia],
    'la referencia de prueba'
  )
}
console.log('medios de prueba generados con FFmpeg ✓')

// Agente de prueba: lee el prompt y responde una ficha fija. No usa ningún agente real.
const agenteFalso = join(medios, 'agente-falso.mjs')
writeFileSync(
  agenteFalso,
  `let e = ''
process.stdin.on('data', (d) => (e += d))
process.stdin.on('end', () => {
  const vioImagenes = /hoja-1\\.jpg|ref-01\\.jpg/.test(e)
  console.log(JSON.stringify({
    resumen: 'Cortes rápidos alternando blanco y negro' + (vioImagenes ? '' : ' (sin imágenes)'),
    subtitulos: { lleva: false },
    recursos: [{ tipo: 'material', cuantos: 20, descripcion: 'planos' }, { tipo: 'motion', cuantos: 1, descripcion: 'flash' }],
    aproximada: !vioImagenes
  }))
})
`
)

// --- 1. calcularViabilidad, compilada al vuelo con esbuild (función pura de shared/estilo.ts) ---
{
  const paquete = join(medios, 'estilo-bundle.mjs')
  const tsc = join(raiz, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
  const b = spawnSync(
    tsc,
    [join(raiz, 'src', 'shared', 'estilo.ts'), '--ignoreConfig', '--outDir', medios, '--module', 'es2022', '--target', 'es2022', '--moduleResolution', 'bundler', '--skipLibCheck'],
    { stdio: 'pipe', shell: process.platform === 'win32' }
  )
  if (b.status !== 0) throw new Error(`No pude compilar estilo.ts: ${b.stdout?.toString().slice(-300)}`)
  renameSync(join(medios, 'estilo.js'), paquete)
  const { calcularViabilidad } = await import(`file:///${paquete.replace(/\\/g, '/')}`)
  const recursos = [
    { tipo: 'material', cuantos: 1, descripcion: '' },
    { tipo: 'motion', cuantos: 1, descripcion: '' },
    { tipo: 'subtitulos', cuantos: 1, descripcion: '' },
    { tipo: 'imagen_generada', cuantos: 2, descripcion: '' },
    { tipo: 'clip_generado', cuantos: 1, descripcion: '' },
    { tipo: 'voz', cuantos: 1, descripcion: '' },
    { tipo: 'musica', cuantos: 1, descripcion: '' }
  ]
  const base = { flow: false, chatgpt: false, vozGemini: false, hyperframes: true }
  const sin = calcularViabilidad(recursos, base)
  // Sin nada: material+motion+subtítulos (60 de 90) → 67 %; imagen, clip, voz y música se sustituyen.
  if (sin.porcentaje !== 67) throw new Error(`Viabilidad sin conexiones: esperaba 67, salió ${sin.porcentaje}`)
  if (sin.items.find((i) => i.tipo === 'clip_generado')?.estado !== 'sustituir') throw new Error('Sin Flow, los clips deben sustituirse.')
  const con = calcularViabilidad(recursos, { flow: true, chatgpt: true, vozGemini: true, hyperframes: true })
  // Con todo: solo la música se sustituye (la sube el usuario) → 85/90 = 94 %.
  if (con.porcentaje !== 94) throw new Error(`Viabilidad con todo conectado: esperaba 94, salió ${con.porcentaje}`)
  if (con.items.find((i) => i.tipo === 'musica')?.estado !== 'sustituir') throw new Error('La música siempre la sube el usuario.')
  if (!sin.paraConectar.length) throw new Error('Sin conexiones debió proponer qué conectar.')
  // Sin HyperFrames, los motion graphics no salen: 45/90 = 50 %.
  const sinHf = calcularViabilidad(recursos, { ...base, hyperframes: false })
  if (sinHf.porcentaje !== 50 || sinHf.items.find((i) => i.tipo === 'motion')?.estado !== 'sustituir') throw new Error(`Sin HyperFrames: esperaba 50, salió ${sinHf.porcentaje}`)
  // Subtítulos palabra por palabra: hoy salen por frase → parcial (cuenta la mitad): 52,5/90 = 58 %.
  const palabra = calcularViabilidad(recursos, base, { conMaterial: true, subtitulosPalabra: true })
  if (palabra.porcentaje !== 58 || palabra.items.find((i) => i.tipo === 'subtitulos')?.estado !== 'parcial') throw new Error(`Palabra por palabra: esperaba 58 (parcial), salió ${palabra.porcentaje}`)
  // Sin material del usuario: esa parte se diseña: 30/90 = 33 %.
  const sinMaterial = calcularViabilidad(recursos, base, { conMaterial: false, subtitulosPalabra: false })
  if (sinMaterial.porcentaje !== 33) throw new Error(`Sin material: esperaba 33, salió ${sinMaterial.porcentaje}`)
  // Recortar a la persona aún no existe: nunca se promete.
  const recorte = calcularViabilidad([{ tipo: 'recorte', cuantos: 2, descripcion: '' }], { flow: true, chatgpt: true, vozGemini: true, hyperframes: true })
  if (recorte.porcentaje !== 0 || recorte.items[0].estado !== 'sustituir') throw new Error('Los recortes de persona no se pueden prometer todavía.')
  console.log('viabilidad: con y sin Flow/ChatGPT (simulados) ✓')
}

// --- 2-4. La app real, con datos temporales ---
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

/** Procesos ffmpeg.exe cuya línea de comandos toca la carpeta temporal de esta prueba. */
function ffmpegDeLaPrueba() {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'" | Where-Object { $_.CommandLine -like '*${datos}*' } | Measure-Object | Select-Object -ExpandProperty Count`],
    { stdio: 'pipe' }
  )
  return Number(r.stdout?.toString().trim()) || 0
}

let cliente

try {
  const pagina = await esperarPagina()
  cliente = conectar(pagina.webSocketDebuggerUrl)
  await cliente.listo
  await cliente.enviar('Runtime.enable')
  await new Promise((listo) => setTimeout(listo, 1200))

  await evaluar(
    cliente,
    `window.recorte.guardarAjustes(${JSON.stringify({ activa: true, proveedor: 'cli', comandoCli: `node "${agenteFalso}"`, baseUrl: '', modelo: '' })})`
  )

  // Sin referencia: la creación no cambia (entra directo en el guion).
  const sinRef = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({ peticion: 'prueba sin referencia', estilo: 'libre', formato: 'vertical', duracion: 15, adjuntos: [] })})`
  )
  if (sinRef.fase === 'estilo' || sinRef.referencia || sinRef.ficha) {
    throw new Error(`Una creación sin referencia no debió tocar la fase Estilo: fase=${sinRef.fase}`)
  }
  console.log('sin referencia: la creación entra en el guion, como siempre ✓')

  // Con referencia: fase Estilo y la referencia copiada.
  const creacion = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({
      peticion: 'Un clip vertical con el estilo de la referencia',
      estilo: 'libre',
      formato: 'vertical',
      duracion: 30,
      adjuntos: [material],
      referencia
    })})`
  )
  if (creacion.fase !== 'estilo') throw new Error(`Con referencia debió empezar en la fase Estilo, salió ${creacion.fase}`)
  if (!creacion.referencia?.archivo) throw new Error('La referencia no se guardó en la creación.')
  const carpeta = join(datos, 'creaciones', creacion.id)
  if (!existsSync(join(carpeta, 'analisis', 'referencia.mp4'))) throw new Error('La referencia no se convirtió a analisis/referencia.mp4.')
  console.log('con referencia: fase Estilo y referencia convertida ✓')

  // Parar mata el FFmpeg en marcha: se lanza el análisis sin esperar y se para a los pocos segundos.
  const parada = await evaluar(
    cliente,
    `window.recorte.creacionNueva(${JSON.stringify({
      peticion: 'prueba de parada',
      estilo: 'libre',
      formato: 'vertical',
      duracion: 30,
      adjuntos: [material],
      referencia
    })})`
  )
  void evaluar(cliente, `window.recorte.estiloAnalizar(${JSON.stringify(parada.id)})`).catch(() => {})
  let visto = 0
  for (let i = 0; i < 120 && visto === 0; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    visto = ffmpegDeLaPrueba()
  }
  if (!visto) throw new Error('No vi ningún FFmpeg del análisis para probar la parada.')
  await evaluar(cliente, `window.recorte.creacionParar(${JSON.stringify(parada.id)})`)
  let vivos = visto
  for (let i = 0; i < 60 && vivos > 0; i += 1) {
    await new Promise((r) => setTimeout(r, 500))
    vivos = ffmpegDeLaPrueba()
  }
  if (vivos > 0) throw new Error(`Tras parar quedaron ${vivos} FFmpeg vivos.`)
  console.log('parar: mata el FFmpeg en marcha ✓')

  // Análisis completo (puede tardar varios minutos: FFmpeg, Whisper y el agente).
  console.log('análisis: midiendo material y referencia, y pidiendo la ficha al agente (puede tardar)…')
  const analizada = await evaluar(cliente, `window.recorte.estiloAnalizar(${JSON.stringify(creacion.id)})`, 20 * 60_000)

  const materialJson = JSON.parse(readFileSync(join(carpeta, 'analisis', 'material.json'), 'utf8'))
  const video = materialJson.videos?.[0]
  if (!video?.escenas?.length) throw new Error('material.json no tiene escenas.')
  if (video.escenas.length < 28) throw new Error(`El material dura 2 min y corta cada 4 s (≈30 planos); se detectaron ${video.escenas.length}. ¿Se recortó el adjunto?`)
  if (Math.abs(video.duracion - 120) > 2) throw new Error(`El material debió entrar completo (120 s); entró con ${video.duracion} s.`)
  for (const e of video.escenas) {
    if (!existsSync(join(carpeta, e.miniatura))) throw new Error(`Falta la miniatura ${e.miniatura}.`)
  }
  console.log(`material.json: ${video.escenas.length} escenas con miniatura ✓`)

  const medido = JSON.parse(readFileSync(join(carpeta, 'analisis', 'estilo-medido.json'), 'utf8'))
  if (medido.medianaPlano < 1.2 || medido.medianaPlano > 1.8) {
    throw new Error(`La referencia corta cada 1,5 s; la mediana salió ${medido.medianaPlano}.`)
  }
  if (medido.formato !== '9:16') throw new Error(`La referencia es vertical; el formato salió ${medido.formato}.`)
  console.log(`estilo-medido.json: mediana ${medido.medianaPlano} s por plano, formato ${medido.formato} ✓`)

  if (!analizada.ficha?.resumen) throw new Error('El análisis no dejó ficha de estilo.')
  // La ficha tiene que venir del agente (no del respaldo con lo medido), y el agente tuvo que recibir las imágenes.
  if (!analizada.ficha.resumen.startsWith('Cortes rápidos')) {
    const motivo = registros.split('\n').filter((l) => l.includes('[estilo]')).join(' / ')
    throw new Error(`La ficha no salió del agente sino del respaldo: ${analizada.ficha.nota ?? ''} ${motivo}`)
  }
  if (analizada.ficha.aproximada) throw new Error('El agente no recibió las rutas de las imágenes de la referencia.')
  if (!analizada.viabilidad || typeof analizada.viabilidad.porcentaje !== 'number') throw new Error('El análisis no dejó informe de viabilidad.')
  if (analizada.viabilidad.porcentaje < 0 || analizada.viabilidad.porcentaje > 100) throw new Error('Porcentaje de viabilidad fuera de rango.')
  // Sin nada conectado (datos temporales): lo generado se sustituye y se propone qué conectar.
  const generado = analizada.viabilidad.items.filter((i) => i.tipo === 'imagen_generada' || i.tipo === 'clip_generado')
  if (generado.some((i) => i.estado === 'si')) throw new Error('Sin Flow ni ChatGPT, lo generado debió marcarse para sustituir.')
  if (Math.abs((analizada.ficha.ritmoSegundos ?? 0) - medido.medianaPlano) > 0.15) throw new Error(`La ficha debió traer el ritmo medido (${medido.medianaPlano}); trae ${analizada.ficha.ritmoSegundos}.`)
  console.log(`ficha («${analizada.ficha.resumen.slice(0, 60)}…», ritmo ${analizada.ficha.ritmoSegundos} s) y viabilidad (${analizada.viabilidad.porcentaje} %) ✓`)

  // Recalcular no vuelve a analizar: responde con la misma ficha y viabilidad fresca.
  const recalculada = await evaluar(cliente, `window.recorte.estiloViabilidad(${JSON.stringify(creacion.id)})`)
  if (recalculada.ficha?.resumen !== analizada.ficha.resumen) throw new Error('Recalcular la viabilidad tocó la ficha.')
  console.log('estilo:viabilidad recalcula sin volver a analizar ✓')

  // Editar la ficha a mano: ritmo y subtítulos.
  const editada = await evaluar(
    cliente,
    `window.recorte.estiloFichaGuardar(${JSON.stringify(creacion.id)}, ${JSON.stringify({ ritmoSegundos: 2, subtitulos: { lleva: true, modo: 'palabra' } })})`
  )
  if (editada.ficha?.ritmoSegundos !== 2 || editada.ficha?.subtitulos?.modo !== 'palabra') throw new Error('La edición a mano de la ficha no se guardó.')
  console.log('estilo:ficha-guardar guarda ritmo y subtítulos ✓')

  // Continuar deja la fase Estilo y pasa al guion.
  const continuada = await evaluar(cliente, `window.recorte.estiloContinuar(${JSON.stringify(creacion.id)})`)
  if (continuada.fase !== 'guion') throw new Error(`Tras continuar debió pasar al guion, salió ${continuada.fase}.`)
  console.log('estilo:continuar pasa al guion ✓')

  console.log('prueba estilo: ok')
} catch (error) {
  console.error(`prueba estilo: error · ${error instanceof Error ? error.message : String(error)}`)
  if (registros.trim()) console.error(registros.trim().slice(-3000))
  process.exitCode = 1
} finally {
  cliente?.cerrar()
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(electron.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    electron.kill()
  }
  // Borra lo temporal (Electron puede tardar un momento en soltar sus archivos).
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
