import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { escribirCube, leerCube, mezclarLut } from '../shared/lut'
import { rutaScriptPython } from './transcribir'
import { extname, isAbsolute, join } from 'node:path'
import {
  ajustesDe,
  camaraEn,
  DESENFOQUE_MAX,
  desenfoqueCapa,
  desenfoqueCapaEn,
  capasEnOrden,
  sonidoDe,
  valorClave,
  desenfoqueDeCampo,
  PARALAJE,
  TEMBLOR_AMPLITUD,
  TEMBLOR_ZOOM,
  referenciaParalaje,
  type AjustesClip,
  duracionTimeline,
  FUENTE_NEGRO,
  durEntradaCapa,
  durSalidaCapa,
  destinoLado,
  DESENFOQUE_TEXTO,
  durSalidaTexto,
  porPalabras,
  finReal,
  textoEn,
  letraDe,
  type LetraTL,
  marcoCapa,
  SOMBRA_CAPA,
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
  tiemposPalabras,
  letraOscura,
  escalaLetraAss,
  COLOR_PINTADO,
  EME_ROTULO,
  trazoTexto,
  textoVisible,
  type CapaTL,
  type TextoTL,
  type FiltrosTL,
  type PosicionTexto,
  type Timeline,
  timelineActiva,
  velocidadDe,
  tramosVelocidad,
  exprRampa,
  fuenteEnClip,
  matrizColor,
  soloTramo,
  curvasColor,
  cuboDeZona,
  filtrosSonido,
  zonaColorActiva,
  ajustesDeCapa,
  CLAVES_CURVA_COLOR,
  ajustesEn,
  cuboDeCurvas,
  hayMovimiento,
  zonaEnPixeles,
  zonaEn,
  DESENFOQUE_CLIP,
  exprClave,
  MODOS_FUSION,
  curvasDeClip,
  tramosMusica,
  type TramoMusica
} from '../shared/timeline'
import type { OpcionesExport } from '../shared/api'

/**
 * La imagen negra del negro de relleno (el que alarga el video), del tamaño del video. Se hace una vez en la carpeta
 * del proyecto.
 */
