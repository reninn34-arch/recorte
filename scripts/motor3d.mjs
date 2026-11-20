/**
 * Las escenas de referencia de los estilos 3D (python/estilos/<id>/escena.js + guion.js, sobre el motor de
 * python/motor3d). Arma la composición igual que lo hará el agente: el motor, la escena y el guion uno al lado del otro.
 *
 *   node scripts/motor3d.mjs cuadros <id> <carpeta> [ancho] [alto] [muestras] [t1,t2,...]   cuadros sueltos (rápido)
 *   node scripts/motor3d.mjs video <id> <salida.mp4> [ancho] [alto] [muestras] [--voz]      con HyperFrames y sonido
 *   node scripts/motor3d.mjs vista <id> [<id>...]                                           la vista previa de la tienda
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAIZ = resolve(import.meta.dirname, '..')
const MOTOR = join(RAIZ, 'python', 'motor3d')
const ESTILOS = join(RAIZ, 'python', 'estilos')
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.181.2'
const [orden, ...args] = process.argv.slice(2)

/**
 * La carpeta de una composición: index.html + motor + escena + guion, todo junto como lo arma el agente. `id` es un
 * estilo (plastilina) o un ejemplo dentro de un estilo (plastilina/personaje), que usa además el material del estilo.
 */
async function armar(id, ancho, alto, muestras) {
  const src = existsSync(id) ? resolve(id) : join(ESTILOS, id) // también una carpeta de prueba cualquiera
  if (!existsSync(join(src, 'escena.js'))) throw new Error(`«${id}» no tiene escena de referencia (python/estilos/${id}/escena.js)`)
  const dir = join(tmpdir(), 'recorte-motor3d', `${id.replace(/^.*[\/](?=[^\/]+$)/, '').replace(/[\/:]/g, '-')}-${ancho}x${alto}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const copiarDe = (carpeta, filtro) => { for (const f of readdirSync(carpeta)) if (statSync(join(carpeta, f)).isFile() && filtro(f)) copyFileSync(join(carpeta, f), join(dir, f)) }
  copiarDe(MOTOR, (f) => /\.js$|^package\.json$/.test(f))
  if (!existsSync(id) && id.includes('/')) copiarDe(dirname(src), (f) => /\.js$/.test(f) && f !== 'escena.js' && f !== 'guion.js')
  copiarDe(src, (f) => /\.(js|wav|mp3)$/.test(f))
  const G = await import(pathToFileURL(join(dir, 'guion.js')).href + `?${Date.now()}`)
  writeFileSync(join(dir, 'index.html'), `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${ancho}, height=${alto}" />
<style>* { margin: 0; padding: 0; } html, body { width: ${ancho}px; height: ${alto}px; overflow: hidden; background: #000; } #lienzo { width: 100%; height: 100%; display: block; }</style>
<script type="importmap">{ "imports": { "three": "${THREE}/build/three.module.js", "three/addons/": "${THREE}/examples/jsm/" } }</script>
</head>
<body>
<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${G.DURACION}" data-width="${ancho}" data-height="${alto}">
  <canvas id="lienzo" width="${ancho}" height="${alto}"></canvas>
</div>
<script type="module">
import { crearEscenario, conectarHyperFrames } from './escenario.js'
import * as escena from './escena.js'
const E = crearEscenario(document.getElementById('lienzo'), { ...escena.ACABADO, ancho: ${ancho}, alto: ${alto}, duracion: escena.DURACION, muestras: ${muestras} })
await escena.construir(E)
conectarHyperFrames(E)
window.listo = true
</script>
</body>
</html>
`)
  return { dir, G }
}

function hyperframes(dir, salida, calidad = 'high') {
  const local = join(RAIZ, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes')
  const cmd = existsSync(local) ? [local] : ['npx', '--yes', 'hyperframes@0.8.206']
  const a = [...cmd.slice(1), 'render', dir, '--quality', calidad, '-o', salida, '--quiet']
  const r = process.platform === 'win32'
    ? spawnSync([cmd[0], ...a].map((x) => (/[\s"]/.test(x) ? `"${x}"` : x)).join(' '), { stdio: ['ignore', 'ignore', 'inherit'], shell: true })
    : spawnSync(cmd[0], a, { stdio: ['ignore', 'ignore', 'inherit'] })
  if (r.status !== 0 || !existsSync(salida)) throw new Error('HyperFrames no pudo renderizar')
}

async function sonidoA(dir, G, wav, conVoz) {
  const { crearMezcla } = await import(pathToFileURL(join(dir, 'sonido.js')).href)
  const M = crearMezcla(G.DURACION, { conVoz })
  G.sonido(M)
  writeFileSync(wav, M.aWav())
}

if (orden === 'cuadros') {
  const [id, salida = 'cuadros', ancho = '960', alto = '540', muestras = '32', tiempos = '0.5,2,4,6'] = args
  const { dir } = await armar(id, ancho, alto, muestras)
  const { chromium } = await import('playwright-core')
  mkdirSync(salida, { recursive: true })
  const srv = createServer((req, res) => {
    const ruta = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (!ruta.startsWith(dir) || !existsSync(ruta) || !statSync(ruta).isFile()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html' }[extname(ruta)] || 'application/octet-stream' })
    res.end(readFileSync(ruta))
  }).listen(0)
  const nav = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist'] }))
  const pag = await nav.newPage({ viewport: { width: Number(ancho), height: Number(alto) } })
  pag.on('pageerror', (e) => console.log('[error]', e.message))
  pag.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[consola]', m.text().slice(0, 300)))
  await pag.goto(`http://127.0.0.1:${srv.address().port}/index.html`)
  await pag.waitForFunction(() => window.listo === true, null, { timeout: 120000 })
  for (const t of tiempos.split(',').map(Number)) {
    await pag.evaluate((t) => window.verEn(t), t)
    const archivo = join(salida, `${id.split(/[\\/]/).filter(Boolean).slice(-2).join('-').replace(/:/g, '')}-${String(t).replace('.', '_')}.png`)
    await pag.locator('canvas').screenshot({ path: archivo })
    console.log(`t=${t}s → ${archivo}`)
  }
  await nav.close()
  srv.close()
} else if (orden === 'video') {
  const [id, salida = `${args[0]}.mp4`, ancho = '960', alto = '540', muestras = '32'] = args.filter((a) => !a.startsWith('--'))
  const { dir, G } = await armar(id, ancho, alto, muestras)
  const t0 = Date.now()
  hyperframes(dir, join(dir, 'mudo.mp4'))
  await sonidoA(dir, G, join(dir, 'efectos.wav'), args.includes('--voz') || Boolean(G.VOZ))
  if (G.VOZ) {
    // con narración: la voz encima (desde su segundo) y los efectos debajo, como lo mezcla el agente
    const ms = Math.round((G.VOZ.desde ?? 0) * 1000)
    const filtro = `[1:a]adelay=${ms}|${ms},apad=whole_dur=${G.DURACION},loudnorm=I=-17:TP=-2,asplit=2[v1][v2];[2:a]loudnorm=I=-26:TP=-4:LRA=20[fx0];[fx0][v1]sidechaincompress=threshold=0.05:ratio=3:attack=10:release=250[fx];[v2][fx]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11[a]`
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'mudo.mp4'), '-i', join(dir, G.VOZ.archivo), '-i', join(dir, 'efectos.wav'), '-filter_complex', filtro, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', resolve(salida)], { stdio: 'inherit' })
  } else spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'mudo.mp4'), '-i', join(dir, 'efectos.wav'), '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', resolve(salida)], { stdio: 'inherit' })
  console.log(`listo en ${Math.round((Date.now() - t0) / 1000)} s → ${resolve(salida)}`)
} else if (orden === 'vista') {
  // la vista previa de la tarjeta: 4:3, sin sonido, liviana; el póster sale de un momento con todo armado
  for (const id of args) {
    const { dir, G } = await armar(id, 640, 480, 24)
    const crudo = join(dir, 'crudo.mp4'), destino = join(ESTILOS, id)
    hyperframes(dir, crudo, 'standard')
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', crudo, '-an', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(destino, 'vista.mp4')], { stdio: 'inherit' })
    const poster = G.POSTER ?? G.DURACION * 0.8
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(poster), '-i', join(destino, 'vista.mp4'), '-frames:v', '1', '-q:v', '3', join(destino, 'vista.jpg')], { stdio: 'inherit' })
    console.log(`${id}: vista lista (${Math.round(statSync(join(destino, 'vista.mp4')).size / 1024)} KB)`)
  }
} else {
  console.log('uso: node scripts/motor3d.mjs cuadros|video|vista <id> ...')
  process.exit(1)
}
