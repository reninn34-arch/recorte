// Con tu cuenta de Flow de verdad (la de la voz): 4 imágenes a la vez en UNA pestaña, con el código de Recorte
// (edgeperfil + flowpagina). Tope 0 créditos: si algo costara, no se genera. Comprueba que cada una baja a su
// archivo y que no se cruzan (cada archivo distinto). Deja las imágenes en la carpeta que imprime, para mirarlas.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs --import ./scripts/electron-falso.mjs scripts/prueba-flow-real.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { edgePerfil, PUERTO_VOZ } = await import('../src/main/edgeperfil.ts')
const { abrirPestanaFlow, generarEnPestana } = await import('../src/main/flowpagina.ts')

const datos = JSON.parse(readFileSync(join(process.env.APPDATA, 'recorte', 'flow', 'flow.json'), 'utf8'))
const proyecto = Object.values(datos.proyectos)[0]
const perfil = edgePerfil(join(process.env.APPDATA, 'recorte', 'voz', 'perfil'), PUERTO_VOZ)
const salida = mkdtempSync(join(tmpdir(), 'recorte-flow-real-'))
// Empiezan igual a propósito (como los del agente): lo que distingue la tarjeta no es el principio del prompt.
const temas = ['un faro blanco al atardecer', 'un gato naranja dormido', 'una bicicleta roja junto a un muro azul', 'una montaña nevada bajo las estrellas']
const t0 = Date.now()
const s = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`
try {
  const r = await perfil.enEdge(async (b) => {
    const pest = await abrirPestanaFlow(b, proyecto)
    console.log(s(), 'pestaña en el proyecto')
    return Promise.all(
      temas.map((tema, i) =>
        generarEnPestana(b, pest, { tipo: 'imagen', prompt: `Fotografía realista, estilo cinematográfico, luz suave: ${tema}`, formato: '9:16', modelo: 'Nano Banana 2.1' }, 0, join(salida, String(i + 1)), perfil.enDescarga).then((x) => {
          console.log(s(), `lista ${i + 1} (${tema}): ${x.archivo}`)
          return x
        })
      )
    )
  })
  assert.equal(r.length, 4)
  assert.ok(r.every((x) => x.creditos === 0), 'no gastó créditos')
  const hashes = new Set(r.map((x) => createHash('sha1').update(readFileSync(x.archivo)).digest('hex')))
  assert.equal(hashes.size, 4, 'cuatro archivos distintos: no se bajó la misma dos veces')
  console.log(s(), `4 imágenes a la vez en una pestaña ✓ · en ${salida}`)
} finally {
  // Que no espere la gracia: cerrar el Edge ya.
  const { cerrarEdgesOciosos } = await import('../src/main/edgeperfil.ts')
  await cerrarEdgesOciosos()
  process.exit(process.exitCode ?? 0)
}
