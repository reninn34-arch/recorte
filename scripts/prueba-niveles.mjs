// Los niveles (rápido, equilibrado, máximo) no dependen de nombres de modelo escritos a mano: Kimi los saca de su lista
// (si sale uno nuevo, el nivel lo sigue; si la lista no se pudo leer, el nombre de respaldo) y Gemini y Claude usan los
// alias que mantienen Google y Anthropic. Y la lista de Gemini se lee del paquete instalado, esté donde esté.
// npm run prueba:niveles
import assert from 'node:assert/strict'
const { comandoConNivel, modeloDeNivel, usarListaDeModelos } = await import('../src/main/modelos.ts')

const kimi = [
  { id: 'kimi-code/kimi-for-coding-highspeed', nombre: 'K2.7 Highspeed', esfuerzos: [] },
  { id: 'kimi-code/kimi-for-coding', nombre: 'K2.8', esfuerzos: [] },
  { id: 'kimi-code/k3.1-pro', nombre: 'K3.1 Pro', esfuerzos: [] }
]
assert.equal(modeloDeNivel('kimi', 'rapido', kimi), 'kimi-code/kimi-for-coding-highspeed')
assert.equal(modeloDeNivel('kimi', 'equilibrado', kimi), 'kimi-code/kimi-for-coding')
assert.equal(modeloDeNivel('kimi', 'maximo', kimi), 'kimi-code/k3.1-pro')
const kimiNuevo = [...kimi, { id: 'kimi-code/k4-pro', nombre: 'K4 Pro', esfuerzos: [] }]
assert.equal(modeloDeNivel('kimi', 'maximo', kimiNuevo), 'kimi-code/k4-pro', 'sale un Kimi más nuevo: el nivel lo sigue')

assert.equal(comandoConNivel('kimi', 'kimi', 'maximo'), 'kimi -m kimi-code/k3.1-pro', 'sin lista: el respaldo')
usarListaDeModelos((a) => (a === 'kimi' ? kimiNuevo : []))
assert.equal(comandoConNivel('kimi', 'kimi', 'maximo'), 'kimi -m kimi-code/k4-pro', 'con lista: de la lista')
assert.equal(comandoConNivel('gemini -p', 'gemini', 'maximo'), 'gemini -p -m pro', 'Gemini: su alias')
assert.equal(comandoConNivel('gemini -p', 'gemini', 'rapido'), 'gemini -p -m flash')
assert.equal(comandoConNivel('claude -p', 'claude', 'maximo'), 'claude -p --model opus', 'Claude: su alias')

// La lista de Gemini del paquete instalado en este equipo (si está): como la app, con los agentes que bajó Recorte.
const { anadirCarpetaBinarios, resolverBinario } = await import('../src/main/binarios.ts')
if (process.env.APPDATA) anadirCarpetaBinarios(`${process.env.APPDATA}/recorte/agentes/node_modules/.bin`)
const { catalogoRecordado } = await import('../src/main/catalogo.ts')
const real = catalogoRecordado('gemini')
console.log('gemini en:', resolverBinario('gemini'))
console.log('Gemini en este equipo:', real.map((m) => m.id + (m.anterior ? ' (anterior)' : '')).join(', '))
console.log('niveles sin nombres escritos a mano: todo bien')
