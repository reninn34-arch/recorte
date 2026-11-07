import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Browser, Locator, Page } from 'playwright-core'
import { costoDe, creditosDe, ICONO_FORMATO, MODELOS_IMAGEN, MODELOS_VIDEO, PALABRA_CREDITOS, type PedidoFlow } from '../shared/flow'

/**
 * Lo que Recorte hace en la página de Google Flow, como lo haría la persona: entrar al
 * proyecto de Recorte (o crearlo), elegir tipo, formato, cantidad y modelo, leer el costo,
 * escribir la petición, esperar a que salga y bajarlo.
 *
 * Los botones se reconocen por el nombre de su icono (`mat-icon`), que no cambia con el
 * idioma de la cuenta. La ventana es angosta a propósito: así Flow enseña su compositor
 * directo, que dice cuánto cuesta, y no su chat con un agente, que no lo dice.
 */

export const URL_FLOW = 'https://flow.google.com/'
const ANCHO = 800
const ALTO = 1000
/** Lo que se espera a que aparezca la tarjeta del pedido; si no aparece, Flow no lo empezó (no gastó). */
const EMPIEZA_MS = 45_000
const TERMINA_MS = 10 * 60_000

/** Flow no empezó a generar, así que no gastó: el pedido puede ir a otra cuenta. */
export class NoEmpezo extends Error {
  constructor(
    mensaje: string,
    readonly aviso: string,
    readonly sinSesion = false
  ) {
    super(mensaje)
  }
}

const boton = (donde: Page | Locator, icono: string) => donde.locator(`button:has(mat-icon:text-is("${icono}"))`)
const caja = (page: Page) => page.locator('.base-prompt-box [role=textbox]').first()

export async function abrirPagina(b: Browser): Promise<Page> {
  const page = await b.contexts()[0].newPage()
  await page.setViewportSize({ width: ANCHO, height: ALTO })
  return page
}

async function ir(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  if (page.url().startsWith('https://accounts.google.com/')) {
    throw new NoEmpezo('Esta cuenta perdió su sesión de Google: vuelve a conectarla en Ajustes.', '', true)
  }
}

/** Lo que dice Flow en sus avisos, para explicar por qué no generó. */
async function avisos(page: Page): Promise<string> {
  return page
    .evaluate(() =>
      [...document.querySelectorAll('[role=alert], [role=status], mat-snack-bar-container')]
        .map((d) => (d as HTMLElement).innerText.trim())
        .filter(Boolean)
        .join(' · ')
    )
    .catch(() => '')
}

/** El correo de la cuenta, de su botón («Cuenta de Google: Nombre (correo)»). */
export async function correoEnFlow(page: Page): Promise<string | null> {
  await ir(page, URL_FLOW)
  const etiqueta = await page.locator('[aria-label*="@"]').first().getAttribute('aria-label', { timeout: 15_000 }).catch(() => null)
  return etiqueta?.match(/\(([^()\s]+@[^()\s]+)\)/)?.[1] ?? null
}

/** Los créditos que le quedan, del menú de la cuenta (su renglón lleva el icono `movie_filter_auto`). */
export async function leerCreditos(page: Page, irAlInicio = true): Promise<number | null> {
  if (irAlInicio) await ir(page, URL_FLOW)
  await page.locator('.header-user-button').first().click({ timeout: 15_000 })
  const icono = page.locator('mat-icon:text-is("movie_filter_auto")').first()
  if (!(await icono.waitFor({ timeout: 10_000 }).then(() => true, () => false))) return null
  const texto = await icono.evaluate((d) => {
    let e = d as HTMLElement
    for (let i = 0; i < 4 && e.parentElement && !/\d/.test(e.innerText); i++) e = e.parentElement
    return e.innerText
  })
  await page.keyboard.press('Escape').catch(() => {})
  return creditosDe(texto)
}

/**
 * «Ayudar a mejorar Flow» (que Google use lo generado), en el menú principal. Lo deja como
 * se pide y lo comprueba recargando; si no quedó, falla sin generar.
 */
