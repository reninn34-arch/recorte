import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
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
/** En Mac, sin la firma de Apple la app no se puede reemplazar sola: se avisa y la versión nueva se baja a mano. */
const A_MANO = process.platform === 'darwin'

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
  // Solo si ya trae el .dmg (los de Mac se suben un rato después que el de Windows).
  const conMac = (rel.assets ?? []).some((x) => x.name.endsWith('.dmg'))
  if (nueva && conMac && esMasNueva(nueva, app.getVersion())) avisar({ fase: 'manual', nueva, notas: resumenNotas(rel.body) })
  else avisar({ fase: 'al-dia', revisado: Date.now() })
}

export function instalarActualizacion(): void {
  if (estado.fase !== 'lista') return
  // Cierra y abre el instalador en silencio; al terminar, vuelve a abrir Recorte.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

export function prepararActualizaciones(): void {
  if (!app.isPackaged) return
  if (A_MANO) {
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
