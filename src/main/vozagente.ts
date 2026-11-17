import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { guardar } from './disco'
import { duracionMedio } from './ffmpeg'

/**
 * La voz para el agente. El agente no tiene la cuenta de voz del usuario: se la pide a
 * Recorte dejando un pedido en `trabajo/voz/` (lo hace `python kit/kit.py voz`), y Recorte,
 * mientras el agente trabaja, lo atiende con la voz que el usuario eligió en la caja.
 *
 * Es un buzón de archivos a propósito: sin puertos ni llaves, funciona igual con todos los
 * agentes (también con los que no dejan salir a la red) y deja rastro de lo que se pidió.
 *
 * Cada frase es su propio audio (`voz/<pedido>-NN.wav`): así el agente ajusta cada momento a
 * lo que dura su frase, y cambiar lo que dice una escena es volver a generar solo esa.
 */

export interface FraseVoz {
  texto: string
  /** Relativo a la carpeta de trabajo (p. ej. `voz/a1b2-01.wav`). */
  archivo: string
  duracion: number
}

export interface RespuestaVoz {
  ok: boolean
  voz?: string
  frases?: FraseVoz[]
  total?: number
  error?: string
}

/** La narración que pidió el agente en una ronda y no se pudo generar. */
export interface VozFaltante {
  /** Frases distintas que pidió el agente en la ronda. */
  pedidas: number
  /** Las que quedaron sin voz (pedidas que fallaron y no salieron después en otro pedido). */
  faltan: number
  /** cuota: se acabó la cuota del día (de la cuenta de Google o de la clave); otro: cualquier otro fallo. */
  motivo: 'cuota-cuenta' | 'cuota-clave' | 'otro'
  /** El error tal cual (para el «otro»). */
  error: string
}

/**
 * Lo que faltó de la narración en la ronda que empezó en `desde`, mirando los pedidos y respuestas de `trabajo/voz/`:
 * una frase falta si falló y no salió en ningún pedido posterior. null si no faltó nada.
 */
export function vozQueFalto(trabajo: string, desde: number): VozFaltante | null {
  const dir = join(trabajo, 'voz')
  if (!existsSync(dir)) return null
  const leer = (n: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^﻿/, '')) as Record<string, unknown>
    } catch {
      return null
    }
  }
  const limpia = (t: unknown) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '')
  const pedidas = new Set<string>()
  const hechas = new Set<string>()
  const fallidas = new Set<string>()
  const errores: string[] = []
  for (const n of readdirSync(dir)) {
    const id = /^respuesta-([\w-]{1,40})\.json$/.exec(n)?.[1]
    if (!id || statSync(join(dir, n)).mtimeMs < desde) continue
    const r = leer(n)
    const pedido = leer(`pedido-${id}.json`)
    const frases = (Array.isArray(pedido?.frases) ? pedido.frases : []).map(limpia).filter(Boolean)
    for (const f of frases) pedidas.add(f)
    for (const f of Array.isArray(r?.frases) ? (r.frases as { texto?: unknown }[]) : []) hechas.add(limpia(f.texto))
    if (r && r.ok === false && typeof r.error === 'string' && !/SIN voz/.test(r.error)) {
      errores.push(r.error)
      for (const f of frases) fallidas.add(f)
    }
  }
  const faltan = [...fallidas].filter((f) => !hechas.has(f)).length
  if (!faltan) return null
  const error = errores[errores.length - 1] ?? ''
  const motivo = /cuota de voz de tu clave/i.test(error) ? 'cuota-clave' : /\(429\)|cuota/i.test(error) ? 'cuota-cuenta' : 'otro'
  return { pedidas: pedidas.size, faltan, motivo, error }
}

/** El aviso para el usuario: cuánto quedó sin voz, por qué y qué hacer. */
export function avisoVozFaltante(v: VozFaltante): string {
  const cuanto =
    v.faltan >= v.pedidas
      ? 'La narración quedó sin voz: el video va en silencio donde debía hablar.'
      : `${v.faltan} de ${v.pedidas} frases de la narración quedaron sin voz: en esas partes el video va en silencio.`
  if (v.motivo === 'cuota-cuenta')
    return `${cuanto} Se acabó la cuota diaria de voz de tu cuenta de Google (AI Studio). Se renueva mañana: entonces pídeme «genera la voz que faltó» y hago solo esas frases. Si no quieres esperar, pon una clave de AI Studio en Ajustes → Voz.`
  if (v.motivo === 'cuota-clave')
    return `${cuanto} Se acabó la cuota diaria de voz de tu clave de AI Studio. Se renueva mañana: entonces pídeme «genera la voz que faltó» y hago solo esas frases.`
  const detalle = v.error.replace(/^Recorte no pudo generar la voz: /, '').replace(/\. Sigue sin esa narración y dilo en el resumen\.$/, '')
  return `${cuanto} La voz falló: ${detalle.slice(0, 240)}. Cuando lo resuelvas, pídeme «genera la voz que faltó».`
}

