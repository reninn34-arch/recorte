import { useEffect, useState } from 'react'
import { compararVersion, NOVEDADES, novedadesPendientes, type VersionNovedades } from '../../../shared/novedades'
import type { EstiloCatalogo } from '../../../shared/estilos'
import { Icon, type IconName } from '../Icons'

/**
 * La ventana de «Novedades»: se abre sola una vez cuando Recorte cambió de versión
 * (con lo nuevo de cada versión que no había visto) y a pedido desde Ajustes → Versión.
 * Una versión con portada se presenta en grande: los videos de los estilos en un mosaico, sus novedades en tarjetas
 * y un botón para ir a probarlo.
 */
export function Novedades({ forzar, onCerrar, onEstilos }: { forzar?: boolean; onCerrar?: () => void; onEstilos?: () => void }) {
  const [lista, setLista] = useState<VersionNovedades[]>([])
  const [actual, setActual] = useState<string | null>(null)
  const [catalogo, setCatalogo] = useState<EstiloCatalogo[]>([])

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
  const portada = mostrar[0]?.portada
  useEffect(() => {
    if (portada) window.recorte.estilosCatalogo().then(setCatalogo).catch(() => setCatalogo([]))
  }, [portada])
  if (!mostrar.length) return null

  function cerrar() {
    setLista([])
    if (actual) void window.recorte.preferenciasGuardar({ novedadesVistas: actual }).catch(() => {})
    onCerrar?.()
  }

  const principal = mostrar[0]
  if (portada) {
    const videos = portada.estilos.map((id) => catalogo.find((e) => e.id === id)).filter((e): e is EstiloCatalogo => Boolean(e?.vista)).slice(0, 5)
    const otras = mostrar.slice(1)
    return (
      <div className="novedades-fondo" role="dialog" aria-modal="true" aria-labelledby="novedades-titulo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
        <div className="novedades is-portada" onKeyDown={(e) => e.key === 'Escape' && cerrar()}>
          <div className="nov-mosaico">
            {videos.map((e, i) => (
              <figure key={e.id} className={`nov-cuadro ${i === 0 ? 'is-grande' : ''}`}>
                <video src={e.vista} poster={e.poster} muted loop autoPlay playsInline />
                <figcaption>{e.nombre}</figcaption>
              </figure>
            ))}
            {!videos.length && <div className="nov-cuadro is-grande is-vacio" />}
            <span className="nov-etiqueta">
              <Icon name="sparkles" size={12} /> {portada.etiqueta} · {principal.version}
            </span>
            <button className="nov-cerrar" aria-label="Cerrar" onClick={cerrar}>
              <Icon name="x" size={14} />
            </button>
          </div>
          <div className="nov-cuerpo">
            <h2 id="novedades-titulo">{portada.titulo}</h2>
            <p className="nov-texto">{portada.texto}</p>
            <div className="nov-tarjetas">
              {principal.novedades.map((n) => (
                <div key={n.titulo} className="nov-tarjeta">
                  <span className="nov-icono">
                    <Icon name={n.icono as IconName} size={16} />
                  </span>
                  <strong>{n.titulo}</strong>
                  <p>{n.texto}</p>
                </div>
              ))}
            </div>
            {otras.map((v) => (
              <section key={v.version} className="novedades-version">
                <span>Versión {v.version}</span>
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
          </div>
          <div className="nov-pie">
            <button className="btn ghost" onClick={cerrar}>
              Ahora no
            </button>
            <button
              className="btn primary nov-boton"
              autoFocus
              onClick={() => {
                cerrar()
                if (portada.destino === 'estilos') onEstilos?.()
              }}
            >
              {portada.boton} <Icon name="chevron" size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

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
