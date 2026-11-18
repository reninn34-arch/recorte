import { app } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Parado } from './ia'
import {
  DESCANSO_MS,
  MAX_CUENTAS,
  motivoDe,
  TOPE_POR_DEFECTO,
  type CuentaFlowEstado,
  type EstadoFlow,
  type Motivo,
  type PedidoFlow,
  type ResultadoFlow,
  type UsoFlow
} from '../shared/flow'
import { guardar } from './disco'
import type { Browser } from 'playwright-core'
import { edgeExe, edgePerfil, perfilDeLaVoz, type EdgePerfil } from './edgeperfil'
import {
  abrirPagina,
  abrirPestanaFlow,
  correoEnFlow,
  generarEnPestana,
  leerCreditos,
  NoEmpezo,
  ponerAyudarAMejorar,
  URL_FLOW,
  type PestanaFlow
} from './flowpagina'
import { correoVozGoogle } from './vozgoogle'

/**
 * Google Flow en Recorte: imágenes (Nano Banana, no gastan créditos) y videos (Veo, sí) con
 * las cuentas de Google del usuario, como los haría él a mano.
 *
 * - Cuentas: la de la voz (Ajustes → Voz) y las que se agregan aquí, cada una con su perfil de
 *   Edge en `<userData>/flow/cuentas/<id>/perfil`. La sesión de Google no la ve ningún agente.
 * - Reparto: cada pedido va a la cuenta con menos trabajo (y, a igualdad, la que lleva más sin
 *   generar). Cada cuenta trabaja en UNA pestaña de su proyecto y manda allí los pedidos
 *   seguidos, sin esperar a que acabe el anterior: Flow los genera a la vez (`POR_CUENTA`).
 *   Si Flow no lo empieza (sin créditos, frenada, sin sesión), no gastó: esa cuenta descansa y
 *   el pedido pasa a otra que no lo haya probado.
 * - Gasto: antes de generar se lee el costo y no se pasa del tope del pedido.
 * - «Ayudar a mejorar Flow» solo se toca si el usuario lo eligió aquí; «Tengo los derechos»
 *   es obligatorio para mandar imágenes de referencia.
 */

interface CuentaGuardada {
  id: string
  correo: string
}

interface Archivo {
  cuentas: CuentaGuardada[]
  proyectos: Record<string, string>
  saldos: Record<string, { creditos: number; leido: number }>
  /** Por día (AAAA-MM-DD) y cuenta. */
  uso: Record<string, Record<string, UsoFlow>>
  aportar?: boolean
  derechos?: string
}

interface Cuenta {
  correo: string
  deLaVoz: boolean
  edge: EdgePerfil
}

interface Trabajo {
  pedido: PedidoFlow
  carpeta: string
  probadas: Set<string>
  ok: (r: ResultadoFlow) => void
  mal: (e: Error) => void
}

const ENTRAR = `https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(URL_FLOW)}`
const NADA: UsoFlow = { videos: 0, creditos: 0 }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dia = (t: number) => new Date(t).toISOString().slice(0, 10)
const sumar = (a: UsoFlow, b: UsoFlow): UsoFlow => ({ videos: a.videos + b.videos, creditos: a.creditos + b.creditos })

const carpeta = () => join(app.getPath('userData'), 'flow')
const rutaArchivo = () => join(carpeta(), 'flow.json')

let datos: Archivo = { cuentas: [], proyectos: {}, saldos: {}, uso: {} }
try {
  datos = { ...datos, ...JSON.parse(readFileSync(rutaArchivo(), 'utf8')) }
} catch {
  // Aún no se usó Flow.
}
const guardarDatos = () => {
  mkdirSync(carpeta(), { recursive: true })
  guardar(rutaArchivo(), JSON.stringify(datos, null, 1))
}

const edges = new Map<string, EdgePerfil>()
const edgeDe = (id: string) => {
  let e = edges.get(id)
  if (!e) {
    e = edgePerfil(join(carpeta(), 'cuentas', id, 'perfil'))
    edges.set(id, e)
  }
  return e
}

/**
 * Lo que cada cuenta tiene en marcha a la vez en su pestaña. Imágenes: se probó con 8 a la vez
 * en una pestaña, sin avisos de Flow. Videos: de uno en uno hasta probar más (gastan créditos).
 */
const POR_CUENTA = { total: 6, video: 1 }

const descansos = new Map<string, { hasta: number; motivo: Motivo }>()
/** Por cuenta: cuántas imágenes y videos tiene en marcha. */
const enMarcha = new Map<string, { imagen: number; video: number }>()
const ocupacion = (correo: string) => enMarcha.get(correo) ?? { imagen: 0, video: 0 }
const total = (correo: string) => ocupacion(correo).imagen + ocupacion(correo).video
const generando = { has: (correo: string) => total(correo) > 0 }
const libre = (correo: string, tipo: PedidoFlow['tipo']) =>
  total(correo) < POR_CUENTA.total && (tipo !== 'video' || ocupacion(correo).video < POR_CUENTA.video)
