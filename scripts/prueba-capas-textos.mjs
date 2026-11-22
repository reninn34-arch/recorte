// Las herramientas de capas y textos del editor: el estilo de los textos (contorno, sombra, alineación, espaciado,
// mayúsculas, opacidad, giro) y el recorte y volteo de las capas. Comprueba que sobreviven a normalizar y que el MP4
// (FFmpeg de verdad) los dibuja donde y como los pone el monitor.
// npm run prueba:capas-textos
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportarTimeline, alfasAss, animarAss, conSalidaAss } from '../src/main/exportar.ts'
import { imanEje, objetivosIman } from '../src/renderer/src/guias.ts'
import { alinearPiezas } from '../src/renderer/src/grupo.ts'
import { aplicarOperaciones, describirTimelineParaAgente, validarOperaciones } from '../src/shared/chat.ts'
import { anadirTexto, soloTramo, animacionCapa, ponerClaveTexto, curvaClaveTexto, estadoTexto, cambiarTextoEn, textoYaEmpezado, curvaClaveCapa, ponerClaveCapa, capasEnOrden, duplicarCapa, duplicarTexto, estiloDeCapa, ordenarCapa, pegarEstiloCapa, pegarEstiloTexto, timelineActiva, cambiarCapa, cambiarTexto, durEntradaCapa, estadoCapa, estiloDeTexto, normalizarTimeline, salidaTexto, textoVisible, trazoTexto, EME_ROTULO } from '../src/shared/timeline.ts'

