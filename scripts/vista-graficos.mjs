// Los gráficos editables en la app de verdad: poner una plantilla desde la pestaña «Gráficos», cambiar su texto (se
// vuelve a dibujar y la capa sigue en su sitio), deshacer, que no llene la biblioteca, y que el monitor y el MP4 se vean igual.
// Uso: npm run build && node scripts/vista-graficos.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9335
const datos = join(tmpdir(), `recorte-vista-graficos-${Date.now()}`)
const salida = join(tmpdir(), 'recorte-vista-graficos')
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const video = join(datos, 'prueba-graficos-recorte.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:d=4:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', '-shortest', '-vf', 'eq=brightness=-0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])

const entorno = { ...process.env }
delete entorno.ELECTRON_RUN_AS_NODE
const app = spawn(electronPath, ['.', `--remote-debugging-port=${puerto}`, `--user-data-dir=${datos}`], { cwd: raiz, stdio: 'ignore', env: entorno })

async function pagina() {
  for (let i = 0; i < 160; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()
      const p = lista.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
      if (p?.webSocketDebuggerUrl) return p
    } catch {}
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('No apareció la ventana.')
}
function conectar(url) {
  const ws = new WebSocket(url)
  let n = 0
  const pend = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    const p = pend.get(m.id)
    if (!p) return
    pend.delete(m.id)
    m.error ? p[1](new Error(m.error.message)) : p[0](m.result)
  })
  return {
    listo: new Promise((r) => ws.addEventListener('open', r, { once: true })),
    enviar: (method, params = {}) => new Promise((ok, mal) => { const id = ++n; pend.set(id, [ok, mal]); ws.send(JSON.stringify({ id, method, params })) }),
    cerrar: () => ws.close()
  }
}
let c
const evaluar = async (expr) => {
  const r = await c.enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let fallos = 0
const comprobar = (ok, texto) => {
  console.log(`${ok ? 'bien' : 'MAL'}: ${texto}`)
  if (!ok) fallos++
}
const captura = async (nombre) => {
  const s = await c.enviar('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(salida, nombre), Buffer.from(s.data, 'base64'))
}

try {
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await esperar(1500)
  const ingesta = await evaluar(`window.recorte.crearProyecto(${JSON.stringify(video)})`)
  const id = ingesta.project.id
  const timeline = { version: 1, clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 4 }], textos: [] }
  await evaluar(`(async () => { const p = await window.recorte.abrirProyecto(${JSON.stringify(id)}); await window.recorte.guardarProyecto({ ...p, brand: { ...p.brand, primary: '#0a6cf0', secondary: '#00c2a8' }, timeline: ${JSON.stringify(timeline)} }); location.reload() })()`).catch(() => {})
  await esperar(2500)
  c.cerrar()
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await esperar(1500)
  const abierto = await evaluar(`(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('.monitor-cuadro')?.getBoundingClientRect().width > 0) return true
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\\s*prueba graficos recorte/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
      if (tarjeta) tarjeta.click()
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  })()`)
  if (!abierto) {
    await captura('no-abrio.png')
    throw new Error(`No pude abrir el proyecto (captura en ${salida}).`)
  }
  await esperar(1500)
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ahora no/.test(b.textContent || ''))?.click()`)
  await esperar(800)
  // El cabezal en 1 s.
  await evaluar(`(() => { const v = document.querySelector('.monitor-video'); return true })()`)
  // La pestaña «Gráficos».
  const pestana = await evaluar(`(() => { const b = [...document.querySelectorAll('button, [role=tab]')].find((x) => (x.textContent || '').trim() === 'Gráficos' || x.title === 'Gráficos' || x.getAttribute('aria-label') === 'Gráficos'); if (b) b.click(); return Boolean(b) })()`)
  comprobar(pestana, 'está la pestaña «Gráficos»')
  await esperar(500)
  const puesta = await evaluar(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Tarjeta con palabra clave')); if (b) b.click(); return Boolean(b) })()`)
  comprobar(puesta, 'está la plantilla «Tarjeta con palabra clave»')
  await esperar(2500)
  const leerCapa = () => evaluar(`(async () => { const p = await window.recorte.abrirProyecto(${JSON.stringify(id)}); return null })()`)
  void leerCapa
  // Lo que hay en el monitor.
  const capas = () => evaluar(`[...document.querySelectorAll('.monitor-capa:not(.is-fin)')].map((el) => ({ id: el.dataset.capa, left: el.style.left, top: el.style.top, ancho: el.getBoundingClientRect().width, src: el.querySelector('img')?.getAttribute('src') ?? '' }))`)
  const antes = await capas()
  comprobar(antes.length === 1, `la tarjeta quedó como una capa en el monitor (${antes.length})`)
  await captura('puesta.png')
  const editor = await evaluar(`Boolean([...document.querySelectorAll('.ed-seccion')].find((s) => /^Gráfico:/.test(s.textContent || '')))`)
  comprobar(editor, 'el panel muestra el gráfico para editarlo')
  const biblioteca = await evaluar(`document.querySelectorAll('.medios-grid .medio, .medios-grid > *').length`)
  console.log(`elementos en la biblioteca: ${biblioteca}`)
  // Cambiar el primer texto, como al escribir.
  const escrito = await evaluar(`(() => {
    const t = document.querySelector('.gr-texto')
    if (!t) return false
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    set.call(t, 'Una palabra clave mucho más larga')
    t.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  comprobar(escrito, 'se puede escribir el texto del gráfico')
  await esperar(2500)
  const despues = await capas()
  comprobar(despues.length === 1 && despues[0].src !== antes[0]?.src, 'al cambiar el texto se volvió a dibujar')
  comprobar(despues[0]?.left === antes[0]?.left && despues[0]?.top === antes[0]?.top, 'la capa sigue en su sitio')
  comprobar(despues[0]?.ancho > antes[0]?.ancho * 1.05, `con más texto la capa es más ancha (${Math.round(antes[0]?.ancho)} → ${Math.round(despues[0]?.ancho)})`)
  await captura('editada.png')
  // Deshacer: vuelve el texto anterior (y su dibujo).
  await evaluar(`document.activeElement?.blur?.()`)
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 })
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 })
  await esperar(1500)
  const deshecho = await capas()
  comprobar(deshecho[0]?.src === antes[0]?.src, 'Ctrl+Z vuelve al dibujo anterior')
  const textoPanel = await evaluar(`document.querySelector('.gr-texto')?.value ?? null`)
  comprobar(textoPanel === 'Palabra clave', `y el panel muestra el texto anterior («${textoPanel}»)`)
  await esperar(2000)
  const sigue = await capas()
  comprobar(sigue[0]?.src === antes[0]?.src, 'deshacer no se vuelve a pisar con un dibujo nuevo')

  // Monitor contra MP4, con la timeline guardada.
  const p = await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)
  const tl = p.timeline
  comprobar(Boolean(tl?.capas?.[0]?.grafico), 'la timeline guardada lleva el diseño del gráfico')
  const sinDibujos = (p.medios ?? []).every((m) => !/[\\/]graficos[\\/]/.test(m.ruta)) === false
  comprobar(sinDibujos, 'el dibujo está en la biblioteca del proyecto (oculto)')
  const caja = await evaluar(`(() => { const r = document.querySelector('.monitor-cuadro').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
  // Sin elegir nada (el marco de los tiradores no debe salir en la foto) y con el cabezal en 1 s (ya entró del todo).
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await evaluar(`document.activeElement?.blur?.()`)
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', modifiers: 8, windowsVirtualKeyCode: 39 })
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', modifiers: 8, windowsVirtualKeyCode: 39 })
  await esperar(1200)
  const tc1 = await evaluar(`document.querySelector('.tl-tc-grande')?.textContent ?? ''`)
  const m1 = /(\d+):(\d+):(\d+):(\d+)/.exec(tc1)
  const t1 = m1 ? Number(m1[3]) + Number(m1[4]) / 30 : 0
  comprobar(t1 >= 0.9, `el cabezal está en ${t1.toFixed(2)} s`)
  const visible = await evaluar(`(() => { const el = document.querySelector('.monitor-capa:not(.is-fin)'); return el ? el.getBoundingClientRect().width : 0 })()`)
  comprobar(visible > 50, 'en el monitor se ve la tarjeta')
  const mon = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: caja.x, y: caja.y, width: caja.w, height: caja.h, scale: 1 } })
  const pngMonitor = join(salida, 'monitor.png')
  writeFileSync(pngMonitor, Buffer.from(mon.data, 'base64'))
  const cuadro = await evaluar(`window.recorte.exportarCuadro(${JSON.stringify(id)}, ${JSON.stringify(tl)}, ${t1})`)
  if (!cuadro.ok) throw new Error(cuadro.error)
  const w = Math.round(caja.w)
  const h = Math.round(caja.h)
  const pngMp4 = join(salida, 'mp4.png')
  ff(['-i', cuadro.archivo, '-vf', `scale=${w}:${h}:flags=area`, pngMp4])
  ff(['-i', pngMonitor, '-i', pngMp4, '-filter_complex', `[0]scale=${w}:${h}[a];[a][1]hstack`, join(salida, 'lado-a-lado.png')])
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', pngMonitor, '-i', pngMp4, '-filter_complex', `[0]scale=${w}:${h},format=gray[a];[1]format=gray[b];[a][b]blend=all_mode=difference,scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  console.log(`cabezal ${t1.toFixed(2)} s · diferencia media monitor/MP4: ${r.stdout[0]} de 255 · imágenes en ${salida}`)
  comprobar(r.stdout[0] <= 6, 'el monitor y el MP4 se ven igual')
  rmSync(cuadro.archivo, { force: true })
  try { rmdirSync(dirname(cuadro.archivo)) } catch {}
} finally {
  c?.cerrar()
  app.kill()
}
console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien')
if (fallos) process.exitCode = 1
