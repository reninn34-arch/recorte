// «Cambiar el cielo»: en un video con cielo azul arriba, un edificio y pasto, el cielo pasa a ser otro (atardecer, rosado y
// naranja), el edificio y el pasto se quedan, y el clip con el cielo nuevo queda encima del mismo clip. Usa el modelo de
// profundidad (se baja una vez).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-cielo-prueba-'))
mkdirSync(join(dir, 'media'))
try {
  const { normalizarTimeline } = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const { exportarTimeline } = await import('../src/main/exportar.ts')
  const { cambiarCieloDeClip } = await import('../src/main/persona.ts')
  const fondo = join(dir, 'fondo.mp4')
  const f = spawnSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', 'gradients=s=640x360:d=2:r=30:c0=0x2a6fd0:c1=0xbfe0f8:x0=0:y0=0:x1=0:y1=220',
    '-f', 'lavfi', '-i', 'color=c=0x3d7a2a:s=640x140:d=2:r=30,noise=alls=40:allf=t',
    '-f', 'lavfi', '-i', 'color=c=0x5a4a44:s=140x240:d=2:r=30,noise=alls=25:allf=t',
    '-filter_complex', '[0][1]overlay=0:220[a];[a][2]overlay=60:90,format=yuv420p', '-c:v', 'libx264', '-crf', '14', fondo])
  assert.equal(f.status, 0, String(f.stderr))
  const proyecto = { id: 'p', name: 'prueba', source: { path: fondo, width: 640, height: 360, fps: 30, duration: 2 }, brand: { primary: '#ffffff' }, medios: [] }
  let tl = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 2 }], textos: [] }, 2)
  let ultimo = 0
  const r = await cambiarCieloDeClip(proyecto, dir, tl, 'c1', 'atardecer', (p) => (ultimo = Math.max(ultimo, p)))
  assert.ok(existsSync(r.archivo) && /cielo-[0-9a-f]{12}\.mp4$/.test(r.archivo))
  assert.ok(Math.abs(r.duracion - 2) < 0.1 && ultimo >= 0.9)
  const t1 = Date.now()
  assert.equal((await cambiarCieloDeClip(proyecto, dir, tl, 'c1', 'atardecer')).archivo, r.archivo)
  assert.ok(Date.now() - t1 < 1500, 'lo mismo no se vuelve a hacer')

  const medio = { id: 'm-cielo', ruta: r.archivo, tipo: 'video', conAudio: false, nombre: 'cielo.mp4', duracion: r.duracion, ancho: 640, alto: 360 }
  const ops = validarOperaciones([{ op: 'cambiar_cielo', clip: 1, cielo: 'atardecer' }, { op: 'cambiar_cielo', clip: 1, cielo: '' }])
  assert.equal(ops.length, 1, 'sin cielo no vale')
  const sin = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.ok(sin.fallos.length === 1 && !(sin.timeline.capas ?? []).length, 'sin el cielo hecho avisa')
  Object.assign(ops[0], { medio: 'm-cielo', clipId: 'c1', duracionReal: r.duracion })
  const hecho = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.equal(hecho.fallos.length, 0, hecho.fallos.join(' '))
  tl = normalizarTimeline(hecho.timeline, 2, { 'm-cielo': r.duracion })
  assert.deepEqual(tl.capas.map((c) => [c.fuente, c.pista, c.cielo?.clip]), [['m-cielo', 3, 'c1']])

  const pixel = (mp4, x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout.subarray(0, 3)]
  const e = await exportarTimeline({ ...proyecto, medios: [medio] }, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'sale'))
  assert.equal(e.ok, true, e.error)
  const mp4 = join(dir, 'sale', 'timeline-prueba-original.mp4')
  const [R, , B] = pixel(mp4, 500, 100)
  assert.ok(R > B + 20, `el cielo ya no es azul: rojizo (${pixel(mp4, 500, 100)})`)
  const [pr, pg] = pixel(mp4, 400, 300)
  assert.ok(pg > pr, `el pasto se queda verde (${pixel(mp4, 400, 300)})`)
  console.log('cambiar el cielo: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
