/**
 * Google Flow: imágenes (Nano Banana) y videos (Veo) con las cuentas de Google del usuario.
 * Flow no tiene API; Recorte maneja su página como lo haría la persona (ver `src/main/flow.ts`).
 * Aquí, lo que comparten el proceso principal y la interfaz: modelos, formatos, cómo se leen
 * el costo y el saldo, y el estado que enseña Ajustes.
 */

export type TipoFlow = 'imagen' | 'video'

export const MODELOS_IMAGEN = ['Nano Banana 2.1', 'Nano Banana Pro', 'Nano Banana 2 Lite']
/** Imágenes con la cuenta de ChatGPT del usuario, vía Codex (ver main/imagenchatgpt.ts). */
export const MODELO_CHATGPT = 'ChatGPT Imágenes'
export const MODELOS_VIDEO = ['Veo 3.1 - Lite', 'Veo 3.1 - Fast', 'Veo 3.1 - Quality', 'Omni 1.1 Flash']

/** El botón de cada proporción se reconoce por su icono: el texto cambia con el idioma de la cuenta. */
export const ICONO_FORMATO: Record<string, string> = {
  '9:16': 'crop_9_16',
  '16:9': 'crop_16_9',
  '1:1': 'crop_square',
  '4:3': 'crop_landscape',
  '3:4': 'crop_portrait'
}
export const FORMATOS_VIDEO = ['9:16', '16:9']

/** Lo más que gasta un video si no se dice otro tope (Lite y Fast caben; Quality, no). */
export const TOPE_POR_DEFECTO = 20
/** Cuántas cuentas generan a la vez (cada una abre su Edge sin ventana). */
export const A_LA_VEZ = 3
export const MAX_CUENTAS = 50

/** Cómo llama Flow a sus créditos según el idioma de la cuenta («créditos», «puntos», «credits»). */
export const PALABRA_CREDITOS = /cr[eé]dit|puntos?\b|points?\b/i

/** El costo de lo elegido, del panel del compositor («La generación usará 10 créditos»). */
export function costoDe(texto: string): number | null {
  const lineas = texto.split('\n').filter((l) => /\d/.test(l) && PALABRA_CREDITOS.test(l))
  const n = lineas[lineas.length - 1]?.match(/\d+/)?.[0]
  return n === undefined ? null : Number(n)
}

/** Lo que le queda a una cuenta, del menú de su cuenta («20 créditos de Google Flow»). */
export function creditosDe(texto: string): number | null {
  const linea = texto.split('\n').find((l) => /^\s*\d[\d.,]*\s+(cr[eé]ditos?|puntos?|credits?|points?)\b/i.test(l))
  if (!linea) return null
  return Number(linea.match(/\d[\d.,]*/)![0].replace(/[.,]/g, ''))
}

/** Por qué una cuenta descansa: sin créditos (las imágenes siguen: no gastan), frenada o sin sesión. */
export type Motivo = 'creditos' | 'frenada' | 'sesion'
export const DESCANSO_MS: Record<Motivo, number> = { creditos: 3 * 3600_000, frenada: 30 * 60_000, sesion: 10 * 60_000 }

export function motivoDe(aviso: string, tipo: TipoFlow): Motivo {
  if (/demasiad|too many|m[aá]s tarde|try again later|inusual|unusual/i.test(aviso)) return 'frenada'
  if (PALABRA_CREDITOS.test(aviso) || /cuota|quota|l[ií]mite|limit|agot|insuficient|insufficient|upgrade/i.test(aviso)) return 'creditos'
  return tipo === 'video' ? 'creditos' : 'frenada'
}

export interface UsoFlow {
  videos: number
  creditos: number
}

export interface CuentaFlowEstado {
  correo: string
  /** La de la voz (Ajustes → Voz) o una agregada aquí. */
  deLaVoz: boolean
  creditos: number | null
  /** Cuándo se leyó el saldo (ms). */
  leido?: number
  descansa?: { hasta: number; motivo: Motivo }
  generando: boolean
  hoy: UsoFlow
}

export interface EstadoFlow {
  cuentas: CuentaFlowEstado[]
  uso: { hoy: UsoFlow; mes: UsoFlow }
  /** «Ayudar a mejorar Flow»; undefined = nunca se tocó (Recorte no cambia lo que tenga la cuenta). */
  aportar?: boolean
  /** El usuario confirmó que tiene los derechos de las imágenes que manda. */
  derechos: boolean
  agregando: boolean
  leyendo: boolean
  error?: string
  /** Hay Edge en el equipo (hace falta para entrar con Google). */
  navegador: boolean
}

export interface PedidoFlow {
  tipo: TipoFlow
  prompt: string
  formato: string
  modelo?: string
  /** Lo más que puede costar; si cuesta más, no se genera. */
  tope?: number
  /** Imágenes de referencia (rutas absolutas): solo con `derechos`. */
  referencias?: string[]
}

export interface ResultadoFlow {
  archivo: string
  creditos: number
  correo: string
}
