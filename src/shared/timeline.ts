import type { RecetaEdicion, TranscriptSegment } from './types'
import { normalizarGrafico, type Grafico } from './grafico'

/**
 * La timeline: la pieza central del editor. La interfaz y los agentes trabajan sobre
 * este mismo documento; el reproductor lo sigue y el render lo exporta.
 *
 * - `clips` es la pista principal, magnética: los clips van uno tras otro, sin huecos.
 *   Su posición en la timeline sale del orden, así que borrar o recortar cierra el hueco
 *   solo (ripple), como en CapCut o en la pista principal de Final Cut.
 * - `textos` es una pista libre de rótulos con posición absoluta.
 * - `capas` va encima del video: imágenes, logos, íconos o tomas de apoyo, cada una en su sitio.
 * - `sonidos` son efectos sueltos (un «whoosh» en un corte, un «pop» al entrar un rótulo).
 *
 * Todo aquí es puro y sin dependencias de Node ni del DOM: cada operación devuelve una
 * timeline nueva y nunca muta la anterior (eso hace posible deshacer).
 */

/** Fuente del clip. Hoy, `principal` es el video del proyecto; mañana, la biblioteca. */
export type FuenteId = string
export const FUENTE_PRINCIPAL: FuenteId = 'principal'

export interface ClipTL {
  id: string
  fuente: FuenteId
  /** Segundo del material fuente donde empieza el clip. */
  entrada: number
  /** Segundo del material fuente donde acaba el clip. */
  salida: number
  /** Zoom y color del clip; sin él, el clip se ve tal cual. */
  ajustes?: AjustesClip
  /** Sin su sonido: un tramo que solo aporta imagen (la voz y la música van en sus pistas). */
  mudo?: boolean
  /** El sonido del clip: su volumen, que entre y salga fundiéndose, y quitarle el ruido de fondo. */
  sonido?: SonidoClip
  /** A qué velocidad va (0.25 a 4; sin ella, normal). En la timeline dura su tramo de la fuente entre la velocidad. */
  velocidad?: number
  /** Fotogramas clave: el valor de un ajuste en ciertos segundos de la FUENTE; entre ellos cambia suave. */
  claves?: ClavesClip
  /** Entra fundiéndose sobre el clip anterior, en estos segundos (0.1 a 1.5). */
  fundido?: number
  /** Cómo entra en esos segundos: barrido, zoom, desenfoque, destello, círculo (sin él, fundido). */
  transicion?: TransicionClip
  /** Fotogramas clave del volumen de su sonido (f: segundo de la fuente; v: 0 a 1.5), como en Premiere. */
  clavesVolumen?: ClaveTL[]
  /** Zonas tapadas del clip (una cara, una placa, un dato): difuminadas o en negro, en el monitor y en el MP4. */
  zonas?: ZonaTL[]
  /**
   * Rampa de velocidad (el «Reasignación de tiempo» de Premiere): la velocidad en cada segundo de la fuente
   * (f), de 0.1 a 4, suave entre claves. Manda sobre `velocidad`; el sonido del clip se calla.
   */
  rampa?: ClaveTL[]
  /** Si es un anidado (varios clips hechos uno, como una secuencia anidada de Premiere): los clips de dentro. */
  anidado?: ClipTL[]
  /** Curvas de color dibujadas a mano (la de luz y una por canal), después del color tipo Lumetri. */
  curvas?: CurvasTL
  /** Un LUT 3D (.cube) que el usuario cargó (un look de cine, el de su cámara): antes del resto del color. */
  lut?: LutClip
}

export const MAX_FUNDIDO = 1.5

/** El sonido de un clip de video. Los valores neutros (volumen 1, sin fundidos, sin limpiar) no se guardan. */
export interface SonidoClip {
  /** 0 (callado) a 1.5 (más fuerte); 1 como viene. */
  volumen?: number
  /** Segundos en que el sonido entra subiendo desde el silencio (0 a 5). */
  entra?: number
  /** Segundos en que sale bajando al silencio (0 a 5). */
  sale?: number
  /** Quitar el ruido de fondo (el zumbido, el aire, el siseo): 0 (nada) a 1 (fuerte). Se oye en el MP4. */
  limpio?: number
  /** Mejorar la voz (como «Diálogo» de Premiere): quita graves que retumban, la empareja y la aclara. 0 a 1. */
  realce?: number
  /** Ecualizador: graves (120 Hz), medios (1 kHz) y agudos (8 kHz), en dB (−12 a +12). */
  graves?: number
  medios?: number
  agudos?: number
  /** Compresor: empareja lo fuerte y lo suave (0 nada, 1 mucho). */
  comprimir?: number
}
export const LIMITES_SONIDO_CLIP = {
  volumen: [0, 1.5, 1],
  entra: [0, 5, 0],
  sale: [0, 5, 0],
  limpio: [0, 1, 0],
  realce: [0, 1, 0],
  graves: [-12, 12, 0],
  medios: [-12, 12, 0],
  agudos: [-12, 12, 0],
  comprimir: [0, 1, 0]
} as const satisfies Record<keyof SonidoClip, readonly [number, number, number]>

/** Cómo entra un clip sobre el anterior (con `fundido` = lo que dura). Sin tipo, un fundido cruzado. */
export type TransicionClip =
  | 'fundido'
  | 'a-negro'
  | 'destello'
  | 'gris'
  | 'desenfoque'
  | 'barrido-izquierda'
  | 'barrido-derecha'
  | 'barrido-arriba'
  | 'barrido-abajo'
  | 'tapar-izquierda'
  | 'tapar-derecha'
  | 'tapar-arriba'
  | 'tapar-abajo'
  | 'destapar-izquierda'
  | 'destapar-derecha'
  | 'destapar-arriba'
  | 'destapar-abajo'
  | 'cortina-izquierda'
  | 'cortina-derecha'
  | 'cortina-arriba'
  | 'cortina-abajo'
  | 'suave-izquierda'
  | 'suave-derecha'
  | 'suave-arriba'
  | 'suave-abajo'
  | 'reloj'
  | 'circulo'
  | 'circulo-cierra'
  | 'abrir-vertical'
  | 'cerrar-vertical'
  | 'abrir-horizontal'
  | 'cerrar-horizontal'
  | 'iris-negro'
  | 'cuadro-negro'
  | 'zoom'
  | 'aplastar-vertical'
  | 'aplastar-horizontal'

/** Las familias de transiciones (las carpetas del panel, como las de Premiere). */
export type GrupoTransicion = 'Disolver' | 'Deslizar' | 'Barrer' | 'Formas' | 'Movimiento'
export const GRUPOS_TRANSICION: GrupoTransicion[] = ['Disolver', 'Deslizar', 'Barrer', 'Formas', 'Movimiento']

/**
 * Las transiciones, con su nombre, su familia y la de FFmpeg (`xfade`) que la hace en el MP4. El monitor reproduce
 * la misma fórmula de cada una (ver transiciones.ts), así que se ven igual en los dos.
 */
export const TRANSICIONES: { id: TransicionClip; nombre: string; grupo: GrupoTransicion; xfade: string; para: string }[] = [
  { id: 'fundido', nombre: 'Fundido', grupo: 'Disolver', xfade: 'fade', para: 'el paso suave de siempre' },
  { id: 'a-negro', nombre: 'Pasar por negro', grupo: 'Disolver', xfade: 'fadeblack', para: 'cerrar un tema y abrir otro' },
  { id: 'destello', nombre: 'Pasar por blanco', grupo: 'Disolver', xfade: 'fadewhite', para: 'un flash, un recuerdo' },
  { id: 'gris', nombre: 'Por blanco y negro', grupo: 'Disolver', xfade: 'fadegrays', para: 'pierde el color y entra el siguiente' },
  { id: 'desenfoque', nombre: 'Desenfoque', grupo: 'Disolver', xfade: 'hblur', para: 'un salto de tiempo suave' },
  { id: 'barrido-izquierda', nombre: 'Empujar ←', grupo: 'Deslizar', xfade: 'slideleft', para: 'el siguiente empuja al anterior' },
  { id: 'barrido-derecha', nombre: 'Empujar →', grupo: 'Deslizar', xfade: 'slideright', para: 'el siguiente empuja al anterior' },
  { id: 'barrido-arriba', nombre: 'Empujar ↑', grupo: 'Deslizar', xfade: 'slideup', para: 'el siguiente empuja al anterior' },
  { id: 'barrido-abajo', nombre: 'Empujar ↓', grupo: 'Deslizar', xfade: 'slidedown', para: 'el siguiente empuja al anterior' },
  { id: 'tapar-izquierda', nombre: 'Tapar ←', grupo: 'Deslizar', xfade: 'coverleft', para: 'el siguiente entra por encima' },
  { id: 'tapar-derecha', nombre: 'Tapar →', grupo: 'Deslizar', xfade: 'coverright', para: 'el siguiente entra por encima' },
  { id: 'tapar-arriba', nombre: 'Tapar ↑', grupo: 'Deslizar', xfade: 'coverup', para: 'el siguiente entra por encima' },
  { id: 'tapar-abajo', nombre: 'Tapar ↓', grupo: 'Deslizar', xfade: 'coverdown', para: 'el siguiente entra por encima' },
  { id: 'destapar-izquierda', nombre: 'Destapar ←', grupo: 'Deslizar', xfade: 'revealleft', para: 'el anterior se va y deja ver el siguiente' },
  { id: 'destapar-derecha', nombre: 'Destapar →', grupo: 'Deslizar', xfade: 'revealright', para: 'el anterior se va y deja ver el siguiente' },
  { id: 'destapar-arriba', nombre: 'Destapar ↑', grupo: 'Deslizar', xfade: 'revealup', para: 'el anterior se va y deja ver el siguiente' },
  { id: 'destapar-abajo', nombre: 'Destapar ↓', grupo: 'Deslizar', xfade: 'revealdown', para: 'el anterior se va y deja ver el siguiente' },
  { id: 'cortina-izquierda', nombre: 'Cortina ←', grupo: 'Barrer', xfade: 'wipeleft', para: 'un borde recto que barre el cuadro' },
  { id: 'cortina-derecha', nombre: 'Cortina →', grupo: 'Barrer', xfade: 'wiperight', para: 'un borde recto que barre el cuadro' },
  { id: 'cortina-arriba', nombre: 'Cortina ↑', grupo: 'Barrer', xfade: 'wipeup', para: 'un borde recto que barre el cuadro' },
  { id: 'cortina-abajo', nombre: 'Cortina ↓', grupo: 'Barrer', xfade: 'wipedown', para: 'un borde recto que barre el cuadro' },
  { id: 'suave-izquierda', nombre: 'Barrido suave ←', grupo: 'Barrer', xfade: 'smoothleft', para: 'un borde difuminado que barre' },
  { id: 'suave-derecha', nombre: 'Barrido suave →', grupo: 'Barrer', xfade: 'smoothright', para: 'un borde difuminado que barre' },
  { id: 'suave-arriba', nombre: 'Barrido suave ↑', grupo: 'Barrer', xfade: 'smoothup', para: 'un borde difuminado que barre' },
  { id: 'suave-abajo', nombre: 'Barrido suave ↓', grupo: 'Barrer', xfade: 'smoothdown', para: 'un borde difuminado que barre' },
  { id: 'reloj', nombre: 'Reloj', grupo: 'Barrer', xfade: 'radial', para: 'gira como una aguja' },
  { id: 'circulo', nombre: 'Círculo que abre', grupo: 'Formas', xfade: 'circleopen', para: 'el siguiente sale del centro' },
  { id: 'circulo-cierra', nombre: 'Círculo que cierra', grupo: 'Formas', xfade: 'circleclose', para: 'el anterior se cierra hacia el centro' },
  { id: 'abrir-vertical', nombre: 'Puertas que abren', grupo: 'Formas', xfade: 'vertopen', para: 'se abre desde el centro hacia los lados' },
  { id: 'cerrar-vertical', nombre: 'Puertas que cierran', grupo: 'Formas', xfade: 'vertclose', para: 'se cierra desde los lados' },
  { id: 'abrir-horizontal', nombre: 'Persiana que abre', grupo: 'Formas', xfade: 'horzopen', para: 'se abre desde el centro hacia arriba y abajo' },
  { id: 'cerrar-horizontal', nombre: 'Persiana que cierra', grupo: 'Formas', xfade: 'horzclose', para: 'se cierra desde arriba y abajo' },
  { id: 'iris-negro', nombre: 'Iris por negro', grupo: 'Formas', xfade: 'circlecrop', para: 'de cine mudo: se cierra en un círculo y abre el siguiente' },
  { id: 'cuadro-negro', nombre: 'Cuadro por negro', grupo: 'Formas', xfade: 'rectcrop', para: 'se cierra en un rectángulo y abre el siguiente' },
  { id: 'zoom', nombre: 'Zoom', grupo: 'Movimiento', xfade: 'zoomin', para: 'se mete en el centro y aparece el siguiente' },
  { id: 'aplastar-vertical', nombre: 'Aplastar ↕', grupo: 'Movimiento', xfade: 'squeezeh', para: 'el anterior se aplasta hacia la línea del centro' },
  { id: 'aplastar-horizontal', nombre: 'Aplastar ↔', grupo: 'Movimiento', xfade: 'squeezev', para: 'el anterior se aplasta hacia el centro' }
]

/** Lo que se le puede cambiar a la imagen de un clip. Los valores neutros no cambian nada. */
export interface AjustesClip {
  /** 1 (sin zoom) a 2 (el doble), centrado. */
  zoom?: number
  /** -0.3 (más oscuro) a 0.3 (más claro); 0 neutro. */
  brillo?: number
  /** 0.5 (plano) a 1.8 (duro); 1 neutro. */
  contraste?: number
  /** 0 (blanco y negro) a 2 (muy vivo); 1 neutro. */
  saturacion?: number
  /** El punto de la imagen que queda al centro al acercar: 0 (izquierda) a 1 (derecha); 0.5 neutro. */
  cx?: number
  /** Lo mismo en vertical: 0 (arriba) a 1 (abajo); 0.5 neutro. */
  cy?: number
  /**
   * Acercamiento lento durante el clip (Ken Burns, o un dolly de cámara): cuánto crece al final, 0 a 0.3; 0 quieto.
   * Negativo, se aleja (hasta -0.3): necesita zoom para tener de dónde alejarse.
   */
  acercar?: number
  /**
   * Paneo: cuánto se desplaza el centro del encuadre al acabar el clip, -0.5 (izquierda) a 0.5 (derecha);
   * 0 quieto. Solo se nota con zoom (hace falta imagen de sobra para moverse).
   */
  panx?: number
  /** Lo mismo en vertical: -0.5 (sube) a 0.5 (baja). */
  pany?: number
  /** Cámara en mano: un vaivén suave e irregular, 0 a 1; 0 trípode. Lo cercano (capas con profundidad) se mueve más. */
  temblor?: number
  /**
   * Profundidad de campo, 0 a 1 (0 todo nítido): lo que está lejos del `foco` se desenfoca, más cuanto más lejos.
   * El fondo (el clip) está a profundidad 0; las capas, a la suya.
   */
  campo?: number
  /** La distancia enfocada, 0 (el fondo) a 1 (lo más cercano). */
  foco?: number
  /** Efecto: desenfoque de todo el clip, 0 a 1. */
  desenfoque?: number
  /** Efecto: sepia (foto antigua), 0 a 1. */
  sepia?: number
  /** Efecto: giro del tono de los colores, -180 a 180 grados. */
  tono?: number
  /** Efecto: negativo (1 = colores invertidos). */
  invertir?: number
  // ----- Color (como el panel Lumetri de Premiere): curvas que salen iguales en el monitor y en el MP4 -----
  /** Exposición en pasos de diafragma, -2 a 2; 0 neutro. */
  exposicion?: number
  /** Altas luces, -1 (recuperar) a 1 (más luz); 0 neutro. */
  altas?: number
  /** Sombras, -1 (más oscuras) a 1 (abrirlas); 0 neutro. */
  sombras?: number
  /** Blancos (el punto más claro), -1 a 1; 0 neutro. */
  blancos?: number
  /** Negros (el punto más oscuro), -1 (más profundos) a 1 (levantados); 0 neutro. */
  negros?: number
  /** Temperatura, -1 (frío, azul) a 1 (cálido, ámbar); 0 neutro. */
  temperatura?: number
  /** Tinte, -1 (verde) a 1 (magenta); 0 neutro. */
  tinte?: number
  // ----- Transformar y recortar (como «Movimiento» y «Recortar» de Premiere) -----
  /** Escala por debajo del 100 %, 0.1 a 1 (para agrandar está `zoom`); 1 neutro. Alrededor queda negro. */
  escala?: number
  /** Posición: cuánto se corre la imagen, en fracción del cuadro, -1 a 1; 0 centrada. */
  posx?: number
  posy?: number
  /** Rotación, -180 a 180 grados; 0 derecha. */
  giro?: number
  /** Recortar los bordes, en fracción del cuadro, 0 a 0.45 (lo recortado queda negro). */
  recorteIzq?: number
  recorteDer?: number
  recorteArr?: number
  recorteAba?: number
  // ----- Color por zonas (como el «secundario» de DaVinci o el HSL de Lumetri): cambia solo un color -----
  /** El color que se elige, como tono (0 rojo, 30 naranja/piel, 60 amarillo, 120 verde, 180 cian, 220 azul, 300 magenta). */
  zonaMatiz?: number
  /** Cuánto tono a cada lado del elegido entra de lleno (grados). */
  zonaAncho?: number
  /** Cuánto se suaviza el borde de la zona (0 seco, 1 muy suave). */
  zonaSuave?: number
  /** Gira el tono de la zona (grados). */
  zonaGiro?: number
  /** Más o menos color en la zona (−1 gris, +1 el doble). */
  zonaSat?: number
  /** Más clara u oscura la zona. */
  zonaLuz?: number
}

export const LIMITES_AJUSTES = {
  zoom: [1, 2, 1],
  brillo: [-0.3, 0.3, 0],
  contraste: [0.5, 1.8, 1],
  saturacion: [0, 2, 1],
  cx: [0, 1, 0.5],
  cy: [0, 1, 0.5],
  acercar: [-0.3, 0.3, 0],
  panx: [-0.5, 0.5, 0],
  pany: [-0.5, 0.5, 0],
  temblor: [0, 1, 0],
  campo: [0, 1, 0],
  foco: [0, 1, 0.5],
  desenfoque: [0, 1, 0],
  sepia: [0, 1, 0],
  tono: [-180, 180, 0],
  invertir: [0, 1, 0],
  exposicion: [-2, 2, 0],
  altas: [-1, 1, 0],
  sombras: [-1, 1, 0],
  blancos: [-1, 1, 0],
  negros: [-1, 1, 0],
  temperatura: [-1, 1, 0],
  tinte: [-1, 1, 0],
  escala: [0.1, 1, 1],
  posx: [-1, 1, 0],
  posy: [-1, 1, 0],
  giro: [-180, 180, 0],
  recorteIzq: [0, 0.45, 0],
  recorteDer: [0, 0.45, 0],
  recorteArr: [0, 0.45, 0],
  recorteAba: [0, 0.45, 0],
  zonaMatiz: [0, 360, 0],
  zonaAncho: [5, 90, 30],
  zonaSuave: [0, 1, 0.5],
  zonaGiro: [-180, 180, 0],
  zonaSat: [-1, 1, 0],
  zonaLuz: [-1, 1, 0]
} as const satisfies Record<keyof AjustesClip, readonly [number, number, number]>

/** Una zona tapada de un clip: un rectángulo del cuadro (en fracciones, con su centro en x, y). */
export interface ZonaTL {
  x: number
  y: number
  ancho: number
  alto: number
  /** desenfoque (difumina), negro (tapa del todo) o borrar (rellena con lo de alrededor, como si no estuviera: no se tapa en el MP4, se hace con «Borrar lo marcado»). */
  modo: 'desenfoque' | 'negro' | 'borrar' | 'recortar'
  /** Cuánto se difumina, 0.1 a 1. */
  fuerza: number
  /** Si sigue algo que se mueve: su centro en cada segundo de la fuente (lo calcula el seguidor). */
  recorrido?: PuntoRecorrido[]
}
export interface PuntoRecorrido {
  f: number
  x: number
  y: number
}
export const MAX_ZONAS = 3

/** El centro de una zona en el segundo `f` de la fuente: el de su recorrido (interpolado) o el fijo. */
export function zonaEn(z: ZonaTL, f: number): ZonaTL {
  const r = z.recorrido
  if (!r?.length) return z
  if (f <= r[0].f) return { ...z, x: r[0].x, y: r[0].y }
  const ultimo = r[r.length - 1]
  if (f >= ultimo.f) return { ...z, x: ultimo.x, y: ultimo.y }
  let lo = 0
  let hi = r.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (r[m].f <= f) lo = m
    else hi = m
  }
  const k = (f - r[lo].f) / Math.max(1e-6, r[hi].f - r[lo].f)
  return { ...z, x: r[lo].x + (r[hi].x - r[lo].x) * k, y: r[lo].y + (r[hi].y - r[lo].y) * k }
}

export function normalizarZonas(entrada: unknown): ZonaTL[] | undefined {
  if (!Array.isArray(entrada)) return undefined
  const zonas: ZonaTL[] = []
  for (const z of entrada) {
    if (!z || typeof z !== 'object') continue
    const n = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(pinza(v, min, max) * 1000) / 1000 : def)
    const zona = z as Partial<ZonaTL>
    zonas.push({
      x: n(zona.x, 0, 1, 0.5),
      y: n(zona.y, 0, 1, 0.5),
      ancho: n(zona.ancho, 0.02, 1, 0.3),
      alto: n(zona.alto, 0.02, 1, 0.3),
      modo: zona.modo === 'negro' ? 'negro' : zona.modo === 'borrar' ? 'borrar' : zona.modo === 'recortar' ? 'recortar' : 'desenfoque',
      fuerza: n(zona.fuerza, 0.1, 1, 0.6),
      ...(Array.isArray(zona.recorrido) && zona.recorrido.length
        ? {
            recorrido: zona.recorrido
              .filter((p) => p && [p.f, p.x, p.y].every((v) => typeof v === 'number' && Number.isFinite(v)))
              .map((p) => ({ f: Math.round(Math.max(0, p.f) * 1000) / 1000, x: Math.round(pinza(p.x, 0, 1) * 10000) / 10000, y: Math.round(pinza(p.y, 0, 1) * 10000) / 10000 }))
              .sort((a, b) => a.f - b.f)
              .slice(0, 6000)
          }
        : {})
    })
  }
  return zonas.length ? zonas.slice(0, MAX_ZONAS) : undefined
}

/** Cambia las zonas tapadas de un clip (sin ninguna, se quitan). */
export function cambiarZonas(tl: Timeline, id: string, zonas: ZonaTL[]): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const { zonas: _z, ...resto } = c
      const z = normalizarZonas(zonas)
      return z ? { ...resto, zonas: z } : resto
    })
  }
}

/** El rectángulo de una zona en píxeles de un cuadro de `ancho`×`alto` (pares y dentro del cuadro). */
export function zonaEnPixeles(z: ZonaTL, ancho: number, alto: number): { x: number; y: number; w: number; h: number } {
  const w = Math.max(2, Math.min(ancho, Math.round((z.ancho * ancho) / 2) * 2))
  const h = Math.max(2, Math.min(alto, Math.round((z.alto * alto) / 2) * 2))
  const x = Math.max(0, Math.min(ancho - w, Math.round(z.x * ancho - w / 2)))
  const y = Math.max(0, Math.min(alto - h, Math.round(z.y * alto - h / 2)))
  return { x, y, w, h }
}

/**
 * El clip pasa a usar otra fuente que es un trozo de la suya (la toma estabilizada empieza en `desde` de la original):
 * se conservan su duración, sus ajustes y sus fotogramas clave, corridos a la fuente nueva.
 */
export function cambiarATramo(tl: Timeline, id: string, fuente: FuenteId, desde: number): Timeline {
  const corre = (lista: ClaveTL[] | undefined) => lista?.map((x) => ({ ...x, f: Math.max(0, x.f - desde) }))
  const correZonas = (zonas: ZonaTL[] | undefined) =>
    zonas?.map((z) => (z.recorrido ? { ...z, recorrido: z.recorrido.map((p) => ({ ...p, f: Math.max(0, p.f - desde) })) } : z))
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const claves = c.claves
        ? (Object.fromEntries(Object.entries(c.claves).map(([k, v]) => [k, corre(v as ClaveTL[])])) as ClavesClip)
        : undefined
      return {
        ...c,
        fuente,
        entrada: Math.max(0, c.entrada - desde),
        salida: Math.max(DURACION_MINIMA, c.salida - desde),
        ...(claves ? { claves } : {}),
        ...(c.clavesVolumen ? { clavesVolumen: corre(c.clavesVolumen) } : {}),
        ...(c.zonas ? { zonas: correZonas(c.zonas) } : {})
      }
    })
  }
}

/** Una pista de música bajo toda la edición (se repite si es corta y se funde al final). */
export interface MusicaTL {
  /** Ruta relativa dentro de la carpeta del proyecto (p. ej. `media/musica.mp3`). */
  archivo: string
  nombre: string
  /** 0 a 1. */
  volumen: number
  /** Si baja sola mientras hay voz. */
  ducking: boolean
  /**
   * Los trozos donde suena, si se dividió o recortó (como clips de audio). Sin ellos suena en todo el video.
   * `desde` es el segundo de la música (que se repite) con el que empieza el trozo.
   */
  tramos?: TramoMusica[]
}

export interface TramoMusica {
  id: string
  inicio: number
  duracion: number
  desde?: number
}

export type PosicionTexto = 'arriba' | 'centro' | 'abajo'

export interface TextoTL {
  id: string
  /** Segundo de la timeline donde aparece. */
  inicio: number
  duracion: number
  texto: string
  posicion: PosicionTexto
  /** Tamaño relativo al normal: 0.5 (la mitad) a 2.5; sin él, 1. */
  tamano?: number
  /** Color de la letra (`#rrggbb`); sin él, blanco. */
  color?: string
  /** Sin la caja oscura de detrás: solo la letra con su borde. */
  sinCaja?: boolean
  /** El color de la caja (`#rrggbb`); sin él, negra semitransparente. */
  caja?: string
  /**
   * Posición libre: el centro del rótulo en fracción del cuadro (0 izquierda/arriba, 1 derecha/abajo).
   * Con ella manda sobre `posicion`; sin ella, va arriba, al centro o abajo.
   */
  x?: number
  y?: number
  /** La letra (una clave de FUENTES_TEXTO o el id de una letra propia del proyecto, `letras`); sin ella, la normal. */
  fuente?: string
  /** Cómo aparece: palabra a palabra, letra a letra (máquina), con rebote (pop), subiendo o pintando cada palabra. Sin ella, de golpe. */
  animacion?: AnimacionTexto
  /** El color con que se pintan las palabras en «pintar» (`#rrggbb`); sin él, amarillo. */
  pintado?: string
  /** El color de las palabras resaltadas (las que van entre asteriscos: «No es *timidez*»); sin él, amarillo. */
  colorClave?: string
  /**
   * Cuándo se dice cada palabra: segundos desde que empieza el rótulo (uno por palabra). Con ellos, «palabra a
   * palabra» y «pintar» van al ritmo de la voz; sin ellos (o si se cambió el texto), las palabras se reparten.
   */
  tiempos?: number[]
  /** Un subtítulo hecho desde la voz (se rehacen todos juntos con otro estilo). */
  subtitulo?: boolean
  /** Va DETRÁS de lo que hay encima del video (de la persona recortada, sobre todo): el título por detrás de la cabeza. */
  detras?: boolean
  /**
   * Sin caja: el grosor del contorno de la letra, en fracción de su tamaño (0 a LIMITE_TRAZO). Con él o con `sombra`, la
   * letra deja el halo negro de siempre y lleva solo esto (0 = sin contorno).
   */
  contorno?: number
  /** El color del contorno (`#rrggbb`); sin él, negro. */
  colorContorno?: string
  /** Sin caja: lo que se separa la sombra de la letra (abajo a la derecha), en fracción de su tamaño (0 a LIMITE_TRAZO). */
  sombra?: number
  /** El color de la sombra (`#rrggbb`); sin él, negro. */
  colorSombra?: string
  /**
   * Las líneas a la izquierda o a la derecha (sin ella, centradas). Solo con posición libre: `x` es entonces el borde
   * izquierdo (o derecho) del texto, como el punto de anclaje de Premiere.
   */
  alineacion?: AlineacionTexto
  /** El espacio de más entre letras, en fracción del tamaño (−0,1 a 0,5); sin él, 0. */
  espaciado?: number
  /** Todo en mayúsculas (el texto se guarda como se escribió). */
  mayusculas?: boolean
  /** 0 (invisible) a 1; sin ella, 1. */
  opacidad?: number
  /** Giro en grados, a favor del reloj (−180 a 180). Solo con posición libre: gira sobre su punto de anclaje. */
  giro?: number
  /** Cómo se va al terminar; sin ella, de golpe. */
  salida?: SalidaTexto
  /** Lo que dura su salida (0,1 a 2 s); sin ella, SALIDA_TEXTO_S. */
  durSalida?: number
  /** No se ve (ni en el monitor ni en el MP4), sin borrarlo. */
  oculto?: boolean
  /** No se mueve ni se cambia en la línea de tiempo ni en el monitor (se puede elegir y desbloquear). */
  bloqueado?: boolean
  /**
   * Fotogramas clave: el sitio (x, y), el tamaño, el giro o la opacidad en ciertos segundos desde que aparece. Mandan
   * sobre los fijos. Con claves de sitio o de giro, el texto tiene sitio propio.
   */
  claves?: ClavesTexto
  /**
   * Interno (no se guarda): los segundos que se le cortaron al final al sacar un trozo de la timeline (un cuadro, la
   * vista previa, exportar entre la entrada y la salida). Su salida sigue donde iba: después de lo que se ve.
   */
  cola?: number
}

export type AlineacionTexto = 'izquierda' | 'derecha'
/** Lo más grueso que puede ser el contorno o lo más lejos la sombra (en fracción del tamaño de la letra). */
export const LIMITE_TRAZO = 0.25
/** La eme de la letra en el monitor es el 93 % del tamaño del rótulo del MP4 (ver `letra` en el monitor): el contorno, la sombra y el espaciado se miden con ella. */
export const EME_ROTULO = 0.93

/**
 * El contorno y la sombra de un rótulo sin caja, si se eligieron (si no, null: lleva el halo de siempre). Con caja no
 * hay: en el MP4 el borde de una letra con caja es la caja.
 */
export function trazoTexto(t: Pick<TextoTL, 'sinCaja' | 'contorno' | 'sombra' | 'colorContorno' | 'colorSombra'>): { contorno: number; sombra: number; colorContorno: string; colorSombra: string } | null {
  if (!t.sinCaja || (t.contorno === undefined && t.sombra === undefined)) return null
  return { contorno: t.contorno ?? 0, sombra: t.sombra ?? 0, colorContorno: t.colorContorno ?? '#000000', colorSombra: t.colorSombra ?? '#000000' }
}

/** El texto como se ve (en mayúsculas si lo pide), lo mismo en el monitor y en el MP4. */
export const textoVisible = (t: Pick<TextoTL, 'texto' | 'mayusculas'>): string => (t.mayusculas ? t.texto.toLocaleUpperCase('es') : t.texto)

export type AnimacionTexto = 'palabras' | 'maquina' | 'pop' | 'subir' | 'pintar' | 'rotulo' | 'desenfoque' | 'palabras-desenfoque'
export const ANIMACIONES_TEXTO: { id: AnimacionTexto; nombre: string }[] = [
  { id: 'rotulo', nombre: 'Rótulo (aparece y crece un poco)' },
  { id: 'palabras', nombre: 'Palabra a palabra' },
  { id: 'palabras-desenfoque', nombre: 'Palabra a palabra, de borrosa a nítida' },
  { id: 'desenfoque', nombre: 'De borroso a nítido' },
  { id: 'pintar', nombre: 'Pintar palabras' },
  { id: 'maquina', nombre: 'Letra a letra' },
  { id: 'pop', nombre: 'Con rebote' },
  { id: 'subir', nombre: 'Subiendo' }
]

/**
 * Si la letra de un rótulo es oscura (tinta sobre un papel, un cartel claro). Sin caja, la letra clara lleva un halo
 * negro para leerse sobre cualquier video; a la oscura ese halo la emborrona: va limpia, en el monitor y en el MP4.
 */
export function letraOscura(t: Pick<TextoTL, 'color'>): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(t.color ?? '')
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35
}

/** Las animaciones que sacan las palabras una a una, al ritmo de la voz si se sabe (con sus `tiempos`). */
export const porPalabras = (a: AnimacionTexto | undefined): boolean => a === 'palabras' || a === 'palabras-desenfoque'

/** Cómo se va un rótulo al terminar: fundiéndose, encogiéndose o desenfocándose. Sin ella, de golpe. */
export type SalidaTexto = 'fundido' | 'encoger' | 'desenfoque'
export const SALIDAS_TEXTO: { id: SalidaTexto; nombre: string }[] = [
  { id: 'fundido', nombre: 'Se funde' },
  { id: 'encoger', nombre: 'Se encoge' },
  { id: 'desenfoque', nombre: 'Se desenfoca' }
]
/** Lo que dura la salida de un rótulo si no se dice (segundos). */
export const SALIDA_TEXTO_S = 0.3
/** Lo más borroso que llega a estar un rótulo al entrar o salir desenfocado, en fracción del tamaño de su letra. */
export const DESENFOQUE_TEXTO = 0.3
/** Lo que dura la salida de un rótulo: la suya, sin pasar de la mitad de lo que dura el rótulo. */
export function durSalidaTexto(t: Pick<TextoTL, 'salida' | 'durSalida'>): number {
  return t.salida ? (t.durSalida ?? SALIDA_TEXTO_S) : 0
}
/**
 * Cómo está un rótulo al irse, `dt` segundos desde que empezó: su opacidad, su escala y su desenfoque (en fracción
 * del tamaño de la letra). Lo mismo dibuja el MP4 (\fad, \fscx y \blur al final).
 */
