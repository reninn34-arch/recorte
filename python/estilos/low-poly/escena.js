// Escena de prueba del motor: una isla low poly. Aparece una casa y el bosque crece a su alrededor mientras la cámara
// se aleja en un solo movimiento. Sirve para comprobar luz, sombras suaves, desenfoque y acabado.
import * as THREE from 'three'
import { U } from './escenario.js'

import { DURACION } from './guion.js'
export { DURACION }
export const ACABADO = { tono: 'neutro', exposicion: 1.05, brillo: 0.25, umbral: 1.2, vineta: 0.22, grano: 0.012, fov: 30, fondo: '#f6d9bd', lejos: 400 }

const PAL = {
  arena: '#ebd2a0', pasto: '#a3bd66', prado: '#86ac5a', bosque: '#4f8b5f', roca: '#9f909a', rocaOsc: '#837889',
  hondo: '#1d6a7f', mar: '#2d8f9d', bajo: '#68c2b4', espuma: '#e7f4e8', tronco: '#7a5c4c', copa: '#5f9a58', copa2: '#7aa953',
  ocre: '#e2a648', pared: '#fff4e2', techo: '#e66a4c', nube: '#fff8ef', nubeBase: '#cfc8de', cielo: '#6fabd3', bruma: '#f6d9bd',
}
const _h = {}
/** Un tono de la paleta movido apenas según dónde está la cara: así cada triángulo se distingue de su vecino. */
function matiz(hex, clave, k = 1) {
  const c = new THREE.Color(hex)
  c.getHSL(_h)
  return c.setHSL(_h.h + (U.hash(clave, 1.7) - 0.5) * 0.03 * k, U.limitar(_h.s * (1 + (U.hash(clave, 5.3) - 0.5) * 0.25 * k)), U.limitar(_h.l * (1 + (U.hash(clave, 9.1) - 0.5) * 0.16 * k)))
}
/** Convierte una geometría en caras planas de un solo color cada una. pinta(centro, normal) → THREE.Color. */
function facetas(geo, pinta) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.computeVertexNormals()
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Vector3(), n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3()
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2)
    c.copy(a).add(b).add(d).divideScalar(3)
    n.subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize()
    const k = pinta(c, n)
    for (let j = 0; j < 3; j++) col.set([k.r, k.g, k.b], (i + j) * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
/** Mueve cada vértice un poco (los que comparten lugar, igual) para que la forma no parezca de catálogo. */
function sacudir(geo, cuanto, semilla = 1) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 400) * 0.37 + Math.round(p.getY(i) * 400) * 1.31 + Math.round(p.getZ(i) * 400) * 2.77 + semilla * 11
    p.setXYZ(i, p.getX(i) + (U.hash(k, 1) - 0.5) * 2 * cuanto, p.getY(i) + (U.hash(k, 2) - 0.5) * 2 * cuanto, p.getZ(i) + (U.hash(k, 3) - 0.5) * 2 * cuanto)
  }
  return geo
}
const mate = (op = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, ...op })
const malla = (g, m, sombra = true) => { const x = new THREE.Mesh(g, m); x.castShadow = sombra; x.receiveShadow = true; return x }

