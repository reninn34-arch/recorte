import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * La carpeta donde quedan los videos terminados del usuario (exportaciones y videos creados
 * con IA), una subcarpeta por proyecto. Por defecto `Videos\Recorte`; se elige en Inicio la
 * primera vez o en Ajustes. Los datos internos (proxys, transcripciones) siguen en userData.
 */

export const carpetaPorDefecto = () => join(app.getPath('videos'), 'Recorte')

/** Un nombre de carpeta o archivo válido en Windows, legible. */
export function nombreArchivo(texto: string, respaldo = 'video'): string {
  const limpio = texto
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  return limpio || respaldo
}

/** La subcarpeta del proyecto dentro de la carpeta de videos (la crea). */
export function carpetaDelProyecto(base: string, nombre: string): string {
  const ruta = join(base, nombreArchivo(nombre, 'Proyecto'))
  mkdirSync(ruta, { recursive: true })
  return ruta
}

/** Una ruta libre: si ya existe, «nombre (2).mp4», «nombre (3).mp4»… */
export function rutaLibre(carpeta: string, nombre: string): string {
  const ext = extname(nombre)
  const base = nombre.slice(0, nombre.length - ext.length)
  let ruta = join(carpeta, nombre)
  for (let i = 2; existsSync(ruta); i++) ruta = join(carpeta, `${base} (${i})${ext}`)
  return ruta
}

/** Copia un video terminado a la carpeta del usuario. Devuelve dónde quedó. */
export function copiarAVideos(base: string, proyecto: string, origen: string, nombre: string): string {
  const destino = rutaLibre(carpetaDelProyecto(base, proyecto), nombreArchivo(nombre))
  copyFileSync(origen, destino)
  return destino
}
