import { useEffect, useState } from 'react'
import type { EstadoActualizacion } from '../../../shared/api'
import { Icon } from '../Icons'

/**
 * El aviso de versión nueva, abajo a la izquierda. Mientras se baja, discreto; cuando
 * está lista, pide reiniciar (o se instala sola al cerrar Recorte).
 */
export function AvisoActualizacion() {
  const [e, setE] = useState<EstadoActualizacion | null>(null)
  const [luego, setLuego] = useState(false)

  useEffect(() => {
    void window.recorte.actualizacionEstado().then(setE).catch(() => {})
    return window.recorte.onActualizacion(setE)
  }, [])

  if (!e || luego) return null
  if (e.fase === 'bajando') {
    return (
      <div className="actualizacion is-bajando" role="status">
        <Icon name="download" size={14} />
        <span>
          Bajando Recorte {e.nueva}… {e.pct ?? 0}%
        </span>
      </div>
    )
  }
  if (e.fase !== 'lista') return null
  return (
    <div className="actualizacion" role="alert">
      <Icon name="sparkles" size={16} />
      <div className="actualizacion-texto">
        <strong>Recorte {e.nueva} está lista</strong>
        <span>Reinicia para instalarla. Tus proyectos no se tocan.</span>
      </div>
      <button className="btn small ghost" onClick={() => setLuego(true)} title="Se instalará sola cuando cierres Recorte">
        Luego
      </button>
      <button className="btn small primary" onClick={() => void window.recorte.actualizacionInstalar()}>
        Reiniciar y actualizar
      </button>
    </div>
  )
}

/** Ajustes → la versión instalada y «Buscar actualizaciones». */
export function FilaVersion() {
  const [e, setE] = useState<EstadoActualizacion | null>(null)
  useEffect(() => {
    void window.recorte.actualizacionEstado().then(setE).catch(() => {})
    return window.recorte.onActualizacion(setE)
  }, [])
  if (!e) return null
  const texto =
    e.fase === 'desarrollo' ? 'Estás en la versión de desarrollo: las actualizaciones llegan a la app instalada.'
    : e.fase === 'buscando' ? 'Buscando…'
    : e.fase === 'al-dia' ? 'Tienes la última versión.'
    : e.fase === 'bajando' ? `Bajando la versión ${e.nueva}… ${e.pct ?? 0}%`
    : e.fase === 'lista' ? `La versión ${e.nueva} está lista para instalar.`
    : e.fase === 'error' ? `No pude revisar: ${e.error ?? 'sin conexión'}`
    : 'Se revisa sola al abrir Recorte y cada cuatro horas.'
  return (
    <div className="op-fila">
      <span className="op-icono"><Icon name="download" size={16} /></span>
      <div className="op-fila-texto">
        <strong>Recorte {e.version}</strong>
        <span>{texto}</span>
      </div>
      <div className="op-fila-lado">
        {e.fase === 'lista' ? (
          <button className="btn small primary" onClick={() => void window.recorte.actualizacionInstalar()}>
            Reiniciar y actualizar
          </button>
        ) : (
          <button
            className="btn small ghost"
            disabled={e.fase === 'buscando' || e.fase === 'bajando'}
            onClick={() => void window.recorte.actualizacionBuscar().then(setE)}
          >
            Buscar actualizaciones
          </button>
        )}
      </div>
    </div>
  )
}
