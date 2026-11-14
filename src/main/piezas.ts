import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import { extname, join } from 'node:path'
import type { PiezaAnimada, ValoresPieza } from '../shared/piezas'
import { pathAmpliado, resolverBinario } from './binarios'
import { duracionMedio } from './ffmpeg'
import { matarArbol } from './ia'
import { rutaScriptPython } from './transcribir'

/**
 * Las piezas animadas (títulos, rótulos, cierres con logo, llamados a la acción…): diseño en movimiento hecho con
 * HyperFrames (HTML + GSAP, cuadro a cuadro) que entra al editor como una capa con transparencia. Cada pieza es un
 * fragmento en `python/piezas/<id>/pieza.html` con su ficha `pieza.json` (qué se puede cambiar). Recorte la arma al
 * tamaño del video y con la duración pedida, le pasa los datos (texto, colores, logo) y la renderiza en WebM con
 * transparencia. Lo renderizado se guarda por sus datos: la misma pieza con lo mismo no se vuelve a hacer.
 */

const carpetaPiezas = () => rutaScriptPython('piezas')
/** Las animaciones que crea el usuario con su agente: fuera de la app, para que no se pierdan al actualizarla. */
export const carpetaPropias = (): string => join(app.getPath('userData'), 'piezas-propias')
/** Dónde está una pieza: las de la app o las del usuario. */
export function carpetaDePieza(id: string): string | null {
  if (!/^[\w-]{1,80}$/.test(id)) return null
  for (const raiz of [carpetaPiezas(), carpetaPropias()]) if (existsSync(join(raiz, id, 'pieza.html'))) return join(raiz, id)
  return null
}
/** La versión de GSAP que HyperFrames trae consigo (la sirve sin internet). */
const GSAP = 'https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js'
const HF_VERSION = '0.8.206'

export function listarPiezas(): PiezaAnimada[] {
  const piezas: PiezaAnimada[] = []
  for (const [raiz, propia] of [[carpetaPiezas(), false], [carpetaPropias(), true]] as const) {
    if (!existsSync(raiz)) continue
    for (const id of readdirSync(raiz)) {
      try {
        const ficha = JSON.parse(readFileSync(join(raiz, id, 'pieza.json'), 'utf8'))
        if (!existsSync(join(raiz, id, 'pieza.html')) || !Array.isArray(ficha.vars)) continue
        piezas.push({
          id,
          ...ficha,
          duracion: ficha.duracion ?? { defecto: 3, min: 1, max: 10 },
          capa: ficha.capa ?? { x: 0.5, y: 0.5, ancho: 1 },
          ...(propia ? { categoria: 'Mis animaciones', propia: true } : {}),
          muestra: existsSync(join(raiz, id, 'muestra.mp4')) ? join(raiz, id, 'muestra.mp4') : undefined
        })
      } catch {
        // Una pieza rota no tumba la lista.
      }
    }
  }
  const orden = ['Mis animaciones', 'Títulos', 'Rótulos', 'Textos', 'Datos', 'Llamados', 'Transiciones', 'Adornos', 'Cierres']
  return piezas.sort((a, b) => orden.indexOf(a.categoria) - orden.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre))
}

