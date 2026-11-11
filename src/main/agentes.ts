import { exec, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, shell } from 'electron'
import type { ConexionResultado, EstadoAgente } from '../shared/api'
import { anadirCarpetaBinarios, pathAmpliado, resolverBinario } from './binarios'
import { guardar } from './disco'
import { conectadoAntigravity, exeAntigravity, instalarAntigravity, loginAntigravity, rutaTokenAntigravity } from './antigravity'

/**
 * Detección y conexión de agentes CLI (los "planes" del usuario).
 *
 * Conectar un plan es un botón, sin comandos ni terminales a mano:
 * 1. Si el programa del agente no está, Recorte lo baja de npm a su propia carpeta
 *    (`<userData>/agentes`), sin tocar las instalaciones globales del usuario.
 * 2. Si ya hay sesión iniciada (su archivo de credenciales existe), está listo.
 * 3. Si no, lanza el inicio de sesión del propio agente: Kimi y Codex abren el
 *    navegador y terminan solos; Claude Code y Gemini CLI inician sesión en su
 *    primera ejecución, así que se abre su ventana y la interfaz espera a que
 *    aparezcan las credenciales.
 */

type Login = 'navegador' | 'ventana'

interface DefAgente {
  id: EstadoAgente['id']
  nombre: string
  binario: string
  comando: string
  paquete: string
  /** Archivo o carpeta que solo existe con sesión iniciada. */
  credenciales: string
  login: Login
  /** Argumentos del inicio de sesión en modo `navegador`. */
  argsLogin?: string[]
  /** Antigravity no es un CLI de texto: habla ACP y se descarga de Google. */
  acp?: boolean
}

const AGENTES: DefAgente[] = [
  {
    id: 'claude',
    nombre: 'Claude Code',
    binario: 'claude',
    comando: 'claude -p',
    paquete: '@anthropic-ai/claude-code',
    credenciales: join(homedir(), '.claude', '.credentials.json'),
    login: 'ventana',
    // El inicio de sesión oficial con la suscripción: abre la página de autorización.
    argsLogin: ['auth', 'login', '--claudeai']
  },
  {
    id: 'codex',
    nombre: 'ChatGPT (Codex)',
    binario: 'codex',
    comando: 'codex exec',
    paquete: '@openai/codex',
    credenciales: join(homedir(), '.codex', 'auth.json'),
    login: 'navegador',
    argsLogin: ['login']
  },
  {
    id: 'gemini',
    nombre: 'Gemini CLI',
    binario: 'gemini',
    comando: 'gemini -p',
    paquete: '@google/gemini-cli',
    credenciales: join(homedir(), '.gemini', 'oauth_creds.json'),
    login: 'ventana'
  },
  {
    id: 'kimi',
    nombre: 'Kimi Code',
    binario: 'kimi',
    comando: 'kimi -p "@{prompt}"',
    paquete: '@moonshot-ai/kimi-code',
    credenciales: join(homedir(), '.kimi-code', 'credentials'),
    login: 'navegador',
    argsLogin: ['login']
  },
  {
    id: 'opencode',
    nombre: 'OpenCode',
    binario: 'opencode',
    comando: 'opencode run',
    paquete: 'opencode-ai',
    credenciales: join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
    login: 'ventana',
    argsLogin: ['auth', 'login']
  },
  {
    id: 'antigravity',
    nombre: 'Antigravity · Google',
    binario: 'agy_acp_server',
    // Marca interna: `preguntarAgente` la reconoce y habla ACP con el servidor de Google.
    comando: 'antigravity:acp',
    paquete: '',
    credenciales: '', // se calcula con `conectadoAntigravity`
    login: 'navegador',
    acp: true
  }
]

/** Donde Recorte instala los agentes que baja él mismo. */
function carpetaAgentes(): string {
  return join(app.getPath('userData'), 'agentes')
}

/** Lo llama el arranque: los agentes que bajó Recorte se encuentran como los globales. */
export function prepararAgentes(): void {
  anadirCarpetaBinarios(join(carpetaAgentes(), 'node_modules', '.bin'))
}

const entorno = () => ({ ...process.env, PATH: pathAmpliado() })

function versionResponde(binario: string): Promise<boolean> {
  return new Promise((resolver) => {
    exec(`${binario} --version`, { timeout: 15000, windowsHide: true, env: entorno() }, (error) => resolver(!error))
  })
}

