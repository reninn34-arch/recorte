import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

/**
 * Un servidor MCP mínimo (transporte «Streamable HTTP», respuestas en JSON) para que un agente
 * de fuera (Claude Code, Claude en el escritorio, Codex…) maneje Recorte. Solo escucha en
 * 127.0.0.1 y pide la contraseña que Recorte genera (cabecera `Authorization: Bearer …`).
 * Sin dependencias: JSON-RPC 2.0 a mano, con lo que el protocolo pide para herramientas.
 */

export interface ResultadoHerramienta {
  texto: string
  /** Una imagen PNG o JPG para que el agente la vea (base64). */
  imagen?: { datos: string; tipo: 'image/png' | 'image/jpeg' }
  error?: boolean
}

export interface HerramientaMcp {
  nombre: string
  descripcion: string
  /** JSON Schema de los argumentos. */
  esquema: Record<string, unknown>
  /** No cambia nada (para que el cliente lo sepa). */
  soloLee?: boolean
  correr: (args: Record<string, unknown>, sesion: SesionMcp) => Promise<ResultadoHerramienta>
}

export interface SesionMcp {
  id: string
  /** Quién se conectó (`clientInfo.name`): «claude-code», «codex»… */
  cliente: string
}

const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_CUERPO = 4 * 1024 * 1024

export class ServidorMcp {
  private server: Server | null = null
  private sesiones = new Map<string, SesionMcp>()
  puerto = 0
  private herramientas: HerramientaMcp[]
  private token: string
  private info: { nombre: string; version: string; instrucciones: string }

  constructor(herramientas: HerramientaMcp[], token: string, info: { nombre: string; version: string; instrucciones: string }) {
    this.herramientas = herramientas
    this.token = token
    this.info = info
  }

  /** Escucha en `puerto` (o en el siguiente libre, hasta 20 más). Devuelve el puerto usado. */
  async iniciar(puerto: number): Promise<number> {
    for (let p = puerto; p < puerto + 20; p++) {
      try {
        await this.escuchar(p)
        this.puerto = p
        return p
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error('No hay un puerto libre para el servidor MCP.')
  }

  detener(): void {
    this.server?.close()
    this.server = null
  }

  private escuchar(puerto: number): Promise<void> {
    return new Promise((ok, mal) => {
      const server = createServer((req, res) => void this.atender(req, res))
      server.once('error', mal)
      server.listen(puerto, '127.0.0.1', () => {
        server.off('error', mal)
        this.server = server
        ok()
      })
    })
  }

  private autorizado(req: IncomingMessage): boolean {
    const dado = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]?.trim() ?? ''
    const a = Buffer.from(dado)
    const b = Buffer.from(this.token)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Contra el «DNS rebinding»: solo se aceptan nombres locales, y ninguna página web.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return responder(res, 403, { error: 'Host no permitido' })
    const origen = req.headers.origin
    if (origen && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origen)) return responder(res, 403, { error: 'Origen no permitido' })
    const ruta = (req.url ?? '/').split('?')[0]
    if (ruta !== '/mcp') return responder(res, 404, { error: 'Usa /mcp' })
    if (!this.autorizado(req)) return responder(res, 401, { error: 'Falta la contraseña de Recorte (Authorization: Bearer …)' })
    if (req.method === 'DELETE') {
      const sid = req.headers['mcp-session-id']
      if (typeof sid === 'string') this.sesiones.delete(sid)
      return responder(res, 200, {})
    }
    // Sin flujo de eventos (SSE): el servidor responde cada llamada en JSON.
    if (req.method !== 'POST') return responder(res, 405, { error: 'Solo POST' })

    let cuerpo: unknown
    try {
      cuerpo = JSON.parse(await leer(req))
    } catch {
      return responder(res, 400, rpcError(null, -32700, 'JSON inválido'))
    }
    const lote = Array.isArray(cuerpo)
    const mensajes = (lote ? cuerpo : [cuerpo]) as Record<string, unknown>[]
    const sidDado = req.headers['mcp-session-id']
    let sesion = typeof sidDado === 'string' ? this.sesiones.get(sidDado) : undefined
    const cabeceras: Record<string, string> = {}

    const respuestas: unknown[] = []
    for (const m of mensajes) {
      if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
        // Respuestas del cliente a algo nuestro: no pedimos nada, se ignoran.
        continue
      }
      const id = m.id as string | number | undefined
      const params = (m.params ?? {}) as Record<string, unknown>
      if (m.method === 'initialize') {
        const cliente = ((params.clientInfo as { name?: unknown } | undefined)?.name as string) || 'agente'
        sesion = { id: randomUUID(), cliente: String(cliente).slice(0, 60) }
        this.sesiones.set(sesion.id, sesion)
        cabeceras['Mcp-Session-Id'] = sesion.id
        const pedida = typeof params.protocolVersion === 'string' ? params.protocolVersion : VERSIONES[0]
        respuestas.push(
          rpcOk(id, {
            protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: this.info.nombre, version: this.info.version },
            instructions: this.info.instrucciones
          })
        )
        continue
      }
      if (id === undefined) continue // una notificación (initialized, cancelled…)
      if (!sesion) sesion = { id: 'sin-sesion', cliente: 'agente' }
      if (m.method === 'ping') respuestas.push(rpcOk(id, {}))
      else if (m.method === 'tools/list') {
        respuestas.push(
          rpcOk(id, {
            tools: this.herramientas.map((h) => ({
              name: h.nombre,
              description: h.descripcion,
              inputSchema: h.esquema,
              ...(h.soloLee ? { annotations: { readOnlyHint: true } } : {})
            }))
          })
        )
      } else if (m.method === 'tools/call') {
        const h = this.herramientas.find((x) => x.nombre === params.name)
        if (!h) {
          respuestas.push(rpcError(id, -32602, `No existe la herramienta «${String(params.name)}».`))
          continue
        }
        let r: ResultadoHerramienta
        try {
          r = await h.correr((params.arguments ?? {}) as Record<string, unknown>, sesion)
        } catch (error) {
          r = { texto: error instanceof Error ? error.message : String(error), error: true }
        }
        respuestas.push(
          rpcOk(id, {
            content: [
              { type: 'text', text: r.texto },
              ...(r.imagen ? [{ type: 'image', data: r.imagen.datos, mimeType: r.imagen.tipo }] : [])
            ],
            ...(r.error ? { isError: true } : {})
          })
        )
      } else respuestas.push(rpcError(id, -32601, `Método no disponible: ${m.method}`))
    }
    if (respuestas.length === 0) return responder(res, 202, null, cabeceras)
    responder(res, 200, lote ? respuestas : respuestas[0], cabeceras)
  }
}

/** Una contraseña nueva para el servidor. */
export function nuevaContrasena(): string {
  return randomBytes(24).toString('base64url')
}

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function responder(res: ServerResponse, estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}): void {
  res.writeHead(estado, { ...(cuerpo === null ? {} : { 'Content-Type': 'application/json' }), ...cabeceras })
  res.end(cuerpo === null ? undefined : JSON.stringify(cuerpo))
}

function leer(req: IncomingMessage): Promise<string> {
  return new Promise((ok, mal) => {
    let tam = 0
    const partes: Buffer[] = []
    req.on('data', (b: Buffer) => {
      tam += b.length
      if (tam > MAX_CUERPO) {
        mal(new Error('Demasiado grande'))
        req.destroy()
      } else partes.push(b)
    })
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')))
    req.on('error', mal)
  })
}
