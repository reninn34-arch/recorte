import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { app } from 'electron'
import { chromium, type Browser } from 'playwright-core'

/**
 * Un Edge con un perfil propio de Recorte, donde vive la sesión de Google de una cuenta.
 *
 * - Para entrar con Google se abre con ventana y Recorte solo mira por CDP directo (sin
 *   Playwright, que toca las pestañas y Google lo nota) qué página tiene y si hay sesión.
 * - Para trabajar se abre sin ventana y se maneja con Playwright, de uno en uno (`enEdge`).
 * - El puerto de depuración es uno libre ya elegido, nunca 0: con 0, Edge avisa a las páginas
 *   de que lo maneja un programa y Google no deja entrar.
 */

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** El Edge del sistema (en Windows viene con él). */
export function edgeExe(): string | null {
  if (process.platform !== 'win32') return null
  for (const base of [process.env['ProgramFiles(x86)'], process.env.ProgramFiles]) {
    if (!base) continue
    const exe = join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    if (existsSync(exe)) return exe
  }
  return null
}

/** El puerto fijo del Edge de la voz (`vozgoogle.ts`). */
export const PUERTO_VOZ = 9336
let deLaVoz: EdgePerfil | null = null
/** El perfil de la cuenta de la voz: lo comparten la voz y Flow, en el mismo turno. */
export function perfilDeLaVoz(): EdgePerfil {
  deLaVoz ??= edgePerfil(join(app.getPath('userData'), 'voz', 'perfil'), PUERTO_VOZ)
  return deLaVoz
}

export const puertoLibre = () =>
  new Promise<number>((ok, mal) => {
    const s = createServer()
    s.once('error', mal)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo
      s.close(() => ok(port))
    })
  })

export interface EdgePerfil {
  lanzar(ventana: boolean, url?: string): Promise<void>
  cerrar(): Promise<void>
  paginas(): Promise<{ type: string; url: string }[]>
  conSesion(): Promise<boolean>
  /** Hace `fn` con el Edge sin ventana, en su turno; al acabar lo cierra. */
  enEdge<T>(fn: (b: Browser) => Promise<T>): Promise<T>
  /** Corre `fn` en el turno del perfil (para quien maneja el Edge por su cuenta, como la voz). */
  enTurno<T>(fn: () => Promise<T>): Promise<T>
}

/** `puertoFijo` lo usa la voz, que abre su Edge siempre en el mismo puerto. */
export function edgePerfil(perfil: string, puertoFijo?: number): EdgePerfil {
  const archivoPuerto = join(perfil, 'puerto-recorte')
  const puerto = () => {
    if (puertoFijo) return puertoFijo
    try {
      return Number(readFileSync(archivoPuerto, 'utf8').trim()) || 0
    } catch {
      return 0
    }
  }
  const base = () => `http://127.0.0.1:${puerto()}`
  const responde = () => (puerto() ? fetch(`${base()}/json/version`).then((r) => r.ok, () => false) : Promise.resolve(false))

  /** Un comando al navegador por CDP, sin Playwright. */
  async function cdp<T>(metodo: string): Promise<T> {
    const { webSocketDebuggerUrl } = (await (await fetch(`${base()}/json/version`)).json()) as { webSocketDebuggerUrl: string }
    const ws = new WebSocket(webSocketDebuggerUrl)
    try {
      return await new Promise<T>((ok, mal) => {
        const reloj = setTimeout(() => mal(new Error('Edge no contestó.')), 10_000)
        ws.addEventListener('open', () => ws.send(JSON.stringify({ id: 1, method: metodo })))
        ws.addEventListener('message', (e) => {
          const m = JSON.parse(String(e.data)) as { id?: number; result?: T; error?: { message: string } }
          if (m.id !== 1) return
          clearTimeout(reloj)
          if (m.error) mal(new Error(m.error.message))
          else ok(m.result as T)
        })
        ws.addEventListener('error', () => mal(new Error('No pude hablar con Edge.')))
      })
    } finally {
      ws.close()
    }
  }

  async function cerrar() {
    if (!(await responde())) return
    await cdp('Browser.close').catch(() => {})
    for (let i = 0; i < 24 && (await responde()); i++) await espera(250)
  }

  async function lanzar(ventana: boolean, url = 'about:blank') {
    if (await responde()) {
      if (!ventana) return
      await cerrar()
    }
    const exe = edgeExe()
    if (!exe) throw new Error('No encuentro Microsoft Edge en este equipo: hace falta para entrar con Google.')
    mkdirSync(perfil, { recursive: true })
    const nuevo = puertoFijo ?? (await puertoLibre())
    if (!puertoFijo) writeFileSync(archivoPuerto, String(nuevo))
    const args = [
      `--remote-debugging-port=${nuevo}`,
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(ventana ? [url] : ['--headless=new', '--mute-audio', 'about:blank'])
    ]
    spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: !ventana }).unref()
    for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
    if (!(await responde())) throw new Error('Edge no abrió.')
  }

  let turno: Promise<unknown> = Promise.resolve()
  const enTurno = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = turno.then(fn, fn)
    turno = r.catch(() => {})
    return r
  }

  return {
    lanzar,
    cerrar,
    paginas: () =>
      fetch(`${base()}/json/list`)
        .then((r) => r.json() as Promise<{ type: string; url: string }[]>)
        .then((l) => l.filter((t) => t.type === 'page'), () => []),
    conSesion: () =>
      cdp<{ cookies: { name: string; domain: string }[] }>('Storage.getCookies').then(
        (r) => r.cookies.some((c) => c.name === 'SAPISID' && c.domain.replace(/^\./, '') === 'google.com'),
        () => false
      ),
    enTurno,
    enEdge: <T>(fn: (b: Browser) => Promise<T>) =>
      enTurno(async () => {
        await lanzar(false)
        const b = await chromium.connectOverCDP(base())
        try {
          return await fn(b)
        } finally {
          await b.close().catch(() => {})
          await cerrar()
        }
      })
  }
}