export function construir(E) {
  const { scene } = E
  const N = U.ruido(4)

  // ---- luz: un sol bajo y cálido de lado, cielo frío que rellena las sombras, bruma color durazno al fondo
  const SOL = new THREE.Vector3(-0.8, 0.42, 0.35).normalize()
  E.entorno({ arriba: '#7fb6dc', horizonte: '#ffe1c4', abajo: '#8fa889', intensidad: 0.5, paneles: [{ pos: SOL.clone().multiplyScalar(30).toArray(), tam: [9, 9], color: '#ffd09a', potencia: 12, redondo: true }] })
  E.sol({ desde: SOL.clone().multiplyScalar(40).toArray(), color: '#ffdcb2', potencia: 3.4, cubre: 11, suave: 2, mapa: 4096 })
  E.cielo({ color: '#a8c8ff', potencia: 0.9, cubre: 11, centro: [0, 0.5, 0] })
  scene.fog = new THREE.Fog(PAL.bruma, 16, 60)
  const cielo = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(PAL.cielo) }, b: { value: new THREE.Color(PAL.bruma) }, c: { value: new THREE.Color('#fbeedd') }, s: { value: SOL } },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 a, b, c, s; varying vec3 d; void main(){ vec3 n = normalize(d); float y = max(n.y, 0.0); vec3 k = mix(mix(b, c, smoothstep(0.0, 0.1, y)), a, smoothstep(0.05, 0.55, y)); float q = max(dot(n, s), 0.0); k += vec3(1.0, 0.8, 0.6) * (pow(q, 6.0) * 0.3 + pow(q, 60.0) * 0.8); gl_FragColor = vec4(k, 1.0); }',
  }))
  scene.add(cielo)

  // ---- la isla: una forma hecha a mano (dos lomas y una playa) con algo de ruido
  const alto = (x, z) => {
    const d = Math.hypot(x * 0.95, z * 1.15)
    let h = 1.25 * (1 - U.suave(1.5, 5.4, d)) - 0.55
    h += 1.6 * Math.max(0, 1 - Math.hypot(x - 1.6, z + 1.2) / 2.6) ** 1.6
    h += 0.9 * Math.max(0, 1 - Math.hypot(x + 2.0, z + 1.8) / 2.0) ** 1.5
    h += 0.22 * N.capas(x * 0.45, z * 0.45, 0, 3)
    return h
  }
  const tierra = new THREE.PlaneGeometry(16, 16, 64, 64)
  tierra.rotateX(-Math.PI / 2)
  sacudir(tierra, 0.09, 2)
  { const p = tierra.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, alto(p.getX(i), p.getZ(i))) }
  scene.add(malla(facetas(tierra, (c, n) => {
    const clave = c.x * 13.1 + c.z * 7.7, j = U.hash(clave, 3) - 0.5
    let nom = c.y < 0.12 + j * 0.06 ? 'arena' : n.y < 0.8 + j * 0.05 ? (U.hash(clave, 8) < 0.6 ? 'roca' : 'rocaOsc') : c.y > 1.1 + j * 0.3 ? 'bosque' : N.capas(c.x * 0.4, c.z * 0.4, 5, 2) > 0 ? 'prado' : 'pasto'
    if (c.y < -0.2) nom = 'arena'
    return matiz(PAL[nom], clave, 1)
  }), mate()))

  // ---- el mar: la misma idea de caras planas, con olas en el shader para que cada cara cambie de luz
  const reloj = { value: 0 }
  const mar = new THREE.PlaneGeometry(90, 90, 150, 150)
  mar.rotateX(-Math.PI / 2)
  sacudir(mar, 0.18, 9)
  const matMar = mate({ roughness: 0.32 })
  matMar.onBeforeCompile = (sh) => {
    sh.uniforms.uT = reloj
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp = modelMatrix * vec4(transformed, 1.0); transformed.y += 0.045 * (sin(wp.x * 1.3 + uT * 1.4) * cos(wp.z * 1.1 - uT * 1.1) * 0.6 + sin(wp.x * 2.6 - wp.z * 2.1 + uT * 2.2) * 0.4);')
  }
  scene.add(malla(facetas(mar, (c) => {
    const prof = -alto(c.x, c.z), k = c.x * 3.3 + c.z * 5.9
    return matiz(prof < 0.06 ? PAL.espuma : prof < 0.35 ? PAL.bajo : prof < 0.9 ? PAL.mar : PAL.hondo, k, 1.1)
  }), matMar, false))

  // ---- la casa: aparece primero, con un rebote
  const casa = new THREE.Group()
  const cuerpo = malla(facetas(sacudir(new THREE.BoxGeometry(0.7, 0.55, 0.6, 1, 1, 1), 0.015, 3), (c, n) => matiz(PAL.pared, c.x * 9 + c.z * 5 + n.x, 0.5)), mate())
  cuerpo.position.y = 0.275
  const techo = malla(facetas(new THREE.ConeGeometry(0.62, 0.42, 4, 1), (c, n) => matiz(PAL.techo, n.x * 7 + n.z * 3, 0.8)), mate())
  techo.position.y = 0.76
  techo.rotation.y = Math.PI / 4
  const puerta = malla(new THREE.BoxGeometry(0.16, 0.26, 0.02), new THREE.MeshStandardMaterial({ color: PAL.tronco, roughness: 0.9 }))
  puerta.position.set(0.05, 0.13, 0.305)
  casa.add(cuerpo, techo, puerta)
  const CASA = [0.3, alto(0.3, 0.6) - 0.02, 0.6]
  casa.position.set(...CASA)
  casa.rotation.y = -0.35
  scene.add(casa)

  // ---- el bosque: crece desde la casa hacia afuera, cada árbol cuando la ola le llega
  const arboles = []
  {
    const r = U.azar(11)
    for (let i = 0; i < 900 && arboles.length < 110; i++) {
      const x = r.rango(-4.5, 4.8), z = r.rango(-4, 3.6), y = alto(x, z), d = Math.hypot(x - CASA[0], z - CASA[2])
      if (y < 0.18 || d < 0.75 || arboles.some((a) => Math.hypot(a.x - x, a.z - z) < 0.42)) continue
      const pend = Math.hypot(alto(x + 0.2, z) - alto(x - 0.2, z), alto(x, z + 0.2) - alto(x, z - 0.2)) / 0.4
      if (pend > 1.1) continue
      arboles.push({ x, z, y: y - 0.03, s: r.rango(0.65, 1.05), giro: r.rango(0, 6.3), t0: 1.0 + d * 0.55 + r.rango(0, 0.25), pino: y > 0.9 || r.prob(0.35), ocre: r.prob(0.12) })
    }
  }
  const pinoGeo = (() => {
    const partes = []
    const tronco = new THREE.CylinderGeometry(0.04, 0.06, 0.25, 5); tronco.translate(0, 0.125, 0)
    partes.push(facetas(tronco, (c) => matiz(PAL.tronco, c.y * 9)))
    ;[[0.32, 0.45, 0.2], [0.24, 0.4, 0.48], [0.16, 0.36, 0.74]].forEach(([rad, h, y], k) => {
      const g = sacudir(new THREE.ConeGeometry(rad, h, 6, 1), 0.02, k + 2); g.translate(0, y + h / 2, 0)
      partes.push(facetas(g, (c, n) => matiz(PAL.bosque, c.x * 13 + c.y * 7 + c.z * 3, 1).multiplyScalar(n.y < -0.5 ? 0.6 : 1 + k * 0.08)))
    })
    return unir(partes)
  })()
  const copaGeo = (col) => {
    const tronco = new THREE.CylinderGeometry(0.035, 0.05, 0.4, 5); tronco.translate(0, 0.2, 0)
    const bola = sacudir(new THREE.IcosahedronGeometry(0.34, 1), 0.05, 7); bola.translate(0, 0.62, 0)
    const bola2 = sacudir(new THREE.IcosahedronGeometry(0.2, 1), 0.03, 8); bola2.translate(0.18, 0.5, 0.08)
    return unir([facetas(tronco, (c) => matiz(PAL.tronco, c.y * 9)), facetas(bola, (c, n) => matiz(col, c.x * 13 + c.y * 7 + c.z * 3, 1.2).multiplyScalar(0.9 + 0.14 * n.y)), facetas(bola2, (c, n) => matiz(col, c.x * 11 + c.y * 5 + c.z * 3, 1.2).multiplyScalar(0.9 + 0.14 * n.y))])
  }
  const tipos = { pino: pinoGeo, copa: copaGeo(PAL.copa2), ocre: copaGeo(PAL.ocre) }
  const grupos = {}
  for (const [k, g] of Object.entries(tipos)) {
    const lista = arboles.filter((a) => (k === 'pino' ? a.pino : k === 'ocre' ? !a.pino && a.ocre : !a.pino && !a.ocre))
    const m = new THREE.InstancedMesh(g, mate(), Math.max(1, lista.length))
    m.count = lista.length
    m.castShadow = m.receiveShadow = true
    m.frustumCulled = false
    scene.add(m)
    grupos[k] = { m, lista }
  }

  // ---- nubes
  const nube = (bolas, semilla) => unir(bolas.map(([x, y, z, r], i) => {
    const g = sacudir(new THREE.IcosahedronGeometry(r, 1), r * 0.12, semilla + i)
    g.scale(1, 0.85, 0.9); g.translate(x, y, z)
    const p = g.attributes.position; for (let k = 0; k < p.count; k++) if (p.getY(k) < -0.01 * i) p.setY(k, -0.01 * i)
    return facetas(g, (c, n) => matiz(n.y < -0.5 ? PAL.nubeBase : PAL.nube, c.x * 11 + c.y * 5 + i, 0.5))
  }))
  const matNube = mate({ emissive: '#ffffff', emissiveIntensity: 0.12 })
  const nubes = [[[-3.8, 3.2, -2.2], 0.9], [[3.8, 3.7, -3.6], 0.75], [[-10, 4.2, -16], 2.2], [[11, 5, -20], 2.6]].map(([pos, s], i) => {
    const m = malla(nube([[0, 0.25, 0, 0.9], [-0.95, 0.1, 0.1, 0.65], [0.9, 0.12, 0, 0.72], [1.6, 0.02, 0.1, 0.42]], 20 + i * 5), matNube)
    m.scale.setScalar(s); m.userData.base = pos; scene.add(m); return m
  })

  // ---- cámara: una grúa continua, de cerca de la casa a la isla entera
  const cam = {
    pos: U.camino([[0, [1.7, 1.5, 4.6]], [2.2, [2.6, 2.4, 6.6]], [4.2, [1.3, 4.0, 9.0]], [6, [0.7, 4.7, 10.2]]]),
    mira: U.camino([[0, [0.3, 0.72, 0.5]], [2.2, [0.2, 0.7, 0]], [4.2, [0, 0.9, -0.3]], [6, [0, 1.0, -0.4]]]),
    foco: U.pista([[0, [0.3, 0.5, 0.6]], [2.4, [0.3, 0.5, 0.6]], [5, [0, 0.6, -0.2]]]),
    ap: U.pista([[0, 0.045], [6, 0.06]]),
  }

  E.alActualizar((t) => {
    reloj.value = t
    // la casa cae con un rebote
    const kc = U.resorte(t - 0.25, 2.4, 0.4)
    casa.visible = t > 0.25
    casa.scale.set(Math.max(0.001, 1 + (1 - kc) * 0.15), Math.max(0.001, kc), Math.max(0.001, 1 + (1 - kc) * 0.15))
    for (const { m, lista } of Object.values(grupos)) {
      lista.forEach((a, i) => {
        const k = U.resorte(t - a.t0, 2.3, 0.38), w = U.resorte(t - a.t0, 1.8, 0.5)
        U.colocar(m, i, [a.x, a.y, a.z], [0, a.giro, 0], [a.s * Math.max(0.001, w), a.s * Math.max(0.001, k), a.s * Math.max(0.001, w)])
      })
      m.instanceMatrix.needsUpdate = true
    }
    nubes.forEach((n, i) => n.position.set(n.userData.base[0] + 0.12 * t, n.userData.base[1] + 0.06 * Math.sin(t * 0.8 + i), n.userData.base[2]))
    E.camara(cam.pos(t), cam.mira(t))
    E.enfoque(cam.foco(t), cam.ap(t))
    cielo.position.copy(E.camera.position)
  })
}

function unir(lista) {
  const out = new THREE.BufferGeometry()
  for (const nombre of ['position', 'normal', 'color']) {
    const tam = lista[0].attributes[nombre].itemSize, arr = new Float32Array(lista.reduce((s, g) => s + g.attributes[nombre].array.length, 0))
    let o = 0
    for (const g of lista) { arr.set(g.attributes[nombre].array, o); o += g.attributes[nombre].array.length }
    out.setAttribute(nombre, new THREE.BufferAttribute(arr, tam))
  }
  return out
}

