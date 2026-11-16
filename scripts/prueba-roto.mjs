// Rotoscopia por clic: un disco naranja que se mueve sobre rayas grises se recorta con SAM 2 a partir de una caja, el recorte
// lo sigue todo el clip (WebM con transparencia) y un texto «detrás» queda tapado por él en el MP4. Usa SAM 2 (tiny).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-roto-prueba-'))
mkdirSync(join(dir, 'media'))
try {
  const { normalizarTimeline } = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const { exportarTimeline } = await import('../src/main/exportar.ts')
  const { recortarObjetoDeClip } = await import('../src/main/persona.ts')
  const fondo = join(dir, 'fondo.mp4')
  const f = spawnSync('ffmpeg', ['-v', 'error', '-y',
    '-f', 'lavfi', '-i', "color=c=0x9a9a9a:s=360x640:d=2:r=30,geq=lum='if(lt(mod(X,40),20),150,120)':cb=128:cr=128",
    '-f', 'lavfi', '-i', 'color=c=0xff6a00:s=360x640:d=2:r=30',
    '-filter_complex', "[1]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-(120+T*60),Y-340),70),255,0)'[s];[0][s]overlay,format=yuv420p",
    '-c:v', 'libx264', '-crf', '14', fondo])
  assert.equal(f.status, 0, String(f.stderr))
  const proyecto = { id: 'p', name: 'prueba', source: { path: fondo, width: 360, height: 640, fps: 30, duration: 2 }, brand: { primary: '#ffffff' }, medios: [] }
  let tl = normalizarTimeline({
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 2 }],
    // Un bloque blanco por el medio del recorrido del disco: «detrás», solo se ve donde el disco no pasa.
    textos: [{ id: 't1', texto: 'XXXXXXXXXXXXXXXXXXXX', inicio: 0, duracion: 2, posicion: 'centro', x: 0.5, y: 0.53, tamano: 1.6, caja: '#ffffff', color: '#ffffff', detras: true }]
  }, 2)
  const zona = { x: 120 / 360, y: 340 / 640, ancho: 0.42, alto: 0.25 }
  let ultimo = 0
  const r = await recortarObjetoDeClip(proyecto, dir, tl, 'c1', zona, (p) => (ultimo = Math.max(ultimo, p)))
  assert.ok(existsSync(r.archivo) && /objeto-[0-9a-f]{12}\.webm$/.test(r.archivo))
  assert.ok(Math.abs(r.duracion - 2) < 0.1 && ultimo >= 0.9)
  const alfa = (t, x, y) => spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(t), '-i', r.archivo, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},format=rgba`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout[3]
  // Lo sigue: el disco está en x = 120 + 60 t.
  assert.ok(alfa(0, 120, 340) > 230 && alfa(1.9, 234, 340) > 230, `el objeto es opaco y lo sigue (${alfa(0, 120, 340)}, ${alfa(1.9, 234, 340)})`)
  assert.ok(alfa(0, 20, 30) < 20 && alfa(1.9, 120, 340) < 20, `lo demás es transparente (${alfa(0, 20, 30)}, ${alfa(1.9, 120, 340)})`)
  const t1 = Date.now()
  assert.equal((await recortarObjetoDeClip(proyecto, dir, tl, 'c1', zona)).archivo, r.archivo)
  assert.ok(Date.now() - t1 < 1500, 'lo mismo no se vuelve a hacer')

  const medio = { id: 'm-roto', ruta: r.archivo, tipo: 'video', conAudio: false, nombre: 'objeto.webm', duracion: r.duracion, ancho: 360, alto: 640 }
  const ops = validarOperaciones([{ op: 'rotoscopiar', clip: 1, ...zona }, { op: 'rotoscopiar', clip: 1, x: 0.5, y: 0.5, ancho: 0, alto: 0.2 }])
  assert.equal(ops.length, 1, 'una caja sin tamaño no vale')
  assert.ok(aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} }).fallos.length === 1, 'sin el recorte hecho avisa')
  Object.assign(ops[0], { medio: 'm-roto', clipId: 'c1', duracionReal: r.duracion })
  const hecho = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.equal(hecho.fallos.length, 0, hecho.fallos.join(' '))
  tl = normalizarTimeline(hecho.timeline, 2, { 'm-roto': r.duracion })
  assert.deepEqual(tl.capas.map((c) => [c.fuente, c.pista, c.roto?.clip]), [['m-roto', 3, 'c1']])
  // El mismo objeto otra vez no deja dos; otro objeto (otra caja) sí queda aparte.
  const otra = aplicarOperaciones(tl, [{ ...ops[0] }], { duracionFuente: 2, transcript: [], medios: { 'm-roto': r.duracion } })
  assert.equal(otra.timeline.capas.length, 1)

  const pixel = (mp4, t, x, y) => [...spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 }).stdout.subarray(0, 3)]
  const naranja = ([R, G, B]) => R > 200 && G > 60 && G < 160 && B < 80
  const blanco = ([R, G, B]) => R > 225 && G > 225 && B > 225
  const e = await exportarTimeline({ ...proyecto, medios: [medio] }, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'sale'))
  assert.equal(e.ok, true, e.error)
  const mp4 = join(dir, 'sale', 'timeline-prueba-original.mp4')
  assert.ok(naranja(pixel(mp4, 1, 180, 340)), `el objeto tapa el texto (${pixel(mp4, 1, 180, 340)})`)
  assert.ok(blanco(pixel(mp4, 1, 40, 340)), `el texto se ve a los lados (${pixel(mp4, 1, 40, 340)})`)
  console.log('rotoscopia por clic: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
