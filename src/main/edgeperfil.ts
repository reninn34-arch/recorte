import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { homedir } from 'node:os'
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
/** Lo que el Edge compartido sigue abierto sin nadie: el kit pide imágenes, clips y frases seguidas. */
export const GRACIA_MS = 90_000

/** Dónde puede estar el navegador en cada sistema: primero Microsoft Edge y, si no, Google Chrome (se manejan igual). */
function candidatosNavegador(): { exe: string; nombre: 'Edge' | 'Chrome' }[] {
  if (process.platform === 'win32') {
    const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter((b): b is string => Boolean(b))
    return [
      ...bases.map((b) => ({ exe: join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), nombre: 'Edge' as const })),
      ...[...bases, process.env.LOCALAPPDATA ?? ''].filter(Boolean).map((b) => ({ exe: join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), nombre: 'Chrome' as const }))
    ]
  }
  if (process.platform === 'darwin') {
    const apps = ['/Applications', join(homedir(), 'Applications')]
    return [
      ...apps.map((a) => ({ exe: join(a, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'), nombre: 'Edge' as const })),
      ...apps.map((a) => ({ exe: join(a, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), nombre: 'Chrome' as const }))
    ]
  }
  return [
    { exe: '/usr/bin/microsoft-edge', nombre: 'Edge' },
    { exe: '/usr/bin/google-chrome', nombre: 'Chrome' },
    { exe: '/usr/bin/chromium', nombre: 'Chrome' }
  ]
}

/** El navegador para entrar con Google (Edge o Chrome) y su nombre, o null si no hay ninguno. */
export function navegadorGoogle(): { exe: string; nombre: 'Edge' | 'Chrome' } | null {
  return candidatosNavegador().find((c) => existsSync(c.exe)) ?? null
}

/** El programa del navegador para entrar con Google: Edge o, si no está, Chrome. (El nombre viene de cuando era solo Edge.) */
export function edgeExe(): string | null {
  return navegadorGoogle()?.exe ?? null
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
  /**
   * Hace `fn` con el Edge sin ventana. Varios a la vez comparten el mismo Edge (cada uno en su
   * pestaña): se abre con el primero y se cierra cuando lleva `GRACIA_MS` sin nadie, así una
   * tanda de pedidos no lo abre y cierra por cada uno.
   */
  enEdge<T>(fn: (b: Browser) => Promise<T>): Promise<T>
  /** Corre `fn` a solas con el perfil (entrar con Google con ventana): espera a que nadie lo use. */
  enTurno<T>(fn: () => Promise<T>): Promise<T>
  /** Las descargas son de todo el navegador (a qué carpeta van): de una en una. */
  enDescarga<T>(fn: () => Promise<T>): Promise<T>
}

const abiertos = new Set<() => Promise<void>>()
/** Al salir de Recorte: cierra los Edge sin ventana que abrió (si no, quedarían abiertos). */
export async function cerrarEdgesOciosos(): Promise<void> {
  await Promise.all([...abiertos].map((f) => f().catch(() => {})))
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
    if (!exe) throw new Error('No encuentro Microsoft Edge ni Google Chrome en este equipo: hace falta uno de los dos para entrar con Google.')
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
    if (!(await responde())) throw new Error(`${navegadorGoogle()?.nombre ?? 'El navegador'} no abrió.`)
  }

  let turno: Promise<unknown> = Promise.resolve()
  const enTurno = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = turno.then(fn, fn)
    turno = r.catch(() => {})
    return r
  }
  let descarga: Promise<unknown> = Promise.resolve()
  const enDescarga = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = descarga.then(fn, fn)
    descarga = r.catch(() => {})
    return r
  }

  // El Edge compartido: ocupa un turno del perfil mientras alguien lo usa (o hasta GRACIA_MS después).
  interface Sesion {
    b: Promise<Browser>
    usuarios: number
    reloj?: ReturnType<typeof setTimeout>
    soltar: () => void
  }
  let sesion: Sesion | null = null
  function abrirSesion(): Sesion {
    let soltar!: () => void
    const suelta = new Promise<void>((r) => (soltar = r))
    let listo!: (b: Browser) => void
    let fallo!: (e: unknown) => void
    const b = new Promise<Browser>((ok, mal) => {
      listo = ok
      fallo = mal
    })
    b.catch(() => {})
    const s: Sesion = { b, usuarios: 0, soltar }
    void enTurno(async () => {
      let br: Browser
      try {
        await lanzar(false)
        br = await chromium.connectOverCDP(base())
      } catch (e) {
        if (sesion === s) sesion = null
        fallo(e)
        return
      }
      listo(br)
      // Si Edge se cierra solo (se colgó), la sesión ya no sirve: el siguiente abre otra.
      br.on('disconnected', () => {
        if (sesion === s) sesion = null
        soltar()
      })
      await suelta
      if (sesion === s) sesion = null
      await br.close().catch(() => {})
      await cerrar()
    })
    return s
  }
  function soltarOciosa() {
    const s = sesion
    if (!s || s.usuarios > 0) return
    if (s.reloj) clearTimeout(s.reloj)
    sesion = null
    s.soltar()
  }
  abiertos.add(async () => {
    const habia = sesion
    soltarOciosa()
    if (habia) await cerrar()
  })
  const enEdge = async <T>(fn: (b: Browser) => Promise<T>): Promise<T> => {
    const s = (sesion ??= abrirSesion())
    s.usuarios++
    if (s.reloj) clearTimeout(s.reloj)
    s.reloj = undefined
    try {
      return await fn(await s.b)
    } finally {
      if (--s.usuarios === 0) {
        s.reloj = setTimeout(() => {
          if (s.usuarios === 0) {
            if (sesion === s) sesion = null
            s.soltar()
          }
        }, GRACIA_MS)
      }
    }
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
    enTurno: <T>(fn: () => Promise<T>) => {
      // Quien lo necesita a solas no espera la gracia de un Edge que ya nadie usa.
      if (sesion && sesion.usuarios === 0) soltarOciosa()
      return enTurno(fn)
    },
    enDescarga,
    enEdge
  }
}
