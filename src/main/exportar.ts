import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ajustesDe, duracionTimeline, FUENTE_PRINCIPAL, FUENTES_TEXTO, vozEnTimeline, tramos, VOLUMEN_SONIDO, tramosDeVoces, type PosicionTexto, type Timeline } from '../shared/timeline'
import type { OpcionesExport } from '../shared/api'
import type { ClipSuggestion, Project } from '../shared/types'

/** Igual que en el monitor (`DUCKING_FACTOR` de la interfaz): la música baja a un cuarto con voz. */
const DUCKING_FACTOR = 0.25
import { probeVideo, rutaFfmpeg } from './ffmpeg'
import {
  colorAss,
  construirBloques,
  construirSrt,
  crearPortada,
  escapar,
  nombreSeguro,
  tiempoAss,
  type Bloque,
  type ResultadoRender
} from './render'

/**
 * Exporta la timeline a MP4 con FFmpeg: lo mismo que se ve en el monitor.
 *
 * Cada clip entra como una entrada propia (`-ss`/`-t` antes de `-i`): FFmpeg busca
 * directo a su tramo y lo decodifica aparte, así que reordenar clips de una clase de
 * una hora no obliga a guardar en memoria todo lo que hay entre medias. Después se unen
 * con `concat` y se queman los rótulos (y, si se pide, los subtítulos de la voz) con ASS.
 */

export type { OpcionesExport }
type FormatoExport = OpcionesExport['formato']

const ALINEACION: Record<PosicionTexto, number> = { arriba: 8, centro: 5, abajo: 2 }

