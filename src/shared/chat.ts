import {
  ajustarClip,
  ajustesDe,
  anadirTexto,
  cambiarMusica,
  ponerMusica,
  borrarClip,
  borrarTexto,
  borrarTramo,
  cambiarTexto,
  borrarVoz,
  cambiarVoz,
  anadirVoz,
  silenciarClip,
  capaNueva,
  cambiarCapa,
  borrarCapa,
  anadirSonido,
  cambiarSonido,
  borrarSonido,
  MAX_IMAGEN,
  SONIDOS_INCLUIDOS,
  type EntradaCapa,
  FUENTES_TEXTO,
  dividir,
  duracionTimeline,
  FUENTE_PRINCIPAL,
  moverClip,
  nuevoId,
  recortarClip,
  timelineDesdeCortes,
  tramos,
  type PosicionTexto,
  type Timeline
} from './timeline'
import { INSTRUCCIONES_CRITERIO } from './gustos'
import type { TranscriptSegment } from './types'

/**
 * El chat con el agente que edita. El agente no toca la timeline directamente:
 * responde un mensaje y una lista de operaciones (este contrato). Recorte las valida y
 * las aplica en la interfaz como un solo paso de deshacer. Así cualquier agente —CLI o
 * API— edita con las mismas herramientas que el usuario, y todo se puede revertir.
 */

export type OperacionTL =
  | { op: 'borrar_tramo'; desde: number; hasta: number }
  | { op: 'quitar_pausas'; minimo?: number }
  | { op: 'dividir'; en: number }
  | { op: 'borrar_clip'; clip: number }
  | { op: 'mover_clip'; clip: number; a: number }
  | { op: 'recortar_clip'; clip: number; entrada?: number; salida?: number }
  | { op: 'anadir_texto'; inicio: number; duracion?: number; texto: string; posicion?: PosicionTexto }
  | {
      op: 'cambiar_texto'
      texto_n: number
      texto?: string
      inicio?: number
      duracion?: number
      posicion?: PosicionTexto
      tamano?: number
      color?: string
      sin_caja?: boolean
      caja?: string
      fuente?: string
      /** Posición libre: el centro del rótulo, en fracción del cuadro (0–1). */
      x?: number
      y?: number
    }
  | { op: 'borrar_texto'; texto_n: number }
  /** Lo que va encima del video: un medio de la biblioteca (por su id), en su sitio y su tamaño. */
  | { op: 'anadir_capa'; medio: string; inicio: number; duracion?: number; x?: number; y?: number; ancho?: number; entrada?: EntradaCapa | 'corte' }
  | { op: 'cambiar_capa'; capa_n: number; inicio?: number; duracion?: number; x?: number; y?: number; ancho?: number; entrada?: EntradaCapa | 'corte' }
  | { op: 'borrar_capa'; capa_n: number }
  /** Un efecto de sonido incluido. Recorte copia su audio ANTES de aplicarla y le pone `audio`. */
  | { op: 'anadir_sonido'; sonido: string; inicio: number; volumen?: number; audio?: { archivo: string; duracion: number; nombre: string } }
  | { op: 'cambiar_sonido'; sonido_n: number; inicio?: number; volumen?: number }
  | { op: 'borrar_sonido'; sonido_n: number }
  | { op: 'reconstruir'; cortes: { entrada: number; salida: number }[] }
  | { op: 'zoom'; clip?: number; zoom: number }
  | { op: 'color'; clip?: number; brillo?: number; contraste?: number; saturacion?: number }
  | { op: 'musica'; volumen?: number; ducking?: boolean }
  | { op: 'quitar_musica' }
  | { op: 'sonido_clip'; clip: number; sonido: boolean }
  /**
   * La narración frase a frase. Si cambia lo que dice (o la voz), Recorte genera el audio nuevo
   * ANTES de aplicarla y le pone `audio` (el agente nunca lo da: se descarta si lo trae).
   */
  | { op: 'cambiar_voz'; voz_n: number; texto?: string; voz?: string; inicio?: number; volumen?: number; audio?: AudioGenerado }
  | { op: 'anadir_voz'; inicio: number; texto: string; voz?: string; audio?: AudioGenerado }
  | { op: 'borrar_voz'; voz_n: number }

/** El audio que generó Recorte para una frase (ya está en `media/` del proyecto). */
export interface AudioGenerado {
  archivo: string
  duracion: number
  voz: string
  texto: string
}

export interface MensajeChat {
  id: string
  rol: 'usuario' | 'agente'
  texto: string
  fecha: number
  /** Lo que el agente cambió, en palabras, para el historial del chat. */
  cambios?: string[]
  /** Operaciones que no se pudieron aplicar. */
  fallos?: string[]
  error?: boolean
  /** Contexto del editor al escribir (cabezal, elegido). */
  referencia?: string
  /** La timeline justo antes de este mensaje del usuario: para volver a ese punto. */
  antes?: Timeline
  /** El usuario paró al agente en este turno. */
  parado?: boolean
  /** Siguientes pasos que propone el agente (botones que el usuario puede elegir). */
  propuestas?: string[]
  /** Gustos que el agente aprendió en este turno. */
  aprendido?: string[]
}

export const MAX_MENSAJES = 60

/** Cuánta pausa se deja antes y después de cada palabra al quitar silencios. */
const MARGEN_PAUSA = 0.12

