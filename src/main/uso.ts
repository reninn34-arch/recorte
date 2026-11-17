import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { EstadoUso, ServicioUso, VentanaUso } from '../shared/api'
import { guardar } from './disco'

/**
 * Cuánto le queda a cada cosa que tiene cuota: los agentes (Claude Code, Codex, los demás cuando se quedan sin plan),
 * la voz de Google y los créditos de Flow. Se lee lo que cada uno informa, sin gastar:
 * - Claude Code cuenta su uso (5 horas y semana) en cada turno (`rate_limit_event` de stream-json).
 * - Codex lo deja en sus sesiones (`~/.codex/sessions`, el `rate_limits` de cada `token_count`).
 * - La voz de Google no dice cuánto queda: se cuentan las frases de hoy y se recuerda cuándo se acabó la del día.
 * - Los demás agentes no lo dicen: se recuerda hasta cuándo se quedaron sin plan.
 * Vive en `userData/uso.json`.
 */

interface Datos {
  claude?: { ventanas: VentanaUso[]; leido: number }
  /** Hasta cuándo se quedó sin plan cada agente (ms), si lo dijo. */
  agotados: Record<string, { hasta?: number; leido: number }>
  voz?: { dia: string; frases: number; agotadaHasta?: number }
}

let archivo = ''
let datos: Datos = { agotados: {} }

export function iniciarUso(ruta: string) {
  archivo = ruta
  try {
    const leido = JSON.parse(readFileSync(ruta, 'utf8')) as Partial<Datos>
    datos = { agotados: leido.agotados ?? {}, ...(leido.claude ? { claude: leido.claude } : {}), ...(leido.voz ? { voz: leido.voz } : {}) }
  } catch {
    datos = { agotados: {} }
  }
}

const grabar = () => {
  if (archivo) guardar(archivo, JSON.stringify(datos, null, 2))
}

const NOMBRE_VENTANA: Record<string, string> = { five_hour: '5 horas', seven_day: 'semana', seven_day_opus: 'semana (Opus)', seven_day_sonnet: 'semana (Sonnet)' }

/** Un `rate_limit_event` de Claude Code: el uso de cada ventana (0 a 1) y cuándo se renueva. */
export function apuntarClaude(info: unknown, ahora = Date.now()): void {
  if (!info || typeof info !== 'object') return
  const i = info as Record<string, unknown>
  const ventanas: VentanaUso[] = []
  const unificadas = i.unifiedWindows && typeof i.unifiedWindows === 'object' ? (i.unifiedWindows as Record<string, Record<string, unknown>>) : {}
  for (const [clave, v] of Object.entries(unificadas)) {
    if (!v || typeof v.utilization !== 'number') continue
    ventanas.push({ nombre: NOMBRE_VENTANA[clave] ?? clave, usado: Math.max(0, Math.min(1, v.utilization)), ...(typeof v.resetsAt === 'number' ? { renueva: v.resetsAt * 1000 } : {}) })
  }
  // Sin las ventanas unificadas (versiones anteriores), la que viene suelta.
  if (!ventanas.length && typeof i.utilization === 'number') {
    ventanas.push({
      nombre: NOMBRE_VENTANA[String(i.rateLimitType)] ?? String(i.rateLimitType ?? 'plan'),
      usado: Math.max(0, Math.min(1, i.utilization)),
      ...(typeof i.resetsAt === 'number' ? { renueva: i.resetsAt * 1000 } : {})
    })
  }
  if (!ventanas.length) return
  datos.claude = { ventanas, leido: ahora }
  grabar()
}

/** Busca el `rate_limit_event` en lo que imprimió Claude Code (stream-json) y lo apunta. */
export function apuntarClaudeDeSalida(salida: string): boolean {
  let visto = false
  for (const l of salida.split(/\r?\n/)) {
    if (!l.includes('rate_limit_event')) continue
    try {
      const ev = JSON.parse(l) as { type?: string; rate_limit_info?: unknown }
      if (ev.type === 'rate_limit_event') {
        apuntarClaude(ev.rate_limit_info)
        visto = true
      }
    } catch {
      // Una línea cortada: se mira la siguiente.
    }
  }
  return visto
}

const nombreVentanaMin = (min: number) => (min <= 300 ? '5 horas' : min <= 1440 ? 'día' : min <= 10080 ? 'semana' : 'mes')

