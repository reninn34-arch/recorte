// Escena de referencia del estilo Inflado: objetos de plástico inflable brillante en un estudio de color pastel. Se
// inflan desde planos y arrugados (las arrugas se estiran al llenarse, con un pequeño pasarse de más), caen y rebotan
// con peso de globo. Lo reutilizable (material inflable, inflar, rebote, gajos, estudio) va arriba.
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { U } from './escenario.js'
import { letras3d, fuenteGoogle } from './letras3d.js'
import { DURACION, T } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'cine', exposicion: 0.98, contraste: 1.06, saturacion: 1.1, brillo: 0.22, umbral: 1.3, vineta: 0.18, grano: 0.012, fov: 30, fondo: '#ffd9e6' }
const COL = { fondo: '#ffd3e2', rosa: '#ff6fa8', celeste: '#58c7f3', amarillo: '#ffd43b', lila: '#a98bff', menta: '#62e0b0', blanco: '#fff6fb', coral: '#ff7a59' }

// ---- el material inflable: plástico brillante con laca; cuando está desinflado se arruga (desplaza los vértices con
// un ruido que se borra al llenarse). gajos: colores por sectores alrededor del eje y (pelota, salvavidas).
function inflable(color, op = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.2, sheenColor: new THREE.Color('#ffffff') })
  const u = { uLleno: { value: 1 }, uArruga: { value: op.arruga ?? 0.05 }, uG1: { value: new THREE.Color(op.gajos?.[0] || color) }, uG2: { value: new THREE.Color(op.gajos?.[1] || color) }, uN: { value: op.gajos ? op.nGajos || 6 : 0 }, uEje: { value: op.ejeGajos === 'torus' ? 1 : 0 } }
  m.userData.u = u
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    const ruido = 'float rI(vec3 p){ return sin(p.x * 7.1 + sin(p.y * 5.3)) * sin(p.y * 6.7 + sin(p.z * 4.9)) * sin(p.z * 8.3 + sin(p.x * 6.1)); }\n'
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uLleno, uArruga; varying vec3 vPI;\n' + ruido)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPI = position;\nfloat fl = 1.0 - uLleno; transformed += normal * uArruga * fl * (rI(position * 1.8) + 0.5 * rI(position * 4.1));')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uG1, uG2; uniform float uN, uEje; varying vec3 vPI;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uN > 0.0) {
          float a = uEje > 0.5 ? atan(vPI.y, vPI.x) : atan(vPI.z, vPI.x);
          float g = floor((a / 6.2831853 + 0.5) * uN);
          diffuseColor.rgb = mod(g, 2.0) < 0.5 ? uG1 : uG2;
          if (uEje < 0.5 && abs(vPI.y) > 0.86 * length(vPI)) diffuseColor.rgb = vec3(1.0, 0.97, 0.98);
        }`)
  }
  m.customProgramCacheKey = () => 'inflable-recorte'
  return m
}
// un inflable no tiene cantos: se sueldan los vértices repetidos y las normales se promedian (queda todo redondeado)
function hinchar(geo) { let g = geo.clone(); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-3); g.computeVertexNormals(); return g }
const pieza = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m }

// ---- inflar: 0 = plano y arrugado, 1 = lleno; con un pequeño pasarse de más al final, como un globo
const inflar = (t, t0, dura = 0.55) => (t < t0 ? 0 : U.resorte((t - t0) / dura * 0.9, 1.1, 0.42))
function aplicarInflado(obj, k, alto = 1) {
  const z = 0.06 + 0.94 * Math.max(0, k), xy = 0.82 + 0.18 * k
  obj.scale.set(xy, xy, z)
  obj.visible = k > 0.001
  obj.traverse((m) => m.material?.userData?.u && (m.material.userData.u.uLleno.value = U.limitar(k)))
  return alto
}
// ---- caída con rebote: altura sobre el piso y cuánto se aplasta al tocar
function caer(t, t0, desde = 4) {
  if (t < t0) return { y: desde + 30, aplasta: 0 }
  const x = t - t0, g = 16, tc = Math.sqrt((2 * desde) / g)
  if (x < tc) return { y: desde - 0.5 * g * x * x, aplasta: 0 }
  let r = x - tc
  for (const [d, h] of [[0.42, 0.9], [0.28, 0.3], [0.16, 0.08]]) { if (r < d) { const u = r / d; return { y: 4 * h * u * (1 - u), aplasta: u < 0.15 ? 1 - u / 0.15 : 0 } } r -= d }
  return { y: 0, aplasta: 0 }
}
// ---- el estudio: fondo curvo sin costura, de un color
function estudio(color) {
  const g = new THREE.PlaneGeometry(60, 1, 1, 120), p = g.attributes.position, R = 3, frente = 18, L = frente + (Math.PI / 2) * R + 20
  for (let i = 0; i < p.count; i++) {
    const s = (p.getY(i) + 0.5) * L, x = p.getX(i)
    if (s < frente) p.setXYZ(i, x, 0, frente - s - 2)
    else if (s < frente + (Math.PI / 2) * R) { const a = (s - frente) / R; p.setXYZ(i, x, R - R * Math.cos(a), -2 - R * Math.sin(a)) }
    else p.setXYZ(i, x, R + s - frente - (Math.PI / 2) * R, -2 - R)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }))
  m.receiveShadow = true
  return m
}
function estrellaGeo(puntas = 5, rExt = 0.95, rInt = 0.5) {
  const s = new THREE.Shape()
  for (let i = 0; i <= puntas * 2; i++) { const r = i % 2 ? rInt : rExt, a = (i / (puntas * 2)) * Math.PI * 2 + Math.PI / 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r) }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.42, bevelSize: 0.3, bevelSegments: 12, curveSegments: 6 })
  g.center()
  return hinchar(g)
}

export async function construir(E) {
  const { scene } = E
  scene.add(estudio(COL.fondo))
  E.entorno({ arriba: '#fff4f8', horizonte: '#ffd3e2', abajo: '#f0a8c4', intensidad: 0.9, paneles: [{ pos: [-6, 8, 6], tam: [8, 6], color: '#ffffff', potencia: 5 }, { pos: [7, 5, 4], tam: [4, 7], color: '#fff0f6', potencia: 3 }, { pos: [0, 6, -8], tam: [10, 2], color: '#ffffff', potencia: 2 }] })
  E.foco({ desde: [-5, 9, 7], hacia: [0, 0.8, 0], color: '#fff6f0', potencia: 650, angulo: 0.6, penumbra: 1, suave: 1.6 })
  E.cielo({ color: '#ffe6f0', potencia: 1.1, cubre: 7, centro: [0, 0.8, 0] })

  // la estrella flota atrás, el «50%» parado en el medio, la pelota a la derecha, el salvavidas a la izquierda
  const estrella = new THREE.Group()
  estrella.add(pieza(estrellaGeo(), inflable(COL.amarillo, { arruga: 0.08 })))
  estrella.position.set(-1.6, 2.6, -1.2)
  scene.add(estrella)

  const cifras = []
  const L = await letras3d('50%', { fuente: fuenteGoogle('Baloo 2', 800), tam: 1.25, fondo: 0.75, bisel: 0.3, pasosBisel: 10, curvas: 14 })
  const colores = [COL.rosa, COL.celeste, COL.lila]
  L.letras.forEach((l, i) => {
    const g = new THREE.Group(), m = pieza(hinchar(l.geometria), inflable(colores[i % 3], { arruga: 0.07 }))
    l.geometria.computeBoundingBox()
    const alto = l.geometria.boundingBox.max.y - l.geometria.boundingBox.min.y
    m.position.y = alto / 2
    g.add(m)
    g.position.set(l.x + 0.1, 0, 0.3)
    scene.add(g)
    cifras.push({ g, t0: T.cifras[i] ?? T.cifras[0], base: [l.x + 0.1, 0, 0.3] })
  })

  const R = 0.62
  const pelota = new THREE.Group()
  const bola = pieza(new THREE.SphereGeometry(R, 64, 40), inflable(COL.blanco, { gajos: [COL.coral, COL.blanco], nGajos: 6, arruga: 0.04 }))
  bola.position.y = R
  pelota.add(bola)
  pelota.position.set(3.05, 0, 1.0)
  scene.add(pelota)

  const aro = new THREE.Group()
  const rosca = pieza(new THREE.TorusGeometry(0.62, 0.26, 40, 80), inflable(COL.blanco, { gajos: [COL.menta, COL.blanco], nGajos: 8, ejeGajos: 'torus', arruga: 0.05 }))
  rosca.rotation.x = -Math.PI / 2 + 0.25
  rosca.position.y = 0.3
  aro.add(rosca)
  aro.position.set(-2.9, 0, 1.1)
  scene.add(aro)

  const cam = {
    pos: U.camino([[0, [-1.2, 2.8, 4.0]], [1.4, [0.4, 2.3, 6.4]], [3.0, [0.2, 2.0, 7.6]], [4.6, [0.0, 2.4, 10.2]], [7, [0.0, 2.2, 9.6]]]),
    mira: U.camino([[0, [-1.5, 2.4, -1.0]], [1.4, [0.8, 1.2, 0]], [3.0, [0.2, 1.0, 0.2]], [4.6, [0, 1.15, 0]], [7, [0, 1.1, 0]]]),
  }

  E.alActualizar((t) => {
    // la estrella: se infla y queda flotando, girando despacio
    const ke = inflar(t, T.estrella)
    aplicarInflado(estrella, ke)
    estrella.rotation.set(0.15, Math.sin(t * 0.8) * 0.35, Math.sin(t * 1.1) * 0.08)
    estrella.position.y = 2.6 + Math.sin(t * 1.6) * 0.08

    // salto final de todos juntos
    const fin = t > T.final ? Math.max(0, 4 * 0.45 * ((t - T.final) / 0.42) * (1 - (t - T.final) / 0.42)) : 0
    // las cifras: se inflan una por una, paradas en el piso
    for (const c of cifras) {
      const k = inflar(t, c.t0)
      aplicarInflado(c.g, k)
      const sq = t > T.final + 0.42 && t < T.final + 0.6 ? 1 - (t - T.final - 0.42) / 0.18 : 0
      c.g.position.set(c.base[0], fin, c.base[2])
      c.g.scale.y *= 1 - 0.12 * sq
      c.g.rotation.z = Math.sin(t * 2 + c.base[0]) * 0.03 * U.limitar(k)
    }
    // la pelota cae y rebota; al tocar se aplasta
    const cp = caer(t, T.pelota)
    pelota.visible = t >= T.pelota
    pelota.position.y = cp.y + fin * 0.8
    bola.scale.set(1 + 0.18 * cp.aplasta, 1 - 0.25 * cp.aplasta, 1 + 0.18 * cp.aplasta)
    bola.position.y = R * (1 - 0.25 * cp.aplasta)
    bola.rotation.set(0, t * 0.6, -Math.min(t - T.pelota, 2) * 0.8 * (t > T.pelota ? 1 : 0))
    // el salvavidas cae girando y se asienta inclinado
    const ca = caer(t, T.aro, 3.5)
    aro.visible = t >= T.aro
    aro.position.y = ca.y + fin * 0.6
    aro.rotation.y = (t - T.aro) * 0.6
    rosca.scale.set(1, 1, 1 - 0.3 * ca.aplasta)

    const p = cam.pos(t), m = cam.mira(t), k = Math.max(1, 1.78 / (E.W / E.H)) // más angosto: se aleja para que entre todo
    E.camara([m[0] + (p[0] - m[0]) * k, m[1] + (p[1] - m[1]) * k, m[2] + (p[2] - m[2]) * k], m)
    E.enfoque(cam.mira(t), 0.04)
  })
}
