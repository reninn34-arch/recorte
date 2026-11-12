import { useEffect, useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/** El número de la versión vigente (la del video que se ve), por su archivo `salidas/agente-vN.…`. */
function vigenteDe(c: Creacion): number {
  const m = /agente-v(\d+)\./.exec(c.agente?.resultado?.archivo ?? '')
  return m ? Number(m[1]) : c.version
}

/**
 * Las versiones que entregó el agente: verlas, volver a una, dar una por buena («Así está bien») y, desde la buena,
 * hacer «Otro video así» o guardarla en «Mis estilos».
 */
export function VersionesCreacion({
  creacion: c,
  ocupado,
  onCambio,
  onNueva
}: {
  creacion: Creacion
  ocupado: boolean
  onCambio: (c: Creacion) => void
  /** Abre la creación nueva de «Otro video así» (y empieza su plan). */
  onNueva: (c: Creacion) => void
}) {
  const vigente = vigenteDe(c)
  const [viendo, setViendo] = useState(vigente)
  const [modo, setModo] = useState<null | 'otro' | 'guardar'>(null)
  const [texto, setTexto] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [haciendo, setHaciendo] = useState(false)
  const [guardado, setGuardado] = useState<string | null>(null)
  useEffect(() => setViendo(vigente), [vigente])

  if (c.version < 1) return null
  const numeros = Array.from({ length: c.version }, (_, i) => i + 1)
  const datos = c.versiones?.find((v) => v.n === viendo)
  const base = c.aprobada ?? vigente
  // Las entregas de antes de este historial no están en `versiones`: su video se llama igual.
  const archivo = datos?.archivo ?? `salidas/agente-v${viendo}.mp4`
  const bloqueado = ocupado || haciendo

  async function hacer<T>(f: () => Promise<T>, despues: (r: T) => void) {
    setHaciendo(true)
    setError(null)
    try {
      despues(await f())
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setHaciendo(false)
    }
  }

  return (
    <div className="cr-versiones">
      <div className="cr-versiones-fila">
        <span className="cr-versiones-titulo">Versiones</span>
        {numeros.map((n) => (
          <button
            key={n}
            className={`chip ${viendo === n ? 'is-active' : ''}`}
            onClick={() => setViendo(n)}
            title={n === vigente ? 'La que estás viendo y de la que parten los cambios' : 'Verla'}
          >
            v{n}
            {c.aprobada === n && <Icon name="check" size={11} />}
            {n === vigente && <span className="cr-version-punto" aria-label="vigente" />}
          </button>
        ))}
      </div>

      {datos?.pedido && <p className="tl-dim cr-version-pedido">Pediste: {datos.pedido}</p>}

      {viendo !== vigente && (
        <div className="cr-version-ver">
          {/\.(png|jpe?g)$/i.test(archivo) ? (
            <img key={viendo} className={c.formato} src={mediaUrl(`c-${c.id}`, archivo)} alt={`Versión ${viendo}`} />
          ) : (
            <video key={viendo} className={c.formato} src={mediaUrl(`c-${c.id}`, archivo)} controls preload="metadata" />
          )}
          <button
            className="btn small"
            disabled={bloqueado}
            onClick={() => void hacer(() => window.recorte.creacionVolver(c.id, viendo), onCambio)}
            title="Su video y su receta vuelven a ser los vigentes: lo que pidas después parte de ella"
          >
            <Icon name="undo" size={13} /> Volver a la v{viendo}
          </button>
        </div>
      )}

      <div className="cr-versiones-acciones">
        <button
          className="btn small primary"
          disabled={bloqueado || c.aprobada === viendo}
          onClick={() => void hacer(() => window.recorte.creacionAprobar(c.id, viendo), onCambio)}
          title="Esta es la buena: los cambios parten de ella y «Otro video así» copia su estilo"
        >
          <Icon name="check" size={13} /> {c.aprobada === viendo ? `La v${viendo} es la buena` : 'Así está bien'}
        </button>
        <button className={`btn small ${modo === 'otro' ? 'is-on' : ''}`} disabled={bloqueado} onClick={() => setModo(modo === 'otro' ? null : 'otro')}>
          <Icon name="sparkles" size={13} /> Otro video así
        </button>
        <button className={`btn small ghost ${modo === 'guardar' ? 'is-on' : ''}`} disabled={bloqueado} onClick={() => setModo(modo === 'guardar' ? null : 'guardar')}>
          <Icon name="layers" size={13} /> Guardar en Mis estilos
        </button>
      </div>

      {modo === 'otro' && (
        <form
          className="cr-versiones-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            void hacer(() => window.recorte.creacionOtroAsi(c.id, texto.trim(), base), (nueva) => {
              setTexto('')
              setModo(null)
              onNueva(nueva)
            })
          }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            autoFocus
            placeholder={`¿De qué trata el video nuevo? Lo hace con el estilo de la v${base}${c.aprobada ? ' (la buena)' : ''}: mismas letras, colores, ritmo, cámara y música.`}
          />
          <button className="btn small primary" type="submit" disabled={bloqueado || !texto.trim()}>
            Crear
          </button>
        </form>
      )}

      {modo === 'guardar' && (
        <form
          className="cr-versiones-form"
          onSubmit={(e) => {
            e.preventDefault()
            void hacer(() => window.recorte.guardarEstiloPropio(c.id, nombre.trim(), base), (r) => {
              setGuardado(r.nombre)
              setNombre('')
              setModo(null)
            })
          }}
        >
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus placeholder={`Nombre del estilo (p. ej. «Collage Vox»). Se guarda la v${base}.`} />
          <button className="btn small primary" type="submit" disabled={bloqueado}>
            Guardar
          </button>
        </form>
      )}

      {guardado && <p className="tl-dim">Guardado como «{guardado}». Lo eliges en «Crear con IA», en Mis estilos.</p>}
      {error && <p className="cr-versiones-error">{error}</p>}
    </div>
  )
}
