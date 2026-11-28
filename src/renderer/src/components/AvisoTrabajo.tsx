import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * El aviso de que Recorte está haciendo algo que tarda (generar una voz, por ejemplo), como el de CapCut: una ventana
 * en el centro que oscurece lo de atrás, con una animación, qué está haciendo, los segundos que lleva y Cancelar.
 * Cancelar deja de esperar: lo que llegue después se descarta.
 */
export function AvisoTrabajo({ titulo, detalle, onCancelar }: { titulo: string; detalle?: string; onCancelar?: () => void }) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const desde = Date.now()
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 500)
    return () => clearInterval(reloj)
  }, [])
  useEffect(() => {
    if (!onCancelar) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancelar()
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [onCancelar])
  return createPortal(
    <div className="aviso-trabajo" role="alertdialog" aria-modal="true" aria-live="polite" aria-labelledby="aviso-trabajo-titulo">
      <div className="aviso-trabajo-caja">
        <span className="aviso-trabajo-ondas" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
          ))}
        </span>
        <b id="aviso-trabajo-titulo">{titulo}</b>
        {detalle && <span className="aviso-trabajo-detalle">{detalle}</span>}
        <span className="aviso-trabajo-tiempo">{segundos} s</span>
        {onCancelar && (
          <button className="btn small ghost" onClick={onCancelar} autoFocus>
            Cancelar
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}
