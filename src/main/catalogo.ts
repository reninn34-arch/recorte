import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { ID_SEGURO, type AgenteId, type ModeloAgente } from '../shared/creacion'
import { pathAmpliado, resolverBinario } from './binarios'
import { matarArbol } from './ia'

/**
 * Los modelos de cada agente con sus esfuerzos, tal como los dice el propio agente (así,
 * cuando sale un modelo nuevo, aparece solo):
 * - Claude Code: la petición de control «initialize» por stream-json devuelve sus modelos con
 *   `supportedEffortLevels`. No manda nada al modelo ni gasta.
 * - OpenCode: `opencode models --verbose`, con el precio (0 = gratis) y sus variantes.
 * - Antigravity: las opciones de una sesión ACP (antigravity.ts).
 * - Codex: su propia lista (`~/.codex/models_cache.json`, la que baja Codex), con los niveles.
 * - Kimi: los de tu cuenta que Kimi Code guarda en su `config.toml`.
 * - Gemini CLI: los nombres que trae el paquete instalado (si no se encuentra, los conocidos).
 * Cuando la lista de un agente cambia, se avisa a la interfaz (alCambiarCatalogo), y una
 * elección con un modelo que ya no está vuelve al modelo de siempre (eleccionVigente).
 * Lo recordado se da al instante y, si tiene más de una hora, se vuelve a preguntar de fondo:
 * así un modelo nuevo aparece sin esperar un día. «forzar» pregunta ya.
 */

const UNA_HORA = 60 * 60_000
const ruta = () => join(app.getPath('userData'), 'catalogo-modelos.json')
type Guardado = Partial<Record<AgenteId, { fecha: number; modelos: ModeloAgente[] }>>

function leer(): Guardado {
  try {
    return existsSync(ruta()) ? (JSON.parse(readFileSync(ruta(), 'utf8')) as Guardado) : {}
  } catch {
    return {}
  }
}

/** Los conocidos de los agentes que no saben listarlos (los flags de modelos.ts). */
const FIJOS: Partial<Record<AgenteId, ModeloAgente[]>> = {
  kimi: [
    { id: 'kimi-code/kimi-for-coding-highspeed', nombre: 'K2.7 Highspeed', esfuerzos: [] },
    { id: 'kimi-code/kimi-for-coding', nombre: 'K2.8', esfuerzos: [] },
    { id: 'kimi-code/k3.1-pro', nombre: 'K3.1 Pro', esfuerzos: [] }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', nombre: 'Gemini 2.5 Flash', esfuerzos: [] },
    { id: 'gemini-2.5-pro', nombre: 'Gemini 2.5 Pro', esfuerzos: [] }
  ]
}

/** Corre un programa y devuelve su salida (o null si falla o tarda demasiado). */
function salidaDe(orden: string, entrada: string | null, limite: number, hasta?: (s: string) => boolean): Promise<string | null> {
  return new Promise((resolver) => {
    let salida = ''
    let hecho = false
    const hijo = spawn(orden, { shell: true, windowsHide: true, env: { ...process.env, PATH: pathAmpliado() } })
    const fin = (v: string | null) => {
      if (hecho) return
      hecho = true
      clearTimeout(reloj)
      // Con shell, el hijo es la consola: se cierra el árbol entero para no dejar el agente abierto.
      if (hijo.exitCode === null) matarArbol(hijo)
      resolver(v)
    }
    const reloj = setTimeout(() => fin(hasta ? null : salida || null), limite)
    hijo.stdout.on('data', (b: Buffer) => {
      salida += b.toString('utf8')
      if (hasta?.(salida)) fin(salida)
    })
    hijo.on('error', () => fin(null))
    hijo.on('close', (codigo) => fin(codigo === 0 || hasta ? salida || null : null))
    if (entrada !== null) hijo.stdin.write(entrada)
  })
}

/** Lo que dice cada familia de Claude, en español (su descripción viene en inglés). */
const FAMILIAS_CLAUDE: Record<string, string> = {
  fable: 'El más capaz: lo más difícil y largo',
  opus: 'Completo para el día a día y lo complejo',
  sonnet: 'Rápido y eficiente para lo de siempre',
  haiku: 'El más rápido, para lo sencillo'
}

/** «Opus 5.5» → ['opus', 5.5]: la familia y la versión, para saber cuál es la más nueva. */
function familiaYVersion(nombre: string): [string, number] {
  const m = /^([A-Za-z-]+?)[\s-]*(\d+(?:\.\d+)?)/.exec(nombre.trim())
  return m ? [m[1].toLowerCase().replace(/^gpt-?/, 'gpt-'), Number(m[2])] : [nombre.toLowerCase(), 0]
}