const dir = mkdtempSync(join(tmpdir(), 'recorte-capas-textos-'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
mkdirSync(join(dir, 'media'))
const W = 640
const H = 360
const fondo = join(dir, 'fondo.mp4')
ff(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=3:r=30`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fondo])
// Un logo mitad rojo (izquierda) y mitad verde (derecha), para ver el volteo y el recorte.
const logo = join(dir, 'media', 'logo.png')
ff(['-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-f', 'lavfi', '-i', 'color=c=lime:s=100x200', '-filter_complex', '[0][1]overlay=100:0', '-frames:v', '1', logo])

const proyecto = {
  id: 'p',
  name: 'prueba',
  source: { path: fondo, width: W, height: H, fps: 30, duration: 3 },
  brand: { primary: '#ffffff' },
  medios: [{ id: 'm1', ruta: logo, tipo: 'imagen', conAudio: false, nombre: 'logo.png', duracion: 0 }]
}
const medios = { principal: 3, m1: 5 }

// ===== El modelo =====
const base = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [] }, 3, medios)
let tl = anadirTexto(base, 0).timeline
const id = tl.textos[0].id
tl = cambiarTexto(tl, id, { texto: 'Hola', sinCaja: true, contorno: 0.1, colorContorno: '#FF0000', sombra: 0.4, alineacion: 'izquierda', giro: 30, espaciado: 0.05, mayusculas: true, opacidad: 0.5 })
let t = tl.textos[0]
assert.equal(t.contorno, 0.1)
assert.equal(t.colorContorno, '#ff0000', 'el color se guarda en minúsculas')
assert.equal(t.sombra, 0.25, 'la sombra no pasa del límite')
assert.equal(t.giro, undefined, 'sin posición libre no hay giro')
assert.equal(t.alineacion, undefined, 'sin posición libre no hay alineación')
assert.equal(t.mayusculas, true)
assert.equal(textoVisible(t), 'HOLA')
tl = cambiarTexto(tl, id, { x: 0.1, y: 0.5, alineacion: 'izquierda', giro: 30 })
t = tl.textos[0]
assert.equal(t.giro, 30, 'con posición libre, el giro queda')
assert.equal(t.alineacion, 'izquierda')
// Volver a arriba/centro/abajo suelta la posición libre, el giro y la alineación.
assert.equal(cambiarTexto(tl, id, { posicion: 'centro' }).textos[0].giro, undefined)
// Lo neutro no se guarda.
const neutro = cambiarTexto(tl, id, { opacidad: 1, espaciado: 0, giro: 0, mayusculas: false, colorContorno: '#000000' }).textos[0]
for (const k of ['opacidad', 'espaciado', 'giro', 'mayusculas', 'colorContorno']) assert.equal(neutro[k], undefined, `${k} neutro no se guarda`)
// Sobrevive a guardar y abrir (normalizar).
const reabierta = normalizarTimeline(JSON.parse(JSON.stringify(tl)), 3, medios)
assert.deepEqual(reabierta.textos[0], tl.textos[0], 'el estilo sobrevive a normalizar')
assert.deepEqual(estiloDeTexto(reabierta.textos[0]).contorno, 0.1, 'copiar estilo lleva el contorno')
// Con caja no hay contorno ni sombra (en el MP4 el borde de una letra con caja es la caja).
assert.equal(trazoTexto({ ...t, sinCaja: undefined }), null)
assert.equal(trazoTexto({ sinCaja: true }), null, 'sin elegir nada: el halo de siempre')
// La transparencia: la caja negra al 70 % y a la mitad de opacidad.
assert.deepEqual(alfasAss({ texto: 'x', opacidad: 0.5 }), { letra: '80', borde: 'A6', sombra: 'A6' })
assert.deepEqual(alfasAss({ texto: 'x' }), { letra: '00', borde: '4D', sombra: '4D' }, 'sin opacidad: lo de siempre')

// Capas: recorte y volteo.
let tc = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.3, y: 0.5, ancho: 0.3 }] }, 3, medios)
tc = cambiarCapa(tc, 'k1', { recorte: { izq: 0.5, der: 0.7, arriba: -1, abajo: 0 }, voltearH: true }, medios)
assert.deepEqual(tc.capas[0].recorte, { izq: 0.5, der: 0.45, arriba: 0, abajo: 0 }, 'el recorte deja al menos el 5 %')
assert.equal(tc.capas[0].voltearH, true)
assert.equal(cambiarCapa(tc, 'k1', { recorte: { izq: 0, der: 0, arriba: 0, abajo: 0 } }, medios).capas[0].recorte, undefined, 'sin recortar nada, no se guarda')
assert.deepEqual(normalizarTimeline(JSON.parse(JSON.stringify(tc)), 3, medios).capas[0], tc.capas[0], 'la capa sobrevive a normalizar')

// ===== El imán de las guías =====
{
  const obj = objetivosIman([{ izq: 0.6, der: 0.8, arriba: 0.2, abajo: 0.3 }], true)
  // Una caja de 0,2 de ancho anclada en su centro: su borde izquierdo (x − 0,1) cerca de la zona de títulos (0,1).
  let r = imanEje(0.205, [-0.1, 0, 0.1], obj.x, 0.01)
  assert.ok(Math.abs(r.pos - 0.2) < 1e-9 && r.guias.some((g) => g.tipo === 'zona'), `se pega a la zona segura: ${JSON.stringify(r)}`)
  r = imanEje(0.505, [-0.1, 0, 0.1], obj.x, 0.01)
  assert.ok(Math.abs(r.pos - 0.5) < 1e-9 && r.guias.some((g) => g.v === 0.6 && g.tipo === 'objeto'), 'el centro al centro y el borde derecho al de la otra capa')
  r = imanEje(0.42, [-0.1, 0, 0.1], obj.x, 0.01)
  assert.equal(r.pos, 0.42, 'lejos de todo, no se mueve')
  assert.equal(objetivosIman([], false).x.some((g) => g.tipo === 'zona'), false, 'sin la zona segura a la vista, no se pega a ella')
  assert.ok(objetivosIman([], false).x.some((g) => Math.abs(g.v - 1 / 3) < 1e-9), 'los tercios')
}

// ===== El agente: lee y cambia el estilo nuevo =====
{
  const inicial = normalizarTimeline(
    { clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [{ id: 't1', inicio: 0, duracion: 2, texto: 'Hola', posicion: 'abajo' }], capas: [{ id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.3 }] },
    3,
    medios
  )
  const ops = validarOperaciones([
    { op: 'cambiar_texto', texto_n: 1, sin_caja: true, contorno: 0.08, color_contorno: '#112233', sombra: 0.04, alineacion: 'izquierda', mayusculas: true, giro: -8, opacidad: 0.9, espaciado: 0.05 },
    { op: 'cambiar_capa', capa_n: 1, recorte: { izq: 0.2 }, voltear_h: true }
  ])
  const r = aplicarOperaciones(inicial, ops, { duracionFuente: 3, transcript: [], medios: { m1: 5 } })
  assert.deepEqual(r.fallos, [])
  const t = r.timeline.textos[0]
  assert.equal(t.contorno, 0.08)
  assert.equal(t.colorContorno, '#112233')
  assert.equal(t.alineacion, 'izquierda', 'alinear sin sitio propio le da uno')
  assert.equal(t.giro, -8)
  assert.equal(t.y, 0.86, 'abajo: su sitio propio es el de siempre')
  assert.deepEqual(r.timeline.capas[0].recorte, { izq: 0.2, der: 0, arriba: 0, abajo: 0 })
  assert.equal(r.timeline.capas[0].voltearH, true)
  const visto = describirTimelineParaAgente(r.timeline, [], 3, 30_000, { m1: 'logo.png' })
  assert.match(visto, /contorno 0\.08 #112233/, 'el agente ve el contorno')
  assert.match(visto, /volteada ↔/, 'el agente ve el volteo')
  const sinHalo = aplicarOperaciones(r.timeline, validarOperaciones([{ op: 'cambiar_texto', texto_n: 1, contorno: null, sombra: null }]), { duracionFuente: 3, transcript: [], medios: { m1: 5 } })
  assert.equal(trazoTexto(sinHalo.timeline.textos[0]), null, 'contorno y sombra null: vuelve al halo')
}

// ===== El MP4 =====
function cuadro(mp4, t) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 })
  return r.stdout
}
const px = (img, x, y) => [img[(y * W + x) * 3], img[(y * W + x) * 3 + 1], img[(y * W + x) * 3 + 2]]
const media = (img, x, y, w = 8, h = 8) => {
  const s = [0, 0, 0]
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, x + i, y + j).forEach((v, k) => (s[k] += v))
  return s.map((v) => v / (w * h))
}
const rojo = (c) => c[0] > 150 && c[1] < 90 && c[2] < 90
const verde = (c) => c[1] > 150 && c[0] < 90
const negro = (c) => c[0] < 40 && c[1] < 40 && c[2] < 40
async function exportar(timeline, nombre) {
  const r = await exportarTimeline(proyecto, timeline, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, nombre))
  assert.equal(r.ok, true, r.error)
  return join(dir, nombre, 'timeline-prueba-original.mp4')
}

// 1) Volteada: la mitad verde queda a la izquierda. La capa mide 0,3 × 640 = 192 px, centrada en x = 192.
{
  const v = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.3, y: 0.5, ancho: 0.3, voltearH: true }] }, 3, medios)
  const img = cuadro(await exportar(v, 'volteo'), 1)
  assert.ok(verde(media(img, 192 - 80, 176)), `volteada: verde a la izquierda (${media(img, 112, 176)})`)
  assert.ok(rojo(media(img, 192 + 60, 176)), 'volteada: rojo a la derecha')
}
// 2) Recortada la mitad izquierda: ahí se ve el fondo; la derecha sigue en su sitio. También mientras crece (claves).
{
  const capa = { id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.3, y: 0.5, ancho: 0.3, recorte: { izq: 0.5, der: 0, arriba: 0, abajo: 0.25 } }
  const r = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [capa] }, 3, medios)
  const img = cuadro(await exportar(r, 'recorte'), 1)
  assert.ok(negro(media(img, 192 - 80, 150)), `recortada: la izquierda ya no se ve (${media(img, 112, 150)})`)
  assert.ok(verde(media(img, 192 + 10, 150)), `recortada: lo de la derecha sigue en su sitio (${media(img, 202, 150)})`)
  assert.ok(negro(media(img, 192 + 10, 176 + 80)), 'recortada por abajo: el cuarto de abajo no se ve')
  const crece = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ ...capa, claves: { ancho: [{ f: 0, v: 0.2 }, { f: 3, v: 0.4 }] } }] }, 3, medios)
  const img2 = cuadro(await exportar(crece, 'crece'), 2.5)
  // En 2,5 s mide ~0,39 × 640 ≈ 250 px: la mitad izquierda (de 192 − 125 a 192) no se ve; la derecha, sí.
  assert.ok(negro(media(img2, 192 - 100, 150)), 'recortada y creciendo: la izquierda sigue sin verse')
  assert.ok(verde(media(img2, 192 + 20, 150)), 'recortada y creciendo: la derecha se ve')
}
// 3) Textos: contorno rojo grueso, alineado a la izquierda, girado; mayúsculas.
{
  const textos = [
    { id: 't1', texto: 'ancla', inicio: 0, duracion: 3, posicion: 'abajo', x: 0.1, y: 0.25, alineacion: 'izquierda', sinCaja: true, contorno: 0.15, colorContorno: '#ff0000', tamano: 1.5 },
    { id: 't2', texto: 'GIRA', inicio: 0, duracion: 3, posicion: 'abajo', x: 0.7, y: 0.6, giro: 90, sinCaja: true, contorno: 0, tamano: 1.5 }
  ]
  const tt = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos }, 3, medios)
  const mp4 = await exportar(tt, 'textos')
  const ass = readFileSync(join(dir, 'rotulos-timeline.ass'), 'utf8')
  assert.match(ass, /\\an4\\pos\(/, 'alineado a la izquierda: anclado por su borde izquierdo')
  assert.match(ass, /\\frz-90/, 'el giro va en el ASS (contra el reloj es positivo)')
  assert.match(ass, /\\bord\d/, 'el contorno va en el ASS')
  const img = cuadro(mp4, 1)
  // Rótulo 1: lo blanco empieza en x ≈ 0,1·640 + 0,6 em (el margen que deja el monitor dentro de la caja).
  const eme = Math.round(Math.min(W, H) * 0.065) * 1.5 * EME_ROTULO
  let izq = W
  let rojos = 0
  for (let y = 60; y < 120; y++)
    for (let x = 0; x < W / 2; x++) {
      const c = px(img, x, y)
      if (c[0] > 200 && c[1] > 200 && c[2] > 200) izq = Math.min(izq, x)
      if (rojo(c)) rojos++
    }
  const esperado = 0.1 * W + 0.6 * eme
  assert.ok(Math.abs(izq - esperado) < eme * 0.25, `alineado a la izquierda: la letra empieza en ${izq}, el monitor la pone en ${esperado.toFixed(0)}`)
  assert.ok(rojos > 200, `el contorno rojo se ve (${rojos} píxeles)`)
  // Rótulo 2: girado 90°, lo blanco es más alto que ancho, centrado en (448, 216).
  let [x0, x1, y0, y1] = [W, 0, H, 0]
  for (let y = 0; y < H; y++)
    for (let x = W / 2 + 20; x < W; x++) {
      const c = px(img, x, y)
      if (c[0] > 200 && c[1] > 200 && c[2] > 200) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)]
    }
  assert.ok(y1 - y0 > (x1 - x0) * 1.5, `girado 90°: más alto (${y1 - y0}) que ancho (${x1 - x0})`)
  assert.ok(Math.abs((x0 + x1) / 2 - 448) < 8 && Math.abs((y0 + y1) / 2 - 216) < 8, `girado sobre su centro: (${(x0 + x1) / 2}, ${(y0 + y1) / 2})`)
}
// ===== Entradas y salidas =====
{
  // El modelo: una capa que entra por la izquierda en 1 s y sale por la derecha en 1 s.
  const base = { id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.2, entrada: 'izquierda', durEntrada: 1, salida: 'derecha', durSalida: 1 }
  const tm = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [base] }, 3, medios)
  const c = tm.capas[0]
  assert.equal(c.salida, 'derecha', 'la salida sobrevive a normalizar')
  assert.equal(c.durEntrada, 1)
  assert.ok(estadoCapa(c, 0.2).x < 0.3, 'a los 0,2 s todavía está entrando')
  assert.equal(estadoCapa(c, 1.5).x, 0.5, 'en medio está en su sitio')
  assert.ok(estadoCapa(c, 2.9).x > 0.8, 'al final se va por la derecha')
  assert.equal(durEntradaCapa({ entrada: 'pop' }), 0.24, 'el pop dura lo de siempre')
  const enc = { ...c, entrada: undefined, salida: 'encoger', durSalida: 0.5 }
  assert.ok(animacionCapa(enc, 2.99).escala < 0.1 && animacionCapa(enc, 2.75).escala < 0.9, 'al encogerse casi desaparece')
  assert.equal(animacionCapa(enc, 2).escala, 1, 'antes de salir, entera')
  // En el MP4, donde dice el monitor: entrando, en medio y saliendo.
  const mp4 = await exportar(tm, 'entra-sale')
  for (const t of [0.4, 1.5, 2.5]) {
    const e = estadoCapa(c, t)
    const xr = Math.round((e.x - 0.04) * W)
    const xv = Math.round((e.x + 0.04) * W)
    const img = cuadro(mp4, t)
    if (xr > 4 && xr < W - 12) assert.ok(rojo(media(img, xr - 4, 176)), `en ${t} s la mitad roja está donde dice el monitor (x ${xr}): ${media(img, xr - 4, 176)}`)
    if (xv > 4 && xv < W - 12) assert.ok(verde(media(img, xv - 4, 176)), `en ${t} s la mitad verde está donde dice el monitor (x ${xv})`)
  }
  // Se encoge: al final ya no ocupa su sitio.
  const te = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ ...base, entrada: undefined, salida: 'encoger', durSalida: 0.8 }] }, 3, medios)
  const mp4e = await exportar(te, 'encoge')
  assert.ok(rojo(media(cuadro(mp4e, 1), 320 - 40, 176)), 'antes de salir, entera')
  assert.ok(negro(media(cuadro(mp4e, 2.93), 320 - 40, 176)), 'al final se encogió')

  // Textos: la salida en el ASS (sobre la entrada) y en el monitor.
  const tx = { id: 't', texto: 'Hola', inicio: 0, duracion: 2, posicion: 'centro', animacion: 'rotulo', salida: 'fundido', durSalida: 0.5 }
  assert.match(conSalidaAss(tx, animarAss(tx, 'Hola', null).inicio, 60), /\\fad\(150,500\)/, 'el fundido de salida se suma al de entrada')
  assert.match(conSalidaAss({ ...tx, animacion: undefined, salida: 'encoger' }, '', 60), /\\fad\(0,500\)\\t\(1500,2000,\\fscx40\\fscy40\)/)
  assert.match(conSalidaAss({ ...tx, animacion: undefined, salida: 'desenfoque' }, '', 60), /\\t\(1500,2000,\\blur18\)/)
  assert.equal(conSalidaAss({ ...tx, salida: undefined }, 'x', 60), 'x', 'sin salida, nada')
  assert.deepEqual(salidaTexto(tx, 1), { opacidad: 1, escala: 1, desenfoque: 0 })
  assert.ok(Math.abs(salidaTexto(tx, 1.75).opacidad - 0.5) < 1e-9, 'a mitad de la salida, a media opacidad (como el fundido del MP4)')
  assert.match(animarAss({ ...tx, animacion: 'palabras-desenfoque', texto: 'una dos' }, 'una dos', null, 60).cuerpo, /\\blur18\\t\(\d+,\d+,.*\\blur0\)\}una/, 'palabra a palabra, de borrosa a nítida')
  assert.match(animarAss({ ...tx, animacion: 'desenfoque' }, 'Hola', null, 60).inicio, /\\blur18\\t\(0,350,\\blur0\)/)
  // En el MP4: el texto que se funde al final casi no se ve; antes, entero.
  const tt = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [{ ...tx, duracion: 3, animacion: undefined, tamano: 2, salida: 'fundido', durSalida: 1 }] }, 3, medios)
  assert.equal(tt.textos[0].durSalida, 1, 'la duración de la salida sobrevive a normalizar')
  const mp4t = await exportar(tt, 'texto-sale')
  const blancos = (img) => {
    let n = 0
    for (let y = 120; y < 240; y++) for (let x = 200; x < 440; x++) if (px(img, x, y)[0] > 200) n++
    return n
  }
  const antes = blancos(cuadro(mp4t, 1))
  const casi = blancos(cuadro(mp4t, 2.9))
  assert.ok(antes > 300 && casi < antes / 4, `el texto se funde al final (${antes} → ${casi} píxeles blancos)`)
  // Un solo cuadro a mitad de la salida (exportar un tramo, «Guardar este cuadro», la vista previa): sale igual que en el
  // video entero, aunque el texto quede cortado antes de terminar.
  const solo = soloTramo(tt, 2.5, 2.62)
  assert.ok(Math.abs(solo.textos[0].cola - 0.38) < 0.01, `lo cortado al final se recuerda (${solo.textos[0].cola})`)
  const r1 = await exportarTimeline(proyecto, tt, dir, { formato: 'original', subtitulos: false, desde: 2.5, hasta: 2.62 }, () => {}, join(dir, 'tramo'))
  assert.equal(r1.ok, true, r1.error)
  const enTramo = blancos(cuadro(join(dir, 'tramo', 'timeline-prueba-original.mp4'), 0))
  const enEntero = blancos(cuadro(mp4t, 2.5))
  assert.ok(Math.abs(enTramo - enEntero) < Math.max(40, enEntero * 0.25), `a mitad de la salida, el tramo (${enTramo}) se ve como el video entero (${enEntero})`)
  assert.ok(enEntero < antes * 0.8, 'y a mitad de la salida ya se está yendo')
}
// ===== Orden, ocultar, bloquear, duplicar y copiar el estilo =====
{
  const dos = normalizarTimeline(
    {
      clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }],
      textos: [{ id: 't1', inicio: 0, duracion: 1, texto: 'Uno', posicion: 'abajo', sinCaja: true, contorno: 0.1, colorContorno: '#ff0000', fuente: 'gruesa', salida: 'fundido' }, { id: 't2', inicio: 1, duracion: 1, texto: 'Dos', posicion: 'arriba' }],
      // La misma imagen dos veces en el mismo sitio: la de encima decide el color (A: rojo a la izquierda; B volteada: verde).
      capas: [{ id: 'A', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.3 }, { id: 'B', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.3, voltearH: true }]
    },
    3,
    medios
  )
  const izquierda = async (tl, nombre) => media(cuadro(await exportar(tl, nombre), 1), 320 - 70, 176)
  assert.ok(verde(await izquierda(dos, 'orden-1')), 'sin orden: la que va después (B) queda encima')
  const atras = ordenarCapa(dos, 'B', 'atras', medios)
  assert.equal(capasEnOrden(atras.capas)[0].id, 'B', 'enviada al fondo, se pinta primero')
  assert.ok(rojo(await izquierda(atras, 'orden-2')), 'B al fondo: en el MP4 se ve A encima')
  assert.equal(capasEnOrden(ordenarCapa(atras, 'B', 'frente', medios).capas)[1].id, 'B', 'y al frente otra vez')
  assert.deepEqual(normalizarTimeline(JSON.parse(JSON.stringify(atras)), 3, medios).capas.map((c) => c.orden ?? 0), atras.capas.map((c) => c.orden ?? 0), 'el orden sobrevive a normalizar')
  // Oculta: no sale en el MP4 (y sigue en la timeline).
  const oculta = cambiarCapa(atras, 'A', { oculto: true }, medios)
  assert.equal(oculta.capas.find((c) => c.id === 'A').oculto, true)
  assert.ok(verde(await izquierda(oculta, 'oculta')), 'A oculta: se ve B')
  assert.equal(timelineActiva(cambiarTexto(oculta, 't1', { oculto: true })).textos.length, 1, 'un texto oculto no se ve')
  // Duplicar: la copia va justo después (o, si no cabe, a la vez y encima).
  const d = duplicarTexto(dos, 't1')
  const copia = d.timeline.textos.find((t) => t.id === d.id)
  assert.equal(copia.inicio, 1, 'el texto duplicado va justo después')
  assert.equal(copia.contorno, 0.1, 'con su estilo')
  const dc = duplicarCapa(dos, 'A', medios)
  assert.equal(dc.timeline.capas.length, 3)
  assert.equal(dc.timeline.capas.find((c) => c.id === dc.id).inicio, 0, 'la capa que no cabe después va a la vez')
  // Copiar y pegar el estilo: el texto 2 se pone como el 1, sin cambiar lo que dice ni su sitio.
  const pegado = pegarEstiloTexto(dos, 't2', estiloDeTexto(dos.textos[0])).textos.find((t) => t.id === 't2')
  assert.equal(pegado.texto, 'Dos')
  assert.equal(pegado.posicion, 'arriba')
  assert.equal(pegado.contorno, 0.1)
  assert.equal(pegado.fuente, 'gruesa')
  assert.equal(pegado.salida, 'fundido')
  const capaPegada = pegarEstiloCapa(dos, 'A', estiloDeCapa(dos.capas[1]), medios).capas.find((c) => c.id === 'A')
  assert.equal(capaPegada.voltearH, true, 'la capa toma el volteo de la otra')
  assert.equal(pegarEstiloCapa(dos, 'B', estiloDeCapa(dos.capas[0]), medios).capas.find((c) => c.id === 'B').voltearH, undefined, 'y lo que la otra no tiene, se le quita')
  // El agente: orden, ocultar y bloquear.
  const r = aplicarOperaciones(dos, validarOperaciones([{ op: 'cambiar_capa', capa_n: 2, orden: 'atras', bloqueado: true }, { op: 'cambiar_texto', texto_n: 2, oculto: true }]), { duracionFuente: 3, transcript: [], medios: { m1: 5 } })
  assert.deepEqual(r.fallos, [])
  assert.equal(capasEnOrden(r.timeline.capas)[0].id, 'B')
  assert.equal(r.timeline.capas.find((c) => c.id === 'B').bloqueado, true)
  assert.equal(r.timeline.textos[1].oculto, true)
  assert.match(describirTimelineParaAgente(r.timeline, [], 3, 30_000, {}), /bloqueada/)
}
// ===== Esquinas, borde y sombra de una capa =====
{
  const blanco = join(dir, 'blanco.mp4')
  ff(['-f', 'lavfi', '-i', `color=c=white:s=${W}x${H}:d=3:r=30`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', blanco])
  const sobreBlanco = { ...proyecto, source: { ...proyecto.source, path: blanco } }
  const exportarB = async (tl, nombre) => {
    const r = await exportarTimeline(sobreBlanco, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, nombre))
    assert.equal(r.ok, true, r.error)
    return join(dir, nombre, 'timeline-prueba-original.mp4')
  }
  const blanca = (c) => c[0] > 200 && c[1] > 200 && c[2] > 200
  // La capa: 0,3 × 640 = 192 px de lado, centrada en (320, 180): de 224 a 416 y de 84 a 276.
  const base = { id: 'k', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.3 }
  const tl = (extra) => normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ ...base, ...extra }] }, 3, medios)
  const marcada = tl({ redondeo: 1, borde: 0.05, colorBorde: '#0000FF', sombraCapa: 1 })
  assert.deepEqual(
    { redondeo: marcada.capas[0].redondeo, borde: marcada.capas[0].borde, colorBorde: marcada.capas[0].colorBorde, sombraCapa: marcada.capas[0].sombraCapa },
    { redondeo: 1, borde: 0.05, colorBorde: '#0000ff', sombraCapa: 1 },
    'el marco sobrevive a normalizar'
  )
  // Redonda del todo: la esquina de su caja ya no tiene imagen (se ve el fondo blanco); el centro sí.
  const img = cuadro(await exportarB(tl({ redondeo: 1 }), 'redonda'), 1)
  assert.ok(blanca(media(img, 226, 86, 6, 6)), `redonda: la esquina se ve blanca (${media(img, 226, 86, 6, 6)})`)
  assert.ok(rojo(media(img, 280, 176)), 'redonda: dentro, la imagen')
  // Borde azul de 0,05 × 192 ≈ 10 px por dentro de lo que se ve.
  const conBorde = cuadro(await exportarB(tl({ borde: 0.05, colorBorde: '#0000ff' }), 'borde'), 1)
  const azulB = (c) => c[2] > 150 && c[0] < 90 && c[1] < 90
  assert.ok(azulB(media(conBorde, 228, 176, 4, 4)), `el borde azul por dentro, a la izquierda (${media(conBorde, 228, 176, 4, 4)})`)
  assert.ok(rojo(media(conBorde, 250, 176, 4, 4)), 'pasado el borde, la imagen')
  // Sombra: debajo a la derecha de la capa, el blanco se oscurece; arriba a la izquierda, no.
  const conSombra = cuadro(await exportarB(tl({ sombraCapa: 1 }), 'sombra'), 1)
  const abajoDer = media(conSombra, 418, 280, 4, 4)
  const arribaIzq = media(conSombra, 214, 74, 4, 4)
  assert.ok(abajoDer[0] < 200 && blanca(arribaIzq), `la sombra cae abajo a la derecha (${abajoDer} frente a ${arribaIzq})`)
  assert.ok(rojo(media(conSombra, 280, 176)), 'con sombra, la capa sigue en su sitio y de su tamaño')
  assert.ok(blanca(media(conSombra, 214, 176, 4, 4)), 'a su izquierda no hay sombra (no se corrió la capa)')
}
// ===== Curvas de suavizado de los fotogramas clave =====
{
  const conClaves = (curva) =>
    normalizarTimeline(
      { clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [], capas: [{ id: 'k', fuente: 'm1', inicio: 0, duracion: 3, x: 0.2, y: 0.5, ancho: 0.2, claves: { x: [{ f: 0, v: 0.2, ...(curva ? { curva } : {}) }, { f: 3, v: 0.8 }] } }] },
      3,
      medios
    )
  const x = (tl, t) => estadoCapa(tl.capas[0], t).x
  assert.ok(Math.abs(x(conClaves('lineal'), 0.75) - 0.35) < 1e-9, 'lineal: a la cuarta parte, un cuarto del camino')
  assert.ok(Math.abs(x(conClaves(), 0.75) - (0.2 + 0.6 * 0.15625)) < 1e-9, 'sin curva: suave, como siempre')
  assert.ok(x(conClaves('frena'), 0.75) > 0.5, 'frena: arranca rápido')
  assert.ok(x(conClaves('acelera'), 0.75) < 0.22, 'acelera: arranca despacio')
  assert.ok(x(conClaves('rebote'), 2.7) > 0.8, 'rebote: se pasa antes de llegar')
  assert.equal(conClaves('lineal').capas[0].claves.x[0].curva, 'lineal', 'la curva sobrevive a normalizar')
  assert.equal(conClaves('suave').capas[0].claves.x[0].curva, undefined, 'la de siempre no se guarda')
  // Cambiar la curva desde el panel, y que poner otra vez la clave no la pierda.
  let tc = curvaClaveCapa(conClaves(), 'k', 'x', 0, 'frena', medios)
  assert.equal(tc.capas[0].claves.x[0].curva, 'frena')
  tc = ponerClaveCapa(tc, 'k', 'x', 0, 0.25, medios)
  assert.equal(tc.capas[0].claves.x[0].curva, 'frena', 'cambiar el valor de la clave conserva su curva')
  // En el MP4, donde dice el monitor (la mitad roja de la capa).
  const frena = conClaves('frena')
  const mp4 = await exportar(frena, 'curva-frena')
  for (const t of [0.75, 2]) {
    const e = estadoCapa(frena.capas[0], t)
    const xr = Math.round((e.x - 0.05) * W)
    assert.ok(rojo(media(cuadro(mp4, t), xr - 4, 176)), `frena, en ${t} s: el MP4 la pone donde el monitor (x ${xr})`)
  }
  // El agente.
  const r = aplicarOperaciones(conClaves(), validarOperaciones([{ op: 'clave_capa', capa_n: 1, parametro: 'x', en: 0, valor: 0.2, curva: 'rebote' }]), { duracionFuente: 3, transcript: [], medios: { m1: 5 } })
  assert.equal(r.timeline.capas[0].claves.x[0].curva, 'rebote')
}
// ===== Alinear y repartir varias =====
{
  const p = (id) => ({ tipo: 'capa', id })
  const cajas = [
    { pieza: p('a'), caja: { izq: 0.1, der: 0.2, arriba: 0.1, abajo: 0.2 } },
    { pieza: p('b'), caja: { izq: 0.4, der: 0.6, arriba: 0.3, abajo: 0.4 } },
    { pieza: p('c'), caja: { izq: 0.8, der: 0.9, arriba: 0.5, abajo: 0.7 } }
  ]
  const izq = alinearPiezas(cajas, 'izquierda')
  assert.deepEqual(izq.map((x) => Math.round((cajas.find((c) => c.pieza.id === x.id).caja.izq + x.dx) * 1000) / 1000), [0.1, 0.1, 0.1], 'a la izquierda: todas empiezan donde la de más a la izquierda')
  const medio = alinearPiezas(cajas, 'medio')
  assert.ok(medio.every((x) => x.dx === 0), 'al medio: no se mueven de lado')
  const rep = alinearPiezas(cajas, 'repartir-h')
  // Ocupan 0,1 + 0,2 + 0,1 = 0,4 de 0,8: dos huecos de 0,2. La del medio, de 0,4 a 0,6 (ya estaba).
  assert.ok(Math.abs(rep.find((x) => x.id === 'b').dx) < 1e-9, 'repartir: la del medio queda centrada entre las otras')
  assert.deepEqual(alinearPiezas(cajas.slice(0, 2), 'repartir-h'), [], 'repartir pide tres o más')
  const sola = alinearPiezas([cajas[1]], 'derecha')
  assert.ok(Math.abs(sola[0].dx - 0.4) < 1e-9, 'una sola: con el cuadro (a la derecha, hasta el borde)')
}
// ===== Fotogramas clave de los textos =====
{
  const base = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }], textos: [{ id: 't', inicio: 0, duracion: 3, texto: 'MUEVE', posicion: 'centro', tamano: 1.5, sinCaja: true }] }, 3, medios)
  // Sitio: de x 0,2 a x 0,8, lineal; sin sitio propio, al poner la clave lo toma.
  let tl = ponerClaveTexto(base, 't', 'x', 0, 0.2)
  assert.equal(tl.textos[0].y, 0.5, 'al animar su sitio, toma sitio propio (el del centro)')
  tl = ponerClaveTexto(tl, 't', 'x', 3, 0.8)
  tl = curvaClaveTexto(tl, 't', 'x', 0, 'lineal')
  assert.ok(Math.abs(estadoTexto(tl.textos[0], 1.5).x - 0.5) < 1e-9, 'a mitad de camino, en medio')
  assert.deepEqual(normalizarTimeline(JSON.parse(JSON.stringify(tl)), 3, medios).textos[0].claves, tl.textos[0].claves, 'las claves sobreviven a normalizar')
  // Moverlo en el cabezal cambia su clave ahí (no el sitio fijo).
  const movido = cambiarTextoEn(tl, 't', { x: 0.3, y: 0.4 }, 3)
  assert.equal(movido.textos[0].claves.x.at(-1).v, 0.3, 'con claves de x, moverlo pone la clave del cabezal')
  assert.equal(movido.textos[0].y, 0.4, 'y lo que no tiene claves (y) se cambia fijo')
  // Un trozo que empieza después: las claves se corren con él.
  assert.ok(Math.abs(textoYaEmpezado(tl.textos[0], 1).claves.x[0].f + 1) < 1e-9)
  // En el MP4: el centro de lo blanco donde dice el monitor, en tres momentos.
  const mp4 = await exportar(tl, 'texto-claves')
  const ass = readFileSync(join(dir, 'rotulos-timeline.ass'), 'utf8')
  assert.ok((ass.match(/^Dialogue: 1,/gm) ?? []).length > 30, 'un evento por cuadro en que cambia')
  const centroBlanco = (img) => {
    let [s, k] = [0, 0]
    for (let y = 140; y < 220; y++) for (let x = 0; x < W; x++) if (px(img, x, y)[0] > 200 && px(img, x, y)[2] > 200) (s += x), k++
    return k ? s / k / W : null
  }
  for (const t of [0.5, 1.5, 2.5]) {
    const visto = centroBlanco(cuadro(mp4, t))
    const esperado = estadoTexto(tl.textos[0], t).x
    assert.ok(visto !== null && Math.abs(visto - esperado) < 0.02, `en ${t} s el texto está en x ${visto?.toFixed(3)}; el monitor lo pone en ${esperado.toFixed(3)}`)
  }
  // Tamaño, giro y opacidad animados, con una animación de entrada (palabra a palabra) que sigue donde iba.
  let tg = cambiarTexto(base, 't', { animacion: 'palabras', texto: 'uno dos tres' })
  tg = ponerClaveTexto(ponerClaveTexto(tg, 't', 'tamano', 0, 1), 't', 'tamano', 3, 3)
  tg = ponerClaveTexto(ponerClaveTexto(tg, 't', 'opacidad', 0, 1), 't', 'opacidad', 3, 0)
  tg = ponerClaveTexto(ponerClaveTexto(tg, 't', 'giro', 0, 0), 't', 'giro', 3, 90)
  const mp4g = await exportar(tg, 'texto-claves-2')
  const assG = readFileSync(join(dir, 'rotulos-timeline.ass'), 'utf8')
  assert.match(assG, /\\frz-\d/, 'el giro va en cada tramo')
  const blancos = (img) => {
    let n = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px(img, x, y)[0] > 50) n++
    return n
  }
  const b1 = blancos(cuadro(mp4g, 1))
  const b2 = blancos(cuadro(mp4g, 2))
  assert.ok(b1 > 400, `en 1 s se ven las tres palabras (${b1} píxeles claros)`)
  assert.ok(b2 > b1 * 0.8 || b2 > 400, `en 2 s, más grande aunque más transparente (${b2})`)
  assert.ok(blancos(cuadro(mp4g, 2.95)) < b1 / 3, 'al final, casi transparente')
  // Troceado en tramos, una animación palabra a palabra con fundido de salida se ve igual que sin claves.
  {
    const comun = { animacion: 'palabras', texto: 'uno dos tres cuatro', salida: 'fundido', durSalida: 0.5 }
    const sinC = cambiarTexto(base, 't', comun)
    const conC = ponerClaveTexto(ponerClaveTexto(sinC, 't', 'giro', 0, 0), 't', 'giro', 3, 0.3)
    const [ms, mc] = [await exportar(sinC, 'pal-sin'), await exportar(conC, 'pal-con')]
    const claros = (img) => { let n = 0; for (const v of img) if (v > 100) n++; return n }
    for (const t of [0.1, 0.3, 0.5, 1, 2.75]) {
      const [a1, a2] = [claros(cuadro(ms, t)), claros(cuadro(mc, t))]
      assert.ok(Math.abs(a1 - a2) <= Math.max(60, a1 * 0.08), `en ${t} s, palabra a palabra se ve igual con claves (${a2}) que sin ellas (${a1})`)
    }
  }
  // El agente.
  const r = aplicarOperaciones(base, validarOperaciones([{ op: 'clave_texto', texto_n: 1, parametro: 'tamano', en: 0, valor: 1 }, { op: 'clave_texto', texto_n: 1, parametro: 'tamano', en: 2, valor: 2.5, curva: 'frena' }]), { duracionFuente: 3, transcript: [], medios: { m1: 5 } })
  assert.deepEqual(r.fallos, [])
  assert.equal(r.timeline.textos[0].claves.tamano.length, 2)
  assert.equal(r.timeline.textos[0].claves.tamano[1].curva, 'frena')
}
console.log('prueba-capas-textos: todo bien')
