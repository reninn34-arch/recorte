import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipSuggestion, Project, RecetaEdicion, Word } from '../shared/types'
import { duracionReceta, FUNDIDO_S } from '../shared/receta'
import { detectarCaras, type PuntoCara } from './caras'
import { rutaFfmpeg } from './ffmpeg'

export interface ResultadoRender {
  ok: boolean
  error?: string
  output?: string
  cover?: string
}

export interface Bloque {
  start: number
  end: number
  texto: string
}

export function colorAss(hex: string): string {
  const coincidencia = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!coincidencia) return '&H00FFFFFF'
  const [r, g, b] = [
    coincidencia[1].slice(0, 2),
    coincidencia[1].slice(2, 4),
    coincidencia[1].slice(4, 6)
  ]
  return `&H00${b}${g}${r}`.toUpperCase()
}

export function tiempoAss(segundos: number): string {
  const total = Math.max(0, segundos)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundosEnteros = Math.floor(total % 60)
  const centesimas = Math.floor((total % 1) * 100)
  return `${horas}:${String(minutos).padStart(2, '0')}:${String(segundosEnteros).padStart(2, '0')}.${String(centesimas).padStart(2, '0')}`
}

function tiempoSrt(segundos: number): string {
  const total = Math.max(0, segundos)
  const horas = Math.floor(total / 3600)
  const minutos = Math.floor((total % 3600) / 60)
  const segundosEnteros = Math.floor(total % 60)
  const milisegundos = Math.floor((total % 1) * 1000)
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundosEnteros).padStart(2, '0')},${String(milisegundos).padStart(3, '0')}`
}

export function escapar(texto: string): string {
  return texto
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\r?\n/g, ' ')
    .trim()
}

export function nombreSeguro(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || 'clip'
  )
}

export function construirBloques(proyecto: Project, clip: ClipSuggestion): Bloque[] {
  const duracion = clip.end - clip.start
  const palabras: Word[] = []

  for (const segmento of proyecto.transcript ?? []) {
    if (segmento.end <= clip.start || segmento.start >= clip.end) continue
    for (const palabra of segmento.words ?? []) {
      const inicio = Math.max(palabra.start, clip.start) - clip.start
      const fin = Math.min(palabra.end, clip.end) - clip.start
      const texto = palabra.text.trim()
      if (fin <= inicio || !texto) continue
      palabras.push({ text: texto, start: inicio, end: fin })
    }
  }

  palabras.sort((a, b) => a.start - b.start)

  if (palabras.length === 0) {
    for (const segmento of proyecto.transcript ?? []) {
      if (segmento.end <= clip.start || segmento.start >= clip.end) continue
      const inicio = Math.max(segmento.start, clip.start) - clip.start
      const fin = Math.min(segmento.end, clip.end) - clip.start
      const texto = segmento.text.replace(/\s+/g, ' ').trim()
      if (fin > inicio && texto) palabras.push({ text: texto, start: inicio, end: fin })
    }
  }

  const bloques: Bloque[] = []
  let actual: Word[] = []
  let ultimoFin = 0

  const cerrar = () => {
    if (actual.length === 0) return
    const texto = actual
      .map((palabra) => palabra.text)
      .join(' ')
      .replace(/\s+([,.;:!?])/g, '$1')
    const inicio = Math.max(actual[0].start, ultimoFin)
    const fin = Math.max(actual[actual.length - 1].end, inicio + 0.45)
    if (fin > inicio) {
      bloques.push({ start: inicio, end: Math.min(fin, duracion), texto })
      ultimoFin = fin
    }
    actual = []
  }

  for (const palabra of palabras) {
    const anterior = actual[actual.length - 1]
    const pausa = anterior ? palabra.start - anterior.end : 0
    const textoCon = [...actual, palabra].map((item) => item.text).join(' ')

    if (actual.length >= 5 || textoCon.length > 30 || pausa > 0.6) cerrar()

    actual.push(palabra)
    if (/[.!?]$/.test(palabra.text)) cerrar()
  }

  cerrar()

  return bloques.filter((bloque) => bloque.end - bloque.start >= 0.25)
}

function escribirAss(
  carpeta: string,
  clip: ClipSuggestion,
  proyecto: Project,
  bloques: Bloque[]
): string {
  const duracion = Math.max(0.5, clip.end - clip.start)
  const nombre = `sub-${clip.id.replace(/[^\w-]/g, '')}.ass`
  const color = colorAss(proyecto.brand.primary)
  const marca = escapar(proyecto.brand.name.toLocaleUpperCase('es'))

  const eventos = bloques
    .map(
      (bloque) =>
        `Dialogue: 0,${tiempoAss(bloque.start)},${tiempoAss(bloque.end)},Reel,,0,0,0,,${escapar(bloque.texto)}`
    )
    .join('\n')

  const contenido = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,Arial,64,${color},&H00FFFFFF,&H00121212,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,70,70,250,1
Style: Marca,Arial,30,&H00FFFFFF,&H00FFFFFF,&H00121212,&H80000000,-1,0,0,0,100,100,4,0,1,2,1,7,60,60,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${tiempoAss(duracion)},Marca,,0,0,0,,{\\fsp4}${marca}
${eventos}
`

  writeFileSync(join(carpeta, nombre), contenido, 'utf8')
  return nombre
}