/** Marca como «anterior» lo que no es la versión más nueva de su familia. */
function marcarAnteriores(modelos: ModeloAgente[], familiaDe: (m: ModeloAgente) => [string, number] = (m) => familiaYVersion(m.nombre)): ModeloAgente[] {
  const mejor = new Map<string, number>()
  for (const m of modelos) {
    const [f, v] = familiaDe(m)
    mejor.set(f, Math.max(mejor.get(f) ?? 0, v))
  }
  return modelos.map((m) => {
    const [f, v] = familiaDe(m)
    return v < (mejor.get(f) ?? 0) ? { ...m, anterior: true } : m
  })
}

async function modelosClaude(): Promise<ModeloAgente[]> {
  if (!resolverBinario('claude')) return []
  const pedido = JSON.stringify({ type: 'control_request', request_id: 'catalogo', request: { subtype: 'initialize' } }) + '\n'
  // Se espera a la línea entera de la respuesta (puede llegar en varios trozos).
  const salida = await salidaDe('claude -p --input-format stream-json --output-format stream-json --verbose', pedido, 45_000, (s) =>
    /"control_response"[^\n]*\n/.test(s)
  )
  if (!salida) return []
  for (const linea of salida.split(/\r?\n/)) {
    if (!linea.includes('"control_response"')) continue
    try {
      const m = JSON.parse(linea) as { response?: { response?: { models?: Record<string, unknown>[] } } }
      const lista = m.response?.response?.models ?? []
      // «default» dice cuál recomienda Claude (a qué modelo apunta).
      const recomendado = String(lista.find((x) => x.value === 'default')?.resolvedModel ?? '')
      const vistos = new Set<string>()
      const modelos: ModeloAgente[] = []
      for (const x of lista) {
        const id = typeof x.value === 'string' ? x.value : ''
        // «default» es un atajo a otro de la lista; los alias (opus, sonnet…) siguen a la última versión.
        if (!id || id === 'default' || !ID_SEGURO.test(id) || vistos.has(String(x.resolvedModel ?? id))) continue
        vistos.add(String(x.resolvedModel ?? id))
        const esfuerzos = Array.isArray(x.supportedEffortLevels) ? x.supportedEffortLevels.filter((e): e is string => typeof e === 'string' && ID_SEGURO.test(e)) : []
        const nombre = typeof x.displayName === 'string' ? x.displayName : id
        const descripcion = FAMILIAS_CLAUDE[familiaYVersion(nombre)[0]]
        modelos.push({
          id,
          nombre,
          esfuerzos,
          esfuerzoDefecto: esfuerzos.includes('high') ? 'high' : esfuerzos[0],
          ...(descripcion ? { descripcion } : {}),
          ...(recomendado && String(x.resolvedModel ?? id) === recomendado ? { recomendado: true } : {})
        })
      }
      // La más nueva de cada familia arriba; las anteriores, al final.
      return marcarAnteriores(modelos).sort((a, b) => Number(Boolean(a.anterior)) - Number(Boolean(b.anterior)))
    } catch {
      return []
    }
  }
  return []
}

