// Compara en la app de verdad lo que dibuja el monitor con lo que sale en el MP4, para los textos con estilo
// (contorno, sombra, alineación, giro, espaciado, mayúsculas, opacidad) y una capa recortada, girada y volteada.
// Deja las dos imágenes lado a lado (y su diferencia) en la carpeta temporal y dice cuánto se parecen.
// Uso: npm run build && node scripts/vista-capas-textos.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9334
const marca = Date.now()
const datos = join(tmpdir(), `recorte-vista-${marca}`)
const salida = join(tmpdir(), `recorte-vista-capas-textos`)
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
// Un fondo con algo de dibujo (para ver el contorno y la sombra) y un logo mitad rojo, mitad verde.
const video = join(datos, 'prueba-vista-recorte.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=4:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', '-shortest', '-vf', 'eq=brightness=-0.25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
const logo = join(datos, 'logo.png')
ff(['-f', 'lavfi', '-i', 'color=c=red:s=300x200', '-f', 'lavfi', '-i', 'color=c=lime:s=150x200', '-filter_complex', '[0][1]overlay=150:0', '-frames:v', '1', logo])

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

try {
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await esperar(1500)
  const ingesta = await evaluar(`window.recorte.crearProyecto(${JSON.stringify(video)})`)
  const id = ingesta.project.id
  const conLogo = await evaluar(`window.recorte.importarRutas(${JSON.stringify(id)}, [${JSON.stringify(logo)}])`)
  const medio = conLogo.agregados[0]
  const timeline = {
    version: 1,
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 4 }],
    textos: [
      { id: 't1', inicio: 0, duracion: 4, texto: 'Contorno rojo', posicion: 'arriba', x: 0.06, y: 0.14, alineacion: 'izquierda', sinCaja: true, contorno: 0.08, colorContorno: '#ff2d2d', sombra: 0.06, colorSombra: '#1a1aff', tamano: 1.3 },
      { id: 't2', inicio: 0, duracion: 4, texto: 'girado y espaciado', posicion: 'centro', x: 0.62, y: 0.5, giro: -14, espaciado: 0.12, mayusculas: true, tamano: 1.1 },
      { id: 't3', inicio: 0, duracion: 4, texto: 'A la derecha\ny medio transparente', posicion: 'abajo', x: 0.95, y: 0.84, alineacion: 'derecha', opacidad: 0.55, caja: '#6a1b9a', fuente: 'titular' },
      { id: 't4', inicio: 0, duracion: 4, texto: 'Sin caja, solo sombra', posicion: 'abajo', sinCaja: true, contorno: 0, sombra: 0.12, colorSombra: '#000000', fuente: 'gruesa' }
    ],
    capas: [{ id: 'k1', fuente: medio, inicio: 0, duracion: 4, x: 0.2, y: 0.58, ancho: 0.22, giro: 20, voltearH: true, recorte: { izq: 0.1, der: 0.3, arriba: 0.15, abajo: 0 } }]
  }
  await evaluar(`(async () => { const p = await window.recorte.abrirProyecto(${JSON.stringify(id)}); await window.recorte.guardarProyecto({ ...p, timeline: ${JSON.stringify(timeline)} }); location.reload() })()`).catch(() => {})
  await esperar(2500)
  c.cerrar()
  c = conectar((await pagina()).webSocketDebuggerUrl)
  await c.listo
  await c.enviar('Runtime.enable')
  await esperar(1500)
  // Abre el proyecto (su tarjeta en el inicio) si no está abierto.
  const abierto = await evaluar(`(async () => {
    for (let i = 0; i < 40; i++) {
      const r = document.querySelector('.monitor-cuadro .monitor-rotulo')
      if (r && r.getBoundingClientRect().width > 0) return true
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\s*prueba vista recorte/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
      if (tarjeta) tarjeta.click()
      await new Promise((r) => setTimeout(r, 500))
    }
    return false
  })()`)
  if (!abierto) {
    const shot = await c.enviar('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(salida, 'no-abrio.png'), Buffer.from(shot.data, 'base64'))
    const botones = await evaluar(`[...document.querySelectorAll('button, a, [role=button]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.textContent || b.title || '').trim().slice(0, 40)).filter(Boolean).slice(0, 80)`)
    throw new Error(`No pude abrir el proyecto en el editor (captura en ${join(salida, 'no-abrio.png')}). Botones: ${JSON.stringify(botones)}`)
  }
  await esperar(1500)
  // La ventana de novedades tapa el monitor: se cierra.
  await evaluar(`[...document.querySelectorAll('button')].find((b) => /Ahora no/.test(b.textContent || ''))?.click()`)
  await esperar(1500)
  // El cabezal en 1 s (pausado) y sin nada elegido.
  const caja = await evaluar(`(() => {
    const r = document.querySelector('.monitor-cuadro').getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })()`)
  const todo = await c.enviar('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(salida, 'ventana.png'), Buffer.from(todo.data, 'base64'))
  const monitor = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: caja.x, y: caja.y, width: caja.w, height: caja.h, scale: 1 } })
  const pngMonitor = join(salida, 'monitor.png')
  writeFileSync(pngMonitor, Buffer.from(monitor.data, 'base64'))
  const t = await evaluar(`(() => { const v = document.querySelector('.monitor-video'); return v ? v.currentTime : 0 })()`)
  const cuadro = await evaluar(`window.recorte.exportarCuadro(${JSON.stringify(id)}, ${JSON.stringify(timeline)}, ${Math.max(0, t)})`)
  if (!cuadro.ok) throw new Error(cuadro.error)
  const pngMp4 = join(salida, 'mp4.png')
  const w = Math.round(caja.w)
  const h = Math.round(caja.h)
  ff(['-i', cuadro.archivo, '-vf', `scale=${w}:${h}:flags=area`, pngMp4])
  ff(['-i', pngMonitor, '-i', pngMp4, '-filter_complex', `[0]scale=${w}:${h}[a];[a][1]hstack`, join(salida, 'lado-a-lado.png')])
  ff(['-i', pngMonitor, '-i', pngMp4, '-filter_complex', `[0]scale=${w}:${h},format=rgb24[a];[1]format=rgb24[b];[a][b]blend=all_mode=difference,eq=contrast=3`, join(salida, 'diferencia.png')])
  // Cuánto difieren: el promedio de la diferencia (0 = idénticas).
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', pngMonitor, '-i', pngMp4, '-filter_complex', `[0]scale=${w}:${h},format=gray[a];[1]format=gray[b];[a][b]blend=all_mode=difference,scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
  console.log(`diferencia media monitor/MP4: ${r.stdout[0]} de 255 · imágenes en ${salida}`)
  // ===== Los tiradores, con el ratón de verdad =====
  const raton = async (type, x, y, extra = {}) => c.enviar('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra })
  async function arrastre(x0, y0, x1, y1) {
    await raton('mouseMoved', x0, y0, { buttons: 0 })
    await raton('mousePressed', x0, y0)
    for (let k = 1; k <= 8; k++) await raton('mouseMoved', x0 + ((x1 - x0) * k) / 8, y0 + ((y1 - y0) * k) / 8)
    await raton('mouseReleased', x1, y1)
    await esperar(300)
  }
  const centro = (sel) => evaluar(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null })()`)
  const capaDom = () => evaluar(`(() => { const el = document.querySelector('.monitor-capa'); const m = el.querySelector('.monitor-capa-medio'); return { ancho: el.style.width, transform: el.style.transform, recorte: m?.style.clipPath ?? '' } })()`)
  const comprobar = (ok, texto) => {
    console.log(`${ok ? 'bien' : 'MAL'}: ${texto}`)
    if (!ok) process.exitCode = 1
  }
  // Elegir la capa: un clic en ella (un clic sin arrastrar la elige).
  const capa = await centro('.monitor-capa')
  await arrastre(capa.x + 5, capa.y, capa.x + 5, capa.y)
  await esperar(400)
  const shotCapa = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: caja.x - 30, y: caja.y - 30, width: caja.w + 60, height: caja.h + 60, scale: 1 } })
  writeFileSync(join(salida, 'tiradores-capa.png'), Buffer.from(shotCapa.data, 'base64'))
  const antes = await capaDom()
  const se = await centro('.monitor-capa .monitor-tirador.esquina.se')
  comprobar(Boolean(se), 'la capa elegida muestra sus esquinas')
  if (se) {
    await arrastre(se.x, se.y, se.x + 40, se.y + 25)
    const tras = await capaDom()
    comprobar(parseFloat(tras.ancho) > parseFloat(antes.ancho) + 2, `la esquina la agranda (${antes.ancho} → ${tras.ancho})`)
  }
  const giro = await centro('.monitor-capa .monitor-tirador.giro')
  if (giro) {
    const cap = await centro('.monitor-capa')
    // Un cuarto de vuelta alrededor del centro.
    await arrastre(giro.x, giro.y, cap.x + (cap.y - giro.y), cap.y)
    const tras = await capaDom()
    const g = Number(/rotate\((-?[\d.]+)deg\)/.exec(tras.transform)?.[1])
    comprobar(Math.abs(g - 110) < 12, `el tirador redondo la gira (20° → ${g}°)`)
  } else comprobar(false, 'la capa muestra el tirador para girar')
  const izq = await centro('.monitor-capa .monitor-tirador.lado.izq')
  if (izq) {
    await arrastre(izq.x, izq.y, izq.x + 12, izq.y + 12)
    const tras = await capaDom()
    comprobar(tras.recorte !== antes.recorte, `el lado la recorta (${antes.recorte} → ${tras.recorte})`)
  } else comprobar(false, 'la capa muestra los tiradores de recorte')
  // Deshacer tres veces: vuelve a como estaba.
  for (let k = 0; k < 3; k++) {
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', modifiers: 2, windowsVirtualKeyCode: 90 })
    await esperar(200)
  }
  const deshecha = await capaDom()
  comprobar(deshecha.ancho === antes.ancho && deshecha.transform === antes.transform && deshecha.recorte === antes.recorte, 'Ctrl+Z deshace el tamaño, el giro y el recorte')
  // Un texto: su esquina agranda la letra y Alt+flecha lo mueve.
  const t2 = await centro('.monitor-rotulo[data-texto="t2"]')
  await arrastre(t2.x, t2.y, t2.x, t2.y)
  await esperar(300)
  const letraAntes = await evaluar(`getComputedStyle(document.querySelector('.monitor-rotulo[data-texto="t2"]')).fontSize`)
  const seT = await centro('.monitor-rotulo[data-texto="t2"] .monitor-tirador.esquina.se')
  if (seT) {
    await arrastre(seT.x, seT.y, seT.x + 50, seT.y + 10)
    const letra = await evaluar(`getComputedStyle(document.querySelector('.monitor-rotulo[data-texto="t2"]')).fontSize`)
    comprobar(parseFloat(letra) > parseFloat(letraAntes) + 1, `la esquina del texto agranda la letra (${letraAntes} → ${letra})`)
  } else comprobar(false, 'el texto elegido muestra su esquina')
  const izqAntes = await evaluar(`parseFloat(document.querySelector('.monitor-rotulo[data-texto="t2"]').style.left)`)
  for (let k = 0; k < 5; k++) {
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', modifiers: 1 | 8, windowsVirtualKeyCode: 39 })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', modifiers: 1 | 8, windowsVirtualKeyCode: 39 })
  }
  await esperar(300)
  const izqDespues = await evaluar(`parseFloat(document.querySelector('.monitor-rotulo[data-texto="t2"]').style.left)`)
  comprobar(Math.abs(izqDespues - izqAntes - 5) < 0.2, `Alt+Mayús+→ lo corre (${izqAntes}% → ${izqDespues}%)`)
  const shotTexto = await c.enviar('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(salida, 'tiradores-texto.png'), Buffer.from(shotTexto.data, 'base64'))
  // El inspector del texto, en su parte de estilo; y un clic en «Izquierda» lo alinea sin moverlo.
  await evaluar(`[...document.querySelectorAll('.ed-inspector span')].find((s) => s.textContent === 'Alinear')?.scrollIntoView({ block: 'start' })`)
  await esperar(300)
  const insp = await centro('.ed-inspector')
  const shotInsp = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: insp.x - insp.w / 2, y: insp.y - insp.h / 2, width: insp.w, height: insp.h, scale: 1 } })
  writeFileSync(join(salida, 'inspector-texto.png'), Buffer.from(shotInsp.data, 'base64'))
  const cajaAntes = await centro('.monitor-rotulo[data-texto="t2"]')
  await evaluar(`[...document.querySelectorAll('.ed-inspector button')].find((b) => b.textContent === 'Izquierda').click()`)
  await esperar(300)
  const cajaDespues = await centro('.monitor-rotulo[data-texto="t2"]')
  comprobar(Math.abs(cajaAntes.x - cajaDespues.x) < 2 && Math.abs(cajaAntes.y - cajaDespues.y) < 2, `alinear a la izquierda no mueve el texto (${Math.round(cajaAntes.x)},${Math.round(cajaAntes.y)} → ${Math.round(cajaDespues.x)},${Math.round(cajaDespues.y)})`)

  // ===== Zona segura e imán =====
  await evaluar(`document.querySelector('.monitor-zona-boton').click()`)
  await esperar(300)
  comprobar(await evaluar(`Boolean(document.querySelector('.monitor-zona-segura'))`), 'el botón muestra la zona segura')
  // Sin los textos a la vista (para que la guía más cercana sea la de la zona segura).
  await evaluar(`(() => { const s = document.createElement('style'); s.id = 'sin-textos'; s.textContent = '.monitor-rotulo{display:none!important}'; document.head.append(s) })()`)
  // Arrastra la capa para que su borde izquierdo quede a 3 px de la zona de títulos (10 %): se pega y se ve la guía.
  const borde = await evaluar(`(() => {
    const cu = document.querySelector('.monitor-cuadro').getBoundingClientRect()
    const el = document.querySelector('.monitor-capa')
    const r = (el.querySelector(':scope > .monitor-capa-marco') ?? el).getBoundingClientRect()
    return { izq: r.left, cuadro: cu.left, ancho: cu.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  })()`)
  const destino = borde.cuadro + borde.ancho * 0.1 + 3
  const dx = destino - borde.izq
  await raton('mouseMoved', borde.cx, borde.cy, { buttons: 0 })
  await raton('mousePressed', borde.cx, borde.cy)
  for (let k = 1; k <= 8; k++) await raton('mouseMoved', borde.cx + (dx * k) / 8, borde.cy + 2 * k)
  await esperar(150)
  const guias = await evaluar(`[...document.querySelectorAll('.monitor-guia')].map((g) => g.className)`)
  await raton('mouseReleased', borde.cx + dx, borde.cy + 16)
  await esperar(300)
  const pegado = await evaluar(`(() => {
    const cu = document.querySelector('.monitor-cuadro').getBoundingClientRect()
    const el = document.querySelector('.monitor-capa')
    const r = (el.querySelector(':scope > .monitor-capa-marco') ?? el).getBoundingClientRect()
    return (r.left - cu.left) / cu.width
  })()`)
  comprobar(guias.some((g) => g.includes('is-zona')), `al arrastrar se ve la guía de la zona segura (${guias.join(' | ')})`)
  comprobar(Math.abs(pegado - 0.1) < 0.004, `se pega a la zona segura: su borde queda en ${(pegado * 100).toFixed(2)} %`)
  await evaluar(`document.getElementById('sin-textos').remove()`)
  const shotZona = await c.enviar('Page.captureScreenshot', { format: 'png', clip: { x: caja.x - 10, y: caja.y - 10, width: caja.w + 20, height: caja.h + 20, scale: 1 } })
  writeFileSync(join(salida, 'zona-segura.png'), Buffer.from(shotZona.data, 'base64'))

  // exportarCuadro lo guarda en la carpeta de videos del usuario: se borra (y su carpeta, si quedó vacía).
  rmSync(cuadro.archivo, { force: true })
  try { rmdirSync(dirname(cuadro.archivo)) } catch {}
} finally {
  c?.cerrar()
  app.kill()
}
