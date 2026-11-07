import { useCallback, useEffect, useRef, useState } from 'react'
import { PROVEEDORES_API, type EstadoAgente, type ProveedorApi } from '../../../shared/api'
import type { AjustesIA } from '../../../shared/types'

export type FaseConexion = 'instalando' | 'autorizando' | 'esperando' | 'activando'

export interface Agentes {
  lista: EstadoAgente[]
  ajustes: AjustesIA | null
  cargado: boolean
  /** El agente que edita ahora (modo plan con su comando y sesión iniciada). */
  activo: EstadoAgente | undefined
  /** Hay con qué trabajar: un plan activo o una API con clave. */
  listo: boolean
  ocupado: { id: string; fase: FaseConexion } | null
  /** Instala si falta, inicia sesión si hace falta y lo deja como el agente que edita. */
  conectar: (agente: EstadoAgente) => Promise<boolean>
  /** Guarda la llave de un proveedor (Gemini, DeepSeek, Grok) y lo deja como el que edita. */
  usarProveedorApi: (proveedor: ProveedorApi, clave: string) => Promise<boolean>
  /** El proveedor de API que edita ahora, si el modo activo es una llave. */
  apiActivo: ProveedorApi | null
  /** La interfaz está esperando a que termine un inicio de sesión. */
  cancelarEspera: () => void
  /** Pagar con la suscripción o con una llave (Claude Code); con llave nueva, pasa a editar. */
  cambiarPago: (agente: EstadoAgente, cambio: { pago?: 'suscripcion' | 'llave'; llave?: string }) => Promise<void>
  /** Versión instalada de cada agente (se piden aparte: tardan unos segundos). */
  versiones: Record<string, string | null> | null
  cargarVersiones: () => Promise<void>
  /** El último fallo al conectar cada agente, para enseñarlo en su fila. */
  errores: Record<string, string>
  refrescar: () => Promise<void>
}

const ESPERA_MAX_MS = 10 * 60_000

/**
 * El estado de los agentes, compartido por la bienvenida y el panel: un solo lugar
 * sabe cuál está conectado y cuál edita, así lo que se conecta en uno se ve en el otro.
 */
