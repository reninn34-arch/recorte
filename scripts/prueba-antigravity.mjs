// Antigravity (el agente de Google): se baja de Google, se comprueba su huella, se descomprime con lo que trae el sistema
// (tar en Windows, ditto en Mac, unzip en Linux) y su programa queda listo para ejecutarse. Baja unos 230 MB: es la prueba
// de la integración continua del Mac (mac.yml, en la rama mac-prueba), no para correrla a cada rato.
// npm run prueba:antigravity
import assert from 'node:assert/strict'
import { accessSync, constants, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { instalarAntigravity, exeAntigravity } = await import('../src/main/antigravity.ts')
const t0 = Date.now()
await instalarAntigravity()
const exe = exeAntigravity()
assert.ok(exe, 'el programa de Antigravity quedó en su carpeta')
if (process.platform !== 'win32') accessSync(exe, constants.X_OK)
console.log(`antigravity: ${exe} listo en ${Math.round((Date.now() - t0) / 1000)} s · todo bien`)
rmSync(join(tmpdir(), 'agentes', 'antigravity'), { recursive: true, force: true })
