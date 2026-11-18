// Con tu cuenta de verdad: una frase de voz (AI Studio) MIENTRAS Flow genera 2 imágenes, todo en el mismo Edge
// compartido (cada uno en su pestaña). Comprueba que la voz baja su WAV y las imágenes las suyas, sin cruzarse.
// Gasta una frase de la cuota de voz del día; las imágenes no gastan créditos (tope 0).
// RECORTE_USERDATA=%APPDATA%\recorte node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs --import ./scripts/electron-falso.mjs scripts/prueba-voz-flow-real.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

assert.ok(process.env.RECORTE_USERDATA, 'pon RECORTE_USERDATA a la carpeta de datos de Recorte (%APPDATA%\\recorte)')
const { perfilDeLaVoz, cerrarEdgesOciosos } = await import('../src/main/edgeperfil.ts')
const { abrirPestanaFlow, generarEnPestana } = await import('../src/main/flowpagina.ts')
const { generarVozGoogle } = await import('../src/main/vozgoogle.ts')

const datos = JSON.parse(readFileSync(join(process.env.RECORTE_USERDATA, 'flow', 'flow.json'), 'utf8'))
const proyecto = Object.values(datos.proyectos)[0]
const perfil = perfilDeLaVoz()
const salida = mkdtempSync(join(tmpdir(), 'recorte-voz-flow-'))
const t0 = Date.now()
const s = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`
try {
  const flow = perfil.enEdge(async (b) => {
    const pest = await abrirPestanaFlow(b, proyecto)
    console.log(s(), 'Flow: pestaña en el proyecto')
    return Promise.all(
      ['un velero en un lago al amanecer', 'una lámpara antigua encendida en una mesa'].map((tema, i) =>
        generarEnPestana(b, pest, { tipo: 'imagen', prompt: `Fotografía realista: ${tema}`, formato: '9:16', modelo: 'Nano Banana 2.1' }, 0, join(salida, `img${i + 1}`), perfil.enDescarga).then((x) => {
          console.log(s(), `Flow: imagen ${i + 1} lista`)
          return x
        })
      )
    )
  })
  // La voz entra cuando Flow ya está trabajando.
  await new Promise((r) => setTimeout(r, 4000))
  const wav = join(salida, 'frase.wav')
  const voz = generarVozGoogle('Hola, esta es una prueba de la voz mientras Flow genera imágenes a la vez.', 'Kore', wav).then(() => console.log(s(), 'Voz: WAV listo'))
  const [imagenes] = await Promise.all([flow, voz])
  assert.ok(statSync(wav).size > 20_000, 'el WAV tiene audio')
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).stdout)
  assert.ok(dur > 2, `el WAV dura ${dur} s`)
  assert.ok(imagenes.every((x) => /\.(png|jpg|webp)$/.test(x.archivo)), 'las imágenes bajaron como imágenes, no el audio')
  console.log(s(), `voz (${dur.toFixed(1)} s) e imágenes a la vez en el mismo Edge ✓ · en ${salida}`)
} finally {
  await cerrarEdgesOciosos()
  process.exit(process.exitCode ?? 0)
}
