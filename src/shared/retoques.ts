import { FUENTE_PRINCIPAL, tramos, type CapaTL, type ClipTL, type SonidoTL, type TextoTL, type Timeline, type VozTL } from './timeline'

/**
 * Lo que el usuario retocó a mano en el editor sobre lo que entregó el agente, en frases para
 * el agente (fase 6.4). Al pedirle una versión nueva, las recibe para pasarlas a su receta y
 * no pisarlas. Se compara la timeline tal como se entregó con la de ahora, pieza por pieza
 * (los ids no cambian al editar).
 */

export interface ContextoRetoques {
  /** Cómo llamar a un medio del proyecto: «foto «logo.png» (C:\…\logo.png)». */
  medio: (fuente: string) => string
  /** La ruta completa de un archivo del proyecto (`media/voz-3.wav`). */
  archivo: (relativo: string) => string
}

/** Lo más que se le cuenta: si retocó todo, con esto entiende el rumbo. */
const MAX_RETOQUES = 40

const s = (n: number): string => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} s`
const corto = (t: string, n = 70): string => {
  const limpio = t.replace(/\s+/g, ' ').trim()
  return `«${limpio.length > n ? `${limpio.slice(0, n - 1)}…` : limpio}»`
}
const distinto = (a: number | undefined, b: number | undefined, margen = 0.05): boolean => Math.abs((a ?? 0) - (b ?? 0)) > margen
const porId = <T extends { id: string }>(lista: T[] | undefined): Map<string, T> => new Map((lista ?? []).map((x) => [x.id, x]))

function sitioTexto(t: TextoTL): string {
  return t.x !== undefined && t.y !== undefined ? `en x ${t.x.toFixed(2)}, y ${t.y.toFixed(2)} del cuadro` : t.posicion
}

function estiloTexto(t: TextoTL): string {
  return [
    t.tamano && t.tamano !== 1 ? `tamaño ×${t.tamano.toFixed(2)}` : '',
    t.color ? `color ${t.color}` : '',
    t.fuente ? `letra ${t.fuente}` : '',
    t.sinCaja ? 'sin caja' : t.caja ? `caja ${t.caja}` : '',
    t.animacion ? `aparece ${t.animacion}` : ''
  ]
    .filter(Boolean)
    .join(', ')
}

function textos(antes: TextoTL[] | undefined, ahora: TextoTL[] | undefined): string[] {
  const out: string[] = []
  const a = porId(antes)
  const b = porId(ahora)
  for (const x of antes ?? []) {
    const y = b.get(x.id)
    if (!y) {
      out.push(`Quitó el rótulo ${corto(x.texto)} (${s(x.inicio)}).`)
      continue
    }
    if (y.texto.trim() !== x.texto.trim()) out.push(`El rótulo de ${s(y.inicio)} decía ${corto(x.texto)} y ahora dice ${corto(y.texto, 200)}.`)
    if (distinto(x.inicio, y.inicio, 0.15) || distinto(x.duracion, y.duracion, 0.15)) {
      out.push(`El rótulo ${corto(y.texto)} ahora va de ${s(y.inicio)} a ${s(y.inicio + y.duracion)}.`)
    }
    if (sitioTexto(x) !== sitioTexto(y)) out.push(`Movió el rótulo ${corto(y.texto)}: ahora va ${sitioTexto(y)}.`)
    if (estiloTexto(x) !== estiloTexto(y)) out.push(`Cambió el estilo del rótulo ${corto(y.texto)}: ${estiloTexto(y) || 'el normal'}.`)
  }
  for (const y of ahora ?? []) {
    if (a.has(y.id)) continue
    const estilo = estiloTexto(y)
    out.push(`Añadió el rótulo ${corto(y.texto, 200)} de ${s(y.inicio)} a ${s(y.inicio + y.duracion)}, ${sitioTexto(y)}${estilo ? ` (${estilo})` : ''}.`)
  }
  return out
}

function voces(antes: VozTL[] | undefined, ahora: VozTL[] | undefined, ctx: ContextoRetoques): string[] {
  const out: string[] = []
  const a = porId(antes)
  const b = porId(ahora)
  for (const x of antes ?? []) {
    const y = b.get(x.id)
    if (!y) {
      out.push(`Quitó la frase de voz ${corto(x.texto)} (${s(x.inicio)}).`)
      continue
    }
    // Un audio nuevo (otro texto u otra voz) ya está hecho: que lo use tal cual, sin volver a generarlo.
    if (y.archivo !== x.archivo) {
      const que = y.texto.trim() !== x.texto.trim() ? `ahora dice ${corto(y.texto, 300)} (antes ${corto(x.texto)})` : `la volvió a generar${y.voz && y.voz !== x.voz ? ` con la voz ${y.voz}` : ''}`
      out.push(`La frase de voz de ${s(y.inicio)} ${que}. Su audio ya está hecho: usa ${ctx.archivo(y.archivo)} (no la vuelvas a pedir).`)
    } else if (y.texto.trim() !== x.texto.trim()) {
      out.push(`Corrigió el texto de la frase de voz de ${s(y.inicio)}: ${corto(y.texto, 300)}.`)
    }
    if (distinto(x.inicio, y.inicio, 0.15)) out.push(`La frase ${corto(y.texto)} ahora empieza en ${s(y.inicio)} (antes ${s(x.inicio)}).`)
    if (distinto(x.volumen ?? 1, y.volumen ?? 1)) out.push(`La frase ${corto(y.texto)} va al volumen ${(y.volumen ?? 1).toFixed(2)}.`)
  }
  for (const y of ahora ?? []) {
    if (a.has(y.id)) continue
    out.push(`Añadió una frase de voz en ${s(y.inicio)}: ${corto(y.texto, 300)}. Su audio ya está hecho: usa ${ctx.archivo(y.archivo)}.`)
  }
  return out
}

function capas(antes: CapaTL[] | undefined, ahora: CapaTL[] | undefined, ctx: ContextoRetoques): string[] {
  const out: string[] = []
  const a = porId(antes)
  const b = porId(ahora)
  const donde = (c: CapaTL) =>
    `de ${s(c.inicio)} a ${s(c.inicio + c.duracion)}, centro en x ${c.x.toFixed(2)}, y ${c.y.toFixed(2)}, ancho ${c.ancho.toFixed(2)}${c.giro ? `, giro ${c.giro}°` : ''}${c.entrada ? `, entrada ${c.entrada}` : ''}` +
    (c.fin ? `, y se mueve hasta x ${c.fin.x.toFixed(2)}, y ${c.fin.y.toFixed(2)}, ancho ${c.fin.ancho.toFixed(2)}${c.fin.giro ? `, giro ${c.fin.giro}°` : ''}` : '')
  for (const x of antes ?? []) {
    const y = b.get(x.id)
    if (!y) out.push(`Quitó la capa ${ctx.medio(x.fuente)} (${s(x.inicio)}).`)
    else if (donde(x) !== donde(y)) out.push(`Cambió la capa ${ctx.medio(y.fuente)}: ahora ${donde(y)}.`)
  }
  for (const y of ahora ?? []) if (!a.has(y.id)) out.push(`Añadió encima ${ctx.medio(y.fuente)} ${donde(y)}.`)
  return out
}

function sonidos(antes: SonidoTL[] | undefined, ahora: SonidoTL[] | undefined, ctx: ContextoRetoques): string[] {
  const out: string[] = []
  const a = porId(antes)
  const b = porId(ahora)
  for (const x of antes ?? []) {
    const y = b.get(x.id)
    if (!y) out.push(`Quitó el sonido «${x.nombre}» (${s(x.inicio)}).`)
    else if (distinto(x.inicio, y.inicio) || distinto(x.volumen ?? 0.6, y.volumen ?? 0.6)) out.push(`El sonido «${y.nombre}» ahora suena en ${s(y.inicio)}${y.volumen !== undefined ? ` a volumen ${y.volumen.toFixed(2)}` : ''}.`)
  }
  for (const y of ahora ?? []) {
    if (!a.has(y.id)) out.push(`Añadió el sonido «${y.nombre}» en ${s(y.inicio)}${y.volumen !== undefined ? ` a volumen ${y.volumen.toFixed(2)}` : ''} (archivo: ${ctx.archivo(y.archivo)}).`)
  }
  return out
}

/** Lo que importa de un clip para saber si se tocó (sin su id). */
const huellaClip = (c: ClipTL): string =>
  JSON.stringify({ f: c.fuente, e: c.entrada.toFixed(2), s: c.salida.toFixed(2), a: c.ajustes ?? null, m: Boolean(c.mudo), d: c.fundido ?? 0, t: c.transicion ?? null })

function clips(antes: Timeline, ahora: Timeline, ctx: ContextoRetoques): string[] {
  const x = antes.clips.map(huellaClip)
  const y = ahora.clips.map(huellaClip)
  if (x.length === y.length && x.every((h, i) => h === y[i])) return []
  const lista = tramos(ahora).slice(0, 30).map(({ clip, inicio, fin }, i) => {
    const que = clip.fuente === FUENTE_PRINCIPAL ? `tu video entregado, del ${s(clip.entrada)} al ${s(clip.salida)}` : `${ctx.medio(clip.fuente)}${clip.entrada > 0.05 ? ` desde su ${s(clip.entrada)}` : ''}`
    const extra = [
      clip.ajustes?.zoom && clip.ajustes.zoom !== 1 ? `zoom ${clip.ajustes.zoom.toFixed(2)}` : '',
      clip.fundido ? `entra con ${clip.transicion ?? 'fundido'} de ${s(clip.fundido)}` : ''
    ].filter(Boolean)
    return `  ${i + 1}. ${s(inicio)}–${s(fin)}: ${que}${extra.length ? ` (${extra.join(', ')})` : ''}`
  })
  return [`Cambió los clips (orden, duración o encuadre). Ahora van así (${ahora.clips.length}):\n${lista.join('\n')}`]
}

function musica(antes: Timeline, ahora: Timeline, ctx: ContextoRetoques): string[] {
  const x = antes.musica
  const y = ahora.musica
  if (x && !y) return ['Quitó la música.']
  if (!x && y) return [`Puso música: «${y.nombre}» (${ctx.archivo(y.archivo)}) a volumen ${y.volumen.toFixed(2)}.`]
  if (x && y && x.archivo !== y.archivo) return [`Cambió la música por «${y.nombre}» (${ctx.archivo(y.archivo)}) a volumen ${y.volumen.toFixed(2)}.`]
  if (x && y && distinto(x.volumen, y.volumen)) return [`La música va a volumen ${y.volumen.toFixed(2)} (antes ${x.volumen.toFixed(2)}).`]
  return []
}

function filtros(antes: Timeline, ahora: Timeline): string[] {
  const a = JSON.stringify(antes.filtros ?? {})
  const b = JSON.stringify(ahora.filtros ?? {})
  if (a === b) return []
  if (!ahora.filtros) return ['Quitó los filtros del video.']
  return [`Puso los filtros del video así (0 a 1): ${Object.entries(ahora.filtros).map(([k, v]) => `${k} ${v}`).join(', ')}.`]
}

/** Los retoques a mano, en frases; vacío si no tocó nada. */
export function describirRetoques(entregada: Timeline, actual: Timeline, ctx: ContextoRetoques): string[] {
  const todo = [
    ...clips(entregada, actual, ctx),
    ...textos(entregada.textos, actual.textos),
    ...voces(entregada.voces, actual.voces, ctx),
    ...capas(entregada.capas, actual.capas, ctx),
    ...sonidos(entregada.sonidos, actual.sonidos, ctx),
    ...musica(entregada, actual, ctx),
    ...filtros(entregada, actual)
  ]
  return todo.length > MAX_RETOQUES ? [...todo.slice(0, MAX_RETOQUES), `…y ${todo.length - MAX_RETOQUES} retoques más del mismo estilo.`] : todo
}

/** El bloque que se le pasa al agente junto con lo que pide el usuario. */
export function bloqueRetoques(retoques: string[]): string {
  if (!retoques.length) return ''
  return `\n\nRETOQUES QUE EL USUARIO HIZO A MANO EN EL EDITOR sobre tu versión anterior (los tiempos son del video). ` +
    `Consérvalos en esta versión pasándolos a tu receta (rótulos, voz, capas, sonidos, música) salvo que lo que pide ahora diga otra cosa:\n` +
    retoques.map((r) => `- ${r}`).join('\n')
}
