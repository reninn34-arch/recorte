// Si la configuración de Codex (config.toml) está dañada, Codex no arranca («Error loading configuration:
// …config.toml:1:3276: key with no value»). Recorte la aparta (sin borrarla) y sigue. Con el Codex real.
// npm run prueba:configcodex
import assert from 'node:assert/strict'
import { exec } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-codexhome-'))
process.env.CODEX_HOME = dir
// El Codex que Recorte instala en su carpeta (en la app lo pone en el PATH `entorno()`).
process.env.PATH = `${join(process.env.APPDATA ?? '', 'recorte', 'agentes', 'node_modules', '.bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`
const { apartarConfigDanada, sanearConfigCodex } = await import('../src/main/configcodex.ts')
const correr = (orden) => new Promise((ok) => exec(orden, { env: process.env, timeout: 30_000 }, (_e, so, se) => ok({ salida: `${so}${se}` })))
const config = join(dir, 'config.toml')
try {
  // Una buena se queda donde está (y la segunda vez ni se pregunta a Codex).
  writeFileSync(config, 'model = "gpt-5"\n\n[projects.\'C:\\\\Users\\\\x\']\ntrust_level = "trusted"\n')
  assert.equal(await sanearConfigCodex(correr), null)
  assert.ok(existsSync(config), 'una configuración buena no se toca')
  let llamadas = 0
  assert.equal(await sanearConfigCodex(async (o) => (llamadas++, correr(o))), null)
  assert.equal(llamadas, 0, 'si no cambió, no se vuelve a preguntar')

  // Dañada como en la otra compu: una clave sin valor.
  writeFileSync(config, `model = "gpt-5" ${'x'.repeat(50)} sin_valor\n`)
  const aviso = await sanearConfigCodex(correr)
  assert.match(aviso ?? '', /estaba dañada.*config\.toml\.danado-/, `avisa y la aparta: ${aviso}`)
  assert.ok(!existsSync(config), 'ya no está config.toml')
  assert.equal(readdirSync(dir).filter((n) => n.startsWith('config.toml.danado-')).length, 1, 'se guardó apartada, no se borró')
  // Y Codex ya arranca.
  assert.doesNotMatch((await correr('codex login status')).salida, /Error loading config/i)

  // Del texto del error: solo toca un .toml de la carpeta de Codex.
  assert.equal(apartarConfigDanada('Error loading configuration: C:\\otra\\cosa.toml:1:2: x'), null, 'sin config.toml no hay nada que apartar')
  assert.equal(apartarConfigDanada('todo bien'), null)
  console.log('configuración de Codex dañada: se aparta sin borrarla y Codex vuelve a arrancar ✓')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