function mmss(s: number): string {
  const t = Math.max(0, s)
  const m = Math.floor(t / 60)
  const r = t - m * 60
  return `${m}:${r.toFixed(1).padStart(4, '0')}`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Las pausas largas de la voz, en tiempo de timeline, listas para borrar. */
export function pausasEnTimeline(tl: Timeline, transcript: TranscriptSegment[] | undefined, minimo = 0.6): [number, number][] {
  if (!transcript?.length) return []
  const pausas: [number, number][] = []
  for (const tr of tramos(tl)) {
    if (tr.clip.fuente !== FUENTE_PRINCIPAL) continue
    const palabras = transcript
      .flatMap((s) => s.words)
      .filter((w) => w.end > tr.clip.entrada && w.start < tr.clip.salida)
      .sort((a, b) => a.start - b.start)
    if (palabras.length === 0) continue
    // Huecos: antes de la primera palabra, entre palabras y después de la última.
    const bordes: [number, number][] = [[tr.clip.entrada, palabras[0].start]]
    for (let i = 1; i < palabras.length; i++) bordes.push([palabras[i - 1].end, palabras[i].start])
    bordes.push([palabras[palabras.length - 1].end, tr.clip.salida])
    bordes.forEach(([a, b], k) => {
      // En los bordes del clip no hace falta respiro: el silencio se quita entero.
      const desde = k === 0 ? tr.clip.entrada : Math.max(a + MARGEN_PAUSA, tr.clip.entrada)
      const hasta = k === bordes.length - 1 ? tr.clip.salida : Math.min(b - MARGEN_PAUSA, tr.clip.salida)
      if (b - a >= minimo && hasta - desde > 0.05) {
        pausas.push([tr.inicio + desde - tr.clip.entrada, tr.inicio + hasta - tr.clip.entrada])
      }
    })
  }
  return pausas
}

/** Valida la forma de lo que devolvió el agente. Lo que no encaja se descarta. */
/** Lo que se puede cambiar de una capa, validado (sin `inicio`). */
function camposCapa(x: Record<string, unknown>): { duracion?: number; x?: number; y?: number; ancho?: number; entrada?: EntradaCapa | 'corte' } {
  return {
    ...(num(x.duracion) !== null ? { duracion: num(x.duracion)! } : {}),
    ...(num(x.x) !== null ? { x: num(x.x)! } : {}),
    ...(num(x.y) !== null ? { y: num(x.y)! } : {}),
    ...(num(x.ancho) !== null ? { ancho: num(x.ancho)! } : {}),
    ...(x.entrada === 'pop' || x.entrada === 'fundido' || x.entrada === 'corte' ? { entrada: x.entrada } : {})
  }
}

export function validarOperaciones(crudo: unknown): OperacionTL[] {
  if (!Array.isArray(crudo)) return []
  const ops: OperacionTL[] = []
  for (const o of crudo.slice(0, 200)) {
    if (!o || typeof o !== 'object') continue
    const x = o as Record<string, unknown>
    const pos = (v: unknown): PosicionTexto | undefined => (v === 'arriba' || v === 'centro' || v === 'abajo' ? v : undefined)
    switch (x.op) {
      case 'borrar_tramo': {
        const d = num(x.desde), h = num(x.hasta)
        if (d !== null && h !== null) ops.push({ op: 'borrar_tramo', desde: d, hasta: h })
        break
      }
      case 'quitar_pausas':
        ops.push({ op: 'quitar_pausas', minimo: num(x.minimo) ?? undefined })
        break
      case 'dividir': {
        const en = num(x.en)
        if (en !== null) ops.push({ op: 'dividir', en })
        break
      }
      case 'borrar_clip': {
        const c = num(x.clip)
        if (c !== null) ops.push({ op: 'borrar_clip', clip: c })
        break
      }
      case 'mover_clip': {
        const c = num(x.clip), a = num(x.a)
        if (c !== null && a !== null) ops.push({ op: 'mover_clip', clip: c, a })
        break
      }
      case 'recortar_clip': {
        const c = num(x.clip)
        if (c !== null) ops.push({ op: 'recortar_clip', clip: c, entrada: num(x.entrada) ?? undefined, salida: num(x.salida) ?? undefined })
        break
      }
      case 'anadir_texto': {
        const i = num(x.inicio)
        if (i !== null && typeof x.texto === 'string' && x.texto.trim()) {
          ops.push({ op: 'anadir_texto', inicio: i, duracion: num(x.duracion) ?? undefined, texto: x.texto.slice(0, 200), posicion: pos(x.posicion) })
        }
        break
      }
      case 'cambiar_texto': {
        const n = num(x.texto_n)
        if (n !== null) {
          ops.push({
            op: 'cambiar_texto',
            texto_n: n,
            texto: typeof x.texto === 'string' ? x.texto.slice(0, 200) : undefined,
            inicio: num(x.inicio) ?? undefined,
            duracion: num(x.duracion) ?? undefined,
            posicion: pos(x.posicion),
            tamano: num(x.tamano) ?? undefined,
            color: typeof x.color === 'string' && /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : undefined,
            sin_caja: typeof x.sin_caja === 'boolean' ? x.sin_caja : undefined,
            caja: typeof x.caja === 'string' && /^#[0-9a-f]{6}$/i.test(x.caja) ? x.caja : undefined,
            fuente: typeof x.fuente === 'string' && x.fuente in FUENTES_TEXTO ? x.fuente : undefined,
            ...(num(x.x) !== null && num(x.y) !== null ? { x: num(x.x)!, y: num(x.y)! } : {})
          })
        }
        break
      }
      case 'anadir_capa': {
        const i = num(x.inicio)
        if (i === null || typeof x.medio !== 'string' || !x.medio) break
        ops.push({ op: 'anadir_capa', medio: x.medio, inicio: i, ...camposCapa(x) })
        break
      }
      case 'cambiar_capa': {
        const n = num(x.capa_n)
        if (n !== null) ops.push({ op: 'cambiar_capa', capa_n: n, ...(num(x.inicio) !== null ? { inicio: num(x.inicio)! } : {}), ...camposCapa(x) })
        break
      }
      case 'borrar_capa': {
        const n = num(x.capa_n)
        if (n !== null) ops.push({ op: 'borrar_capa', capa_n: n })
        break
      }
      case 'anadir_sonido': {
        const i = num(x.inicio)
        if (i === null || typeof x.sonido !== 'string' || !SONIDOS_INCLUIDOS.some((s) => s.id === x.sonido)) break
        ops.push({ op: 'anadir_sonido', sonido: x.sonido, inicio: i, ...(num(x.volumen) !== null ? { volumen: num(x.volumen)! } : {}) })
        break
      }
      case 'cambiar_sonido': {
        const n = num(x.sonido_n)
        if (n !== null) ops.push({ op: 'cambiar_sonido', sonido_n: n, ...(num(x.inicio) !== null ? { inicio: num(x.inicio)! } : {}), ...(num(x.volumen) !== null ? { volumen: num(x.volumen)! } : {}) })
        break
      }
      case 'borrar_sonido': {
        const n = num(x.sonido_n)
        if (n !== null) ops.push({ op: 'borrar_sonido', sonido_n: n })
        break
      }
      case 'borrar_texto': {
        const n = num(x.texto_n)
        if (n !== null) ops.push({ op: 'borrar_texto', texto_n: n })
        break
      }
      case 'zoom': {
        const z = num(x.zoom)
        if (z !== null) ops.push({ op: 'zoom', clip: num(x.clip) ?? undefined, zoom: z })
        break
      }
      case 'color': {
        const o2 = { op: 'color' as const, clip: num(x.clip) ?? undefined, brillo: num(x.brillo) ?? undefined, contraste: num(x.contraste) ?? undefined, saturacion: num(x.saturacion) ?? undefined }
        if (o2.brillo !== undefined || o2.contraste !== undefined || o2.saturacion !== undefined) ops.push(o2)
        break
      }
      case 'musica': {
        const v = num(x.volumen)
        const d = typeof x.ducking === 'boolean' ? x.ducking : undefined
        if (v !== null || d !== undefined) ops.push({ op: 'musica', volumen: v ?? undefined, ducking: d })
        break
      }
      case 'quitar_musica':
        ops.push({ op: 'quitar_musica' })
        break
      case 'sonido_clip': {
        const c = num(x.clip)
        if (c !== null && typeof x.sonido === 'boolean') ops.push({ op: 'sonido_clip', clip: c, sonido: x.sonido })
        break
      }
      case 'cambiar_voz': {
        const n = num(x.voz_n)
        if (n === null) break
        ops.push({
          op: 'cambiar_voz',
          voz_n: n,
          texto: typeof x.texto === 'string' && x.texto.trim() ? x.texto.replace(/\s+/g, ' ').trim().slice(0, 600) : undefined,
          voz: typeof x.voz === 'string' && x.voz.trim() ? x.voz.trim().slice(0, 40) : undefined,
          inicio: num(x.inicio) ?? undefined,
          volumen: num(x.volumen) ?? undefined
        })
        break
      }
      case 'anadir_voz': {
        const i = num(x.inicio)
        if (i !== null && typeof x.texto === 'string' && x.texto.trim()) {
          ops.push({
            op: 'anadir_voz',
            inicio: i,
            texto: x.texto.replace(/\s+/g, ' ').trim().slice(0, 600),
            voz: typeof x.voz === 'string' && x.voz.trim() ? x.voz.trim().slice(0, 40) : undefined
          })
        }
        break
      }
      case 'borrar_voz': {
        const n = num(x.voz_n)
        if (n !== null) ops.push({ op: 'borrar_voz', voz_n: n })
        break
      }
      case 'reconstruir': {
        if (!Array.isArray(x.cortes)) break
        const cortes = x.cortes
          .map((c) => ({ entrada: num((c as Record<string, unknown>)?.entrada), salida: num((c as Record<string, unknown>)?.salida) }))
          .filter((c): c is { entrada: number; salida: number } => c.entrada !== null && c.salida !== null)
        if (cortes.length) ops.push({ op: 'reconstruir', cortes })
        break
      }
    }
  }
  return ops
}

/**
 * Aplica las operaciones en orden; cada una ve la timeline que dejó la anterior.
 * Los `borrar_tramo` seguidos se aplican del último al primero, así sus tiempos se
 * refieren todos a la timeline de antes y no se corren entre sí.
 */
export function aplicarOperaciones(
  inicial: Timeline,
  ops: OperacionTL[],
  contexto: { duracionFuente: number; transcript?: TranscriptSegment[]; medios?: Record<string, number> }
): { timeline: Timeline; cambios: string[]; fallos: string[] } {
  const medios = { [FUENTE_PRINCIPAL]: contexto.duracionFuente, ...(contexto.medios ?? {}) }
  let tl = inicial
  const cambios: string[] = []
  const fallos: string[] = []
  const lista = [...ops]

  for (let i = 0; i < lista.length; i++) {
    // Agrupa una racha de borrar_tramo y la aplica de atrás hacia delante.
    if (lista[i].op === 'borrar_tramo') {
      let j = i
      while (j < lista.length && lista[j].op === 'borrar_tramo') j++
      const tramosBorrar = (lista.slice(i, j) as Extract<OperacionTL, { op: 'borrar_tramo' }>[])
        .map((o) => [Math.min(o.desde, o.hasta), Math.max(o.desde, o.hasta)] as const)
        .sort((a, b) => b[0] - a[0])
      let total = 0
      for (const [a, b] of tramosBorrar) {
        const antes = duracionTimeline(tl)
        tl = borrarTramo(tl, a, b)
        total += antes - duracionTimeline(tl)
      }
      if (total > 0) cambios.push(tramosBorrar.length === 1 ? `Quité ${mmss(tramosBorrar[0][0])}–${mmss(tramosBorrar[0][1])}` : `Quité ${tramosBorrar.length} tramos (${total.toFixed(1)} s)`)
      else fallos.push('Los tramos a borrar no caían dentro de la timeline.')
      i = j - 1
      continue
    }

    const o = lista[i]
    const clipEn = (n: number) => tl.clips[Math.round(n) - 1]
    const textoEn = (n: number) => tl.textos[Math.round(n) - 1]

    switch (o.op) {
      case 'quitar_pausas': {
        const pausas = pausasEnTimeline(tl, contexto.transcript, Math.max(0.3, o.minimo ?? 0.6))
        if (!pausas.length) {
          fallos.push(contexto.transcript?.length ? 'No encontré pausas largas.' : 'Para quitar pausas hace falta transcribir el video.')
          break
        }
        const antes = duracionTimeline(tl)
        for (const [a, b] of [...pausas].sort((x, y) => y[0] - x[0])) tl = borrarTramo(tl, a, b)
        cambios.push(`Quité ${pausas.length} pausas (${(antes - duracionTimeline(tl)).toFixed(1)} s)`)
        break
      }
      case 'dividir': {
        const nueva = dividir(tl, o.en)
        if (nueva === tl) fallos.push(`No pude dividir en ${mmss(o.en)}.`)
        else cambios.push(`Dividí en ${mmss(o.en)}`)
        tl = nueva
        break
      }
      case 'borrar_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = borrarClip(tl, c.id)
          cambios.push(`Borré el clip ${o.clip}`)
        }
        break
      }
      case 'mover_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = moverClip(tl, c.id, Math.round(o.a) - 1)
          cambios.push(`Moví el clip ${o.clip} a la posición ${o.a}`)
        }
        break
      }
      case 'recortar_clip': {
        const c = clipEn(o.clip)
        if (!c) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        if (o.entrada !== undefined) tl = recortarClip(tl, c.id, 'entrada', o.entrada, contexto.duracionFuente)
        if (o.salida !== undefined) tl = recortarClip(tl, c.id, 'salida', o.salida, contexto.duracionFuente)
        cambios.push(`Recorté el clip ${o.clip}`)
        break
      }
      case 'anadir_texto': {
        const r = anadirTexto(tl, o.inicio, o.texto)
        if (r.timeline === tl) {
          fallos.push('No pude añadir el texto: la timeline está vacía.')
          break
        }
        tl = cambiarTexto(r.timeline, r.id, { duracion: o.duracion ?? 3, posicion: o.posicion ?? 'abajo' })
        cambios.push(`Añadí el texto «${o.texto}» en ${mmss(o.inicio)}`)
        break
      }
      case 'cambiar_texto': {
        const t = textoEn(o.texto_n)
        if (!t) {
          fallos.push(`No existe el texto ${o.texto_n}.`)
          break
        }
        const cambio: Parameters<typeof cambiarTexto>[2] = {}
        if (o.texto !== undefined) cambio.texto = o.texto
        if (o.inicio !== undefined) cambio.inicio = o.inicio
        if (o.duracion !== undefined) cambio.duracion = o.duracion
        if (o.posicion !== undefined) cambio.posicion = o.posicion
        if (o.tamano !== undefined) cambio.tamano = o.tamano
        if (o.color !== undefined) cambio.color = o.color
        if (o.sin_caja !== undefined) cambio.sinCaja = o.sin_caja
        if (o.caja !== undefined) cambio.caja = o.caja
        if (o.fuente !== undefined) cambio.fuente = o.fuente
        if (o.x !== undefined && o.y !== undefined && o.posicion === undefined) {
          cambio.x = o.x
          cambio.y = o.y
        }
        tl = cambiarTexto(tl, t.id, cambio)
        cambios.push(`Cambié el texto ${o.texto_n}`)
        break
      }
      case 'borrar_texto': {
        const t = textoEn(o.texto_n)
        if (!t) fallos.push(`No existe el texto ${o.texto_n}.`)
        else {
          tl = borrarTexto(tl, t.id)
          cambios.push(`Borré el texto «${t.texto}»`)
        }
        break
      }
      case 'anadir_capa': {
        if (o.medio === FUENTE_PRINCIPAL || contexto.medios?.[o.medio] === undefined) {
          fallos.push(`No hay ningún medio «${o.medio}» en la biblioteca.`)
          break
        }
        const tipo = medios[o.medio] >= MAX_IMAGEN ? 'imagen' : 'video'
        const r = capaNueva(tl, o.medio, tipo, o.inicio, medios, o.x ?? 0.5, o.y ?? 0.5)
        if (r.timeline === tl) {
          fallos.push('La capa nueva cae fuera del video.')
          break
        }
        const { inicio: _i, ...resto } = o
        tl = cambiarCapa(r.timeline, r.id, cambioDeCapa(resto), medios)
        cambios.push(`Puse encima «${o.medio}» en ${mmss(o.inicio)}`)
        break
      }
      case 'cambiar_capa': {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c) {
          fallos.push(`No existe la capa ${o.capa_n}.`)
          break
        }
        tl = cambiarCapa(tl, c.id, { ...(o.inicio !== undefined ? { inicio: o.inicio } : {}), ...cambioDeCapa(o) }, medios)
        cambios.push(`Cambié la capa ${o.capa_n}`)
        break
      }
      case 'borrar_capa': {
        const c = tl.capas?.[Math.round(o.capa_n) - 1]
        if (!c) fallos.push(`No existe la capa ${o.capa_n}.`)
        else {
          tl = borrarCapa(tl, c.id)
          cambios.push(`Quité la capa ${o.capa_n}`)
        }
        break
      }
      case 'anadir_sonido': {
        if (!o.audio) {
          fallos.push(`No pude poner el sonido «${o.sonido}».`)
          break
        }
        const r = anadirSonido(tl, { inicio: o.inicio, duracion: o.audio.duracion, archivo: o.audio.archivo, nombre: o.audio.nombre, ...(o.volumen !== undefined ? { volumen: o.volumen } : {}) })
        if (r.timeline === tl) fallos.push('El sonido cae fuera del video.')
        else cambios.push(`Puse el sonido «${o.audio.nombre}» en ${mmss(o.inicio)}`)
        tl = r.timeline
        break
      }
      case 'cambiar_sonido': {
        const s = tl.sonidos?.[Math.round(o.sonido_n) - 1]
        if (!s) {
          fallos.push(`No existe el sonido ${o.sonido_n}.`)
          break
        }
        tl = cambiarSonido(tl, s.id, { ...(o.inicio !== undefined ? { inicio: o.inicio } : {}), ...(o.volumen !== undefined ? { volumen: o.volumen } : {}) })
        cambios.push(`Ajusté el sonido ${o.sonido_n}`)
        break
      }
      case 'borrar_sonido': {
        const s = tl.sonidos?.[Math.round(o.sonido_n) - 1]
        if (!s) fallos.push(`No existe el sonido ${o.sonido_n}.`)
        else {
          tl = borrarSonido(tl, s.id)
          cambios.push(`Quité el sonido «${s.nombre}»`)
        }
        break
      }
      case 'zoom':
      case 'color': {
        const destino = o.clip === undefined ? null : clipEn(o.clip)
        if (o.clip !== undefined && !destino) {
          fallos.push(`No existe el clip ${o.clip}.`)
          break
        }
        const cambio =
          o.op === 'zoom'
            ? { zoom: o.zoom }
            : {
                ...(o.brillo !== undefined ? { brillo: o.brillo } : {}),
                ...(o.contraste !== undefined ? { contraste: o.contraste } : {}),
                ...(o.saturacion !== undefined ? { saturacion: o.saturacion } : {})
              }
        tl = ajustarClip(tl, destino ? destino.id : null, cambio)
        const donde = destino ? `al clip ${o.clip}` : 'a todos los clips'
        if (o.op === 'zoom') cambios.push(`Puse zoom ${Math.round(Math.min(2, Math.max(1, o.zoom)) * 100)} % ${donde}`)
        else cambios.push(o.saturacion === 0 ? `Pasé a blanco y negro ${donde.replace('al ', 'el ').replace('a todos', 'todos')}` : `Ajusté el color ${donde}`)
        break
      }
      case 'musica': {
        if (!tl.musica) {
          fallos.push('Todavía no hay música: añádela con el botón «Música» de la timeline.')
          break
        }
        tl = cambiarMusica(tl, { ...(o.volumen !== undefined ? { volumen: o.volumen } : {}), ...(o.ducking !== undefined ? { ducking: o.ducking } : {}) })
        const partes: string[] = []
        if (o.volumen !== undefined) partes.push(`volumen ${Math.round(tl.musica!.volumen * 100)} %`)
        if (o.ducking !== undefined) partes.push(o.ducking ? 'baja con la voz' : 'volumen fijo')
        cambios.push(`Música: ${partes.join(', ')}`)
        break
      }
      case 'quitar_musica': {
        if (!tl.musica) break
        tl = ponerMusica(tl, undefined)
        cambios.push('Quité la música')
        break
      }
      case 'sonido_clip': {
        const c = clipEn(o.clip)
        if (!c) fallos.push(`No existe el clip ${o.clip}.`)
        else {
          tl = silenciarClip(tl, c.id, !o.sonido)
          cambios.push(o.sonido ? `Devolví el sonido al clip ${o.clip}` : `Quité el sonido del clip ${o.clip}`)
        }
        break
      }
      case 'cambiar_voz': {
        const v = tl.voces?.[Math.round(o.voz_n) - 1]
        if (!v) {
          fallos.push(`No existe la frase de voz ${o.voz_n}.`)
          break
        }
        if ((o.texto !== undefined || o.voz !== undefined) && !o.audio) {
          fallos.push(`No pude generar la voz nueva de la frase ${o.voz_n}.`)
          break
        }
        tl = cambiarVoz(tl, v.id, {
          ...(o.audio ? { archivo: o.audio.archivo, duracion: o.audio.duracion, texto: o.audio.texto, voz: o.audio.voz } : {}),
          ...(o.inicio !== undefined ? { inicio: o.inicio } : {}),
          ...(o.volumen !== undefined ? { volumen: o.volumen } : {})
        })
        cambios.push(o.audio ? `Rehice la frase ${o.voz_n}: «${o.audio.texto}» (${o.audio.voz})` : `Ajusté la frase de voz ${o.voz_n}`)
        break
      }
      case 'anadir_voz': {
        if (!o.audio) {
          fallos.push(`No pude generar la frase «${o.texto}».`)
          break
        }
        const r = anadirVoz(tl, { inicio: o.inicio, duracion: o.audio.duracion, archivo: o.audio.archivo, texto: o.audio.texto, voz: o.audio.voz })
        if (r.timeline === tl) fallos.push('La frase nueva cae fuera del video.')
        else cambios.push(`Añadí la frase «${o.audio.texto}» en ${mmss(o.inicio)}`)
        tl = r.timeline
        break
      }
      case 'borrar_voz': {
        const v = tl.voces?.[Math.round(o.voz_n) - 1]
        if (!v) fallos.push(`No existe la frase de voz ${o.voz_n}.`)
        else {
          tl = borrarVoz(tl, v.id)
          cambios.push(`Quité la frase «${v.texto || o.voz_n}»`)
        }
        break
      }
      case 'reconstruir': {
        const cortes = o.cortes
          .map((c) => ({ start: Math.max(0, Math.min(c.entrada, c.salida)), end: Math.min(contexto.duracionFuente, Math.max(c.entrada, c.salida)) }))
          .filter((c) => c.end - c.start >= 0.1)
        if (!cortes.length) {
          fallos.push('Los cortes del material no eran válidos.')
          break
        }
        const nueva = timelineDesdeCortes(cortes)
        // Los rótulos que sigan cabiendo se conservan.
        const total = duracionTimeline(nueva)
        tl = { ...nueva, textos: tl.textos.filter((t) => t.inicio < total).map((t) => ({ ...t, id: t.id || nuevoId('texto') })) }
        cambios.push(`Armé la edición con ${cortes.length} ${cortes.length === 1 ? 'corte' : 'cortes'} del material (${total.toFixed(1)} s)`)
        break
      }
    }
  }
  return { timeline: tl, cambios, fallos }
}

