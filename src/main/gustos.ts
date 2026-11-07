import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  claveGusto,
  GUSTOS_VACIOS,
  gustosParaPrompt,
  MAX_GUSTOS,
  MAX_SENALES,
  type Gusto,
  type Gustos,
  type SenalGusto
} from '../shared/gustos'
import { guardar } from './disco'

/** El criterio del usuario, en `<userData>/gustos.json`. Ver `shared/gustos.ts`. */

const archivo = () => join(app.getPath('userData'), 'gustos.json')
let cache: Gustos | null = null

export function cargarGustos(): Gustos {
  if (cache) return cache
  let g: Gustos = structuredClone(GUSTOS_VACIOS)
  try {
    if (existsSync(archivo())) {
      const d = JSON.parse(readFileSync(archivo(), 'utf8')) as Partial<Gustos>
      g = {
        activo: d.activo !== false,
        lista: Array.isArray(d.lista) ? d.lista.filter((x) => x && typeof x.texto === 'string') : [],
        senales: Array.isArray(d.senales) ? d.senales.filter((x) => x && typeof x.detalle === 'string') : [],
        usos: {
          formato: d.usos?.formato ?? {},
          duracion: d.usos?.duracion ?? {},
          estilo: d.usos?.estilo ?? {}
        }
      }
    }
  } catch {
    // Un archivo roto no debe parar la app: se empieza de cero.
  }
  cache = g
  return g
}

function guardarGustos(g: Gustos): Gustos {
  cache = g
  guardar(archivo(), JSON.stringify(g, null, 2))
  return g
}

/** Agrega gustos; si ya hay uno igual (o casi), suma una confirmación. */
export function agregarGustos(textos: string[], origen: Gusto['origen']): Gusto[] {
  const g = cargarGustos()
  if (!g.activo && origen === 'aprendido') return []
  const nuevos: Gusto[] = []
  for (const bruto of textos) {
    const texto = bruto.trim().slice(0, 140)
    if (texto.length < 3) continue
    const clave = claveGusto(texto)
    const igual = g.lista.find((x) => claveGusto(x.texto) === clave)
    if (igual) {
      igual.veces += 1
      igual.fecha = Date.now()
      continue
    }
    const nuevo: Gusto = { id: randomUUID(), texto, origen, veces: 1, fecha: Date.now() }
    g.lista.push(nuevo)
    nuevos.push(nuevo)
  }
  // Si hay demasiados, se van los menos confirmados y más viejos (nunca los dichos).
  while (g.lista.length > MAX_GUSTOS) {
    const candidatos = g.lista.filter((x) => x.origen === 'aprendido')
    if (!candidatos.length) break
    const peor = candidatos.reduce((a, b) => (a.veces < b.veces || (a.veces === b.veces && a.fecha < b.fecha) ? a : b))
    g.lista = g.lista.filter((x) => x !== peor)
  }
  guardarGustos(g)
  return nuevos
}

export function quitarGusto(id: string): Gustos {
  const g = cargarGustos()
  g.lista = g.lista.filter((x) => x.id !== id)
  return guardarGustos(g)
}

export function senalGusto(tipo: SenalGusto['tipo'], detalle: string): void {
  const g = cargarGustos()
  if (!g.activo || !detalle.trim()) return
  g.senales = [...g.senales, { tipo, detalle: detalle.trim().slice(0, 240), fecha: Date.now() }].slice(-MAX_SENALES)
  guardarGustos(g)
}

export function usoCreacion(formato: string, duracion: number, estilo: string): void {
  const g = cargarGustos()
  if (!g.activo) return
  const sumar = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1)
  sumar(g.usos.formato, formato)
  sumar(g.usos.duracion, String(duracion))
  sumar(g.usos.estilo, estilo)
  guardarGustos(g)
}

export function activarGustos(activo: boolean): Gustos {
  return guardarGustos({ ...cargarGustos(), activo })
}

/** Olvida todo lo aprendido (los gustos, las señales y los usos). */
export function olvidarGustos(): Gustos {
  return guardarGustos({ ...structuredClone(GUSTOS_VACIOS), activo: cargarGustos().activo })
}

export function bloqueGustos(): string {
  return gustosParaPrompt(cargarGustos())
}
