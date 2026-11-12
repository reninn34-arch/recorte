/**
 * Partir del estilo de un video que ya salió bien: «Otro video así» (desde una creación) y «Mis estilos»
 * (guardado con un nombre para reutilizarlo cuando quieras).
 *
 * Lo que se lleva el video nuevo, en `trabajo/base-estilo/`:
 * - receta.json: la receta del kit de la versión aprobada (letras, colores, entradas, cámara, filtros, música…).
 * - archivos/: lo que esa receta usa (personajes, decorados, utilería, música), con la misma ruta relativa.
 * - notas.md: las notas de trabajo del agente de aquel video (qué midió y decidió).
 * - conversacion.md: lo que el usuario pidió, corrigió y aprobó, y lo que el agente contestó.
 * - estilo.json: la ficha de estilo, si aquel video copiaba una referencia.
 * El agente copia el ESTILO y cuenta lo nuevo (ver `bloqueBase` en modoagente.ts).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { BaseEstilo, Creacion, EstiloPropio } from '../shared/creacion'

/** Lo que se copia de los archivos de la receta: como mucho esto en total (los clips largos pesan mucho). */
const TOPE_ARCHIVOS = 400 * 1024 * 1024
const TOPE_ARCHIVO = 80 * 1024 * 1024
const MEDIO = /\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|mp3|m4a|ogg|ttf|otf)$/i

/** El video de una versión y su receta (si el agente la dejó), relativos a la carpeta de la creación. */
export function archivosVersion(carpeta: string, n: number): { video: string | null; receta: string | null } {
  const salidas = join(carpeta, 'salidas')
  const video = ['mp4', 'png', 'jpg'].map((e) => `agente-v${n}.${e}`).find((x) => existsSync(join(salidas, x)))
  const receta = `agente-v${n}.receta.json`
  return { video: video ? `salidas/${video}` : null, receta: existsSync(join(salidas, receta)) ? `salidas/${receta}` : null }
}

/** La versión de la que se parte: la aprobada, si no la última. */
export function versionBase(c: Creacion): number {
  return c.aprobada && c.aprobada <= c.version ? c.aprobada : c.version
}

/** Las rutas de archivos que usa una receta (cualquier texto que parezca un medio y exista en trabajo/). */
function archivosDeReceta(receta: unknown, trabajo: string): string[] {
  const hallados = new Set<string>()
  const recorrer = (x: unknown): void => {
    if (typeof x === 'string') {
      if (!MEDIO.test(x) || /^[a-z]+:/i.test(x) || x.startsWith('/')) return
      const ruta = resolve(trabajo, x)
      // Solo dentro de trabajo/, y no la narración de aquel video (el nuevo tiene la suya).
      if (!ruta.startsWith(resolve(trabajo) + sep) || /^(voz|salida|revision)[\\/]/.test(x)) return
      if (existsSync(ruta) && statSync(ruta).isFile()) hallados.add(relative(trabajo, ruta))
    } else if (Array.isArray(x)) x.forEach(recorrer)
    else if (x && typeof x === 'object') Object.values(x).forEach(recorrer)
  }
  recorrer(receta)
  return [...hallados]
}

function conversacion(c: Creacion, n: number): string {
  const lineas = [`# La conversación del video «${c.guion?.titulo ?? c.nombre}»`, '', `Pedido original: ${c.peticion}`, '']
  for (const m of c.mensajes) {
    if (!m.texto || m.error) continue
    lineas.push(`- ${m.rol === 'usuario' ? 'Usuario' : 'Agente'}: ${m.texto.replace(/\s+/g, ' ').slice(0, 1200)}`)
  }
  const versiones = (c.versiones ?? []).filter((v) => v.pedido)
  if (versiones.length) {
    lineas.push('', '## Lo que pidió cambiar en cada versión')
    for (const v of versiones) lineas.push(`- v${v.n}: ${v.pedido}`)
  }
  lineas.push('', c.aprobada ? `El usuario aprobó la versión ${c.aprobada} («Así está bien»): esa es la receta de base-estilo/.` : `La receta de base-estilo/ es la de la versión ${n} (la última).`)
  return lineas.join('\n') + '\n'
}

