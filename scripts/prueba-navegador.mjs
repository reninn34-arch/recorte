// El navegador para entrar con Google (Flow y la voz de AI Studio): Recorte lo encuentra (Edge o, si no, Chrome) en
// Windows y en Mac, y se abre sin ventana con un perfil aparte y contesta por su puerto de depuración (como lo usa la app).
// npm run prueba:navegador
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { navegadorGoogle, edgeExe } = await import('../src/main/edgeperfil.ts')
const nav = navegadorGoogle()
assert.ok(nav, 'hay Edge o Chrome en este equipo')
assert.equal(edgeExe(), nav.exe)
const perfil = mkdtempSync(join(tmpdir(), 'recorte-navegador-'))
const puerto = 9400 + Math.floor(Math.random() * 400)
const hijo = spawn(nav.exe, [`--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true })
try {
  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    await new Promise((r) => setTimeout(r, 500))
    version = await fetch(`http://127.0.0.1:${puerto}/json/version`).then((r) => r.json(), () => null)
  }
  assert.ok(version, `${nav.nombre} contesta por su puerto`)
  console.log(`navegador: ${nav.nombre} (${version.Browser}) en ${nav.exe} · todo bien`)
} finally {
  hijo.kill()
  await new Promise((r) => setTimeout(r, 1500))
  rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
