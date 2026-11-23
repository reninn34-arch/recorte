/**
 * Gráficos editables (como los «Gráficos esenciales» de Premiere o los textos con diseño de CapCut): una tarjeta, un
 * rótulo con su caja, un botón de llamada a la acción… hecho de textos, una caja de fondo y alguna imagen (un ícono),
 * todo editable. La idea de un gráfico como capas de texto y forma con relleno, borde, fondo con margen y radio, y
 * sombra viene de FilmCraft (storytold/filmcraft, MIT/Apache-2.0); aquí no hay código suyo.
 *
 * Un gráfico va en una capa de «Encima» (`CapaTL.grafico`): Recorte lo dibuja con Chromium a un PNG con transparencia y
 * esa imagen es la que se ve en el monitor y la que va al MP4, así que los dos son idénticos. Al editarlo se vuelve a
 * dibujar. Las medidas van en píxeles de un cuadro de 1080 de ancho (en un video de otro ancho se escala igual).
 */

import type { OperacionTL } from './chat'
import type { Timeline } from './timeline'

export const ANCHO_DISENO = 1080

export type AlineacionGrafico = 'izquierda' | 'centro' | 'derecha'

/** Una línea de texto del gráfico, con su estilo. */
export interface TextoGrafico {
  tipo: 'texto'
  texto: string
  /** Píxeles (de un cuadro de 1080 de ancho). */
  tamano: number
  /** 400 normal, 700 negrita, 900 negra. */
  peso: number
  color: string
  /** Una clave de FUENTES_TEXTO o el id de una letra propia del proyecto; sin ella, la normal (Arial). */
  fuente?: string
  cursiva?: boolean
  mayusculas?: boolean
  /** Entre letras, en ems (-0,1 a 0,5). */
  espaciado?: number
  /** La altura de cada línea, en veces el tamaño (0,8 a 2). Sin ella, 1,15. */
  interlinea?: number
  /** Un contorno de la letra, en píxeles, y su color. */
  contorno?: number
  colorContorno?: string
  /** Una caja propia detrás de esta línea (una palabra resaltada, una píldora): su color, radio y margen en píxeles. */
  caja?: { color: string; radio: number; margenX: number; margenY: number }
  /** Hasta qué ancho llega antes de partirse en otra línea (píxeles); sin él, no se parte. */
  anchoMax?: number
}

/** Una imagen del gráfico: un medio de la biblioteca (un ícono, el logo). */
export interface ImagenGrafico {
  tipo: 'imagen'
  /** El id de un medio de imagen del proyecto, o `logo` (el de la marca). */
  medio: string
  /** Su alto en píxeles (el ancho, el que le toque). */
  alto: number
  /** Esquinas redondeadas (píxeles). */
  radio?: number
}

export type ElementoGrafico = TextoGrafico | ImagenGrafico

export interface FondoGrafico {
  color: string
  /** Un segundo color: degradado del primero a este, con su ángulo (grados; 90 = de izquierda a derecha). */
  color2?: string
  angulo?: number
  /** 0 (transparente) a 1. */
  opacidad?: number
  radio: number
  borde?: number
  colorBorde?: string
}

export interface Grafico {
  /** Los elementos uno tras otro: en columna (uno debajo del otro) o en fila. */
  disposicion: 'columna' | 'fila'
  /** Cómo se alinean (en columna: a la izquierda, al centro o a la derecha; en fila: arriba, al medio o abajo). */
  alinear: AlineacionGrafico
  /** Entre elemento y elemento (píxeles). */
  separacion: number
  /** Del borde de la caja a lo de dentro (píxeles). */
  margenX: number
  margenY: number
  /** La caja de fondo; sin ella, solo los elementos. */
  fondo?: FondoGrafico
  /** Una barra de color a un lado de la caja (como un rótulo de nombre). */
  acento?: { lado: 'izquierda' | 'arriba' | 'abajo'; color: string; grosor: number }
  /** Una sombra debajo de todo: 0 a 1, y su color. */
  sombra?: number
  colorSombra?: string
  /** Un ancho fijo (píxeles); sin él, el de lo que lleva dentro. */
  ancho?: number
  elementos: ElementoGrafico[]
}

const HEX = /^#[0-9a-f]{6}$/i
const num = (v: unknown, d: number, a: number, b: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d)
const color = (v: unknown, d: string): string => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : d)
const redondo = (v: number, d = 100): number => Math.round(v * d) / d

