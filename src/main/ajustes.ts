import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AjustesIA } from '../shared/types'
import { guardar } from './disco'

const POR_DEFECTO: AjustesIA = {
  activa: false,
  proveedor: 'api',
  comandoCli: 'claude -p',
  baseUrl: 'https://api.openai.com/v1',
  modelo: 'gpt-4o-mini',
  tieneClave: false,
  claveCifrada: false
}

interface AjustesEnDisco {
  activa?: boolean
  /** 'claude' es el nombre antiguo de 'cli'; se migra al leer. */
  proveedor?: 'api' | 'cli' | 'claude'
  comandoCli?: string
  baseUrl?: string
  modelo?: string
  clave?: string // base64; cifrada con safeStorage si el sistema lo permite
  claveCifrada?: boolean
  /** Clave de Google AI Studio para la voz de Gemini (cifrada igual que `clave`). */
  claveVoz?: string
  claveVozCifrada?: boolean
  /** La última voz de Gemini elegida. */
  vozGemini?: string
  /** Llaves de API de los agentes que también aceptan pagar por uso (Claude Code). */
  llavesAgentes?: Record<string, { valor: string; cifrada: boolean }>
  /** Con qué paga cada agente: su suscripción (por defecto) o una llave de API. */
  pagos?: Record<string, 'suscripcion' | 'llave'>
  preferencias?: Preferencias
  /** Dónde guardar los videos terminados (elegida por el usuario). */
  carpetaVideos?: string
}

export interface Preferencias {
  /** Notificación del sistema cuando termina un trabajo largo y Recorte no está a la vista. */
  avisoNotificacion: boolean
  avisoSonido: boolean
}

const PREFERENCIAS: Preferencias = { avisoNotificacion: true, avisoSonido: true }

function cifrar(texto: string): { valor: string; cifrada: boolean } {
  if (safeStorage.isEncryptionAvailable()) return { valor: safeStorage.encryptString(texto).toString('base64'), cifrada: true }
  // Sin llavero (algunos Linux): base64 simple. Mejor que nada.
  return { valor: Buffer.from(texto, 'utf8').toString('base64'), cifrada: false }
}

function descifrar(valor: string | undefined, cifrada: boolean | undefined): string | null {
  if (!valor) return null
  try {
    const crudo = Buffer.from(valor, 'base64')
    return cifrada ? safeStorage.decryptString(crudo) : crudo.toString('utf8')
  } catch {
    return null
  }
}

function rutaAjustes(): string {
  return join(app.getPath('userData'), 'ajustes.json')
}

/**
 * Ajustes de la app en `userData/ajustes.json`. La clave del LLM solo vive aquí,
 * cifrada con el llavero del sistema cuando está disponible; el renderer recibe
 * `tieneClave`, nunca la clave.
 */
export class Ajustes {
  private cache: AjustesEnDisco | null = null

