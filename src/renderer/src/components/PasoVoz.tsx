import { useEffect, useRef, useState } from 'react'
import { nombreVozGemini, textoNarracion, VOCES_GEMINI, vozDesactualizada, type Creacion } from '../../../shared/creacion'
import type { EstadoVozGoogle } from '../../../shared/api'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * El paso Voz del estudio: una voz de Gemini (con la clave de AI Studio del usuario),
 * tu voz grabada aquí mismo o subida, o ninguna. Con la voz lista, las escenas siguen
 * sus tiempos y el video la lleva mezclada.
 */

type Modo = 'gemini' | 'propia' | 'ninguna'

export interface ControlVoz {
  tieneClave: boolean
  /** La clave es la del agente Gemini (AI Studio): no hay que pegar otra. */
  delAgente?: boolean
  vozGemini?: string
  /** La cuenta de Google conectada para la voz (sin llave). */
  google?: EstadoVozGoogle
  conectarGoogle: () => Promise<void>
  desconectarGoogle: () => Promise<void>
  guardarClave: (clave: string) => Promise<void>
  generar: (voz: string) => void
  usarGrabacion: (datos: Uint8Array) => void
  subir: () => void
  quitar: () => void
  /** Pone la voz en el video ya hecho, sin rediseñar. */
  montar: () => void
}

function mmss(s: number): string {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

function Grabadora({ guion, onUsar, ocupado }: { guion: string; onUsar: (d: Uint8Array) => void; ocupado: boolean }) {
  const [estado, setEstado] = useState<'listo' | 'grabando' | 'grabado'>('listo')
  const [segundos, setSegundos] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const grabador = useRef<MediaRecorder | null>(null)
  const trozos = useRef<Blob[]>([])
  const blob = useRef<Blob | null>(null)

  useEffect(() => {
    if (estado !== 'grabando') return
    const desde = Date.now()
    const reloj = setInterval(() => setSegundos((Date.now() - desde) / 1000), 250)
    return () => clearInterval(reloj)
  }, [estado])

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
    grabador.current?.stream.getTracks().forEach((t) => t.stop())
  }, [url])

  async function empezar() {
    setError(null)
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const r = new MediaRecorder(flujo, { mimeType: 'audio/webm' })
      trozos.current = []
      r.ondataavailable = (e) => e.data.size && trozos.current.push(e.data)
      r.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop())
        blob.current = new Blob(trozos.current, { type: 'audio/webm' })
        setUrl(URL.createObjectURL(blob.current))
        setEstado('grabado')
      }
      grabador.current = r
      r.start()
      setSegundos(0)
      setEstado('grabando')
    } catch {
      setError('No pude usar el micrófono. Revisa que esté conectado y que Windows le dé permiso a Recorte.')
    }
  }

  async function usar() {
    if (!blob.current) return
    onUsar(new Uint8Array(await blob.current.arrayBuffer()))
  }

  return (
    <div className="voz-grabar">
      <p className="tl-dim">Lee la narración con calma, como se la contarías a alguien:</p>
      <div className="voz-guion">{guion}</div>
      <div className="voz-fila">
        {estado === 'grabando' ? (
          <button className="btn primary" onClick={() => grabador.current?.stop()}>
            <span className="voz-punto" /> Parar · {mmss(segundos)}
          </button>
        ) : (
          <button className="btn" onClick={() => void empezar()} disabled={ocupado}>
            <span className="voz-punto apagado" /> {estado === 'grabado' ? 'Grabar otra vez' : 'Grabar'}
          </button>
        )}
        {estado === 'grabado' && url && (
          <>
            <audio src={url} controls />
            <button className="btn primary" onClick={() => void usar()} disabled={ocupado}>
              Usar esta grabación
            </button>
          </>
        )}
      </div>
      {error && <p className="crear-error">{error}</p>}
    </div>
  )
}