/** HyperFrames: el instalado, o con npx (Node trae npx; la primera vez lo baja). */
export function comandoHyperframes(): string[] | null {
  const hf = resolverBinario('hyperframes')
  if (hf) return [hf]
  const npx = resolverBinario('npx')
  return npx ? [npx, '--yes', `hyperframes@${HF_VERSION}`] : null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;')

/** La composición entera de una pieza: su fragmento dentro de la raíz, al tamaño y la duración pedidos. */
export function armarComposicion(pieza: PiezaAnimada, fragmento: string, valores: ValoresPieza, ancho: number, alto: number, duracion: number): string {
  const guion = /<script>([\s\S]*?)<\/script>/.exec(fragmento)?.[1] ?? ''
  const cuerpo = fragmento.replace(/<script>[\s\S]*?<\/script>/, '')
  const declaraciones = pieza.vars.map((x) => ({
    id: x.id,
    type: x.tipo === 'color' ? 'color' : x.tipo === 'numero' ? 'number' : x.tipo === 'si' ? 'boolean' : 'string',
    label: x.nombre,
    default: valores[x.id] ?? (x.tipo === 'si' ? false : x.tipo === 'numero' ? 0 : '')
  }))
  return `<!doctype html>
<html lang="es" data-composition-variables='${esc(JSON.stringify(declaraciones))}'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${ancho}, height=${alto}" />
    <script src="${GSAP}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${ancho}px; height: ${alto}px; overflow: hidden; background: transparent; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${duracion.toFixed(2)}" data-width="${ancho}" data-height="${alto}">
${cuerpo}
    </div>
    <script>
      (function () {
        window.__timelines = window.__timelines || {}
        const tl = gsap.timeline({ paused: true })
        const W = ${ancho}, H = ${alto}, DUR = ${duracion.toFixed(3)}
        const v = Object.assign(${JSON.stringify(valores)}, (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {})
        ${guion}
        // Que dure lo pedido aunque la animación acabe antes (lo último queda quieto).
        if (tl.duration() < DUR) tl.set({}, {}, DUR)
        window.__timelines['main'] = tl
      })()
    </script>
  </body>
</html>
`
}

/**
 * Renderiza una pieza con sus valores a WebM con transparencia en `media/` del proyecto. `imagenes` son las rutas de
 * los valores de tipo imagen (se copian a la composición). Devuelve el archivo (relativo) y su duración.
 */
export async function renderizarPieza(
  carpetaProyecto: string,
  piezaId: string,
  valores: ValoresPieza,
  imagenes: Record<string, string>,
  ancho: number,
  alto: number,
  duracion: number,
  onProgreso: (pct: number, texto?: string) => void = () => {}
): Promise<{ archivo: string; duracion: number }> {
  const pieza = listarPiezas().find((p) => p.id === piezaId)
  if (!pieza) throw new Error(`No existe la pieza «${piezaId}».`)
  const carpeta = carpetaDePieza(piezaId)
  if (!carpeta) throw new Error(`No existe la pieza «${piezaId}».`)
  const fragmento = readFileSync(join(carpeta, 'pieza.html'), 'utf8')
  // Par (lo pide el codificador) y no más de 1920 de lado: se ve igual al ponerla encima.
  const escala = Math.min(1, 1920 / Math.max(ancho, alto))
  const w = Math.max(2, Math.round((ancho * escala) / 2) * 2)
  const h = Math.max(2, Math.round((alto * escala) / 2) * 2)
  const dur = Math.max(pieza.duracion.min, Math.min(pieza.duracion.max, duracion))
  const huella = createHash('sha1')
    .update(JSON.stringify({ piezaId, valores, imagenes, w, h, dur, f: fragmento }))
    .digest('hex')
    .slice(0, 12)
  const archivo = `media/pieza-${piezaId}-${huella}.webm`
  const destino = join(carpetaProyecto, archivo)
  if (existsSync(destino)) return { archivo, duracion: dur }

  const cmd = comandoHyperframes()
  if (!cmd) throw new Error('Para las piezas animadas hace falta HyperFrames (o Node, que trae npx). Instálalo en Ajustes › Herramientas.')
  const trabajo = mkdtempSync(join(tmpdir(), 'recorte-pieza-'))
  try {
    mkdirSync(join(trabajo, 'assets'), { recursive: true })
    const finales: ValoresPieza = { ...valores }
    for (const [id, ruta] of Object.entries(imagenes)) {
      if (!ruta || !existsSync(ruta)) continue
      const nombre = `${id}${extname(ruta).toLowerCase() || '.png'}`
      copyFileSync(ruta, join(trabajo, 'assets', nombre))
      finales[id] = `assets/${nombre}`
    }
    writeFileSync(join(trabajo, 'index.html'), armarComposicion(pieza, fragmento, finales, w, h, dur), 'utf8')
    writeFileSync(join(trabajo, 'valores.json'), JSON.stringify(finales), 'utf8')
    mkdirSync(join(carpetaProyecto, 'media'), { recursive: true })
    onProgreso(0.1, `Animando «${pieza.nombre}»`)
    await new Promise<void>((resolver, rechazar) => {
      const args = [...cmd.slice(1), 'render', trabajo, '--format', 'webm', '--quality', 'standard', '--workers', '2', '--variables-file', join(trabajo, 'valores.json'), '-o', destino, '--quiet']
      // En Windows va por la consola (hyperframes y npx son .cmd): cada argumento entre comillas por si lleva espacios.
      const enConsola = process.platform === 'win32'
      const citar = (x: string) => (enConsola && /[\s&()^]/.test(x) ? `"${x}"` : x)
      const hijo = spawn(citar(cmd[0]), args.map(citar), { cwd: trabajo, shell: enConsola, windowsHide: true, env: { ...process.env, PATH: pathAmpliado() } })
      let salida = ''
      const reloj = setTimeout(() => {
        matarArbol(hijo)
        rechazar(new Error('La animación tardó demasiado.'))
      }, 10 * 60_000)
      const leer = (b: Buffer) => {
        salida = (salida + b.toString('utf8')).slice(-4000)
        const m = /(\d{1,3})%/.exec(b.toString('utf8'))
        if (m) onProgreso(0.1 + 0.85 * (Number(m[1]) / 100), `Animando «${pieza.nombre}»`)
      }
      hijo.stdout.on('data', leer)
      hijo.stderr.on('data', leer)
      hijo.on('error', (e) => (clearTimeout(reloj), rechazar(e)))
      hijo.on('close', (codigo) => {
        clearTimeout(reloj)
        if (codigo === 0 && existsSync(destino)) resolver()
        else rechazar(new Error(`No pude animar la pieza: ${salida.trim().split('\n').slice(-3).join(' ')}`))
      })
    })
    const real = await duracionMedio(destino)
    return { archivo, duracion: Math.round((real || dur) * 1000) / 1000 }
  } finally {
    // Chrome a veces suelta la carpeta un momento después: se reintenta y, si no, queda en temporales.
    try {
      rmSync(trabajo, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
    } catch {
      // No importa.
    }
  }
}
