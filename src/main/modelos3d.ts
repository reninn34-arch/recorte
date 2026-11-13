import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { rutaScriptPython } from './transcribir'

/**
 * La biblioteca de modelos 3D de los videos hechos con código (como «Explicativo 3D»): los que trae Recorte y los que
 * el agente hizo o mejoró en videos anteriores, para no modelar dos veces la misma boca, muela o frasco.
 */

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/
const MAX_ARCHIVO = 20 * 1024 * 1024

export function carpetaModelos(): string {
  return join(app.getPath('userData'), 'modelos-3d')
}

const esModelo = (dir: string): boolean => existsSync(join(dir, 'modelo.js')) && existsSync(join(dir, 'ficha.json'))

const LEEME = `# Modelos 3D

Cada carpeta es un modelo 3D listo para Three.js, de videos anteriores o de los que trae Recorte.
\`python kit/kit.py modelos [--buscar diente]\` los lista; mira su \`vista.jpg\` antes de usarlo.

## Usarlo
Copia su \`modelo.js\` a tu composición e impórtalo. No importa nada: recibe THREE.

    import { crear, animar } from './modelo.js'
    const boca = crear(THREE, { colorLabios: '#e46f7f' })   // las opciones están en su ficha.json
    escena.add(boca)
    animar(boca, t, { apertura: 0.6, sonrisa: 1 })           // en cada cuadro; los estados, en su ficha.json

Cámbiale los colores con las opciones (los de la marca). Si le falta algo para este video, mejóralo aquí mismo.

## Guardar uno nuevo o mejorado
Deja en \`modelos-3d/<id>/\` (id en minúsculas, con guiones):
- \`modelo.js\`: un módulo que exporta \`crear(THREE, opciones)\` (devuelve un THREE.Group centrado en el origen, de unas
  2 unidades) y \`animar(grupo, t, estado)\`. Solo el núcleo de Three.js (nada de addons ni archivos externos), para
  que sirva en cualquier composición.
- \`ficha.json\`: {"nombre", "descripcion", "etiquetas": […], "opciones": {…con sus valores por defecto}, "estados": […]}.
- \`vista.jpg\`: un fotograma del modelo (sácalo de tu render), para elegirlo de un vistazo.
Cuando el video sale bien, Recorte lo guarda y los siguientes videos lo encuentran aquí.
`

/**
 * Lleva a `trabajo/modelos-3d/` los modelos guardados y los que trae Recorte (si hay uno con el mismo nombre, manda
 * el guardado, que es el mejorado). Lo que ya está en la carpeta de trabajo (de una ronda anterior) no se pisa.
 */
export function traerModelos(trabajo: string, guardados: string = carpetaModelos()): string[] {
  const destino = join(trabajo, 'modelos-3d')
  mkdirSync(destino, { recursive: true })
  writeFileSync(join(destino, 'LEEME.md'), LEEME, 'utf8')
  const traidos: string[] = []
  for (const origen of [guardados, rutaScriptPython('modelos-3d')]) {
    if (!existsSync(origen)) continue
    for (const n of readdirSync(origen)) {
      const dir = join(origen, n)
      if (!ID.test(n) || !esModelo(dir) || existsSync(join(destino, n))) continue
      cpSync(dir, join(destino, n), { recursive: true })
      traidos.push(n)
    }
  }
  return traidos
}

const mismo = (a: string, b: string): boolean => {
  for (const n of ['modelo.js', 'ficha.json']) {
    try {
      if (!readFileSync(join(a, n)).equals(readFileSync(join(b, n)))) return false
    } catch {
      return false
    }
  }
  return true
}

/**
 * Tras un video que salió bien: los modelos nuevos o cambiados de `trabajo/modelos-3d/` quedan en la biblioteca.
 * Devuelve los que guardó.
 */
export function guardarModelos(trabajo: string, guardados: string = carpetaModelos()): string[] {
  const origen = join(trabajo, 'modelos-3d')
  if (!existsSync(origen)) return []
  const incluidos = rutaScriptPython('modelos-3d')
  const guardadosAhora: string[] = []
  for (const n of readdirSync(origen)) {
    const dir = join(origen, n)
    if (!ID.test(n) || !esModelo(dir)) continue
    try {
      JSON.parse(readFileSync(join(dir, 'ficha.json'), 'utf8').replace(/^﻿/, ''))
    } catch {
      continue // Una ficha rota no se guarda.
    }
    const destino = join(guardados, n)
    if (existsSync(destino) ? mismo(dir, destino) : mismo(dir, join(incluidos, n))) continue
    mkdirSync(guardados, { recursive: true })
    cpSync(dir, destino, {
      recursive: true,
      force: true,
      filter: (ruta) => {
        if (/[\\/](node_modules|\.cache)([\\/]|$)/i.test(ruta)) return false
        try {
          const s = statSync(ruta)
          return s.isDirectory() || s.size < MAX_ARCHIVO
        } catch {
          return false
        }
      }
    })
    guardadosAhora.push(n)
  }
  return guardadosAhora
}