export function construirSrt(bloques: Bloque[]): string {
  return `${bloques
    .map(
      (bloque, indice) =>
        `${indice + 1}\n${tiempoSrt(bloque.start)} --> ${tiempoSrt(bloque.end)}\n${bloque.texto}\n`
    )
    .join('\n')}\n`
}

function filtroCentro(nombreAss: string): string {
  return `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,subtitles=${nombreAss}`
}

/**
 * Reencuadre con seguimiento de cara: escala a 1920 de alto y recorta 1080
 * siguiendo el centro de la cara con interpolación lineal entre detecciones.
 * Devuelve null si no hay caras o el video no da para 1080 de ancho.
 */
function filtroCara(
  proyecto: Project,
  clip: ClipSuggestion,
  puntos: PuntoCara[],
  nombreAss: string
): string | null {
  const { width, height } = proyecto.source
  if (!width || !height) return null

  const escala = 1920 / height
  const ancho = width * escala
  if (ancho < 1080 || puntos.length < 2) return null

  const maxX = ancho - 1080

  // El crop ve tiempos desde 0 (el corte usa -ss); la detección usa tiempo absoluto.
  const clave = puntos
    .map((p) => ({
      t: Math.max(0, p.t - clip.start),
      x: Math.min(Math.max(p.x * escala - 540, 0), maxX)
    }))
    .filter((p, i, arr) => i === 0 || p.t - arr[i - 1].t > 0.05)

  if (clave.length === 0) return null

  let expr = clave[clave.length - 1].x.toFixed(1)
  for (let i = clave.length - 2; i >= 0; i--) {
    const a = clave[i]
    const b = clave[i + 1]
    const dt = (b.t - a.t).toFixed(2)
    expr = `if(lt(t,${b.t.toFixed(2)}),${a.x.toFixed(1)}+(${(b.x - a.x).toFixed(1)})*(t-${a.t.toFixed(2)})/${dt},${expr})`
  }

  return `scale=-2:1920,crop=1080:1920:x='${expr}':y=0,setsar=1,subtitles=${nombreAss}`
}

/** Extrae un fotograma del MP4 ya renderizado: la portada sale con subtítulos y marca. */
export function crearPortada(salida: string, duracion: number): Promise<string | undefined> {
  return new Promise((resolver) => {
    const portada = salida.replace(/\.mp4$/i, '.jpg')
    const instante = Math.min(1.2, Math.max(0.2, duracion * 0.2))
    const hijo = spawn(
      rutaFfmpeg(),
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(instante),
        '-i',
        salida,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        portada
      ],
      { windowsHide: true }
    )
    hijo.on('error', () => resolver(undefined))
    hijo.on('close', (codigo) => resolver(codigo === 0 ? portada : undefined))
  })
}

