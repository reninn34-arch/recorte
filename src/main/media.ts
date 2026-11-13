import { protocol } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import type { Creaciones } from './creaciones'
import type { Proyectos } from './proyectos'

const TIPOS: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.srt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.json': 'application/json; charset=utf-8'
}

/**
 * Sirve los archivos del proyecto a la interfaz con `recorte-media://<id>/<archivo>`.
 * `fuente` es el video original; el resto, archivos dentro de la carpeta del proyecto.
 * Soporta rangos para que el reproductor pueda adelantar y atrasar.
 */
export function registrarMedia(proyectos: Proyectos, creaciones: Creaciones, carpetaMuestras?: string): void {
  protocol.handle('recorte-media', async (request) => {
    const url = new URL(request.url)
    const id = url.hostname
    const relativo = decodeURIComponent(url.pathname.replace(/^\//, ''))

    // `medio/<id>`: un video o una imagen de la biblioteca del proyecto (su archivo original).
    if (relativo.startsWith('medio/')) {
      const proyecto = proyectos.get(id)
      const medio = proyecto?.medios?.find((m) => m.id === relativo.slice(6))
      if (!medio) return new Response('No encontrado', { status: 404 })
      return servirArchivo(medio.ruta, request)
    }

    // `muestras/<voz>.wav`: la muestra de una voz de Gemini, para oírla antes de elegirla.
    if (id === 'muestras' && carpetaMuestras) {
      if (!/^[\w-]{1,40}\.wav$/.test(relativo)) return new Response('Prohibido', { status: 403 })
      return servirArchivo(join(carpetaMuestras, relativo), request)
    }

    if (relativo === 'fuente') {
      const proyecto = proyectos.get(id)
      if (!proyecto) return new Response('No encontrado', { status: 404 })
      return servirArchivo(proyecto.source.path, request)
    }

    // `c-<id>` es una creación con IA; lo demás, un proyecto del editor.
    const carpeta = (() => {
      try {
        if (id.startsWith('c-')) return resolve(creaciones.carpeta(id.slice(2)))
        return resolve(proyectos.carpeta(id))
      } catch {
        return null
      }
    })()
    if (!carpeta) return new Response('Proyecto inválido', { status: 400 })

    const archivo = resolve(carpeta, relativo)
    if (!archivo.startsWith(carpeta + sep)) return new Response('Prohibido', { status: 403 })
    return servirArchivo(archivo, request)
  })
}

/**
 * La propia interfaz puede leer el sonido de sus medios (los medidores del mezclador lo copian con `captureStream`, que
 * exige que el medio no sea de otro origen). Solo la app pide a este esquema.
 */
const CORS = { 'Access-Control-Allow-Origin': '*' }

function servirArchivo(archivo: string, request: Request): Response {
  let tamano: number
  try {
    const info = statSync(archivo)
    if (!info.isFile()) return new Response('No encontrado', { status: 404 })
    tamano = info.size
  } catch {
    return new Response('No encontrado', { status: 404 })
  }

  const tipo = TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream'
  const rango = request.headers.get('range')

  if (rango) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rango)
    if (m) {
      let inicio = m[1] ? Number(m[1]) : 0
      let fin = m[2] ? Math.min(Number(m[2]), tamano - 1) : tamano - 1
      if (!m[1] && m[2]) {
        inicio = Math.max(0, tamano - Number(m[2]))
        fin = tamano - 1
      }
      if (inicio <= fin && inicio < tamano) {
        return new Response(Readable.toWeb(createReadStream(archivo, { start: inicio, end: fin })) as unknown as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': tipo,
            'Content-Length': String(fin - inicio + 1),
            'Content-Range': `bytes ${inicio}-${fin}/${tamano}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
            ...CORS
          }
        })
      }
      return new Response('Rango inválido', {
        status: 416,
        headers: { 'Content-Range': `bytes */${tamano}` }
      })
    }
  }

  return new Response(Readable.toWeb(createReadStream(archivo)) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(tamano),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      ...CORS
    }
  })
}
