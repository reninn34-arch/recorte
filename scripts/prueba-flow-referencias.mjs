// Con tu cuenta de Flow de verdad: imágenes CON referencia (se sube la foto y se pone como «ingrediente») a la vez que
// otra sin referencia, en la misma pestaña; y un clip cuando la cuenta no tiene puntos: debe decir que no hay puntos
// sin generar nada. Las imágenes no gastan; el clip no llega a mandarse.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs --import ./scripts/electron-falso.mjs scripts/prueba-flow-referencias.mjs <foto.png>
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const foto = process.argv[2]
assert.ok(foto, 'pasa una foto de referencia')
const { edgePerfil, PUERTO_VOZ, cerrarEdgesOciosos } = await import('../src/main/edgeperfil.ts')
const { abrirPestanaFlow, generarEnPestana, NoEmpezo } = await import('../src/main/flowpagina.ts')
const datos = JSON.parse(readFileSync(join(process.env.APPDATA, 'recorte', 'flow', 'flow.json'), 'utf8'))
const proyecto = Object.values(datos.proyectos)[0]
const perfil = edgePerfil(join(process.env.APPDATA, 'recorte', 'voz', 'perfil'), PUERTO_VOZ)
const salida = mkdtempSync(join(tmpdir(), 'recorte-flow-ref-'))
const t0 = Date.now()
const s = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`
try {
  await perfil.enEdge(async (b) => {
    const pest = await abrirPestanaFlow(b, proyecto)
    console.log(s(), 'pestaña en el proyecto')
    const pedir = (n, prompt, refs) =>
      generarEnPestana(b, pest, { tipo: 'imagen', prompt, formato: '9:16', modelo: 'Nano Banana 2.1', referencias: refs }, 0, join(salida, n), perfil.enDescarga).then((x) => {
        console.log(s(), `${n} lista: ${x.archivo}`)
        return x
      })
    const r = await Promise.all([
      pedir('con-ref-1', 'The same medical vial from the reference on a clean white pedestal, studio light, product shot', [foto]),
      pedir('sin-ref', 'A glass of water on a white table, soft daylight, product photography', []),
      pedir('con-ref-2', 'Close-up of the fibrosis illustration from the reference, glowing collagen fibers, medical 3D style', [foto])
    ])
    const hashes = new Set(r.map((x) => createHash('sha1').update(readFileSync(x.archivo)).digest('hex')))
    assert.equal(hashes.size, 3, 'tres imágenes distintas')
    console.log(s(), 'imágenes con y sin referencia a la vez ✓')

    // Clip sin puntos: no se manda.
    try {
      await generarEnPestana(b, pest, { tipo: 'video', prompt: 'A slow camera move over the medical vial', formato: '9:16', modelo: 'Veo 3.1 - Lite' }, 20, join(salida, 'clip'), perfil.enDescarga)
      console.log(s(), 'el clip SÍ se generó (la cuenta tenía puntos)')
    } catch (e) {
      assert.ok(e instanceof NoEmpezo, `debe ser «no empezó» (no gasta): ${e.message}`)
      console.log(s(), `clip sin puntos: ${e.message} ✓`)
    }
    // Y la pestaña sigue sirviendo después del fallo.
    await pedir('despues', 'A green apple on a wooden table, soft light', [])
    console.log(s(), 'la pestaña sigue sirviendo tras el fallo ✓')
  })
  console.log(s(), `todo bien · en ${salida}`)
} finally {
  await cerrarEdgesOciosos()
  process.exit(process.exitCode ?? 0)
}
