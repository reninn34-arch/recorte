// Las cuentas (la voz de Google, Flow) se abren en el navegador predeterminado del usuario si Recorte lo puede manejar
// (Chrome, Edge, Brave, Vivaldi, Opera, Chromium); con Firefox o Safari, en Edge o Chrome, y lo dice. Cada navegador
// tiene su carpeta de perfil (la de Edge, la de siempre). npm run prueba:navegador-predeterminado
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'win32') {
  console.log('navegador: esta prueba simula el predeterminado de Windows (se salta aquí)')
  process.exit(0)
}
// Cada caso en su propio proceso (el navegador elegido se recuerda medio minuto).
const caso = (progId) => {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--import', './scripts/ts-sin-extension.mjs', '--import', './scripts/electron-falso.mjs', '--input-type=module', '-e',
      "const m = await import('./src/main/edgeperfil.ts'); console.log(JSON.stringify({ nav: m.navegadorGoogle(), perfil: m.carpetaPerfil('perfil') }))"],
    { encoding: 'utf8', env: { ...process.env, RECORTE_PROGID_PRUEBA: progId } }
  )
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}
const hay = (progId) => spawnSync('reg', ['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve']).status === 0

// Edge: el de siempre, con la carpeta de siempre (quien ya entró no pierde la sesión).
if (hay('MSEdgeHTM')) {
  const e = caso('MSEdgeHTM')
  assert.equal(e.nav.id, 'edge')
  assert.equal(e.nav.predeterminado, true)
  assert.equal(e.perfil, 'perfil', 'Edge sigue con su carpeta de perfil')
  console.log('Edge predeterminado → Edge ✓')
}
// Chrome: se usa Chrome, con su propia carpeta.
if (hay('ChromeHTML')) {
  const c = caso('ChromeHTML')
  assert.equal(c.nav.id, 'chrome')
  assert.match(c.nav.exe, /chrome\.exe$/i)
  assert.equal(c.nav.predeterminado, true)
  assert.equal(c.perfil, 'perfil-chrome', 'Chrome tiene su carpeta')
  console.log('Chrome predeterminado → Chrome ✓')
}
// Firefox (o uno que no existe): Edge o Chrome, y se dice cuál era el predeterminado.
const f = caso('FirefoxURL-308046B0AF4A39CB')
assert.ok(f.nav && ['edge', 'chrome'].includes(f.nav.id), `con Firefox se usa Edge o Chrome (${f.nav?.id})`)
assert.equal(f.nav.predeterminado, false)
assert.equal(f.nav.noCompatible, 'Firefox', 'se dice que el predeterminado es Firefox')
console.log(`Firefox predeterminado → ${f.nav.nombre}, avisando ✓`)
console.log('navegador predeterminado: todo bien')
