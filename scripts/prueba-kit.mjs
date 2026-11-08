import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Prueba del kit del modo agente (python/kit/kit.py) con material generado por FFmpeg:
 * golpes de una música con pulsos, fotogramas de prueba y un video de 4 s con todas las piezas.
 * Uso: node scripts/prueba-kit.mjs
 */

const raiz = resolve(import.meta.dirname, '..')
const kit = join(raiz, 'python', 'kit', 'kit.py')
const dir = mkdtempSync(join(tmpdir(), 'recorte-kit-'))
const python = process.platform === 'win32' ? 'python' : 'python3'

function correr(orden, args, cwd = dir) {
  const r = spawnSync(orden, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${orden} ${args.join(' ')} falló: ${(r.stderr || r.stdout).slice(-800)}`)
  return r.stdout
}
const json = (salida) => JSON.parse(salida.trim().split('\n').at(-1))

try {
  mkdirSync(join(dir, 'entrada'))
  // Dos «fotos» y un clip, y una música con un pulso cada 0,5 s.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1200x1600', '-frames:v', '1', 'entrada/antes.jpg'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=1600x1200', '-frames:v', '1', 'entrada/despues.jpg'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=640x360:d=3', '-pix_fmt', 'yuv420p', 'entrada/clip.mp4'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*220*t)*exp(-25*mod(t,0.5))':d=6", 'entrada/musica.wav'])

  const g = json(correr(python, [kit, 'golpes', 'entrada/musica.wav', '--n', '6']))
  const bien = g.golpes.filter((t) => Math.abs(t * 2 - Math.round(t * 2)) < 0.06).length
  if (bien < 4) throw new Error(`Los golpes no caen cada 0,5 s: ${JSON.stringify(g)}`)
  console.log(`golpes: ${g.golpes.join(', ')} s (tempo ${g.tempo}) ✓`)

  const receta = {
    ancho: 540,
    alto: 960,
    fps: 24,
    duracion: 4,
    musica: { archivo: 'entrada/musica.wav', hasta: 3.5, fundido: 0.2 },
    momentos: [
      { tipo: 'foto', archivo: 'entrada/antes.jpg', desde: 0, hasta: 1, rotulo: 'Antes', encuadre: { zoom: 1.2, cx: 0.4, cy: 0.5 }, tapar: [[0, 0, 0.3, 0.3]] },
      { tipo: 'comparar', antes: 'entrada/antes.jpg', despues: 'entrada/despues.jpg', desde: 1, hasta: 2, modo: 'deslizar', brillo: true },
      { tipo: 'video', archivo: 'entrada/clip.mp4', inicio: 0.5, desde: 2, hasta: 2.8, rotulo: 'Así' },
      { tipo: 'collage', fotos: ['entrada/antes.jpg', 'entrada/despues.jpg'], rotulos: ['antes', 'después'], columnas: 2, desde: 2.8, hasta: 4, brillo: [1] },
      { tipo: 'texto', lineas: ['UNA FRASE', 'DE PRUEBA'], destacar: 1, oscurecer: 0.7, desde: 3.2, hasta: 4 }
    ]
  }
  writeFileSync(join(dir, 'receta.json'), JSON.stringify(receta))

  const p = json(correr(python, [kit, 'armar', 'receta.json', '--prueba', '0.5,1.6,2.4,3.8']))
  if (p.pruebas.length !== 4 || !p.pruebas.every((r) => existsSync(join(dir, r)))) throw new Error(`Faltan fotogramas de prueba: ${JSON.stringify(p)}`)
  console.log('fotogramas de prueba: 4 en revision/ ✓')

  const v = json(correr(python, [kit, 'armar', 'receta.json']))
  if (v.ancho !== 540 || v.alto !== 960 || Math.abs(v.duracion - 4) > 0.15 || !v.audio) throw new Error(`El video no salió como se pidió: ${JSON.stringify(v)}`)
  if (!existsSync(join(dir, v.hoja))) throw new Error('No dejó la hoja de revisión.')
  console.log(`video: ${v.ancho}×${v.alto}, ${v.duracion} s, con audio y hoja de revisión ✓`)

  writeFileSync(join(dir, 'mala.json'), JSON.stringify({ momentos: [{ tipo: 'foto', archivo: 'entrada/no-existe.jpg' }] }))
  const r = spawnSync(python, [kit, 'armar', 'mala.json'], { cwd: dir, encoding: 'utf8' })
  if (r.status === 0 || !/no encuentro/.test(r.stderr)) throw new Error(`Una receta con un archivo que falta debía decirlo: ${r.stderr}`)
  console.log('receta con un archivo que falta: lo dice en claro ✓')
  console.log('prueba kit: ok')
} catch (error) {
  console.error(`prueba kit: error · ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
