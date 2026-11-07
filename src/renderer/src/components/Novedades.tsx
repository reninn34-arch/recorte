import { useEffect, useState } from 'react'
import { compararVersion, NOVEDADES, novedadesPendientes, type VersionNovedades } from '../../../shared/novedades'
import { Icon, type IconName } from '../Icons'

/**
 * La ventana de «Novedades»: se abre sola una vez cuando Recorte cambió de versión
 * (con lo nuevo de cada versión que no había visto) y a pedido desde Ajustes → Versión.
 */
export function Novedades({ forzar, onCerrar }: { forzar?: boolean; onCerrar?: () => void }) {
  const [lista, setLista] = useState<VersionNovedades[]>([])
  const [actual, setActual] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [e, p] = await Promise.all([window.recorte.actualizacionEstado(), window.recorte.preferenciasCargar()])
        setActual(e.version)
        if (p.novedadesVistas === e.version) return
        setLista(novedadesPendientes(e.version, p.novedadesVistas))
      } catch {
        // Sin novedades no pasa nada.
      }
    })()
  }, [])

  const mostrar = forzar ? NOVEDADES.filter((v) => !actual || compararVersion(v.version, actual) <= 0).slice(0, 3) : lista
  if (!mostrar.length) return null

  function cerrar() {
    setLista([])
    if (actual) void window.recorte.preferenciasGuardar({ novedadesVistas: actual }).catch(() => {})
    onCerrar?.()
  }

  const principal = mostrar[0]
  return (
    <div className="novedades-fondo" role="dialog" aria-modal="true" aria-labelledby="novedades-titulo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="novedades" onKeyDown={(e) => e.key === 'Escape' && cerrar()}>
        <div className="novedades-cabeza">
          <span className="novedades-sello">
            <Icon name="gift" size={20} />
          </span>
          <div>
            <h2 id="novedades-titulo">Novedades de Recorte {principal.version}</h2>
            <p>{principal.resumen}</p>
          </div>
        </div>
        {mostrar.map((v) => (
          <section key={v.version} className="novedades-version">
            {mostrar.length > 1 && <span>Versión {v.version}</span>}
            {v.novedades.map((n) => (
              <div key={n.titulo} className="novedades-item">
                <span className="op-icono">
                  <Icon name={n.icono as IconName} size={16} />
                </span>
                <div>
                  <strong>{n.titulo}</strong>
                  <p>{n.texto}</p>
                </div>
              </div>
            ))}
          </section>
        ))}
        <div className="novedades-pie">
          <button className="btn primary" autoFocus onClick={cerrar}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
