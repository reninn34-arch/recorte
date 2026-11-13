import { app, ipcMain, type BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El tamaño de la interfaz: en automático crece con la ventana (en un monitor de 27" todo se ve proporcionado, no
 * diminuto) y solo se achica en una pantalla de verdad chica; o lo fija el usuario (Ctrl + / Ctrl − / Ctrl 0, o en
 * Ajustes). Es el zoom de la página: todo escala junto y los clics siguen cayendo donde deben.
 */

/** Para este tamaño de ventana (en píxeles de Windows) se diseñó la app: desde ahí, crece. */
const BASE = { ancho: 1600, alto: 1000 }
/** Por debajo de esto (una laptop chica), se achica un poco para que todo quepa. */
const CHICA = { ancho: 1280, alto: 800 }
const MIN = 0.7
const MAX = 2.2

const archivo = () => join(app.getPath('userData'), 'interfaz.json')
let manual: number | null = null
let leido = false
let ventana: BrowserWindow | null = null

function leer(): void {
  if (leido) return
  leido = true
  try {
    if (existsSync(archivo())) {
      const v = JSON.parse(readFileSync(archivo(), 'utf8')).escala
      if (typeof v === 'number' && v >= MIN && v <= MAX) manual = v
    }
  } catch {
    manual = null
  }
}

function guardar(): void {
  try {
    writeFileSync(archivo(), JSON.stringify({ escala: manual }), 'utf8')
  } catch {
    // Sin poder guardarla, dura lo que la sesión.
  }
}

/** La escala automática para una ventana de `ancho`×`alto` (píxeles de Windows). */
export function escalaAutomatica(ancho: number, alto: number): number {
  const crece = Math.min(ancho / BASE.ancho, alto / BASE.alto)
  const f = crece >= 1 ? crece : Math.max(0.8, Math.min(1, Math.min(ancho / CHICA.ancho, alto / CHICA.alto)))
  return Math.round(Math.min(MAX, f) * 20) / 20
}

function estado(): { automatica: boolean; escala: number } {
  if (!ventana || ventana.isDestroyed()) return { automatica: manual === null, escala: manual ?? 1 }
  const [ancho, alto] = ventana.getContentSize()
  return { automatica: manual === null, escala: manual ?? escalaAutomatica(ancho, alto) }
}

function aplicar(): void {
  if (!ventana || ventana.isDestroyed()) return
  const { escala } = estado()
  if (Math.abs(ventana.webContents.getZoomFactor() - escala) > 0.005) ventana.webContents.setZoomFactor(escala)
  ventana.webContents.send('interfaz:escala', estado())
}

let registrado = false
export function prepararEscala(v: BrowserWindow): void {
  leer()
  ventana = v
  let pendiente: NodeJS.Timeout | null = null
  v.on('resize', () => {
    if (pendiente) clearTimeout(pendiente)
    pendiente = setTimeout(aplicar, 120)
  })
  v.webContents.on('did-finish-load', aplicar)
  // Ctrl + / Ctrl − / Ctrl 0 (con la rueda no: en el editor Ctrl+rueda acerca la línea de tiempo).
  v.webContents.on('before-input-event', (evento, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return
    const actual = estado().escala
    if (input.key === '+' || input.key === '=' || input.code === 'NumpadAdd') manual = Math.min(MAX, Math.round((actual + 0.1) * 20) / 20)
    else if (input.key === '-' || input.code === 'NumpadSubtract') manual = Math.max(MIN, Math.round((actual - 0.1) * 20) / 20)
    else if (input.key === '0' || input.code === 'Numpad0') manual = null
    else return
    evento.preventDefault()
    guardar()
    aplicar()
  })
  if (registrado) return
  registrado = true
  ipcMain.handle('interfaz:estado', () => estado())
  ipcMain.handle('interfaz:escala', (_e, valor: unknown) => {
    manual = typeof valor === 'number' && Number.isFinite(valor) ? Math.min(MAX, Math.max(MIN, Math.round(valor * 20) / 20)) : null
    guardar()
    aplicar()
    return estado()
  })
}
