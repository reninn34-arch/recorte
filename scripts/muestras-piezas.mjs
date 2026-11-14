// Genera `python/piezas/<id>/muestra.mp4`: cómo se ve cada pieza animada (con una marca de ejemplo, sobre un fondo
// neutro), para verla en la pestaña «Animadas» antes de ponerla. Uso: npm run muestras:piezas [-- <id> …]
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { renderizarPieza, listarPiezas } = await import('../src/main/piezas.ts')
const { valoresConMarca } = await import('../src/shared/piezas.ts')

const raiz = join(import.meta.dirname, '..')
const marca = { primary: '#ff5a7a', secondary: '#33c9c1', logo: join(raiz, 'build', 'icon.png') }
const pedidas = process.argv.slice(2)
const trabajo = mkdtempSync(join(tmpdir(), 'recorte-muestras-'))
try {
  for (const p of listarPiezas().filter((x) => !pedidas.length || pedidas.includes(x.id))) {
    const v = valoresConMarca(p, {}, marca)
    const imagenes = Object.fromEntries(p.vars.filter((x) => x.tipo === 'imagen').map((x) => [x.id, String(v[x.id] ?? '')]))
    const t0 = Date.now()
    const r = await renderizarPieza(trabajo, p.id, v, imagenes, 1080, 1920, p.duracion.defecto)
    // Sobre un fondo neutro (un degradado que se mueve un poco), chica y en bucle.
    const salida = join(raiz, 'python', 'piezas', p.id, 'muestra.mp4')
    const fondo = `gradients=s=1080x1920:c0=0x3a4256:c1=0x1f2430:x0=0:y0=0:x1=1080:y1=1920:d=${r.duracion}:speed=0.01:r=30`
    const f = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', fondo, '-c:v', 'libvpx-vp9', '-i', join(trabajo, r.archivo),
      '-filter_complex', '[0][1]overlay=shortest=1,scale=270:480,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', salida])
    if (f.status !== 0) throw new Error(String(f.stderr))
    console.log(`${p.id}: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  }
} finally {
  rmSync(trabajo, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
