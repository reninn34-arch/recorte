import { basename } from 'node:path'

/**
 * Los adaptadores de cada agente: cómo se lanza un turno (nuevo o retomando la sesión) y cómo
 * se traduce lo que imprime a `EventoAgente`. Sin Electron ni procesos: se prueba solo.
 * Formatos comprobados con Claude Code 2 (stream-json) y Codex 0.167 (`exec --json`).
 */

export type EventoAgente =
  /** Lo que va contando o haciendo (una línea para el registro). */
  | { t: 'linea'; texto: string }
  /** El id de la conversación, para retomarla en el turno siguiente. */
  | { t: 'sesion'; id: string }
  /** Un trozo de su respuesta final (los agentes sin evento final la van soltando). */
  | { t: 'respuesta'; texto: string }
  /** Terminó el turno. */
  | { t: 'fin'; ok: boolean; respuesta?: string; error?: string; costoUsd?: number }

export interface Adaptador {
  /** Con sesión: si el turno puede retomar una conversación anterior. */
  conSesion: boolean
  /** La orden del turno: nueva o retomando `sesion`. */
  orden(base: string, cwd: string, sesion?: string): string
  /** Una línea de su salida estándar, en eventos. */
  leer(linea: string): EventoAgente[]
  /** Lo que escribe por stderr también es avance (Codex, Kimi y Gemini cuentan ahí lo que hacen). */
  stderrEsAvance: boolean
}

const corto = (t: string, n = 160) => t.replace(/\s+/g, ' ').trim().slice(0, n)

