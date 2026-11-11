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
import { normalizarTimeline } from '../src/shared/timeline.ts'

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

rmSync(dir, { recursive: true, force: true })
console.log('exportar: ok')
