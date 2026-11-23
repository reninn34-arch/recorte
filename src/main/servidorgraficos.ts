import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { isAbsolute, resolve, sep } from 'node:path'
import { ANCHO_DISENO, normalizarGrafico, type Grafico } from '../shared/grafico'

/**
 * El kit del agente (Python) no tiene Chromium: para sus gráficos editables (`python kit/kit.py grafico …`) le pide el
 * dibujo a Recorte por aquí. Escucha solo en 127.0.0.1, con una contraseña propia (no la del servidor MCP) que Recorte
 * deja en `kit/rutas.json` de cada creación, y solo dibuja dentro de la carpeta de creaciones. No hace nada más.
 */

let datos: { url: string; token: string } | null = null
let servidor: Server | null = null

/** Dónde pedir un dibujo (para `rutas.json` del kit), o null si no está andando. */
export function datosServidorGraficos(): { url: string; token: string } | null {
  return datos
}

type Dibujar = (g: Grafico, opciones: { base: string; salida: string; escala: number }) => Promise<{ ancho: number; alto: number }>

const dentroDe = (raiz: string, ruta: string): boolean => {
  const r = resolve(raiz)
  return resolve(ruta).startsWith(r + sep)
}

function leer(req: IncomingMessage): Promise<string> {
  return new Promise((ok, mal) => {
    let cuerpo = ''
    req.setEncoding('utf8')
    req.on('data', (c: string) => {
      cuerpo += c
      if (cuerpo.length > 1_000_000) {
        mal(new Error('Demasiado grande'))
        req.destroy()
      }
    })
    req.on('end', () => ok(cuerpo))
    req.on('error', mal)
  })
}

export function servirGraficos(raiz: string, dibujar: Dibujar): Promise<void> {
  if (servidor) return Promise.resolve()
  const token = randomBytes(24).toString('hex')
  const responder = (res: import('node:http').ServerResponse, codigo: number, cuerpo: unknown) => {
    res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(cuerpo))
  }
  const s = createServer(async (req, res) => {
    try {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (!['127.0.0.1', 'localhost'].includes(host) || req.headers.origin) return responder(res, 403, { error: 'No permitido' })
      if (req.method !== 'POST' || (req.url ?? '').split('?')[0] !== '/grafico') return responder(res, 404, { error: 'Usa POST /grafico' })
      const dado = Buffer.from(/^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]?.trim() ?? '')
      const esperado = Buffer.from(token)
      if (dado.length !== esperado.length || !timingSafeEqual(dado, esperado)) return responder(res, 401, { error: 'Contraseña incorrecta' })
      const pedido = JSON.parse(await leer(req)) as { grafico?: unknown; salida?: unknown; base?: unknown; ancho_video?: unknown }
      const grafico = normalizarGrafico(pedido.grafico)
      if (!grafico) return responder(res, 400, { error: 'El gráfico no lleva nada que se vea (ni un texto ni una imagen).' })
      const base = typeof pedido.base === 'string' && isAbsolute(pedido.base) ? pedido.base : ''
      const salida = typeof pedido.salida === 'string' && isAbsolute(pedido.salida) ? pedido.salida : ''
      if (!base || !salida || !dentroDe(raiz, base) || !dentroDe(base, salida) || !/\.png$/i.test(salida)) {
        return responder(res, 400, { error: 'La salida tiene que ser un .png dentro de la carpeta de trabajo de la creación.' })
      }
      const anchoVideo = typeof pedido.ancho_video === 'number' && pedido.ancho_video >= 100 && pedido.ancho_video <= 8000 ? pedido.ancho_video : ANCHO_DISENO
      const d = await dibujar(grafico, { base, salida, escala: anchoVideo / ANCHO_DISENO })
      return responder(res, 200, { ancho: d.ancho, alto: d.alto, ancho_capa: Math.round((d.ancho / anchoVideo) * 1000) / 1000, grafico })
    } catch (e) {
      return responder(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
  })
  return new Promise((ok, mal) => {
    s.once('error', mal)
    s.listen(0, '127.0.0.1', () => {
      s.off('error', mal)
      const dir = s.address()
      if (dir && typeof dir === 'object') datos = { url: `http://127.0.0.1:${dir.port}/grafico`, token }
      servidor = s
      ok()
    })
  })
}
