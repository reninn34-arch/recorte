// El sonido de un clip con ecualizador y compresor: los filtros de FFmpeg salen con los números de la cadena (la misma
// que oye el monitor) y el MP4 suena como se pidió: los graves suben, los agudos bajan y el compresor empareja.
// npm run prueba:sonido
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportarTimeline } from '../src/main/exportar.ts'
import { cadenaSonido, filtrosSonido, normalizarTimeline, sonidoDe } from '../src/shared/timeline.ts'

assert.equal(filtrosSonido(sonidoDe(undefined)), '', 'sin nada, sin filtros')
const s = sonidoDe({ sonido: { graves: 6, agudos: -6, comprimir: 0.5 } })
assert.equal(filtrosSonido(s), ',bass=g=6.0:f=120:t=s:w=0.5,treble=g=-6.0:f=8000:t=s:w=0.5,acompressor=threshold=-20.0dB:ratio=4.00:attack=10:release=150:knee=2.828:makeup=1.60')
assert.equal(cadenaSonido(s).compresor.umbral, -20)
assert.deepEqual(normalizarTimeline({ clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 1, sonido: { graves: 40, comprimir: -1 } }], textos: [] }, 1, {}).clips[0].sonido, { graves: 12 }, 'los límites se respetan')

const dir = mkdtempSync(join(tmpdir(), 'recorte-sonido-'))
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0)
try {
  // Un video con dos tonos: 60 Hz (grave) y 12 kHz (agudo).
  const fuente = join(dir, 'f.mp4')
  ff(['-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=3:r=30', '-f', 'lavfi', '-i', 'sine=f=60:d=3:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=f=12000:d=3:sample_rate=48000', '-filter_complex', '[1][2]amix=inputs=2:normalize=0,volume=2[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '256k', '-shortest', fuente])
  const p = { id: 'p', name: 'p', source: { path: fuente, width: 320, height: 180, fps: 30, duration: 3 }, brand: { primary: '#fff' }, medios: [] }
  const nivel = async (sonido, banda) => {
    const tl = normalizarTimeline({ clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 3, ...(sonido ? { sonido } : {}) }], textos: [] }, 3, {})
    const r = await exportarTimeline(p, tl, dir, { formato: 'original', subtitulos: false, soloAudio: 'wav' }, () => {}, join(dir, `s${Math.random()}`))
    assert.equal(r.ok, true, r.error)
    const f = banda === 'graves' ? 'lowpass=f=200' : 'highpass=f=6000'
    const out = spawnSync('ffmpeg', ['-hide_banner', '-i', r.output, '-af', `atrim=1:2.5,${f},astats=metadata=1:reset=0`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr
    return Number(/RMS level dB: (-?[\d.]+)/.exec(out)[1])
  }
  const g0 = await nivel(null, 'graves')
  const a0 = await nivel(null, 'agudos')
  const g1 = await nivel({ graves: 6 }, 'graves')
  const a1 = await nivel({ agudos: -6 }, 'agudos')
  assert.ok(g1 - g0 > 4.5 && g1 - g0 < 7, `los graves suben ~5,6 dB (${(g1 - g0).toFixed(2)})`)
  assert.ok(a0 - a1 > 4.5 && a0 - a1 < 7, `los agudos bajan ~5,7 dB (${(a0 - a1).toFixed(2)})`)
  console.log(`sonido: graves +${(g1 - g0).toFixed(2)} dB, agudos −${(a0 - a1).toFixed(2)} dB · todo bien`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
