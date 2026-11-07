import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { EstadoActualizacion } from '../shared/api'

/**
 * Actualizaciones desde GitHub Releases (electron-updater). Al abrir la app, y cada
 * cuatro horas, mira si hay una versión publicada más nueva; si la hay, la baja en
 * segundo plano y avisa al usuario para que reinicie y la instale (si no, se instala
 * sola al cerrar). Solo en la app instalada: en desarrollo no hay nada que actualizar.
 *
 * Para publicar una versión: sube `version` en package.json y corre
 * `npm run publicar` con GH_TOKEN (ver docs/ARQUITECTURA.md).
 */

const { autoUpdater } = electronUpdater
const CADA = 4 * 60 * 60_000

let estado: EstadoActualizacion = { fase: 'nada', version: app.getVersion() }

/** El error del actualizador, en palabras del usuario. */
function explicar(e: unknown): string {
  const t = e instanceof Error ? e.message : String(e)
  if (/404/.test(t)) return 'todavía no hay versiones publicadas'
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(t)) return 'sin conexión a internet'
  return t.split(String.fromCharCode(10))[0].slice(0, 200)
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
  if (estado.fase === 'bajando' || estado.fase === 'lista') return estado
  try {
    avisar({ fase: 'buscando', error: undefined })
    await autoUpdater.checkForUpdates()
  } catch (e) {
    avisar({ fase: 'error', error: explicar(e) })
  }
  return estado
}

export function instalarActualizacion(): void {
  if (estado.fase !== 'lista') return
  // Cierra y abre el instalador en silencio; al terminar, vuelve a abrir Recorte.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}

export function prepararActualizaciones(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => avisar({ fase: 'bajando', nueva: info.version, pct: 0 }))
  autoUpdater.on('update-not-available', () => avisar({ fase: 'al-dia', revisado: Date.now() }))
  autoUpdater.on('download-progress', (p) => avisar({ fase: 'bajando', pct: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (info) => avisar({ fase: 'lista', nueva: info.version, pct: 100 }))
  autoUpdater.on('error', (e) => avisar({ fase: 'error', error: explicar(e) }))
  setTimeout(() => void buscarActualizacion(), 8_000)
  setInterval(() => void buscarActualizacion(), CADA)
}
