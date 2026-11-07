import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { matarArbol, Parado } from './ia'

/**
 * Antigravity, el agente de Google, con la cuenta de Google del usuario.
 *
 * Google publica un servidor ACP (Agent Client Protocol: JSON-RPC 2.0, un mensaje
 * por línea, por stdin/stdout). Recorte lo descarga de dl.google.com con su huella
 * sha256, lo instala en su propia carpeta y habla con él:
 *   initialize → authenticate (oauth-personal) → session/new → session/prompt.
 * Al autenticar, el servidor abre él mismo el navegador con la página de Google y
 * espera; si no se abre, Recorte captura el enlace que imprime y lo abre.
 *
 * La sesión de Google vive en `<userData>/antigravity` (GEMINI_HOME), sin tocar
 * el Antigravity o el Gemini CLI que el usuario tenga instalados.
 */

const VERSION = '1.4.1'
/** Los zips que publica Google, con su huella para no correr otra cosa. */
const ZIPS: Record<string, { url: string; sha256: string }> = {
  'win32-x64': { url: `windows/agy-acp-server-${VERSION}-windows-x86_64.zip`, sha256: '5f5b7d0328df17c128b2be338d4567b0d24e56ace8196e88794fec37d1372554' },
  'win32-arm64': { url: `windows/agy-acp-server-${VERSION}-windows-arm64.zip`, sha256: '24c52bbc12aae20f55eb53d373669412d95a9c44fd59be4ea4e355918b91fbf7' },
  'darwin-arm64': { url: `macos/agy-acp-server-${VERSION}-darwin-arm64.zip`, sha256: 'f9bdd68291ae78c38d2141e63bc86b84e6cc7b9f60f71652c68435a7943deb17' },
  'darwin-x64': { url: `macos/agy-acp-server-${VERSION}-darwin-x86_64.zip`, sha256: '27e31f096874704f14167b07ef9e84cc77134615ee41d024f7b1c957add85307' },
  'linux-x64': { url: `linux/agy-acp-server-${VERSION}-linux-x86_64.zip`, sha256: '2e37012ceb2a5c7fc7309b6e6596234fb637ee3c62a5199f65d4cbe777871384' },
  'linux-arm64': { url: `linux/agy-acp-server-${VERSION}-linux-arm64.zip`, sha256: '609336a1c97545487e3ddd55dbd153dc0f40f4e6534486cc1c5f4c0ebb85c2da' }
}

const carpeta = () => join(app.getPath('userData'), 'agentes', 'antigravity')
const datos = () => join(app.getPath('userData'), 'antigravity')
const rutaToken = () => join(datos(), 'antigravity-acp', 'acp_token.json')

export function exeAntigravity(): string | null {
  const exe = join(carpeta(), process.platform === 'win32' ? 'agy_acp_server.exe' : 'agy_acp_server.par')
  return existsSync(exe) ? exe : null
}

export const conectadoAntigravity = () => existsSync(rutaToken())

/** Descarga el servidor ACP de Google y lo deja listo (unos 230 MB). */
export async function instalarAntigravity(): Promise<void> {
  const clave = `${process.platform}-${process.arch}`
  const zip = ZIPS[clave]
  if (!zip) throw new Error(`Antigravity no tiene programa para esta computadora (${clave}).`)
  const res = await fetch(`https://dl.google.com/agy-extensions/releases/${zip.url}`)
  if (!res.ok) throw new Error(`Google respondió ${res.status} al pedir Antigravity.`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== zip.sha256) {
    throw new Error('El archivo descargado no es el que publica Google. Vuelve a intentarlo.')
  }
  const destino = carpeta()
  rmSync(destino, { recursive: true, force: true })
  mkdirSync(destino, { recursive: true })
  const archivo = join(destino, 'antigravity.zip')
  writeFileSync(archivo, bytes)
  try {
    // El tar de Windows y macOS abre zips; en Linux hace falta unzip.
    const comando =
      process.platform === 'linux'
        ? `unzip -o -q "${archivo}" -d "${destino}"`
        : `"${join(process.env.SystemRoot ?? '', 'System32', 'tar.exe')}" -xf "${archivo}" -C "${destino}"`
    await new Promise<void>((resolver, rechazar) => {
      const hijo = spawn(comando, { shell: true, windowsHide: true })
      hijo.on('error', rechazar)
      hijo.on('close', (c) => (c === 0 ? resolver() : rechazar(new Error(`No pude descomprimir Antigravity (código ${c}).`))))
    })
  } finally {
    rmSync(archivo, { force: true })
  }
  if (!exeAntigravity()) throw new Error('Antigravity se descargó pero no encontré su programa.')
}