/** Los colores con nombre que acepta el agente además de #rrggbb. */
const NOMBRES: Record<string, string> = { blanco: '#ffffff', negro: '#000000', amarillo: '#ffd60a', rojo: '#e63946', azul: '#1d4ed8', verde: '#16a34a' }
const colorLibre = (v: unknown, d: string): string => (typeof v === 'string' && NOMBRES[v.trim().toLowerCase()] ? NOMBRES[v.trim().toLowerCase()] : color(v, d))

function normalizarElemento(e: unknown): ElementoGrafico | null {
  if (!e || typeof e !== 'object') return null
  const x = e as Record<string, unknown>
  if (x.tipo === 'imagen') {
    if (typeof x.medio !== 'string' || !x.medio.trim()) return null
    return { tipo: 'imagen', medio: x.medio.trim(), alto: redondo(num(x.alto, 120, 8, 1600), 1), ...(num(x.radio, 0, 0, 800) > 0 ? { radio: redondo(num(x.radio, 0, 0, 800), 1) } : {}) }
  }
  const texto = typeof x.texto === 'string' ? x.texto.slice(0, 400) : ''
  if (!texto.trim()) return null
  const t: TextoGrafico = {
    tipo: 'texto',
    texto,
    tamano: redondo(num(x.tamano, 64, 8, 600), 1),
    peso: Math.round(num(x.peso, 700, 100, 900) / 100) * 100,
    color: colorLibre(x.color, '#ffffff')
  }
  if (typeof x.fuente === 'string' && x.fuente.trim()) t.fuente = x.fuente.trim()
  if (x.cursiva === true) t.cursiva = true
  if (x.mayusculas === true) t.mayusculas = true
  if (typeof x.espaciado === 'number' && Math.abs(x.espaciado) > 0.002) t.espaciado = redondo(num(x.espaciado, 0, -0.1, 0.5), 1000)
  if (typeof x.interlinea === 'number') t.interlinea = redondo(num(x.interlinea, 1.15, 0.8, 2))
  if (typeof x.contorno === 'number' && x.contorno > 0) {
    t.contorno = redondo(num(x.contorno, 0, 0, 40), 10)
    t.colorContorno = colorLibre(x.colorContorno, '#000000')
  }
  if (x.caja && typeof x.caja === 'object') {
    const c = x.caja as Record<string, unknown>
    t.caja = { color: colorLibre(c.color, '#ffd60a'), radio: redondo(num(c.radio, 12, 0, 400), 1), margenX: redondo(num(c.margenX, 16, 0, 300), 1), margenY: redondo(num(c.margenY, 6, 0, 300), 1) }
  }
  if (typeof x.anchoMax === 'number' && x.anchoMax > 0) t.anchoMax = redondo(num(x.anchoMax, 900, 40, 4000), 1)
  return t
}

/** Un gráfico limpio (lo que no se entiende se queda en lo de siempre). Null si no lleva nada que se vea. */
export function normalizarGrafico(g: unknown): Grafico | null {
  if (!g || typeof g !== 'object') return null
  const x = g as Record<string, unknown>
  const elementos = (Array.isArray(x.elementos) ? x.elementos : []).map(normalizarElemento).filter((e): e is ElementoGrafico => e !== null).slice(0, 12)
  if (!elementos.length) return null
  const r: Grafico = {
    disposicion: x.disposicion === 'fila' ? 'fila' : 'columna',
    alinear: x.alinear === 'izquierda' || x.alinear === 'derecha' ? x.alinear : 'centro',
    separacion: redondo(num(x.separacion, 12, 0, 400), 1),
    margenX: redondo(num(x.margenX, 40, 0, 600), 1),
    margenY: redondo(num(x.margenY, 28, 0, 600), 1),
    elementos
  }
  if (x.fondo && typeof x.fondo === 'object') {
    const f = x.fondo as Record<string, unknown>
    r.fondo = { color: colorLibre(f.color, '#111111'), radio: redondo(num(f.radio, 24, 0, 800), 1) }
    if (f.color2 !== undefined && f.color2 !== null && f.color2 !== '') {
      r.fondo.color2 = colorLibre(f.color2, r.fondo.color)
      r.fondo.angulo = Math.round(num(f.angulo, 90, -360, 360))
    }
    if (typeof f.opacidad === 'number' && f.opacidad < 0.995) r.fondo.opacidad = redondo(num(f.opacidad, 1, 0, 1))
    if (typeof f.borde === 'number' && f.borde > 0) {
      r.fondo.borde = redondo(num(f.borde, 0, 0, 60), 10)
      r.fondo.colorBorde = colorLibre(f.colorBorde, '#ffffff')
    }
  }
  if (x.acento && typeof x.acento === 'object') {
    const a = x.acento as Record<string, unknown>
    const grosor = redondo(num(a.grosor, 10, 0, 200), 1)
    if (grosor > 0) r.acento = { lado: a.lado === 'arriba' || a.lado === 'abajo' ? a.lado : 'izquierda', color: colorLibre(a.color, '#ffd60a'), grosor }
  }
  if (typeof x.sombra === 'number' && x.sombra > 0.005) {
    r.sombra = redondo(num(x.sombra, 0, 0, 1))
    r.colorSombra = colorLibre(x.colorSombra, '#000000')
  }
  if (typeof x.ancho === 'number' && x.ancho > 0) r.ancho = redondo(num(x.ancho, 600, 40, 4000), 1)
  return r
}

