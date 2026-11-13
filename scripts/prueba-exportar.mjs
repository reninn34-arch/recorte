// Exporta con FFmpeg de verdad una timeline con lo de la fase 6.1: una capa encima con «pop»,
// otra con fundido, un efecto de sonido y un rótulo en posición libre. Comprueba que el MP4 sale,
// que la capa se ve en su sitio y en su segundo, y que el sonido suena.
// npm run prueba:exportar
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportarTimeline } from '../src/main/exportar.ts'
import { aplicarParalaje, estadoCapa, normalizarTimeline, referenciaParalaje } from '../src/shared/timeline.ts'

const dir = mkdtempSync(join(tmpdir(), 'recorte-exportar-'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
mkdirSync(join(dir, 'media'))
const fondo = join(dir, 'fondo.mp4')
ff(['-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fondo])
const logo = join(dir, 'media', 'logo.png')
ff(['-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', logo])
const toma = join(dir, 'media', 'toma.mp4')
ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', toma])
ff(['-f', 'lavfi', '-i', 'sine=f=880:d=0.4', join(dir, 'media', 'ding.wav')])

const proyecto = {
  id: 'p',
  name: 'prueba',
  source: { path: fondo, width: 640, height: 360, fps: 30, duration: 4 },
  brand: { primary: '#ffffff' },
  medios: [
    { id: 'm1', ruta: logo, tipo: 'imagen', conAudio: false, nombre: 'logo.png', duracion: 0 },
    { id: 'm2', ruta: toma, tipo: 'video', conAudio: false, nombre: 'toma.mp4', duracion: 3 }
  ]
}
const tl = normalizarTimeline(
  {
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 4 }],
    textos: [{ id: 't1', texto: 'Libre', inicio: 0, duracion: 4, posicion: 'abajo', x: 0.8, y: 0.2 }],
    capas: [
      { id: 'k1', fuente: 'm1', inicio: 1, duracion: 1.5, x: 0.25, y: 0.5, ancho: 0.2, entrada: 'pop' },
      { id: 'k2', fuente: 'm2', inicio: 2.5, duracion: 1, x: 0.75, y: 0.75, ancho: 0.3, entrada: 'fundido' }
    ],
    sonidos: [{ id: 's1', inicio: 1, duracion: 0.4, archivo: 'media/ding.wav', nombre: 'Ding', volumen: 0.8 }]
  },
  4,
  { m1: 5, m2: 3 }
)
assert.equal(tl.capas.length, 2, 'las capas sobreviven a normalizar')
assert.equal(tl.sonidos.length, 1, 'el sonido sobrevive a normalizar')
assert.equal(tl.textos[0].x, 0.8, 'la posición libre sobrevive a normalizar')

const r = await exportarTimeline(proyecto, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas'))
assert.equal(r.ok, true, r.error)
assert.ok(existsSync(r.archivo ?? r.ruta ?? join(dir, 'salidas', 'timeline-prueba-original.mp4')))
const mp4 = join(dir, 'salidas', 'timeline-prueba-original.mp4')

/** El color medio de un recuadro del cuadro en el segundo `t`. */
function color(t, x, y, w = 20, h = 20) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', `crop=${w}:${h}:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return [...r.stdout]
}
const rojo = (c) => c[0] > 150 && c[1] < 80
const azul = (c) => c[2] > 150 && c[0] < 80
assert.ok(!rojo(color(0.5, 150, 170)), 'antes de su segundo, el logo no está')
assert.ok(rojo(color(1.8, 150, 170)), 'el logo aparece a la izquierda, al centro')
assert.ok(!rojo(color(2.8, 150, 170)), 'el logo se va al terminar')
assert.ok(azul(color(3.3, 470, 260)), 'la toma de apoyo entra abajo a la derecha')

// El «ding» suena en el segundo 1 (y no antes).
const vol = (desde) => {
  const r = spawnSync('ffmpeg', ['-v', 'info', '-ss', String(desde), '-t', '0.3', '-i', mp4, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  return Number(/max_volume: (-?[\d.]+)/.exec(r.stderr)?.[1] ?? -99)
}
assert.ok(vol(0.2) < -40, 'silencio antes del sonido')
assert.ok(vol(1.05) > -30, 'el sonido suena en su segundo')


// Una capa que entra desde la izquierda, cruza y gira, con todos los filtros: el MP4 la pone donde
// el monitor dice que va (estadoCapa) y los filtros oscurecen las esquinas (viñeta).
const blanco = join(dir, 'blanco.mp4')
ff(['-f', 'lavfi', '-i', 'color=c=white:s=640x360:d=3:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', blanco])
const mueve = normalizarTimeline(
  {
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }],
    textos: [],
    capas: [{ id: 'k1', fuente: 'm1', inicio: 0.5, duracion: 2.5, x: 0.25, y: 0.5, ancho: 0.15, entrada: 'izquierda', giro: 0, fin: { x: 0.8, y: 0.4, ancho: 0.2, giro: 90 } }],
    filtros: { grano: 0.4, polvo: 0.5, trama: 0.5, vineta: 0.8, parpadeo: 0.3 }
  },
  3,
  { m1: 5 }
)
assert.deepEqual(mueve.capas[0].fin, { x: 0.8, y: 0.4, ancho: 0.2, giro: 90 }, 'el recorrido sobrevive a normalizar')
assert.equal(mueve.filtros.vineta, 0.8, 'los filtros sobreviven a normalizar')
const otro = { ...proyecto, source: { ...proyecto.source, path: blanco, duration: 3 } }
const r2 = await exportarTimeline(otro, mueve, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas2'))
assert.equal(r2.ok, true, r2.error)
const mp42 = join(dir, 'salidas2', 'timeline-prueba-original.mp4')
const color2 = (t, x, y) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp42, '-frames:v', '1', '-vf', `crop=8:8:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return [...r.stdout]
}
for (const t of [0.7, 1.5, 2.6]) {
  const e = estadoCapa(mueve.capas[0], t - 0.5)
  const [x, y] = [Math.round(e.x * 640) - 4, Math.round(e.y * 360) - 4]
  assert.ok(x > 0 && rojo(color2(t, x, y)), `en ${t} s la capa está donde dice el monitor (${x}, ${y}): ${color2(t, x, y)}`)
}
assert.ok(!rojo(color2(1.5, 150, 176)), 'ya no está donde empezó: se movió')
const esquina = color2(1.5, 2, 2)
const centro = color2(1.5, 316, 300)
assert.ok(esquina[0] + 40 < centro[0], `la viñeta oscurece la esquina (${esquina} frente a ${centro})`)

// Un barrido entre un clip blanco y uno rojo: a mitad de la transición, medio cuadro de cada uno.
const rojoVid = join(dir, 'rojo.mp4')
ff(['-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', rojoVid])
const conBarrido = normalizarTimeline(
  {
    clips: [
      { id: 'c1', fuente: 'principal', entrada: 0, salida: 2 },
      { id: 'c2', fuente: 'm3', entrada: 0, salida: 2, fundido: 1, transicion: 'barrido-izquierda' }
    ],
    textos: [{ id: 't1', texto: 'Una pregunta que se arma', inicio: 0, duracion: 3, posicion: 'centro', animacion: 'palabras' }]
  },
  3,
  { m3: 2 }
)
assert.equal(conBarrido.clips[1].transicion, 'barrido-izquierda', 'la transición sobrevive a normalizar')
assert.equal(conBarrido.textos[0].animacion, 'palabras', 'la animación sobrevive a normalizar')
const otro3 = { ...otro, medios: [...proyecto.medios, { id: 'm3', ruta: rojoVid, tipo: 'video', conAudio: false, nombre: 'rojo.mp4', duracion: 2 }] }
const r3 = await exportarTimeline(otro3, conBarrido, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas3'))
assert.equal(r3.ok, true, r3.error)
const mp43 = join(dir, 'salidas3', 'timeline-prueba-original.mp4')
const color3 = (t, x, y) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp43, '-frames:v', '1', '-vf', `crop=8:8:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return [...r.stdout]
}
// En pleno barrido hacia la izquierda: a la izquierda aún el blanco, a la derecha ya entra el rojo.
const [izq, der] = [color3(2.5, 20, 300), color3(2.5, 610, 300)]
assert.ok(izq[1] > 200 && rojo(der), `a mitad del barrido, blanco a la izquierda y rojo a la derecha: ${izq} / ${der}`)

// Un personaje que se mueve: un clip sobre verde croma, sin fondo (WebM con transparencia) como capa encima.
const croma = join(dir, 'croma.mp4')
ff(['-f', 'lavfi', '-i', 'color=c=0x00B140:s=320x180:d=2:r=24', '-f', 'lavfi', '-i', 'color=c=red:s=60x60:d=2:r=24', '-filter_complex', "[0][1]overlay=x='60+100*t':y=60", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', croma])
const rv = spawnSync('python', [join(import.meta.dirname, '..', 'python', 'kit', 'kit.py'), 'recortar-video', croma], { encoding: 'utf8' })
assert.equal(rv.status, 0, rv.stderr)
const webm = join(dir, 'croma-recorte.webm')
const conClip = normalizarTimeline(
  {
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 3 }],
    textos: [],
    capas: [{ id: 'k1', fuente: 'm4', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 1 }]
  },
  3,
  { m4: 2 }
)
const otro4 = { ...otro, medios: [...proyecto.medios, { id: 'm4', ruta: webm, tipo: 'video', conAudio: false, nombre: 'personaje.webm', duracion: 2, ancho: 320, alto: 180 }] }
const r4 = await exportarTimeline(otro4, conClip, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas4'))
assert.equal(r4.ok, true, r4.error)
const mp44 = join(dir, 'salidas4', 'timeline-prueba-original.mp4')
const fila = (t) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp44, '-frames:v', '1', '-vf', 'crop=640:2:0:180,scale=640:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  const px = []
  for (let i = 0; i < r.stdout.length; i += 3) px.push([r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]])
  return px
}
for (const t of [0.5, 2.5]) {
  const px = fila(t)
  const verdes = px.filter((p) => p[1] > p[0] + 40 && p[1] > p[2] + 40).length
  const rojos = px.filter((p) => rojo(p)).length
  assert.ok(verdes === 0 && rojos > 20, `en ${t} s el clip sin fondo se ve sin verde (${verdes} verdes, ${rojos} rojos)`)
}

// Escena 2.5D: un fondo (imagen) con zoom y paneo a la derecha; una capa pegada al fondo, una fija y una
// muy cercana y desenfocada. En el MP4 cada una está donde dice el monitor (aplicarParalaje).
const rejilla = join(dir, 'media', 'rejilla.png')
ff(['-f', 'lavfi', '-i', 'color=c=0x224466:s=1280x720,drawgrid=w=40:h=40:c=white', '-frames:v', '1', rejilla])
const escena = normalizarTimeline(
  {
    clips: [{ id: 'c1', fuente: 'm5', entrada: 0, salida: 3, ajustes: { zoom: 1.4, cx: 0.4, panx: 0.2, temblor: 0.6, campo: 0.3, foco: 0.5 } }],
    textos: [],
    capas: [
      { id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.25, ancho: 0.08, profundidad: 0 },
      { id: 'k2', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.08 },
      { id: 'k3', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.75, ancho: 0.08, profundidad: 1, desenfoque: 0.4 }
    ]
  },
  3,
  { m1: 5, m5: 3 }
)
assert.equal(escena.capas[2].profundidad, 1, 'la profundidad sobrevive a normalizar')
assert.equal(escena.clips[0].ajustes.panx, 0.2, 'el paneo sobrevive a normalizar')
const otro5 = { ...otro, medios: [...proyecto.medios, { id: 'm5', ruta: rejilla, tipo: 'imagen', conAudio: false, nombre: 'rejilla.png', duracion: 3, ancho: 1280, alto: 720 }] }
const r5 = await exportarTimeline(otro5, escena, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas5'))
assert.equal(r5.ok, true, r5.error)
const mp45 = join(dir, 'salidas5', 'timeline-prueba-original.mp4')
const centroRojo = (t, y) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp45, '-frames:v', '1', '-vf', `crop=640:2:0:${y},scale=640:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  let suma = 0
  let n = 0
  for (let i = 0; i < r.stdout.length; i += 3) if (r.stdout[i] > 150 && r.stdout[i + 1] < 90 && r.stdout[i + 2] < 90) (suma += i / 3), n++
  return n ? suma / n : NaN
}
const movido = {}
for (const [i, y] of [[0, 90], [1, 180], [2, 270]]) {
  const c = escena.capas[i]
  const ref = referenciaParalaje(escena, c)
  for (const t of [0.5, 2.5]) {
    const e = estadoCapa(c, t)
    const x = (ref ? aplicarParalaje(ref, c.profundidad, c.inicio, t, e) : e).x * 640
    const visto = centroRojo(t, y)
    assert.ok(Math.abs(visto - x) < 6, `capa ${i + 1} en ${t} s: el MP4 la pone en ${visto.toFixed(1)}, el monitor en ${x.toFixed(1)}`)
  }
  movido[i] = centroRojo(2.5, y) - centroRojo(0.5, y)
}
assert.ok(movido[0] < -10 && Math.abs(movido[1]) < 2 && movido[2] < movido[0] * 2, `paralaje: ${JSON.stringify(movido)}`)

// Dos tomas de la misma imagen (otro encuadre tras el corte): la capa con profundidad sigue a la segunda, calzada.
const tomas = normalizarTimeline(
  {
    clips: [
      { id: 'c1', fuente: 'm5', entrada: 0, salida: 1.5, ajustes: { zoom: 1.4, cx: 0.3, panx: 0.1 } },
      { id: 'c2', fuente: 'm5', entrada: 0, salida: 1.5, ajustes: { zoom: 1.4, cx: 0.7, panx: -0.1 } }
    ],
    textos: [],
    capas: [{ id: 'k1', fuente: 'm1', inicio: 0, duracion: 3, x: 0.5, y: 0.5, ancho: 0.08, profundidad: 0.6 }]
  },
  3,
  { m1: 5, m5: 3 }
)
assert.equal(referenciaParalaje(tomas, tomas.capas[0]).tramos.length, 2, 'la capa conoce las dos tomas de su escena')
const r6 = await exportarTimeline(otro5, tomas, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas6'))
assert.equal(r6.ok, true, r6.error)
const mp46 = join(dir, 'salidas6', 'timeline-prueba-original.mp4')
const centro6 = (t) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp46, '-frames:v', '1', '-vf', 'crop=640:2:0:180,scale=640:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  let suma = 0
  let n = 0
  for (let i = 0; i < r.stdout.length; i += 3) if (r.stdout[i] > 150 && r.stdout[i + 1] < 90 && r.stdout[i + 2] < 90) (suma += i / 3), n++
  return n ? suma / n : NaN
}
const ref6 = referenciaParalaje(tomas, tomas.capas[0])
for (const t of [0.7, 1.7, 2.6]) {
  const x = aplicarParalaje(ref6, 0.6, 0, t, estadoCapa(tomas.capas[0], t)).x * 640
  const visto = centro6(t)
  assert.ok(Math.abs(visto - x) < 6, `dos tomas, ${t} s: el MP4 pone la capa en ${visto.toFixed(1)}, el monitor en ${x.toFixed(1)}`)
}
assert.ok(Math.abs(centro6(1.7) - centro6(1.4)) > 40, 'en el corte la capa salta con el fondo (sigue a la segunda toma)')

// Velocidad y pistas: un clip al doble dura la mitad (en la timeline y en el MP4), dividirlo conserva su velocidad,
// y una pista silenciada u oculta no llega al MP4.
{
  const { cambiarVelocidad, cambiarPista, dividir, duracionTimeline, timelineActiva, ubicar } = await import('../src/shared/timeline.ts')
  const tonos = join(dir, 'tonos.mp4')
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=4:r=30', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', tonos])
  const p7 = { ...proyecto, source: { ...proyecto.source, path: tonos, duration: 4 }, medios: [] }
  const base = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 4 }], textos: [{ id: 't1', texto: 'Hola', inicio: 0, duracion: 1, posicion: 'abajo' }] }, 4, {})
  const rapida = cambiarVelocidad(base, 'c1', 2)
  assert.ok(Math.abs(duracionTimeline(rapida) - 2) < 0.001, 'al doble de velocidad, el clip dura la mitad')
  assert.ok(Math.abs(ubicar(rapida, 1).tFuente - 2) < 0.001, 'el segundo 1 de la timeline es el 2 de la fuente')
  const partida = dividir(rapida, 0.5)
  assert.equal(partida.clips.length, 2)
  assert.ok(partida.clips.every((c) => c.velocidad === 2) && Math.abs(partida.clips[0].salida - 1) < 0.001, 'dividir conserva la velocidad y corta en la fuente')
  assert.ok(Math.abs(duracionTimeline(partida) - 2) < 0.001)
  assert.equal(normalizarTimeline(rapida, 4, {}).clips[0].velocidad, 2, 'la velocidad sobrevive a guardar y abrir')
  const mp4 = (r, carpeta) => r.archivo ?? r.ruta ?? join(dir, carpeta, 'timeline-prueba-original.mp4')
  const dur = (ruta) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ruta], { encoding: 'utf8' }).stdout)
  const pistas = (ruta) => spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', ruta], { encoding: 'utf8' }).stdout
  const r7 = await exportarTimeline(p7, rapida, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas7'))
  assert.ok(r7.ok, r7.error)
  assert.ok(Math.abs(dur(mp4(r7, 'salidas7')) - 2) < 0.15, `al doble, el MP4 dura 2 s (dura ${dur(mp4(r7, 'salidas7'))})`)
  assert.ok(/audio/.test(pistas(mp4(r7, 'salidas7'))), 'el clip acelerado conserva su sonido')
  const lenta = cambiarVelocidad(normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 1 }], textos: [] }, 4, {}), 'c1', 0.25)
  const r8 = await exportarTimeline(p7, lenta, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas8'))
  assert.ok(r8.ok, r8.error)
  assert.ok(Math.abs(dur(mp4(r8, 'salidas8')) - 4) < 0.2, `a un cuarto, 1 s de fuente dura 4 s (dura ${dur(mp4(r8, 'salidas8'))})`)
  // Pistas: el texto oculto y el video silenciado.
  const callada = cambiarPista(cambiarPista(base, 'video', { oculta: true }), 'texto', { oculta: true })
  assert.equal(timelineActiva(callada).textos.length, 0)
  assert.equal(callada.textos.length, 1, 'ocultar una pista no borra lo que tiene')
  assert.equal(normalizarTimeline(callada, 4, {}).pistas?.video?.oculta, true, 'las pistas sobreviven a guardar y abrir')
  const r9 = await exportarTimeline(p7, callada, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas9'))
  assert.ok(r9.ok, r9.error)
  const vol = spawnSync('ffmpeg', ['-v', 'info', '-i', mp4(r9, 'salidas9'), '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const max = Number(/max_volume: (-?[\d.]+|-inf)/.exec(vol)?.[1] ?? '-inf')
  assert.ok(!/audio/.test(pistas(mp4(r9, 'salidas9'))) || !(max > -60), `con la pista de video silenciada, el MP4 no suena (máx ${max} dB)`)
  console.log('velocidad (2× y 0,25×) y pistas ocultas en el MP4 ✓')
}

// Efectos de clip: la sepia, el tono y el negativo salen en el MP4 con el mismo color que calcula el monitor (la matriz
// de CSS), y el desenfoque borra un borde nítido.
{
  const { ajustarClip, aplicarLook, matrizColor, ajustesDe, LOOKS } = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const rojo = join(dir, 'rojo.mp4')
  // Mitad izquierda roja, mitad derecha azul: un color conocido y un borde nítido.
  ff(['-f', 'lavfi', '-i', 'color=c=0xC83232:s=320x360:d=1:r=30', '-f', 'lavfi', '-i', 'color=c=0x3232C8:s=320x360:d=1:r=30', '-filter_complex', 'hstack', '-c:v', 'libx264', '-pix_fmt', 'yuv444p', rojo])
  const p10 = { ...proyecto, source: { ...proyecto.source, path: rojo, duration: 1 }, medios: [] }
  const base = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 1 }], textos: [] }, 1, {})
  const mp4 = (carpeta) => join(dir, carpeta, 'timeline-prueba-original.mp4')
  const color = (ruta, x) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', ruta, '-frames:v', '1', '-vf', `crop=40:40:${x}:160,scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer' })
    return [...r.stdout.subarray(0, 3)]
  }
  const esperado = (rgb, a) => {
    const M = matrizColor(a) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
    let v = [0, 1, 2].map((i) => Math.min(255, Math.max(0, M[i * 3] * rgb[0] + M[i * 3 + 1] * rgb[1] + M[i * 3 + 2] * rgb[2])))
    if (a.invertir >= 0.5) v = v.map((x) => 255 - x)
    return v
  }
  // El color de partida, tal como sale sin efectos (la conversión de color del MP4 ya lo mueve un poco).
  const r0 = await exportarTimeline(p10, base, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas-base'))
  assert.ok(r0.ok, r0.error)
  const partida = color(mp4('salidas-base'), 60)
  assert.ok(Math.abs(partida[0] - 200) < 6 && Math.abs(partida[1] - 50) < 6, `sin efectos, el color sale como entró (un rojo 200,50,50 da ${partida})`)
  let n = 10
  for (const [nombre, cambio] of [['sepia', { sepia: 1 }], ['tono', { tono: 90 }], ['sepia + tono', { sepia: 0.5, tono: -120 }], ['negativo', { invertir: 1 }]]) {
    const tl = ajustarClip(base, 'c1', cambio)
    const carpeta = `salidas${n++}`
    const r = await exportarTimeline(p10, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, carpeta))
    assert.ok(r.ok, r.error)
    const visto = color(mp4(carpeta), 60)
    const quiero = esperado(partida, ajustesDe(tl.clips[0]))
    assert.ok(visto.every((v, i) => Math.abs(v - quiero[i]) < 8), `${nombre}: el MP4 da ${visto} y el monitor ${quiero.map(Math.round)}`)
  }
  // Desenfoque: en el borde entre el rojo y el azul, el color pasa a ser una mezcla.
  const borrosa = ajustarClip(base, 'c1', { desenfoque: 1 })
  const rb = await exportarTimeline(p10, borrosa, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'salidas-borrosa'))
  assert.ok(rb.ok, rb.error)
  const junto = color(mp4('salidas-borrosa'), 285)
  assert.ok(junto[2] > 70 && junto[0] > 70, `con desenfoque, junto al borde hay mezcla de rojo y azul (hay ${junto})`)
  // Un look sustituye al anterior, y el agente los pone con la op «color».
  const conLook = aplicarLook(aplicarLook(base, 'c1', LOOKS.find((l) => l.id === 'sepia').ajustes), 'c1', LOOKS.find((l) => l.id === 'bn').ajustes)
  assert.equal(conLook.clips[0].ajustes.sepia, undefined, 'un look nuevo quita el anterior')
  assert.equal(conLook.clips[0].ajustes.saturacion, 0)
  const ops = validarOperaciones([{ op: 'color', clip: 1, look: 'vintage' }, { op: 'color', clip: 1, desenfoque: 0.4 }, { op: 'pista', pista: 'musica', oculta: true }])
  const hecho = aplicarOperaciones(base, ops, { duracionFuente: 1, medios: {} })
  assert.ok(hecho.timeline.clips[0].ajustes.sepia > 0.5 && hecho.timeline.clips[0].ajustes.desenfoque === 0.4 && hecho.timeline.pistas.musica.oculta, `las ops del agente no se aplicaron: ${JSON.stringify(hecho)}`)
  console.log('efectos de clip (sepia, tono, negativo, desenfoque) iguales en el MP4; looks y ops del agente ✓')
}

rmSync(dir, { recursive: true, force: true })
console.log('exportar: ok')