export async function ponerAyudarAMejorar(page: Page, quiere: boolean) {
  const leer = async () => {
    await ir(page, URL_FLOW)
    await boton(page, 'more_vert').first().click({ timeout: 20_000 })
    const opcion = page.getByRole('menuitemcheckbox').first()
    await opcion.waitFor({ timeout: 10_000 })
    // Al abrir el menú, el interruptor tarda en enseñar lo guardado.
    await page.waitForTimeout(3500)
    return { opcion, puesto: (await opcion.getAttribute('aria-checked')) === 'true' }
  }
  const { opcion, puesto } = await leer()
  if (puesto === quiere) {
    await page.keyboard.press('Escape')
    return
  }
  await opcion.click({ timeout: 10_000 })
  // Apagarlo pide confirmar: el último botón del diálogo.
  await page.locator('[role=dialog] button, [role=alertdialog] button, mat-dialog-container button').last().click({ timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(3000)
  const despues = await leer()
  await page.keyboard.press('Escape')
  if (despues.puesto !== quiere) throw new Error('No pude cambiar «Ayudar a mejorar Flow». No se generó nada.')
}

/** Entra al proyecto de Recorte en Flow o crea uno. Devuelve su dirección. */
async function proyecto(page: Page, url: string | undefined): Promise<string> {
  if (url) {
    await ir(page, url)
    if (await caja(page).waitFor({ timeout: 15_000 }).then(() => true, () => false)) return url
  }
  await ir(page, URL_FLOW)
  await boton(page, 'add')
    .last()
    .click({ timeout: 20_000 })
    .catch(() => {
      throw new NoEmpezo(
        'Flow no dejó crear un proyecto. Si es la primera vez con esta cuenta, ábrela en Ajustes → Google Flow → «Abrir Flow» y acepta su aviso.',
        ''
      )
    })
  await page.waitForURL(/\/project\//, { timeout: 30_000 })
  await caja(page).waitFor({ timeout: 30_000 })
  await page.keyboard.press('Escape').catch(() => {}) // el recorrido de bienvenida
  return page.url().split('?')[0]
}

/** Elige tipo, formato, cantidad y modelo en el panel del compositor; devuelve el costo. */
async function elegir(page: Page, p: PedidoFlow): Promise<number> {
  await page.locator('.base-prompt-box button:has(mat-icon:text-matches("^crop_"))').first().click({ timeout: 15_000 })
  const opcion = (icono: string) => page.locator(`[role=radio]:has(mat-icon:text-is("${icono}"))`)
  await opcion(p.tipo === 'video' ? 'videocam' : 'image').click({ timeout: 10_000 })
  // Video por «ingredientes» (texto y referencias), no por fotogramas.
  if (p.tipo === 'video') await opcion('chrome_extension').click({ timeout: 10_000 })
  await opcion(ICONO_FORMATO[p.formato] ?? ICONO_FORMATO['9:16']).click({ timeout: 10_000 })
  await page.getByRole('radio', { name: 'x1', exact: true }).click({ timeout: 10_000 })
  const modelo = p.modelo ?? (p.tipo === 'video' ? MODELOS_VIDEO[0] : MODELOS_IMAGEN[0])
  await page.locator('button:has(mat-icon:text-is("arrow_drop_down"))').first().click({ timeout: 10_000 })
  await page.getByRole('menuitem').filter({ hasText: modelo }).first().click({ timeout: 10_000 })
  // El costo se recalcula tras elegir: vale cuando dos lecturas seguidas coinciden.
  const leer = () =>
    page
      .locator('[role=radio]')
      .first()
      .evaluate((d, palabra) => {
        let e = d as HTMLElement
        while (e.parentElement && !new RegExp(palabra, 'i').test(e.innerText)) e = e.parentElement
        return e.innerText
      }, PALABRA_CREDITOS.source)
  let costo = costoDe(await leer())
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500)
    const otro = costoDe(await leer())
    if (i > 0 && otro === costo) break
    costo = otro
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  if (costo === null) throw new NoEmpezo('Flow no dijo cuánto cuesta. No se generó nada.', '')
  return costo
}

/** Sube una referencia en el panel del «+» del compositor. El usuario ya confirmó sus derechos. */
async function subirReferencia(page: Page, ruta: string): Promise<void> {
  await page.locator('.base-prompt-box button:has(mat-icon:text-is("add"))').first().click({ timeout: 10_000 })
  const panel = page.locator('.cdk-overlay-pane').filter({ has: page.locator('mat-icon:text-is("upload")') }).last()
  const [selector] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15_000 }),
    panel.locator('button:has(mat-icon:text-is("upload"))').click({ timeout: 10_000 })
  ])
  const ext = extname(ruta).toLowerCase()
  const nombre = `recorte-${randomBytes(4).toString('hex')}${ext}`
  await selector.setFiles({
    name: nombre,
    mimeType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
    buffer: readFileSync(ruta)
  })
  // Flow pide confirmar los derechos de la imagen: el usuario los declaró en Ajustes.
  await page.locator('mat-dialog-container button').last().click({ timeout: 3000 }).catch(() => {})
  const item = panel.locator('button[role=option]').filter({ hasText: nombre }).first()
  const lista = await item.locator('img[src^="https://"]').waitFor({ timeout: 60_000 }).then(() => true, () => false)
  if (!lista) throw new Error(`Flow no tomó la referencia ${ruta}.`)
  await item.click({ timeout: 10_000 })
}

async function ponerReferencias(page: Page, rutas: string[]) {
  const fotos = page.locator('.base-prompt-box .prompt-top-row img')
  for (let i = await fotos.count(); i > 0; i--) {
    await page.locator('.base-prompt-box button:has(mat-icon:text-is("cancel"))').first().click({ timeout: 5000 })
    await page.waitForTimeout(300)
  }
  for (const ruta of rutas) await subirReferencia(page, ruta)
}