/** El último uso que Codex dejó en sus sesiones (sin gastar nada). */
export function leerCodex(carpeta = join(homedir(), '.codex', 'sessions')): { ventanas: VentanaUso[]; leido: number; plan?: string } | null {
  if (!existsSync(carpeta)) return null
  // Las sesiones van por año/mes/día: las más nuevas primero.
  const archivos: { ruta: string; t: number }[] = []
  const recorrer = (dir: string, nivel: number) => {
    let nombres: string[] = []
    try {
      nombres = readdirSync(dir)
    } catch {
      return
    }
    for (const n of nombres.sort().reverse().slice(0, nivel < 3 ? 3 : 40)) {
      const ruta = join(dir, n)
      if (nivel < 3) recorrer(ruta, nivel + 1)
      else if (n.endsWith('.jsonl')) archivos.push({ ruta, t: statSync(ruta).mtimeMs })
    }
  }
  recorrer(carpeta, 0)
  for (const a of archivos.sort((x, y) => y.t - x.t).slice(0, 8)) {
    let texto = ''
    try {
      texto = readFileSync(a.ruta, 'utf8')
    } catch {
      continue
    }
    const lineas = texto.split(/\r?\n/)
    for (let i = lineas.length - 1; i >= 0; i--) {
      if (!lineas[i].includes('"rate_limits"')) continue
      try {
        const ev = JSON.parse(lineas[i]) as { payload?: { rate_limits?: Record<string, unknown> } }
        const r = ev.payload?.rate_limits
        if (!r) continue
        const ventanas: VentanaUso[] = []
        for (const clave of ['primary', 'secondary']) {
          const v = r[clave] as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown } | null
          if (!v || typeof v.used_percent !== 'number') continue
          ventanas.push({
            nombre: typeof v.window_minutes === 'number' ? nombreVentanaMin(v.window_minutes) : 'plan',
            usado: Math.max(0, Math.min(1, v.used_percent / 100)),
            ...(typeof v.resets_at === 'number' ? { renueva: v.resets_at * 1000 } : {})
          })
        }
        if (ventanas.length) return { ventanas, leido: a.t, ...(typeof r.plan_type === 'string' ? { plan: r.plan_type } : {}) }
      } catch {
        // Línea rota: la anterior.
      }
    }
  }
  return null
}

/** Un agente se quedó sin plan (el LimiteUso): hasta cuándo, si lo dijo. */
export function apuntarAgotado(agente: string, hasta: number | undefined, ahora = Date.now()): void {
  datos.agotados[agente] = { ...(hasta ? { hasta } : {}), leido: ahora }
  grabar()
}

/** El día de la cuota de Gemini: se renueva a medianoche de California. */
function diaPacifico(t: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
}
/** La próxima medianoche de California (cuando se renueva la cuota del día de Gemini), en ms. */
export function proximaMedianochePacifico(t: number): number {
  const hoy = diaPacifico(t)
  // Se busca la primera hora en punto en que ya es otro día allá (con o sin horario de verano).
  let h = Math.ceil(t / 3600_000) * 3600_000
  while (diaPacifico(h) === hoy) h += 3600_000
  return h
}

/** Una frase de voz con la cuenta o la clave de Google: hecha, o la cuota del día se acabó. */
export function apuntarVoz(r: 'hecha' | 'cuota-dia', ahora = Date.now()): void {
  const dia = diaPacifico(ahora)
  const v = datos.voz?.dia === dia ? datos.voz : { dia, frases: 0 }
  if (r === 'hecha') {
    v.frases += 1
    delete v.agotadaHasta
  } else v.agotadaHasta = proximaMedianochePacifico(ahora)
  datos.voz = v
  grabar()
}

/** Si la voz de Google está agotada ahora (hasta cuándo). */
export function vozAgotadaHasta(ahora = Date.now()): number | null {
  const h = datos.voz?.agotadaHasta
  return h && h > ahora ? h : null
}

const NIVEL_ALTO = 0.9

function nivelDe(ventanas: VentanaUso[], agotadoHasta: number | undefined, ahora: number): ServicioUso['nivel'] {
  if (agotadoHasta && agotadoHasta > ahora) return 'agotado'
  // Una ventana que ya se renovó no cuenta.
  const vigentes = ventanas.filter((v) => !v.renueva || v.renueva > ahora)
  if (vigentes.some((v) => v.usado >= 0.999)) return 'agotado'
  if (vigentes.some((v) => v.usado >= NIVEL_ALTO)) return 'alto'
  return ventanas.length ? 'ok' : 'sin-datos'
}

const NOMBRES: Record<string, string> = { claude: 'Claude Code', codex: 'ChatGPT · Codex', gemini: 'Gemini CLI', kimi: 'Kimi', opencode: 'OpenCode', antigravity: 'Antigravity' }

/**
 * El uso de todo, para el panel y el MCP. `agentes`: los agentes instalados (sus ids); `flow`: los créditos de cada
 * cuenta de Flow (null si no se han leído); `voz`: si hay cuenta o clave de voz conectada.
 */