const json = (linea: string): Record<string, unknown> | null => {
  const l = linea.trim()
  if (!l.startsWith('{')) return null
  try {
    return JSON.parse(l) as Record<string, unknown>
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Claude Code: `-p --output-format stream-json --verbose`, `--resume <id>`.
// ---------------------------------------------------------------------------

/** Una línea legible de un evento de Claude Code (herramienta o texto). */
function lineaDeClaude(ev: Record<string, unknown>): string | null {
  const contenido = ((ev.message as { content?: unknown[] } | undefined)?.content ?? []) as Record<string, unknown>[]
  for (const parte of contenido) {
    if (parte.type === 'tool_use') {
      const e = (parte.input ?? {}) as Record<string, unknown>
      const detalle =
        typeof e.description === 'string'
          ? e.description
          : typeof e.command === 'string'
            ? e.command
            : typeof e.file_path === 'string'
              ? basename(e.file_path)
              : typeof e.pattern === 'string'
                ? e.pattern
                : ''
      return `${String(parte.name)}: ${corto(String(detalle))}`
    }
    if (parte.type === 'text' && typeof parte.text === 'string' && parte.text.trim()) return corto(parte.text, 200)
  }
  return null
}

const CLAUDE: Adaptador = {
  conSesion: true,
  stderrEsAvance: false,
  orden: (base, _cwd, sesion) =>
    // acceptEdits: escribe solo dentro de su directorio de trabajo; stream-json para ver qué hace.
    `${base.trim()} --permission-mode acceptEdits --allowedTools "Bash Read Write Edit Glob Grep" --output-format stream-json --verbose${sesion ? ` --resume ${sesion}` : ''}`,
  leer(linea) {
    const ev = json(linea)
    if (!ev) return linea.trim() ? [{ t: 'linea', texto: corto(linea, 200) }] : []
    const fuera: EventoAgente[] = []
    if (typeof ev.session_id === 'string' && ev.session_id) fuera.push({ t: 'sesion', id: ev.session_id })
    if (ev.type === 'result') {
      const res = typeof ev.result === 'string' ? ev.result : ''
      const costoUsd = typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : undefined
      // Los fallos de ejecución («No conversation found with session ID…») llegan en `errors`.
      const errores = Array.isArray(ev.errors) ? ev.errors.map(String).join(' ') : ''
      const fallo = ev.is_error === true || String(ev.subtype ?? '').startsWith('error')
      // Claude marca los fallos (sesión caducada, límite del plan…) con is_error en el evento final.
      fuera.push(fallo ? { t: 'fin', ok: false, error: [res, errores].filter(Boolean).join(' ') || 'El agente terminó con un error.', costoUsd } : { t: 'fin', ok: true, respuesta: res, costoUsd })
    } else if (ev.type === 'assistant') {
      const l = lineaDeClaude(ev)
      if (l) fuera.push({ t: 'linea', texto: l })
    }
    return fuera
  }
}

// ---------------------------------------------------------------------------
// Codex: `exec --json` (JSONL) y `exec resume <id>`. El sandbox de Codex solo deja escribir
// en la carpeta donde se lanza.
// ---------------------------------------------------------------------------

const CODEX: Adaptador = {
  conSesion: true,
  stderrEsAvance: false,
  orden(base, cwd, sesion) {
    const b = base.trim()
    if (!sesion) return `${b} --json --skip-git-repo-check -s workspace-write -C "${cwd}" -`
    // `resume` no lleva -s ni -C: el sandbox va por configuración y la carpeta es donde se lanza
    // (Codex busca la sesión por carpeta). El modelo elegido (`-m`) se conserva.
    const resto = b.replace(/^codex\s+exec\b/, '').trim()
    return `codex exec resume ${resto ? `${resto} ` : ''}--json --skip-git-repo-check -c sandbox_mode=workspace-write ${sesion} -`
  },
  leer(linea) {
    const ev = json(linea)
    if (!ev) return linea.trim() ? [{ t: 'linea', texto: corto(linea) }] : []
    const tipo = String(ev.type ?? '')
    const item = (ev.item ?? {}) as Record<string, unknown>
    const deItem = String(item.type ?? item.item_type ?? '')
    if (tipo === 'thread.started' && typeof ev.thread_id === 'string') return [{ t: 'sesion', id: ev.thread_id }]
    if (tipo === 'turn.completed') return [{ t: 'fin', ok: true }]
    if (tipo === 'turn.failed') {
      const e = (ev.error ?? {}) as Record<string, unknown>
      return [{ t: 'fin', ok: false, error: String(e.message ?? 'Codex no pudo terminar el turno.') }]
    }
    if (tipo === 'error') return [{ t: 'linea', texto: `Aviso de Codex: ${corto(String(ev.message ?? ''))}` }]
    if (tipo === 'item.started' && deItem === 'command_execution') return [{ t: 'linea', texto: `Bash: ${corto(String(item.command ?? ''))}` }]
    if (tipo === 'item.completed') {
      if (deItem === 'agent_message' && typeof item.text === 'string') {
        return [
          { t: 'respuesta', texto: item.text },
          { t: 'linea', texto: corto(item.text, 200) }
        ]
      }
      if (deItem === 'file_change') {
        const cambios = Array.isArray(item.changes) ? (item.changes as { path?: unknown }[]).map((c) => basename(String(c.path ?? ''))).filter(Boolean) : []
        return [{ t: 'linea', texto: `Edit: ${corto(cambios.join(', ') || 'archivos')}` }]
      }
      if (deItem === 'reasoning' && typeof item.text === 'string') return [{ t: 'linea', texto: corto(item.text) }]
    }
    return []
  }
}

// ---------------------------------------------------------------------------
// OpenCode: `run --format json` (eventos JSON) y `-s <id>` para seguir la sesión. Grabado de
// OpenCode 1.19: step_start, tool_use (part.tool + part.state.input), text (part.text) y
// step_finish (part.reason: "tool-calls" entre pasos, "stop" al terminar el turno).
// ---------------------------------------------------------------------------

const OPENCODE: Adaptador = {
  conSesion: true,
  stderrEsAvance: false,
  orden: (base, cwd, sesion) => `${base.trim()} --format json --auto --dir "${cwd}"${sesion ? ` -s ${sesion}` : ''}`,
  leer(linea) {
    const ev = json(linea)
    if (!ev) return linea.trim() ? [{ t: 'linea', texto: corto(linea.replace(/\x1b\[[0-9;]*m/g, ''), 200) }] : []
    const fuera: EventoAgente[] = []
    if (typeof ev.sessionID === 'string' && ev.sessionID) fuera.push({ t: 'sesion', id: ev.sessionID })
    const parte = (ev.part ?? {}) as Record<string, unknown>
    if (ev.type === 'tool_use') {
      const e = ((parte.state as { input?: unknown } | undefined)?.input ?? {}) as Record<string, unknown>
      const detalle =
        typeof e.description === 'string'
          ? e.description
          : typeof e.command === 'string'
            ? e.command
            : typeof e.filePath === 'string'
              ? basename(e.filePath)
              : typeof e.pattern === 'string'
                ? e.pattern
                : ''
      const herramienta = String(parte.tool ?? 'herramienta')
      fuera.push({ t: 'linea', texto: `${herramienta.charAt(0).toUpperCase()}${herramienta.slice(1)}: ${corto(detalle)}` })
    } else if (ev.type === 'text' && typeof parte.text === 'string' && parte.text.trim()) {
      fuera.push({ t: 'respuesta', texto: parte.text }, { t: 'linea', texto: corto(parte.text, 200) })
    } else if (ev.type === 'step_finish' && parte.reason === 'stop') {
      fuera.push({ t: 'fin', ok: true })
    } else if (ev.type === 'error') {
      const e = (ev.error ?? {}) as Record<string, unknown>
      const mensaje = (e.data as { message?: unknown } | undefined)?.message ?? e.message ?? e.name ?? 'OpenCode no pudo terminar el turno.'
      fuera.push({ t: 'fin', ok: false, error: String(mensaje) })
    }
    return fuera
  }
}

// ---------------------------------------------------------------------------
// Los demás (Kimi, Gemini CLI): texto. Sin sesión ni evento final: el turno acaba
// cuando sale el proceso o cuando ya dejó su entrega y se calló.
// ---------------------------------------------------------------------------

const texto = (ajustar: (b: string, cwd: string) => string): Adaptador => ({
  conSesion: false,
  stderrEsAvance: true,
  orden: (base, cwd) => ajustar(base.trim(), cwd),
  leer(linea) {
    const ev = json(linea)
    // Algunos agentes imprimen JSON aunque no se les pida: el de Claude se entiende igual.
    if (ev && ev.type === 'result' && typeof ev.result === 'string') return [{ t: 'fin', ok: ev.is_error !== true, respuesta: ev.result }]
    const t = linea.replace(/\x1b\[[0-9;]*m/g, '')
    return t.trim() ? [{ t: 'respuesta', texto: `${t}\n` }, { t: 'linea', texto: corto(t, 200) }] : [{ t: 'respuesta', texto: '\n' }]
  }
})

const KIMI = texto((b) => b.replace(/^kimi\b/, 'kimi --auto'))
// `-p` lleva valor: sin él, el siguiente flag (`-m`, `--yolo`) se toma como el prompt. El
// pedido llega por stdin y `-p` se le suma al final (así lo documenta `gemini --help`).
// `--skip-trust`: en una carpeta nueva, Gemini no la trata como «no confiable» (que le quita herramientas).
const GEMINI = texto((b) => `${b.replace(/\s-p(?=\s|$)/, '')} --yolo --skip-trust -p "Sigue al pie de la letra las instrucciones de arriba."`)

export const ADAPTADORES: Record<string, Adaptador> = { claude: CLAUDE, codex: CODEX, kimi: KIMI, opencode: OPENCODE, gemini: GEMINI }