/** Los campos de una operación de capa como cambio de `cambiarCapa` («corte» = sin entrada). */
function cambioDeCapa(o: { duracion?: number; x?: number; y?: number; ancho?: number; entrada?: EntradaCapa | 'corte' }) {
  return {
    ...(o.duracion !== undefined ? { duracion: o.duracion } : {}),
    ...(o.x !== undefined ? { x: o.x } : {}),
    ...(o.y !== undefined ? { y: o.y } : {}),
    ...(o.ancho !== undefined ? { ancho: o.ancho } : {}),
    ...(o.entrada !== undefined ? { entrada: o.entrada === 'corte' ? undefined : o.entrada } : {})
  }
}

/** Lo que el agente ve de la timeline: clips, textos y la voz en tiempo de timeline. */
export function describirTimelineParaAgente(
  tl: Timeline,
  transcript: TranscriptSegment[] | undefined,
  duracionFuente: number,
  limite = 30_000,
  /** El nombre de cada medio del proyecto (para que sepa qué foto o qué video es cada clip). */
  nombres: Record<string, string> = {}
): string {
  const lineas: string[] = []
  lineas.push(`Material fuente: ${duracionFuente.toFixed(1)} s. Timeline: ${duracionTimeline(tl).toFixed(1)} s.`)
  lineas.push('Clips (pista de video, en orden, sin huecos):')
  for (const tr of tramos(tl)) {
    const a = ajustesDe(tr.clip)
    const extra = tr.clip.ajustes
      ? ` [zoom ${a.zoom}, brillo ${a.brillo}, contraste ${a.contraste}, saturación ${a.saturacion}]`
      : ''
    const origen = tr.clip.fuente === FUENTE_PRINCIPAL ? 'video principal' : (nombres[tr.clip.fuente] ?? 'otro medio')
    lineas.push(
      `  ${tr.indice + 1}. timeline ${tr.inicio.toFixed(2)}–${tr.fin.toFixed(2)} ← ${origen} ${tr.clip.entrada.toFixed(2)}–${tr.clip.salida.toFixed(2)}${extra}${tr.clip.mudo ? ' (sin sonido)' : ''}`
    )
  }
  if (tl.clips.length === 0) lineas.push('  (vacía)')
  lineas.push('Textos (rótulos):')
  tl.textos.forEach((t, i) => {
    const estilo = [
      t.tamano ? `tamaño ${t.tamano}` : '',
      t.color ? `color ${t.color}` : '',
      t.sinCaja ? 'sin caja' : t.caja ? `caja ${t.caja}` : '',
      t.fuente ? `letra ${t.fuente}` : ''
    ].filter(Boolean)
    const donde = typeof t.x === 'number' && typeof t.y === 'number' ? `en x ${t.x} y ${t.y}` : t.posicion
    lineas.push(`  ${i + 1}. ${t.inicio.toFixed(2)}–${(t.inicio + t.duracion).toFixed(2)} ${donde}: «${t.texto.replace(/\n/g, ' / ')}»${estilo.length ? ` [${estilo.join(', ')}]` : ''}`)
  })
  if (tl.textos.length === 0) lineas.push('  (ninguno)')
  const biblioteca = Object.entries(nombres)
  if (biblioteca.length) {
    lineas.push('Medios de la biblioteca (para «anadir_capa», por su id):')
    for (const [id, nombre] of biblioteca) lineas.push(`  ${id}: ${nombre}`)
  }
  if (tl.capas?.length) {
    lineas.push('Encima del video (capas, de abajo a arriba; x, y = su centro y ancho, en fracción del cuadro):')
    tl.capas.forEach((c, i) =>
      lineas.push(
        `  ${i + 1}. ${c.inicio.toFixed(2)}–${(c.inicio + c.duracion).toFixed(2)} ${nombres[c.fuente] ?? c.fuente} (${c.fuente}) en x ${c.x} y ${c.y}, ancho ${c.ancho}, ${c.entrada ?? 'sin entrada'}`
      )
    )
  }
  if (tl.sonidos?.length) {
    lineas.push('Efectos de sonido:')
    tl.sonidos.forEach((s, i) => lineas.push(`  ${i + 1}. ${s.inicio.toFixed(2)} «${s.nombre}»${s.volumen !== undefined ? ` volumen ${s.volumen}` : ''}`))
  }
  if (tl.voces?.length) {
    lineas.push('Narración (frases de voz generadas, cada una con su audio):')
    tl.voces.forEach((v, i) =>
      lineas.push(`  ${i + 1}. ${v.inicio.toFixed(2)}–${(v.inicio + v.duracion).toFixed(2)}${v.voz ? ` voz ${v.voz}` : ''}${v.volumen !== undefined ? ` volumen ${v.volumen}` : ''}: «${v.texto}»`)
    )
  }
  lineas.push(
    tl.musica
      ? `Música: «${tl.musica.nombre}», volumen ${tl.musica.volumen.toFixed(2)}, ${tl.musica.ducking ? 'baja cuando hay voz' : 'volumen fijo'}.`
      : 'Música: ninguna (solo el usuario puede elegir el archivo, con el botón «Música»).'
  )

  if (transcript?.length) {
    // La voz en tiempo de timeline, por frases, con los tiempos de fuente para reconstruir.
    lineas.push('Voz dentro de la timeline [timeline | fuente] texto:')
    const voz: string[] = []
    for (const tr of tramos(tl)) {
      for (const seg of transcript) {
        if (seg.end <= tr.clip.entrada || seg.start >= tr.clip.salida) continue
        const ini = Math.max(seg.start, tr.clip.entrada)
        const fin = Math.min(seg.end, tr.clip.salida)
        const palabras = seg.words.filter((w) => w.end > ini && w.start < fin).map((w) => w.text)
        const texto = (palabras.length ? palabras.join(' ') : seg.text).replace(/\s+/g, ' ').trim()
        if (texto) voz.push(`  [${(tr.inicio + ini - tr.clip.entrada).toFixed(2)} | ${ini.toFixed(2)}–${fin.toFixed(2)}] ${texto}`)
      }
    }
    lineas.push(...voz)
    // Lo que quedó fuera de la timeline también sirve para reconstruir.
    const dentro = (t: number) => tl.clips.some((c) => t >= c.entrada && t < c.salida)
    const fuera = transcript.filter((s) => !dentro((s.start + s.end) / 2))
    if (fuera.length) {
      lineas.push('Voz del material que NO está en la timeline [fuente] texto:')
      for (const s of fuera) lineas.push(`  [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text.replace(/\s+/g, ' ').trim()}`)
    }
  } else {
    lineas.push('El video aún no está transcrito: no sabes qué se dice.')
  }

  const texto = lineas.join('\n')
  return texto.length > limite ? `${texto.slice(0, limite)}\n… (recortado)` : texto
}

