/**
 * Las vistas previas de la sección «Estilos»: una escena 3D corta de cada estilo (Three.js en HyperFrames), en
 * `python/estilos/<id>/vista.mp4` (6 s, 4:3 como las tarjetas, sin sonido) y su póster `vista.jpg`. Todo es de Recorte.
 *
 *   node scripts/vistas-estilos.mjs            (todas)
 *   node scripts/vistas-estilos.mjs neon inflado
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const RAIZ = resolve(import.meta.dirname, '..')
const W = 640
const H = 480
const DUR = 6
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.181.2'

// ---------------------------------------------------------------------------------------------------------------
// Lo común a todas las escenas: renderizador, tiempo de HyperFrames, curvas y formas.
// ---------------------------------------------------------------------------------------------------------------
const COMUN = /* js */ `
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const W = ${W}, H = ${H}
const canvas = document.getElementById('lienzo')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(1)
renderer.setSize(W, H, false)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200)
const entorno = () => new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const tramo = (t, a, d) => clamp((t - a) / d)
const outBack = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2)
const outCubic = (x) => 1 - Math.pow(1 - x, 3)
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const elastico = (x) => (x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
/** Cae desde arriba y rebota: altura sobre el suelo y cuánto se aplasta (0..1). */
function caida(t, t0, alto = 3) {
  const x = t - t0
  if (x <= 0) return { y: alto + 20, aplasta: 0 }
  const g = 18, tCae = Math.sqrt((2 * alto) / g)
  if (x < tCae) return { y: alto - 0.5 * g * x * x, aplasta: 0 }
  const r = x - tCae
  const rebotes = [[0.36, 0.55], [0.2, 0.18]]
  let ini = 0
  for (const [d, h] of rebotes) {
    if (r < ini + d) {
      const u = (r - ini) / d
      return { y: 4 * h * u * (1 - u), aplasta: u < 0.18 ? 1 - u / 0.18 : 0 }
    }
    ini += d
  }
  return { y: 0, aplasta: 0 }
}
/** Un ruido determinista (sin azar real: cada render da lo mismo). */
function azar(semilla) {
  let s = semilla >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}
function texturaRuido(tam = 256, fuerza = 40, semilla = 7) {
  const c = document.createElement('canvas')
  c.width = c.height = tam
  const g = c.getContext('2d')
  const r = azar(semilla)
  const img = g.createImageData(tam, tam)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * fuerza
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  // Huellas: unos arcos suaves, como dedos.
  g.strokeStyle = 'rgba(90,90,90,0.25)'
  for (let k = 0; k < 18; k++) {
    g.lineWidth = 1 + r() * 2
    g.beginPath()
    g.arc(r() * tam, r() * tam, 10 + r() * 30, r() * 6, r() * 6 + 1.5)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
function degradado(arriba, abajo) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')
  const d = g.createLinearGradient(0, 0, 0, 256)
  d.addColorStop(0, arriba)
  d.addColorStop(1, abajo)
  g.fillStyle = d
  g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
/** Una botella de producto (perfil girado) con su tapa. */
function botella(matCuerpo, matTapa, alto = 1.2, radio = 0.32) {
  const g = new THREE.Group()
  const p = []
  for (let i = 0; i <= 16; i++) {
    const a = i / 16
    p.push(new THREE.Vector2(radio * (a < 0.85 ? 1 : 1 - (a - 0.85) * 2.6) * (a < 0.05 ? 0.92 + a * 1.6 : 1), a * alto))
  }
  p.unshift(new THREE.Vector2(0, 0))
  p.push(new THREE.Vector2(0, alto))
  const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(p, 48), matCuerpo)
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(radio * 0.5, radio * 0.5, alto * 0.28, 40), matTapa)
  tapa.position.y = alto + alto * 0.13
  for (const m of [cuerpo, tapa]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  return g
}
function sombreado(m) {
  m.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return m
}
`

