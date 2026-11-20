// El material del estilo Plastilina, para cualquier escena: la superficie con huellas, el material, las manos que
// amasan, el set de cartulina y el reloj del stop-motion. Lo usan escena.js y cualquier escena nueva del estilo.
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { U } from './escenario.js'

// ---- el reloj del stop-motion: la plastilina vive en poses (POSES por segundo); la cámara, en tiempo real
export function reloj(POSES) {
  return {
    pose: (t) => Math.floor(t * POSES + 1e-4) / POSES,
    desde: (tp, t0) => Math.round((tp - t0) * POSES), // poses desde un evento (negativo: antes)
    tiembla: (id, tp, cuanto) => (U.hash(id, Math.round(tp * POSES)) - 0.5) * 2 * cuanto, // cambia en cada pose
  }
}
// al tocar algo blando: primero se aplasta, se estira de más y se asienta (escala [ancho, alto] por pose)
const APLASTA = [[1.25, 0.6], [0.9, 1.18], [1.04, 0.95], [1, 1]]
export const aplasta = (a) => (a < 0 ? [0.001, 0.001] : APLASTA[Math.min(a, 3)])

// ---- 1. la superficie: lo que dejan los dedos y las herramientas (gris = sin tocar)
let SUP = null
export function superficie() {
  if (SUP) return SUP
  const N = 1024, r = U.azar(17)
  SUP = U.lienzo(N, N, (ctx) => {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, N, N)
    const repetido = (x, y, m, dibuja) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { if (x + ox < -m || x + ox > N + m || y + oy < -m || y + oy > N + m) continue; ctx.save(); ctx.translate(x + ox, y + oy); dibuja(); ctx.restore() } }
    // huellas: una hundidura con crestas en arcos que se aprietan hacia un lado
    const h = document.createElement('canvas')
    h.width = h.height = 420
    const hx = h.getContext('2d')
    for (let i = 0; i < 9; i++) {
      const R = r.rango(70, 150), paso = r.rango(11, 16), ach = r.rango(0.6, 0.85), f = [r.rango(0, 6), r.rango(0, 6)]
      hx.setTransform(1, 0, 0, 1, 210, 210)
      hx.clearRect(-210, -210, 420, 420)
      hx.globalCompositeOperation = 'source-over'
      hx.rotate(r.rango(0, 6.28))
      let g = hx.createRadialGradient(0, 0, 0, 0, 0, R)
      g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.7, 'rgba(0,0,0,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      hx.fillStyle = g
      hx.fillRect(-210, -210, 420, 420)
      hx.strokeStyle = 'rgba(255,255,255,0.45)'
      hx.lineWidth = paso * 0.38
      for (let k = 1; k * paso < R * 1.5; k++) {
        hx.beginPath()
        for (let a = 0; a <= 6.3; a += 0.06) {
          const rr = k * paso * (1 + 0.06 * Math.sin(3 * a + f[0]) + 0.035 * Math.sin(5 * a + f[1] + k * 0.3))
          const X = rr * Math.cos(a) * ach, Y = rr * Math.sin(a) * 1.12 + k * paso * 0.38
          a === 0 ? hx.moveTo(X, Y) : hx.lineTo(X, Y)
        }
        hx.stroke()
      }
      hx.globalCompositeOperation = 'destination-in'
      g = hx.createRadialGradient(0, 0, R * 0.3, 0, 0, R)
      g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)')
      hx.fillStyle = g
      hx.fillRect(-210, -210, 420, 420)
      repetido(r.rango(0, N), r.rango(0, N), 220, () => ctx.drawImage(h, -210, -210))
    }
    // rayas de la espátula, con el borde levantado al lado
    ctx.lineCap = 'round'
    for (let i = 0; i < 12; i++) {
      const L = r.rango(100, 400), a = r.rango(0, 6.28), w = r.rango(2, 5), curva = r.rango(-28, 28)
      repetido(r.rango(0, N), r.rango(0, N), 420, () => {
        ctx.rotate(a)
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = w
        ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, curva, L / 2, 0); ctx.stroke()
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = w * 0.8
        ctx.beginPath(); ctx.moveTo(-L / 2, w); ctx.quadraticCurveTo(0, curva + w, L / 2, w); ctx.stroke()
      })
    }
    // poros (oscuros) y pelusas de plastilina pegadas (claras)
    for (let i = 0; i < 200; i++) {
      const rad = r.rango(1.5, 4.5) * (r.prob(0.08) ? 2.3 : 1), sube = r.prob(0.25)
      repetido(r.rango(0, N), r.rango(0, N), 16, () => {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad)
        g.addColorStop(0, sube ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(128,128,128,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill()
      })
    }
    const im = ctx.getImageData(0, 0, N, N), d = im.data
    for (let i = 0; i < d.length; i += 4) { const v = d[i] + r.rango(-6, 6); d[i] = d[i + 1] = d[i + 2] = v }
    ctx.putImageData(im, 0, 0)
  }, { datos: true, repetir: [1, 1] })
  return SUP
}