function negroDe(carpeta: string, ancho: number, alto: number): string | null {
  const w = ancho > 0 ? Math.round(ancho / 2) * 2 : 1920
  const h = alto > 0 ? Math.round(alto / 2) * 2 : 1080
  const ruta = join(carpeta, `negro-${w}x${h}.png`)
  if (existsSync(ruta)) return ruta
  const r = spawnSync(rutaFfmpeg(), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${w}x${h}`, '-frames:v', '1', ruta], { windowsHide: true })
  return r.status === 0 && existsSync(ruta) ? ruta : null
}
import type { ClipSuggestion, Project } from '../shared/types'

/** Igual que en el monitor (`DUCKING_FACTOR` de la interfaz): la música baja a un cuarto con voz. */
const DUCKING_FACTOR = 0.25
import { A_BT709, argsH264, codificadorH264, ETIQUETAS_BT709, hayTransicionXfade, probeVideo, rutaFfmpeg } from './ffmpeg'
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
function dimensiones(proyecto: Project, formato: FormatoExport, resolucion: OpcionesExport['resolucion'] = 'original'): { ancho: number; alto: number } {
  const ancho = formato === 'vertical' ? 1080 : proyecto.source.width || 1920
  const alto = formato === 'vertical' ? 1920 : proyecto.source.height || 1080
  // 1080 o 720: el lado corto a esa medida (nunca se agranda).
  const k = resolucion === 'original' ? 1 : Math.min(1, Number(resolucion) / Math.min(ancho, alto))
  return { ancho: par(Math.round(ancho * k)), alto: par(Math.round(alto * k)) }
}

/** La calidad del H.264 (CRF): alta pesa más; ligera, para mandar rápido. */
const CRF_CALIDAD = { alta: 17, normal: 20, ligera: 26 } as const

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
  alto: number,
  /**
   * Qué textos: «detras» (se pintan antes de las capas), «rotulos» (los que no son subtítulos: van debajo de los
   * filtros, que también los gastan, como en el kit), «subtitulos» (los subtítulos y la voz, encima y limpios) o
   * «todos» (los que no van detrás, y la voz).
   */
  grupo: 'detras' | 'rotulos' | 'subtitulos' | 'todos' = 'todos'
): string | null {
  const textos = timeline.textos.filter(
    (t) =>
      t.texto.trim() &&
      (grupo === 'detras' ? t.detras === true : t.detras !== true && (grupo === 'todos' || (grupo === 'subtitulos') === (t.subtitulo === true)))
  )
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

  // Las cajas de los rótulos, redondeadas y con el margen del monitor (libass solo sabe hacerlas cuadradas y por línea):
  // lo que mide cada texto, medido con el mismo libass que lo dibuja. Si no se puede medir, la caja de siempre.
  const anchosCaja = medirAnchosCaja(carpeta, textos.filter((t) => !t.sinCaja), ancho, alto, tamRotulo, timeline.letras)

  const eventos = [
    ...voz.map((b) => `Dialogue: 0,${tiempoAss(b.start)},${tiempoAss(b.end)},Voz,,0,0,0,,${escapar(b.texto)}`),
    // Un rótulo abajo empuja los subtítulos hacia arriba al compartir alineación: van en otra capa.
    ...textos.flatMap((completo) => {
      // Sin fotogramas clave: un solo evento. Con ellos: uno por cuadro en que cambia (con sus valores de ese momento),
      // y las animaciones de entrada y salida corridas para que sigan donde iban.
      if (!completo.claves) return [dialogo(completo, completo, completo.inicio, completo.inicio + completo.duracion, 0)]
      const fps = proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? Math.round(proyecto.source.fps) : 30
      const n = Math.max(1, Math.ceil(completo.duracion * fps))
      const lineas: string[] = []
      let desde = 0
      let firma = ''
      let estado = textoEn(completo, 0)
      for (let j = 0; j <= n; j++) {
        // El tramo de cada cuadro va de medio cuadro antes a medio cuadro después (así redondear a centésimas no lo mueve).
        const corte = j === n ? completo.duracion : Math.min(completo.duracion, (j + 0.5) / fps)
        const e = textoEn(completo, Math.min(completo.duracion, j / fps))
        const f = [e.x, e.y, e.tamano, e.giro, e.opacidad].map((v) => (typeof v === 'number' ? Math.round(v * 2000) : '-')).join(',')
        if (j > 0 && f !== firma) {
          lineas.push(dialogo(estado, completo, completo.inicio + desde, completo.inicio + Math.min(completo.duracion, (j - 0.5) / fps), desde))
          desde = Math.min(completo.duracion, (j - 0.5) / fps)
        }
        if (j === 0 || f !== firma) {
          estado = e
          firma = f
        }
        if (j === n) lineas.push(dialogo(estado, completo, completo.inicio + desde, completo.inicio + corte, desde))
      }
      return lineas.filter(Boolean)
    })
  ].join('\n')

  /**
   * Un evento ASS de un rótulo: con los valores de `t` (fijos) de `a` a `b` (segundos de la timeline), y sus
   * animaciones de entrada y salida, que son las de `completo`, desde `s` segundos después de que aparece.
   */
  function dialogo(t: TextoTL, completo: TextoTL, a: number, b: number, s: number): string {
      if (b - a < 0.005) return ''
      // El tamaño y el color propios del rótulo van como etiquetas sobre el estilo de su posición.
      const libre = typeof t.x === 'number' && typeof t.y === 'number'
      // La eme de la letra en píxeles del MP4 (la del monitor): con ella se miden el contorno, la sombra y el espaciado.
      const eme = tamRotulo * (t.tamano ?? 1) * EME_ROTULO
      const px = (v: number) => Math.round(v * eme * 10) / 10
      const trazo = trazoTexto(t)
      const alfas = alfasAss(t)
      // El punto de anclaje: el centro del texto o, alineado, su borde (el monitor deja 0,6 em de margen dentro de la caja).
      const ax = libre ? Math.round(t.x! * ancho) : 0
      const ay = libre ? Math.round(t.y! * alto) : 0
      const margen = Math.round(0.6 * eme)
      // Con caja: la caja es un dibujo aparte (redondeado, debajo) con las medidas del monitor, y el texto va centrado en ella.
      const anchoTexto = !t.sinCaja ? anchosCaja?.get(claveAnchoCaja(completo)) : undefined
      const caja = anchoTexto !== undefined ? cajaDeRotulo(t, anchoTexto * (t.tamano ?? 1), eme, ancho, alto) : null
      const anclaje = caja && !libre
        ? `\\an5\\pos(${Math.round(caja.cx)},${Math.round(caja.cy)})`
        : !libre
        ? `\\an${ALINEACION[t.posicion]}`
        : t.alineacion === 'izquierda'
          ? `\\an4\\pos(${ax + margen},${ay})`
          : t.alineacion === 'derecha'
            ? `\\an6\\pos(${ax - margen},${ay})`
            : `\\an5\\pos(${ax},${ay})`
      const etiquetas = [
        anclaje,
        // Gira sobre su punto de anclaje, como en el monitor (en ASS el giro positivo va contra el reloj).
        ...(libre && t.giro ? [`\\org(${ax},${ay})\\frz${Math.round(-t.giro * 10) / 10}`] : []),
        // Con la letra de cada rótulo, el mismo tamaño que en el monitor (cada letra mide su altura de línea distinto).
        ...(t.tamano || escalaLetraAss(t.fuente, timeline.letras) !== 1 ? [`\\fs${Math.round(tamRotulo * (t.tamano ?? 1) * escalaLetraAss(t.fuente, timeline.letras))}`] : []),
        ...(t.color ? [`\\1c${colorAss(t.color).replace('&H00', '&H')}&`] : []),
        // La caja de su color (con caja, el borde del estilo es la caja), opaca como en el monitor.
        ...(t.caja && !t.sinCaja && !caja ? [`\\3c${colorAss(t.caja).replace('&H00', '&H')}&`, '\\3a&H00&'] : []),
        // Con la caja dibujada aparte, el texto va limpio (sin la caja cuadrada de libass).
        ...(caja ? ['\\bord0\\shad0'] : []),
        // Letra oscura sin caja (tinta sobre papel): sin el borde ni la sombra negros, que la emborronan.
        ...(t.sinCaja && letraOscura(t) && !trazo ? ['\\bord0\\shad0'] : []),
        // El contorno y la sombra elegidos (en vez del halo de siempre): fuera de la letra, como el monitor.
        ...(trazo
          ? [`\\bord${px(trazo.contorno)}\\3c${colorAss(trazo.colorContorno).replace('&H00', '&H')}&\\shad${px(trazo.sombra)}\\4c${colorAss(trazo.colorSombra).replace('&H00', '&H')}&`]
          : []),
        ...(t.espaciado ? [`\\fsp${px(t.espaciado)}`] : []),
        // La transparencia de la letra, su borde y su sombra (o su caja), multiplicada por la opacidad del rótulo.
        ...(t.opacidad !== undefined || trazo ? [`\\1a&H${alfas.letra}&\\3a&H${alfas.borde}&\\4a&H${alfas.sombra}&`] : []),
        // La letra: una fuente de Windows, la misma que dibuja el monitor.
        ...(() => {
          // La letra: una de la lista (de Windows o de las que trae Recorte) o una propia del proyecto, por su nombre.
          const f = letraDe(t.fuente, timeline.letras)
          return f ? [`\\fn${f.familia}`, f.negrita ? '\\b1' : '\\b0', f.cursiva ? '\\i1' : '\\i0'] : []
        })()
      ].join('')
      // Cada línea del rótulo es una línea en el video.
      // Las palabras entre *asteriscos* van en su color (no en «letra a letra» ni «pintar», que trocean la letra).
      const conClave = t.animacion !== 'maquina' && t.animacion !== 'pintar'
      const base = colorAss(t.color ?? '#ffffff').replace('&H00', '&H')
      const clave = colorAss(t.colorClave ?? COLOR_PINTADO).replace('&H00', '&H')
      const lineas = textoVisible(t)
        .split(/\r?\n/)
        .map((l) => escapar(l))
        .map((l) => (conClave ? l.replace(/\*([^*]+)\*/g, (_m, x: string) => `{\\1c${clave}&}${x}{\\1c${base}&}`) : l).replace(/\*/g, ''))
        .filter(Boolean)
        .join('\\N')
      // Las animaciones son las del rótulo entero (con la opacidad de ahora); un rótulo cuyo sitio se anima no sube.
      const anima: TextoTL = completo === t ? t : { ...completo, opacidad: t.opacidad, tamano: t.tamano }
      const sitioAnimado = Boolean(completo.claves?.x || completo.claves?.y)
      const pintarCorrido = s > 0 && completo.animacion === 'pintar'
      const animado = animarAss(
        pintarCorrido ? { ...anima, duracion: completo.duracion - s, tiempos: tiemposPalabras(completo).map((w) => Math.round((w.inicio - s) * 1000) / 1000) } : anima,
        lineas,
        libre && !sitioAnimado
          ? { x: ax + (t.alineacion === 'izquierda' ? margen : t.alineacion === 'derecha' ? -margen : 0), y: ay, baja: Math.round(alto * 0.03) }
          : caja && !sitioAnimado
            ? { x: Math.round(caja.cx), y: Math.round(caja.cy), baja: Math.round(alto * 0.03) }
            : null,
        eme
      )
      // Troceado (con fotogramas clave): los tiempos de dentro son los del rótulo entero (también en el primer trozo, cuyo
      // final no es el del rótulo: su fundido de salida se mide desde el final de verdad).
      const troceado = Boolean(completo.claves)
      const cuerpo = troceado && !pintarCorrido ? correrTiemposAss(animado.cuerpo, s, completo.duracion) : animado.cuerpo
      const entrada = troceado ? correrTiemposAss(conSalidaAss(anima, animado.inicio, eme), s, completo.duracion) : conSalidaAss(anima, animado.inicio, eme)
      const texto = `Dialogue: 1,${tiempoAss(a)},${tiempoAss(b)},${nombreEstilo[t.posicion]}${t.sinCaja || caja ? 'Libre' : ''},,0,0,0,,{${entrada.includes('\\move(') ? etiquetas.replace(/\\pos\([^)]*\)/, '') : etiquetas}${entrada}}${cuerpo}`
      if (!caja) return texto
      // La caja: el mismo sitio, giro y animación de entrada y salida que el texto (no las de cada palabra), debajo.
      const an = libre && t.alineacion === 'izquierda' ? 4 : libre && t.alineacion === 'derecha' ? 6 : 5
      const bx = Math.round(an === 4 ? caja.cx - caja.w / 2 : an === 6 ? caja.cx + caja.w / 2 : caja.cx)
      const by = Math.round(caja.cy)
      const tx = an === 4 ? ax + margen : an === 6 ? ax - margen : Math.round(caja.cx)
      const color = colorAss(t.caja ?? '#000000').replace('&H00', '&H')
      const entradaCaja = entrada
        .replace(/\\[12]c&H[0-9A-Fa-f]+&/g, '')
        .replace(/\\move\(([^,()]+),([^,()]+),([^,()]+),([^,()]+)((?:,-?\d+,-?\d+)?)\)/g, (_m, x1: string, y1: string, x2: string, y2: string, resto: string) =>
          `\\move(${Number(x1) + bx - tx},${Number(y1) + by - Math.round(caja.cy)},${Number(x2) + bx - tx},${Number(y2) + by - Math.round(caja.cy)}${resto})`
        )
      const posCaja = entradaCaja.includes('\\move(') ? '' : `\\pos(${bx},${by})`
      const giro = libre && t.giro ? `\\org(${ax},${ay})\\frz${Math.round(-t.giro * 10) / 10}` : ''
      const dibujo = rectanguloRedondeado(caja.w, caja.h, caja.radio)
      return `Dialogue: 0,${tiempoAss(a)},${tiempoAss(b)},${nombreEstilo[t.posicion]}Libre,,0,0,0,,{\\an${an}${posCaja}${giro}\\bord0\\shad0\\1c${color}&\\1a&H${alfas.borde}&${entradaCaja}\\p1}${dibujo}{\\p0}\n${texto}`
  }

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
  const nombre = { detras: 'rotulos-detras.ass', rotulos: 'rotulos-bajo-filtros.ass', subtitulos: 'rotulos-timeline.ass', todos: 'rotulos-timeline.ass' }[grupo]
  writeFileSync(join(carpeta, nombre), contenido, 'utf8')
  return nombre
}

let colaExport: Promise<unknown> = Promise.resolve()

/**
 * Exporta la timeline. Los renders van de uno en uno: escriben archivos de trabajo con nombre fijo en la carpeta del
 * proyecto (rótulos, filtros, curvas), y dos a la vez (una exportación y la vista previa del monitor) se pisarían.
 */
export function exportarTimeline(...args: Parameters<typeof exportarTimelineAhora>): ReturnType<typeof exportarTimelineAhora> {
  const turno = colaExport.then(() => exportarTimelineAhora(...args))
  colaExport = turno.catch(() => {})
  return turno
}

/**
 * Windows no acepta una línea de órdenes de más de 32 767 caracteres: con cientos de capas (subtítulos hechos
 * imagen, gráficos), solo las rutas de sus archivos ya pasan de eso y FFmpeg ni arranca (ENAMETOOLONG). Pasado un
 * límite, cada archivo de entrada se enlaza dentro de la carpeta del proyecto con un nombre corto (`e/12.png`, sin
 * copiarlo: es el mismo archivo) y FFmpeg, que trabaja en esa carpeta, lo lee por ahí. El video sale igual.
 */
export const LIMITE_ORDEN = 24000
export function acortarEntradas(entradas: string[], carpeta: string, limite = LIMITE_ORDEN): string[] {
  const largo = entradas.reduce((t, x) => t + x.length + 3, 0)
  if (largo <= limite) return entradas
  const dir = join(carpeta, 'e')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const alias = new Map<string, string>()
  return entradas.map((x, i) => {
    if (entradas[i - 1] !== '-i' || !isAbsolute(x) || !existsSync(x)) return x
    const hecho = alias.get(x)
    if (hecho) return hecho
    const corto = `e/${alias.size + 1}${extname(x).toLowerCase()}`
    const ruta = join(carpeta, corto)
    try {
      linkSync(x, ruta)
    } catch {
      // En otro disco no se puede enlazar: una imagen se copia (es pequeña); un video se deja con su ruta.
      try {
        if (statSync(x).size > 40 * 1024 * 1024) return x
        copyFileSync(x, ruta)
      } catch {
        return x
      }
    }
    alias.set(x, corto)
    return corto
  })
}

async function exportarTimelineAhora(
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
    if (f === FUENTE_NEGRO) {
      const ruta = negroDe(carpeta, proyecto.source.width, proyecto.source.height)
      return ruta ? { ruta, tipo: 'imagen', conAudio: false } : null
    }
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
  // Solo entre la entrada y la salida, si se pidió.
  const conTramo = opciones.desde !== undefined && opciones.hasta !== undefined && opciones.hasta - opciones.desde >= 0.1
  if (conTramo) timeline = soloTramo(timeline, opciones.desde!, opciones.hasta!)
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
  let musica: { ruta: string; volumen: number; ducking: boolean; tramos?: TramoMusica[] } | null = null
  if (timeline.musica) {
    const ruta = join(carpeta, timeline.musica.archivo)
    if (!existsSync(ruta)) return { ok: false, error: `No encuentro la música «${timeline.musica.nombre}». Vuelve a añadirla.` }
    const trozos = timeline.musica.tramos ? tramosMusica(timeline) : undefined
    // Cortada en trozos y sin ninguno dentro de lo que se exporta: no suena.
    if (!trozos || trozos.length) musica = { ruta, volumen: timeline.musica.volumen, ducking: timeline.musica.ducking, ...(trozos ? { tramos: trozos } : {}) }
  }

  const { ancho, alto } = dimensiones(proyecto, opciones.formato, opciones.resolucion)
  const fps = proyecto.source.fps > 0 && proyecto.source.fps <= 60 ? Math.round(proyecto.source.fps) : 30
  const salidas = destino ?? join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })
  const base = `timeline-${nombreSeguro(proyecto.name)}-${opciones.formato}${conTramo ? '-tramo' : ''}`
  const salida = join(salidas, `${base}.${opciones.soloAudio ?? 'mp4'}`)

  const voz = opciones.subtitulos ? bloquesDeVoz(proyecto, timeline) : []
  let ass: string | null
  let assDetras: string | null
  let assBajoFiltros: string | null = null
  try {
    // Con filtros (grano, polvo…), los rótulos van debajo de ellos y los subtítulos encima, limpios: como el kit.
    if (timeline.filtros) {
      ass = escribirAss(carpeta, proyecto, timeline, voz, ancho, alto, 'subtitulos')
      assBajoFiltros = escribirAss(carpeta, proyecto, timeline, [], ancho, alto, 'rotulos')
    } else ass = escribirAss(carpeta, proyecto, timeline, voz, ancho, alto)
    // Los textos «detrás» van por debajo de las capas (de la persona recortada): se pintan antes que ellas.
    assDetras = escribirAss(carpeta, proyecto, timeline, [], ancho, alto, 'detras')
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
    // Rampa de velocidad: cada cuadro de la fuente va al segundo que le toca según la curva (luego fps reparte los cuadros).
    const rampa = f.tipo === 'video' && tramosVelocidad(t.clip) ? t.clip : null
    const ritmo = rampa
      ? `setpts=PTS-STARTPTS,setpts='(${exprRampa(rampa, 'T', true)})/TB'`
      : Math.abs(vel - 1) > 0.005
        ? `setpts=(PTS-STARTPTS)/${vel.toFixed(3)}`
        : 'setpts=PTS-STARTPTS'
    // atempo solo admite de 0.5 a 2 por paso: se encadenan.
    const tempos: string[] = []
    for (let r = vel; Math.abs(r - 1) > 0.005; ) {
      const paso = Math.min(2, Math.max(0.5, r))
      tempos.push(`atempo=${paso.toFixed(4)}`)
      r /= paso
    }
    const tempo = tempos.length ? `${tempos.join(',')},` : ''
    if (f.tipo === 'imagen') entradas.push('-loop', '1', '-framerate', String(fps), '-t', largo.toFixed(3), '-i', f.ruta)
    else entradas.push('-ss', t.clip.entrada.toFixed(3), '-t', (rampa ? t.clip.salida - t.clip.entrada : largo * vel).toFixed(3), '-i', f.ruta)
    const iv = n++
    // Zoom: recorte hacia el punto (cx, cy) antes de encuadrar. Color: eq. Lo mismo que el monitor.
    const a = ajustesDe(t.clip)
    // Con paneo, todo (zoom, acercamiento y desplazamiento) va en el zoompan: el centro se mueve en cada cuadro.
    // También al alejarse y con la cámara en mano (el encuadre se mueve en cada cuadro).
    // Fotogramas clave: el zoom, el centro y el color salen como expresiones del segundo de la fuente en cada cuadro.
    const cl = t.clip.claves
    const Fz = rampa ? `(${exprRampa(rampa, `(on/${fps})`)})` : `(${t.clip.entrada.toFixed(3)}+on/${fps}*${vel})`
    const Ft = rampa ? `(${exprRampa(rampa, 't')})` : `(${t.clip.entrada.toFixed(3)}+t*${vel})`
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
    const CANALES = ['rr', 'rg', 'rb', 'gr', 'gg', 'gb', 'br', 'bg', 'bb']
    // Con fotogramas clave en el desenfoque, la sepia o el tono: FFmpeg recibe sus valores en cada cuadro (sendcmd), los
    // mismos que el monitor saca de ajustesEn en el segundo de la fuente que se ve.
    const animaColor = Boolean(cl?.sepia?.length || cl?.tono?.length)
    const animaBorroso = Boolean(cl?.desenfoque?.length)
    let ordenes = ''
    const inicial = ajustesEn(t.clip, t.clip.entrada)
    let sigmaInicial = 0
    if (animaColor || animaBorroso) {
      const lineas: string[] = []
      let antes = ''
      const sigma = (aj: Required<AjustesClip>) => Math.max(0.01, aj.desenfoque * DESENFOQUE_CLIP * ancho)
      for (let j = 0; j <= cuadros; j++) {
        const aj = ajustesEn(t.clip, t.clip.entrada + (j / fps) * vel)
        const cosas: string[] = []
        if (animaColor) {
          const m = matrizColor(aj) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
          CANALES.forEach((n, q) => cosas.push(`colorchannelmixer@ef${i} ${n} ${m[q].toFixed(4)}`))
        }
        if (animaBorroso) cosas.push(`gblur@ef${i} sigma ${sigma(aj).toFixed(2)}`, `gblur@ef${i} sigmaV ${sigma(aj).toFixed(2)}`)
        const orden = cosas.join(', ')
        if (orden !== antes) lineas.push(`${(j / fps).toFixed(4)} ${orden};`)
        antes = orden
      }
      const archivo = `ordenes-clip-${i}.txt`
      writeFileSync(join(carpeta, archivo), lineas.join(String.fromCharCode(10)), 'utf8')
      ordenes = `,sendcmd=f=${archivo}`
      sigmaInicial = sigma(inicial)
    }
    const m0 = animaColor ? (matrizColor(inicial) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]) : M
    const efectos =
      ordenes +
      (m0 ? `,format=gbrp,colorchannelmixer${animaColor ? `@ef${i}` : ''}=${CANALES.map((n, j) => `${n}=${m0[j].toFixed(4)}`).join(':')}` : '') +
      (a.invertir >= 0.5 ? ',format=gbrp,negate' : '') +
      (animaBorroso
        ? `,gblur@ef${i}=sigma=${sigmaInicial.toFixed(2)}`
        : a.desenfoque > 0.005
          ? `,gblur=sigma=${(a.desenfoque * DESENFOQUE_CLIP * ancho).toFixed(2)}`
          : '')
    // Profundidad de campo: el fondo (profundidad 0) desenfocado si el foco está más cerca.
    const borroso = desenfoqueDeCampo(a, 0)
    const fondoBorroso = borroso > 0.005 ? `,gblur=sigma=${(borroso * DESENFOQUE_MAX * ancho).toFixed(2)}` : ''
    // El color tipo Lumetri (exposición, luces, sombras, blancos, negros, temperatura y tinte): la misma curva que el
    // monitor, en un archivo .cube que aplica lut1d antes del resto del color.
    // El LUT 3D del clip (con su intensidad ya mezclada en el archivo), antes del resto del color, como en el monitor.
    let lut3d = ''
    if (t.clip.lut && existsSync(join(carpeta, t.clip.lut.archivo))) {
      try {
        const base = leerCube(readFileSync(join(carpeta, t.clip.lut.archivo), 'utf8'))
        const archivo = `lut-clip-${i}.cube`
        writeFileSync(join(carpeta, archivo), escribirCube(mezclarLut(base, t.clip.lut.intensidad)), 'utf8')
        lut3d = `format=rgb24,lut3d=file=${archivo}:interp=trilinear,`
      } catch {
        // Un LUT que ya no se puede leer: el clip sale sin él (el editor ya avisó al cargarlo).
      }
    }
    const curvas = curvasDeClip(t.clip, a)
    let lut = ''
    if (CLAVES_CURVA_COLOR.some((k) => cl?.[k]?.length)) {
      // Con fotogramas clave en el color: la curva de cada tramo corto (hasta 120 por clip), cada una activa solo en su
      // tramo. Los tramos seguidos con la misma curva se juntan.
      const n = Math.min(120, Math.max(1, Math.ceil(largo * fps)))
      const tramosColor: { a: number; b: number; cubo: string | null }[] = []
      for (let k = 0; k < n; k++) {
        const t0 = (largo * k) / n
        const t1 = (largo * (k + 1)) / n
        const c = curvasDeClip(t.clip, ajustesEn(t.clip, fuenteEnClip(t.clip, (t0 + t1) / 2)))
        const cubo = c ? cuboDeCurvas(c) : null
        const previo = tramosColor[tramosColor.length - 1]
        if (previo && previo.cubo === cubo) previo.b = t1
        else tramosColor.push({ a: t0, b: t1, cubo })
      }
      const filtros = tramosColor
        .map((x, k) => {
          if (!x.cubo) return ''
          const archivo = `color-clip-${i}-${k}.cube`
          writeFileSync(join(carpeta, archivo), x.cubo, 'utf8')
          const fin = k === tramosColor.length - 1 ? '1' : `lt(t,${x.b.toFixed(4)})`
          return `,lut1d=file=${archivo}:interp=linear:enable='gte(t,${x.a.toFixed(4)})*${fin}'`
        })
        .join('')
      lut = filtros ? `,format=gbrp${filtros}` : ''
    } else if (curvas) {
      const archivo = `color-clip-${i}.cube`
      writeFileSync(join(carpeta, archivo), cuboDeCurvas(curvas), 'utf8')
      lut = `,format=gbrp,lut1d=file=${archivo}:interp=linear`
    }
    // El color por zonas (cambia solo un color): una LUT 3D, después del color del clip.
    let zona = ''
    if (zonaColorActiva(a)) {
      const archivo = `zona-color-${i}.cube`
      writeFileSync(join(carpeta, archivo), cuboDeZona(a), 'utf8')
      zona = `,format=gbrp,lut3d=file=${archivo}:interp=tetrahedral`
    }
    const crudo = `[${iv}:v]${ritmo},fps=${fps},${lut3d}${zoom}${encuadre}${lento}${fondoBorroso},setsar=1${lut}${color}${zona}${efectos}`
    // Las zonas tapadas (una cara, una placa): cada una se recorta, se difumina o se pinta de negro y se pega en su sitio.
    let base = crudo
    // Las de modo «borrar» no se tapan aquí: el clip sin el objeto va encima como otra capa.
    const zonasT = (t.clip.zonas ?? []).filter((z) => z.modo !== 'borrar' && z.modo !== 'recortar')
    if (zonasT.length) {
      partes.push(`${crudo}[zi${i}_0]`)
      zonasT.forEach((z, k) => {
        const r = zonaEnPixeles(zonaEn(z, t.clip.entrada), ancho, alto)
        const radio = Math.max(1, Math.floor((z.fuerza * Math.min(r.w, r.h)) / 5))
        const tapa = z.modo === 'negro' ? 'drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill' : `boxblur=lr=${radio}:lp=2:cr=${Math.max(1, Math.floor(radio / 2))}:cp=2`
        // Una zona que sigue algo: su recorte y su sitio cambian en cada cuadro (sendcmd, como las capas animadas).
        let ordenes = ''
        if (z.recorrido?.length) {
          const lineas: string[] = []
          let antes = ''
          for (let j = 0; j <= Math.ceil(largo * fps); j++) {
            const q = zonaEnPixeles(zonaEn(z, fuenteEnClip(t.clip, j / fps)), ancho, alto)
            const orden = `crop@zr${i}_${k} x ${q.x}, crop@zr${i}_${k} y ${q.y}, overlay@zo${i}_${k} x ${q.x}, overlay@zo${i}_${k} y ${q.y}`
            if (orden !== antes) lineas.push(`${(j / fps).toFixed(4)} ${orden};`)
            antes = orden
          }
          const archivo = `zona-${i}-${k}.txt`
          writeFileSync(join(carpeta, archivo), lineas.join(String.fromCharCode(10)), 'utf8')
          ordenes = `sendcmd=f=${archivo},`
        }
        partes.push(
          `[zi${i}_${k}]${ordenes}split[za${i}_${k}][zb${i}_${k}];[zb${i}_${k}]crop@zr${i}_${k}=${r.w}:${r.h}:${r.x}:${r.y},${tapa}[zc${i}_${k}];` +
            `[za${i}_${k}][zc${i}_${k}]overlay@zo${i}_${k}=${r.x}:${r.y}[zi${i}_${k + 1}]`
        )
      })
      base = `[zi${i}_${zonasT.length}]null`
    }
    // Con fotogramas clave en Transformar, la escala, la rotación y la posición cambian en cada cuadro.
    const movAnimado = Boolean(cl?.escala || cl?.posx || cl?.posy || cl?.giro)
    if (!hayMovimiento(a) && !movAnimado) partes.push(`${base},format=yuv420p,settb=AVTB[v${i}]`)
    else {
      // Recortar y transformar (como en Premiere): los bordes recortados quedan negros y la imagen, escalada, girada y
      // corrida, se pone sobre negro; lo que se sale del cuadro se pierde. El monitor hace lo mismo con CSS.
      const caja = (x: string, y: string, w: number, h: number) => (w > 0 && h > 0 ? `,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black:t=fill` : '')
      const px = (f: number, lado: number) => Math.round(f * lado)
      const recorte =
        caja('0', '0', px(a.recorteIzq, ancho), alto) +
        caja(String(ancho - px(a.recorteDer, ancho)), '0', px(a.recorteDer, ancho), alto) +
        caja('0', '0', ancho, px(a.recorteArr, alto)) +
        caja('0', String(alto - px(a.recorteAba, alto)), ancho, px(a.recorteAba, alto))
      const E = cl?.escala ? exprClave(cl.escala, Ft) : a.escala.toFixed(4)
      const PX = cl?.posx ? exprClave(cl.posx, Ft) : a.posx.toFixed(4)
      const PY = cl?.posy ? exprClave(cl.posy, Ft) : a.posy.toFixed(4)
      const G = cl?.giro ? exprClave(cl.giro, Ft) : a.giro.toFixed(3)
      const escala =
        cl?.escala || a.escala < 0.999
          ? `,scale=w='max(2,trunc(iw*(${E})/2)*2)':h='max(2,trunc(ih*(${E})/2)*2)'${cl?.escala ? ':eval=frame' : ''}`
          : ''
      const rad = (a.giro * Math.PI) / 180
      // Girando con claves: un lienzo fijo (la diagonal del cuadro) donde cabe a cualquier ángulo.
      const diagonal = Math.ceil(Math.hypot(ancho, alto) / 2) * 2
      const giro = cl?.giro
        ? `,pad=w=${diagonal}:h=${diagonal}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame,rotate=a='(${G})*PI/180':c=none:ow=${diagonal}:oh=${diagonal}`
        : Math.abs(a.giro) > 0.05
          ? `,rotate=${rad.toFixed(5)}:ow='rotw(${rad.toFixed(5)})':oh='roth(${rad.toFixed(5)})':c=none`
          : ''
      partes.push(`${base}${recorte},format=rgba${escala}${giro}[mv${i}]`)
      partes.push(`color=c=black:s=${ancho}x${alto}:r=${fps}:d=${largo.toFixed(3)},format=rgba[mf${i}]`)
      partes.push(
        `[mf${i}][mv${i}]overlay=x='(W-w)/2+(${PX})*W':y='(H-h)/2+(${PY})*H':eval=frame:shortest=1,format=yuv420p,settb=AVTB[v${i}]`
      )
    }
    if (conAudio) {
      // Con rampa, el sonido del clip se calla (como al reasignar el tiempo en Premiere).
      if (f.conAudio && !t.clip.mudo && !rampa) {
        // apad + atrim: cada tramo de audio dura exactamente lo que su video, o concat se desfasa.
        // El sonido del clip: sin ruido de fondo (afftdn), a su volumen y con sus fundidos de entrada y salida.
        // afftdn quita lo que queda por debajo de `nf` (dB): con más limpieza sube el umbral (−50 a −25) y la reducción (10 a 30 dB).
        // Sin «tn» (seguir el ruido): medido, con él no quitaba nada.
        const so = sonidoDe(t.clip)
        const sonido =
          (so.limpio > 0.005 ? `,afftdn=nr=${(10 + 20 * so.limpio).toFixed(1)}:nf=${(-50 + 25 * so.limpio).toFixed(1)}` : '') +
          // Mejorar la voz (graves que retumban fuera, compresión suave, presencia en 3 kHz), el ecualizador de 3 bandas
          // y el compresor: la misma cadena que oye el monitor (shared/timeline: cadenaSonido).
          filtrosSonido(so) +
          // Con fotogramas clave, el volumen sigue su curva (en el segundo de la fuente de cada muestra).
          (t.clip.clavesVolumen?.length
            ? `,volume=volume='${exprClave(t.clip.clavesVolumen, `(${t.clip.entrada.toFixed(3)}+t*${vel})`)}':eval=frame`
            : Math.abs(so.volumen - 1) > 0.005
              ? `,volume=${so.volumen.toFixed(3)}`
              : '') +
          (so.entra > 0.005 ? `,afade=t=in:st=0:d=${so.entra.toFixed(3)}` : '') +
          (so.sale > 0.005 ? `,afade=t=out:st=${Math.max(0, largo - so.sale).toFixed(3)}:d=${so.sale.toFixed(3)}` : '')
        partes.push(`[${iv}:a]asetpts=PTS-STARTPTS,${tempo}aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${largo.toFixed(3)}${sonido}[a${i}]`)
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
        const pedida = TRANSICIONES.find((x) => x.id === (t.clip.transicion ?? 'fundido'))?.xfade ?? 'fade'
        // Un FFmpeg viejo sin esa transición: tapar y destapar se hacen empujando, y las demás con un fundido.
        const xf = hayTransicionXfade(pedida) ? pedida : /^(cover|reveal)/.test(pedida) ? pedida.replace(/^(cover|reveal)/, 'slide') : 'fade'
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
        // Su tramo del archivo (si se dividió o recortó), a su volumen y en su segundo.
        `[${n++}:a]${v.desde !== undefined || v.largo !== undefined ? `atrim=start=${(v.desde ?? 0).toFixed(3)}:duration=${v.duracion.toFixed(3)},asetpts=PTS-STARTPTS,` : ''}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${(v.volumen ?? 1).toFixed(3)},adelay=${Math.round(v.inicio * 1000)}:all=1[fr${i}]`
      )
      etiquetas.push(`[fr${i}]`)
    })
    efectos.forEach((s, i) => {
      entradas.push('-i', join(carpeta, s.archivo))
      partes.push(
        // Su tramo del archivo (recortado por los bordes), a su volumen y en su segundo.
        `[${n++}:a]atrim=start=${(s.desde ?? 0).toFixed(3)}:duration=${s.duracion.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${(s.volumen ?? VOLUMEN_SONIDO).toFixed(3)},adelay=${Math.round(s.inicio * 1000)}:all=1[ef${i}]`
      )
      etiquetas.push(`[ef${i}]`)
    })
    partes.push(`${etiquetas.join('')}amix=inputs=${etiquetas.length}:duration=longest:normalize=0,asetpts=N/SR/TB,apad,atrim=0:${duracion.toFixed(3)}${bus}`)
  }
  // Lo que va encima (imágenes, logos, íconos, tomas de apoyo): cada capa en su sitio, su tamaño y
  // su entrada, igual que en el monitor. Va debajo de los rótulos.
  let capaBase = '[vcat]'
  if (assDetras) {
    partes.push(`[vcat]subtitles=${assDetras}${letrasEn(carpeta) ? ':fontsdir=fuentes' : ''}[vcatDetras]`)
    capaBase = '[vcatDetras]'
  }
  // En el orden de sus pistas: las de una pista más alta se pintan después (tapan a las de abajo).
  const capas = capasEnOrden((timeline.capas ?? []).filter((c) => fuenteDe(c.fuente)))
  // FFmpeg pone las capas en píxeles enteros: una que se mueve o crece despacio temblaría. Con alguna así,
  // se compone al doble de tamaño y luego se reduce (medio píxel de paso, imperceptible).
  const sup = capas.some((c) => c.fin || c.claves || c.giro || c.profundidad != null || (c.entrada && !['pop', 'fundido'].includes(c.entrada))) ? 2 : 1
  const anchoC = ancho * sup
  const altoC = alto * sup
  if (sup > 1) {
    partes.push(`${capaBase}scale=${anchoC}:${altoC}:flags=bicubic[vcatSup]`)
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
    // La entrada y la salida que se funden (las mismas de animacionCapa).
    const de = durEntradaCapa(c)
    const ds = durSalidaCapa(c)
    const fundido =
      (c.entrada === 'fundido' ? `,fade=t=in:st=0:d=${n3(de)}:alpha=1` : c.entrada === 'pop' ? `,fade=t=in:st=0:d=${n3((0.08 * de) / 0.24)}:alpha=1` : '') +
      (c.salida === 'fundido'
        ? `,fade=t=out:st=${n3(Math.max(0, finReal(c) - ds))}:d=${n3(ds)}:alpha=1`
        : c.salida === 'encoger'
          ? `,fade=t=out:st=${n3(Math.max(0, finReal(c) - 0.08))}:d=0.08:alpha=1`
          : '')
    // Con giro, la capa va en un lienzo cuadrado fijo (lo que ocupa en su punto más grande y girada).
    const gira = Boolean(c.giro) || Boolean(c.fin?.giro) || Boolean(c.claves?.giro)
    // Lo más grande que llega a ser (también por sus fotogramas clave).
    const anchoMax = Math.max(c.ancho, c.fin?.ancho ?? 0, ...(c.claves?.ancho ?? []).map((x) => x.v))
    // Esquinas, borde y sombra: la capa se trabaja a un tamaño fijo (el más grande que llega a tener) y luego se escala.
    const marco = c.redondeo || c.borde || c.sombraCapa ? prepararMarco(c, i, Math.max(64, Math.round(anchoC * anchoMax)), aspectoDe(c.fuente), carpeta, fps) : null
    for (const png of marco?.imagenes ?? []) entradas.push('-loop', '1', '-framerate', String(fps), '-t', c.duracion.toFixed(3), '-i', png)
    const indicesMarco = (marco?.imagenes ?? []).map(() => n++)
    const K = marco?.K ?? 1
    const lado = Math.ceil((anchoC * anchoMax * K * 1.17 * Math.hypot(1, aspectoDe(c.fuente)) + 4) / 2) * 2
    const giro = gira
      ? `,pad=w=${lado}:h=${lado}:x='(ow-iw)/2':y='(oh-ih)/2':color=black@0:eval=frame,rotate=a='(${en(ex.giro, 't')})*PI/180':c=none:ow=${lado}:oh=${lado}`
      : ''
    // La opacidad y el desenfoque animados: FFmpeg recibe su valor en cada cuadro (sendcmd), sin calcular píxel a píxel.
    const animados = ordenesCapa(carpeta, timeline, c, i, fps, anchoC)
    // Volteada (espejo) y recortada: lo recortado queda transparente, con la capa del mismo tamaño (como el monitor).
    const voltear = `${c.voltearH ? ',hflip' : ''}${c.voltearV ? ',vflip' : ''}`
    const rc = c.recorte
    const recorte = rc
      ? [
          rc.izq > 0 ? `drawbox=x=0:y=0:w='ceil(iw*${rc.izq})':h=ih:color=black@0:t=fill:replace=1` : '',
          rc.der > 0 ? `drawbox=x='iw-ceil(iw*${rc.der})':y=0:w='ceil(iw*${rc.der})':h=ih:color=black@0:t=fill:replace=1` : '',
          rc.arriba > 0 ? `drawbox=x=0:y=0:w=iw:h='ceil(ih*${rc.arriba})':color=black@0:t=fill:replace=1` : '',
          rc.abajo > 0 ? `drawbox=x=0:y='ih-ceil(ih*${rc.abajo})':w=iw:h='ceil(ih*${rc.abajo})':color=black@0:t=fill:replace=1` : ''
        ]
          .filter(Boolean)
          .map((x) => `,${x}`)
          .join('')
      : ''
    const despues = `${giro}${animados.opacidad}${animados.desenfoque ?? desenfoque(desenfoqueCapa(timeline, c), anchoC)}${fundido},setpts=PTS+${c.inicio.toFixed(3)}/TB[capa${i}]`
    if (!marco) {
      partes.push(
        `[${k}:v]setpts=PTS-STARTPTS,fps=${fps},format=rgba${animados.ordenes}${voltear},scale=w='max(2,trunc(${anchoC}*${en(ex.ancho, 't')}*${en(ex.escala, 't')}/2)*2)':h=-2:eval=frame:flags=bicubic${recorte}${despues}`
      )
    } else {
      // A su tamaño de trabajo, volteada y recortada; con sus esquinas, su borde y su sombra; y luego a su tamaño.
      partes.push(`[${k}:v]setpts=PTS-STARTPTS,fps=${fps},format=rgba${animados.ordenes}${voltear},scale=${marco.W}:${marco.H}:flags=bicubic${recorte}[mpre${i}]`)
      let etiqueta = `mpre${i}`
      let j = 0
      if (marco.mascara) {
        const km = indicesMarco[j++]
        partes.push(`[mpre${i}]split[mb1_${i}][mb2_${i}]`)
        partes.push(`[mb1_${i}]alphaextract[mal${i}]`)
        partes.push(`[${km}:v]format=gray[mmk${i}]`)
        partes.push(`[mal${i}][mmk${i}]blend=all_mode=multiply:shortest=1[mal2_${i}]`)
        partes.push(`[mb2_${i}][mal2_${i}]alphamerge[mred${i}]`)
        etiqueta = `mred${i}`
      }
      if (marco.anillo) {
        const kr = indicesMarco[j++]
        partes.push(`[${kr}:v]format=rgba[man${i}]`)
        partes.push(`[${etiqueta}][man${i}]overlay=format=auto:shortest=1,format=rgba[mbor${i}]`)
        etiqueta = `mbor${i}`
      }
      if (marco.sombra) {
        const s = marco.sombra
        partes.push(`[${etiqueta}]pad=w=iw+${2 * s.margen}:h=ih+${2 * s.margen}:x=${s.margen}:y=${s.margen}:color=black@0,split[mq1_${i}][mq2_${i}]`)
        partes.push(
          `[mq1_${i}]lutrgb=r=${s.r}:g=${s.g}:b=${s.b},gblur=sigma=${n3(s.sigma)},colorchannelmixer=aa=${SOMBRA_CAPA.opacidad},pad=w=iw+${s.corre}:h=ih+${s.corre}:x=${s.corre}:y=${s.corre}:color=black@0,crop=w=iw-${s.corre}:h=ih-${s.corre}:x=0:y=0[msh${i}]`
        )
        partes.push(`[msh${i}][mq2_${i}]overlay=format=auto,format=rgba[msom${i}]`)
        etiqueta = `msom${i}`
      }
      partes.push(`[${etiqueta}]format=rgba,scale=w='max(2,trunc(${anchoC}*${en(ex.ancho, 't')}*${en(ex.escala, 't')}*${n3(K)}/2)*2)':h=-2:eval=frame:flags=bicubic${despues}`)
    }
    const salida = `[conCapa${i}]`
    const T = `(t-${c.inicio.toFixed(3)})`
    const donde = `x='${anchoC}*${en(ex.x, T)}-w/2':y='${altoC}*${en(ex.y, T)}-h/2':eval=frame:eof_action=pass:enable='between(t,${c.inicio.toFixed(3)},${(c.inicio + c.duracion).toFixed(3)})'`
    const modo = c.fusion ? MODOS_FUSION.find((m) => m.id === c.fusion) : undefined
    if (!modo) partes.push(`${capaBase}[capa${i}]overlay=${donde}${salida}`)
    else {
      // Modo de fusión: la capa en un lienzo transparente del tamaño del cuadro, mezclada con lo de debajo (blend) y
      // puesta encima solo donde está la capa (su transparencia), como mix-blend-mode en el monitor.
      partes.push(`color=c=black@0:s=${anchoC}x${altoC}:r=${fps}:d=${duracion.toFixed(3)},format=rgba[lz${i}]`)
      partes.push(`[lz${i}][capa${i}]overlay=${donde}:format=auto,format=rgba,split[ca${i}][cb${i}]`)
      partes.push(`[cb${i}]alphaextract[cm${i}]`)
      partes.push(`${capaBase}split[ba${i}][bb${i}]`)
      partes.push(`[ba${i}]format=gbrp[bg${i}]`)
      partes.push(`[ca${i}]format=gbrp[tg${i}]`)
      partes.push(`[bg${i}][tg${i}]blend=all_mode=${modo.ffmpeg}:shortest=1,format=rgba[bl${i}]`)
      partes.push(`[bl${i}][cm${i}]alphamerge[bm${i}]`)
      partes.push(`[bb${i}][bm${i}]overlay=eof_action=pass:format=auto${salida}`)
    }
    capaBase = salida
  })
  if (sup > 1) {
    partes.push(`${capaBase}scale=${ancho}:${alto}:flags=area[capasJuntas]`)
    capaBase = '[capasJuntas]'
  }
  // Las capas de ajuste: en su tramo, el color y el desenfoque valen para el video y las capas (no para los textos).
  for (const [k, x] of (timeline.ajustesCapa ?? []).entries()) {
    const aj = ajustesDeCapa(x)
    const en = `enable='between(t,${x.inicio.toFixed(3)},${(x.inicio + x.duracion).toFixed(3)})'`
    let cadena = ''
    const curvasAj = curvasColor(aj)
    if (curvasAj) {
      const archivo = `ajuste-${k}.cube`
      writeFileSync(join(carpeta, archivo), cuboDeCurvas(curvasAj), 'utf8')
      cadena += `format=gbrp,lut1d=file=${archivo}:interp=linear:${en},`
    }
    if (aj.brillo !== 0 || aj.contraste !== 1 || aj.saturacion !== 1)
      cadena += `eq=brightness=${aj.brillo.toFixed(3)}:contrast=${aj.contraste.toFixed(3)}:saturation=${aj.saturacion.toFixed(3)}:${en},`
    if (aj.desenfoque > 0.005) cadena += `gblur=sigma=${(aj.desenfoque * DESENFOQUE_CLIP * ancho).toFixed(2)}:${en},`
    if (!cadena) continue
    partes.push(`${capaBase}${cadena}format=yuv420p[ajuste${k}]`)
    capaBase = `[ajuste${k}]`
  }
  // Los filtros de todo el video (grano, polvo, trama, viñeta, parpadeo): por encima de los rótulos (también los
  // gastan, como en el kit) y por debajo de los subtítulos, que se siguen leyendo nítidos.
  if (timeline.filtros) {
    if (assBajoFiltros) {
      partes.push(`${capaBase}subtitles=${assBajoFiltros}${letrasEn(carpeta) ? ':fontsdir=fuentes' : ''}[conRotulos]`)
      capaBase = '[conRotulos]'
    }
    partes.push(...filtrosFfmpeg(timeline.filtros, capaBase, '[filtrado]', ancho, alto, fps, duracion))
    capaBase = '[filtrado]'
  }
  // La portada también en el primer cuadro (las redes lo toman de miniatura): encima, un solo cuadro.
  const portada = portadaDe(timeline, carpeta)
  const conPortadaAlInicio = Boolean(portada && timeline.portada?.alInicio && !conTramo && !opciones.soloAudio)
  const finalVideo = conPortadaAlInicio ? '[vprePortada]' : '[vout]'
  partes.push(ass ? `${capaBase}subtitles=${ass}${letrasEn(carpeta) ? ':fontsdir=fuentes' : ''}${finalVideo}` : `${capaBase}null${finalVideo}`)
  if (conPortadaAlInicio) {
    entradas.push('-loop', '1', '-framerate', String(fps), '-t', '0.5', '-i', portada!)
    const k = n++
    partes.push(`[${k}:v]scale=${ancho}:${alto}:flags=lanczos,setsar=1,format=yuva420p[imgPortada]`)
    partes.push(`[vprePortada][imgPortada]overlay=0:0:enable='lt(t,${(0.5 / fps).toFixed(5)})':eof_action=pass:format=auto[vout]`)
  }

  if (musica) {
    // La música se repite (-stream_loop) y se corta a la duración, con fundido de salida.
    const m = n++
    entradas.push('-stream_loop', '-1', '-i', musica.ruta)
    const formato = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    const final = `volume=${musica.volumen.toFixed(3)},afade=t=out:st=${Math.max(0, duracion - 1.5).toFixed(3)}:d=1.5[mus]`
    if (musica.tramos) {
      // (Tras la mezcla, asetpts=N/SR/TB: con un solo trozo, atrim se comería el silencio que puso adelay.)
      // En trozos (como clips de audio): cada uno, su tramo de la música repetida, en su segundo, con un fundido
      // cortito en los bordes para que el corte no chasquee. Igual que en el monitor.
      const k = musica.tramos.length
      partes.push(`[${m}:a]${formato}${k > 1 ? `,asplit=${k}${musica.tramos.map((_, i) => `[mt${i}]`).join('')}` : '[mt0]'}`)
      musica.tramos.forEach((t, i) => {
        const borde = Math.min(0.03, t.duracion / 4).toFixed(3)
        partes.push(
          `[mt${i}]atrim=start=${(t.desde ?? 0).toFixed(3)}:duration=${t.duracion.toFixed(3)},asetpts=PTS-STARTPTS,` +
            `afade=t=in:d=${borde},afade=t=out:st=${Math.max(0, t.duracion - Number(borde)).toFixed(3)}:d=${borde},adelay=${Math.round(t.inicio * 1000)}:all=1[mtr${i}]`
        )
      })
      partes.push(`${musica.tramos.map((_, i) => `[mtr${i}]`).join('')}amix=inputs=${k}:duration=longest:normalize=0,asetpts=N/SR/TB,apad,atrim=0:${duracion.toFixed(3)},${final}`)
    } else partes.push(`[${m}:a]${formato},atrim=0:${duracion.toFixed(3)},asetpts=PTS-STARTPTS,${final}`)
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
  // Volumen normalizado para redes (−14 LUFS, picos por debajo de −1.5 dB), como piden YouTube, Instagram y TikTok.
  const audioFinal = salidaAudio && opciones.normalizar ? '[afin]' : '[aout]'
  if (salidaAudio && opciones.normalizar) partes.push('[aout]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[afin]')
  const archivoFiltro = 'filtro-timeline.txt'
  writeFileSync(join(carpeta, archivoFiltro), partes.join(';' + String.fromCharCode(10)), 'utf8')

  if (opciones.soloAudio && !salidaAudio) return { ok: false, error: 'Esta edición no tiene sonido que exportar.' }
  // Solo el sonido: la imagen se calcula igual (el grafo es uno) pero se descarta sin codificarla.
  const soloAudio = opciones.soloAudio
    ? [
        '-map',
        '[vout]',
        '-f',
        'null',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
        '-map',
        audioFinal,
        ...(opciones.soloAudio === 'wav' ? ['-c:a', 'pcm_s16le', '-ar', '48000'] : ['-c:a', 'libmp3lame', '-b:a', '192k']),
        '-progress',
        'pipe:1',
        '-nostats',
        salida
      ]
    : null
  const cortas = acortarEntradas(entradas, carpeta)
  const argumentos = soloAudio
    ? ['-y', '-hide_banner', '-loglevel', 'error', ...cortas, '-/filter_complex', archivoFiltro, ...soloAudio]
    : [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...cortas,
    // El grafo va en un archivo: con muchos clips o tramos de voz no cabría en la línea de órdenes.
    '-/filter_complex',
    archivoFiltro,
    '-map',
    '[vout]',
    ...(salidaAudio ? ['-map', audioFinal, '-c:a', 'aac', '-b:a', '160k'] : ['-an']),
    // Con la tarjeta gráfica si la hay (más rápido y deja el procesador para los filtros).
    ...argsH264(await codificadorH264(), CRF_CALIDAD[opciones.calidad ?? 'normal']),
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
      if (opciones.soloAudio) {
        onProgreso(1, 'Sonido listo')
        terminar({ ok: true, output: salida })
        return
      }
      // Con portada propia: va pegada al MP4 como su miniatura (y en el .jpg de al lado). Sin ella, un cuadro del video.
      const propia = !conTramo ? portadaDe(timeline, carpeta) : null
      void (propia ? pegarPortada(salida, propia) : crearPortada(salida, duracion)).then((cubierta) => {
        onProgreso(1, 'Exportación lista')
        terminar({ ok: true, output: salida, cover: cubierta })
      })
    })
  })
}

const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString()

/** La imagen de la portada del proyecto, si tiene una y está en su carpeta. */
function portadaDe(timeline: Timeline, carpeta: string): string | null {
  const archivo = timeline.portada?.archivo
  if (!archivo) return null
  const ruta = join(carpeta, archivo)
  return existsSync(ruta) ? ruta : null
}

/**
 * Pega la portada al MP4 como su miniatura (la que enseñan el Explorador de Windows, el Finder y los reproductores,
 * como la portada de CapCut) y la deja como .jpg al lado. Sin volver a codificar el video: solo se copia.
 */
function pegarPortada(salida: string, portada: string): Promise<string | undefined> {
  const jpg = salida.replace(/\.mp4$/i, '.jpg')
  const temporal = salida.replace(/\.mp4$/i, '.portada.mp4')
  const correr = (args: string[]) =>
    new Promise<boolean>((ok) => {
      const hijo = spawn(rutaFfmpeg(), ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true })
      hijo.on('error', () => ok(false))
      hijo.on('close', (codigo) => ok(codigo === 0))
    })
  return (async () => {
    await correr(['-i', portada, '-frames:v', '1', '-q:v', '2', jpg])
    const pegada = await correr([
      '-i', salida, '-i', portada,
      '-map', '0', '-map', '1', '-c', 'copy',
      '-c:v:1', 'mjpeg', '-q:v:1', '2', '-pix_fmt:v:1', 'yuvj420p', '-disposition:v:1', 'attached_pic',
      '-movflags', '+faststart', temporal
    ])
    if (pegada && existsSync(temporal)) {
      try {
        renameSync(temporal, salida)
      } catch {
        rmSync(temporal, { force: true })
      }
    } else rmSync(temporal, { force: true })
    return existsSync(jpg) ? jpg : undefined
  })()
}

/**
 * La opacidad y el desenfoque con fotogramas clave de una capa. `geq` los calculaba píxel a píxel (lentísimo) y
 * `gblur` no admite expresiones: en su lugar se escribe un archivo con el valor de cada cuadro y `sendcmd` se lo
 * manda a `colorchannelmixer` (la transparencia) y a `gblur` (el desenfoque), que aceptan órdenes en marcha.
 */
function ordenesCapa(carpeta: string, timeline: Timeline, c: CapaTL, i: number, fps: number, anchoC: number): { ordenes: string; opacidad: string; desenfoque: string | null } {
  const conOpacidad = Boolean(c.claves?.opacidad)
  const conDesenfoque = Boolean(c.claves?.desenfoque)
  if (!conOpacidad && !conDesenfoque) return { ordenes: '', opacidad: '', desenfoque: null }
  const lineas: string[] = []
  let sigmaMax = 0
  let antes = ''
  const cuadros = Math.ceil(c.duracion * fps) + 1
  for (let j = 0; j < cuadros; j++) {
    const dt = Math.min(c.duracion, j / fps)
    const cosas: string[] = []
    if (conOpacidad) cosas.push(`colorchannelmixer@op${i} aa ${valorClave(c.claves!.opacidad!, dt).toFixed(4)}`)
    if (conDesenfoque) {
      const sigma = desenfoqueCapaEn(timeline, c, dt) * DESENFOQUE_MAX * anchoC
      sigmaMax = Math.max(sigmaMax, sigma)
      cosas.push(`gblur@bl${i} sigma ${sigma.toFixed(2)}`, `gblur@bl${i} sigmaV ${sigma.toFixed(2)}`)
    }
    const orden = cosas.join(', ')
    // Solo cuando cambia: un tramo quieto no llena el archivo.
    if (orden !== antes) lineas.push(`${(j / fps).toFixed(4)} ${orden};`)
    antes = orden
  }
  const archivo = `ordenes-capa-${i}.txt`
  writeFileSync(join(carpeta, archivo), lineas.join(String.fromCharCode(10)), 'utf8')
  // El margen transparente, para el desenfoque más fuerte que llega a tener.
  const m = Math.ceil((sigmaMax * 3) / 2) * 2
  return {
    ordenes: `,sendcmd=f=${archivo}`,
    opacidad: conOpacidad ? `,colorchannelmixer@op${i}=aa=${valorClave(c.claves!.opacidad!, 0).toFixed(4)}` : '',
    desenfoque: conDesenfoque ? (m > 0 ? `,pad=w=iw+${2 * m}:h=ih+${2 * m}:x=${m}:y=${m}:color=black@0:eval=frame,premultiply=inplace=1,gblur@bl${i}=sigma=${(desenfoqueCapaEn(timeline, c, 0) * DESENFOQUE_MAX * anchoC).toFixed(2)},unpremultiply=inplace=1` : '') : null
  }
}

/** El desenfoque de una capa: con margen transparente alrededor, para que el borde se difumine sin cortarse. */
function desenfoque(valor: number, anchoC: number): string {
  if (valor < 0.005) return ''
  const sigma = valor * DESENFOQUE_MAX * anchoC
  const m = Math.ceil(sigma * 3 / 2) * 2
  return `,pad=w=iw+${2 * m}:h=ih+${2 * m}:x=${m}:y=${m}:color=black@0:eval=frame,premultiply=inplace=1,gblur=sigma=${sigma.toFixed(2)},unpremultiply=inplace=1`
}

/**
 * El recorrido de una capa en expresiones de FFmpeg (con `T` = segundos desde que aparece), igual
 * que `estadoCapa`: de su sitio a `fin` suavemente, la entrada desde un lado y el rebote del «pop».
 */
/**
 * Prepara las esquinas, el borde y la sombra de una capa para el MP4, a un tamaño de trabajo de `W` de ancho: las
 * imágenes de su máscara (las esquinas redondeadas de lo que se ve) y de su borde, y lo que se corre y difumina su
 * sombra. Los mismos números que el monitor (marcoCapa). `K` es cuánto más ancha queda con el margen de la sombra.
 */
function prepararMarco(
  c: CapaTL,
  i: number,
  W0: number,
  aspecto: number,
  carpeta: string,
  _fps: number
): { W: number; H: number; K: number; imagenes: string[]; mascara: boolean; anillo: boolean; sombra: { margen: number; corre: number; sigma: number; r: number; g: number; b: number } | null } {
  const W = par(W0)
  const H = par(Math.max(2, Math.round(W * aspecto)))
  const rc = c.recorte ?? { izq: 0, der: 0, arriba: 0, abajo: 0 }
  const x0 = rc.izq * W
  const x1 = W - rc.der * W
  const y0 = rc.arriba * H
  const y1 = H - rc.abajo * H
  const m = marcoCapa(c, x1 - x0, y1 - y0)
  const n = (v: number) => (Math.round(v * 1000) / 1000).toString()
  // Dentro de un rectángulo con esquinas redondeadas (con medio píxel de suavizado en el borde), en el centro del píxel.
  const dentro = (a: number, b: number, c2: number, d: number, r: number) => {
    const R = Math.max(0.5, r)
    const dx = `max(max(${n(a + R)}-(X+0.5),(X+0.5)-${n(c2 - R)}),0)`
    const dy = `max(max(${n(b + R)}-(Y+0.5),(Y+0.5)-${n(d - R)}),0)`
    return `clip(${n(R)}-hypot(${dx},${dy})+0.5,0,1)`
  }
  const generar = (nombre: string, formato: string, geq: string): string => {
    const ruta = join(carpeta, nombre)
    const r = spawnSync(rutaFfmpeg(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}`, '-vf', `format=${formato},geq=${geq}`, '-frames:v', '1', ruta], { windowsHide: true })
    if (r.status !== 0) throw new Error(`No pude preparar el marco de una capa: ${String(r.stderr).trim().slice(-300)}`)
    return ruta
  }
  const imagenes: string[] = []
  const mascara = m.radio > 0.5
  if (mascara) imagenes.push(generar(`marco-capa-${i}-mascara.png`, 'gray', `lum='255*${dentro(x0, y0, x1, y1, m.radio)}'`))
  const anillo = m.borde > 0.05
  if (anillo) {
    const col = parseInt((c.colorBorde ?? '#ffffff').slice(1), 16)
    const B = m.borde
    const fuera = dentro(x0, y0, x1, y1, m.radio)
    const adentro = dentro(x0 + B, y0 + B, x1 - B, y1 - B, Math.max(0, m.radio - B))
    imagenes.push(generar(`marco-capa-${i}-borde.png`, 'rgba', `r=${(col >> 16) & 255}:g=${(col >> 8) & 255}:b=${col & 255}:a='255*clip(${fuera}-${adentro},0,1)'`))
  }
  let sombra = null
  let K = 1
  if (c.sombraCapa && m.sigma > 0) {
    const col = parseInt((c.colorSombraCapa ?? '#000000').slice(1), 16)
    const corre = Math.max(0, Math.round(m.corre))
    const margen = Math.ceil((corre + 3 * m.sigma + 2) / 2) * 2
    sombra = { margen, corre, sigma: m.sigma, r: (col >> 16) & 255, g: (col >> 8) & 255, b: col & 255 }
    K = (W + 2 * margen) / W
  }
  return { W, H, K, imagenes, mascara, anillo, sombra }
}

