// Lo que sube el usuario en un formato que Recorte no usa (un audio .mpeg como «Your ready.mp3.mpeg», un video .mpeg o
// .avi): al prepararlo se mira qué trae y se pasa a uno que sí (.mp3/.m4a el audio, .mp4 el video).
// npm run prueba:archivos
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const { prepararArchivos } = await import('../src/main/archivos.ts')
const dir = mkdtempSync(join(tmpdir(), 'recorte-archivos-'))
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0, args.join(' '))
try {
  const audioMp3 = join(dir, 'Your ready.mp3.mpeg')
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'libmp3lame', '-f', 'mp3', audioMp3])
  const videoMpeg = join(dir, 'clip.mpeg')
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-c:v', 'mpeg2video', '-c:a', 'mp2', '-shortest', videoMpeg])
  const audioAvi = join(dir, 'nota.wma')
  ff(['-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-c:a', 'wmav2', audioAvi])
  const raro = join(dir, 'nada.mpg')
  spawnSync(process.execPath, ['-e', `require('fs').writeFileSync(${JSON.stringify(raro)}, 'no soy un video')`])

  const { listos, descartados } = await prepararArchivos([audioMp3, videoMpeg, audioAvi, raro], join(dir, 'preparando'))
  const nombres = listos.map((r) => basename(r))
  assert.ok(nombres.includes('Your ready.mp3'), `el audio MP3 dentro de un .mpeg queda como «Your ready.mp3» (copiado): ${nombres}`)
  assert.ok(nombres.includes('clip.mp4'), `el video .mpeg pasa a .mp4: ${nombres}`)
  assert.ok(nombres.includes('nota.m4a'), `el .wma pasa a .m4a: ${nombres}`)
  assert.equal(descartados.length, 1, `lo que no es audio ni video se avisa: ${descartados}`)
  assert.match(descartados[0], /nada\.mpg \(no pude leer su audio ni su video\)/)
  // El MP3 se copió sin recodificar: sigue siendo MP3 y dura lo mismo.
  const info = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name:format=duration', '-of', 'csv=p=0', listos.find((r) => r.endsWith('Your ready.mp3'))], { encoding: 'utf8' }).stdout
  assert.match(info, /mp3/)
  console.log('archivos en formatos que Recorte no usaba (.mpeg, .wma, .avi…): se convierten al subirlos ✓')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