const contar = (correo: string, tipo: PedidoFlow['tipo'], n: number) => {
  const o = ocupacion(correo)
  enMarcha.set(correo, { ...o, [tipo]: o[tipo] + n })
}
/** La pestaña de Flow de cada cuenta, en el Edge que tiene abierto ahora. */
const pestanas = new Map<string, { b: Browser; p: Promise<PestanaFlow> }>()
const ultimoUso = new Map<string, number>()
/** Lo que ya se puso de «Ayudar a mejorar Flow» en cada cuenta desde que arrancó Recorte. */
const aportarPuesto = new Map<string, boolean>()
const fila: Trabajo[] = []
let agregando = false
let leyendo = false
let error: string | undefined

function cuentas(): Cuenta[] {
  const voz = correoVozGoogle()
  const lista: Cuenta[] = voz ? [{ correo: voz, deLaVoz: true, edge: perfilDeLaVoz() }] : []
  for (const c of datos.cuentas) {
    if (c.correo.toLowerCase() !== voz?.toLowerCase()) lista.push({ correo: c.correo, deLaVoz: false, edge: edgeDe(c.id) })
  }
  return lista
}

const descansa = (correo: string, ahora = Date.now()) => {
  const d = descansos.get(correo)
  return d && d.hasta > ahora ? d : undefined
}
/** Sin créditos, la cuenta sigue haciendo imágenes: no gastan. */
const puede = (correo: string, tipo: PedidoFlow['tipo']) => {
  const d = descansa(correo)
  return !d || (d.motivo === 'creditos' && tipo === 'imagen')
}

function apuntarUso(correo: string, creditos: number) {
  const hoy = dia(Date.now())
  datos.uso[hoy] = { ...datos.uso[hoy], [correo]: sumar(datos.uso[hoy]?.[correo] ?? NADA, { videos: 1, creditos }) }
  // Se guardan los últimos 62 días.
  for (const d of Object.keys(datos.uso).sort().slice(0, -62)) delete datos.uso[d]
  guardarDatos()
}

/** La pestaña de la cuenta en este Edge: la que ya tiene o una nueva en su proyecto. */
async function pestanaDe(c: Cuenta, b: Browser): Promise<PestanaFlow> {
  const hay = pestanas.get(c.correo)
  if (hay && hay.b === b) {
    const pest = await hay.p
    if (!pest.page.isClosed()) return pest
    if (pestanas.get(c.correo) === hay) pestanas.delete(c.correo)
    return pestanaDe(c, b)
  }
  const p = (async () => {
    if (datos.aportar !== undefined && aportarPuesto.get(c.correo) !== datos.aportar) {
      const page = await abrirPagina(b)
      try {
        await ponerAyudarAMejorar(page, datos.aportar)
        aportarPuesto.set(c.correo, datos.aportar)
      } finally {
        await page.close().catch(() => {})
      }
    }
    const pest = await abrirPestanaFlow(b, datos.proyectos[c.correo])
    if (pest.proyecto && datos.proyectos[c.correo] !== pest.proyecto) {
      datos.proyectos[c.correo] = pest.proyecto
      guardarDatos()
    }
    return pest
  })()
  const nueva = { b, p }
  pestanas.set(c.correo, nueva)
  p.catch(() => {
    if (pestanas.get(c.correo) === nueva) pestanas.delete(c.correo)
  })
  return p
}

async function generarCon(t: Trabajo, c: Cuenta) {
  contar(c.correo, t.pedido.tipo, 1)
  ultimoUso.set(c.correo, Date.now())
  t.probadas.add(c.correo)
  try {
    const r = await c.edge.enEdge(async (b) => {
      const pest = await pestanaDe(c, b)
      const hecho = await generarEnPestana(b, pest, t.pedido, t.pedido.tope ?? TOPE_POR_DEFECTO, t.carpeta, c.edge.enDescarga)
      // El saldo, cuando la pestaña queda sin nada en marcha (abre el menú de la cuenta).
      if (pest.enMarcha === 0) {
        const saldo = await pest.aSolas(() => leerCreditos(pest.page, false)).catch(() => null)
        if (saldo !== null) datos.saldos[c.correo] = { creditos: saldo, leido: Date.now() }
      }
      return hecho
    })
    if (t.pedido.tipo === 'video' || r.creditos > 0) apuntarUso(c.correo, r.creditos)
    else guardarDatos()
    t.ok({ archivo: r.archivo, creditos: r.creditos, correo: c.correo })
  } catch (e) {
    if (e instanceof NoEmpezo && !/tope es/.test(e.message)) {
      // No gastó: la cuenta descansa y el pedido prueba otra.
      const motivo: Motivo = e.sinSesion ? 'sesion' : motivoDe(e.aviso, t.pedido.tipo)
      descansos.set(c.correo, { hasta: Date.now() + DESCANSO_MS[motivo], motivo })
      if (cuentas().some((x) => !t.probadas.has(x.correo) && puede(x.correo, t.pedido.tipo))) {
        fila.unshift(t)
      } else {
        t.mal(new Error(`${e.message} Ninguna otra cuenta de Flow puede ahora.`))
      }
    } else {
      t.mal(e instanceof Error ? e : new Error(String(e)))
    }
  } finally {
    contar(c.correo, t.pedido.tipo, -1)
    repartir()
  }
}