export function salidaTexto(t: Pick<TextoTL, 'salida' | 'durSalida' | 'duracion' | 'cola'>, dt: number): { opacidad: number; escala: number; desenfoque: number } {
  const d = durSalidaTexto(t)
  if (!d) return { opacidad: 1, escala: 1, desenfoque: 0 }
  // De 0 (empieza a irse) a 1 (se fue).
  const p = Math.min(1, Math.max(0, 1 - (t.duracion + (t.cola ?? 0) - dt) / d))
  return {
    opacidad: 1 - p,
    escala: t.salida === 'encoger' ? 1 - 0.6 * p : 1,
    desenfoque: t.salida === 'desenfoque' ? DESENFOQUE_TEXTO * p : 0
  }
}

/** Segundos entre palabra y palabra (o letra y letra) de un rótulo animado: lo mismo en el monitor y en el MP4. */
export function pasoAnimacion(t: Pick<TextoTL, 'texto' | 'animacion'>): number {
  if (porPalabras(t.animacion)) return Math.min(0.22, 1.4 / Math.max(1, t.texto.split(/\s+/).filter(Boolean).length))
  if (t.animacion === 'maquina') return Math.min(0.045, 1.6 / Math.max(1, t.texto.replace(/\s/g, '').length))
  return 0
}

/** Lo que dura una palabra (o una letra) en aparecer. */
export const APARECER_S = 0.15

export const COLOR_PINTADO = '#ffe14d'

/** El texto sin las marcas de resaltado (los asteriscos de «No es *timidez*»). */
export const sinMarcas = (texto: string): string => texto.replace(/\*/g, '')

/** Los trozos de un texto: los que van entre asteriscos son palabras resaltadas (en su color). */
export function partesClave(texto: string): { texto: string; clave: boolean }[] {
  const partes: { texto: string; clave: boolean }[] = []
  let clave = false
  for (const trozo of texto.split('*')) {
    if (trozo) partes.push({ texto: trozo, clave })
    clave = !clave
  }
  return partes
}

/** Las palabras de un rótulo (como se trocean para animarlo). */
export const palabrasDe = (texto: string): string[] => sinMarcas(texto).split(/\s+/).filter(Boolean)

/**
 * Cuándo empieza cada palabra (segundos desde el inicio del rótulo) y cuánto dura. Con `tiempos` (de la voz), los de
 * verdad; sin ellos, «palabra a palabra» con su paso de siempre y «pintar» repartiendo las palabras en lo que dura.
 */
export function tiemposPalabras(t: Pick<TextoTL, 'texto' | 'animacion' | 'tiempos' | 'duracion'>): { inicio: number; dura: number }[] {
  const n = palabrasDe(t.texto).length
  if (!n) return []
  let inicios: number[]
  // Negativos: palabras que ya se dijeron antes de que empiece este trozo (un cuadro suelto a mitad de la frase).
  if (t.tiempos && t.tiempos.length === n) inicios = t.tiempos.map((x) => Math.min(x, t.duracion))
  else if (porPalabras(t.animacion)) {
    const paso = pasoAnimacion(t)
    inicios = Array.from({ length: n }, (_, k) => k * paso)
  } else {
    // Repartidas en el 85 % de lo que dura (la última se queda pintada un momento), a lo más 0,5 s cada una.
    const paso = Math.min(0.5, (t.duracion * 0.85) / n)
    inicios = Array.from({ length: n }, (_, k) => k * paso)
  }
  return inicios.map((a, k) => {
    const siguiente = k + 1 < n ? inicios[k + 1] : Math.min(t.duracion, a + Math.max(0.25, t.duracion * 0.85 - a))
    return { inicio: a, dura: Math.max(0.05, Math.min(siguiente, t.duracion) - a) }
  })
}

/** Normaliza los tiempos de las palabras: uno por palabra, en orden y dentro del rótulo. Si no cuadran, ninguno. */
function normalizarTiempos(tiempos: unknown, texto: string, duracion: number): number[] | undefined {
  if (!Array.isArray(tiempos)) return undefined
  const n = palabrasDe(texto).length
  if (!n || tiempos.length !== n || !tiempos.every((x) => typeof x === 'number' && Number.isFinite(x))) return undefined
  let previo = -600
  return (tiempos as number[]).map((x) => (previo = Math.round(Math.max(previo, Math.min(duracion, Math.max(-600, x))) * 1000) / 1000))
}

/**
 * Las letras de los rótulos. Son fuentes que trae Windows: el monitor (CSS) y el render
 * (libass) usan la misma, así lo que se ve es lo que se exporta.
 */
export const FUENTES_TEXTO: Record<string, { nombre: string; familia: string; negrita: boolean; cursiva?: boolean; linea: number }> = {
  normal: { nombre: 'Normal', familia: 'Arial', negrita: true, linea: 1.117 },
  fina: { nombre: 'Fina', familia: 'Segoe UI', negrita: false, linea: 1.33 },
  gruesa: { nombre: 'Gruesa', familia: 'Arial Black', negrita: false, linea: 1.41 },
  negra: { nombre: 'Negra', familia: 'Segoe UI Black', negrita: false, linea: 1.33 },
  impacto: { nombre: 'Impacto', familia: 'Impact', negrita: false, linea: 1.22 },
  elegante: { nombre: 'Elegante', familia: 'Playfair Display', negrita: true, linea: 1.41 },
  cursiva: { nombre: 'Cursiva', familia: 'Playfair Display', negrita: true, cursiva: true, linea: 1.41 },
  titular: { nombre: 'Titular', familia: 'Anton', negrita: false, linea: 1.733 },
  maquina: { nombre: 'Máquina', familia: 'Courier New', negrita: true, linea: 1.133 }
}

/**
 * Cuánto más grande va el tamaño del MP4 con esta letra para que se vea igual que en el monitor. El MP4 (libass) toma
 * el tamaño como la altura de línea de la letra (de su parte más alta a la más baja, «linea» en ems) y el monitor como
 * su eme; el tamaño de los rótulos está medido con Arial (1,117). Con Anton (1,733) el MP4 la dejaba a un 65 %.
 */
export function escalaLetraAss(fuente: string | undefined, letras?: LetraTL[]): number {
  const f = letraDe(fuente, letras)
  return f ? f.linea / FUENTES_TEXTO.normal.linea : 1
}

/**
 * Una letra propia del proyecto: un .ttf u .otf (la de una marca, la que trae el agente) copiado a `fuentes/` del
 * proyecto. El monitor la carga con @font-face y el MP4 (libass) la busca por su nombre en esa carpeta.
 */
export interface LetraTL {
  /** `letra-` y la huella del archivo. */
  id: string
  /** Cómo se ve en la lista de letras. */
  nombre: string
  /** Su nombre completo dentro del archivo (con él la encuentra libass). */
  familia: string
  /** Dentro de la carpeta del proyecto (`fuentes/…`). */
  archivo: string
  /** Su alto de línea en emes (como lo mide libass): para que salga del mismo tamaño que en el monitor. */
  linea: number
  cursiva?: boolean
}
export const esIdLetra = (v: unknown): v is string => typeof v === 'string' && /^letra-[a-f0-9]{8}$/.test(v)

/** Las letras propias válidas (con su archivo dentro de `fuentes/`). */
export function normalizarLetras(entrada: unknown): LetraTL[] {
  const salida: LetraTL[] = []
  for (const x of Array.isArray(entrada) ? (entrada as Partial<LetraTL>[]) : []) {
    if (!x || !esIdLetra(x.id) || typeof x.archivo !== 'string' || !/^fuentes\/[\w.-]+\.(ttf|otf)$/i.test(x.archivo) || typeof x.familia !== 'string' || !x.familia.trim()) continue
    if (salida.some((l) => l.id === x.id)) continue
    const linea = typeof x.linea === 'number' && x.linea > 0.5 && x.linea < 4 ? x.linea : 1.2
    salida.push({ id: x.id, nombre: (typeof x.nombre === 'string' && x.nombre.trim() ? x.nombre : x.familia).slice(0, 60), familia: x.familia.slice(0, 80), archivo: x.archivo, linea, ...(x.cursiva ? { cursiva: true } : {}) })
  }
  return salida.slice(0, 20)
}

/**
 * La letra de un texto: una de la lista (FUENTES_TEXTO) o una propia del proyecto. Para el monitor, `css` es la familia
 * con que la registra @font-face; para el MP4, `familia` es su nombre real.
 */
export function letraDe(
  fuente: string | undefined,
  letras: LetraTL[] | undefined
): { nombre: string; familia: string; css: string; negrita: boolean; cursiva: boolean; linea: number; archivo?: string } | undefined {
  if (!fuente) return undefined
  const fija = FUENTES_TEXTO[fuente]
  if (fija) return { nombre: fija.nombre, familia: fija.familia, css: fija.familia, negrita: fija.negrita, cursiva: Boolean(fija.cursiva), linea: fija.linea }
  const propia = letras?.find((l) => l.id === fuente)
  return propia ? { nombre: propia.nombre, familia: propia.familia, css: `Recorte ${propia.id}`, negrita: false, cursiva: Boolean(propia.cursiva), linea: propia.linea, archivo: propia.archivo } : undefined
}

export const LIMITES_TAMANO = [0.5, 6] as const
const COLOR_HEX = /^#[0-9a-f]{6}$/i

/** El estilo de un rótulo, limpio: lo neutro no se guarda. */
/** Los campos de estilo de un rótulo (los que `estiloTexto` limpia). */
const CAMPOS_ESTILO_TEXTO = ['tamano', 'color', 'sinCaja', 'fuente', 'caja', 'animacion', 'pintado', 'colorClave', 'contorno', 'colorContorno', 'sombra', 'colorSombra', 'alineacion', 'espaciado', 'mayusculas', 'opacidad', 'giro', 'salida', 'durSalida'] as const
type EstiloTexto = Pick<TextoTL, (typeof CAMPOS_ESTILO_TEXTO)[number]>

/** El estilo de un rótulo para copiarlo en otro (Copiar estilo / Pegar estilo). */
export function estiloDeTexto(t: TextoTL): EstiloTexto {
  return estiloTexto(t)
}

function estiloTexto(t: Partial<TextoTL>): EstiloTexto {
  const tamano = typeof t.tamano === 'number' && Number.isFinite(t.tamano) ? Math.round(pinza(t.tamano, LIMITES_TAMANO[0], LIMITES_TAMANO[1]) * 100) / 100 : 1
  const color = typeof t.color === 'string' && COLOR_HEX.test(t.color) ? t.color.toLowerCase() : '#ffffff'
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const r = (v: number, d = 1000) => Math.round(v * d) / d
  return {
    ...(num(t.contorno) ? { contorno: r(pinza(t.contorno, 0, LIMITE_TRAZO)) } : {}),
    ...(typeof t.colorContorno === 'string' && COLOR_HEX.test(t.colorContorno) && t.colorContorno.toLowerCase() !== '#000000' ? { colorContorno: t.colorContorno.toLowerCase() } : {}),
    ...(num(t.sombra) ? { sombra: r(pinza(t.sombra, 0, LIMITE_TRAZO)) } : {}),
    ...(typeof t.colorSombra === 'string' && COLOR_HEX.test(t.colorSombra) && t.colorSombra.toLowerCase() !== '#000000' ? { colorSombra: t.colorSombra.toLowerCase() } : {}),
    ...(t.alineacion === 'izquierda' || t.alineacion === 'derecha' ? { alineacion: t.alineacion } : {}),
    ...(num(t.espaciado) && Math.abs(t.espaciado) > 0.002 ? { espaciado: r(pinza(t.espaciado, -0.1, 0.5)) } : {}),
    ...(t.mayusculas === true ? { mayusculas: true } : {}),
    ...(num(t.opacidad) && t.opacidad < 0.995 ? { opacidad: r(pinza(t.opacidad, 0, 1), 100) } : {}),
    ...(num(t.giro) && Math.abs(t.giro) > 0.05 ? { giro: r(pinza(t.giro, -180, 180), 10) } : {}),
    ...(t.salida && SALIDAS_TEXTO.some((s) => s.id === t.salida) ? { salida: t.salida } : {}),
    ...(t.salida && num(t.durSalida) && Math.abs(t.durSalida - SALIDA_TEXTO_S) > 0.005 ? { durSalida: r(pinza(t.durSalida, DURACIONES_ANIMACION[0], DURACIONES_ANIMACION[1]), 100) } : {}),
    ...(Math.abs(tamano - 1) > 0.005 ? { tamano } : {}),
    ...(color !== '#ffffff' ? { color } : {}),
    ...(t.sinCaja === true ? { sinCaja: true } : {}),
    ...(typeof t.caja === 'string' && COLOR_HEX.test(t.caja) ? { caja: t.caja.toLowerCase() } : {}),
    ...(typeof t.fuente === 'string' && t.fuente !== 'normal' && (t.fuente in FUENTES_TEXTO || esIdLetra(t.fuente)) ? { fuente: t.fuente } : {}),
    ...(t.animacion && ANIMACIONES_TEXTO.some((a) => a.id === t.animacion) ? { animacion: t.animacion } : {}),
    ...(typeof t.pintado === 'string' && COLOR_HEX.test(t.pintado) && t.pintado.toLowerCase() !== COLOR_PINTADO ? { pintado: t.pintado.toLowerCase() } : {}),
    ...(typeof t.colorClave === 'string' && COLOR_HEX.test(t.colorClave) ? { colorClave: t.colorClave.toLowerCase() } : {})
  }
}

/**
 * Una frase de la narración: su propio audio en su segundo de la timeline. Va suelta (como
 * un rótulo): se mueve, se borra o se vuelve a generar sin tocar las demás.
 */
export interface VozTL {
  id: string
  /** Segundo de la timeline donde empieza a sonar. */
  inicio: number
  /** Lo que dura su audio. */
  duracion: number
  /** Ruta relativa dentro de la carpeta del proyecto (p. ej. `media/voz-01.wav`). */
  archivo: string
  /** Lo que dice (para verlo en la pista y poder regenerarla). */
  texto: string
  /** 0 a 1.5; sin él, 1. */
  volumen?: number
  /** La voz de Gemini con la que se generó, si se sabe. */
  voz?: string
  /** Desde qué segundo del archivo suena (al recortarle el principio o dividirla); sin él, desde 0. */
  desde?: number
  /** Lo que dura el archivo entero (hasta dónde se puede volver a alargar); sin él, desde + duracion. */
  largo?: number
}

/** Cómo entra una capa: con un pequeño rebote o fundiéndose; sin él, de golpe. */
export type EntradaCapa = 'pop' | 'fundido' | 'izquierda' | 'derecha' | 'arriba' | 'abajo'
export const ENTRADAS_CAPA: EntradaCapa[] = ['pop', 'fundido', 'izquierda', 'derecha', 'arriba', 'abajo']
/** Cómo se va una capa al terminar: fundiéndose, encogiéndose o saliendo por un lado; sin ella, de golpe. */
export type SalidaCapa = 'fundido' | 'encoger' | 'izquierda' | 'derecha' | 'arriba' | 'abajo'
export const SALIDAS_CAPA: SalidaCapa[] = ['fundido', 'encoger', 'izquierda', 'derecha', 'arriba', 'abajo']
/** Lo más corta y lo más larga que puede ser una entrada o una salida (segundos). */
export const DURACIONES_ANIMACION = [0.1, 2] as const

/** Dónde termina una capa que se mueve: va de su sitio, tamaño y giro de inicio a estos, suavemente. */
export interface FinCapa {
  x: number
  y: number
  ancho: number
  /** Grados (positivo = a favor del reloj). */
  giro: number
}

/**
 * Algo encima del video (una pista apilada): una imagen, un logo, un ícono o una toma de apoyo
 * de la biblioteca, en su sitio y su tamaño. Va suelta, como un rótulo.
 */
export interface CapaTL {
  id: string
  /** Un medio del proyecto (imagen o video). */
  fuente: FuenteId
  /** Segundo de la timeline donde aparece. */
  inicio: number
  duracion: number
  /** El centro, en fracción del cuadro: 0 (izquierda/arriba) a 1 (derecha/abajo). */
  x: number
  y: number
  /** El ancho, en fracción del ancho del cuadro: 0.05 a 1 (1 = de borde a borde). */
  ancho: number
  entrada?: EntradaCapa
  /** Cómo se va al terminar; sin ella, de golpe. */
  salida?: SalidaCapa
  /** Lo que dura la entrada y la salida (segundos); sin ellas, lo de cada tipo (pop 0,24, fundido 0,35, por un lado 0,45). */
  durEntrada?: number
  durSalida?: number
  /** Interno (no se guarda), como en los textos: lo que se le cortó al final al sacar un trozo; la salida sigue donde iba. */
  cola?: number
  /** Su orden dentro de su pista: una más alta tapa a las de su misma pista (sin él, 0; a igual orden, la que empieza después). */
  orden?: number
  /** Las esquinas redondeadas: 0 rectas a 1 (redonda del todo: un círculo o una píldora). Sobre lo que se ve (tras el recorte). */
  redondeo?: number
  /** Un borde por dentro de lo que se ve: su grosor en fracción de su ancho visible (0 a 0,2), y su color (sin él, blanco). */
  borde?: number
  colorBorde?: string
  /** Una sombra debajo, abajo a la derecha: 0 (nada) a 1 (fuerte), y su color (sin él, negro). */
  sombraCapa?: number
  colorSombraCapa?: string
  /** No se ve (ni en el monitor ni en el MP4), sin borrarla. */
  oculto?: boolean
  /** No se mueve ni se cambia en la línea de tiempo ni en el monitor (se puede elegir y desbloquear). */
  bloqueado?: boolean
  /** Si es un video: el segundo del medio desde donde se ve. */
  desde?: number
  /** Giro al empezar, en grados (positivo = a favor del reloj). */
  giro?: number
  /** Si se mueve: dónde, de qué tamaño y con qué giro termina (si no, se queda quieta). */
  fin?: FinCapa
  /**
   * Una imagen recortada animada (respira, se balancea, ondea, flota, humo): `fuente` es su animación en
   * bucle (un WebM con transparencia) y `base` la imagen de la que sale, para cambiarla o volver a ella.
   */
  animada?: { tipo: TipoAnimar; base: FuenteId; escala?: number }
  /** Si es una pieza animada (HyperFrames): cuál y con qué datos, para cambiarlos y volver a animarla. */
  pieza?: { id: string; valores: Record<string, string | number | boolean> }
  /**
   * Un gráfico editable (una tarjeta, un rótulo con su caja, un botón): su diseño. `fuente` es su dibujo (un PNG que
   * hace Recorte con Chromium); al cambiar el diseño se vuelve a dibujar. Ver src/shared/grafico.ts.
   */
  grafico?: Grafico
  /**
   * La persona de un clip, separada de su fondo (un WebM con transparencia del clip tal como se ve): va encima del
   * mismo clip, así lo que quede entre los dos (títulos, logos, textos «detrás») se ve detrás de la persona.
   */
  persona?: { clip: string }
  /** El clip tal como se ve pero SIN un objeto (un logo, una marca de agua): va encima del mismo clip. Dónde estaba: la caja, en fracciones. */
  borrado?: { clip: string }
  /** El clip tal como se ve pero con OTRO cielo: va encima del mismo clip. */
  cielo?: { clip: string }
  /** Un objeto del clip recortado (rotoscopia por clic) con transparencia, encima del mismo clip. `clave` = dónde estaba al empezar. */
  roto?: { clip: string; clave?: string }
  /**
   * Escena 2.5D: a qué distancia está la capa, 0 (pegada al fondo: se mueve con él) a 1 (muy cerca de la
   * cámara: se mueve y crece 2,5 veces más que el fondo). Sin ella, la capa no sigue a la cámara.
   */
  profundidad?: number
  /** Desenfoque (como lo que está fuera de foco, muy cerca o muy lejos), 0 a 1; 0 nítida. */
  desenfoque?: number
  /** Fotogramas clave: el valor de x, y, ancho, giro u opacidad en ciertos segundos desde que aparece la capa. Mandan sobre `fin`. */
  claves?: ClavesCapa
  /** En qué pista de «Encima» va, 1 a 3 (sin ella, la 1). Las de una pista más alta tapan a las de las de abajo. */
  pista?: number
  /** Cómo se mezcla con lo de debajo (como los modos de fusión de Premiere); sin él, normal. */
  fusion?: ModoFusion
  /**
   * Sigue algo que se mueve en el video (una cara, un coche): su camino en cada segundo desde que aparece la capa (lo
   * calcula el seguidor) más la distancia a la que va la capa de ese algo. Manda sobre x, y, `fin` y sus claves de x e y.
   */
  sigue?: { puntos: PuntoRecorrido[]; dx: number; dy: number }
  /**
   * Lo que se recorta de cada lado del medio, en fracción de su ancho (izq, der) o de su alto (arriba, abajo). La capa
   * mide y se coloca como el medio entero (`ancho`, `x`, `y` son los suyos); lo recortado no se ve.
   */
  recorte?: RecorteCapa
  /** Volteada de izquierda a derecha (espejo). */
  voltearH?: boolean
  /** Volteada de arriba abajo. */
  voltearV?: boolean
}

export interface RecorteCapa {
  izq: number
  der: number
  arriba: number
  abajo: number
}
/** Lo que queda como mínimo de una capa recortada (en cada dirección). */
export const MINIMO_RECORTE = 0.05

/** Las esquinas, el borde y la sombra de una capa, limpios (lo que está en 0 no se guarda). */
export function normalizarMarco(c: Partial<CapaTL>): Pick<CapaTL, 'redondeo' | 'borde' | 'colorBorde' | 'sombraCapa' | 'colorSombraCapa'> {
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0.004 ? Math.round(pinza(v, 0, max) * 1000) / 1000 : undefined)
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined)
  const redondeo = n(c.redondeo, 1)
  const borde = n(c.borde, LIMITE_BORDE_CAPA)
  const sombra = n(c.sombraCapa, 1)
  return {
    ...(redondeo ? { redondeo } : {}),
    ...(borde ? { borde, ...(hex(c.colorBorde) && hex(c.colorBorde) !== '#ffffff' ? { colorBorde: hex(c.colorBorde) } : {}) } : {}),
    ...(sombra ? { sombraCapa: sombra, ...(hex(c.colorSombraCapa) && hex(c.colorSombraCapa) !== '#000000' ? { colorSombraCapa: hex(c.colorSombraCapa) } : {}) } : {})
  }
}
/** Lo más grueso que puede ser el borde de una capa (en fracción de su ancho visible). */
export const LIMITE_BORDE_CAPA = 0.2
/** La sombra de una capa, con fuerza 1: cuánto se corre (abajo a la derecha), cuánto se difumina (sigma) y su opacidad. */
export const SOMBRA_CAPA = { corre: 0.04, difumina: 0.05, opacidad: 0.6 }

/**
 * El marco de una capa en píxeles de lo que se ve (`ancho` × `alto`, ya recortado): el radio de las esquinas, el grosor
 * del borde y la sombra. Lo mismo usan el monitor (CSS) y el MP4 (FFmpeg).
 */
export function marcoCapa(c: Pick<CapaTL, 'redondeo' | 'borde' | 'sombraCapa'>, ancho: number, alto: number): { radio: number; borde: number; corre: number; sigma: number } {
  return {
    radio: (c.redondeo ?? 0) * Math.min(ancho, alto) / 2,
    borde: (c.borde ?? 0) * ancho,
    corre: (c.sombraCapa ?? 0) * SOMBRA_CAPA.corre * ancho,
    sigma: (c.sombraCapa ?? 0) * SOMBRA_CAPA.difumina * ancho
  }
}

/** El recorte válido de una capa (cada lado 0 a 0,95, dejando al menos el 5 %); sin nada recortado, undefined. */
export function normalizarRecorte(entrada: unknown): RecorteCapa | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const e = entrada as Partial<Record<keyof RecorteCapa, unknown>>
  const v = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? pinza(x, 0, 1 - MINIMO_RECORTE) : 0)
  let izq = v(e.izq)
  let der = v(e.der)
  let arriba = v(e.arriba)
  let abajo = v(e.abajo)
  if (izq + der > 1 - MINIMO_RECORTE) der = Math.max(0, 1 - MINIMO_RECORTE - izq)
  if (arriba + abajo > 1 - MINIMO_RECORTE) abajo = Math.max(0, 1 - MINIMO_RECORTE - arriba)
  const r = (x: number) => Math.round(x * 1000) / 1000
  ;[izq, der, arriba, abajo] = [izq, der, arriba, abajo].map(r)
  return izq + der + arriba + abajo > 0.0005 ? { izq, der, arriba, abajo } : undefined
}

/** Los modos de fusión de una capa: el nombre en el monitor (CSS) y en el MP4 (blend de FFmpeg). */
export type ModoFusion = 'multiplicar' | 'pantalla' | 'superponer' | 'aclarar' | 'oscurecer' | 'diferencia' | 'sumar'
export const MODOS_FUSION: { id: ModoFusion; nombre: string; para: string; css: string; ffmpeg: string }[] = [
  { id: 'multiplicar', nombre: 'Multiplicar', para: 'oscurece: lo blanco desaparece (una textura de papel, una sombra)', css: 'multiply', ffmpeg: 'multiply' },
  { id: 'pantalla', nombre: 'Trama', para: 'aclara: lo negro desaparece (luz, fuego, destellos, polvo sobre negro)', css: 'screen', ffmpeg: 'screen' },
  { id: 'superponer', nombre: 'Superponer', para: 'más contraste: una textura que se funde con la imagen', css: 'overlay', ffmpeg: 'overlay' },
  { id: 'aclarar', nombre: 'Aclarar', para: 'se queda lo más claro de las dos', css: 'lighten', ffmpeg: 'lighten' },
  { id: 'oscurecer', nombre: 'Oscurecer', para: 'se queda lo más oscuro de las dos', css: 'darken', ffmpeg: 'darken' },
  { id: 'diferencia', nombre: 'Diferencia', para: 'invierte donde hay luz: un efecto llamativo', css: 'difference', ffmpeg: 'difference' },
  { id: 'sumar', nombre: 'Sumar', para: 'suma la luz: brillos muy intensos', css: 'plus-lighter', ffmpeg: 'addition' }
]

/** El punto de un camino en el segundo `t` (recto entre dos puntos; quieto antes del primero y después del último). */
export function puntoEn(puntos: PuntoRecorrido[], t: number): { x: number; y: number } {
  if (t <= puntos[0].f) return puntos[0]
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i]
    const b = puntos[i + 1]
    if (t < b.f) {
      const k = (t - a.f) / Math.max(1e-6, b.f - a.f)
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
    }
  }
  return puntos[puntos.length - 1]
}

/** Lo más que se guarda del camino que sigue una capa (unos 6 por segundo bastan: es recto entre puntos). */
export const MAX_PUNTOS_SIGUE = 240

/**
 * Pone una capa a seguir un camino del video: `recorrido` en segundos de la FUENTE del clip de debajo (el del
 * seguidor), que se pasa a segundos de la capa. La capa conserva la distancia que tenía al objeto en el cabezal.
 */
export function seguirConCapa(
  tl: Timeline,
  id: string,
  recorrido: PuntoRecorrido[],
  clip: { entrada: number; inicio: number; velocidad?: number },
  enCapa: number,
  medios: Record<string, number>
): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c || !recorrido.length) return tl
  const vel = clip.velocidad ?? 1
  // Segundo de la timeline de cada punto → segundo de la capa.
  const crudos = recorrido
    .map((p) => ({ f: clip.inicio + (p.f - clip.entrada) / vel - c.inicio, x: p.x, y: p.y }))
    .filter((p) => p.f >= -0.2 && p.f <= c.duracion + 0.2)
    .sort((a, b) => a.f - b.f)
  if (!crudos.length) return tl
  // Uno cada ~0,16 s (y siempre el primero y el último).
  const paso = Math.max(1, Math.ceil(crudos.length / MAX_PUNTOS_SIGUE), Math.round(crudos.length / Math.max(1, c.duracion * 6)))
  const puntos = crudos.filter((_, i) => i % paso === 0 || i === crudos.length - 1).map((p) => ({ f: Math.round(p.f * 1000) / 1000, x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 }))
  const donde = estadoCapa({ ...c, sigue: undefined }, enCapa, false)
  const objeto = puntoEn(puntos, enCapa)
  return cambiarCapa(tl, id, { sigue: { puntos, dx: Math.round((donde.x - objeto.x) * 10000) / 10000, dy: Math.round((donde.y - objeto.y) * 10000) / 10000 } }, medios)
}

function normalizarSigue(entrada: unknown): CapaTL['sigue'] | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const e = entrada as { puntos?: unknown; dx?: unknown; dy?: unknown }
  if (!Array.isArray(e.puntos)) return undefined
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const puntos = (e.puntos as Partial<PuntoRecorrido>[])
    .filter((p) => p && ok(p.f) && ok(p.x) && ok(p.y))
    .map((p) => ({ f: p.f!, x: pinza(p.x!, -0.5, 1.5), y: pinza(p.y!, -0.5, 1.5) }))
    .sort((a, b) => a.f - b.f)
    .slice(0, MAX_PUNTOS_SIGUE)
  if (!puntos.length) return undefined
  return { puntos, dx: ok(e.dx) ? pinza(e.dx, -2, 2) : 0, dy: ok(e.dy) ? pinza(e.dy, -2, 2) : 0 }
}

/** La timeline sin las capas y los textos ocultos (lo que se ve y se exporta). */
export function sinOcultos(tl: Timeline): Timeline {
  if (!tl.textos.some((x) => x.oculto) && !tl.capas?.some((x) => x.oculto)) return tl
  const capas = (tl.capas ?? []).filter((x) => !x.oculto)
  const { capas: _c, ...resto } = tl
  return { ...resto, textos: tl.textos.filter((x) => !x.oculto), ...(capas.length ? { capas } : {}) }
}

/** Cuántas pistas de video hay encima de la principal. */
export const PISTAS_ENCIMA = 3
export const pistaDeCapa = (c: Pick<CapaTL, 'pista'>): number => c.pista ?? 1
/** Las capas en el orden en que se pintan: primero las de la pista 1 y encima las de las pistas más altas. */
export function capasEnOrden<T extends Pick<CapaTL, 'pista' | 'orden'>>(capas: T[]): T[] {
  return capas
    .map((c, i) => ({ c, i }))
    .sort((a, b) => pistaDeCapa(a.c) - pistaDeCapa(b.c) || (a.c.orden ?? 0) - (b.c.orden ?? 0) || a.i - b.i)
    .map((x) => x.c)
}

/**
 * Trae una capa al frente o la envía atrás dentro de su pista (como en Premiere o Canva): «frente» la pone encima de
 * todas las de su pista, «atras» debajo, y «subir»/«bajar» la pasan por encima (o por debajo) de la siguiente que se
 * cruza con ella en el tiempo.
 */
export function ordenarCapa(tl: Timeline, id: string, como: 'frente' | 'atras' | 'subir' | 'bajar', medios: Record<string, number>): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c) return tl
  const cruzan = (x: CapaTL) => x.id !== id && pistaDeCapa(x) === pistaDeCapa(c) && x.inicio < c.inicio + c.duracion && c.inicio < x.inicio + x.duracion
  const pila = capasEnOrden((tl.capas ?? []).filter((x) => x.id === id || cruzan(x)))
  const k = pila.findIndex((x) => x.id === id)
  const destino = como === 'frente' ? pila.length - 1 : como === 'atras' ? 0 : como === 'subir' ? Math.min(pila.length - 1, k + 1) : Math.max(0, k - 1)
  if (destino === k) return tl
  // La pila con la capa en su sitio nuevo, y cada una con su orden (0, 1, 2…).
  const nueva = pila.filter((x) => x.id !== id)
  nueva.splice(destino, 0, c)
  const ordenes = new Map(nueva.map((x, i) => [x.id, i]))
  return { ...tl, capas: normalizarCapas(tl.capas!.map((x) => (ordenes.has(x.id) ? { ...x, orden: ordenes.get(x.id)! } : x)), duracionTimeline(tl), medios) }
}

/** Lo que se copia del estilo de una capa (no su sitio ni su tiempo): tamaño, giro, recorte, volteo, mezcla y animación. */
export const CAMPOS_ESTILO_CAPA = ['ancho', 'giro', 'recorte', 'voltearH', 'voltearV', 'fusion', 'desenfoque', 'entrada', 'salida', 'durEntrada', 'durSalida', 'redondeo', 'borde', 'colorBorde', 'sombraCapa', 'colorSombraCapa'] as const
export type EstiloCapa = Partial<Pick<CapaTL, (typeof CAMPOS_ESTILO_CAPA)[number]>>
export function estiloDeCapa(c: CapaTL): EstiloCapa {
  return Object.fromEntries(CAMPOS_ESTILO_CAPA.map((k) => [k, c[k]])) as EstiloCapa
}
/** Le pone a una capa el estilo de otra (lo que la otra no tiene, se le quita: queda igual). */
export function pegarEstiloCapa(tl: Timeline, id: string, estilo: EstiloCapa, medios: Record<string, number>): Timeline {
  return cambiarCapa(tl, id, { ...Object.fromEntries(CAMPOS_ESTILO_CAPA.map((k) => [k, undefined])), ...estilo }, medios)
}
/** Le pone a un texto el estilo de otro (su letra, colores, caja, contorno, animación…), sin tocar lo que dice ni dónde está. */
export function pegarEstiloTexto(tl: Timeline, id: string, estilo: Partial<TextoTL>): Timeline {
  const vacio = Object.fromEntries(CAMPOS_ESTILO_TEXTO.filter((k) => k !== 'giro' && k !== 'alineacion').map((k) => [k, undefined]))
  const { giro: _g, alineacion: _a, ...resto } = estilo
  return cambiarTexto(tl, id, { ...vacio, ...resto })
}