export const INSTRUCCIONES_AGENTE = `Eres el editor de video de Recorte. Editas la timeline del usuario hablando con él en español.
Respondes SOLO con un objeto JSON, sin texto alrededor:
{"mensaje": "lo que le dices al usuario, breve", "operaciones": [ ... ]}

Operaciones disponibles (los tiempos van en segundos con decimales):
- {"op":"borrar_tramo","desde":T,"hasta":T}  borra un tramo de la TIMELINE (lo de después se corre). Varios seguidos se aplican del último al primero, así que usa los tiempos de la timeline actual.
- {"op":"quitar_pausas","minimo":0.6}  quita los silencios de la voz más largos que "minimo" (Recorte los calcula con precisión con la transcripción; úsala en vez de calcular tú las pausas).
- {"op":"dividir","en":T}  divide el clip bajo el segundo T de la timeline.
- {"op":"borrar_clip","clip":N}  borra el clip N (numerados desde 1).
- {"op":"mover_clip","clip":N,"a":M}  lleva el clip N a la posición M.
- {"op":"recortar_clip","clip":N,"entrada":F,"salida":F}  cambia los bordes del clip N en tiempo de FUENTE (uno o ambos).
- {"op":"anadir_texto","inicio":T,"duracion":S,"texto":"…","posicion":"arriba|centro|abajo"}  añade un rótulo en tiempo de timeline.
- {"op":"cambiar_texto","texto_n":N, "texto":"…", "inicio":T, "duracion":S, "posicion":"…"}  cambia el rótulo N.
- {"op":"borrar_texto","texto_n":N}
- {"op":"reconstruir","cortes":[{"entrada":F,"salida":F}, …]}  rehace la pista de video con estos tramos de la FUENTE, en este orden (para resúmenes, versiones cortas o reordenar por contenido). Los clips nuevos salen sin zoom ni color.
- {"op":"zoom","clip":N,"zoom":Z}  acercamiento centrado del clip N, de 1 (nada) a 2 (el doble). Sin "clip", a todos. Para enfatizar una frase: divide antes y después y pon zoom 1.15–1.3 a ese clip (punch-in).
- {"op":"color","clip":N,"brillo":B,"contraste":C,"saturacion":S}  brillo -0.3 a 0.3 (0 neutro), contraste 0.5 a 1.8 (1 neutro), saturación 0 (blanco y negro) a 2 (1 neutro). Sin "clip", a todos. Pon solo lo que cambies.
- {"op":"musica","volumen":V,"ducking":true|false}  volumen 0 a 1 de la música ya puesta (bajo la voz suele ir bien 0.2–0.4); ducking hace que baje sola cuando hay voz.
- {"op":"quitar_musica"}
- {"op":"sonido_clip","clip":N,"sonido":true|false}  quita o devuelve el sonido propio del clip N.
- {"op":"cambiar_texto","texto_n":N,"tamano":1.5,"color":"#ffcc00","sin_caja":true,"caja":"#0a2540","fuente":"gruesa"}  también cambia el estilo del rótulo: tamano 0.5–2.5 (1 normal), color #rrggbb, sin_caja (solo la letra con borde), caja (el color de la caja, #rrggbb), fuente: normal, gruesa, impacto, elegante, maquina. Para varias líneas usa \\n en "texto".
- {"op":"cambiar_voz","voz_n":N,"texto":"…","voz":"Kore","inicio":T,"volumen":V}  cambia la frase de narración N. Con "texto" o "voz", Recorte vuelve a generar SOLO esa frase (con la voz que ya tenía si no das otra). "inicio" la mueve, "volumen" 0–1.5.
- {"op":"anadir_voz","inicio":T,"texto":"…","voz":"Kore"}  añade una frase de narración nueva en el segundo T (sin "voz", la de las demás frases).
- {"op":"borrar_voz","voz_n":N}
- {"op":"cambiar_texto","texto_n":N,"x":0.5,"y":0.3}  pone el rótulo donde quieras: x, y son su centro en fracción del cuadro (0 izquierda/arriba, 1 derecha/abajo). Para volver a arriba, centro o abajo, usa "posicion".
- {"op":"anadir_capa","medio":"ID","inicio":T,"duracion":S,"x":0.5,"y":0.5,"ancho":0.25,"entrada":"pop|fundido|corte"}  pone encima del video un medio de la biblioteca (un logo, un ícono, una foto, una toma de apoyo), por su id. x, y = su centro y ancho = su ancho, en fracción del cuadro. "pop" (por defecto) entra rebotando; úsalo para logos e íconos que aparecen cuando se nombran. No tapes caras ni manos que importan.
- {"op":"cambiar_capa","capa_n":N, …los mismos campos…}  y {"op":"borrar_capa","capa_n":N}
- {"op":"anadir_sonido","sonido":"whoosh|pop|pop-alto|ding|caching","inicio":T,"volumen":0.6}  un efecto de sonido: whoosh (un cambio rápido), pop y pop-alto (algo que aparece), ding (un dato, un acierto), caching (una oferta, un precio). Úsalos con medida: en lo que aparece, no en cada corte.
- {"op":"cambiar_sonido","sonido_n":N,"inicio":T,"volumen":V}  y {"op":"borrar_sonido","sonido_n":N}
Las voces son de Gemini: Kore, Puck, Charon, Zephyr, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat. Cambia solo las frases que el usuario pide: cada frase nueva gasta voz.

Las operaciones se aplican en orden y cada una ve la timeline que dejó la anterior.
Corta siempre en fronteras de frase: usa los tiempos de la voz. No inventes contenido que no está en la transcripción.
Si el usuario solo pregunta algo, responde con "operaciones": [].
No puedes elegir ni crear archivos de música: si no hay música y la piden, dile que la añada con el botón «Música» y que luego tú la ajustas.
Si algo no se puede hacer con estas operaciones (transiciones, velocidad, efectos de imagen), dilo en el mensaje y no lo simules.

${INSTRUCCIONES_CRITERIO}`
