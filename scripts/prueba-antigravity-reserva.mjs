// Con Antigravity de verdad: dos turnos seguidos del modo agente. El primero arranca el servidor (~30 s); el segundo
// debe usar el que quedó en reserva y empezar en unos segundos. Gasta dos turnos mínimos de la cuota.
// RECORTE_USERDATA=%APPDATA%\recorte node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs --import ./scripts/electron-falso.mjs scripts/prueba-antigravity-reserva.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

assert.ok(process.env.RECORTE_USERDATA, 'pon RECORTE_USERDATA a la carpeta de datos de Recorte (%APPDATA%\\recorte)')
const { trabajarAntigravity, cerrarAntigravity } = await import('../src/main/antigravity.ts')
const cwd = mkdtempSync(join(tmpdir(), 'recorte-agy-'))
const turno = async (n) => {
  const t0 = Date.now()
  let primera = 0
  const r = await trabajarAntigravity(`Responde solo con la palabra: listo${n}. No uses herramientas.`, cwd, () => {
    primera ||= Date.now() - t0
  }, undefined, 5 * 60_000)
  const total = Date.now() - t0
  console.log(`turno ${n}: ${(total / 1000).toFixed(1)} s · respuesta: ${r.trim().slice(0, 40)}`)
  return total
}
try {
  const a = await turno(1)
  const b = await turno(2)
  assert.ok(b < a - 15_000, `el segundo turno usa el Antigravity en reserva (${(a / 1000).toFixed(0)} s → ${(b / 1000).toFixed(0)} s)`)
  console.log('Antigravity en reserva: el segundo turno no vuelve a arrancar ✓')
  // Al cerrarlo no queda nada abierto (antes, en Windows, `kill()` dejaba el servidor y su arnés vivos).
  cerrarAntigravity()
  await new Promise((r) => setTimeout(r, 4000))
  if (process.platform === 'win32') {
    const { execSync } = await import('node:child_process')
    const quedan = execSync('tasklist', { encoding: 'utf8' }).split('\n').filter((l) => /agy_acp_server|localharness_external/i.test(l))
    assert.equal(quedan.length, 0, `quedó Antigravity abierto:\n${quedan.join('\n')}`)
    console.log('al cerrarlo no queda ningún proceso de Antigravity ✓')
  }
} finally {
  cerrarAntigravity()
  await new Promise((r) => setTimeout(r, 1500))
  rmSync(cwd, { recursive: true, force: true })
  process.exit(process.exitCode ?? 0)
}
