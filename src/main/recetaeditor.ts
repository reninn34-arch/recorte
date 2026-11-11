import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import {
  duracionesDeMedios,
  FUENTE_PRINCIPAL,
  normalizarTimeline,
  nuevoId,
  ENTRADAS_CAPA,
  TRANSICIONES,
  type TransicionClip,
  type CapaTL,
  type ClipTL,
  type EntradaCapa,
  type PosicionTexto,
  type SonidoTL,
  type TextoTL,
  type Timeline,
  type VozTL
} from '../shared/timeline'
import type { MedioProyecto } from '../shared/types'
import { resolverBinario } from './binarios'
import { ejecutar } from './crear'
import { duracionMedio, probeVideo } from './ffmpeg'

/**
 * De la receta del agente al editor. El agente hace el video con el kit a partir de una
 * receta (qué foto o video, cuándo, con qué rótulo, la voz frase a frase, la música). Aquí esa
 * receta se vuelve una timeline: cada recurso queda en su pista y se toca a mano, sin volver
 * a pedirle nada al agente.
 *
 * Lo que la timeline todavía no sabe hacer (un antes/después, un collage, una frase sobre
 * fondo liso, o cualquier cosa que el agente programó aparte) entra como un tramo del video
 * ya renderizado: no se pierde, solo es menos editable. Ese video es el «principal» del proyecto.
 */

const EXT_IMAGEN = ['.png', '.jpg', '.jpeg', '.webp']
/** Las piezas del kit que se dibujan encima de la escena y en el editor son rótulos sueltos. */
export const PIEZAS_ENCIMA = ['titulo', 'etiqueta', 'palabras']
/** Las letras del kit y su equivalente en el editor. */
const LETRA_EDITOR: Record<string, string> = { fina: 'fina', normal: 'normal', negrita: 'normal', gruesa: 'gruesa', serif: 'elegante', cursiva: 'cursiva', impacto: 'impacto' }
/** Dónde caen las palabras sueltas si la receta no lo dice: igual que SITIOS_PALABRAS del kit. */
const SITIOS_PALABRAS: [number, number][] = [[0.3, 0.3], [0.68, 0.24], [0.5, 0.42], [0.24, 0.55], [0.72, 0.5], [0.42, 0.66], [0.66, 0.74], [0.3, 0.8], [0.55, 0.18], [0.8, 0.62]]
const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v']
const MIN = 0.1

type Momento = Record<string, unknown> & { tipo: string; desde: number; hasta: number }

const num = (x: unknown, defecto: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : defecto)
const pinza = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

export interface ProyectoDeReceta {
  medios: MedioProyecto[]
  timeline: Timeline
  /** Cuántos tramos quedaron sueltos y cuántos como video ya hecho (para decírselo al usuario). */
  editables: number
  fijos: number
}

/** La ruta de un archivo de la receta, solo si existe y está dentro de la carpeta de trabajo. */
function dentro(trabajo: string, relativa: unknown): string | null {
  if (typeof relativa !== 'string' || !relativa.trim()) return null
  const ruta = resolve(trabajo, relativa)
  const base = resolve(trabajo)
  if (!ruta.toLowerCase().startsWith((base.endsWith(sep) ? base : base + sep).toLowerCase())) return null
  return existsSync(ruta) ? ruta : null
}

/** Lo que dice cada audio de voz, según las respuestas que Recorte dejó en `voz/`. */
function textosDeVoz(trabajo: string): Map<string, { texto: string; voz?: string }> {
  const mapa = new Map<string, { texto: string; voz?: string }>()
  const dir = join(trabajo, 'voz')
  if (!existsSync(dir)) return mapa
  for (const n of readdirSync(dir)) {
    if (!/^respuesta-[\w-]+\.json$/.test(n)) continue
    try {
      const r = JSON.parse(readFileSync(join(dir, n), 'utf8').replace(/^\uFEFF/, '')) as { voz?: string; frases?: { texto?: string; archivo?: string }[] }
      for (const f of r.frases ?? []) {
        if (typeof f.archivo === 'string' && typeof f.texto === 'string') mapa.set(f.archivo.replace(/\\/g, '/'), { texto: f.texto, ...(r.voz ? { voz: r.voz } : {}) })
      }
    } catch {
      // Una respuesta rota solo deja esa frase sin su texto.
    }
  }
  return mapa
}

