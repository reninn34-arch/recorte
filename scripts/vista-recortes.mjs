// Cortar y estirar como en un editor serio, en la app de verdad y con el ratón: una imagen encima que se estira hasta
// el final, una foto en la pista de video que dura lo que se quiera, un video dividido que se vuelve a estirar, un
// sonido dividido que se vuelve a estirar, una frase de la narración que se divide y se recorta, y la música que se
// divide, se recorta y se borra a trozos. Al final, el audio exportado suena solo donde quedó cada cosa.
// Uso: npm run build && node scripts/vista-recortes.mjs
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'

const raiz = resolve(import.meta.dirname, '..')
const puerto = 9336
const datos = join(tmpdir(), `recorte-vista-recortes-${Date.now()}`)
const salida = join(tmpdir(), 'recorte-vista-recortes')
mkdirSync(datos, { recursive: true })
mkdirSync(salida, { recursive: true })
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
}
const video = join(datos, 'prueba-recortes.mp4')
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
      const tarjeta = [...document.querySelectorAll('button, [role=button], a, .card, article, li')].reverse().find((el) => /^\\s*prueba recortes/i.test(el.textContent || '') && el.getBoundingClientRect().width > 0)
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

  // 1) La imagen de encima se estira hasta el final del video.
  {
    const capa = await caja('.tl-carril.encima .tl-capa', 0)
    await arrastrar(capa.x + capa.w - 2, capa.y + capa.h / 2, xDe(12) - (capa.x + capa.w - 2))
    const tl = await leer()
    const k = tl.capas?.[0]
    comprobar(k && Math.abs(k.inicio + k.duracion - 12) < 0.05, `la imagen de encima llega hasta el final (${k?.inicio} + ${k?.duracion?.toFixed(2)} de 12)`)
  }

  // 2) La foto en la pista de video dura lo que se quiera: se estira 6 s más.
  {
    const foto = await caja('.tl-carril.video .tl-clip', 1)
    await arrastrar(foto.x + foto.w - 2, foto.y + foto.h / 2, 6 * pps)
    const tl = await leer()
    const f = tl.clips.find((x) => x.id === 'c2')
    comprobar(f && f.salida - f.entrada > 9.5, `la foto se alargó (${f ? (f.salida - f.entrada).toFixed(2) : '?'} s)`)
  }

  // 3) Un video dividido se vuelve a estirar hasta lo que dura su archivo.
  {
    await medir()
    await cabezal(5)
    await tecla('Escape', 'Escape', 27)
    await cabezal(5)
    await tecla('s', 'KeyS', 83)
    let tl = await leer()
    const partes = tl.clips.filter((x) => x.fuente === 'principal')
    comprobar(partes.length === 2 && Math.abs(partes[0].salida - 5) < 0.1, `S dividió el video en el cabezal (${partes.map((x) => `${x.entrada.toFixed(2)}–${x.salida.toFixed(2)}`).join(', ')})`)
    const izq = await caja('.tl-carril.video .tl-clip', 0)
    await arrastrar(izq.x + izq.w - 2, izq.y + izq.h / 2, 2 * pps)
    tl = await leer()
    const p2 = tl.clips.filter((x) => x.fuente === 'principal')
    comprobar(p2[0] && p2[0].salida > 6.5, `el primer pedazo se volvió a estirar (termina en ${p2[0]?.salida.toFixed(2)})`)
    comprobar(p2[1] && Math.abs(p2[1].entrada - partes[1]?.entrada) < 0.05, 'el segundo pedazo no se tocó')
    // Hasta el final del archivo y no más.
    const izq2 = await caja('.tl-carril.video .tl-clip', 0)
    await arrastrar(izq2.x + izq2.w - 2, izq2.y + izq2.h / 2, 6 * pps)
    tl = await leer()
    const p3 = tl.clips.filter((x) => x.fuente === 'principal')
    comprobar(p3[0] && Math.abs(p3[0].salida - 8) < 0.05, `no pasa del final del archivo (termina en ${p3[0]?.salida.toFixed(2)})`)
  }

  // 4) Un sonido dividido se vuelve a estirar.
  {
    await medir()
    let tl0 = await leer()
    const s0 = tl0.sonidos?.find((s) => s.id === 's1')
    await tecla('Escape', 'Escape', 27)
    await cabezal(s0.inicio + 2)
    const son = await caja('.tl-carril.sonidos .tl-sonido', 0)
    await clic(son.x + son.w / 2, son.y + son.h / 2)
    await tecla('s', 'KeyS', 83)
    let tl = await leer()
    const sonidos = (tl.sonidos ?? []).filter((s) => s.archivo === 'media/sonido.mp3')
    comprobar(sonidos.length === 2, `S dividió el sonido (${sonidos.length} pedazos)`)
    const primero = await caja('.tl-carril.sonidos .tl-sonido', 0)
    await arrastrar(primero.x + primero.w - 3, primero.y + primero.h / 2, 1.5 * pps)
    tl = await leer()
    const s1 = (tl.sonidos ?? []).find((s) => s.id === 's1')
    comprobar(s1 && s1.duracion > 3, `el primer pedazo del sonido se volvió a estirar (${s1?.duracion?.toFixed(2)} s)`)
  }

  // 5) Una frase de la narración: S la divide (a ella, no al video), el primer pedazo se vuelve a estirar y el
  // segundo se borra.
  {
    await medir()
    await tecla('Escape', 'Escape', 27)
    await cabezal(2.5)
    const fr = await caja('.tl-carril.voz .tl-frase', 0)
    await clic(fr.x + 10, fr.y + fr.h / 2)
    await tecla('s', 'KeyS', 83)
    let tl = await leer()
    const piezas = tl.voces ?? []
    comprobar(piezas.length === 2 && Math.abs(piezas[0].duracion - 2) < 0.1 && Math.abs((piezas[1].desde ?? 0) - 2) < 0.1, `S dividió la frase (${piezas.map((v) => `${v.inicio.toFixed(2)}+${v.duracion.toFixed(2)} desde ${v.desde ?? 0}`).join(', ')})`)
    comprobar(tl.clips.filter((x) => x.fuente === 'principal').length === 2, 'y no dividió el video')
    const a = await caja('.tl-carril.voz .tl-frase', 0)
    await arrastrar(a.x + a.w - 2, a.y + a.h / 2, pps)
    tl = await leer()
    comprobar(Math.abs((tl.voces?.[0]?.duracion ?? 0) - 3) < 0.1, `el primer pedazo se volvió a estirar (${tl.voces?.[0]?.duracion?.toFixed(2)} s)`)
    await clic(xDe(4.2), a.y + a.h / 2)
    await tecla('Delete', 'Delete', 46)
    tl = await leer()
    comprobar(tl.voces?.length === 1, `Supr borra solo el segundo pedazo (${tl.voces?.length} queda)`)
  }

  // 6) La música se divide en el cabezal, se recorta y se borra un trozo.
  {
    await medir()
    await tecla('Escape', 'Escape', 27)
    await cabezal(4)
    const mus = await caja('.tl-carril.musica .tl-musica', 0)
    await clic(mus.x + 20, mus.y + mus.h / 2)
    await tecla('s', 'KeyS', 83)
    let tl = await leer()
    const trozos = tl.musica?.tramos ?? []
    comprobar(trozos.length === 2 && Math.abs(trozos[0].duracion - 4) < 0.1, `S dividió la música (${trozos.map((x) => `${x.inicio.toFixed(2)}+${x.duracion.toFixed(2)}`).join(', ')})`)
    const principales = tl.clips.filter((x) => x.fuente === 'principal').length
    comprobar(principales === 2, 'y no dividió el video')
    // Recortar el principio del segundo trozo 1 s.
    const seg = await caja('.tl-carril.musica .tl-musica', 1)
    if (seg) await arrastrar(seg.x + 2, seg.y + seg.h / 2, pps)
    tl = await leer()
    const t2 = tl.musica?.tramos?.[1]
    comprobar(t2 && Math.abs(t2.inicio - 5) < 0.1 && Math.abs((t2.desde ?? 0) - 5) < 0.1, `el segundo trozo empieza 1 s más tarde y suena desde donde iba (${t2?.inicio?.toFixed(2)}, desde ${t2?.desde?.toFixed(2)})`)
    // Borrar el primer trozo.
    const pri = await caja('.tl-carril.musica .tl-musica', 0)
    await clic(pri.x + pri.w / 2, pri.y + pri.h / 2)
    await tecla('Delete', 'Delete', 46)
    tl = await leer()
    comprobar(tl.musica && tl.musica.tramos?.length === 1, `Supr borra solo ese trozo (${tl.musica?.tramos?.length ?? 0} queda)`)
    await captura('musica.png')
    // El MP4 suena solo donde hay música.
    const r = await evaluar(`window.recorte.exportarTimeline(${JSON.stringify(id)}, ${JSON.stringify(tl)}, { formato: 'original', subtitulos: false, soloAudio: 'wav' }).catch((e) => ({ ok: false, error: String(e) }))`)
    if (r?.ok && r.output) {
      const archivo = r.output
      // Cada tono en su tramo, medido en las muestras (Goertzel): un filtro de ffmpeg deja pasar los tonos vecinos.
      const crudo = spawnSync('ffmpeg', ['-v', 'error', '-i', archivo, '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }).stdout
      const muestras = new Float32Array(crudo.buffer, crudo.byteOffset, Math.floor(crudo.length / 4))
      const nivel = (f, desde, hasta) => {
        const a = Math.round(desde * 48000)
        const b = Math.min(muestras.length, Math.round(hasta * 48000))
        const k = (2 * Math.cos((2 * Math.PI * f) / 48000))
        let s1 = 0
        let s2 = 0
        for (let i = a; i < b; i++) {
          const s0 = muestras[i] + k * s1 - s2
          s2 = s1
          s1 = s0
        }
        const potencia = s1 * s1 + s2 * s2 - k * s1 * s2
        return Math.round(10 * Math.log10(potencia / ((b - a) * (b - a)) + 1e-14))
      }
      if (process.env.PERFIL) console.log([...Array(21)].map((_, i) => `${i}s:${nivel(660, i, i + 1)}`).join(' '))
      const antes = nivel(660, 1, 3.5)
      const despues = nivel(660, 6, 9)
      console.log(`música 660 Hz: sin trozo ${antes} dB, con trozo ${despues} dB`)
      comprobar(despues - antes > 15, 'el audio exportado tiene música solo donde quedó el trozo')
      const vozSi = nivel(440, 1, 3.3)
      const vozNo = nivel(440, 3.8, 4.4)
      console.log(`voz 440 Hz: en el pedazo ${vozSi} dB, en el borrado ${vozNo} dB`)
      comprobar(vozSi - vozNo > 15, 'la voz suena solo en el pedazo que quedó')
      if (process.env.PERFIL) console.log(`wav: ${archivo}`)
      else rmSync(archivo, { force: true })
    } else console.log(`(no pude exportar el audio para mirarlo: ${r?.error ?? 'sin respuesta'})`)
  }

  // 7) La imagen de encima se estira 3 s más allá del final: el video se alarga con negro y la foto sigue encima. Al
  // volver, el negro se va.
  {
    await medir()
    await tecla('Escape', 'Escape', 27)
    let tl = await leer()
    const total = tl.clips.reduce((t, x) => t + (x.salida - x.entrada) / (x.velocidad ?? 1), 0)
    // Antes, la capa hasta el final del video.
    const k0 = tl.capas.find((x) => x.id === 'k1')
    if (Math.abs(k0.inicio + k0.duracion - total) > 0.05) {
      const capa = await caja('.tl-carril.encima .tl-capa', 0)
      await arrastrar(capa.x + capa.w - 2, capa.y + capa.h / 2, xDe(total) - (capa.x + capa.w - 2))
      await medir()
    }
    const capa = await caja('.tl-carril.encima .tl-capa', 0)
    await arrastrar(capa.x + capa.w - 2, capa.y + capa.h / 2, 3 * pps)
    tl = await leer()
    const k = tl.capas.find((x) => x.id === 'k1')
    const ultimo = tl.clips.at(-1)
    const nuevoTotal = tl.clips.reduce((t, x) => t + (x.salida - x.entrada) / (x.velocidad ?? 1), 0)
    comprobar(ultimo?.fuente === 'negro', `al final de la pista de video hay negro (${ultimo?.fuente})`)
    comprobar(Math.abs(nuevoTotal - (k.inicio + k.duracion)) < 0.05 && nuevoTotal > total + 2.5, `el video dura hasta donde acaba la foto (${total.toFixed(2)} → ${nuevoTotal.toFixed(2)}; la foto acaba en ${(k.inicio + k.duracion).toFixed(2)})`)
    await captura('negro.png')
    // El monitor, en el negro: negro con la foto encima.
    await medir()
    await cabezal(nuevoTotal - 1)
    await esperar(800)
    const monitor = await evaluar(`(() => { const img = [...document.querySelectorAll('.monitor-imagen')].find((x) => x.src.startsWith('data:image/svg')); return Boolean(img && img.getBoundingClientRect().width > 0) })()`)
    comprobar(monitor, 'el monitor enseña el negro')
    await captura('negro-monitor.png')
    // El MP4: dura lo nuevo, y en el negro se ve la foto azul sobre negro.
    const r = await evaluar(`window.recorte.exportarTimeline(${JSON.stringify(id)}, ${JSON.stringify(tl)}, { formato: 'original', subtitulos: false }).catch((e) => ({ ok: false, error: String(e) }))`)
    comprobar(r?.ok && r.output, `se exportó el MP4 (${r?.error ?? 'bien'})`)
    if (r?.ok && r.output) {
      const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', r.output], { encoding: 'utf8' }).stdout)
      comprobar(Math.abs(dur - nuevoTotal) < 0.2, `el MP4 dura ${dur.toFixed(2)} s (${nuevoTotal.toFixed(2)} en la timeline)`)
      const t = (nuevoTotal - 1).toFixed(2)
      const px = spawnSync('ffmpeg', ['-v', 'error', '-ss', t, '-i', r.output, '-frames:v', '1', '-vf', 'scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 }).stdout
      const en = (x, y) => { const i = (Math.round(y * 35) * 64 + Math.round(x * 63)) * 3; return [px[i], px[i + 1], px[i + 2]] }
      const foto = en(0.5, 0.3)
      const esquina = en(0.05, 0.9)
      console.log(`cuadro del negro: foto ${foto}, esquina ${esquina}`)
      comprobar(foto[2] > 150 && foto[0] < 80, 'en el MP4 se ve la foto azul encima')
      comprobar(esquina.every((v) => v < 30), 'y alrededor, negro')
      if (process.env.PERFIL) console.log(`mp4: ${r.output}`)
      else rmSync(r.output, { force: true })
    }
    // Volver: el negro se va con ella.
    await medir()
    const capa2 = await caja('.tl-carril.encima .tl-capa', 0)
    const finVideo = tl.clips.filter((x) => x.fuente !== 'negro').reduce((t, x) => t + (x.salida - x.entrada) / (x.velocidad ?? 1), 0)
    await arrastrar(capa2.x + capa2.w - 2, capa2.y + capa2.h / 2, xDe(finVideo - 1) - (capa2.x + capa2.w - 2))
    tl = await leer()
    comprobar(tl.clips.every((x) => x.fuente !== 'negro'), `al acortarla dentro del video, el negro se va (${tl.clips.map((x) => x.fuente).join(', ')})`)
  }
} finally {
  c?.cerrar()
  app.kill()
}
console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien')
if (fallos) process.exitCode = 1
