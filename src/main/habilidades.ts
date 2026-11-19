import { app } from 'electron'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { guardar } from './disco'
import { rutaScriptPython } from './transcribir'

/**
 * Las habilidades del agente, como las skills de Claude Code: cada una es una carpeta con `HABILIDAD.md` (arriba,
 * entre `---`, su `nombre` y `cuando`: en qué pedidos usarla; debajo, cómo hacerlo). El agente ve la lista en su
 * manual y lee entera la que encaja con la tarea. Hay dos sitios:
 * - las que trae Recorte (`python/habilidades/`), que se actualizan con la app;
 * - las del usuario (`<datos de Recorte>/habilidades/`): las que él pone y las que el agente crea. Una con el mismo
 *   nombre que una de Recorte la reemplaza.
 * Y aprende: al entregar, el agente deja en `resultado.json` lo que funcionó, lo que falló y lo que el usuario le
 * corrigió (`lecciones`); se guarda en `aprendido.md` de esa habilidad, en la carpeta del usuario, y la próxima vez
 * lo lee con ella. Si descubre una forma de hacer algo que se repite, la guarda como habilidad nueva.
 */

export interface Habilidad {
  id: string
  nombre: string
  cuando: string
  /** De dónde sale: de Recorte o del usuario (puesta por él o creada por el agente). */
  origen: 'recorte' | 'usuario'
  carpeta: string
  /** Cuántas lecciones lleva aprendidas. */
  lecciones: number
}

export interface LeccionEntregada {
  habilidad: string
  leccion: string
}

export interface HabilidadNueva {
  id: string
  nombre: string
  cuando: string
  cuerpo: string
}

/** Como mucho tantas lecciones por habilidad: las más viejas salen (lo que se repite sube). */
export const MAX_LECCIONES = 40
const ID = /^[a-z0-9][a-z0-9-]{1,48}$/

export const carpetaHabilidadesUsuario = (): string => join(app.getPath('userData'), 'habilidades')
const carpetaHabilidadesRecorte = (): string => rutaScriptPython('habilidades')

