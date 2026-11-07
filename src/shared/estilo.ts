/**
 * «Copiar un estilo»: el análisis del material del usuario y de un video de referencia
 * cuya edición quiere imitar, la ficha de estilo que el agente saca de esa referencia
 * y el informe de viabilidad (qué se puede copiar con lo que tiene conectado hoy).
 *
 * Todo lo de este archivo son tipos y funciones puras: el proceso principal mide con
 * FFmpeg/Whisper (main/estilo/), el agente interpreta, y la interfaz muestra.
 */

// ---------------------------------------------------------------------------
// Fase 1: el material del usuario, medido en local
// ---------------------------------------------------------------------------

export interface EscenaMaterial {
  inicio: number
  fin: number
  /** Miniatura JPG pequeña, relativa a la carpeta de la creación (`analisis/…`). */
  miniatura: string
}

export interface MaterialAnalizado {
  /** El adjunto analizado (`media/<archivo>`). */
  archivo: string
  nombre: string
  duracion: number
  ancho: number
  alto: number
  fps: number
  conAudio: boolean
  /** Lo que se dice, compacto: una línea por segmento de la transcripción. */
  transcripcion: { inicio: number; texto: string }[]
  /** Los cortes de plano detectados. */
  escenas: EscenaMaterial[]
  /** Hoja de contacto con fotogramas repartidos (`analisis/…-hoja.jpg`). */
  hoja: string | null
  /** Caché: tamaño y fecha del archivo cuando se analizó. */
  tamano: number
  fecha: number
}

/** Lo que hay en `<creacion>/analisis/material.json`. */
export interface AnalisisMaterial {
  videos: MaterialAnalizado[]
  hecho: number
}

// ---------------------------------------------------------------------------
// Fase 2: la referencia, medida en local y luego interpretada por el agente
// ---------------------------------------------------------------------------

export interface PlanoReferencia {
  inicio: number
  fin: number
}

/** Lo que Recorte mide solo, sin agente (`analisis/estilo-medido.json`). */
export interface EstiloMedido {
  duracion: number
  ancho: number
  alto: number
  formato: '9:16' | '16:9' | '1:1' | 'otro'
  /** Los planos detectados y cuánto dura cada uno. */
  planos: PlanoReferencia[]
  duraciones: number[]
  promedioPlano: number
  medianaPlano: number
  cortesPorMinuto: number
  conVoz: boolean
  transcripcion: { inicio: number; texto: string }[]
  /** Volumen integrado en LUFS (loudnorm en modo análisis). */
  volumen: number | null
  silencios: { inicio: number; fin: number }[]
  /** Colores dominantes de los fotogramas clave, en hex. */
  colores: string[]
  /** Un fotograma por plano, máximo 24 (`analisis/ref-…jpg`). */
  fotogramas: string[]
  /** Hojas de contacto (`analisis/ref-hoja-…jpg`). */
  hojas: string[]
}

/** Los tipos de recurso que una referencia puede usar y Recorte sabe valorar. */
export type TipoRecurso =
  | 'material'
  | 'motion'
  | 'subtitulos'
  | 'recorte'
  | 'imagen_generada'
  | 'clip_generado'
  | 'voz'
  | 'musica'

export interface RecursoEstilo {
  tipo: TipoRecurso
  cuantos: number
  descripcion: string
}

