import { spawn, spawnSync } from 'node:child_process'
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

/**
 * Los navegadores que Recorte puede manejar por dentro (todos son Chromium: se abren con un perfil propio y se manejan
 * por CDP). Firefox y Safari no dejan, así que con ellos se usa Edge o Chrome.
 */
const CHROMIUM: { id: string; nombre: string; progId: RegExp; exe: RegExp; bundle: string; mac: string }[] = [
  { id: 'edge', nombre: 'Edge', progId: /^MSEdge/i, exe: /msedge(\.exe)?$/i, bundle: 'com.microsoft.edgemac', mac: 'Microsoft Edge' },
  { id: 'chrome', nombre: 'Chrome', progId: /^ChromeHTML/i, exe: /chrome(\.exe)?$|google-chrome/i, bundle: 'com.google.chrome', mac: 'Google Chrome' },
  { id: 'brave', nombre: 'Brave', progId: /^Brave/i, exe: /brave(\.exe)?$|brave-browser/i, bundle: 'com.brave.browser', mac: 'Brave Browser' },
  { id: 'vivaldi', nombre: 'Vivaldi', progId: /^Vivaldi/i, exe: /vivaldi(\.exe)?$/i, bundle: 'com.vivaldi.vivaldi', mac: 'Vivaldi' },
  { id: 'opera', nombre: 'Opera', progId: /^Opera/i, exe: /opera(\.exe)?$|launcher\.exe$/i, bundle: 'com.operasoftware.opera', mac: 'Opera' },
  { id: 'chromium', nombre: 'Chromium', progId: /^Chromium/i, exe: /chromium(-browser)?(\.exe)?$/i, bundle: 'org.chromium.chromium', mac: 'Chromium' }
]

export interface Navegador {
  exe: string
  /** Su nombre para el usuario (Chrome, Edge, Brave…). */
  nombre: string
  id: string
  /** Es el navegador predeterminado del usuario. */
  predeterminado: boolean
  /** El predeterminado no se puede usar (Firefox, Safari): cuál es, para decírselo. */
  noCompatible?: string
}

/** Lo que dice una orden del sistema (vacío si falla). */
function orden(exe: string, args: string[]): string {
  try {
    const r = spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
    return r.status === 0 ? (r.stdout ?? '') : ''
  } catch {
    return ''
  }
}

/** El navegador predeterminado del usuario: su programa y su identificador (ProgId, bundle o .desktop). */
function predeterminado(): { exe: string | null; marca: string; nombre: string } | null {
  if (process.platform === 'win32') {
    const elegido = orden('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'])
    // RECORTE_PROGID_PRUEBA: para las pruebas, como si el predeterminado fuera otro (ChromeHTML, FirefoxURL…).
    const progId = process.env.RECORTE_PROGID_PRUEBA || elegido.match(/ProgId\s+REG_SZ\s+(\S+)/i)?.[1]
    if (!progId) return null
    const comando = orden('reg', ['query', `HKCR\\${progId}\\shell\\open\\command`, '/ve'])
    const linea = comando.match(/REG_(?:EXPAND_)?SZ\s+(.+)$/im)?.[1]?.trim() ?? ''
    const exe = (linea.match(/^"([^"]+)"/)?.[1] ?? linea.split(/\s+/)[0] ?? '').replace(/%([^%]+)%/g, (_, v: string) => process.env[v] ?? '')
    const nombre = /firefox/i.test(progId) ? 'Firefox' : progId.replace(/(HTML?|URL|\.\w+)$/i, '').replace(/-.*$/, '')
    return { exe: exe && existsSync(exe) ? exe : null, marca: progId, nombre }
  }
  if (process.platform === 'darwin') {
    const plist = join(homedir(), 'Library', 'Preferences', 'com.apple.LaunchServices', 'com.apple.launchservices.secure.plist')
    if (!existsSync(plist)) return { exe: null, marca: 'com.apple.safari', nombre: 'Safari' }
    try {
      const datos = JSON.parse(orden('plutil', ['-convert', 'json', '-o', '-', plist]) || '{}') as { LSHandlers?: { LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }[] }
      const bundle = datos.LSHandlers?.find((h) => h.LSHandlerURLScheme === 'https')?.LSHandlerRoleAll ?? 'com.apple.safari'
      const app = orden('mdfind', [`kMDItemCFBundleIdentifier == '${bundle.replace(/'/g, '')}'`]).split('\n').find((x) => x.endsWith('.app'))
      const conocido = CHROMIUM.find((c) => c.bundle === bundle.toLowerCase())
      const exe = app && conocido ? join(app, 'Contents', 'MacOS', conocido.mac) : null
      return { exe: exe && existsSync(exe) ? exe : null, marca: bundle, nombre: conocido?.nombre ?? (/safari/i.test(bundle) ? 'Safari' : /firefox/i.test(bundle) ? 'Firefox' : bundle) }
    } catch {
      return null
    }
  }
  const escritorio = orden('xdg-settings', ['get', 'default-web-browser']).trim()
  if (!escritorio) return null
  const conocido = CHROMIUM.find((c) => c.exe.test(escritorio.replace(/\.desktop$/, '')))
  const exe = conocido ? ['/usr/bin/', '/snap/bin/'].map((d) => d + escritorio.replace(/\.desktop$/, '')).find((x) => existsSync(x)) ?? null : null
  return { exe, marca: escritorio, nombre: conocido?.nombre ?? escritorio.replace(/\.desktop$/, '') }
}

