import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { estabilizarTramo } from '../src/main/estabilizar.ts'

/**
 * Estabilizar: un video que tiembla (un recorte que salta de lado a lado) sale más quieto, con su duración.
 * Uso: npm run prueba:estabilizar
 */

const dir = mkdtempSync(join(tmpdir(), 'recorte-estable-'))
try {
  const tiembla = join(dir, 'tiembla.mp4')
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=800x480:d=6:r=30',
    '-vf', "crop=640:360:'80+60*sin(n*1.7)*cos(n*0.9)':'60+45*sin(n*2.3)',noise=alls=8:allf=t", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', tiembla], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)

  /** Cuánto cambia, de media, un cuadro respecto del anterior (el temblor lo sube). */
  const movimiento = (ruta) => {
    const s = spawnSync('ffmpeg', ['-v', 'info', '-i', ruta, '-vf', 'format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' })
    const valores = [...s.stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])).slice(2)
    return valores.reduce((a, b) => a + b, 0) / valores.length
  }
  let avance = 0
  const salida = await estabilizarTramo(tiembla, 1, 5, join(dir, 'estables'), (f) => (avance = f))
  const info = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', salida], { encoding: 'utf8' }).stdout)
  assert.ok(Math.abs(Number(info.format.duration) - 4) < 0.2, `el tramo estabilizado debía durar 4 s: ${info.format.duration}`)
  const antes = movimiento(tiembla)
  const despues = movimiento(salida)
  assert.ok(despues < antes * 0.7, `debía temblar menos: ${antes.toFixed(1)} → ${despues.toFixed(1)}`)
  assert.ok(avance > 0.9, `el avance debía llegar al final: ${avance}`)
  console.log(`estabilizar: el temblor baja de ${antes.toFixed(1)} a ${despues.toFixed(1)} (cambio medio entre cuadros), 4 s ✓`)
  console.log('prueba estabilizar: ok')
} catch (e) {
  console.error(`prueba estabilizar: error · ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
