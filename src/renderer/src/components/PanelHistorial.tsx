import { useMemo, useRef } from 'react'
import { describirRetoques } from '../../../shared/retoques'
import { duracionTimeline, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'

/**
 * El historial (como el panel «Historial» de Premiere): cada paso de la edición con lo que cambió; un clic vuelve a
 * ese momento (y desde ahí se puede rehacer o seguir editando).
 */

/** Lo que cambió entre dos pasos, en una frase. */
function queCambio(antes: Timeline, despues: Timeline, nombreDe: (fuente: string) => string): string {
  // Los clips, dicho corto (el resumen para el agente los lista todos).
  if (JSON.stringify(antes.clips) !== JSON.stringify(despues.clips)) {
    const n = despues.clips.length - antes.clips.length
    if (n === 1 && antes.clips.length) return 'Dividió un clip'
    if (n > 0) return n === 1 ? 'Añadió un clip' : `Añadió ${n} clips`
    if (n < 0) return n === -1 ? 'Quitó un clip' : `Quitó ${-n} clips`
    const cambiados = despues.clips.filter((c, i) => JSON.stringify(c) !== JSON.stringify(antes.clips[i])).length
    return cambiados === 1 ? 'Cambió un clip' : `Cambió ${cambiados} clips`
  }
  const dicho = describirRetoques(antes, despues, { medio: (f) => `«${nombreDe(f)}»`, archivo: (r) => r.split('/').pop() ?? r })
  if (dicho.length) return dicho[0].replace(/\s*\(archivo:[^)]*\)/, '') + (dicho.length > 1 ? ` (y ${dicho.length - 1} más)` : '')
  // Lo que el resumen no cuenta (marcas, capas de ajuste, multicámara, pistas…).
  if ((antes.marcadores?.length ?? 0) !== (despues.marcadores?.length ?? 0)) return (despues.marcadores?.length ?? 0) > (antes.marcadores?.length ?? 0) ? 'Puso una marca' : 'Quitó una marca'
  if (JSON.stringify(antes.marcadores) !== JSON.stringify(despues.marcadores)) return 'Cambió una marca'
  if (JSON.stringify(antes.ajustesCapa) !== JSON.stringify(despues.ajustesCapa)) return 'Cambió una capa de ajuste'
  if (JSON.stringify(antes.multicam) !== JSON.stringify(despues.multicam)) return 'Cambió la multicámara'
  if (JSON.stringify(antes.pistas) !== JSON.stringify(despues.pistas)) return 'Cambió una pista (mezclador, ocultar o bloquear)'
  const d = duracionTimeline(despues) - duracionTimeline(antes)
  return Math.abs(d) > 0.05 ? `Cambió la duración (${d > 0 ? '+' : ''}${d.toFixed(1)} s)` : 'Cambió la edición'
}

export function PanelHistorial({ historial, nombreDe, version }: { historial: Historial; nombreDe: (fuente: string) => string; version: unknown }) {
  // `version` cambia con cada paso: así la lista se recalcula.
  const pasos = useRef(historial.pasos)
  pasos.current = historial.pasos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { timelines, cuando, actual } = useMemo(() => pasos.current(), [version])
  // Los nombres por referencia: así la lista no se recalcula en cada cuadro mientras se reproduce.
  const nombres = useRef(nombreDe)
  nombres.current = nombreDe
  const filas = useMemo(
    () => timelines.map((t, i) => (i === 0 ? 'Cuando abriste el proyecto' : queCambio(timelines[i - 1], t, (f) => nombres.current(f)))),
    [timelines]
  )
  const hora = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return (
    <>
      <span className="ed-seccion">Historial ({timelines.length - 1} pasos)</span>
      <p className="tl-dim">Toca un paso para volver a ese momento. Desde ahí puedes rehacer, o seguir editando (lo de después se pierde).</p>
      <ol className="historial" reversed>
        {[...filas.keys()].reverse().map((i) => (
          <li key={i}>
            <button
              className={`historial-paso ${i === actual ? 'is-actual' : ''} ${i > actual ? 'is-futuro' : ''}`}
              onClick={() => historial.irA(i)}
              aria-current={i === actual ? 'step' : undefined}
              title={i === actual ? 'Así está ahora' : i > actual ? 'Deshecho: tócalo para rehacer hasta aquí' : 'Volver a este momento'}
            >
              <span>{filas[i]}</span>
              <small>{hora(cuando[i])}</small>
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}
