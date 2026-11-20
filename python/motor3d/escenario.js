// escenario.js — el motor 3D de los estilos de Recorte (Three.js). Escrito para Recorte desde cero.
//
// La idea: cada cuadro del video es el PROMEDIO de muchas pasadas de render de la misma escena. Entre una pasada y
// otra se mueven un poco el tiempo (estela de movimiento), la cámara dentro de su lente (desenfoque real), las luces
// dentro de su superficie (sombras suaves) y el píxel dentro de sí mismo (bordes limpios). Nada de trucos de
// postproceso para eso: sale de la física, por eso se ve filmado. Encima va un acabado de cine: brillo (bloom),
// curva de tono, color, viñeta y grano.
//
// Reglas para que funcione:
//   - la escena se describe con una función actualizar(t) que deja TODO como está en el segundo t. El motor la llama
//     varias veces por cuadro, con tiempos un poco distintos: nada puede acumularse de una llamada a otra.
//   - nada de Math.random ni Date: para variar, U.azar(semilla).
//
//   import * as THREE from 'three'
//   import { crearEscenario, U } from './escenario.js'
//   const E = crearEscenario(canvas, { ancho: 1080, alto: 1920, muestras: 32, tono: 'neutro' })
//   E.entorno({ arriba: '#9cc6e8', horizonte: '#ffe1c2', abajo: '#7a8f6a' })
//   E.sol({ desde: [-6, 4, 3], color: '#ffd9a8', potencia: 3, suave: 1.5 })
//   E.cielo({ color: '#bcd6ff', potencia: 0.8 })
//   E.alActualizar((t) => { ...; E.camara([0, 3, 9], [0, 1, 0]); E.enfoque([0, 1, 0], 0.05) })
//   E.ver(2.5)                       // dibuja el segundo 2.5 en el canvas
//   conectarHyperFrames(E)           // el video lo renderiza HyperFrames, cuadro por cuadro
import * as THREE from 'three'

