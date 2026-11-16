// Copias livianas de la biblioteca: un video más grande que 1080p recibe su copia de 720p (el original no se toca); uno chico
// de un códec liviano no la necesita; una imagen se salta; y el proyecto se guarda y avisa cuando cada una está lista.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-proxys-prueba-'))
const ff = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0)
try {
  const { prepararProxysDeMedios, necesitaProxy } = await import('../src/main/proxysmedios.ts')
  const { probeVideo } = await import('../src/main/ffmpeg.ts')
  assert.equal(necesitaProxy({ width: 3840, height: 2160, codec: 'h264' }), true, '4K: sí')
  assert.equal(necesitaProxy({ width: 2160, height: 3840, codec: 'h264' }), true, '4K vertical: sí')
  assert.equal(necesitaProxy({ width: 1920, height: 1080, codec: 'h264' }), false, '1080p h264: no')
  assert.equal(necesitaProxy({ width: 1080, height: 1920, codec: 'h264' }), false, '1080p vertical: no')
  assert.equal(necesitaProxy({ width: 1280, height: 720, codec: 'hevc' }), true, 'HEVC: sí (el monitor no lo lee bien)')

  const grande = join(dir, 'grande.mp4')
  const chico = join(dir, 'chico.mp4')
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=3840x2160:d=2:r=30', '-f', 'lavfi', '-i', 'sine=f=300:d=2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', grande])
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', chico])
  assert.equal((await probeVideo(grande)).codec, 'h264', 'el códec se lee')
  const tamanoOriginal = statSync(grande).size

  const proyecto = {
    id: 'p',
    medios: [
      { id: 'm-grande', ruta: grande, nombre: 'grande.mp4', tipo: 'video', duracion: 2, ancho: 3840, alto: 2160, conAudio: true },
      { id: 'm-chico', ruta: chico, nombre: 'chico.mp4', tipo: 'video', duracion: 2, ancho: 640, alto: 360, conAudio: false },
      { id: 'm-foto', ruta: join(dir, 'foto.jpg'), nombre: 'foto.jpg', tipo: 'imagen', duracion: 0, ancho: 100, alto: 100, conAudio: false }
    ]
  }
  const almacen = { abrir: () => structuredClone(proyecto) && proyecto, save: () => {}, carpeta: () => dir }
  mkdirSync(join(dir, 'medios'))
  const avisos = []
  await new Promise((resolver) => {
    prepararProxysDeMedios(almacen, 'p', (p) => {
      avisos.push(p.medios.map((m) => `${m.id}:${m.proxy ?? '-'}`).join(' '))
      if (proyecto.medios[0].proxy !== undefined && proyecto.medios[1].proxy !== undefined) resolver()
    })
    // Si no hay nada que esperar, que no se quede colgada la prueba.
    setTimeout(resolver, 60_000)
  })
  const g = proyecto.medios[0]
  assert.equal(g.proxy, 'medios/m-grande-proxy.mp4', 'el 4K tiene su copia')
  assert.equal(proyecto.medios[1].proxy, '', 'el chico: revisado, no hace falta')
  assert.equal(proyecto.medios[2].proxy, undefined, 'la imagen se salta')
  const copia = join(dir, g.proxy)
  assert.ok(existsSync(copia) && !existsSync(copia + '.haciendo.mp4'), 'la copia está entera')
  const info = await probeVideo(copia)
  assert.equal(info.height, 720, 'la copia es de 720p')
  assert.equal(info.hasAudio, true, 'la copia conserva el audio')
  assert.ok(statSync(copia).size < tamanoOriginal, 'la copia pesa menos')
  assert.equal(statSync(grande).size, tamanoOriginal, 'el original no se toca')
  // Pedirlo otra vez no rehace nada.
  const antes = avisos.length
  prepararProxysDeMedios(almacen, 'p', () => avisos.push('otra vez'))
  await new Promise((r) => setTimeout(r, 1500))
  assert.equal(avisos.length, antes, 'lo que ya tiene copia no se rehace')
  console.log('copias livianas de la biblioteca: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
