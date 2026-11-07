import type { Ajustes } from '../ajustes'
import type { Creacion } from '../../shared/creacion'
import type { ConexionesViabilidad, Viabilidad } from '../../shared/estilo'
import { calcularViabilidad } from '../../shared/estilo'
import { estadoFlow } from '../flow'
import { estadoChatGPT } from '../imagenchatgpt'
import { estadoVozGoogle } from '../vozgoogle'
import { resolverBinario } from '../binarios'

/**
 * El informe «Este estilo se puede copiar en un N %», calculado en código (no por el
 * agente) a partir de los recursos que la ficha dice que usa la referencia y de lo que
 * el usuario tiene conectado hoy. Se recalcula al conectar algo, sin volver a analizar.
 */

/** Lo que hay conectado ahora mismo. */
export async function conexionesHoy(ajustes: Ajustes): Promise<ConexionesViabilidad> {
  const claveVoz = await ajustes.claveVoz().catch(() => null)
  return {
    flow: estadoFlow().cuentas.length > 0,
    chatgpt: estadoChatGPT().conectado,
    vozGemini: Boolean(claveVoz) || Boolean(estadoVozGoogle().correo),
    hyperframes: resolverBinario('hyperframes') !== null
  }
}

/** Recalcula la viabilidad de una creación que ya tiene ficha. */
export async function viabilidadDe(c: Creacion, ajustes: Ajustes): Promise<Viabilidad | null> {
  if (!c.ficha) return null
  return calcularViabilidad(c.ficha.recursos, await conexionesHoy(ajustes), {
    conMaterial: c.adjuntos.length > 0,
    subtitulosPalabra: c.ficha.subtitulos.lleva && c.ficha.subtitulos.modo === 'palabra'
  })
}