// ---------------------------------------------------------------------------------------------------------------
// Las escenas, una por estilo. Cada una define renderAt(t).
// ---------------------------------------------------------------------------------------------------------------
const ESCENAS = {
  plastilina: /* js */ `
scene.background = new THREE.Color('#f3d6c6')
const bump = texturaRuido(256, 50, 3)
const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, bumpMap: bump, bumpScale: 0.6 })
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat('#f0c9b6'))
suelo.rotation.x = -Math.PI / 2
suelo.receiveShadow = true
scene.add(suelo)
const pared = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), mat('#f3d6c6'))
pared.position.set(0, 10, -4)
pared.receiveShadow = true
scene.add(pared)
scene.add(new THREE.HemisphereLight('#fff4ea', '#c98f7c', 1.4))
const sol = new THREE.DirectionalLight('#fff1e0', 2.6)
sol.position.set(-3, 7, 5)
sol.castShadow = true
sol.shadow.mapSize.set(1024, 1024)
sol.shadow.radius = 8
Object.assign(sol.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 })
scene.add(sol)
function grumo(geo, semilla, f = 0.06) {
  const r = azar(semilla)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i)
    v.multiplyScalar(1 + (r() - 0.5) * f)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  return geo
}
const piezas = [
  { m: new THREE.Mesh(grumo(new THREE.SphereGeometry(0.62, 48, 32), 1), mat('#f0a94a')), x: -0.75, z: 0.2, base: 0.62, t0: 0.2 },
  { m: botella(mat('#5da7e0'), mat('#ffffff'), 1.35, 0.36), x: 0.55, z: -0.1, base: 0, t0: 0.65 },
  { m: new THREE.Mesh(grumo(new THREE.TorusGeometry(0.42, 0.2, 24, 48), 2), mat('#7fd1a8')), x: -0.15, z: 1.25, base: 0.2, t0: 1.1, tumbado: true },
  { m: new THREE.Mesh(grumo(new THREE.SphereGeometry(0.26, 32, 24), 3), mat('#ff8fb1')), x: 1.25, z: 0.95, base: 0.26, t0: 1.45 },
  { m: new THREE.Mesh(grumo(new THREE.CapsuleGeometry(0.18, 0.45, 8, 24), 4), mat('#fff0a8')), x: -1.35, z: 1.1, base: 0.4, t0: 1.8 }
]
for (const p of piezas) {
  sombreado(p.m)
  if (p.tumbado) p.m.rotation.x = -Math.PI / 2
  scene.add(p.m)
}
function renderAt(t0) {
  const t = Math.floor(t0 * 12) / 12 // a 12 cuadros por segundo, como animación a mano
  for (const p of piezas) {
    const c = caida(t, p.t0, 3.2)
    const respira = 1 + Math.sin(t * 3 + p.x) * 0.015
    const sy = (1 - c.aplasta * 0.28) * respira, sxz = (1 + c.aplasta * 0.18) * respira
    p.m.scale.set(sxz, sy, sxz)
    p.m.position.set(p.x, p.base * sy + c.y, p.z)
  }
  const a = -0.25 + t * 0.06
  camera.position.set(Math.sin(a) * 4.9, 2.3, Math.cos(a) * 4.9)
  camera.lookAt(0, 0.55, 0.45)
  renderer.render(scene, camera)
}
`,

  'papel-desplegable': /* js */ `
scene.background = new THREE.Color('#f1e9db')
scene.add(new THREE.AmbientLight('#fff6e8', 1.1))
const luz = new THREE.DirectionalLight('#fff0dc', 2.4)
luz.position.set(-4, 6, 6)
luz.castShadow = true
luz.shadow.mapSize.set(2048, 2048)
luz.shadow.radius = 1.5
Object.assign(luz.shadow.camera, { left: -6, right: 6, top: 8, bottom: -4 })
scene.add(luz)
const papel = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 })
const pagina = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 4.2), papel('#fbf6ec'))
pagina.receiveShadow = true
scene.add(pagina)
function recorte(forma, color, z, t0) {
  const geo = new THREE.ExtrudeGeometry(forma, { depth: 0.04, bevelEnabled: false })
  const m = new THREE.Mesh(geo, papel(color))
  m.castShadow = m.receiveShadow = true
  const bisagra = new THREE.Group()
  bisagra.position.set(0, 0.03, z)
  bisagra.add(m)
  scene.add(bisagra)
  return { bisagra, t0 }
}
const cerros = (alto, ondas, fase) => {
  const s = new THREE.Shape()
  s.moveTo(-2.9, 0)
  for (let i = 0; i <= 60; i++) {
    const x = -2.9 + (5.8 * i) / 60
    s.lineTo(x, alto + Math.sin(i / 60 * Math.PI * ondas + fase) * alto * 0.35)
  }
  s.lineTo(2.9, 0)
  return s
}
const sol = new THREE.Shape()
sol.absarc(1.2, 2.5, 0.55, 0, Math.PI * 2)
const casa = new THREE.Shape()
casa.moveTo(-0.55, 0); casa.lineTo(-0.55, 0.75); casa.lineTo(0, 1.2); casa.lineTo(0.55, 0.75); casa.lineTo(0.55, 0); casa.lineTo(-0.55, 0)
const ventana = new THREE.Path()
ventana.moveTo(-0.15, 0.3); ventana.lineTo(0.15, 0.3); ventana.lineTo(0.15, 0.6); ventana.lineTo(-0.15, 0.6); ventana.lineTo(-0.15, 0.3)
casa.holes.push(ventana)
const arbol = new THREE.Shape()
arbol.moveTo(-0.05, 0); arbol.lineTo(-0.05, 0.3); arbol.lineTo(-0.35, 0.3); arbol.lineTo(0, 1.1); arbol.lineTo(0.35, 0.3); arbol.lineTo(0.05, 0.3); arbol.lineTo(0.05, 0)
const capas = [
  recorte(sol, '#f2b134', -1.9, 0.2),
  recorte(cerros(1.5, 2, 0.4), '#3f8fcf', -1.6, 0.45),
  recorte(cerros(1.0, 3, 1.7), '#6aa86b', -0.9, 0.75),
  recorte(cerros(0.6, 2.5, 3.1), '#e4604f', -0.2, 1.05)
]
const c1 = recorte(casa, '#fbf6ec', 0.5, 1.4)
c1.bisagra.children[0].position.x = -0.6
const a1 = recorte(arbol, '#2f6b4f', 0.9, 1.65)
a1.bisagra.children[0].position.x = 0.9
const a2 = recorte(arbol, '#2f6b4f', 1.2, 1.8)
a2.bisagra.children[0].position.x = 1.6
a2.bisagra.children[0].scale.setScalar(0.7)
capas.push(c1, a1, a2)
function renderAt(t) {
  for (const c of capas) {
    const u = tramo(t, c.t0, 0.7)
    c.bisagra.rotation.x = -Math.PI / 2 * (1 - outBack(u, 1.4))
  }
  const u = inOut(tramo(t, 0, DURACION))
  camera.position.set(-0.4 + u * 0.8, 2.6 - u * 0.4, 7.4 - u * 1.2)
  camera.lookAt(0, 0.9, 0)
  renderer.render(scene, camera)
}
`,

  'diorama-miniatura': /* js */ `
scene.background = new THREE.Color('#cfe6f2')
scene.add(new THREE.HemisphereLight('#eaf6ff', '#7a6a4f', 1.3))
const sol = new THREE.DirectionalLight('#ffe2b8', 3)
sol.position.set(5, 8, 3)
sol.castShadow = true
sol.shadow.mapSize.set(2048, 2048)
Object.assign(sol.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 })
scene.add(sol)
const pin = (c, r = 0.55) => new THREE.MeshStandardMaterial({ color: c, roughness: r })
const base = new THREE.Group()
const tierra = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.6, 4.2, 4, 0.08), pin('#8a6240', 0.9))
tierra.position.y = -0.3
const pasto = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.12, 4.2, 4, 0.05), pin('#8ccf6e', 0.85))
pasto.position.y = 0.02
const camino = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 4.2), pin('#e7d8b8', 0.9))
camino.position.set(0.3, 0.09, 0)
base.add(tierra, pasto, camino)
sombreado(base)
scene.add(base)
const cosas = []
function casa(x, z, color, techo, t0, s = 1) {
  const g = new THREE.Group()
  const cuerpo = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.6, 0.7, 2, 0.04), pin(color))
  cuerpo.position.y = 0.3
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), pin(techo, 0.5))
  t.position.y = 0.82
  t.rotation.y = Math.PI / 4
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.02), pin('#5a3b26'))
  puerta.position.set(0, 0.15, 0.36)
  g.add(cuerpo, t, puerta)
  g.position.set(x, 0.08, z)
  g.userData = { t0, s }
  cosas.push(sombreado(g))
  scene.add(g)
}
function arbol(x, z, t0, s = 1) {
  const g = new THREE.Group()
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), pin('#7a5232'))
  tronco.position.y = 0.15
  const copa = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), pin('#3e8a4a'))
  copa.position.y = 0.6
  g.add(tronco, copa)
  g.position.set(x, 0.08, z)
  g.userData = { t0, s }
  cosas.push(sombreado(g))
  scene.add(g)
}
casa(-1.1, -0.9, '#f4ead7', '#c8553f', 0.3)
casa(1.3, -1.2, '#f7d6a5', '#3e6fa8', 0.55, 0.9)
casa(-1.2, 1.0, '#e8eef4', '#c8553f', 0.8, 0.85)
arbol(1.4, 0.6, 1.0)
arbol(1.7, 1.4, 1.15, 0.8)
arbol(-0.3, -1.6, 1.3, 0.9)
arbol(-1.8, 0.1, 1.45, 0.7)
arbol(0.9, -0.3, 1.6, 0.75)
const auto = sombreado(new THREE.Group())
const carro = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.14, 0.4, 2, 0.04), pin('#e14b3b', 0.35))
carro.position.y = 0.17
auto.add(carro)
scene.add(auto)
function renderAt(t) {
  for (const c of cosas) {
    const u = tramo(t, c.userData.t0, 0.55)
    c.scale.setScalar(Math.max(0.0001, outBack(u, 2.2)) * c.userData.s)
  }
  const ua = tramo(t, 2, 3.6)
  auto.visible = t > 2
  auto.position.set(0.3, 0.08, -2 + ua * 4)
  const a = 0.7 + t * 0.12
  camera.position.set(Math.sin(a) * 6.3, 5.4, Math.cos(a) * 6.3)
  camera.lookAt(0, 0.1, 0)
  renderer.render(scene, camera)
}
`,

  'plano-tecnico': /* js */ `
scene.background = new THREE.Color('#123a6b')
const rejilla = new THREE.GridHelper(20, 40, '#5f8ec4', '#2b5a92')
rejilla.position.y = -1.2
rejilla.material.transparent = true
rejilla.material.opacity = 0.55
scene.add(rejilla)
scene.environment = entorno()
scene.add(new THREE.AmbientLight('#ffffff', 0.4))
const luz = new THREE.DirectionalLight('#ffffff', 2)
luz.position.set(3, 5, 4)
scene.add(luz)
const solido = new THREE.MeshPhysicalMaterial({ color: '#e9eef5', roughness: 0.3, metalness: 0.1, clearcoat: 0.6, transparent: true, opacity: 0 })
const tapaSol = new THREE.MeshPhysicalMaterial({ color: '#1f2a3a', roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0 })
const objeto = botella(solido, tapaSol, 1.9, 0.55)
objeto.position.y = -1.2
scene.add(objeto)
const lineas = []
objeto.traverse((o) => {
  if (!o.isMesh) return
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 12), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true }))
  e.position.copy(o.position)
  objeto.add(e)
  lineas.push(e)
})
// Las cotas: una línea vertical con sus topes, a un lado.
const cota = new THREE.Group()
const lm = new THREE.LineBasicMaterial({ color: '#7fc8ff', transparent: true })
const puntos = [[1.1, 0, 0, 1.1, 2.45, 0], [0.95, 0, 0, 1.25, 0, 0], [0.95, 2.45, 0, 1.25, 2.45, 0], [-0.55, -0.25, 0, 0.55, -0.25, 0], [-0.55, -0.35, 0, -0.55, -0.15, 0], [0.55, -0.35, 0, 0.55, -0.15, 0]]
for (const p of puntos) {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  cota.add(new THREE.Line(g, lm))
}
cota.position.y = -1.2
objeto.add(cota)
cota.position.set(0, 0, 0)
function renderAt(t) {
  const dib = outCubic(tramo(t, 0.2, 2.2))
  for (const l of lineas) {
    const n = l.geometry.attributes.position.count
    l.geometry.setDrawRange(0, Math.floor(n * dib / 2) * 2)
    l.material.opacity = 1 - tramo(t, 4.6, 0.8) * 0.85
  }
  lm.opacity = tramo(t, 2.0, 0.6) * (1 - tramo(t, 4.4, 0.6))
  const s = inOut(tramo(t, 3.4, 1.2))
  solido.opacity = s
  tapaSol.opacity = s
  objeto.rotation.y = -0.5 + t * 0.35
  camera.position.set(0, 1.2, 5.6)
  camera.lookAt(0, 0.0, 0)
  renderer.render(scene, camera)
}
`,

  neon: /* js */ `
scene.background = new THREE.Color('#0b0712')
const pared = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), new THREE.MeshStandardMaterial({ color: '#120e1a', roughness: 0.95 }))
pared.position.z = -0.4
scene.add(pared)
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshStandardMaterial({ color: '#0e0b14', roughness: 0.15, metalness: 0.7 }))
suelo.rotation.x = -Math.PI / 2
suelo.position.y = -2.4
scene.add(suelo)
scene.add(new THREE.AmbientLight('#2a2040', 0.6))
function tubo(puntos, color, cerrado = false) {
  const curva = new THREE.CatmullRomCurve3(puntos.map(([x, y]) => new THREE.Vector3(x, y, 0)), cerrado, 'catmullrom', 0.1)
  const mat = new THREE.MeshBasicMaterial({ color })
  const m = new THREE.Mesh(new THREE.TubeGeometry(curva, 200, 0.045, 10, cerrado), mat)
  scene.add(m)
  const luz = new THREE.PointLight(color, 0, 6, 1.6)
  luz.position.set(0, puntos.reduce((a, p) => a + p[1], 0) / puntos.length, 0.6)
  scene.add(luz)
  return { m, mat, luz, color: new THREE.Color(color) }
}
const corazon = []
for (let i = 0; i < 60; i++) {
  const a = (i / 60) * Math.PI * 2
  corazon.push([0.075 * 16 * Math.pow(Math.sin(a), 3), 0.075 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) + 1.0])
}
const letreros = [
  { ...tubo(corazon, '#ff4fd8', true), t0: 0.4 },
  { ...tubo([[-1.3, -0.9], [-0.9, -0.5], [-0.5, -0.9], [-0.1, -0.5], [0.3, -0.9], [0.7, -0.5], [1.1, -0.9], [1.4, -0.6]], '#3fe0ff'), t0: 1.5 },
  { ...tubo([[-1.0, -1.5], [1.0, -1.5]], '#ffe14f'), t0: 2.3 }
]
const composer = new EffectComposer(renderer)
composer.setPixelRatio(1)
composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.85, 0.35, 0.12))
composer.addPass(new OutputPass())
// Encendido con parpadeo, siempre igual (no al azar).
const PATRON = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1]
function encendido(t, t0) {
  const x = t - t0
  if (x < 0) return 0
  const i = Math.floor(x * 20)
  if (i < PATRON.length) return PATRON[i]
  return Math.floor(t * 7 + t0 * 3) % 23 === 0 ? 0.35 : 1
}
function renderAt(t) {
  for (const l of letreros) {
    const e = encendido(t, l.t0)
    l.mat.color.copy(l.color).multiplyScalar(0.06 + e * 0.94)
    l.luz.intensity = e * 0.9
  }
  camera.position.set(-0.5 + t * 0.16, 0.25, 7.4)
  camera.lookAt(0, 0.2, 0)
  composer.render()
}
`,

  'vista-explotada': /* js */ `
scene.background = degradado('#f1f4f8', '#cdd5df')
scene.environment = entorno()
const luz = new THREE.DirectionalLight('#ffffff', 2.2)
luz.position.set(3, 6, 4)
luz.castShadow = true
luz.shadow.mapSize.set(1024, 1024)
luz.shadow.radius = 10
scene.add(luz)
scene.add(new THREE.HemisphereLight('#ffffff', '#9aa5b5', 0.8))
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.18 }))
suelo.rotation.x = -Math.PI / 2
suelo.position.y = -1.6
suelo.receiveShadow = true
scene.add(suelo)
const fisico = (c, r, m, extra = {}) => new THREE.MeshPhysicalMaterial({ color: c, roughness: r, metalness: m, clearcoat: 0.5, ...extra })
// Las piezas de un frasco de crema: base, cuerpo de vidrio, crema, aro, tapa y su sello.
const piezas = [
  { geo: new THREE.CylinderGeometry(0.85, 0.85, 0.12, 64), mat: fisico('#3a4250', 0.35, 0.8), y: 0, d: -1.0 },
  { geo: new THREE.CylinderGeometry(0.8, 0.82, 0.8, 64, 1, true), mat: fisico('#ffffff', 0.05, 0, { transmission: 1, thickness: 0.4, ior: 1.45 }), y: 0.46, d: -0.35 },
  { geo: new THREE.CylinderGeometry(0.74, 0.74, 0.62, 64), mat: fisico('#f4c9b8', 0.6, 0), y: 0.42, d: 0.15 },
  { geo: new THREE.TorusGeometry(0.8, 0.05, 16, 64), mat: fisico('#c9ccd3', 0.2, 1), y: 0.9, d: 0.65, tumbado: true },
  { geo: new RoundedBoxGeometry(1.8, 0.36, 1.8, 6, 0.16), mat: fisico('#8a95a6', 0.3, 0.6), y: 1.1, d: 1.25, redonda: true },
  { geo: new THREE.CylinderGeometry(0.45, 0.45, 0.04, 48), mat: fisico('#e9edf2', 0.4, 0.2), y: 1.3, d: 1.75 }
]
const grupo = new THREE.Group()
grupo.position.y = -1.2
scene.add(grupo)
for (const p of piezas) {
  if (p.redonda) {
    p.geo = new THREE.CylinderGeometry(0.88, 0.88, 0.32, 64)
  }
  p.m = new THREE.Mesh(p.geo, p.mat)
  if (p.tumbado) p.m.rotation.x = Math.PI / 2
  p.m.castShadow = p.m.receiveShadow = true
  grupo.add(p.m)
}
function renderAt(t) {
  const abre = inOut(tramo(t, 1.0, 1.4)) * (1 - inOut(tramo(t, 4.2, 1.1)))
  for (const p of piezas) p.m.position.y = p.y + p.d * abre * 0.75
  grupo.rotation.y = t * 0.45
  grupo.rotation.z = Math.sin(t * 0.8) * 0.03
  camera.position.set(3.4 + abre * 0.6, 1.4 + abre * 0.6, 4.6 + abre * 2.0)
  camera.lookAt(0, -0.55 + abre * 0.3, 0)
  renderer.render(scene, camera)
}
`,

  'vidrio-y-luz': /* js */ `
scene.background = degradado('#0f1c2e', '#27405f')
scene.environment = entorno()
// Manchas de luz de color detrás (el vidrio las deforma al pasar).
const manchas = []
for (const [x, y, z, c, r] of [[-1.6, 1.8, -4, '#3fa9ff', 1.3], [1.7, -0.6, -5, '#ff7ad9', 1.6], [0.2, -2.6, -3.5, '#ffd27a', 1.0], [1.2, 2.8, -6, '#7a8cff', 1.4]]) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }))
  m.position.set(x, y, z)
  scene.add(m)
  manchas.push(m)
}
const vidrio = (tinte) => new THREE.MeshPhysicalMaterial({ color: tinte, transmission: 1, thickness: 1.2, roughness: 0.06, ior: 1.45, iridescence: 0.6, iridescenceIOR: 1.3, clearcoat: 1, envMapIntensity: 1.4 })
const formas = [
  { m: new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.36, 48, 96), vidrio('#ffffff')), p: [0, 0.8, 0], f: 0 },
  { m: new THREE.Mesh(new THREE.SphereGeometry(0.62, 64, 32), vidrio('#e8f4ff')), p: [-0.9, -1.0, 0.6], f: 1.7 },
  { m: new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 16, 48), vidrio('#ffe8fb')), p: [1.0, -1.3, 0.2], f: 3.1 }
]
for (const f of formas) scene.add(f.m)
const composer = new EffectComposer(renderer)
composer.setPixelRatio(1)
composer.setSize(W, H)
composer.addPass(new RenderPass(scene, camera))
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.6))
composer.addPass(new OutputPass())
function renderAt(t) {
  for (const f of formas) {
    const e = outCubic(tramo(t, 0.2 + f.f * 0.18, 1.2))
    f.m.position.set(f.p[0], f.p[1] + Math.sin(t * 1.1 + f.f) * 0.12, f.p[2] - (1 - e) * 6)
    f.m.rotation.set(t * 0.35 + f.f, t * 0.5 + f.f, 0)
    f.m.scale.setScalar(0.4 + 0.6 * e)
  }
  manchas.forEach((m, i) => (m.position.x += Math.sin(t * 0.4 + i) * 0.004))
  camera.position.set(Math.sin(t * 0.15) * 0.8, 0, 6.6 - t * 0.2)
  camera.lookAt(0, -0.1, 0)
  composer.render()
}
`,

  inflado: /* js */ `
scene.background = degradado('#ffe7f1', '#ffc4da')
scene.environment = entorno()
scene.add(new THREE.HemisphereLight('#ffffff', '#f5a3c4', 1.0))
const luz = new THREE.DirectionalLight('#ffffff', 2.4)
luz.position.set(2, 6, 5)
luz.castShadow = true
luz.shadow.mapSize.set(1024, 1024)
luz.shadow.radius = 12
Object.assign(luz.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 })
scene.add(luz)
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.16 }))
suelo.rotation.x = -Math.PI / 2
suelo.position.y = -1.6
suelo.receiveShadow = true
scene.add(suelo)
const vinilo = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3 })
// Una estrella inflada: la forma extruida con un biselado enorme.
const estrella = new THREE.Shape()
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 + Math.PI / 2
  const r = i % 2 ? 0.42 : 0.95
  i ? estrella.lineTo(Math.cos(a) * r, Math.sin(a) * r) : estrella.moveTo(Math.cos(a) * r, Math.sin(a) * r)
}
const geoEstrella = new THREE.ExtrudeGeometry(estrella, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.32, bevelSize: 0.2, bevelSegments: 12, curveSegments: 24 })
geoEstrella.center()
const cosas = [
  { m: new THREE.Mesh(geoEstrella, vinilo('#ffd23f')), p: [0, 1.15, 0], t0: 0.25, s: 1 },
  { m: new THREE.Mesh(new THREE.SphereGeometry(0.62, 64, 32), vinilo('#ff5c9d')), p: [-1.05, -0.7, 0.3], t0: 0.75, s: 1 },
  { m: new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 16, 48), vinilo('#4aa8f0')), p: [0.95, -0.6, 0.1], t0: 1.15, s: 1 },
  { m: new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.22, 32, 64), vinilo('#8a6cff')), p: [0.0, -1.0, 1.0], t0: 1.55, s: 1 }
]
for (const c of cosas) {
  c.m.castShadow = true
  scene.add(c.m)
}
function renderAt(t) {
  for (const c of cosas) {
    const u = tramo(t, c.t0, 1.1)
    const e = u <= 0 ? 0.0001 : elastico(u)
    const temblor = 1 + Math.sin((t - c.t0) * 18) * 0.04 * Math.exp(-(t - c.t0) * 2) * (u > 0 ? 1 : 0)
    c.m.scale.set(e * c.s * temblor, e * c.s / temblor, e * c.s * temblor)
    c.m.position.set(c.p[0], c.p[1] + Math.sin(t * 1.6 + c.t0 * 3) * 0.06, c.p[2])
    c.m.rotation.set(Math.sin(t * 0.9 + c.t0) * 0.15, t * 0.5 + c.t0, Math.sin(t * 0.7) * 0.1)
  }
  camera.position.set(Math.sin(t * 0.2) * 0.6, 0.4, 5.6)
  camera.lookAt(0, 0, 0)
  renderer.render(scene, camera)
}
`
}

