import { execFile, spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ProblemaAudio } from '../shared/audio'
import type { OperacionTL } from '../shared/chat'
import { FUENTE_PRINCIPAL, largoClip, type ClipTL, type Timeline } from '../shared/timeline'
import type { Project } from '../shared/types'
import { duracionMedio, rutaFfmpeg } from './ffmpeg'

/**
 * Revisa el audio de una edición midiendo el sonido (10 ms a la vez), no solo la transcripción:
 * - un corte de la pista de video que cae mientras alguien habla (se come el final o el principio de una palabra:
 *   suena a que la persona se ahoga) → se alarga o se adelanta el borde hasta que la palabra termine o empiece;
 * - un corte seco con sonido a los dos lados (hace clic) → un fundido de 30 ms;
 * - frases de la pista de voz que empiezan o acaban cortadas, con respiraciones fuertes, con ruido de fondo,
 *   con silencios largos o saturadas → se limpian o se avisa.
 */

const SR = 16000
const PASO = SR / 100 // 10 ms

interface Medida {
  db: Float32Array
  /** Cruces por cero por muestra: alto en el aire (respiraciones, siseo), bajo en la voz. */
  zcr: Float32Array
  umbral: number
  piso: number
  pico: number
  saturadas: number
}

const cache = new Map<string, { mtime: number; m: Medida }>()

function decodificar(ruta: string): Promise<Float32Array> {
  return new Promise((resolver, rechazar) => {
    execFile(
      rutaFfmpeg(),
      ['-v', 'error', '-i', ruta, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (error) return rechazar(error)
        const b = stdout as Buffer
        resolver(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4))))
      }
    )
  })
}

function percentil(v: Float32Array, p: number): number {
  const o = Float32Array.from(v).sort()
  return o[Math.min(o.length - 1, Math.max(0, Math.floor((p / 100) * o.length)))] ?? -99
}

export function medir(x: Float32Array): Medida {
  const n = Math.floor(x.length / PASO)
  const db = new Float32Array(n)
  const zcr = new Float32Array(n)
  let saturadas = 0
  let seguidas = 0
  for (let i = 0; i < n; i++) {
    let s = 0
    let cruces = 0
    for (let j = 0; j < PASO; j++) {
      const v = x[i * PASO + j]
      s += v * v
      if (j > 0 && v >= 0 !== x[i * PASO + j - 1] >= 0) cruces++
      if (Math.abs(v) >= 0.99) {
        if (++seguidas === 3) saturadas++
      } else seguidas = 0
    }
    db[i] = 10 * Math.log10(s / PASO + 1e-12)
    zcr[i] = cruces / PASO
  }
  const piso = n ? percentil(db, 10) : -99
  const pico = n ? percentil(db, 99) : -99
  return { db, zcr, piso, pico, umbral: Math.max(piso + 12, pico - 38), saturadas }
}

async function medida(ruta: string): Promise<Medida | null> {
  if (!existsSync(ruta)) return null
  const mtime = statSync(ruta).mtimeMs
  const ya = cache.get(ruta)
  if (ya && ya.mtime === mtime) return ya.m
  try {
    const m = medir(await decodificar(ruta))
    cache.set(ruta, { mtime, m })
    return m
  } catch {
    return null
  }
}

const marco = (t: number) => Math.max(0, Math.round(t * 100))
/** El nivel medio (dB) entre dos segundos. */
function nivel(m: Medida, a: number, b: number): number {
  const i = marco(a)
  const j = Math.min(m.db.length, Math.max(i + 1, marco(b)))
  if (i >= m.db.length) return -99
  let s = 0
  for (let k = i; k < j; k++) s += m.db[k]
  return s / (j - i)
}
/** Si hay voz (por encima del umbral) en casi todo el tramo. */
const suena = (m: Medida, a: number, b: number) => nivel(m, a, b) > m.umbral

/**
 * Desde `t` hacia adelante (o atrás), dónde cortar sin comerse nada, a lo más `max` segundos: el centro de la primera
 * pausa de verdad (60 ms sin voz). Si no hay ninguna, null: mejor avisar que dejar el corte a media frase.
 */