async function modelosOpenCode(): Promise<ModeloAgente[]> {
  if (!resolverBinario('opencode')) return []
  const salida = await salidaDe('opencode models --verbose', null, 60_000)
  if (!salida) return []
  // Cada modelo es una línea «proveedor/modelo» seguida de su JSON.
  const modelos: ModeloAgente[] = []
  const partes = salida.split(/\r?\n(?=[\w.-]+\/[\w.:-]+\r?\n\{)/)
  for (const parte of partes) {
    const salto = parte.indexOf('\n')
    const id = parte.slice(0, salto).trim()
    if (!ID_SEGURO.test(id)) continue
    try {
      const d = JSON.parse(parte.slice(salto + 1)) as { name?: string; status?: string; cost?: { input?: number; output?: number }; variants?: Record<string, unknown> }
      if (d.status && d.status !== 'active') continue
      const gratis = d.cost?.input === 0 && d.cost?.output === 0
      const esfuerzos = Object.keys(d.variants ?? {}).filter((e) => ID_SEGURO.test(e))
      modelos.push({ id, nombre: d.name ?? id, esfuerzos, gratis })
    } catch {
      // Una entrada que no se entiende se salta.
    }
  }
  // Los gratis primero: es lo que OpenCode usa sin saldo.
  return modelos.sort((a, b) => Number(Boolean(b.gratis)) - Number(Boolean(a.gratis)))
}

/** Lo que dice cada modelo de Codex, en español (su descripción viene en inglés). */
const DESCRIPCION_CODEX: [RegExp, string][] = [
  [/fast and affordable model for easier/i, 'Rápido y económico, para lo sencillo'],
  [/fast and affordable agentic coding/i, 'Rápido y económico para programar'],
  [/balanced/i, 'Equilibrado'],
  [/fast and efficient/i, 'Rápido y eficiente'],
  [/most capable|frontier|hardest/i, 'El más capaz']
]

/**
 * Los modelos de Codex: los que Codex ofrece en su selector (`visibility: list`), con sus
 * niveles de razonamiento. Los baja Codex mismo; Recorte solo los lee (no gasta nada).
 */
function modelosCodex(): ModeloAgente[] {
  const archivo = join(homedir(), '.codex', 'models_cache.json')
  try {
    const d = JSON.parse(readFileSync(archivo, 'utf8')) as { models?: Record<string, unknown>[] }
    const modelos: ModeloAgente[] = []
    for (const x of d.models ?? []) {
      const id = typeof x.slug === 'string' ? x.slug : ''
      if (!id || x.visibility !== 'list' || !ID_SEGURO.test(id)) continue
      const niveles = Array.isArray(x.supported_reasoning_levels) ? x.supported_reasoning_levels : []
      const esfuerzos = niveles.map((n) => String((n as { effort?: unknown }).effort ?? '')).filter((e) => ID_SEGURO.test(e))
      const ingles = typeof x.description === 'string' ? x.description : ''
      const descripcion = DESCRIPCION_CODEX.find(([re]) => re.test(ingles))?.[1]
      modelos.push({
        id,
        nombre: typeof x.display_name === 'string' ? x.display_name : id,
        esfuerzos,
        ...(typeof x.default_reasoning_level === 'string' && esfuerzos.includes(x.default_reasoning_level) ? { esfuerzoDefecto: x.default_reasoning_level } : {}),
        ...(descripcion ? { descripcion } : {}),
        ...(/^older/i.test(ingles) ? { anterior: true } : {})
      })
    }
    return modelos
  } catch {
    return []
  }
}

/**
 * Los modelos de Kimi: los que Kimi Code bajó de tu cuenta a su `config.toml` (`[models."…"]`,
 * con su `display_name`). Kimi los pone al día solo; Recorte solo los lee.
 */
function modelosKimi(): ModeloAgente[] {
  const dirs = [process.env.KIMI_SHARE_DIR, join(homedir(), '.kimi-code'), join(homedir(), '.kimi')].filter((d): d is string => !!d)
  for (const dir of dirs) {
    let texto: string
    try {
      texto = readFileSync(join(dir, 'config.toml'), 'utf8')
    } catch {
      continue
    }
    const defecto = /^\s*default_model\s*=\s*"([^"]+)"/m.exec(texto)?.[1]
    const modelos: ModeloAgente[] = []
    // Cada sección [models."id"] hasta la siguiente sección.
    const re = /^\[models\."([^"]+)"\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/gm
    for (let m = re.exec(texto); m; m = re.exec(texto)) {
      const id = m[1]
      if (!ID_SEGURO.test(id)) continue
      const nombre = /^\s*display_name\s*=\s*"([^"]+)"/m.exec(m[2])?.[1] ?? id.split('/').pop() ?? id
      modelos.push({ id, nombre, esfuerzos: [], ...(id === defecto ? { recomendado: true } : {}) })
    }
    // Todos a la vista (sus nombres no siguen una versión clara); el que Kimi usa por defecto, primero.
    if (modelos.length) return modelos.sort((a, b) => Number(Boolean(b.recomendado)) - Number(Boolean(a.recomendado)))
  }
  return FIJOS.kimi ?? []
}

/**
 * Los modelos de Gemini CLI: los nombres que trae el paquete instalado (cuando Gemini CLI se
 * actualiza y suma un modelo, aparece). Si no se encuentra el paquete, los conocidos.
 */
function modelosGemini(): ModeloAgente[] {
  const bin = resolverBinario('gemini')
  if (!bin) return FIJOS.gemini ?? []
  const base = join(bin, '..', 'node_modules', '@google')
  const archivos = [
    join(base, 'gemini-cli', 'node_modules', '@google', 'gemini-cli-core', 'dist', 'src', 'config', 'models.js'),
    join(base, 'gemini-cli-core', 'dist', 'src', 'config', 'models.js')
  ]
  for (const archivo of archivos) {
    let texto: string
    try {
      texto = readFileSync(archivo, 'utf8')
    } catch {
      continue
    }
    const ids = [...new Set(texto.match(/\bgemini-\d+(?:\.\d+)?-(?:pro|flash(?:-lite)?)(?:-preview(?:-\d\d-\d\d)?)?\b/g) ?? [])]
    if (!ids.length) continue
    const nombre = (id: string) =>
      id
        .replace(/^gemini-/, 'Gemini ')
        .replace(/-flash-lite/, ' Flash-Lite')
        .replace(/-flash/, ' Flash')
        .replace(/-pro/, ' Pro')
        .replace(/-preview.*/, ' (preview)')
    const modelos = ids.map((id) => ({ id, nombre: nombre(id), esfuerzos: [] as string[] }))
    // La versión más nueva primero; dentro de una versión, Pro, Flash y Flash-Lite.
    const orden = (id: string) => (/-pro/.test(id) ? 0 : /-lite/.test(id) ? 2 : 1)
    const version = (id: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0)
    modelos.sort((a, b) => version(b.id) - version(a.id) || orden(a.id) - orden(b.id))
    const mayor = version(modelos[0].id)
    return modelos.map((m) => (version(m.id) < mayor ? { ...m, anterior: true } : m))
  }
  return FIJOS.gemini ?? []
}

