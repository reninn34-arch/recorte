// Cada transición, en el monitor y en el MP4: a dos momentos de cada una, el cuadro del monitor (en pausa) y el del
// video exportado se parecen. Uso: npm run build && node scripts/vista-transiciones.mjs [id …]
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9340
const datos = join(tmpdir(), `recorte-vista-transiciones-${Date.now()}`)
const salida = join(tmpdir(), 'recorte-vista-transiciones')
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const video = join(datos, 'prueba-transiciones.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'sine=f=300:r=48000', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
// Dos fotos con dibujo (no lisas): así se nota si algo se mueve o se recorta distinto.
const fotoA = join(datos, 'a.png')
const fotoB = join(datos, 'b.png')
// Bloques grandes de color: un borde fuera de sitio se nota mucho y el escalado de la captura casi nada.
ff(['-f', 'lavfi', '-i', 'color=c=0xd02020:s=640x360', '-vf', 'drawbox=x=320:y=0:w=320:h=180:color=0x20b040:t=fill,drawbox=x=0:y=180:w=320:h=180:color=0x2040d0:t=fill,drawbox=x=320:y=180:w=320:h=180:color=0xe0d020:t=fill', '-frames:v', '1', fotoA])
ff(['-f', 'lavfi', '-i', 'color=c=0xf0f0f0:s=640x360', '-vf', 'drawbox=x=0:y=0:w=213:h=360:color=0x20d0d0:t=fill,drawbox=x=427:y=0:w=213:h=360:color=0xd020c0:t=fill,drawbox=x=0:y=240:w=640:h=120:color=0x303030:t=fill', '-frames:v', '1', fotoB])
// Todas las transiciones, leídas de la lista de Recorte.
const TODAS = [...readFileSync(join(raiz, 'src', 'shared', 'timeline.ts'), 'utf8').matchAll(/^  \{ id: '([a-z-]+)', nombre: '[^']+', grupo: '/gm)].map((m) => m[1])

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


const SOLO = process.argv.slice(2)
const FPS = 30
const LARGO = 48 // cuadros de cada clip (1,6 s)
const DUR = 24 // cuadros de cada transición (0,8 s)
/** Un PNG o un cuadro de video, reducido a 32×18 y en RGB. */
function pequeno(args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args, '-vf', 'scale=32:18:flags=area', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 })
  if (r.status !== 0) throw new Error(String(r.stderr))
  return r.stdout
}
/** Cuánto se parecen, zona por zona (32×18): la media, la mediana y el 90 % de las zonas. */
const diferencia = (a, b) => {
  const zonas = []
  for (let p = 0; p < a.length / 3; p++) zonas.push((Math.abs(a[p * 3] - b[p * 3]) + Math.abs(a[p * 3 + 1] - b[p * 3 + 1]) + Math.abs(a[p * 3 + 2] - b[p * 3 + 2])) / 3)
  const media = zonas.reduce((t, x) => t + x, 0) / zonas.length
  zonas.sort((x, y) => x - y)
  return { media, mediana: zonas[zonas.length >> 1], p90: zonas[Math.floor(zonas.length * 0.9)] }
}