function composicion(id) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
  #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
  #lienzo { width: 100%; height: 100%; display: block; }
  ${id === 'diorama-miniatura' ? `.desenfoque { position: absolute; left: 0; right: 0; height: 34%; backdrop-filter: blur(5px); pointer-events: none; }
  .desenfoque.arriba { top: 0; -webkit-mask-image: linear-gradient(#000 20%, transparent); }
  .desenfoque.abajo { bottom: 0; -webkit-mask-image: linear-gradient(transparent, #000 80%); }` : ''}
</style>
<script type="importmap">
{ "imports": { "three": "${THREE}/build/three.module.js", "three/addons/": "${THREE}/examples/jsm/" } }
</script>
</head>
<body>
<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}">
  <canvas id="lienzo" width="${W}" height="${H}"></canvas>
  ${id === 'diorama-miniatura' ? '<div class="desenfoque arriba"></div><div class="desenfoque abajo"></div>' : ''}
</div>
<script type="module">
${COMUN}
const DURACION = ${DUR}
${ESCENAS[id]}
window.addEventListener('hf-seek', (e) => renderAt(e.detail.time))
renderAt(window.__hfThreeTime || 0)
</script>
</body>
</html>
`
}

function hyperframes() {
  const local = join(RAIZ, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes')
  if (existsSync(local)) return [local]
  return ['npx', '--yes', 'hyperframes@0.8.206']
}

const pedidos = process.argv.slice(2)
const ids = pedidos.length ? pedidos : Object.keys(ESCENAS)
const cmd = hyperframes()
let fallos = 0
for (const id of ids) {
  if (existsSync(join(RAIZ, 'python', 'estilos', id, 'escena.js'))) {
    console.log(`${id}: tiene escena de referencia con el motor 3D; su vista sale de: node scripts/motor3d.mjs vista ${id}`)
    continue
  }
  if (!ESCENAS[id]) {
    console.error(`No hay escena para «${id}».`)
    fallos++
    continue
  }
  const destino = join(RAIZ, 'python', 'estilos', id)
  const trabajo = join(tmpdir(), 'recorte-vistas', id)
  rmSync(trabajo, { recursive: true, force: true })
  mkdirSync(trabajo, { recursive: true })
  writeFileSync(join(trabajo, 'index.html'), composicion(id), 'utf8')
  const mp4 = join(destino, 'vista.mp4')
  console.log(`${id}: renderizando…`)
  const args = [...cmd.slice(1), 'render', trabajo, '--quality', 'standard', '-o', mp4, '--quiet']
  // En Windows, npx y hyperframes son .cmd: van por la consola, en una sola línea con cada ruta entre comillas.
  const r =
    process.platform === 'win32'
      ? spawnSync([cmd[0], ...args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' '), { stdio: 'inherit', shell: true })
      : spawnSync(cmd[0], args, { stdio: 'inherit' })
  if (r.status !== 0 || !existsSync(mp4)) {
    console.error(`${id}: no se pudo renderizar.`)
    fallos++
    continue
  }
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', '4.6', '-i', mp4, '-frames:v', '1', '-q:v', '3', join(destino, 'vista.jpg')], { stdio: 'inherit' })
  console.log(`${id}: listo`)
}
process.exit(fallos ? 1 : 0)
