import {
  describirTimelineParaAgente,
  INSTRUCCIONES_AGENTE,
  validarOperaciones,
  type MensajeChat,
  type OperacionTL
} from '../shared/chat'
import { leerCriterio } from '../shared/gustos'
import type { Timeline } from '../shared/timeline'
import type { AjustesIA, Project } from '../shared/types'
import { esParado, extraerJson, preguntarAgente, preguntarApi } from './ia'

/**
 * Un turno del chat: arma lo que el agente necesita saber (la timeline tal como está,
 * la voz, lo que se habló y dónde está el usuario), le pregunta y devuelve su mensaje y
 * sus operaciones ya validadas. Aplicarlas es cosa de la interfaz: así quedan en el
 * historial de deshacer como cualquier edición a mano.
 */

export interface TurnoAgente {
  ok: boolean
  mensaje: string
  operaciones: OperacionTL[]
  error?: string
  /** El usuario lo paró: no respondió nada ni cambió nada. */
  parado?: boolean
  propuestas?: string[]
  aprendido?: string[]
}

const TURNOS_DE_MEMORIA = 12

function conversacion(historial: MensajeChat[]): string {
  const recientes = historial.slice(-TURNOS_DE_MEMORIA)
  if (!recientes.length) return '(es el primer mensaje)'
  return recientes
    .map((m) => {
      const quien = m.rol === 'usuario' ? 'Usuario' : 'Tú'
      const hechos = m.cambios?.length ? ` [aplicado: ${m.cambios.join('; ')}]` : ''
      return `${quien}: ${m.texto}${hechos}`
    })
    .join('\n')
}

export function armarPrompt(
  proyecto: Project,
  timeline: Timeline,
  historial: MensajeChat[],
  peticion: string,
  referencia?: string,
  gustos = ''
): { sistema: string; usuario: string } {
  const usuario = [
    `Proyecto: «${proyecto.name}».`,
    '',
    gustos,
    '',
    'ESTADO ACTUAL DE LA TIMELINE',
    describirTimelineParaAgente(timeline, proyecto.transcript, proyecto.source.duration),
    '',
    'CONVERSACIÓN HASTA AHORA',
    conversacion(historial),
    '',
    referencia ? `DÓNDE ESTÁ EL USUARIO EN EL EDITOR: ${referencia}` : '',
    `PETICIÓN DEL USUARIO: ${peticion}`,
    '',
    'Responde solo con el JSON {"mensaje": …, "operaciones": […], "propuestas": […], "aprendido": […]}.'
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
  return { sistema: INSTRUCCIONES_AGENTE, usuario }
}

/** Lee la respuesta: JSON con mensaje y operaciones; si no hay JSON, es solo texto. */
export function leerRespuesta(texto: string): TurnoAgente {
  try {
    const datos = extraerJson(texto) as { mensaje?: unknown; operaciones?: unknown }
    const mensaje = typeof datos.mensaje === 'string' && datos.mensaje.trim() ? datos.mensaje.trim() : 'Listo.'
    return { ok: true, mensaje, operaciones: validarOperaciones(datos.operaciones), ...leerCriterio(datos) }
  } catch {
    const limpio = texto.trim()
    return limpio
      ? { ok: true, mensaje: limpio.slice(0, 2000), operaciones: [] }
      : { ok: false, mensaje: '', operaciones: [], error: 'El agente no respondió nada.' }
  }
}

export async function turnoAgente(
  proyecto: Project,
  timeline: Timeline,
  historial: MensajeChat[],
  peticion: string,
  referencia: string | undefined,
  config: AjustesIA,
  clave: string | null,
  senal?: AbortSignal,
  gustos = ''
): Promise<TurnoAgente> {
  if (!config.activa) {
    return { ok: false, mensaje: '', operaciones: [], error: 'Conecta un agente en Inicio para hablar con él.' }
  }
  const { sistema, usuario } = armarPrompt(proyecto, timeline, historial, peticion, referencia, gustos)
  try {
    const texto =
      config.proveedor === 'cli'
        ? await preguntarAgente(`${sistema}\n\n${usuario}`, config.comandoCli, 10 * 60_000, senal)
        : await preguntarApi(
            sistema,
            usuario,
            {
              baseUrl: config.baseUrl,
              modelo: config.modelo,
              clave: clave ?? ''
            },
            senal
          )
    return leerRespuesta(texto)
  } catch (error) {
    if (esParado(error)) return { ok: false, mensaje: '', operaciones: [], parado: true }
    return { ok: false, mensaje: '', operaciones: [], error: error instanceof Error ? error.message : String(error) }
  }
}
