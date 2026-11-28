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
  readonly aviso: string
  readonly sinSesion: boolean
  constructor(mensaje: string, aviso: string, sinSesion = false) {
    super(mensaje)
    this.aviso = aviso
    this.sinSesion = sinSesion
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
  return costoEnPanel(page)
}

/** Lee el costo en el panel de ajustes del compositor (abierto): vale cuando dos lecturas seguidas coinciden. Lo cierra. */
async function costoEnPanel(page: Page): Promise<number> {
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
  const antes = await referenciasPuestas(page).count()
  const esVideo = ['.mp4', '.mov', '.webm'].includes(ext)
  await selector.setFiles({
    name: nombre,
    mimeType: esVideo ? (ext === '.mov' ? 'video/quicktime' : ext === '.webm' ? 'video/webm' : 'video/mp4') : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg',
    buffer: readFileSync(ruta)
  })
  // Si Flow pide confirmar los derechos de la imagen (el usuario los declaró en Ajustes): solo en un diálogo que
  // hable de derechos. El panel de elegir referencias también es un diálogo, y su último botón es otra imagen.
  await page
    .locator('mat-dialog-container, [role=alertdialog]')
    .filter({ hasText: /derecho|rights|permiso|permission|autoriz/i })
    .locator('button')
    .last()
    .click({ timeout: 3000 })
    .catch(() => {})
  // Está subida cuando deja de decir «Subiendo» (Flow ya no enseña miniatura de lo que subes, solo un icono).
  // Por su nombre sin extensión: Flow enseña los videos subidos sin «.mp4» (las imágenes, con ella).
  const item = panel.locator('button[role=option]').filter({ hasText: nombre.slice(0, -ext.length) }).first()
  await item.waitFor({ timeout: 30_000 }).catch(() => {
    throw new Error(`Flow no empezó a subir la referencia ${ruta}.`)
  })
  // Un video tarda más en subir y procesarse que una imagen.
  for (const limite = Date.now() + (esVideo ? 300_000 : 120_000); ; ) {
    const texto = await item.innerText().catch(() => 'subiendo')
    if (!/subiendo|uploading|cargando|loading|procesando|processing/i.test(texto)) break
    if (Date.now() > limite) throw new Error(`Flow no terminó de subir ${esVideo ? 'el video' : 'la referencia'} ${ruta} a tiempo.`)
    await page.waitForTimeout(1000)
  }
  await item.click({ timeout: 10_000 })
  // Un video recién subido queda puesto al elegirlo; uno que ya estaba enseña antes su tira para recortar el tramo: se usa
  // entero (ya va cortado) con «Añadir a petición».
  if (esVideo) {
    const anadir = page.getByText(/Añadir a petición|Add to prompt/i).first()
    for (const limite = Date.now() + 20_000; (await referenciasPuestas(page).count()) <= antes && Date.now() < limite; ) {
      if (await anadir.isVisible().catch(() => false)) await anadir.click({ timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(500)
    }
  }
  // Elegida, queda puesta como «ingrediente» en el compositor.
  for (const limite = Date.now() + 10_000; (await referenciasPuestas(page).count()) <= antes; ) {
    if (Date.now() > limite) throw new Error(`Flow subió la referencia ${ruta} pero no la puso en el pedido.`)
    await page.waitForTimeout(300)
  }
}

/** El costo con lo que ya está puesto en el compositor (un video a editar cambia lo que dura y lo que cuesta). */
async function costoAhora(page: Page): Promise<number> {
  await page.locator('.base-prompt-box button:has(mat-icon:text-matches("^crop_"))').first().click({ timeout: 15_000 })
  await page.waitForTimeout(800)
  return costoEnPanel(page)
}

/** Las referencias puestas en el compositor (antes iban en `.prompt-top-row`; ahora son «ingredientes»). */
const referenciasPuestas = (page: Page) =>
  page.locator('.base-prompt-box flow-ingredient-chip, .base-prompt-box flow-image-ingredient-chip, .base-prompt-box flow-video-ingredient-chip, .base-prompt-box .prompt-top-row img')

async function ponerReferencias(page: Page, rutas: string[]) {
  // Las del pedido anterior se quitan: cada una se quita al pulsarla (enseña una ✕).
  for (let i = await referenciasPuestas(page).count(); i > 0; i--) {
    await page
      .locator('.base-prompt-box flow-ingredient-chip button, .base-prompt-box flow-image-ingredient-chip button, .base-prompt-box button:has(mat-icon:text-is("cancel"))')
      .first()
      .click({ timeout: 5000 })
    await page.waitForTimeout(400)
  }
  if (await referenciasPuestas(page).count()) throw new Error('No pude quitar las referencias del pedido anterior en Flow.')
  for (const ruta of rutas) await subirReferencia(page, ruta)
}

/** Cierra lo que quedó abierto en Flow (el panel de referencias, un menú): si no, tapa el compositor al siguiente pedido. */
export async function cerrarPaneles(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await page.locator('.cdk-overlay-pane').count().catch(() => 0)) > 0; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
  }
  const cerrar = page.locator('.cdk-overlay-pane button:has(mat-icon:text-is("close"))').first()
  if (await cerrar.count().catch(() => 0)) await cerrar.click({ timeout: 3000 }).catch(() => {})
}

