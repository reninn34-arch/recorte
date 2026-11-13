import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icons'
import { tcCuadros } from './TimelineEditor'

/**
 * El monitor de origen (como el de Premiere): un video de la biblioteca con su propia entrada y salida, para poner solo
 * ese tramo en la línea de tiempo: Insertar (corre lo que viene después) o Sobrescribir (tapa lo que hay ahí).
 */
export function MonitorOrigen({
  url,
  nombre,
  duracion,
  fps,
  onInsertar,
  onSobrescribir,
  onCerrar
}: {
  url: string
  nombre: string
  duracion: number
  fps: number
  onInsertar: (entrada: number, salida: number) => void
  onSobrescribir: (entrada: number, salida: number) => void
  onCerrar: () => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [t, setT] = useState(0)
  const [entrada, setEntrada] = useState(0)
  const [salida, setSalida] = useState(duracion)
  const [suena, setSuena] = useState(false)
  const cuadro = 1 / Math.max(1, fps)
  const ir = (s: number) => {
    const v = ref.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(duracion, s))
    setT(v.currentTime)
  }
  const marcarEntrada = () => {
    setEntrada(t)
    if (salida <= t) setSalida(duracion)
  }
  const marcarSalida = () => {
    setSalida(t)
    if (entrada >= t) setEntrada(0)
  }
  const valido = salida - entrada >= 0.1
  // Coma y punto: insertar y sobrescribir (los atajos de Premiere), mientras el monitor de origen está abierto.
  const teclas = useRef<(e: KeyboardEvent) => void>(() => {})
  teclas.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
    if (e.key === ',' && valido) onInsertar(entrada, salida)
    else if (e.key === '.' && valido) onSobrescribir(entrada, salida)
    else return
    e.preventDefault()
  }
  useEffect(() => {
    const oyente = (e: KeyboardEvent) => teclas.current(e)
    window.addEventListener('keydown', oyente)
    return () => window.removeEventListener('keydown', oyente)
  }, [])

  return (
    <div className="origen" aria-label={`Monitor de origen: ${nombre}`}>
      <div className="origen-cabeza">
        <b title={nombre}>{nombre}</b>
        <button className="tl-boton" onClick={onCerrar} aria-label="Cerrar el monitor de origen" title="Cerrar">
          <Icon name="x" size={14} />
        </button>
      </div>
      <video
        ref={ref}
        src={url}
        preload="auto"
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setSuena(true)}
        onPause={() => setSuena(false)}
        onClick={(e) => (e.currentTarget.paused ? void e.currentTarget.play() : e.currentTarget.pause())}
      />
      <div
        className="origen-barra"
        onPointerDown={(e) => {
          const caja = e.currentTarget.getBoundingClientRect()
          const mover = (x: number) => ir(((x - caja.left) / caja.width) * duracion)
          mover(e.clientX)
          const alMover = (ev: PointerEvent) => mover(ev.clientX)
          const soltar = () => {
            window.removeEventListener('pointermove', alMover)
            window.removeEventListener('pointerup', soltar)
          }
          window.addEventListener('pointermove', alMover)
          window.addEventListener('pointerup', soltar)
        }}
      >
        <span className="origen-rango" style={{ left: `${(entrada / duracion) * 100}%`, width: `${((salida - entrada) / duracion) * 100}%` }} />
        <span className="origen-cabezal" style={{ left: `${(t / duracion) * 100}%` }} />
      </div>
      <div className="origen-tiempos">
        <span className="tr-tc is-actual">{tcCuadros(t, fps)}</span>
        <span className="tr-tc" title="Lo que dura el tramo marcado">
          {tcCuadros(Math.max(0, salida - entrada), fps)}
        </span>
      </div>
      <div className="origen-controles">
        <button className="tr-boton tr-llave" onClick={marcarEntrada} title="Marcar la entrada del tramo aquí">
          {'{'}
        </button>
        <button className="tr-boton" onClick={() => ir(t - cuadro)} title="Un cuadro atrás" aria-label="Un cuadro atrás">
          <Icon name="cuadro-atras" size={14} />
        </button>
        <button
          className="tr-boton"
          onClick={() => (ref.current?.paused ? void ref.current.play() : ref.current?.pause())}
          aria-label={suena ? 'Pausa' : 'Reproducir'}
        >
          <Icon name={suena ? 'pause' : 'play'} size={14} />
        </button>
        <button className="tr-boton" onClick={() => ir(t + cuadro)} title="Un cuadro adelante" aria-label="Un cuadro adelante">
          <Icon name="cuadro-adelante" size={14} />
        </button>
        <button className="tr-boton tr-llave" onClick={marcarSalida} title="Marcar la salida del tramo aquí">
          {'}'}
        </button>
      </div>
      <div className="origen-acciones">
        <button className="btn small" disabled={!valido} onClick={() => onInsertar(entrada, salida)} title="Lo pone en el cabezal y corre lo que viene después (tecla ,)">
          Insertar <kbd>,</kbd>
        </button>
        <button className="btn small ghost" disabled={!valido} onClick={() => onSobrescribir(entrada, salida)} title="Lo pone en el cabezal tapando lo que hay ahí, sin mover lo demás (tecla .)">
          Sobrescribir <kbd>.</kbd>
        </button>
      </div>
    </div>
  )
}
