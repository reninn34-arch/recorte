import { useEffect, useState } from 'react'
import { Icon } from '../Icons'

type Estado = { ruta: string; elegida: boolean }

/** Dónde quedan tus videos: en Ajustes (fila) o en Inicio (aviso la primera vez). */
export function CarpetaVideos({ modo, onCambio }: { modo: 'ajustes' | 'aviso'; onCambio?: (e: Estado) => void }) {
  const [e, setE] = useState<Estado | null>(null)
  useEffect(() => {
    void window.recorte.carpetaEstado().then(setE).catch(() => {})
  }, [])
  if (!e) return null

  const poner = (nuevo: Estado | null) => {
    if (!nuevo) return
    setE(nuevo)
    onCambio?.(nuevo)
  }

  if (modo === 'aviso') {
    if (e.elegida) return null
    return (
      <div className="carpeta-aviso">
        <span className="op-icono"><Icon name="folder" size={17} /></span>
        <div className="op-fila-texto">
          <strong>¿Dónde guardo tus videos?</strong>
          <span>
            Cada video que exportes o crees con IA quedará en una carpeta por proyecto dentro de <b>{e.ruta}</b>.
          </span>
        </div>
        <div className="op-fila-lado">
          <button className="btn small primary" onClick={async () => poner(await window.recorte.carpetaUsarPropuesta())}>
            Usar esta carpeta
          </button>
          <button className="btn small" onClick={async () => poner(await window.recorte.carpetaElegir())}>
            Elegir otra
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="op-fila">
      <span className="op-icono"><Icon name="folder" size={16} /></span>
      <div className="op-fila-texto">
        <strong>{e.ruta}</strong>
        <span>Aquí quedan tus exportaciones y los videos creados con IA, en una carpeta por proyecto.</span>
      </div>
      <div className="op-fila-lado">
        <button className="btn small" onClick={async () => poner(await window.recorte.carpetaElegir())}>
          Cambiar
        </button>
        <button className="btn small ghost" onClick={() => void window.recorte.carpetaAbrir()}>
          Abrir
        </button>
      </div>
    </div>
  )
}
