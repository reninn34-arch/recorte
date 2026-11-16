import { useEffect, useRef, useState } from 'react'

/**
 * Los medidores de color (los «scopes» de Premiere y DaVinci) del cuadro que se ve en el monitor, ya con el color del
 * clip aplicado (los mismos filtros del monitor): forma de onda (luminancia de izquierda a derecha), vectorscopio
 * (tono y saturación, con la línea del tono de piel) e histograma (cuántos píxeles hay de cada brillo, por canal).
 * Miden el video del clip; las capas y los textos de encima no entran.
 */

type Vista = 'onda' | 'vector' | 'histo'
const NOMBRES: Record<Vista, string> = { onda: 'Forma de onda', vector: 'Vectorscopio', histo: 'Histograma' }
/** Tamaño de la muestra que se mide (basta para ver la forma; medir el cuadro entero cuesta). */
const MUESTRA_W = 256
const LADO = 180

export function Medidores({ video, filtro, tiempo, reproduciendo }: { video: HTMLVideoElement | null; filtro: string; tiempo: number; reproduciendo: boolean }) {
  const [vista, setVista] = useState<Vista>('onda')
  const lienzo = useRef<HTMLCanvasElement>(null)
  const muestra = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const medir = () => {
      const c = lienzo.current
      if (!c || !video || video.readyState < 2 || !video.videoWidth) return
      const w = MUESTRA_W
      const h = Math.max(16, Math.round((MUESTRA_W * video.videoHeight) / video.videoWidth))
      const m = (muestra.current ??= document.createElement('canvas'))
      m.width = w
      m.height = h
      const mc = m.getContext('2d', { willReadFrequently: true })
      if (!mc) return
      mc.filter = filtro || 'none'
      try {
        mc.drawImage(video, 0, 0, w, h)
      } catch {
        return
      }
      const datos = mc.getImageData(0, 0, w, h).data
      dibujar(c, vista, datos, w, h)
    }
    medir()
    // En reproducción, unas 8 veces por segundo; en pausa, cuando cambia el cuadro (y un momento después, por si aún cargaba).
    if (reproduciendo) {
      const id = setInterval(medir, 125)
      return () => clearInterval(id)
    }
    const id = setTimeout(medir, 250)
    return () => clearTimeout(id)
  }, [video, filtro, vista, reproduciendo, reproduciendo ? 0 : tiempo])

  return (
    <div className="medidores" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="medidores-pestanas" role="tablist">
        {(Object.keys(NOMBRES) as Vista[]).map((v) => (
          <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? 'is-on' : ''} onClick={() => setVista(v)}>
            {NOMBRES[v]}
          </button>
        ))}
      </div>
      <canvas ref={lienzo} width={vista === 'vector' ? LADO : MUESTRA_W} height={LADO} />
    </div>
  )
}

