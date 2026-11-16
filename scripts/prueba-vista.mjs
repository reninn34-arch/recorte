// La vista previa renderizada del monitor: los tramos tienen una clave que solo cambia en el tramo que se edita; solo
// los tramos pesados (con capas) se renderizan; cada uno sale entero, a 720p y del largo del tramo, y queda en
// `vista-previa/<clave>.mp4`. Y dos renders a la vez esperan su turno (comparten archivos de trabajo).
// npm run prueba:vista
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizarTimeline, soloTramo } from '../src/shared/timeline.ts'
import { firmaProyecto, LARGO_VISTA, tramosVista } from '../src/shared/vistaprevia.ts'

const { VistaPrevia } = await import('../src/main/vistaprevia.ts')
const { probeVideo } = await import('../src/main/ffmpeg.ts')

const dir = mkdtempSync(join(tmpdir(), 'recorte-vista-prueba-'))
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0)
try {
  mkdirSync(join(dir, 'media'))
  const fondo = join(dir, 'fondo.mp4')
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:d=10:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '10', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', fondo])
  const logo = join(dir, 'media', 'logo.png')
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', logo])
  const proyecto = {
    id: 'p',
    name: 'prueba',
    source: { path: fondo, width: 1280, height: 720, fps: 30, duration: 10 },
    brand: { primary: '#ffffff' },
    medios: [{ id: 'm1', ruta: logo, tipo: 'imagen', conAudio: false, nombre: 'logo.png', duracion: 0 }]
  }
  // 10 s: tramos 0-4, 4-8, 8-10. Solo el segundo tiene una capa encima.
  const base = {
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 10 }],
    textos: [{ id: 't1', texto: 'Hola', inicio: 0.5, duracion: 2, posicion: 'abajo' }],
    capas: [{ id: 'k1', fuente: 'm1', inicio: 5, duracion: 2, x: 0.5, y: 0.5, ancho: 0.2 }]
  }
  const tl = normalizarTimeline(base, 10, { m1: 5 })
  const firma = firmaProyecto(proyecto)
  const tramos = tramosVista(tl, firma)
  assert.equal(LARGO_VISTA, 4)
  assert.deepEqual(tramos.map((t) => [t.desde, t.hasta]), [[0, 4], [4, 8], [8, 10]], 'tres tramos')
  assert.deepEqual(tramos.map((t) => t.pesado), [false, true, false], 'solo el tramo con la capa es pesado')
  assert.deepEqual(tramosVista(tl, firma).map((t) => t.clave), tramos.map((t) => t.clave), 'la clave es estable')

  // Cambiar el texto del primer tramo solo cambia la clave del primero.
  const otroTexto = normalizarTimeline({ ...base, textos: [{ ...base.textos[0], texto: 'Chau' }] }, 10, { m1: 5 })
  const t2 = tramosVista(otroTexto, firma)
  assert.notEqual(t2[0].clave, tramos[0].clave, 'el tramo editado cambia')
  assert.equal(t2[1].clave, tramos[1].clave, 'el tramo de la capa sigue igual')
  assert.equal(t2[2].clave, tramos[2].clave, 'el último sigue igual')
  // Mover la capa cambia su tramo.
  const capaMovida = normalizarTimeline({ ...base, capas: [{ ...base.capas[0], x: 0.3 }] }, 10, { m1: 5 })
  assert.notEqual(tramosVista(capaMovida, firma)[1].clave, tramos[1].clave, 'mover la capa cambia su tramo')

  // Una capa de video larga (los subtítulos animados): en el tramo 4-8 se ve desde su segundo 5 (empezaba en el 1).
  const larga = normalizarTimeline({ ...base, capas: [{ id: 'k2', fuente: 'm2', inicio: 0, duracion: 10, desde: 1, x: 0.5, y: 0.5, ancho: 1, claves: { x: [{ f: 0, v: 0.2 }, { f: 6, v: 0.8 }] } }] }, 10, { m1: 5, m2: 20 })
  const capaEnTramo = soloTramo(larga, 4, 8).capas?.[0]
  assert.ok(capaEnTramo, 'la capa sigue en el tramo')
  assert.equal(capaEnTramo.inicio, 0, 'empieza con el tramo')
  assert.ok(Math.abs(capaEnTramo.duracion - 4) < 0.01, 'dura lo del tramo')
  assert.ok(Math.abs(capaEnTramo.desde - 5) < 0.01, 'el medio sigue en su cuadro (desde 5, no desde 1): ' + capaEnTramo.desde)
  assert.deepEqual(capaEnTramo.claves.x.map((c) => +c.f.toFixed(2)), [-4, 2], 'sus fotogramas clave se corren')

  // Render de verdad del tramo pesado.
  const almacen = { get: () => proyecto, carpeta: () => dir }
  const listos = []
  const vista = new VistaPrevia(almacen, (id, clave) => listos.push(clave))
  await new Promise((resolver, rechazar) => {
    const tope = setTimeout(() => rechazar(new Error('no terminó en 120 s')), 120_000)
    const mirar = setInterval(() => {
      if (listos.length) {
        clearInterval(mirar)
        clearTimeout(tope)
        resolver()
      }
    }, 200)
    vista.preparar('p', tl, 0)
  })
  assert.deepEqual(listos, [tramos[1].clave], 'se renderizó solo el tramo pesado')
  const archivo = join(dir, 'vista-previa', `${tramos[1].clave}.mp4`)
  assert.ok(existsSync(archivo), 'el tramo quedó en vista-previa/')
  const info = await probeVideo(archivo)
  assert.equal(info.height, 720, 'a 720p')
  assert.ok(Math.abs(info.duration - 4) < 0.15, `dura lo del tramo (${info.duration})`)
  assert.deepEqual(vista.existentes('p', tramos.map((t) => t.clave)), [tramos[1].clave], 'sabe cuáles están')
  assert.deepEqual(vista.existentes('p', ['../../x', 'zz']), [], 'no acepta claves raras')

  // La capa roja se ve en el render del tramo (en su segundo 1, que es el 5 de la timeline).
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', archivo, '-frames:v', '1', '-vf', 'crop=20:20:630:350,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  const [rr, gg, bb] = r.stdout
  assert.ok(rr > 180 && gg < 80 && bb < 80, `la capa se ve en el tramo (rgb ${rr},${gg},${bb})`)
  console.log('vista previa renderizada: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
