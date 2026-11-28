import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pintaDeTexto } from '../shared/timeline'
import type { EstiloTextoGuardado } from '../shared/api'
import { guardar } from './disco'

/**
 * Los estilos de texto que guarda el usuario («Guardar como mi estilo», como el «Save as preset» de CapCut), para
 * todos sus proyectos. Viven en `<userData>/estilos-texto.json`: solo la pinta (letra, colores, caja, borde, sombra).
 */

const MAX = 24
const archivo = () => join(app.getPath('userData'), 'estilos-texto.json')

function limpiar(x: unknown): EstiloTextoGuardado | null {
  if (!x || typeof x !== 'object') return null
  const e = x as Partial<EstiloTextoGuardado>
  if (typeof e.id !== 'string' || typeof e.nombre !== 'string') return null
  return { id: e.id.slice(0, 60), nombre: e.nombre.trim().slice(0, 40) || 'Mi estilo', pinta: pintaDeTexto((e.pinta ?? {}) as object) }
}

export function leerEstilosTexto(): EstiloTextoGuardado[] {
  try {
    if (!existsSync(archivo())) return []
    const d = JSON.parse(readFileSync(archivo(), 'utf8')) as unknown
    return Array.isArray(d) ? d.map(limpiar).filter((x): x is EstiloTextoGuardado => x !== null).slice(0, MAX) : []
  } catch {
    // Un archivo roto no debe parar la app: sin estilos guardados.
    return []
  }
}

/** Guarda la pinta de un texto como estilo nuevo (el más reciente, primero). */
export function guardarEstiloTexto(nombre: string, pinta: unknown): EstiloTextoGuardado[] {
  const nuevo = limpiar({ id: randomUUID(), nombre, pinta })
  if (!nuevo) return leerEstilosTexto()
  const lista = [nuevo, ...leerEstilosTexto()].slice(0, MAX)
  guardar(archivo(), JSON.stringify(lista, null, 2))
  return lista
}

export function borrarEstiloTexto(id: string): EstiloTextoGuardado[] {
  const lista = leerEstilosTexto().filter((x) => x.id !== id)
  guardar(archivo(), JSON.stringify(lista, null, 2))
  return lista
}
