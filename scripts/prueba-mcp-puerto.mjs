// El servidor MCP de Recorte al actualizar: si la versión anterior aún tiene el puerto, la nueva espera a que lo suelte y se
// queda con el mismo (así los agentes conectados no pierden la conexión). Si nunca se suelta, toma el siguiente.
// npm run prueba:mcp-puerto
import assert from 'node:assert/strict'
import { createServer } from 'node:net'

const { ServidorMcp } = await import('../src/main/mcp.ts')
const ocupar = (p) => new Promise((ok) => { const s = createServer(); s.listen(p, '127.0.0.1', () => ok(s)) })
const puerto = 47900 + Math.floor(Math.random() * 50)

// La «versión vieja» suelta el puerto a los 2 s.
const vieja = await ocupar(puerto)
setTimeout(() => vieja.close(), 2000)
const nueva = new ServidorMcp([], 'x'.repeat(32), { nombre: 'recorte', version: '0', instrucciones: '' })
const t0 = Date.now()
assert.equal(await nueva.iniciar(puerto), puerto, 'se queda con el mismo puerto')
assert.ok(Date.now() - t0 >= 1500, 'esperó a que se soltara')
nueva.detener()

// Si nunca se suelta, el siguiente.
const tomado = await ocupar(puerto)
const otra = new ServidorMcp([], 'x'.repeat(32), { nombre: 'recorte', version: '0', instrucciones: '' })
assert.equal(await otra.iniciar(puerto), puerto + 1, 'con el puerto tomado para siempre, el siguiente')
otra.detener()
tomado.close()
console.log('MCP al actualizar: espera su puerto y, si no se libera, toma otro · todo bien')
