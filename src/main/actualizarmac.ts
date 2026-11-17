import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * La actualización de Recorte en Mac, sin la firma de Apple (que haría falta para el actualizador de siempre): se baja
 * el .dmg nuevo y se comprueba su huella; al reiniciar, se saca la app del .dmg, se comprueba su firma y, cuando
 * Recorte termina de cerrarse, un guion cambia la app vieja por la nueva y la vuelve a abrir. Si algo no se puede, quien
 * llama vuelve al aviso de bajarla a mano.
 *
 * No importa nada de Electron: la prueba de la Mac (scripts/prueba-actualizar-mac.mjs) lo corre tal cual.
 */

function correr(programa: string, args: string[]): Promise<{ codigo: number; salida: string }> {
  return new Promise((ok) => {
    execFile(programa, args, { maxBuffer: 1 << 22 }, (e, out, err) => ok({ codigo: e ? (typeof e.code === 'number' ? e.code : 1) : 0, salida: `${out}${err}`.trim() }))
  })
}

/** La app instalada (…/Recorte.app) a partir de su ejecutable, o null si no corre desde un .app. */
export function paqueteDe(exe: string): string | null {
  const i = exe.indexOf('.app/Contents/MacOS/')
  return i > 0 ? exe.slice(0, i + 4) : null
}

/** Se puede cambiar la app (la carpeta donde está y la app misma admiten escritura). */
export function sePuedeReemplazar(paquete: string): boolean {
  try {
    accessSync(dirname(paquete), constants.W_OK)
    accessSync(paquete, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** La huella sha512 (en base64) de un archivo del `latest-mac.yml` publicado. */
export function huellaEnYml(yml: string, archivo: string): string | null {
  const lineas = yml.split(/\r?\n/)
  const i = lineas.findIndex((l) => l.trim() === `- url: ${archivo}`)
  if (i < 0) return null
  const m = /^\s*sha512:\s*(\S+)\s*$/.exec(lineas[i + 1] ?? '')
  return m ? m[1] : null
}

/** Baja `url` a `destino` comprobando su sha512 (base64). Si no coincide, lo borra y falla. */
export async function bajarConHuella(url: string, destino: string, sha512: string, alPct: (pct: number) => void = () => {}): Promise<void> {
  const r = await fetch(url, { headers: { 'User-Agent': 'Recorte' } })
  if (!r.ok || !r.body) throw new Error(`La descarga falló (${r.status}).`)
  const total = Number(r.headers.get('content-length')) || 0
  const hash = createHash('sha512')
  const archivo = createWriteStream(destino)
  let hecho = 0
  const lector = r.body.getReader()
  try {
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      hash.update(value)
      hecho += value.length
      if (!archivo.write(value)) await new Promise<void>((ok) => archivo.once('drain', () => ok()))
      if (total) alPct(hecho / total)
    }
  } finally {
    await new Promise<void>((ok) => archivo.end(() => ok()))
  }
  if (hash.digest('base64') !== sha512) {
    rmSync(destino, { force: true })
    throw new Error('La versión nueva llegó dañada (no coincide su huella).')
  }
}

/**
 * Saca Recorte.app del .dmg a una carpeta junto a la app instalada (el mismo disco: el cambio es de golpe), le quita la
 * cuarentena y comprueba su firma. Devuelve dónde quedó.
 */
export async function prepararDesdeDmg(dmg: string, paquete: string): Promise<string> {
  const montaje = mkdtempSync(join(tmpdir(), 'recorte-dmg-'))
  const nueva = join(dirname(paquete), '.Recorte-nueva.app')
  const a = await correr('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', montaje, dmg])
  if (a.codigo !== 0) throw new Error(`No pude abrir la versión nueva: ${a.salida.slice(-200)}`)
  try {
    const app = join(montaje, 'Recorte.app')
    if (!existsSync(app)) throw new Error('La versión nueva no trae Recorte.app.')
    rmSync(nueva, { recursive: true, force: true })
    const c = await correr('/usr/bin/ditto', [app, nueva])
    if (c.codigo !== 0) throw new Error(`No pude copiar la versión nueva: ${c.salida.slice(-200)}`)
  } finally {
    await correr('/usr/bin/hdiutil', ['detach', montaje, '-quiet'])
    rmSync(montaje, { recursive: true, force: true })
  }
  await correr('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', nueva])
  const v = await correr('/usr/bin/codesign', ['--verify', '--deep', '--strict', nueva])
  if (v.codigo !== 0) {
    rmSync(nueva, { recursive: true, force: true })
    throw new Error('La versión nueva no pasó la comprobación de su firma.')
  }
  return nueva
}

/**
 * Deja corriendo un guion que espera a que termine el proceso `pid` (este Recorte), cambia la app vieja por la nueva
 * (si algo falla, deja la vieja como estaba) y la abre.
 */
export function reemplazarAlSalir(paquete: string, nueva: string, pid: number, abrir = true): string {
  const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const guion = join(tmpdir(), `recorte-actualizar-${process.pid}-${Date.now()}.sh`)
  writeFileSync(
    guion,
    [
      '#!/bin/sh',
      `while kill -0 ${pid} 2>/dev/null; do sleep 0.2; done`,
      `VIEJA=${q(paquete)}`,
      `NUEVA=${q(nueva)}`,
      'RESPALDO="$VIEJA.vieja"',
      'rm -rf "$RESPALDO"',
      'if mv "$VIEJA" "$RESPALDO" && mv "$NUEVA" "$VIEJA"; then',
      '  rm -rf "$RESPALDO"',
      'else',
      '  [ -d "$RESPALDO" ] && [ ! -d "$VIEJA" ] && mv "$RESPALDO" "$VIEJA"',
      '  rm -rf "$NUEVA"',
      'fi',
      abrir ? 'open "$VIEJA"' : ':',
      `rm -f ${q(guion)}`,
      ''
    ].join('\n'),
    { mode: 0o755 }
  )
  spawn('/bin/sh', [guion], { detached: true, stdio: 'ignore' }).unref()
  return guion
}
