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
  /**
   * El guion gráfico, cuando el video se hace con imágenes o clips generados: una escena por
   * frase o idea, con cuánto dura, qué se ve y el prompt para el generador. De aquí sale cuántos
   * clips se generan (y lo que cuestan) una vez que el usuario dice «Hazlo».
   */
  escenas?: EscenaPlan[]
}

export interface EscenaPlan {
  /** Lo que se dice (o el texto en pantalla) en esta escena. */
  texto: string
  /** Desde y hasta, en segundos del video (con narración grabada, los de su frase). */
  desde?: number
  hasta?: number
  /** Qué se ve: un clip generado (Veo/Omni), una imagen generada, material del usuario o diseño (texto, logo). */
  medio: 'clip' | 'imagen' | 'material' | 'diseno'
  /** Lo que ve el espectador, en palabras del usuario. */
  visual: string
  /** El prompt para el generador (si es clip o imagen). */
  prompt?: string
}

/** Lo más que se generan de clips por video, aunque el guion gráfico pida más. */
export const MAX_CLIPS_GUION = 12

/** Cuántos clips pide el guion gráfico (lo que el usuario aprueba con «Hazlo»). */
export function clipsDelPlan(plan?: PlanAgente | null): number {
  return Math.min(MAX_CLIPS_GUION, (plan?.escenas ?? []).filter((e) => e.medio === 'clip').length)
}

/**
 * Un turno de la conversación antes de hacer el video («Pregúntame antes»): lo que el agente
 * le dice al usuario (ideas, lo que vio, preguntas con opciones), las respuestas rápidas que
 * puede tocar y el plan tal como va quedando.
 */
export interface CharlaPlan {
  mensaje: string
  propuestas: string[]
  plan: PlanAgente | null
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
  /**
   * La receta del kit con la que se hizo esta versión, copiada junto al video (`salidas/…`).
   * Con ella el editor abre cada recurso suelto en su pista, en vez del video entero.
   */
  receta?: string
}

export interface EstadoModoAgente {
  plan?: PlanAgente
  /** Lo último que hizo el agente (para ver «qué está haciendo»). */
  registro: string[]
  resultado?: ResultadoAgente
  /** Cuántas veces trabajó (cada cambio es una ronda). */
  rondas: number
  /** En qué paso del plan va (1 = el primero), según lo que el agente va diciendo. */
  paso?: number
  /**
   * La conversación del agente que sigue viva entre rondas (Claude Code, Codex): cada cambio
   * la retoma, así el agente recuerda lo que ya vio e hizo y no lo vuelve a leer (menos créditos).
   * Solo vale con el mismo agente: si el usuario cambia de agente, se empieza otra.
   */
  sesion?: SesionAgente
  /** Se quedó sin uso de su plan a mitad: en pausa hasta que se renueve (o se siga con otro agente). */
  pausa?: PausaCreacion
}

export interface SesionAgente {
  agente: string
  id: string
  /** Cuánto lleva gastado la conversación, si el agente lo dice (Claude: dólares a precio de API). */
  costoUsd?: number
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
  const medios = ['clip', 'imagen', 'material', 'diseno'] as const
  const escenas: EscenaPlan[] = (Array.isArray(p.escenas) ? p.escenas : [])
    .slice(0, 40)
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === 'object')
    .map((e) => {
      const medio = (medios as readonly string[]).includes(String(e.medio)) ? (String(e.medio) as EscenaPlan['medio']) : 'diseno'
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : undefined)
      return {
        texto: texto(e.texto, 300),
        ...(n(e.desde) !== undefined ? { desde: n(e.desde) } : {}),
        ...(n(e.hasta) !== undefined ? { hasta: n(e.hasta) } : {}),
        medio,
        visual: texto(e.visual, 300),
        ...(texto(e.prompt, 1200) ? { prompt: texto(e.prompt, 1200) } : {})
      }
    })
    .filter((e) => e.texto || e.visual)
  return {
    entendi: entendi || 'Plan del agente',
    pasos,
    preguntas,
    ...(texto(p.herramienta, 80) ? { herramienta: texto(p.herramienta, 80) } : {}),
    ...(escenas.length ? { escenas } : {})
  }
}