// ---------------------------------------------------------------------------------------------------------------
// U: utilidades de animación y de forma
// ---------------------------------------------------------------------------------------------------------------
export const U = {}
U.limitar = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
U.mezcla = (a, b, k) => a + (b - a) * k
U.mapa = (x, a, b, c, d) => c + (d - c) * U.limitar((x - a) / (b - a))
U.suave = (a, b, x) => { const k = U.limitar((x - a) / (b - a)); return k * k * (3 - 2 * k) }
/** Cuánto va de un tramo [a, b] en el segundo t (0..1), con una curva opcional. */
U.tramo = (t, a, b, curva) => { const k = U.limitar((t - a) / (b - a)); return curva ? curva(k) : k }
U.curva = {
  lineal: (k) => k,
  entra: (k) => k * k * k,
  sale: (k) => 1 - (1 - k) ** 3,
  entraSale: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  saleFuerte: (k) => 1 - (1 - k) ** 5,
  entraSaleFuerte: (k) => (k < 0.5 ? 16 * k ** 5 : 1 - (-2 * k + 2) ** 5 / 2),
  saleAtras: (k, s = 1.6) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2,
  saleElastico: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * 2.0944) + 1),
  rebote: (k) => {
    const g = 7.5625
    if (k < 1 / 2.75) return g * k * k
    if (k < 2 / 2.75) return g * (k -= 1.5 / 2.75) * k + 0.75
    if (k < 2.5 / 2.75) return g * (k -= 2.25 / 2.75) * k + 0.9375
    return g * (k -= 2.625 / 2.75) * k + 0.984375
  },
}
/** Un resorte que va de 0 a 1 desde t = 0: frecuencia en Hz, amortiguación 0..1 (1 = sin pasarse). */
U.resorte = (t, frec = 2.2, amort = 0.45) => {
  if (t <= 0) return 0
  const w = 2 * Math.PI * frec
  if (amort >= 1) return 1 - Math.exp(-w * t) * (1 + w * t)
  const wd = w * Math.sqrt(1 - amort * amort)
  return 1 - Math.exp(-amort * w * t) * (Math.cos(wd * t) + ((amort * w) / wd) * Math.sin(wd * t))
}
const comoLista = (v) => (Array.isArray(v) ? v : [v])
/** Claves [[t, valor, curva?], ...] → f(t). Se detiene en cada clave; la curva de una clave da forma al viaje hacia ella. */
U.pista = (claves) => (t) => {
  if (t <= claves[0][0]) return claves[0][1]
  for (let i = 1; i < claves.length; i++) {
    const [t1, v1, c] = claves[i]
    if (t > t1) continue
    const [t0, v0] = claves[i - 1]
    const k = (typeof c === 'function' ? c : U.curva[c || 'entraSale'])((t - t0) / (t1 - t0))
    return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * k) : v0 + (v1 - v0) * k
  }
  return claves[claves.length - 1][1]
}
/** Como pista, pero PASA por las claves sin frenar (solo arranca y llega suave): para un plano de cámara continuo. */
U.camino = (claves) => {
  const n = claves.length, arr = Array.isArray(claves[0][1])
  const V = claves.map((c) => comoLista(c[1])), T = claves.map((c) => c[0])
  const tg = V.map((v, i) => (i === 0 || i === n - 1 ? v.map(() => 0) : v.map((_, j) => (V[i + 1][j] - V[i - 1][j]) / (T[i + 1] - T[i - 1]))))
  return (t) => {
    if (t <= T[0]) return claves[0][1]
    if (t >= T[n - 1]) return claves[n - 1][1]
    let i = 1
    while (T[i] < t) i++
    const h = T[i] - T[i - 1], k = (t - T[i - 1]) / h, k2 = k * k, k3 = k2 * k
    const r = V[i].map((_, j) => (2 * k3 - 3 * k2 + 1) * V[i - 1][j] + (k3 - 2 * k2 + k) * h * tg[i - 1][j] + (-2 * k3 + 3 * k2) * V[i][j] + (k3 - k2) * h * tg[i][j])
    return arr ? r : r[0]
  }
}
/** Azar con semilla (mulberry32): siempre la misma secuencia para la misma semilla. */
U.azar = (semilla = 1) => {
  let s = typeof semilla === 'string' ? [...semilla].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 7) : semilla >>> 0
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
  r.rango = (a, b) => a + (b - a) * r()
  r.entero = (a, b) => Math.floor(a + (b - a + 1) * r())
  r.elige = (lista) => lista[Math.floor(r() * lista.length)]
  r.prob = (p) => r() < p
  r.signo = () => (r() < 0.5 ? -1 : 1)
  return r
}
/** Un número 0..1 estable para cada combinación de hasta tres números (variar sin guardar listas). */
U.hash = (a, b = 0, c = 0) => {
  let h = Math.imul(Math.floor(a * 73856.093) ^ Math.imul(Math.floor(b * 19349.663), 3) ^ Math.imul(Math.floor(c * 83492.791), 7), 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}
/** Ruido suave en 3D (gradientes en una red, interpolación quíntica) y su versión en capas (fbm). Valores ~ -1..1. */
U.ruido = (semilla = 1) => {
  const r = U.azar(semilla), P = new Uint8Array(512), G = []
  const base = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [base[i], base[j]] = [base[j], base[i]] }
  for (let i = 0; i < 512; i++) P[i] = base[i & 255]
  for (let i = 0; i < 256; i++) { const z = r() * 2 - 1, a = r() * 6.2832, q = Math.sqrt(1 - z * z); G.push([q * Math.cos(a), q * Math.sin(a), z]) }
  const q5 = (k) => k * k * k * (k * (k * 6 - 15) + 10)
  const n3 = (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), fx = x - X, fy = y - Y, fz = z - Z
    const u = q5(fx), v = q5(fy), w = q5(fz)
    let s = 0
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1
      const g = G[P[P[P[(X + dx) & 255] + ((Y + dy) & 255)] + ((Z + dz) & 255)]]
      const d = g[0] * (fx - dx) + g[1] * (fy - dy) + g[2] * (fz - dz)
      s += d * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w)
    }
    return s * 1.6
  }
  const capas = (x, y, z = 0, n = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < n; i++) { s += a * n3(x * f, y * f, z * f); a *= 0.5; f *= 2.03 } return s }
  return { n3, n2: (x, y) => n3(x, y, 0.37), capas }
}
/** Una textura dibujada con canvas 2D: U.lienzo(512, 512, (ctx, w, h) => {...}, { datos, repetir: [x, y] }). */
U.lienzo = (w, h, dibuja, op = {}) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: Boolean(op.datos) })
  if (dibuja) dibuja(ctx, w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = op.datos ? THREE.NoColorSpace : THREE.SRGBColorSpace
  tex.anisotropy = 8
  if (op.repetir) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(op.repetir[0], op.repetir[1]) }
  tex.redibujar = (fn) => { ctx.clearRect(0, 0, w, h); fn(ctx, w, h); tex.needsUpdate = true }
  return tex
}
/**
 * Texto plano dentro del mundo 3D. alto = alto en el mundo de una línea. op: fuente ('700 160px "Inter"'), color,
 * alinear, interlinea, espaciado (px), brillo (multiplica para que encienda el bloom), iluminado (toma luz y sombra).
 */
