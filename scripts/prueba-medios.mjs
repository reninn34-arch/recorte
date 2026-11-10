// Prueba el pedido de imágenes y clips del agente sin gastar créditos: el kit deja el pedido,
// Recorte (mediosagente.ts) lo atiende con generadores falsos en lugar de Flow y ChatGPT, y se
// comprueban los límites (sin elegir, máximo de clips) y que las referencias no salgan de la carpeta.
// npm run prueba:medios
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { atenderMedios } from '../src/main/mediosagente.ts'

const raiz = resolve(import.meta.dirname, '..')
const python = process.platform === 'win32' ? 'python' : 'python3'
const dir = mkdtempSync(join(tmpdir(), 'recorte-medios-'))
mkdirSync(join(dir, 'kit'))
mkdirSync(join(dir, 'entrada'))
copyFileSync(join(raiz, 'python', 'kit', 'kit.py'), join(dir, 'kit', 'kit.py'))
spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=400x400', '-frames:v', '1', join(dir, 'entrada', 'foto.jpg')])

/** Corre una orden del kit y devuelve su código, su JSON y su error. */
function kit(args) {
  return new Promise((ok) => {
    const h = spawn(python, ['kit/kit.py', ...args], { cwd: dir })
    let o = ''
    let e = ''
    h.stdout.on('data', (b) => (o += b))
    h.stderr.on('data', (b) => (e += b))
    h.on('close', (codigo) => ok({ codigo, r: o.trim() ? JSON.parse(o.trim().split('\n').at(-1)) : null, error: e.trim() }))
  })
}

const pedidos = []
const falsos = {
  flow: async (pedido, carpeta) => {
    pedidos.push(pedido)
    const archivo = join(carpeta, `bajado-${pedidos.length}${pedido.tipo === 'video' ? '.mp4' : '.png'}`)
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', ...(pedido.tipo === 'video' ? [] : ['-frames:v', '1']), archivo])
    return { archivo, creditos: pedido.tipo === 'video' ? 10 : 0, correo: 'prueba' }
  },
  chatgpt: async (_pedido, carpeta, nombre) => {
    const archivo = join(carpeta, `${nombre}.png`)
    spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64', '-frames:v', '1', archivo])
    return archivo
  }
}
const lineas = []

try {
  // 1. Con Flow para imágenes y clips.
  let parar = atenderMedios(dir, { imagenes: true, videos: true, modeloImagen: 'Nano Banana 2.1', modeloVideo: 'Veo 3.1 - Lite' }, '9:16', falsos, (l) => lineas.push(l))
  const img = await kit(['imagen', 'una taza de café humeante sobre una mesa de madera, luz de mañana', '--ref', 'entrada/foto.jpg', '--ref', '../fuera.jpg'])
  assert.equal(img.codigo, 0, img.error)
  assert.match(img.r.archivo, /^medios\/img-\w+\.png$/)
  assert.ok(existsSync(join(dir, img.r.archivo)), 'la imagen está en medios/')
  assert.equal(pedidos[0].tipo, 'imagen')
  assert.equal(pedidos[0].formato, '9:16')
  assert.equal(pedidos[0].modelo, 'Nano Banana 2.1')
  assert.equal(pedidos[0].referencias.length, 1, 'solo la referencia de dentro de la carpeta')
  console.log(`imagen con Flow y su referencia: ${img.r.archivo} ✓`)

  const clips = await Promise.all([1, 2, 3, 4].map((i) => kit(['clip', `toma ${i} de la cafetería`])))
  assert.equal(clips.filter((c) => c.codigo === 0).length, 3, 'tres clips como mucho por ronda')
  const negado = clips.find((c) => c.codigo !== 0)
  assert.match(negado.error, /Ya pediste 3 clips/)
  assert.ok(pedidos.filter((p) => p.tipo === 'video').every((p) => p.tope >= 20), 'cada clip lleva su tope de costo')
  console.log('clips: 3 a la vez y el cuarto se niega (gastan créditos) ✓')
  parar()

  // 2. Imágenes con ChatGPT y sin clips elegidos.
  parar = atenderMedios(dir, { imagenes: true, videos: false, modeloImagen: 'ChatGPT Imágenes' }, '16:9', falsos, (l) => lineas.push(l))
  const gpt = await kit(['imagen', 'un logo minimalista'])
  assert.equal(gpt.codigo, 0, gpt.error)
  assert.equal(gpt.r.hecho, 'ChatGPT Imágenes')
  assert.ok(existsSync(join(dir, gpt.r.archivo)))
  const sinClip = await kit(['clip', 'algo'])
  assert.notEqual(sinClip.codigo, 0)
  assert.match(sinClip.error, /no eligió generar clips/)
  console.log('imagen con ChatGPT; clip sin elegirlo: se niega y lo explica ✓')
  parar()

  // 3. Sin nada elegido.
  parar = atenderMedios(dir, undefined, '9:16', falsos, () => {})
  const nada = await kit(['imagen', 'algo'])
  assert.notEqual(nada.codigo, 0)
  assert.match(nada.error, /no eligió generar imágenes/)
  console.log('sin imágenes elegidas: se niega y lo explica ✓')
  parar()

  assert.ok(lineas.some((l) => /^Imagen 1/.test(l)) && lineas.some((l) => /^Clip 3/.test(l)), 'el chat ve lo que se genera')
  console.log('prueba medios: ok')
} catch (error) {
  console.error(`prueba medios: error · ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
  process.exit(process.exitCode ?? 0)
}
