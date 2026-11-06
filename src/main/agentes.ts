import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathAmpliado } from './binarios'

/**
 * Detección y conexión de agentes CLI (los "planes" del usuario).
 * La idea: conectar un plan debe ser un botón, no escribir comandos.
 * Recorte detecta qué agentes están instalados y con sesión iniciada,
 * y lanza el login del agente (el navegador se abre solo).
 */

export interface EstadoAgente {
  id: 'kimi' | 'claude' | 'codex' | 'gemini'
  nombre: string
  instalado: boolean
  /** null = no se puede saber sin llamar al agente. */
  conectado: boolean | null
  /** Comando listo para Ajustes (`comandoCli`). */
  comando: string
  /** Cómo instalarlo si falta. */
  instalar: string
}

interface DefAgente {
  id: EstadoAgente['id']
  nombre: string
  binario: string
  comando: string
  /** Archivo que solo existe con sesión iniciada; null si no hay forma fiable. */
  credenciales: string | null
  instalar: string
}

const AGENTES: DefAgente[] = [
  {
    id: 'kimi',
    nombre: 'Kimi Code',
    binario: 'kimi',
    comando: 'kimi -p "@{prompt}"',
    credenciales: join(homedir(), '.kimi-code', 'credentials'),
    instalar: 'npm i -g @moonshot-ai/kimi-code'
  },
  {
    id: 'claude',
    nombre: 'Claude Code',
    binario: 'claude',
    comando: 'claude -p',
    credenciales: join(homedir(), '.claude', '.credentials.json'),
    instalar: 'npm i -g @anthropic-ai/claude-code'
  },
  {
    id: 'codex',
    nombre: 'Codex',
    binario: 'codex',
    comando: 'codex exec',
    credenciales: join(homedir(), '.codex', 'auth.json'),
    instalar: 'npm i -g @openai/codex'
  },
  {
    id: 'gemini',
    nombre: 'Gemini CLI',
    binario: 'gemini',
    comando: 'gemini -p',
    credenciales: join(homedir(), '.gemini', 'oauth_creds.json'),
    instalar: 'npm i -g @google/gemini-cli'
  }
]

function versionResponde(binario: string): Promise<boolean> {
  return new Promise((resolver) => {
    execFile(
      binario,
      ['--version'],
      { timeout: 8000, windowsHide: true, shell: true, env: { ...process.env, PATH: pathAmpliado() } },
      (error) => resolver(!error)
    )
  })
}

export async function estadoAgentes(): Promise<EstadoAgente[]> {
  return Promise.all(
    AGENTES.map(async (agente) => {
      const instalado = await versionResponde(agente.binario)
      return {
        id: agente.id,
        nombre: agente.nombre,
        instalado,
        conectado: agente.credenciales ? existsSync(agente.credenciales) : null,
        comando: agente.comando,
        instalar: agente.instalar
      }
    })
  )
}

export interface ConexionResultado {
  ok: boolean
  error?: string
  aviso?: string
}

/**
 * Conecta un agente con un clic. En Kimi el login abre el navegador solo
 * (flujo de código de dispositivo) y el proceso termina al autorizar.
 * Para el resto se indica el comando exacto: sus logins son interactivos
 * y necesitan una terminal a la vista.
 */
export function conectarAgente(id: unknown): Promise<ConexionResultado> {
  const agente = AGENTES.find((a) => a.id === id)
  if (!agente) return Promise.resolve({ ok: false, error: 'Agente desconocido.' })

  if (agente.id !== 'kimi') {
    return Promise.resolve({
      ok: false,
      aviso: `Instálalo con «${agente.instalar}» y entra con «${agente.binario}» una vez en una terminal; después Recorte lo detecta solo.`
    })
  }

  return new Promise((resolver) => {
    let terminado = false
    const hijo = spawn('kimi login', {
      windowsHide: false,
      shell: true,
      env: { ...process.env, PATH: pathAmpliado() }
    })
    const temporizador = setTimeout(() => {
      if (!terminado) {
        hijo.kill()
        resolver({ ok: false, error: 'El login tardó demasiado. Inténtalo de nuevo.' })
      }
    }, 10 * 60_000) // el código de dispositivo vive 30 min; margen de 10

    let salida = ''
    hijo.stdout.on('data', (b: Buffer) => (salida += b.toString('utf8')))
    hijo.stderr.on('data', (b: Buffer) => (salida += b.toString('utf8')))
    hijo.on('error', (e) => {
      clearTimeout(temporizador)
      resolver({
        ok: false,
        error: `No pude lanzar el login: ${e.message}. Instálalo con «${agente.instalar}».`
      })
    })
    hijo.on('close', (codigo) => {
      terminado = true
      clearTimeout(temporizador)
      if (codigo === 0 && existsSync(agente.credenciales!)) {
        resolver({ ok: true })
      } else {
        resolver({
          ok: false,
          error: salida.trim().slice(-300) || 'El login no se completó.'
        })
      }
    })
  })
}
