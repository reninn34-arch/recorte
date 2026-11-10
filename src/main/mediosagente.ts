import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { COSTO_CLIP, MAX_CLIPS_VEO, TOPE_CLIP_VEO, type FlowCreacion } from '../shared/creacion'
import { MODELO_CHATGPT, type PedidoFlow, type ResultadoFlow } from '../shared/flow'
import { guardar } from './disco'

/**
 * Imágenes y clips para el agente. El agente no tiene las cuentas del usuario: deja un pedido
 * en `trabajo/medios/` (lo hace `python kit/kit.py imagen|clip`) y Recorte lo atiende con
 * lo que el usuario eligió en la caja: Google Flow (Nano Banana para imágenes, Veo u Omni para
 * clips) o ChatGPT (imágenes con su plan). El archivo queda en `trabajo/medios/` para usarlo.
 *
 * Como la voz (`vozagente.ts`), es un buzón de archivos: funciona igual con todos los agentes.
 * Los clips gastan puntos de Flow: hay un máximo por ronda y cada uno tiene su tope de costo.
 */

export interface RespuestaMedio {
  ok: boolean
  tipo?: 'imagen' | 'clip'
  /** Relativo a la carpeta de trabajo (p. ej. `medios/a1b2c3d4.png`). */
  archivo?: string
  /** Quién lo hizo: «Google Flow · Nano Banana 2.1», «ChatGPT Imágenes»… */
  hecho?: string
  creditos?: number
  error?: string
}

/** Lo que hace falta para generar (lo pone index.ts; en las pruebas, uno falso). */
export interface Generadores {
  flow: (pedido: PedidoFlow, carpeta: string) => Promise<ResultadoFlow>
  chatgpt: (pedido: { prompt: string; formato: string }, carpeta: string, nombre: string) => Promise<string>
}

/** Cuántas imágenes puede pedir el agente en una ronda (son gratis, pero tardan). */
export const MAX_IMAGENES_RONDA = 24

/** Lo que el usuario dejó elegido, en palabras para el manual del agente. */
export function mediosDisponibles(flow: FlowCreacion | undefined): { imagenes: string | null; clips: string | null } {
  return {
    imagenes: flow?.imagenes ? (flow.modeloImagen === MODELO_CHATGPT ? 'ChatGPT Imágenes' : `Google Flow · ${flow.modeloImagen ?? 'Nano Banana'}`) : null,
    clips: flow?.videos ? `Google Flow · ${flow.modeloVideo ?? 'Veo'}` : null
  }
}

/**
 * Atiende los pedidos de una carpeta de trabajo hasta que se llame a lo que devuelve.
 * Varios pedidos van a la vez (Flow los reparte entre las cuentas del usuario).
 */
