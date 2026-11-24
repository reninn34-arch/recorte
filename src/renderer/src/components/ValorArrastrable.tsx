import { useEffect, useRef, useState } from 'react'

/**
 * El número de un ajuste, como en los editores serios: se arrastra a los lados para cambiarlo
 * (Mayús: fino, Ctrl: grueso), un clic lo deja escribir, las flechas lo mueven de a un paso
 * y ↺ lo devuelve a como viene. Sustituye al deslizador grande.
 */
export function ValorArrastrable({
  valor,
  min,
  max,
  paso,
  formato,
  onCambio,
  onEmpezar,
  porDefecto,
  nombre,
  desactivado = false
}: {
  valor: number
  min: number
  max: number
  paso: number
  formato: (v: number) => string
  onCambio: (v: number) => void
  /** Abre un paso de deshacer: se llama antes del primer cambio de cada gesto. */
  onEmpezar?: () => void
  /** Si se da y el valor es otro, aparece ↺ para volver a él. */
  porDefecto?: number
  nombre?: string
  desactivado?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const gesto = useRef<{ x: number; v: number; ultimo: number; movido: boolean; id: number } | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const ajustar = (v: number) => {
    const conPaso = Math.round((v - min) / paso) * paso + min
    const decimales = Math.max(0, -Math.floor(Math.log10(paso)) + 1)
    return Math.min(max, Math.max(min, Number(conPaso.toFixed(decimales))))
  }

  useEffect(() => {
    if (editando) campo.current?.select()
  }, [editando])

  function abajo(e: React.PointerEvent<HTMLSpanElement>) {
    if (desactivado || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    gesto.current = { x: e.clientX, v: valor, ultimo: valor, movido: false, id: e.pointerId }
  }

  function mover(e: React.PointerEvent<HTMLSpanElement>) {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.x
    if (!g.movido) {
      if (Math.abs(dx) < 3) return
      g.movido = true
      setArrastrando(true)
      onEmpezar?.()
    }
    // Todo el recorrido en unos 240 px; Mayús afina diez veces y Ctrl va cuatro veces más rápido.
    const sensibilidad = ((max - min) / 240) * (e.shiftKey ? 0.1 : e.ctrlKey ? 4 : 1)
    const v = ajustar(g.v + dx * sensibilidad)
    if (v !== g.ultimo) {
      g.ultimo = v
      onCambio(v)
    }
  }

  function arriba(e: React.PointerEvent<HTMLSpanElement>) {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    // Donde se suelta manda: si algún movimiento no llegó a contar, el valor final es el de aquí.
    if (g.movido && e.type === 'pointerup') mover(e)
    gesto.current = null
    setArrastrando(false)
    // Un clic sin arrastrar: escribir el número.
    if (!g.movido) setEditando(true)
  }

  function tecla(e: React.KeyboardEvent<HTMLSpanElement>) {
    if (desactivado) return
    const mas = e.key === 'ArrowRight' || e.key === 'ArrowUp'
    const menos = e.key === 'ArrowLeft' || e.key === 'ArrowDown'
    if (mas || menos) {
      e.preventDefault()
      e.stopPropagation()
      onEmpezar?.()
      onCambio(ajustar(valor + (mas ? 1 : -1) * paso * (e.shiftKey ? 10 : 1)))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      onEmpezar?.()
      onCambio(e.key === 'Home' ? min : max)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      setEditando(true)
    }
  }

  function aplicarTexto(texto: string) {
    setEditando(false)
    const v = interpretarValor(texto, formato, min, max)
    if (v === null) return
    const final = ajustar(v)
    if (final === valor) return
    onEmpezar?.()
    onCambio(final)
  }

  const cambiado = porDefecto !== undefined && Math.abs(valor - porDefecto) > paso / 2

  return (
    <span className="aj-valor-caja" onClick={(e) => e.preventDefault()}>
      {cambiado && (
        <button
          type="button"
          className="aj-volver"
          title={`Volver a como viene (${formato(porDefecto!)})`}
          aria-label={`Restablecer ${nombre ?? 'el ajuste'}`}
          disabled={desactivado}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onEmpezar?.()
            onCambio(porDefecto!)
          }}
        >
          ↺
        </button>
      )}
      {editando ? (
        <input
          ref={campo}
          className="aj-editar"
          defaultValue={numeroMostrado(formato(valor)) ?? String(valor)}
          aria-label={nombre}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') aplicarTexto(e.currentTarget.value)
            else if (e.key === 'Escape') setEditando(false)
          }}
          onBlur={(e) => aplicarTexto(e.currentTarget.value)}
        />
      ) : (
        <span
          className={`aj-valor ${arrastrando ? 'is-arrastrando' : ''} ${desactivado ? 'is-off' : ''}`}
          role="slider"
          tabIndex={desactivado ? -1 : 0}
          aria-label={nombre}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={valor}
          aria-valuetext={formato(valor)}
          aria-disabled={desactivado || undefined}
          title="Arrastra a los lados para cambiarlo (Mayús: fino) · clic para escribirlo"
          onPointerDown={abajo}
          onPointerMove={mover}
          onPointerUp={arriba}
          onPointerCancel={arriba}
          onKeyDown={tecla}
        >
          {formato(valor)}
        </span>
      )}
    </span>
  )
}

/** El primer número de un texto como «→ 20 %», «frío −15» o «+0.50» (el signo menos tipográfico también cuenta). */
function numeroMostrado(texto: string): string | null {
  const m = texto.replace(/−/g, '-').replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/)
  return m ? m[0] : null
}

/**
 * Lo que el usuario escribe está en las unidades que ve («50» en un 50 %): se averigua la escala
 * mirando cómo enseña el formato un valor de prueba, y se pasa al valor real.
 */
export function interpretarValor(texto: string, formato: (v: number) => string, min: number, max: number): number | null {
  const escrito = numeroMostrado(texto)
  if (escrito === null) return null
  const n = Number(escrito)
  if (!Number.isFinite(n)) return null
  // Un valor de prueba lejos del cero, para que el formato enseñe un número (no «no» ni «centro»).
  const pruebas = [max, min, (min + max) / 2, min + (max - min) * 0.75].filter((x) => Math.abs(x) > 1e-9)
  let escala = 1
  for (const p of pruebas) {
    const visto = numeroMostrado(formato(p))
    if (visto !== null && Math.abs(Number(visto)) > 1e-9) {
      escala = Math.abs(Number(visto) / p)
      break
    }
  }
  return n / escala
}