const enCurso = new Map<AgenteId, Promise<ModeloAgente[]>>()

/** Lo último que se le dijo a la interfaz de cada agente, para avisar solo cuando cambia. */
const avisado = new Map<AgenteId, string>()
let alCambiar: ((id: AgenteId, modelos: ModeloAgente[]) => void) | null = null
/** Avisa cuando la lista de modelos de un agente cambia (un modelo nuevo o uno que ya no está). */
export function alCambiarCatalogo(cb: (id: AgenteId, modelos: ModeloAgente[]) => void): void {
  alCambiar = cb
}
function anotar(id: AgenteId, modelos: ModeloAgente[]): ModeloAgente[] {
  if (!modelos.length) return modelos
  const huella = JSON.stringify(modelos)
  const antes = avisado.get(id)
  avisado.set(id, huella)
  if (antes !== undefined && antes !== huella) alCambiar?.(id, modelos)
  return modelos
}

/** Lo que ya se sabe de un agente, sin preguntarle nada (para revisar una elección al instante). */
export function catalogoRecordado(id: AgenteId): ModeloAgente[] {
  if (id === 'kimi') return modelosKimi()
  if (id === 'gemini') return modelosGemini()
  if (id === 'codex') return modelosCodex()
  return leer()[id]?.modelos ?? []
}

/** Quita de una elección el modelo (o el esfuerzo) que el agente ya no tiene: así no falla. */
export function eleccionVigente<T extends { agente: AgenteId; modelo?: string; esfuerzo?: string }>(e: T): T {
  if (!e.modelo) return e
  const lista = catalogoRecordado(e.agente)
  if (!lista.length) return e
  const m = lista.find((x) => x.id === e.modelo)
  if (!m) {
    const { modelo: _m, esfuerzo: _e, ...resto } = e
    return resto as T
  }
  if (e.esfuerzo && !m.esfuerzos.includes(e.esfuerzo)) {
    const { esfuerzo: _e, ...resto } = e
    return resto as T
  }
  return e
}

export async function catalogoAgente(id: AgenteId, forzar = false): Promise<ModeloAgente[]> {
  // Kimi, Gemini CLI y Codex guardan su lista al día en archivos locales: se leen cada vez.
  if (id === 'kimi' || id === 'gemini' || id === 'codex') return anotar(id, catalogoRecordado(id))
  const guardado = leer()[id]
  if (!forzar && guardado?.modelos.length) {
    // Lo recordado al instante; si es de hace más de una hora, se pregunta de fondo para la próxima.
    if (Date.now() - guardado.fecha > UNA_HORA && !enCurso.has(id)) void catalogoAgente(id, true).catch(() => [])
    if (!avisado.has(id)) avisado.set(id, JSON.stringify(guardado.modelos))
    return guardado.modelos
  }
  const ya = enCurso.get(id)
  if (ya) return ya
  const pedido = (async () => {
    let modelos: ModeloAgente[] = []
    if (id === 'claude') modelos = await modelosClaude()
    else if (id === 'opencode') modelos = await modelosOpenCode()
    else if (id === 'antigravity') modelos = await (await import('./antigravity')).catalogoAntigravity(forzar).catch(() => [])
    if (modelos.length) {
      const todo = leer()
      todo[id] = { fecha: Date.now(), modelos }
      try {
        writeFileSync(ruta(), JSON.stringify(todo))
      } catch {
        // Solo es una caché.
      }
      if (!avisado.has(id) && guardado?.modelos.length) avisado.set(id, JSON.stringify(guardado.modelos))
      return anotar(id, modelos)
    }
    // Si no se pudo preguntar, lo último que se supo.
    return guardado?.modelos ?? []
  })().finally(() => enCurso.delete(id))
  enCurso.set(id, pedido)
  return pedido
}
