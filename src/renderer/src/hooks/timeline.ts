import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { duracionTimeline, tramos, tramosDeVoces, ubicar, vozEnTimeline, type Timeline , velocidadDe } from '../../../shared/timeline'
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
}

/**
 * Deshacer y rehacer sobre la timeline. Cada `aplicar` es un paso; un arrastre entero
 * cuenta como uno solo porque la timeline solo se aplica al soltar.
 * `clave` (el id del proyecto) reinicia el historial al cambiar de proyecto.
 */
export function useHistorial(actual: Timeline, onCambiar: (t: Timeline) => void, clave: string): Historial {
  const pasado = useRef<Timeline[]>([])
  const futuro = useRef<Timeline[]>([])
  const actualRef = useRef(actual)
  actualRef.current = actual
  const cambiarRef = useRef(onCambiar)
  cambiarRef.current = onCambiar
  const [, refrescar] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    pasado.current = []
    futuro.current = []
    refrescar()
  }, [clave])

  const aplicar = useCallback((nueva: Timeline) => {
    if (nueva === actualRef.current) return
    pasado.current.push(actualRef.current)
    if (pasado.current.length > LIMITE_HISTORIAL) pasado.current.shift()
    futuro.current = []
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
    actualRef.current = previa
    cambiarRef.current(previa)
    refrescar()
  }, [])

  const rehacer = useCallback(() => {
    const siguiente = futuro.current.pop()
    if (!siguiente) return
    pasado.current.push(actualRef.current)
    actualRef.current = siguiente
    cambiarRef.current(siguiente)
    refrescar()
  }, [])

  return {
    aplicar,
    reemplazar,
    deshacer,
    rehacer,
    puedeDeshacer: pasado.current.length > 0,
    puedeRehacer: futuro.current.length > 0
  }
}

export interface Reproductor {
  videoRef: React.RefObject<HTMLVideoElement | null>
  tiempo: number
  reproduciendo: boolean
  /** La imagen que se ve ahora (clip de imagen), o null si es video. */
  imagen: string | null
  alternar: () => void
  pausar: () => void
  buscar: (t: number) => void
  /** Para el `<video>`: eventos que mantienen el estado al día. */
  eventos: {
    onLoadedMetadata: () => void
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
  const videoRef = useRef<HTMLVideoElement | null>(null)
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
  const srcActual = useRef<string | null>(null)
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
      // Mismo archivo de video: basta con saltar.
      if (video && tramoAhora && sig.clip.fuente === tramoAhora.clip.fuente && fuenteDe(sig.clip.fuente)?.tipo === 'video') {
        indiceRef.current += 1
        video.currentTime = sig.clip.entrada
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
            tiempoRef.current = tramo.inicio + Math.max(0, video.currentTime - tramo.clip.entrada) / velocidadDe(tramo.clip)
          }
          // Cámara lenta o rápida: el video corre a la velocidad del clip.
          if (Math.abs(video.playbackRate - velocidadDe(tramo.clip)) > 0.001) video.playbackRate = velocidadDe(tramo.clip)
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
    tiempo,
    reproduciendo,
    imagen,
    alternar,
    pausar: detener,
    buscar: colocar,
    eventos: {
      onLoadedMetadata: () => {
        const video = videoRef.current
        if (!video) return
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

  // Volumen: el de la pista, bajado con voz, y fundido en el último tramo.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !musica) return
    const hablando = voz.some((v) => tiempo >= v.inicio - 0.1 && tiempo < v.fin + 0.25)
    const fundido = Math.max(0, Math.min(1, (total - tiempo) / FUNDIDO_MUSICA))
    audio.volume = Math.max(0, Math.min(1, musica.volumen * (hablando ? DUCKING_FACTOR : 1) * fundido))
  }, [tiempo, voz, musica, total])

  // Arranca, para y se corrige si se desvía del reloj de la timeline.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !musica) return
    if (!reproduciendo) {
      audio.pause()
      return
    }
    const largo = audio.duration
    const esperado = Number.isFinite(largo) && largo > 0 ? tiempo % largo : tiempo
    if (Math.abs(audio.currentTime - esperado) > 0.3) audio.currentTime = esperado
    if (audio.paused) void audio.play().catch(() => {})
  }, [reproduciendo, tiempo, musica])

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
    const esperado = tiempo - frase.inicio
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