export function estadoUso(op: { agentes: string[]; flow?: { correo: string; creditos: number | null; leido?: number }[]; voz: boolean }, ahora = Date.now()): EstadoUso {
  const servicios: ServicioUso[] = []
  for (const id of op.agentes) {
    const agotado = datos.agotados[id]
    const hasta = agotado?.hasta && agotado.hasta > ahora ? agotado.hasta : undefined
    if (id === 'claude') {
      const c = datos.claude
      // Las ventanas que ya se renovaron vuelven a cero.
      const ventanas = (c?.ventanas ?? []).map((v) => (v.renueva && v.renueva <= ahora ? { ...v, usado: 0, renueva: undefined } : v))
      servicios.push({ id, nombre: NOMBRES[id], ventanas, ...(c ? { leido: c.leido } : {}), ...(hasta ? { agotadoHasta: hasta } : {}), nivel: nivelDe(ventanas, hasta, ahora), actualizable: true })
      continue
    }
    if (id === 'codex') {
      const c = leerCodex()
      const ventanas = (c?.ventanas ?? []).map((v) => (v.renueva && v.renueva <= ahora ? { ...v, usado: 0, renueva: undefined } : v))
      servicios.push({
        id,
        nombre: NOMBRES[id],
        ventanas,
        ...(c ? { leido: c.leido } : {}),
        ...(c?.plan ? { nota: `Plan ${c.plan}` } : {}),
        ...(hasta ? { agotadoHasta: hasta } : {}),
        nivel: nivelDe(ventanas, hasta, ahora)
      })
      continue
    }
    // Los demás no dicen cuánto llevan: solo si se quedaron sin plan.
    servicios.push({
      id,
      nombre: NOMBRES[id] ?? id,
      ventanas: [],
      ...(hasta ? { agotadoHasta: hasta } : {}),
      nota: hasta ? undefined : 'No informa cuánto queda: Recorte avisa si se queda sin plan.',
      nivel: hasta ? 'agotado' : 'sin-datos'
    })
  }
  if (op.voz) {
    const v = datos.voz?.dia === diaPacifico(ahora) ? datos.voz : undefined
    const hasta = vozAgotadaHasta(ahora) ?? undefined
    servicios.push({
      id: 'voz',
      nombre: 'Voz de Google',
      ventanas: [],
      nota: `${v?.frases ?? 0} frases hoy. Google no dice cuánto queda: avisa cuando se acaba la del día.`,
      ...(hasta ? { agotadoHasta: hasta } : {}),
      nivel: hasta ? 'agotado' : 'sin-datos'
    })
  }
  if (op.flow?.length) {
    const leidas = op.flow.filter((c) => c.creditos !== null)
    const creditos = leidas.reduce((s, c) => s + (c.creditos ?? 0), 0)
    servicios.push({
      id: 'flow',
      nombre: 'Google Flow',
      ventanas: [],
      ...(leidas.length ? { creditos } : {}),
      nota: leidas.length ? `${creditos} créditos en ${leidas.length === 1 ? 'tu cuenta' : `${leidas.length} cuentas`}` : 'Créditos sin leer',
      ...(leidas.length ? { leido: Math.max(...leidas.map((c) => c.leido ?? 0)) } : {}),
      nivel: !leidas.length ? 'sin-datos' : creditos < 20 ? (creditos <= 0 ? 'agotado' : 'alto') : 'ok',
      actualizable: true
    })
  }
  return { servicios }
}

const fecha = (ms: number) =>
  new Date(ms).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/**
 * Antes de hacer un video: si al agente que lo hará le queda poco (90 % o más de alguna ventana, o se quedó sin plan),
 * o si la voz de Google ya se acabó por hoy, el aviso para el plan. null si todo está bien.
 */
export function avisoAntesDeHacer(estado: EstadoUso, agente: string | null, conVoz: boolean): string | null {
  const partes: string[] = []
  const a = agente ? estado.servicios.find((s) => s.id === agente) : undefined
  if (a?.agotadoHasta) partes.push(`${a.nombre} se quedó sin uso de su plan hasta el ${fecha(a.agotadoHasta)}: si lo hago ahora se detendrá y seguirá solo cuando se renueve.`)
  else if (a && (a.nivel === 'alto' || a.nivel === 'agotado')) {
    const v = [...a.ventanas].filter((x) => x.usado >= NIVEL_ALTO).sort((x, y) => y.usado - x.usado)[0]
    if (v) {
      partes.push(
        `A ${a.nombre} le queda poco${v.nombre === '5 horas' ? ' en estas 5 horas' : ` ${v.nombre === 'semana' ? 'esta semana' : `este ${v.nombre}`}`}: llevas el ${Math.round(v.usado * 100)} %${v.renueva ? ` y se renueva el ${fecha(v.renueva)}` : ''}. Un video así puede quedarse a medias; si pasa, sigue solo cuando se renueve.`
      )
    }
  }
  const voz = estado.servicios.find((s) => s.id === 'voz')
  if (conVoz && voz?.agotadoHasta) {
    partes.push(`La voz de Google ya se acabó por hoy (se renueva el ${fecha(voz.agotadoHasta)}): si lo hago ahora, saldrá sin narración. Puedes esperar o poner una clave de AI Studio en Ajustes → Voz.`)
  }
  return partes.length ? `Antes de hacerlo: ${partes.join(' ')}` : null
}
