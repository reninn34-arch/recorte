// La portada, como en CapCut: se pone desde el botón de al lado de la pista de video (un momento del video con título,
// o una foto) y el MP4 la lleva como miniatura y en su primer cuadro. Uso: npm run build && node scripts/vista-portada.mjs
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
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'sine=f=300:r=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
const foto = join(datos, 'foto.png')
ff(['-f', 'lavfi', '-i', 'color=c=0x0a6cf0:s=400x400', '-frames:v', '1', foto])

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
  const agregados = await evaluar(`window.recorte.agregarRutasProyecto(${JSON.stringify(id)}, [${JSON.stringify(foto)}])`)
  const imagen = agregados?.agregados?.[0]
  comprobar(Boolean(imagen), 'la foto entró a la biblioteca')
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

  // 1) La portada está al lado de la pista de video, como en CapCut.
  const boton = await caja('.tl-nombre.p-video .tl-portada')
  comprobar(Boolean(boton), 'al lado de la pista de video está el botón «Portada»')
  await clic(boton.x + boton.w / 2, boton.y + boton.h / 2)
  await esperar(800)
  comprobar(await evaluar(`Boolean(document.querySelector('.portada-caja'))`), 'se abre la ventana de la portada')

  // 2) Del video: un momento (2 s), con título.
  await evaluar(`(() => { const r = document.querySelector('.portada-momento input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(r, '2'); r.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const area = await caja('.portada-texto')
  await clic(area.x + 20, area.y + 10)
  await c.enviar('Input.insertText', { text: 'MI PORTADA' })
  // Espera a que llegue el cuadro (lo pinta FFmpeg).
  for (let i = 0; i < 60 && (await evaluar(`Boolean(document.querySelector('.portada-cargando'))`)); i++) await esperar(500)
  comprobar(!(await evaluar(`Boolean(document.querySelector('.portada-cargando'))`)), 'llega el cuadro de ese momento')
  await esperar(500)
  await captura('ventana.png')
  // El título se pinta en amarillo para reconocerlo luego en el MP4.
  await evaluar(`(() => { const i = [...document.querySelectorAll('.portada-colores input[type=color]')][0]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '#ffee00'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await esperar(400)
  await evaluar(`[...document.querySelectorAll('.portada-botones button')].find((b) => /Guardar portada/.test(b.textContent))?.click()`)
  await esperar(2500)
  let tl = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  const p = tl.portada
  comprobar(p && p.origen === 'cuadro' && Math.abs(p.t - 2) < 0.05 && p.texto === 'MI PORTADA' && /^portada\/portada-[a-f0-9]+\.png$/.test(p.archivo ?? '') && p.alInicio === true, `la portada queda en el proyecto (${JSON.stringify(p)})`)
  comprobar(await evaluar(`getComputedStyle(document.querySelector('.tl-portada')).backgroundImage.includes('portada')`), 'el botón enseña la portada')
  // 3) En el monitor, en el segundo 0, se ve la portada (igual que el primer cuadro del MP4).
  comprobar(await evaluar(`Boolean(document.querySelector('.monitor-portada'))`), 'en el segundo 0 el monitor enseña la portada')

  // 4) El MP4: la portada como miniatura y en el primer cuadro; el segundo cuadro ya es el video.
  const r = await evaluar(`window.recorte.exportarTimeline(${JSON.stringify(id)}, ${JSON.stringify(tl)}, { formato: 'original', subtitulos: false }).catch((e) => ({ ok: false, error: String(e) }))`)
  comprobar(r?.ok && r.output, `se exportó el MP4 (${r?.error ?? 'bien'})`)
  if (r?.ok) {
    const sp = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=index,codec_name:stream_disposition=attached_pic', '-of', 'json', r.output], { encoding: 'utf8' })
    const streams = JSON.parse(sp.stdout).streams
    comprobar(streams.some((s) => s.disposition?.attached_pic === 1), `el MP4 lleva la portada como miniatura (${streams.map((s) => `${s.codec_name}${s.disposition?.attached_pic ? '·portada' : ''}`).join(', ')})`)
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.output], { encoding: 'utf8' }).stdout)
    comprobar(Math.abs(dur - 4) < 0.1, `dura lo mismo (${dur.toFixed(2)} s)`)
    const amarillo = (n) => {
      const px = [...spawnSync('ffmpeg', ['-v', 'error', '-i', r.output, '-map', '0:v:0', '-vf', `select=eq(n\\,${n}),crop=iw:ih*0.12:0:ih*0.72,scale=64:8`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout]
      let k = 0
      for (let i = 0; i < px.length; i += 3) if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] < 90) k++
      return k
    }
    comprobar(amarillo(0) > 8, `el primer cuadro es la portada, con su título amarillo (${amarillo(0)} puntos)`)
    // El tercer cuadro ya es el video: distinto del primero (que trae el título) y casi igual al cuarto.
    const cuadro = (n) => [...spawnSync('ffmpeg', ['-v', 'error', '-i', r.output, '-map', '0:v:0', '-vf', `select=eq(n\\,${n}),scale=32:18`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout]
    const dif = (a, b) => a.reduce((t, x, i) => t + Math.abs(x - b[i]), 0) / a.length
    const [c0, c2, c3] = [cuadro(0), cuadro(2), cuadro(3)]
    comprobar(dif(c0, c2) > 6 && dif(c0, c2) > 3 * dif(c2, c3), `el tercer cuadro ya es el video (del primero al tercero cambia ${dif(c0, c2).toFixed(1)}; del tercero al cuarto, ${dif(c2, c3).toFixed(1)})`)
    comprobar(existsSync(r.output.replace(/\.mp4$/i, '.jpg')), 'al lado queda la portada en .jpg')
  }

  // 5) Una foto de la biblioteca en vez de un momento.
  await clic(boton.x + boton.w / 2, boton.y + boton.h / 2)
  await esperar(800)
  await evaluar(`[...document.querySelectorAll('.portada-pestanas button')].find((b) => /Una foto/.test(b.textContent))?.click()`)
  await esperar(1500)
  comprobar(await evaluar(`document.querySelectorAll('.portada-fotos button').length`) === 1, 'en «Una foto» salen las fotos de la biblioteca')
  await evaluar(`[...document.querySelectorAll('.portada-botones button')].find((b) => /Guardar portada/.test(b.textContent))?.click()`)
  await esperar(2500)
  tl = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  comprobar(tl.portada?.origen === 'imagen' && tl.portada.fuente === imagen, `la portada pasa a ser la foto (${tl.portada?.origen})`)
  await captura('final.png')
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