function repartir() {
  // Cada pedido, en orden, a la cuenta que pueda con él y tenga menos en marcha.
  for (let i = 0; i < fila.length; ) {
    const t = fila[i]
    const c = cuentas()
      .filter((x) => !t.probadas.has(x.correo) && puede(x.correo, t.pedido.tipo) && libre(x.correo, t.pedido.tipo))
      .sort((a, b) => total(a.correo) - total(b.correo) || (ultimoUso.get(a.correo) ?? 0) - (ultimoUso.get(b.correo) ?? 0))[0]
    if (!c) {
      i++
      continue
    }
    fila.splice(i, 1)
    void generarCon(t, c)
  }
  // Lo que ninguna cuenta podrá hacer (ni cuando se libere) se avisa.
  for (const t of [...fila]) {
    if (!cuentas().some((x) => !t.probadas.has(x.correo) && puede(x.correo, t.pedido.tipo))) {
      fila.splice(fila.indexOf(t), 1)
      t.mal(new Error(cuentas().length ? 'Ninguna cuenta de Flow puede generar ahora (sin créditos o frenadas). Prueba más tarde.' : 'Conecta una cuenta de Google en Ajustes → Google Flow.'))
    }
  }
}

/** Pide algo a Flow; se resuelve con el archivo bajado a `carpetaSalida`. */
export function pedirFlow(pedido: PedidoFlow, carpetaSalida: string, senal?: AbortSignal): Promise<ResultadoFlow> {
  if (senal?.aborted) return Promise.reject(new Parado())
  if (pedido.referencias?.length && !datos.derechos) {
    return Promise.reject(new Error('Para mandar imágenes a Flow confirma en Ajustes → Google Flow que tienes sus derechos.'))
  }
  if (!cuentas().length) return Promise.reject(new Error('Conecta una cuenta de Google en Ajustes → Google Flow (o la de la voz).'))
  return new Promise((ok, mal) => {
    const tarea = { pedido, carpeta: carpetaSalida, probadas: new Set<string>(), ok, mal }
    fila.push(tarea)
    // Si lo paran mientras espera turno, sale de la fila sin gastar nada. Lo que ya se
    // está generando en Flow termina (cancelarlo a medias no devuelve los créditos).
    senal?.addEventListener(
      'abort',
      () => {
        const i = fila.indexOf(tarea)
        if (i >= 0) {
          fila.splice(i, 1)
          mal(new Parado())
        }
      },
      { once: true }
    )
    repartir()
  })
}

export function hayFlow(): boolean {
  return cuentas().length > 0
}

export function estadoFlow(): EstadoFlow {
  const hoy = dia(Date.now())
  const deHoy = datos.uso[hoy] ?? {}
  const delMes = Object.entries(datos.uso).filter(([d]) => d.startsWith(hoy.slice(0, 7)))
  const lista: CuentaFlowEstado[] = cuentas().map((c) => ({
    correo: c.correo,
    deLaVoz: c.deLaVoz,
    creditos: datos.saldos[c.correo]?.creditos ?? null,
    leido: datos.saldos[c.correo]?.leido,
    descansa: descansa(c.correo),
    generando: generando.has(c.correo),
    hoy: deHoy[c.correo] ?? NADA
  }))
  return {
    cuentas: lista,
    uso: {
      hoy: Object.values(deHoy).reduce(sumar, NADA),
      mes: delMes.flatMap(([, d]) => Object.values(d)).reduce(sumar, NADA)
    },
    ...(datos.aportar !== undefined ? { aportar: datos.aportar } : {}),
    derechos: Boolean(datos.derechos),
    agregando,
    leyendo,
    ...(error ? { error } : {}),
    navegador: Boolean(edgeExe())
  }
}

export function ajustesFlow(cambio: { aportar?: boolean; derechos?: boolean }): EstadoFlow {
  if (typeof cambio.aportar === 'boolean') datos.aportar = cambio.aportar
  if (typeof cambio.derechos === 'boolean') datos.derechos = cambio.derechos ? new Date().toISOString() : undefined
  guardarDatos()
  return estadoFlow()
}