/** Genera una frase con la voz dada y la deja en `salida` (un WAV). Lo pone index.ts. */
export type GenerarFrase = (texto: string, voz: string, salida: string) => Promise<void>

const MAX_FRASES = 40
const MAX_LARGO = 600

/**
 * Atiende los pedidos de voz de una carpeta de trabajo hasta que se llame a lo que devuelve.
 * `vozElegida` es la voz de la caja; sin ella, el usuario quiso el video sin narración.
 */
export function atenderVoz(
  trabajo: string,
  vozElegida: string | undefined,
  generar: GenerarFrase,
  onLinea: (texto: string) => void
): () => void {
  const dir = join(trabajo, 'voz')
  const atendidos = new Set<string>()
  let ocupado = false
  let parado = false

  const responder = (id: string, r: RespuestaVoz) => guardar(join(dir, `respuesta-${id}.json`), JSON.stringify(r, null, 2))

  const atender = async (id: string): Promise<void> => {
    let pedido: { frases?: unknown; voz?: unknown }
    try {
      pedido = JSON.parse(readFileSync(join(dir, `pedido-${id}.json`), 'utf8').replace(/^\uFEFF/, '')) as typeof pedido
    } catch {
      // Puede estar a medio escribir: se reintenta en la siguiente vuelta.
      atendidos.delete(id)
      return
    }
    if (!vozElegida) {
      return responder(id, { ok: false, error: 'El usuario eligió hacer este video SIN voz. No pongas narración; si crees que la necesita, dilo en el resumen.' })
    }
    const frases = (Array.isArray(pedido.frases) ? pedido.frases : [])
      .map((f) => (typeof f === 'string' ? f.replace(/\s+/g, ' ').trim().slice(0, MAX_LARGO) : ''))
      .filter(Boolean)
      .slice(0, MAX_FRASES)
    if (!frases.length) return responder(id, { ok: false, error: 'El pedido no trae frases (una por línea).' })
    const hechas: FraseVoz[] = []
    try {
      for (const [i, texto] of frases.entries()) {
        if (parado) return
        onLinea(`Voz ${vozElegida}: frase ${i + 1} de ${frases.length}`)
        const archivo = `voz/${id}-${String(i + 1).padStart(2, '0')}.wav`
        await generar(texto, vozElegida, join(trabajo, archivo))
        hechas.push({ texto, archivo, duracion: Math.round((await duracionMedio(join(trabajo, archivo))) * 100) / 100 })
      }
      responder(id, { ok: true, voz: vozElegida, frases: hechas, total: Math.round(hechas.reduce((s, f) => s + f.duracion, 0) * 100) / 100 })
    } catch (e) {
      responder(id, {
        ok: false,
        voz: vozElegida,
        // Lo que sí salió se conserva: el agente puede usarlo y avisar de lo que faltó.
        ...(hechas.length ? { frases: hechas } : {}),
        error: `Recorte no pudo generar la voz: ${e instanceof Error ? e.message : String(e)}. Sigue sin esa narración y dilo en el resumen.`
      })
    }
  }

  const vuelta = async (): Promise<void> => {
    if (ocupado || parado || !existsSync(dir)) return
    ocupado = true
    try {
      for (const n of readdirSync(dir)) {
        const id = /^pedido-([\w-]{1,40})\.json$/.exec(n)?.[1]
        if (!id || atendidos.has(id) || existsSync(join(dir, `respuesta-${id}.json`))) continue
        atendidos.add(id)
        await atender(id)
      }
    } catch {
      // La carpeta puede cambiar mientras se lee: se vuelve a mirar en la siguiente vuelta.
    } finally {
      ocupado = false
    }
  }

  mkdirSync(dir, { recursive: true })
  const reloj = setInterval(() => void vuelta(), 1500)
  return () => {
    parado = true
    clearInterval(reloj)
  }
}