U.textoPlano = (texto, op = {}) => {
  const fuente = op.fuente || '700 160px "Inter"', px = Number((/(\d+(?:\.\d+)?)px/.exec(fuente) || [0, 160])[1])
  const lineas = String(texto).split('\n'), lh = (op.interlinea || 1.15) * px, margen = Math.ceil(px * 0.2)
  const med = document.createElement('canvas').getContext('2d')
  med.font = fuente
  if (op.espaciado) med.letterSpacing = op.espaciado + 'px'
  const w = Math.ceil(Math.max(...lineas.map((l) => med.measureText(l).width))) + margen * 2, h = Math.ceil(lh * lineas.length) + margen * 2
  const tex = U.lienzo(w, h, (ctx) => {
    ctx.font = fuente
    if (op.espaciado) ctx.letterSpacing = op.espaciado + 'px'
    ctx.textBaseline = 'middle'
    ctx.textAlign = op.alinear || 'center'
    ctx.fillStyle = op.color || '#fff'
    const x = op.alinear === 'left' ? margen : op.alinear === 'right' ? w - margen : w / 2
    lineas.forEach((l, i) => ctx.fillText(l, x, margen + lh * (i + 0.5)))
  })
  const k = (op.alto || 1) / lh
  const mat = op.iluminado
    ? new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.03, roughness: 0.85 })
    : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  if (op.brillo && !op.iluminado) mat.color.setScalar(op.brillo)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), mat)
  m.userData.tam = [w * k, h * k]
  return m
}
/**
 * Carga una fuente de Google para dibujar con ella en canvas (rótulos, papel impreso): await U.fuente('Fraunces', 700).
 * Usa los archivos de Fontsource en jsDelivr; con url se puede dar otra.
 */
U.fuente = async (familia, peso = 700, url) => {
  const id = familia.toLowerCase().replace(/\s+/g, '-')
  const f = new FontFace(familia, `url(${url || `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${peso}-normal.woff`})`, { weight: String(peso) })
  await f.load()
  document.fonts.add(f)
  return `${peso} 100px "${familia}"`
}
/** Pone la instancia i de un InstancedMesh. Después de una tanda: malla.instanceMatrix.needsUpdate = true. */
const _o = new THREE.Object3D()
U.colocar = (malla, i, pos, rot, esc = 1) => {
  _o.position.set(pos[0], pos[1], pos[2])
  rot ? _o.rotation.set(rot[0], rot[1], rot[2]) : _o.rotation.set(0, 0, 0)
  typeof esc === 'number' ? _o.scale.setScalar(esc) : _o.scale.set(esc[0], esc[1], esc[2])
  _o.updateMatrix()
  malla.setMatrixAt(i, _o.matrix)
}

// ---------------------------------------------------------------------------------------------------------------
// Secuencias de muestreo: R2 (constante plástica). Cada uso (lente, píxel, luces, tiempo) lleva su propio desfase,
// así no se correlacionan entre sí.
// ---------------------------------------------------------------------------------------------------------------
const R2A = 0.7548776662466927, R2B = 0.5698402909980532
const r2 = (i, off) => [(off[0] + i * R2A) % 1, (off[1] + i * R2B) % 1]
const OFF = { pixel: [0.5, 0.5], lente: [0.17, 0.83], luz: [0.61, 0.29], cielo: [0.37, 0.71], escena: [0.89, 0.13] }
const tiempoDe = (i, n) => ((0.5 + i * 0.6180339887) % 1) // golden ratio: el tiempo del obturador sin repetirse

// ---------------------------------------------------------------------------------------------------------------
// Pasadas de pantalla completa
// ---------------------------------------------------------------------------------------------------------------
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
const pasada = (frag, uniforms = {}) =>
  new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'precision highp float;\nvarying vec2 vUv;\n' + frag, uniforms, depthTest: false, depthWrite: false })

