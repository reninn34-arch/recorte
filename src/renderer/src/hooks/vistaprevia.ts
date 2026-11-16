import { useEffect, useRef, useState } from 'react'
import type { Timeline } from '../../../shared/timeline'
import type { Project } from '../../../shared/types'
import { firmaProyecto, tramosVista, type TramoVista } from '../../../shared/vistaprevia'

export interface VistaPrevia {
  tramos: TramoVista[]
  /** Las claves de los tramos que ya tienen su video. */
  listas: Set<string>
}

/** Cuánto se espera sin editar ni reproducir antes de renderizar en segundo plano. */
const ESPERA_MS = 1500

/**
 * La vista previa renderizada (ver shared/vistaprevia.ts): qué tramos hay, cuáles ya están y, cuando el usuario no
 * reproduce ni edita, le pide al proceso principal que renderice los pesados que faltan (desde el cabezal).
 */
export function useVistaPrevia(proyecto: Project, timeline: Timeline, reproduciendo: boolean, tiempo: number): VistaPrevia | null {
  const [tramos, setTramos] = useState<TramoVista[]>([])
  const [listas, setListas] = useState<Set<string>>(() => new Set())
  const tiempoRef = useRef(tiempo)
  tiempoRef.current = tiempo
  const apagada = Boolean(proyecto.demo)
  const firma = firmaProyecto(proyecto)

  // Los tramos se calculan un momento después del último cambio (en una timeline larga cuesta).
  useEffect(() => {
    if (apagada) return
    const t = setTimeout(() => setTramos(tramosVista(timeline, firma)), 300)
    return () => clearTimeout(t)
  }, [timeline, firma, apagada])

  // Cuáles ya están hechos.
  useEffect(() => {
    if (apagada) return
    const claves = tramos.filter((t) => t.pesado).map((t) => t.clave)
    if (!claves.length) return
    let vivo = true
    void window.recorte.vistaExistentes(proyecto.id, claves).then((hechas) => {
      if (vivo) setListas(new Set(hechas))
    })
    return () => {
      vivo = false
    }
  }, [tramos, proyecto.id, apagada])

  useEffect(
    () =>
      window.recorte.onVistaLista((e) => {
        if (e.id === proyecto.id) setListas((antes) => new Set(antes).add(e.clave))
      }),
    [proyecto.id]
  )

  // En pausa y sin editar: se renderiza lo que falta. Al reproducir, se deja de empezar tramos nuevos.
  useEffect(() => {
    if (apagada || !tramos.some((t) => t.pesado && !listas.has(t.clave))) return
    if (reproduciendo) {
      void window.recorte.vistaPausar(proyecto.id)
      return
    }
    const t = setTimeout(() => void window.recorte.vistaPreparar(proyecto.id, timeline, tiempoRef.current), ESPERA_MS)
    return () => clearTimeout(t)
  }, [tramos, listas, reproduciendo, proyecto.id, timeline, apagada])

  return apagada ? null : { tramos, listas }
}
