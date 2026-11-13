import { useEffect, useRef, useState } from 'react'
import { cambiarPista, MAX_VOLUMEN_PISTA, PISTAS, type PistaId, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/**
 * El mezclador de audio (como el de pistas de Premiere): un fader por pista de audio, con su medidor de nivel, y el
 * medidor general. Los medidores escuchan lo que suena en el monitor: cada `<audio>`/`<video>` marcado con
 * `data-pista-audio`, ya con su volumen.
 */

export type Niveles = Partial<Record<PistaId | 'general', number>>
const PISTAS_AUDIO = PISTAS.filter((p) => p.audio)
/** De −60 dB (abajo) a +6 dB (arriba): lo que enseña cada medidor. */
const DB_MIN = -60
const DB_MAX = 6

/** dB de un nivel lineal (0 → −∞, que se enseña como el fondo del medidor). */
export function aDb(nivel: number): number {
  return nivel > 1e-5 ? 20 * Math.log10(nivel) : -Infinity
}
/** dB de un fader (1 = 0 dB). */
export function textoDb(v: number): string {
  if (v <= 0.001) return '−∞'
  const db = 20 * Math.log10(v)
  return `${db > 0.05 ? '+' : db < -0.05 ? '−' : ''}${Math.abs(db).toFixed(1)}`
}

let contexto: AudioContext | null = null
const fuentes = new WeakMap<HTMLMediaElement, AnalyserNode>()
const buffer = new Float32Array(1024)

/**
 * El analizador de un elemento: su sonido pasa por el contexto de audio (y sigue a la salida, así que se oye igual) y
 * por un analizador que lo mide después de su volumen. Solo se conecta con el contexto en marcha: conectado a uno
 * pausado, el elemento se quedaría mudo.
 */
function analizadorDe(el: HTMLMediaElement): AnalyserNode | null {
  const hecho = fuentes.get(el)
  if (hecho) return hecho
  try {
    contexto ??= new AudioContext()
    if (contexto.state !== 'running') {
      void contexto.resume()
      return null
    }
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 1024
    const fuente = contexto.createMediaElementSource(el)
    fuente.connect(contexto.destination)
    fuente.connect(analizador)
    fuentes.set(el, analizador)
    return analizador
  } catch {
    return null
  }
}

/** Los niveles (lineales, de pico) de cada pista y el general, mientras `activo`. */
export function useNiveles(activo: boolean): Niveles {
  const [niveles, setNiveles] = useState<Niveles>({})
  const caida = useRef<Niveles>({})
  useEffect(() => {
    if (!activo) {
      setNiveles({})
      return
    }
    let vivo = true
    let id = 0
    const medir = () => {
      if (!vivo) return
      const ahora: Niveles = {}
      for (const el of document.querySelectorAll<HTMLMediaElement>('[data-pista-audio]')) {
        const pista = el.dataset.pistaAudio as PistaId
        const f = analizadorDe(el)
        if (!f || el.paused) continue
        f.getFloatTimeDomainData(buffer)
        let pico = 0
        for (let i = 0; i < buffer.length; i++) pico = Math.max(pico, Math.abs(buffer[i]))
        const nivel = el.muted ? 0 : pico
        ahora[pista] = Math.max(ahora[pista] ?? 0, nivel)
      }
      ahora.general = Math.min(4, Object.values(ahora).reduce((s, v) => s + (v ?? 0), 0))
      // Sube al momento y baja despacio (como un medidor de verdad).
      const suave: Niveles = {}
      for (const k of ['general', ...PISTAS_AUDIO.map((p) => p.id)] as const) {
        suave[k] = Math.max(ahora[k] ?? 0, (caida.current[k] ?? 0) * 0.86)
      }
      caida.current = suave
      setNiveles(suave)
      id = window.setTimeout(medir, 50)
    }
    medir()
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [activo])
  return niveles
}

/** Un medidor vertical u horizontal: verde, amarillo desde −12 dB y rojo desde −3 dB. */
export function Medidor({ nivel, horizontal = false }: { nivel?: number; horizontal?: boolean }) {
  const db = aDb(nivel ?? 0)
  const fraccion = Number.isFinite(db) ? Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN))) : 0
  return (
    <span className={`medidor ${horizontal ? 'is-horizontal' : ''}`} title={Number.isFinite(db) ? `${db.toFixed(1)} dB` : 'Silencio'}>
      <span className="medidor-relleno" style={horizontal ? { width: `${fraccion * 100}%` } : { height: `${fraccion * 100}%` }} />
      {db > -0.5 && <span className="medidor-pico" />}
    </span>
  )
}

