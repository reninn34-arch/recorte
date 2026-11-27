// La portada, como en CapCut, con un video vertical: la vista tiene la forma del video, la tira de cuadros elige el
// momento, el título se arrastra en la vista con un estilo con caja, se sube una imagen de una carpeta (sin pasar por
// la biblioteca) y el MP4 la lleva como miniatura. Uso: npm run build && node scripts/vista-portada.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9342
const datos = join(tmpdir(), `recorte-vista-portada-${Date.now()}`)
const salida = join(tmpdir(), 'recorte-vista-portada')
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const video = join(datos, 'prueba-portada.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=4:r=30', '-f', 'lavfi', '-i', 'sine=f=300:r=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
const foto = join(datos, 'foto.png')
ff(['-f', 'lavfi', '-i', 'color=c=0x0a6cf0:s=400x400', '-frames:v', '1', foto])

const entorno = { ...process.env }
delete entorno.ELECTRON_RUN_AS_NODE
// «Subir imagen» elige esta foto sin diálogo (en una prueba no hay quien elija).
entorno.RECORTE_PRUEBA_IMAGEN_PORTADA = foto
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
const raton = (type, x, y) => c.enviar('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })
/** Arrastra con el ratón de (x, y) a (x + dx, y), en pasos, como una mano. */
async function arrastrar(x, y, dx, dy = 0) {
  await c.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await raton('mousePressed', x, y)
  for (let i = 1; i <= 8; i++) {
    await c.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (dx * i) / 8, y: y + (dy * i) / 8, button: 'left', buttons: 1 })
    await esperar(20)
  }
  await raton('mouseReleased', x + dx, y + dy)
  await esperar(400)
}
const clic = async (x, y) => {
  await c.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await raton('mousePressed', x, y)
  await raton('mouseReleased', x, y)
  await esperar(300)
}
const tecla = async (key, code, vk) => {
  await evaluar(`document.activeElement?.blur?.()`)
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk })
  await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk })
  await esperar(400)
}
/** El rectángulo de un elemento de la página. */
const caja = (sel, i = 0) => evaluar(`(() => { const el = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
/** La timeline tal como la tiene el editor (la guardada, después del autoguardado). */
let id
const leer = async () => {
  await esperar(1600)
  return (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
}


try {
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await esperar(1500)
  const ingesta = await evaluar(`window.recorte.crearProyecto(${JSON.stringify(video)})`)
  id = ingesta.project.id
  await evaluar(`location.reload()`).catch(() => {})
  await esperar(2500)
  c.cerrar()
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await esperar(1500)
  const abierto = await evaluar(`(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('.tl-carril.video .tl-clip')) return true
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\\s*prueba portada/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
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
  await esperar(600)

  // 1) La portada, al lado de la pista de video.
  const boton = await caja('.tl-nombre.p-video .tl-portada')
  comprobar(Boolean(boton), 'al lado de la pista de video está el botón «Portada»')
  await clic(boton.x + boton.w / 2, boton.y + boton.h / 2)
  await esperar(800)
  comprobar(await evaluar(`Boolean(document.querySelector('.portada-caja'))`), 'se abre la ventana de la portada')

  // 2) La vista tiene la forma del video (vertical), sin aplastarse.
  for (let i = 0; i < 40 && (await evaluar(`Boolean(document.querySelector('.portada-cargando'))`)); i++) await esperar(500)
  const vista = await caja('.portada-marco canvas')
  const forma = vista.w / vista.h
  comprobar(Math.abs(forma - 720 / 1280) < 0.01, `la vista tiene la forma del video vertical (${vista.w.toFixed(0)}×${vista.h.toFixed(0)}, ${forma.toFixed(3)} y debe ser ${(720 / 1280).toFixed(3)})`)

  // 3) La tira de cuadros: aparece, y arrastrar en ella elige el momento.
  for (let i = 0; i < 40 && (await evaluar(`document.querySelectorAll('.portada-tira img').length`)) < 4; i++) await esperar(500)
  const nTira = await evaluar(`document.querySelectorAll('.portada-tira img').length`)
  comprobar(nTira >= 10, `debajo sale la tira de cuadros del video (${nTira})`)
  const tira = await caja('.portada-tira')
  await arrastrar(tira.x + tira.w * 0.2, tira.y + tira.h / 2, tira.w * 0.5)
  const tc = await evaluar(`document.querySelector('.portada-tc').textContent`)
  comprobar(/^00:00:0[2-3]:/.test(tc), `arrastrar en la tira lleva el momento a ~2,8 s (${tc})`)
  for (let i = 0; i < 40 && (await evaluar(`Boolean(document.querySelector('.portada-cargando'))`)); i++) await esperar(500)
  comprobar(!(await evaluar(`Boolean(document.querySelector('.portada-cargando'))`)), 'al soltar llega el cuadro exacto')

  // 4) El título: un estilo con caja, y se arrastra en la vista.
  const area = await caja('.portada-texto')
  await clic(area.x + 20, area.y + 10)
  await c.enviar('Input.insertText', { text: 'MI PORTADA' })
  await evaluar(`[...document.querySelectorAll('.portada-estilos button')].find((b) => /Caja roja/.test(b.textContent))?.click()`)
  await esperar(600)
  await captura('ventana-vertical.png')
  // El título está abajo (80 %): se arrastra hacia arriba.
  const v2 = await caja('.portada-marco canvas')
  await arrastrar(v2.x + v2.w / 2, v2.y + v2.h * 0.8, 0, -v2.h * 0.5)
  await esperar(400)

  await evaluar(`[...document.querySelectorAll('.portada-botones button')].find((b) => /Guardar portada/.test(b.textContent))?.click()`)
  await esperar(2500)
  let tl = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  const p = tl.portada
  comprobar(p && p.origen === 'cuadro' && p.t > 2 && p.t < 3.5 && p.texto === 'MI PORTADA' && p.caja === '#e3262e' && p.y < 0.45 && /^portada\/portada-[a-f0-9]+\.png$/.test(p.archivo ?? ''), `la portada queda con su momento, su título arrastrado arriba y su caja (${JSON.stringify(p)})`)
  // La imagen guardada tiene la medida del video.
  const medida = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(datos, 'proyectos', id, p.archivo)], { encoding: 'utf8' }).stdout.trim()
  comprobar(medida === '720,1280', `la portada guardada mide como el video (${medida})`)
  // Arriba, la caja roja del título.
  const rojo = [...spawnSync('ffmpeg', ['-v', 'error', '-i', join(datos, 'proyectos', id, p.archivo), '-vf', `crop=iw:ih*0.12:0:ih*${(p.y - 0.06).toFixed(3)},scale=32:4`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout]
  let rojos = 0
  for (let i = 0; i < rojo.length; i += 3) if (rojo[i] > 180 && rojo[i + 1] < 90 && rojo[i + 2] < 90) rojos++
  comprobar(rojos > 6, `en la portada se ve la caja roja donde quedó el título (${rojos} zonas rojas)`)

  // 5) Subir una imagen de una carpeta (sin pasar por la biblioteca).
  await clic(boton.x + boton.w / 2, boton.y + boton.h / 2)
  await esperar(800)
  await evaluar(`[...document.querySelectorAll('.portada-modos button')].find((b) => /Subir imagen/.test(b.textContent))?.click()`)
  await esperar(400)
  await evaluar(`document.querySelector('.portada-subir .btn')?.click()`)
  await esperar(1500)
  await captura('subida.png')
  await evaluar(`[...document.querySelectorAll('.portada-botones button')].find((b) => /Guardar portada/.test(b.textContent))?.click()`)
  await esperar(2500)
  tl = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  comprobar(tl.portada?.origen === 'archivo' && /^portada\/foto-[a-f0-9]+\.png$/.test(tl.portada.foto ?? ''), `la portada pasa a ser la imagen subida (${tl.portada?.origen} ${tl.portada?.foto})`)
  const biblioteca = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).medios ?? []
  comprobar(biblioteca.length === 0, 'la imagen subida no entra a la biblioteca')

  // 6) El MP4 la lleva como miniatura.
  const r = await evaluar(`window.recorte.exportarTimeline(${JSON.stringify(id)}, ${JSON.stringify(tl)}, { formato: 'original', subtitulos: false }).catch((e) => ({ ok: false, error: String(e) }))`)
  comprobar(r?.ok && r.output, `se exportó el MP4 (${r?.error ?? 'bien'})`)
  if (r?.ok) {
    const sp = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_name:stream_disposition=attached_pic', '-of', 'json', r.output], { encoding: 'utf8' })
    const streams = JSON.parse(sp.stdout).streams
    comprobar(streams.some((s) => s.disposition?.attached_pic === 1), `el MP4 lleva la portada como miniatura (${streams.map((s) => `${s.codec_name}${s.disposition?.attached_pic ? '·portada' : ''}`).join(', ')})`)
  }
} catch (error) {
  console.error(error)
  fallos++
} finally {
  c?.cerrar()
  app.kill()
  await esperar(800)
  try { rmSync(datos, { recursive: true, force: true }) } catch {}
  console.log(fallos ? `\n${fallos} MAL (capturas en ${salida})` : '\ntodo bien')
  process.exitCode = fallos ? 1 : 0
}
