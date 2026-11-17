// La voz de Gemini con el límite de Google: si es el de por minuto, Recorte espera lo que pide Google y sigue con la misma
// frase; si es la cuota del día, pasa al modelo ligero sin esperar. Y el agente que trabaja largo no se corta mientras
// cree archivos en su carpeta (ultimoArchivo lo nota).
// npm run prueba:voz-limite
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { esperaPorLimite, generarVozGemini } = await import('../src/main/voz.ts')
const { ultimoArchivo } = await import('../src/main/turnoagente.ts')

const porMinuto = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel' }] }, { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } })
const porDia = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel' }] }] } })
assert.equal(esperaPorLimite(porMinuto), 37, 'espera lo que pide Google')
assert.equal(esperaPorLimite(porDia), null, 'la cuota del día no se espera')
assert.equal(esperaPorLimite('{"error":{"code":429}}'), 40, 'sin decir cuánto: 40 s')

const dir = mkdtempSync(join(tmpdir(), 'recorte-voz-limite-'))
const fetchReal = globalThis.fetch
try {
  // Google simulado: dos veces «espera» (por minuto) y después el audio.
  const audio = Buffer.from('RIFF0000WAVEfmt ').toString('base64')
  const respuestas = [
    () => new Response(porMinuto, { status: 429 }),
    () => new Response(porMinuto, { status: 429 }),
    () => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: audio }] }] }), { status: 200 })
  ]
  const modelos = []
  globalThis.fetch = async (_url, init) => {
    modelos.push(JSON.parse(init.body).model)
    return respuestas.shift()()
  }
  const esperas = []
  const salida = join(dir, 'frase.wav')
  await generarVozGemini('Hola', 'Umbriel', 'clave', salida, (s) => esperas.push(s), async () => {})
  assert.ok(existsSync(salida) && readFileSync(salida).subarray(0, 4).toString() === 'RIFF', 'la frase salió')
  assert.deepEqual(esperas, [37, 37], 'esperó dos veces lo que pidió Google')
  assert.equal(new Set(modelos).size, 1, 'siempre con el mismo modelo (el bueno)')

  // La cuota del día: pasa al modelo ligero sin esperar.
  const vistos = []
  globalThis.fetch = async (_url, init) => {
    const m = JSON.parse(init.body).model
    vistos.push(m)
    return vistos.length === 1 ? new Response(porDia, { status: 429 }) : new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: audio }] }] }), { status: 200 })
  }
  const esperas2 = []
  await generarVozGemini('Hola', 'Umbriel', 'clave', join(dir, 'frase2.wav'), (s) => esperas2.push(s), async () => {})
  assert.equal(esperas2.length, 0, 'no esperó')
  assert.equal(vistos.length, 2)
  assert.notEqual(vistos[0], vistos[1], 'pasó al otro modelo')

  // Siempre «espera»: se rinde con un mensaje claro (no se queda para siempre).
  globalThis.fetch = async () => new Response(porMinuto, { status: 429 })
  await assert.rejects(generarVozGemini('Hola', 'Umbriel', 'clave', join(dir, 'f3.wav'), () => {}, async () => {}), /por minuto/)

  // El agente crea un archivo dentro de su carpeta (dos niveles): se nota como avance.
  const trabajo = join(dir, 'trabajo')
  mkdirSync(join(trabajo, 'voz'), { recursive: true })
  const viejo = (Date.now() - 3600_000) / 1000
  writeFileSync(join(trabajo, 'notas.md'), 'x')
  utimesSync(join(trabajo, 'notas.md'), viejo, viejo)
  utimesSync(join(trabajo, 'voz'), viejo, viejo)
  const antes = ultimoArchivo(trabajo)
  assert.ok(Date.now() - antes > 3000_000, 'todo viejo: sin avance reciente')
  writeFileSync(join(trabajo, 'voz', 'frase-09.wav'), 'audio')
  assert.ok(Date.now() - ultimoArchivo(trabajo) < 60_000, 'una frase nueva dentro de voz/ cuenta como avance')
  console.log('voz con el límite de Google y avance del agente: todo bien')
} finally {
  globalThis.fetch = fetchReal
  rmSync(dir, { recursive: true, force: true })
}
