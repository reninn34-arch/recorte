// Para las pruebas fuera de Electron: `import { app } from 'electron'` recibe un app mínimo.
import { register } from 'node:module'

if (!globalThis.__recorteElectron) {
  globalThis.__recorteElectron = true
  register(import.meta.url)
}

const FALSO = 'data:text/javascript,' + encodeURIComponent(
  "import{tmpdir}from'node:os';export const app={isPackaged:false,getPath:()=>tmpdir(),getAppPath:()=>process.cwd(),getVersion:()=>'0.0.0'};export default{app}"
)

export async function resolve(especificador, contexto, siguiente) {
  if (especificador === 'electron') return { url: FALSO, shortCircuit: true }
  return siguiente(especificador, contexto)
}
