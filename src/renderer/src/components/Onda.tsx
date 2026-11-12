import { useEffect, useRef } from 'react'

/** Picos por segundo que se guardan de cada audio. */
const PPS = 50
const cache = new Map<string, Promise<Float32Array>>()
let contexto: AudioContext | null = null

/** Los picos de volumen de un audio (0 a 1, `PPS` por segundo). Se calcula una vez por archivo. */
function picosDe(url: string): Promise<Float32Array> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      const datos = await (await fetch(url)).arrayBuffer()
      contexto ??= new AudioContext()
      const audio = await contexto.decodeAudioData(datos)
      const canal = audio.getChannelData(0)
      const paso = Math.max(1, Math.floor(audio.sampleRate / PPS))
      const picos = new Float32Array(Math.ceil(canal.length / paso))
      for (let i = 0; i < picos.length; i++) {
        let max = 0
        const fin = Math.min(canal.length, (i + 1) * paso)
        // De cuatro en cuatro muestras: de sobra para dibujar y cuatro veces más rápido.
        for (let j = i * paso; j < fin; j += 4) {
          const v = Math.abs(canal[j])
          if (v > max) max = v
        }
        picos[i] = max
      }
      return picos
    })()
    // Si falla (un formato que no se puede leer), no se reintenta en cada dibujo: queda sin onda.
    p.catch(() => undefined)
    cache.set(url, p)
  }
  return p
}

/**
 * La onda de un audio, de fondo en su bloque de la línea de tiempo. Ocupa todo el bloque: `duracion` son los
 * segundos que representa su ancho y `desde`, el segundo del audio donde empieza.
 */
export function Onda({ url, duracion, desde = 0 }: { url: string; duracion: number; desde?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const lienzo = ref.current
    if (!lienzo) return
    let vivo = true
    let picos: Float32Array | null = null
    const dibujar = () => {
      if (!picos || !vivo) return
      const ancho = Math.min(4096, Math.round(lienzo.clientWidth))
      const alto = Math.round(lienzo.clientHeight)
      if (ancho < 2 || alto < 2) return
      lienzo.width = ancho
      lienzo.height = alto
      const g = lienzo.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, ancho, alto)
      g.fillStyle = getComputedStyle(lienzo).color
      const porPixel = (duracion * PPS) / ancho
      for (let x = 0; x < ancho; x++) {
        const a = Math.floor(desde * PPS + x * porPixel)
        const b = Math.max(a + 1, Math.floor(desde * PPS + (x + 1) * porPixel))
        let max = 0
        for (let i = a; i < b && i < picos.length; i++) if (picos[i] > max) max = picos[i]
        // Un poco de curva: lo suave también se ve.
        const h = Math.max(1, Math.round(Math.sqrt(max) * (alto - 2)))
        g.fillRect(x, (alto - h) / 2, 1, h)
      }
    }
    picosDe(url)
      .then((p) => {
        picos = p
        dibujar()
      })
      .catch(() => undefined)
    const observador = new ResizeObserver(dibujar)
    observador.observe(lienzo)
    return () => {
      vivo = false
      observador.disconnect()
    }
  }, [url, duracion, desde])
  return <canvas ref={ref} className="tl-onda" aria-hidden="true" />
}