// Curvas de tono. «neutro»: deja los colores como son y solo suaviza las altas luces (ideal para materiales con
// color propio: papel, plastilina). «cine»: contraste y saturación de película (ACES aproximado). «suave»: comprime
// sin quemar, desatura las luces muy fuertes (neón, brillos).
const TONOS = `
vec3 tonoNeutro(vec3 c){
  float m = min(c.r, min(c.g, c.b));
  c -= m < 0.08 ? m - 6.25 * m * m : 0.04;
  float p = max(c.r, max(c.g, c.b));
  if (p < 0.76) return c;
  float q = 1.0 - 0.0576 / (p - 0.52);
  c *= q / p;
  return mix(c, vec3(q), 1.0 - 1.0 / (0.15 * (p - q) + 1.0));
}
vec3 tonoCine(vec3 c){
  c *= 0.6;
  return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}
vec3 tonoSuave(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 r = c / (1.0 + l);
  float k = smoothstep(0.6, 4.0, l);
  return mix(r * 1.25, vec3(l / (1.0 + l)) * 1.25, k * 0.5);
}`

// ---------------------------------------------------------------------------------------------------------------
// El escenario
// ---------------------------------------------------------------------------------------------------------------
const ACABADO = {
  muestras: 32, // pasadas por cuadro al renderizar el video (en vivo se usan 2-4)
  obturador: 0.5, // fracción del cuadro con el obturador abierto: estela de movimiento (0 = nada, stop-motion)
  fps: 30,
  exposicion: 1,
  tono: 'cine', // 'neutro' | 'cine' | 'suave' | 'ninguno'
  brillo: 0.2, // bloom: cuánto
  umbral: 1, // bloom: desde qué luz
  vineta: 0.25,
  grano: 0.025,
  saturacion: 1,
  contraste: 1,
  levantar: 0, // aclara las sombras (look de papel, polvo)
  aberracion: 0, // aberración cromática en los bordes
  fov: 35,
  cerca: 0.1,
  lejos: 300,
  fondo: '#000000',
  sombras: true,
}

