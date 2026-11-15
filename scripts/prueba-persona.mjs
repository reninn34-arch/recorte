// «Separar a la persona»: el sujeto de un clip sale en un WebM con transparencia que calza encima del clip; un texto
// «detrás» se ve por detrás del sujeto en el MP4 (y uno normal, por delante). Con un video de prueba hecho con FFmpeg:
// un disco naranja (el «sujeto») que se mueve sobre un fondo de rayas grises. Usa el modelo de fondos (ISNet).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-persona-prueba-'))
mkdirSync(join(dir, 'media'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  assert.equal(r.status, 0, String(r.stderr))
}
try {
  const { normalizarTimeline, timelineActiva, cambiarTexto } = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const { exportarTimeline } = await import('../src/main/exportar.ts')
  const { recortarPersonaDeClip } = await import('../src/main/persona.ts')

  // 2 s, 360×640: rayas grises de fondo y un disco naranja de 90 px de radio en el centro, que sube un poco.
  const fondo = join(dir, 'fondo.mp4')
  ff(['-f', 'lavfi', '-i', "color=c=0x9a9a9a:s=360x640:d=2:r=30,geq=lum='if(lt(mod(X,40),20),150,120)':cb=128:cr=128", '-f', 'lavfi', '-i', 'color=c=0xff6a00:s=360x640:d=2:r=30',
    '-filter_complex', "[1]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lt(hypot(X-180,Y-(340-T*20)),90),255,0)'[s];[0][s]overlay,format=yuv420p", '-c:v', 'libx264', '-crf', '14', fondo])
  const proyecto = { id: 'p', name: 'prueba', source: { path: fondo, width: 360, height: 640, fps: 30, duration: 2 }, brand: { primary: '#ffffff' }, medios: [] }
  let tl = normalizarTimeline(
    {
      clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 2 }],
      textos: [
        // Un bloque blanco que cruza el disco por el medio: detrás de él solo se ve a los lados.
        { id: 't1', texto: 'XXXXXXXXXXXXXXXXXXXX', inicio: 0, duracion: 2, posicion: 'centro', x: 0.5, y: 0.5, tamano: 1.6, caja: '#ffffff', color: '#ffffff' }
      ]
    },
    2
  )

  // El recorte del clip tal como se ve.
  const t0 = Date.now()
  let ultimo = 0
  const r = await recortarPersonaDeClip(proyecto, dir, tl, 'c1', (pct) => (ultimo = Math.max(ultimo, pct)))
  console.log(`recorte: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  assert.ok(existsSync(r.archivo) && /persona-[0-9a-f]{12}\.webm$/.test(r.archivo))
  assert.equal(r.inicio, 0)
  assert.ok(Math.abs(r.duracion - 2) < 0.05)
  assert.ok(ultimo >= 0.9, 'fue diciendo cuánto llevaba')
  // Con transparencia: el centro (el disco) opaco y las esquinas transparentes.
  const alfa = (x, y) => {
    const o = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', '1', '-i', r.archivo, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y},format=rgba`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 })
    return o.stdout[3]
  }
  assert.ok(alfa(180, 320) > 230, `el sujeto es opaco (${alfa(180, 320)})`)
  assert.ok(alfa(20, 30) < 20 && alfa(330, 600) < 20, `el fondo es transparente (${alfa(20, 30)}, ${alfa(330, 600)})`)
  // Lo mismo otra vez no se rehace (está guardado por lo que es el clip).
  const t1 = Date.now()
  const otra = await recortarPersonaDeClip(proyecto, dir, tl, 'c1')
  assert.equal(otra.archivo, r.archivo)
  assert.ok(Date.now() - t1 < 1500, 'el mismo clip no se vuelve a recortar')

  // La operación del chat (con el recorte ya hecho) pone la capa encima del clip, en la pista 3.
  const medio = { id: 'm-persona', ruta: r.archivo, tipo: 'video', conAudio: false, nombre: 'persona.webm', duracion: r.duracion, ancho: 360, alto: 640 }
  const conMedio = { ...proyecto, medios: [medio] }
  const ops = validarOperaciones([{ op: 'recortar_persona', clip: 1 }, { op: 'cambiar_texto', texto_n: 1, detras: true }])
  assert.equal(ops.length, 2)
  // Sin el recorte hecho, avisa y no pone nada.
  const sin = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.ok(sin.fallos.length === 1 && !(sin.timeline.capas ?? []).length)
  Object.assign(ops[0], { medio: 'm-persona', clipId: 'c1', duracionReal: r.duracion })
  const hecho = aplicarOperaciones(tl, ops, { duracionFuente: 2, transcript: [], medios: {} })
  assert.equal(hecho.fallos.length, 0, hecho.fallos.join(' '))
  tl = normalizarTimeline(hecho.timeline, 2, { 'm-persona': r.duracion })
  assert.deepEqual(tl.capas.map((c) => [c.fuente, c.pista, c.persona?.clip, c.ancho]), [['m-persona', 3, 'c1', 1]])
  assert.equal(tl.textos[0].detras, true)
  // Pedirlo otra vez no deja dos personas del mismo clip.
  const dos = aplicarOperaciones(tl, [{ op: 'recortar_persona', clip: 1, medio: 'm-persona', clipId: 'c1', duracionReal: r.duracion }], { duracionFuente: 2, transcript: [], medios: { 'm-persona': r.duracion } })
  assert.equal(dos.timeline.capas.length, 1)
  assert.equal(timelineActiva(tl).capas.length, 1)

  // En el MP4: el texto «detrás» se ve a los lados del disco, y el disco (naranja) lo tapa en el centro.
  const pixel = (mp4, x, y) => {
    const o = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', mp4, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 })
    return [...o.stdout.subarray(0, 3)]
  }
  const naranja = ([R, G, B]) => R > 200 && G > 60 && G < 160 && B < 80
  const blanco = ([R, G, B]) => R > 225 && G > 225 && B > 225
  const e1 = await exportarTimeline(conMedio, tl, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'detras'))
  assert.equal(e1.ok, true, e1.error)
  const mp4a = join(dir, 'detras', 'timeline-prueba-original.mp4')
  assert.ok(naranja(pixel(mp4a, 180, 320)), `detrás: el sujeto tapa el texto (${pixel(mp4a, 180, 320)})`)
  assert.ok(blanco(pixel(mp4a, 40, 320)), `detrás: el texto se ve a los lados (${pixel(mp4a, 40, 320)})`)
  // El mismo texto sin «detrás»: por delante del sujeto.
  const delante = cambiarTexto(tl, 't1', { detras: false })
  assert.ok(!('detras' in delante.textos[0]))
  const e2 = await exportarTimeline(conMedio, delante, dir, { formato: 'original', subtitulos: false }, () => {}, join(dir, 'delante'))
  assert.equal(e2.ok, true, e2.error)
  const mp4b = join(dir, 'delante', 'timeline-prueba-original.mp4')
  assert.ok(blanco(pixel(mp4b, 180, 320)), `delante: el texto tapa al sujeto (${pixel(mp4b, 180, 320)})`)
  console.log('separar a la persona: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
