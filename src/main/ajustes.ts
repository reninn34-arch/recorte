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
    const siguiente: AjustesEnDisco = {
      activa: ajustes.activa,
      proveedor: ajustes.proveedor === 'cli' ? 'cli' : 'api',
      comandoCli: ajustes.comandoCli.trim() || POR_DEFECTO.comandoCli,
      baseUrl: ajustes.baseUrl.trim() || POR_DEFECTO.baseUrl,
      modelo: ajustes.modelo.trim() || POR_DEFECTO.modelo,
      clave: actual.clave,
      claveCifrada: actual.claveCifrada
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