// ---- 2. el material: plastilina mate y cerosa, con las marcas proyectadas desde tres lados (no necesita UV)
let nMat = 0
export function plastilina(colores, op = {}) {
  const [base, veta] = Array.isArray(colores) ? colores : [colores, colores]
  const c = new THREE.Color(base)
  const m = new THREE.MeshPhysicalMaterial({ color: c, roughness: op.rugosidad ?? 0.58, metalness: 0, sheen: 0.45, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color('#fff'), 0.25) })
  const r = U.azar(300 + nMat++)
  const u = { uSup: { value: superficie() }, uVeta: { value: new THREE.Color(veta) }, uEsc: { value: op.escala ?? 1.4 }, uBump: { value: op.relieve ?? 0.006 }, uVetaK: { value: op.veta ?? 0.45 }, uSem: { value: new THREE.Vector3(r(), r(), r()).multiplyScalar(10) }, uUni: { value: op.unidad ?? 1 }, uAma: { value: op.amasado ?? 0 } }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    // unidad: cuánto mide una unidad del modelo en la escena (un personaje hecho en píxeles de su dibujo: 1/850). Así
    // las marcas, las vetas y el relieve salen del mismo tamaño en todo. amasado: bultos de las manos hechos en el
    // vértice, para mallas que no se pueden amasar antes (las que tienen esqueleto).
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPA; varying vec3 vNA; uniform float uUni, uAma; uniform vec3 uSem;
        float hzV(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float ruidoV(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hzV(i), hzV(i + vec3(1, 0, 0)), f.x), mix(hzV(i + vec3(0, 1, 0)), hzV(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hzV(i + vec3(0, 0, 1)), hzV(i + vec3(1, 0, 1)), f.x), mix(hzV(i + vec3(0, 1, 1)), hzV(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPA = position * uUni; vNA = normal;
        if (uAma > 0.0) transformed += normal * (uAma / uUni) * ((ruidoV(vPA * 2.2 + uSem) - 0.5) + 0.5 * (ruidoV(vPA * 5.3 - uSem) - 0.5));`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uSup; uniform vec3 uVeta, uSem; uniform float uEsc, uBump, uVetaK;
        varying vec3 vPA; varying vec3 vNA;
        float hz3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
        float ruido3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hz3(i), hz3(i + vec3(1, 0, 0)), f.x), mix(hz3(i + vec3(0, 1, 0)), hz3(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(hz3(i + vec3(0, 0, 1)), hz3(i + vec3(1, 0, 1)), f.x), mix(hz3(i + vec3(0, 1, 1)), hz3(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
        float marcas(){ vec3 w = pow(abs(normalize(vNA)), vec3(4.0)); w /= w.x + w.y + w.z; vec3 q = vPA / uEsc + uSem;
          return w.x * texture2D(uSup, q.yz).r + w.y * texture2D(uSup, q.zx).r + w.z * texture2D(uSup, q.xy).r; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float hM = marcas();
        float hL = ruido3(vPA * 3.2 + uSem) + 0.5 * ruido3(vPA * 7.1 - uSem);
        float vet = smoothstep(0.5, 0.85, ruido3(vPA * 1.6 + vec3(hL * 1.7) + uSem.yzx));
        diffuseColor.rgb = mix(diffuseColor.rgb, uVeta, vet * uVetaK);
        diffuseColor.rgb *= 0.9 + 0.2 * hM;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (hM - 0.5) * 0.6, 0.28, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hB = (hM - 0.5) * uBump + (hL - 0.75) * uBump * 0.9;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition), r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dFdx(hB) * r1 + dFdy(hB) * r2)); }`)
  }
  if (op.dosCaras) m.side = THREE.DoubleSide
  m.customProgramCacheKey = () => 'plastilina-recorte-2'
  return m
}

// ---- 3. las manos: nada queda perfecto. Empuja la forma con un ruido suave y le hunde unos dedos.
export function amasar(geo, op = {}) {
  let g = geo.clone()
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g, 1e-4)
  const N = U.ruido(op.semilla || 1), r = U.azar((op.semilla || 1) + 50), p = g.attributes.position, amp = op.amp ?? 0.03, f = 1 / (op.tam ?? 0.5)
  g.computeVertexNormals()
  const nr = g.attributes.normal, dedos = []
  for (let i = 0; i < (op.dedos || 0); i++) { const k = r.entero(0, p.count - 1); dedos.push([p.getX(k), p.getY(k), p.getZ(k), nr.getX(k), nr.getY(k), nr.getZ(k), (op.tamDedo ?? 0.2) * r.rango(0.7, 1.3), (op.hondo ?? 0.03) * r.rango(0.6, 1.2)]) }
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const dx = amp * N.n3(x * f + 11, y * f, z * f), dy = amp * N.n3(x * f, y * f + 23, z * f), dz = amp * N.n3(x * f, y * f, z * f + 37)
    for (const d of dedos) { const q = Math.hypot(x - d[0], y - d[1], z - d[2]) / d[6]; if (q < 1) { const k = d[7] * (1 - q * q) ** 2; x -= d[3] * k; y -= d[4] * k; z -= d[5] * k } }
    p.setXYZ(i, x + dx, y + dy, z + dz)
  }
  g.computeVertexNormals()
  return g
}
export const pieza = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m }