try {
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await esperar(1500)
  const ingesta = await evaluar(`window.recorte.crearProyecto(${JSON.stringify(video)})`)
  id = ingesta.project.id
  const agregados = await evaluar(`window.recorte.agregarRutasProyecto(${JSON.stringify(id)}, [${JSON.stringify(fotoA)}, ${JSON.stringify(fotoB)}])`)
  const [mA, mB] = agregados?.agregados ?? []
  comprobar(Boolean(mA && mB), 'las dos fotos entraron a la biblioteca')
  const lista = TODAS.filter((t) => t !== 'desenfoque' && (!SOLO.length || SOLO.includes(t)))
  const clips = [{ id: 'k0', fuente: mA, entrada: 0, salida: LARGO / FPS }]
  lista.forEach((t, i) => clips.push({ id: `k${i + 1}`, fuente: i % 2 ? mA : mB, entrada: 0, salida: LARGO / FPS, fundido: DUR / FPS, ...(t === 'fundido' ? {} : { transicion: t }) }))
  const timeline = { version: 1, clips, textos: [] }
  await evaluar(`(async () => { const p = await window.recorte.abrirProyecto(${JSON.stringify(id)}); await window.recorte.guardarProyecto({ ...p, timeline: ${JSON.stringify(timeline)} }); location.reload() })()`).catch(() => {})
  await esperar(2500)
  c.cerrar()
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await esperar(1500)
  const abierto = await evaluar(`(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('.tl-carril.video .tl-clip')) return true
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\\s*prueba transiciones/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
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
  // El botón de play del centro del monitor no es parte del cuadro.
  await evaluar(`(() => { const st = document.createElement('style'); st.textContent = '.monitor-play { display: none !important }'; document.head.append(st) })()`)
  await esperar(600)

  // El MP4.
  const tl = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  comprobar(tl.clips.length === lista.length + 1 && tl.clips.slice(1).every((k, i) => (k.transicion ?? 'fundido') === lista[i]), `la timeline tiene las ${lista.length} transiciones`)
  const r = await evaluar(`window.recorte.exportarTimeline(${JSON.stringify(id)}, ${JSON.stringify(tl)}, { formato: 'original', subtitulos: false }).catch((e) => ({ ok: false, error: String(e) }))`)
  comprobar(r?.ok && r.output, `se exportó el MP4 (${r?.error ?? 'bien'})`)
  if (!r?.ok) throw new Error('sin MP4')

  // Los últimos cuadros de los clips que salen: el monitor los pide solo; se espera a que estén.
  const carpetaVista = join(datos, 'proyectos', id, 'vista-previa')
  const cuantos = () => (existsSync(carpetaVista) ? readdirSync(carpetaVista).filter((x) => x.startsWith('salida-')).length : 0)
  for (let i = 0; i < 300 && cuantos() < lista.length; i++) await esperar(1000)
  comprobar(cuantos() >= lista.length, `el monitor tiene el último cuadro de cada clip que sale (${cuantos()} de ${lista.length})`)
  await esperar(1500)

  const dos = (n) => String(n).padStart(2, '0')
  const irA = async (cuadro) => {
    const tc = await caja('.tl-tc-grande')
    await clic(tc.x + tc.w / 2, tc.y + tc.h / 2)
    await evaluar(`document.querySelector('.tl-tc-editar')?.select()`)
    const s = Math.floor(cuadro / FPS)
    await c.enviar('Input.insertText', { text: `00:${dos(Math.floor(s / 60))}:${dos(s % 60)}:${dos(cuadro % FPS)}` })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await esperar(700)
  }
  const malas = []
  for (const [i, tipo] of lista.entries()) {
    const medias = []
    for (const k of [7, 17]) {
      const cuadro = (i + 1) * LARGO + k
      await irA(cuadro)
      const lienzo = await caja('.monitor-lienzo')
      const shot = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: lienzo.x, y: lienzo.y, width: lienzo.w, height: lienzo.h, scale: 1 } })
      const png = join(salida, `${tipo}-${k}.png`)
      writeFileSync(png, Buffer.from(shot.data, 'base64'))
      const monitor = pequeno(['-i', png])
      const mp4 = pequeno(['-ss', (cuadro / FPS - 0.001).toFixed(4), '-i', r.output])
      ff(['-ss', (cuadro / FPS - 0.001).toFixed(4), '-i', r.output, '-frames:v', '1', join(salida, `${tipo}-${k}-mp4.png`)])
      medias.push(diferencia(monitor, mp4))
    }
    const bien = medias.every((m) => m.media < 10)
    if (!bien) {
      malas.push(tipo)
      fallos++
    }
    console.log(`${bien ? 'bien' : 'MAL'}: ${tipo} (diferencia media ${medias.map((x) => x.media.toFixed(1)).join(' / ')}; el 90 % de las zonas, menos de ${medias.map((x) => x.p90.toFixed(0)).join(' / ')})`)
  }
  console.log(malas.length ? `\nno coinciden: ${malas.join(', ')}` : '\nlas transiciones se ven igual en el monitor y en el MP4')

  // En la línea de tiempo: un bloque por transición, que se estira desde su borde.
  const bloques = await evaluar(`document.querySelectorAll('.tl-carril.video .tl-transicion-bloque').length`)
  comprobar(bloques === lista.length, `cada transición se ve como un bloque en la línea de tiempo (${bloques})`)
  const borde = await evaluar(`(() => { const b = document.querySelectorAll('.tl-carril.video .tl-transicion-borde')[0]; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
  // Ya está en su máximo (la mitad del clip): se acorta.
  await arrastrar(borde.x, borde.y, -15)
  await esperar(1600)
  const tl2 = (await evaluar(`window.recorte.abrirProyecto(${JSON.stringify(id)})`)).timeline
  comprobar(tl2.clips[1].fundido < DUR / FPS - 0.05, `arrastrar el borde del bloque acorta la transición (${(DUR / FPS).toFixed(2)} → ${tl2.clips[1].fundido} s)`)
  // El panel de efectos, con las transiciones por familias y su muestra.
  await evaluar(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Efectos')?.click()`)
  await esperar(800)
  const familias = await evaluar(`[...document.querySelectorAll('.ed-carpeta > summary')].map((x) => x.textContent.trim()).filter((x) => x.startsWith('Transiciones'))`)
  comprobar(familias.length === 5, `las transiciones van en 5 familias (${familias.join(', ')})`)
  await captura('panel.png')
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