/** Arma la carpeta de estilo de una creación (su versión `n`) en `destino`. Devuelve si encontró su receta. */
export function armarBase(c: Creacion, carpeta: string, n: number, destino: string): boolean {
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  const trabajo = join(carpeta, 'trabajo')
  const { receta } = archivosVersion(carpeta, n)
  const rutaReceta = receta ? join(carpeta, receta) : n === c.version && existsSync(join(trabajo, 'receta.json')) ? join(trabajo, 'receta.json') : null
  let hayReceta = false
  if (rutaReceta) {
    try {
      const datos = JSON.parse(readFileSync(rutaReceta, 'utf8').replace(/^﻿/, '')) as unknown
      writeFileSync(join(destino, 'receta.json'), JSON.stringify(datos, null, 1), 'utf8')
      hayReceta = true
      let total = 0
      for (const rel of archivosDeReceta(datos, trabajo)) {
        const origen = join(trabajo, rel)
        const tam = statSync(origen).size
        if (tam > TOPE_ARCHIVO || total + tam > TOPE_ARCHIVOS) continue
        total += tam
        const a = join(destino, 'archivos', rel)
        mkdirSync(dirname(a), { recursive: true })
        copyFileSync(origen, a)
      }
    } catch {
      // Una receta ilegible: el estilo sigue con las notas y la conversación.
    }
  }
  for (const nombre of ['notas.md']) {
    if (existsSync(join(trabajo, nombre))) copyFileSync(join(trabajo, nombre), join(destino, nombre))
  }
  writeFileSync(join(destino, 'conversacion.md'), conversacion(c, n), 'utf8')
  if (c.ficha) writeFileSync(join(destino, 'estilo.json'), JSON.stringify(c.ficha, null, 1), 'utf8')
  // Una imagen de muestra: un fotograma de esa versión.
  const muestra = ['r2', 'r1', 'r0'].map((r) => join(carpeta, 'salidas', `agente-v${n}-${r}.jpg`)).find((x) => existsSync(x))
  if (muestra) copyFileSync(muestra, join(destino, 'muestra.jpg'))
  return hayReceta
}

export class EstilosPropios {
  private readonly carpeta: string

  constructor(carpeta: string) {
    this.carpeta = carpeta
    mkdirSync(carpeta, { recursive: true })
  }

  dir(id: string): string {
    if (!/^[\w-]{1,80}$/.test(id)) throw new Error('Estilo inválido.')
    return join(this.carpeta, id)
  }

  listar(): EstiloPropio[] {
    const lista: EstiloPropio[] = []
    for (const id of existsSync(this.carpeta) ? readdirSync(this.carpeta) : []) {
      try {
        const meta = JSON.parse(readFileSync(join(this.carpeta, id, 'meta.json'), 'utf8')) as EstiloPropio
        lista.push({ ...meta, id, muestra: existsSync(join(this.carpeta, id, 'muestra.jpg')) })
      } catch {
        // Una carpeta sin meta.json no es un estilo.
      }
    }
    return lista.sort((a, b) => b.creado - a.creado)
  }

  /** Guarda el estilo de la versión `n` de una creación con un nombre. */
  guardar(c: Creacion, carpeta: string, n: number, nombre: string): EstiloPropio {
    const limpio = nombre.replace(/\s+/g, ' ').trim().slice(0, 60) || c.guion?.titulo || c.nombre
    const base = limpio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'estilo'
    let id = base
    for (let i = 2; existsSync(join(this.carpeta, id)); i++) id = `${base}-${i}`
    const destino = join(this.carpeta, id)
    armarBase(c, carpeta, n, destino)
    const meta: EstiloPropio = {
      id,
      nombre: limpio,
      descripcion: (c.guion?.titulo ?? c.peticion).replace(/\s+/g, ' ').slice(0, 140),
      formato: c.formato,
      estilo: c.estilo,
      creado: Date.now(),
      desde: { creacion: c.id, version: n }
    }
    writeFileSync(join(destino, 'meta.json'), JSON.stringify(meta, null, 1), 'utf8')
    return { ...meta, muestra: existsSync(join(destino, 'muestra.jpg')) }
  }

  borrar(id: string): void {
    rmSync(this.dir(id), { recursive: true, force: true })
  }

  /** Copia un estilo guardado a la carpeta de trabajo de un video nuevo. */
  copiarA(id: string, destino: string): EstiloPropio {
    const meta = this.listar().find((e) => e.id === id)
    if (!meta) throw new Error('Ese estilo ya no existe.')
    rmSync(destino, { recursive: true, force: true })
    cpSync(this.dir(id), destino, { recursive: true })
    return meta
  }
}

/** Lo que el video nuevo apunta de su estilo de partida. */
export function baseDe(meta: { nombre: string }, origen: BaseEstilo['origen'], id: string, version?: number): BaseEstilo {
  return { nombre: meta.nombre, origen, id, ...(version ? { version } : {}) }
}
