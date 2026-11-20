// La boca de un personaje a partir de la voz: cuánto se abre en cada cuadro, para que hable con la narración.
//
//   node motor3d/boca-de-voz.mjs <voz.wav|mp3|m4a> <boca.js> [--fps 30] [--desde 0]
//
// Escribe un módulo `export const BOCA = { fps, valores }` que la escena importa:
//   import { BOCA } from './boca.js'
//   { hace: 'habla', t0, t1, boca: bocaDe(BOCA, desde) }   // desde: el segundo del video donde empieza esa voz
// Necesita FFmpeg en el PATH (lo usa para leer cualquier formato).
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opcion = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d }
const [entrada, salida] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if (!entrada || !salida) {
  console.log('uso: node boca-de-voz.mjs <voz> <boca.js> [--fps 30] [--desde 0]')
  process.exit(1)
}
const FPS = opcion('--fps', 30), DESDE = opcion('--desde', 0), HZ = 16000

const r = spawnSync('ffmpeg', ['-v', 'error', '-i', entrada, '-ac', '1', '-ar', String(HZ), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 })
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1) }
const pcm = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4))

// 1. la energía de la voz en cada cuadro (con un filtro que deja las vocales, 150-3000 Hz, para que las eses no abran)
const filtrar = (x, f, tipo) => { // un biquad simple
  const w = (2 * Math.PI * f) / HZ, al = Math.sin(w) / (2 * 0.7), c = Math.cos(w)
  const [b0, b1, b2] = tipo === 'bajos' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2]
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al, y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v }
  return y
}
const voz = filtrar(filtrar(pcm, 150, 'altos'), 3000, 'bajos')
const porCuadro = HZ / FPS, n = Math.ceil(voz.length / porCuadro), db = new Float32Array(n)
for (let k = 0; k < n; k++) {
  let s = 0, c = 0
  for (let i = Math.floor(k * porCuadro - porCuadro * 0.5); i < (k + 1) * porCuadro + porCuadro * 0.5; i++) if (i >= 0 && i < voz.length) { s += voz[i] * voz[i]; c++ }
  db[k] = 10 * Math.log10(s / Math.max(1, c) + 1e-12)
}
// 2. a 0..1: lo fuerte de esta voz es 1, 28 dB por debajo es boca cerrada
const orden = Array.from(db).sort((a, b) => a - b), alto = orden[Math.floor(orden.length * 0.96)], bajo = alto - 28
const crudo = Array.from(db, (d) => Math.max(0, (d - bajo) / (alto - bajo)) ** 1.6)
// 3. abre rápido y cierra un poco más lento; lo muy chico es boca cerrada (las pausas se ven)
const valores = []
let y = 0
for (const x of crudo) { y += (x - y) * (x > y ? 0.75 : 0.45); valores.push(y < 0.08 ? 0 : Math.round(Math.min(1, y) * 100) / 100) }

writeFileSync(salida, `// La boca de la voz «${entrada.split(/[\\/]/).pop()}» (${(valores.length / FPS).toFixed(2)} s): cuánto se abre en cada cuadro. Hecho con boca-de-voz.mjs.\nexport const BOCA = ${JSON.stringify({ fps: FPS, desde: DESDE, valores })}\n`)
const hablando = valores.filter((v) => v > 0).length / valores.length
console.log(`${salida}: ${valores.length} cuadros (${(valores.length / FPS).toFixed(1)} s), habla el ${Math.round(hablando * 100)} % del tiempo`)