/** La ficha de estilo (`analisis/estilo.json`): lo que el agente vio en la referencia. */
export interface FichaEstilo {
  subtitulos: {
    lleva: boolean
    posicion?: string
    tamano?: string
    color?: string
    /** Palabra por palabra o por frase. */
    modo?: 'palabra' | 'frase'
    mayusculas?: boolean
  }
  tipografia?: string
  /** Con qué frecuencia hay zooms o punch-ins. */
  zooms?: 'ninguno' | 'pocos' | 'frecuentes'
  /** Qué B-roll usa y con qué frecuencia. */
  broll?: string
  /** Si recorta a la persona (sin fondo). */
  recortesPersona?: boolean
  /** Los textos en pantalla: qué dicen y cómo entran. */
  textos?: string
  /** Qué motion graphics lleva. */
  motion?: string
  transiciones?: 'corte' | 'fundido' | 'mixtas'
  /** Música y efectos de sonido. */
  musica?: string
  /** Qué pasa en los primeros 3 segundos. */
  gancho?: string
  /** Ritmo de corte deseado (segundos por plano). Si no, manda lo medido en la referencia. */
  ritmoSegundos?: number
  /** Una frase: el estilo en resumen. */
  resumen: string
  recursos: RecursoEstilo[]
  /** El agente no vio imágenes: la ficha sale solo de lo medido. */
  aproximada?: boolean
  /** Por qué es aproximada, en palabras del usuario (sin agente, el agente falló…). */
  nota?: string
}

// ---------------------------------------------------------------------------
// Viabilidad: qué se puede copiar con lo conectado hoy (se calcula en código)
// ---------------------------------------------------------------------------

export interface ConexionesViabilidad {
  flow: boolean
  chatgpt: boolean
  /** Llave o cuenta de Google para la voz de Gemini. */
  vozGemini: boolean
  /** HyperFrames instalado (diseña los motion graphics y compone el video). */
  hyperframes: boolean
}

/** Lo que la creación ya tiene o pide, para no prometer de más. */
export interface ContextoViabilidad {
  /** El usuario subió videos o fotos. */
  conMaterial: boolean
  /** La ficha pide subtítulos palabra por palabra (hoy salen por frase). */
  subtitulosPalabra: boolean
}

export interface ItemViabilidad {
  tipo: TipoRecurso
  /** si: se hace igual · parcial: se hace a medias (cuenta la mitad) · sustituir: se cambia por otra cosa. */
  estado: 'si' | 'parcial' | 'sustituir'
  detalle: string
  /** Si conectar algo lo mejora, qué. */
  conexion?: string
}

export interface Viabilidad {
  /** 0-100: cuánto del estilo se puede copiar con lo conectado hoy. */
  porcentaje: number
  items: ItemViabilidad[]
  /** Frases cortas: qué conectar para subir el porcentaje. */
  paraConectar: string[]
}

/** Lo que pesa cada recurso en el parecido (suman sobre lo que la referencia use). */
const PESO: Record<TipoRecurso, number> = {
  material: 30,
  motion: 15,
  subtitulos: 15,
  recorte: 10,
  imagen_generada: 10,
  clip_generado: 10,
  voz: 5,
  musica: 5
}

const NOMBRE_RECURSO: Record<TipoRecurso, string> = {
  material: 'Tu material',
  motion: 'Motion graphics',
  subtitulos: 'Subtítulos',
  recorte: 'Recortes de persona',
  imagen_generada: 'Imágenes generadas',
  clip_generado: 'Clips generados',
  voz: 'Voz',
  musica: 'Música'
}

export function nombreRecurso(tipo: TipoRecurso): string {
  return NOMBRE_RECURSO[tipo] ?? tipo
}

/**
 * El informe «Este estilo se puede copiar en un N %». Lo calcula el código a partir
 * de los recursos que el agente vio en la referencia y de lo conectado hoy; se
 * recalcula al conectar algo, sin volver a analizar.
 */
