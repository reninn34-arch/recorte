import { useMemo, useState } from 'react'
import { aplicarLimpieza, buscarLimpieza, MULETILLAS, type Limpieza } from '../../../shared/limpieza'
import type { Timeline } from '../../../shared/timeline'
import type { TranscriptSegment } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/** La limpieza automática de una toma hablada: silencios, muletillas y repeticiones, con un clic (y un solo deshacer). */
export function PanelLimpieza({ timeline, historial, transcript, onAviso }: { timeline: Timeline; historial: Historial; transcript?: TranscriptSegment[]; onAviso: (t: string) => void }) {
  const [l, setL] = useState<Limpieza>({ silencios: true, minimo: 0.7, muletillas: true, lista: MULETILLAS, repeticiones: true })
  const [texto, setTexto] = useState(MULETILLAS.join(', '))
  const hallado = useMemo(() => buscarLimpieza(timeline, transcript, l), [timeline, transcript, l])
  if (!transcript?.length) {
    return (
      <>
        <span className="ed-seccion">Limpieza automática</span>
        <p className="tl-dim">Transcribe el video y Recorte le quita los silencios, las muletillas y las palabras repetidas con un clic.</p>
      </>
    )
  }
  return (
    <>
      <span className="ed-seccion">Limpieza automática</span>
      <label className="tl-check">
        <input type="checkbox" checked={l.silencios} onChange={(e) => setL({ ...l, silencios: e.target.checked })} />
        Silencios de más de
        <input
          type="number"
          className="limpieza-num"
          min={0.3}
          max={5}
          step={0.1}
          value={l.minimo}
          onChange={(e) => setL({ ...l, minimo: Math.max(0.3, Number(e.target.value) || 0.7) })}
          aria-label="Lo que dura un silencio para quitarlo"
        />
        s <small className="tl-dim">({hallado.silencios})</small>
      </label>
      <label className="tl-check">
        <input type="checkbox" checked={l.muletillas} onChange={(e) => setL({ ...l, muletillas: e.target.checked })} />
        Muletillas <small className="tl-dim">({hallado.muletillas})</small>
      </label>
      {l.muletillas && (
        <input
          className="tl-texto-input"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => setL({ ...l, lista: texto.split(',').map((x) => x.trim()).filter(Boolean) })}
          title="Separadas por comas. Puedes sumar frases como «o sea» o palabras tuyas como «bueno»."
          aria-label="Las muletillas que se quitan"
        />
      )}
      <label className="tl-check">
        <input type="checkbox" checked={l.repeticiones} onChange={(e) => setL({ ...l, repeticiones: e.target.checked })} />
        Palabras repetidas («que que») <small className="tl-dim">({hallado.repeticiones})</small>
      </label>
      <button
        className="btn small primary"
        disabled={!hallado.tramos.length}
        onClick={() => {
          historial.aplicar(aplicarLimpieza(timeline, hallado.tramos))
          onAviso(`Listo: quité ${hallado.tramos.length} tramos (${hallado.segundos.toFixed(1)} s). Ctrl+Z lo deshace todo junto.`)
        }}
      >
        <Icon name="scissors" size={14} /> {hallado.tramos.length ? `Quitar ${hallado.tramos.length} tramos (${hallado.segundos.toFixed(1)} s)` : 'No hay nada que quitar'}
      </button>
    </>
  )
}