/** Duplica una capa: la copia va justo después (si cabe) o a la vez, encima de ella. */
export function duplicarCapa(tl: Timeline, id: string, medios: Record<string, number>): { timeline: Timeline; id: string } {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c) return { timeline: tl, id }
  const total = duracionTimeline(tl)
  const despues = c.inicio + c.duracion
  const nuevoIdCapa = nuevoId('capa')
  const { id: _id, persona: _p, borrado: _b, cielo: _c, roto: _r, ...resto } = c
  const copia: CapaTL = despues + DURACION_MINIMA <= total ? { ...resto, id: nuevoIdCapa, inicio: despues, duracion: Math.min(c.duracion, total - despues) } : { ...resto, id: nuevoIdCapa, orden: (c.orden ?? 0) + 1 }
  const capas = normalizarCapas([...(tl.capas ?? []), copia], total, medios)
  return capas.some((x) => x.id === nuevoIdCapa) ? { timeline: { ...tl, capas }, id: nuevoIdCapa } : { timeline: tl, id }
}

/** Duplica un texto: la copia va justo después (si cabe) o a la vez, un poco más abajo. */
export function duplicarTexto(tl: Timeline, id: string): { timeline: Timeline; id: string } {
  const t = tl.textos.find((x) => x.id === id)
  if (!t) return { timeline: tl, id }
  const total = duracionTimeline(tl)
  const despues = t.inicio + t.duracion
  const nuevoIdTexto = nuevoId('texto')
  const { id: _id, subtitulo: _s, ...resto } = t
  const cabe = despues + DURACION_MINIMA <= total
  const copia: TextoTL = cabe
    ? { ...resto, id: nuevoIdTexto, inicio: despues, duracion: Math.min(t.duracion, total - despues) }
    : { ...resto, id: nuevoIdTexto, x: typeof t.x === 'number' ? t.x : 0.5, y: Math.min(0.95, (typeof t.y === 'number' ? t.y : t.posicion === 'arriba' ? 0.12 : t.posicion === 'centro' ? 0.5 : 0.86) + 0.08) }
  return { timeline: { ...tl, textos: [...tl.textos, copia] }, id: nuevoIdTexto }
}

export type TipoAnimar =
  | 'respirar'
  | 'balanceo'
  | 'ondear'
  | 'flotar'
  | 'humo'
  | 'hablar'
  | 'asentir'
  | 'ladear'
  | 'peso'
  | 'saludar'
  | 'senalar'
  | 'explicar'
  | 'caminar'
  | 'correr'
  | 'saltar'
  | 'agacharse'
  | 'sentarse'
  | 'patear'
  | 'bailar'
/**
 * Cómo se puede animar una imagen recortada sin gastar créditos: deformándola (respira, ondea…) o, si es una
 * persona, como marioneta por huesos (`marioneta`: mueve la cabeza, los brazos, el peso del cuerpo).
 */
export const ANIMAR_CAPA: { id: TipoAnimar; nombre: string; para: string; marioneta?: boolean }[] = [
  { id: 'respirar', nombre: 'Respira', para: 'una persona quieta que respira' },
  { id: 'balanceo', nombre: 'Se balancea', para: 'una persona de pie que se mece' },
  { id: 'ondear', nombre: 'Ondea', para: 'una bandera o una tela al viento' },
  { id: 'flotar', nombre: 'Flota', para: 'algo que sube y baja despacio' },
  { id: 'humo', nombre: 'Humo', para: 'humo, nubes o fuego que se agitan' },
  { id: 'hablar', nombre: 'Marioneta: habla', para: 'una persona que cuenta algo: mueve la cabeza y las manos', marioneta: true },
  { id: 'asentir', nombre: 'Marioneta: asiente', para: 'una persona que dice que sí con la cabeza', marioneta: true },
  { id: 'ladear', nombre: 'Marioneta: ladea la cabeza', para: 'una persona que duda o escucha', marioneta: true },
  { id: 'peso', nombre: 'Marioneta: cambia el peso', para: 'una persona de pie que pasa el peso de un pie al otro', marioneta: true },
  { id: 'saludar', nombre: 'Marioneta: saluda', para: 'una persona que saluda con la mano (brazos separados del cuerpo)', marioneta: true },
  { id: 'senalar', nombre: 'Marioneta: señala', para: 'una persona que señala a un lado (brazos separados del cuerpo)', marioneta: true },
  { id: 'explicar', nombre: 'Marioneta: explica', para: 'una persona que abre los brazos al explicar (brazos separados)', marioneta: true },
  // Las del muñeco por piezas (rígidas, con bisagras): mueven también las piernas; los pies siguen en el suelo.
  { id: 'caminar', nombre: 'Muñeco: camina', para: 'un personaje de cuerpo entero que camina (de perfil se ve mejor)', marioneta: true },
  { id: 'correr', nombre: 'Muñeco: corre', para: 'un personaje de cuerpo entero que corre (de perfil se ve mejor)', marioneta: true },
  { id: 'saltar', nombre: 'Muñeco: salta', para: 'un personaje que se agacha y salta con los brazos arriba', marioneta: true },
  { id: 'agacharse', nombre: 'Muñeco: se agacha', para: 'un personaje que se agacha a mirar o a recoger algo', marioneta: true },
  { id: 'sentarse', nombre: 'Muñeco: se sienta', para: 'un personaje que se sienta (pon la silla o el banco en el decorado)', marioneta: true },
  { id: 'patear', nombre: 'Muñeco: patea', para: 'un personaje que da una patada (a un balón, a una puerta)', marioneta: true },
  { id: 'bailar', nombre: 'Muñeco: baila', para: 'un personaje que baila y celebra', marioneta: true }
]
/** La animación deja un margen del 8 % por lado: la capa animada mide esto más para que la imagen se vea igual. */
export const MARGEN_ANIMAR = 1.16
/** Cuánto más ancha que su imagen es una capa animada (la marioneta deja sitio a los brazos según el gesto). */
export function escalaAnimada(c: Pick<CapaTL, 'animada'>): number {
  return c.animada?.escala ?? MARGEN_ANIMAR
}

/**
 * Los filtros de todo el video, de 0 (nada) a 1 (fuerte): el aspecto de película o de imprenta
 * de los documentales. Se ven en el monitor y salen igual en el MP4.
 */
export interface FiltrosTL {
  /** Grano de película que se mueve. */
  grano?: number
  /** Motas de polvo y rayas que aparecen y desaparecen. */
  polvo?: number
  /** Trama de puntos de imprenta, como una revista. */
  trama?: number
  /** Bordes oscuros. */
  vineta?: number
  /** La luz que tiembla un poco, como un proyector. */
  parpadeo?: number
}

export const FILTROS: { id: keyof FiltrosTL; nombre: string; para: string }[] = [
  { id: 'grano', nombre: 'Grano', para: 'el grano de película' },
  { id: 'polvo', nombre: 'Polvo', para: 'motas y rayas de película vieja' },
  { id: 'trama', nombre: 'Trama', para: 'los puntos de imprenta de una revista' },
  { id: 'vineta', nombre: 'Viñeta', para: 'los bordes oscuros' },
  { id: 'parpadeo', nombre: 'Parpadeo', para: 'la luz que tiembla, como un proyector' }
]

/** Un efecto de sonido suelto en su segundo (su audio está en `media/`). */
export interface SonidoTL {
  id: string
  inicio: number
  duracion: number
  /** Ruta relativa dentro de la carpeta del proyecto (`media/…`). */
  archivo: string
  nombre: string
  /** 0 a 1.5; sin él, 0.6 (por debajo de la voz). */
  volumen?: number
  /** En qué pista de sonidos va (1 a PISTAS_SONIDOS, para encimar efectos); sin ella, la 1. */
  pista?: number
  /** Desde qué segundo del archivo suena (al recortarle el principio); sin él, desde 0. */
  desde?: number
  /** Lo que dura el archivo entero (hasta dónde se puede alargar al recortar). */
  largo?: number
  /** Si es el sonido separado de un clip de video: su id (para volver a unirlo). */
  deClip?: string
}

export const VOLUMEN_SONIDO = 0.6
/** Cuántas pistas de efectos de sonido puede haber (como las de audio de Premiere). */
export const PISTAS_SONIDOS = 3

export interface Timeline {
  version: 1
  clips: ClipTL[]
  textos: TextoTL[]
  musica?: MusicaTL
  /** La narración, frase a frase. */
  voces?: VozTL[]
  /** Lo que va encima del video (imágenes, logos, íconos, tomas de apoyo). */
  capas?: CapaTL[]
  /** Las letras propias del proyecto (las de una marca, las que trae el agente). */
  letras?: LetraTL[]
  /** Efectos de sonido sueltos. */
  sonidos?: SonidoTL[]
  /** Las pistas ocultas, silenciadas o bloqueadas. */
  pistas?: Partial<Record<PistaId, PistaTL>>
  /** Grano, polvo, trama, viñeta y parpadeo de todo el video. */
  filtros?: FiltrosTL
  /** Marcas en la regla para ubicarse (no salen en el video). */
  marcadores?: MarcadorTL[]
  /** Multicámara: las tomas de la misma escena, sincronizadas, para cortar entre ellas. */
  multicam?: MulticamTL
  /** Capas de ajuste: tramos que cambian el color o desenfocan todo lo de abajo (el video y las capas, no los textos). */
  ajustesCapa?: CapaAjusteTL[]
  /**
   * Los subtítulos animados con HyperFrames: los textos con `subtitulo` siguen siendo el guion (se corrigen a mano en
   * el editor) y una pieza de estilo «Subtítulos» los dibuja encima. `medio` es el último render y `huella` con qué
   * frases y valores se hizo: si cambian, hay que volver a animarlos (mientras, se ven como texto normal).
   */
  subtitulosHF?: SubtitulosHF
  /** La portada del video (como la de CapCut): la miniatura que se ve antes de darle a reproducir. */
  portada?: PortadaTL
}

/**
 * La portada: un momento del video o una foto de la biblioteca, con un título encima si se quiere. `archivo` es la
 * imagen ya compuesta (en la carpeta del proyecto), la que se pega al MP4 como miniatura.
 */
export interface PortadaTL {
  origen: 'cuadro' | 'imagen'
  /** El segundo de la timeline (con `origen: 'cuadro'`). */
  t?: number
  /** La foto de la biblioteca (con `origen: 'imagen'`). */
  fuente?: FuenteId
  /** Cómo se encuadra la foto: 0 a 1, de qué lado se recorta si no tiene la forma del video. */
  cx?: number
  cy?: number
  /** El título de la portada (vacío: sin título). */
  texto?: string
  /** Su letra (de FUENTES_TEXTO), su tamaño (fracción del alto) y sus colores. */
  letra?: string
  tamano?: number
  color?: string
  contorno?: string
  /** Su altura (0 arriba, 1 abajo). */
  y?: number
  /** La imagen ya compuesta, dentro de la carpeta del proyecto. */
  archivo?: string
  /**
   * También como primer cuadro del video: Instagram, TikTok y WhatsApp toman ese de miniatura. Dura un solo cuadro y
   * no cambia lo que dura el video.
   */
  alInicio?: boolean
}

export function normalizarPortada(entrada: unknown, esFuente: (f: string) => boolean): PortadaTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const x = entrada as Partial<PortadaTL>
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined)
  const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined)
  const origen = x.origen === 'imagen' && typeof x.fuente === 'string' && esFuente(x.fuente) ? 'imagen' : 'cuadro'
  const archivo = typeof x.archivo === 'string' && /^portada\/[\w.-]+\.png$/.test(x.archivo) ? x.archivo : undefined
  const texto = typeof x.texto === 'string' ? x.texto.slice(0, 200) : ''
  const salida: PortadaTL = { origen }
  if (origen === 'imagen') salida.fuente = x.fuente
  else salida.t = num(x.t, 0, 1e6) ?? 0
  for (const k of ['cx', 'cy', 'y'] as const) {
    const v = num(x[k], 0, 1)
    if (v !== undefined) salida[k] = v
  }
  if (texto.trim()) salida.texto = texto
  if (typeof x.letra === 'string' && FUENTES_TEXTO[x.letra]) salida.letra = x.letra
  const tam = num(x.tamano, 0.02, 0.4)
  if (tam !== undefined) salida.tamano = tam
  if (color(x.color)) salida.color = color(x.color)
  if (color(x.contorno)) salida.contorno = color(x.contorno)
  if (archivo) salida.archivo = archivo
  if (x.alInicio === true) salida.alInicio = true
  return salida
}

export function ponerPortada(tl: Timeline, portada: PortadaTL | null): Timeline {
  const { portada: _antes, ...resto } = tl
  return portada ? { ...resto, portada } : resto
}

export interface SubtitulosHF {
  /** La pieza de estilo (una de la categoría «Subtítulos»). */
  pieza: string
  valores: Record<string, string | number | boolean>
  medio?: FuenteId
  huella?: string
  /** Dónde empieza la capa del render (segundo de la timeline). */
  inicio?: number
  duracion?: number
}

/** Lo que puede hacer una capa de ajuste (los ajustes de color del clip, y desenfocar). */
export const AJUSTES_DE_CAPA = ['exposicion', 'contraste', 'altas', 'sombras', 'blancos', 'negros', 'saturacion', 'temperatura', 'tinte', 'brillo', 'desenfoque'] as const
export type AjusteDeCapa = (typeof AJUSTES_DE_CAPA)[number]

/** Una capa de ajuste (como la de Premiere): de `inicio` a `inicio + duracion`, sus ajustes valen para todo lo de abajo. */
export interface CapaAjusteTL {
  id: string
  inicio: number
  duracion: number
  ajustes: Partial<Record<AjusteDeCapa, number>>
}

export function normalizarAjustesCapa(entrada: unknown, total: number): CapaAjusteTL[] {
  const salida: CapaAjusteTL[] = []
  for (const x of Array.isArray(entrada) ? (entrada as Partial<CapaAjusteTL>[]) : []) {
    if (!x || typeof x.inicio !== 'number' || typeof x.duracion !== 'number') continue
    const inicio = pinza(x.inicio, 0, Math.max(0, total - DURACION_MINIMA))
    const duracion = pinza(x.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio))
    const todos = normalizarAjustes(x.ajustes) ?? {}
    const ajustes = Object.fromEntries(AJUSTES_DE_CAPA.filter((k) => todos[k] !== undefined).map((k) => [k, todos[k]!])) as CapaAjusteTL['ajustes']
    salida.push({ id: typeof x.id === 'string' && x.id ? x.id : nuevoId('ajuste'), inicio, duracion, ajustes })
  }
  return salida.sort((a, b) => a.inicio - b.inicio).slice(0, 50)
}

/** Añade una capa de ajuste en `inicio` (5 s, o lo que quede). */
export function anadirAjusteCapa(tl: Timeline, inicio: number, ajustes: CapaAjusteTL['ajustes'] = { saturacion: 0.6 }): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const id = nuevoId('ajuste')
  const lista = normalizarAjustesCapa([...(tl.ajustesCapa ?? []), { id, inicio, duracion: Math.min(5, Math.max(DURACION_MINIMA, total - inicio)), ajustes }], total)
  return { timeline: { ...tl, ajustesCapa: lista }, id }
}

export function cambiarAjusteCapa(tl: Timeline, id: string, cambio: Partial<Omit<CapaAjusteTL, 'id'>>): Timeline {
  if (!tl.ajustesCapa?.some((x) => x.id === id)) return tl
  return { ...tl, ajustesCapa: normalizarAjustesCapa(tl.ajustesCapa.map((x) => (x.id === id ? { ...x, ...cambio } : x)), duracionTimeline(tl)) }
}

export function borrarAjusteCapa(tl: Timeline, id: string): Timeline {
  const quedan = (tl.ajustesCapa ?? []).filter((x) => x.id !== id)
  const { ajustesCapa: _a, ...resto } = tl
  return quedan.length ? { ...resto, ajustesCapa: quedan } : resto
}

/** Los ajustes de una capa de ajuste como ajustes completos de clip (lo que no tiene, neutro). */
export function ajustesDeCapa(x: CapaAjusteTL): Required<AjustesClip> {
  return { ...ajustesDe(undefined), ...x.ajustes }
}

/**
 * Las tomas de una multicámara (hasta 9). `desfase`: dónde está en esa toma lo que en la primera pasa en el segundo 0
 * (el sonido que en la primera está en t, en esta está en t + desfase).
 */
export interface MulticamTL {
  angulos: { fuente: FuenteId; desfase: number; nombre?: string }[]
}
export const MAX_ANGULOS = 9

export function normalizarMulticam(entrada: unknown, existen: (fuente: string) => boolean): MulticamTL | undefined {
  const x = entrada as Partial<MulticamTL> | undefined
  if (!x || !Array.isArray(x.angulos)) return undefined
  const angulos = x.angulos
    .filter((a) => a && typeof a.fuente === 'string' && existen(a.fuente) && typeof a.desfase === 'number' && Number.isFinite(a.desfase))
    .map((a) => ({ fuente: a.fuente, desfase: Math.round(a.desfase * 1000) / 1000, ...(typeof a.nombre === 'string' && a.nombre ? { nombre: a.nombre.slice(0, 40) } : {}) }))
    .filter((a, i, todos) => todos.findIndex((b) => b.fuente === a.fuente) === i)
    .slice(0, MAX_ANGULOS)
  return angulos.length >= 2 ? { angulos } : undefined
}

/**
 * Cortar a otra toma en el segundo `t` (como apretar 1, 2, 3… en el monitor multicámara de Premiere): desde ahí, el
 * clip muestra la toma `n` en el mismo momento de la escena, hasta su final. Si `t` está en el principio del clip,
 * cambia el clip entero.
 */
export function cambiarAngulo(tl: Timeline, t: number, n: number, duracionDe: (fuente: FuenteId) => number): Timeline {
  const mc = tl.multicam
  const destino = mc?.angulos[n]
  const u = ubicar(tl, t)
  if (!mc || !destino || !u || u.clip.rampa) return tl
  const origen = mc.angulos.find((a) => a.fuente === u.clip.fuente)
  if (!origen || origen.fuente === destino.fuente) return tl
  const enEscena = u.tFuente - origen.desfase
  const alInicio = t - u.inicio < 1 / 30
  const base = alInicio ? tl : dividir(tl, t)
  const indice = alInicio ? u.indice : u.indice + 1
  const pieza = base.clips[indice]
  if (!pieza || (!alInicio && base === tl)) return tl
  const largoFuente = pieza.salida - pieza.entrada
  // El mismo momento de la escena en la otra toma: desde el principio del clip, o desde el cabezal.
  const desde = (alInicio ? u.clip.entrada : enEscena + origen.desfase) - origen.desfase + destino.desfase
  const tope = duracionDe(destino.fuente)
  const e = pinza(desde, 0, Math.max(0, tope - DURACION_MINIMA))
  const s = Math.min(tope, e + largoFuente)
  if (s - e < DURACION_MINIMA) return tl
  const clips = [...base.clips]
  clips[indice] = { ...pieza, fuente: destino.fuente, entrada: e, salida: s }
  return conClips(base, clips)
}

/** El número de toma (0, 1, 2…) que se ve en el segundo `t`, o -1. */
export function anguloEn(tl: Timeline, t: number): number {
  const u = ubicar(tl, t)
  return u && tl.multicam ? tl.multicam.angulos.findIndex((a) => a.fuente === u.clip.fuente) : -1
}

export const COLORES_MARCADOR = {
  verde: '#5fd38a',
  rojo: '#ff6b6b',
  azul: '#5aa9ff',
  amarillo: '#f2c14e',
  morado: '#b48cff'
} as const
export type ColorMarcador = keyof typeof COLORES_MARCADOR

/** Una marca en la regla, como en Premiere (M): un segundo de la timeline con su nombre y color. */
export interface MarcadorTL {
  id: string
  t: number
  nombre?: string
  color?: ColorMarcador
}

export function normalizarMarcadores(entrada: unknown, total: number): MarcadorTL[] {
  const salida: MarcadorTL[] = []
  for (const m of Array.isArray(entrada) ? entrada : []) {
    if (!m || typeof m.t !== 'number' || !Number.isFinite(m.t)) continue
    const t = Math.round(pinza(m.t, 0, Math.max(0, total)) * 1000) / 1000
    salida.push({
      id: typeof m.id === 'string' && m.id ? m.id : nuevoId('marca'),
      t,
      ...(typeof m.nombre === 'string' && m.nombre.trim() ? { nombre: m.nombre.trim().slice(0, 80) } : {}),
      ...(typeof m.color === 'string' && m.color in COLORES_MARCADOR && m.color !== 'verde' ? { color: m.color as ColorMarcador } : {})
    })
  }
  return salida.sort((a, b) => a.t - b.t).slice(0, 500)
}

/** Pone una marca en `t` (si ya hay una a menos de un cuadro, la devuelve sin poner otra). */
export function ponerMarcador(tl: Timeline, t: number): { timeline: Timeline; id: string } {
  const cerca = tl.marcadores?.find((m) => Math.abs(m.t - t) < 1 / 60)
  if (cerca) return { timeline: tl, id: cerca.id }
  const id = nuevoId('marca')
  const marcadores = normalizarMarcadores([...(tl.marcadores ?? []), { id, t }], duracionTimeline(tl))
  return { timeline: { ...tl, marcadores }, id }
}

export function cambiarMarcador(tl: Timeline, id: string, cambio: Partial<Omit<MarcadorTL, 'id'>>): Timeline {
  if (!tl.marcadores?.some((m) => m.id === id)) return tl
  const marcadores = normalizarMarcadores(
    tl.marcadores.map((m) => (m.id === id ? { ...m, ...cambio } : m)),
    duracionTimeline(tl)
  )
  return { ...tl, marcadores }
}

export function borrarMarcador(tl: Timeline, id: string): Timeline {
  if (!tl.marcadores?.some((m) => m.id === id)) return tl
  const { marcadores: _m, ...resto } = tl
  const quedan = tl.marcadores.filter((m) => m.id !== id)
  return quedan.length ? { ...resto, marcadores: quedan } : resto
}

/** Solo el tramo de `a` a `b` (para exportar entre la entrada y la salida): lo de antes y lo de después se quita. */
/**
 * Un rótulo que empezó `corte` segundos antes (lo que queda de él al cortarle el principio): las palabras ya dichas
 * quedan dichas y una entrada que ya pasó (letra a letra, pop, subir…) no se repite. Si no, al sacar un trozo de la
 * timeline (la vista previa, un cuadro, exportar entre la entrada y la salida) volvía a escribirse desde cero.
 */
export function textoYaEmpezado(r0: TextoTL, corte: number, original: TextoTL = r0): TextoTL {
  // Sus fotogramas clave siguen donde iban (se corren lo que se le cortó).
  const r: TextoTL =
    r0.claves && corte > 0
      ? { ...r0, claves: Object.fromEntries(Object.entries(r0.claves).map(([k, v]) => [k, (v ?? []).map((cl) => ({ ...cl, f: cl.f - corte }))])) as ClavesTexto }
      : r0
  if (!r.animacion || corte <= 0) return r
  if (porPalabras(r.animacion) || r.animacion === 'pintar') {
    return { ...r, tiempos: tiemposPalabras(original).map((w) => Math.round((w.inicio - corte) * 1000) / 1000) }
  }
  const entra = r.animacion === 'maquina' ? pasoAnimacion(r) * r.texto.replace(/\s/g, '').length + APARECER_S : 0.35
  if (corte < entra) return r
  const { animacion: _a, ...sin } = r
  return sin
}

export function soloTramo(tl: Timeline, a: number, b: number): Timeline {
  const total = duracionTimeline(tl)
  let r = tl
  if (b < total - DURACION_MINIMA) {
    // Lo que se acorta por el final no termina ahí: su salida (si tiene) sigue donde iba (`cola`).
    const fin = new Map<string, number>([...tl.textos, ...(tl.capas ?? [])].filter((x) => x.salida).map((x) => [x.id, x.inicio + finReal(x)]))
    const conCola = <T extends { id: string; inicio: number; duracion: number; cola?: number }>(x: T): T => {
      const f = fin.get(x.id)
      return f !== undefined && f - (x.inicio + x.duracion) > EPSILON ? { ...x, cola: f - (x.inicio + x.duracion) } : x
    }
    r = extraerRango(r, b, total)
    r = { ...r, textos: r.textos.map(conCola), ...(r.capas ? { capas: r.capas.map(conCola) } : {}) }
  }
  if (a > DURACION_MINIMA) r = extraerRango(r, 0, a)
  return r
}

/**
 * Extraer (como la tecla ' de Premiere): quita de la timeline todo lo que hay entre `a` y `b` y cierra el hueco.
 * El video se corta en los dos puntos; los textos y capas que cruzan el tramo se acortan, los audios sueltos
 * (frases y sonidos) que lo cruzan se quitan, y todo lo que viene después se corre hacia atrás.
 */
export function extraerRango(tl: Timeline, a: number, b: number): Timeline {
  const total = duracionTimeline(tl)
  a = pinza(Math.min(a, b), 0, total)
  b = pinza(Math.max(a, b), 0, total)
  const L = b - a
  if (L < DURACION_MINIMA) return tl
  const cortada = dividir(dividir(tl, b), a)
  const dentro = new Set(
    tramos(cortada)
      .filter((t) => t.inicio >= a - EPSILON && t.fin <= b + EPSILON)
      .map((t) => t.clip.id)
  )
  if (!dentro.size || dentro.size === cortada.clips.length) return tl
  type ConTramo = { inicio: number; duracion: number }
  const correr = <T extends ConTramo>(x: T, acortable: boolean, sinCabeza?: (r: T, corte: number, original: T) => T): T | null => {
    const i = x.inicio
    const f = x.inicio + x.duracion
    if (f <= a + EPSILON) return x
    if (i >= b - EPSILON) return { ...x, inicio: i - L }
    if (!acortable) return null
    const ni = Math.min(i, a)
    const nf = f > b ? f - L : a
    if (nf - ni < DURACION_MINIMA) return null
    const r = { ...x, inicio: ni, duracion: nf - ni }
    // Empezaba dentro de lo quitado: se le fue el principio, y lo que queda sigue mostrando lo que mostraba ahí.
    return sinCabeza && i >= a - EPSILON ? sinCabeza(r, b - i, x) : r
  }
  const lista = <T extends ConTramo>(xs: T[] | undefined, acortable: boolean, sinCabeza?: (r: T, corte: number, original: T) => T): T[] =>
    (xs ?? []).map((x) => correr(x, acortable, sinCabeza)).filter((x): x is T => x !== null)
  // A una capa sin su principio: el medio se le corre (sigue en el mismo cuadro); su recorrido y sus fotogramas clave
  // siguen donde iban (el recorrido pasa a claves, que se pueden correr), y la entrada (pop, fundido, desde un lado) ya
  // pasó: no se repite.
  const capaSinCabeza = (r: CapaTL, corte: number, original: CapaTL): CapaTL => {
    const { entrada: _e, fin, ...c } = r
    const claves: ClavesCapa = { ...(c.claves ?? {}) }
    if (fin) {
      const D = original.duracion
      const desdeA = { x: c.x, y: c.y, ancho: c.ancho, giro: c.giro ?? 0 }
      for (const k of ['x', 'y', 'ancho', 'giro'] as const) {
        if (!claves[k]) claves[k] = [{ f: 0, v: desdeA[k] }, { f: D, v: fin[k] }]
      }
    }
    const corridas = Object.fromEntries(Object.entries(claves).map(([k, v]) => [k, (v ?? []).map((cl) => ({ ...cl, f: cl.f - corte }))])) as ClavesCapa
    return { ...c, desde: (c.desde ?? 0) + corte, ...(Object.keys(corridas).length ? { claves: corridas } : {}) }
  }
  // A un texto sin su principio: las palabras ya dichas quedan dichas (como al dividirlo) y una entrada que ya pasó no se
  // repite.
  const textoSinCabeza = (r: TextoTL, corte: number, original: TextoTL): TextoTL => textoYaEmpezado(r, corte, original)
  // Las marcas de dentro se van; las de después se corren. Dos que quedan en el mismo punto (la de la entrada y la de
  // la salida) se juntan en una.
  const marcadores = (tl.marcadores ?? [])
    .filter((m) => m.t <= a + EPSILON || m.t >= b - EPSILON)
    .map((m) => (m.t >= b - EPSILON ? { ...m, t: m.t - L } : m))
    .filter((m, i, todas) => !todas.slice(0, i).some((o) => Math.abs(o.t - m.t) < 1 / 60))
  const { voces: _v, capas: _c, sonidos: _s, marcadores: _m, ...resto } = cortada
  const voces = lista(cortada.voces, false)
  const capas = lista(cortada.capas, true, capaSinCabeza)
  const sonidos = lista(cortada.sonidos, false)
  // La música cortada en trozos: los trozos se corren como los clips; uno que pierde su principio sigue donde iba.
  const musica = cortada.musica?.tramos
    ? { ...cortada.musica, tramos: lista(cortada.musica.tramos, true, (r, corte) => ({ ...r, desde: (r.desde ?? 0) + corte })) }
    : cortada.musica
  return conClips(
    {
      ...resto,
      ...(musica ? { musica } : {}),
      textos: lista(cortada.textos, true, textoSinCabeza),
      ...(voces.length ? { voces } : {}),
      ...(capas.length ? { capas } : {}),
      ...(sonidos.length ? { sonidos } : {}),
      ...(marcadores.length ? { marcadores } : {})
    },
    cortada.clips.filter((c) => !dentro.has(c.id))
  )
}

/** Un clip con su lugar en la timeline ya calculado. */
export interface Tramo {
  clip: ClipTL
  indice: number
  inicio: number
  fin: number
}

/** Duración mínima de un clip o un texto, en segundos. */
export const DURACION_MINIMA = 0.1
const EPSILON = 1e-4

export function nuevoId(prefijo: string): string {
  return `${prefijo}-${globalThis.crypto.randomUUID().slice(0, 8)}`
}

function pinza(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor))
}

/** Lo que dura un clip en la timeline: su tramo de la fuente, a su velocidad. */
const largo = (c: ClipTL): number => largoClip(c)

/** Los límites de la velocidad de un clip (cámara lenta a cámara rápida). */
export const LIMITES_VELOCIDAD = [0.25, 4] as const
export const velocidadDe = (c: Pick<ClipTL, 'velocidad'>): number => c.velocidad ?? 1

// ===== Rampas de velocidad =====

export const LIMITES_RAMPA = [0.1, 4] as const
/** Un tramo de la rampa: de f0 a f1 (segundos de la fuente) a velocidad v; empieza en t0 del clip. */
export interface TramoVelocidad {
  f0: number
  f1: number
  v: number
  t0: number
}
const cacheRampa = new WeakMap<object, TramoVelocidad[]>()

/**
 * La rampa en tramos cortos de velocidad constante (hasta 80): con ellos salen la duración, el cuadro de la fuente de
 * cada momento y las expresiones de FFmpeg, siempre iguales. null si el clip no tiene rampa.
 */
export function tramosVelocidad(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa'>): TramoVelocidad[] | null {
  if (!c.rampa?.length) return null
  const hecho = cacheRampa.get(c)
  if (hecho) return hecho
  const span = Math.max(DURACION_MINIMA, c.salida - c.entrada)
  const paso = Math.max(0.04, span / 80)
  const tramos: TramoVelocidad[] = []
  let t = 0
  for (let f = c.entrada; f < c.salida - 1e-6; f += paso) {
    const f1 = Math.min(c.salida, f + paso)
    const v = pinza(valorClave(c.rampa, (f + f1) / 2), LIMITES_RAMPA[0], LIMITES_RAMPA[1])
    tramos.push({ f0: f, f1, v, t0: t })
    t += (f1 - f) / v
  }
  cacheRampa.set(c, tramos)
  return tramos
}

/** Lo que dura un clip en la timeline (con su velocidad o su rampa). */
export function largoClip(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa' | 'velocidad'>): number {
  const r = tramosVelocidad(c)
  if (!r) return (c.salida - c.entrada) / velocidadDe(c)
  const u = r[r.length - 1]
  return u.t0 + (u.f1 - u.f0) / u.v
}

/** El segundo de la fuente que se ve `dt` segundos después de que empieza el clip. */
export function fuenteEnClip(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa' | 'velocidad'>, dt: number): number {
  const r = tramosVelocidad(c)
  if (!r) return c.entrada + dt * velocidadDe(c)
  let k = r.length - 1
  while (k > 0 && r[k].t0 > dt) k--
  return Math.min(c.salida, r[k].f0 + Math.max(0, dt - r[k].t0) * r[k].v)
}

/** Cuántos segundos después de empezar el clip se ve el segundo `f` de su fuente. */
export function clipEnFuente(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa' | 'velocidad'>, f: number): number {
  const r = tramosVelocidad(c)
  if (!r) return (f - c.entrada) / velocidadDe(c)
  let k = r.length - 1
  while (k > 0 && r[k].f0 > f) k--
  return r[k].t0 + Math.max(0, f - r[k].f0) / r[k].v
}

/** La velocidad del clip en el segundo `f` de su fuente. */
export function velocidadEnFuente(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa' | 'velocidad'>, f: number): number {
  return c.rampa?.length ? pinza(valorClave(c.rampa, f), LIMITES_RAMPA[0], LIMITES_RAMPA[1]) : velocidadDe(c)
}

/**
 * Para FFmpeg: el segundo de la fuente según el segundo del clip (`T`, una expresión), o al revés con `inversa`
 * (el segundo del clip según el segundo de la fuente contado desde la entrada, para setpts).
 */
