// Imprime las notas del release de una versión, sacadas de src/shared/novedades.ts.
// Uso: node scripts/notas-version.mjs v0.1.2 > notas.md   (Node 24 lee .ts sin compilar)
import { notasMarkdown } from '../src/shared/novedades.ts'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) {
  console.error('Falta la versión: node scripts/notas-version.mjs v0.1.2')
  process.exit(1)
}
process.stdout.write(`${notasMarkdown(version)}\n`)
