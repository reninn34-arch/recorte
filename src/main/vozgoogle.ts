import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { chromium, type Browser, type Page } from 'playwright-core'
import { edgeExe, perfilDeLaVoz } from './edgeperfil'

/**
 * La voz de Gemini con la cuenta de Google del usuario, sin llave de API: se genera
 * en la página «Generate speech» de AI Studio, como la generaría él a mano, con la
 * cuota gratis de la página.
 *
 * Google no deja iniciar sesión dentro de una app, así que la entrada es en el Edge
 * del sistema con un perfil propio de Recorte (`<userData>/voz/perfil`), y el trabajo
 * (leer la cuenta, generar) se hace en ese mismo Edge sin ventana, por CDP con
 * playwright-core. La sesión vive solo en ese perfil: ningún agente la ve.
 */

const PUERTO = 9336
const URL_VOZ = 'https://aistudio.google.com/generate-speech'
const ENTRAR = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(URL_VOZ)}`
/** La primera vez, AI Studio manda a aceptar sus términos antes de dejar generar. */
const BIENVENIDA = /^https:\/\/aistudio\.google\.com\/(onboarding|welcome)\b/

export interface EstadoVozGoogle {
  correo: string | null
  conectando: boolean
  navegador: string | null
  error?: string
}

const carpeta = () => join(app.getPath('userData'), 'voz')
const perfil = () => join(carpeta(), 'perfil')
const archivoCuenta = () => join(carpeta(), 'cuenta.json')

let correo: string | null = null
let conectando = false
let error: string | undefined
try {
  correo = JSON.parse(readFileSync(archivoCuenta(), 'utf8')).correo ?? null
} catch {
  // Aún no se conectó.
}

function guardarCuenta() {
  mkdirSync(carpeta(), { recursive: true })
  writeFileSync(archivoCuenta(), JSON.stringify({ correo }, null, 2))
}

export function estadoVozGoogle(): EstadoVozGoogle {
  return { correo, conectando, navegador: edgeExe(), ...(error ? { error } : {}) }
}

export { edgeExe }

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const responde = () => fetch(`http://127.0.0.1:${PUERTO}/json/version`).then((r) => r.ok, () => false)

/** Pestañas del Edge del perfil, por su URL. */
async function pestanas(): Promise<{ type: string; url: string }[]> {
  const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`)
  return r.ok ? ((await r.json()) as { type: string; url: string }[]) : []
}
const conVentana = () => pestanas().then((l) => l.some((t) => t.type === 'page'), () => false)
const enAIStudio = () =>
  pestanas().then(
    (l) => l.some((t) => t.type === 'page' && t.url.startsWith('https://aistudio.google.com/') && !BIENVENIDA.test(t.url)),
    () => false
  )

/** Abre el Edge del perfil: con ventana para entrar con Google, sin ventana para trabajar. */
async function lanzarEdge(ventana: boolean): Promise<void> {
  if (await responde()) return
  const exe = edgeExe()
  if (!exe) throw new Error('No encuentro Edge en este equipo: hace falta para entrar con Google.')
  mkdirSync(perfil(), { recursive: true })
  const args = [
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil()}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(ventana ? [ENTRAR] : ['--headless=new', '--mute-audio', 'about:blank'])
  ]
  spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: !ventana }).unref()
  for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
  if (!(await responde())) throw new Error('Edge no respondió al abrirlo.')
}

/** Conecta playwright al Edge del perfil (lo abre sin ventana si hace falta). */
async function abrirEdge(): Promise<Browser> {
  await lanzarEdge(false)
  return chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`)
}

/** Cierra el Edge del perfil entero (la sesión queda en el perfil). */
async function cerrarEdge(): Promise<void> {
  try {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`)
    await (await b.newBrowserCDPSession()).send('Browser.close')
  } catch {
    // Ya estaba cerrado.
  }
  for (let i = 0; i < 20 && (await responde()); i++) await espera(250)
}

/** ¿El perfil tiene sesión de Google? La cookie SAPISID lo delata. */
async function sesionEnEdge(): Promise<boolean> {
  try {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`)
    try {
      const { cookies } = await (await b.newBrowserCDPSession()).send('Storage.getCookies')
      return (cookies as { name: string; domain: string }[]).some(
        (c) => c.name === 'SAPISID' && c.domain.replace(/^\./, '') === 'google.com'
      )
    } finally {
      await b.close()
    }
  } catch {
    return false
  }
}

/** El correo de la cuenta, del botón de cuenta de AI Studio («Cuenta de Google: Nombre (correo)»). */
async function correoDe(page: Page): Promise<string | null> {
  const etiqueta = await page
    .locator('button[aria-label*="@"]')
    .first()
    .getAttribute('aria-label', { timeout: 15_000 })
    .catch(() => null)
  return etiqueta?.match(/\(([^()\s]+@[^()\s]+)\)/)?.[1] ?? null
}

