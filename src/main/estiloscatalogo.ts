import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PREFIJO_CATALOGO, registrarEstilos, type EstiloCatalogo, type EstiloVideo, type GrupoEstilo } from '../shared/estilos'
import { guardar } from './disco'
import { rutaScriptPython } from './transcribir'

/**
 * La sección «Estilos»: un catálogo de estilos que el usuario añade y le salen como tarjetas debajo de la caja.
 * - Los de Recorte, en `python/estilos/<id>/` (se actualizan con la app).
 * - Los que crea el usuario, en `<datos de Recorte>/estilos-catalogo/<id>/` (uno con el mismo id reemplaza al de Recorte).
 * Cada uno es una carpeta con `ESTILO.md` (ficha arriba entre `---`, la guía del agente debajo) y, si la tiene, su vista
 * previa `vista.mp4` / `vista.jpg`. Los añadidos se guardan en orden en `estilos-anadidos.json`.
 * Cada estilo es también una habilidad del agente (`estilo-<id>`): así la usa si el usuario lo nombra, y aprende de lo
 * que le corrige en `habilidades/estilo-<id>/aprendido.md`.
 */

const ID = /^[a-z0-9][a-z0-9-]{1,48}$/
const GRUPOS: GrupoEstilo[] = ['3d', 'vender', 'ensenar', 'contar', 'inspirar']
/** Los que salen añadidos la primera vez (para que el usuario los vea sin buscar). */
const DE_ENTRADA = ['plastilina', 'neon', 'inflado']

const carpetaRecorte = (): string => rutaScriptPython('estilos')
export const carpetaEstilosUsuario = (): string => join(app.getPath('userData'), 'estilos-catalogo')
const archivoAnadidos = (): string => join(app.getPath('userData'), 'estilos-anadidos.json')

interface Ficha {
  id: string
  carpeta: string
  origen: EstiloCatalogo['origen']
  campos: Record<string, string>
  cuerpo: string
}

function leerFicha(carpeta: string, id: string, origen: Ficha['origen']): Ficha | null {
  try {
    const texto = readFileSync(join(carpeta, 'ESTILO.md'), 'utf8')
    const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texto)
    if (!m) return null
    const campos: Record<string, string> = {}
    for (const linea of m[1].split(/\r?\n/)) {
      const c = /^(\w+):\s*(.*)$/.exec(linea.trim())
      if (c) campos[c[1].toLowerCase()] = c[2].trim().replace(/^["']|["']$/g, '')
    }
    if (!campos.nombre) return null
    return { id, carpeta, origen, campos, cuerpo: m[2].trim() }
  } catch {
    return null
  }
}

function enCarpeta(base: string, origen: Ficha['origen']): Ficha[] {
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((id) => ID.test(id) && statSync(join(base, id)).isDirectory())
    .map((id) => leerFicha(join(base, id), id, origen))
    .filter((f): f is Ficha => Boolean(f))
}

/** Todos los estilos del catálogo: los de Recorte y los del usuario (los suyos mandan si se llaman igual). */
export function fichasEstilos(): Ficha[] {
  const porId = new Map<string, Ficha>()
  for (const f of enCarpeta(carpetaRecorte(), 'recorte')) porId.set(f.id, f)
  for (const f of enCarpeta(carpetaEstilosUsuario(), 'usuario')) porId.set(f.id, f)
  return [...porId.values()]
}

/** La carpeta de un estilo (para servir su vista previa). */
export function carpetaEstiloCatalogo(id: string): string | null {
  if (!ID.test(id)) return null
  return fichasEstilos().find((f) => f.id === id)?.carpeta ?? null
}

export function leerAnadidos(): string[] {
  try {
    const lista = JSON.parse(readFileSync(archivoAnadidos(), 'utf8')) as unknown
    if (Array.isArray(lista)) return lista.filter((x): x is string => typeof x === 'string' && ID.test(x))
  } catch {
    // La primera vez: unos cuantos para que se vean las tarjetas.
    return DE_ENTRADA.filter((id) => fichasEstilos().some((f) => f.id === id))
  }
  return []
}

function escribirAnadidos(lista: string[]): void {
  guardar(archivoAnadidos(), JSON.stringify([...new Set(lista)], null, 1))
}

/** El id de habilidad de un estilo (para su guía en el trabajo del agente y sus lecciones). */
export const habilidadDeEstilo = (id: string): string => `estilo-${id}`

function guiaDelAgente(f: Ficha): string {
  const hab = habilidadDeEstilo(f.id)
  return `ESTILO ELEGIDO EN SU TARJETA: «${f.campos.nombre}» (${f.campos.para ?? ''}). El video va en este estilo de principio a
fin, aplicado a lo que pide (su tema, su producto, su guion y su material): lo que pida en su mensaje manda sobre la guía.
La guía completa, con lo aprendido en videos anteriores con este estilo, está en \`habilidades/${hab}/HABILIDAD.md\`:
léela antes de planear. Al entregar, pon "${hab}" en "habilidades" de resultado.json y apunta sus lecciones con ese id
(lo que el usuario corrigió del estilo es lo más valioso).

${f.cuerpo}`
}

/** Pasa los estilos del catálogo a los tipos de video (para que estiloPorId los encuentre en todo el proceso). */
export function registrarCatalogo(): void {
  const lista: EstiloVideo[] = fichasEstilos().map((f) => ({
    id: `${PREFIJO_CATALOGO}${f.id}`,
    nombre: f.campos.nombre,
    icono: f.campos.grupo === '3d' ? 'cubo' : 'sparkles',
    descripcion: f.campos.descripcion || f.campos.para || '',
    guia: guiaDelAgente(f),
    grupo: GRUPOS.includes(f.campos.grupo as GrupoEstilo) ? (f.campos.grupo as GrupoEstilo) : 'inspirar',
    // Los 3D guardan su plantilla al salir bien: los siguientes videos con ese estilo se ven igual y tardan menos.
    plantilla: f.campos.grupo === '3d'
  }))
  registrarEstilos(lista)
}

/** El catálogo para la interfaz, con lo añadido primero en su orden. */
export function catalogoEstilos(lecciones: (id: string) => number): EstiloCatalogo[] {
  const anadidos = leerAnadidos()
  const lista = fichasEstilos().map((f): EstiloCatalogo => {
    const c = f.campos
    const colores = (c.colores ?? '').split(',').map((x) => x.trim()).filter((x) => /^#[0-9a-f]{3,8}$/i.test(x))
    return {
      id: f.id,
      nombre: c.nombre,
      grupo: GRUPOS.includes(c.grupo as GrupoEstilo) ? (c.grupo as GrupoEstilo) : 'inspirar',
      etiqueta: c.etiqueta || (f.origen === 'usuario' ? 'MÍO' : (c.grupo ?? '').toUpperCase()),
      para: c.para ?? '',
      descripcion: c.descripcion ?? c.para ?? '',
      vabien: c.vabien ?? '',
      colores: colores.length >= 3 ? colores : ['#1c2116', '#c9f26a', '#7bd88f'],
      origen: f.origen,
      anadido: anadidos.includes(f.id),
      ...(existsSync(join(f.carpeta, 'vista.mp4')) ? { vista: `recorte-media://estilos/${f.id}/vista.mp4` } : {}),
      ...(existsSync(join(f.carpeta, 'vista.jpg')) ? { poster: `recorte-media://estilos/${f.id}/vista.jpg` } : {}),
      lecciones: lecciones(habilidadDeEstilo(f.id))
    }
  })
  const orden = (e: EstiloCatalogo): number => (e.anadido ? anadidos.indexOf(e.id) : 1000 + (e.origen === 'usuario' ? 0 : 1))
  return lista.sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre))
}

