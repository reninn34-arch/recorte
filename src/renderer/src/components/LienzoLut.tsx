import { useEffect, useRef } from 'react'
import { leerCube, type Lut3D } from '../../../shared/lut'

const cache = new Map<string, Promise<Lut3D>>()
function cargarLut(url: string): Promise<Lut3D> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url).then(async (r) => leerCube(await r.text()))
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

const VERTICES = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`

// La imagen pasa por el LUT (trilineal, como lut3d de FFmpeg) y se mezcla con la original según la intensidad.
const FRAGMENTOS = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D imagen;
uniform sampler3D lut;
uniform float tamano;
uniform float intensidad;
in vec2 uv;
out vec4 color;
void main() {
  vec4 c = texture(imagen, uv);
  vec3 q = clamp(c.rgb, 0.0, 1.0) * ((tamano - 1.0) / tamano) + 0.5 / tamano;
  vec3 l = texture(lut, q).rgb;
  color = vec4(mix(c.rgb, l, intensidad), c.a);
}`

/**
 * El clip con su LUT, encima de su video o su foto (que queda oculto, pero sigue sonando): se dibuja cada cuadro con
 * WebGL, con el mismo LUT que el MP4. Lleva el mismo estilo (encuadre, color, curvas) que el elemento al que tapa.
 */
export function LienzoLut({
  url,
  intensidad,
  fuente,
  estilo
}: {
  url: string
  intensidad: number
  /** El video o la foto de donde se saca cada cuadro. */
  fuente: () => HTMLVideoElement | HTMLImageElement | null
  estilo: React.CSSProperties
}) {
  const lienzo = useRef<HTMLCanvasElement | null>(null)
  const fuenteRef = useRef(fuente)
  fuenteRef.current = fuente
  const intensidadRef = useRef(intensidad)
  intensidadRef.current = intensidad

  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const gl = c.getContext('webgl2', { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true })
    if (!gl) return
    let vivo = true
    let cuadro = 0
    const sombra = (tipo: number, codigo: string) => {
      const s = gl.createShader(tipo)!
      gl.shaderSource(s, codigo)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sombra(gl.VERTEX_SHADER, VERTICES))
    gl.attachShader(prog, sombra(gl.FRAGMENT_SHADER, FRAGMENTOS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      // Sin WebGL que sirva, el clip se ve sin LUT (el elemento de debajo vuelve a verse) y queda dicho por qué.
      c.dataset.error = gl.getProgramInfoLog(prog) ?? 'sin WebGL'
      return
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const p = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(p)
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0)
    const texImagen = gl.createTexture()
    const texLut = gl.createTexture()
    gl.uniform1i(gl.getUniformLocation(prog, 'imagen'), 0)
    gl.uniform1i(gl.getUniformLocation(prog, 'lut'), 1)
    const uTamano = gl.getUniformLocation(prog, 'tamano')
    const uIntensidad = gl.getUniformLocation(prog, 'intensidad')
    let listo = false

    cargarLut(url)
      .then((lut) => {
        if (!vivo) return
        const n = lut.tamano
        const datos = new Uint8Array(n * n * n * 4)
        for (let i = 0, j = 0; i < lut.datos.length; i += 3, j += 4) {
          datos[j] = Math.round(lut.datos[i] * 255)
          datos[j + 1] = Math.round(lut.datos[i + 1] * 255)
          datos[j + 2] = Math.round(lut.datos[i + 2] * 255)
          datos[j + 3] = 255
        }
        gl.activeTexture(gl.TEXTURE1)
        gl.bindTexture(gl.TEXTURE_3D, texLut)
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, datos)
        for (const e of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, e, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.uniform1f(uTamano, n)
        listo = true
      })
      .catch((e) => {
        c.dataset.error = e instanceof Error ? e.message : String(e)
      })

    const dibujar = () => {
      if (!vivo) return
      cuadro = requestAnimationFrame(dibujar)
      const el = fuenteRef.current()
      if (!listo || !el) return
      const w = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth
      const h = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight
      if (!w || !h || (el instanceof HTMLVideoElement && el.readyState < 2)) return
      // El lienzo mide lo que mide en pantalla; la imagen va dentro sin deformarse (como object-fit: contain).
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const cw = Math.max(2, Math.round(c.clientWidth * dpr))
      const ch = Math.max(2, Math.round(c.clientHeight * dpr))
      if (c.width !== cw || c.height !== ch) {
        c.width = cw
        c.height = ch
      }
      const k = Math.min(cw / w, ch / h)
      const vw = Math.round(w * k)
      const vh = Math.round(h * k)
      gl.viewport(0, 0, cw, ch)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.viewport(Math.round((cw - vw) / 2), Math.round((ch - vh) / 2), vw, vh)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texImagen)
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.uniform1f(uIntensidad, intensidadRef.current)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    cuadro = requestAnimationFrame(dibujar)
    return () => {
      vivo = false
      cancelAnimationFrame(cuadro)
      gl.deleteTexture(texImagen)
      gl.deleteTexture(texLut)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
    }
  }, [url])

  return <canvas ref={lienzo} className="monitor-imagen monitor-lut" style={estilo} aria-hidden="true" />
}
