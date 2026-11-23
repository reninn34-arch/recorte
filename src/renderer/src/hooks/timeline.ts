import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { duracionTimeline, tramos, tramosDeVoces, tramosMusica, ubicar, vozEnTimeline, type Timeline , velocidadDe, clipEnFuente, velocidadEnFuente } from '../../../shared/timeline'
import type { TranscriptSegment } from '../../../shared/types'

const LIMITE_HISTORIAL = 200

export interface Historial {
  aplicar: (nueva: Timeline) => void
  /** Cambia sin abrir un paso nuevo: para seguir escribiendo dentro del mismo paso. */
  reemplazar: (nueva: Timeline) => void
  deshacer: () => void
  rehacer: () => void
  puedeDeshacer: boolean
  puedeRehacer: boolean
  /** Todos los pasos, del más viejo al más nuevo (para el panel de historial), y cuál es el actual. */
  pasos: () => { timelines: Timeline[]; cuando: number[]; actual: number }
  /** Va a cualquier paso de la lista (deshaciendo o rehaciendo los que haga falta). */
  irA: (indice: number) => void
}

/**
 * Deshacer y rehacer sobre la timeline. Cada `aplicar` es un paso; un arrastre entero
 * cuenta como uno solo porque la timeline solo se aplica al soltar.
 * `clave` (el id del proyecto) reinicia el historial al cambiar de proyecto.
 */
export function useHistorial(actual: Timeline, onCambiar: (t: Timeline) => void, clave: string): Historial {
  const pasado = useRef<Timeline[]>([])
  const futuro = useRef<Timeline[]>([])
  // Cuándo se hizo cada paso (el de `actual` en `ahora`), para el panel de historial.
  const horasPasado = useRef<number[]>([])
  const horasFuturo = useRef<number[]>([])
  const ahora = useRef(Date.now())
  const actualRef = useRef(actual)
  actualRef.current = actual
  const cambiarRef = useRef(onCambiar)
  cambiarRef.current = onCambiar
  const [, refrescar] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    pasado.current = []
    futuro.current = []
    horasPasado.current = []
    horasFuturo.current = []
    ahora.current = Date.now()
    refrescar()
  }, [clave])

  const aplicar = useCallback((nueva: Timeline) => {
    if (nueva === actualRef.current) return
    pasado.current.push(actualRef.current)
    horasPasado.current.push(ahora.current)
    ahora.current = Date.now()
    if (pasado.current.length > LIMITE_HISTORIAL) {
      pasado.current.shift()
      horasPasado.current.shift()
    }
    futuro.current = []
    horasFuturo.current = []
    actualRef.current = nueva
    cambiarRef.current(nueva)
    refrescar()
  }, [])

  const reemplazar = useCallback((nueva: Timeline) => {
    futuro.current = []
    actualRef.current = nueva
    cambiarRef.current(nueva)
    refrescar()
  }, [])

  const deshacer = useCallback(() => {
    const previa = pasado.current.pop()
    if (!previa) return
    futuro.current.push(actualRef.current)
    horasFuturo.current.push(ahora.current)
    ahora.current = horasPasado.current.pop() ?? Date.now()
    actualRef.current = previa
    cambiarRef.current(previa)
    refrescar()
  }, [])

  const rehacer = useCallback(() => {
    const siguiente = futuro.current.pop()
    if (!siguiente) return
    pasado.current.push(actualRef.current)
    horasPasado.current.push(ahora.current)
    ahora.current = horasFuturo.current.pop() ?? Date.now()
    actualRef.current = siguiente
    cambiarRef.current(siguiente)
    refrescar()
  }, [])

  const pasos = useCallback(
    () => ({
      timelines: [...pasado.current, actualRef.current, ...[...futuro.current].reverse()],
      cuando: [...horasPasado.current, ahora.current, ...[...horasFuturo.current].reverse()],
      actual: pasado.current.length
    }),
    []
  )

  const irA = useCallback((indice: number) => {
    // Un paso a la vez: así el futuro y el pasado quedan bien ordenados para seguir deshaciendo o rehaciendo.
    let actual = pasado.current.length
    while (actual > indice && pasado.current.length) {
      const previa = pasado.current.pop()!
      futuro.current.push(actualRef.current)
      horasFuturo.current.push(ahora.current)
      ahora.current = horasPasado.current.pop() ?? Date.now()
      actualRef.current = previa
      actual--
    }
    while (actual < indice && futuro.current.length) {
      const siguiente = futuro.current.pop()!
      pasado.current.push(actualRef.current)
      horasPasado.current.push(ahora.current)
      ahora.current = horasFuturo.current.pop() ?? Date.now()
      actualRef.current = siguiente
      actual++
    }
    cambiarRef.current(actualRef.current)
    refrescar()
  }, [])

  return {
    aplicar,
    reemplazar,
    deshacer,
    rehacer,
    puedeDeshacer: pasado.current.length > 0,
    puedeRehacer: futuro.current.length > 0,
    pasos,
    irA
  }
}