export function useAgentes(onAviso: (texto: string) => void): Agentes {
  const [lista, setLista] = useState<EstadoAgente[]>([])
  const [ajustes, setAjustes] = useState<AjustesIA | null>(null)
  const [cargado, setCargado] = useState(false)
  const [ocupado, setOcupado] = useState<Agentes['ocupado']>(null)
  const [versiones, setVersiones] = useState<Record<string, string | null> | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const fallo = useCallback((id: string, texto: string) => {
    setErrores((e) => ({ ...e, [id]: texto }))
    avisoRef.current(texto)
  }, [])
  const sinFallo = useCallback((id: string) => setErrores((e) => {
    if (!e[id]) return e
    const { [id]: _, ...resto } = e
    return resto
  }), [])
  const espera = useRef<ReturnType<typeof setInterval> | null>(null)
  const avisoRef = useRef(onAviso)
  avisoRef.current = onAviso

  const refrescar = useCallback(async () => {
    const [agentes, ajs] = await Promise.all([window.recorte.agentesEstado(), window.recorte.cargarAjustes()])
    setLista(agentes)
    setAjustes(ajs)
  }, [])

  useEffect(() => {
    refrescar()
      .catch(() => {})
      .finally(() => setCargado(true))
    return () => {
      if (espera.current) clearInterval(espera.current)
    }
  }, [refrescar])

  // Al volver a la ventana se mira otra vez (pudo cerrar o iniciar sesión fuera de Recorte).
  useEffect(() => {
    const alVolver = () => void refrescar().catch(() => {})
    window.addEventListener('focus', alVolver)
    return () => window.removeEventListener('focus', alVolver)
  }, [refrescar])

  // Si la sesión de un agente se cae mientras trabaja: Inicio muestra «Conectar» y se avisa.
  useEffect(
    () =>
      window.recorte.onSesionCaida((id) => {
        void refrescar().catch(() => {})
        const nombre = lista.find((a) => a.id === id)?.nombre ?? 'tu agente'
        fallo(id, `La sesión de ${nombre} se cerró. Pulsa «Conectar» en Inicio para volver a iniciarla.`)
      }),
    [refrescar, fallo, lista]
  )

  const usar = useCallback(async (agente: EstadoAgente, base: AjustesIA) => {
    const guardados = await window.recorte.guardarAjustes({
      activa: true,
      proveedor: 'cli',
      comandoCli: agente.comando,
      baseUrl: base.baseUrl,
      modelo: base.modelo
    })
    setAjustes(guardados)
    avisoRef.current(`${agente.nombre} está listo: ya edita tus videos.`)
  }, [])

  const cancelarEspera = useCallback(() => {
    if (espera.current) clearInterval(espera.current)
    espera.current = null
    setOcupado(null)
  }, [])

  const conectar = useCallback(
    async (agente: EstadoAgente): Promise<boolean> => {
      if (ocupado || !ajustes) return false
      const base = ajustes
      if (agente.conectado && agente.instalado) {
        setOcupado({ id: agente.id, fase: 'activando' })
        try {
          await usar(agente, base)
          return true
        } catch {
          fallo(agente.id, `No pude activar ${agente.nombre}.`)
          return false
        } finally {
          setOcupado(null)
        }
      }

      setOcupado({ id: agente.id, fase: agente.instalado ? 'autorizando' : 'instalando' })
      sinFallo(agente.id)
      try {
        const r = await window.recorte.agentesConectar(agente.id)
        if (r.ok) {
          await refrescar()
          await usar(agente, base)
          setOcupado(null)
          return true
        }
        if (!r.pendiente) {
          fallo(agente.id, r.error ?? r.aviso ?? `No pude conectar ${agente.nombre}.`)
          setOcupado(null)
          return false
        }
        // El inicio de sesión sigue en la ventana del agente: se vigilan sus credenciales.
        if (r.aviso) avisoRef.current(r.aviso)
        setOcupado({ id: agente.id, fase: 'esperando' })
        const desde = Date.now()
        return await new Promise<boolean>((resolver) => {
          espera.current = setInterval(async () => {
            if (Date.now() - desde > ESPERA_MAX_MS) {
              cancelarEspera()
              fallo(agente.id, `No vi la sesión de ${agente.nombre}. Vuelve a intentarlo cuando quieras.`)
              resolver(false)
              return
            }
            const agentes = await window.recorte.agentesEstado().catch(() => null)
            const ahora = agentes?.find((a) => a.id === agente.id)
            if (!agentes || !ahora?.conectado) return
            cancelarEspera()
            setLista(agentes)
            await usar(ahora, base).catch(() => {})
            resolver(true)
          }, 2000)
        })
      } catch {
        fallo(agente.id, `No pude conectar ${agente.nombre}.`)
        setOcupado(null)
        return false
      }
    },
    [ocupado, ajustes, usar, refrescar, cancelarEspera, fallo, sinFallo]
  )

  const activo = lista.find(
    (a) => ajustes?.activa && ajustes.proveedor === 'cli' && ajustes.comandoCli === a.comando && a.conectado && a.instalado
  )
  const listo = Boolean(activo || (ajustes?.activa && ajustes.proveedor === 'api' && ajustes.tieneClave))

  /** Un proveedor con llave (Gemini, DeepSeek, Grok…) pasa a ser el agente que edita. */
  const usarProveedorApi = useCallback(
    async (proveedor: ProveedorApi, clave: string): Promise<boolean> => {
      const limpia = clave.trim()
      if (!limpia) return false
      try {
        await window.recorte.guardarAjustes(
          {
            activa: true,
            proveedor: 'api',
            comandoCli: ajustes?.comandoCli ?? 'kimi -p "@{prompt}"',
            baseUrl: proveedor.baseUrl,
            modelo: proveedor.modelo
          },
          limpia
        )
        await refrescar()
        avisoRef.current(`${proveedor.nombre} está listo: ya edita tus videos.`)
        return true
      } catch {
        avisoRef.current(`No pude guardar la llave de ${proveedor.nombre}.`)
        return false
      }
    },
    [ajustes, refrescar]
  )

  /** El proveedor de API que edita ahora (modo llave), reconocido por su baseUrl. */
  const apiActivo: ProveedorApi | null =
    ajustes?.activa && ajustes.proveedor === 'api' && ajustes.tieneClave
      ? (PROVEEDORES_API.find((p) => ajustes.baseUrl.startsWith(p.baseUrl)) ?? {
          id: 'gemini-api',
          nombre: 'API propia',
          baseUrl: ajustes.baseUrl,
          modelo: ajustes.modelo,
          donde: '',
          dondeTexto: '',
          plan: 'Tu endpoint de Ajustes'
        })
      : null

  const cambiarPago = useCallback(
    async (agente: EstadoAgente, cambio: { pago?: 'suscripcion' | 'llave'; llave?: string }) => {
      try {
        const nueva = await window.recorte.agentesPago(agente.id, cambio)
        setLista(nueva)
        const a = nueva.find((x) => x.id === agente.id)
        // Con su llave puesta, el agente pasa a editar (si ya está instalado).
        if (a && cambio.llave && a.pago === 'llave' && a.instalado && a.conectado && ajustes) await usar(a, ajustes)
        else if (cambio.llave === '') avisoRef.current(`Quité la llave de ${agente.nombre}.`)
      } catch {
        fallo(agente.id, `No pude guardar cómo paga ${agente.nombre}.`)
      }
    },
    [ajustes, usar, fallo]
  )

  const cargarVersiones = useCallback(async () => {
    setVersiones(await window.recorte.agentesVersiones().catch(() => ({})))
  }, [])

  return {
    lista,
    ajustes,
    cargado,
    activo,
    listo,
    ocupado,
    conectar,
    usarProveedorApi,
    apiActivo,
    cancelarEspera,
    refrescar,
    cambiarPago,
    versiones,
    cargarVersiones,
    errores
  }
}
