import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { EstadoMcp } from '../shared/api'
import { correr } from './agentes'
import { resolverBinario } from './binarios'
import { guardar } from './disco'
import { nuevaContrasena, ServidorMcp } from './mcp'
import { herramientasRecorte, INSTRUCCIONES_MCP, type ContextoMcp } from './mcprecorte'

/** Si Claude Code ya tiene a Recorte registrado (para todos sus proyectos) con esta dirección y contraseña. */
function claudeConectado(url: string, contrasena: string): boolean {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8')) as { mcpServers?: Record<string, { url?: string; headers?: Record<string, string> }> }
    const s = cfg.mcpServers?.[NOMBRE]
    return s?.url === url && s.headers?.Authorization === `Bearer ${contrasena}`
  } catch {
    return false
  }
}

/** El puerto de siempre (si está ocupado, el siguiente libre). */
const PUERTO = 47110
const NOMBRE = 'recorte'

interface ConfigMcp {
  contrasena: string
  puerto: number
}

/**
 * El servidor MCP de Recorte mientras la app está abierta: su contraseña vive en
 * `userData/mcp.json` (se genera sola) y el botón de Ajustes lo registra en Claude Code.
 */
export function iniciarMcpRecorte(ctx: ContextoMcp) {
  const archivo = join(app.getPath('userData'), 'mcp.json')
  let config: ConfigMcp = { contrasena: nuevaContrasena(), puerto: PUERTO }
  try {
    if (existsSync(archivo)) {
      const leido = JSON.parse(readFileSync(archivo, 'utf8')) as Partial<ConfigMcp>
      if (typeof leido.contrasena === 'string' && leido.contrasena.length >= 24) config.contrasena = leido.contrasena
      if (typeof leido.puerto === 'number') config.puerto = leido.puerto
    }
  } catch {
    // Un mcp.json roto se rehace.
  }
  let servidor: ServidorMcp | null = null
  let error: string | undefined

  const arrancar = async () => {
    servidor?.detener()
    servidor = new ServidorMcp(herramientasRecorte(ctx), config.contrasena, { nombre: NOMBRE, version: app.getVersion(), instrucciones: INSTRUCCIONES_MCP })
    try {
      // Primero el puerto que ya conocen los agentes; si se ocupó, otro (y hay que volver a conectarlos).
      config.puerto = await servidor.iniciar(config.puerto)
      error = undefined
    } catch (e) {
      servidor = null
      error = e instanceof Error ? e.message : String(e)
    }
    guardar(archivo, JSON.stringify(config, null, 2))
  }
  void arrancar()

  const url = () => `http://127.0.0.1:${config.puerto}/mcp`

  return {
    estado(): EstadoMcp {
      return {
        activo: servidor !== null,
        url: url(),
        contrasena: config.contrasena,
        ...(error ? { error } : {}),
        claudeInstalado: resolverBinario('claude') !== null,
        claudeConectado: claudeConectado(url(), config.contrasena),
        // Para otros agentes: lo mismo que se registra en Claude Code.
        configJson: JSON.stringify({ mcpServers: { [NOMBRE]: { type: 'http', url: url(), headers: { Authorization: `Bearer ${config.contrasena}` } } } }, null, 2)
      }
    },
    /** Lo registra en Claude Code para todos los proyectos del usuario (reemplaza el anterior). */
    async conectarClaude(): Promise<{ ok: boolean; error?: string }> {
      if (!servidor) return { ok: false, error: error ?? 'El servidor no está activo.' }
      if (!resolverBinario('claude')) return { ok: false, error: 'Claude Code no está instalado. Conéctalo primero en «Agentes».' }
      await correr(`claude mcp remove ${NOMBRE} -s user`, 30_000)
      const r = await correr(`claude mcp add --scope user --transport http ${NOMBRE} ${url()} --header "Authorization: Bearer ${config.contrasena}"`, 30_000)
      return r.codigo === 0 ? { ok: true } : { ok: false, error: r.salida.trim().slice(-400) || 'Claude Code no lo aceptó.' }
    },
    /** Cambia la contraseña (los agentes conectados tienen que volver a conectarse). */
    async nuevaContrasena(): Promise<EstadoMcp> {
      config.contrasena = nuevaContrasena()
      await arrancar()
      return this.estado()
    }
  }
}
