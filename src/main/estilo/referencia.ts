import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { EstiloMedido } from '../../shared/estilo'
import { resolverBinario } from '../binarios'
import { ejecutar } from '../crear'
import { guardar } from '../disco'
import { probeVideo } from '../ffmpeg'
import { Parado } from '../ia'
import { transcribirArchivo } from '../transcribir'
import { detectarPlanos, hojaContacto, miniatura } from './material'

/**
 * Fase 2 (parte local) de «Copiar un estilo»: mide el video de referencia sin gastar
 * tokens y guarda `analisis/estilo-medido.json`: duración y formato, planos y cortes
 * por minuto, voz (Whisper), volumen integrado (loudnorm en análisis), silencios,
 * colores dominantes y fotogramas clave (uno por plano, máximo 24) + hojas de contacto.
 * Después el agente interpreta esto (ficha.ts).
 */

const ffmpeg = (): string => resolverBinario('ffmpeg') ?? 'ffmpeg'

/** Un fotograma por plano, como mucho. */
const MAX_FOTOGRAMAS = 24
/** Muestras para el color dominante, repartidas en el video. */
const MUESTRAS_COLOR = 8

const redondeo = (n: number, d = 100): number => Math.round(n * d) / d

function formatoDe(ancho: number, alto: number): EstiloMedido['formato'] {
  if (!ancho || !alto) return 'otro'
  const r = ancho / alto
  if (r > 1.3) return '16:9'
  if (r < 0.77) return '9:16'
  if (r >= 0.9 && r <= 1.1) return '1:1'
  return 'otro'
}

function mediana(numeros: number[]): number {
  if (!numeros.length) return 0
  const orden = [...numeros].sort((a, b) => a - b)
  const mitad = Math.floor(orden.length / 2)
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2
}

/** El volumen integrado en LUFS (loudnorm en modo análisis), o null si no se puede. */
async function volumenIntegrado(ruta: string, cwd: string, senal?: AbortSignal): Promise<number | null> {
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-hide_banner', '-i', `"${ruta}"`, '-af', 'loudnorm=print_format=json', '-vn', '-f', 'null', '-'],
    cwd,
    5 * 60_000,
    senal
  )
  if (senal?.aborted) throw new Parado()
  const m = /"input_i"\s*:\s*"(-?[\d.]+)"/.exec(r.salida)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) ? v : null
}

/** Los silencios de medio segundo o más (silencedetect a −35 dB). */
async function silenciosDe(ruta: string, cwd: string, senal?: AbortSignal): Promise<{ inicio: number; fin: number }[]> {
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-hide_banner', '-i', `"${ruta}"`, '-af', 'silencedetect=noise=-35dB:d=0.5', '-vn', '-f', 'null', '-'],
    cwd,
    5 * 60_000,
    senal
  )
  if (senal?.aborted) throw new Parado()
  const lista: { inicio: number; fin: number }[] = []
  let abierto: number | null = null
  for (const linea of r.salida.split(/\r?\n/)) {
    const inicio = /silence_start:\s*([\d.]+)/.exec(linea)
    if (inicio) {
      abierto = Number(inicio[1])
      continue
    }
    const fin = /silence_end:\s*([\d.]+)/.exec(linea)
    if (fin && abierto !== null) {
      lista.push({ inicio: redondeo(abierto), fin: redondeo(Number(fin[1])) })
      abierto = null
    }
  }
  return lista.slice(0, 30)
}