/** Flow avisa en el compositor cuando no hay puntos para lo elegido. */
async function sinPuntos(page: Page): Promise<boolean> {
  return (await page.locator('.base-prompt-box button[aria-label*="insuficiente" i], .base-prompt-box button[aria-label*="insufficient" i]').count().catch(() => 0)) > 0
}

/** El texto de un prompt como lo enseña Flow en su tarjeta mientras genera: sin saltos ni espacios dobles. */
const plano = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Una pestaña de Flow en el proyecto de Recorte, donde se mandan los pedidos de una cuenta uno
 * tras otro sin esperar a que acaben: Flow los genera a la vez (se probó con 8 imágenes).
 *
 * Cómo se sabe cuál tarjeta es de cada pedido: las nuevas salen siempre arriba y, mientras
 * genera, la tarjeta enseña el prompt (así se confirma que es la suya). Al terminar Flow cambia
 * la tarjeta por otra con la imagen en el mismo sitio. Cada pedido guarda cuántas tarjetas se
 * habían puesto en la pestaña al mandarlo (`puestas`): la suya está en la posición
 * `puestas ahora − puestas suyas`.
 */
export class PestanaFlow {
  /** Tarjetas que Recorte ha puesto arriba en esta pestaña (pedidos y referencias subidas). */
  puestas = 0
  /** Los pedidos que siguen generando en la pestaña. */
  enMarcha = 0
  proyecto: string | undefined
  /** Lo último elegido en el compositor y su costo: si el siguiente pide lo mismo no se vuelve a elegir. */
  private elegido: { clave: string; costo: number } | null = null
  private cola: Promise<unknown> = Promise.resolve()

  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  /** Lo que toca el compositor o los menús (elegir, escribir, mandar, bajar): de uno en uno. */
  aSolas<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.cola.then(fn, fn)
    this.cola = r.catch(() => {})
    return r
  }

  /** Tras un fallo no se sabe qué quedó elegido en el compositor: el siguiente pedido lo vuelve a elegir. */
  olvidarEleccion(): void {
    this.elegido = null
  }

  async costo(p: PedidoFlow): Promise<number> {
    const clave = `${p.tipo}|${p.formato}|${p.modelo ?? ''}`
    if (this.elegido?.clave === clave) return this.elegido.costo
    this.elegido = null
    const costo = await elegir(this.page, p)
    this.elegido = { clave, costo }
    return costo
  }

  tarjeta(puestaSuya: number): Locator {
    return this.page.locator('flow-tile-container').nth(this.puestas - puestaSuya)
  }

  /** La primera tarjeta que ya tiene imagen y su posición: la marca para contar las que salen encima. */
  ancla(): Promise<Ancla | null> {
    return this.page.evaluate(() => {
      const ts = [...document.querySelectorAll('flow-tile-container')]
      const i = ts.findIndex((t) => t.querySelector('[data-media-id]'))
      return i < 0 ? null : { i, id: ts[i].querySelector('[data-media-id]')?.getAttribute('data-media-id') ?? '' }
    })
  }

  /** Cuántas tarjetas salieron encima de la marca desde que se tomó. */
  async nuevasDesde(ancla: Ancla | null): Promise<number> {
    if (!ancla) return 0
    const j = await this.page.evaluate(
      (id) => [...document.querySelectorAll('flow-tile-container')].findIndex((t) => t.querySelector(`[data-media-id="${id}"]`)),
      ancla.id
    )
    return j < 0 ? 0 : Math.max(0, j - ancla.i)
  }
}

type Ancla = { i: number; id: string }

/**
 * Espera a que salga arriba la tarjeta del pedido: una más encima de la marca y, arriba, su
 * prompt (los prompts suelen empezar igual: lo que manda es la marca). Si no sale, Flow no lo
 * empezó y no gastó.
 */
async function esperarQueEmpiece(pest: PestanaFlow, prompt: string, ancla: Ancla | null) {
  const { page } = pest
  const inicio = plano(prompt).slice(0, 40)
  const limite = Date.now() + EMPIEZA_MS
  for (;;) {
    const arriba = await page
      .locator('flow-tile-container')
      .first()
      .evaluate((d) => (d as HTMLElement).innerText)
      .catch(() => '')
    if (plano(arriba).includes(inicio) && (!ancla || (await pest.nuevasDesde(ancla)) >= 1)) return
    if (Date.now() > limite) {
      const aviso = await avisos(page)
      throw new NoEmpezo(`Flow no empezó a generar${aviso ? `: ${aviso}` : ' (¿sin créditos?)'}.`, aviso)
    }
    await page.waitForTimeout(700)
  }
}

