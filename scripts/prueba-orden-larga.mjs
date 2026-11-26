// Cientos de capas (como los subtítulos hechos imagen): la línea de órdenes de FFmpeg pasaría de lo que acepta
// Windows (32 767 caracteres) y la exportación fallaba con ENAMETOOLONG. Ahora las entradas se enlazan con un nombre
// corto y el video sale, con sus capas donde van.
// npm run prueba:orden-larga
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { acortarEntradas, exportarTimeline } from '../src/main/exportar.ts'
import { normalizarTimeline } from '../src/shared/timeline.ts'

const dir = mkdtempSync(join(tmpdir(), 'recorte-orden-'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
try {
  // acortarEntradas: por debajo del límite no toca nada; por encima, cada ruta pasa a e/N (y la misma, al mismo).
  const a = join(dir, 'a.png')
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=8x8', '-frames:v', '1', a])
  assert.deepEqual(acortarEntradas(['-i', a], dir), ['-i', a], 'una orden corta queda igual')
  const cortas = acortarEntradas(['-loop', '1', '-i', a, '-i', a, '-f', 'lavfi', '-i', 'anullsrc'], dir, 10)
  assert.deepEqual(cortas, ['-loop', '1', '-i', 'e/1.png', '-i', 'e/1.png', '-f', 'lavfi', '-i', 'anullsrc'])
  assert.ok(existsSync(join(dir, 'e', '1.png')), 'el nombre corto existe')

  // Un video y 400 imágenes distintas en una carpeta de nombre largo, cada una como capa de 0,1 s.
  const fondo = join(dir, 'f.mp4')
  ff(['-f', 'lavfi', '-i', 'color=c=0x202020:s=320x180:d=8:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', fondo])
  const lejos = join(dir, 'una carpeta con un nombre bastante largo para los graficos de subtitulos', 'trabajo', 'graficos')
  mkdirSync(lejos, { recursive: true })
  const N = 400
  const medios = []
  const capas = []
  // Las imágenes, de una en una sería lento: una sola orden de FFmpeg las escribe todas (verdes, 64×32).
  ff(['-f', 'lavfi', '-i', 'color=c=0x20c040:s=64x32:r=1', '-frames:v', String(N), join(lejos, 'sub-%03d-subtitulo-palabra.png')])
  for (let i = 0; i < N; i++) {
    const id = `m-${i}`
    medios.push({ id, nombre: `sub-${i}.png`, ruta: join(lejos, `sub-${String(i + 1).padStart(3, '0')}-subtitulo-palabra.png`), tipo: 'imagen', duracion: 0, ancho: 64, alto: 32 })
    capas.push({ id: `k${i}`, fuente: id, inicio: i * 0.019, duracion: 0.1, x: 0.5, y: 0.5, ancho: 0.3 })
  }
  const largo = medios.reduce((t, m) => t + m.ruta.length + 40, 0)
  assert.ok(largo > 33000, `la orden sin acortar pasaría del límite de Windows (${largo} caracteres)`)
  const p = { id: 'p', name: 'p', source: { path: fondo, width: 320, height: 180, fps: 30, duration: 8 }, brand: { primary: '#fff' }, medios }
  const duraciones = Object.fromEntries(medios.map((m) => [m.id, 0]))
  const tl = normalizarTimeline({ clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 8 }], textos: [], capas }, 8, duraciones)
  assert.equal(tl.capas?.length, N, 'las 400 capas siguen en la timeline')
  const r = await exportarTimeline(p, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 's'))
  assert.equal(r.ok, true, r.error)
  // A los 4 s hay una capa verde en el centro; en una esquina, el fondo gris.
  const color = (t, x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', r.output, '-frames:v', '1', '-vf', `crop=8:8:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout]
  const centro = color(4, 156, 86)
  const esquina = color(4, 4, 4)
  assert.ok(centro[1] > 150 && centro[0] < 80, `la capa verde está en el centro (rgb ${centro})`)
  assert.ok(esquina[1] < 60, `y fuera de ella, el fondo (rgb ${esquina})`)
  console.log(`orden larga: 400 capas exportadas (sin acortar serían ${largo} caracteres) ✓`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