  private async leer(): Promise<AjustesEnDisco> {
    if (this.cache) return this.cache
    if (!existsSync(rutaAjustes())) {
      this.cache = {}
      return this.cache
    }
    try {
      this.cache = JSON.parse(readFileSync(rutaAjustes(), 'utf8')) as AjustesEnDisco
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  async cargar(): Promise<AjustesIA> {
    const datos = await this.leer()
    // Migración: el proveedor 'claude' de versiones anteriores pasa a 'cli'.
    const proveedor = datos.proveedor === 'cli' || datos.proveedor === 'claude' ? 'cli' : 'api'
    return {
      activa: datos.activa ?? POR_DEFECTO.activa,
      proveedor,
      comandoCli: datos.comandoCli?.trim() || POR_DEFECTO.comandoCli,
      baseUrl: datos.baseUrl || POR_DEFECTO.baseUrl,
      modelo: datos.modelo || POR_DEFECTO.modelo,
      tieneClave: Boolean(datos.clave),
      claveCifrada: datos.claveCifrada ?? false
    }
  }

  async guardar(
    ajustes: Omit<AjustesIA, 'tieneClave' | 'claveCifrada'>,
    clave?: string
  ): Promise<AjustesIA> {
    const actual = await this.leer()
    // Se parte de lo que hay: la voz, las llaves de los agentes y las preferencias no se tocan aquí.
    const siguiente: AjustesEnDisco = {
      ...actual,
      activa: ajustes.activa,
      proveedor: ajustes.proveedor === 'cli' ? 'cli' : 'api',
      comandoCli: ajustes.comandoCli.trim() || POR_DEFECTO.comandoCli,
      baseUrl: ajustes.baseUrl.trim() || POR_DEFECTO.baseUrl,
      modelo: ajustes.modelo.trim() || POR_DEFECTO.modelo
    }

    if (typeof clave === 'string') {
      const limpia = clave.trim()
      if (limpia === '') {
        delete siguiente.clave
        siguiente.claveCifrada = false
      } else {
        if (safeStorage.isEncryptionAvailable()) {
          siguiente.clave = safeStorage.encryptString(limpia).toString('base64')
          siguiente.claveCifrada = true
        } else {
          // Sin llavero (algunos Linux): base64 simple. Mejor que nada, y se informa.
          siguiente.clave = Buffer.from(limpia, 'utf8').toString('base64')
          siguiente.claveCifrada = false
        }
      }
    }

    this.cache = siguiente
    guardar(rutaAjustes(), JSON.stringify(siguiente, null, 2))
    return this.cargar()
  }

  /**
   * La voz: si hay clave de AI Studio (nunca la clave misma) y la voz elegida.
   * Si Gemini es el agente por API, su llave también sirve para las voces (`delAgente`).
   */
  async estadoVoz(): Promise<{ tieneClave: boolean; vozGemini?: string; delAgente?: boolean }> {
    const datos = await this.leer()
    const delAgente =
      !datos.claveVoz && datos.proveedor === 'api' && Boolean(datos.clave) && (datos.baseUrl ?? '').includes('generativelanguage')
    return { tieneClave: Boolean(datos.claveVoz) || delAgente, vozGemini: datos.vozGemini, ...(delAgente ? { delAgente: true } : {}) }
  }

  /** `clave` vacía la borra; undefined la conserva. */
  async guardarVoz(cambio: { clave?: string; vozGemini?: string }): Promise<{ tieneClave: boolean; vozGemini?: string }> {
    const actual = await this.leer()
    const siguiente: AjustesEnDisco = { ...actual }
    if (typeof cambio.clave === 'string') {
      const limpia = cambio.clave.trim()
      if (!limpia) {
        delete siguiente.claveVoz
        siguiente.claveVozCifrada = false
      } else {
        const c = cifrar(limpia)
        siguiente.claveVoz = c.valor
        siguiente.claveVozCifrada = c.cifrada
      }
    }
    if (typeof cambio.vozGemini === 'string' && cambio.vozGemini) siguiente.vozGemini = cambio.vozGemini.slice(0, 40)
    this.cache = siguiente
    guardar(rutaAjustes(), JSON.stringify(siguiente, null, 2))
    return this.estadoVoz()
  }

  async claveVoz(): Promise<string | null> {
    const datos = await this.leer()
    const propia = descifrar(datos.claveVoz, datos.claveVozCifrada)
    if (propia) return propia
    // La llave de AI Studio del agente Gemini también genera voces.
    if (datos.proveedor === 'api' && (datos.baseUrl ?? '').includes('generativelanguage')) return this.clave()
    return null
  }

  /** Con qué paga cada agente y si tiene llave (nunca la llave misma). */
  async pagosAgentes(): Promise<Record<string, { pago: 'suscripcion' | 'llave'; tieneLlave: boolean }>> {
    const datos = await this.leer()
    const ids = new Set([...Object.keys(datos.pagos ?? {}), ...Object.keys(datos.llavesAgentes ?? {})])
    const salida: Record<string, { pago: 'suscripcion' | 'llave'; tieneLlave: boolean }> = {}
    for (const id of ids) salida[id] = { pago: datos.pagos?.[id] ?? 'suscripcion', tieneLlave: Boolean(datos.llavesAgentes?.[id]) }
    return salida
  }

  /** `llave` vacía la borra; undefined la conserva. */
  async guardarPagoAgente(id: string, cambio: { pago?: 'suscripcion' | 'llave'; llave?: string }): Promise<void> {
    if (!/^[\w-]{1,32}$/.test(id)) return
    const actual = await this.leer()
    const siguiente: AjustesEnDisco = { ...actual, pagos: { ...actual.pagos }, llavesAgentes: { ...actual.llavesAgentes } }
    if (cambio.pago) siguiente.pagos![id] = cambio.pago
    if (typeof cambio.llave === 'string') {
      const limpia = cambio.llave.trim()
      if (limpia) {
        const c = cifrar(limpia)
        siguiente.llavesAgentes![id] = { valor: c.valor, cifrada: c.cifrada }
      } else delete siguiente.llavesAgentes![id]
    }
    this.cache = siguiente
    guardar(rutaAjustes(), JSON.stringify(siguiente, null, 2))
  }

  /** La llave de un agente si paga con llave; null si paga con su suscripción. */
  async llaveSiPagaConLlave(id: string): Promise<string | null> {
    const datos = await this.leer()
    if (datos.pagos?.[id] !== 'llave') return null
    const l = datos.llavesAgentes?.[id]
    return l ? descifrar(l.valor, l.cifrada) : null
  }

  async carpetaVideos(): Promise<string | null> {
    return (await this.leer()).carpetaVideos ?? null
  }

  async guardarCarpetaVideos(ruta: string): Promise<void> {
    const actual = await this.leer()
    const siguiente: AjustesEnDisco = { ...actual, carpetaVideos: ruta }
    this.cache = siguiente
    guardar(rutaAjustes(), JSON.stringify(siguiente, null, 2))
  }

  async preferencias(): Promise<Preferencias> {
    const datos = await this.leer()
    return { ...PREFERENCIAS, ...datos.preferencias }
  }

  async guardarPreferencias(cambio: Partial<Preferencias>): Promise<Preferencias> {
    const actual = await this.leer()
    const limpio: Partial<Preferencias> = {}
    if (typeof cambio.avisoNotificacion === 'boolean') limpio.avisoNotificacion = cambio.avisoNotificacion
    if (typeof cambio.avisoSonido === 'boolean') limpio.avisoSonido = cambio.avisoSonido
    const siguiente: AjustesEnDisco = { ...actual, preferencias: { ...PREFERENCIAS, ...actual.preferencias, ...limpio } }
    this.cache = siguiente
    guardar(rutaAjustes(), JSON.stringify(siguiente, null, 2))
    return siguiente.preferencias!
  }

  /** Clave en claro, solo para llamar al proveedor desde el proceso principal. */
  async clave(): Promise<string | null> {
    const datos = await this.leer()
    if (!datos.clave) return null
    try {
      const crudo = Buffer.from(datos.clave, 'base64')
      return datos.claveCifrada ? safeStorage.decryptString(crudo) : crudo.toString('utf8')
    } catch {
      return null
    }
  }
}