/** El color medio del video en un segundo, como hex (escala a 1×1 y lee 3 bytes RGB). */
async function colorEn(ruta: string, segundo: number, temporal: string, cwd: string, senal?: AbortSignal): Promise<string | null> {
  const r = await ejecutar(
    [`"${ffmpeg()}"`, '-y', '-v', 'error', '-ss', segundo.toFixed(2), '-i', `"${ruta}"`, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', `"${temporal}"`],
    cwd,
    60_000,
    senal
  )
  if (r.codigo !== 0 || !existsSync(temporal)) return null
  try {
    const bytes = readFileSync(temporal)
    if (bytes.length < 3) return null
    const hex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}`
  } finally {
    rmSync(temporal, { force: true })
  }
}

/**
 * Mide la referencia y guarda el resultado. `ruta` es el archivo ya copiado a la
 * creación (`analisis/referencia.mp4`). Se puede parar con la señal de ia.ts.
 */
export async function medirReferencia(
  ruta: string,
  carpeta: string,
  onProgreso: (pct: number, texto: string) => void,
  senal?: AbortSignal
): Promise<EstiloMedido> {
  const analisis = join(carpeta, 'analisis')
  mkdirSync(analisis, { recursive: true })
  if (senal?.aborted) throw new Parado()

  const info = await probeVideo(ruta)

  onProgreso(0.05, 'Buscando los planos de la referencia')
  const planos = await detectarPlanos(ruta, carpeta, senal)
  const duraciones = planos.map((p) => redondeo(p.fin - p.inicio))

  onProgreso(0.2, 'Sacando los fotogramas clave')
  const fotogramas: string[] = []
  // Uno por plano, repartidos si hay más de MAX_FOTOGRAMAS planos.
  const paso = Math.max(1, Math.ceil(planos.length / MAX_FOTOGRAMAS))
  const elegidos = planos.filter((_, i) => i % paso === 0).slice(0, MAX_FOTOGRAMAS)
  for (const [i, p] of elegidos.entries()) {
    if (senal?.aborted) throw new Parado()
    const archivo = join(analisis, `ref-${String(i + 1).padStart(2, '0')}.jpg`)
    const medio = p.inicio + (p.fin - p.inicio) / 2
    if (await miniatura(ruta, medio, archivo, carpeta, senal)) fotogramas.push(`analisis/ref-${String(i + 1).padStart(2, '0')}.jpg`)
  }

  onProgreso(0.4, 'Hojas de contacto de la referencia')
  const hojas: string[] = []
  // Una hoja por tramo de 2 minutos, como mucho 3.
  const tramos = Math.min(3, Math.max(1, Math.ceil(info.duration / 120)))
  for (let t = 0; t < tramos; t++) {
    if (senal?.aborted) throw new Parado()
    const archivo = join(analisis, `ref-hoja-${t + 1}.jpg`)
    if (tramos === 1) {
      if (await hojaContacto(ruta, info.duration, archivo, carpeta, senal)) hojas.push(`analisis/ref-hoja-1.jpg`)
    } else {
      const inicio = (info.duration / tramos) * t
      const tramo = info.duration / tramos
      const intervalo = Math.max(1, Math.ceil(tramo / 16))
      const r = await ejecutar(
        [`"${ffmpeg()}"`, '-y', '-v', 'error', '-ss', inicio.toFixed(2), '-t', tramo.toFixed(2), '-i', `"${ruta}"`, '-vf', `fps=1/${intervalo},scale=320:-2,tile=4x4:margin=4:padding=4:color=black`, '-frames:v', '1', '-q:v', '4', `"${archivo}"`],
        carpeta,
        120_000,
        senal
      )
      if (r.codigo === 0 && existsSync(archivo)) hojas.push(`analisis/ref-hoja-${t + 1}.jpg`)
    }
  }

  onProgreso(0.5, 'Midiendo el color')
  const colores: string[] = []
  for (let i = 0; i < MUESTRAS_COLOR; i++) {
    if (senal?.aborted) throw new Parado()
    const segundo = (info.duration * (i + 0.5)) / MUESTRAS_COLOR
    const hex = await colorEn(ruta, segundo, join(analisis, `.color-${i}.rgb`), carpeta, senal)
    if (hex) colores.push(hex)
  }

  let conVoz = false
  let transcripcion: { inicio: number; texto: string }[] = []
  let volumen: number | null = null
  let silencios: { inicio: number; fin: number }[] = []
  if (info.hasAudio) {
    onProgreso(0.6, 'Midiendo el volumen y los silencios')
    ;[volumen, silencios] = await Promise.all([volumenIntegrado(ruta, carpeta, senal), silenciosDe(ruta, carpeta, senal)])

    onProgreso(0.7, 'Escuchando la referencia')
    const r = await transcribirArchivo(
      ruta,
      join(analisis, 'referencia-transcripcion.json'),
      (pct, t) => onProgreso(0.7 + pct * 0.3, t ?? 'Escuchando la referencia'),
      senal
    )
    if (senal?.aborted) throw new Parado()
    if (r.ok && r.transcript) {
      transcripcion = r.transcript
        .map((s) => ({ inicio: redondeo(s.start, 10), texto: s.text.replace(/\s+/g, ' ').trim() }))
        .filter((s) => s.texto)
      conVoz = transcripcion.length > 0
    }
  }

  const medido: EstiloMedido = {
    duracion: redondeo(info.duration),
    ancho: info.width,
    alto: info.height,
    formato: formatoDe(info.width, info.height),
    planos: planos.map((p) => ({ inicio: redondeo(p.inicio), fin: redondeo(p.fin) })),
    duraciones,
    promedioPlano: redondeo(duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : 0),
    medianaPlano: redondeo(mediana(duraciones)),
    cortesPorMinuto: info.duration > 0 ? redondeo((Math.max(0, planos.length - 1) / info.duration) * 60, 10) : 0,
    conVoz,
    transcripcion,
    volumen,
    silencios,
    colores,
    fotogramas,
    hojas
  }
  guardar(join(analisis, 'estilo-medido.json'), JSON.stringify(medido, null, 2))
  return medido
}

/** Lee la medición guardada, si existe. */
export function leerEstiloMedido(carpeta: string): EstiloMedido | null {
  try {
    return JSON.parse(readFileSync(join(carpeta, 'analisis', 'estilo-medido.json'), 'utf8')) as EstiloMedido
  } catch {
    return null
  }
}
