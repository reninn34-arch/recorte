import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MensajeChat } from '../shared/chat'
import type { Project } from '../shared/types'
import { leerRespuesta, type TurnoAgente } from './chat'
import { guardar } from './disco'
import { esParado } from './ia'
import { ordenCodexConRecorte, ordenConRecorte } from './adaptadoresagente'
import { SesionPerdida, turnoAgente } from './turnoagente'

/**
 * El chat del editor con un agente que trabaja con herramientas (Claude Code): edita el proyecto a través del MCP de
 * Recorte (ver_proyecto, ver_cuadro, editar_timeline, analizar_video…) mirando y comprobando lo que hace, como un editor.
 * Cada cambio llega al editor al momento y se deshace con Ctrl+Z. Lleva además lo suyo: sus skills, internet y sus MCP.
 * La conversación se retoma de un mensaje al siguiente (su sesión), así no vuelve a leer lo que ya vio.
 * Con una llave de API (que no sabe usar herramientas) el chat sigue como antes: texto → operaciones (chat.ts).
 */

export interface PeticionChatHerramientas {
  proyecto: Project
  historial: MensajeChat[]
  peticion: string
  referencia?: string
  gustos?: string
  /** La orden del agente, como está en Ajustes (con su modelo). */
  base: string
  /** El MCP de Recorte, tal como corre ahora en la app. */
  mcp: { url: string; contrasena: string }
  /** Su carpeta de trabajo para este proyecto (en los datos de Recorte). */
  carpeta: string
  /** Lo que puede usar según la caja del chat (imágenes, clips, voz, si pregunta antes), en palabras. */
  permisos?: string
  senal?: AbortSignal
  onPaso?: (texto: string) => void
}

export const INSTRUCCIONES_CHAT_HERRAMIENTAS = (p: Project): string => `Eres el editor de video de Recorte y trabajas en el chat de su editor, junto al usuario. Hablas en español.
El usuario tiene abierto el proyecto «${p.name}» (id ${p.id}). Lo editas con las herramientas del MCP de Recorte
(mcp__recorte__…), siempre con "proyecto": "${p.id}":
- ver_proyecto: sus pistas, medios y lo que se dice. Míralo al empezar (y otra vez solo si cambió algo que no hiciste tú).
- editar_timeline: TODAS las ediciones (cortar, textos, color, capas, sonidos, música, claves, transiciones…). Su
  descripción tiene la lista de operaciones. Junta en una llamada lo que va junto.
- ver_cuadro: cómo se ve un segundo, tal cual saldría. Úsalo para mirar antes de cambiar algo visual y para COMPROBAR
  después que quedó bien (un texto que tapa una cara, un logo descolocado). Si no quedó bien, corrígelo.
- analizar_video: un video toma por toma (cámara, encuadre, fallos, ritmo de la música). Para escoger tomas, cortar al
  ritmo o editar «como» un video que el usuario nombre.
- Y las demás que necesites: revisar_audio, quitar_fondo, animar_capa, anadir_pieza, poner_audio, transcribir…
Lo que cambias aparece al momento en su editor y él lo deshace con Ctrl+Z.

Cómo trabajar:
- Haz lo que pide, ni más ni menos, y compruébalo. Si es una pregunta, contéstala sin editar nada.
- Si el pedido es ambiguo y equivocarte sería caro (borrar mucho, rehacer el montaje), pregunta antes de editar.
- No uses crear_video, hacer_video, hablar_con_agente, crear_proyecto ni exportar salvo que te lo pida. Lo que gasta
  créditos o cuota (voz nueva, clips de Flow) te devuelve primero su costo: pregúntale al usuario y no lo confirmes tú.
- Tus skills, internet y tus otros MCP también valen si ayudan al video.
- Trabaja rápido: no repitas lo que ya viste ni mires cuadros que no necesitas.

Si NO tienes las herramientas de Recorte (no ves ver_proyecto ni editar_timeline, ni buscándolas), no inventes nada:
responde solo {"sin_herramientas": true}.

Al terminar, responde SOLO con este JSON (sin markdown):
{"mensaje": "lo que hiciste o tu respuesta, en 1-3 frases para el usuario", "propuestas": ["hasta 3 siguientes pasos cortos, en sus palabras"], "aprendido": ["gustos del usuario que duran más allá de este video, si dijo alguno"]}`

function conversacion(historial: MensajeChat[]): string {
  return historial
    .slice(-12)
    .map((m) => `${m.rol === 'usuario' ? 'Usuario' : 'Tú'}: ${m.texto}${m.cambios?.length ? ` [aplicado: ${m.cambios.join('; ')}]` : ''}`)
    .join('\n')
}

/** Los agentes del chat con herramientas: los que saben recibir el MCP de Recorte. */
export const AGENTES_CHAT_HERRAMIENTAS = ['claude', 'codex', 'kimi', 'opencode', 'gemini', 'antigravity']

/**
 * Le da a cada agente el MCP de Recorte a su manera, solo en su carpeta de trabajo del chat (no toca su configuración
 * de siempre): Claude Code y Codex en la orden; Kimi Code, OpenCode y Gemini CLI con su archivo de proyecto.
 */