/** El margen transparente alrededor que deja la sombra (píxeles de diseño), para que no se corte. */
export function margenSombra(g: Grafico): number {
  // Lo que baja la sombra más lo que se difumina (unas tres veces su radio): así no queda una franja cortada.
  return g.sombra ? Math.ceil(3 + 10 * g.sombra + 3 * (6 + 20 * g.sombra)) : 0
}

const escaparHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const conAlfa = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${redondo(a, 1000)})`
}

export interface RecursosGrafico {
  /** La familia CSS de una letra (FUENTES_TEXTO o propia), o undefined si no se conoce. */
  familia: (fuente: string | undefined) => string | undefined
  /** Las @font-face que hacen falta (letras de la app y del proyecto, como URLs que ve el render). */
  fuentesCss: string
  /** La URL de una imagen del gráfico (un medio o el logo), o undefined si ya no está. */
  imagen: (medio: string) => string | undefined
}

/**
 * El HTML del gráfico, listo para dibujarse: una sola caja (#grafico) del tamaño justo, con fondo transparente. La
 * escala (`escala`) agranda todo para un video de más de 1080 de ancho, así sale nítido.
 */
export function htmlDeGrafico(g: Grafico, recursos: RecursosGrafico, escala = 1): string {
  const px = (v: number) => `${redondo(v * escala, 100)}px`
  const pad = margenSombra(g)
  const alineado = g.alinear === 'izquierda' ? 'flex-start' : g.alinear === 'derecha' ? 'flex-end' : 'center'
  const caja: string[] = [
    'display:flex',
    `flex-direction:${g.disposicion === 'fila' ? 'row' : 'column'}`,
    `align-items:${alineado}`,
    `gap:${px(g.separacion)}`,
    `padding:${px(g.margenY)} ${px(g.margenX)}`,
    'box-sizing:border-box',
    'position:relative',
    'overflow:hidden'
  ]
  if (g.disposicion === 'columna') caja.push(`text-align:${g.alinear === 'izquierda' ? 'left' : g.alinear === 'derecha' ? 'right' : 'center'}`)
  else caja.push('justify-content:center')
  if (g.ancho) caja.push(`width:${px(g.ancho)}`)
  if (g.fondo) {
    const f = g.fondo
    const op = f.opacidad ?? 1
    caja.push(
      f.color2
        ? `background:linear-gradient(${f.angulo ?? 90}deg, ${conAlfa(f.color, op)}, ${conAlfa(f.color2, op)})`
        : `background:${conAlfa(f.color, op)}`
    )
    caja.push(`border-radius:${px(f.radio)}`)
    if (f.borde) caja.push(`border:${px(f.borde)} solid ${f.colorBorde ?? '#ffffff'}`)
  }
  if (g.acento) {
    const a = g.acento
    caja.push(a.lado === 'izquierda' ? `border-left:${px(a.grosor)} solid ${a.color}` : a.lado === 'arriba' ? `border-top:${px(a.grosor)} solid ${a.color}` : `border-bottom:${px(a.grosor)} solid ${a.color}`)
  }
  const sombra = g.sombra ? `filter:drop-shadow(0 ${px(3 + 10 * g.sombra)} ${px(6 + 20 * g.sombra)} ${conAlfa(g.colorSombra ?? '#000000', 0.25 + 0.5 * g.sombra)})` : ''

  const elementos = g.elementos
    .map((e) => {
      if (e.tipo === 'imagen') {
        const url = recursos.imagen(e.medio)
        if (!url) return ''
        return `<img src="${escaparHtml(url)}" style="display:block;height:${px(e.alto)};width:auto;${e.radio ? `border-radius:${px(e.radio)};` : ''}" />`
      }
      const familia = recursos.familia(e.fuente) ?? 'Arial'
      const estilo: string[] = [
        `font-family:'${familia.replace(/'/g, '')}', Arial, sans-serif`,
        `font-size:${px(e.tamano)}`,
        `font-weight:${e.peso}`,
        `color:${e.color}`,
        `line-height:${e.interlinea ?? 1.15}`,
        e.anchoMax ? `max-width:${px(e.anchoMax)}` : 'white-space:pre',
        'display:block',
        // Una letra de un solo grosor (Anton, la de una marca) no se engorda a la fuerza: se ve como es.
        'font-synthesis-weight:none'
      ]
      if (e.anchoMax) estilo.push('white-space:pre-wrap', 'overflow-wrap:break-word')
      if (e.cursiva) estilo.push('font-style:italic')
      if (e.mayusculas) estilo.push('text-transform:uppercase')
      if (e.espaciado) estilo.push(`letter-spacing:${e.espaciado}em`)
      if (e.contorno) estilo.push(`-webkit-text-stroke:${px(e.contorno)} ${e.colorContorno ?? '#000000'}`, 'paint-order:stroke fill')
      if (e.caja) estilo.push(`background:${e.caja.color}`, `border-radius:${px(e.caja.radio)}`, `padding:${px(e.caja.margenY)} ${px(e.caja.margenX)}`)
      return `<div style="${estilo.join(';')}">${escaparHtml(e.texto)}</div>`
    })
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${recursos.fuentesCss}
html,body{margin:0;padding:0;background:transparent;}
body{display:inline-block;}
#marco{display:inline-block;padding:${px(pad)};}
#grafico{${caja.join(';')}}
#sombra{display:inline-block;${sombra}}
</style></head><body><div id="marco"><div id="sombra"><div id="grafico">${elementos}</div></div></div></body></html>`
}

/** Si un medio es el dibujo de un gráfico (no se muestra en la biblioteca: se cambia desde su capa). */
export function esDibujoGrafico(ruta: string): boolean {
  return /[\\/]graficos[\\/]grafico-[0-9a-f]+\.png$/i.test(ruta)
}

/** Un resumen corto de un gráfico (para la lista de capas y para el agente). */
export function resumenGrafico(g: Grafico): string {
  const textos = g.elementos.filter((e): e is TextoGrafico => e.tipo === 'texto').map((e) => e.texto.replace(/\s+/g, ' ').trim())
  return textos.join(' · ').slice(0, 80) || 'Gráfico'
}

/** Las plantillas para empezar (se cambia todo después). `marca` y `marca2` se cambian por los colores de la marca. */
export const PLANTILLAS_GRAFICO: { id: string; nombre: string; ancho: number; y: number; grafico: Grafico }[] = [
  {
    id: 'tarjeta',
    nombre: 'Tarjeta con palabra clave',
    ancho: 0.62,
    y: 0.5,
    grafico: {
      disposicion: 'columna',
      alinear: 'centro',
      separacion: 8,
      margenX: 56,
      margenY: 36,
      fondo: { color: 'marca' as unknown as string, radio: 36 },
      sombra: 0.5,
      elementos: [
        { tipo: 'texto', texto: 'Palabra clave', tamano: 84, peso: 900, color: '#ffffff', mayusculas: true },
        { tipo: 'texto', texto: 'Una frase que la explica', tamano: 40, peso: 400, color: '#ffffff' }
      ]
    }
  },
  {
    id: 'nombre',
    nombre: 'Rótulo de nombre',
    ancho: 0.6,
    y: 0.78,
    grafico: {
      disposicion: 'columna',
      alinear: 'izquierda',
      separacion: 4,
      margenX: 36,
      margenY: 22,
      fondo: { color: '#ffffff', radio: 12 },
      acento: { lado: 'izquierda', color: 'marca' as unknown as string, grosor: 14 },
      sombra: 0.35,
      elementos: [
        { tipo: 'texto', texto: 'Nombre Apellido', tamano: 56, peso: 800, color: '#111111' },
        { tipo: 'texto', texto: 'Cargo o empresa', tamano: 36, peso: 400, color: '#555555' }
      ]
    }
  },
  {
    id: 'boton',
    nombre: 'Botón de acción',
    ancho: 0.56,
    y: 0.82,
    grafico: {
      disposicion: 'fila',
      alinear: 'centro',
      separacion: 18,
      margenX: 52,
      margenY: 26,
      fondo: { color: 'marca' as unknown as string, color2: 'marca2' as unknown as string, angulo: 90, radio: 200 },
      sombra: 0.55,
      elementos: [{ tipo: 'texto', texto: 'Escríbenos hoy', tamano: 60, peso: 800, color: '#ffffff' }]
    }
  },
  {
    id: 'resaltado',
    nombre: 'Frase con palabra resaltada',
    ancho: 0.8,
    y: 0.3,
    grafico: {
      disposicion: 'columna',
      alinear: 'centro',
      separacion: 10,
      margenX: 0,
      margenY: 0,
      elementos: [
        { tipo: 'texto', texto: 'Lo que más importa', tamano: 64, peso: 800, color: '#ffffff', contorno: 3, colorContorno: '#000000' },
        { tipo: 'texto', texto: 'ES ESTO', tamano: 92, peso: 900, color: '#111111', caja: { color: '#ffd60a', radio: 14, margenX: 24, margenY: 4 } }
      ]
    }
  }
]

/** Una plantilla con los colores de la marca puestos. */
export function plantillaConMarca(g: Grafico, marca: { primary?: string; secondary?: string }): Grafico {
  const p = color(marca.primary, '#1d4ed8')
  const s = color(marca.secondary, p)
  const cambiar = (v: string) => (v === 'marca' ? p : v === 'marca2' ? s : v)
  const copia = JSON.parse(JSON.stringify(g)) as Grafico
  if (copia.fondo) {
    copia.fondo.color = cambiar(copia.fondo.color)
    if (copia.fondo.color2) copia.fondo.color2 = cambiar(copia.fondo.color2)
  }
  if (copia.acento) copia.acento.color = cambiar(copia.acento.color)
  for (const e of copia.elementos) if (e.tipo === 'texto') e.color = cambiar(e.color)
  return normalizarGrafico(copia) ?? g
}

/**
 * Un gráfico con un cambio encima (lo que pide el agente con cambiar_grafico): los campos de `cambio` mandan (`fondo`,
 * `acento` se mezclan con los de antes; `null` los quita; `elementos` va entero) y `textos` cambia los textos en orden.
 */
export function graficoCambiado(actual: Grafico, cambio?: Record<string, unknown>, textos?: string[]): Grafico | null {
  const base = JSON.parse(JSON.stringify(actual)) as Record<string, unknown>
  for (const [k, v] of Object.entries(cambio ?? {})) {
    if (v === null) delete base[k]
    else if ((k === 'fondo' || k === 'acento') && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') base[k] = { ...(base[k] as object), ...(v as object) }
    else base[k] = v
  }
  if (textos?.length) {
    let i = 0
    base.elementos = (base.elementos as ElementoGrafico[]).map((e) => (e.tipo === 'texto' && i < textos.length ? { ...e, texto: textos[i++] } : e))
  }
  return normalizarGrafico(base)
}

/**
 * Antes de aplicar lo que pidió el agente: dibuja los gráficos que pone (anadir_grafico) o cambia (cambiar_grafico) y
 * deja en cada operación su medio (y, al cambiar, el diseño final y cuánto cambió el ancho del dibujo). Devuelve los
 * que no se pudieron dibujar.
 */
export async function prepararGraficos(
  ops: OperacionTL[],
  tl: Timeline,
  dibujar: (g: Grafico) => Promise<{ medio: string; ancho: number; grafico: Grafico }>,
  anchoDeMedio: (medio: string) => number | undefined
): Promise<string[]> {
  const fallos: string[] = []
  for (const o of ops) {
    try {
      if (o.op === 'anadir_grafico') {
        const r = await dibujar(o.grafico)
        o.medio = r.medio
        o.anchoReal = r.ancho
        o.grafico = r.grafico
      } else if (o.op === 'cambiar_grafico') {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c?.grafico) continue
        const final = graficoCambiado(c.grafico, o.grafico, o.textos)
        if (!final) throw new Error('el gráfico quedaría vacío')
        const r = await dibujar(final)
        o.medio = r.medio
        o.final = r.grafico
        const antes = anchoDeMedio(c.fuente)
        const ahora = anchoDeMedio(r.medio)
        if (antes && ahora) o.escalaAncho = ahora / antes
      }
    } catch (e) {
      fallos.push(e instanceof Error ? e.message : String(e))
    }
  }
  return fallos
}