/** Lee la cabecera `---` de un HABILIDAD.md. */
export function leerCabecera(texto: string): { nombre?: string; cuando?: string; cuerpo: string } {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texto)
  if (!m) return { cuerpo: texto }
  const campos: Record<string, string> = {}
  for (const linea of m[1].split(/\r?\n/)) {
    const c = /^(\w+):\s*(.*)$/.exec(linea.trim())
    if (c) campos[c[1].toLowerCase()] = c[2].trim().replace(/^["']|["']$/g, '')
  }
  // También las skills de Claude Code tal cual (SKILL.md con name y description).
  return { nombre: campos.nombre ?? campos.name, cuando: campos.cuando ?? campos.descripcion ?? campos.description, cuerpo: m[2] }
}

/** El archivo de una habilidad: HABILIDAD.md, o SKILL.md si es una skill traída de Claude Code. */
export function archivoHabilidad(carpeta: string): string | null {
  for (const n of ['HABILIDAD.md', 'SKILL.md']) if (existsSync(join(carpeta, n))) return join(carpeta, n)
  return null
}

function leerHabilidad(carpeta: string, id: string, origen: Habilidad['origen']): Habilidad | null {
  try {
    const archivo = archivoHabilidad(carpeta)
    if (!archivo) return null
    const { nombre, cuando } = leerCabecera(readFileSync(archivo, 'utf8'))
    if (!cuando) return null
    return { id, nombre: nombre || id, cuando, origen, carpeta, lecciones: leerLecciones(id).length }
  } catch {
    return null
  }
}

function enCarpeta(base: string, origen: Habilidad['origen']): Habilidad[] {
  if (!existsSync(base)) return []
  return readdirSync(base)
    .filter((id) => ID.test(id) && statSync(join(base, id)).isDirectory())
    .map((id) => leerHabilidad(join(base, id), id, origen))
    .filter((h): h is Habilidad => Boolean(h))
}

/** Todas las habilidades: las de Recorte y las del usuario (las suyas mandan si se llaman igual). */
export function listarHabilidades(): Habilidad[] {
  const porId = new Map<string, Habilidad>()
  for (const h of enCarpeta(carpetaHabilidadesRecorte(), 'recorte')) porId.set(h.id, h)
  for (const h of enCarpeta(carpetaHabilidadesUsuario(), 'usuario')) porId.set(h.id, h)
  return [...porId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

const rutaAprendido = (id: string): string => join(carpetaHabilidadesUsuario(), id, 'aprendido.md')

/** Las lecciones de una habilidad, de la más vieja a la más nueva. */
export function leerLecciones(id: string): string[] {
  try {
    return readFileSync(rutaAprendido(id), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const comparable = (t: string): string =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\(\d{4}-\d{2}-\d{2}\)\s*/, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Guarda lo que aprendió el agente. Una lección que ya estaba no se repite: sube al final (es de las que valen).
 * Devuelve cuántas guardó de verdad.
 */
export function guardarLecciones(lecciones: LeccionEntregada[], conocidas = new Set(listarHabilidades().map((h) => h.id))): number {
  let nuevas = 0
  const porHabilidad = new Map<string, string[]>()
  for (const l of lecciones) {
    if (!conocidas.has(l.habilidad) || !l.leccion.trim()) continue
    porHabilidad.set(l.habilidad, [...(porHabilidad.get(l.habilidad) ?? []), l.leccion.trim().replace(/\s+/g, ' ').slice(0, 400)])
  }
  const hoy = new Date().toISOString().slice(0, 10)
  for (const [id, lista] of porHabilidad) {
    let todas = leerLecciones(id)
    for (const leccion of lista) {
      const clave = comparable(leccion)
      const antes = todas.length
      todas = todas.filter((t) => comparable(t) !== clave)
      if (todas.length === antes) nuevas++
      todas.push(`(${hoy}) ${leccion}`)
    }
    escribirAprendido(id, todas.slice(-MAX_LECCIONES))
  }
  return nuevas
}

function escribirAprendido(id: string, lecciones: string[]): void {
  mkdirSync(join(carpetaHabilidadesUsuario(), id), { recursive: true })
  guardar(
    rutaAprendido(id),
    `# Lo aprendido usando «${id}»\n\nLo anota el agente al entregar (lo que funcionó, lo que falló y lo que el usuario corrigió). ` +
      `Puedes borrar o cambiar lo que no te sirva.\n\n${lecciones.map((t) => `- ${t}`).join('\n')}\n`
  )
}

/** Guarda una habilidad que creó el agente (si no existe ya una con ese nombre). Devuelve su id o null. */
export function guardarHabilidadNueva(h: HabilidadNueva): string | null {
  const id = h.id.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  if (!ID.test(id) || !h.cuando.trim() || h.cuerpo.trim().length < 40) return null
  if (listarHabilidades().some((x) => x.id === id)) return null
  const una = (t: string): string => t.replace(/\s+/g, ' ').trim()
  mkdirSync(join(carpetaHabilidadesUsuario(), id), { recursive: true })
  guardar(
    join(carpetaHabilidadesUsuario(), id, 'HABILIDAD.md'),
    `---\nnombre: ${una(h.nombre || id)}\ncuando: ${una(h.cuando)}\ncreada: por el agente, ${new Date().toISOString().slice(0, 10)}\n---\n\n${h.cuerpo.trim()}\n`
  )
  return id
}

/**
 * Copia las habilidades a `trabajo/habilidades/<id>/` (con lo aprendido al final de cada una) y devuelve la sección
 * del manual que las presenta. Sin habilidades, vacío.
 */
export function prepararHabilidades(trabajo: string): string {
  const lista = listarHabilidades()
  if (!lista.length) return ''
  for (const h of lista) {
    const destino = join(trabajo, 'habilidades', h.id)
    mkdirSync(destino, { recursive: true })
    let texto = readFileSync(archivoHabilidad(h.carpeta)!, 'utf8')
    const aprendido = leerLecciones(h.id)
    if (aprendido.length) {
      texto += `\n\n## Lo aprendido en usos anteriores (gustos del usuario y cosas que funcionaron o fallaron; lo que pida hoy manda sobre esto)\n${aprendido
        .map((t) => `- ${t}`)
        .join('\n')}\n`
    }
    guardar(join(destino, 'HABILIDAD.md'), texto)
    // Lo que traiga además (ejemplos, plantillas), tal cual.
    for (const n of readdirSync(h.carpeta)) {
      if (n === 'HABILIDAD.md' || n === 'SKILL.md' || n === 'aprendido.md') continue
      const ruta = join(h.carpeta, n)
      if (statSync(ruta).isFile() && statSync(ruta).size < 5 * 1024 * 1024) copyFileSync(ruta, join(destino, n))
    }
  }
  return `## Tus habilidades (úsalas según la tarea)
Son formas probadas de hacer algo, como el oficio de un editor con experiencia. Cada una está en
\`habilidades/<id>/HABILIDAD.md\`. Si el pedido encaja con su «cuándo», **léela entera antes de planear**: es tu punto
de partida, no una jaula. Puedes usar varias, saltarte un paso que no venga al caso, o ir más allá con cualquier otra
herramienta si el video lo pide. Si ninguna encaja, sigue sin ellas.

**Lo que manda, en este orden:**
1. Lo que el usuario pide AHORA (su mensaje). Si choca con una habilidad o con algo aprendido, gana el pedido: hazlo
   como lo pide y no lo discutas.
2. Lo aprendido al final de cada habilidad: gustos del usuario que se repitieron. Aplícalo cuando el pedido no diga
   otra cosa; si uno ya no encaja con lo que pide hoy, ignóralo para este video.
3. Los pasos de la habilidad.

No hagas todos los videos con la misma fórmula: la habilidad te dice cómo trabajar, no cómo tiene que verse el video.
${lista.map((h) => `- \`${h.id}\` — ${h.nombre}: ${h.cuando}${h.lecciones ? ` (${h.lecciones} ${h.lecciones === 1 ? 'lección aprendida' : 'lecciones aprendidas'})` : ''}`).join('\n')}

**Aprende al entregar.** En \`resultado.json\` añade:
- \`"habilidades": ["id", …]\`: las que usaste.
- \`"lecciones": [{"habilidad": "id", "leccion": "…"}]\`: lo que la próxima vez te ahorraría tiempo o un error con esa
  habilidad: lo que el usuario corrigió o pidió de otra forma (lo más valioso), lo que falló y cómo lo resolviste, lo
  que funcionó mejor de lo esperado. Una frase concreta cada una («los subtítulos de este usuario van en mayúsculas y
  amarillos», «con referencias de TikTok el corte cae cada 0,8 s: no alargar tomas»), no un resumen del video.
  **Solo lo que valga para otros videos**: «aquí sin música» o «quita la toma 3» son de este video y NO se apuntan;
  «no le gusta la música bajo la voz» sí. Si dudas, no lo apuntes. Si no aprendiste nada nuevo, déjala vacía.
- \`"habilidad_nueva": {"id": "en-minusculas-con-guiones", "nombre": "…", "cuando": "en qué pedidos usarla", "cuerpo":
  "cómo hacerlo, paso a paso, en markdown"}\`: solo si descubriste una forma de hacer algo que se va a repetir y que
  ninguna habilidad cubre (como mucho una por video). Se guarda para los siguientes videos.

`
}

/** Para Ajustes: cada habilidad con lo que aprendió. */
export function habilidadesConLecciones(): (Habilidad & { aprendido: string[] })[] {
  return listarHabilidades().map((h) => ({ ...h, aprendido: leerLecciones(h.id) }))
}

/** Olvida una lección (por su texto tal cual sale en la lista). */
export function olvidarLeccion(id: string, leccion: string): void {
  if (!ID.test(id)) return
  escribirAprendido(id, leerLecciones(id).filter((t) => t !== leccion))
}

/**
 * Añade una habilidad del usuario desde un archivo .md (HABILIDAD.md, SKILL.md o cualquier .md con su cabecera) o una
 * carpeta que tenga uno. Devuelve su id, o un error que se puede enseñar.
 */
export function anadirHabilidad(ruta: string): { id?: string; error?: string } {
  const esCarpeta = existsSync(ruta) && statSync(ruta).isDirectory()
  const archivo = esCarpeta ? archivoHabilidad(ruta) : extname(ruta).toLowerCase() === '.md' ? ruta : null
  if (!archivo) return { error: 'Elige un archivo .md o una carpeta con HABILIDAD.md (o SKILL.md).' }
  const { nombre, cuando } = leerCabecera(readFileSync(archivo, 'utf8'))
  if (!cuando) {
    return { error: 'Le falta la cabecera: arriba, entre dos líneas «---», «nombre:» y «cuando:» (en qué pedidos usarla).' }
  }
  // El nombre de la carpeta o del archivo; si el archivo se llama HABILIDAD.md o SKILL.md, el de su carpeta.
  const base = esCarpeta
    ? basename(ruta)
    : /^(habilidad|skill)\.md$/i.test(basename(archivo))
      ? basename(dirname(archivo))
      : basename(archivo, extname(archivo))
  const id = (base || nombre || 'habilidad')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  if (!ID.test(id)) return { error: 'No pude sacarle un nombre válido: renombra el archivo (letras y guiones).' }
  const destino = join(carpetaHabilidadesUsuario(), id)
  mkdirSync(destino, { recursive: true })
  if (esCarpeta) cpSync(ruta, destino, { recursive: true, filter: (o) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(o) })
  else copyFileSync(archivo, join(destino, 'HABILIDAD.md'))
  return { id }
}
