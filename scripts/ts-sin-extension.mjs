// Para las pruebas con `node --experimental-strip-types`: el código importa `./x` sin `.ts`
// (como lo resuelve Vite); este gancho prueba `./x.ts` cuando `./x` no existe.
import { existsSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

if (!globalThis.__recorteTs) {
  globalThis.__recorteTs = true
  register(import.meta.url)
}

export async function resolve(especificador, contexto, siguiente) {
  if ((especificador.startsWith('./') || especificador.startsWith('../')) && !/\.[cm]?[jt]s$/.test(especificador) && contexto.parentURL) {
    const url = new URL(`${especificador}.ts`, contexto.parentURL)
    if (existsSync(fileURLToPath(url))) return siguiente(url.href, contexto)
  }
  return siguiente(especificador, contexto)
}