function par(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/** Tamaño de salida: el del material (par, como pide H.264) o 1080×1920. */
function dimensiones(proyecto: Project, formato: FormatoExport): { ancho: number; alto: number } {
  if (formato === 'vertical') return { ancho: 1080, alto: 1920 }
  const ancho = proyecto.source.width || 1920
  const alto = proyecto.source.height || 1080
  return { ancho: par(ancho), alto: par(alto) }
}

/** Subtítulos de la voz en tiempo de timeline: los bloques de cada clip, uno tras otro. */
function bloquesDeVoz(proyecto: Project, timeline: Timeline): Bloque[] {
  if (!proyecto.transcript?.length) return []
  const bloques: Bloque[] = []
  for (const tramo of tramos(timeline)) {
    if (tramo.clip.fuente !== FUENTE_PRINCIPAL) continue
    const delClip = construirBloques(proyecto, { start: tramo.clip.entrada, end: tramo.clip.salida } as ClipSuggestion)
    for (const b of delClip) bloques.push({ start: tramo.inicio + b.start, end: tramo.inicio + b.end, texto: b.texto })
  }
  return bloques
}

/**
 * La ganancia de la música en el tiempo: 1 sin voz y DUCKING_FACTOR con voz, con rampas
 * de 0,15 s. Los tramos de voz son los de la transcripción (los mismos que usa el monitor).
 */
function envolventeDucking(timeline: Timeline, proyecto: Project): string | null {
  // La voz es lo que se dice en los clips (su transcripción) y la narración puesta frase a frase.
  const voz = [...vozEnTimeline(timeline, proyecto.transcript), ...tramosDeVoces(timeline)]
  if (!voz.length) return null
  const rampa = 0.15
  const tramosVoz: [number, number][] = []
  for (const v of voz.map((x) => [x.inicio - 0.1, x.fin + 0.25] as [number, number]).sort((a, b) => a[0] - b[0])) {
    const ultimo = tramosVoz[tramosVoz.length - 1]
    if (ultimo && v[0] - ultimo[1] < 2 * rampa) ultimo[1] = Math.max(ultimo[1], v[1])
    else tramosVoz.push([v[0], v[1]])
  }
  const terminos = tramosVoz.map(
    ([a, b]) => `min(1,max(0,(t-(${a.toFixed(3)})+${rampa})/${rampa}))*min(1,max(0,((${b.toFixed(3)})+${rampa}-t)/${rampa}))`
  )
  return `1-${(1 - DUCKING_FACTOR).toFixed(3)}*min(1,${terminos.join('+')})`
}

function escribirAss(
  carpeta: string,
  proyecto: Project,
  timeline: Timeline,
  voz: Bloque[],
  ancho: number,
  alto: number
): string | null {
  const textos = timeline.textos.filter((t) => t.texto.trim())
  if (textos.length === 0 && voz.length === 0) return null

  const corto = Math.min(ancho, alto)
  const tamRotulo = Math.round(corto * (alto > ancho ? 0.06 : 0.065))
  const tamVoz = Math.round(corto * (alto > ancho ? 0.058 : 0.05))
  const caja = Math.round(tamRotulo * 0.28)
  const margenArriba = Math.round(alto * 0.07)
  const margenAbajo = Math.round(alto * 0.09)
  const color = colorAss(proyecto.brand.primary)

  // Rótulos: caja negra semitransparente, como en el monitor. Voz: color de marca con borde.
  const estilos = [
    `Style: RotuloArriba,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H4D000000,&H4D000000,-1,0,0,0,100,100,0,0,3,${caja},0,8,40,40,${margenArriba},1`,
    `Style: RotuloCentro,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H4D000000,&H4D000000,-1,0,0,0,100,100,0,0,3,${caja},0,5,40,40,0,1`,
    `Style: RotuloAbajo,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H4D000000,&H4D000000,-1,0,0,0,100,100,0,0,3,${caja},0,2,40,40,${margenAbajo},1`,
    // Los mismos sin caja: la letra con borde y sombra, como un título.
    `Style: RotuloArribaLibre,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(tamRotulo / 14))},2,8,40,40,${margenArriba},1`,
    `Style: RotuloCentroLibre,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(tamRotulo / 14))},2,5,40,40,0,1`,
    `Style: RotuloAbajoLibre,Arial,${tamRotulo},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(tamRotulo / 14))},2,2,40,40,${margenAbajo},1`,
    `Style: Voz,Arial,${tamVoz},${color},&H00FFFFFF,&H00121212,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(tamVoz / 16))},2,2,60,60,${Math.round(alto * (alto > ancho ? 0.16 : 0.08))},1`
  ]
  const nombreEstilo: Record<PosicionTexto, string> = { arriba: 'RotuloArriba', centro: 'RotuloCentro', abajo: 'RotuloAbajo' }

  const eventos = [
    ...voz.map((b) => `Dialogue: 0,${tiempoAss(b.start)},${tiempoAss(b.end)},Voz,,0,0,0,,${escapar(b.texto)}`),
    // Un rótulo abajo empuja los subtítulos hacia arriba al compartir alineación: van en otra capa.
    ...textos.map((t) => {
      // El tamaño y el color propios del rótulo van como etiquetas sobre el estilo de su posición.
      const libre = typeof t.x === 'number' && typeof t.y === 'number'
      const etiquetas = [
        libre ? `\\an5\\pos(${Math.round(t.x! * ancho)},${Math.round(t.y! * alto)})` : `\\an${ALINEACION[t.posicion]}`,
        ...(t.tamano ? [`\\fs${Math.round(tamRotulo * t.tamano)}`] : []),
        ...(t.color ? [`\\1c${colorAss(t.color).replace('&H00', '&H')}&`] : []),
        // La caja de su color (con caja, el borde del estilo es la caja), opaca como en el monitor.
        ...(t.caja && !t.sinCaja ? [`\\3c${colorAss(t.caja).replace('&H00', '&H')}&`, '\\3a&H00&'] : []),
        // La letra: una fuente de Windows, la misma que dibuja el monitor.
        ...(t.fuente && FUENTES_TEXTO[t.fuente] ? [`\\fn${FUENTES_TEXTO[t.fuente].familia}`, FUENTES_TEXTO[t.fuente].negrita ? '\\b1' : '\\b0'] : [])
      ].join('')
      // Cada línea del rótulo es una línea en el video.
      const lineas = t.texto
        .split(/\r?\n/)
        .map((l) => escapar(l))
        .filter(Boolean)
        .join('\\N')
      return `Dialogue: 1,${tiempoAss(t.inicio)},${tiempoAss(t.inicio + t.duracion)},${nombreEstilo[t.posicion]}${t.sinCaja ? 'Libre' : ''},,0,0,0,,{${etiquetas}}${lineas}`
    })
  ].join('\n')

  const contenido = `[Script Info]
ScriptType: v4.00+
PlayResX: ${ancho}
PlayResY: ${alto}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${estilos.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${eventos}
`
  const nombre = 'rotulos-timeline.ass'
  writeFileSync(join(carpeta, nombre), contenido, 'utf8')
  return nombre
}

export async function exportarTimeline(
  proyecto: Project,
  timeline: Timeline,
  carpeta: string,
  opciones: OpcionesExport,
  onProgreso: (pct: number, texto?: string) => void,
  /** La carpeta del usuario donde dejar el MP4 (si no, `salidas/` del proyecto). */
  destino?: string
): Promise<ResultadoRender> {
  let principalConAudio = true
  try {
    principalConAudio = (await probeVideo(proyecto.source.path)).hasAudio
  } catch {
    // Si ffprobe falla aquí, FFmpeg dará un error más claro al exportar.
  }
  // De dónde sale cada clip: el video principal o un medio de la biblioteca.
  const fuenteDe = (f: string): { ruta: string; tipo: 'video' | 'imagen'; conAudio: boolean } | null => {
    if (f === FUENTE_PRINCIPAL) return { ruta: proyecto.source.path, tipo: 'video', conAudio: principalConAudio }
    const m = proyecto.medios?.find((x) => x.id === f)
    return m && existsSync(m.ruta) ? { ruta: m.ruta, tipo: m.tipo, conAudio: m.conAudio } : null
  }
  const lista = tramos(timeline).filter((t) => fuenteDe(t.clip.fuente))
  if (lista.length === 0) return { ok: false, error: 'La timeline está vacía: no hay nada que exportar.' }
  const duracion = duracionTimeline(timeline)
  // Con que un clip tenga sonido, la salida lleva audio; los demás aportan silencio.
  const conAudio = lista.some((t) => fuenteDe(t.clip.fuente)!.conAudio && !t.clip.mudo)
  // La narración: cada frase es un archivo de la carpeta del proyecto, en su segundo.
  const frases = (timeline.voces ?? []).filter((v) => existsSync(join(carpeta, v.archivo)))
  // Los efectos de sonido (un «whoosh», un «pop»): suenan con la narración, a su volumen.
  const efectos = (timeline.sonidos ?? []).filter((s) => existsSync(join(carpeta, s.archivo)))
  /** Hay «voz» que mezclar con la música: el sonido de los clips, la narración, los efectos. */
  const hayBus = conAudio || frases.length > 0 || efectos.length > 0

  // La música vive en la carpeta del proyecto; normalizarMusica ya validó la ruta.
  let musica: { ruta: string; volumen: number; ducking: boolean } | null = null
  if (timeline.musica) {
    const ruta = join(carpeta, timeline.musica.archivo)
    if (!existsSync(ruta)) return { ok: false, error: `No encuentro la música «${timeline.musica.nombre}». Vuelve a añadirla.` }
    musica = { ruta, volumen: timeline.musica.volumen, ducking: timeline.musica.ducking }
  }

  const { ancho, alto } = dimensiones(proyecto, opciones.formato)
  const fps = proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? Math.round(proyecto.source.fps) : 30
  const salidas = destino ?? join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })
  const base = `timeline-${nombreSeguro(proyecto.name)}-${opciones.formato}`
  const salida = join(salidas, `${base}.mp4`)

  const voz = opciones.subtitulos ? bloquesDeVoz(proyecto, timeline) : []
  let ass: string | null
  try {
    ass = escribirAss(carpeta, proyecto, timeline, voz, ancho, alto)
    if (voz.length) writeFileSync(join(salidas, `${base}.srt`), construirSrt(voz), 'utf8')
  } catch (error) {
    return { ok: false, error: `No pude preparar los rótulos: ${error instanceof Error ? error.message : String(error)}` }
  }

  const encuadre =
    opciones.formato === 'vertical'
      ? `scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto}`
      : `scale=${ancho}:${alto}:force_original_aspect_ratio=decrease,pad=${ancho}:${alto}:(ow-iw)/2:(oh-ih)/2`

  const entradas: string[] = []
  const partes: string[] = []
  let n = 0
  lista.forEach((t, i) => {
    const largo = t.fin - t.inicio
    const f = fuenteDe(t.clip.fuente)!
    if (f.tipo === 'imagen') entradas.push('-loop', '1', '-framerate', String(fps), '-t', largo.toFixed(3), '-i', f.ruta)
    else entradas.push('-ss', t.clip.entrada.toFixed(3), '-t', largo.toFixed(3), '-i', f.ruta)
    const iv = n++
    // Zoom: recorte hacia el punto (cx, cy) antes de encuadrar. Color: eq. Lo mismo que el monitor.
    const a = ajustesDe(t.clip)
    const zoom =
      a.zoom > 1.001
        ? `crop=trunc(iw/${a.zoom}/2)*2:trunc(ih/${a.zoom}/2)*2:(iw-ow)*${a.cx.toFixed(3)}:(ih-oh)*${a.cy.toFixed(3)},`
        : ''
    // Acercamiento lento: zoompan cuadro a cuadro, al doble de tamaño para que no tiemble.
    const cuadros = Math.max(1, Math.round(largo * fps))
    const lento =
      a.acercar > 0.001
        ? `,scale=${ancho * 2}:${alto * 2},zoompan=z='1+${a.acercar.toFixed(4)}*on/${cuadros}':x='(iw-iw/zoom)*${a.cx.toFixed(3)}':y='(ih-ih/zoom)*${a.cy.toFixed(3)}':d=1:s=${ancho}x${alto}:fps=${fps}`
        : ''
    const color =
      a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1
        ? `,eq=brightness=${a.brillo.toFixed(3)}:contrast=${a.contraste.toFixed(3)}:saturation=${a.saturacion.toFixed(3)}`
        : ''
    partes.push(`[${iv}:v]setpts=PTS-STARTPTS,fps=${fps},${zoom}${encuadre}${lento},setsar=1${color},format=yuv420p,settb=AVTB[v${i}]`)
    if (conAudio) {
      if (f.conAudio && !t.clip.mudo) {
        // apad + atrim: cada tramo de audio dura exactamente lo que su video, o concat se desfasa.
        partes.push(`[${iv}:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${largo.toFixed(3)}[a${i}]`)
      } else {
        // Una imagen o un video mudo: silencio de su misma duración.
        entradas.push('-f', 'lavfi', '-t', largo.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo')
        partes.push(`[${n++}:a]asetpts=PTS-STARTPTS,atrim=0:${largo.toFixed(3)}[a${i}]`)
      }
    }
  })
  const conMusica = Boolean(musica)
  // El «bus» de voz sale con este nombre: va a la mezcla con la música o directo a la salida.
  const bus = conMusica ? '[vozcat]' : '[aout]'
  // La imagen: los clips uno tras otro. Un clip con fundido entra encima del anterior, que se
  // queda congelado en su último cuadro esos segundos (tpad): la duración total no cambia.
  if (lista.some((t, i) => i > 0 && t.clip.fundido)) {
    let previo = '[v0]'
    let acumulado = lista[0].fin - lista[0].inicio
    lista.forEach((t, i) => {
      if (i === 0) return
      const salida = i === lista.length - 1 ? '[vcat]' : `[vx${i}]`
      const d = t.clip.fundido
      if (d) {
        partes.push(`${previo}tpad=stop_mode=clone:stop_duration=${d.toFixed(3)}[vp${i}]`)
        partes.push(`[vp${i}][v${i}]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${acumulado.toFixed(3)}${salida}`)
      } else {
        partes.push(`${previo}[v${i}]concat=n=2:v=1:a=0${salida}`)
      }
      previo = salida
      acumulado += t.fin - t.inicio
    })
  } else {
    partes.push(`${lista.map((_, i) => `[v${i}]`).join('')}concat=n=${lista.length}:v=1:a=0[vcat]`)
  }
  const sueltos = frases.length + efectos.length
  if (conAudio) partes.push(`${lista.map((_, i) => `[a${i}]`).join('')}concat=n=${lista.length}:v=0:a=1${sueltos ? '[clipsa]' : bus}`)
  if (sueltos) {
    const etiquetas: string[] = conAudio ? ['[clipsa]'] : []
    frases.forEach((v, i) => {
      entradas.push('-i', join(carpeta, v.archivo))
      partes.push(
        `[${n++}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${(v.volumen ?? 1).toFixed(3)},adelay=${Math.round(v.inicio * 1000)}:all=1[fr${i}]`
      )
      etiquetas.push(`[fr${i}]`)
    })
    efectos.forEach((s, i) => {
      entradas.push('-i', join(carpeta, s.archivo))
      partes.push(
        `[${n++}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${(s.volumen ?? VOLUMEN_SONIDO).toFixed(3)},adelay=${Math.round(s.inicio * 1000)}:all=1[ef${i}]`
      )
      etiquetas.push(`[ef${i}]`)
    })
    partes.push(`${etiquetas.join('')}amix=inputs=${etiquetas.length}:duration=longest:normalize=0,apad,atrim=0:${duracion.toFixed(3)}${bus}`)
  }
  // Lo que va encima (imágenes, logos, íconos, tomas de apoyo): cada capa en su sitio, su tamaño y
  // su entrada, igual que en el monitor. Va debajo de los rótulos.
  let capaBase = '[vcat]'
  const capas = (timeline.capas ?? []).filter((c) => fuenteDe(c.fuente))
  capas.forEach((c, i) => {
    const f = fuenteDe(c.fuente)!
    if (f.tipo === 'imagen') entradas.push('-loop', '1', '-framerate', String(fps), '-t', c.duracion.toFixed(3), '-i', f.ruta)
    else entradas.push('-ss', (c.desde ?? 0).toFixed(3), '-t', c.duracion.toFixed(3), '-i', f.ruta)
    const k = n++
    const w = (ancho * c.ancho).toFixed(1)
    // El rebote del «pop»: entra al 45 %, se pasa al 117 % y se asienta en 0,24 s (animacionCapa).
    const escala = c.entrada === 'pop' ? `if(lt(t,0.13),0.45+t/0.13*0.72,if(lt(t,0.24),1.17-(t-0.13)/0.11*0.17,1))` : '1'
    const fundido = c.entrada === 'fundido' ? ',fade=t=in:st=0:d=0.35:alpha=1' : c.entrada === 'pop' ? ',fade=t=in:st=0:d=0.08:alpha=1' : ''
    partes.push(
      `[${k}:v]setpts=PTS-STARTPTS,fps=${fps},format=rgba,scale=w='trunc(${w}*${escala}/2)*2':h=-2:eval=frame${fundido},setpts=PTS+${c.inicio.toFixed(3)}/TB[capa${i}]`
    )
    const salida = `[conCapa${i}]`
    partes.push(
      `${capaBase}[capa${i}]overlay=x='${(ancho * c.x).toFixed(1)}-w/2':y='${(alto * c.y).toFixed(1)}-h/2':eval=frame:eof_action=pass:enable='between(t,${c.inicio.toFixed(3)},${(c.inicio + c.duracion).toFixed(3)})'${salida}`
    )
    capaBase = salida
  })
  partes.push(ass ? `${capaBase}subtitles=${ass}[vout]` : `${capaBase}null[vout]`)

  if (musica) {
    // La música se repite (-stream_loop) y se corta a la duración, con fundido de salida.
    const m = n++
    entradas.push('-stream_loop', '-1', '-i', musica.ruta)
    const formato = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    partes.push(
      `[${m}:a]${formato},atrim=0:${duracion.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musica.volumen.toFixed(3)},` +
        `afade=t=out:st=${Math.max(0, duracion - 1.5).toFixed(3)}:d=1.5[mus]`
    )
    const envolvente = musica.ducking ? envolventeDucking(timeline, proyecto) : null
    if (!hayBus) partes.push('[mus]anull[aout]')
    else if (envolvente) {
      // Ducking exacto: baja en los tramos con voz de la transcripción, como en el monitor.
      partes.push(`[mus]volume=volume='${envolvente}':eval=frame[musbaja]`)
      partes.push(`[vozcat]${formato}[voz]`)
      partes.push('[voz][musbaja]amix=inputs=2:duration=first:normalize=0[aout]')
    } else if (musica.ducking) {
      // Sin transcripción: la voz comprime a la música mientras suena.
      partes.push(`[vozcat]${formato},asplit=2[voz][llave]`)
      partes.push('[mus][llave]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=350[musbaja]')
      partes.push('[voz][musbaja]amix=inputs=2:duration=first:normalize=0[aout]')
    } else {
      partes.push(`[vozcat]${formato}[voz]`)
      partes.push('[voz][mus]amix=inputs=2:duration=first:normalize=0[aout]')
    }
  }
  const salidaAudio = hayBus || conMusica
  const archivoFiltro = 'filtro-timeline.txt'
  writeFileSync(join(carpeta, archivoFiltro), partes.join(';' + String.fromCharCode(10)), 'utf8')

  const argumentos = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...entradas,
    // El grafo va en un archivo: con muchos clips o tramos de voz no cabría en la línea de órdenes.
    '-/filter_complex',
    archivoFiltro,
    '-map',
    '[vout]',
    ...(salidaAudio ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k'] : ['-an']),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    salida
  ]

  onProgreso(0, 'Exportando la timeline')

  return new Promise((resolver) => {
    const hijo = spawn(rutaFfmpeg(), argumentos, { cwd: carpeta, windowsHide: true })
    let error = ''
    let cola = ''
    let resuelto = false
    const terminar = (r: ResultadoRender) => {
      if (resuelto) return
      resuelto = true
      resolver(r)
    }

    hijo.stdout.on('data', (buffer) => {
      cola += buffer.toString()
      const lineas = cola.split(/\r?\n/)
      cola = lineas.pop() ?? ''
      for (const linea of lineas) {
        const avance = /^out_time_us=(\d+)/.exec(linea)
        if (avance) onProgreso(Math.min(Number(avance[1]) / 1_000_000 / duracion, 0.99), 'Exportando la timeline')
      }
    })
    hijo.stderr.on('data', (buffer) => {
      error = (error + buffer.toString()).slice(-4000)
    })
    hijo.on('error', (fallo) => terminar({ ok: false, error: `No pude iniciar FFmpeg: ${fallo.message}` }))
    hijo.on('close', (codigo) => {
      if (codigo !== 0) {
        terminar({ ok: false, error: error.trim() || `FFmpeg terminó con código ${codigo}.` })
        return
      }
      void crearPortada(salida, duracion).then((portada) => {
        onProgreso(1, 'Exportación lista')
        terminar({ ok: true, output: salida, cover: portada })
      })
    })
  })
}