export interface Reproductor {
  /** El `<video>` que se ve y suena ahora (uno de los dos de `videos`). */
  videoRef: React.RefObject<HTMLVideoElement | null>
  /** Los dos `<video>` del monitor: mientras uno suena, el otro ya se coloca en el clip que sigue (sin pausa en el corte). */
  videos: [React.RefObject<HTMLVideoElement | null>, React.RefObject<HTMLVideoElement | null>]
  /** Cuál de los dos se ve ahora. */
  activo: 0 | 1
  tiempo: number
  reproduciendo: boolean
  /** La imagen que se ve ahora (clip de imagen), o null si es video. */
  imagen: string | null
  alternar: () => void
  pausar: () => void
  buscar: (t: number) => void
  /** Para el `<video>`: eventos que mantienen el estado al día. */
  eventos: {
    onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void
  }
}

/** Cómo se ve cada fuente de la timeline: su URL y si es video o imagen. */
export type FuentesVista = Record<string, { url: string; tipo: 'video' | 'imagen' }>

/**
 * Reproduce la timeline sin renderizar. El reloj es la timeline: `tiempo` está en segundos
 * de timeline. Los clips de video usan un solo `<video>` que cambia de archivo cuando el
 * clip es de otra fuente; los de imagen se ven en una capa encima y avanzan con su propio reloj.
 */
