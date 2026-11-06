import type { ClipSuggestion, TranscriptSegment } from '../shared/types'

/**
 * Selección local de momentos. No usa LLM: puntúa señales del guion para que el
 * producto funcione sin claves ni conexión. El análisis con modelo llega después
 * y puede reemplazar esta función sin tocar la interfaz.
 */

const DURACION_MIN = 18
const DURACION_MAX = 52
const OBJETIVOS = [28, 40]
const MAX_CLIPS = 12
const RELLENO = /^(y|entonces|bueno|vale|mira|oye|pues|ok|okay|eh|este|o sea)\b[,\s]*/i

const SENALES: { prueba: RegExp; puntos: number; motivo: string }[] = [
  {
    prueba: /^(cómo|como|por qué|por que|qué|que|cuál|cual|cuándo|cuando|dónde|donde|quién|quien)\b/i,
    puntos: 9,
    motivo: 'abre con una pregunta'
  },
  {
    prueba: /\b(error|errores|fallo|fallos|problema|problemas|nunca|deja de|evita)\b/i,
    puntos: 8,
    motivo: 'señala un error'
  },
  {
    prueba: /\b(secreto|clave|truco|trucos|nadie|mito|equivocas|equivocamos)\b/i,
    puntos: 7,
    motivo: 'promete un descubrimiento'
  },
  {
    prueba: /\b(primero|segundo|tercero|cuarto|tres|dos|cuatro|cinco|pasos|claves)\b/i,
    puntos: 6,
    motivo: 'tiene una lista'
  },
  {
    prueba: /\b(imagina|piensa|mira|fíjate|fijate|escucha|atención|atencion)\b/i,
    puntos: 4,
    motivo: 'habla al espectador'
  },
  {
    prueba: /\b(pero|sin embargo|aunque|en cambio|al contrario)\b/i,
    puntos: 4,
    motivo: 'introduce un contraste'
  },
  { prueba: /\d+/, puntos: 3, motivo: 'usa un número concreto' },
  { prueba: /\?/, puntos: 3, motivo: 'hace una pregunta' }
]

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function recortar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto
  const corte = texto.slice(0, maximo)
  const espacio = corte.lastIndexOf(' ')
  return `${corte.slice(0, espacio > 16 ? espacio : maximo).trim()}…`
}

function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1) : texto
}

function primeraFrase(texto: string, maximo = 120): string {
  const limpio = limpiar(texto)
  const frase = limpio.split(/(?<=[.!?])\s+/)[0] ?? limpio
  return recortar(frase.replace(/[.!?]+$/, ''), maximo)
}

function tituloDe(segmentos: TranscriptSegment[]): string {
  let texto = limpiar(segmentos[0]?.text ?? '').replace(RELLENO, '')
  if (texto.length < 26 && segmentos[1]) {
    texto = `${texto} ${limpiar(segmentos[1].text).replace(RELLENO, '')}`
  }
  const clausula = texto.split(/[.!?]/)[0] ?? texto
  return capitalizar(recortar(clausula, 72)) || 'Momento de la clase'
}

function solapamiento(a: ClipSuggestion, b: ClipSuggestion): number {
  const interseccion = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
  const menor = Math.min(a.end - a.start, b.end - b.start)
  return menor > 0 ? interseccion / menor : 0
}

export function proponerClips(
  transcript: TranscriptSegment[],
  duracionFuente: number
): ClipSuggestion[] {
  const segmentos = transcript
    .filter((segmento) => segmento.end > segmento.start)
    .sort((a, b) => a.start - b.start)

  if (segmentos.length === 0) return []

  const candidatos: ClipSuggestion[] = []

  for (let inicio = 0; inicio < segmentos.length; inicio += 1) {
    for (const objetivo of OBJETIVOS) {
      let fin = inicio
      let duracion = 0

      while (fin < segmentos.length && duracion < objetivo) {
        duracion = segmentos[fin].end - segmentos[inicio].start
        fin += 1
      }

      if (fin <= inicio || duracion < DURACION_MIN || duracion > DURACION_MAX) continue

      const ventana = segmentos.slice(inicio, fin)
      const texto = ventana.map((segmento) => segmento.text).join(' ')
      const motivos: string[] = []
      let puntos = 55

      for (const senal of SENALES) {
        if (senal.prueba.test(texto)) {
          puntos += senal.puntos
          motivos.push(senal.motivo)
        }
      }

      // Empezar a mitad de una frase se nota mucho en un reel.
      const anterior = inicio > 0 ? segmentos[inicio - 1] : null
      if (anterior && !/[.!?]$/.test(limpiar(anterior.text))) {
        puntos -= 7
      }

      if (RELLENO.test(limpiar(segmentos[inicio].text))) puntos -= 4

      const ultimo = limpiar(ventana[ventana.length - 1].text)
      const cierra = /[.!?]$/.test(ultimo)
      if (cierra) puntos += 3
      else puntos -= 3

      const largoIdeal = Math.max(0, 12 - Math.abs(duracion - 30) * 0.35)
      puntos += largoIdeal

      const inicioClamp = Math.max(0, segmentos[inicio].start)
      const finClamp = Math.min(duracionFuente || Number.POSITIVE_INFINITY, ventana[ventana.length - 1].end)
      if (finClamp - inicioClamp < DURACION_MIN) continue

      motivos.push(`dura ${Math.round(finClamp - inicioClamp)} s`)

      const clip: ClipSuggestion = {
        id: `c-${Math.round(inicioClamp * 100)}-${Math.round(finClamp * 100)}`,
        start: Math.round(inicioClamp * 1000) / 1000,
        end: Math.round(finClamp * 1000) / 1000,
        title: tituloDe(ventana),
        hook: primeraFrase(texto),
        score: Math.max(60, Math.min(98, Math.round(puntos))),
        reason: capitalizar(motivos.slice(0, 3).join(' · ')),
        status: 'sugerido',
        captionStyle: 'Editorial',
        reframe: 'cara'
      }

      candidatos.push(clip)
    }
  }

  candidatos.sort((a, b) => b.score - a.score)

  const elegidos: ClipSuggestion[] = []
  for (const candidato of candidatos) {
    if (elegidos.length >= MAX_CLIPS) break
    if (elegidos.some((elegido) => solapamiento(elegido, candidato) > 0.3)) continue
    elegidos.push(candidato)
  }

  return elegidos
}
