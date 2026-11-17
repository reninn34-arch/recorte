import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { bajarConHuella, huellaEnYml, paqueteDe, prepararDesdeDmg, reemplazarAlSalir, sePuedeReemplazar } from './actualizarmac'
import type { EstadoActualizacion } from '../shared/api'

/**
 * Actualizaciones desde GitHub Releases (electron-updater). Al abrir la app, y cada
 * cuatro horas, mira si hay una versión publicada más nueva; si la hay, la baja en
 * segundo plano y avisa al usuario para que reinicie y la instale (si no, se instala
 * sola al cerrar). Solo en la app instalada: en desarrollo no hay nada que actualizar.
 *
 * Para publicar una versión: `npm version patch` y `git push --follow-tags`; el workflow
 * compila el instalador y crea el release (ver docs/ARQUITECTURA.md).
 */

const { autoUpdater } = electronUpdater
const CADA = 4 * 60 * 60_000
/**
 * En Mac, sin la firma de Apple el actualizador de siempre no puede: Recorte baja el .dmg él mismo y, al reiniciar, cambia
 * la app (ver actualizarmac.ts). Si no se puede (una carpeta sin permiso), avisa y la versión nueva se baja a mano.
 */
const A_MANO = process.platform === 'darwin'
const PAGINA_VERSIONES = 'https://github.com/reninn34-arch/recorte/releases/latest'
const carpetaBajada = () => join(app.getPath('userData'), 'actualizacion')
/** El .dmg ya bajado y comprobado de la versión nueva (Mac). */
let dmgListo: string | null = null

let estado: EstadoActualizacion = { fase: 'nada', version: app.getVersion() }

/** El error del actualizador, en palabras del usuario. */
function explicar(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e)
  if (/404/.test(t)) return 'todavía no hay versiones publicadas'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(t)) return 'sin conexión a internet'
  return t.split(String.fromCharCode(10))[0].slice(0, 200)
}

