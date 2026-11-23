import { useEffect, useRef, useState } from 'react'
import { NOMBRE_PROBLEMA, type ProblemaAudio } from '../../../shared/audio'
import { aplicarOperaciones } from '../../../shared/chat'
import { duracionesDeMedios, type Timeline } from '../../../shared/timeline'
import type { Project } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/**
 * «Revisar el audio»: mide el sonido de la edición y lista lo que suena mal (una palabra que el corte se come,
 * un corte seco, respiraciones fuertes, ruido, silencios largos, saturación), cada cosa con «Ir» y, si se puede,
 * «Arreglar». Todo arreglo es un paso que se deshace con Ctrl+Z.
 */
export function PanelAudio({
  proyecto,
  timeline,
  historial,
  onBuscar,
  onAviso
}: {
  proyecto: Project
  timeline: Timeline
  historial: Historial
  onBuscar: (t: number) => void
  onAviso: (t: string) => void
}) {
  const [problemas, setProblemas] = useState<ProblemaAudio[] | null>(null)
  const [revisando, setRevisando] = useState(false)
  const [arreglando, setArreglando] = useState<string | null>(null)
  // Lo revisado es de una timeline: si cambia a mano, la lista vieja ya no vale.
  const revisada = useRef<Timeline | null>(null)
  useEffect(() => {
    if (problemas && revisada.current && revisada.current !== timeline && !arreglando) setProblemas(null)
  }, [timeline, problemas, arreglando])

  const revisar = async (tl: Timeline = timeline) => {
    setRevisando(true)
    try {
      const r = await window.recorte.revisarAudio(proyecto.id, tl)
      revisada.current = tl
      setProblemas(r)
      return r
    } catch (e) {
      onAviso(`No pude revisar el audio: ${e instanceof Error ? e.message : String(e)}`)
      return null
    } finally {
      setRevisando(false)
    }
  }

  /** Aplica un arreglo sobre `tl` y devuelve la timeline nueva (sin guardarla). */
  const aplicarUno = async (tl: Timeline, x: ProblemaAudio): Promise<Timeline> => {
    const a = x.arreglo
    if (!a) return tl
    if (a.tipo === 'ops') {
      return aplicarOperaciones(tl, a.ops, { duracionFuente: proyecto.source.duration, transcript: proyecto.transcript, medios: duracionesDeMedios(proyecto.medios) }).timeline
    }
    const v = tl.voces?.find((y) => y.id === a.voz)
    // Una frase dividida o recortada se arregla en su archivo entero: rehacerla rompería sus pedazos.
    if (!v || v.desde !== undefined || v.largo !== undefined) return tl
    const r = await window.recorte.arreglarVoz(proyecto.id, v.archivo, a.accion, a.ventanas)
    return { ...tl, voces: tl.voces!.map((y) => (y.id === v.id ? { ...y, archivo: r.archivo, duracion: r.duracion } : y)) }
  }

  const arreglar = async (lista: ProblemaAudio[]) => {
    const conArreglo = lista.filter((x) => x.arreglo)
    if (!conArreglo.length) return
    setArreglando(lista.length === 1 ? lista[0].id : 'todo')
    try {
      // Los cambios de clips van del último al primero: así un borde que se alarga no corre a los demás.
      const orden = [...conArreglo].sort((a, b) => b.t - a.t)
      let tl = timeline
      for (const x of orden) tl = await aplicarUno(tl, x)
      if (tl !== timeline) historial.aplicar(tl)
      onAviso(conArreglo.length === 1 ? `${conArreglo[0].etiqueta ?? 'Arreglado'}. Ctrl+Z lo deshace.` : `Arreglé ${conArreglo.length} cosas del audio. Ctrl+Z lo deshace todo junto.`)
      await revisar(tl)
    } catch (e) {
      onAviso(`No pude arreglarlo: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setArreglando(null)
    }
  }

  const arreglables = (problemas ?? []).filter((x) => x.arreglo)
  return (
    <>
      <span className="ed-seccion">Revisar el audio</span>
      <p className="tl-dim">Escucha la edición por ti: palabras que un corte se come, cortes secos, respiraciones fuertes, ruido de fondo y silencios largos.</p>
      <button className="btn small" onClick={() => void revisar()} disabled={revisando || !!arreglando}>
        <Icon name="volumen" size={13} /> {revisando ? 'Escuchando…' : problemas ? 'Volver a revisar' : 'Revisar el audio'}
      </button>
      {problemas && !problemas.length && <p className="audio-ok">Todo suena bien: ningún corte se come una palabra y no hay ruido ni respiraciones fuertes.</p>}
      {problemas && problemas.length > 0 && (
        <>
          <ul className="audio-lista">
            {problemas.map((x) => (
              <li key={x.id} className={`audio-item peso-${x.peso}`}>
                <div className="audio-item-texto">
                  <strong>{NOMBRE_PROBLEMA[x.tipo]}</strong>
                  <span>{x.texto}</span>
                </div>
                <div className="audio-item-botones">
                  <button className="btn small ghost" onClick={() => onBuscar(Math.max(0, x.t - 1))} title="Ir un segundo antes, para escucharlo">
                    Ir
                  </button>
                  {x.arreglo && (
                    <button className="btn small primary" disabled={!!arreglando} onClick={() => void arreglar([x])}>
                      {arreglando === x.id ? 'Arreglando…' : (x.etiqueta ?? 'Arreglar')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {arreglables.length > 1 && (
            <button className="btn small primary" disabled={!!arreglando} onClick={() => void arreglar(arreglables)}>
              {arreglando === 'todo' ? 'Arreglando…' : `Arreglar todo (${arreglables.length})`}
            </button>
          )}
        </>
      )}
    </>
  )
}
