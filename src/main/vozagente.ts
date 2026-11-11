import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
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