export function PasoVoz({ creacion, ocupado, control }: { creacion: Creacion; ocupado: boolean; control: ControlVoz }) {
  const c = creacion
  const [cambiando, setCambiando] = useState(false)
  const [modo, setModo] = useState<Modo>('gemini')
  const [voz, setVoz] = useState(control.vozGemini ?? 'Kore')
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)
  if (!c.guion) return null

  function cambiar(modoInicial: Modo, nombre?: string) {
    setModo(modoInicial)
    if (nombre) setVoz(nombre)
    setCambiando(true)
  }

  const vozActual = c.voz
  if (vozActual && !cambiando) {
    const vieja = vozDesactualizada(c)
    const nombre = nombreVozGemini(vozActual.vozGemini ?? control.vozGemini)
    return (
      <div className="estudio-voz">
        <div className="estudio-guion-cabeza">
          <h2>Voz</h2>
          <span className="tl-dim">
            {vozActual.origen === 'gemini' ? `Gemini · ${nombre}` : 'Tu voz'} · {vozActual.duracion.toFixed(1)} s
            {vieja ? ' · no coincide con el guion' : ''}
          </span>
          <span className="tl-flex" />
          {vieja ? (
            <>
              {vozActual.origen === 'gemini' && (
                <button
                  className="btn small primary"
                  onClick={() => control.generar(nombre)}
                  disabled={ocupado}
                  title="Vuelve a generar la voz con la narración nueva"
                >
                  <Icon name="sparkles" size={13} /> Regenerar con {nombre}
                </button>
              )}
              <button className="btn small ghost" onClick={() => cambiar(vozActual.origen, nombre)} disabled={ocupado}>
                {vozActual.origen === 'gemini' ? 'Elegir otra voz' : 'Grabar otra vez'}
              </button>
            </>
          ) : (
            <>
              {c.salida && c.vozMontada !== c.version && (
                <button className="btn small primary" onClick={control.montar} disabled={ocupado} title="Sin rediseñar ni gastar tokens: cada frase entra con su escena">
                  <Icon name="sparkles" size={13} /> Poner la voz en el video
                </button>
              )}
              {c.salida && c.vozMontada === c.version && <span className="ag-uso">Ya está en el video</span>}
              <button className="btn small ghost" onClick={() => cambiar(vozActual.origen, nombre)} disabled={ocupado}>
                Cambiar voz
              </button>
              <button className="btn small ghost" onClick={control.quitar} disabled={ocupado}>
                <Icon name="trash" size={13} /> Quitar
              </button>
            </>
          )}
        </div>
        {vieja && (
          <p className="voz-aviso">
            <Icon name="alerta" size={14} />
            {vozActual.origen === 'gemini'
              ? 'El guion cambió después de generar esta voz. Regénerala para que diga la narración nueva.'
              : 'El guion cambió después de grabar esta voz. Grábala otra vez para que diga la narración nueva.'}
          </p>
        )}
        <audio key={vozActual.duracion} src={mediaUrl(`c-${c.id}`, `composicion/${vozActual.archivo}`)} controls className="voz-audio" />
      </div>
    )
  }

  return (
    <div className="estudio-voz">
      <div className="estudio-guion-cabeza">
        <h2>Voz</h2>
        <span className="tl-dim">La voz manda el ritmo: las escenas se ajustan a ella.</span>
        <span className="tl-flex" />
        {cambiando && (
          <button className="btn small ghost" onClick={() => setCambiando(false)}>
            Cancelar
          </button>
        )}
      </div>
      <div className="chips voz-modos">
        <button className={`chip ${modo === 'gemini' ? 'is-active' : ''}`} onClick={() => setModo('gemini')}>
          <Icon name="sparkles" size={12} /> Voz de Gemini
        </button>
        <button className={`chip ${modo === 'propia' ? 'is-active' : ''}`} onClick={() => setModo('propia')}>
          Mi voz
        </button>
        <button className={`chip ${modo === 'ninguna' ? 'is-active' : ''}`} onClick={() => setModo('ninguna')}>
          Sin voz
        </button>
      </div>

      {modo === 'gemini' &&
        (control.tieneClave || control.google?.correo ? (
          <>
            <div className="voz-voces">
              {VOCES_GEMINI.map((v) => (
                <button key={v.id} className={`voz-voz ${voz === v.id ? 'is-active' : ''}`} onClick={() => setVoz(v.id)}>
                  <b>{v.id}</b>
                  <small>{v.descripcion}</small>
                </button>
              ))}
            </div>
            <div className="voz-fila">
              <button
                className="btn primary"
                disabled={ocupado}
                onClick={() => {
                  setCambiando(false)
                  control.generar(voz)
                }}
              >
                <Icon name="sparkles" size={14} /> Generar la voz con {voz}
              </button>
              <span className="tl-dim">
                {control.tieneClave
                  ? control.delAgente
                    ? 'Se usa la llave de AI Studio de tu agente Gemini: una petición por voz.'
                    : 'Usa tu cuota gratis de AI Studio: una petición por voz.'
                  : `Con tu cuenta de Google (${control.google?.correo}) · la cuota gratis de AI Studio.`}
              </span>
              {!control.tieneClave && control.google?.correo && (
                <button className="btn small ghost" disabled={ocupado} onClick={() => void control.desconectarGoogle()}>
                  Cambiar cuenta
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="voz-clave">
            <div className="voz-google">
              <p>
                Entra con tu cuenta de Google y Recorte usa AI Studio por ti, sin llaves. Se abre Edge para que inicies
                sesión: Google no deja entrar desde dentro de las apps.
              </p>
              <button
                className="btn primary"
                disabled={control.google?.conectando}
                onClick={() => void control.conectarGoogle()}
              >
                <Icon name="sparkles" size={14} />{' '}
                {control.google?.conectando ? 'Se abrió Edge: entra con tu cuenta de Google…' : 'Conectar con Google'}
              </button>
              {control.google?.error && <p className="crear-error">{control.google.error}</p>}
            </div>
            <details className="voz-llave-detalle">
              <summary>O pega tu clave de AI Studio</summary>
              <p>
                Es gratis y se guarda cifrada en tu equipo.{' '}
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Conseguir mi clave
                </a>
              </p>
              <div className="voz-fila">
                <input
                  type="password"
                  className="tl-texto-input"
                  placeholder="AIza…"
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                />
                <button
                  className="btn primary"
                  disabled={!clave.trim() || guardando}
                  onClick={async () => {
                    setGuardando(true)
                    await control.guardarClave(clave.trim()).finally(() => setGuardando(false))
                    setClave('')
                  }}
                >
                  Guardar clave
                </button>
              </div>
            </details>
          </div>
        ))}

      {modo === 'propia' && (
        <>
          <Grabadora
            guion={textoNarracion(c.guion)}
            ocupado={ocupado}
            onUsar={(d) => {
              setCambiando(false)
              control.usarGrabacion(d)
            }}
          />
          <button
            className="btn small ghost"
            disabled={ocupado}
            onClick={() => {
              setCambiando(false)
              control.subir()
            }}
          >
            <Icon name="upload" size={13} /> O sube un audio
          </button>
        </>
      )}

      {modo === 'ninguna' && <p className="tl-dim">El video irá sin narración. En el editor le puedes poner música.</p>}
    </div>
  )
}
