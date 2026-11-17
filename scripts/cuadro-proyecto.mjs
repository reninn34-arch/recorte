// Un cuadro de un proyecto de Recorte con el código de este repositorio (como ver_cuadro del MCP), para revisar un
// arreglo de render antes de publicarlo. Uso:
// node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs --import ./scripts/electron-falso.mjs scripts/cuadro-proyecto.mjs <id> <segundo> <salida.jpg>
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [id, segundo, salida] = process.argv.slice(2)
const { normalizarTimeline, duracionesDeMedios, timelineInicial, ventanaTimeline, conSubtitulosAnimados, duracionTimeline } = await import('../src/shared/timeline.ts')
const { exportarTimeline } = await import('../src/main/exportar.ts')
const rutaFfmpeg = () => 'ffmpeg'
const carpeta = join(process.env.APPDATA, 'recorte', 'proyectos', id)
const p = JSON.parse(readFileSync(join(carpeta, 'proyecto.json'), 'utf8'))
const tl = normalizarTimeline(p.timelinePendiente ?? p.timeline ?? timelineInicial(p.source.duration), p.source.duration, duracionesDeMedios(p.medios))
const t = Math.min(Number(segundo), duracionTimeline(tl) - 0.05)
const tmp = mkdtempSync(join(tmpdir(), 'cuadro-'))
try {
  const ventana = ventanaTimeline(conSubtitulosAnimados(tl), t, t + 0.4)
  const r = await exportarTimeline(p, ventana, carpeta, { formato: 'original', subtitulos: false }, () => {}, tmp)
  if (!r.ok || !r.output) throw new Error(r.error ?? 'sin video')
  spawnSync(rutaFfmpeg(), ['-v', 'error', '-y', '-i', r.output, '-frames:v', '1', '-vf', "scale='min(960,iw)':-2", '-q:v', '3', salida])
  console.log(existsSync(salida) ? 'listo ' + salida : 'no salió')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