function hastaSilencio(m: Medida, t: number, sentido: 1 | -1, max: number): number | null {
  const i0 = marco(t)
  for (let k = 1; k <= max * 100; k++) {
    const i = i0 + sentido * k
    if (i < 0 || i >= m.db.length) break
    let bajo = true
    for (let q = i; q < i + 6; q++) if ((m.db[q] ?? -99) > m.umbral - 3) bajo = false
    if (bajo) return (i + 3) / 100
  }
  return null
}

/** Los tramos con voz de una medida (huecos de menos de 80 ms unidos). */
function tramos(m: Medida): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  while (i < m.db.length) {
    if (m.db[i] <= m.umbral) {
      i++
      continue
    }
    let j = i
    while (j < m.db.length) {
      let sigue = false
      for (let q = j; q < Math.min(m.db.length, j + 8); q++) if (m.db[q] > m.umbral) sigue = true
      if (!sigue) break
      j++
    }
    if (j - i >= 4) out.push([i / 100, j / 100])
    i = j + 1
  }
  return out
}

/** Las respiraciones: aire (muchos cruces por cero) en una pausa, más fuerte de lo normal. */
export function respiraciones(m: Medida): [number, number][] {
  const voz = tramos(m)
  const out: [number, number][] = []
  const huecos: [number, number][] = []
  for (let k = 0; k <= voz.length; k++) huecos.push([k ? voz[k - 1][1] : 0, k < voz.length ? voz[k][0] : m.db.length / 100])
  // Dentro de la voz también: el aire de una toma rápida entre dos palabras queda pegado al tramo.
  for (const [a, b] of [...huecos, ...voz]) {
    let inicio = -1
    for (let i = marco(a); i <= marco(b) && i < m.db.length; i++) {
      const aire = m.zcr[i] > 0.22 && m.db[i] > m.pico - 34 && m.db[i] < m.pico - 12
      if (aire && inicio < 0) inicio = i
      if ((!aire || i === marco(b)) && inicio >= 0) {
        if (i - inicio >= 8) out.push([Math.max(0, inicio / 100 - 0.02), i / 100 + 0.02])
        inicio = -1
      }
    }
  }
  return out.sort((x, y) => x[0] - y[0])
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

export async function revisarAudio(p: Project, tl: Timeline, carpeta: string): Promise<ProblemaAudio[]> {
  const problemas: ProblemaAudio[] = []
  let n = 0
  const nuevo = (x: Omit<ProblemaAudio, 'id'>) => problemas.push({ ...x, id: `a${++n}` })
  const rutaDe = (fuente: string): string | null => {
    if (fuente === FUENTE_PRINCIPAL) return p.source.path
    const m = (p.medios ?? []).find((x) => x.id === fuente)
    return m && m.tipo === 'video' && m.conAudio ? m.ruta : null
  }
  const pistaVideoCallada = tl.pistas?.video?.oculta === true
  const suenaClip = (c: ClipTL) => !pistaVideoCallada && !c.mudo && !c.rampa && (c.sonido?.volumen ?? 1) > 0.05 && rutaDe(c.fuente) !== null
  const palabras = (p.transcript ?? []).flatMap((s) => s.words ?? [])

  // ===== Los cortes de la pista de video =====
  let t = 0
  const inicios: number[] = []
  for (const c of tl.clips) {
    inicios.push(t)
    t += largoClip(c)
  }
  for (let i = 0; i < tl.clips.length; i++) {
    const c = tl.clips[i]
    if (!suenaClip(c)) continue
    const m = await medida(rutaDe(c.fuente)!)
    if (!m) continue
    const fin = inicios[i] + largoClip(c)
    const siguiente = tl.clips[i + 1]
    const ultimo = i === tl.clips.length - 1
    // El final: ¿sigue sonando la voz justo después de la salida?
    if (suena(m, c.salida - 0.02, c.salida + 0.02) && suena(m, c.salida - 0.12, c.salida - 0.02)) {
      const palabra = c.fuente === FUENTE_PRINCIPAL ? palabras.find((w) => w.start < c.salida - 0.02 && w.end > c.salida + 0.02) : undefined
      const hasta = palabra ? palabra.end + 0.05 : hastaSilencio(m, c.salida, 1, 1.5)
      nuevo({
        tipo: 'palabra-cortada',
        t: fin,
        peso: 2,
        texto: `En ${fmt(fin)} el corte se come ${palabra ? `el final de «${palabra.text}»` : 'el final de una palabra'}: suena a que se ahoga.`,
        ...(hasta && hasta - c.salida <= 1.5
          ? { arreglo: { tipo: 'ops', ops: [{ op: 'recortar_clip', clip: i + 1, salida: Math.round(hasta * 1000) / 1000 } as OperacionTL] }, etiqueta: 'Que termine la palabra' }
          : { texto: `En ${fmt(fin)} el corte se come una palabra y no hay una pausa cerca: córtalo antes, al final de la frase anterior.` })
      })
    } else if (!ultimo && siguiente && suenaClip(siguiente) && (c.sonido?.sale ?? 0) < 0.01 && nivel(m, c.salida - 0.03, c.salida) > m.umbral - 10) {
      // Hay sonido justo en el corte (no voz que siga, pero sí ruido o un final de nota): sin fundido, hace clic.
      const m2 = await medida(rutaDe(siguiente.fuente)!)
      if (m2 && nivel(m2, siguiente.entrada, siguiente.entrada + 0.03) > m2.umbral - 10 && (siguiente.sonido?.entra ?? 0) < 0.01) {
        nuevo({
          tipo: 'corte-seco',
          t: fin,
          peso: 1,
          texto: `En ${fmt(fin)} el sonido cambia de golpe y puede hacer clic.`,
          arreglo: { tipo: 'ops', ops: [{ op: 'audio_clip', clip: i + 1, sale: 0.03 } as OperacionTL, { op: 'audio_clip', clip: i + 2, entra: 0.03 } as OperacionTL] },
          etiqueta: 'Suavizar el corte'
        })
      }
    }
    // El principio: ¿la voz ya venía sonando antes de la entrada?
    if (c.entrada > 0.05 && suena(m, c.entrada - 0.02, c.entrada + 0.02) && suena(m, c.entrada + 0.02, c.entrada + 0.12)) {
      const palabra = c.fuente === FUENTE_PRINCIPAL ? palabras.find((w) => w.start < c.entrada - 0.02 && w.end > c.entrada + 0.02) : undefined
      const desde = palabra ? Math.max(0, palabra.start - 0.05) : hastaSilencio(m, c.entrada, -1, 1.5)
      nuevo({
        tipo: 'palabra-cortada',
        t: inicios[i],
        peso: 2,
        texto: `En ${fmt(inicios[i])} el corte se come ${palabra ? `el principio de «${palabra.text}»` : 'el principio de una palabra'}.`,
        ...(desde !== null && c.entrada - desde <= 1.5
          ? { arreglo: { tipo: 'ops', ops: [{ op: 'recortar_clip', clip: i + 1, entrada: Math.round(desde * 1000) / 1000 } as OperacionTL] }, etiqueta: 'Que empiece la palabra' }
          : { texto: `En ${fmt(inicios[i])} el corte se come una palabra y no hay una pausa cerca: empieza el clip en la frase siguiente.` })
      })
    }
  }
  // El ruido de fondo de la toma principal, si se oye.
  const principales = tl.clips.map((c, i) => [c, i] as const).filter(([c]) => c.fuente === FUENTE_PRINCIPAL && suenaClip(c))
  if (principales.length) {
    const m = await medida(p.source.path)
    if (m && m.pico - m.piso < 30 && principales.some(([c]) => (c.sonido?.limpio ?? 0) < 0.3)) {
      nuevo({
        tipo: 'ruido',
        t: inicios[principales[0][1]],
        peso: 1,
        texto: `El video tiene ruido de fondo (la voz está solo ${Math.round(m.pico - m.piso)} dB por encima).`,
        arreglo: { tipo: 'ops', ops: principales.map(([, i]) => ({ op: 'audio_clip', clip: i + 1, limpio: 0.5 }) as OperacionTL) },
        etiqueta: 'Quitar el ruido'
      })
    }
  }

  // ===== Las frases de la pista de voz =====
  if (tl.pistas?.voz?.oculta !== true) {
    for (const v of tl.voces ?? []) {
      const m = await medida(join(carpeta, v.archivo))
      if (!m || !m.db.length) continue
      const dur = m.db.length / 100
      const nombre = v.texto ? `«${v.texto.slice(0, 40)}${v.texto.length > 40 ? '…' : ''}»` : 'una frase de voz'
      if (suena(m, 0, 0.03)) {
        nuevo({ tipo: 'voz-cortada', t: v.inicio, peso: 2, texto: `${nombre} empieza cortada: le falta el principio de la primera palabra. Vuelve a cortar ese audio un poco antes.` })
      }
      if (suena(m, dur - 0.04, dur)) {
        nuevo({ tipo: 'voz-cortada', t: v.inicio + v.duracion, peso: 2, texto: `${nombre} termina en seco: se corta antes de que acabe la última palabra.` })
      }
      const aire = respiraciones(m)
      if (aire.length) {
        nuevo({
          tipo: 'respiracion',
          t: v.inicio + aire[0][0],
          peso: aire.length > 2 ? 2 : 1,
          texto: `${nombre} tiene ${aire.length} ${aire.length === 1 ? 'respiración fuerte' : 'respiraciones fuertes'}: suena a que le falta el aire.`,
          arreglo: { tipo: 'voz', voz: v.id, accion: 'respiraciones', ventanas: aire },
          etiqueta: 'Bajar las respiraciones'
        })
      }
      if (m.pico - m.piso < 32) {
        nuevo({
          tipo: 'ruido',
          t: v.inicio,
          peso: 1,
          texto: `${nombre} tiene ruido de fondo (la voz está solo ${Math.round(m.pico - m.piso)} dB por encima).`,
          arreglo: { tipo: 'voz', voz: v.id, accion: 'limpiar' },
          etiqueta: 'Limpiar la voz'
        })
      }
      const voz = tramos(m)
      for (let k = 1; k < voz.length; k++) {
        const hueco = voz[k][0] - voz[k - 1][1]
        if (hueco > 1.0) nuevo({ tipo: 'silencio', t: v.inicio + voz[k - 1][1], peso: 0, texto: `${nombre} tiene un silencio de ${hueco.toFixed(1)} s.` })
      }
      if (m.saturadas > 3) nuevo({ tipo: 'saturado', t: v.inicio, peso: 1, texto: `${nombre} está saturada (${m.saturadas} picos al máximo): suena rota. Grábala más bajito.` })
    }
  }
  return problemas.sort((a, b) => b.peso - a.peso || a.t - b.t)
}

/** Procesa el audio de una frase de voz: baja sus respiraciones o la limpia. Devuelve el archivo nuevo. */
export async function arreglarVoz(
  carpeta: string,
  archivo: string,
  accion: 'respiraciones' | 'limpiar',
  ventanas: [number, number][] = []
): Promise<{ archivo: string; duracion: number }> {
  const origen = join(carpeta, archivo)
  const nombre = archivo.replace(/^media\//, '').replace(/\.[^.]+$/, '').replace(/-(r|l)[a-z0-9]{6,}$/, '')
  const nuevo = `media/${nombre}-${accion === 'respiraciones' ? 'r' : 'l'}${Date.now().toString(36)}.wav`
  const filtro =
    accion === 'respiraciones'
      ? (ventanas.length ? ventanas : respiraciones(medir(await decodificar(origen)))).map(([a, b]) => `volume=0.2:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`).join(',') || 'anull'
      : 'highpass=f=85,afftdn=nr=20:nf=-45:tn=1,equalizer=f=220:t=q:w=1.2:g=-2,equalizer=f=3000:t=q:w=1:g=2,deesser=i=0.25,acompressor=threshold=-20dB:ratio=2:attack=15:release=200:makeup=1,loudnorm=I=-16:TP=-1.5:LRA=9:linear=true'
  const r = spawnSync(rutaFfmpeg(), ['-v', 'error', '-y', '-i', origen, '-af', filtro, '-ar', '48000', join(carpeta, nuevo)], { timeout: 120_000, windowsHide: true })
  if (r.status !== 0) throw new Error(`No pude procesar la voz: ${String(r.stderr ?? '').slice(0, 300)}`)
  return { archivo: nuevo, duracion: Math.round((await duracionMedio(join(carpeta, nuevo))) * 1000) / 1000 }
}
