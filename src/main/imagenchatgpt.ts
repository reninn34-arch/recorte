import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolverBinario, pathAmpliado } from './binarios'
import { matarArbol, Parado } from './ia'

/**
 * Imágenes con la cuenta de ChatGPT del usuario. No hay API ni llave: se le pide a
 * Codex (el agente de OpenAI, conectado con «Iniciar sesión con ChatGPT») que use su
 * herramienta de imágenes, que va con el plan de ChatGPT del usuario. Codex guarda lo
 * que genera en `~/.codex/generated_images/`; de ahí se toma la imagen nueva.
 *
 * El modelo de imagen lo elige OpenAI (el mismo que usa ChatGPT): Codex no deja elegir
 * versión, así que en la app hay una sola opción, «ChatGPT Imágenes».
 */

export { MODELO_CHATGPT } from '../shared/flow'

const carpetaCodex = () => process.env.CODEX_HOME ?? join(homedir(), '.codex')

export interface EstadoChatGPT {
  instalado: boolean
  conectado: boolean
  /** Con la cuenta de ChatGPT (no con una llave de API). */
  conCuenta: boolean
}

export function estadoChatGPT(): EstadoChatGPT {
  const instalado = resolverBinario('codex') !== null
  const auth = join(carpetaCodex(), 'auth.json')
  if (!existsSync(auth)) return { instalado, conectado: false, conCuenta: false }
  let conCuenta = true
  try {
    const d = JSON.parse(readFileSync(auth, 'utf8')) as { auth_mode?: string; tokens?: unknown; OPENAI_API_KEY?: unknown }
    conCuenta = d.auth_mode ? d.auth_mode !== 'apikey' : Boolean(d.tokens)
  } catch {
    // Si no se puede leer, se intenta igual: Codex dirá si no hay sesión.
  }
  return { instalado, conectado: instalado, conCuenta }
}

/** Todas las imágenes que hay en la carpeta de Codex, con su fecha. */
function imagenesDeCodex(): { ruta: string; fecha: number }[] {
  const raiz = join(carpetaCodex(), 'generated_images')
  if (!existsSync(raiz)) return []
  const lista: { ruta: string; fecha: number }[] = []
  const recorrer = (dir: string, nivel: number) => {
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const r = join(dir, n.name)
      if (n.isDirectory() && nivel < 3) recorrer(r, nivel + 1)
      else if (/\.(png|jpe?g|webp)$/i.test(n.name)) lista.push({ ruta: r, fecha: statSync(r).mtimeMs })
    }
  }
  recorrer(raiz, 0)
  return lista
}

const PROPORCION: Record<string, string> = {
  '9:16': 'vertical, 9:16 (1024×1536 o lo más parecido)',
  '16:9': 'horizontal, 16:9 (1536×1024 o lo más parecido)',
  '1:1': 'cuadrada, 1:1'
}

// Una a la vez: varias sesiones de Codex en paralelo chocan con los límites del plan.
let cola: Promise<unknown> = Promise.resolve()

export function generarImagenChatGPT(
  pedido: { prompt: string; formato: string },
  destino: string,
  nombre: string,
  senal?: AbortSignal
): Promise<string> {
  const trabajo = cola.then(() => generar(pedido, destino, nombre, senal))
  cola = trabajo.catch(() => {})
  return trabajo
}

async function generar(pedido: { prompt: string; formato: string }, destino: string, nombre: string, senal?: AbortSignal): Promise<string> {
  if (senal?.aborted) throw new Parado()
  const codex = resolverBinario('codex')
  if (!codex) throw new Error('Para usar ChatGPT instala Codex en Ajustes → Agentes y entra con tu cuenta de ChatGPT.')
  const trabajo = mkdtempSync(join(tmpdir(), 'recorte-chatgpt-'))
  const previas = new Set(imagenesDeCodex().map((x) => x.ruta))
  const instruccion = [
    'Genera UNA imagen con tu herramienta integrada de generación de imágenes (image_gen).',
    'No la dibujes con código, SVG ni HTML, y no escribas texto dentro de la imagen.',
    `Proporción: ${PROPORCION[pedido.formato] ?? PROPORCION['9:16']}.`,
    `Lo que debe mostrar: ${pedido.prompt}`,
    'Cuando esté hecha, copia el archivo a este directorio de trabajo con el nombre imagen.png.',
    'Responde solo con el nombre del archivo.'
  ].join('\n')

  try {
    await new Promise<void>((resolver, rechazar) => {
      const hijo = spawn(`"${codex}" exec --skip-git-repo-check -s workspace-write -C "${trabajo}" -`, {
        cwd: trabajo,
        shell: true,
        windowsHide: true,
        env: { ...process.env, PATH: pathAmpliado() }
      })
      let salida = ''
      let terminado = false
      const fin = (error?: Error) => {
        if (terminado) return
        terminado = true
        clearTimeout(reloj)
        senal?.removeEventListener('abort', alParar)
        if (error) rechazar(error)
        else resolver()
      }
      const reloj = setTimeout(() => {
        matarArbol(hijo)
        fin(new Error('ChatGPT tardó demasiado en hacer la imagen (6 min).'))
      }, 6 * 60_000)
      const alParar = () => {
        matarArbol(hijo)
        fin(new Parado())
      }
      senal?.addEventListener('abort', alParar, { once: true })
      hijo.stdout.on('data', (b: Buffer) => (salida += b.toString('utf8')))
      hijo.stderr.on('data', (b: Buffer) => (salida += b.toString('utf8')))
      hijo.on('error', () => fin(new Error('No pude abrir Codex. Revisa que esté instalado en Ajustes → Agentes.')))
      // Codex a veces termina con error al copiar aunque la imagen ya exista: se mira después.
      hijo.on('close', (codigo) => {
        if (codigo !== 0 && /not logged in|login|unauthorized|401/i.test(salida)) {
          fin(new Error('Codex no tiene sesión: entra con tu cuenta de ChatGPT en Ajustes → Agentes.'))
        } else fin()
      })
      hijo.stdin.end(instruccion, 'utf8')
    })

    // La imagen: la que copió al directorio de trabajo, o la más nueva de Codex.
    const copiada = readdirSync(trabajo).find((n) => /\.(png|jpe?g|webp)$/i.test(n))
    // Se compara con las que ya había (no por fecha: al copiar, Windows conserva la fecha vieja).
    const origen = copiada
      ? join(trabajo, copiada)
      : imagenesDeCodex()
          .filter((x) => !previas.has(x.ruta))
          .sort((a, b) => b.fecha - a.fecha)[0]?.ruta
    if (!origen) throw new Error('ChatGPT no devolvió ninguna imagen (puede que tu plan haya llegado a su límite por hoy).')
    mkdirSync(destino, { recursive: true })
    const final = join(destino, `${nombre}${origen.match(/\.\w+$/)?.[0] ?? '.png'}`)
    copyFileSync(origen, final)
    return final
  } finally {
    rmSync(trabajo, { recursive: true, force: true })
  }
}
