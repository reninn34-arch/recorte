import { spawn } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ADAPTADORES, type EventoAgente } from './adaptadoresagente'
import { agenteDeOrden } from './agentes'
import { pathAmpliado } from './binarios'
import { entornoParaAgente, falloDeAgente, matarArbol, Parado } from './ia'

/**
 * Un turno de un agente que trabaja con herramientas en una carpeta, con los mismos
 * eventos sea cual sea el agente. Cada agente habla a su manera (Claude Code: stream-json;
 * Codex: JSONL de `exec --json`; los demás: texto suelto), y su adaptador lo traduce a
 * `EventoAgente`. Lo importante es el FIN DE TURNO explícito: cuando el agente dice que
 * terminó, Recorte termina, aunque el proceso se quede abierto por algo que dejó de fondo.
 *
 * Los agentes con sesión (Claude Code y Codex) devuelven su id: el turno siguiente la
 * retoma, así el agente recuerda lo que vio e hizo y no lo vuelve a leer ni a medir.
 */

/** Qué agente corre la orden y si sabe trabajar con herramientas (null si no: una API, o desconocido). */
export function agenteConHerramientas(base: string): { agente: string; conSesion: boolean } | null {
  const b = base.trim()
  if (b.startsWith('antigravity:acp')) return { agente: 'antigravity', conSesion: false }
  const agente = agenteDeOrden(b)
  const a = agente ? ADAPTADORES[agente] : undefined
  return agente && a ? { agente, conSesion: a.conSesion } : null
}

/** La orden con la que se lanza el turno (para pruebas y diagnóstico). */
export function ordenDelTurno(base: string, cwd: string, sesion?: string): string | null {
  const agente = agenteDeOrden(base.trim())
  const a = agente ? ADAPTADORES[agente] : undefined
  return a ? a.orden(base, cwd, a.conSesion ? sesion : undefined) : null
}

/** Traduce una línea de un agente a eventos (exportado para las pruebas). */
export function leerLinea(agente: string, linea: string): EventoAgente[] {
  return ADAPTADORES[agente]?.leer(linea) ?? []
}

export interface PeticionTurno {
  /** El comando base del agente, como está en Ajustes (con su modelo). */
  base: string
  cwd: string
  prompt: string
  /** La conversación a retomar (solo Claude y Codex). */
  sesion?: string
  onLinea: (texto: string) => void
  senal?: AbortSignal
  timeoutMs: number
  /** Si el agente ya dejó su entrega: con eso y un rato callado, el turno terminó aunque no salga. */
  entregaLista?: () => boolean
}

export interface ResultadoTurno {
  respuesta: string
  /** La conversación de este turno (para retomarla en el siguiente). */
  sesion?: string
  costoUsd?: number
}

/** Un fallo al retomar: la sesión ya no existe (se borró, otra carpeta, otra cuenta). */
export class SesionPerdida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'SesionPerdida'
  }
}

const SIN_SESION = /no conversation found|no rollout found|resume failed|session.{0,30}(not found|no existe|does not exist)|no (such|matching) (session|thread)|could not (find|resume)|failed to resume|thread .{0,40}not found/i