/**
 * Convierte la receta en medios y timeline. `duracionFinal` es lo que dura el video que
 * entregó el agente (el principal). Devuelve null si la receta no se puede leer o no trae
 * nada que montar: entonces el video entra entero, como siempre.
 */
export async function proyectoDesdeReceta(
  rutaReceta: string,
  trabajo: string,
  carpetaProyecto: string,
  duracionFinal: number
): Promise<ProyectoDeReceta | null> {
  let receta: Record<string, unknown>
  try {
    receta = JSON.parse(readFileSync(rutaReceta, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>
  } catch {
    return null
  }
  const total = Math.min(num(receta.duracion, duracionFinal), duracionFinal)
  if (!(total > MIN)) return null
  const momentos: Momento[] = (Array.isArray(receta.momentos) ? receta.momentos : [])
    .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === 'object')
    .map((m) => ({ ...m, tipo: String(m.tipo ?? ''), desde: pinza(num(m.desde, 0), 0, total), hasta: pinza(num(m.hasta, total), 0, total) }))
    .filter((m) => m.hasta - m.desde >= MIN)
    .sort((a, b) => a.desde - b.desde)
  // Las frases que oscurecen lo de debajo, los títulos, las etiquetas y las palabras sueltas van encima
  // de otra cosa: son rótulos. Lo demás llena la pantalla.
  const encima = momentos.filter((m) => (m.tipo === 'texto' && num(m.oscurecer, 0) > 0) || PIEZAS_ENCIMA.includes(m.tipo))
  const base = momentos.filter((m) => !encima.includes(m))
  if (!base.length) return null

  const frases = (Array.isArray(receta.voz) ? receta.voz : []).filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
  const sonidosReceta = (Array.isArray(receta.sonidos) ? receta.sonidos : []).filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
  const hayPistasDeAudio = frases.length > 0 || Boolean(receta.musica) || sonidosReceta.length > 0
  const medios: MedioProyecto[] = []
  const porRuta = new Map<string, MedioProyecto>()
  const medioDe = async (ruta: string): Promise<MedioProyecto | null> => {
    const ya = porRuta.get(ruta)
    if (ya) return ya
    const ext = extname(ruta).toLowerCase()
    const tipo = EXT_IMAGEN.includes(ext) ? 'imagen' : EXT_VIDEO.includes(ext) ? 'video' : null
    if (!tipo) return null
    try {
      const info = await probeVideo(ruta)
      const m: MedioProyecto = {
        id: `m-${randomUUID().slice(0, 8)}`,
        ruta,
        nombre: basename(ruta),
        tipo,
        duracion: tipo === 'imagen' ? 0 : info.duration,
        ancho: info.width,
        alto: info.height,
        conAudio: tipo === 'video' && info.hasAudio
      }
      porRuta.set(ruta, m)
      medios.push(m)
      return m
    } catch {
      return null
    }
  }

  const clips: ClipTL[] = []
  const textos: TextoTL[] = []
  // Cómo se ve el kit: cada momento entra fundiéndose sobre el anterior (`transicion`), las fotos
  // crecen despacio (un 6 %) y los rótulos van sin caja, con su letra y su color.
  const transicion = pinza(num(receta.transicion, 0.22), 0, 1.5)
  const colorTexto = typeof receta.color_texto === 'string' && /^#[0-9a-f]{6}$/i.test(receta.color_texto) ? receta.color_texto.toLowerCase() : undefined
  const fuenteTexto = ({ fina: 'fina', normal: 'normal', negrita: 'normal', gruesa: 'gruesa' } as Record<string, string>)[String(receta.fuente ?? 'fina')] ?? 'fina'
  const estiloRotulo = { sinCaja: true, ...(colorTexto ? { color: colorTexto } : {}), ...(fuenteTexto !== 'normal' ? { fuente: fuenteTexto } : {}) }
  let editables = 0
  let fijos = 0
  /** Un tramo del video ya hecho (lo que no se puede dejar suelto). */
  const fijo = (a: number, b: number) => {
    if (b - a < MIN) return
    // Un tramo del video ya hecho trae su transición dibujada por el kit: el editor no le pone otra encima.
    clips.push({ id: nuevoId('clip'), fuente: FUENTE_PRINCIPAL, entrada: a, salida: b, ...(hayPistasDeAudio ? { mudo: true } : {}) })
    fijos += 1
  }

  // Cada momento dura hasta que entra el siguiente (en el kit se funden; aquí van uno tras otro).
  if (base[0].desde > MIN) fijo(0, base[0].desde)
  for (const [i, m] of base.entries()) {
    const a = m.desde
    const b = i + 1 < base.length ? Math.max(a, base[i + 1].desde) : total
    const largo = b - a
    if (largo < MIN) continue
    const ruta = m.tipo === 'foto' || m.tipo === 'video' ? dentro(trabajo, m.archivo) : null
    const medio = ruta ? await medioDe(ruta) : null
    const e = (m.encuadre ?? {}) as { zoom?: unknown; cx?: unknown; cy?: unknown }
    const encuadre = {
      zoom: pinza(num(e.zoom, 1), 1, 2),
      cx: pinza(num(e.cx, 0.5), 0, 1),
      cy: pinza(num(e.cy, 0.5), 0, 1)
    }
    // La transición del momento (barrido, zoom…) es la del clip; su duración, la de `entra`.
    const tipoTr = typeof m.transicion === 'string' && TRANSICIONES.some((x) => x.id === m.transicion) ? (m.transicion as TransicionClip) : undefined
    const durTr = num(m.entra, tipoTr && tipoTr !== 'fundido' ? 0.45 : transicion)
    const fundido = clips.length > 0 && durTr >= 0.1 ? { fundido: durTr, ...(tipoTr && tipoTr !== 'fundido' ? { transicion: tipoTr } : {}) } : {}
    if (medio && m.tipo === 'foto' && medio.tipo === 'imagen') {
      clips.push({
        id: nuevoId('clip'),
        fuente: medio.id,
        entrada: 0,
        salida: largo,
        ajustes: { ...encuadre, ...(m.acercar === false ? {} : { acercar: 0.06 }) },
        ...fundido
      })
      editables += 1
    } else if (medio && m.tipo === 'video' && medio.tipo === 'video' && num(m.inicio, 0) + largo <= medio.duracion + 0.05) {
      const inicio = Math.max(0, num(m.inicio, 0))
      // En el kit los clips van sin su sonido; si el usuario lo quiere, lo activa en el editor.
      clips.push({ id: nuevoId('clip'), fuente: medio.id, entrada: inicio, salida: Math.min(medio.duracion, inicio + largo), mudo: true, ajustes: encuadre, ...fundido })
      editables += 1
    } else {
      fijo(a, b)
      continue
    }
    if (typeof m.rotulo === 'string' && m.rotulo.trim()) {
      textos.push({ id: nuevoId('texto'), inicio: a, duracion: largo, texto: m.rotulo.trim(), posicion: m.rotulo_pos === 'abajo' ? 'abajo' : 'arriba', ...estiloRotulo })
    }
  }
  // El tamaño del kit es una fracción del ancho; el del editor, relativo a su rótulo (6 % del lado corto).
  const anchoK = num(receta.ancho, 1080)
  const altoK = num(receta.alto, 1920)
  const tamEditor = (fraccion: number) => Math.round(pinza((fraccion * anchoK) / (Math.min(anchoK, altoK) * 0.06), 0.5, 6) * 100) / 100
  const hexDe = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined)
  const letra = (v: unknown, defecto: string) => LETRA_EDITOR[String(v ?? defecto)] ?? LETRA_EDITOR[defecto] ?? 'normal'
  for (const m of encima) {
    const visible = { inicio: m.desde, duracion: m.hasta - m.desde }
    if (m.tipo === 'titulo') {
      // Cada línea, su rótulo (cada una con su letra, tamaño y color), apiladas como en el kit.
      const lineas = (Array.isArray(m.lineas) ? m.lineas : [])
        .map((l) => (typeof l === 'string' ? { texto: l } : l && typeof l === 'object' ? (l as Record<string, unknown>) : null))
        .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l!.texto === 'string' && Boolean(String(l!.texto).trim()))
      const altos = lineas.map((l) => num(l.tam, 0.06) * anchoK * 1.25)
      let y = num(m.y, 0.5) * altoK - altos.reduce((a, b) => a + b, 0) / 2
      for (const [i, l] of lineas.entries()) {
        const color = hexDe(l.color)
        textos.push({
          id: nuevoId('texto'),
          ...visible,
          texto: String(l.texto).trim(),
          posicion: 'centro',
          x: pinza(num(m.x, 0.5), 0, 1),
          y: pinza((y + altos[i] / 2) / altoK, 0, 1),
          sinCaja: true,
          tamano: tamEditor(num(l.tam, 0.06)),
          ...(color && color !== '#ffffff' ? { color } : !color && colorTexto ? { color: colorTexto } : {}),
          fuente: letra(l.fuente ?? m.fuente, String(receta.fuente ?? 'fina')),
          ...(m.entrada === 'palabras' || m.entrada === 'maquina' || m.entrada === 'pop' ? { animacion: m.entrada } : { animacion: 'subir' as const })
        })
        y += altos[i]
      }
      continue
    }
    if (m.tipo === 'etiqueta') {
      if (typeof m.texto !== 'string' || !m.texto.trim()) continue
      textos.push({
        id: nuevoId('texto'),
        ...visible,
        texto: m.texto.trim(),
        posicion: 'centro',
        x: pinza(num(m.x, 0.5), 0, 1),
        y: pinza(num(m.y, 0.5), 0, 1),
        tamano: tamEditor(num(m.tam, 0.05)),
        color: hexDe(m.color) ?? '#111111',
        caja: hexDe(m.fondo) ?? '#ffd60a',
        fuente: letra(m.fuente, 'gruesa'),
        animacion: 'pop'
      })
      continue
    }
    if (m.tipo === 'palabras') {
      const palabras = (Array.isArray(m.palabras) ? m.palabras : []).map((p) => String(p)).filter((p) => p.trim())
      const dados = Array.isArray(m.posiciones) ? m.posiciones : []
      const paso = num(m.paso, Math.min(0.4, Math.max(0.12, (m.hasta - m.desde - 0.6) / Math.max(1, palabras.length))))
      const destacar = new Set(Array.isArray(m.destacar) ? m.destacar : [])
      for (const [i, p] of palabras.entries()) {
        const sitio = Array.isArray(dados[i]) ? (dados[i] as unknown[]) : SITIOS_PALABRAS[i % SITIOS_PALABRAS.length]
        const inicio = m.desde + i * paso
        if (m.hasta - inicio < MIN) continue
        const color = destacar.has(i) ? (hexDe(receta.color_acento) ?? '#d4af5a') : (hexDe(m.color) ?? colorTexto)
        textos.push({
          id: nuevoId('texto'),
          inicio,
          duracion: m.hasta - inicio,
          texto: p.trim(),
          posicion: 'centro',
          x: pinza(num(sitio[0], 0.5), 0, 1),
          y: pinza(num(sitio[1], 0.5), 0, 1),
          sinCaja: true,
          tamano: tamEditor(num(m.tam, 0.05) * (destacar.has(i) ? 1.5 : 1)),
          ...(color ? { color } : {}),
          fuente: letra(m.fuente, String(receta.fuente ?? 'fina')),
          animacion: 'subir'
        })
      }
      continue
    }
    const lineas = (Array.isArray(m.lineas) ? m.lineas : []).filter((l): l is string => typeof l === 'string' && Boolean(l.trim()))
    if (!lineas.length) continue
    // La línea que el kit destaca va más grande: aquí, todo el rótulo un poco más grande.
    textos.push({
      id: nuevoId('texto'),
      inicio: m.desde,
      duracion: m.hasta - m.desde,
      texto: lineas.join('\n'),
      posicion: 'centro',
      ...estiloRotulo,
      ...(typeof m.destacar === 'number' ? { tamano: 1.3 } : {})
    })
  }
  // Los subtítulos de la receta: cada frase es un texto suelto, con la letra, el color y la caja del kit.
  const subs = (receta.subtitulos && typeof receta.subtitulos === 'object' ? receta.subtitulos : {}) as Record<string, unknown>
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined)
  const anchoReceta = num(receta.ancho, 1080)
  const altoReceta = num(receta.alto, 1920)
  // El kit mide en píxeles; el editor, relativo a su tamaño de rótulo (6 % del lado corto).
  const tamSub = num(subs.tam, anchoReceta * 0.058) / (Math.min(anchoReceta, altoReceta) * 0.06)
  const fuenteSub = ({ fina: 'fina', normal: 'normal', negrita: 'normal', gruesa: 'gruesa' } as Record<string, string>)[String(subs.fuente ?? receta.fuente ?? 'negrita')] ?? 'normal'
  const estiloSub = {
    ...(hex(subs.color) && hex(subs.color) !== '#ffffff' ? { color: hex(subs.color) } : {}),
    ...(subs.caja === null || subs.caja === false ? { sinCaja: true } : hex(subs.caja) ? { caja: hex(subs.caja) } : {}),
    ...(fuenteSub !== 'normal' ? { fuente: fuenteSub } : {}),
    ...(Math.abs(tamSub - 1) > 0.05 ? { tamano: pinza(tamSub, 0.5, 2.5) } : {})
  }
  const posSub: PosicionTexto = num(subs.pos, 0.78) < 0.35 ? 'arriba' : num(subs.pos, 0.78) < 0.65 ? 'centro' : 'abajo'
  for (const f of Array.isArray(subs.frases) ? subs.frases : []) {
    if (!f || typeof f !== 'object') continue
    const x = f as Record<string, unknown>
    const texto = typeof x.texto === 'string' ? x.texto.trim() : ''
    const a = pinza(num(x.desde, -1), 0, total)
    const b = pinza(num(x.hasta, -1), 0, total)
    if (!texto || b - a < 0.05) continue
    textos.push({ id: nuevoId('texto'), inicio: a, duracion: b - a, texto, posicion: posSub, ...estiloSub })
  }
  if (!editables) return null

  const media = join(carpetaProyecto, 'media')
  mkdirSync(media, { recursive: true })

  // La narración: cada frase, con su audio copiado al proyecto (así el proyecto no depende de la carpeta del agente).
  const dichos = textosDeVoz(trabajo)
  const voces: VozTL[] = []
  for (const [i, f] of frases.entries()) {
    const ruta = dentro(trabajo, f.archivo)
    if (!ruta) continue
    const nombre = `voz-${String(i + 1).padStart(2, '0')}-${randomUUID().slice(0, 6)}${extname(ruta).toLowerCase() || '.wav'}`
    try {
      copyFileSync(ruta, join(media, nombre))
      const duracion = await duracionMedio(ruta)
      if (!(duracion > 0)) continue
      const dicho = dichos.get(String(f.archivo).replace(/\\/g, '/'))
      voces.push({
        id: nuevoId('voz'),
        inicio: Math.max(0, num(f.en, 0)),
        duracion: Math.round(duracion * 100) / 100,
        archivo: `media/${nombre}`,
        texto: dicho?.texto ?? '',
        ...(typeof f.volumen === 'number' ? { volumen: f.volumen } : {}),
        ...(dicho?.voz ? { voz: dicho.voz } : {})
      })
    } catch {
      // Una frase que no se pudo copiar se queda fuera; las demás siguen.
    }
  }

  // La música: el trozo que usó el agente, ya recortado, como pista del editor.
  let musica: Timeline['musica']
  const m = receta.musica as Record<string, unknown> | undefined
  const rutaMusica = m ? dentro(trabajo, m.archivo) : null
  if (m && rutaMusica) {
    const desde = Math.max(0, num(m.desde, 0))
    const hasta = typeof m.hasta === 'number' ? m.hasta : undefined
    const nombre = `musica-${randomUUID().slice(0, 6)}.m4a`
    const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
    const r = await ejecutar(
      [`"${ffmpeg}"`, '-y', '-v', 'error', '-ss', desde.toFixed(3), ...(hasta !== undefined && hasta > desde ? ['-t', (hasta - desde).toFixed(3)] : []),
        '-i', `"${rutaMusica}"`, '-vn', '-c:a', 'aac', '-b:a', '192k', `"${join(media, nombre)}"`],
      carpetaProyecto,
      120_000
    )
    if (r.codigo === 0 && existsSync(join(media, nombre))) {
      musica = {
        archivo: `media/${nombre}`,
        nombre: basename(rutaMusica),
        // El kit baja la música a 0.25 cuando hay voz, fija; aquí queda igual, sin subir y bajar.
        volumen: pinza(num(m.volumen, frases.length ? 0.25 : 1), 0, 1),
        ducking: false
      }
    }
  }

  // Las capas encima (logos, íconos): cada imagen a la biblioteca y a la pista «Encima», con su sitio y su entrada.
  const capas: CapaTL[] = []
  for (const c of Array.isArray(receta.capas) ? receta.capas : []) {
    if (!c || typeof c !== 'object') continue
    const x = c as Record<string, unknown>
    const ruta = dentro(trabajo, x.archivo)
    const medio = ruta ? await medioDe(ruta) : null
    const a = pinza(num(x.desde, -1), 0, total)
    const b = pinza(num(x.hasta, -1), 0, total)
    if (!medio || medio.tipo !== 'imagen' || b - a < MIN) continue
    capas.push({
      id: nuevoId('capa'),
      fuente: medio.id,
      inicio: a,
      duracion: b - a,
      x: pinza(num(x.x, 0.5), 0, 1),
      y: pinza(num(x.y, 0.5), 0, 1),
      ancho: pinza(num(x.ancho, 0.3), 0.05, 1),
      ...(typeof x.entrada === 'string' && ENTRADAS_CAPA.includes(x.entrada as EntradaCapa)
        ? { entrada: x.entrada as EntradaCapa }
        : x.entrada === 'ninguna'
          ? {}
          : { entrada: 'pop' as const }),
      ...(num(x.giro, 0) ? { giro: num(x.giro, 0) } : {}),
      ...(x.fin && typeof x.fin === 'object'
        ? (() => {
            const f = x.fin as Record<string, unknown>
            return { fin: { x: num(f.x, num(x.x, 0.5)), y: num(f.y, num(x.y, 0.5)), ancho: num(f.ancho, num(x.ancho, 0.3)), giro: num(f.giro, num(x.giro, 0)) } }
          })()
        : {})
    })
  }
  // Los efectos de sonido: los incluidos (kit/sonidos) o los del agente, copiados al proyecto.
  const sonidos: SonidoTL[] = []
  for (const [i, x] of sonidosReceta.entries()) {
    const incluido = typeof x.sonido === 'string' && /^[\w-]{1,30}$/.test(x.sonido) ? dentro(trabajo, `kit/sonidos/${x.sonido}.wav`) : null
    const ruta = incluido ?? dentro(trabajo, x.archivo)
    if (!ruta) continue
    const nombre = `sonido-${String(i + 1).padStart(2, '0')}-${randomUUID().slice(0, 6)}${extname(ruta).toLowerCase() || '.wav'}`
    try {
      const duracion = await duracionMedio(ruta)
      if (!(duracion > 0)) continue
      copyFileSync(ruta, join(media, nombre))
      sonidos.push({
        id: nuevoId('sonido'),
        inicio: pinza(num(x.en, 0), 0, total),
        duracion: Math.round(duracion * 100) / 100,
        archivo: `media/${nombre}`,
        nombre: typeof x.sonido === 'string' ? x.sonido : basename(ruta, extname(ruta)),
        ...(typeof x.volumen === 'number' ? { volumen: pinza(x.volumen, 0, 1.5) } : {})
      })
    } catch {
      // Un sonido que no se pudo leer se queda fuera; los demás siguen.
    }
  }

  const timeline = normalizarTimeline(
    {
      version: 1,
      clips,
      textos,
      voces,
      ...(musica ? { musica } : {}),
      ...(capas.length ? { capas } : {}),
      ...(sonidos.length ? { sonidos } : {}),
      // Los filtros del kit (grano, polvo, trama, viñeta, parpadeo) siguen siendo filtros en el editor.
      ...(receta.filtros && typeof receta.filtros === 'object' ? { filtros: receta.filtros as Timeline['filtros'] } : {})
    },
    duracionFinal,
    duracionesDeMedios(medios)
  )
  if (!timeline.clips.length) return null
  return { medios, timeline, editables, fijos }
}
