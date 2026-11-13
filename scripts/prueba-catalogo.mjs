// Los modelos de los agentes se ponen al día solos: Kimi desde su config.toml, avisos cuando
// cambian y una elección con un modelo que ya no está vuelve al de siempre.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-kimi-'))
process.env.KIMI_SHARE_DIR = dir
const seccion = (id, nombre) => `[models."${id}"]\nprovider = "managed:kimi-code"\nmodel = "${id.split('/')[1]}"\ndisplay_name = "${nombre}"\nsupport_efforts = [ "low", "high" ]\n\n`
const escribir = (modelos) => writeFileSync(join(dir, 'config.toml'), `default_model = "kimi-code/k3"\n\n[providers."managed:kimi-code"]\ntype = "kimi"\n\n${modelos.join('')}[thinking]\nenabled = true\n`)

try {
  const { catalogoAgente, alCambiarCatalogo, eleccionVigente } = await import('../src/main/catalogo.ts')
  const avisos = []
  alCambiarCatalogo((id, modelos) => avisos.push([id, modelos.map((m) => m.id)]))

  escribir([seccion('kimi-code/k3', 'K3'), seccion('kimi-code/k3.1-pro', 'K3.1 Pro')])
  let lista = await catalogoAgente('kimi')
  assert.deepEqual(lista.map((m) => m.nombre), ['K3', 'K3.1 Pro'])
  assert.equal(lista.find((m) => m.id === 'kimi-code/k3').recomendado, true, 'el default_model es el recomendado')
  assert.equal(avisos.length, 0, 'la primera lectura no avisa')
  console.log('Kimi: lee los modelos de tu cuenta desde su config.toml ✓')

  escribir([seccion('kimi-code/k3', 'K3'), seccion('kimi-code/k3.1-pro', 'K3.1 Pro'), seccion('kimi-code/k4', 'K4')])
  lista = await catalogoAgente('kimi')
  assert.equal(lista.length, 3)
  assert.deepEqual(avisos.at(-1), ['kimi', ['kimi-code/k3', 'kimi-code/k3.1-pro', 'kimi-code/k4']])
  console.log('modelo nuevo en la cuenta: aparece y la interfaz recibe el aviso ✓')

  escribir([seccion('kimi-code/k3', 'K3'), seccion('kimi-code/k4', 'K4')])
  await catalogoAgente('kimi')
  assert.deepEqual(avisos.at(-1), ['kimi', ['kimi-code/k3', 'kimi-code/k4']])
  await catalogoAgente('kimi')
  assert.equal(avisos.length, 2, 'sin cambios no se avisa de nuevo')
  console.log('modelo quitado: desaparece y se avisa una sola vez ✓')

  assert.deepEqual(eleccionVigente({ agente: 'kimi', modelo: 'kimi-code/k3.1-pro', esfuerzo: 'high' }), { agente: 'kimi' })
  assert.deepEqual(eleccionVigente({ agente: 'kimi', modelo: 'kimi-code/k4' }), { agente: 'kimi', modelo: 'kimi-code/k4' })
  assert.deepEqual(eleccionVigente({ agente: 'kimi', modelo: 'kimi-code/k4', esfuerzo: 'xhigh' }), { agente: 'kimi', modelo: 'kimi-code/k4' })
  console.log('elegiste un modelo que ya no está: vuelve al de siempre en vez de fallar ✓')

  rmSync(join(dir, 'config.toml'))
  lista = await catalogoAgente('kimi')
  assert.ok(lista.length >= 1, 'sin config.toml quedan los conocidos')
  console.log('sin config de Kimi: los modelos conocidos ✓')
  console.log('prueba catálogo: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