/** Deja una página de AI Studio con diálogo nuevo y devuelve su caja de texto. */
async function abrirDialogo(page: Page) {
  await page.goto(URL_VOZ, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  if (BIENVENIDA.test(page.url())) {
    throw new Error('AI Studio pide aceptar sus términos la primera vez: pulsa «Conectar con Google» y acéptalos en la ventana que se abre.')
  }
  if (page.url().startsWith('https://accounts.google.com/')) {
    throw new Error('La sesión de Google se perdió. Vuelve a conectar tu cuenta.')
  }
  const visto = await correoDe(page)
  if (visto && visto !== correo) {
    correo = visto
    guardarCuenta()
  }
  const caja = page.locator('textarea[aria-label="Speech block text"]').first()
  if (!(await caja.isVisible().catch(() => false))) {
    await page.getByText('Create new dialog', { exact: true }).first().click({ timeout: 30_000 })
  }
  await caja.waitFor({ timeout: 20_000 })
  return caja
}

const hablante = (page: Page) => page.locator('button:has-text("Speaker 1")').first()

/** Pone la voz `nombre` en el panel del hablante (la busca por su nombre). */
async function ponerVoz(page: Page, nombre: string): Promise<void> {
  const puesta = (await hablante(page).innerText()).match(/Speaker 1\s*-\s*(\S+)/)?.[1] ?? ''
  if (puesta.toLowerCase() === nombre.toLowerCase()) return
  await hablante(page).click()
  const panel = page.locator('.cdk-overlay-pane').filter({ hasText: 'Speaker settings' }).last()
  await panel.waitFor({ timeout: 15_000 })
  try {
    await panel.locator('input[aria-label="Search voices"]').fill(nombre)
    const seguro = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await panel.locator('button[aria-label]').filter({ hasText: new RegExp(`^\\s*${seguro}\\b`, 'i') }).first().click({ timeout: 15_000 })
    await page.waitForTimeout(500)
  } finally {
    await page.keyboard.press('Escape').catch(() => {})
  }
}

/**
 * Genera el WAV en AI Studio con la cuenta conectada: pega el texto, pone la voz,
 * Run, espera a que el audio termine de llegar y lo baja a `salida`.
 */
/** En el turno del perfil: Flow usa el mismo Edge y no deben pisarse. */
export function generarVozGoogle(texto: string, voz: string, salida: string): Promise<void> {
  return perfilDeLaVoz().enTurno(() => generarVozGoogleYa(texto, voz, salida))
}

async function generarVozGoogleYa(texto: string, voz: string, salida: string): Promise<void> {
  if (!correo) throw new Error('Conecta tu cuenta de Google para generar la voz sin llave.')
  // Cada frase baja a su propia carpeta: si Edge aún escribe una descarga anterior, no se pisan (antes, la carpeta
  // compartida no se podía borrar —«directorio no vacío»— y la frase fallaba entera).
  const descargas = join(carpeta(), 'descargas')
  limpiarDescargasViejas(descargas)
  const bajada = join(descargas, randomUUID().slice(0, 8))
  let b: Browser | null = null
  try {
    b = await abrirEdge()
    const page = await b.contexts()[0].newPage()
    const caja = await abrirDialogo(page)
    await ponerVoz(page, voz)
    await caja.fill(texto)

    mkdirSync(bajada, { recursive: true })
    await (await b.newBrowserCDPSession()).send('Browser.setDownloadBehavior', {
      behavior: 'allowAndName',
      downloadPath: bajada,
      eventsEnabled: true
    })

    const respuesta = page.waitForResponse((r) => r.url().includes('MakerSuiteService/GenerateContent'), { timeout: 15 * 60_000 })
    await page.locator('button:has-text("Run")').last().click()
    const r = await respuesta
    if (r.status() !== 200) throw new Error(`AI Studio no generó la voz (${r.status()}). Si es la cuota del día, prueba mañana o usa la llave de AI Studio.`)
    const corte = await r.finished()
    if (corte) throw new Error('AI Studio cortó la voz a medias. Inténtalo una vez más.')

    // El botón Download sale antes de que el audio esté completo: se repite hasta que baje.
    const bajar = page.getByRole('button', { name: 'Download' }).first()
    await bajar.waitFor({ timeout: 120_000 })
    let wav: string | null = null
    for (let i = 0; i < 10 && !wav; i++) {
      await page.mouse.move(5, 5)
      await bajar.click({ force: true })
      for (let k = 0; k < 20 && !wav; k++) {
        await espera(300)
        wav = await descargaCompleta(bajada)
      }
    }
    if (!wav) throw new Error('El WAV de AI Studio no bajó.')
    mkdirSync(dirname(salida), { recursive: true })
    copyFileSync(wav, salida)
  } finally {
    try {
      rmSync(bajada, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    } catch {
      // Si Edge aún la tiene abierta, se borra en la próxima frase (limpiarDescargasViejas).
    }
    await b?.close().catch(() => {})
    await cerrarEdge().catch(() => {})
  }
}

/**
 * Un WAV ya bajado del todo: no el temporal de Edge (.crdownload) y con el tamaño quieto entre dos miradas (si sigue
 * creciendo, aún se está escribiendo).
 */
async function descargaCompleta(carpeta: string): Promise<string | null> {
  const lista = (): { ruta: string; tam: number }[] => {
    try {
      return readdirSync(carpeta)
        .filter((f) => !/\.(crdownload|tmp|partial)$/i.test(f))
        .map((f) => ({ ruta: join(carpeta, f), tam: statSync(join(carpeta, f)).size }))
        .filter((x) => x.tam > 44)
    } catch {
      return []
    }
  }
  const antes = lista()
  if (!antes.length) return null
  await espera(250)
  const ahora = lista()
  const quieto = antes.find((a) => ahora.some((x) => x.ruta === a.ruta && x.tam === a.tam))
  return quieto?.ruta ?? null
}

/** Borra las carpetas de descarga de frases de hace más de una hora (las que Edge no dejó borrar). */
function limpiarDescargasViejas(descargas: string): void {
  try {
    for (const n of readdirSync(descargas)) {
      const ruta = join(descargas, n)
      try {
        if (Date.now() - statSync(ruta).mtimeMs > 3_600_000) rmSync(ruta, { recursive: true, force: true })
      } catch {
        // En uso: la próxima vez.
      }
    }
  } catch {
    // Aún no existe.
  }
}

/**
 * Conecta la cuenta de Google: abre el Edge del perfil con la página de entrada y
 * espera (hasta 10 min) a que la pestaña llegue a AI Studio con sesión. Se cierra
 * solo al conseguirlo; si cierras la ventana antes, se cancela.
 */
export async function conectarVozGoogle(): Promise<EstadoVozGoogle> {
  if (conectando) return estadoVozGoogle()
  return perfilDeLaVoz().enTurno(conectarVozGoogleYa)
}

async function conectarVozGoogleYa(): Promise<EstadoVozGoogle> {
  if (conectando) return estadoVozGoogle()
  if (!edgeExe()) {
    error = 'No encuentro Edge en este equipo: hace falta para entrar con Google.'
    return estadoVozGoogle()
  }
  conectando = true
  error = undefined
  try {
    // Si el perfil ya tiene la sesión, basta con leer la cuenta.
    await lanzarEdge(false)
    if (await sesionEnEdge()) {
      const b = await abrirEdge()
      try {
        const page = await b.contexts()[0].newPage()
        await abrirDialogo(page)
      } finally {
        await b.close()
      }
      await cerrarEdge()
      if (!correo) throw new Error('AI Studio no abrió con tu cuenta de Google.')
      return estadoVozGoogle()
    }
    await cerrarEdge()
    await lanzarEdge(true)
    // Google pone la sesión al llegar a AI Studio; se piden unos segundos seguidos ahí.
    let sesion = false
    for (let i = 0, seguidas = 0; i < 400 && !sesion; i++) {
      await espera(1500)
      if (!(await conVentana())) break
      seguidas = (await enAIStudio()) && (await sesionEnEdge()) ? seguidas + 1 : 0
      sesion = seguidas >= 3
    }
    if (!sesion) throw new Error('No entraste con Google en la ventana de Edge. Vuelve a intentarlo.')
    const b = await abrirEdge().catch(() => null)
    if (b) {
      try {
        const page = await b.contexts()[0].newPage()
        await abrirDialogo(page)
      } finally {
        await b.close()
      }
    }
    await cerrarEdge()
    if (!correo) throw new Error('AI Studio no abrió con tu cuenta de Google.')
    return estadoVozGoogle()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    await cerrarEdge().catch(() => {})
    return estadoVozGoogle()
  } finally {
    conectando = false
  }
}

/** El correo de la cuenta de la voz (para Flow, que genera con ella). */
export const correoVozGoogle = (): string | null => correo

/** Olvida la cuenta (el perfil de Edge se queda por si vuelves). */
export function desconectarVozGoogle(): EstadoVozGoogle {
  correo = null
  guardarCuenta()
  return estadoVozGoogle()
}

// `homedir` queda referenciado para futuras rutas de perfil en Mac/Linux.
void homedir
