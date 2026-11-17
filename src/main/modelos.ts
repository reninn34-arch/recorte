import { ID_SEGURO, type AgenteId, type ModeloAgente, type NivelModelo } from '../shared/creacion'

/**
 * Qué modelo usa cada agente cuando el usuario elige el nivel de una tarea
 * (guion o video). Los flags se añaden al final del comando base del agente.
 *
 * Solo hay flags verificados:
 * - Kimi: el nivel sale de la lista de modelos que Recorte lee de su `config.toml` (modeloDeNivel): así, cuando sale o
 *   se retira un modelo, el nivel lo sigue solo. Los nombres de abajo solo se usan si esa lista no se pudo leer.
 * - Gemini CLI: sus alias `flash` y `pro` (Google los mantiene al día y respetan a qué llega tu cuenta).
 * - Claude Code: alias oficiales `haiku` / `sonnet` / `opus` (Anthropic los mantiene al día).
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
  // Los alias de Gemini CLI: `pro` y `flash` se convierten en el mejor de cada uno al que llega tu cuenta.
  gemini: {
    rapido: '-m flash',
    maximo: '-m pro'
  },
  codex: {},
  // OpenCode elige solo entre sus modelos gratis; sin flag.
  opencode: {},
  // Antigravity elige su modelo en la sesión; sin flag.
  antigravity: {}
}

/** Quien sabe la lista de modelos de cada agente (la app conecta aquí la de catalogo.ts al arrancar). */
let listaDe: ((agente: AgenteId) => ModeloAgente[]) | null = null
export function usarListaDeModelos(fn: (agente: AgenteId) => ModeloAgente[]): void {
  listaDe = fn
}

const versionDe = (m: ModeloAgente) => Number(/(\d+(?:\.\d+)?)/.exec(m.nombre)?.[1] ?? /(\d+(?:\.\d+)?)/.exec(m.id)?.[1] ?? 0)

/**
 * El modelo de un nivel según la lista del agente (sin los marcados como anteriores):
 * - Kimi: «rápido» es el más nuevo de los rápidos (highspeed, turbo, fast); «máximo», el más nuevo de los Pro (o Max,
 *   Ultra); «equilibrado», el más nuevo de los demás.
 * Devuelve el id, o undefined si en la lista no hay uno que encaje (entonces queda el nombre de respaldo).
 */
export function modeloDeNivel(agente: AgenteId, nivel: NivelModelo, lista: ModeloAgente[]): string | undefined {
  const vigentes = lista.filter((m) => !m.anterior && ID_SEGURO.test(m.id))
  const masNuevo = (xs: ModeloAgente[]) => [...xs].sort((a, b) => versionDe(b) - versionDe(a))[0]?.id
  if (agente === 'kimi') {
    const texto = (m: ModeloAgente) => `${m.id} ${m.nombre}`
    const rapido = (m: ModeloAgente) => /highspeed|turbo|fast|flash/i.test(texto(m))
    const maximo = (m: ModeloAgente) => /\bpro\b|\bmax\b|ultra/i.test(texto(m))
    if (nivel === 'rapido') return masNuevo(vigentes.filter(rapido))
    if (nivel === 'maximo') return masNuevo(vigentes.filter((m) => maximo(m) && !rapido(m)))
    return masNuevo(vigentes.filter((m) => !rapido(m) && !maximo(m)))
  }
  return undefined
}

/** El comando del agente con el flag de modelo del nivel pedido (si existe). */
export function comandoConNivel(comandoBase: string, agente: AgenteId, nivel?: NivelModelo): string {
  const desdeLista = nivel && listaDe && agente === 'kimi' ? modeloDeNivel(agente, nivel, listaDe(agente)) : undefined
  const extra = desdeLista ? `-m ${desdeLista}` : nivel ? NIVELES[agente]?.[nivel] : undefined
  return extra ? `${comandoBase.trim()} ${extra}` : comandoBase
}

/**
 * El comando con el modelo y el esfuerzo elegidos del catálogo del agente (si no hay modelo,
 * el nivel de antes). Los flags, verificados con la ayuda de cada CLI:
 * - Claude Code: `--model <alias>` y `--effort <low|medium|high|xhigh|max>`.
 * - OpenCode: `-m proveedor/modelo` y `--variant <esfuerzo>`.
 * - Kimi, Gemini CLI y Codex: `-m <modelo>` (sin esfuerzo).
 * - Antigravity (ACP): la marca lleva `--model` y `--effort`; se aplican en su sesión.
 */
export function comandoConEleccion(
  comandoBase: string,
  agente: AgenteId,
  e: { nivel?: NivelModelo; modelo?: string; esfuerzo?: string }
): string {
  const seguro = (x?: string) => (x && ID_SEGURO.test(x) ? x : undefined)
  const modelo = seguro(e.modelo)
  const esfuerzo = seguro(e.esfuerzo)
  if (!modelo && !esfuerzo) return comandoConNivel(comandoBase, agente, e.nivel)
  const base = modelo ? comandoBase.trim() : comandoConNivel(comandoBase, agente, e.nivel).trim()
  const extra: string[] = []
  switch (agente) {
    case 'claude':
      if (modelo) extra.push(`--model ${modelo}`)
      if (esfuerzo) extra.push(`--effort ${esfuerzo}`)
      break
    case 'opencode':
      if (modelo) extra.push(`-m ${modelo}`)
      if (esfuerzo) extra.push(`--variant ${esfuerzo}`)
      break
    case 'antigravity':
      if (modelo) extra.push(`--model ${modelo}`)
      if (esfuerzo) extra.push(`--effort ${esfuerzo}`)
      break
    case 'codex':
      // `codex exec -m <modelo> -c model_reasoning_effort=<nivel>` (verificado con Codex 0.167).
      if (modelo) extra.push(`-m ${modelo}`)
      if (esfuerzo) extra.push(`-c model_reasoning_effort=${esfuerzo}`)
      break
    default:
      if (modelo) extra.push(`-m ${modelo}`)
  }
  return extra.length ? `${base} ${extra.join(' ')}` : base
}

/** Antigravity: el modelo y el esfuerzo que lleva su marca (`antigravity:acp --model x --effort y`). */
export function opcionesAntigravity(orden: string): { modelo?: string; esfuerzo?: string } {
  const de = (flag: string) => {
    const v = new RegExp(`--${flag}\\s+(\\S+)`).exec(orden)?.[1]
    return v && ID_SEGURO.test(v) ? v : undefined
  }
  return { modelo: de('model'), esfuerzo: de('effort') }
}

export const esAntigravity = (orden: string): boolean => orden.trim().startsWith('antigravity:acp')

/** Si el agente admite elegir nivel (Codex no, por ahora). */
export function admiteNiveles(agente: AgenteId): boolean {
  return Object.keys(NIVELES[agente] ?? {}).length > 0
}