export function anadirEstilo(id: string): void {
  if (!carpetaEstiloCatalogo(id)) return
  escribirAnadidos([...leerAnadidos().filter((x) => x !== id), id])
}

export function quitarEstilo(id: string): void {
  escribirAnadidos(leerAnadidos().filter((x) => x !== id))
}

/** Un estilo nuevo del usuario (contado con palabras o pegando un prompt). Queda añadido. Devuelve su id. */
export function crearEstilo(datos: { nombre: string; descripcion: string; grupo?: string }): { id?: string; error?: string } {
  const nombre = datos.nombre.replace(/\s+/g, ' ').trim().slice(0, 60)
  const guia = datos.descripcion.trim().slice(0, 20000)
  if (!nombre) return { error: 'Ponle un nombre.' }
  if (guia.length < 20) return { error: 'Cuéntale al agente cómo es (al menos una frase).' }
  let id = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  if (!ID.test(id)) id = `estilo-${Date.now().toString(36)}`
  const base = id
  for (let n = 2; fichasEstilos().some((f) => f.id === id); n++) id = `${base}-${n}`
  const grupo = GRUPOS.includes(datos.grupo as GrupoEstilo) ? datos.grupo : guia.match(/\b3d\b|three|tres dimensiones/i) ? '3d' : 'inspirar'
  const primera = guia.split(/(?<=[.!?])\s|\n/)[0].replace(/\s+/g, ' ').trim().slice(0, 110)
  const una = (t: string): string => t.replace(/\s+/g, ' ').trim()
  const carpeta = join(carpetaEstilosUsuario(), id)
  mkdirSync(carpeta, { recursive: true })
  guardar(
    join(carpeta, 'ESTILO.md'),
    `---\nnombre: ${una(nombre)}\ngrupo: ${grupo}\netiqueta: MÍO\npara: ${una(primera)}\ndescripcion: ${una(guia.slice(0, 300))}\nvabien: \ncolores: #1c2116,#c9f26a,#7bd88f\ncreado: ${new Date().toISOString().slice(0, 10)}\n---\n\n# ${una(nombre)}\n\nEstilo que contó el usuario, tal cual. Síguelo con las herramientas que mejor lo logren (HyperFrames, Three.js, el kit).\n\n${guia}\n`
  )
  anadirEstilo(id)
  registrarCatalogo()
  return { id }
}

/** Borra un estilo que creó el usuario (los de Recorte no se borran: se quitan). */
export function borrarEstilo(id: string): void {
  if (!ID.test(id)) return
  const carpeta = join(carpetaEstilosUsuario(), id)
  if (existsSync(carpeta)) rmSync(carpeta, { recursive: true, force: true })
  quitarEstilo(id)
  registrarCatalogo()
}