/** La primera frase de las notas del release (vienen en HTML o Markdown). */
function resumenNotas(notas: unknown): string | undefined {
  const texto = (Array.isArray(notas) ? notas.map((n) => (n as { note?: string }).note ?? '').join(' ') : typeof notas === 'string' ? notas : '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!texto) return undefined
  const frase = texto.split(/(?<=[.!?])\s/)[0]
  return frase.slice(0, 180)
}

function avisar(cambio: Partial<EstadoActualizacion>): void {
  estado = { ...estado, ...cambio }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('actualizacion', estado)
}

export function estadoActualizacion(): EstadoActualizacion {
  return estado
}

export async function buscarActualizacion(): Promise<EstadoActualizacion> {
  if (!app.isPackaged) {
    avisar({ fase: 'desarrollo' })
    return estado
  }
  if (estado.fase === 'bajando' || estado.fase === 'lista' || estado.fase === 'manual') return estado
  try {
    avisar({ fase: 'buscando', error: undefined })
    if (A_MANO) await revisarAMano()
    else await autoUpdater.checkForUpdates()
  } catch (e) {
    avisar({ fase: 'error', error: explicar(e) })
  }
  return estado
}

/** «1.2.10» es más nueva que «1.2.9» (número a número). */
export function esMasNueva(nueva: string, actual: string): boolean {
  const a = nueva.replace(/^v/, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
  const b = actual.replace(/^v/, '').split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return false
}

/**
 * En Mac no hay actualización sola (sin la firma de Apple no se puede reemplazar la app): se mira la última versión
 * publicada en GitHub y, si es más nueva, se avisa para bajarla a mano. electron-updater pediría un `latest-mac.yml` que
 * no se publica.
 */
async function revisarAMano(): Promise<void> {
  const r = await fetch('https://api.github.com/repos/reninn34-arch/recorte/releases/latest', {
    headers: { 'User-Agent': `Recorte/${app.getVersion()}`, Accept: 'application/vnd.github+json' }
  })
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`)
  const rel = (await r.json()) as { tag_name?: string; body?: string; assets?: { name: string }[] }
  const nueva = (rel.tag_name ?? '').replace(/^v/, '')
  // El .dmg de esta Mac (chip Apple o Intel) y el latest-mac.yml con su huella: los de Mac se suben un rato después que
  // el de Windows, y hasta que estén no hay nada que ofrecer.
  const nombre = `Recorte-Mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.dmg`
  const dmg = (rel.assets ?? []).find((x) => x.name === nombre) as { name: string; browser_download_url?: string } | undefined
  const yml = (rel.assets ?? []).find((x) => x.name === 'latest-mac.yml') as { name: string; browser_download_url?: string } | undefined
  if (!nueva || !dmg?.browser_download_url || !esMasNueva(nueva, app.getVersion())) {
    avisar({ fase: 'al-dia', revisado: Date.now() })
    return
  }
  const notas = resumenNotas(rel.body)
  const paquete = paqueteDe(app.getPath('exe'))
  if (!paquete || !sePuedeReemplazar(paquete) || !yml?.browser_download_url) {
    avisar({ fase: 'manual', nueva, notas })
    return
  }
  // Se baja sola y, comprobada, queda lista para «Reiniciar y actualizar» (como en Windows).
  try {
    const textoYml = await (await fetch(yml.browser_download_url, { headers: { 'User-Agent': `Recorte/${app.getVersion()}` } })).text()
    const huella = huellaEnYml(textoYml, nombre)
    if (!huella) throw new Error('El release no trae la huella del .dmg.')
    mkdirSync(carpetaBajada(), { recursive: true })
    const destino = join(carpetaBajada(), `Recorte-Mac-${nueva}.dmg`)
    if (dmgListo !== destino) {
      avisar({ fase: 'bajando', nueva, pct: 0, notas })
      let ultimo = 0
      await bajarConHuella(dmg.browser_download_url, destino, huella, (p) => {
        const pct = Math.round(p * 100)
        if (pct !== ultimo) avisar({ fase: 'bajando', pct: (ultimo = pct) })
      })
      dmgListo = destino
    }
    avisar({ fase: 'lista', nueva, pct: 100, notas })
  } catch {
    avisar({ fase: 'manual', nueva, notas })
  }
}

/** Mac: saca la app del .dmg, deja el cambio preparado para cuando Recorte se cierre y se cierra. */
async function instalarEnMac(): Promise<void> {
  const paquete = paqueteDe(app.getPath('exe'))
  try {
    if (!dmgListo || !existsSync(dmgListo) || !paquete) throw new Error('No hay versión bajada.')
    const nueva = await prepararDesdeDmg(dmgListo, paquete)
    reemplazarAlSalir(paquete, nueva, process.pid)
    app.quit()
  } catch {
    // Si no se pudo, queda el camino de siempre: bajarla de la página.
    avisar({ fase: 'manual' })
    void shell.openExternal(PAGINA_VERSIONES)
  }
}

/** Mac: borra los .dmg de versiones que ya no son nuevas (la que se instaló, o una anterior). */
function limpiarBajadas(): void {
  try {
    for (const f of readdirSync(carpetaBajada())) {
      const v = /^Recorte-Mac-(.+).dmg$/.exec(f)?.[1]
      if (!v || !esMasNueva(v, app.getVersion())) rmSync(join(carpetaBajada(), f), { force: true })
    }
  } catch {
    // Sin carpeta: nada que limpiar.
  }
}

export function instalarActualizacion(): void {
  if (estado.fase !== 'lista') return
  if (A_MANO) {
    void instalarEnMac()
    return
  }
  // Cierra y abre el instalador en silencio; al terminar, vuelve a abrir Recorte.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

export function prepararActualizaciones(): void {
  if (!app.isPackaged) return
  if (A_MANO) {
    limpiarBajadas()
    setTimeout(() => void buscarActualizacion(), 8_000)
    setInterval(() => void buscarActualizacion(), CADA)
    return
  }
  autoUpdater.autoDownload = !A_MANO
  autoUpdater.autoInstallOnAppQuit = !A_MANO
  autoUpdater.on('update-available', (info) =>
    avisar(A_MANO ? { fase: 'manual', nueva: info.version, notas: resumenNotas(info.releaseNotes) } : { fase: 'bajando', nueva: info.version, pct: 0, notas: resumenNotas(info.releaseNotes) })
  )
  autoUpdater.on('update-not-available', () => avisar({ fase: 'al-dia', revisado: Date.now() }))
  autoUpdater.on('download-progress', (p) => avisar({ fase: 'bajando', pct: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) =>
    avisar({ fase: 'lista', nueva: info.version, pct: 100, notas: resumenNotas(info.releaseNotes) ?? estado.notas })
  )
  autoUpdater.on('error', (e) => avisar({ fase: 'error', error: explicar(e) }))
  setTimeout(() => void buscarActualizacion(), 8_000)
  setInterval(() => void buscarActualizacion(), CADA)
}