export function useReproductor(timeline: Timeline, clave: string, fuentes: FuentesVista): Reproductor {
  const refA = useRef<HTMLVideoElement | null>(null)
  const refB = useRef<HTMLVideoElement | null>(null)
  const activoRef = useRef<0 | 1>(0)
  const [activo, setActivo] = useState<0 | 1>(0)
  // El `<video>` que se ve; siempre es uno de los dos.
  const videoRef = useMemo(
    () => ({ get current() { return (activoRef.current === 0 ? refA : refB).current } }) as React.RefObject<HTMLVideoElement | null>,
    []
  )
  const otroVideo = () => (activoRef.current === 0 ? refB : refA).current
  const [tiempo, setTiempo] = useState(0)
  const [reproduciendo, setReproduciendo] = useState(false)
  const [imagen, setImagen] = useState<string | null>(null)
  const tlRef = useRef(timeline)
  tlRef.current = timeline
  const fuentesRef = useRef(fuentes)
  fuentesRef.current = fuentes
  const tiempoRef = useRef(0)
  const indiceRef = useRef(0)
  const jugando = useRef(false)
  /** Lo que tiene cargado cada `<video>`. */
  const srcDe = useRef<[string | null, string | null]>([null, null])
  /** Lo cargado en el que se ve; asignarle null olvida los dos (hay que volver a cargar). */
  const srcActual = useMemo(
    () => ({
      get current(): string | null { return srcDe.current[activoRef.current] },
      set current(v: string | null) { if (v === null) srcDe.current = [null, null]; else srcDe.current[activoRef.current] = v }
    }),
    []
  )
  /** Para qué tramo está colocado el segundo `<video>` (la clave de `claveDe`). */
  const preparado = useRef<string | null>(null)
  /** Segundo de fuente a buscar en cuanto cargue el archivo nuevo. */
  const pendiente = useRef<number | null>(null)

  const fuenteDe = (f: string) => fuentesRef.current[f] ?? fuentesRef.current.principal

  const colocar = useCallback((t: number) => {
    const tl = tlRef.current
    const total = duracionTimeline(tl)
    const destino = Math.min(Math.max(0, t), total)
    tiempoRef.current = destino
    setTiempo(destino)
    const u = ubicar(tl, destino)
    const video = videoRef.current
    if (!u) return
    indiceRef.current = u.indice
    const f = fuenteDe(u.clip.fuente)
    if (!f) return
    if (f.tipo === 'imagen') {
      video?.pause()
      setImagen(f.url)
      return
    }
    setImagen(null)
    if (!video) return
    if (srcActual.current !== f.url) {
      // Otro archivo: se carga y, al tener sus metadatos, se busca el segundo (y suena si tocaba).
      srcActual.current = f.url
      pendiente.current = u.tFuente
      video.src = f.url
      return
    }
    if (Math.abs(video.currentTime - u.tFuente) > 0.02) video.currentTime = u.tFuente
    if (jugando.current && video.paused) void video.play().catch(() => {})
  }, [])

  const detener = useCallback(() => {
    jugando.current = false
    setReproduciendo(false)
    videoRef.current?.pause()
    otroVideo()?.pause()
  }, [])

  const alternar = useCallback(() => {
    if (jugando.current) {
      detener()
      return
    }
    const total = duracionTimeline(tlRef.current)
    if (total <= 0) return
    jugando.current = true
    setReproduciendo(true)
    colocar(tiempoRef.current >= total - 0.05 ? 0 : tiempoRef.current)
  }, [colocar, detener])

  // Al cambiar de proyecto, el cabezal vuelve al principio.
  useEffect(() => {
    detener()
    srcActual.current = null
    colocar(0)
  }, [clave, colocar, detener])

  // Una edición mueve lo que hay bajo el cabezal: el monitor enseña el cuadro nuevo.
  useEffect(() => {
    colocar(tiempoRef.current)
  }, [timeline, colocar])

  // Si cambia la URL de una fuente (llega el proxy), se vuelve a cargar.
  const firmaFuentes = Object.entries(fuentes).map(([k, v]) => `${k}=${v.url}`).join('|')
  useEffect(() => {
    srcActual.current = null
    colocar(tiempoRef.current)
  }, [firmaFuentes, colocar])

  // El reloj de reproducción.
  useEffect(() => {
    if (!reproduciendo) return
    let cuadro = 0
    let antes = performance.now()
    const claveDe = (t: ReturnType<typeof tramos>[number], idx: number) => `${idx}|${fuenteDe(t.clip.fuente)?.url}|${t.clip.entrada}`
    // El segundo <video> va a la entrada del clip que sigue mientras suena este: en el corte solo se cambia de uno a otro.
    const preparar = (lista: ReturnType<typeof tramos>, idx: number) => {
      const sig = lista[idx + 1]
      const otro = otroVideo()
      const f = sig ? fuenteDe(sig.clip.fuente) : undefined
      if (!sig || !otro || !f || f.tipo !== 'video') return
      const clave = claveDe(sig, idx + 1)
      const i = 1 - activoRef.current
      if (preparado.current === clave && srcDe.current[i] === f.url) return
      preparado.current = clave
      otro.pause()
      otro.muted = true
      if (srcDe.current[i] !== f.url) {
        srcDe.current[i] = f.url
        otro.src = f.url
      }
      const ir = () => {
        otro.currentTime = sig.clip.entrada
      }
      if (otro.readyState >= 1) ir()
      else otro.addEventListener('loadedmetadata', ir, { once: true })
    }
    const cambiarAlPreparado = (lista: ReturnType<typeof tramos>, sig: ReturnType<typeof tramos>[number]): boolean => {
      const viejo = videoRef.current
      const otro = otroVideo()
      const f = fuenteDe(sig.clip.fuente)
      const i = 1 - activoRef.current
      if (!viejo || !otro || f?.tipo !== 'video') return false
      if (preparado.current !== claveDe(sig, indiceRef.current + 1) || srcDe.current[i] !== f.url) return false
      if (otro.readyState < 2 || otro.seeking || Math.abs(otro.currentTime - sig.clip.entrada) > 0.1) return false
      otro.muted = viejo.muted
      otro.volume = viejo.volume
      otro.playbackRate = velocidadEnFuente(sig.clip, sig.clip.entrada)
      void otro.play().catch(() => {})
      viejo.pause()
      activoRef.current = i as 0 | 1
      setActivo(activoRef.current)
      preparado.current = null
      setImagen(null)
      return true
    }
    const siguiente = (lista: ReturnType<typeof tramos>, fin: number) => {
      const sig = lista[indiceRef.current + 1]
      if (!sig) {
        detener()
        tiempoRef.current = fin
        setTiempo(fin)
        return false
      }
      const tramoAhora = lista[indiceRef.current]
      const video = videoRef.current
      if (video && cambiarAlPreparado(lista, sig)) {
        // Sin pausa: el otro <video> ya estaba en su sitio.
        indiceRef.current += 1
        tiempoRef.current = sig.inicio
      } else if (video && tramoAhora && sig.clip.fuente === tramoAhora.clip.fuente && fuenteDe(sig.clip.fuente)?.tipo === 'video') {
        // Mismo archivo de video: basta con saltar (y si sigue justo donde va, ni eso).
        indiceRef.current += 1
        if (Math.abs(video.currentTime - sig.clip.entrada) > 0.05) video.currentTime = sig.clip.entrada
        tiempoRef.current = sig.inicio
      } else {
        colocar(sig.inicio)
      }
      return true
    }
    const paso = (ahora: number) => {
      const dt = (ahora - antes) / 1000
      antes = ahora
      const lista = tramos(tlRef.current)
      const tramo = lista[indiceRef.current]
      if (!tramo) {
        detener()
        return
      }
      const f = fuenteDe(tramo.clip.fuente)
      if (f?.tipo === 'imagen') {
        tiempoRef.current = Math.min(tramo.fin, tiempoRef.current + dt)
        if (tiempoRef.current >= tramo.fin - 0.005 && !siguiente(lista, tramo.fin)) return
      } else {
        const video = videoRef.current
        if (video && pendiente.current === null) {
          // Fin del clip: llegó a su salida, el archivo se acabó, o se quedó quieto justo antes del final
          // (la pista de video de un archivo puede durar unas centésimas menos que el archivo).
          const casiAlFinal = video.currentTime >= tramo.clip.salida - 0.12
          if (video.currentTime >= tramo.clip.salida - 0.015 || video.ended || (casiAlFinal && video.paused)) {
            if (!siguiente(lista, tramo.fin)) return
          } else if (video.currentTime >= tramo.clip.entrada - 0.05) {
            tiempoRef.current = tramo.inicio + clipEnFuente(tramo.clip, Math.max(tramo.clip.entrada, video.currentTime))
          }
          // Cámara lenta o rápida: el video corre a la velocidad del clip (con rampa, la de este momento).
          const vel = velocidadEnFuente(tramo.clip, video.currentTime)
          if (Math.abs(video.playbackRate - vel) > 0.005) video.playbackRate = vel
          preparar(lista, indiceRef.current)
        }
      }
      setTiempo(tiempoRef.current)
      cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [reproduciendo, colocar, detener])

  return {
    videoRef,
    videos: [refA, refB],
    activo,
    tiempo,
    reproduciendo,
    imagen,
    alternar,
    pausar: detener,
    buscar: colocar,
    eventos: {
      onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = videoRef.current
        // El de reserva carga por su cuenta (lo coloca `preparar`).
        if (!video || e.currentTarget !== video) return
        if (pendiente.current !== null) {
          video.currentTime = pendiente.current
          pendiente.current = null
        }
        if (jugando.current) void video.play().catch(() => {})
      }
    }
  }
}

/** Cuánto baja la música mientras hay voz (lo mismo que hace el render). */
export const DUCKING_FACTOR = 0.25
/** Fundido de salida de la música al final de la edición, en segundos. */
export const FUNDIDO_MUSICA = 1.5

/**
 * La música de la timeline en el monitor: un `<audio>` que sigue al reloj de la
 * timeline (se repite si es corta), baja mientras hay voz si `ducking` y se funde al final.
 */
export function useMusica(
  timeline: Timeline,
  reproductor: Reproductor,
  transcript: TranscriptSegment[] | undefined
): React.RefObject<HTMLAudioElement | null> {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const musica = timeline.musica
  // La voz que baja la música: lo que se dice en los clips y la narración puesta frase a frase.
  const voz = useMemo(
    () => (musica?.ducking ? [...vozEnTimeline(timeline, transcript), ...tramosDeVoces(timeline)] : []),
    [timeline, transcript, musica?.ducking]
  )
  const total = duracionTimeline(timeline)
  const { tiempo, reproduciendo } = reproductor
  // El trozo de música que suena en el cabezal (sin cortar, uno de todo el video).
  const trozos = useMemo(() => tramosMusica(timeline), [timeline])
  const trozo = trozos.find((t) => tiempo >= t.inicio && tiempo < t.inicio + t.duracion)

  // Volumen: el de la pista, bajado con voz, y fundido en el último tramo.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !musica) return
    const hablando = voz.some((v) => tiempo >= v.inicio - 0.1 && tiempo < v.fin + 0.25)
    const fundido = Math.max(0, Math.min(1, (total - tiempo) / FUNDIDO_MUSICA))
    audio.volume = Math.max(0, Math.min(1, musica.volumen * (hablando ? DUCKING_FACTOR : 1) * fundido))
  }, [tiempo, voz, musica, total])

  // Arranca, para y se corrige si se desvía del reloj de la timeline. Fuera de sus trozos, calla.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !musica) return
    if (!reproduciendo || !trozo) {
      audio.pause()
      return
    }
    const largo = audio.duration
    const propio = (trozo.desde ?? 0) + (tiempo - trozo.inicio)
    const esperado = Number.isFinite(largo) && largo > 0 ? propio % largo : propio
    if (Math.abs(audio.currentTime - esperado) > 0.3) audio.currentTime = esperado
    if (audio.paused) void audio.play().catch(() => {})
  }, [reproduciendo, tiempo, musica, trozo])

  return audioRef
}