export function calcularViabilidad(
  recursos: RecursoEstilo[],
  con: ConexionesViabilidad,
  ctx: ContextoViabilidad = { conMaterial: true, subtitulosPalabra: false }
): Viabilidad {
  // Un recurso de cada tipo, sumando los que repitan.
  const tipos = new Map<TipoRecurso, number>()
  for (const r of recursos) {
    if (!(r.tipo in PESO)) continue
    tipos.set(r.tipo, (tipos.get(r.tipo) ?? 0) + Math.max(1, r.cuantos || 1))
  }
  const items: ItemViabilidad[] = []
  const paraConectar: string[] = []
  let total = 0
  let posible = 0
  for (const tipo of tipos.keys()) {
    const peso = PESO[tipo]
    total += peso
    let item: ItemViabilidad
    switch (tipo) {
      case 'material':
        item = ctx.conMaterial
          ? { tipo, estado: 'si', detalle: 'Tus videos y fotos: el agente elige sus trozos con lo que se dice en cada momento.' }
          : { tipo, estado: 'sustituir', detalle: 'No subiste material: esas partes se diseñan con tipografía, formas y color.', conexion: 'Sube tus videos o fotos' }
        break
      case 'motion':
        item = con.hyperframes
          ? { tipo, estado: 'si', detalle: 'El agente los diseña con HyperFrames al componer el video.' }
          : { tipo, estado: 'sustituir', detalle: 'Falta HyperFrames para diseñarlos.', conexion: 'HyperFrames (Ajustes → Herramientas de video)' }
        break
      case 'subtitulos':
        item = ctx.subtitulosPalabra
          ? { tipo, estado: 'parcial', detalle: 'Salen por frase, con el estilo de la ficha; palabra por palabra todavía no.' }
          : { tipo, estado: 'si', detalle: 'Por frase, con el estilo de la ficha.' }
        break
      case 'recorte':
        // Recortar a la persona (quitar el fondo) aún no está en Recorte.
        item = { tipo, estado: 'sustituir', detalle: 'Todavía no: Recorte aún no quita el fondo; se usa el plano completo.' }
        break
      case 'imagen_generada':
        if (con.flow || con.chatgpt) {
          item = { tipo, estado: 'si', detalle: con.flow ? 'Se generan con Google Flow (gratis).' : 'Se generan con tu cuenta de ChatGPT.' }
        } else {
          item = { tipo, estado: 'sustituir', detalle: 'Sin Flow ni ChatGPT: se cambian por tarjetas de diseño animadas.', conexion: 'Google Flow o ChatGPT' }
          if (!paraConectar.includes('Google Flow o ChatGPT (imágenes)')) paraConectar.push('Google Flow o ChatGPT (imágenes)')
        }
        break
      case 'clip_generado':
        if (con.flow) {
          item = { tipo, estado: 'si', detalle: 'Se generan con Veo (gastan créditos de Flow; verás el costo antes).' }
        } else {
          item = { tipo, estado: 'sustituir', detalle: 'Sin Flow: se cambian por trozos de tu propio material.', conexion: 'Google Flow (Veo)' }
          if (!paraConectar.includes('Google Flow (clips con Veo)')) paraConectar.push('Google Flow (clips con Veo)')
        }
        break
      case 'voz':
        item = con.vozGemini
          ? { tipo, estado: 'si', detalle: 'Voz de Gemini con tu cuenta o tu llave de AI Studio.' }
          : { tipo, estado: 'sustituir', detalle: 'Sin Gemini: grabas o subes tu voz.', conexion: 'Voz de Gemini (Ajustes → Voz)' }
        break
      case 'musica':
        item = { tipo, estado: 'sustituir', detalle: 'No hay generador de música: la subes tú en el editor.' }
        break
      default:
        item = { tipo, estado: 'sustituir', detalle: 'Se sustituye por lo más parecido.' }
    }
    if (item.estado === 'si') posible += peso
    else if (item.estado === 'parcial') posible += peso / 2
    if (item.conexion && item.estado !== 'si' && !paraConectar.includes(item.conexion) && /Ajustes|HyperFrames/.test(item.conexion)) {
      paraConectar.push(item.conexion)
    }
    items.push(item)
  }
  const porcentaje = total ? Math.round((posible / total) * 100) : 100
  return { porcentaje, items, paraConectar }
}

// ---------------------------------------------------------------------------
// Validación de lo que devuelve el agente (nunca se confía tal cual)
// ---------------------------------------------------------------------------

const TIPOS_RECURSO: TipoRecurso[] = ['material', 'motion', 'subtitulos', 'recorte', 'imagen_generada', 'clip_generado', 'voz', 'musica']