/** Lanza un turno del agente en su carpeta. Se puede parar; termina al fin de turno del agente. */
export async function turnoAgente(p: PeticionTurno): Promise<ResultadoTurno> {
  if (p.senal?.aborted) throw new Parado()
  const agente = agenteDeOrden(p.base.trim())
  const ad = agente ? ADAPTADORES[agente] : undefined
  if (!agente || !ad) throw new Error('Este agente no sabe trabajar con herramientas en una carpeta.')
  const sesion = ad.conSesion ? p.sesion : undefined
  let comando = ad.orden(p.base, p.cwd, sesion)
  let archivoPrompt: string | null = null
  if (comando.includes('{prompt}')) {
    // Kimi toma el prompt como archivo (`-p "@{prompt}"`), no por stdin.
    archivoPrompt = join(tmpdir(), `recorte-agente-${Date.now()}.txt`)
    writeFileSync(archivoPrompt, p.prompt, 'utf8')
    comando = comando.replaceAll('{prompt}', archivoPrompt)
  }
  const extra = await entornoParaAgente(comando)
  return new Promise<ResultadoTurno>((resolver, rechazar) => {
    // Un render largo debe poder esperarse en primer plano: si el agente lo deja en segundo
    // plano y termina su turno, al cerrar su proceso se corta el render (y no hay entrega).
    // Claude Code acepta estos topes por entorno (por defecto, 2 y 10 min).
    const esperaLarga = { BASH_DEFAULT_TIMEOUT_MS: String(30 * 60_000), BASH_MAX_TIMEOUT_MS: String(60 * 60_000) }
    const hijo = spawn(comando, { cwd: p.cwd, shell: true, windowsHide: true, env: { ...process.env, ...esperaLarga, ...extra, PATH: pathAmpliado() } })
    let resto = ''
    let restoErr = ''
    let respuesta = ''
    let final: Extract<EventoAgente, { t: 'fin' }> | null = null
    let idSesion: string | undefined
    let error = ''
    let cerrado = false
    let ultimaSalida = Date.now()
    let graciaFinal: ReturnType<typeof setTimeout> | null = null

    const limpiar = () => {
      if (!archivoPrompt) return
      try {
        unlinkSync(archivoPrompt)
      } catch {
        // Se borra solo con el tiempo.
      }
    }
    const fin = (e?: Error) => {
      if (cerrado) return
      cerrado = true
      clearTimeout(reloj)
      clearInterval(vigia)
      if (graciaFinal) clearTimeout(graciaFinal)
      p.senal?.removeEventListener('abort', alParar)
      limpiar()
      if (e) rechazar(e)
      else resolver({ respuesta: (final?.respuesta || respuesta).trim(), ...(idSesion ? { sesion: idSesion } : {}), ...(final?.costoUsd !== undefined ? { costoUsd: final.costoUsd } : {}) })
    }
    const terminar = (codigo: number | null) => {
      if (cerrado) return
      if (resto.trim()) procesar(resto, false)
      if (restoErr.trim()) procesar(restoErr, true)
      resto = restoErr = ''
      if (final && !final.ok) {
        const dijo = final.error ?? 'El agente terminó con un error.'
        if (sesion && SIN_SESION.test(`${dijo} ${error}`)) return fin(new SesionPerdida(dijo))
        return fin(new Error(falloDeAgente(p.base, dijo)))
      }
      // Con fin de turno o con la entrega hecha, el código de salida no importa: pudo cerrarlo
      // Recorte o morir al cerrar lo que el agente dejó de fondo.
      if (final?.ok || codigo === 0 || p.entregaLista?.()) return fin()
      const dijo = (error.trim() || respuesta.trim()).slice(-300)
      if (sesion && SIN_SESION.test(dijo)) return fin(new SesionPerdida(dijo))
      fin(new Error(falloDeAgente(p.base, dijo || `El agente terminó con código ${codigo} sin decir nada.`)))
    }
    const procesar = (linea: string, deStderr: boolean) => {
      if (deStderr) {
        const t = linea.replace(/\x1b\[[0-9;]*m/g, '').trim()
        if (ad.stderrEsAvance && t.length > 3 && !/^(\[?\d{4}-\d\d-\d\d|debug|trace)/i.test(t)) p.onLinea(t.slice(0, 160))
        return
      }
      for (const ev of ad.leer(linea)) {
        if (ev.t === 'linea') p.onLinea(ev.texto)
        else if (ev.t === 'sesion') idSesion = ev.id
        else if (ev.t === 'respuesta') respuesta = ad.conSesion ? ev.texto : respuesta + ev.texto
        else if (ev.t === 'fin') {
          final = ev
          // Dijo que terminó: si no sale (dejó un servidor, un render, un shell abierto), se le
          // da un respiro y se cierra. Así nunca se queda colgado al terminar.
          if (!graciaFinal) {
            graciaFinal = setTimeout(() => {
              if (cerrado) return
              matarArbol(hijo)
              terminar(0)
            }, 10_000)
          }
        }
      }
    }

    const reloj = setTimeout(() => {
      matarArbol(hijo)
      fin(new Error(`El agente tardó demasiado (${Math.round(p.timeoutMs / 60_000)} min).`))
    }, p.timeoutMs)
    const alParar = () => {
      matarArbol(hijo)
      fin(new Parado())
    }
    p.senal?.addEventListener('abort', alParar, { once: true })
    // Los agentes sin fin de turno: si ya escribió su entrega y lleva un rato callado, terminó.
    const vigia = setInterval(() => {
      if (cerrado || !p.entregaLista) return
      if (Date.now() - ultimaSalida > 90_000 && p.entregaLista()) {
        p.onLinea('El agente entregó y quedó esperando: Recorte cierra su sesión')
        matarArbol(hijo)
        terminar(0)
      }
    }, 5000)

    hijo.stdout.on('data', (b: Buffer) => {
      ultimaSalida = Date.now()
      resto += b.toString('utf8')
      const lineas = resto.split(/\r?\n/)
      resto = lineas.pop() ?? ''
      for (const l of lineas) procesar(l, false)
    })
    hijo.stderr.on('data', (b: Buffer) => {
      ultimaSalida = Date.now()
      const t = b.toString('utf8')
      error = (error + t).slice(-2000)
      restoErr += t
      const lineas = restoErr.split(/\r?\n/)
      restoErr = lineas.pop() ?? ''
      for (const l of lineas) procesar(l, true)
    })
    hijo.on('error', () => fin(new Error(`No pude lanzar el agente («${comando.slice(0, 60)}»).`)))
    hijo.on('close', terminar)
    // 'close' espera a que se cierre su salida, y un proceso que el agente dejó de fondo la
    // mantiene abierta: al salir el agente, se da un respiro para lo último y se cierra.
    hijo.on('exit', (codigo) => setTimeout(() => terminar(codigo), 1500))
    if (archivoPrompt) hijo.stdin.end()
    else hijo.stdin.end(p.prompt, 'utf8')
  })
}