const firma = (t: Locator) => t.evaluate((d) => `${(d as HTMLElement).innerText} ${d.querySelector('img')?.src ?? ''}`).catch(() => '')

/** Espera a que la tarjeta del pedido empiece (cambia) y termine (sin % y con imagen o reproducir). */
async function esperar(page: Page, tarjeta: Locator, tipo: PedidoFlow['tipo'], antes: string) {
  const limite = Date.now() + EMPIEZA_MS
  while ((await firma(tarjeta)) === antes) {
    if (Date.now() > limite) {
      const aviso = await avisos(page)
      throw new NoEmpezo(`Flow no empezó a generar${aviso ? `: ${aviso}` : ' (¿sin créditos?)'}.`, aviso)
    }
    await page.waitForTimeout(1000)
  }
  const fin = Date.now() + TERMINA_MS
  let ultimoAvance = Date.now()
  while (Date.now() < fin) {
    const e = await tarjeta.evaluate((d, esVideo) => {
      const texto = (d as HTMLElement).innerText
      const img = d.querySelector('img')
      const avanza = /\d+\s*%/.test(texto)
      return { avanza, lista: !avanza && (esVideo ? /play_arrow/.test(texto) : !!img?.complete && img.naturalWidth > 0), texto }
    }, tipo === 'video')
    if (e.lista) return
    if (e.avanza) ultimoAvance = Date.now()
    else if (Date.now() - ultimoAvance > 60_000) throw new Error(`Flow no lo generó: ${e.texto.replace(/\s+/g, ' ').slice(0, 200)}`)
    await page.waitForTimeout(2000)
  }
  throw new Error('Flow no terminó en 10 minutos.')
}

/** Pone la extensión que corresponde a lo bajado (Edge lo deja con un nombre sin extensión). */
function conExtension(ruta: string, tipo: PedidoFlow['tipo']): string {
  const b = readFileSync(ruta).subarray(0, 12)
  const ext =
    b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG'
      ? '.png'
      : b[0] === 0xff && b[1] === 0xd8
        ? '.jpg'
        : b.toString('ascii', 8, 12) === 'WEBP'
          ? '.webp'
          : b.toString('ascii', 4, 8) === 'ftyp'
            ? '.mp4'
            : tipo === 'video'
              ? '.mp4'
              : '.png'
  const final = `${ruta}${ext}`
  renameSync(ruta, final)
  return final
}

/** Baja lo de la tarjeta con la opción «download» de su menú. */
async function bajar(page: Page, b: Browser, tarjeta: Locator, carpeta: string, tipo: PedidoFlow['tipo']): Promise<string> {
  mkdirSync(carpeta, { recursive: true })
  const cdp = await b.newBrowserCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: carpeta, eventsEnabled: true })
  const bajado = new Promise<string>((ok, mal) => {
    let guid = ''
    cdp.on('Browser.downloadWillBegin', (e) => {
      guid ||= e.guid
    })
    cdp.on('Browser.downloadProgress', (e) => {
      if (e.guid !== guid) return
      if (e.state === 'completed') ok(join(carpeta, guid))
      if (e.state === 'canceled') mal(new Error('Edge canceló la descarga.'))
    })
  })
  await tarjeta.click({ button: 'right', timeout: 15_000 })
  await page.getByRole('menuitem').filter({ has: page.locator('mat-icon:text-is("download")') }).first().click({ timeout: 10_000 })
  const ruta = await Promise.race([
    bajado,
    new Promise<string>((_, mal) => setTimeout(() => mal(new Error('Lo generado no bajó en 2 minutos.')), 120_000))
  ])
  return conExtension(ruta, tipo)
}

/**
 * Genera el pedido en el proyecto de Recorte y lo baja a `carpeta`. Si cuesta más que el
 * tope, no genera. `alEntrar` recibe el proyecto en cuanto se conoce, para reusarlo.
 */
export async function generarEnFlow(
  b: Browser,
  page: Page,
  url: string | undefined,
  p: PedidoFlow,
  tope: number,
  carpeta: string,
  alEntrar: (url: string) => void
): Promise<{ creditos: number; archivo: string }> {
  alEntrar(await proyecto(page, url))
  const creditos = await elegir(page, p)
  if (creditos > tope) throw new NoEmpezo(`Cuesta ${creditos} créditos y el tope es ${tope}. No se generó nada.`, '')
  await ponerReferencias(page, p.referencias ?? [])
  // La tarjeta nueva sale la primera; cada referencia subida también es una tarjeta.
  const tarjeta = page.locator('flow-tile-container').first()
  const antes = (await tarjeta.count()) ? await firma(tarjeta) : ''
  await caja(page).click({ timeout: 10_000 })
  await page.keyboard.insertText(p.prompt.split(/\s+/).join(' '))
  await page.waitForTimeout(500)
  await boton(page, 'arrow_forward').last().click({ timeout: 10_000 })
  await esperar(page, tarjeta, p.tipo, antes)
  return { creditos, archivo: await bajar(page, b, tarjeta, carpeta, p.tipo) }
}