/** Dibuja el medidor elegido a partir de los píxeles RGBA de la muestra. */
function dibujar(c: HTMLCanvasElement, vista: Vista, px: Uint8ClampedArray, w: number, h: number): void {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const W = c.width
  const H = c.height
  const img = ctx.createImageData(W, H)
  const o = img.data
  const n = w * h

  if (vista === 'onda') {
    // Cada columna de la imagen, sus luminancias de abajo (negro) a arriba (blanco).
    const cuenta = new Uint32Array(W * 256)
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const y = Math.round(0.2126 * px[p] + 0.7152 * px[p + 1] + 0.0722 * px[p + 2])
      cuenta[(i % w) * 256 + y]++
    }
    const escala = 255 / Math.log1p(h / 6)
    for (let x = 0; x < W; x++) {
      for (let v = 0; v < 256; v++) {
        const k = cuenta[x * 256 + v]
        if (!k) continue
        const fila = Math.round((1 - v / 255) * (H - 1))
        const q = (fila * W + x) * 4
        const b = Math.min(255, Math.log1p(k) * escala)
        o[q] = b * 0.55
        o[q + 1] = b
        o[q + 2] = b * 0.55
        o[q + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    // Guías: 0, 25, 50, 75 y 100 %.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '9px sans-serif'
    for (const g of [0, 25, 50, 75, 100]) {
      const yy = Math.round((1 - g / 100) * (H - 1)) + 0.5
      ctx.beginPath()
      ctx.moveTo(0, yy)
      ctx.lineTo(W, yy)
      ctx.stroke()
      ctx.fillText(String(g), 2, Math.min(H - 2, Math.max(9, yy - 2)))
    }
    return
  }

  if (vista === 'vector') {
    // Cb y Cr (BT.709) en un círculo: el ángulo es el tono y la distancia al centro, la saturación.
    const cuenta = new Uint32Array(W * H)
    const r0 = W / 2
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const R = px[p]
      const G = px[p + 1]
      const B = px[p + 2]
      const cb = -0.1146 * R - 0.3854 * G + 0.5 * B
      const cr = 0.5 * R - 0.4542 * G - 0.0458 * B
      const x = Math.round(r0 + (cb / 128) * r0 * 0.95)
      const y = Math.round(r0 - (cr / 128) * r0 * 0.95)
      if (x >= 0 && x < W && y >= 0 && y < H) cuenta[y * W + x]++
    }
    const escala = 255 / Math.log1p(n / 400)
    for (let i = 0; i < W * H; i++) {
      if (!cuenta[i]) continue
      const b = Math.min(255, Math.log1p(cuenta[i]) * escala + 40)
      o[i * 4] = b * 0.6
      o[i * 4 + 1] = b
      o[i * 4 + 2] = b * 0.6
      o[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath()
    ctx.arc(r0, r0, r0 * 0.95, 0, Math.PI * 2)
    ctx.moveTo(r0, 2)
    ctx.lineTo(r0, H - 2)
    ctx.moveTo(2, r0)
    ctx.lineTo(W - 2, r0)
    ctx.stroke()
    // Dónde caen los colores puros al 75 % (rojo, magenta, azul, cian, verde, amarillo).
    ctx.font = '9px sans-serif'
    for (const [nombre, R, G, B] of [['R', 191, 0, 0], ['Mg', 191, 0, 191], ['B', 0, 0, 191], ['Cy', 0, 191, 191], ['G', 0, 191, 0], ['Yl', 191, 191, 0]] as const) {
      const cb = -0.1146 * R - 0.3854 * G + 0.5 * B
      const cr = 0.5 * R - 0.4542 * G - 0.0458 * B
      const x = r0 + (cb / 128) * r0 * 0.95
      const y = r0 - (cr / 128) * r0 * 0.95
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.strokeRect(x - 3, y - 3, 6, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillText(nombre, x + 5, y + 3)
    }
    // La línea del tono de piel (entre el rojo y el amarillo): las caras bien corregidas caen sobre ella.
    const piel = (-123 * Math.PI) / 180
    ctx.strokeStyle = 'rgba(255,190,140,0.5)'
    ctx.beginPath()
    ctx.moveTo(r0, r0)
    ctx.lineTo(r0 + Math.cos(piel) * r0 * 0.95, r0 + Math.sin(piel) * r0 * 0.95)
    ctx.stroke()
    return
  }

  // Histograma: rojo, verde y azul sumados (donde coinciden, se ve blanco).
  const r = new Uint32Array(256)
  const g = new Uint32Array(256)
  const b = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    const p = i * 4
    r[px[p]]++
    g[px[p + 1]]++
    b[px[p + 2]]++
  }
  let max = 1
  for (let v = 1; v < 255; v++) max = Math.max(max, r[v], g[v], b[v])
  ctx.clearRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  for (const [canal, color] of [[r, 'rgba(255,60,60,0.75)'], [g, 'rgba(60,255,60,0.75)'], [b, 'rgba(80,120,255,0.8)']] as const) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, H)
    for (let v = 0; v < 256; v++) ctx.lineTo((v / 255) * W, H - Math.min(1, canal[v] / max) * (H - 4))
    ctx.lineTo(W, H)
    ctx.closePath()
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}
