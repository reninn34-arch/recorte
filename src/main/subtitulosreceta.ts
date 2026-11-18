import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Creacion } from '../shared/creacion'

/**
 * Los audios que sube el usuario y los subtítulos de la receta del agente.
 *
 * Un audio subido puede ser una NARRACIÓN (alguien habla casi todo el rato: el video se arma sobre ella y lleva
 * subtítulos) o MÚSICA (una canción, una base con unas palabras sueltas como «You ready? Yes!»: es la banda sonora y no
 * lleva subtítulos salvo que el usuario los pida). Se distingue con la transcripción que hace Recorte al prepararlo
 * (`vistazo/narracion-NN.json`): cuánto del audio es habla.
 */

const carpetaTrabajo = (carpeta: string): string => join(carpeta, 'trabajo')

/** Por debajo de esta parte del audio con habla, es música (una base con unas palabras, una canción con poca letra). */
export const HABLA_MINIMA_NARRACION = 0.4

export interface AudioSubido {
  /** «01», «02»… (vistazo/narracion-NN.*). */
  n: string
  duracion: number
  /** Segundos con habla (la suma de lo que dura cada frase). */
  habla: number
  /** Dónde acaba lo último que se dice. */
  finHabla: number
  /** Lo que se dice, junto. */
  texto: string
  musica: boolean
}

/** Lee una transcripción de `vistazo/narracion-NN.json` y dice si es narración o música. */
export function clasificarAudio(n: string, t: { duration?: unknown; segments?: { start?: unknown; end?: unknown; text?: unknown }[] }): AudioSubido {
  const frases = (t.segments ?? []).filter((s) => typeof s.start === 'number' && typeof s.end === 'number' && String(s.text ?? '').trim())
  const habla = frases.reduce((a, s) => a + Math.max(0, (s.end as number) - (s.start as number)), 0)
  const finHabla = frases.reduce((a, s) => Math.max(a, s.end as number), 0)
  const duracion = typeof t.duration === 'number' && t.duration > 0 ? t.duration : finHabla
  return {
    n,
    duracion,
    habla,
    finHabla,
    texto: frases.map((s) => String(s.text).trim()).join(' '),
    musica: duracion > 0 && habla / duracion < HABLA_MINIMA_NARRACION
  }
}

/** Los audios que subió el usuario, ya transcritos y clasificados (vacío si aún no se preparó el vistazo). */
export function audiosSubidos(carpeta: string): AudioSubido[] {
  const dir = join(carpetaTrabajo(carpeta), 'vistazo')
  const lista: AudioSubido[] = []
  try {
    for (const nombre of readdirSync(dir).sort()) {
      const m = /^narracion-(\d+)\.json$/.exec(nombre)
      if (!m) continue
      try {
        lista.push(clasificarAudio(m[1], JSON.parse(readFileSync(join(dir, nombre), 'utf8').replace(/^﻿/, ''))))
      } catch {
        // Una transcripción ilegible: ese audio queda sin clasificar (se trata como narración).
      }
    }
  } catch {
    // Sin vistazo todavía.
  }
  return lista
}

/** Hasta dónde se habla en las NARRACIONES que subió el usuario (no en la música), o null si no hay ninguna transcrita. */
export function finDeLoGrabado(carpeta: string): number | null {
  const narraciones = audiosSubidos(carpeta).filter((a) => !a.musica)
  return narraciones.length ? Math.max(...narraciones.map((a) => a.finHabla)) : null
}

/**
 * Si el video lleva voz, la receta tiene que traer sus subtítulos (en `"subtitulos"`, editables) y llegar hasta el
 * final de lo que se dice. La música que subió el usuario no cuenta como voz. Devuelve el problema para que el agente
 * lo corrija, o null.
 */
export function subtitulosQueFaltan(rutaReceta: string, c: Creacion, duracion?: number, audios: AudioSubido[] = []): string | null {
  let r: { voz?: unknown[]; subtitulos?: { frases?: { hasta?: unknown }[] } }
  try {
    r = JSON.parse(readFileSync(rutaReceta, 'utf8').replace(/^﻿/, ''))
  } catch {
    return null
  }
  const subidos = c.adjuntos.filter((a) => a.tipo === 'audio').length
  const narraciones = audios.filter((a) => !a.musica)
  // Los subidos que no se pudieron transcribir cuentan como narración (como siempre).
  const narracionSubida = narraciones.length > 0 || subidos > audios.length
  // La voz de la receta que no es un audio subido (una voz generada) también es voz.
  const vozGenerada = Boolean(c.vozElegida) || (Array.isArray(r.voz) && r.voz.some((v) => !/narracion-\d+\.wav/.test(JSON.stringify(v))))
  if (!narracionSubida && !vozGenerada) return null
  const frases = Array.isArray(r.subtitulos?.frases) ? r.subtitulos!.frases! : []
  if (!frases.length) {
    return 'El video lleva voz pero la receta no trae "subtitulos": ponlos EN LA RECETA (ver «Subtítulos» en kit/RECETA.md), de principio a fin, y NO los quemes con un script propio (el usuario los edita en su editor). Vuelve a armar con el kit.'
  }
  const ultimo = Math.max(...frases.map((f) => (typeof f.hasta === 'number' ? f.hasta : 0)))
  // Solo la narración que subió el usuario: los subtítulos llegan hasta donde se habla en ella, no hasta el final del
  // video (puede haber música o un cierre después). Con un margen, por si la receta la desplaza.
  if (!vozGenerada && narraciones.length && subidos === audios.length) {
    const fin = Math.max(...narraciones.map((a) => a.finHabla))
    return ultimo < fin - 2
      ? `Los subtítulos de la receta acaban en el segundo ${ultimo.toFixed(1)} y en la narración se habla hasta el ${fin.toFixed(1)}: faltan los del final. Cubre todo lo que se dice y vuelve a armar con el kit.`
      : null
  }
  // Lo que queda sin subtítulo al final, sin contar un cierre con logo (unos segundos).
  if (duracion && ultimo < duracion - 12) {
    return `Los subtítulos de la receta acaban en el segundo ${ultimo.toFixed(1)} y el video dura ${duracion.toFixed(1)} s: faltan los del final. Cubre todo lo que se dice y vuelve a armar con el kit.`
  }
  return null
}