export function exprRampa(c: Pick<ClipTL, 'entrada' | 'salida' | 'rampa'>, T: string, inversa = false): string {
  const r = tramosVelocidad(c)!
  const n = (x: number) => (Math.round(x * 100000) / 100000).toString()
  let e = ''
  for (let k = r.length - 1; k >= 0; k--) {
    const x = r[k]
    const valor = inversa ? `(${n(x.t0)}+(${T}-${n(x.f0 - c.entrada)})/${n(x.v)})` : `(${n(x.f0)}+(${T}-${n(x.t0)})*${n(x.v)})`
    e = k === r.length - 1 ? valor : `if(lt(${T},${n(inversa ? r[k + 1].f0 - c.entrada : r[k + 1].t0)}),${valor},${e})`
  }
  return e
}

/** Las claves de una rampa válidas (velocidad de 0.1 a 4, una por cuadro). */
export function normalizarRampa(entrada: unknown): ClaveTL[] | undefined {
  if (!Array.isArray(entrada)) return undefined
  const puntos: ClaveTL[] = []
  for (const x of [...entrada].sort((a, b) => (a?.f ?? 0) - (b?.f ?? 0))) {
    if (!x || typeof x.f !== 'number' || typeof x.v !== 'number' || !Number.isFinite(x.f) || !Number.isFinite(x.v)) continue
    const p = { f: Math.round(Math.max(0, x.f) * 1000) / 1000, v: Math.round(pinza(x.v, LIMITES_RAMPA[0], LIMITES_RAMPA[1]) * 100) / 100 }
    if (puntos.length && p.f - puntos[puntos.length - 1].f < 0.034) puntos[puntos.length - 1] = p
    else puntos.push(p)
  }
  return puntos.length ? puntos.slice(0, 12) : undefined
}

/** Pone (o cambia) una clave de la rampa en el segundo `f` de la fuente. */
export function ponerClaveRampa(tl: Timeline, id: string, f: number, v: number): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    const lista = normalizarRampa([...(c.rampa ?? []).filter((x) => Math.abs(x.f - f) >= 0.034), { f, v }])
    return lista ? { ...c, rampa: lista } : c
  })
  return conClips(tl, clips)
}

/** Mueve en el tiempo una clave de la rampa de velocidad. */
export function moverClaveRampa(tl: Timeline, id: string, de: number, a: number): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id || !c.rampa) return c
    const lista = normalizarRampa(moverClaveEnLista(c.rampa, de, pinza(a, c.entrada, c.salida)))
    return lista ? { ...c, rampa: lista } : c
  })
  return conClips(tl, clips)
}

/** Quita una clave de la rampa (o toda la rampa, sin `f`): el clip vuelve a su velocidad fija. */
export function quitarClaveRampa(tl: Timeline, id: string, f?: number): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id || !c.rampa) return c
    const quedan = f === undefined ? [] : c.rampa.filter((x) => Math.abs(x.f - f) >= 0.034)
    const { rampa: _r, ...resto } = c
    return quedan.length ? { ...resto, rampa: quedan } : resto
  })
  return conClips(tl, clips)
}

/** Cambia la velocidad de un clip de video (1 = normal). Lo que viene después se corre. */
export function cambiarVelocidad(tl: Timeline, id: string, velocidad: number): Timeline {
  const v = Math.round(pinza(velocidad, LIMITES_VELOCIDAD[0], LIMITES_VELOCIDAD[1]) * 100) / 100
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    // Que no quede más corto que el mínimo en la timeline.
    const tope = Math.max(LIMITES_VELOCIDAD[0], (c.salida - c.entrada) / DURACION_MINIMA)
    const { velocidad: _antes, ...resto } = c
    const final = Math.min(v, tope)
    return Math.abs(final - 1) < 0.005 ? resto : { ...resto, velocidad: final }
  })
  return conClips(tl, clips)
}

// ===== Pistas: ocultar o silenciar, y bloquear =====

export type PistaId = 'ajuste' | 'encima' | 'video' | 'texto' | 'voz' | 'sonidos' | 'musica'
export interface PistaTL {
  /** No se ve (Encima, Texto) o no suena (Video, Voz, Sonidos, Música): ni en el monitor ni en el MP4. */
  oculta?: boolean
  /** No se puede tocar en la línea de tiempo. */
  bloqueada?: boolean
  /** El volumen de toda la pista (el fader del mezclador), 0 a 2; 1 sin cambio. Solo en las pistas de audio. */
  volumen?: number
  /**
   * Escuchar solo esta pista de audio (la «S» de los editores): las demás se callan en el editor mientras se
   * escucha. Es para revisar: el MP4 lo suena todo igual.
   */
  solo?: boolean
}

/** Hasta dónde sube el fader de una pista (200 %, +6 dB). */
export const MAX_VOLUMEN_PISTA = 2
export const PISTAS: { id: PistaId; nombre: string; audio: boolean }[] = [
  { id: 'ajuste', nombre: 'Ajuste', audio: false },
  { id: 'encima', nombre: 'Encima', audio: false },
  { id: 'video', nombre: 'Video', audio: true },
  { id: 'texto', nombre: 'Texto', audio: false },
  { id: 'voz', nombre: 'Voz', audio: true },
  { id: 'sonidos', nombre: 'Sonidos', audio: true },
  { id: 'musica', nombre: 'Música', audio: true }
]

function normalizarPistas(entrada: unknown): Timeline['pistas'] | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const pistas: NonNullable<Timeline['pistas']> = {}
  for (const p of PISTAS) {
    const x = (entrada as Record<string, PistaTL | undefined>)[p.id]
    const volumen =
      p.audio && typeof x?.volumen === 'number' && Number.isFinite(x.volumen) ? Math.round(pinza(x.volumen, 0, MAX_VOLUMEN_PISTA) * 100) / 100 : 1
    const solo = p.audio && x?.solo === true
    if (x?.oculta === true || x?.bloqueada === true || solo || Math.abs(volumen - 1) > 1e-3)
      pistas[p.id] = {
        ...(x?.oculta === true ? { oculta: true } : {}),
        ...(x?.bloqueada === true ? { bloqueada: true } : {}),
        ...(solo ? { solo: true } : {}),
        ...(Math.abs(volumen - 1) > 1e-3 ? { volumen } : {})
      }
  }
  return Object.keys(pistas).length ? pistas : undefined
}

export function cambiarPista(tl: Timeline, id: PistaId, cambio: PistaTL): Timeline {
  const pistas = normalizarPistas({ ...(tl.pistas ?? {}), [id]: { ...(tl.pistas?.[id] ?? {}), ...cambio } })
  const { pistas: _antes, ...resto } = tl
  return pistas ? { ...resto, pistas } : resto
}

/**
 * La timeline tal como se ve y suena: sin lo de las pistas ocultas o silenciadas. Es la que usan el monitor y el
 * MP4; la que se edita conserva todo. Los clips no cambian de sitio (la pista de video solo pierde su sonido).
 */
export function timelineActiva(entrada: Timeline, opciones: { conSolo?: boolean } = {}): Timeline {
  const tl = sinOcultos(conSubtitulosAnimados(entrada))
  // Con alguna pista en «solo» (solo en el editor), las demás pistas de audio se callan.
  const enSolo = opciones.conSolo && PISTAS.some((x) => x.audio && tl.pistas?.[x.id]?.solo)
  const p = enSolo
    ? (Object.fromEntries(
        PISTAS.map((x) => [x.id, x.audio && !tl.pistas?.[x.id]?.solo ? { ...(tl.pistas?.[x.id] ?? {}), oculta: true } : tl.pistas?.[x.id]])
      ) as NonNullable<Timeline['pistas']>)
    : tl.pistas
  if (!p || !PISTAS.some((x) => p[x.id]?.oculta || (p[x.id]?.volumen ?? 1) !== 1)) return tl
  const { capas, voces, sonidos, musica, ajustesCapa, ...resto } = tl
  // El fader de cada pista multiplica el volumen de todo lo suyo (así el monitor y el MP4 lo oyen igual).
  const fader = (id: PistaId) => p[id]?.volumen ?? 1
  const vVideo = fader('video')
  const vVoz = fader('voz')
  const vSonidos = fader('sonidos')
  const vMusica = fader('musica')
  const clips = p.video?.oculta
    ? tl.clips.map((c) => ({ ...c, mudo: true }))
    : vVideo !== 1
      ? tl.clips.map((c) => ({
          ...c,
          sonido: { ...(c.sonido ?? {}), volumen: (c.sonido?.volumen ?? 1) * vVideo },
          ...(c.clavesVolumen ? { clavesVolumen: c.clavesVolumen.map((x) => ({ ...x, v: x.v * vVideo })) } : {})
        }))
      : tl.clips
  return {
    ...resto,
    clips,
    textos: p.texto?.oculta ? [] : tl.textos,
    ...(capas && !p.encima?.oculta ? { capas } : {}),
    ...(ajustesCapa && !p.ajuste?.oculta ? { ajustesCapa } : {}),
    ...(voces && !p.voz?.oculta ? { voces: vVoz !== 1 ? voces.map((v) => ({ ...v, volumen: (v.volumen ?? 1) * vVoz })) : voces } : {}),
    ...(sonidos && !p.sonidos?.oculta
      ? { sonidos: vSonidos !== 1 ? sonidos.map((x) => ({ ...x, volumen: (x.volumen ?? VOLUMEN_SONIDO) * vSonidos })) : sonidos }
      : {}),
    ...(musica && !p.musica?.oculta ? { musica: vMusica !== 1 ? { ...musica, volumen: musica.volumen * vMusica } : musica } : {})
  }
}

// ===== Subtítulos animados (HyperFrames) =====

/** Una frase de subtítulo para la pieza de estilo: el texto (con *resaltadas*), cuándo está y cuándo se dice cada palabra. */
export interface FraseSubtitulo {
  /** El texto tal cual (las palabras entre asteriscos van resaltadas). */
  t: string
  /** Desde y hasta, en segundos desde que empieza la capa. */
  a: number
  b: number
  /** Las palabras (sin asteriscos), si va resaltada y cuándo empieza cada una (segundos desde que empieza la capa). */
  p: { w: string; k: boolean; a: number }[]
}

/** Los subtítulos de la timeline en orden, y el tramo que cubre la capa que los dibuja. */
export function frasesSubtitulos(tl: Timeline): { inicio: number; duracion: number; frases: FraseSubtitulo[] } {
  const subs = tl.textos.filter((t) => t.subtitulo && sinMarcas(t.texto).trim()).sort((a, b) => a.inicio - b.inicio)
  if (!subs.length) return { inicio: 0, duracion: 0, frases: [] }
  const inicio = Math.max(0, subs[0].inicio - 0.3)
  const fin = Math.max(...subs.map((t) => t.inicio + t.duracion))
  const r = (n: number) => Math.round(n * 1000) / 1000
  const frases = subs.map((t) => {
    const tiempos = tiemposPalabras(t)
    const palabras: { w: string; k: boolean }[] = []
    for (const parte of partesClave(t.texto)) for (const w of parte.texto.split(/\s+/).filter(Boolean)) palabras.push({ w, k: parte.clave })
    return {
      t: t.texto,
      a: r(t.inicio - inicio),
      b: r(t.inicio + t.duracion - inicio),
      p: palabras.map((x, k) => ({ ...x, a: r(t.inicio - inicio + (tiempos[k]?.inicio ?? 0)) }))
    }
  })
  return { inicio: r(inicio), duracion: r(fin - inicio + 0.4), frases }
}

/** Un resumen corto de un texto (para saber si algo cambió). */
export function huellaTexto(texto: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** Con qué se animan los subtítulos (la pieza, sus valores y las frases): si cambia, el render ya no vale. */
export function huellaSubtitulos(tl: Timeline): string {
  const s = tl.subtitulosHF
  if (!s) return ''
  const { inicio, duracion, frases } = frasesSubtitulos(tl)
  return huellaTexto(JSON.stringify({ pieza: s.pieza, valores: s.valores, inicio, duracion, frases }))
}

/** Si los subtítulos animados están puestos y al día con lo que dice el editor. */
export function subtitulosAlDia(tl: Timeline): boolean {
  const s = tl.subtitulosHF
  return !!(s && s.medio && s.huella && s.huella === huellaSubtitulos(tl))
}

/** El id de la capa que dibuja los subtítulos animados (no se edita: se rehace). */
export const CAPA_SUBTITULOS = 'subtitulos-animados'

/**
 * Con los subtítulos animados al día, los textos de subtítulo dejan su sitio a la capa del render (encima de todo).
 * Si no están al día, se ven como texto normal hasta que se vuelvan a animar.
 */
export function conSubtitulosAnimados(tl: Timeline): Timeline {
  const s = tl.subtitulosHF
  if (!s || !s.medio || !subtitulosAlDia(tl)) return tl
  const capa: CapaTL = {
    id: CAPA_SUBTITULOS,
    fuente: s.medio,
    inicio: s.inicio ?? 0,
    duracion: s.duracion ?? 1,
    x: 0.5,
    y: 0.5,
    ancho: 1,
    desde: 0,
    pista: PISTAS_ENCIMA
  }
  // Con la pista de textos oculta, tampoco se ven.
  const oculta = tl.pistas?.texto?.oculta
  return { ...tl, textos: tl.textos.filter((t) => !t.subtitulo), capas: oculta ? tl.capas : [...(tl.capas ?? []), capa] }
}

// ===== Crear =====

export function timelineVacia(): Timeline {
  return { version: 1, clips: [], textos: [] }
}

/** El punto de partida al abrir un video: todo el material en un solo clip. */
export function timelineInicial(duracionFuente: number): Timeline {
  if (!(duracionFuente > DURACION_MINIMA)) return timelineVacia()
  return {
    version: 1,
    clips: [{ id: nuevoId('clip'), fuente: FUENTE_PRINCIPAL, entrada: 0, salida: duracionFuente }],
    textos: []
  }
}

/** Una lista de cortes del material (la receta del agente, un momento) en clips. */
export function timelineDesdeCortes(cortes: { start: number; end: number }[], titulo?: string): Timeline {
  const clips = cortes
    .filter((c) => c.end - c.start >= DURACION_MINIMA)
    .map((c) => ({ id: nuevoId('clip'), fuente: FUENTE_PRINCIPAL, entrada: c.start, salida: c.end }))
  const tl: Timeline = { version: 1, clips, textos: [] }
  if (titulo && clips.length > 0) {
    tl.textos.push({
      id: nuevoId('texto'),
      inicio: 0,
      duracion: Math.min(3, duracionTimeline(tl)),
      texto: titulo,
      posicion: 'arriba'
    })
  }
  return tl
}

/** La receta del agente como timeline editable (la velocidad y el color aún no viajan). */
export function timelineDesdeReceta(receta: RecetaEdicion): Timeline {
  return timelineDesdeCortes(receta.cortes, receta.titulo)
}

/**
 * Valida una timeline que viene del disco o de un agente: tiempos dentro del material,
 * ids presentes, textos dentro de la duración. Lo inválido se descarta, no se adivina.
 */
export function normalizarTimeline(entrada: unknown, duracionFuente: number, otras: Record<string, number> = {}): Timeline {
  const crudo = (entrada ?? {}) as Partial<Timeline>
  const clips: ClipTL[] = []
  for (const c of Array.isArray(crudo.clips) ? crudo.clips : []) {
    if (!c || typeof c.entrada !== 'number' || typeof c.salida !== 'number') continue
    const fuente = typeof c.fuente === 'string' && c.fuente ? c.fuente : FUENTE_PRINCIPAL
    // Un clip de un medio que ya no está en el proyecto se descarta.
    const limite = fuente === FUENTE_PRINCIPAL ? duracionFuente : fuente === FUENTE_NEGRO ? MAX_IMAGEN : otras[fuente]
    if (limite === undefined) continue
    const e = pinza(c.entrada, 0, limite)
    const s = pinza(c.salida, 0, limite)
    if (s - e < DURACION_MINIMA) continue
    const ajustes = normalizarAjustes(c.ajustes)
    clips.push({
      id: typeof c.id === 'string' && c.id ? c.id : nuevoId('clip'),
      fuente,
      entrada: e,
      salida: s,
      ...(ajustes ? { ajustes } : {}),
      ...(c.mudo === true ? { mudo: true } : {}),
      ...(normalizarSonidoClip(c.sonido, (s - e) / (typeof c.velocidad === 'number' && c.velocidad > 0 ? c.velocidad : 1)) ? { sonido: normalizarSonidoClip(c.sonido, (s - e) / (typeof c.velocidad === 'number' && c.velocidad > 0 ? c.velocidad : 1)) } : {}),
      ...(normalizarClaves(c.claves) ? { claves: normalizarClaves(c.claves) } : {}),
      ...(normalizarCurvas(c.curvas) ? { curvas: normalizarCurvas(c.curvas) } : {}),
      ...(normalizarLut(c.lut) ? { lut: normalizarLut(c.lut) } : {}),
      ...(normalizarClavesVolumen(c.clavesVolumen) ? { clavesVolumen: normalizarClavesVolumen(c.clavesVolumen) } : {}),
      ...(normalizarRampa(c.rampa) ? { rampa: normalizarRampa(c.rampa) } : {}),
      // Los clips de dentro de un anidado se guardan tal cual (se validan al desanidar).
      ...(Array.isArray(c.anidado) && c.anidado.length ? { anidado: c.anidado.filter((x) => x && typeof x.entrada === 'number' && typeof x.salida === 'number').slice(0, 200) } : {}),
      ...(normalizarZonas(c.zonas) ? { zonas: normalizarZonas(c.zonas) } : {}),
      ...(typeof c.velocidad === 'number' && Number.isFinite(c.velocidad) && Math.abs(c.velocidad - 1) >= 0.005
        ? { velocidad: Math.round(pinza(c.velocidad, LIMITES_VELOCIDAD[0], LIMITES_VELOCIDAD[1]) * 100) / 100 }
        : {}),
      ...(typeof c.fundido === 'number' && c.fundido >= 0.05 ? { fundido: Math.round(pinza(c.fundido, 0.1, Math.min(MAX_FUNDIDO, (s - e) / 2)) * 100) / 100 } : {}),
      ...(typeof c.fundido === 'number' && c.fundido >= 0.05 && c.transicion && c.transicion !== 'fundido' && TRANSICIONES.some((x) => x.id === c.transicion)
        ? { transicion: c.transicion }
        : {})
    })
  }
  const total = clips.reduce((t, c) => t + largo(c), 0)
  const textos: TextoTL[] = []
  for (const t of Array.isArray(crudo.textos) ? crudo.textos : []) {
    if (!t || typeof t.inicio !== 'number' || typeof t.duracion !== 'number') continue
    const inicio = pinza(t.inicio, 0, Math.max(0, total - DURACION_MINIMA))
    const duracion = pinza(t.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio))
    textos.push({
      id: typeof t.id === 'string' && t.id ? t.id : nuevoId('texto'),
      inicio,
      duracion,
      texto: typeof t.texto === 'string' ? t.texto : '',
      posicion: t.posicion === 'arriba' || t.posicion === 'centro' ? t.posicion : 'abajo',
      ...(t.subtitulo === true ? { subtitulo: true } : {}),
      ...(t.detras === true ? { detras: true } : {}),
      ...(t.oculto === true ? { oculto: true } : {}),
      ...(t.bloqueado === true ? { bloqueado: true } : {}),
      ...(normalizarClavesTexto(t.claves, duracion) ? { claves: normalizarClavesTexto(t.claves, duracion) } : {}),
      ...estiloTexto(t),
      ...posicionLibre(t),
      ...(() => {
        const tiempos = normalizarTiempos(t.tiempos, typeof t.texto === 'string' ? t.texto : '', duracion)
        return tiempos ? { tiempos } : {}
      })()
    })
  }
  const musica = normalizarMusica(crudo.musica)
  const voces = normalizarVoces(crudo.voces, total)
  const capas = normalizarCapas(crudo.capas, total, { [FUENTE_PRINCIPAL]: duracionFuente, ...otras })
  const sonidos = normalizarSonidos(crudo.sonidos, total)
  const filtros = normalizarFiltros(crudo.filtros)
  return {
    version: 1,
    clips,
    textos,
    ...(musica ? { musica } : {}),
    ...(voces.length ? { voces } : {}),
    ...(capas.length ? { capas } : {}),
    ...(sonidos.length ? { sonidos } : {}),
    ...(filtros ? { filtros } : {}),
    ...(normalizarLetras(crudo.letras).length ? { letras: normalizarLetras(crudo.letras) } : {}),
    ...(normalizarPistas(crudo.pistas) ? { pistas: normalizarPistas(crudo.pistas) } : {}),
    ...(normalizarMarcadores(crudo.marcadores, total).length ? { marcadores: normalizarMarcadores(crudo.marcadores, total) } : {}),
    ...(normalizarAjustesCapa(crudo.ajustesCapa, total).length ? { ajustesCapa: normalizarAjustesCapa(crudo.ajustesCapa, total) } : {}),
    ...(normalizarMulticam(crudo.multicam, (f) => f === FUENTE_PRINCIPAL || otras[f] !== undefined)
      ? { multicam: normalizarMulticam(crudo.multicam, (f) => f === FUENTE_PRINCIPAL || otras[f] !== undefined) }
      : {}),
    ...(normalizarSubtitulosHF(crudo.subtitulosHF, otras) ? { subtitulosHF: normalizarSubtitulosHF(crudo.subtitulosHF, otras) } : {}),
    ...(normalizarPortada(crudo.portada, (f) => otras[f] !== undefined) ? { portada: normalizarPortada(crudo.portada, (f) => otras[f] !== undefined) } : {})
  }
}

function normalizarSubtitulosHF(entrada: unknown, otras: Record<string, number>): SubtitulosHF | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const x = entrada as Partial<SubtitulosHF>
  if (typeof x.pieza !== 'string' || !x.pieza) return undefined
  const valores: SubtitulosHF['valores'] = {}
  for (const [k, v] of Object.entries(x.valores && typeof x.valores === 'object' ? x.valores : {})) {
    if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) valores[k] = v
  }
  const conMedio = typeof x.medio === 'string' && otras[x.medio] !== undefined && typeof x.huella === 'string'
  return {
    pieza: x.pieza,
    valores,
    ...(conMedio
      ? {
          medio: x.medio,
          huella: x.huella,
          inicio: typeof x.inicio === 'number' && x.inicio >= 0 ? x.inicio : 0,
          duracion: typeof x.duracion === 'number' && x.duracion > 0 ? x.duracion : otras[x.medio as string]
        }
      : {})
  }
}

/** Los filtros válidos (0 a 1); lo que está en 0 no se guarda. Sin ninguno, undefined. */
export function normalizarFiltros(entrada: unknown): FiltrosTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const x = entrada as Record<string, unknown>
  const out: FiltrosTL = {}
  for (const { id } of FILTROS) {
    const v = x[id]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0.005) out[id] = Math.round(pinza(v, 0, 1) * 100) / 100
  }
  return Object.keys(out).length ? out : undefined
}

/** Cambia los filtros del video (un valor 0 quita ese filtro). */
export function cambiarFiltros(tl: Timeline, cambio: FiltrosTL): Timeline {
  const filtros = normalizarFiltros({ ...(tl.filtros ?? {}), ...cambio })
  const { filtros: _antes, ...resto } = tl
  return filtros ? { ...resto, filtros } : resto
}

/** La posición libre de un rótulo, si la tiene y es válida. */
function posicionLibre(t: Partial<TextoTL>): Pick<TextoTL, 'x' | 'y'> {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  return ok(t.x) && ok(t.y) ? { x: Math.round(pinza(t.x, 0, 1) * 1000) / 1000, y: Math.round(pinza(t.y, 0, 1) * 1000) / 1000 } : {}
}

/** Las capas válidas: de un medio que existe, dentro de la timeline y del cuadro. */
export function normalizarCapas(entrada: unknown, total: number, medios: Record<string, number>): CapaTL[] {
  const capas: CapaTL[] = []
  for (const c of Array.isArray(entrada) ? (entrada as Partial<CapaTL>[]) : []) {
    if (!c || typeof c.inicio !== 'number' || typeof c.duracion !== 'number' || typeof c.fuente !== 'string') continue
    if (medios[c.fuente] === undefined || c.inicio >= total - DURACION_MINIMA / 2) continue
    const inicio = pinza(c.inicio, 0, Math.max(0, total - DURACION_MINIMA))
    const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
    capas.push({
      id: typeof c.id === 'string' && c.id ? c.id : nuevoId('capa'),
      fuente: c.fuente,
      inicio,
      duracion: pinza(c.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio)),
      x: Math.round(pinza(num(c.x, 0.5), 0, 1) * 1000) / 1000,
      y: Math.round(pinza(num(c.y, 0.5), 0, 1) * 1000) / 1000,
      ancho: Math.round(pinza(num(c.ancho, 0.3), 0.05, 2) * 1000) / 1000,
      ...(c.entrada && ENTRADAS_CAPA.includes(c.entrada) ? { entrada: c.entrada } : {}),
      ...(c.salida && SALIDAS_CAPA.includes(c.salida) ? { salida: c.salida } : {}),
      ...(c.entrada && typeof c.durEntrada === 'number' && Number.isFinite(c.durEntrada) ? { durEntrada: Math.round(pinza(c.durEntrada, DURACIONES_ANIMACION[0], DURACIONES_ANIMACION[1]) * 100) / 100 } : {}),
      ...(c.salida && typeof c.durSalida === 'number' && Number.isFinite(c.durSalida) ? { durSalida: Math.round(pinza(c.durSalida, DURACIONES_ANIMACION[0], DURACIONES_ANIMACION[1]) * 100) / 100 } : {}),
      ...(typeof c.pista === 'number' && Math.round(c.pista) >= 2 ? { pista: Math.min(PISTAS_ENCIMA, Math.round(c.pista)) } : {}),
      ...(typeof c.desde === 'number' && c.desde > 0 ? { desde: Math.min(c.desde, Math.max(0, medios[c.fuente] - DURACION_MINIMA)) } : {}),
      ...(Math.abs(num(c.giro, 0)) > 0.05 ? { giro: Math.round(pinza(num(c.giro, 0), -720, 720) * 10) / 10 } : {}),
      ...(c.fin && typeof c.fin === 'object'
        ? {
            fin: {
              // Fuera del cuadro se puede (entrar o salir volando), hasta media pantalla.
              x: Math.round(pinza(num(c.fin.x, num(c.x, 0.5)), -0.5, 1.5) * 1000) / 1000,
              y: Math.round(pinza(num(c.fin.y, num(c.y, 0.5)), -0.5, 1.5) * 1000) / 1000,
              ancho: Math.round(pinza(num(c.fin.ancho, num(c.ancho, 0.3)), 0.05, 2) * 1000) / 1000,
              giro: Math.round(pinza(num(c.fin.giro, num(c.giro, 0)), -720, 720) * 10) / 10
            }
          }
        : {}),
      ...(c.animada && medios[c.animada.base] !== undefined && ANIMAR_CAPA.some((a) => a.id === c.animada!.tipo)
        ? {
            animada: {
              tipo: c.animada.tipo,
              base: c.animada.base,
              ...(typeof c.animada.escala === 'number' && c.animada.escala >= 1 && c.animada.escala <= 4 ? { escala: c.animada.escala } : {})
            }
          }
        : {}),
      ...(c.pieza && typeof c.pieza.id === 'string' && /^[\w-]{1,60}$/.test(c.pieza.id) && c.pieza.valores && typeof c.pieza.valores === 'object'
        ? {
            pieza: {
              id: c.pieza.id,
              valores: Object.fromEntries(
                Object.entries(c.pieza.valores)
                  .filter(([k, v]) => /^[\w-]{1,40}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
                  .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 500) : v])
              )
            }
          }
        : {}),
      ...(normalizarGrafico(c.grafico) ? { grafico: normalizarGrafico(c.grafico)! } : {}),
      ...(c.persona && typeof c.persona.clip === 'string' && c.persona.clip ? { persona: { clip: c.persona.clip.slice(0, 80) } } : {}),
      ...(c.borrado && typeof c.borrado.clip === 'string' && c.borrado.clip ? { borrado: { clip: c.borrado.clip.slice(0, 80) } } : {}),
      ...(c.cielo && typeof c.cielo.clip === 'string' && c.cielo.clip ? { cielo: { clip: c.cielo.clip.slice(0, 80) } } : {}),
      ...(c.roto && typeof c.roto.clip === 'string' && c.roto.clip ? { roto: { clip: c.roto.clip.slice(0, 80), ...(typeof c.roto.clave === 'string' && c.roto.clave ? { clave: c.roto.clave.slice(0, 40) } : {}) } } : {}),
      ...(typeof c.profundidad === 'number' && Number.isFinite(c.profundidad) ? { profundidad: Math.round(pinza(c.profundidad, 0, 1) * 100) / 100 } : {}),
      ...(num(c.desenfoque, 0) > 0.005 ? { desenfoque: Math.round(pinza(num(c.desenfoque, 0), 0, 1) * 100) / 100 } : {}),
      ...(c.fusion && MODOS_FUSION.some((m) => m.id === c.fusion) ? { fusion: c.fusion } : {}),
      ...(normalizarSigue(c.sigue) ? { sigue: normalizarSigue(c.sigue) } : {}),
      ...(normalizarRecorte(c.recorte) ? { recorte: normalizarRecorte(c.recorte) } : {}),
      ...(c.voltearH === true ? { voltearH: true } : {}),
      ...(c.voltearV === true ? { voltearV: true } : {}),
      ...(typeof c.orden === 'number' && Number.isFinite(c.orden) && Math.round(c.orden) !== 0 ? { orden: Math.max(-999, Math.min(999, Math.round(c.orden))) } : {}),
      ...(c.oculto === true ? { oculto: true } : {}),
      ...(c.bloqueado === true ? { bloqueado: true } : {}),
      ...normalizarMarco(c),
      ...(normalizarClavesCapa(c.claves, pinza(c.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio)))
        ? { claves: normalizarClavesCapa(c.claves, pinza(c.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - inicio))) }
        : {})
    })
  }
  return capas.sort((a, b) => a.inicio - b.inicio)
}

/** Los sonidos válidos: con su audio dentro de `media/` y que empiecen dentro de la timeline. */
export function normalizarSonidos(entrada: unknown, total: number): SonidoTL[] {
  const sonidos: SonidoTL[] = []
  for (const s of Array.isArray(entrada) ? (entrada as Partial<SonidoTL>[]) : []) {
    if (!s || typeof s.inicio !== 'number' || typeof s.duracion !== 'number' || typeof s.archivo !== 'string') continue
    if (!/^media\/[\w.-]+$/.test(s.archivo) || s.archivo.includes('..')) continue
    if (!(s.duracion > 0) || s.inicio >= total - DURACION_MINIMA / 2) continue
    sonidos.push({
      id: typeof s.id === 'string' && s.id ? s.id : nuevoId('sonido'),
      inicio: Math.max(0, s.inicio),
      duracion: s.duracion,
      archivo: s.archivo,
      nombre: typeof s.nombre === 'string' && s.nombre ? s.nombre.slice(0, 60) : 'Sonido',
      ...(typeof s.pista === 'number' && Math.round(s.pista) >= 2 ? { pista: Math.min(PISTAS_SONIDOS, Math.round(s.pista)) } : {}),
      ...(typeof s.desde === 'number' && s.desde > 0.001 ? { desde: Math.round(s.desde * 1000) / 1000 } : {}),
      ...(typeof s.largo === 'number' && s.largo > 0 ? { largo: Math.round(s.largo * 1000) / 1000 } : {}),
      ...(typeof s.deClip === 'string' && s.deClip ? { deClip: s.deClip } : {}),
      ...(typeof s.volumen === 'number' && Number.isFinite(s.volumen) && Math.abs(s.volumen - VOLUMEN_SONIDO) > 1e-3 ? { volumen: pinza(s.volumen, 0, 1.5) } : {})
    })
  }
  return sonidos.sort((a, b) => a.inicio - b.inicio)
}

/** Las frases de voz válidas: con su audio dentro de `media/` y que empiecen dentro de la timeline. */
export function normalizarVoces(entrada: unknown, total: number): VozTL[] {
  const voces: VozTL[] = []
  for (const v of Array.isArray(entrada) ? (entrada as Partial<VozTL>[]) : []) {
    if (!v || typeof v.inicio !== 'number' || typeof v.duracion !== 'number' || typeof v.archivo !== 'string') continue
    if (!/^media\/[\w.-]+$/.test(v.archivo) || v.archivo.includes('..')) continue
    if (!(v.duracion > 0) || v.inicio >= total - DURACION_MINIMA / 2) continue
    voces.push({
      id: typeof v.id === 'string' && v.id ? v.id : nuevoId('voz'),
      inicio: Math.max(0, v.inicio),
      duracion: v.duracion,
      archivo: v.archivo,
      texto: typeof v.texto === 'string' ? v.texto.slice(0, 600) : '',
      ...(typeof v.volumen === 'number' && Number.isFinite(v.volumen) && Math.abs(v.volumen - 1) > 1e-3 ? { volumen: pinza(v.volumen, 0, 1.5) } : {}),
      ...(typeof v.voz === 'string' && v.voz ? { voz: v.voz.slice(0, 40) } : {}),
      ...(typeof v.desde === 'number' && v.desde > 0.001 ? { desde: Math.round(v.desde * 1000) / 1000 } : {}),
      ...(typeof v.largo === 'number' && v.largo > 0 ? { largo: Math.round(v.largo * 1000) / 1000 } : {})
    })
  }
  return voces.sort((a, b) => a.inicio - b.inicio)
}

/** Pinza cada ajuste a su rango y quita los neutros; sin nada que cambiar, undefined. */
export function normalizarAjustes(entrada: unknown): AjustesClip | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const crudo = entrada as Record<string, unknown>
  const salida: AjustesClip = {}
  for (const clave of Object.keys(LIMITES_AJUSTES) as (keyof AjustesClip)[]) {
    const v = crudo[clave]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const [min, max, neutro] = LIMITES_AJUSTES[clave]
    const valor = Math.round(pinza(v, min, max) * 1000) / 1000
    if (Math.abs(valor - neutro) > 1e-3) salida[clave] = valor
  }
  return Object.keys(salida).length ? salida : undefined
}