export function Mezclador({ timeline, historial, niveles, onCerrar }: { timeline: Timeline; historial: Historial; niveles: Niveles; onCerrar: () => void }) {
  const [borrador, setBorrador] = useState<Partial<Record<PistaId, number>>>({})
  return (
    <div className="mezclador" role="dialog" aria-label="Mezclador de audio">
      <div className="mezclador-cabeza">
        <span>Mezclador de audio</span>
        <button className="tl-boton" onClick={onCerrar} aria-label="Cerrar el mezclador" title="Cerrar">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="mezclador-canales">
        {PISTAS_AUDIO.map((p) => {
          const estado = timeline.pistas?.[p.id]
          const v = borrador[p.id] ?? estado?.volumen ?? 1
          return (
            <div key={p.id} className={`mezclador-canal ${estado?.oculta ? 'is-mudo' : ''}`}>
              <b>{textoDb(estado?.oculta ? 0 : v)}</b>
              <div className="mezclador-tira">
                <Medidor nivel={estado?.oculta ? 0 : niveles[p.id]} />
                <input
                  type="range"
                  className="mezclador-fader"
                  min={0}
                  max={MAX_VOLUMEN_PISTA}
                  step={0.01}
                  value={v}
                  aria-label={`Volumen de la pista ${p.nombre}`}
                  title={`Volumen de toda la pista ${p.nombre} (doble clic: 0 dB). Por encima de 0 dB solo se oye en el video exportado.`}
                  onChange={(e) => setBorrador((b) => ({ ...b, [p.id]: Number(e.target.value) }))}
                  onPointerUp={() => {
                    if (borrador[p.id] === undefined) return
                    historial.aplicar(cambiarPista(timeline, p.id, { volumen: borrador[p.id] }))
                    setBorrador((b) => ({ ...b, [p.id]: undefined }))
                  }}
                  onKeyUp={() => {
                    if (borrador[p.id] === undefined) return
                    historial.aplicar(cambiarPista(timeline, p.id, { volumen: borrador[p.id] }))
                    setBorrador((b) => ({ ...b, [p.id]: undefined }))
                  }}
                  onDoubleClick={() => historial.aplicar(cambiarPista(timeline, p.id, { volumen: 1 }))}
                />
              </div>
              <button
                className={`tl-pista-boton ${estado?.oculta ? 'is-on' : ''}`}
                onClick={() => historial.aplicar(cambiarPista(timeline, p.id, { oculta: !estado?.oculta }))}
                aria-pressed={Boolean(estado?.oculta)}
                aria-label={`${estado?.oculta ? 'Volver a oír' : 'Silenciar'} la pista ${p.nombre}`}
                title={`${estado?.oculta ? 'Volver a oír' : 'Silenciar'} la pista ${p.nombre}`}
              >
                <Icon name={estado?.oculta ? 'volumen-no' : 'volumen'} size={12} />
              </button>
              <span className="mezclador-nombre">{p.nombre}</span>
            </div>
          )
        })}
        <div className="mezclador-canal is-general">
          <b title="El pico de lo que suena ahora">{Number.isFinite(aDb(niveles.general ?? 0)) ? `${Math.round(aDb(niveles.general ?? 0))} dB` : '−∞'}</b>
          <div className="mezclador-tira">
            <Medidor nivel={niveles.general} />
          </div>
          <span className="mezclador-nombre">General</span>
        </div>
      </div>
    </div>
  )
}