const texto = (x: unknown, largo: number): string | undefined => {
  if (typeof x !== 'string') return undefined
  const t = x.replace(/\s+/g, ' ').trim().slice(0, largo)
  return t || undefined
}

/** Limpia la ficha que devuelve el agente; si no se parece a una ficha, null. */
export function validarFicha(crudo: unknown): FichaEstilo | null {
  if (!crudo || typeof crudo !== 'object') return null
  const f = crudo as Record<string, unknown>

  const sub = (f.subtitulos && typeof f.subtitulos === 'object' ? f.subtitulos : {}) as Record<string, unknown>
  const subtitulos: FichaEstilo['subtitulos'] = {
    lleva: Boolean(sub.lleva),
    ...(texto(sub.posicion, 60) ? { posicion: texto(sub.posicion, 60) } : {}),
    ...(texto(sub.tamano, 40) ? { tamano: texto(sub.tamano, 40) } : {}),
    ...(texto(sub.color, 40) ? { color: texto(sub.color, 40) } : {}),
    ...(sub.modo === 'palabra' || sub.modo === 'frase' ? { modo: sub.modo } : {}),
    ...(typeof sub.mayusculas === 'boolean' ? { mayusculas: sub.mayusculas } : {})
  }

  const recursos: RecursoEstilo[] = []
  for (const r of Array.isArray(f.recursos) ? f.recursos.slice(0, 12) : []) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    const tipo = typeof x.tipo === 'string' && TIPOS_RECURSO.includes(x.tipo as TipoRecurso) ? (x.tipo as TipoRecurso) : null
    if (!tipo) continue
    recursos.push({
      tipo,
      cuantos: Math.min(99, Math.max(1, Math.round(Number(x.cuantos) || 1))),
      descripcion: texto(x.descripcion, 140) ?? ''
    })
  }

  const resumen = texto(f.resumen, 200)
  if (!resumen && !recursos.length && !subtitulos.lleva) return null

  return {
    subtitulos,
    ...(texto(f.tipografia, 120) ? { tipografia: texto(f.tipografia, 120) } : {}),
    ...(f.zooms === 'ninguno' || f.zooms === 'pocos' || f.zooms === 'frecuentes' ? { zooms: f.zooms } : {}),
    ...(texto(f.broll, 140) ? { broll: texto(f.broll, 140) } : {}),
    ...(typeof f.recortesPersona === 'boolean' ? { recortesPersona: f.recortesPersona } : {}),
    ...(texto(f.textos, 140) ? { textos: texto(f.textos, 140) } : {}),
    ...(texto(f.motion, 140) ? { motion: texto(f.motion, 140) } : {}),
    ...(f.transiciones === 'corte' || f.transiciones === 'fundido' || f.transiciones === 'mixtas' ? { transiciones: f.transiciones } : {}),
    ...(texto(f.musica, 120) ? { musica: texto(f.musica, 120) } : {}),
    ...(texto(f.gancho, 160) ? { gancho: texto(f.gancho, 160) } : {}),
    ...(typeof f.ritmoSegundos === 'number' && Number.isFinite(f.ritmoSegundos)
      ? { ritmoSegundos: Math.min(20, Math.max(0.3, f.ritmoSegundos)) }
      : {}),
    resumen: resumen ?? 'Estilo medido de la referencia',
    recursos,
    ...(f.aproximada === true ? { aproximada: true } : {}),
    ...(texto(f.nota, 240) ? { nota: texto(f.nota, 240) } : {})
  }
}

// ---------------------------------------------------------------------------
// Resúmenes para los prompts
// ---------------------------------------------------------------------------