export async function renderClip(
  proyecto: Project,
  clip: ClipSuggestion,
  carpeta: string,
  onProgreso: (pct: number, texto?: string) => void
): Promise<ResultadoRender> {
  const duracion = Math.max(0.5, clip.end - clip.start)
  const salidas = join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })

  const base = `${nombreSeguro(clip.title)}-${clip.id.replace(/[^\w-]/g, '').slice(-6)}`
  const salida = join(salidas, `${base}.mp4`)

  let nombreAss: string
  try {
    const bloques = construirBloques(proyecto, clip)
    nombreAss = escribirAss(carpeta, clip, proyecto, bloques)
    writeFileSync(join(salidas, `${base}.srt`), construirSrt(bloques), 'utf8')
  } catch (error) {
    return {
      ok: false,
      error: `No pude preparar los subtítulos: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  let filtro: string
  if (clip.reframe === 'division') {
    filtro = `[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:8[blur];[fg]scale=1080:-2[front];[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1,subtitles=${nombreAss}`
  } else if (clip.reframe === 'cara') {
    onProgreso(0, 'Buscando caras')
    const puntos = await detectarCaras(proyecto, clip, carpeta)
    filtro = filtroCara(proyecto, clip, puntos, nombreAss) ?? filtroCentro(nombreAss)
  } else {
    filtro = filtroCentro(nombreAss)
  }

  return new Promise((resolver) => {
    const argumentos = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(clip.start),
      '-i',
      proyecto.source.path,
      '-t',
      String(duracion),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-vf',
      filtro,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      salida
    ]

    const hijo = spawn(rutaFfmpeg(), argumentos, { cwd: carpeta, windowsHide: true })
    let error = ''
    let cola = ''
    let resuelto = false

    const terminar = (resultado: ResultadoRender) => {
      if (resuelto) return
      resuelto = true
      resolver(resultado)
    }

    hijo.stdout.on('data', (buffer) => {
      cola += buffer.toString()
      const lineas = cola.split(/\r?\n/)
      cola = lineas.pop() ?? ''

      for (const linea of lineas) {
        const avance = /^out_time_us=(\d+)/.exec(linea)
        if (avance) {
          onProgreso(Math.min(Number(avance[1]) / 1_000_000 / duracion, 0.99), 'Renderizando')
        }
      }
    })

    hijo.stderr.on('data', (buffer) => {
      error = (error + buffer.toString()).slice(-4000)
    })

    hijo.on('error', (fallo) => {
      terminar({ ok: false, error: `No pude iniciar FFmpeg: ${fallo.message}` })
    })

    hijo.on('close', (codigo) => {
      if (codigo === 0) {
        void crearPortada(salida, duracion).then((portada) => {
          onProgreso(1, 'Clip listo')
          terminar({ ok: true, output: salida, cover: portada })
        })
      } else {
        terminar({
          ok: false,
          error: error.trim() || `FFmpeg terminó con código ${codigo}.`
        })
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Fase 1 — render de una RecetaEdicion completa
// ---------------------------------------------------------------------------

/** Subtítulos de la edición: mismos bloques de palabras, remapeados al tiempo final. */
function construirBloquesEdicion(proyecto: Project, receta: RecetaEdicion): Bloque[] {
  const velocidad = receta.velocidad ?? 1
  const fundido = receta.transicion === 'fundido' ? FUNDIDO_S : 0
  const bloques: Bloque[] = []
  let desplazamiento = 0

  for (const corte of receta.cortes) {
    const delCorte = construirBloques(proyecto, { start: corte.start, end: corte.end } as ClipSuggestion)
    for (const bloque of delCorte) {
      bloques.push({
        start: desplazamiento + bloque.start / velocidad,
        end: desplazamiento + bloque.end / velocidad,
        texto: bloque.texto
      })
    }
    desplazamiento += (corte.end - corte.start) / velocidad - fundido
  }
  return bloques.filter((bloque) => bloque.end - bloque.start >= 0.25)
}

function escribirAssEdicion(carpeta: string, proyecto: Project, bloques: Bloque[], duracion: number): string {
  const nombre = 'sub-edicion.ass'
  const color = colorAss(proyecto.brand.primary)
  const marca = escapar(proyecto.brand.name.toLocaleUpperCase('es'))

  const eventos = bloques
    .map(
      (bloque) =>
        `Dialogue: 0,${tiempoAss(bloque.start)},${tiempoAss(bloque.end)},Reel,,0,0,0,,${escapar(bloque.texto)}`
    )
    .join('\n')

  const contenido = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,Arial,64,${color},&H00FFFFFF,&H00121212,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,70,70,250,1
Style: Marca,Arial,30,&H00FFFFFF,&H00FFFFFF,&H00121212,&H80000000,-1,0,0,0,100,100,4,0,1,2,1,7,60,60,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${tiempoAss(duracion)},Marca,,0,0,0,,{\\fsp4}${marca}
${eventos}
`

  writeFileSync(join(carpeta, nombre), contenido, 'utf8')
  return nombre
}

/**
 * filter_complex de la receta: recorta cada segmento, aplica velocidad, color y
 * reencuadre vertical por centro, y los une con concat (corte seco) o con una
 * cadena xfade/acrossfade (fundido cruzado). Los captions se queman al final.
 */
function filtroReceta(receta: RecetaEdicion, nombreAss: string | null): string {
  const velocidad = receta.velocidad ?? 1
  const color = receta.color ?? {}
  const eq =
    color.brillo || (color.contraste !== undefined && color.contraste !== 1) || (color.saturacion !== undefined && color.saturacion !== 1)
      ? `,eq=brightness=${(color.brillo ?? 0).toFixed(3)}:contrast=${(color.contraste ?? 1).toFixed(3)}:saturation=${(color.saturacion ?? 1).toFixed(3)}`
      : ''
  const velocidadV = velocidad !== 1 ? `,setpts=PTS/${velocidad}` : ''
  const velocidadA = velocidad !== 1 ? `,atempo=${velocidad}` : ''

  const partes: string[] = []
  const n = receta.cortes.length

  receta.cortes.forEach((corte, i) => {
    partes.push(
      `[0:v]trim=start=${corte.start}:end=${corte.end},setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1${eq}${velocidadV}[v${i}]`
    )
    partes.push(
      `[0:a]atrim=start=${corte.start}:end=${corte.end},asetpts=PTS-STARTPTS${velocidadA}[a${i}]`
    )
  })

  let etiquetaV: string
  let etiquetaA: string

  if (n === 1) {
    partes.push('[v0]null[vcat]')
    partes.push('[a0]anull[acat]')
    etiquetaV = '[vcat]'
    etiquetaA = '[acat]'
  } else if (receta.transicion === 'fundido') {
    // Cadena xfade: cada unión funde 0,4 s; el offset se acumula.
    let acumulado = (receta.cortes[0].end - receta.cortes[0].start) / velocidad
    let vPrev = '[v0]'
    let aPrev = '[a0]'
    for (let i = 1; i < n; i++) {
      const vOut = i === n - 1 ? '[vcat]' : `[vx${i}]`
      const aOut = i === n - 1 ? '[acat]' : `[ax${i}]`
      partes.push(
        `${vPrev}[v${i}]xfade=transition=fade:duration=${FUNDIDO_S}:offset=${(acumulado - FUNDIDO_S).toFixed(3)}${vOut}`
      )
      partes.push(`${aPrev}[a${i}]acrossfade=d=${FUNDIDO_S}${aOut}`)
      acumulado += (receta.cortes[i].end - receta.cortes[i].start) / velocidad - FUNDIDO_S
      vPrev = vOut
      aPrev = aOut
    }
    etiquetaV = '[vcat]'
    etiquetaA = '[acat]'
  } else {
    const entradas = receta.cortes.map((_, i) => `[v${i}][a${i}]`).join('')
    partes.push(`${entradas}concat=n=${n}:v=1:a=1[vcat][acat]`)
    etiquetaV = '[vcat]'
    etiquetaA = '[acat]'
  }

  if (nombreAss) {
    partes.push(`${etiquetaV}subtitles=${nombreAss}[vf]`)
    etiquetaV = '[vf]'
  }

  partes.push(`${etiquetaV}null[vout]`)
  partes.push(`${etiquetaA}anull[aout]`)
  return partes.join(';')
}

/**
 * Renderiza una edición completa decidida por un agente (fase 1).
 * Produce `salidas/edicion-<titulo>.mp4` más su SRT y su portada.
 */
export async function renderReceta(
  proyecto: Project,
  receta: RecetaEdicion,
  carpeta: string,
  onProgreso: (pct: number, texto?: string) => void
): Promise<ResultadoRender> {
  const duracion = duracionReceta(receta)
  const salidas = join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })

  const base = `edicion-${nombreSeguro(receta.titulo)}`
  const salida = join(salidas, `${base}.mp4`)

  let nombreAss: string | null = null
  if (receta.captions && proyecto.transcript?.length) {
    try {
      const bloques = construirBloquesEdicion(proyecto, receta)
      nombreAss = escribirAssEdicion(carpeta, proyecto, bloques, duracion)
      writeFileSync(join(salidas, `${base}.srt`), construirSrt(bloques), 'utf8')
    } catch (error) {
      return {
        ok: false,
        error: `No pude preparar los subtítulos: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  const filtro = filtroReceta(receta, nombreAss)

  return new Promise((resolver) => {
    const argumentos = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      proyecto.source.path,
      '-filter_complex',
      filtro,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      salida
    ]

    const hijo = spawn(rutaFfmpeg(), argumentos, { cwd: carpeta, windowsHide: true })
    let error = ''
    let cola = ''
    let resuelto = false

    const terminar = (resultado: ResultadoRender) => {
      if (resuelto) return
      resuelto = true
      resolver(resultado)
    }

    hijo.stdout.on('data', (buffer) => {
      cola += buffer.toString()
      const lineas = cola.split(/\r?\n/)
      cola = lineas.pop() ?? ''

      for (const linea of lineas) {
        const avance = /^out_time_us=(\d+)/.exec(linea)
        if (avance) {
          onProgreso(Math.min(Number(avance[1]) / 1_000_000 / duracion, 0.99), 'Renderizando edición')
        }
      }
    })

    hijo.stderr.on('data', (buffer) => {
      error = (error + buffer.toString()).slice(-4000)
    })

    hijo.on('error', (fallo) => {
      terminar({ ok: false, error: `No pude iniciar FFmpeg: ${fallo.message}` })
    })

    hijo.on('close', (codigo) => {
      if (codigo === 0) {
        void crearPortada(salida, duracion).then((portada) => {
          onProgreso(1, 'Edición lista')
          terminar({ ok: true, output: salida, cover: portada })
        })
      } else {
        terminar({
          ok: false,
          error: error.trim() || `FFmpeg terminó con código ${codigo}.`
        })
      }
    })
  })
}
