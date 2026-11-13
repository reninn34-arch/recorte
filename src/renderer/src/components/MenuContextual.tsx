import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * El menú de clic derecho de la app (como el de cualquier programa): sale donde está el ratón, con sus atajos al lado;
 * se cierra al elegir, con Escape o con un clic fuera.
 */
export type OpcionMenu =
  | { tipo?: 'opcion'; nombre: string; atajo?: string; peligro?: boolean; desactivada?: boolean; accion: () => void }
  | { tipo: 'separador' }
  | { tipo: 'titulo'; nombre: string }

export function useMenuContextual(): [ReactNode, (e: React.MouseEvent | MouseEvent, opciones: OpcionMenu[]) => void] {
  const [menu, setMenu] = useState<{ x: number; y: number; opciones: OpcionMenu[] } | null>(null)
  const abrir = useCallback((e: React.MouseEvent | MouseEvent, opciones: OpcionMenu[]) => {
    e.preventDefault()
    e.stopPropagation()
    if (opciones.length) setMenu({ x: e.clientX, y: e.clientY, opciones })
  }, [])
  const elemento = menu ? <Menu {...menu} onCerrar={() => setMenu(null)} /> : null
  return [elemento, abrir]
}

function Menu({ x, y, opciones, onCerrar }: { x: number; y: number; opciones: OpcionMenu[]; onCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  // Que no se salga de la ventana: si no cabe a la derecha o abajo, se abre hacia el otro lado.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setPos({ x: x + r.width > window.innerWidth - 4 ? Math.max(4, x - r.width) : x, y: y + r.height > window.innerHeight - 4 ? Math.max(4, y - r.height) : y })
  }, [x, y])
  useEffect(() => {
    const cerrar = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return
      if (e.type === 'pointerdown' && ref.current?.contains(e.target as Node)) return
      onCerrar()
    }
    window.addEventListener('pointerdown', cerrar, true)
    window.addEventListener('keydown', cerrar, true)
    window.addEventListener('blur', onCerrar)
    window.addEventListener('wheel', onCerrar, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', cerrar, true)
      window.removeEventListener('keydown', cerrar, true)
      window.removeEventListener('blur', onCerrar)
      window.removeEventListener('wheel', onCerrar)
    }
  }, [onCerrar])
  return (
    <div ref={ref} className="menu-ctx" role="menu" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {opciones.map((o, i) =>
        o.tipo === 'separador' ? (
          <hr key={i} />
        ) : o.tipo === 'titulo' ? (
          <span key={i} className="menu-ctx-titulo">
            {o.nombre}
          </span>
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-ctx-opcion ${o.peligro ? 'is-peligro' : ''}`}
            disabled={o.desactivada}
            onClick={() => {
              onCerrar()
              o.accion()
            }}
          >
            <span>{o.nombre}</span>
            {o.atajo && <kbd>{o.atajo}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
