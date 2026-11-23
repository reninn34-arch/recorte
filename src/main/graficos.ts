import { BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { htmlDeGrafico, type Grafico } from '../shared/grafico'
import { FUENTES_TEXTO, letraDe, type LetraTL } from '../shared/timeline'
import { rutaScriptPython } from './transcribir'

/**
 * Dibuja un gráfico editable (src/shared/grafico.ts) a un PNG con transparencia, con Chromium en una ventana oculta:
 * el mismo motor que el monitor, así que la letra, el degradado y la sombra salen igual. La imagen queda en
 * `graficos/` del proyecto con la huella de su diseño en el nombre: el mismo diseño no se dibuja dos veces.
 */

export interface GraficoDibujado {
  /** Ruta absoluta del PNG. */
  ruta: string
  /** Su tamaño en píxeles (ya con la escala del video). */
  ancho: number
  alto: number
}

/** Las letras de la app (Playfair Display, Anton) que el editor carga con @font-face. */
function fuentesDeLaApp(): string {
  const dir = rutaScriptPython('fuentes')
  if (!existsSync(dir)) return ''
  const css: string[] = []
  for (const n of readdirSync(dir)) {
    if (!/\.ttf$/i.test(n)) continue
    const url = pathToFileURL(join(dir, n)).href
    if (/^Anton/i.test(n)) css.push(`@font-face{font-family:'Anton';src:url('${url}');font-weight:400;}`)
    else if (/^PlayfairDisplay-BoldItalic/i.test(n)) css.push(`@font-face{font-family:'Playfair Display';src:url('${url}');font-weight:700;font-style:italic;}`)
    else if (/^PlayfairDisplay-Bold/i.test(n)) css.push(`@font-face{font-family:'Playfair Display';src:url('${url}');font-weight:700;}`)
  }
  return css.join('\n')
}

let cola: Promise<unknown> = Promise.resolve()

/** Dibuja de a uno (cada dibujo abre su ventana oculta): así no se juntan muchas a la vez. */
export function dibujarGrafico(
  carpetaProyecto: string,
  g: Grafico,
  opciones: OpcionesDibujo
): Promise<GraficoDibujado> {
  const hecho = cola.then(() => dibujar(carpetaProyecto, g, opciones))
  cola = hecho.catch(() => undefined)
  return hecho
}

export interface OpcionesDibujo {
  letras?: LetraTL[]
  /** Las imágenes del gráfico (un medio, `logo`) por su ruta. */
  imagenes: Record<string, string>
  escala: number
  /**
   * Para el kit del agente: la carpeta de trabajo, donde un texto puede usar una letra por su archivo («fuentes/x.ttf»)
   * y una imagen por su ruta («entrada/logo.png»); y dónde va el PNG (si no, a `graficos/` del proyecto).
   */
  base?: string
  salida?: string
}

/** Un archivo de la carpeta de trabajo (sin salirse de ella), o null. */
function enBase(base: string | undefined, rel: string | undefined): string | null {
  if (!base || !rel || isAbsolute(rel)) return null
  const raiz = resolve(base)
  const ruta = resolve(raiz, rel)
  return ruta.startsWith(raiz + sep) && existsSync(ruta) ? ruta : null
}

async function dibujar(carpetaProyecto: string, g: Grafico, opciones: OpcionesDibujo): Promise<GraficoDibujado> {
  const escala = Math.min(4, Math.max(0.5, opciones.escala))
  const propias = (opciones.letras ?? [])
    .filter((l) => existsSync(join(carpetaProyecto, l.archivo)))
    .map((l) => `@font-face{font-family:'Recorte ${l.id}';src:url('${pathToFileURL(join(carpetaProyecto, l.archivo)).href}');}`)
  // Las letras por archivo (el kit): cada una con su familia.
  const porArchivo = new Map<string, string>()
  for (const e of g.elementos) {
    if (e.tipo !== 'texto' || !e.fuente || !/\.(ttf|otf)$/i.test(e.fuente) || porArchivo.has(e.fuente)) continue
    const ruta = enBase(opciones.base, e.fuente)
    if (!ruta) continue
    const familia = `Grafico ${porArchivo.size + 1}`
    porArchivo.set(e.fuente, familia)
    propias.push(`@font-face{font-family:'${familia}';src:url('${pathToFileURL(ruta).href}');}`)
  }
  const html = htmlDeGrafico(
    g,
    {
      familia: (f) => (f && porArchivo.has(f) ? porArchivo.get(f) : f && FUENTES_TEXTO[f] ? FUENTES_TEXTO[f].familia : letraDe(f, opciones.letras)?.css),
      fuentesCss: `${fuentesDeLaApp()}\n${propias.join('\n')}`,
      imagen: (m) => {
        const ruta = opciones.imagenes[m] && existsSync(opciones.imagenes[m]) ? opciones.imagenes[m] : enBase(opciones.base, m)
        return ruta ? pathToFileURL(ruta).href : undefined
      }
    },
    escala
  )
  const carpeta = opciones.salida ? dirname(opciones.salida) : join(carpetaProyecto, 'graficos')
  mkdirSync(carpeta, { recursive: true })
  // La huella del HTML (que ya lleva el diseño, las letras y las imágenes): el mismo gráfico es el mismo archivo.
  const huella = createHash('sha1').update(html).digest('hex').slice(0, 12)
  const ruta = opciones.salida ?? join(carpeta, `grafico-${huella}.png`)
  const paginaHtml = join(carpeta, `grafico-${huella}.html`)
  // Ya dibujado (el mismo diseño): su tamaño sale de la cabecera del PNG.
  if (!opciones.salida && existsSync(ruta)) {
    const cab = readFileSync(ruta).subarray(16, 24)
    if (cab.length === 8) return { ruta, ancho: cab.readUInt32BE(0), alto: cab.readUInt32BE(4) }
  }
  writeFileSync(paginaHtml, html, 'utf8')
  try {
    return await fotografiar(paginaHtml, ruta)
  } catch {
    // Una ventana que quedó mal: se cierra y se prueba una vez más con otra.
    cerrarVentana()
    return await fotografiar(paginaHtml, ruta)
  } finally {
    try {
      rmSync(paginaHtml, { force: true })
    } catch {
      // Se queda la página; no molesta.
    }
  }
}

/** Una sola ventana oculta para todos los dibujos; se cierra sola al rato sin uso. */
let ventana: BrowserWindow | null = null
let cierre: ReturnType<typeof setTimeout> | null = null

function cerrarVentana(): void {
  if (cierre) clearTimeout(cierre)
  cierre = null
  if (ventana && !ventana.isDestroyed()) ventana.destroy()
  ventana = null
}

function ventanaOculta(): BrowserWindow {
  if (cierre) clearTimeout(cierre)
  cierre = setTimeout(cerrarVentana, 60_000)
  if (ventana && !ventana.isDestroyed()) return ventana
  ventana = new BrowserWindow({
    show: false,
    width: 4000,
    height: 4000,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true }
  })
  ventana.webContents.setFrameRate(60)
  return ventana
}

