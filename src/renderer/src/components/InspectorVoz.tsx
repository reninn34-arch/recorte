import { useEffect, useRef, useState } from 'react'
import { VOCES_GEMINI } from '../../../shared/creacion'
import { anadirVoz, borrarVoz, cambiarVoz, type Timeline, type VozTL } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/** Lo que devuelve Recorte al generar una frase: su audio ya está en la carpeta del proyecto. */
export type FraseGenerada = { archivo: string; duracion: number; texto: string; voz: string }
export type GenerarVoz = (texto: string, voz?: string) => Promise<FraseGenerada | null>

/**
 * La narración a mano, sin pasar por el agente (no gasta sus créditos): cambiar lo que dice
 * una frase y volver a generarla, cambiarle la voz, cambiar la voz de todas o añadir una
 * frase nueva en el cabezal. Cada cambio es un paso que se deshace con Ctrl+Z.
 */
export function InspectorVoz({
  frase,
  timeline,
  tiempo,
  historial,
  generar,
  onElegir,
  onCerrar
}: {
  /** La frase elegida; sin ella, el panel sirve para añadir una nueva en el cabezal. */
  frase?: VozTL
  timeline: Timeline
  tiempo: number
  historial: Historial
  generar: GenerarVoz
  onElegir: (id: string | null) => void
  onCerrar?: () => void
}) {
  const [texto, setTexto] = useState(frase?.texto ?? '')
  const [voz, setVoz] = useState(frase?.voz ?? timeline.voces?.find((v) => v.voz)?.voz ?? 'Kore')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const ajustando = useRef(false)

  // Al elegir otra frase, el panel enseña la suya.
  useEffect(() => {
    setTexto(frase?.texto ?? '')
    if (frase?.voz) setVoz(frase.voz)
  }, [frase?.id])

  const cambio = Boolean(frase) && (texto.trim() !== (frase?.texto ?? '').trim() || voz !== (frase?.voz ?? voz))
  const otras = (timeline.voces ?? []).filter((v) => v.voz !== voz || !v.voz).length

  async function regenerar() {
    if (!frase || !texto.trim() || ocupado) return
    setOcupado('Generando la frase')
    const r = await generar(texto.trim(), voz)
    setOcupado(null)
    if (r) historial.aplicar(cambiarVoz(timeline, frase.id, { archivo: r.archivo, duracion: r.duracion, texto: r.texto, voz: r.voz }))
  }

  async function nueva() {
    if (!texto.trim() || ocupado) return
    setOcupado('Generando la frase')
    const r = await generar(texto.trim(), voz)
    setOcupado(null)
    if (!r) return
    const { timeline: con, id } = anadirVoz(timeline, { inicio: tiempo, duracion: r.duracion, archivo: r.archivo, texto: r.texto, voz: r.voz })
    if (con === timeline) return
    historial.aplicar(con)
    onElegir(id)
  }

  /** Todas las frases con la voz elegida: una por una, y al final un solo paso de deshacer. */
  async function todas() {
    const lista = (timeline.voces ?? []).filter((v) => v.texto.trim())
    if (!lista.length || ocupado) return
    let tl = timeline
    for (const [i, v] of lista.entries()) {
      setOcupado(`Cambiando la voz: frase ${i + 1} de ${lista.length}`)
      const r = await generar(v.texto, voz)
      if (!r) break
      tl = cambiarVoz(tl, v.id, { archivo: r.archivo, duracion: r.duracion, texto: r.texto, voz: r.voz })
    }
    setOcupado(null)
    if (tl !== timeline) historial.aplicar(tl)
  }

  return (
    <div className="tl-voz-panel">
      <Icon name="music" size={14} />
      <input
        className="tl-texto-input"
        value={texto}
        autoFocus={!frase}
        placeholder={frase ? 'Lo que dice esta frase' : 'Escribe lo que tiene que decir la voz'}
        disabled={Boolean(ocupado)}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void (frase ? regenerar() : nueva())
        }}
      />
      <select value={voz} disabled={Boolean(ocupado)} onChange={(e) => setVoz(e.target.value)} title="La voz de Gemini que la dice">
        {VOCES_GEMINI.map((v) => (
          <option key={v.id} value={v.id}>
            {v.id} · {v.descripcion}
          </option>
        ))}
      </select>
      {frase ? (
        <>
          <button className="btn small primary" disabled={!cambio || !texto.trim() || Boolean(ocupado)} onClick={() => void regenerar()} title="Vuelve a generar solo esta frase, con este texto y esta voz">
            Regenerar
          </button>
          <label className="tl-ajuste en-linea">
            <span>
              Volumen <b>{Math.round((frase.volumen ?? 1) * 100)} %</b>
            </span>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={frase.volumen ?? 1}
              onPointerDown={() => (ajustando.current = false)}
              onFocus={() => (ajustando.current = false)}
              onChange={(e) => {
                // El primer movimiento abre un paso de deshacer y los demás lo amplían.
                const nueva = cambiarVoz(timeline, frase.id, { volumen: Number(e.target.value) })
                if (ajustando.current) historial.reemplazar(nueva)
                else historial.aplicar(nueva)
                ajustando.current = true
              }}
            />
          </label>
        </>
      ) : (
        <button className="btn small primary" disabled={!texto.trim() || Boolean(ocupado)} onClick={() => void nueva()}>
          Generar aquí
        </button>
      )}
      {ocupado ? (
        <span className="tl-dim">{ocupado}…</span>
      ) : (
        <>
          {frase && (
            <span className="tl-dim">
              {frase.duracion.toFixed(1)} s{frase.voz ? ` · ${frase.voz}` : ''}
            </span>
          )}
          <span className="tl-flex" />
          {otras > 0 && (timeline.voces?.length ?? 0) > 1 && (
            <button className="btn small ghost" onClick={() => void todas()} title={`Vuelve a generar todas las frases con la voz ${voz}`}>
              Toda la voz con {voz}
            </button>
          )}
          {frase ? (
            <button
              className="btn small ghost"
              onClick={() => {
                historial.aplicar(borrarVoz(timeline, frase.id))
                onElegir(null)
              }}
            >
              <Icon name="trash" size={14} /> Quitar
            </button>
          ) : (
            onCerrar && (
              <button className="btn small ghost" onClick={onCerrar}>
                Cerrar
              </button>
            )
          )}
        </>
      )}
    </div>
  )
}
