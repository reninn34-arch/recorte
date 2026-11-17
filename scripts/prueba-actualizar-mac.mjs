// La actualización propia de Mac (src/main/actualizarmac.ts), de punta a punta con el .dmg recién compilado: la huella
// sale del latest-mac.yml, la descarga se comprueba (y una huella equivocada se rechaza), la app sale del .dmg con su
// firma válida y, cuando el Recorte «viejo» se cierra, queda la nueva en su lugar.
// En Mac: npm run prueba:actualizar-mac -- release/Recorte-Mac-arm64.dmg      (en Windows solo corre lo que no es de Mac)
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { bajarConHuella, huellaEnYml, paqueteDe, prepararDesdeDmg, reemplazarAlSalir, sePuedeReemplazar } = await import('../src/main/actualizarmac.ts')

assert.equal(paqueteDe('/Applications/Recorte.app/Contents/MacOS/Recorte'), '/Applications/Recorte.app')
assert.equal(paqueteDe('/usr/local/bin/electron'), null)
const ymlEjemplo = 'version: 1.0.0\nfiles:\n  - url: Recorte-Mac-arm64.dmg\n    sha512: AAA=\n    size: 1\n  - url: Recorte-Mac-x64.dmg\n    sha512: BBB=\n    size: 2\npath: Recorte-Mac-arm64.dmg\n'
assert.equal(huellaEnYml(ymlEjemplo, 'Recorte-Mac-x64.dmg'), 'BBB=')
assert.equal(huellaEnYml(ymlEjemplo, 'otro.dmg'), null)

if (process.platform !== 'darwin') {
  console.log('actualizar en Mac: lo que se puede probar fuera de Mac, bien (el resto corre en la Mac de GitHub)')
  process.exit(0)
}

const dmg = process.argv[2]
assert.ok(dmg && existsSync(dmg), 'falta el .dmg (npm run prueba:actualizar-mac -- release/Recorte-Mac-arm64.dmg)')
const dir = mkdtempSync(join(tmpdir(), 'recorte-act-'))
try {
  // latest-mac.yml de verdad, con la huella del .dmg.
  const yml = join(dir, 'latest-mac.yml')
  const r = spawn('node', ['scripts/latest-mac.mjs', '9.9.9', yml, dmg], { stdio: 'ignore' })
  assert.equal(await new Promise((ok) => r.on('close', ok)), 0)
  const huella = huellaEnYml(readFileSync(yml, 'utf8'), 'Recorte-Mac-arm64.dmg') ?? huellaEnYml(readFileSync(yml, 'utf8'), 'Recorte-Mac-x64.dmg')
  assert.ok(huella, 'la huella está en latest-mac.yml')

  // Se baja de un servidor local (como de GitHub) y se comprueba.
  const servidor = createServer((_q, res) => {
    res.writeHead(200, { 'Content-Length': statSync(dmg).size })
    createReadStream(dmg).pipe(res)
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}/Recorte.dmg`
  const bajado = join(dir, 'bajado.dmg')
  let maximo = 0
  await bajarConHuella(url, bajado, huella, (p) => (maximo = Math.max(maximo, p)))
  assert.equal(statSync(bajado).size, statSync(dmg).size, 'se bajó entero')
  assert.ok(maximo > 0.99, 'avisó el avance hasta el final')
  await assert.rejects(bajarConHuella(url, join(dir, 'malo.dmg'), 'AAAA', () => {}), /huella/, 'una huella equivocada se rechaza')
  assert.ok(!existsSync(join(dir, 'malo.dmg')), 'y no deja el archivo')
  servidor.close()

  // Una «app vieja» instalada en una carpeta de aplicaciones de prueba.
  const apps = join(dir, 'Applications')
  const vieja = join(apps, 'Recorte.app')
  mkdirSync(join(vieja, 'Contents'), { recursive: true })
  writeFileSync(join(vieja, 'Contents', 'vieja.txt'), 'vieja')
  assert.ok(sePuedeReemplazar(vieja))
  const nueva = await prepararDesdeDmg(bajado, vieja)
  assert.ok(existsSync(join(nueva, 'Contents', 'Info.plist')), 'la app nueva salió del .dmg')

  // El «Recorte viejo» que se está cerrando: hasta que termine, no se toca nada.
  const viejoProceso = spawn('/bin/sleep', ['3'])
  reemplazarAlSalir(vieja, nueva, viejoProceso.pid, false)
  await new Promise((ok) => setTimeout(ok, 1000))
  assert.ok(existsSync(join(vieja, 'Contents', 'vieja.txt')), 'mientras el viejo sigue abierto, la app no se cambia')
  await new Promise((ok) => viejoProceso.on('exit', ok))
  for (let i = 0; i < 50 && existsSync(join(vieja, 'Contents', 'vieja.txt')); i++) await new Promise((ok) => setTimeout(ok, 200))
  assert.ok(!existsSync(join(vieja, 'Contents', 'vieja.txt')), 'al cerrarse, la app vieja se fue')
  assert.ok(existsSync(join(vieja, 'Contents', 'Info.plist')), 'y en su lugar está la nueva')
  assert.ok(!existsSync(nueva) && !existsSync(`${vieja}.vieja`), 'sin copias sueltas')
  console.log('actualizar en Mac: bajar, comprobar, sacar del .dmg y cambiar la app · todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