async function fotografiar(paginaHtml: string, ruta: string): Promise<GraficoDibujado> {
  const v = ventanaOculta()
  v.setContentSize(4000, 4000)
  await v.loadFile(paginaHtml)
  // Que estén las letras y las imágenes antes de medir y sacar la foto.
  const caja = (await v.webContents.executeJavaScript(
    `(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = document.getElementById('marco').getBoundingClientRect();
      return { w: Math.ceil(b.width), h: Math.ceil(b.height) };
    })()`,
    true
  )) as { w: number; h: number }
  const w = Math.max(1, Math.min(4000, caja.w))
  const h = Math.max(1, Math.min(4000, caja.h))
  // Una ventana del tamaño justo: la foto sale sin bordes de más.
  v.setContentSize(w, h)
  await v.webContents.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', true)
  let foto = await v.webContents.capturePage({ x: 0, y: 0, width: w, height: h })
  // En pantallas con escala (125 %, 150 %) la foto sale más grande: se deja del tamaño pedido.
  const tam = foto.getSize()
  if (tam.width !== w || tam.height !== h) foto = foto.resize({ width: w, height: h, quality: 'best' })
  if (foto.isEmpty()) throw new Error('No pude dibujar el gráfico.')
  writeFileSync(ruta, foto.toPNG())
  return { ruta, ancho: w, alto: h }
}