const mmss = (s: number): string => {
  const t = Math.max(0, Math.floor(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

/**
 * El material del usuario para el guionista: qué se dice y en qué segundos, por video,
 * para que elija trozos reales en vez de nombrar solo el archivo. Acotado: si no cabe,
 * muestrea la transcripción.
 */
export function resumenMaterial(videos: MaterialAnalizado[], limite = 6000): string {
  if (!videos.length) return ''
  const partes: string[] = ['MATERIAL DEL USUARIO, ya analizado (puedes pedir trozos concretos por archivo y segundos):']
  for (const v of videos) {
    partes.push(
      `\n■ ${v.archivo} («${v.nombre}»): ${Math.round(v.duracion)} s, ${v.ancho}×${v.alto}${v.conAudio ? ', con audio' : ', sin audio'}, ${v.escenas.length} planos.`
    )
    if (v.transcripcion.length) {
      partes.push('Lo que se dice:')
      for (const t of v.transcripcion) partes.push(`  [${mmss(t.inicio)}] ${t.texto}`)
    } else {
      partes.push('No se oye voz clara.')
    }
  }
  let textoTotal = partes.join('\n')
  if (textoTotal.length <= limite) return textoTotal
  // Si no cabe: muestrea las líneas de transcripción, manteniendo las cabeceras.
  const lineas = textoTotal.split('\n')
  const cabeceras = lineas.filter((l) => !l.startsWith('  ['))
  const transc = lineas.filter((l) => l.startsWith('  ['))
  const espacio = limite - cabeceras.join('\n').length - 200
  const caben = Math.max(4, Math.floor(espacio / 70))
  const paso = Math.max(1, Math.ceil(transc.length / caben))
  const muestreada = transc.filter((_, i) => i % paso === 0)
  // Reinserta cada línea de transcripción tras su cabecera aproximada: basta con
  // devolver cabeceras y transcripción en bloque; el guionista solo necesita tiempos.
  return [...cabeceras, ...muestreada].join('\n').slice(0, limite)
}

/**
 * La ficha de estilo de la referencia para el guionista y el diseñador: cómo debe
 * verse y moverse el video. Va antes de las reglas, como dirección editorial extra.
 */
export function bloqueEstiloGuion(ficha: FichaEstilo, medido?: EstiloMedido | null): string {
  const partes: string[] = [
    'ESTILO A COPIAR (de un video de referencia que eligió el usuario; es su prioridad):',
    `- En resumen: ${ficha.resumen}`
  ]
  if (medido || ficha.ritmoSegundos) {
    const ritmo = ficha.ritmoSegundos ?? medido!.medianaPlano
    partes.push(
      `- Ritmo de corte: un plano cada ~${ritmo.toFixed(1)} s${medido ? ` (medido: ${Math.round(medido.cortesPorMinuto)} cortes por minuto, formato ${medido.formato}, duración ${Math.round(medido.duracion)} s)` : ''}.`
    )
  }
  if (ficha.gancho) partes.push(`- Primeros 3 segundos: ${ficha.gancho}`)
  if (ficha.subtitulos.lleva) {
    const s = ficha.subtitulos
    partes.push(
      `- Subtítulos: ${[s.modo === 'palabra' ? 'palabra por palabra' : 'por frase', s.posicion, s.tamano, s.color, s.mayusculas ? 'en mayúsculas' : ''].filter(Boolean).join(', ')}.`
    )
  }
  if (ficha.tipografia) partes.push(`- Tipografía: ${ficha.tipografia}`)
  if (ficha.zooms && ficha.zooms !== 'ninguno') partes.push(`- Zooms/punch-ins: ${ficha.zooms}.`)
  if (ficha.broll) partes.push(`- B-roll: ${ficha.broll}`)
  if (ficha.recortesPersona) partes.push('- Recorta a la persona (sin fondo) en varios planos.')
  if (ficha.textos) partes.push(`- Textos en pantalla: ${ficha.textos}`)
  if (ficha.motion) partes.push(`- Motion graphics: ${ficha.motion}`)
  if (ficha.transiciones) partes.push(`- Transiciones: ${ficha.transiciones}.`)
  if (ficha.musica) partes.push(`- Música/efectos: ${ficha.musica}`)
  partes.push('Sigue este estilo en la estructura y el ritmo de las escenas; la petición del usuario manda en el contenido.')
  return partes.join('\n')
}
