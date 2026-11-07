/**
 * Modo agente de Crear con IA: en vez de pedirle al agente un HTML de una vez, se le deja
 * trabajar como un editor de verdad dentro de la carpeta de la creación, con herramientas
 * (FFmpeg, Python, HyperFrames). Primero propone un plan corto (o pregunta); cuando el
 * usuario dice «Hazlo», trabaja, se comprueba a sí mismo y entrega. Recorte revisa el
 * resultado por su cuenta (archivo, fotogramas) antes de mostrarlo.
 *
 * Aquí van los tipos y lo que se valida de lo que devuelve el agente.
 */

export interface PlanAgente {
  /** Lo que entendió del pedido, en una o dos frases. */
  entendi: string
  /** Los pasos que va a dar (cortos). */
  pasos: string[]
  /** Lo que necesita saber antes de empezar (si no, vacío). */
  preguntas: string[]
  /** Con qué lo va a hacer (FFmpeg, Python, HyperFrames…). */
  herramienta?: string
}

export interface ResultadoAgente {
  /** El archivo final, relativo a la carpeta de la creación (`salidas/…`). */
  archivo: string
  tipo: 'video' | 'imagen'
  /** Lo que dice el agente que hizo. */
  resumen: string
  /** Lo que el agente comprobó (y cómo). */
  comprobaciones: string[]
  /** Fotogramas que sacó Recorte del resultado, para que el usuario lo vea (`salidas/…`). */
  revision: string[]
  duracion?: number
  ancho?: number
  alto?: number
}

export interface EstadoModoAgente {
  plan?: PlanAgente
  /** Lo último que hizo el agente (para ver «qué está haciendo»). */
  registro: string[]
  resultado?: ResultadoAgente
  /** Cuántas veces trabajó (cada cambio es una ronda). */
  rondas: number
}

export const MAX_REGISTRO = 60

const texto = (x: unknown, largo: number): string =>
  typeof x === 'string' ? x.replace(/\s+/g, ' ').trim().slice(0, largo) : ''

const lista = (x: unknown, max: number, largo: number): string[] =>
  Array.isArray(x) ? x.map((s) => texto(s, largo)).filter(Boolean).slice(0, max) : []

/** Limpia el plan que devuelve el agente; si no se parece a un plan, null. */
export function validarPlan(crudo: unknown): PlanAgente | null {
  if (!crudo || typeof crudo !== 'object') return null
  const p = crudo as Record<string, unknown>
  const entendi = texto(p.entendi, 400)
  const pasos = lista(p.pasos, 10, 200)
  const preguntas = lista(p.preguntas, 4, 200)
  if (!entendi && !pasos.length && !preguntas.length) return null
  return {
    entendi: entendi || 'Plan del agente',
    pasos,
    preguntas,
    ...(texto(p.herramienta, 80) ? { herramienta: texto(p.herramienta, 80) } : {})
  }
}

/** Lo que el agente deja en `resultado.json` al terminar. */
export function validarEntrega(crudo: unknown): { archivo?: string; resumen: string; comprobaciones: string[] } {
  const r = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  return {
    ...(texto(r.archivo, 300) ? { archivo: texto(r.archivo, 300) } : {}),
    resumen: texto(r.resumen, 600),
    comprobaciones: lista(r.comprobaciones, 12, 240)
  }
}

/** ¿El mensaje del usuario es un «hazlo» (aprobar el plan) y no un cambio? */
export function esAprobacion(mensaje: string): boolean {
  const t = mensaje
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /^(si|sí|ok|okay|dale|hazlo|hazlo asi|adelante|listo|perfecto|de acuerdo|va|vale|me parece bien|asi esta bien|si hazlo|si dale|empieza|procede)( .{0,20})?$/.test(t)
}