/** Dónde puede estar Edge o Chrome, por si el predeterminado no se puede usar. */
function candidatosNavegador(): { exe: string; id: 'edge' | 'chrome'; nombre: 'Edge' | 'Chrome' }[] {
  if (process.platform === 'win32') {
    const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter((b): b is string => Boolean(b))
    return [
      ...bases.map((b) => ({ exe: join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), id: 'edge' as const, nombre: 'Edge' as const })),
      ...[...bases, process.env.LOCALAPPDATA ?? ''].filter(Boolean).map((b) => ({ exe: join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'), id: 'chrome' as const, nombre: 'Chrome' as const }))
    ]
  }
  if (process.platform === 'darwin') {
    const apps = ['/Applications', join(homedir(), 'Applications')]
    return [
      ...apps.map((a) => ({ exe: join(a, 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge'), id: 'edge' as const, nombre: 'Edge' as const })),
      ...apps.map((a) => ({ exe: join(a, 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'), id: 'chrome' as const, nombre: 'Chrome' as const }))
    ]
  }
  return [
    { exe: '/usr/bin/microsoft-edge', id: 'edge', nombre: 'Edge' },
    { exe: '/usr/bin/google-chrome', id: 'chrome', nombre: 'Chrome' },
    { exe: '/usr/bin/chromium', id: 'chrome', nombre: 'Chrome' }
  ]
}

let recordado: { cuando: number; nav: Navegador | null } | null = null
/**
 * El navegador para entrar con las cuentas (Google, Flow): el predeterminado del usuario si es de los que Recorte
 * puede manejar (Chrome, Edge, Brave, Vivaldi, Opera, Chromium); si no (Firefox, Safari), Edge o Chrome. Se mira de
 * nuevo cada medio minuto, por si lo cambia.
 */
export function navegadorGoogle(): Navegador | null {
  if (recordado && Date.now() - recordado.cuando < 30_000) return recordado.nav
  let nav: Navegador | null = null
  const suyo = predeterminado()
  const compatible = suyo && CHROMIUM.find((c) => c.progId.test(suyo.marca) || c.bundle === suyo.marca.toLowerCase() || (suyo.exe ? c.exe.test(suyo.exe) : false))
  if (suyo?.exe && compatible) nav = { exe: suyo.exe, nombre: compatible.nombre, id: compatible.id, predeterminado: true }
  else {
    const otro = candidatosNavegador().find((c) => existsSync(c.exe))
    if (otro) nav = { ...otro, predeterminado: false, ...(suyo && !compatible ? { noCompatible: suyo.nombre } : {}) }
  }
  recordado = { cuando: Date.now(), nav }
  return nav
}

/** El programa del navegador para entrar con las cuentas. (El nombre viene de cuando era solo Edge.) */
export function edgeExe(): string | null {
  return navegadorGoogle()?.exe ?? null
}

/**
 * La carpeta del perfil de Recorte para este navegador: cada navegador tiene la suya (un perfil de uno no se abre
 * bien en otro). La de Edge se queda donde estaba, para no perder la sesión de quien ya entró.
 */
export function carpetaPerfil(base: string): string {
  const id = navegadorGoogle()?.id ?? 'edge'
  return id === 'edge' ? base : `${base}-${id}`
}

/** El puerto fijo del Edge de la voz (`vozgoogle.ts`). */
export const PUERTO_VOZ = 9336
let deLaVoz: EdgePerfil | null = null
let rutaDeLaVoz = ''
/** El perfil de la cuenta de la voz: lo comparten la voz y Flow, en el mismo turno. */
export function perfilDeLaVoz(): EdgePerfil {
  const ruta = carpetaPerfil(join(app.getPath('userData'), 'voz', 'perfil'))
  if (!deLaVoz || rutaDeLaVoz !== ruta) {
    deLaVoz = edgePerfil(ruta, PUERTO_VOZ)
    rutaDeLaVoz = ruta
  }
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
