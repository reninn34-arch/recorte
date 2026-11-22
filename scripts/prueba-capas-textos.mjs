// Las herramientas de capas y textos del editor: el estilo de los textos (contorno, sombra, alineación, espaciado,
// mayúsculas, opacidad, giro) y el recorte y volteo de las capas. Comprueba que sobreviven a normalizar y que el MP4
// (FFmpeg de verdad) los dibuja donde y como los pone el monitor.
// npm run prueba:capas-textos
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportarTimeline, alfasAss } from '../src/main/exportar.ts'
import { imanEje, objetivosIman } from '../src/renderer/src/guias.ts'
import { aplicarOperaciones, describirTimelineParaAgente, validarOperaciones } from '../src/shared/chat.ts'
import { anadirTexto, cambiarCapa, cambiarTexto, estiloDeTexto, normalizarTimeline, textoVisible, trazoTexto, EME_ROTULO } from '../src/shared/timeline.ts'

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
console.log('prueba-capas-textos: todo bien')