export function conectarMcp(agente: string, carpeta: string, mcp: { url: string; contrasena: string }): { ordenFinal?: (c: string) => string; entorno?: Record<string, string> } {
  const cabeceras = { Authorization: `Bearer ${mcp.contrasena}` }
  switch (agente) {
    case 'claude': {
      const archivo = join(carpeta, 'recorte-mcp.json')
      guardar(archivo, JSON.stringify({ mcpServers: { recorte: { type: 'http', url: mcp.url, headers: cabeceras } } }))
      return { ordenFinal: (c) => ordenConRecorte(c, archivo) }
    }
    case 'codex':
      // La contraseña va por una variable de entorno (no en la orden, que queda en los registros).
      return { ordenFinal: (c) => ordenCodexConRecorte(c, mcp.url), entorno: { RECORTE_MCP_TOKEN: mcp.contrasena } }
    case 'kimi':
      mkdirSync(join(carpeta, '.kimi-code'), { recursive: true })
      guardar(join(carpeta, '.kimi-code', 'mcp.json'), JSON.stringify({ mcpServers: { recorte: { url: mcp.url, headers: cabeceras } } }, null, 2))
      return {}
    case 'opencode':
      guardar(join(carpeta, 'opencode.json'), JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { recorte: { type: 'remote', url: mcp.url, headers: cabeceras, enabled: true } } }, null, 2))
      return {}
    case 'gemini':
      mkdirSync(join(carpeta, '.gemini'), { recursive: true })
      guardar(join(carpeta, '.gemini', 'settings.json'), JSON.stringify({ mcpServers: { recorte: { httpUrl: mcp.url, headers: cabeceras, trust: true } } }, null, 2))
      return {}
    default:
      return {}
  }
}

export async function turnoChatHerramientas(p: PeticionChatHerramientas & { agente: string }): Promise<TurnoAgente & { sinHerramientas?: boolean }> {
  mkdirSync(p.carpeta, { recursive: true })
  const conexion = conectarMcp(p.agente, p.carpeta, p.mcp)
  // La sesión del chat de este proyecto: se retoma mientras la conversación siga (un chat nuevo empieza otra).
  const archivoSesion = join(p.carpeta, `sesion-${p.agente}.json`)
  let sesion: string | undefined
  if (p.historial.length) {
    try {
      sesion = (JSON.parse(readFileSync(archivoSesion, 'utf8')) as { sesion?: string }).sesion
    } catch {
      sesion = undefined
    }
  }
  const pedido = [
    p.gustos ? `${p.gustos}\n` : '',
    p.permisos ? `LO QUE PUEDES USAR (lo eligió el usuario en la caja del chat; respétalo):\n${p.permisos}\n` : '',
    p.referencia ? `DÓNDE ESTÁ EL USUARIO EN EL EDITOR: ${p.referencia}` : '',
    `PETICIÓN DEL USUARIO: ${p.peticion}`
  ]
    .filter(Boolean)
    .join('\n')
  const completo = `${INSTRUCCIONES_CHAT_HERRAMIENTAS(p.proyecto)}\n\n${p.historial.length ? `CONVERSACIÓN HASTA AHORA\n${conversacion(p.historial)}\n\n` : ''}${pedido}`
  // Antigravity no es un programa de línea de comandos: habla ACP, y el MCP de Recorte va al abrir su sesión.
  const lanzar = async (conSesion: string | undefined): Promise<{ respuesta: string; sesion?: string }> => {
    if (p.agente === 'antigravity') {
      const [{ trabajarAntigravity }, { opcionesAntigravity }] = await Promise.all([import('./antigravity'), import('./modelos')])
      const respuesta = await trabajarAntigravity(completo, p.carpeta, (t) => p.onPaso?.(t), p.senal, 30 * 60_000, [], opcionesAntigravity(p.base), undefined, [
        { nombre: 'recorte', url: p.mcp.url, cabeceras: { Authorization: `Bearer ${p.mcp.contrasena}` } }
      ])
      return { respuesta }
    }
    return turnoAgente({
      base: p.base,
      cwd: p.carpeta,
      // Retomando, el agente ya tiene las instrucciones y la conversación: basta lo nuevo.
      prompt: conSesion ? `${pedido}\n\n(Sigue en el proyecto ${p.proyecto.id} y responde al final con el mismo JSON.)` : completo,
      sesion: conSesion,
      onLinea: (t) => p.onPaso?.(t),
      senal: p.senal,
      timeoutMs: 30 * 60_000,
      ...conexion
    })
  }
  try {
    let r
    try {
      r = await lanzar(sesion)
    } catch (e) {
      if (!(e instanceof SesionPerdida) || !sesion) throw e
      r = await lanzar(undefined)
    }
    if (r.sesion) guardar(archivoSesion, JSON.stringify({ sesion: r.sesion }))
    // No vio las herramientas de Recorte (su versión no lee el MCP así): el chat sigue en modo texto.
    if (/"sin_herramientas"\s*:\s*true/.test(r.respuesta)) return { ok: false, mensaje: '', operaciones: [], sinHerramientas: true }
    const turno = leerRespuesta(r.respuesta)
    // Las ediciones ya las hizo por el MCP (y llegaron al editor): las operaciones del JSON no se aplican otra vez.
    return { ...turno, operaciones: [] }
  } catch (error) {
    if (esParado(error)) return { ok: false, mensaje: '', operaciones: [], parado: true }
    return { ok: false, mensaje: '', operaciones: [], error: error instanceof Error ? error.message : String(error) }
  }
}
