// Color por zonas: elegir los rojos y girarlos a verde cambia solo lo rojo (el azul y el gris quedan igual), en el
// cálculo y en el MP4 que sale de FFmpeg (LUT 3D).
// npm run prueba:zona
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportarTimeline } from '../src/main/exportar.ts'
import { ajustesDe, colorZona, normalizarTimeline, pesoZona, zonaColorActiva } from '../src/shared/timeline.ts'

const a = ajustesDe({ ajustes: { zonaMatiz: 0, zonaAncho: 25, zonaGiro: 120 } })
assert.equal(zonaColorActiva(a), true)
assert.equal(zonaColorActiva(ajustesDe(undefined)), false, 'sin cambios no hay zona')
assert.equal(pesoZona(0.8, 0.1, 0.1, a), 1, 'el rojo entra de lleno')
assert.equal(pesoZona(0.1, 0.1, 0.8, a), 0, 'el azul no entra')
assert.equal(pesoZona(0.5, 0.5, 0.5, a), 0, 'el gris no entra')
const verde = colorZona(0.8, 0.1, 0.1, a)
assert.ok(verde[1] > 0.6 && verde[0] < 0.25, 'el rojo pasa a verde: ' + verde.map((x) => x.toFixed(2)))
assert.deepEqual(colorZona(0.1, 0.1, 0.8, a), [0.1, 0.1, 0.8], 'el azul queda igual')
// Menos color en la zona: el rojo se apaga hacia gris.
const gris = colorZona(0.8, 0.1, 0.1, ajustesDe({ ajustes: { zonaMatiz: 0, zonaSat: -1 } }))
assert.ok(Math.max(...gris) - Math.min(...gris) < 0.02, 'sin saturación, el rojo queda gris')

const dir = mkdtempSync(join(tmpdir(), 'recorte-zona-'))
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0)
try {
  // Mitad izquierda roja, mitad derecha azul.
  const fondo = join(dir, 'f.mp4')
  ff(['-f', 'lavfi', '-i', 'color=c=#cc2020:s=320x180:d=1:r=30', '-f', 'lavfi', '-i', 'color=c=#2020cc:s=320x180:d=1:r=30', '-filter_complex', '[0][1]hstack', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '12', fondo])
  const p = { id: 'p', name: 'p', source: { path: fondo, width: 640, height: 180, fps: 30, duration: 1 }, brand: { primary: '#fff' }, medios: [] }
  const tl = normalizarTimeline({ clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 1, ajustes: { zonaMatiz: 0, zonaAncho: 25, zonaGiro: 120 } }], textos: [] }, 1, {})
  const r = await exportarTimeline(p, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 's'))
  assert.equal(r.ok, true, r.error)
  const color = (x) => {
    const s = spawnSync('ffmpeg', ['-v', 'error', '-ss', '0.5', '-i', r.output, '-frames:v', '1', '-vf', `crop=40:40:${x}:70,scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
    return [...s.stdout]
  }
  const izq = color(140)
  const der = color(460)
  assert.ok(izq[1] > 120 && izq[0] < 90, `la mitad roja sale verde (rgb ${izq})`)
  assert.ok(der[2] > 150 && der[0] < 70 && der[1] < 70, `la mitad azul queda azul (rgb ${der})`)
  // En pausa, el monitor muestra el cuadro pintado por FFmpeg (sin capas ni textos): también sale verde a la izquierda.
  const { VistaPrevia } = await import('../src/main/vistaprevia.ts')
  const vista = new VistaPrevia({ get: () => p, carpeta: () => dir }, () => {})
  const c = await vista.cuadro('p', tl, 0.5)
  assert.ok(c && /^vista-previa\/cuadro-[a-f0-9]{16}\.jpg$/.test(c.archivo), 'el cuadro fijo queda en vista-previa/')
  const px = [...spawnSync('ffmpeg', ['-v', 'error', '-i', join(dir, c.archivo), '-vf', 'crop=iw/8:ih/4:iw/4:ih/3,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']).stdout]
  assert.ok(px[1] > 120 && px[0] < 90, 'el cuadro fijo trae el color por zonas (rgb ' + px + ')')
  assert.equal(await vista.cuadro('p', normalizarTimeline({ clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 1 }], textos: [] }, 1, {}), 0.5), null, 'sin color por zonas no hace falta')
  console.log('color por zonas: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
