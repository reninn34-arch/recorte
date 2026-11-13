import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { rutaScriptPython } from './transcribir'
import { join } from 'node:path'
import {
  ajustesDe,
  camaraEn,
  DESENFOQUE_MAX,
  desenfoqueCapa,
  desenfoqueDeCampo,
  PARALAJE,
  TEMBLOR_AMPLITUD,
  TEMBLOR_ZOOM,
  referenciaParalaje,
  type AjustesClip,
  duracionTimeline,
  ENTRADA_LADO_S,
  FUENTE_PRINCIPAL,
  FUENTES_TEXTO,
  origenLado,
  vozEnTimeline,
  tramos,
  VOLUMEN_SONIDO,
  tramosDeVoces,
  TRANSICIONES,
  APARECER_S,
  pasoAnimacion,
  type CapaTL,
  type TextoTL,
  type FiltrosTL,
  type PosicionTexto,
  type Timeline,
  timelineActiva,
  velocidadDe,
  matrizColor,
  DESENFOQUE_CLIP,
  exprClave
} from '../shared/timeline'
import type { OpcionesExport } from '../shared/api'
import type { ClipSuggestion, Project } from '../shared/types'

/** Igual que en el monitor (`DUCKING_FACTOR` de la interfaz): la música baja a un cuarto con voz. */
const DUCKING_FACTOR = 0.25
import { A_BT709, argsH264, codificadorH264, ETIQUETAS_BT709, probeVideo, rutaFfmpeg } from './ffmpeg'
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
        ...(t.fuente && FUENTES_TEXTO[t.fuente]
          ? [`\\fn${FUENTES_TEXTO[t.fuente].familia}`, FUENTES_TEXTO[t.fuente].negrita ? '\\b1' : '\\b0', FUENTES_TEXTO[t.fuente].cursiva ? '\\i1' : '\\i0']
          : [])
      ].join('')
      // Cada línea del rótulo es una línea en el video.
      const lineas = t.texto
        .split(/\r?\n/)
        .map((l) => escapar(l))
        .filter(Boolean)
        .join('\\N')
      const { inicio: entrada, cuerpo } = animarAss(t, lineas, libre ? { x: Math.round(t.x! * ancho), y: Math.round(t.y! * alto), baja: Math.round(alto * 0.03) } : null)
      return `Dialogue: 1,${tiempoAss(t.inicio)},${tiempoAss(t.inicio + t.duracion)},${nombreEstilo[t.posicion]}${t.sinCaja ? 'Libre' : ''},,0,0,0,,{${etiquetas}${entrada}}${cuerpo}`
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
  /** Alto entre ancho de un medio (para saber cuánto ocupa una capa al girar). */
  const aspectoDe = (f: string): number => {
    if (f === FUENTE_PRINCIPAL) return proyecto.source.width ? proyecto.source.height / proyecto.source.width : 1
    const m = proyecto.medios?.find((x) => x.id === f)
    return m?.ancho && m.alto ? m.alto / m.ancho : 1
  }
  // Lo que se exporta es lo que se ve y suena: sin las pistas ocultas o silenciadas.
  timeline = timelineActiva(timeline)
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
    // Cámara lenta o rápida (solo video): se lee su tramo entero de la fuente y se estira o se comprime.
    const vel = f.tipo === 'video' ? velocidadDe(t.clip) : 1
    const ritmo = Math.abs(vel - 1) > 0.005 ? `setpts=(PTS-STARTPTS)/${vel.toFixed(3)}` : 'setpts=PTS-STARTPTS'
    // atempo solo admite de 0.5 a 2 por paso: se encadenan.
    const tempos: string[] = []
    for (let r = vel; Math.abs(r - 1) > 0.005; ) {
      const paso = Math.min(2, Math.max(0.5, r))
      tempos.push(`atempo=${paso.toFixed(4)}`)
      r /= paso
    }
    const tempo = tempos.length ? `${tempos.join(',')},` : ''
    if (f.tipo === 'imagen') entradas.push('-loop', '1', '-framerate', String(fps), '-t', largo.toFixed(3), '-i', f.ruta)
    else entradas.push('-ss', t.clip.entrada.toFixed(3), '-t', (largo * vel).toFixed(3), '-i', f.ruta)
    const iv = n++
    // Zoom: recorte hacia el punto (cx, cy) antes de encuadrar. Color: eq. Lo mismo que el monitor.
    const a = ajustesDe(t.clip)
    // Con paneo, todo (zoom, acercamiento y desplazamiento) va en el zoompan: el centro se mueve en cada cuadro.
    // También al alejarse y con la cámara en mano (el encuadre se mueve en cada cuadro).
    // Fotogramas clave: el zoom, el centro y el color salen como expresiones del segundo de la fuente en cada cuadro.
    const cl = t.clip.claves
    const Fz = `(${t.clip.entrada.toFixed(3)}+on/${fps}*${vel})`
    const Ft = `(${t.clip.entrada.toFixed(3)}+t*${vel})`
    const Z = cl?.zoom ? exprClave(cl.zoom, Fz) : a.zoom.toFixed(4)
    const CX = cl?.cx ? exprClave(cl.cx, Fz) : a.cx.toFixed(4)
    const CY = cl?.cy ? exprClave(cl.cy, Fz) : a.cy.toFixed(4)
    const paneo = Math.abs(a.panx) > 0.001 || Math.abs(a.pany) > 0.001 || a.acercar < -0.001 || a.temblor > 0.001 || Boolean(cl?.zoom || cl?.cx || cl?.cy)
    const zoom =
      a.zoom > 1.001 && !paneo
        ? `crop=trunc(iw/${a.zoom}/2)*2:trunc(ih/${a.zoom}/2)*2:(iw-ow)*${a.cx.toFixed(3)}:(ih-oh)*${a.cy.toFixed(3)},`
        : ''
    // Acercamiento lento: zoompan cuadro a cuadro, al doble de tamaño para que no tiemble.
    const cuadros = Math.max(1, Math.round(largo * fps))
    const E = `(3*pow(on/${cuadros},2)-2*pow(on/${cuadros},3))`
    // La cámara en mano (vaiven): las mismas ondas que el monitor, en el segundo del clip.
    const S = `(on/${fps})`
    const k = a.temblor > 0.001 ? `${(TEMBLOR_AMPLITUD * a.temblor).toFixed(5)}/max(0.001,zoom-1)` : '0'
    const vx = `(0.6*sin(2*PI*0.53*${S})+0.3*sin(2*PI*1.37*${S}+1.3)+0.1*sin(2*PI*3.1*${S}+2.1))`
    const vy = `(0.6*sin(2*PI*0.41*${S}+0.7)+0.3*sin(2*PI*1.13*${S}+2.4)+0.1*sin(2*PI*2.7*${S}+0.4))`
    const lento = paneo
      ? `,scale=${ancho * 2}:${alto * 2},zoompan=z='max(1,(${Z})*(1+(${a.acercar.toFixed(4)})*on/${cuadros}))*${(1 + TEMBLOR_ZOOM * a.temblor).toFixed(4)}'` +
        `:x='(iw-iw/zoom)*clip((${CX})+(${a.panx.toFixed(4)})*${E}+${k}*${vx},0,1)'` +
        `:y='(ih-ih/zoom)*clip((${CY})+(${a.pany.toFixed(4)})*${E}+${k}*${vy},0,1)':d=1:s=${ancho}x${alto}:fps=${fps}`
      : a.acercar > 0.001
        ? `,scale=${ancho * 2}:${alto * 2},zoompan=z='1+${a.acercar.toFixed(4)}*on/${cuadros}':x='(iw-iw/zoom)*${a.cx.toFixed(3)}':y='(ih-ih/zoom)*${a.cy.toFixed(3)}':d=1:s=${ancho}x${alto}:fps=${fps}`
        : ''
    const color =
      cl?.brillo || cl?.contraste || cl?.saturacion
        ? `,eq=brightness='${cl.brillo ? exprClave(cl.brillo, Ft) : a.brillo.toFixed(3)}':contrast='${cl.contraste ? exprClave(cl.contraste, Ft) : a.contraste.toFixed(3)}':saturation='${cl.saturacion ? exprClave(cl.saturacion, Ft) : a.saturacion.toFixed(3)}':eval=frame`
        : a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1
          ? `,eq=brightness=${a.brillo.toFixed(3)}:contrast=${a.contraste.toFixed(3)}:saturation=${a.saturacion.toFixed(3)}`
          : ''
    // Efectos del clip: sepia y tono (la misma matriz que el monitor), negativo y desenfoque.
    const M = matrizColor(a)
    const efectos =
      (M ? `,format=gbrp,colorchannelmixer=${['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb'].map((n, j) => `${n}=${M[j].toFixed(4)}`).join(':')}` : '') +
      (a.invertir >= 0.5 ? ',format=gbrp,negate' : '') +
      (a.desenfoque > 0.005 ? `,gblur=sigma=${(a.desenfoque * DESENFOQUE_CLIP * ancho).toFixed(2)}` : '')
    // Profundidad de campo: el fondo (profundidad 0) desenfocado si el foco está más cerca.
    const borroso = desenfoqueDeCampo(a, 0)
    const fondoBorroso = borroso > 0.005 ? `,gblur=sigma=${(borroso * DESENFOQUE_MAX * ancho).toFixed(2)}` : ''
    partes.push(`[${iv}:v]${ritmo},fps=${fps},${zoom}${encuadre}${lento}${fondoBorroso},setsar=1${color}${efectos},format=yuv420p,settb=AVTB[v${i}]`)
    if (conAudio) {
      if (f.conAudio && !t.clip.mudo) {
        // apad + atrim: cada tramo de audio dura exactamente lo que su video, o concat se desfasa.
        partes.push(`[${iv}:a]asetpts=PTS-STARTPTS,${tempo}aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${largo.toFixed(3)}[a${i}]`)
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
        const xf = TRANSICIONES.find((x) => x.id === (t.clip.transicion ?? 'fundido'))?.xfade ?? 'fade'
        partes.push(`[vp${i}][v${i}]xfade=transition=${xf}:duration=${d.toFixed(3)}:offset=${acumulado.toFixed(3)}${salida}`)
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
  // FFmpeg pone las capas en píxeles enteros: una que se mueve o crece despacio temblaría. Con alguna así,
  // se compone al doble de tamaño y luego se reduce (medio píxel de paso, imperceptible).
  const sup = capas.some((c) => c.fin || c.claves || c.giro || c.profundidad != null || (c.entrada && !['pop', 'fundido'].includes(c.entrada))) ? 2 : 1
  const anchoC = ancho * sup
  const altoC = alto * sup
  if (sup > 1) {
    partes.push(`[vcat]scale=${anchoC}:${altoC}:flags=bicubic[vcatSup]`)
    capaBase = '[vcatSup]'
  }
  capas.forEach((c, i) => {
    const f = fuenteDe(c.fuente)!
    if (f.tipo === 'imagen') entradas.push('-loop', '1', '-framerate', String(fps), '-t', c.duracion.toFixed(3), '-i', f.ruta)
    // Un clip encima se repite si la capa dura más que él; el de WebM, con libvpx para que conserve su transparencia.
    else entradas.push('-stream_loop', '-1', ...(/\.webm$/i.test(f.ruta) ? ['-c:v', 'libvpx-vp9'] : []), '-ss', (c.desde ?? 0).toFixed(3), '-t', c.duracion.toFixed(3), '-i', f.ruta)
    const k = n++
    // Lo mismo que estadoCapa (el monitor), en expresiones de FFmpeg: `T` es el segundo de la capa.
    const ex = expresionesCapa(c, referenciaParalaje(timeline, c))
    const en = (expr: string, T: string) => expr.replace(/T/g, T)
    const fundido = c.entrada === 'fundido' ? ',fade=t=in:st=0:d=0.35:alpha=1' : c.entrada === 'pop' ? ',fade=t=in:st=0:d=0.08:alpha=1' : ''
    // Con giro, la capa va en un lienzo cuadrado fijo (lo que ocupa en su punto más grande y girada).
    const gira = Boolean(c.giro) || Boolean(c.fin?.giro) || Boolean(c.claves?.giro)
    // Lo más grande que llega a ser (también por sus fotogramas clave).
    const anchoMax = Math.max(c.ancho, c.fin?.ancho ?? 0, ...(c.claves?.ancho ?? []).map((x) => x.v))
    const lado = Math.ceil((anchoC * anchoMax * 1.17 * Math.hypot(1, aspectoDe(c.fuente)) + 4) / 2) * 2
    const giro = gira
      ? `,pad=w=${lado}:h=${lado}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame,rotate=a='(${en(ex.giro, 't')})*PI/180':c=none:ow=${lado}:oh=${lado}`
      : ''
    partes.push(
      `[${k}:v]setpts=PTS-STARTPTS,fps=${fps},format=rgba,scale=w='max(2,trunc(${anchoC}*${en(ex.ancho, 't')}*${en(ex.escala, 't')}/2)*2)':h=-2:eval=frame:flags=bicubic${giro}${c.claves?.opacidad ? `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${exprClave(c.claves.opacidad, 'T')})'` : ''}${desenfoque(desenfoqueCapa(timeline, c), anchoC)}${fundido},setpts=PTS+${c.inicio.toFixed(3)}/TB[capa${i}]`
    )
    const salida = `[conCapa${i}]`
    const T = `(t-${c.inicio.toFixed(3)})`
    partes.push(
      `${capaBase}[capa${i}]overlay=x='${anchoC}*${en(ex.x, T)}-w/2':y='${altoC}*${en(ex.y, T)}-h/2':eval=frame:eof_action=pass:enable='between(t,${c.inicio.toFixed(3)},${(c.inicio + c.duracion).toFixed(3)})'${salida}`
    )
    capaBase = salida
  })
  if (sup > 1) {
    partes.push(`${capaBase}scale=${ancho}:${alto}:flags=area[capasJuntas]`)
    capaBase = '[capasJuntas]'
  }
  // Los filtros de todo el video (grano, polvo, trama, viñeta, parpadeo): por debajo de los rótulos,
  // para que el texto se siga leyendo nítido.
  if (timeline.filtros) {
    partes.push(...filtrosFfmpeg(timeline.filtros, capaBase, '[filtrado]', ancho, alto, fps, duracion))
    capaBase = '[filtrado]'
  }
  partes.push(ass ? `${capaBase}subtitles=${ass}${letrasEn(carpeta) ? ':fontsdir=fuentes' : ''}[vout]` : `${capaBase}null[vout]`)

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
    // Con la tarjeta gráfica si la hay (más rápido y deja el procesador para los filtros).
    ...argsH264(await codificadorH264(), 20),
    ...ETIQUETAS_BT709,
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

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** El desenfoque de una capa: con margen transparente alrededor, para que el borde se difumine sin cortarse. */
function desenfoque(valor: number, anchoC: number): string {
  if (valor < 0.005) return ''
  const sigma = valor * DESENFOQUE_MAX * anchoC
  const m = Math.ceil(sigma * 3 / 2) * 2
  return `,pad=w=iw+${2 * m}:h=ih+${2 * m}:x=${m}:y=${m}:color=black@0:eval=frame,gblur=sigma=${sigma.toFixed(2)}`
}

/**
 * El recorrido de una capa en expresiones de FFmpeg (con `T` = segundos desde que aparece), igual
 * que `estadoCapa`: de su sitio a `fin` suavemente, la entrada desde un lado y el rebote del «pop».
 */
export function expresionesCapa(
  c: CapaTL,
  ref: { inicio: number; largo: number; ajustes: Required<AjustesClip>; tramos?: { inicio: number; largo: number; ajustes: Required<AjustesClip> }[] } | null = null
): { x: string; y: string; ancho: string; giro: string; escala: string } {
  const f = c.fin
  const E = f ? `(3*pow(clip(T/${n3(Math.max(0.1, c.duracion))},0,1),2)-2*pow(clip(T/${n3(Math.max(0.1, c.duracion))},0,1),3))` : '0'
  const lerp = (a: number, b: number) => (f && Math.abs(b - a) > 1e-4 ? `(${n3(a)}+(${n3(b - a)})*${E})` : `(${n3(a)})`)
  // Con fotogramas clave, cada ajuste sigue su curva (la misma de estadoCapa).
  const k = c.claves
  let x = k?.x ? `(${exprClave(k.x, 'T')})` : lerp(c.x, f?.x ?? c.x)
  let y = k?.y ? `(${exprClave(k.y, 'T')})` : lerp(c.y, f?.y ?? c.y)
  const lado = origenLado(c)
  const K = `(1-pow(1-clip(T/${ENTRADA_LADO_S},0,1),3))`
  if (lado.x !== undefined) x = `(${n3(lado.x)}+(${x}-(${n3(lado.x)}))*${K})`
  if (lado.y !== undefined) y = `(${n3(lado.y)}+(${y}-(${n3(lado.y)}))*${K})`
  let ancho = k?.ancho ? `(${exprClave(k.ancho, 'T')})` : lerp(c.ancho, f?.ancho ?? c.ancho)
  if (ref) {
    // Escena 2.5D (aplicarParalaje): la cámara del clip de debajo, de cuando aparece la capa a ahora.
    const n6 = (v: number) => (Math.round(v * 1e6) / 1e6).toString()
    const r = camaraEn(ref.ajustes, (c.inicio - ref.inicio) / ref.largo, c.inicio - ref.inicio)
    // La cámara de cada tramo de la escena (la misma imagen con otro encuadre), en el segundo de ese tramo.
    const camara = (tr: { inicio: number; largo: number; ajustes: Required<AjustesClip> }) => {
      const a = tr.ajustes
      const q = `clip((${n6(c.inicio - tr.inicio)}+T)/${n6(tr.largo)},0,1)`
      const e = `(3*pow(${q},2)-2*pow(${q},3))`
      const z = `(max(1,${n6(a.zoom)}*(1+(${n6(a.acercar)})*${q}))*${n6(1 + TEMBLOR_ZOOM * a.temblor)})`
      // La cámara en mano (vaiven), en el segundo del tramo: igual que camaraEn.
      let cx = `clip(${n6(a.cx)}+(${n6(a.panx)})*${e},0,1)`
      let cy = `clip(${n6(a.cy)}+(${n6(a.pany)})*${e},0,1)`
      if (a.temblor > 0.001) {
        const S = `clip(${n6(c.inicio - tr.inicio)}+T,0,${n6(tr.largo)})`
        const k = `(${n6(TEMBLOR_AMPLITUD * a.temblor)}/max(0.001,${z}-1))`
        const vx = `(0.6*sin(2*PI*0.53*${S})+0.3*sin(2*PI*1.37*${S}+1.3)+0.1*sin(2*PI*3.1*${S}+2.1))`
        const vy = `(0.6*sin(2*PI*0.41*${S}+0.7)+0.3*sin(2*PI*1.13*${S}+2.4)+0.1*sin(2*PI*2.7*${S}+0.4))`
        cx = `clip(${n6(a.cx)}+(${n6(a.panx)})*${e}+${k}*${vx},0,1)`
        cy = `clip(${n6(a.cy)}+(${n6(a.pany)})*${e}+${k}*${vy},0,1)`
      }
      return { z, cx, cy }
    }
    // Varios tramos: el que está en pantalla según el segundo (como tramoEscena).
    const lista = ref.tramos?.length ? [...ref.tramos].sort((p, q) => p.inicio - q.inicio) : [ref]
    const m = 1 + PARALAJE * Math.min(1, Math.max(0, c.profundidad ?? 0))
    // Cada toma: la capa calzada con el fondo al empezar la toma (sin paralaje en el salto del corte) y luego con
    // paralaje (aplicarParalaje). Lo de la primera parte son números; lo de la segunda, expresiones.
    const enToma = (tr: { inicio: number; largo: number; ajustes: Required<AjustesClip> }) => {
      const desde = Math.max(c.inicio, tr.inicio)
      const s = desde <= c.inicio + 1e-6 ? r : camaraEn(tr.ajustes, (desde - tr.inicio) / tr.largo, desde - tr.inicio)
      let px = x
      let py = y
      let pa = ancho
      if (s !== r) {
        const A1 = s.z / r.z
        const bx1 = A1 * (r.z - 1) * r.cx - (s.z - 1) * s.cx
        const by1 = A1 * (r.z - 1) * r.cy - (s.z - 1) * s.cy
        px = `(${n6(A1)}*${x}+${n6(bx1)})`
        py = `(${n6(A1)}*${y}+${n6(by1)})`
        pa = `(${ancho}*${n6(A1)})`
      }
      const k = camara(tr)
      const A = `(${k.z}/${n6(s.z)})`
      const bx = `(${A}*${n6((s.z - 1) * s.cx)}-(${k.z}-1)*${k.cx})`
      const by = `(${A}*${n6((s.z - 1) * s.cy)}-(${k.z}-1)*${k.cy})`
      return {
        x: `(${px}+${n6(m)}*(${A}*${px}+${bx}-${px}))`,
        y: `(${py}+${n6(m)}*(${A}*${py}+${by}-${py}))`,
        ancho: `(${pa}*pow(${A},${n6(m)}))`
      }
    }
    const tomas = lista.map(enToma)
    const elegirToma = (campo: 'x' | 'y' | 'ancho') => {
      let expr = tomas[tomas.length - 1][campo]
      for (let i = tomas.length - 2; i >= 0; i--) expr = `if(lt(${n6(c.inicio)}+T,${n6(lista[i + 1].inicio)}),${tomas[i][campo]},${expr})`
      return expr
    }
    ;[x, y, ancho] = [elegirToma('x'), elegirToma('y'), elegirToma('ancho')]
  }
  return {
    x,
    y,
    ancho,
    giro: k?.giro ? `(${exprClave(k.giro, 'T')})` : lerp(c.giro ?? 0, f?.giro ?? c.giro ?? 0),
    // El rebote del «pop»: entra al 45 %, se pasa al 117 % y se asienta en 0,24 s (animacionCapa).
    escala: c.entrada === 'pop' ? 'if(lt(T,0.13),0.45+T/0.13*0.72,if(lt(T,0.24),1.17-(T-0.13)/0.11*0.17,1))' : '1'
  }
}

/**
 * Los filtros del video como una cadena de FFmpeg de `entrada` a `salida`. La trama y el polvo son
 * texturas generadas (sin archivos): la trama, una rejilla de puntos fija; el polvo, motas y rayas que
 * cambian en cada cuadro. Lo mismo que dibuja el monitor.
 */
export function filtrosFfmpeg(f: FiltrosTL, entrada: string, salida: string, ancho: number, alto: number, fps: number, duracion: number): string[] {
  const partes: string[] = []
  let base = entrada
  const paso = (cadena: string, nombre: string) => {
    partes.push(`${base}${cadena}${nombre}`)
    base = nombre
  }
  const d = duracion.toFixed(3)
  if (f.trama) {
    // Puntos cada ~1/180 del ancho (6 px en 1080), mezclados en «overlay»: se ven en los medios tonos.
    const k = ((2 * Math.PI) / Math.max(3, ancho / 180)).toFixed(4)
    partes.push(`nullsrc=s=${ancho}x${alto}:r=${fps}:d=0.1,format=gray,geq=lum='128+127*sin(X*${k})*sin(Y*${k})',loop=loop=-1:size=1,trim=duration=${d},setpts=N/(${fps}*TB),format=gbrp[trama]`)
    paso(`format=gbrp[conTrama0];[conTrama0][trama]blend=all_mode=overlay:all_opacity=${(0.45 * f.trama).toFixed(3)}`, '[conTrama]')
  }
  if (f.polvo) {
    // Motas (algunos puntos al azar en cada cuadro) y una raya vertical que salta de sitio.
    const motas = (1 - 0.0016 * f.polvo).toFixed(5)
    const w3 = Math.max(16, Math.round(ancho / 3))
    const h3 = Math.max(16, Math.round(alto / 3))
    partes.push(
      `nullsrc=s=${w3}x${h3}:r=${fps}:d=${d},format=gray,geq=lum='if(gt(random(1),${motas}),255,if(lt(abs(X-mod(N*97\,W)),0.6)*gt(mod(N\,7),4),170,0))',scale=${ancho}:${alto}:flags=bilinear,format=gbrp[polvo]`
    )
    paso(`format=gbrp[conPolvo0];[conPolvo0][polvo]blend=all_mode=screen:all_opacity=${(0.7 * f.polvo).toFixed(3)}`, '[conPolvo]')
  }
  const cola: string[] = []
  if (f.grano) cola.push(`noise=alls=${Math.max(1, Math.round(30 * f.grano))}:allf=t`)
  if (f.vineta) cola.push(`vignette=angle=${(0.2 + 0.6 * f.vineta).toFixed(3)}`)
  if (f.parpadeo) cola.push(`eq=brightness='${(0.045 * f.parpadeo).toFixed(4)}*sin(t*31)*sin(t*7.3)':eval=frame`)
  // El color sale en BT.709 y así se etiqueta: el codificador de la tarjeta AMD siempre lo marca como 709, y sin
  // convertirlo los colores vivos salían cambiados (un rojo 200 pasaba a 213).
  partes.push(`${base}${cola.length ? cola.join(',') + ',' : ''}${A_BT709},format=yuv420p${salida}`)
  return partes
}

/**
 * La animación de entrada de un rótulo en ASS (igual que el monitor): palabra a palabra o letra a letra
 * (cada una pasa de transparente a visible a su tiempo), con rebote (escala) o subiendo (\move con
 * posición libre; si no, un fundido). Devuelve etiquetas para el inicio y el texto ya etiquetado.
 */
export function animarAss(t: TextoTL, lineas: string, libre: { x: number; y: number; baja: number } | null): { inicio: string; cuerpo: string } {
  const ms = (s: number) => Math.round(s * 1000)
  if (t.animacion === 'pop') {
    return { inicio: '\\fscx45\\fscy45\\fad(80,0)\\t(0,130,\\fscx117\\fscy117)\\t(130,240,\\fscx100\\fscy100)', cuerpo: lineas }
  }
  if (t.animacion === 'subir') {
    return { inicio: libre ? `\\move(${libre.x},${libre.y + libre.baja},${libre.x},${libre.y},0,350)\\fad(250,0)` : '\\fad(300,0)', cuerpo: lineas }
  }
  if (t.animacion !== 'palabras' && t.animacion !== 'maquina') return { inicio: '', cuerpo: lineas }
  // El borde y la caja siguen a la letra: con caja, su transparencia es la del estilo (o opaca si es de color).
  const borde = t.sinCaja ? '00' : t.caja ? '00' : '4D'
  const sombra = t.sinCaja ? '80' : '4D'
  const paso = pasoAnimacion(t)
  const oculta = '\\1a&HFF&\\3a&HFF&\\4a&HFF&'
  const visible = `\\1a&H00&\\3a&H${borde}&\\4a&H${sombra}&`
  // Se trocea sin romper los saltos de línea (\N) ni los espacios.
  const piezas = t.animacion === 'palabras' ? lineas.split(/(\\N|\s+)/) : lineas.split(/(\\N)|/)
  let n = 0
  const cuerpo = piezas
    .filter((x) => x !== undefined && x !== '')
    .map((x) => {
      if (x === '\\N' || /^\s+$/.test(x)) return x
      const a = ms(n * paso)
      n++
      return `{${oculta}\\t(${a},${a + ms(APARECER_S)},${visible})}${x}`
    })
    .join('')
  return { inicio: '', cuerpo }
}

/**
 * Copia las letras de documental (Playfair Display, Anton) a `fuentes/` del proyecto para que los
 * rótulos del MP4 las usen (libass las busca ahí). Devuelve si quedaron.
 */
function letrasEn(carpeta: string): boolean {
  try {
    const origen = rutaScriptPython('fuentes')
    if (!existsSync(origen)) return false
    const destino = join(carpeta, 'fuentes')
    mkdirSync(destino, { recursive: true })
    for (const n of readdirSync(origen)) if (n.endsWith('.ttf') && !existsSync(join(destino, n))) copyFileSync(join(origen, n), join(destino, n))
    return true
  } catch {
    return false
  }
}
