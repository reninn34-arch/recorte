// Los ajustes del panel derecho como números que se arrastran o se escriben, con ↺ para volver a como venían,
// en la app de verdad y con el ratón. Uso: npm run build && node scripts/vista-ajustes.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9338
const datos = join(tmpdir(), `recorte-vista-ajustes-${Date.now()}`)
const salida = join(tmpdir(), 'recorte-vista-ajustes')
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const video = join(datos, 'prueba-ajustes.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=8:r=30', '-f', 'lavfi', '-i', 'sine=f=300:r=48000', '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
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
  // La música (3 s, más corta que el video: se repite) y un efecto de sonido de 5 s, dentro del proyecto.
  const media = join(datos, 'proyectos', id, 'media')
  mkdirSync(media, { recursive: true })
  ff(['-f', 'lavfi', '-i', 'sine=f=660:r=48000', '-t', '3', '-c:a', 'libmp3lame', join(media, 'musica.mp3')])
  ff(['-f', 'lavfi', '-i', 'sine=f=880:r=48000', '-t', '5', '-c:a', 'libmp3lame', join(media, 'sonido.mp3')])
  ff(['-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '4', '-c:a', 'pcm_s16le', join(media, 'voz-1.wav')])
  const agregados = await evaluar(`window.recorte.agregarRutasProyecto(${JSON.stringify(id)}, [${JSON.stringify(foto)}])`)
  const imagen = agregados?.agregados?.[0]
  comprobar(Boolean(imagen), 'la foto entró a la biblioteca')
  const timeline = {
    version: 1,
    clips: [
      { id: 'c1', fuente: 'principal', entrada: 0, salida: 8 },
      { id: 'c2', fuente: imagen, entrada: 0, salida: 4 }
    ],
    textos: [],
    capas: [{ id: 'k1', fuente: imagen, inicio: 1, duracion: 2, x: 0.5, y: 0.3, ancho: 0.3 }],
    // Como lo pone «Añadir sonido»: sin `largo`.
    sonidos: [{ id: 's1', inicio: 0, duracion: 5, archivo: 'media/sonido.mp3', nombre: 'Golpe' }],
    voces: [{ id: 'v1', inicio: 0.5, duracion: 4, archivo: 'media/voz-1.wav', texto: 'uno dos tres cuatro' }],
    musica: { archivo: 'media/musica.mp3', nombre: 'Música', volumen: 0.4, ducking: false }
  }
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
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\\s*prueba ajustes/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
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
  await captura('inicio.png')

  // Los píxeles por segundo, del primer clip: se vuelven a medir después de cada cambio (la escala crece con la timeline).
  let pps = 0
  let x0 = 0
  const medir = async () => {
    const tl = await leer()
    const c0 = tl.clips[0]
    const b = await caja('.tl-carril.video .tl-clip', 0)
    pps = b.w / (c0.salida - c0.entrada)
    x0 = b.x
  }
  await medir()
  const xDe = (t) => x0 + t * pps
  /** Pone el cabezal en `t` haciendo clic en la pista de textos (vacía). */
  const cabezal = async (t) => {
    const carril = await caja('.tl-carril.texto')
    await clic(xDe(t), carril.y + carril.h / 2)
  }


  const fila = (nombre) => evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.querySelector('span')?.textContent?.trim().startsWith(${JSON.stringify(nombre)})); if (!f) return null; const g = f.closest('details'); if (g) g.open = true; f.scrollIntoView({ block: 'center' }); const v = f.querySelector('.aj-valor'); const r = v.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, texto: v.textContent, volver: Boolean(f.querySelector('.aj-volver')) } })()`)
  const escribir = async (texto) => {
    await c.enviar('Input.insertText', { text: texto })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await esperar(400)
  }
  const ajusteDe = async (clave) => (await leer()).clips[0].ajustes?.[clave]

  // Elegir el primer clip.
  {
    const b = await caja('.tl-carril.video .tl-clip', 0)
    await clic(b.x + b.w / 2, b.y + b.h / 2)
    await esperar(500)
    const z = await fila('Zoom')
    comprobar(Boolean(z), `el zoom es una fila con su número (${z?.texto})`)
    comprobar(!(await evaluar(`Boolean(document.querySelector('.ed-insp .tl-ajuste.aj input[type=range]'))`)), 'ya no hay deslizadores grandes en esas filas')
    await evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .ed-grupo')].find((d) => d.textContent.trim().startsWith('Color')); f?.scrollIntoView({ block: 'start' }) })()`)
    await esperar(300)
    await captura('inspector.png')
  }

  // 1) Arrastrar el número a la derecha sube el zoom.
  {
    const z = await fila('Zoom')
    await arrastrar(z.x, z.y, 60)
    const v = await ajusteDe('zoom')
    comprobar(v > 1.1, `arrastrar el número sube el zoom (${v})`)
    const z2 = await fila('Zoom')
    comprobar(z2.volver, `y aparece ↺ (${z2.texto})`)
    // Todo el arrastre es un solo paso de deshacer.
    await evaluar(`document.activeElement?.blur?.()`)
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
    await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 })
    await esperar(400)
    const v2 = await ajusteDe('zoom')
    comprobar(v2 === undefined || Math.abs(v2 - 1) < 1e-6, `Ctrl+Z deshace el arrastre entero (${v2})`)
  }

  // 2) Un clic deja escribirlo, en las unidades que se ven.
  {
    const z = await fila('Zoom')
    await clic(z.x, z.y)
    const hay = await evaluar(`Boolean(document.querySelector('.ed-insp .aj-editar'))`)
    comprobar(hay, 'un clic en el número deja escribirlo')
    await evaluar(`document.querySelector('.ed-insp .aj-editar')?.select()`)
    await escribir('150')
    const v = await ajusteDe('zoom')
    comprobar(Math.abs(v - 1.5) < 1e-6, `escribir 150 pone el zoom en 150 % (${v})`)
  }
  {
    const e = await fila('Exposición')
    await clic(e.x, e.y)
    await evaluar(`document.querySelector('.ed-insp .aj-editar')?.select()`)
    await escribir('-0.5')
    const v = await ajusteDe('exposicion')
    comprobar(Math.abs(v + 0.5) < 1e-6, `escribir -0.5 baja la exposición (${v})`)
  }
  {
    let t = await fila('Temperatura')
    if (t) {
      await esperar(300)
      t = await fila('Temperatura')
      await clic(t.x, t.y)
      if (!(await evaluar(`Boolean(document.querySelector('.ed-insp .aj-editar'))`))) console.log('(el clic no abrió el número de la temperatura)')
      await evaluar(`document.querySelector('.ed-insp .aj-editar')?.select()`)
      await escribir('30')
      const v = await ajusteDe('temperatura')
      comprobar(Math.abs(v - 0.3) < 1e-6, `escribir 30 en la temperatura la deja en cálido +30 (${v})`)
    }
  }

  // 3) ↺ lo devuelve a como venía.
  {
    const z = await evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.textContent.trim().startsWith('Zoom')); const b = f?.querySelector('.aj-volver'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    comprobar(Boolean(z), 'el zoom cambiado tiene ↺')
    if (z) await clic(z.x, z.y)
    const v = await ajusteDe('zoom')
    comprobar(v === undefined || Math.abs(v - 1) < 1e-6, `↺ vuelve el zoom a 100 % (${v ?? 'como viene'})`)
  }

  // 4) Las flechas lo mueven de a un paso.
  {
    const s = await fila('Saturación')
    await evaluar(`[...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.textContent.trim().startsWith('Saturación'))?.querySelector('.aj-valor')?.focus()`)
    for (let i = 0; i < 3; i++) {
      await c.enviar('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
      await c.enviar('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
      await esperar(80)
    }
    const v = await ajusteDe('saturacion')
    comprobar(Math.abs(v - 1.03) < 1e-6, `tres flechas a la derecha suben la saturación un 3 % (${v}; antes ${s?.texto})`)
  }

  // 5) La mini línea de claves: aparece al animar, los rombos se mueven y se quitan, y un clic lleva el cabezal.
  {
    const rombo = async (nombre) => evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(nombre)})); f?.scrollIntoView({ block: 'center' }); const b = f?.querySelector('.ed-clave'); const r = b?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })()`)
    const carril = () => evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.textContent.trim().startsWith('Exposición')); const c = f?.nextElementSibling; if (!c?.classList.contains('aj-carril')) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, claves: [...c.querySelectorAll('.aj-carril-clave')].map((k) => { const q = k.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 } }) } })()`)
    // El cabezal se pone en la regla (un clic en una pista vacía quitaría la selección del clip).
    const regla = await caja('.tl-regla')
    const enRegla = async (t) => clic(xDe(t), regla.y + regla.h / 2)
    await enRegla(1)
    let r = await rombo('Exposición')
    await clic(r.x, r.y)
    await enRegla(5)
    const e = await fila('Exposición')
    await clic(e.x, e.y)
    await evaluar(`document.querySelector('.ed-insp .aj-editar')?.select()`)
    await escribir('1')
    let tl = await leer()
    let ks = tl.clips[0].claves?.exposicion ?? []
    comprobar(ks.length === 2 && Math.abs(ks[1].v - 1) < 1e-6, `dos claves de exposición (${ks.map((k) => `${k.f.toFixed(2)}→${k.v}`).join(', ')})`)
    let c1 = await carril()
    comprobar(c1 && c1.claves.length === 2, `debajo de la fila aparece su mini línea con los dos rombos (${c1?.claves.length})`)
    await captura('claves.png')
    // Arrastrar el segundo rombo hacia la izquierda: la clave se adelanta y guarda su valor.
    const k2 = c1.claves[1]
    await arrastrar(k2.x, k2.y, -c1.w * (2 / 8))
    tl = await leer()
    ks = tl.clips[0].claves?.exposicion ?? []
    comprobar(ks.length === 2 && ks[1].f < 4.2 && ks[1].f > 2.5 && Math.abs(ks[1].v - 1) < 1e-6, `el rombo se movió a ${ks[1]?.f?.toFixed(2)} s con su valor (${ks[1]?.v})`)
    // Un clic en la línea lleva el cabezal ahí.
    c1 = await carril()
    await clic(c1.x + c1.w * 0.75, c1.y)
    const t = await evaluar(`document.querySelector('.ed-timecode, .tl-tiempo, [class*=tiempo]')?.textContent ?? ''`)
    const ahora = (await rombo('Exposición')) && (await evaluar(`(() => { const c = [...document.querySelectorAll('.ed-insp .aj-carril-cabezal')][0]; return c ? parseFloat(c.style.left) : null })()`))
    comprobar(Math.abs(ahora - 75) < 3, `un clic en la mini línea lleva el cabezal ahí (${ahora?.toFixed?.(1)} %; ${t})`)
    // Doble clic en un rombo lo quita.
    c1 = await carril()
    const k1 = c1.claves[0]
    await c.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: k1.x, y: k1.y })
    for (const n of [1, 2]) {
      await c.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: k1.x, y: k1.y, button: 'left', buttons: 1, clickCount: n })
      await c.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: k1.x, y: k1.y, button: 'left', buttons: 0, clickCount: n })
    }
    tl = await leer()
    ks = tl.clips[0].claves?.exposicion ?? []
    comprobar(ks.length === 1, `doble clic en un rombo lo quita (quedan ${ks.length})`)
  }

  // 6) La capa: su opacidad se escribe y el clic en el nombre no pone un fotograma clave.
  {
    const k = await caja('.tl-carril.encima .tl-capa', 0)
    await clic(k.x + k.w / 2, k.y + k.h / 2)
    await esperar(500)
    const nombre = await evaluar(`(() => { const f = [...document.querySelectorAll('.ed-insp .tl-ajuste.aj')].find((x) => x.textContent.trim().startsWith('Tamaño')); f?.scrollIntoView({ block: 'center' }); const r = f?.firstElementChild?.getBoundingClientRect(); return r ? { x: r.left + 20, y: r.top + r.height / 2 } : null })()`)
    if (nombre) await clic(nombre.x, nombre.y)
    let tl = await leer()
    comprobar(!tl.capas[0].claves?.ancho?.length, 'tocar el nombre de un ajuste no le pone un fotograma clave')
    const o = await fila('Opacidad')
    await clic(o.x, o.y)
    await evaluar(`document.querySelector('.ed-insp .aj-editar')?.select()`)
    await escribir('50')
    tl = await leer()
    const op = tl.capas[0].opacidad ?? tl.capas[0].claves?.opacidad?.[0]?.v
    comprobar(Math.abs(op - 0.5) < 1e-6, `escribir 50 en la opacidad la deja al 50 % (${op})`)
    await captura('capa.png')
  }

  // 7) La línea de tiempo: «S» deja sonar solo la música, la barra de zoom acerca y el medidor marca los LUFS.
  {
    const botonS = await evaluar(`(() => { const b = document.querySelector('.tl-nombre.p-musica .tl-pista-solo'); const r = b?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null })()`)
    comprobar(Boolean(botonS), 'las pistas de audio tienen su «S»')
    await clic(botonS.x, botonS.y)
    let tl = await leer()
    comprobar(tl.pistas?.musica?.solo === true, 'la «S» deja la música sola')
    // La barra de zoom: estirar el tirador derecho hacia la izquierda acerca.
    const antes = await evaluar(`parseFloat(document.querySelector('.tl-lienzo').dataset.pps)`)
    const der = await caja('.tl-barra-zoom-tirador.der')
    const barra = await caja('.tl-barra-zoom')
    comprobar(Boolean(der && barra), 'debajo de la línea de tiempo está la barra de zoom con sus tiradores')
    await arrastrar(der.x + der.w / 2, der.y + der.h / 2, -barra.w * 0.5)
    const despues = await evaluar(`parseFloat(document.querySelector('.tl-lienzo').dataset.pps)`)
    comprobar(despues > antes * 1.6, `al encoger la ventana se acerca (${antes.toFixed(1)} → ${despues.toFixed(1)} px/s)`)
    const ventana = await caja('.tl-barra-zoom-ventana')
    const scroll0 = await evaluar(`document.querySelector('.tl-scroll').scrollLeft`)
    await arrastrar(ventana.x + ventana.w / 2, ventana.y + ventana.h / 2, barra.w * 0.3)
    const scroll1 = await evaluar(`document.querySelector('.tl-scroll').scrollLeft`)
    comprobar(scroll1 > scroll0 + 50, `arrastrar la ventana recorre la línea de tiempo (${scroll0} → ${scroll1})`)
    await evaluar(`document.querySelector('.tl-barra-zoom').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`)
    await esperar(400)
    const todo = await evaluar(`parseFloat(document.querySelector('.tl-lienzo').dataset.pps)`)
    comprobar(Math.abs(todo - antes) < 1, `doble clic en la barra lo vuelve a ver todo (${todo.toFixed(1)} px/s)`)
    // A sonar desde el principio con el mezclador abierto.
    const regla = await caja('.tl-regla')
    await clic(xDe(0.05), regla.y + regla.h / 2)
    const mezc = await caja('.tl-boton-mezclador')
    await clic(mezc.x + mezc.w / 2, mezc.y + mezc.h / 2)
    await tecla(' ', 'Space', 32)
    await esperar(5500)
    const lectura = await evaluar(`(() => ({ datos: [...document.querySelectorAll('.lufs-datos dd')].map((x) => x.textContent), barra: document.querySelector('.tl-lufs')?.textContent ?? '', voz: [...document.querySelectorAll('.mezclador-canal')].find((c) => /voz/i.test(c.textContent))?.querySelector('.medidor')?.title ?? '' }))()`)
    await captura('lufs.png')
    await tecla(' ', 'Space', 32)
    const num = (t) => Number(String(t).replace('−', '-'))
    const integrada = num(lectura.datos[2])
    comprobar(Math.abs(integrada - -27) <= 1.5, `el medidor marca la música sola en ${lectura.datos.join(' / ')} LUFS (ffmpeg: −27.0)`)
    comprobar(/LUFS/.test(lectura.barra), `y junto al medidor de la barra (${lectura.barra})`)
    comprobar(/Silencio/.test(lectura.voz) || lectura.voz === '', `con la música en solo, la voz no suena (${lectura.voz || 'sin medidor'})`)
    tl = await leer()
    comprobar((tl.voces ?? []).length === 1 && (tl.sonidos ?? []).length === 1, 'la voz y los sonidos siguen en el proyecto')
  }

  console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien')
} catch (error) {
  console.error(error)
  fallos++
} finally {
  c?.cerrar()
  app.kill()
  await esperar(800)
  try { rmSync(datos, { recursive: true, force: true }) } catch {}
  process.exitCode = fallos ? 1 : 0
}
