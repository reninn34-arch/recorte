import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FUENTES_TEXTO } from '../../../shared/timeline'
import { Icon } from '../Icons'

/** Cierra algo flotante al tocar fuera de él o con Escape. */
function useFuera(abierto: boolean, ref: React.RefObject<HTMLElement | null>, onCerrar: () => void) {
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCerrar()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCerrar()
      }
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [abierto, ref, onCerrar])
}

/** Un botón de la barra que abre un panel flotante debajo. */
export function Desplegable({
  boton,
  titulo,
  activo,
  ancho = 240,
  className = '',
  children
}: {
  boton: ReactNode
  titulo: string
  activo?: boolean
  ancho?: number
  className?: string
  children: (cerrar: () => void) => ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cerrar = () => setAbierto(false)
  useFuera(abierto, ref, cerrar)
  return (
    <div className="pt-desp" ref={ref}>
      <button className={`pt-boton ${className} ${abierto || activo ? 'is-on' : ''}`} title={titulo} aria-label={titulo} aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {boton}
      </button>
      {abierto && (
        <div className="pt-pop" style={{ width: ancho }} role="dialog" aria-label={titulo}>
          {children(cerrar)}
        </div>
      )}
    </div>
  )
}

const GRUPOS_LETRA: { id: string; nombre: string; letras: string[] }[] = [
  { id: 'todas', nombre: 'Todas', letras: Object.keys(FUENTES_TEXTO) },
  { id: 'gruesas', nombre: 'Gruesas', letras: ['titular', 'impacto', 'gruesa', 'negra', 'normal'] },
  { id: 'finas', nombre: 'Finas', letras: ['fina', 'ligera', 'maquina'] },
  { id: 'elegantes', nombre: 'Elegantes', letras: ['elegante', 'cursiva'] }
]

/** La lista de letras: cada una escrita con su propia letra, con filtros arriba. */
export function ListaLetras({ valor, onCambio }: { valor: string; onCambio: (letra: string) => void }) {
  const [grupo, setGrupo] = useState('todas')
  const letras = GRUPOS_LETRA.find((g) => g.id === grupo)?.letras ?? []
  return (
    <div className="pt-letras">
      <div className="pt-chips">
        {GRUPOS_LETRA.map((g) => (
          <button key={g.id} className={grupo === g.id ? 'is-on' : ''} onClick={() => setGrupo(g.id)}>
            {g.nombre}
          </button>
        ))}
      </div>
      <div className="pt-letras-lista" role="listbox" aria-label="Letras">
        {letras.map((id) => {
          const f = FUENTES_TEXTO[id]
          return (
            <button
              key={id}
              role="option"
              aria-selected={valor === id}
              className={valor === id ? 'is-on' : ''}
              onClick={() => onCambio(id)}
              style={{ fontFamily: `"${f.familia}", Arial`, fontWeight: f.negrita ? 700 : 400, fontStyle: f.cursiva ? 'italic' : 'normal' }}
            >
              {f.nombre}
              {valor === id && <Icon name="check" size={14} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const PALETA = [
  '#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#1a1a1a', '#000000',
  '#ffd6d6', '#ff8a8a', '#ff3b3b', '#e3262e', '#a3141b', '#ffb36b', '#ff7a1a',
  '#fff3a3', '#ffe11a', '#f2c200', '#c9f26a', '#5fd35f', '#1f9e4a', '#0e5c32',
  '#c2f0ff', '#5fd7ff', '#1aa3ff', '#1f5fd3', '#14307a', '#b98aff', '#ff6fc2'
]

type ConGotero = { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }

/** El selector de color: el gotero, los colores del cuadro elegido y una paleta fija; o un hex a mano. */
export function SelectorColor({ valor, onCambio, deFoto }: { valor: string; onCambio: (color: string) => void; deFoto: string[] }) {
  const [hex, setHex] = useState(valor)
  useEffect(() => setHex(valor), [valor])
  const Gotero = (window as unknown as ConGotero).EyeDropper
  const muestra = (c: string) => (
    <button key={c} className={`pt-muestra ${c.toLowerCase() === valor.toLowerCase() ? 'is-on' : ''}`} style={{ background: c }} title={c} aria-label={c} onClick={() => onCambio(c)} />
  )
  return (
    <div className="pt-color">
      <div className="pt-color-fila">
        {Gotero && (
          <button
            className="pt-boton"
            title="Tomar un color de la pantalla"
            aria-label="Tomar un color de la pantalla"
            onClick={() =>
              void new Gotero()
                .open()
                .then((r) => onCambio(r.sRGBHex))
                .catch(() => {})
            }
          >
            <Icon name="gotero" size={15} />
          </button>
        )}
        <span className="pt-muestra grande" style={{ background: valor }} />
        <input
          className="pt-hex"
          value={hex}
          spellCheck={false}
          aria-label="Color en hexadecimal"
          onChange={(e) => {
            const v = e.target.value.trim()
            setHex(v)
            const c = v.startsWith('#') ? v : `#${v}`
            if (/^#[0-9a-f]{6}$/i.test(c)) onCambio(c.toLowerCase())
          }}
        />
        <label className="pt-muestra otro" title="Otro color">
          <input type="color" value={valor} onChange={(e) => onCambio(e.target.value)} aria-label="Otro color" />
        </label>
      </div>
      {deFoto.length > 0 && (
        <>
          <span className="pt-sub">Del cuadro</span>
          <div className="pt-muestras">{deFoto.map(muestra)}</div>
        </>
      )}
      <span className="pt-sub">Colores</span>
      <div className="pt-muestras">{PALETA.map(muestra)}</div>
    </div>
  )
}

/** Los colores que más pesan en una imagen (para ofrecerlos en el selector), distintos entre sí. */
export function coloresDeImagen(img: HTMLImageElement | null, cuantos = 7): string[] {
  if (!img || !img.naturalWidth) return []
  try {
    const c = document.createElement('canvas')
    c.width = 48
    c.height = 48
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    ctx.drawImage(img, 0, 0, 48, 48)
    const datos = ctx.getImageData(0, 0, 48, 48).data
    const cubos = new Map<number, { n: number; r: number; g: number; b: number }>()
    for (let i = 0; i < datos.length; i += 4) {
      const r = datos[i]
      const g = datos[i + 1]
      const b = datos[i + 2]
      const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const x = cubos.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }
      x.n++
      x.r += r
      x.g += g
      x.b += b
      cubos.set(k, x)
    }
    const lista = [...cubos.values()].sort((a, b) => b.n - a.n).map((x) => [x.r / x.n, x.g / x.n, x.b / x.n])
    const elegidos: number[][] = []
    for (const c of lista) {
      if (elegidos.every((e) => Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]) > 48)) elegidos.push(c)
      if (elegidos.length >= cuantos) break
    }
    return elegidos.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`)
  } catch {
    return []
  }
}