/**
 * La narración en el monitor: un `<audio>` que suena la frase que toca en el segundo del
 * cabezal y sigue al reloj de la timeline. `urlDe` da la URL de cada archivo del proyecto.
 */
export function useVoces(timeline: Timeline, reproductor: Reproductor, urlDe: (archivo: string) => string): React.RefObject<HTMLAudioElement | null> {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const actual = useRef<string | null>(null)
  const { tiempo, reproduciendo } = reproductor
  const voces = timeline.voces

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const frase = voces?.find((v) => tiempo >= v.inicio && tiempo < v.inicio + v.duracion)
    if (!frase) {
      if (!audio.paused) audio.pause()
      return
    }
    const esperado = tiempo - frase.inicio + (frase.desde ?? 0)
    if (actual.current !== frase.archivo) {
      actual.current = frase.archivo
      audio.src = urlDe(frase.archivo)
      audio.currentTime = esperado
    } else if (Math.abs(audio.currentTime - esperado) > 0.3) {
      audio.currentTime = esperado
    }
    audio.volume = Math.max(0, Math.min(1, frase.volumen ?? 1))
    if (reproduciendo) {
      if (audio.paused) void audio.play().catch(() => {})
    } else if (!audio.paused) audio.pause()
  }, [tiempo, reproduciendo, voces, urlDe])

  return audioRef
}

/**
 * Lleva un `<video>` o `<audio>` suelto (una capa encima, un efecto de sonido) al segundo que le
 * toca mientras está en su tramo: `esperado` es su segundo propio, o null fuera de su tramo.
 */
export function useSincronizar(
  ref: React.RefObject<HTMLMediaElement | null>,
  esperado: number | null,
  reproduciendo: boolean,
  volumen = 1
): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (esperado === null) {
      if (!el.paused) el.pause()
      return
    }
    if (Math.abs(el.currentTime - esperado) > 0.25) {
      try {
        el.currentTime = esperado
      } catch {
        // Aún sin metadatos: se ajusta en la siguiente vuelta.
      }
    }
    el.volume = Math.max(0, Math.min(1, volumen))
    if (reproduciendo) {
      if (el.paused) void el.play().catch(() => {})
    } else if (!el.paused) el.pause()
  }, [ref, esperado, reproduciendo, volumen])
}

/** El tamaño de un elemento, al día cuando cambia. */
export function useTamano(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } | null {
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight })
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return tam
}