/** La música solo puede apuntar a un archivo dentro de la carpeta del proyecto. */
export function normalizarMusica(entrada: unknown): MusicaTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const m = entrada as Record<string, unknown>
  if (typeof m.archivo !== 'string' || !/^media\/[\w.-]+$/.test(m.archivo) || m.archivo.includes('..')) return undefined
  return {
    archivo: m.archivo,
    nombre: typeof m.nombre === 'string' && m.nombre ? m.nombre.slice(0, 120) : m.archivo.slice(6),
    volumen: typeof m.volumen === 'number' && Number.isFinite(m.volumen) ? pinza(m.volumen, 0, 1) : 0.35,
    ducking: m.ducking !== false,
    ...(Array.isArray(m.tramos) ? { tramos: normalizarTramosMusica(m.tramos) } : {})
  }
}

function normalizarTramosMusica(entrada: unknown[]): TramoMusica[] {
  const vistos = new Set<string>()
  const tramos: TramoMusica[] = []
  for (const t of entrada as Partial<TramoMusica>[]) {
    if (!t || typeof t.inicio !== 'number' || typeof t.duracion !== 'number' || !Number.isFinite(t.inicio) || !(t.duracion >= DURACION_MINIMA / 2)) continue
    let id = typeof t.id === 'string' && t.id ? t.id.slice(0, 60) : nuevoId('musica')
    if (vistos.has(id)) id = nuevoId('musica')
    vistos.add(id)
    tramos.push({
      id,
      inicio: Math.round(Math.max(0, t.inicio) * 1000) / 1000,
      duracion: Math.round(t.duracion * 1000) / 1000,
      ...(typeof t.desde === 'number' && t.desde > 0.001 ? { desde: Math.round(t.desde * 1000) / 1000 } : {})
    })
  }
  return tramos.sort((a, b) => a.inicio - b.inicio)
}

/** Dónde suena la música: sus trozos, o uno solo de todo el video (id «musica») si nunca se cortó. */
export function tramosMusica(tl: Timeline): TramoMusica[] {
  if (!tl.musica) return []
  if (tl.musica.tramos) return tramosQueCaben(tl.musica.tramos, duracionTimeline(tl))
  return [{ id: 'musica', inicio: 0, duracion: duracionTimeline(tl) }]
}

/** Los trozos de música que caben en la timeline (los que empiezan después del final se van; el último se acorta). */
function tramosQueCaben(tramos: TramoMusica[], total: number): TramoMusica[] {
  return tramos
    .filter((t) => t.inicio < total - DURACION_MINIMA / 2)
    .map((t) => (t.inicio + t.duracion > total ? { ...t, duracion: total - t.inicio } : t))
}

function conTramosMusica(tl: Timeline, tramos: TramoMusica[]): Timeline {
  if (!tl.musica) return tl
  const lista = tramosQueCaben(normalizarTramosMusica(tramos), duracionTimeline(tl))
  // Sin trozos no queda música.
  if (!lista.length) return ponerMusica(tl, undefined)
  return { ...tl, musica: { ...tl.musica, tramos: lista } }
}

/** Divide la música en el segundo `t` (en el trozo que suena ahí): quedan dos que siguen sonando igual. */
export function dividirMusica(tl: Timeline, t: number): { timeline: Timeline; id?: string } {
  const tramos = tramosMusica(tl)
  const x = tramos.find((m) => t > m.inicio && t < m.inicio + m.duracion)
  if (!x) return { timeline: tl }
  const primero = t - x.inicio
  if (primero < DURACION_MINIMA || x.duracion - primero < DURACION_MINIMA) return { timeline: tl }
  const nuevo: TramoMusica = { id: nuevoId('musica'), inicio: t, duracion: x.duracion - primero, desde: (x.desde ?? 0) + primero }
  return { timeline: conTramosMusica(tl, tramos.flatMap((m) => (m.id === x.id ? [{ ...m, duracion: primero }, nuevo] : [m]))), id: nuevo.id }
}

/** Mueve un trozo de música o le recorta un borde. La música se repite: se puede alargar hasta el final del video. */
export function cambiarTramoMusica(tl: Timeline, id: string, cambio: Partial<Omit<TramoMusica, 'id'>>): Timeline {
  const tramos = tramosMusica(tl)
  if (!tramos.some((m) => m.id === id)) return tl
  const total = duracionTimeline(tl)
  return conTramosMusica(
    tl,
    tramos.map((m) => {
      if (m.id !== id) return m
      const n = { ...m, ...cambio }
      n.inicio = pinza(n.inicio, 0, Math.max(0, total - DURACION_MINIMA))
      n.duracion = pinza(n.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - n.inicio))
      if ((n.desde ?? 0) < 0) n.desde = 0
      return n
    })
  )
}

/** Quita un trozo de música; si era el último, la música entera. */
export function borrarTramoMusica(tl: Timeline, id: string): Timeline {
  const tramos = tramosMusica(tl)
  if (!tramos.some((m) => m.id === id)) return tl
  return conTramosMusica(tl, tramos.filter((m) => m.id !== id))
}

// ===== Leer =====

export function duracionTimeline(tl: Timeline): number {
  return tl.clips.reduce((total, c) => total + largo(c), 0)
}

export function tramos(tl: Timeline): Tramo[] {
  let inicio = 0
  return tl.clips.map((clip, indice) => {
    const tramo = { clip, indice, inicio, fin: inicio + largo(clip) }
    inicio = tramo.fin
    return tramo
  })
}

/** Qué clip suena en el segundo `t` de la timeline y a qué segundo de la fuente equivale. */
export function ubicar(tl: Timeline, t: number): (Tramo & { tFuente: number }) | null {
  const lista = tramos(tl)
  if (lista.length === 0) return null
  const ultimo = lista[lista.length - 1]
  const tiempo = pinza(t, 0, ultimo.fin)
  const tramo = lista.find((x) => tiempo < x.fin - EPSILON) ?? ultimo
  return { ...tramo, tFuente: fuenteEnClip(tramo.clip, tiempo - tramo.inicio) }
}

/** Los ajustes que se ven: los del clip con los neutros por defecto. */
export function ajustesDe(clip: ClipTL | undefined): Required<AjustesClip> {
  return {
    zoom: clip?.ajustes?.zoom ?? 1,
    brillo: clip?.ajustes?.brillo ?? 0,
    contraste: clip?.ajustes?.contraste ?? 1,
    saturacion: clip?.ajustes?.saturacion ?? 1,
    cx: clip?.ajustes?.cx ?? 0.5,
    cy: clip?.ajustes?.cy ?? 0.5,
    acercar: clip?.ajustes?.acercar ?? 0,
    panx: clip?.ajustes?.panx ?? 0,
    pany: clip?.ajustes?.pany ?? 0,
    temblor: clip?.ajustes?.temblor ?? 0,
    campo: clip?.ajustes?.campo ?? 0,
    foco: clip?.ajustes?.foco ?? 0.5,
    desenfoque: clip?.ajustes?.desenfoque ?? 0,
    sepia: clip?.ajustes?.sepia ?? 0,
    tono: clip?.ajustes?.tono ?? 0,
    invertir: clip?.ajustes?.invertir ?? 0,
    exposicion: clip?.ajustes?.exposicion ?? 0,
    altas: clip?.ajustes?.altas ?? 0,
    sombras: clip?.ajustes?.sombras ?? 0,
    blancos: clip?.ajustes?.blancos ?? 0,
    negros: clip?.ajustes?.negros ?? 0,
    temperatura: clip?.ajustes?.temperatura ?? 0,
    tinte: clip?.ajustes?.tinte ?? 0,
    escala: clip?.ajustes?.escala ?? 1,
    posx: clip?.ajustes?.posx ?? 0,
    posy: clip?.ajustes?.posy ?? 0,
    giro: clip?.ajustes?.giro ?? 0,
    recorteIzq: clip?.ajustes?.recorteIzq ?? 0,
    recorteDer: clip?.ajustes?.recorteDer ?? 0,
    recorteArr: clip?.ajustes?.recorteArr ?? 0,
    recorteAba: clip?.ajustes?.recorteAba ?? 0,
    zonaMatiz: clip?.ajustes?.zonaMatiz ?? 0,
    zonaAncho: clip?.ajustes?.zonaAncho ?? 30,
    zonaSuave: clip?.ajustes?.zonaSuave ?? 0.5,
    zonaGiro: clip?.ajustes?.zonaGiro ?? 0,
    zonaSat: clip?.ajustes?.zonaSat ?? 0,
    zonaLuz: clip?.ajustes?.zonaLuz ?? 0
  }
}

// ===== Color por zonas: una LUT 3D que cambia solo los colores cercanos al elegido =====

/** Tiene color por zonas: algo que cambiar en la zona elegida. */
export function zonaColorActiva(a: Pick<Required<AjustesClip>, 'zonaGiro' | 'zonaSat' | 'zonaLuz'>): boolean {
  return Math.abs(a.zonaGiro) > 0.5 || Math.abs(a.zonaSat) > 0.005 || Math.abs(a.zonaLuz) > 0.005
}

const suaveZona = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p))

/**
 * Cuánto entra un color (r, g, b de 0 a 1) en la zona: 1 de lleno, 0 fuera. Por tono (cerca del elegido, con su borde
 * suave) y por saturación: los grises no tienen tono y no entran.
 */
export function pesoZona(r: number, g: number, b: number, a: Pick<Required<AjustesClip>, 'zonaMatiz' | 'zonaAncho' | 'zonaSuave'>): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const croma = max - min
  if (croma < 1e-6) return 0
  let h = max === r ? ((g - b) / croma) % 6 : max === g ? (b - r) / croma + 2 : (r - g) / croma + 4
  h = (h * 60 + 360) % 360
  const d = Math.abs(((h - a.zonaMatiz + 540) % 360) - 180)
  const borde = Math.max(1, a.zonaAncho * (0.2 + 1.8 * a.zonaSuave))
  const porTono = d <= a.zonaAncho ? 1 : 1 - suaveZona((d - a.zonaAncho) / borde)
  const sat = max > 0 ? croma / max : 0
  return porTono * suaveZona((sat - 0.04) / 0.16)
}

/** Aplica el color por zonas a un color (r, g, b de 0 a 1). */
export function colorZona(r: number, g: number, b: number, a: Required<AjustesClip>): [number, number, number] {
  const w = pesoZona(r, g, b, a)
  if (w <= 0) return [r, g, b]
  // A HSL: se gira el tono, se cambia la saturación y la luz, y se mezcla con el original según el peso.
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let l = (max + min) / 2
  const c = max - min
  let s = c === 0 ? 0 : c / (1 - Math.abs(2 * l - 1))
  let h = c === 0 ? 0 : max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4
  h = (h * 60 + 360) % 360
  h = (h + a.zonaGiro * w + 360) % 360
  s = Math.max(0, Math.min(1, s * (1 + a.zonaSat * w)))
  l = Math.max(0, Math.min(1, l + a.zonaLuz * w * (a.zonaLuz > 0 ? 1 - l : l) * 0.8))
  const C = (1 - Math.abs(2 * l - 1)) * s
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - C / 2
  const [r1, g1, b1] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X]
  return [r1 + m, g1 + m, b1 + m]
}

/** El color por zonas como archivo .cube 3D (lo lee el filtro lut3d de FFmpeg; el rojo varía más rápido). */
export function cuboDeZona(a: Required<AjustesClip>, lado = 33): string {
  const lineas = ['TITLE "Recorte color por zonas"', `LUT_3D_SIZE ${lado}`]
  for (let bi = 0; bi < lado; bi++)
    for (let gi = 0; gi < lado; gi++)
      for (let ri = 0; ri < lado; ri++) {
        const [r, g, b] = colorZona(ri / (lado - 1), gi / (lado - 1), bi / (lado - 1), a)
        lineas.push(`${r.toFixed(5)} ${g.toFixed(5)} ${b.toFixed(5)}`)
      }
  return lineas.join('\n') + '\n'
}

// ===== Color tipo Lumetri: una curva por canal, la misma en el monitor (filtro SVG) y en el MP4 (lut1d) =====

export const PUNTOS_CURVA = 33
const CLAVES_CURVA = ['exposicion', 'altas', 'sombras', 'blancos', 'negros', 'temperatura', 'tinte'] as const

/**
 * Las curvas de color del clip (rojo, verde y azul, de 0 a 1, con PUNTOS_CURVA puntos), o null si no hay ninguna.
 * La exposición y el balance de blancos se hacen en luz lineal; las luces, sombras, blancos y negros, sobre la imagen.
 */
export function curvasColor(a: Required<AjustesClip>): { r: number[]; g: number[]; b: number[] } | null {
  if (CLAVES_CURVA.every((k) => Math.abs(a[k]) < 1e-3)) return null
  const ganancia = Math.pow(2, a.exposicion)
  const canal = [1 + 0.22 * a.temperatura + 0.04 * a.tinte, 1 - 0.16 * a.tinte, 1 - 0.22 * a.temperatura + 0.04 * a.tinte]
  const curvas = canal.map((k) =>
    Array.from({ length: PUNTOS_CURVA }, (_, i) => {
      let v = i / (PUNTOS_CURVA - 1)
      v = Math.pow(Math.min(1, Math.pow(v, 2.2) * ganancia * k), 1 / 2.2)
      // Cada control pesa en su zona: sombras hacia 1/3, altas luces hacia 2/3, negros y blancos en los extremos.
      v += a.sombras * 0.22 * 6.75 * v * (1 - v) * (1 - v)
      v += a.altas * 0.22 * 6.75 * v * v * (1 - v)
      v += a.negros * 0.18 * Math.pow(1 - v, 3)
      v += a.blancos * 0.2 * Math.pow(v, 3)
      return Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000
    })
  )
  return { r: curvas[0], g: curvas[1], b: curvas[2] }
}

// ----- Curvas dibujadas a mano (como las curvas RGB de Lumetri) -----

export type CanalCurva = 'rgb' | 'r' | 'g' | 'b'
/** Un punto de una curva: [entrada, salida], de 0 a 1. Los extremos (0,0) y (1,1) van siempre. */
export type PuntoCurva = [number, number]
export type CurvasTL = Partial<Record<CanalCurva, PuntoCurva[]>>
export const CANALES_CURVA: { id: CanalCurva; nombre: string; para: string }[] = [
  { id: 'rgb', nombre: 'Luz', para: 'la luz de toda la imagen: una S da más contraste, subir el centro aclara' },
  { id: 'r', nombre: 'Rojo', para: 'cuánto rojo: subirlo calienta, bajarlo lo lleva al cian' },
  { id: 'g', nombre: 'Verde', para: 'cuánto verde: bajarlo lo lleva al magenta' },
  { id: 'b', nombre: 'Azul', para: 'cuánto azul: subirlo enfría, bajarlo lo lleva al amarillo' }
]
export const MAX_PUNTOS_CURVA = 8

export function normalizarCurvas(entrada: unknown): CurvasTL | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const salida: CurvasTL = {}
  for (const { id } of CANALES_CURVA) {
    const lista = (entrada as Record<string, unknown>)[id]
    if (!Array.isArray(lista)) continue
    const puntos = lista
      .filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)))
      .map(([x, y]) => [Math.round(pinza(x, 0.01, 0.99) * 1000) / 1000, Math.round(pinza(y, 0, 1) * 1000) / 1000] as PuntoCurva)
      .sort((p, q) => p[0] - q[0])
      .filter((p, i, a) => i === 0 || p[0] - a[i - 1][0] >= 0.01)
      .slice(0, MAX_PUNTOS_CURVA)
    if (puntos.length) salida[id] = puntos
  }
  return Object.keys(salida).length ? salida : undefined
}

/**
 * La curva por esos puntos en `n` valores de 0 a 1 (más los extremos 0,0 y 1,1): suave y sin pasarse, como en
 * Premiere (interpolación cúbica monótona de Fritsch–Carlson).
 */
export function curvaPuntos(puntos: PuntoCurva[], n = PUNTOS_CURVA): number[] {
  const p: PuntoCurva[] = [[0, 0], ...puntos, [1, 1]]
  const m = p.length
  const d = p.slice(0, -1).map((a, i) => (p[i + 1][1] - a[1]) / Math.max(1e-6, p[i + 1][0] - a[0]))
  const t = p.map((_, i) => (i === 0 ? d[0] : i === m - 1 ? d[m - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2))
  for (let i = 0; i < m - 1; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / d[i]
    const b = t[i + 1] / d[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      t[i] = (3 * a * d[i]) / h
      t[i + 1] = (3 * b * d[i]) / h
    }
  }
  return Array.from({ length: n }, (_, k) => {
    const x = k / (n - 1)
    let i = 0
    while (i < m - 2 && x > p[i + 1][0]) i++
    const h = p[i + 1][0] - p[i][0]
    const s = h > 0 ? (x - p[i][0]) / h : 0
    const s2 = s * s
    const s3 = s2 * s
    const v = (2 * s3 - 3 * s2 + 1) * p[i][1] + (s3 - 2 * s2 + s) * h * t[i] + (-2 * s3 + 3 * s2) * p[i + 1][1] + (s3 - s2) * h * t[i + 1]
    return Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000
  })
}

/** Una curva (valores de 0 a 1 en puntos iguales) en un valor cualquiera, recta entre sus puntos (como lut1d). */
function enCurva(tabla: number[], v: number): number {
  const x = Math.min(1, Math.max(0, v)) * (tabla.length - 1)
  const i = Math.min(tabla.length - 2, Math.floor(x))
  return tabla[i] + (tabla[i + 1] - tabla[i]) * (x - i)
}

/** Las curvas finales de un clip: las del color tipo Lumetri y, encima, las dibujadas a mano. Null si no hay nada. */
export function curvasDeClip(clip: Pick<ClipTL, 'curvas'> | undefined, a: Required<AjustesClip>): { r: number[]; g: number[]; b: number[] } | null {
  const base = curvasColor(a)
  const c = clip?.curvas
  if (!c) return base
  const rgb = c.rgb ? curvaPuntos(c.rgb) : null
  const canal = (id: 'r' | 'g' | 'b', previa: number[] | null) => {
    const propia = c[id] ? curvaPuntos(c[id]!) : null
    return Array.from({ length: PUNTOS_CURVA }, (_, k) => {
      let v = previa ? previa[k] : k / (PUNTOS_CURVA - 1)
      if (rgb) v = enCurva(rgb, v)
      if (propia) v = enCurva(propia, v)
      return Math.round(v * 10000) / 10000
    })
  }
  return { r: canal('r', base?.r ?? null), g: canal('g', base?.g ?? null), b: canal('b', base?.b ?? null) }
}

// ----- LUT 3D (.cube) -----

export interface LutClip {
  /** Dentro del proyecto: `media/luts/<nombre>.cube`. */
  archivo: string
  nombre: string
  /** 0 (nada) a 1 (el LUT tal cual). */
  intensidad: number
}

function normalizarLut(entrada: unknown): LutClip | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const l = entrada as Partial<LutClip>
  if (typeof l.archivo !== 'string' || !/^media\/luts\/[\w.-]+\.cube$/i.test(l.archivo) || l.archivo.includes('..')) return undefined
  return {
    archivo: l.archivo,
    nombre: typeof l.nombre === 'string' && l.nombre ? l.nombre.slice(0, 80) : l.archivo.slice(11),
    intensidad: typeof l.intensidad === 'number' && Number.isFinite(l.intensidad) ? Math.round(pinza(l.intensidad, 0, 1) * 100) / 100 : 1
  }
}

/** Pone, cambia o quita (con `lut` undefined) el LUT de un clip (o de todos, con `id` null). */
export function ponerLut(tl: Timeline, id: string | null, lut: LutClip | undefined): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (id !== null && c.id !== id) return c
      const { lut: _antes, ...resto } = c
      const valido = normalizarLut(lut)
      return valido ? { ...resto, lut: valido } : resto
    })
  }
}

/** Cambia (o quita, con `puntos` vacío) la curva de un canal de un clip. */
export function cambiarCurva(tl: Timeline, id: string, canal: CanalCurva, puntos: PuntoCurva[] | undefined): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const curvas = normalizarCurvas({ ...(c.curvas ?? {}), [canal]: puntos ?? [] })
      const { curvas: _antes, ...resto } = c
      return curvas ? { ...resto, curvas } : resto
    })
  }
}