// ---- 4. el set: una hoja de cartulina que es mesa, curva y pared sin costuras
export function cartulina(color, atras = -1.2, curva = 2, fondo = 14) {
  const pared = atras - curva, Lp = fondo - atras, Lc = (Math.PI / 2) * curva, L = Lp + Lc + 14
  const g = new THREE.PlaneGeometry(50, 1, 1, 140), p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const s = (p.getY(i) + 0.5) * L, x = p.getX(i)
    if (s < Lp) p.setXYZ(i, x, 0, fondo - s)
    else if (s < Lp + Lc) { const a = (s - Lp) / curva; p.setXYZ(i, x, curva - curva * Math.cos(a), atras - curva * Math.sin(a)) }
    else p.setXYZ(i, x, curva + s - Lp - Lc, pared)
  }
  g.computeVertexNormals()
  const fibra = U.lienzo(256, 256, (ctx) => { const im = ctx.createImageData(256, 256), r = U.azar(5); for (let i = 0; i < im.data.length; i += 4) { im.data[i] = im.data[i + 1] = im.data[i + 2] = 128 + r.rango(-55, 55); im.data[i + 3] = 255 } ctx.putImageData(im, 0, 0) }, { datos: true, repetir: [50, 40] })
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.94, bumpMap: fibra, bumpScale: 0.3 }))
  m.receiveShadow = true
  return { malla: m, pared }
}
