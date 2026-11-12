// Prueba de «Otro video así» y «Mis estilos»: el paquete de estilo que se lleva un video nuevo.
// node --experimental-strip-types --no-warnings --import ./scripts/ts-sin-extension.mjs scripts/prueba-versiones.mjs
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { archivosVersion, armarBase, EstilosPropios, versionBase } from '../src/main/estilospropios.ts'

const dir = mkdtempSync(join(tmpdir(), 'recorte-versiones-'))
try {
  // Una creación con dos versiones: la v1 usa un personaje y música; la v2 cambió el título.
  const carpeta = join(dir, 'creacion')
  const trabajo = join(carpeta, 'trabajo')
  mkdirSync(join(trabajo, 'medios'), { recursive: true })
  mkdirSync(join(trabajo, 'voz'), { recursive: true })
  mkdirSync(join(carpeta, 'salidas'), { recursive: true })
  writeFileSync(join(trabajo, 'medios', 'personaje.png'), 'png')
  writeFileSync(join(trabajo, 'medios', 'musica.mp3'), 'mp3')
  writeFileSync(join(trabajo, 'voz', 'frase-1.wav'), 'wav')
  writeFileSync(join(trabajo, 'notas.md'), '# notas\nletra: Bebas, rojo #c33\n')
  const receta = (titulo) => ({
    ancho: 1080,
    alto: 1920,
    musica: { archivo: 'medios/musica.mp3' },
    voz: { frases: [{ archivo: 'voz/frase-1.wav', en: 0 }] },
    momentos: [{ tipo: 'titulo', texto: titulo, desde: 0, hasta: 2 }],
    capas: [{ archivo: 'medios/personaje.png', desde: 0, hasta: 2, animar: 'caminar', piezas: true }]
  })
  for (const n of [1, 2]) {
    writeFileSync(join(carpeta, 'salidas', `agente-v${n}.mp4`), 'mp4')
    writeFileSync(join(carpeta, 'salidas', `agente-v${n}.receta.json`), JSON.stringify(receta(n === 1 ? 'Título viejo' : 'Título nuevo')))
    writeFileSync(join(carpeta, 'salidas', `agente-v${n}-r2.jpg`), 'jpg')
  }
  const c = {
    id: 'c1', nombre: 'LEGO', peticion: 'La historia de LEGO', estilo: 'libre', formato: 'vertical', duracion: 40, adjuntos: [],
    fase: 'listo', modo: 'agente', version: 2, aprobada: 1, createdAt: 0, updatedAt: 0,
    mensajes: [{ id: 'm1', rol: 'usuario', texto: 'Cambia el título', fecha: 0 }],
    versiones: [{ n: 1, archivo: 'salidas/agente-v1.mp4', fecha: 0 }, { n: 2, archivo: 'salidas/agente-v2.mp4', fecha: 0, pedido: 'Cambia el título' }]
  }

  const v = archivosVersion(carpeta, 2)
  if (v.video !== 'salidas/agente-v2.mp4' || v.receta !== 'salidas/agente-v2.receta.json') throw new Error(`archivosVersion: ${JSON.stringify(v)}`)
  if (versionBase(c) !== 1) throw new Error('versionBase no parte de la aprobada')

  // «Otro video así» desde la aprobada (v1).
  const base = join(dir, 'nueva', 'trabajo', 'base-estilo')
  if (!armarBase(c, carpeta, versionBase(c), base)) throw new Error('armarBase no encontró la receta')
  const copiada = JSON.parse(readFileSync(join(base, 'receta.json'), 'utf8'))
  if (copiada.momentos[0].texto !== 'Título viejo') throw new Error('armarBase no copió la receta de la versión aprobada')
  if (!existsSync(join(base, 'archivos', 'medios', 'personaje.png')) || !existsSync(join(base, 'archivos', 'medios', 'musica.mp3')))
    throw new Error('armarBase no copió los archivos de la receta')
  if (existsSync(join(base, 'archivos', 'voz'))) throw new Error('armarBase copió la narración de aquel video (no debe)')
  const conv = readFileSync(join(base, 'conversacion.md'), 'utf8')
  if (!/aprobó la versión 1/.test(conv) || !/v2: Cambia el título/.test(conv)) throw new Error(`conversacion.md incompleta:\n${conv}`)
  if (!existsSync(join(base, 'notas.md')) || !existsSync(join(base, 'muestra.jpg'))) throw new Error('faltan notas.md o muestra.jpg')
  console.log('otro video así: receta de la v1 aprobada, personaje y música, notas y conversación (sin la voz) ✓')

  // «Mis estilos»: guardar, listar, copiar a un video nuevo y borrar.
  const propios = new EstilosPropios(join(dir, 'estilos-propios'))
  const e = propios.guardar(c, carpeta, 1, 'LEGO historia')
  const otro = propios.guardar(c, carpeta, 2, 'LEGO historia')
  if (e.id !== 'lego-historia' || otro.id !== 'lego-historia-2' || !e.muestra) throw new Error(`guardar: ${JSON.stringify([e, otro])}`)
  if (propios.listar().length !== 2) throw new Error('listar no ve los dos estilos')
  const destino = join(dir, 'otra', 'trabajo', 'base-estilo')
  propios.copiarA(e.id, destino)
  if (JSON.parse(readFileSync(join(destino, 'receta.json'), 'utf8')).momentos[0].texto !== 'Título viejo') throw new Error('copiarA no trajo la receta')
  propios.borrar(otro.id)
  if (propios.listar().length !== 1) throw new Error('borrar no lo quitó')
  let rechazo = false
  try {
    propios.dir('../fuera')
  } catch {
    rechazo = true
  }
  if (!rechazo) throw new Error('un id con ../ no se rechazó')
  console.log('mis estilos: se guardan con nombre, se listan, se copian a un video nuevo y se borran ✓')
  console.log('prueba versiones: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