/** Las curvas como archivo .cube de 1D (lo lee el filtro lut1d de FFmpeg). */
export function cuboDeCurvas(c: { r: number[]; g: number[]; b: number[] }): string {
  const filas = c.r.map((_, i) => `${c.r[i].toFixed(5)} ${c.g[i].toFixed(5)} ${c.b[i].toFixed(5)}`)
  return ['TITLE "Recorte"', `LUT_1D_SIZE ${c.r.length}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1', ...filas, ''].join(String.fromCharCode(10))
}

/** Si el clip se escala por debajo del 100 %, se corre, se gira o se recorta. */
export function hayMovimiento(a: Required<AjustesClip>): boolean {
  return a.escala < 0.999 || Math.abs(a.posx) > 1e-3 || Math.abs(a.posy) > 1e-3 || Math.abs(a.giro) > 0.05 || hayRecorte(a)
}
export function hayRecorte(a: Required<AjustesClip>): boolean {
  return a.recorteIzq > 1e-3 || a.recorteDer > 1e-3 || a.recorteArr > 1e-3 || a.recorteAba > 1e-3
}

// ===== Fotogramas clave: un ajuste del clip que cambia a lo largo del tiempo =====

/** Los ajustes que se pueden animar con fotogramas clave (los que el MP4 puede cambiar cuadro a cuadro). */
export const PARAMETROS_CLAVE = [
  'zoom',
  'cx',
  'cy',
  'brillo',
  'contraste',
  'saturacion',
  'escala',
  'posx',
  'posy',
  'giro',
  'exposicion',
  'altas',
  'sombras',
  'blancos',
  'negros',
  'temperatura',
  'tinte',
  'desenfoque',
  'sepia',
  'tono'
] as const
/** Los efectos que, con claves, el MP4 cambia cuadro a cuadro con órdenes (sendcmd), no con expresiones. */
export const CLAVES_EFECTO = ['desenfoque', 'sepia', 'tono'] as const
/** Los ajustes de color que van en la curva (lut1d): con claves, el MP4 cambia de curva por tramos. */
export const CLAVES_CURVA_COLOR = ['exposicion', 'altas', 'sombras', 'blancos', 'negros', 'temperatura', 'tinte'] as const
export type ParametroClave = (typeof PARAMETROS_CLAVE)[number]
/** Un fotograma clave: en el segundo `f` de la fuente, el ajuste vale `v`. Van pegados al material: al recortar o dividir no se mueven. */
export interface ClaveTL {
  f: number
  v: number
  /** Cómo va de esta clave a la siguiente (sin ella, suave: arranca y llega despacio). */
  curva?: CurvaClave
}

/** Las curvas de suavizado de un fotograma clave a otro (como en After Effects o HyperFrames). */
export type CurvaClave = 'lineal' | 'suave' | 'acelera' | 'frena' | 'rebote'
export const CURVAS_CLAVE: { id: CurvaClave; nombre: string; para: string }[] = [
  { id: 'suave', nombre: 'Suave', para: 'arranca y llega despacio (la de siempre)' },
  { id: 'lineal', nombre: 'Lineal', para: 'a la misma velocidad todo el tiempo' },
  { id: 'acelera', nombre: 'Acelera', para: 'arranca despacio y llega rápido (para salir)' },
  { id: 'frena', nombre: 'Frena', para: 'arranca rápido y llega despacio (para entrar)' },
  { id: 'rebote', nombre: 'Se pasa y vuelve', para: 'llega, se pasa un poco y vuelve (con energía)' }
]
/** Cuánto ha avanzado (0 a 1, o un poco más en «rebote») a la fracción `k` del tramo, según su curva. */
export function avanceCurva(curva: CurvaClave | undefined, k: number): number {
  if (curva === 'lineal') return k
  if (curva === 'acelera') return k * k * k
  if (curva === 'frena') return 1 - (1 - k) ** 3
  if (curva === 'rebote') return 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2
  return k * k * (3 - 2 * k)
}
/** La misma curva como expresión de FFmpeg (`k` es la expresión de la fracción del tramo). */
function exprCurva(curva: CurvaClave | undefined, k: string): string {
  if (curva === 'lineal') return k
  if (curva === 'acelera') return `${k}*${k}*${k}`
  if (curva === 'frena') return `(1-pow(1-${k},3))`
  if (curva === 'rebote') return `(1+2.70158*pow(${k}-1,3)+1.70158*pow(${k}-1,2))`
  return `${k}*${k}*(3-2*${k})`
}
const esCurva = (c: unknown): c is CurvaClave => typeof c === 'string' && c !== 'suave' && CURVAS_CLAVE.some((x) => x.id === c)
export type ClavesClip = Partial<Record<ParametroClave, ClaveTL[]>>
export const MAX_CLAVES = 12
/** Dos claves más cerca que esto son la misma (un cuadro a 30 fps). */
const MISMA_CLAVE = 0.034

function normalizarClaves(entrada: unknown): ClavesClip | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const salida: ClavesClip = {}
  for (const p of PARAMETROS_CLAVE) {
    const lista = (entrada as Record<string, unknown>)[p]
    if (!Array.isArray(lista)) continue
    const [min, max] = LIMITES_AJUSTES[p]
    const puntos: ClaveTL[] = []
    for (const x of [...lista].sort((a, b) => (a?.f ?? 0) - (b?.f ?? 0))) {
      if (!x || typeof x.f !== 'number' || typeof x.v !== 'number' || !Number.isFinite(x.f) || !Number.isFinite(x.v)) continue
      const punto: ClaveTL = { f: Math.round(Math.max(0, x.f) * 1000) / 1000, v: Math.round(pinza(x.v, min, max) * 1000) / 1000, ...(esCurva(x.curva) ? { curva: x.curva } : {}) }
      // Dos en el mismo cuadro: vale la última.
      if (puntos.length && punto.f - puntos[puntos.length - 1].f < MISMA_CLAVE) puntos[puntos.length - 1] = punto
      else puntos.push(punto)
    }
    if (puntos.length) salida[p] = puntos.slice(0, MAX_CLAVES)
  }
  return Object.keys(salida).length ? salida : undefined
}

/** El valor de una lista de claves en el segundo `f` de la fuente: quieto antes y después, suave entre dos. */
export function valorClave(lista: ClaveTL[], f: number): number {
  if (f <= lista[0].f) return lista[0].v
  for (let i = 0; i < lista.length - 1; i++) {
    const a = lista[i]
    const b = lista[i + 1]
    if (f < b.f) {
      const k = (f - a.f) / (b.f - a.f)
      return a.v + (b.v - a.v) * avanceCurva(a.curva, k)
    }
  }
  return lista[lista.length - 1].v
}

/** Los ajustes de un clip en un segundo de su fuente: los fijos, con lo que digan sus fotogramas clave. */
export function ajustesEn(clip: ClipTL | undefined, f: number): Required<AjustesClip> {
  const a = ajustesDe(clip)
  if (clip?.claves) for (const p of PARAMETROS_CLAVE) if (clip.claves[p]?.length) a[p] = valorClave(clip.claves[p]!, f)
  return a
}

/**
 * La misma curva como expresión de FFmpeg, con `F` = la expresión del segundo de la fuente (p. ej. `(2.5+on/30)`).
 * Sale igual que `valorClave`: el MP4 se mueve como el monitor.
 */
export function exprClave(lista: ClaveTL[], F: string): string {
  const n = (x: number) => (Math.round(x * 10000) / 10000).toString()
  let e = n(lista[lista.length - 1].v)
  for (let i = lista.length - 2; i >= 0; i--) {
    const a = lista[i]
    const b = lista[i + 1]
    const k = `((${F}-${n(a.f)})/${n(b.f - a.f)})`
    e = `if(lt(${F},${n(b.f)}),${n(a.v)}+(${n(b.v - a.v)})*${exprCurva(a.curva, k)},${e})`
  }
  return `if(lt(${F},${n(lista[0].f)}),${n(lista[0].v)},${e})`
}

function conClaves(c: ClipTL, claves: ClavesClip | undefined): ClipTL {
  const { claves: _antes, ...resto } = c
  const limpias = normalizarClaves(claves)
  return limpias ? { ...resto, claves: limpias } : resto
}

/** Pone (o cambia) el fotograma clave de un ajuste en el segundo `f` de la fuente del clip. */
export function ponerClave(tl: Timeline, id: string, parametro: ParametroClave, f: number, v: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const donde = pinza(f, c.entrada, c.salida)
      const otras = (c.claves?.[parametro] ?? []).filter((x) => Math.abs(x.f - donde) >= MISMA_CLAVE)
      if (otras.length >= MAX_CLAVES) return c
      return conClaves(c, { ...(c.claves ?? {}), [parametro]: [...otras, { f: donde, v }] })
    })
  }
}

/** Quita el fotograma clave de un ajuste en el segundo `f` (o todos los de ese ajuste, sin `f`). */
export function quitarClave(tl: Timeline, id: string, parametro: ParametroClave, f?: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id || !c.claves?.[parametro]) return c
      const quedan = f === undefined ? [] : c.claves[parametro]!.filter((x) => Math.abs(x.f - f) >= MISMA_CLAVE)
      // Al quitar la última, el ajuste se queda con el valor que tenía ahí.
      const fijo = quedan.length ? c : { ...c, ajustes: normalizarAjustes({ ...ajustesDe(c), [parametro]: c.claves[parametro]![0].v }) }
      const { ajustes, ...sinAjustes } = fijo
      return conClaves(ajustes ? fijo : (sinAjustes as ClipTL), { ...c.claves, [parametro]: quedan })
    })
  }
}

/** La clave de un ajuste que cae en el segundo `f` (dentro de un cuadro), si la hay. */
export function claveEn(clip: ClipTL, parametro: ParametroClave, f: number): ClaveTL | undefined {
  return clip.claves?.[parametro]?.find((x) => Math.abs(x.f - f) < MISMA_CLAVE)
}

// ===== Fotogramas clave de las capas =====

export const PARAMETROS_CLAVE_CAPA = ['x', 'y', 'ancho', 'giro', 'opacidad', 'desenfoque'] as const
export type ParametroClaveCapa = (typeof PARAMETROS_CLAVE_CAPA)[number]
export type ClavesCapa = Partial<Record<ParametroClaveCapa, ClaveTL[]>>
/** Lo que puede valer cada uno (x e y pueden salir del cuadro, para entrar o salir volando). */
const LIMITES_CLAVE_CAPA: Record<ParametroClaveCapa, [number, number]> = { x: [-0.5, 1.5], y: [-0.5, 1.5], ancho: [0.05, 2], giro: [-720, 720], opacidad: [0, 1], desenfoque: [0, 1] }

export function normalizarClavesCapa(entrada: unknown, duracion: number): ClavesCapa | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const salida: ClavesCapa = {}
  for (const p of PARAMETROS_CLAVE_CAPA) {
    const lista = (entrada as Record<string, unknown>)[p]
    if (!Array.isArray(lista)) continue
    const [min, max] = LIMITES_CLAVE_CAPA[p]
    const puntos: ClaveTL[] = []
    for (const x of [...lista].sort((a, b) => (a?.f ?? 0) - (b?.f ?? 0))) {
      if (!x || typeof x.f !== 'number' || typeof x.v !== 'number' || !Number.isFinite(x.f) || !Number.isFinite(x.v)) continue
      const punto: ClaveTL = { f: Math.round(pinza(x.f, 0, duracion) * 1000) / 1000, v: Math.round(pinza(x.v, min, max) * 1000) / 1000, ...(esCurva(x.curva) ? { curva: x.curva } : {}) }
      if (puntos.length && punto.f - puntos[puntos.length - 1].f < MISMA_CLAVE) puntos[puntos.length - 1] = punto
      else puntos.push(punto)
    }
    if (puntos.length) salida[p] = puntos.slice(0, MAX_CLAVES)
  }
  return Object.keys(salida).length ? salida : undefined
}

/** El valor que tiene ahora (sin claves) un ajuste de una capa en el segundo `dt` desde que aparece. */
function valorCapaSinClave(c: CapaTL, p: ParametroClaveCapa, dt: number): number {
  if (p === 'opacidad') return 1
  const e = estadoCapa({ ...c, claves: undefined }, dt, false)
  return e[p]
}

/** Pone (o cambia) el fotograma clave de un ajuste de una capa en el segundo `dt` desde que aparece. */
export function ponerClaveCapa(tl: Timeline, id: string, parametro: ParametroClaveCapa, dt: number, v: number, medios: Record<string, number>): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c) return tl
  const donde = pinza(dt, 0, c.duracion)
  const otras = (c.claves?.[parametro] ?? []).filter((x) => Math.abs(x.f - donde) >= MISMA_CLAVE)
  if (otras.length >= MAX_CLAVES) return tl
  // Si ya había una ahí, conserva su curva.
  const curva = (c.claves?.[parametro] ?? []).find((x) => Math.abs(x.f - donde) < MISMA_CLAVE)?.curva
  // La primera clave de un ajuste que se movía con `fin`: se deja una clave al empezar y otra al acabar, para no perder el recorrido.
  const recorrido =
    !otras.length && c.fin && parametro !== 'opacidad' && parametro !== 'desenfoque'
      ? [{ f: 0, v: valorCapaSinClave(c, parametro, 0) }, { f: c.duracion, v: valorCapaSinClave(c, parametro, c.duracion) }].filter((x) => Math.abs(x.f - donde) >= MISMA_CLAVE)
      : []
  return cambiarCapa(tl, id, { claves: { ...(c.claves ?? {}), [parametro]: [...recorrido, ...otras, { f: donde, v, ...(curva ? { curva } : {}) }] } }, medios)
}

/** Cambia la curva con que una capa va de su clave en `dt` a la siguiente (de ese ajuste o, con `todas`, de todos). */
export function curvaClaveCapa(tl: Timeline, id: string, parametro: ParametroClaveCapa | 'todas', dt: number, curva: CurvaClave, medios: Record<string, number>): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c?.claves) return tl
  const claves = Object.fromEntries(
    Object.entries(c.claves).map(([p, lista]) => [
      p,
      parametro !== 'todas' && p !== parametro
        ? lista
        : (lista ?? []).map((x) => (parametro === 'todas' || Math.abs(x.f - dt) < MISMA_CLAVE ? { f: x.f, v: x.v, ...(curva !== 'suave' ? { curva } : {}) } : x))
    ])
  ) as ClavesCapa
  return cambiarCapa(tl, id, { claves }, medios)
}

/** Quita la clave de un ajuste de una capa en el segundo `dt` (o todas las de ese ajuste, sin `dt`). */
export function quitarClaveCapa(tl: Timeline, id: string, parametro: ParametroClaveCapa, dt: number | undefined, medios: Record<string, number>): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  if (!c?.claves?.[parametro]) return tl
  const quedan = dt === undefined ? [] : c.claves[parametro]!.filter((x) => Math.abs(x.f - dt) >= MISMA_CLAVE)
  // Sin claves, el ajuste se queda fijo en el valor de la última que tenía (la opacidad vuelve a 1).
  const fijo = !quedan.length && parametro !== 'opacidad' && parametro !== 'giro' ? { [parametro]: c.claves[parametro]![0].v } : !quedan.length && parametro === 'giro' ? { giro: c.claves.giro![0].v } : {}
  return cambiarCapa(tl, id, { ...fijo, claves: { ...c.claves, [parametro]: quedan } }, medios)
}

/** La clave de un ajuste de una capa que cae en el segundo `dt` (dentro de un cuadro), si la hay. */
export function claveCapaEn(c: CapaTL, parametro: ParametroClaveCapa, dt: number): ClaveTL | undefined {
  return c.claves?.[parametro]?.find((x) => Math.abs(x.f - dt) < MISMA_CLAVE)
}

/** Lleva la clave que está en `de` hasta `a` dentro de su lista: conserva su valor y su curva; si cae encima de otra, la sustituye. */
export function moverClaveEnLista(lista: ClaveTL[], de: number, a: number): ClaveTL[] {
  const k = lista.find((x) => Math.abs(x.f - de) < MISMA_CLAVE)
  if (!k) return lista
  const resto = lista.filter((x) => x !== k && Math.abs(x.f - a) >= MISMA_CLAVE)
  return [...resto, { ...k, f: a }].sort((x, y) => x.f - y.f)
}

/** Mueve en el tiempo un fotograma clave de un ajuste del clip (dentro del trozo de fuente que usa). */
export function moverClave(tl: Timeline, id: string, parametro: ParametroClave, de: number, a: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      const lista = c.claves?.[parametro]
      if (c.id !== id || !lista) return c
      return conClaves(c, { ...c.claves, [parametro]: moverClaveEnLista(lista, de, pinza(a, c.entrada, c.salida)) })
    })
  }
}

/** Mueve en el tiempo un fotograma clave de un ajuste de una capa (dentro de lo que dura). */
export function moverClaveCapa(tl: Timeline, id: string, parametro: ParametroClaveCapa, de: number, a: number, medios: Record<string, number>): Timeline {
  const c = tl.capas?.find((x) => x.id === id)
  const lista = c?.claves?.[parametro]
  if (!c || !lista) return tl
  return cambiarCapa(tl, id, { claves: { ...c.claves, [parametro]: moverClaveEnLista(lista, de, pinza(a, 0, c.duracion)) } }, medios)
}

// ===== Fotogramas clave de los textos =====

export const PARAMETROS_CLAVE_TEXTO = ['x', 'y', 'tamano', 'giro', 'opacidad'] as const
export type ParametroClaveTexto = (typeof PARAMETROS_CLAVE_TEXTO)[number]
export type ClavesTexto = Partial<Record<ParametroClaveTexto, ClaveTL[]>>
const LIMITES_CLAVE_TEXTO: Record<ParametroClaveTexto, [number, number]> = { x: [-0.5, 1.5], y: [-0.5, 1.5], tamano: [0.5, 6], giro: [-720, 720], opacidad: [0, 1] }

export function normalizarClavesTexto(entrada: unknown, duracion: number): ClavesTexto | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const salida: ClavesTexto = {}
  for (const p of PARAMETROS_CLAVE_TEXTO) {
    const lista = (entrada as Record<string, unknown>)[p]
    if (!Array.isArray(lista)) continue
    const [min, max] = LIMITES_CLAVE_TEXTO[p]
    const puntos: ClaveTL[] = []
    for (const x of [...lista].sort((a, b) => (a?.f ?? 0) - (b?.f ?? 0))) {
      if (!x || typeof x.f !== 'number' || typeof x.v !== 'number' || !Number.isFinite(x.f) || !Number.isFinite(x.v)) continue
      // Antes del principio (un texto cortado) se conserva: es de donde viene.
      const punto: ClaveTL = { f: Math.round(Math.min(x.f, duracion) * 1000) / 1000, v: Math.round(pinza(x.v, min, max) * 1000) / 1000, ...(esCurva(x.curva) ? { curva: x.curva } : {}) }
      if (puntos.length && punto.f - puntos[puntos.length - 1].f < MISMA_CLAVE) puntos[puntos.length - 1] = punto
      else puntos.push(punto)
    }
    if (puntos.length) salida[p] = puntos.slice(0, MAX_CLAVES)
  }
  return Object.keys(salida).length ? salida : undefined
}

/** El sitio propio que toma un texto sin él (el centro de arriba, del centro o de abajo, como lo pone el monitor). */
export function sitioDeTexto(t: Pick<TextoTL, 'x' | 'y' | 'posicion'>): { x: number; y: number } {
  return typeof t.x === 'number' && typeof t.y === 'number' ? { x: t.x, y: t.y } : { x: 0.5, y: t.posicion === 'arriba' ? 0.12 : t.posicion === 'centro' ? 0.5 : 0.86 }
}

/**
 * Cómo está un texto `dt` segundos después de aparecer, con sus fotogramas clave: su sitio (si tiene sitio propio), su
 * tamaño, su giro y su opacidad. Lo mismo dibujan el monitor y el MP4 (un tramo por cuadro).
 */
export function estadoTexto(t: TextoTL, dt: number): { x?: number; y?: number; tamano: number; giro: number; opacidad: number } {
  const k = t.claves
  const v = (p: ParametroClaveTexto, fijo: number | undefined) => (k?.[p]?.length ? valorClave(k[p]!, dt) : fijo)
  return {
    x: v('x', t.x),
    y: v('y', t.y),
    tamano: v('tamano', t.tamano ?? 1) ?? 1,
    giro: v('giro', t.giro ?? 0) ?? 0,
    opacidad: v('opacidad', t.opacidad ?? 1) ?? 1
  }
}

/** El texto tal como está en `dt` (con los valores de sus claves puestos como fijos, sin las claves). */
export function textoEn(t: TextoTL, dt: number): TextoTL {
  if (!t.claves) return t
  const e = estadoTexto(t, dt)
  const { claves: _c, ...resto } = t
  return {
    ...resto,
    ...(typeof e.x === 'number' && typeof e.y === 'number' ? { x: e.x, y: e.y } : {}),
    ...(Math.abs(e.tamano - 1) > 0.005 ? { tamano: e.tamano } : { tamano: undefined }),
    ...(Math.abs(e.giro) > 0.05 ? { giro: e.giro } : { giro: undefined }),
    ...(e.opacidad < 0.995 ? { opacidad: Math.max(0, e.opacidad) } : { opacidad: undefined })
  }
}

/** Pone (o cambia) la clave de un parámetro de un texto en `dt`. Sitio y giro le dan sitio propio si no lo tenía. */
export function ponerClaveTexto(tl: Timeline, id: string, p: ParametroClaveTexto, dt: number, v: number): Timeline {
  const t = tl.textos.find((x) => x.id === id)
  if (!t) return tl
  const donde = pinza(dt, 0, t.duracion)
  const lista = t.claves?.[p] ?? []
  const otras = lista.filter((x) => Math.abs(x.f - donde) >= MISMA_CLAVE)
  if (otras.length >= MAX_CLAVES) return tl
  const curva = lista.find((x) => Math.abs(x.f - donde) < MISMA_CLAVE)?.curva
  const sitio = (p === 'x' || p === 'y' || p === 'giro') && typeof t.x !== 'number' ? sitioDeTexto(t) : {}
  return cambiarTexto(tl, id, { ...sitio, claves: { ...(t.claves ?? {}), [p]: [...otras, { f: donde, v, ...(curva ? { curva } : {}) }] } })
}

/** Quita la clave de un parámetro de un texto en `dt` (o todas, sin `dt`); sin ninguna, se queda fijo en lo que valía. */
export function quitarClaveTexto(tl: Timeline, id: string, p: ParametroClaveTexto, dt?: number): Timeline {
  const t = tl.textos.find((x) => x.id === id)
  const lista = t?.claves?.[p]
  if (!t || !lista) return tl
  const quedan = dt === undefined ? [] : lista.filter((x) => Math.abs(x.f - dt) >= MISMA_CLAVE)
  const fijo = quedan.length ? {} : { [p]: valorClave(lista, dt ?? 0) }
  return cambiarTexto(tl, id, { ...fijo, claves: { ...t.claves, [p]: quedan } })
}

/** La curva con que un texto va de su clave en `dt` a la siguiente. */
export function curvaClaveTexto(tl: Timeline, id: string, p: ParametroClaveTexto, dt: number, curva: CurvaClave): Timeline {
  const t = tl.textos.find((x) => x.id === id)
  if (!t?.claves?.[p]) return tl
  return cambiarTexto(tl, id, { claves: { ...t.claves, [p]: t.claves[p]!.map((x) => (Math.abs(x.f - dt) < MISMA_CLAVE ? { f: x.f, v: x.v, ...(curva !== 'suave' ? { curva } : {}) } : x)) } })
}

/**
 * Cambia un texto en el segundo `dt` desde que aparece: lo que tiene fotogramas clave (sitio, tamaño, giro, opacidad)
 * se cambia en su clave de ahí; lo demás, fijo. Es lo que hacen el monitor y el panel al moverlo o ajustarlo.
 */
export function cambiarTextoEn(tl: Timeline, id: string, cambio: Partial<Omit<TextoTL, 'id'>>, dt: number): Timeline {
  const t = tl.textos.find((x) => x.id === id)
  if (!t?.claves) return cambiarTexto(tl, id, cambio)
  let nueva = tl
  const resto: Partial<Omit<TextoTL, 'id'>> = { ...cambio }
  for (const p of PARAMETROS_CLAVE_TEXTO) {
    const v = cambio[p]
    if (t.claves[p]?.length && typeof v === 'number') {
      nueva = ponerClaveTexto(nueva, id, p, dt, v)
      delete resto[p]
    }
  }
  return Object.keys(resto).length ? cambiarTexto(nueva, id, resto) : nueva
}

// ===== Efectos de clip: color, sepia, tono, negativo y desenfoque (iguales en el monitor y en el MP4) =====

/** Con desenfoque 1, cuánto se desenfoca el clip (fracción del ancho del cuadro). */
export const DESENFOQUE_CLIP = 0.03

/** El color y los efectos de un clip en neutro: lo que pone un look antes de aplicar lo suyo. */
export const COLOR_NEUTRO: AjustesClip = {
  brillo: 0,
  contraste: 1,
  saturacion: 1,
  desenfoque: 0,
  sepia: 0,
  tono: 0,
  invertir: 0,
  exposicion: 0,
  altas: 0,
  sombras: 0,
  blancos: 0,
  negros: 0,
  temperatura: 0,
  tinte: 0
}

/**
 * La matriz de color (3×3, por filas) de la sepia y el giro de tono de un clip, en ese orden; null si no hay ninguno.
 * Son las mismas matrices de `sepia()` y `hue-rotate()` de CSS: el MP4 (colorchannelmixer) sale igual que el monitor.
 */
export function matrizColor(a: Pick<Required<AjustesClip>, 'sepia' | 'tono'>): number[] | null {
  if (a.sepia < 0.005 && Math.abs(a.tono) < 0.5) return null
  const k = 1 - Math.min(1, Math.max(0, a.sepia))
  const S = [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k]
  const r = (a.tono * Math.PI) / 180
  const c = Math.cos(r)
  const n = Math.sin(r)
  const H = [
    0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928,
    0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283,
    0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072
  ]
  // Primero la sepia, luego el tono: H · S.
  const M: number[] = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M.push(H[i * 3] * S[j] + H[i * 3 + 1] * S[3 + j] + H[i * 3 + 2] * S[6 + j])
  return M
}

/** El color y los efectos de un clip como filtro de CSS (sin el desenfoque, que depende del ancho). */
export function filtroColorCss(a: Required<AjustesClip>): string {
  const partes: string[] = []
  if (a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1) partes.push(`brightness(${(1 + a.brillo * 1.5).toFixed(3)}) contrast(${a.contraste}) saturate(${a.saturacion})`)
  if (a.sepia >= 0.005) partes.push(`sepia(${a.sepia})`)
  if (Math.abs(a.tono) >= 0.5) partes.push(`hue-rotate(${a.tono}deg)`)
  if (a.invertir >= 0.5) partes.push('invert(1)')
  return partes.join(' ')
}

/** Un efecto listo para aplicar a un clip: un look de color o un efecto de video. */
export interface EfectoClip {
  id: string
  nombre: string
  para: string
  ajustes: AjustesClip
}

/** Looks de color: cambian el color del clip entero (sustituyen al look anterior). */
export const LOOKS: EfectoClip[] = [
  { id: 'natural', nombre: 'Natural', para: 'quitar el look: el color tal como viene', ajustes: {} },
  { id: 'cine', nombre: 'Cine', para: 'más contraste y menos color, como una película', ajustes: { contraste: 1.22, saturacion: 0.82, brillo: -0.03 } },
  { id: 'vivo', nombre: 'Vivo', para: 'colores fuertes para redes', ajustes: { saturacion: 1.5, contraste: 1.1 } },
  { id: 'apagado', nombre: 'Apagado', para: 'colores suaves, tono sobrio', ajustes: { saturacion: 0.55, contraste: 0.92, brillo: 0.02 } },
  { id: 'bn', nombre: 'Blanco y negro', para: 'archivo, recuerdo, dramatismo', ajustes: { saturacion: 0, contraste: 1.15 } },
  { id: 'bn-duro', nombre: 'B/N duro', para: 'blanco y negro de mucho contraste', ajustes: { saturacion: 0, contraste: 1.6, brillo: -0.04 } },
  { id: 'calido', nombre: 'Cálido', para: 'luz de atardecer, cercanía', ajustes: { sepia: 0.28, saturacion: 1.2 } },
  { id: 'frio', nombre: 'Frío', para: 'tecnología, noche, distancia', ajustes: { sepia: 0.3, tono: 170, saturacion: 0.9, contraste: 1.08 } },
  { id: 'vintage', nombre: 'Vintage', para: 'foto vieja desteñida', ajustes: { sepia: 0.55, contraste: 0.9, brillo: 0.04, saturacion: 0.9 } },
  { id: 'sepia', nombre: 'Sepia', para: 'documento antiguo', ajustes: { sepia: 1 } },
  { id: 'noche', nombre: 'Noche', para: 'oscuro y azulado', ajustes: { brillo: -0.16, contraste: 1.2, saturacion: 0.7, sepia: 0.35, tono: 175 } },
  { id: 'sueno', nombre: 'Sueño', para: 'un recuerdo, algo imaginado', ajustes: { desenfoque: 0.12, brillo: 0.08, saturacion: 1.25, contraste: 0.92 } }
]

/** Efectos de video: se suman a lo que el clip ya tiene. */
export const EFECTOS_VIDEO: EfectoClip[] = [
  { id: 'desenfoque', nombre: 'Desenfoque', para: 'un fondo para un texto, algo que no se debe ver nítido', ajustes: { desenfoque: 0.35 } },
  { id: 'desenfoque-fuerte', nombre: 'Desenfoque fuerte', para: 'tapar del todo lo que hay detrás', ajustes: { desenfoque: 0.9 } },
  { id: 'negativo', nombre: 'Negativo', para: 'un golpe visual, un flash en negativo', ajustes: { invertir: 1 } },
  { id: 'tono-90', nombre: 'Tono girado', para: 'colores cambiados, aire irreal', ajustes: { tono: 90 } },
  { id: 'tono-180', nombre: 'Tono opuesto', para: 'los colores contrarios', ajustes: { tono: 180 } },
  { id: 'oscurecer', nombre: 'Oscurecer', para: 'que un texto encima se lea mejor', ajustes: { brillo: -0.2 } },
  { id: 'aclarar', nombre: 'Aclarar', para: 'una imagen muy oscura', ajustes: { brillo: 0.15 } },
  { id: 'contraste', nombre: 'Más contraste', para: 'una imagen plana', ajustes: { contraste: 1.4 } }
]

/** Aplica un look a un clip (o a todos con `id` null): su color vuelve a neutro y toma el del look. */
export function aplicarLook(tl: Timeline, id: string | null, look: AjustesClip): Timeline {
  return ajustarClip(tl, id, { ...COLOR_NEUTRO, ...look })
}

/** Aspectos de película para todo el video: combinaciones de los filtros (grano, polvo, trama, viñeta, parpadeo). */
export const PELICULAS: { id: string; nombre: string; para: string; filtros: Required<FiltrosTL> }[] = [
  { id: 'limpio', nombre: 'Limpio', para: 'sin filtros', filtros: { grano: 0, polvo: 0, trama: 0, vineta: 0, parpadeo: 0 } },
  { id: 'documental', nombre: 'Documental', para: 'grano fino y bordes oscuros', filtros: { grano: 0.3, polvo: 0.15, trama: 0, vineta: 0.5, parpadeo: 0 } },
  { id: 'archivo', nombre: 'Archivo', para: 'película vieja con polvo y parpadeo', filtros: { grano: 0.5, polvo: 0.5, trama: 0, vineta: 0.6, parpadeo: 0.3 } },
  { id: 'revista', nombre: 'Revista', para: 'trama de puntos de imprenta', filtros: { grano: 0.1, polvo: 0, trama: 0.45, vineta: 0.2, parpadeo: 0 } },
  { id: 'proyector', nombre: 'Proyector', para: 'la luz que tiembla de un proyector', filtros: { grano: 0.35, polvo: 0.25, trama: 0, vineta: 0.45, parpadeo: 0.45 } },
  { id: 'vineta', nombre: 'Viñeta', para: 'solo los bordes oscuros', filtros: { grano: 0, polvo: 0, trama: 0, vineta: 0.6, parpadeo: 0 } }
]

/** Cámara en mano: cuánto se mueve (fracción del cuadro con temblor 1) y cuánto zoom de más le deja sitio. */
export const TEMBLOR_AMPLITUD = 0.007
export const TEMBLOR_ZOOM = 0.04
/**
 * El vaivén de la cámara en mano en el segundo `s` del clip, de -1 a 1 en cada eje: tres ondas lentas que no
 * se repiten a la vista. Igual en el monitor, el MP4 (las mismas ondas en FFmpeg) y el kit.
 */
export function vaiven(s: number): { x: number; y: number } {
  const P = 2 * Math.PI
  return {
    x: 0.6 * Math.sin(P * 0.53 * s) + 0.3 * Math.sin(P * 1.37 * s + 1.3) + 0.1 * Math.sin(P * 3.1 * s + 2.1),
    y: 0.6 * Math.sin(P * 0.41 * s + 0.7) + 0.3 * Math.sin(P * 1.13 * s + 2.4) + 0.1 * Math.sin(P * 2.7 * s + 0.4)
  }
}

/** Cuánto se desenfoca algo a la profundidad `p` con la profundidad de campo del clip (0 a 1). */
export function desenfoqueDeCampo(a: Required<AjustesClip>, p: number): number {
  return a.campo > 0 ? Math.min(1, a.campo * Math.abs(p - a.foco) * 1.5) : 0
}

/**
 * La cámara de un clip en un punto de su recorrido (0 al empezar, 1 al acabar): el zoom y el punto
 * hacia el que se acerca (cx, cy), con el paneo suave (empieza y acaba despacio). Igual en el MP4.
 */
export function camaraEn(a: Required<AjustesClip>, avance: number, segundos = 0): { z: number; cx: number; cy: number } {
  const q = Math.min(1, Math.max(0, avance))
  const e = 3 * q * q - 2 * q * q * q
  const z = zoomEn(a, q)
  // La cámara en mano mueve el encuadre una fracción fija del cuadro: en el punto de zoom, eso es más cuanto menos zoom.
  const v = a.temblor ? vaiven(segundos) : { x: 0, y: 0 }
  const k = a.temblor ? (TEMBLOR_AMPLITUD * a.temblor) / Math.max(1e-3, z - 1) : 0
  return { z, cx: Math.min(1, Math.max(0, a.cx + a.panx * e + k * v.x)), cy: Math.min(1, Math.max(0, a.cy + a.pany * e + k * v.y)) }
}

/** Cuánto zoom lleva el clip en un punto de su recorrido (0 al empezar, 1 al acabar). */
export function zoomEn(a: Required<AjustesClip>, avance: number): number {
  return Math.max(1, a.zoom * (1 + a.acercar * Math.min(1, Math.max(0, avance)))) * (1 + TEMBLOR_ZOOM * a.temblor)
}

/**
 * Pone o quita la transición de entrada de un clip (0 segundos la quita: corte seco). `tipo` cambia
 * cómo entra (barrido, zoom…); sin él, se queda el que tenía. Con `id` null, a todos menos el primero.
 */
export function fundirClip(tl: Timeline, id: string | null, segundos: number, tipo?: TransicionClip): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c, i) => {
      if ((id !== null && c.id !== id) || (id === null && i === 0)) return c
      const { fundido: _antes, transicion: tipoAntes, ...resto } = c
      const d = Math.round(pinza(segundos, 0, Math.min(MAX_FUNDIDO, largo(c) / 2)) * 100) / 100
      const t = tipo ?? tipoAntes
      return d >= 0.1 ? { ...resto, fundido: d, ...(t && t !== 'fundido' ? { transicion: t } : {}) } : resto
    })
  }
}

export function textosEn(tl: Timeline, t: number): TextoTL[] {
  return tl.textos.filter((x) => t >= x.inicio && t < x.inicio + x.duracion)
}

/** Bordes a los que se pega lo que se arrastra (imán): cortes y rótulos. */
export function puntosIman(tl: Timeline, excluirTexto?: string): number[] {
  const puntos = new Set<number>([0])
  for (const tr of tramos(tl)) {
    puntos.add(tr.inicio)
    puntos.add(tr.fin)
  }
  for (const x of tl.textos) {
    if (x.id === excluirTexto) continue
    puntos.add(x.inicio)
    puntos.add(x.inicio + x.duracion)
  }
  return [...puntos]
}

/**
 * La transcripción vista desde la timeline: cada segmento que cae dentro de un clip,
 * recortado al clip y llevado a tiempo de timeline.
 */
export function vozEnTimeline(
  tl: Timeline,
  transcript: TranscriptSegment[] | undefined
): { id: string; inicio: number; fin: number; texto: string }[] {
  if (!transcript?.length) return []
  const salida: { id: string; inicio: number; fin: number; texto: string }[] = []
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL) continue
    for (const seg of transcript) {
      if (seg.end <= tr.clip.entrada || seg.start >= tr.clip.salida) continue
      const palabras = seg.words.filter((w) => w.end > tr.clip.entrada && w.start < tr.clip.salida)
      const texto = (palabras.length ? palabras.map((w) => w.text).join(' ') : seg.text).trim()
      if (!texto) continue
      const inicio = tr.inicio + Math.max(seg.start, tr.clip.entrada) - tr.clip.entrada
      const fin = tr.inicio + Math.min(seg.end, tr.clip.salida) - tr.clip.entrada
      salida.push({ id: `${tr.clip.id}-${seg.id}`, inicio, fin, texto })
    }
  }
  return salida
}

// ===== Subtítulos editables (como «Texto › Subtítulos» de Premiere) =====

/** Los estilos de los subtítulos: cómo se ven todos de una vez. */
export const ESTILOS_SUBTITULO: { id: string; nombre: string; para: string; estilo: Partial<TextoTL> }[] = [
  { id: 'clasico', nombre: 'Clásico', para: 'letra blanca sobre caja negra, abajo', estilo: { posicion: 'abajo', caja: '#000000' } },
  { id: 'redes', nombre: 'Redes', para: 'grandes, amarillos y palabra a palabra, como en TikTok', estilo: { posicion: 'abajo', x: 0.5, y: 0.72, fuente: 'gruesa', tamano: 1.5, color: '#ffe14d', sinCaja: true, animacion: 'palabras' } },
  { id: 'rotulo', nombre: 'Rótulo', para: 'letra negra blanca en una caja oscura, frases cortas y las palabras entre *asteriscos* en color', estilo: { posicion: 'abajo', x: 0.5, y: 0.76, fuente: 'negra', tamano: 1.45, caja: '#0a2540', animacion: 'rotulo', colorClave: '#5fb4f0' } },
  { id: 'pintadas', nombre: 'Pintadas', para: 'la frase entera y cada palabra se pinta de color cuando se dice', estilo: { posicion: 'abajo', x: 0.5, y: 0.74, fuente: 'gruesa', tamano: 1.5, sinCaja: true, animacion: 'pintar' } },
  { id: 'limpio', nombre: 'Limpio', para: 'solo la letra con su borde, sin caja', estilo: { posicion: 'abajo', sinCaja: true, tamano: 1.1 } },
  { id: 'titular', nombre: 'Titular', para: 'condensados y grandes, al centro', estilo: { posicion: 'centro', fuente: 'titular', tamano: 2, sinCaja: true, animacion: 'pop' } }
]

/**
 * Hace subtítulos editables desde lo que se dice (la transcripción de los clips y las frases de narración): un texto
 * por frase corta (hasta `maxPalabras`), en su segundo, con el estilo elegido. Los subtítulos de antes se reemplazan.
 */
/** Una palabra de una frase de voz, con sus segundos dentro de su audio (de la transcripción de ese audio). */
export interface PalabraVoz {
  texto: string
  inicio: number
  fin: number
}

export function subtitulosDesdeVoz(
  tl: Timeline,
  transcript: TranscriptSegment[] | undefined,
  estilo: Partial<TextoTL>,
  maxPalabras = 6,
  /** Las palabras de cada audio de voz (por su archivo), para que los subtítulos vayan con lo que se dice. */
  palabrasVoces?: Record<string, PalabraVoz[]>
): Timeline {
  type Palabra = { texto: string; inicio: number; fin: number; palabras?: Palabra[] }
  const palabras: Palabra[] = []
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL || tr.clip.mudo || !transcript?.length) continue
    for (const seg of transcript) {
      for (const w of seg.words) {
        if (w.end <= tr.clip.entrada || w.start >= tr.clip.salida || !w.text.trim()) continue
        palabras.push({
          texto: w.text.trim(),
          inicio: tr.inicio + clipEnFuente(tr.clip, Math.max(w.start, tr.clip.entrada)),
          fin: tr.inicio + clipEnFuente(tr.clip, Math.min(w.end, tr.clip.salida))
        })
      }
    }
  }
  // La narración puesta frase a frase: con la transcripción de su audio, cada palabra en su segundo (su texto manda:
  // está bien escrito); sin ella, repartidas en lo que dura.
  for (const v of tl.voces ?? []) {
    const lista = v.texto.split(/\s+/).filter(Boolean)
    const d0 = v.desde ?? 0
    const largoV = v.largo ?? d0 + v.duracion
    if (d0 > 0.001 || v.duracion < largoV - 0.001) {
      // Un pedazo de la frase (dividida o recortada): solo las palabras de su tramo del archivo, corridas a su sitio.
      const todas = palabrasVoces?.[v.archivo] ?? []
      const texto = lista.length ? lista : todas.map((w) => w.texto)
      texto.forEach((t, k) => {
        const w = todas.length
          ? todas[Math.min(todas.length - 1, Math.floor((k * todas.length) / texto.length))]
          : { inicio: (largoV * k) / texto.length, fin: (largoV * (k + 1)) / texto.length }
        if (w.inicio < d0 - 0.05 || w.inicio >= d0 + v.duracion) return
        const inicio = v.inicio + Math.max(0, w.inicio - d0)
        const fin = v.inicio + Math.min(v.duracion, w.fin - d0)
        palabras.push({ texto: t, inicio, fin: Math.max(inicio + 0.05, fin) })
      })
      continue
    }
    const oidas = (palabrasVoces?.[v.archivo] ?? []).filter((w) => w.inicio < v.duracion)
    if (oidas.length) {
      const texto = lista.length ? lista : oidas.map((w) => w.texto)
      texto.forEach((t, k) => {
        // Cada palabra escrita toma el tiempo de la palabra oída que le toca (en proporción si no cuentan igual).
        const w = oidas[Math.min(oidas.length - 1, Math.floor((k * oidas.length) / texto.length))]
        const siguiente = k + 1 < texto.length ? oidas[Math.min(oidas.length - 1, Math.floor(((k + 1) * oidas.length) / texto.length))] : null
        const inicio = v.inicio + w.inicio
        const fin = v.inicio + Math.min(v.duracion, siguiente && siguiente !== w ? siguiente.inicio : w.fin)
        palabras.push({ texto: t, inicio, fin: Math.max(inicio + 0.05, fin) })
      })
      continue
    }
    lista.forEach((texto, k) => palabras.push({ texto, inicio: v.inicio + (v.duracion * k) / lista.length, fin: v.inicio + (v.duracion * (k + 1)) / lista.length }))
  }
  palabras.sort((a, b) => a.inicio - b.inicio)
  const bloques: Palabra[] = []
  let actual: Palabra[] = []
  const cerrar = () => {
    if (!actual.length) return
    bloques.push({ texto: actual.map((p) => p.texto).join(' '), inicio: actual[0].inicio, fin: actual[actual.length - 1].fin, palabras: [...actual] })
    actual = []
  }
  palabras.forEach((p, i) => {
    const previa = actual[actual.length - 1]
    // Lleno: se corta, salvo que la frase acabe en una o dos palabras más (no se deja «más.» solo).
    const acabaPronto = palabras.slice(i, i + 2).some((x) => /[.?!…]$/.test(x.texto))
    if (previa && (p.inicio - previa.fin > 0.6 || (actual.length >= maxPalabras && !acabaPronto) || actual.length >= maxPalabras + 2)) cerrar()
    actual.push(p)
    // En el punto siempre; en la coma, si ya hay una frase con sentido (tres palabras o más).
    if (/[.?!…]$/.test(p.texto) || (/[,;:]$/.test(p.texto) && actual.length >= 3)) cerrar()
  })
  cerrar()
  const total = duracionTimeline(tl)
  const subs: TextoTL[] = bloques.map((b, k) => {
    const siguiente = bloques[k + 1]?.inicio ?? total
    const fin = Math.min(siguiente, Math.max(b.fin, b.inicio + 0.6), total)
    // Cuándo se dice cada palabra: así «palabra a palabra» y «pintar» van con la voz.
    const tiempos = (b.palabras ?? []).flatMap((p) => palabrasDe(p.texto).map(() => Math.round((p.inicio - b.inicio) * 1000) / 1000))
    return {
      ...estilo,
      id: nuevoId('texto'),
      inicio: b.inicio,
      duracion: Math.max(DURACION_MINIMA, fin - b.inicio),
      texto: b.texto,
      posicion: estilo.posicion ?? 'abajo',
      subtitulo: true,
      ...(tiempos.length === palabrasDe(b.texto).length ? { tiempos } : {})
    }
  })
  return { ...tl, textos: ajustarTextos([...tl.textos.filter((x) => !x.subtitulo), ...subs], total) }
}

/** Quita los subtítulos hechos desde la voz (los demás textos se quedan). */
export function quitarSubtitulos(tl: Timeline): Timeline {
  return { ...tl, textos: tl.textos.filter((x) => !x.subtitulo) }
}

/** Plantillas de rótulos (como los gráficos esenciales de Premiere): un texto ya armado para cambiarle las palabras. */
export const PLANTILLAS_TEXTO: { id: string; nombre: string; para: string; texto: string; estilo: Partial<TextoTL> }[] = [
  { id: 'inferior', nombre: 'Rótulo inferior', para: 'el nombre y el cargo de quien habla', texto: 'Nombre Apellido\nCargo o dato', estilo: { posicion: 'abajo', x: 0.27, y: 0.83, tamano: 0.9, caja: '#111827', animacion: 'subir' } },
  { id: 'titulo', nombre: 'Título grande', para: 'abrir el video o una sección', texto: 'TÍTULO', estilo: { posicion: 'centro', fuente: 'titular', tamano: 3, sinCaja: true, animacion: 'pop' } },
  { id: 'cita', nombre: 'Cita', para: 'una frase que importa', texto: '«Una frase que importa»', estilo: { posicion: 'centro', fuente: 'cursiva', tamano: 1.6, sinCaja: true, animacion: 'palabras' } },
  { id: 'llamado', nombre: 'Llamado a la acción', para: 'que te sigan, escriban o compren', texto: 'Síguenos para más', estilo: { posicion: 'abajo', x: 0.5, y: 0.8, fuente: 'gruesa', tamano: 1.3, caja: '#ff3b30', animacion: 'pop' } },
  { id: 'dato', nombre: 'Dato', para: 'un número grande con su explicación', texto: '87 %\nde la gente no lo sabe', estilo: { posicion: 'centro', fuente: 'gruesa', tamano: 2, sinCaja: true, color: '#ffe14d', animacion: 'subir' } }
]

// ===== Editar =====

/** Mantiene los rótulos dentro de la duración cuando la timeline se acorta. */
function ajustarTextos(textos: TextoTL[], total: number): TextoTL[] {
  return textos
    .filter((x) => x.inicio < total - DURACION_MINIMA / 2)
    .map((x) => (x.inicio + x.duracion > total ? { ...x, duracion: Math.max(DURACION_MINIMA, total - x.inicio) } : x))
}

function conClips(tl: Timeline, clips: ClipTL[]): Timeline {
  const total = clips.reduce((t, c) => t + largo(c), 0)
  // Las frases que quedan fuera al acortar se van, como los rótulos.
  const voces = tl.voces?.filter((v) => v.inicio < total - DURACION_MINIMA / 2)
  const capas = tl.capas
    ?.filter((c) => c.inicio < total - DURACION_MINIMA / 2)
    .map((c) => (c.inicio + c.duracion > total ? { ...c, duracion: Math.max(DURACION_MINIMA, total - c.inicio) } : c))
  const sonidos = tl.sonidos?.filter((s) => s.inicio < total - DURACION_MINIMA / 2)
  const { voces: _antes, capas: _c, sonidos: _s, ...resto } = tl
  return {
    ...resto,
    clips,
    textos: ajustarTextos(tl.textos, total),
    ...(voces?.length ? { voces } : {}),
    ...(capas?.length ? { capas } : {}),
    ...(sonidos?.length ? { sonidos } : {})
  }
}

/** Divide el clip que está bajo el segundo `t`. Devuelve la misma timeline si no cabe. */
export function dividir(tl: Timeline, t: number): Timeline {
  const u = ubicar(tl, t)
  if (!u) return tl
  if (u.tFuente - u.clip.entrada < DURACION_MINIMA || u.clip.salida - u.tFuente < DURACION_MINIMA) return tl
  // El sonido entra al principio del primer trozo y sale al final del segundo (no en el corte).
  const sinClave = (s: SonidoClip | undefined, clave: 'entra' | 'sale'): { sonido?: SonidoClip } => {
    if (!s) return {}
    const { [clave]: _fuera, ...resto } = s
    return Object.keys(resto).length ? { sonido: resto } : {}
  }
  const { sonido, ...base } = u.clip
  const izquierda: ClipTL = { ...base, ...sinClave(sonido, 'sale'), salida: u.tFuente }
  const derecha: ClipTL = { ...base, ...sinClave(sonido, 'entra'), id: nuevoId('clip'), entrada: u.tFuente }
  const clips = [...tl.clips]
  clips.splice(u.indice, 1, izquierda, derecha)
  return normalizarSonidos2({ ...tl, clips })
}

/** Quita un clip y cierra el hueco. */
export function borrarClip(tl: Timeline, id: string): Timeline {
  if (!tl.clips.some((c) => c.id === id)) return tl
  return conClips(tl, tl.clips.filter((c) => c.id !== id))
}

/**
 * Mueve un borde del clip a un segundo nuevo de la fuente. El otro borde no se mueve
 * y lo que viene después se corre (ripple).
 */
export function recortarClip(
  tl: Timeline,
  id: string,
  lado: 'entrada' | 'salida',
  segundoFuente: number,
  duracionFuente: number
): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    if (lado === 'entrada') return { ...c, entrada: pinza(segundoFuente, 0, c.salida - DURACION_MINIMA) }
    return { ...c, salida: pinza(segundoFuente, c.entrada + DURACION_MINIMA, duracionFuente) }
  })
  return conClips(tl, clips)
}

// ===== Edición fina (las herramientas de Premiere): recorte rodado, deslizar el contenido y desplazar el clip =====

/** Lo que puede durar una fuente (un video, su duración; una imagen, hasta MAX_IMAGEN). */
type DuracionDe = (fuente: FuenteId) => number

/**
 * Recorte rodado (N en Premiere): corre el corte entre el clip `indice` y el siguiente `dt` segundos de la timeline.
 * Uno se alarga lo que el otro se acorta: la duración total y todo lo demás no se mueven.
 */
export function rodarCorte(tl: Timeline, indice: number, dt: number, duracionDe: DuracionDe): Timeline {
  const a = tl.clips[indice]
  const b = tl.clips[indice + 1]
  if (!a || !b || !Number.isFinite(dt)) return tl
  const va = velocidadEnFuente(a, a.salida)
  const vb = velocidadEnFuente(b, b.entrada)
  // Lo más que se puede correr: a no pasa del final de su fuente ni b de su principio, y ninguno baja del mínimo.
  const max = Math.min((duracionDe(a.fuente) - a.salida) / va, (b.salida - b.entrada) / vb - DURACION_MINIMA)
  const min = Math.max(-((a.salida - a.entrada) / va - DURACION_MINIMA), -b.entrada / vb)
  const d = pinza(dt, Math.min(0, min), Math.max(0, max))
  if (Math.abs(d) < EPSILON) return tl
  const clips = [...tl.clips]
  clips[indice] = { ...a, salida: a.salida + d * va }
  clips[indice + 1] = { ...b, entrada: b.entrada + d * vb }
  return { ...tl, clips }
}

/**
 * Deslizar el contenido (Y en Premiere): el clip queda en su sitio y con su duración, pero muestra otro tramo de su
 * fuente, `dt` segundos de la timeline más adelante (o atrás, negativo).
 */
export function deslizarContenido(tl: Timeline, id: string, dt: number, duracionDe: DuracionDe): Timeline {
  const c = tl.clips.find((x) => x.id === id)
  if (!c || !Number.isFinite(dt)) return tl
  const v = velocidadDe(c)
  const d = pinza(dt * v, -c.entrada, duracionDe(c.fuente) - c.salida)
  if (Math.abs(d) < EPSILON) return tl
  return { ...tl, clips: tl.clips.map((x) => (x.id === id ? { ...x, entrada: x.entrada + d, salida: x.salida + d } : x)) }
}

/**
 * Desplazar el clip (U en Premiere): el clip se corre `dt` segundos sin cambiar lo que muestra; el anterior se alarga o
 * se acorta para seguirlo y el siguiente, al revés. Necesita un clip a cada lado; la duración total no cambia.
 */
export function desplazarClip(tl: Timeline, id: string, dt: number, duracionDe: DuracionDe): Timeline {
  const i = tl.clips.findIndex((x) => x.id === id)
  if (i <= 0 || i >= tl.clips.length - 1 || !Number.isFinite(dt)) return tl
  const p = tl.clips[i - 1]
  const n = tl.clips[i + 1]
  const vp = velocidadEnFuente(p, p.salida)
  const vn = velocidadEnFuente(n, n.entrada)
  const max = Math.min((duracionDe(p.fuente) - p.salida) / vp, (n.salida - n.entrada) / vn - DURACION_MINIMA)
  const min = Math.max(-((p.salida - p.entrada) / vp - DURACION_MINIMA), -n.entrada / vn)
  const d = pinza(dt, Math.min(0, min), Math.max(0, max))
  if (Math.abs(d) < EPSILON) return tl
  const clips = [...tl.clips]
  clips[i - 1] = { ...p, salida: p.salida + d * vp }
  clips[i + 1] = { ...n, entrada: n.entrada + d * vn }
  return { ...tl, clips }
}

/** La pista de sonidos (1 a PISTAS_SONIDOS) que está libre entre `a` y `b`, o la 1 si ninguna lo está. */
export function pistaSonidoLibre(tl: Timeline, a: number, b: number): number {
  for (let p = 1; p <= PISTAS_SONIDOS; p++) {
    const ocupada = (tl.sonidos ?? []).some((s) => (s.pista ?? 1) === p && s.inicio < b - 1e-3 && s.inicio + s.duracion > a + 1e-3)
    if (!ocupada) return p
  }
  return 1
}

/**
 * Separar el audio (desvincular, en Premiere): el clip queda mudo y su sonido pasa a ser un sonido suelto en el mismo
 * sitio (y a su volumen), que se mueve y se recorta aparte. `archivo` es el sonido ya sacado de su tramo.
 */
export function separarAudio(tl: Timeline, id: string, archivo: string, nombre: string, duracion: number): Timeline {
  const t = tramos(tl).find((x) => x.clip.id === id)
  if (!t) return tl
  const pista = pistaSonidoLibre(tl, t.inicio, t.inicio + duracion)
  const sonido: SonidoTL = {
    id: nuevoId('sonido'),
    inicio: t.inicio,
    duracion,
    largo: duracion,
    archivo,
    nombre,
    volumen: Math.min(1.5, t.clip.sonido?.volumen ?? 1),
    deClip: id,
    ...(pista > 1 ? { pista } : {})
  }
  const sonidos = normalizarSonidos([...(tl.sonidos ?? []), sonido], duracionTimeline(tl))
  return { ...silenciarClip(tl, id, true), sonidos }
}

/**
 * Multicámara con un solo sonido: todos los clips de las tomas quedan mudos y suena `archivo` (el sonido de una toma,
 * desde el principio de la escena) de principio a fin, como cuando en Premiere se usa el audio de una sola cámara.
 */
export function sonidoUnicoMulticam(tl: Timeline, archivo: string, nombre: string, duracion: number): Timeline {
  if (!tl.multicam) return tl
  const fuentes = new Set(tl.multicam.angulos.map((a) => a.fuente))
  const clips = tl.clips.map((c) => (fuentes.has(c.fuente) ? { ...c, mudo: true } : c))
  const pista = pistaSonidoLibre(tl, 0, duracion)
  const sonido: SonidoTL = { id: nuevoId('sonido'), inicio: 0, duracion, largo: duracion, archivo, nombre, volumen: 1, ...(pista > 1 ? { pista } : {}) }
  return { ...tl, clips, sonidos: normalizarSonidos([...(tl.sonidos ?? []), sonido], duracionTimeline(tl)) }
}

/** Dónde empieza la escena de la multicámara (en la primera toma) según el primer clip de la línea de tiempo. */
export function inicioEscenaMulticam(tl: Timeline): number | null {
  const c = tl.clips[0]
  const a = c && tl.multicam?.angulos.find((x) => x.fuente === c.fuente)
  return a ? c.entrada - a.desfase : null
}

/**
 * Sobrescribir (la tecla . de Premiere): el clip nuevo entra en el segundo `t` tapando lo que hay ahí, sin correr nada;
 * si se pasa del final, la timeline se alarga.
 */
export function sobrescribirClip(tl: Timeline, nuevo: { fuente: FuenteId; entrada: number; salida: number }, t: number): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const d = Math.max(DURACION_MINIMA, nuevo.salida - nuevo.entrada)
  if (t >= total - EPSILON || !tl.clips.length) return insertarClip(tl, nuevo)
  let base = t <= EPSILON ? tl : dividir(tl, t)
  if (t + d < total - DURACION_MINIMA) base = dividir(base, t + d)
  const lista = tramos(base)
  const quedan = lista.filter((x) => x.fin <= t + EPSILON || x.inicio >= t + d - EPSILON)
  const indice = quedan.findIndex((x) => x.inicio >= t + d - EPSILON)
  const id = nuevoId('clip')
  const clip: ClipTL = { id, fuente: nuevo.fuente, entrada: nuevo.entrada, salida: nuevo.entrada + d }
  const clips = quedan.map((x) => x.clip)
  clips.splice(indice < 0 ? clips.length : indice, 0, clip)
  return { timeline: { ...base, clips }, id }
}

/** Si esos clips de la pista de video van seguidos (para anidarlos). Devuelve sus índices en orden, o null. */
export function clipsSeguidos(tl: Timeline, ids: string[]): number[] | null {
  const indices = ids.map((id) => tl.clips.findIndex((c) => c.id === id)).filter((i) => i >= 0).sort((a, b) => a - b)
  if (indices.length < 2 || indices.length !== new Set(ids).size) return null
  return indices.every((v, k) => k === 0 || v === indices[k - 1] + 1) ? indices : null
}

/**
 * Anidar: los clips seguidos `ids` pasan a ser un solo clip de `fuente` (su render), que guarda los de dentro para
 * poder desanidarlos. Lo de las otras pistas no se mueve: dura lo mismo.
 */
export function anidarClips(tl: Timeline, ids: string[], fuente: FuenteId, duracion: number): { timeline: Timeline; id: string } {
  const indices = clipsSeguidos(tl, ids)
  if (!indices) return { timeline: tl, id: '' }
  const dentro = indices.map((i) => tl.clips[i])
  const id = nuevoId('clip')
  const nuevo: ClipTL = { id, fuente, entrada: 0, salida: Math.max(DURACION_MINIMA, duracion), anidado: dentro }
  const clips = [...tl.clips]
  clips.splice(indices[0], indices.length, nuevo)
  return { timeline: conClips(tl, clips), id }
}

/** Desanidar: el clip vuelve a ser los clips que tenía dentro (lo que se le hizo al anidado se pierde). */
export function desanidarClip(tl: Timeline, id: string): Timeline {
  const i = tl.clips.findIndex((c) => c.id === id)
  const c = tl.clips[i]
  if (!c?.anidado?.length) return tl
  const clips = [...tl.clips]
  clips.splice(i, 1, ...c.anidado.map((x) => ({ ...x, id: x.id || nuevoId('clip') })))
  return conClips(tl, clips)
}

/** Lleva un clip a otra posición de la pista principal. */
export function moverClip(tl: Timeline, id: string, destino: number): Timeline {
  const origen = tl.clips.findIndex((c) => c.id === id)
  if (origen < 0) return tl
  const clips = [...tl.clips]
  const [clip] = clips.splice(origen, 1)
  clips.splice(pinza(destino, 0, clips.length), 0, clip)
  return { ...tl, clips }
}

export function duplicarClip(tl: Timeline, id: string): Timeline {
  const indice = tl.clips.findIndex((c) => c.id === id)
  if (indice < 0) return tl
  const clips = [...tl.clips]
  clips.splice(indice + 1, 0, { ...tl.clips[indice], id: nuevoId('clip') })
  return { ...tl, clips }
}

/** Borra un tramo de la timeline (de `desde` a `hasta`) partiendo los clips que toque. */
export function borrarTramo(tl: Timeline, desde: number, hasta: number): Timeline {
  const a = Math.min(desde, hasta)
  const b = Math.max(desde, hasta)
  if (b - a < DURACION_MINIMA / 2) return tl
  const clips: ClipTL[] = []
  for (const tr of tramos(tl)) {
    if (tr.fin <= a || tr.inicio >= b) {
      clips.push(tr.clip)
      continue
    }
    const corteA = fuenteEnClip(tr.clip, Math.max(0, a - tr.inicio))
    const corteB = fuenteEnClip(tr.clip, Math.min(largo(tr.clip), b - tr.inicio))
    if (corteA - tr.clip.entrada >= DURACION_MINIMA) clips.push({ ...tr.clip, salida: corteA })
    if (tr.clip.salida - corteB >= DURACION_MINIMA) {
      clips.push({ ...tr.clip, id: corteA - tr.clip.entrada >= DURACION_MINIMA ? nuevoId('clip') : tr.clip.id, entrada: corteB })
    }
  }
  return conClips(tl, clips)
}

/** Cambia zoom o color de un clip (o de todos si `id` es null). Los valores se pinzan. */
export function ajustarClip(tl: Timeline, id: string | null, cambio: AjustesClip): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (id !== null && c.id !== id) return c
      const ajustes = normalizarAjustes({ ...ajustesDe(c), ...cambio })
      const { ajustes: _viejos, ...resto } = c
      return ajustes ? { ...resto, ajustes } : resto
    })
  }
}

export function ponerMusica(tl: Timeline, musica: MusicaTL | undefined): Timeline {
  const { musica: _vieja, ...resto } = tl
  const valida = normalizarMusica(musica)
  return valida ? { ...resto, musica: valida } : resto
}

export function cambiarMusica(tl: Timeline, cambio: Partial<Pick<MusicaTL, 'volumen' | 'ducking'>>): Timeline {
  if (!tl.musica) return tl
  return ponerMusica(tl, { ...tl.musica, ...cambio })
}

/** Lo que dura un clip de imagen al ponerlo (luego se estira como cualquier clip). */
export const DURACION_IMAGEN = 4
/** Lo más que puede durar un clip de imagen. */
export const MAX_IMAGEN = 600

/**
 * Pone un clip de `fuente` en la timeline: al final, o en el segundo `en` (si cae dentro de
 * un clip, lo divide y entra en medio). Devuelve la timeline y el id del clip nuevo.
 */
export function insertarClip(
  tl: Timeline,
  nuevo: { fuente: FuenteId; entrada: number; salida: number },
  en?: number
): { timeline: Timeline; id: string } {
  const clip: ClipTL = { id: nuevoId('clip'), fuente: nuevo.fuente, entrada: nuevo.entrada, salida: Math.max(nuevo.entrada + DURACION_MINIMA, nuevo.salida) }
  if (en === undefined || tl.clips.length === 0 || en >= duracionTimeline(tl) - EPSILON) {
    return { timeline: { ...tl, clips: [...tl.clips, clip] }, id: clip.id }
  }
  let base = en <= EPSILON ? tl : dividir(tl, en)
  // El clip nuevo entra justo después del que acaba en `en`.
  const lista = tramos(base)
  let indice = en <= EPSILON ? 0 : lista.findIndex((t) => Math.abs(t.fin - en) < 0.02) + 1
  if (indice <= 0) indice = lista.findIndex((t) => t.inicio >= en - EPSILON)
  if (indice < 0) indice = lista.length
  const clips = [...base.clips]
  clips.splice(indice, 0, clip)
  base = { ...base, clips }
  return { timeline: base, id: clip.id }
}

/**
 * El negro de relleno de la pista de video: un clip negro, como una foto, que alarga el video. Lo pone estirar una
 * capa más allá del final (como en CapCut): la foto de encima sigue y el video dura hasta donde acaba ella.
 */
export const FUENTE_NEGRO: FuenteId = 'negro'

/** El final de lo que se ve en la pista de video sin el negro de relleno del final. */
export function finSinNegro(tl: Timeline): number {
  let n = tl.clips.length
  while (n > 0 && tl.clips[n - 1].fuente === FUENTE_NEGRO) n--
  return tl.clips.slice(0, n).reduce((t, c) => t + largo(c), 0)
}

/**
 * Deja el negro del final justo para que el video llegue hasta `fin`, y hasta donde acaba lo demás de encima (capas y
 * textos, menos la capa `sin`, que es la que se está moviendo). Si todo cabe en el video, el negro sobra y se quita.
 * Solo toca el negro de relleno del final, nunca los clips de verdad.
 */
export function conNegroHasta(tl: Timeline, fin: number, sin?: string): Timeline {
  let n = tl.clips.length
  while (n > 0 && tl.clips[n - 1].fuente === FUENTE_NEGRO) n--
  const quitados = tl.clips.slice(n)
  const real = tl.clips.slice(0, n)
  const hasta = real.reduce((t, c) => t + largo(c), 0)
  if (!real.length) return tl
  let necesario = fin
  for (const c of tl.capas ?? []) if (c.id !== sin) necesario = Math.max(necesario, c.inicio + c.duracion)
  for (const x of tl.textos) necesario = Math.max(necesario, x.inicio + x.duracion)
  // Un audio que empieza en el negro no se queda fuera.
  for (const a of [...(tl.voces ?? []), ...(tl.sonidos ?? [])]) necesario = Math.max(necesario, a.inicio + DURACION_MINIMA)
  const falta = Math.round(Math.min(MAX_IMAGEN, necesario - hasta) * 1000) / 1000
  const clips =
    falta >= DURACION_MINIMA
      ? [...real, { ...(quitados[0] ?? {}), id: quitados[0]?.id ?? nuevoId('clip'), fuente: FUENTE_NEGRO, entrada: 0, salida: falta }]
      : real
  if (clips.length === tl.clips.length && clips.every((c, i) => c === tl.clips[i] || (c.id === tl.clips[i].id && Math.abs(largo(c) - largo(tl.clips[i])) < 1e-4))) return tl
  return conClips(tl, clips)
}

/** Lo que puede durar cada medio del proyecto (para validar y recortar sus clips). */
export function duracionesDeMedios(medios?: { id: string; tipo: 'video' | 'imagen'; duracion: number }[]): Record<string, number> {
  return Object.fromEntries((medios ?? []).map((m) => [m.id, m.tipo === 'imagen' ? MAX_IMAGEN : m.duracion]))
}

/** Quita de la timeline todos los clips de una fuente (al quitar un medio del proyecto). */
export function quitarFuente(tl: Timeline, fuente: FuenteId): Timeline {
  const sin = conClips(tl, tl.clips.filter((c) => c.fuente !== fuente))
  // Sus capas encima también se van.
  return sin.capas?.some((c) => c.fuente === fuente) ? sin.capas.filter((c) => c.fuente === fuente).reduce((t, c) => borrarCapa(t, c.id), sin) : sin
}

export function anadirTexto(tl: Timeline, inicio: number, texto = 'Texto'): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const id = nuevoId('texto')
  if (total < DURACION_MINIMA) return { timeline: tl, id }
  const desde = pinza(inicio, 0, Math.max(0, total - DURACION_MINIMA))
  const nuevo: TextoTL = {
    id,
    inicio: desde,
    duracion: Math.min(3, total - desde),
    texto,
    posicion: 'abajo'
  }
  return { timeline: { ...tl, textos: [...tl.textos, nuevo] }, id }
}

/** Cambia un rótulo; posición y duración siempre quedan dentro de la timeline. */
export function cambiarTexto(tl: Timeline, id: string, cambio: Partial<Omit<TextoTL, 'id'>>): Timeline {
  const total = duracionTimeline(tl)
  return {
    ...tl,
    textos: tl.textos.map((x) => {
      if (x.id !== id) return x
      const junto: Partial<TextoTL> = { ...x, ...cambio }
      for (const k of [...CAMPOS_ESTILO_TEXTO, 'x', 'y', 'tiempos'] as const) delete junto[k]
      const base = junto as TextoTL
      // Elegir arriba, centro o abajo suelta la posición libre; mover el rótulo la fija.
      const libre = cambio.posicion !== undefined && cambio.x === undefined ? {} : posicionLibre({ ...x, ...cambio })
      const nuevo: TextoTL = { ...base, ...estiloTexto({ ...x, ...cambio }), ...libre }
      nuevo.inicio = pinza(nuevo.inicio, 0, Math.max(0, total - DURACION_MINIMA))
      nuevo.duracion = pinza(nuevo.duracion, DURACION_MINIMA, Math.max(DURACION_MINIMA, total - nuevo.inicio))
      // Los tiempos de cada palabra siguen si el texto tiene las mismas palabras (se corrige una letra, no se reescribe).
      const tiempos = normalizarTiempos(cambio.tiempos ?? x.tiempos, nuevo.texto, nuevo.duracion)
      if (tiempos) nuevo.tiempos = tiempos
      if (!nuevo.subtitulo) delete nuevo.subtitulo
      if (!nuevo.detras) delete nuevo.detras
      if (!nuevo.oculto) delete nuevo.oculto
      // Sus fotogramas clave, dentro de lo que dura (si cambió).
      const claves = normalizarClavesTexto(nuevo.claves, nuevo.duracion)
      if (claves) nuevo.claves = claves
      else delete nuevo.claves
      if (!nuevo.bloqueado) delete nuevo.bloqueado
      // El giro y la alineación van sobre su punto de anclaje: sin posición libre no hay.
      if (typeof nuevo.x !== 'number') {
        delete nuevo.giro
        delete nuevo.alineacion
      }
      return nuevo
    })
  }
}

export function borrarTexto(tl: Timeline, id: string): Timeline {
  return { ...tl, textos: tl.textos.filter((x) => x.id !== id) }
}

// ===== La narración =====

/** En qué tramos suena la narración (para bajar la música y dibujar la pista). */
export function tramosDeVoces(tl: Timeline): { inicio: number; fin: number }[] {
  return (tl.voces ?? []).map((v) => ({ inicio: v.inicio, fin: v.inicio + v.duracion }))
}

/** Cambia una frase (su segundo, su volumen, su texto o su audio). Siempre empieza dentro de la timeline. */
/** Una frase sin su recorte (para cuando cambia su audio). */
export function sinRecorteVoz(v: VozTL): VozTL {
  const { desde: _d, largo: _l, ...resto } = v
  return resto
}

/** Divide una frase de la narración en el segundo `t`: quedan dos que siguen sonando igual. */
export function dividirVoz(tl: Timeline, id: string, t: number): { timeline: Timeline; id?: string } {
  const v = tl.voces?.find((x) => x.id === id)
  if (!v) return { timeline: tl }
  const primero = t - v.inicio
  if (primero < DURACION_MINIMA || v.duracion - primero < DURACION_MINIMA) return { timeline: tl }
  const largo = v.largo ?? (v.desde ?? 0) + v.duracion
  const nuevo: VozTL = { ...v, id: nuevoId('voz'), inicio: t, duracion: v.duracion - primero, desde: (v.desde ?? 0) + primero, largo }
  const voces = normalizarVoces(
    tl.voces!.flatMap((x) => (x.id === id ? [{ ...x, duracion: primero, largo }, nuevo] : [x])),
    duracionTimeline(tl)
  )
  return { timeline: { ...tl, voces }, id: nuevo.id }
}

export function cambiarVoz(tl: Timeline, id: string, cambio: Partial<Omit<VozTL, 'id'>>): Timeline {
  if (!tl.voces?.some((v) => v.id === id)) return tl
  const total = duracionTimeline(tl)
  const voces = normalizarVoces(
    tl.voces.map((v) => {
      if (v.id !== id) return v
      // Un audio nuevo (la frase rehecha) suena entero: el recorte del anterior no vale para él.
      const base = cambio.archivo && cambio.archivo !== v.archivo ? sinRecorteVoz(v) : v
      return { ...base, ...cambio, inicio: pinza(cambio.inicio ?? v.inicio, 0, Math.max(0, total - DURACION_MINIMA)) }
    }),
    total
  )
  return { ...tl, voces }
}

export function borrarVoz(tl: Timeline, id: string): Timeline {
  if (!tl.voces?.some((v) => v.id === id)) return tl
  const voces = tl.voces.filter((v) => v.id !== id)
  const { voces: _antes, ...resto } = tl
  return voces.length ? { ...resto, voces } : resto
}

/** Quita el sonido de un clip o se lo devuelve. */
export function silenciarClip(tl: Timeline, id: string, mudo: boolean): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const { mudo: _antes, ...resto } = c
      return mudo ? { ...resto, mudo: true } : resto
    })
  }
}

/** El sonido de un clip, con lo neutro puesto (volumen 1, sin fundidos, sin limpiar). */
export function sonidoDe(c: Pick<ClipTL, 'sonido'> | undefined): Required<SonidoClip> {
  return {
    volumen: c?.sonido?.volumen ?? 1,
    entra: c?.sonido?.entra ?? 0,
    sale: c?.sonido?.sale ?? 0,
    limpio: c?.sonido?.limpio ?? 0,
    realce: c?.sonido?.realce ?? 0,
    graves: c?.sonido?.graves ?? 0,
    medios: c?.sonido?.medios ?? 0,
    agudos: c?.sonido?.agudos ?? 0,
    comprimir: c?.sonido?.comprimir ?? 0
  }
}

/** Un compresor: umbral (dB), razón, ataque y suelta (segundos), rodilla (dB) y la ganancia de después (veces). */
export interface CompresorSonido {
  umbral: number
  razon: number
  ataque: number
  suelta: number
  rodilla: number
  maquillaje: number
}

/**
 * La cadena de sonido de un clip (mejorar voz, ecualizador de 3 bandas y compresor) con sus números: la misma en el
 * monitor (filtros del navegador) y en el MP4 (FFmpeg), con las mismas fórmulas de filtro (las del «cookbook» de RBJ).
 */
export function cadenaSonido(s: Required<SonidoClip>): {
  realce: { pasoAlto: number; compresor: CompresorSonido; presencia: number; presenciaQ: number } | null
  eq: { graves: number; fGraves: number; medios: number; fMedios: number; qMedios: number; agudos: number; fAgudos: number }
  compresor: CompresorSonido | null
} {
  return {
    realce:
      s.realce > 0.005
        ? {
            pasoAlto: Math.round(60 + 40 * s.realce),
            compresor: { umbral: -14 - 10 * s.realce, razon: 2 + 2 * s.realce, ataque: 0.008, suelta: 0.12, rodilla: 2.828, maquillaje: 1 + 1.5 * s.realce },
            presencia: 4 * s.realce,
            presenciaQ: 1.2
          }
        : null,
    eq: { graves: s.graves, fGraves: 120, medios: s.medios, fMedios: 1000, qMedios: 1, agudos: s.agudos, fAgudos: 8000 },
    compresor: s.comprimir > 0.005 ? { umbral: -10 - 20 * s.comprimir, razon: 2 + 4 * s.comprimir, ataque: 0.01, suelta: 0.15, rodilla: 2.828, maquillaje: 1 + 1.2 * s.comprimir } : null
  }
}

/** La cadena de sonido como filtros de FFmpeg (empiezan con coma), en el mismo orden que el monitor. */
export function filtrosSonido(s: Required<SonidoClip>): string {
  const p = cadenaSonido(s)
  const comp = (c: CompresorSonido) =>
    `acompressor=threshold=${c.umbral.toFixed(1)}dB:ratio=${c.razon.toFixed(2)}:attack=${Math.round(c.ataque * 1000)}:release=${Math.round(c.suelta * 1000)}:knee=${c.rodilla.toFixed(3)}:makeup=${c.maquillaje.toFixed(2)}`
  let f = ''
  if (p.realce) f += `,highpass=f=${p.realce.pasoAlto},${comp(p.realce.compresor)},equalizer=f=3000:t=q:w=${p.realce.presenciaQ}:g=${p.realce.presencia.toFixed(2)}`
  if (Math.abs(p.eq.graves) > 0.05) f += `,bass=g=${p.eq.graves.toFixed(1)}:f=${p.eq.fGraves}:t=s:w=0.5`
  if (Math.abs(p.eq.medios) > 0.05) f += `,equalizer=f=${p.eq.fMedios}:t=q:w=${p.eq.qMedios}:g=${p.eq.medios.toFixed(1)}`
  if (Math.abs(p.eq.agudos) > 0.05) f += `,treble=g=${p.eq.agudos.toFixed(1)}:f=${p.eq.fAgudos}:t=s:w=0.5`
  if (p.compresor) f += `,${comp(p.compresor)}`
  return f
}

/** Deja el sonido de un clip dentro de sus límites; los fundidos caben en lo que dura (`largo`, en la timeline). */
export function normalizarSonidoClip(entrada: unknown, largo: number): SonidoClip | undefined {
  if (!entrada || typeof entrada !== 'object') return undefined
  const x = entrada as Record<string, unknown>
  const salida: SonidoClip = {}
  for (const clave of ['volumen', 'entra', 'sale', 'limpio', 'realce', 'graves', 'medios', 'agudos', 'comprimir'] as const) {
    const v = x[clave]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const [min, max, neutro] = LIMITES_SONIDO_CLIP[clave]
    const tope = clave === 'entra' || clave === 'sale' ? Math.min(max, Math.max(0, largo)) : max
    const valor = Math.round(pinza(v, min, tope) * 100) / 100
    if (Math.abs(valor - neutro) >= 0.005) salida[clave] = valor
  }
  // Los dos fundidos juntos no pueden durar más que el clip.
  const suma = (salida.entra ?? 0) + (salida.sale ?? 0)
  if (suma > largo && suma > 0) {
    if (salida.entra) salida.entra = Math.round(((salida.entra * largo) / suma) * 100) / 100
    if (salida.sale) salida.sale = Math.round(((salida.sale * largo) / suma) * 100) / 100
  }
  return Object.keys(salida).length ? salida : undefined
}

/** Tras partir o recortar: los fundidos de cada clip vuelven a caber en lo que dura. */
function normalizarSonidos2(tl: Timeline): Timeline {
  if (!tl.clips.some((c) => c.sonido)) return tl
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (!c.sonido) return c
      const { sonido, ...resto } = c
      const s = normalizarSonidoClip(sonido, largo(c))
      return s ? { ...resto, sonido: s } : resto
    })
  }
}

/** Cambia el sonido de un clip (volumen, fundidos, limpieza). */
export function ajustarSonidoClip(tl: Timeline, id: string, cambio: SonidoClip): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const { sonido, ...resto } = c
      const s = normalizarSonidoClip({ ...(sonido ?? {}), ...cambio }, largo(c))
      return s ? { ...resto, sonido: s } : resto
    })
  }
}

/** A qué volumen suena un clip `dt` segundos después de empezar (con sus fundidos), de 0 a 1.5. */
export function volumenClipEn(c: Pick<ClipTL, 'sonido' | 'clavesVolumen'>, dt: number, largoClip: number, fFuente?: number): number {
  const s = sonidoDe(c)
  const sube = s.entra > 0 ? pinza(dt / s.entra, 0, 1) : 1
  const baja = s.sale > 0 ? pinza((largoClip - dt) / s.sale, 0, 1) : 1
  // Con fotogramas clave, el volumen es el de este segundo de la fuente.
  const base = c.clavesVolumen?.length && fFuente !== undefined ? valorClave(c.clavesVolumen, fFuente) : s.volumen
  return base * sube * baja
}

/** Las claves de volumen válidas (0 a 1.5, una por cuadro, ordenadas). */
export function normalizarClavesVolumen(entrada: unknown): ClaveTL[] | undefined {
  if (!Array.isArray(entrada)) return undefined
  const puntos: ClaveTL[] = []
  for (const x of [...entrada].sort((a, b) => (a?.f ?? 0) - (b?.f ?? 0))) {
    if (!x || typeof x.f !== 'number' || typeof x.v !== 'number' || !Number.isFinite(x.f) || !Number.isFinite(x.v)) continue
    const punto = { f: Math.round(Math.max(0, x.f) * 1000) / 1000, v: Math.round(pinza(x.v, 0, LIMITES_SONIDO_CLIP.volumen[1]) * 1000) / 1000 }
    if (puntos.length && punto.f - puntos[puntos.length - 1].f < MISMA_CLAVE) puntos[puntos.length - 1] = punto
    else puntos.push(punto)
  }
  return puntos.length ? puntos.slice(0, MAX_CLAVES) : undefined
}

/** Pone (o cambia) una clave de volumen del clip en el segundo `f` de su fuente. */
export function ponerClaveVolumen(tl: Timeline, id: string, f: number, v: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id) return c
      const lista = normalizarClavesVolumen([...(c.clavesVolumen ?? []).filter((x) => Math.abs(x.f - f) >= MISMA_CLAVE), { f, v }])
      return lista ? { ...c, clavesVolumen: lista } : c
    })
  }
}

/** Mueve en el tiempo una clave de volumen del clip. */
export function moverClaveVolumen(tl: Timeline, id: string, de: number, a: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id || !c.clavesVolumen) return c
      const lista = normalizarClavesVolumen(moverClaveEnLista(c.clavesVolumen, de, pinza(a, c.entrada, c.salida)))
      return lista ? { ...c, clavesVolumen: lista } : c
    })
  }
}

/** Quita la clave de volumen del segundo `f` (y las claves, si no queda ninguna). */
export function quitarClaveVolumen(tl: Timeline, id: string, f: number): Timeline {
  return {
    ...tl,
    clips: tl.clips.map((c) => {
      if (c.id !== id || !c.clavesVolumen) return c
      const quedan = c.clavesVolumen.filter((x) => Math.abs(x.f - f) >= MISMA_CLAVE)
      const { clavesVolumen: _c, ...resto } = c
      return quedan.length ? { ...resto, clavesVolumen: quedan } : resto
    })
  }
}

/** Añade una frase de narración (su audio ya está en `media/`). Devuelve la timeline y su id. */
export function anadirVoz(tl: Timeline, frase: Omit<VozTL, 'id'>): { timeline: Timeline; id: string } {
  const id = nuevoId('voz')
  const voces = normalizarVoces([...(tl.voces ?? []), { ...frase, id }], duracionTimeline(tl))
  if (!voces.some((v) => v.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, voces }, id }
}

// ===== Lo que va encima del video (capas) =====

/** Las capas visibles en el segundo `t`, de abajo a arriba. */
export function capasEn(tl: Timeline, t: number): CapaTL[] {
  return capasEnOrden((tl.capas ?? []).filter((c) => t >= c.inicio && t < c.inicio + c.duracion))
}

/** Pone un medio encima del video. `medios`: lo que dura cada uno (para validar). */
export function anadirCapa(tl: Timeline, capa: Omit<CapaTL, 'id'>, medios: Record<string, number>): { timeline: Timeline; id: string } {
  const id = nuevoId('capa')
  const capas = normalizarCapas([...(tl.capas ?? []), { ...capa, id }], duracionTimeline(tl), medios)
  if (!capas.some((c) => c.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, capas }, id }
}

/**
 * Una capa nueva con lo de siempre: una imagen 3 s y al 25 % del ancho, un video hasta 5 s y al
 * 40 %, con «pop», en el segundo `t` y donde se suelte (`x`, `y`; por defecto, al centro).
 */
export function capaNueva(
  tl: Timeline,
  fuente: string,
  tipo: 'video' | 'imagen',
  t: number,
  medios: Record<string, number>,
  x = 0.5,
  y = 0.5
): { timeline: Timeline; id: string } {
  const total = duracionTimeline(tl)
  const inicio = Math.max(0, Math.min(t, total - DURACION_MINIMA))
  const largo = tipo === 'imagen' ? 3 : Math.min(Math.max(DURACION_MINIMA, medios[fuente] ?? 3), 5)
  return anadirCapa(
    tl,
    { fuente, inicio, duracion: Math.min(largo, Math.max(DURACION_MINIMA, total - inicio)), x, y, ancho: tipo === 'imagen' ? 0.25 : 0.4, entrada: 'pop' },
    medios
  )
}

export function cambiarCapa(tl: Timeline, id: string, cambio: Partial<Omit<CapaTL, 'id'>>, medios: Record<string, number>): Timeline {
  if (!tl.capas?.some((c) => c.id === id)) return tl
  const capas = normalizarCapas(
    tl.capas.map((c) => {
      if (c.id !== id) return c
      const nueva = { ...c, ...cambio }
      // `entrada: undefined` en el cambio la quita (entra de golpe); `fin: undefined`, el movimiento.
      if ('entrada' in cambio && !cambio.entrada) delete nueva.entrada
      if ('salida' in cambio && !cambio.salida) delete nueva.salida
      if ('fin' in cambio && !cambio.fin) delete nueva.fin
      if ('animada' in cambio && !cambio.animada) delete nueva.animada
      if ('profundidad' in cambio && cambio.profundidad == null) delete nueva.profundidad
      if ('claves' in cambio && !cambio.claves) delete nueva.claves
      if ('fusion' in cambio && !cambio.fusion) delete nueva.fusion
      if ('sigue' in cambio && !cambio.sigue) delete nueva.sigue
      return nueva
    }),
    duracionTimeline(tl),
    medios
  )
  return { ...tl, capas }
}

export function borrarCapa(tl: Timeline, id: string): Timeline {
  if (!tl.capas?.some((c) => c.id === id)) return tl
  const capas = tl.capas.filter((c) => c.id !== id)
  const { capas: _antes, ...resto } = tl
  return capas.length ? { ...resto, capas } : resto
}

/** Lo que tarda en llegar una capa que entra desde un lado. */
export const ENTRADA_LADO_S = 0.45
const suave = (p: number) => 3 * p * p - 2 * p * p * p
const frena = (p: number) => 1 - (1 - p) ** 3

/** Dónde arranca una capa que entra desde un lado (fuera del cuadro). */
export function origenLado(c: Pick<CapaTL, 'entrada' | 'ancho'>): { x?: number; y?: number } {
  return fueraPor(c.entrada, c.ancho)
}
/** Adónde se va una capa que sale por un lado (fuera del cuadro). */
export function destinoLado(c: Pick<CapaTL, 'salida' | 'ancho'>): { x?: number; y?: number } {
  return fueraPor(c.salida, c.ancho)
}
function fueraPor(lado: string | undefined, ancho: number): { x?: number; y?: number } {
  if (lado === 'izquierda') return { x: -ancho / 2 - 0.02 }
  if (lado === 'derecha') return { x: 1 + ancho / 2 + 0.02 }
  if (lado === 'arriba') return { y: -0.35 }
  if (lado === 'abajo') return { y: 1.35 }
  return {}
}

/** Lo que dura la entrada de una capa: la suya o la de su tipo. */
export function durEntradaCapa(c: Pick<CapaTL, 'entrada' | 'durEntrada'>): number {
  if (!c.entrada) return 0
  return c.durEntrada ?? (c.entrada === 'pop' ? 0.24 : c.entrada === 'fundido' ? 0.35 : ENTRADA_LADO_S)
}
/** Lo que dura la salida de una capa: la suya o la de su tipo. */
export function durSalidaCapa(c: Pick<CapaTL, 'salida' | 'durSalida'>): number {
  if (!c.salida) return 0
  return c.durSalida ?? (c.salida === 'encoger' ? 0.24 : c.salida === 'fundido' ? 0.35 : ENTRADA_LADO_S)
}
/** Cuándo termina de verdad una capa o un texto (segundos desde que aparece): con lo que se le cortó al final. */
export const finReal = (x: { duracion: number; cola?: number }): number => x.duracion + (x.cola ?? 0)

/**
 * Dónde está una capa `dt` segundos después de aparecer: su recorrido (de su sitio a `fin`, suave) y
 * su entrada (pop, fundido o desde un lado). `conEntrada: false` la deja sin la entrada (para editarla).
 */
export function estadoCapa(c: CapaTL, dt: number, conEntrada = true): { x: number; y: number; ancho: number; giro: number; escala: number; opacidad: number; desenfoque: number } {
  const p = c.fin ? suave(pinza(dt / Math.max(DURACION_MINIMA, c.duracion), 0, 1)) : 0
  const f = c.fin
  const k = c.claves
  // Si sigue algo del video, su sitio es el de ese algo (más la distancia que tenía).
  const s = c.sigue ? puntoEn(c.sigue.puntos, dt) : null
  let x = s ? s.x + c.sigue!.dx : k?.x ? valorClave(k.x, dt) : f ? c.x + (f.x - c.x) * p : c.x
  let y = s ? s.y + c.sigue!.dy : k?.y ? valorClave(k.y, dt) : f ? c.y + (f.y - c.y) * p : c.y
  const ancho = k?.ancho ? valorClave(k.ancho, dt) : f ? c.ancho + (f.ancho - c.ancho) * p : c.ancho
  const giro = k?.giro ? valorClave(k.giro, dt) : f ? (c.giro ?? 0) + (f.giro - (c.giro ?? 0)) * p : (c.giro ?? 0)
  // La opacidad de sus claves (se suma a la de la entrada).
  const vista = k?.opacidad ? valorClave(k.opacidad, dt) : 1
  // Su desenfoque propio (el de la profundidad de campo se suma aparte: desenfoqueCapaEn).
  const desenfoque = k?.desenfoque ? valorClave(k.desenfoque, dt) : (c.desenfoque ?? 0)
  if (!conEntrada) return { x, y, ancho, giro, escala: 1, opacidad: vista, desenfoque }
  const lado = origenLado(c)
  if (lado.x !== undefined || lado.y !== undefined) {
    const k = frena(pinza(dt / durEntradaCapa(c), 0, 1))
    if (lado.x !== undefined) x = lado.x + (x - lado.x) * k
    if (lado.y !== undefined) y = lado.y + (y - lado.y) * k
  }
  // Sale por un lado: arranca despacio y se va acelerando (al revés que la entrada).
  const destino = destinoLado(c)
  if (destino.x !== undefined || destino.y !== undefined) {
    const p = 1 - pinza((finReal(c) - dt) / durSalidaCapa(c), 0, 1)
    const k = p * p * p
    if (destino.x !== undefined) x = x + (destino.x - x) * k
    if (destino.y !== undefined) y = y + (destino.y - y) * k
  }
  const { escala, opacidad } = animacionCapa(c, dt)
  return { x, y, ancho, giro, escala, opacidad: opacidad * vista, desenfoque }
}

// ===== Escena 2.5D =====

/** Cuánto más que el fondo se mueve una capa muy cercana (profundidad 1): 1 + PARALAJE veces. */
export const PARALAJE = 1.5
/** El desenfoque más fuerte (1), en fracción del ancho del cuadro (es la desviación del desenfoque gaussiano). */
export const DESENFOQUE_MAX = 0.012

/**
 * El clip sobre el que está una capa con profundidad (el que hay bajo ella cuando aparece): su cámara
 * es la de la escena. La capa sigue a ese clip aunque dure más que él (se queda en su último encuadre).
 */
export interface TramoCamara {
  inicio: number
  largo: number
  ajustes: Required<AjustesClip>
}

/**
 * La cámara que sigue una capa con profundidad: la del clip que hay debajo al aparecer y, mientras dura, la de
 * los demás clips de la MISMA imagen o video (otro encuadre de la misma escena: el fondo cambia de toma y las
 * capas con él, calzadas). Con otra imagen debajo, se queda en el último encuadre de su escena.
 */
export function referenciaParalaje(tl: Timeline, c: CapaTL): (TramoCamara & { tramos: TramoCamara[] }) | null {
  if (c.profundidad == null) return null
  const base = ubicar(tl, c.inicio + 1e-3)
  if (!base) return null
  const fin = c.inicio + c.duracion
  const mismos = tramos(tl)
    .filter((x) => x.clip.fuente === base.clip.fuente && x.fin > c.inicio && x.inicio < fin)
    .map((x) => ({ inicio: x.inicio, largo: Math.max(0.01, x.fin - x.inicio), ajustes: ajustesDe(x.clip) }))
  return { inicio: base.inicio, largo: Math.max(0.01, base.fin - base.inicio), ajustes: ajustesDe(base.clip), tramos: mismos }
}

/** El tramo de la escena cuya cámara manda en el segundo `t` (el que está en pantalla o el último que pasó). */
export function tramoEscena(ref: TramoCamara & { tramos?: TramoCamara[] }, t: number): TramoCamara {
  const lista = ref.tramos?.length ? ref.tramos : [ref]
  let elegido = lista[0]
  for (const x of lista) if (x.inicio <= t + 1e-6) elegido = x
  return elegido
}

/**
 * Dónde se ve una capa con profundidad en el segundo `t`: el fondo pasa de su encuadre al aparecer la
 * capa al de ahora (escala A y desplazamiento B), y la capa hace lo mismo multiplicado por su cercanía.
 * Un punto u del cuadro se ve en z·u_img − (z−1)·cx (el zoom hacia cx, como el crop y el CSS).
 */
export function aplicarParalaje(
  ref: TramoCamara & { tramos?: TramoCamara[] },
  profundidad: number,
  inicioCapa: number,
  t: number,
  e: { x: number; y: number; ancho: number }
): { x: number; y: number; ancho: number } {
  const r = camaraEn(ref.ajustes, (inicioCapa - ref.inicio) / ref.largo, inicioCapa - ref.inicio)
  const ahora = tramoEscena(ref, t)
  // Al empezar la toma de ahora (o al aparecer la capa, en la primera): en un corte a otro encuadre de la misma
  // escena, la capa se recoloca calzada con el fondo (sin multiplicar el salto) y luego se mueve con paralaje.
  const desde = Math.max(inicioCapa, ahora.inicio)
  const s = desde <= inicioCapa + 1e-6 ? r : camaraEn(ahora.ajustes, (desde - ahora.inicio) / ahora.largo, desde - ahora.inicio)
  const k = camaraEn(ahora.ajustes, (t - ahora.inicio) / ahora.largo, Math.min(ahora.largo, Math.max(0, t - ahora.inicio)))
  const m = 1 + PARALAJE * Math.min(1, Math.max(0, profundidad))
  const mover = (a: typeof r, b: typeof r, f: number, p: { x: number; y: number; ancho: number }) => {
    const A = b.z / a.z
    const bx = A * (a.z - 1) * a.cx - (b.z - 1) * b.cx
    const by = A * (a.z - 1) * a.cy - (b.z - 1) * b.cy
    return { x: p.x + f * (A * p.x + bx - p.x), y: p.y + f * (A * p.y + by - p.y), ancho: p.ancho * Math.pow(A, f) }
  }
  return mover(s, k, m, s === r ? e : mover(r, s, 1, e))
}

/**
 * El desenfoque con que se ve una capa: el suyo más el de la profundidad de campo del clip de debajo (si la
 * capa tiene profundidad).
 */
export function desenfoqueCapa(tl: Timeline, c: CapaTL): number {
  const ref = referenciaParalaje(tl, c)
  return Math.min(1, (c.desenfoque ?? 0) + (ref ? desenfoqueDeCampo(ref.ajustes, c.profundidad ?? 0) : 0))
}

/** Lo mismo en el segundo `dt` desde que aparece la capa: con fotogramas clave, su desenfoque cambia. */
export function desenfoqueCapaEn(tl: Timeline, c: CapaTL, dt: number): number {
  if (!c.claves?.desenfoque) return desenfoqueCapa(tl, c)
  const ref = referenciaParalaje(tl, c)
  return Math.min(1, valorClave(c.claves.desenfoque, dt) + (ref ? desenfoqueDeCampo(ref.ajustes, c.profundidad ?? 0) : 0))
}

/**
 * Tomas de cámara listas para un clip (con sus capas con profundidad, se ven en 3D): cambian zoom, acercamiento
 * y paneo. Lo demás del clip (color, temblor, foco) se queda.
 */
export const TOMAS_CAMARA: { id: string; nombre: string; para: string; ajustes: AjustesClip }[] = [
  { id: 'dolly-in', nombre: 'Acercarse (dolly in)', para: 'la cámara avanza hacia la escena: lo cercano crece más', ajustes: { zoom: 1.1, acercar: 0.18, panx: 0, pany: 0, cx: 0.5, cy: 0.5 } },
  { id: 'dolly-out', nombre: 'Alejarse (dolly out)', para: 'la cámara retrocede y revela', ajustes: { zoom: 1.35, acercar: -0.22, panx: 0, pany: 0, cx: 0.5, cy: 0.5 } },
  { id: 'travelling-derecha', nombre: 'Travelling →', para: 'la cámara se desliza a la derecha: lo cercano pasa más rápido', ajustes: { zoom: 1.25, acercar: 0.03, panx: 0.35, pany: 0, cx: 0.3, cy: 0.5 } },
  { id: 'travelling-izquierda', nombre: 'Travelling ←', para: 'la cámara se desliza a la izquierda', ajustes: { zoom: 1.25, acercar: 0.03, panx: -0.35, pany: 0, cx: 0.7, cy: 0.5 } },
  { id: 'grua-arriba', nombre: 'Grúa ↑', para: 'la cámara sube (de los pies al cielo)', ajustes: { zoom: 1.25, acercar: 0.02, panx: 0, pany: -0.4, cx: 0.5, cy: 0.75 } },
  { id: 'grua-abajo', nombre: 'Grúa ↓', para: 'la cámara baja hacia el protagonista', ajustes: { zoom: 1.25, acercar: 0.04, panx: 0, pany: 0.4, cx: 0.5, cy: 0.25 } },
  { id: 'empuje', nombre: 'Empuje a un detalle', para: 'avanza hacia un punto y lo encuadra', ajustes: { zoom: 1.05, acercar: 0.3, panx: 0.12, pany: -0.1, cx: 0.45, cy: 0.5 } }
]

/** Movimientos de una capa listos para usar (desde su sitio actual). */
export const MOVIMIENTOS_CAPA: { id: string; nombre: string; para: string; fin: (c: CapaTL) => FinCapa }[] = [
  { id: 'deriva', nombre: 'Deriva lenta', para: 'paralaje: se desliza un poco, como si la cámara se moviera', fin: (c) => ({ x: c.x + 0.05, y: c.y, ancho: c.ancho * 1.06, giro: c.giro ?? 0 }) },
  { id: 'acercar', nombre: 'Se acerca', para: 'crece despacio hacia la cámara', fin: (c) => ({ x: c.x, y: c.y, ancho: Math.min(1.5, c.ancho * 1.35), giro: c.giro ?? 0 }) },
  { id: 'cruzar', nombre: 'Cruza volando', para: 'atraviesa la pantalla de izquierda a derecha (un avión, un pájaro)', fin: (c) => ({ x: 1 + c.ancho / 2 + 0.05, y: c.y - 0.08, ancho: c.ancho, giro: c.giro ?? 0 }) },
  { id: 'subir', nombre: 'Sube', para: 'sube despacio (humo, un cohete)', fin: (c) => ({ x: c.x, y: c.y - 0.12, ancho: c.ancho, giro: c.giro ?? 0 }) },
  { id: 'girar', nombre: 'Gira', para: 'gira un poco mientras está', fin: (c) => ({ x: c.x, y: c.y, ancho: c.ancho, giro: (c.giro ?? 0) + 12 }) }
]

/** Cuánto ha crecido una capa en su entrada (0 a 1) y su opacidad, `dt` segundos después de aparecer. */
export function animacionCapa(c: CapaTL, dt: number): { escala: number; opacidad: number } {
  let escala = 1
  let opacidad = 1
  const de = durEntradaCapa(c)
  if (c.entrada === 'pop') {
    // Entra pequeña, se pasa un poco y se asienta (como un «pop»), en 0,24 s (o lo que dure su entrada).
    const q = (dt * 0.24) / de
    escala = q < 0.13 ? 0.45 + (q / 0.13) * 0.72 : q < 0.24 ? 1.17 - ((q - 0.13) / 0.11) * 0.17 : 1
    opacidad = Math.min(1, q / 0.08)
  } else if (c.entrada === 'fundido') opacidad = Math.min(1, dt / de)
  const ds = durSalidaCapa(c)
  if (ds) {
    const queda = Math.max(0, finReal(c) - dt)
    if (c.salida === 'fundido') opacidad *= Math.min(1, queda / ds)
    if (c.salida === 'encoger') {
      // Se encoge acelerando hasta desaparecer (lo último, fundiéndose).
      const p = 1 - Math.min(1, queda / ds)
      escala *= 1 - p * p * p
      opacidad *= Math.min(1, queda / 0.08)
    }
  }
  return { escala, opacidad }
}

// ===== Efectos de sonido =====

export function anadirSonido(tl: Timeline, sonido: Omit<SonidoTL, 'id'>): { timeline: Timeline; id: string } {
  const id = nuevoId('sonido')
  const sonidos = normalizarSonidos([...(tl.sonidos ?? []), { ...sonido, id }], duracionTimeline(tl))
  if (!sonidos.some((s) => s.id === id)) return { timeline: tl, id }
  return { timeline: { ...tl, sonidos }, id }
}

export function cambiarSonido(tl: Timeline, id: string, cambio: Partial<Omit<SonidoTL, 'id'>>): Timeline {
  if (!tl.sonidos?.some((s) => s.id === id)) return tl
  return { ...tl, sonidos: normalizarSonidos(tl.sonidos.map((s) => (s.id === id ? { ...s, ...cambio } : s)), duracionTimeline(tl)) }
}

/**
 * Vuelve a unir al video el sonido que se le separó: el clip vuelve a sonar y el sonido suelto se quita (como
 * «Vincular» en Premiere). Si el clip ya no existe, no hace nada.
 */
export function unirAudio(tl: Timeline, sonidoId: string): Timeline {
  const s = tl.sonidos?.find((x) => x.id === sonidoId)
  if (!s?.deClip || !tl.clips.some((c) => c.id === s.deClip)) return tl
  // Todos los pedazos de ese sonido (si se dividió), para que no suene doble.
  const resto = tl.sonidos!.filter((x) => x.deClip !== s.deClip)
  const { sonidos: _antes, ...sin } = silenciarClip(tl, s.deClip, false)
  return resto.length ? { ...sin, sonidos: resto } : sin
}

/** Divide un sonido suelto en el segundo `t` de la timeline: quedan dos que siguen sonando igual. */
export function dividirSonido(tl: Timeline, id: string, t: number): { timeline: Timeline; id?: string } {
  const s = tl.sonidos?.find((x) => x.id === id)
  if (!s) return { timeline: tl }
  const primero = t - s.inicio
  if (primero < DURACION_MINIMA || s.duracion - primero < DURACION_MINIMA) return { timeline: tl }
  // Los dos recuerdan lo que dura el archivo: el primero se puede volver a alargar hasta donde iba.
  const largo = s.largo ?? (s.desde ?? 0) + s.duracion
  const nuevo: SonidoTL = { ...s, id: nuevoId('sonido'), inicio: t, duracion: s.duracion - primero, desde: (s.desde ?? 0) + primero, largo }
  const sonidos = normalizarSonidos(
    tl.sonidos!.flatMap((x) => (x.id === id ? [{ ...x, duracion: primero, largo }, nuevo] : [x])),
    duracionTimeline(tl)
  )
  return { timeline: { ...tl, sonidos }, id: nuevo.id }
}

export function borrarSonido(tl: Timeline, id: string): Timeline {
  if (!tl.sonidos?.some((s) => s.id === id)) return tl
  const sonidos = tl.sonidos.filter((s) => s.id !== id)
  const { sonidos: _antes, ...resto } = tl
  return sonidos.length ? { ...resto, sonidos } : resto
}

/**
 * Cambia el archivo de un clip por otro medio del proyecto (otra foto, otro video) sin mover
 * nada: conserva su lugar y su duración. `duracionNueva` es lo que dura el medio nuevo
 * (en una imagen, lo que se quiera); si es más corto que el clip, el clip se acorta.
 */
export function cambiarFuente(tl: Timeline, id: string, fuente: FuenteId, duracionNueva: number): Timeline {
  const clips = tl.clips.map((c) => {
    if (c.id !== id) return c
    const cuanto = Math.min(c.salida - c.entrada, Math.max(DURACION_MINIMA, duracionNueva))
    // Otra foto: desde 0. Otro video: desde su principio (el punto de entrada anterior no significa nada en el nuevo).
    return { ...c, fuente, entrada: 0, salida: cuanto }
  })
  return conClips(tl, clips)
}

/** El tipo de dato con que un medio de la biblioteca se arrastra a la timeline o al monitor. */
export const TIPO_ARRASTRE_MEDIO = 'application/x-recorte-medio'

// ===== Efectos de sonido incluidos (python/sonidos/<id>.wav) =====

export type TipoSonido = 'transicion' | 'interfaz' | 'impacto' | 'tension' | 'objeto' | 'ambiente'

/** Los grupos del menú «Sonido», en su orden. */
export const TIPOS_SONIDO: { id: TipoSonido; nombre: string }[] = [
  { id: 'transicion', nombre: 'Transiciones' },
  { id: 'interfaz', nombre: 'Aparece algo' },
  { id: 'impacto', nombre: 'Golpes' },
  { id: 'tension', nombre: 'Tensión' },
  { id: 'objeto', nombre: 'Objetos y acciones' },
  { id: 'ambiente', nombre: 'Ambientes (de fondo)' }
]

/** Los efectos que trae Recorte (python/sonidos/catalogo.json, con su origen y licencia: todos CC0). */
export const SONIDOS_INCLUIDOS: { id: string; nombre: string; tipo: TipoSonido; para: string }[] = [
  { id: 'whoosh', nombre: 'Whoosh', tipo: 'transicion', para: 'un cambio rápido, algo que entra volando' },
  { id: 'swish', nombre: 'Swish', tipo: 'transicion', para: 'un movimiento corto y suave: una tarjeta que pasa, un dato que entra' },
  { id: 'reversa', nombre: 'Reversa', tipo: 'transicion', para: 'el aire que se recoge antes de un corte' },
  { id: 'glitch', nombre: 'Glitch', tipo: 'transicion', para: 'un fallo digital: tecnología, internet, algo que se corrompe o un salto brusco' },
  { id: 'pop', nombre: 'Pop', tipo: 'interfaz', para: 'un logo o un ícono que aparece' },
  { id: 'pop-alto', nombre: 'Pop agudo', tipo: 'interfaz', para: 'otro ícono, o el siguiente de una serie' },
  { id: 'ding', nombre: 'Ding', tipo: 'interfaz', para: 'un dato, un acierto, un precio' },
  { id: 'caching', nombre: 'Caja registradora', tipo: 'interfaz', para: 'una oferta, un descuento, una venta' },
  { id: 'campana', nombre: 'Campana', tipo: 'interfaz', para: 'un logro, el inicio de algo, una buena noticia' },
  { id: 'interruptor', nombre: 'Interruptor', tipo: 'interfaz', para: 'encender una idea, un cambio de escena seco' },
  { id: 'gong', nombre: 'Gong', tipo: 'impacto', para: 'una revelación solemne, un título importante' },
  { id: 'golpe', nombre: 'Golpe', tipo: 'impacto', para: 'algo que cae, un sello, un dato que pega fuerte' },
  { id: 'cristal', nombre: 'Cristal roto', tipo: 'impacto', para: 'algo que se rompe, un récord que cae' },
  { id: 'impacto', nombre: 'Impacto de cine', tipo: 'impacto', para: 'un golpe grave y largo: el título, la gran cifra, el giro de la historia' },
  { id: 'explosion', nombre: 'Explosión', tipo: 'impacto', para: 'un estallido, un fracaso, algo que revienta' },
  { id: 'latido', nombre: 'Latido', tipo: 'tension', para: 'un momento de nervios, algo que está en juego' },
  { id: 'alarma', nombre: 'Alarma', tipo: 'tension', para: 'un peligro, una urgencia, algo que falla' },
  { id: 'subida', nombre: 'Subida', tipo: 'tension', para: 'la tensión que sube hasta un corte o una revelación' },
  { id: 'tension', nombre: 'Zumbido de tensión', tipo: 'tension', para: 'de fondo bajo un momento de misterio o peligro, 8 s' },
  { id: 'camara-foto', nombre: 'Cámara de fotos', tipo: 'objeto', para: 'una foto que aparece, un recuerdo, un flash' },
  { id: 'pagina', nombre: 'Página', tipo: 'objeto', para: 'un documento, un libro, pasar a otro capítulo' },
  { id: 'papel', nombre: 'Papel', tipo: 'objeto', para: 'una carta, un recorte de periódico que aparece' },
  { id: 'puerta', nombre: 'Puerta', tipo: 'objeto', para: 'alguien que se va, un final, una etapa que se cierra' },
  { id: 'monedas', nombre: 'Monedas', tipo: 'objeto', para: 'dinero, ganancias, un precio' },
  { id: 'telefono', nombre: 'Teléfono', tipo: 'objeto', para: 'una llamada, una notificación, un mensaje' },
  { id: 'maquina-escribir', nombre: 'Máquina de escribir', tipo: 'objeto', para: 'un texto que se escribe letra a letra, una fecha, un expediente' },
  { id: 'reloj', nombre: 'Tic tac', tipo: 'objeto', para: 'el tiempo que pasa, una cuenta atrás, una espera' },
  { id: 'pasos', nombre: 'Pasos', tipo: 'objeto', para: 'alguien que llega o camina' },
  { id: 'trueno', nombre: 'Trueno', tipo: 'ambiente', para: 'una tormenta, un giro oscuro de la historia' },
  { id: 'lluvia', nombre: 'Lluvia', tipo: 'ambiente', para: 'de fondo en una escena de lluvia o tristeza' },
  { id: 'trafico', nombre: 'Tráfico', tipo: 'ambiente', para: 'de fondo en la ciudad, una calle, una autopista' },
  { id: 'obra', nombre: 'Obra en construcción', tipo: 'ambiente', para: 'de fondo cuando se construye algo, una fábrica que nace' },
  { id: 'maquinas', nombre: 'Máquinas', tipo: 'ambiente', para: 'de fondo en una fábrica, un taller, un laboratorio' },
  { id: 'multitud', nombre: 'Multitud', tipo: 'ambiente', para: 'de fondo con gente: un mercado, una protesta, un estadio' }
]

/**
 * Solo el tramo `desde`–`hasta` de la timeline, empezando en 0: los clips recortados y los
 * rótulos, capas, frases y sonidos que caen dentro, corridos. Sin música. Sirve para ver un cuadro.
 */
export function ventanaTimeline(tl: Timeline, desde: number, hasta: number): Timeline {
  const total = duracionTimeline(tl)
  const a = Math.max(0, Math.min(desde, total))
  const b = Math.max(a, Math.min(hasta, total))
  let corta = b < total ? borrarTramo(tl, b, total) : tl
  corta = a > 0 ? borrarTramo(corta, 0, a) : corta
  const dentro = <T extends { inicio: number; duracion: number }>(x: T): T | null => {
    const ini = Math.max(x.inicio, a)
    const fin = Math.min(x.inicio + x.duracion, b)
    return fin - ini > 0.01 ? { ...x, inicio: ini - a, duracion: fin - ini } : null
  }
  // Un audio que ya sonaba antes de la ventana sigue desde donde iba (no vuelve a empezar).
  const dentroAudio = <T extends { inicio: number; duracion: number; desde?: number }>(x: T): T | null => {
    const d = dentro(x)
    return d && x.inicio < a ? { ...d, desde: (x.desde ?? 0) + (a - x.inicio) } : d
  }
  const capas = (tl.capas ?? []).map((c) => {
    const d = dentro(c)
    if (!d) return null
    // Si se mueve y la ventana la corta, su recorrido empieza y acaba donde va en esos segundos.
    const recorrido = c.fin && (c.inicio < a || c.inicio + c.duracion > b)
      ? (() => {
          const ini = estadoCapa(c, Math.max(0, a - c.inicio), false)
          const fin = estadoCapa(c, Math.min(c.duracion, b - c.inicio), false)
          return { x: ini.x, y: ini.y, ancho: ini.ancho, giro: ini.giro, fin: { x: fin.x, y: fin.y, ancho: fin.ancho, giro: fin.giro } }
        })()
      : {}
    // Si la capa ya venía de antes, su video sigue desde donde iba, su entrada ya pasó y sus claves se corren:
    // en el nuevo segundo 0 vale lo que valía en el corte (si no, quedaba congelada en su primera clave).
    if (c.inicio >= a) return { ...d, ...recorrido }
    const corrido = a - c.inicio
    const claves = c.claves
      ? (Object.fromEntries(
          Object.entries(c.claves).map(([p, lista]) => {
            const l = lista as ClaveTL[]
            if (!l.length) return [p, l]
            return [p, [{ f: 0, v: valorClave(l, corrido) }, ...l.filter((k) => k.f > corrido + 1e-3).map((k) => ({ f: k.f - corrido, v: k.v }))]]
          })
        ) as ClavesCapa)
      : undefined
    return { ...d, ...recorrido, desde: (c.desde ?? 0) + corrido, entrada: undefined, ...(claves ? { claves } : {}) }
  })
  const { musica: _m, ...resto } = corta
  return {
    ...resto,
    // Un rótulo que ya venía de antes: sus palabras siguen donde iban y su entrada (letra a letra, pop…) no se repite.
    textos: tl.textos
      .map((x) => {
        const d = dentro(x)
        if (!d || x.inicio >= a) return d
        return textoYaEmpezado(d, a - x.inicio, x)
      })
      .filter((x): x is TextoTL => x !== null),
    ...(tl.voces?.length ? { voces: tl.voces.map(dentroAudio).filter((x): x is VozTL => x !== null) } : {}),
    capas: capas.filter((x): x is CapaTL => x !== null),
    ...(tl.sonidos?.length ? { sonidos: tl.sonidos.map(dentroAudio).filter((x): x is SonidoTL => x !== null) } : {})
  }
}