/** Las variables de Google del entorno mandarían sobre la cuenta del usuario: fuera. */
const FUERA = /^(GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_APPLICATION_CREDENTIALS|GOOGLE_CLOUD_.*|GOOGLE_GENAI_USE_VERTEXAI|GCLOUD_PROJECT|CLOUDSDK_CORE_PROJECT|AGY_ACP_.*|GEMINI_HOME|ELECTRON_RUN_AS_NODE)$/i

function lanzar(): ChildProcess {
  const exe = exeAntigravity()
  if (!exe) throw new Error('Antigravity aún no está descargado.')
  const ajustes = join(datos(), 'antigravity-acp', 'settings.json')
  if (!existsSync(ajustes)) {
    mkdirSync(join(datos(), 'antigravity-acp'), { recursive: true })
    writeFileSync(ajustes, JSON.stringify({ auth: { type: 'oauth-personal' } }, null, 2))
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !FUERA.test(k)))
  Object.assign(env, {
    GEMINI_HOME: datos(),
    AGY_ACP_FORCE_FILE_STORAGE: '1',
    ANTIGRAVITY_HARNESS_PATH: join(carpeta(), process.platform === 'win32' ? 'localharness_external.exe' : 'localharness_external')
  })
  return spawn(exe, [], { cwd: tmpdir(), env, windowsHide: true, stdio: 'pipe' })
}

/** JSON-RPC por líneas: lo mínimo para hablar ACP. */
class Rpc {
  private siguiente = 0
  private pendientes = new Map<number, { ok: (v: unknown) => void; mal: (e: Error) => void }>()
  private resto = ''

  constructor(
    private hijo: ChildProcess,
    eventos: {
      alAvisar: (metodo: string, params: Record<string, unknown>) => void
      alTexto: (linea: string) => void
      alCerrar: (error: Error) => void
    }
  ) {
    hijo.stdout!.setEncoding('utf8')
    hijo.stdout!.on('data', (trozo: string) => {
      this.resto += trozo
      let i
      while ((i = this.resto.indexOf('\n')) >= 0) {
        const linea = this.resto.slice(0, i).replace(/\r$/, '')
        this.resto = this.resto.slice(i + 1)
        if (!linea.trim()) continue
        let m: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } }
        try {
          m = JSON.parse(linea)
        } catch {
          eventos.alTexto(linea.trim())
          continue
        }
        if (m.method && m.id !== undefined) void this.contestar(m.id, m.method, m.params ?? {})
        else if (m.method) eventos.alAvisar(m.method, m.params ?? {})
        else if (typeof m.id === 'number') {
          const p = this.pendientes.get(m.id)
          if (!p) continue
          this.pendientes.delete(m.id)
          if (m.error) p.mal(new Error(m.error.message))
          else p.ok(m.result)
        }
      }
    })
    hijo.stderr!.setEncoding('utf8')
    hijo.stderr!.on('data', (trozo: string) => {
      for (const linea of trozo.split('\n')) if (linea.trim()) eventos.alTexto(linea.trim())
    })
    hijo.on('error', (e) => eventos.alCerrar(e))
    hijo.on('exit', (c) => eventos.alCerrar(new Error(`Antigravity se cerró (código ${c}).`)))
  }

  private async contestar(id: number, metodo: string, params: Record<string, unknown>) {
    let resultado: unknown
    let error: { code: number; message: string } | undefined
    try {
      if (metodo === 'session/request_permission') {
        const ops = (params.options ?? []) as { optionId: string; kind: string }[]
        const elegida = ops.find((o) => o.kind === 'allow_once') ?? ops.find((o) => o.kind === 'allow_always')
        resultado = elegida
          ? { outcome: { outcome: 'selected', optionId: elegida.optionId } }
          : { outcome: { outcome: 'cancelled' } }
      } else if (metodo === 'fs/read_text_file' && typeof params.path === 'string') {
        resultado = { content: readFileSync(params.path, 'utf8') }
      } else {
        throw new Error('Recorte no admite esta petición del agente.')
      }
    } catch (e) {
      error = { code: -32603, message: e instanceof Error ? e.message : String(e) }
    }
    this.hijo.stdin!.write(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result: resultado }) + '\n')
  }

  pedir<T>(metodo: string, params: unknown, timeoutMs: number): Promise<T> {
    return new Promise((resolver, rechazar) => {
      const id = ++this.siguiente
      const reloj = setTimeout(() => {
        this.pendientes.delete(id)
        rechazar(new Error(`Antigravity no contestó «${metodo}» a tiempo.`))
      }, timeoutMs)
      this.pendientes.set(id, {
        ok: (v) => {
          clearTimeout(reloj)
          resolver(v as T)
        },
        mal: (e) => {
          clearTimeout(reloj)
          rechazar(e)
        }
      })
      this.hijo.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method: metodo, params }) + '\n')
    })
  }
}

