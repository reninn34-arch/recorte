// Las herramientas que Recorte baja con un botón (FFmpeg, Python y Node.js): en el equipo donde se corre
// (Windows o Mac) se bajan de verdad, se comprueban y se ejecutan. Baja unos 250 MB: es la prueba de la integración
// continua del Mac (.github/workflows/mac.yml), no para correrla a cada rato.
//
//   npm run prueba:herramientas            baja las tres
//   npm run prueba:herramientas -- --solo-direcciones   solo comprueba que las páginas de FFmpeg (Mac) responden
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { descargarHerramienta, tieneHerramienta, pythonPropio, paquetesFfmpegMac, PUEDE_BAJAR } = await import('../src/main/herramientas.ts')

if (process.argv.includes('--solo-direcciones')) {
  // Sin bajar nada: la versión fija de FFmpeg para Mac está en su página y trae sus huellas.
  const paquetes = await paquetesFfmpegMac()
  assert.deepEqual(paquetes.map((p) => p.nombre), ['ffmpeg.zip', 'ffprobe.zip'])
  for (const p of paquetes) {
    assert.match(p.sha256, /^[a-f0-9]{64}$/, 'la huella de ' + p.nombre)
    assert.match(p.url, /\/download\/macos\/(arm64|amd64)\/[^/]+\/(ffmpeg|ffprobe)\.zip$/, 'la dirección de ' + p.nombre)
  }
  console.log('direcciones de FFmpeg para Mac: todo bien (' + paquetes[0].version + ')')
  process.exit(0)
}

assert.ok(PUEDE_BAJAR, 'esta prueba es para Windows o Mac')
const raiz = join(tmpdir(), 'herramientas')
const exe = (...partes) => join(raiz, ...partes) + (process.platform === 'win32' ? '.exe' : '')
const correr = (programa, args) => {
  const r = spawnSync(programa, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  assert.equal(r.status, 0, programa + ' ' + args.join(' ') + ' → ' + r.stderr)
  return r.stdout + r.stderr
}

const pasos = []
for (const id of ['ffmpeg', 'python', 'node']) {
  const t0 = Date.now()
  const r = await descargarHerramienta(id, (pct, texto) => {
    const n = Math.floor(pct * 4)
    if (!pasos.includes(id + n)) {
      pasos.push(id + n)
      console.log('  ' + id + ' ' + Math.round(pct * 100) + '% ' + texto)
    }
  })
  assert.ok(tieneHerramienta(id), id + ': quedó instalada')
  console.log(id + ' ' + r.version + ' (' + Math.round((Date.now() - t0) / 1000) + ' s)')
}

// FFmpeg: lo que usa toda la exportación (x264 y los subtítulos con libass) y FFprobe.
const ffmpeg = exe('ffmpeg', 'bin', 'ffmpeg')
assert.match(correr(ffmpeg, ['-hide_banner', '-encoders']), /libx264/, 'FFmpeg trae x264')
assert.match(correr(ffmpeg, ['-hide_banner', '-filters']), /\bass\b/, 'FFmpeg trae el filtro de subtítulos (libass)')
assert.match(correr(exe('ffmpeg', 'bin', 'ffprobe'), ['-version']), /ffprobe version/, 'FFprobe corre')
// Python 3.12 con pip.
const python = pythonPropio()
assert.ok(python, 'Python propio')
assert.match(correr(python, ['--version']), /Python 3\.12\./, 'Python 3.12')
assert.match(correr(python, ['-m', 'pip', '--version']), /pip /, 'Python trae pip')
// Node.js.
const nodo = process.platform === 'win32' ? exe('node', 'node') : join(raiz, 'node', 'bin', 'node')
assert.match(correr(nodo, ['--version']), /^v\d+\./, 'Node corre')
console.log('herramientas: todo bien')
