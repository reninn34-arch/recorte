import type { AgenteId, NivelModelo } from '../shared/creacion'

/**
 * Qué modelo usa cada agente cuando el usuario elige el nivel de una tarea
 * (guion o video). Los flags se añaden al final del comando base del agente.
 *
 * Solo hay flags verificados:
 * - Kimi: alias del `config.toml` de esta instalación (K2.7 Highspeed, K2.8, K3.1 Pro).
 * - Claude Code: alias oficiales `haiku` / `sonnet` / `opus`.
 * - Gemini CLI: `-m` con gemini-2.5-flash / gemini-2.5-pro; sin nivel, su defecto.
 * - Codex: los nombres de modelo no están verificados en esta máquina, así que
 *   siempre usa el suyo por defecto (la interfaz no muestra niveles para él).
 */
const NIVELES: Record<AgenteId, Partial<Record<NivelModelo, string>>> = {
  kimi: {
    rapido: '-m kimi-code/kimi-for-coding-highspeed',
    equilibrado: '-m kimi-code/kimi-for-coding',
    maximo: '-m kimi-code/k3.1-pro'
  },
  claude: {
    rapido: '--model haiku',
    equilibrado: '--model sonnet',
    maximo: '--model opus'
  },
  gemini: {
    rapido: '-m gemini-2.5-flash',
    maximo: '-m gemini-2.5-pro'
  },
  codex: {},
  // OpenCode elige solo entre sus modelos gratis; sin flag.
  opencode: {},
  // Antigravity elige su modelo en la sesión; sin flag.
  antigravity: {}
}

/** El comando del agente con el flag de modelo del nivel pedido (si existe). */
export function comandoConNivel(comandoBase: string, agente: AgenteId, nivel?: NivelModelo): string {
  const extra = nivel ? NIVELES[agente]?.[nivel] : undefined
  return extra ? `${comandoBase.trim()} ${extra}` : comandoBase
}

/** Si el agente admite elegir nivel (Codex no, por ahora). */
export function admiteNiveles(agente: AgenteId): boolean {
  return Object.keys(NIVELES[agente] ?? {}).length > 0
}