/** Lee el saldo de cada cuenta libre (sin generar nada). */
export async function leerSaldosFlow(): Promise<EstadoFlow> {
  if (leyendo) return estadoFlow()
  leyendo = true
  try {
    await Promise.all(
      cuentas()
        .filter((c) => !generando.has(c.correo))
        .map((c) =>
          c.edge
            .enEdge(async (b) => {
              const page = await abrirPagina(b)
              try {
                return await leerCreditos(page)
              } finally {
                await page.close().catch(() => {})
              }
            })
            .then((n) => {
              if (n !== null) datos.saldos[c.correo] = { creditos: n, leido: Date.now() }
            })
            .catch((e) => {
              if (e instanceof NoEmpezo && e.sinSesion) descansos.set(c.correo, { hasta: Date.now() + DESCANSO_MS.sesion, motivo: 'sesion' })
            })
        )
    )
    guardarDatos()
  } finally {
    leyendo = false
  }
  return estadoFlow()
}

/** Abre Flow con ventana en la cuenta, para verlo o aceptar su aviso la primera vez. */
export async function abrirFlow(correo: string): Promise<void> {
  const c = cuentas().find((x) => x.correo === correo)
  if (!c) throw new Error('No conozco esa cuenta.')
  await c.edge.enTurno(() => c.edge.lanzar(true, URL_FLOW))
}

async function agregar(): Promise<void> {
  const id = randomBytes(4).toString('hex')
  const e = edgeDe(id)
  const borrar = async () => {
    await e.cerrar()
    edges.delete(id)
    for (let i = 0; i < 40; i++) {
      try {
        rmSync(join(carpeta(), 'cuentas', id), { recursive: true, force: true })
        return
      } catch {
        await espera(500)
      }
    }
  }
  try {
    await e.lanzar(true, ENTRAR)
    let sesion = false
    // Dos lecturas seguidas sin pestañas = cerraste la ventana.
    for (let fin = Date.now() + 10 * 60_000, vacias = 0; Date.now() < fin && vacias < 2; ) {
      await espera(1500)
      const abiertas = await e.paginas()
      vacias = abiertas.length ? 0 : vacias + 1
      if (!sesion && abiertas.some((p) => p.url.startsWith(URL_FLOW))) sesion = await e.conSesion()
    }
    await e.cerrar()
    if (!sesion) throw new Error('No entraste con Google, o cerraste la ventana antes de llegar a Flow. Vuelve a intentarlo.')
    const correo = await e.enEdge(async (b) => correoEnFlow(await abrirPagina(b)))
    if (!correo) throw new Error('Entraste, pero Flow no dijo con qué cuenta. Vuelve a intentarlo.')
    if (correo.toLowerCase() === correoVozGoogle()?.toLowerCase()) throw new Error(`${correo} es la cuenta de la voz: ya genera en Flow.`)
    const vieja = datos.cuentas.find((x) => x.correo.toLowerCase() === correo.toLowerCase())
    if (vieja) {
      await edgeDe(vieja.id).cerrar()
      rmSync(join(carpeta(), 'cuentas', vieja.id), { recursive: true, force: true })
    }
    datos.cuentas = [...datos.cuentas.filter((x) => x !== vieja), { id, correo }]
    descansos.delete(correo)
    guardarDatos()
  } catch (x) {
    await borrar().catch(() => {})
    throw x
  }
}

/** Abre la ventana para entrar con otra cuenta; la cuenta queda al llegar a Flow y cerrar la ventana. */
export function agregarCuentaFlow(): EstadoFlow {
  if (agregando) return estadoFlow()
  if (cuentas().length >= MAX_CUENTAS) {
    error = `Ya tienes ${MAX_CUENTAS} cuentas en Flow: quita una para agregar otra.`
    return estadoFlow()
  }
  agregando = true
  error = undefined
  void agregar()
    .catch((x) => {
      error = x instanceof Error ? x.message : String(x)
    })
    .finally(() => {
      agregando = false
    })
  return estadoFlow()
}

export async function quitarCuentaFlow(correo: string): Promise<EstadoFlow> {
  const c = datos.cuentas.find((x) => x.correo === correo)
  if (!c) return estadoFlow()
  if (generando.has(correo)) throw new Error('Esa cuenta está generando: espera a que acabe.')
  await edgeDe(c.id).cerrar()
  edges.delete(c.id)
  datos.cuentas = datos.cuentas.filter((x) => x !== c)
  delete datos.proyectos[correo]
  delete datos.saldos[correo]
  guardarDatos()
  rmSync(join(carpeta(), 'cuentas', c.id), { recursive: true, force: true })
  return estadoFlow()
}