/** Espera a que la tarjeta termine (sin % y con imagen o reproducir). La tarjeta se busca cada vez: Flow la cambia al acabar. */
async function esperarQueTermine(page: Page, tarjeta: () => Locator, tipo: PedidoFlow['tipo']) {
  const fin = Date.now() + TERMINA_MS
  let ultimoAvance = Date.now()
  while (Date.now() < fin) {
    const e = await tarjeta()
      .evaluate((d, esVideo) => {
        const texto = (d as HTMLElement).innerText
        const img = d.querySelector('img')
        const avanza = /\d+\s*%/.test(texto)
        return { avanza, lista: !avanza && (esVideo ? /play_arrow/.test(texto) : !!img?.complete && img.naturalWidth > 0), texto }
      }, tipo === 'video')
      .catch(() => ({ avanza: true, lista: false, texto: '' }))
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
  try {
    const ruta = await Promise.race([
      bajado,
      new Promise<string>((_, mal) => setTimeout(() => mal(new Error('Lo generado no bajó en 2 minutos.')), 120_000))
    ])
    return conExtension(ruta, tipo)
  } finally {
    await cdp.detach().catch(() => {})
  }
}

/** Abre la pestaña de Flow de la cuenta en el proyecto de Recorte (o crea uno). */
export async function abrirPestanaFlow(b: Browser, url: string | undefined): Promise<PestanaFlow> {
  const p = new PestanaFlow(await abrirPagina(b))
  p.proyecto = await proyecto(p.page, url)
  return p
}

/**
 * Genera el pedido en la pestaña y lo baja a `carpeta`. Mandarlo y bajarlo van de uno en uno;
 * la espera mientras Flow genera, a la vez con los demás pedidos de la pestaña. Si cuesta más
 * que el tope, no genera.
 */
export async function generarEnPestana(
  b: Browser,
  pest: PestanaFlow,
  p: PedidoFlow,
  tope: number,
  carpeta: string,
  enDescarga: <T>(fn: () => Promise<T>) => Promise<T>
): Promise<{ creditos: number; archivo: string }> {
  const { page } = pest
  const { creditos, suya } = await pest.aSolas(async () => {
    // Todo lo que salga arriba desde aquí (referencias subidas y la tarjeta del pedido) se cuenta con esta marca,
    // también si algo falla: de eso depende encontrar las tarjetas de los demás pedidos de la pestaña.
    const marca = await pest.ancla()
    try {
      let creditos = await pest.costo(p)
      // Editando un video, lo que cuesta depende de lo que dura: se mira cuando ya está puesto.
      if (!p.video && creditos > tope) throw new NoEmpezo(`Cuesta ${creditos} créditos y el tope es ${tope}. No se generó nada.`, '')
      if (!p.video && creditos > 0 && (await sinPuntos(page))) {
        throw new NoEmpezo(`A esta cuenta de Flow no le quedan puntos para esto (cuesta ${creditos}). No se generó nada.`, 'puntos insuficientes')
      }
      await ponerReferencias(page, [...(p.referencias ?? []), ...(p.video ? [p.video] : [])])
      if (p.video) {
        // Lo elegido ya no vale para el siguiente pedido (el costo era el de este video).
        pest.olvidarEleccion()
        creditos = await costoAhora(page)
        if (creditos > tope) throw new NoEmpezo(`Editar este video cuesta ${creditos} puntos y el tope es ${tope}. No se generó nada.`, '')
        if (creditos > 0 && (await sinPuntos(page))) {
          throw new NoEmpezo(`A esta cuenta de Flow no le quedan puntos para esto (cuesta ${creditos}). No se generó nada.`, 'puntos insuficientes')
        }
      }
      await caja(page).click({ timeout: 10_000 })
      await page.keyboard.insertText(p.prompt.split(/\s+/).join(' '))
      await page.waitForTimeout(400)
      const ancla = await pest.ancla()
      await boton(page, 'arrow_forward').last().click({ timeout: 10_000 })
      await esperarQueEmpiece(pest, p.prompt, ancla)
      // Las referencias y la del pedido (arriba del todo); si no había marca (proyecto vacío), la del pedido.
      pest.puestas += Math.max(1, await pest.nuevasDesde(marca))
      return { creditos, suya: pest.puestas }
    } catch (e) {
      pest.puestas += await pest.nuevasDesde(marca).catch(() => 0)
      pest.olvidarEleccion()
      // Que no quede abierto el panel de referencias o un menú: taparía el compositor en el siguiente pedido.
      await cerrarPaneles(page)
      throw e
    }
  })
  pest.enMarcha++
  try {
    await esperarQueTermine(page, () => pest.tarjeta(suya), p.tipo)
    const archivo = await pest.aSolas(() => enDescarga(() => bajar(page, b, pest.tarjeta(suya), carpeta, p.tipo)))
    return { creditos, archivo }
  } finally {
    pest.enMarcha--
  }
}
