import { useEffect, useRef, useState } from 'react'
import { VOCES_GEMINI } from '../../../shared/creacion'
import { anadirVoz, borrarVoz, cambiarVoz, type Timeline, type VozTL } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/** Lo que devuelve Recorte al generar una frase: su audio ya está en la carpeta del proyecto. */
export type FraseGenerada = { archivo: string; duracion: number; texto: string; voz: string }
export type GenerarVoz = (texto: string, voz?: string) => Promise<FraseGenerada | null>
/** Una frase grabada con el micrófono: Recorte la deja en el proyecto (sin gastar nada). */
export type GrabarVoz = (datos: Uint8Array, texto: string) => Promise<{ archivo: string; duracion: number; texto: string } | null>

/** Las frases grabadas con tu voz (no se regeneran con «Toda la voz con…»). */
export const esVozPropia = (v: VozTL): boolean => v.archivo.includes('voz-propia-')

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
  grabar,
  onElegir,
  onCerrar
}: {
  /** La frase elegida; sin ella, el panel sirve para añadir una nueva en el cabezal. */
  frase?: VozTL
  timeline: Timeline
  tiempo: number
  historial: Historial
  generar: GenerarVoz
  grabar?: GrabarVoz
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
  const otras = (timeline.voces ?? []).filter((v) => !esVozPropia(v) && (v.voz !== voz || !v.voz)).length
  const grabador = useGrabadora()

  /** Graba con el micrófono: en una frase, reemplaza su audio; sin frase, añade una en el cabezal. */
  async function grabarYUsar() {
    if (!grabar || ocupado) return
    if (grabador.estado !== 'grabando') return void grabador.empezar()
    const datos = await grabador.parar()
    if (!datos) return
    setOcupado('Preparando tu grabación')
    const dicho = texto.trim() || frase?.texto || ''
    const r = await grabar(datos, dicho)
    setOcupado(null)
    if (!r) return
    if (frase) {
      historial.aplicar(cambiarVoz(timeline, frase.id, { archivo: r.archivo, duracion: r.duracion, texto: r.texto, voz: undefined }))
      return
    }
    const { timeline: con, id } = anadirVoz(timeline, { inicio: tiempo, duracion: r.duracion, archivo: r.archivo, texto: r.texto })
    if (con === timeline) return
    historial.aplicar(con)
    onElegir(id)
  }

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
    const lista = (timeline.voces ?? []).filter((v) => v.texto.trim() && !esVozPropia(v))
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
      {grabar && (
        <button
          className={`btn small ${grabador.estado === 'grabando' ? 'primary' : ''}`}
          disabled={Boolean(ocupado)}
          onClick={() => void grabarYUsar()}
          title={frase ? 'Graba esta frase con tu voz (reemplaza su audio)' : 'Graba con tu voz una frase nueva en el cabezal'}
        >
          <span className={`voz-punto ${grabador.estado === 'grabando' ? '' : 'apagado'}`} />
          {grabador.estado === 'grabando' ? `Parar · ${grabador.segundos.toFixed(0)} s` : 'Grabar'}
        </button>
      )}
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
      {grabador.error && <span className="crear-error">{grabador.error}</span>}
      {ocupado ? (
        <span className="tl-dim">{ocupado}…</span>
      ) : (
        <>
          {frase && (
            <span className="tl-dim">
              {frase.duracion.toFixed(1)} s{esVozPropia(frase) ? ' · tu voz' : frase.voz ? ` · ${frase.voz}` : ''}
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

/** El micrófono: empezar, parar (devuelve lo grabado) y cuántos segundos van. */
function useGrabadora() {
  const [estado, setEstado] = useState<'listo' | 'grabando'>('listo')
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const grabador = useRef<MediaRecorder | null>(null)
  const trozos = useRef<Blob[]>([])

  useEffect(() => {
    if (estado !== 'grabando') return
    const desde = Date.now()
    const reloj = setInterval(() => setSegundos((Date.now() - desde) / 1000), 250)
    return () => clearInterval(reloj)
  }, [estado])
  // Si se cierra el panel grabando, el micrófono se suelta.
  useEffect(() => () => grabador.current?.stream.getTracks().forEach((t) => t.stop()), [])

  async function empezar() {
    setError(null)
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const r = new MediaRecorder(flujo, { mimeType: 'audio/webm' })
      trozos.current = []
      r.ondataavailable = (e) => e.data.size && trozos.current.push(e.data)
      grabador.current = r
      r.start()
      setSegundos(0)
      setEstado('grabando')
    } catch {
      setError('No pude usar el micrófono: revisa que esté conectado y que Windows le dé permiso a Recorte.')
    }
  }

  function parar(): Promise<Uint8Array | null> {
    const r = grabador.current
    if (!r || r.state === 'inactive') return Promise.resolve(null)
    return new Promise((ok) => {
      r.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop())
        setEstado('listo')
        const blob = new Blob(trozos.current, { type: 'audio/webm' })
        ok(blob.size ? new Uint8Array(await blob.arrayBuffer()) : null)
      }
      r.stop()
    })
  }

  return { estado, segundos, error, empezar, parar }
}
