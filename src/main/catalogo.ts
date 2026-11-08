import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
 * - Kimi y Gemini CLI no tienen cómo listar sus modelos: van los conocidos.
 * Se recuerda un día; «forzar» vuelve a preguntar.
 */

const UN_DIA = 24 * 60 * 60_000
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
      const vistos = new Set<string>()
      const modelos: ModeloAgente[] = []
      for (const x of lista) {
        const id = typeof x.value === 'string' ? x.value : ''
        // «default» es un atajo a otro de la lista; los alias (opus, sonnet…) siguen a la última versión.
        if (!id || id === 'default' || !ID_SEGURO.test(id) || vistos.has(String(x.resolvedModel ?? id))) continue
        vistos.add(String(x.resolvedModel ?? id))
        const esfuerzos = Array.isArray(x.supportedEffortLevels) ? x.supportedEffortLevels.filter((e): e is string => typeof e === 'string' && ID_SEGURO.test(e)) : []
        modelos.push({
          id,
          nombre: typeof x.displayName === 'string' ? x.displayName : id,
          esfuerzos,
          esfuerzoDefecto: esfuerzos.includes('high') ? 'high' : esfuerzos[0]
        })
      }
      return modelos
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

const enCurso = new Map<AgenteId, Promise<ModeloAgente[]>>()

export async function catalogoAgente(id: AgenteId, forzar = false): Promise<ModeloAgente[]> {
  if (FIJOS[id]) return FIJOS[id]!
  const guardado = leer()[id]
  if (!forzar && guardado && Date.now() - guardado.fecha < UN_DIA && guardado.modelos.length) return guardado.modelos
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
      return modelos
    }
    // Si no se pudo preguntar, lo último que se supo.
    return guardado?.modelos ?? []
  })().finally(() => enCurso.delete(id))
  enCurso.set(id, pedido)
  return pedido
}
