// Escribe `latest-mac.yml` (lo que lee electron-updater en Mac para saber si hay versión nueva) a partir de los .dmg.
// Las Mac con Recorte 0.1.67 a 0.1.69 lo buscan en el último release; desde la 0.1.70 se mira GitHub directamente, pero
// el archivo se sigue publicando para que esas versiones avisen de la nueva.
// Uso: node scripts/latest-mac.mjs 0.1.70 salida/latest-mac.yml release/Recorte-Mac-arm64.dmg release/Recorte-Mac-x64.dmg
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const [version, salida, ...dmgs] = process.argv.slice(2)
if (!version || !salida || !dmgs.length) {
  console.error('Uso: node scripts/latest-mac.mjs <versión> <salida> <dmg>...')
  process.exit(1)
}
const archivos = dmgs.map((ruta) => ({
  url: basename(ruta),
  sha512: createHash('sha512').update(readFileSync(ruta)).digest('base64'),
  size: statSync(ruta).size
}))
const yml = [
  `version: ${version.replace(/^v/, '')}`,
  'files:',
  ...archivos.flatMap((a) => [`  - url: ${a.url}`, `    sha512: ${a.sha512}`, `    size: ${a.size}`]),
  `path: ${archivos[0].url}`,
  `sha512: ${archivos[0].sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  ''
].join('\n')
writeFileSync(salida, yml)
console.log(yml)
