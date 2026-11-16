// «Borrar objeto»: un cuadro rojo (el «logo») sobre un fondo liso se rellena con lo que lo rodea, y el clip sin él
// queda encima del mismo clip. Video de prueba hecho con FFmpeg.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-borrar-prueba-'))
mkdirSync(join(dir, 'media'))
try {
  const { normalizarTimeline } = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const { exportarTimeline } = await import('../src/main/exportar.ts')
  const { borrarObjetoDeClip } = await import('../src/main/persona.ts')
  const fondo = join(dir, 'fondo.mp4')
  // 2 s, 360×640: degradado suave y un cuadro rojo de 80×50 en (260, 80).
  const f = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'gradients=s=360x640:d=2:r=30:c0=0x3a6ea5:c1=0x9ad0ec:x0=0:y0=0:x1=0:y1=640', '-vf', 'drawbox=x=260:y=80:w=80:h=50:color=red:t=fill,format=yuv420p', '-c:v', 'libx264', '-crf', '14', fondo])
  assert.equal(f.status, 0, String(f.stderr))
  const proyecto = { id: 'p', name: 'prueba', source: { path: fondo, width: 360, height: 640, fps: 30, duration: 2 }, brand: { primary: '#ffffff' }, medios: [] }
  let tl = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 2 }], textos: [] }, 2)
  const zona = { x: 300 / 360, y: 105 / 640, ancho: 80 / 360, alto: 50 / 640 }
  let ultimo = 0
  const r = await borrarObjetoDeClip(proyecto, dir, tl, 'c1', zona, undefined, (p) => (ultimo = Math.max(ultimo, p)))
  assert.ok(existsSync(r.archivo) && /sin-objeto-[0-9a-f]{12}\.mp4$/.test(r.archivo))
  assert.ok(Math.abs(r.duracion - 2) < 0.1 && ultimo >= 0.9)
  const t1 = Date.now()
  assert.equal((await borrarObjetoDeClip(proyecto, dir, tl, 'c1', zona)).archivo, r.archivo)
  assert.ok(Date.now() - t1 < 1500, 'lo mismo no se vuelve a hacer')

  const medio = { id: 'm-sin', ruta: r.archivo, tipo: 'video', conAudio: false, nombre: 'sin-objeto.mp4', duracion: r.duracion, ancho: 360, alto: 640 }
  const ops = validarOperaciones([{ op: 'borrar_objeto', clip: 1, ...zona, x: zona.x, y: zona.y }])
  assert.equal(ops.length, 1)
  Object.assign(ops[0], { medio: 'm-sin', clipId: 'c1', duracionReal: r.duracion })
  const hecho = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.equal(hecho.fallos.length, 0, hecho.fallos.join(' '))
  tl = normalizarTimeline(hecho.timeline, 2, { 'm-sin': r.duracion })
  assert.deepEqual(tl.capas.map((c) => [c.fuente, c.pista, c.borrado?.clip]), [['m-sin', 3, 'c1']])
  const pixel = (mp4, x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout.subarray(0, 3)]
  const rojo = ([R, G, B]) => R > 180 && G < 90 && B < 90
  const sin = await exportarTimeline({ ...proyecto, medios: [medio] }, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'sin'))
  assert.equal(sin.ok, true, sin.error)
  const mp4 = join(dir, 'sin', 'timeline-prueba-original.mp4')
  assert.ok(!rojo(pixel(mp4, 300, 105)), `el objeto ya no está (${pixel(mp4, 300, 105)})`)
  console.log('borrar objeto: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