export function crearEscenario(canvas, opciones = {}) {
  const A = Object.assign({}, ACABADO, opciones)
  const W = A.ancho || canvas.width || 1920, H = A.alto || canvas.height || 1080
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(1)
  renderer.setSize(W, H, false)
  renderer.toneMapping = THREE.NoToneMapping
  renderer.shadowMap.enabled = A.sombras
  renderer.shadowMap.type = THREE.PCFShadowMap
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(A.fondo)
  const camera = new THREE.PerspectiveCamera(A.fov, W / H, A.cerca, A.lejos)
  camera.position.set(0, 2, 8)
  const lente = { foco: 8, apertura: 0 }

  const E = { THREE, U, renderer, scene, camera, W, H, A, duracion: A.duracion || 6, pasada: { i: 0, n: 1, k: [0.5, 0.5] } }
  const suaves = [], cielos = [], filtros = []
  let actualizar = () => {}, encima = null

  // --- render targets
  const msaa = A.muestras >= 8 ? 0 : 4
  const rtEscena = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: msaa })
  const rtSuma = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))
  quad.frustumCulled = false
  const qEscena = new THREE.Scene()
  qEscena.add(quad)
  const qCam = new THREE.Camera()
  const dibujar = (mat, destino) => { quad.material = mat; renderer.setRenderTarget(destino); renderer.render(qEscena, qCam) }

  // suma: cada pasada aporta peso/n; se recortan los destellos sueltos para que no manchen el promedio
  const mSuma = pasada('uniform sampler2D t; uniform float peso; void main(){ gl_FragColor = vec4(min(texture2D(t, vUv).rgb, vec3(40.0)) * peso, peso); }', { t: { value: rtEscena.texture }, peso: { value: 1 } })
  mSuma.transparent = true
  mSuma.blending = THREE.CustomBlending
  mSuma.blendEquation = THREE.AddEquation
  mSuma.blendSrc = THREE.OneFactor
  mSuma.blendDst = THREE.OneFactor

  // bloom: lo que pasa del umbral, bajado en una escalera de mitades y subido sumando cada peldaño
  const peldanos = []
  for (let w = W >> 1, h = H >> 1; peldanos.length < 6 && w > 8 && h > 8; w >>= 1, h >>= 1) {
    const o = { type: THREE.HalfFloatType, depthBuffer: false }
    peldanos.push({ baja: new THREE.WebGLRenderTarget(w, h, o), sube: new THREE.WebGLRenderTarget(w, h, o), w, h })
  }
  const mLuces = pasada(`uniform sampler2D t; uniform float u; uniform vec2 px;
    void main(){
      vec3 c = (texture2D(t, vUv + px * vec2(-0.5)).rgb + texture2D(t, vUv + px * vec2(0.5)).rgb + texture2D(t, vUv + px * vec2(0.5, -0.5)).rgb + texture2D(t, vUv + px * vec2(-0.5, 0.5)).rgb) * 0.25;
      float l = max(c.r, max(c.g, c.b));
      gl_FragColor = vec4(c * smoothstep(u, u * 1.6 + 0.001, l), 1.0);
    }`, { t: { value: null }, u: { value: A.umbral }, px: { value: new THREE.Vector2(1 / W, 1 / H) } })
  const mBaja = pasada(`uniform sampler2D t; uniform vec2 px;
    void main(){
      vec3 a = texture2D(t, vUv + px * vec2(-1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, -1.0)).rgb + texture2D(t, vUv + px * vec2(-1.0, 1.0)).rgb + texture2D(t, vUv + px * vec2(1.0, 1.0)).rgb;
      vec3 b = texture2D(t, vUv).rgb;
      gl_FragColor = vec4(a * 0.125 + b * 0.5, 1.0);
    }`, { t: { value: null }, px: { value: new THREE.Vector2() } })
  const mSube = pasada(`uniform sampler2D t, mas; uniform vec2 px;
    void main(){
      vec3 s = texture2D(t, vUv).rgb * 4.0;
      s += (texture2D(t, vUv + vec2(px.x, 0.0)).rgb + texture2D(t, vUv - vec2(px.x, 0.0)).rgb + texture2D(t, vUv + vec2(0.0, px.y)).rgb + texture2D(t, vUv - vec2(0.0, px.y)).rgb) * 2.0;
      s += texture2D(t, vUv + px).rgb + texture2D(t, vUv - px).rgb + texture2D(t, vUv + vec2(px.x, -px.y)).rgb + texture2D(t, vUv + vec2(-px.x, px.y)).rgb;
      gl_FragColor = vec4(s / 16.0 + texture2D(mas, vUv).rgb, 1.0);
    }`, { t: { value: null }, mas: { value: null }, px: { value: new THREE.Vector2() } })

  // revelado: exposición, bloom, tono, color, viñeta y paso a sRGB (8 bits)
  const rtA = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false }), rtB = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false })
  const mRevelado = pasada(TONOS + `
    uniform sampler2D t, luz; uniform float expo, kBrillo, vin, sat, con, lev, abe; uniform int tono;
    vec3 aSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 d = vUv - 0.5;
      vec3 c;
      if (abe > 0.0) { float r2 = dot(d, d); c = vec3(texture2D(t, 0.5 + d * (1.0 + abe * r2)).r, texture2D(t, vUv).g, texture2D(t, 0.5 + d * (1.0 - abe * r2)).b); }
      else c = texture2D(t, vUv).rgb;
      c += texture2D(luz, vUv).rgb * kBrillo;
      c = max(c * expo, 0.0);
      c = tono == 0 ? tonoNeutro(c) : tono == 1 ? tonoCine(c) : tono == 2 ? tonoSuave(c) : c;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * con + 0.5;
      c += lev * (1.0 - c);
      c *= 1.0 - vin * smoothstep(0.25, 0.85, length(d * vec2(1.0, 0.85)));
      gl_FragColor = vec4(aSRGB(clamp(c, 0.0, 1.0)), 1.0);
    }`, { t: { value: rtSuma.texture }, luz: { value: null }, expo: { value: 1 }, kBrillo: { value: 0 }, vin: { value: 0 }, sat: { value: 1 }, con: { value: 1 }, lev: { value: 0 }, abe: { value: 0 }, tono: { value: 1 } })

  // final: grano (distinto en cada cuadro, más en las sombras) y lo dibujado encima en 2D
  const lienzoEncima = document.createElement('canvas')
  lienzoEncima.width = W
  lienzoEncima.height = H
  const ctxEncima = lienzoEncima.getContext('2d')
  const texEncima = new THREE.CanvasTexture(lienzoEncima)
  texEncima.colorSpace = THREE.NoColorSpace
  texEncima.premultiplyAlpha = true
  texEncima.generateMipmaps = false
  texEncima.minFilter = THREE.LinearFilter
  const mFinal = pasada(`uniform sampler2D t, sobre; uniform float grano, semilla, haySobre;
    float h(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main(){
      vec3 c = texture2D(t, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += (h(gl_FragCoord.xy + semilla) + h(gl_FragCoord.xy * 1.31 - semilla) - 1.0) * grano * mix(1.0, 0.45, l);
      c += (h(gl_FragCoord.xy * 0.73 + semilla * 3.1) - 0.5) / 255.0;
      if (haySobre > 0.5) { vec4 o = texture2D(sobre, vUv); c = o.rgb + c * (1.0 - o.a); }
      gl_FragColor = vec4(c, 1.0);
    }`, { t: { value: null }, sobre: { value: texEncima }, grano: { value: 0 }, semilla: { value: 0 }, haySobre: { value: 0 } })

  // --- una pasada de la escena, en el segundo t, con la muestra i de n
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), der = new THREE.Vector3(), arr = new THREE.Vector3()
  function pasadaEscena(t, i, n) {
    // la escena puede saber qué pasada es (para desenfocar un reflejo, por ejemplo): E.pasada = { i, n, k: [0..1, 0..1] }
    E.pasada = { i, n, k: n > 1 ? r2(i, OFF.escena) : [0.5, 0.5] }
    actualizar(t)
    const guardadas = []
    if (n > 1) {
      // luces con superficie: cada pasada sale de otro punto del disco de la luz → sombras de borde suave
      suaves.forEach((s, k) => {
        const l = s.luz, [a, b] = r2(i, [(OFF.luz[0] + k * 0.31) % 1, (OFF.luz[1] + k * 0.57) % 1])
        guardadas.push([l, l.position.clone()])
        v1.copy(l.position).sub(l.target ? l.target.position : v2.set(0, 0, 0)).normalize()
        der.set(0, 1, 0).cross(v1)
        if (der.lengthSq() < 1e-6) der.set(1, 0, 0)
        der.normalize()
        arr.crossVectors(v1, der)
        const r = Math.sqrt(a) * s.radio, ang = 6.2832 * b
        l.position.addScaledVector(der, Math.cos(ang) * r).addScaledVector(arr, Math.sin(ang) * r)
      })
    }
    // luz de cielo: llega de toda la cúpula (una dirección por pasada, repartida como coseno) y los objetos la tapan
    cielos.forEach((s, k) => {
      const c = s.luz.target.position
      if (n === 1) { s.luz.position.set(c.x + 0.2 * s.dist, c.y + s.dist, c.z + 0.15 * s.dist); return }
      const [a, b] = r2(i, [(OFF.cielo[0] + k * 0.43) % 1, (OFF.cielo[1] + k * 0.19) % 1])
      const sen = Math.sqrt(a) * s.abierto, cos = Math.sqrt(Math.max(0, 1 - sen * sen)), ang = 6.2832 * b
      s.luz.position.set(c.x + Math.cos(ang) * sen * s.dist, c.y + cos * s.dist, c.z + Math.sin(ang) * sen * s.dist)
    })
    // lente: la cámara se corre dentro de su apertura y el encuadre se inclina para que el plano de foco no se mueva
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    const pos = camera.position.clone(), e = camera.projectionMatrix.elements
    if (n > 1) {
      if (lente.apertura > 0) {
        const [a, b] = r2(i, OFF.lente), r = Math.sqrt(a) * lente.apertura, ang = 6.2832 * b
        const dx = Math.cos(ang) * r, dy = Math.sin(ang) * r, f = Math.max(0.05, lente.foco)
        der.setFromMatrixColumn(camera.matrixWorld, 0)
        arr.setFromMatrixColumn(camera.matrixWorld, 1)
        camera.position.addScaledVector(der, dx).addScaledVector(arr, dy)
        camera.updateMatrixWorld()
        e[8] -= (e[0] * dx) / f
        e[9] -= (e[5] * dy) / f
      }
      const [px, py] = r2(i, OFF.pixel)
      e[8] += ((px - 0.5) * 2) / W
      e[9] += ((py - 0.5) * 2) / H
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
    }
    renderer.setRenderTarget(rtEscena)
    renderer.render(scene, camera)
    camera.position.copy(pos)
    camera.updateMatrixWorld()
    camera.updateProjectionMatrix()
    for (const [l, p] of guardadas) l.position.copy(p)
  }

  /** Dibuja el cuadro del segundo t en el canvas. muestras: cuántas pasadas (por defecto, las del acabado). */
  E.ver = (t, muestras) => {
    const n = Math.max(1, muestras || A.muestras)
    renderer.setRenderTarget(rtSuma)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    mSuma.uniforms.peso.value = 1 / n
    for (let i = 0; i < n; i++) {
      const ti = n > 1 && A.obturador > 0 ? t + (tiempoDe(i, n) - 0.5) * (A.obturador / A.fps) : t
      pasadaEscena(U.limitar(ti, 0, E.duracion), i, n)
      renderer.autoClear = false
      dibujar(mSuma, rtSuma)
      renderer.autoClear = true
    }
    E.pasada = { i: 0, n: 1, k: [0.5, 0.5] }
    actualizar(t)
    let luz = null
    if (A.brillo > 0 && peldanos.length) {
      mLuces.uniforms.t.value = rtSuma.texture
      mLuces.uniforms.u.value = A.umbral
      dibujar(mLuces, peldanos[0].baja)
      for (let k = 1; k < peldanos.length; k++) {
        mBaja.uniforms.t.value = peldanos[k - 1].baja.texture
        mBaja.uniforms.px.value.set(1 / peldanos[k - 1].w, 1 / peldanos[k - 1].h)
        dibujar(mBaja, peldanos[k].baja)
      }
      let abajo = peldanos[peldanos.length - 1].baja
      for (let k = peldanos.length - 2; k >= 0; k--) {
        mSube.uniforms.t.value = abajo.texture
        mSube.uniforms.mas.value = peldanos[k].baja.texture
        mSube.uniforms.px.value.set(1 / abajo.width, 1 / abajo.height)
        dibujar(mSube, peldanos[k].sube)
        abajo = peldanos[k].sube
      }
      luz = abajo.texture
    }
    const u = mRevelado.uniforms
    u.luz.value = luz
    u.kBrillo.value = luz ? A.brillo / peldanos.length : 0
    u.expo.value = A.exposicion
    u.vin.value = A.vineta
    u.sat.value = A.saturacion
    u.con.value = A.contraste
    u.lev.value = A.levantar
    u.abe.value = A.aberracion
    u.tono.value = { neutro: 0, cine: 1, suave: 2, ninguno: 3 }[A.tono] ?? 1
    dibujar(mRevelado, rtA)
    let src = rtA, dst = rtB
    for (const f of filtros) {
      f.uniforms.t.value = src.texture
      f.uniforms.tiempo.value = t
      dibujar(f, dst)
      ;[src, dst] = [dst, src]
    }
    const fu = mFinal.uniforms
    fu.t.value = src.texture
    fu.grano.value = A.grano
    fu.semilla.value = (Math.round(t * A.fps) * 37) % 997
    if (encima) {
      ctxEncima.clearRect(0, 0, W, H)
      ctxEncima.save()
      encima(ctxEncima, t, W, H)
      ctxEncima.restore()
      texEncima.needsUpdate = true
      fu.haySobre.value = 1
    } else fu.haySobre.value = 0
    dibujar(mFinal, null)
  }

  E.alActualizar = (fn) => { actualizar = fn }
  /** Algo dibujado en 2D por encima de todo (rótulos nítidos): fn(ctx, t, W, H). */
  E.encima = (fn) => { encima = fn }
  /** Un filtro sobre la imagen ya revelada (pintura, tramado, semitono...). El shader recibe t, res, tiempo y vUv. */
  E.filtro = (frag, uniforms = {}) => {
    const m = pasada('uniform sampler2D t; uniform vec2 res; uniform float tiempo;\n' + frag, Object.assign({ t: { value: null }, res: { value: new THREE.Vector2(W, H) }, tiempo: { value: 0 } }, uniforms))
    filtros.push(m)
    return m
  }
  /** Coloca la cámara: posición, punto al que mira, fov y giro opcionales. */
  E.camara = (pos, mira, fov, giro) => {
    camera.position.set(pos[0], pos[1], pos[2])
    camera.up.set(0, 1, 0)
    camera.lookAt(mira[0], mira[1], mira[2])
    if (giro) camera.rotateZ(giro)
    if (fov && fov !== camera.fov) { camera.fov = fov; camera.updateProjectionMatrix() }
  }
  /** El foco: una distancia o un punto [x, y, z] que queda nítido, y la apertura (radio de la lente en el mundo; 0 = todo nítido). */
  E.enfoque = (en, apertura) => {
    lente.foco = typeof en === 'number' ? en : v1.set(en[0], en[1], en[2]).distanceTo(camera.position)
    if (apertura != null) lente.apertura = apertura
  }

  // --- luces
  /**
   * Entorno hecho en código (sin archivos HDR): un cielo en degradado y paneles de luz (ventanas, softboxes, el sol)
   * para que haya reflejos y relleno. op: arriba, horizonte, abajo, paneles: [{ pos, tam: [w, h], color, potencia,
   * redondo }], intensidad, verFondo (mostrarlo detrás), desenfoqueFondo.
   */
  E.entorno = (op = {}) => {
    const s = new THREE.Scene()
    s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { a: { value: new THREE.Color(op.arriba || '#20242c') }, h: { value: new THREE.Color(op.horizonte || op.arriba || '#30343c') }, b: { value: new THREE.Color(op.abajo || '#0c0d10') } },
      vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 a, h, b; varying vec3 d; void main(){ float y = normalize(d).y; gl_FragColor = vec4(y > 0.0 ? mix(h, a, pow(y, 0.55)) : mix(h, b, pow(-y, 0.45)), 1.0); }',
    })))
    for (const p of op.paneles || []) {
      const tam = p.tam || [4, 4]
      const m = new THREE.Mesh(p.redondo ? new THREE.CircleGeometry(tam[0] / 2, 32) : new THREE.PlaneGeometry(tam[0], tam[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color || '#fff').multiplyScalar(p.potencia ?? 4), side: THREE.DoubleSide }))
      m.position.set(p.pos[0], p.pos[1], p.pos[2])
      m.lookAt(0, 0, 0)
      s.add(m)
    }
    const pm = new THREE.PMREMGenerator(renderer)
    const tex = pm.fromScene(s, op.desenfoque ?? 0.03, 0.1, 120).texture
    pm.dispose()
    scene.environment = tex
    scene.environmentIntensity = op.intensidad ?? 1
    if (op.verFondo) { scene.background = tex; scene.backgroundBlurriness = op.desenfoqueFondo ?? 0.4 }
    return tex
  }
  const sombra = (l, op, tam) => {
    l.castShadow = op.sombra !== false
    l.shadow.mapSize.setScalar(op.mapa || 2048)
    l.shadow.bias = op.sesgo ?? -0.0004
    l.shadow.normalBias = op.sesgoNormal ?? 0.02
    if (tam) { const c = l.shadow.camera; c.left = c.bottom = -tam; c.right = c.top = tam; c.near = 0.5; c.far = op.lejos || 100 }
  }
  /** El sol: luz paralela con sombras. op: desde, hacia, color, potencia, cubre (medio ancho con sombra), suave (radio de la luz). */
  E.sol = (op = {}) => {
    const l = new THREE.DirectionalLight(op.color || '#fff', op.potencia ?? 3)
    l.position.set(...(op.desde || [6, 10, 5]))
    l.target.position.set(...(op.hacia || [0, 0, 0]))
    sombra(l, op, op.cubre || 10)
    scene.add(l, l.target)
    if (op.suave) suaves.push({ luz: l, radio: op.suave })
    return l
  }
  /** Un foco con sombras y tamaño real. op: desde, hacia, color, potencia, angulo, penumbra, suave, cerca, lejos. */
  E.foco = (op = {}) => {
    const l = new THREE.SpotLight(op.color || '#fff', op.potencia ?? 80, 0, op.angulo ?? 0.5, op.penumbra ?? 0.6, 2)
    l.position.set(...(op.desde || [3, 6, 4]))
    l.target.position.set(...(op.hacia || [0, 0, 0]))
    sombra(l, op)
    l.shadow.camera.near = op.cerca || 0.5
    l.shadow.camera.far = op.lejos || 60
    scene.add(l, l.target)
    if (op.suave) suaves.push({ luz: l, radio: op.suave })
    return l
  }
  /**
   * Luz de cielo con oclusión de verdad: viene de toda la cúpula y lo que está debajo de algo o en un rincón la
   * recibe menos (sombras de contacto suaves). op: color, potencia, cubre, centro, abierto (1 = toda la cúpula).
   */
  E.cielo = (op = {}) => {
    const l = new THREE.DirectionalLight(op.color || '#fff', op.potencia ?? 1)
    const dist = op.dist || 30
    sombra(l, { ...op, mapa: op.mapa || 1024, sesgo: op.sesgo ?? -0.0006, sesgoNormal: op.sesgoNormal ?? 0.03, lejos: dist * 2 }, op.cubre || 10)
    l.castShadow = true
    l.target.position.set(...(op.centro || [0, 0, 0]))
    scene.add(l, l.target)
    cielos.push({ luz: l, dist, abierto: op.abierto ?? 0.95 })
    return l
  }
  return E
}

/**
 * Lo conecta con HyperFrames: cada vez que el render pide un cuadro (evento hf-seek), se dibuja ese segundo con
 * todas sus muestras. También deja window.verEn(t) y window.DURACION para probar en el navegador.
 */
export function conectarHyperFrames(E, muestras) {
  const ver = (t) => E.ver(t, muestras)
  window.addEventListener('hf-seek', (ev) => ver(ev.detail.time))
  window.verEn = ver
  window.DURACION = E.duracion
  ver(window.__hfThreeTime || 0)
}