/** El rebote del «pop» con su duración multiplicada por `s` (la escala en el segundo T de la capa). */
function escalaPop(s: number): string {
  const a = n3(0.13 * s)
  const b = n3(0.24 * s)
  return `if(lt(T,${a}),0.45+T/${a}*0.72,if(lt(T,${b}),1.17-(T-${a})/${n3(0.11 * s)}*0.17,1))`
}

export function expresionesCapa(
  c: CapaTL,
  ref: { inicio: number; largo: number; ajustes: Required<AjustesClip>; tramos?: { inicio: number; largo: number; ajustes: Required<AjustesClip> }[] } | null = null
): { x: string; y: string; ancho: string; giro: string; escala: string } {
  const f = c.fin
  const E = f ? `(3*pow(clip(T/${n3(Math.max(0.1, c.duracion))},0,1),2)-2*pow(clip(T/${n3(Math.max(0.1, c.duracion))},0,1),3))` : '0'
  const lerp = (a: number, b: number) => (f && Math.abs(b - a) > 1e-4 ? `(${n3(a)}+(${n3(b - a)})*${E})` : `(${n3(a)})`)
  // Con fotogramas clave, cada ajuste sigue su curva (la misma de estadoCapa).
  const k = c.claves
  // Si sigue algo del video: su camino, recto entre puntos (lo mismo que puntoEn), más la distancia que tenía.
  const camino = (eje: 'x' | 'y', d: number) => {
    const p = c.sigue!.puntos
    let e = n3(p[p.length - 1][eje] + d)
    for (let i = p.length - 2; i >= 0; i--) {
      const a = p[i]
      const b = p[i + 1]
      e = `if(lt(T,${n3(b.f)}),${n3(a[eje] + d)}+(${n3(b[eje] - a[eje])})*(T-${n3(a.f)})/${n3(Math.max(1e-3, b.f - a.f))},${e})`
    }
    return `(if(lt(T,${n3(p[0].f)}),${n3(p[0][eje] + d)},${e}))`
  }
  let x = c.sigue ? camino('x', c.sigue.dx) : k?.x ? `(${exprClave(k.x, 'T')})` : lerp(c.x, f?.x ?? c.x)
  let y = c.sigue ? camino('y', c.sigue.dy) : k?.y ? `(${exprClave(k.y, 'T')})` : lerp(c.y, f?.y ?? c.y)
  const lado = origenLado(c)
  const K = `(1-pow(1-clip(T/${n3(durEntradaCapa(c) || 1)},0,1),3))`
  if (lado.x !== undefined) x = `(${n3(lado.x)}+(${x}-(${n3(lado.x)}))*${K})`
  if (lado.y !== undefined) y = `(${n3(lado.y)}+(${y}-(${n3(lado.y)}))*${K})`
  // La salida por un lado: acelerando hacia fuera (estadoCapa).
  const destino = destinoLado(c)
  const P = `pow(1-clip((${n3(finReal(c))}-T)/${n3(durSalidaCapa(c) || 1)},0,1),3)`
  if (destino.x !== undefined) x = `(${x}+(${n3(destino.x)}-${x})*${P})`
  if (destino.y !== undefined) y = `(${y}+(${n3(destino.y)}-${y})*${P})`
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
    // El rebote del «pop»: entra al 45 %, se pasa al 117 % y se asienta en 0,24 s (o lo que dure su entrada); al
    // encogerse, se achica acelerando (animacionCapa).
    escala: `(${c.entrada === 'pop' ? escalaPop(durEntradaCapa(c) / 0.24) : '1'})*(${c.salida === 'encoger' ? `1-pow(1-clip((${n3(finReal(c))}-T)/${n3(durSalidaCapa(c))},0,1),3)` : '1'})`
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
/**
 * La transparencia (en hexadecimal de ASS: 00 opaca, FF invisible) de la letra, de su borde (o su caja) y de su sombra:
 * las de siempre (la caja negra al 70 %, el halo) por la opacidad del rótulo.
 */
export function alfasAss(t: TextoTL): { letra: string; borde: string; sombra: string } {
  const op = Math.min(1, Math.max(0, t.opacidad ?? 1))
  const trazo = trazoTexto(t)
  const hex = (base: number) => Math.round(255 - (255 - base) * op).toString(16).toUpperCase().padStart(2, '0')
  const borde = trazo || t.sinCaja || t.caja ? 0 : 0x4d
  const sombra = trazo ? 0 : t.sinCaja ? 0x80 : 0x4d
  return { letra: hex(0), borde: hex(borde), sombra: hex(sombra) }
}

/**
 * Corre `s` segundos los tiempos de unas etiquetas ASS (\\t, \\move y el fundido \\fad, que pasa a \\fade): para un
 * trozo de un rótulo que empieza `s` segundos después que él, y que lo de dentro siga donde iba. `duracion` es la
 * del rótulo entero (el fundido de salida se mide desde su final).
 */
export function correrTiemposAss(etiquetas: string, s: number, duracion: number): string {
  if (s < 0) return etiquetas
  const d = Math.round(s * 1000)
  const total = Math.round(duracion * 1000)
  return etiquetas
    .replace(/\\t\((-?\d+),(-?\d+)/g, (_m, a: string, b: string) => `\\t(${Number(a) - d},${Number(b) - d}`)
    .replace(/\\move\(([^,()]+),([^,()]+),([^,()]+),([^,()]+),(-?\d+),(-?\d+)\)/g, (_m, x1, y1, x2, y2, t1: string, t2: string) => `\\move(${x1},${y1},${x2},${y2},${Number(t1) - d},${Number(t2) - d})`)
    .replace(/\\fad\((\d+),(\d+)\)/g, (_m, i: string, o: string) => `\\fade(255,0,255,${-d},${Number(i) - d},${total - Number(o) - d},${total - d})`)
}

// ===== La caja de los rótulos, como en el monitor =====
// El monitor dibuja la caja de un rótulo con CSS (.monitor-rotulo): un fondo negro al 69 % (o del color de su caja),
// 0,25 em de margen arriba y abajo y 0,6 em a los lados, líneas de 1,2 em y esquinas de 0,3 em. libass solo sabe una
// caja cuadrada pegada a cada línea: en el MP4 la caja va como un dibujo aparte, con esas medidas.

/** Las líneas de un rótulo tal como las escribe libass, sin colores (para medirlas). */
const lineasPlanas = (t: TextoTL): string[] =>
  textoVisible(t)
    .split(/\r?\n/)
    .map((l) => escapar(l).replace(/\*/g, ''))
    .filter(Boolean)

/** Lo que distingue el ancho de un rótulo a tamaño 1: sus líneas, su letra y su espaciado. */
export function claveAnchoCaja(t: TextoTL): string {
  return JSON.stringify([lineasPlanas(t), t.fuente ?? 'normal', t.espaciado ?? 0])
}

/**
 * La caja de un rótulo en píxeles del MP4, como la del monitor: su centro, su ancho y alto y el radio de sus esquinas.
 * `anchoTexto` es lo que mide su línea más larga (ya con su tamaño).
 */
export function cajaDeRotulo(t: TextoTL, anchoTexto: number, eme: number, ancho: number, alto: number): { cx: number; cy: number; w: number; h: number; radio: number } {
  const lineas = Math.max(1, lineasPlanas(t).length)
  const w = anchoTexto + 1.2 * eme
  const h = lineas * 1.2 * eme + 0.5 * eme
  const libre = typeof t.x === 'number' && typeof t.y === 'number'
  let cx = ancho / 2
  let cy = t.posicion === 'arriba' ? alto * 0.07 + h / 2 : t.posicion === 'abajo' ? alto * 0.91 - h / 2 : alto / 2
  if (libre) {
    // Su punto de anclaje: el centro, o el borde izquierdo o derecho de la caja si va alineado.
    cx = t.x! * ancho + (t.alineacion === 'izquierda' ? w / 2 : t.alineacion === 'derecha' ? -w / 2 : 0)
    cy = t.y! * alto
  }
  return { cx, cy, w, h, radio: Math.min(0.3 * eme, h / 2, w / 2) }
}

/** Un rectángulo de `w` × `h` con las esquinas redondeadas (radio `r`), como dibujo de ASS (\p1). */
export function rectanguloRedondeado(w0: number, h0: number, r0: number): string {
  const w = Math.max(1, Math.round(w0))
  const h = Math.max(1, Math.round(h0))
  const r = Math.max(0, Math.min(Math.round(r0), Math.floor(Math.min(w, h) / 2)))
  if (r < 1) return `m 0 0 l ${w} 0 ${w} ${h} 0 ${h}`
  // Cada esquina, un cuarto de círculo con una curva de Bézier (k: la distancia de sus puntos de control).
  const k = Math.round(r * 0.4477)
  return [
    `m ${r} 0`,
    `l ${w - r} 0`,
    `b ${w - k} 0 ${w} ${k} ${w} ${r}`,
    `l ${w} ${h - r}`,
    `b ${w} ${h - k} ${w - k} ${h} ${w - r} ${h}`,
    `l ${r} ${h}`,
    `b ${k} ${h} 0 ${h - k} 0 ${h - r}`,
    `l 0 ${r}`,
    `b 0 ${k} ${k} 0 ${r} 0`
  ].join(' ')
}

/**
 * Lo que mide la línea más larga de cada rótulo con caja, a tamaño 1, en píxeles del MP4: se pinta cada uno con su
 * caja cuadrada de libass (que va justo de lado a lado de la línea) en un cuadro aparte y se mide. Uno por cuadro, en
 * un solo FFmpeg, a la mitad de tamaño. Si algo falla, null (y los rótulos llevan la caja de siempre).
 */
function medirAnchosCaja(carpeta: string, textos: TextoTL[], ancho: number, alto: number, tamRotulo: number, letras?: LetraTL[]): Map<string, number> | null {
  const unicos = new Map<string, TextoTL>()
  for (const t of textos) if (lineasPlanas(t).length) unicos.set(claveAnchoCaja(t), t)
  if (!unicos.size) return new Map()
  try {
    const conLetras = letrasEn(carpeta)
    const lista = [...unicos.entries()]
    const eventos = lista.map(([, t], k) => {
      const f = letraDe(t.fuente, letras)
      const etiquetas = [
        '\\an7\\pos(4,4)',
        `\\fs${Math.round(tamRotulo * escalaLetraAss(t.fuente, letras))}`,
        ...(f ? [`\\fn${f.familia}`, f.negrita ? '\\b1' : '\\b0', f.cursiva ? '\\i1' : '\\i0'] : []),
        ...(t.espaciado ? [`\\fsp${Math.round(t.espaciado * tamRotulo * EME_ROTULO * 10) / 10}`] : [])
      ].join('')
      return `Dialogue: 0,${tiempoAss(k * 0.1)},${tiempoAss(k * 0.1 + 0.1)},M,,0,0,0,,{${etiquetas}}${lineasPlanas(t).join('\\N')}`
    })
    writeFileSync(
      join(carpeta, 'medir-cajas.ass'),
      `[Script Info]\nScriptType: v4.00+\nPlayResX: ${ancho}\nPlayResY: ${alto}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: M,Arial,${tamRotulo},&HFF000000,&HFF000000,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,3,4,0,7,40,40,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${eventos.join('\n')}\n`,
      'utf8'
    )
    const cw = par(ancho / 2)
    const ch = par(alto / 2)
    const r = spawnSync(
      rutaFfmpeg(),
      ['-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${cw}x${ch}:r=10:d=${(lista.length * 0.1 + 0.05).toFixed(2)}`, '-vf', `subtitles=medir-cajas.ass${conLetras ? ':fontsdir=fuentes' : ''},format=gray`, '-frames:v', String(lista.length), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { cwd: carpeta, windowsHide: true, maxBuffer: cw * ch * lista.length + (1 << 20) }
    )
    if (r.status !== 0 || r.stdout.length < cw * ch * lista.length) return null
    const medidas = new Map<string, number>()
    lista.forEach(([clave], k) => {
      const base = k * cw * ch
      let x0 = cw
      let x1 = -1
      for (let y = 0; y < ch; y++) {
        const fila = base + y * cw
        for (let x = 0; x < cw; x++) if (r.stdout[fila + x] > 128) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
        }
      }
      // La caja cuadrada lleva 4 px de borde por cada lado (con 0, libass no la dibuja): se le quitan.
      if (x1 >= x0) medidas.set(clave, Math.max(1, ((x1 - x0 + 1) * ancho) / cw - 8))
    })
    return medidas
  } catch {
    return null
  }
}

/** Lo que tarda cada palabra en pasar de borrosa a nítida («palabra a palabra, de borrosa a nítida»). */
export const PALABRA_NITIDA_S = 0.3

/**
 * La salida de un rótulo en ASS, sobre las etiquetas de su entrada: se funde (\fad, con el fundido de entrada que ya
 * tuviera), se encoge (\fscx) o se desenfoca (\blur) en sus últimos segundos. Lo mismo que salidaTexto (el monitor).
 */
export function conSalidaAss(t: TextoTL, inicio: string, eme: number): string {
  const d = durSalidaTexto(t)
  if (!d) return inicio
  const ms = (s: number) => Math.round(s * 1000)
  // Se va al terminar de verdad (con lo que se le cortó al final, si se sacó un trozo).
  const fin = ms(finReal(t))
  const desde = fin - ms(d)
  // Sin cortar, un \\fad de salida; cortado, la opacidad baja con \\t (el \\fad se mediría desde el corte).
  const fad = /\\fad\((\d+),(\d+)\)/.exec(inicio)
  let etiquetas = !t.cola
    ? fad
      ? inicio.replace(fad[0], `\\fad(${fad[1]},${ms(d)})`)
      : `\\fad(0,${ms(d)})${inicio}`
    : `${inicio}\\t(${desde},${fin},\\alpha&HFF&)`
  if (t.salida === 'encoger') etiquetas += `\\t(${desde},${fin},\\fscx40\\fscy40)`
  if (t.salida === 'desenfoque') etiquetas += `\\t(${desde},${fin},\\blur${Math.round(DESENFOQUE_TEXTO * eme * 10) / 10})`
  return etiquetas
}

export function animarAss(t: TextoTL, lineas: string, libre: { x: number; y: number; baja: number } | null, eme = 60): { inicio: string; cuerpo: string } {
  const ms = (s: number) => Math.round(s * 1000)
  const borroso = Math.round(DESENFOQUE_TEXTO * eme * 10) / 10
  if (t.animacion === 'desenfoque') {
    // De borroso a nítido (y apareciendo), como el monitor.
    return { inicio: `\\fad(250,0)\\blur${borroso}\\t(0,350,\\blur0)`, cuerpo: lineas }
  }
  if (t.animacion === 'pop') {
    return { inicio: '\\fscx45\\fscy45\\fad(80,0)\\t(0,130,\\fscx117\\fscy117)\\t(130,240,\\fscx100\\fscy100)', cuerpo: lineas }
  }
  if (t.animacion === 'rotulo') {
    // Rótulo: aparece fundiéndose y crece un poco hasta su tamaño (como las etiquetas de un buen video explicativo).
    return { inicio: '\\fad(150,80)\\fscx86\\fscy86\\t(0,200,\\fscx100\\fscy100)', cuerpo: lineas }
  }
  if (t.animacion === 'subir') {
    return { inicio: libre ? `\\move(${libre.x},${libre.y + libre.baja},${libre.x},${libre.y},0,350)\\fad(250,0)` : '\\fad(300,0)', cuerpo: lineas }
  }
  if (t.animacion === 'pintar') {
    // Karaoke: la frase entera se ve en su color (\2c) y cada palabra se rellena del color pintado (\1c) de izquierda a
    // derecha mientras se dice (\kf, en centésimas), al ritmo de sus tiempos: lo mismo que el monitor.
    const cs = (s: number) => Math.max(1, Math.round(s * 100))
    const tiempos = tiemposPalabras(t)
    const base = colorAss(t.color ?? '#ffffff').replace('&H00', '&H')
    const pintado = colorAss(t.pintado ?? COLOR_PINTADO).replace('&H00', '&H')
    let k = 0
    let reloj = 0
    const cuerpo = lineas
      .split(/(\\N|\s+)/)
      .filter((x) => x !== undefined && x !== '')
      .map((x) => {
        if (x === '\\N' || /^\s+$/.test(x)) return x
        const w = tiempos[k++] ?? { inicio: reloj, dura: 0.3 }
        const fin = w.inicio + w.dura
        // Ya dicha antes de este trozo: pintada desde el principio. A medias: termina de pintarse en lo que le queda.
        if (fin <= 0) return `{\\k0}${x}`
        const espera = Math.max(0, w.inicio - reloj)
        reloj = fin
        return `{${espera > 0.005 ? `\\k${cs(espera)}` : ''}\\kf${cs(w.inicio < 0 ? fin : w.dura)}}${x}`
      })
      .join('')
    return { inicio: `\\2c${base}&\\1c${pintado}&`, cuerpo }
  }
  if (!porPalabras(t.animacion) && t.animacion !== 'maquina') return { inicio: '', cuerpo: lineas }
  // El borde y la caja siguen a la letra: con caja, su transparencia es la del estilo (o opaca si es de color).
  const { letra, borde, sombra } = alfasAss(t)
  const paso = pasoAnimacion(t)
  const palabras = tiemposPalabras(t)
  const oculta = '\\1a&HFF&\\3a&HFF&\\4a&HFF&'
  const visible = `\\1a&H${letra}&\\3a&H${borde}&\\4a&H${sombra}&`
  // Se trocea sin romper los saltos de línea (\N) ni los espacios.
  const nitida = t.animacion === 'palabras-desenfoque'
  const piezas = porPalabras(t.animacion) ? lineas.split(/(\\N|\s+)/) : lineas.split(/(\\N)|/)
  let n = 0
  const cuerpo = piezas
    .filter((x) => x !== undefined && x !== '')
    .map((x) => {
      if (x === '\\N' || /^\s+$/.test(x)) return x
      const a = porPalabras(t.animacion) ? ms(palabras[n]?.inicio ?? n * paso) : ms(n * paso)
      n++
      // De borrosa a nítida: la palabra aparece desenfocada y se aclara mientras se ve.
      if (nitida) return `{${oculta}\\blur${borroso}\\t(${a},${a + ms(PALABRA_NITIDA_S)},${visible}\\blur0)}${x}`
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
    const destino = join(carpeta, 'fuentes')
    // Las letras propias del proyecto (las del agente) ya están en `fuentes/`: con ellas también hay que mirar ahí.
    if (!existsSync(origen)) return existsSync(destino) && readdirSync(destino).some((n) => /\.(ttf|otf)$/i.test(n))
    mkdirSync(destino, { recursive: true })
    for (const n of readdirSync(origen)) if (n.endsWith('.ttf') && !existsSync(join(destino, n))) copyFileSync(join(origen, n), join(destino, n))
    return true
  } catch {
    return false
  }
}