/**
 * La respuesta del agente en la charla del plan. Con JSON: su mensaje, sus respuestas rápidas
 * y el plan. Sin JSON (contestó en prosa): eso es su mensaje y el plan sigue como estaba.
 */
export function validarCharla(crudo: unknown, prosa: string): CharlaPlan | null {
  const plan = validarPlan(crudo)
  const p = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  const mensaje = texto(p.mensaje, 2500) || (plan ? '' : prosa.trim().slice(0, 2500))
  const propuestas = lista(p.propuestas, 4, 80)
  if (!mensaje && !plan) return null
  return { mensaje, propuestas, plan }
}

/**
 * El trabajo quedó en pausa porque el agente se quedó sin uso de su plan. Nada se pierde:
 * la carpeta de trabajo y la conversación siguen. Se reanuda solo cuando se renueva (si el
 * agente dijo cuándo) o con «Seguir donde iba», con el mismo agente o con otro.
 */
export interface PausaCreacion {
  motivo: 'limite'
  /** Dónde se quedó: en la charla del plan o haciendo el video. */
  etapa: 'plan' | 'hacer'
  /** Cuándo empezó la ronda que se cortó (ms): lo que el agente dejó desde entonces cuenta como suyo. */
  desde: number
  /** Cuándo se renueva el uso (ms), si el agente lo dijo. */
  reanudar?: number
  /** Qué agente se quedó sin uso. */
  agente?: string
}

const LIMITE_USO =
  /l[ií]mite de uso|usage limit|limit reached|hit your (usage |session |weekly )?limit|reached your (current )?(usage |quota|limit)|quota (exceeded|reached)|out of (credits|usage)|rate.?limit(ed)?|too many requests|\b429\b|limit will reset|credit balance is too low/i

/**
 * Si un texto del agente dice que se quedó sin uso de su plan, y cuándo se renueva.
 * Entiende «resets 5pm», «try again at 3:40 PM», «will reset in 6 days, 7 hours»,
 * «in 2 hours 15 minutes» y el «…limit reached|1731234567» de Claude. Null si no es eso.
 */
export function limiteDeUso(texto: string, ahora = Date.now()): { reanudar?: number } | null {
  if (!LIMITE_USO.test(texto)) return null
  const margen = 60_000
  const epoca = /\|(\d{10})\b/.exec(texto)
  if (epoca) return { reanudar: Number(epoca[1]) * 1000 + margen }
  const enRato = /(?:reset|resets|try again|available)\D{0,25}?\bin\s+((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m)\b[\s,]*(?:and\s*)?)+)/i.exec(texto)
  if (enRato) {
    let ms = 0
    for (const m of enRato[1].matchAll(/(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
      const n = Number(m[1])
      const u = m[2].toLowerCase()
      ms += u.startsWith('d') ? n * 86_400_000 : u.startsWith('h') ? n * 3_600_000 : n * 60_000
    }
    if (ms > 0) return { reanudar: ahora + ms + margen }
  }
  const aLas = /(?:resets?|try again|available)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i.exec(texto)
  if (aLas) {
    let h = Number(aLas[1])
    const min = Number(aLas[2] ?? 0)
    const ap = aLas[3]?.toLowerCase().replace(/\./g, '')
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    if (h <= 23 && min <= 59) {
      const d = new Date(ahora)
      d.setHours(h, min, 0, 0)
      if (d.getTime() <= ahora) d.setDate(d.getDate() + 1)
      return { reanudar: d.getTime() + margen }
    }
  }
  return {}
}

/** Lo que el agente deja en `resultado.json` al terminar. */
export function validarEntrega(crudo: unknown): { archivo?: string; receta?: string; resumen: string; comprobaciones: string[] } {
  const r = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  return {
    ...(texto(r.archivo, 300) ? { archivo: texto(r.archivo, 300) } : {}),
    ...(texto(r.receta, 300) ? { receta: texto(r.receta, 300) } : {}),
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

/**
 * El paso del plan que anuncia una línea del agente («PASO 3: montar…», «Paso 3/5»). El agente
 * lo dice al empezar cada paso (se lo pide el pedido): así el chat marca los pasos hechos.
 */
export function pasoAnunciado(linea: string, total: number): number | null {
  const m = /(?:^|[^a-záéíóúñ])paso\s+(\d{1,2})(?!\d)/i.exec(linea)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= total ? n : null
}