interface SesionAcp {
  rpc: Rpc
  hijo: ChildProcess
  sessionId: string
}

/** Abre un proceso, lo inicializa y crea una sesión. Tarda unos 40 s la primera vez. */
async function abrirSesion(eventos: {
  alTexto: (linea: string) => void
  alAvisar: (metodo: string, params: Record<string, unknown>) => void
}): Promise<SesionAcp> {
  const hijo = lanzar()
  let cerrado: Error | null = null
  const rpc = new Rpc(hijo, {
    alAvisar: eventos.alAvisar,
    alTexto: eventos.alTexto,
    alCerrar: (e) => {
      cerrado = e
    }
  })
  await rpc.pedir(
    'initialize',
    {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: false }, terminal: false },
      clientInfo: { name: 'recorte', version: '0.1' }
    },
    180_000
  )
  // Con el token guardado esto vuelve al instante; sin él, abre el navegador y espera.
  await rpc.pedir('authenticate', { methodId: 'oauth-personal' }, 10 * 60_000)
  const s = await rpc.pedir<{ sessionId: string }>('session/new', { cwd: tmpdir(), mcpServers: [] }, 180_000)
  if (cerrado) throw cerrado
  return { rpc, hijo, sessionId: s.sessionId }
}

/**
 * Una pregunta de ida y vuelta: abre el servidor, pregunta y cierra.
 * Arrancar Antigravity desempaca mucho y tarda (~40 s); se paga en cada llamada.
 */
export async function preguntarAntigravity(prompt: string, timeoutMs = 10 * 60_000, senal?: AbortSignal): Promise<string> {
  if (senal?.aborted) throw new Parado()
  let texto = ''
  const sesion = await abrirSesion({
    alTexto: () => {},
    alAvisar: (metodo, params) => {
      if (metodo !== 'session/update') return
      const u = params.update as { sessionUpdate?: string; content?: { type?: string; text?: string } } | undefined
      if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') texto += u.content.text ?? ''
    }
  })
  let alParar = () => {}
  const parado = new Promise<never>((_, mal) => {
    alParar = () => {
      matarArbol(sesion.hijo)
      mal(new Parado())
    }
    if (senal?.aborted) alParar()
    else senal?.addEventListener('abort', alParar, { once: true })
  })
  parado.catch(() => {})
  try {
    await Promise.race([
      sesion.rpc.pedir(
        'session/prompt',
        { sessionId: sesion.sessionId, prompt: [{ type: 'text', text: prompt }] },
        timeoutMs
      ),
      parado
    ])
    if (!texto.trim()) throw new Error('Antigravity no dijo nada.')
    return texto
  } finally {
    senal?.removeEventListener('abort', alParar)
    sesion.hijo.kill()
  }
}

/**
 * Conectar la cuenta de Google: abre el servidor, que abre el navegador con la
 * página de Google (si no, abrimos nosotros el enlace que imprime) y espera la
 * autorización. Devuelve `pendiente` en cuanto hay enlace; el token se detecta
 * solo después (`conectadoAntigravity`).
 */
export async function loginAntigravity(onUrl: (url: string) => void): Promise<{ ok: boolean; error?: string }> {
  let urlVista = false
  try {
    await abrirSesion({
      alAvisar: () => {},
      alTexto: (linea) => {
        if (urlVista) return
        const m = /https?:\/\/[^\s"')>\]]+/.exec(linea)
        if (m && /accounts\.google|oauth|auth/i.test(m[0])) {
          urlVista = true
          onUrl(m[0])
          shell.openExternal(m[0]).catch(() => {})
        }
      }
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