/** La versión instalada de cada agente (para Ajustes; corre `--version`, tarda unos segundos). */
export async function versionesAgentes(): Promise<Record<string, string | null>> {
  const pares = await Promise.all(
    AGENTES.map(
      (agente) =>
        new Promise<[string, string | null]>((resolver) => {
          if (agente.acp) return resolver([agente.id, exeAntigravity() ? 'instalado' : null])
          if (!resolverBinario(agente.binario)) return resolver([agente.id, null])
          exec(`${agente.binario} --version`, { timeout: 20000, windowsHide: true, env: entorno() }, (error, stdout, stderr) => {
            const v = /\d+\.\d+(?:\.\d+)?/.exec(`${stdout} ${stderr}`)
            resolver([agente.id, error && !v ? null : (v?.[0] ?? 'instalado')])
          })
        })
    )
  )
  return Object.fromEntries(pares)
}

/** Los agentes que, además de la suscripción, aceptan pagar por uso con una llave de API. */
// Gemini CLI ya no funciona con la cuenta personal de Google (Google lo pasó a Antigravity): solo con llave.
export const VARIABLE_LLAVE: Partial<Record<EstadoAgente['id'], string>> = { claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' }

/** Qué agente corre una orden (por su binario o su comando). */
export function agenteDeOrden(orden: string): EstadoAgente['id'] | null {
  const limpia = orden.trim()
  const a = AGENTES.find((x) => limpia === x.comando || limpia.startsWith(`${x.comando} `) || limpia.startsWith(`${x.binario} `) || limpia === x.binario)
  return a?.id ?? null
}

/**
 * Las sesiones que se cayeron mientras trabajaban (el agente respondió «no autenticado»), con
 * cuándo: el agente cuenta como desconectado hasta que sus credenciales cambien (al reconectar).
 */
const caidas = new Map<EstadoAgente['id'], number>()

function cambioDesde(ruta: string): number {
  try {
    return statSync(ruta).mtimeMs
  } catch {
    return 0
  }
}

/** La sesión de un agente se cayó: deja de contar como conectado hasta que vuelva a iniciarla. */
export function marcarSesionCaida(id: EstadoAgente['id']): void {
  caidas.set(id, Date.now())
}

/**
 * Desconecta el agente de Recorte: deja de contar como conectado (hasta que se vuelva a
 * conectar desde Inicio) sin tocar sus archivos de sesión. Esas credenciales son del
 * usuario y las usa fuera de Recorte (su terminal, su editor): borrarlas le cerraría la
 * sesión de Claude Code, Codex o Gemini en todo el equipo.
 */
export async function desconectarAgente(id: unknown): Promise<ConexionResultado> {
  const agente = AGENTES.find((a) => a.id === id)
  if (!agente) return { ok: false, error: 'Agente desconocido.' }
  const lista = leerDesconectados()
  lista[agente.id] = Date.now()
  guardarDesconectados(lista)
  return { ok: true }
}

/**
 * Los que el usuario desconectó a mano, con cuándo. Se guarda en disco: sigue desconectado
 * aunque se cierre Recorte, hasta que vuelva a autorizarlo (sus credenciales se reescriben
 * después de esa hora). Volver a «Conectar» abre siempre la autorización del agente.
 */
const rutaDesconectados = () => join(app.getPath('userData'), 'desconectados.json')
let desconectadosCache: Record<string, number> | null = null
function leerDesconectados(): Record<string, number> {
  if (desconectadosCache) return desconectadosCache
  try {
    desconectadosCache = JSON.parse(readFileSync(rutaDesconectados(), 'utf8')) as Record<string, number>
  } catch {
    desconectadosCache = {}
  }
  return desconectadosCache
}
function guardarDesconectados(lista: Record<string, number>): void {
  desconectadosCache = lista
  try {
    guardar(rutaDesconectados(), JSON.stringify(lista, null, 2))
  } catch {
    // Si no se puede guardar, vale hasta cerrar la app.
  }
}

/** Tiene sesión de verdad: no basta con que exista el archivo (al cerrar sesión queda vacío). */
function sesionIniciada(agente: DefAgente): boolean {
  if (agente.acp) return conectadoAntigravity()
  if (!existsSync(agente.credenciales)) return false
  if (agente.id === 'claude') {
    try {
      const o = (JSON.parse(readFileSync(agente.credenciales, 'utf8')) as { claudeAiOauth?: Record<string, unknown> }).claudeAiOauth
      const texto = (v: unknown) => typeof v === 'string' && v.length > 0
      if (!o || !texto(o.accessToken)) return false
      const vence = typeof o.expiresAt === 'number' ? o.expiresAt : 0
      // Con refreshToken se renueva solo; sin él, vale mientras no venza.
      if (!texto(o.refreshToken) && vence > 0 && vence < Date.now()) return false
    } catch {
      return false
    }
  }
  return true
}

function conectadoAhora(agente: DefAgente): boolean {
  if (!sesionIniciada(agente)) return false
  const ruta = agente.acp ? rutaTokenAntigravity() : agente.credenciales
  const desconectado = leerDesconectados()[agente.id]
  if (desconectado !== undefined) {
    // Lo desconectó a mano: vuelve a contar cuando lo autoriza de nuevo (sus credenciales cambian).
    if (cambioDesde(ruta) <= desconectado) return false
    const { [agente.id]: _fuera, ...resto } = leerDesconectados()
    guardarDesconectados(resto)
  }
  const caida = caidas.get(agente.id)
  if (caida === undefined) return true
  // Si sus credenciales se reescribieron después del fallo, volvió a iniciar sesión.
  if (cambioDesde(ruta) > caida) {
    caidas.delete(agente.id)
    return true
  }
  return false
}

export async function estadoAgentes(): Promise<EstadoAgente[]> {
  return Promise.all(
    AGENTES.map(async (agente) => ({
      id: agente.id,
      nombre: agente.nombre,
      // Buscar el ejecutable es instantáneo; correr `--version` de cuatro agentes tardaba segundos.
      instalado: agente.acp ? exeAntigravity() !== null : resolverBinario(agente.binario) !== null,
      conectado: conectadoAhora(agente),
      comando: agente.comando,
      instalar: agente.acp ? 'Se descarga de Google (~230 MB)' : `npm i -g ${agente.paquete}`
    }))
  )
}

/** Corre un comando con shell y devuelve el código y lo último que dijo. */
export function correr(orden: string, limite: number): Promise<{ codigo: number | null; salida: string }> {
  return new Promise((resolver) => {
    let salida = ''
    let hecho = false
    const hijo = spawn(orden, { shell: true, windowsHide: true, env: entorno() })
    const reloj = setTimeout(() => {
      if (hecho) return
      hijo.kill()
      resolver({ codigo: null, salida: 'Tardó demasiado.' })
    }, limite)
    hijo.stdout.on('data', (b: Buffer) => (salida = (salida + b.toString('utf8')).slice(-2000)))
    hijo.stderr.on('data', (b: Buffer) => (salida = (salida + b.toString('utf8')).slice(-2000)))
    hijo.on('error', (e) => {
      hecho = true
      clearTimeout(reloj)
      resolver({ codigo: -1, salida: e.message })
    })
    hijo.on('close', (codigo) => {
      hecho = true
      clearTimeout(reloj)
      resolver({ codigo, salida })
    })
  })
}

async function instalar(agente: DefAgente): Promise<ConexionResultado> {
  if (!(await versionResponde('npm'))) {
    return {
      ok: false,
      error: `Para instalar ${agente.nombre} hace falta Node.js (incluye npm). Instálalo desde nodejs.org y vuelve a intentarlo.`
    }
  }
  const destino = carpetaAgentes()
  mkdirSync(destino, { recursive: true })
  const r = await correr(`npm install --no-audit --no-fund --prefix "${destino}" ${agente.paquete}@latest`, 10 * 60_000)
  if (r.codigo !== 0 || !(await versionResponde(agente.binario))) {
    return { ok: false, error: `No pude instalar ${agente.nombre}: ${r.salida.trim().slice(-300) || 'npm falló.'}` }
  }
  return { ok: true }
}

/** Abre una ventana de terminal con el agente para que el usuario inicie sesión. */
function abrirVentana(agente: DefAgente): boolean {
  const orden = `${agente.binario} ${(agente.argsLogin ?? []).join(' ')}`.trim()
  try {
    if (process.platform === 'win32') {
      spawn(`start "Recorte - conectar ${agente.nombre}" cmd /k ${orden}`, {
        shell: true,
        detached: true,
        windowsHide: false,
        env: entorno(),
        stdio: 'ignore'
      }).unref()
      return true
    }
    if (process.platform === 'darwin') {
      spawn('osascript', ['-e', `tell application "Terminal" to do script "${orden}"`, '-e', 'tell application "Terminal" to activate'], {
        detached: true,
        stdio: 'ignore'
      }).unref()
      return true
    }
    spawn('x-terminal-emulator', ['-e', ...orden.split(' ')], { detached: true, stdio: 'ignore', env: entorno() }).unref()
    return true
  } catch {
    return false
  }
}

const enCurso = new Set<string>()

/** Logins de navegador en marcha: el proceso sigue vivo hasta que aparecen las credenciales. */
const loginesAbiertos = new Set<string>()

/** La URL de autorización suele llevar auth, oauth, login o accounts en la dirección. */
function urlDeAcceso(salida: string): string | null {
  const urls = salida.match(/https?:\/\/[^\s"'<>)\]]+/g) ?? []
  return urls.find((u) => /auth|oauth|login|accounts\.|device/i.test(u)) ?? null
}

/**
 * Inicia sesión con el navegador: lanza el login del agente y vigila lo que imprime.
 * Con la salida canalizada (sin terminal) muchos agentes NO abren el navegador
 * solos: en cuanto aparece la URL de autorización la abrimos nosotros y avisamos
 * a la interfaz, que espera a que aparezcan las credenciales. El proceso del login
 * queda vivo hasta completarse (máx. 10 min).
 */
function loginNavegador(agente: DefAgente): Promise<ConexionResultado> {
  return new Promise((resolver) => {
    if (loginesAbiertos.has(agente.id)) {
      resolver({ ok: false, pendiente: true, aviso: `La autorización de ${agente.nombre} ya está en marcha.` })
      return
    }
    loginesAbiertos.add(agente.id)
    const hijo = spawn(`${agente.binario} ${(agente.argsLogin ?? []).join(' ')}`, {
      shell: true,
      windowsHide: true,
      env: entorno()
    })

    let salida = ''
    let avisado = false
    const anunciar = (r: ConexionResultado) => {
      if (avisado) return
      avisado = true
      resolver(r)
    }
    const terminar = () => {
      clearInterval(vigia)
      clearTimeout(reloj)
      clearTimeout(relojAviso)
      if (!hijo.killed) hijo.kill()
      loginesAbiertos.delete(agente.id)
    }

    // Si el agente no imprime URL es porque abrió el navegador él mismo: avisamos igual.
    const relojAviso = setTimeout(
      () => anunciar({ ok: false, pendiente: true, aviso: `Autoriza ${agente.nombre} en la página que se abrió en tu navegador.` }),
      12_000
    )
    const reloj = setTimeout(terminar, 10 * 60_000)
    const vigia = setInterval(() => {
      if (conectadoAhora(agente)) {
        terminar()
        anunciar({ ok: true })
      }
    }, 1000)

    const verSalida = (b: Buffer) => {
      salida = (salida + b.toString('utf8')).slice(-4000)
      const url = urlDeAcceso(salida)
      if (!url) return
      shell.openExternal(url).catch(() => {})
      anunciar({
        ok: false,
        pendiente: true,
        aviso: `Se abrió tu navegador para autorizar ${agente.nombre}. Si no se abrió, pega esta dirección: ${url}`
      })
    }
    hijo.stdout.on('data', verSalida)
    hijo.stderr.on('data', verSalida)
    hijo.on('error', (e) => {
      terminar()
      anunciar({ ok: false, error: `No pude lanzar el login de ${agente.nombre}: ${e.message}` })
    })
    hijo.on('close', () => {
      if (conectadoAhora(agente)) {
        terminar()
        anunciar({ ok: true })
      } else if (!avisado) {
        terminar()
        anunciar({ ok: false, error: salida.trim().slice(-300) || 'El inicio de sesión no se completó.' })
      }
    })
  })
}

export async function conectarAgente(id: unknown): Promise<ConexionResultado> {
  const agente = AGENTES.find((a) => a.id === id)
  if (!agente) return { ok: false, error: 'Agente desconocido.' }
  if (enCurso.has(agente.id)) return { ok: false, pendiente: true, aviso: `Ya se está conectando ${agente.nombre}.` }
  // Lo desconectó a mano (o se le cayó la sesión): se abre su autorización aunque haya un
  // archivo de sesión. Solo cuenta como conectado cuando autoriza otra vez.
  const reautorizar = leerDesconectados()[agente.id] !== undefined || caidas.has(agente.id)

  if (agente.acp) {
    enCurso.add(agente.id)
    try {
      if (!exeAntigravity()) {
        await instalarAntigravity()
      }
      if (!reautorizar && conectadoAhora(agente)) return { ok: true }
      // La autorización sigue en el navegador; el token se detecta solo al volver.
      let aviso = `Se abrió tu navegador para autorizar ${agente.nombre} con tu cuenta de Google.`
      void loginAntigravity((url) => {
        aviso = `Se abrió tu navegador para autorizar ${agente.nombre}. Si no se abrió, pega esta dirección: ${url}`
      })
        .catch(() => {})
        .finally(() => enCurso.delete(agente.id))
      return { ok: false, pendiente: true, aviso }
    } catch (e) {
      enCurso.delete(agente.id)
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  enCurso.add(agente.id)
  try {
    if (!(await versionResponde(agente.binario))) {
      const instalado = await instalar(agente)
      if (!instalado.ok) return instalado
    }
    if (!reautorizar && conectadoAhora(agente)) return { ok: true }

    if (agente.login === 'navegador') return loginNavegador(agente)

    if (!abrirVentana(agente)) {
      return { ok: false, error: `No pude abrir la ventana de ${agente.nombre}. Ábrelo una vez con «${agente.binario}» para iniciar sesión.` }
    }
    return {
      ok: false,
      pendiente: true,
      aviso: `Se abrió una ventana para autorizar ${agente.nombre} con tu plan: sigue los pasos en tu navegador. Recorte lo detecta solo.`
    }
  } finally {
    enCurso.delete(agente.id)
  }
}