export function atenderMedios(
  trabajo: string,
  flow: FlowCreacion | undefined,
  formato: '9:16' | '16:9',
  generar: Generadores,
  onLinea: (texto: string) => void
): () => void {
  const dir = join(trabajo, 'medios')
  const atendidos = new Set<string>()
  let imagenes = 0
  let clips = 0
  let parado = false
  let ocupado = false

  const responder = (id: string, r: RespuestaMedio) => guardar(join(dir, `respuesta-${id}.json`), JSON.stringify(r, null, 2))

  /** Una referencia del pedido: solo archivos de imagen dentro de la carpeta de trabajo. */
  const referencia = (r: unknown): string | null => {
    if (typeof r !== 'string' || !r.trim()) return null
    const ruta = resolve(trabajo, r.trim())
    const base = resolve(trabajo)
    if (!ruta.toLowerCase().startsWith((base + sep).toLowerCase())) return null
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extname(ruta).toLowerCase())) return null
    return existsSync(ruta) ? ruta : null
  }

  const atender = async (id: string): Promise<void> => {
    let pedido: { tipo?: unknown; prompt?: unknown; referencias?: unknown }
    try {
      pedido = JSON.parse(readFileSync(join(dir, `pedido-${id}.json`), 'utf8')) as typeof pedido
    } catch {
      atendidos.delete(id)
      return
    }
    const tipo = pedido.tipo === 'clip' ? 'clip' : 'imagen'
    const prompt = typeof pedido.prompt === 'string' ? pedido.prompt.replace(/\s+/g, ' ').trim().slice(0, 1500) : ''
    if (!prompt) return responder(id, { ok: false, tipo, error: 'El pedido no dice qué generar.' })
    const disponible = mediosDisponibles(flow)
    if (tipo === 'imagen' && !disponible.imagenes) {
      return responder(id, { ok: false, tipo, error: 'El usuario no eligió generar imágenes para este video. Usa sus archivos o diseña con código; si hace falta una imagen, dilo en el resumen.' })
    }
    if (tipo === 'clip' && !disponible.clips) {
      return responder(id, { ok: false, tipo, error: 'El usuario no eligió generar clips para este video (gastan créditos). Usa imágenes o sus videos; si hace falta un clip, dilo en el resumen.' })
    }
    if (tipo === 'imagen' && imagenes >= MAX_IMAGENES_RONDA) {
      return responder(id, { ok: false, tipo, error: `Ya pediste ${MAX_IMAGENES_RONDA} imágenes en esta ronda: usa las que tienes.` })
    }
    if (tipo === 'clip' && clips >= MAX_CLIPS_VEO) {
      return responder(id, { ok: false, tipo, error: `Ya pediste ${MAX_CLIPS_VEO} clips en esta ronda (cada uno gasta créditos del usuario): usa los que tienes.` })
    }
    if (tipo === 'imagen') imagenes += 1
    else clips += 1
    const refs = (Array.isArray(pedido.referencias) ? pedido.referencias : []).map(referencia).filter((r): r is string => Boolean(r)).slice(0, 3)
    const n = tipo === 'imagen' ? imagenes : clips
    onLinea(`${tipo === 'imagen' ? `Imagen ${n}` : `Clip ${n}`} (${tipo === 'imagen' ? disponible.imagenes : disponible.clips}): ${prompt.slice(0, 80)}`)
    try {
      if (tipo === 'imagen' && flow?.modeloImagen === MODELO_CHATGPT) {
        const archivo = await generar.chatgpt({ prompt, formato }, dir, `img-${id}`)
        const nombre = `img-${id}${extname(archivo) || '.png'}`
        if (archivo !== join(dir, nombre)) renameSync(archivo, join(dir, nombre))
        return responder(id, { ok: true, tipo, archivo: `medios/${nombre}`, hecho: 'ChatGPT Imágenes' })
      }
      const modelo = tipo === 'imagen' ? flow?.modeloImagen : flow?.modeloVideo
      // El tope de cada clip es lo que cuesta su modelo (nunca menos que el tope de siempre).
      const tope = tipo === 'clip' ? Math.max(TOPE_CLIP_VEO, COSTO_CLIP[modelo ?? ''] ?? 0) : undefined
      const r = await generar.flow(
        { tipo: tipo === 'clip' ? 'video' : 'imagen', prompt, formato, ...(modelo ? { modelo } : {}), ...(tope ? { tope } : {}), ...(refs.length ? { referencias: refs } : {}) },
        dir
      )
      const nombre = `${tipo === 'clip' ? 'clip' : 'img'}-${id}${extname(r.archivo)}`
      renameSync(r.archivo, join(dir, nombre))
      responder(id, { ok: true, tipo, archivo: `medios/${nombre}`, hecho: `Google Flow · ${modelo ?? ''}`.trim(), creditos: r.creditos })
    } catch (e) {
      // Lo que falla no cuenta para el límite.
      if (tipo === 'imagen') imagenes -= 1
      else clips -= 1
      responder(id, { ok: false, tipo, error: `No se pudo generar: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const vuelta = (): void => {
    if (ocupado || parado || !existsSync(dir)) return
    ocupado = true
    try {
      for (const n of readdirSync(dir)) {
        const id = /^pedido-([\w-]{1,40})\.json$/.exec(n)?.[1]
        if (!id || atendidos.has(id) || existsSync(join(dir, `respuesta-${id}.json`))) continue
        atendidos.add(id)
        // Cada pedido sigue por su cuenta: los demás no esperan a que termine este.
        void atender(id).catch((e: unknown) => responder(id, { ok: false, error: e instanceof Error ? e.message : String(e) }))
      }
    } catch {
      // La carpeta puede cambiar mientras se lee: se vuelve a mirar en la siguiente vuelta.
    } finally {
      ocupado = false
    }
  }

  mkdirSync(dir, { recursive: true })
  const reloj = setInterval(vuelta, 1500)
  return () => {
    parado = true
    clearInterval(reloj)
  }
}
