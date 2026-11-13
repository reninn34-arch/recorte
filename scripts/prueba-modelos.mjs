import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guardarModelos, traerModelos } from '../src/main/modelos3d.ts'

/**
 * La biblioteca de modelos 3D: llega a la carpeta de trabajo, lo nuevo o mejorado se guarda y lo que no cambió no.
 * Uso: npm run prueba:modelos
 */

const dir = mkdtempSync(join(tmpdir(), 'recorte-modelos-'))
const biblioteca = join(dir, 'biblioteca')
const ok = (cond, msj) => {
  if (!cond) throw new Error(msj)
}
try {
  const trabajo = join(dir, 'trabajo')
  const traidos = traerModelos(trabajo, biblioteca)
  ok(traidos.includes('sonrisa') && existsSync(join(trabajo, 'modelos-3d', 'sonrisa', 'vista.jpg')), `No trajo la sonrisa: ${traidos}`)
  ok(existsSync(join(trabajo, 'modelos-3d', 'LEEME.md')), 'Falta el LEEME de los modelos.')
  console.log('trae los modelos de Recorte a la carpeta de trabajo, con su LEEME ✓')

  ok(guardarModelos(trabajo, biblioteca).length === 0, 'Guardó un modelo que no cambió.')
  // El agente hace uno nuevo y mejora la sonrisa; una carpeta sin ficha no es un modelo.
  mkdirSync(join(trabajo, 'modelos-3d', 'muela'))
  writeFileSync(join(trabajo, 'modelos-3d', 'muela', 'modelo.js'), 'export function crear(THREE) { return new THREE.Group() }\nexport function animar() {}\n')
  writeFileSync(join(trabajo, 'modelos-3d', 'muela', 'ficha.json'), JSON.stringify({ nombre: 'Muela', etiquetas: ['diente'] }))
  mkdirSync(join(trabajo, 'modelos-3d', 'a-medias'))
  writeFileSync(join(trabajo, 'modelos-3d', 'a-medias', 'modelo.js'), '// sin ficha')
  const sonrisa = join(trabajo, 'modelos-3d', 'sonrisa', 'modelo.js')
  writeFileSync(sonrisa, readFileSync(sonrisa, 'utf8') + '\n// mejorada\n')
  const guardados = guardarModelos(trabajo, biblioteca).sort()
  ok(guardados.join(',') === 'muela,sonrisa', `Debía guardar la muela nueva y la sonrisa mejorada: ${guardados}`)
  console.log('guarda lo nuevo y lo mejorado, y no lo que está a medias ✓')

  // El video siguiente recibe la sonrisa mejorada (manda la guardada) y la muela.
  const otro = join(dir, 'otro')
  traerModelos(otro, biblioteca)
  ok(readFileSync(join(otro, 'modelos-3d', 'sonrisa', 'modelo.js'), 'utf8').includes('// mejorada') && existsSync(join(otro, 'modelos-3d', 'muela', 'modelo.js')),
    'El video siguiente no recibió lo guardado.')
  // Una segunda ronda del mismo video no pisa lo que el agente ya cambió.
  writeFileSync(join(otro, 'modelos-3d', 'muela', 'modelo.js'), '// cambiada en esta ronda')
  traerModelos(otro, biblioteca)
  ok(readFileSync(join(otro, 'modelos-3d', 'muela', 'modelo.js'), 'utf8') === '// cambiada en esta ronda', 'Una ronda nueva pisó el modelo en el que trabajaba el agente.')
  ok(guardarModelos(otro, biblioteca).length === 1, 'Debía guardar solo la muela cambiada.')
  console.log('el video siguiente recibe lo guardado y una ronda nueva no pisa lo que se está cambiando ✓')
  console.log('prueba modelos: ok')
} catch (e) {
  console.error(`prueba modelos: error · ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
