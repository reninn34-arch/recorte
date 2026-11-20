// Escena de referencia del estilo Diorama miniatura: «la panadería del barrio». Una manzana en miniatura sobre una
// base de tierra que flota: se arma pieza por pieza, cobra vida y cae la tarde. Todo es maqueta pintada (plástico
// mate con un poco de brillo, cantos redondeados), con lente larga desde arriba y el foco corto que vende el tamaño.
// Lo reutilizable para cualquier tema (la base, las piezas, las casas, árboles, gente, faroles, el crecer) está
// arriba; lo de este tema (la panadería, el barrio, la camioneta) en construir().
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { U } from './escenario.js'
import { DURACION, T } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'neutro', exposicion: 1.0, brillo: 0.18, umbral: 1.1, vineta: 0.2, grano: 0.012, fov: 22, fondo: '#dfe9ee', lejos: 200, saturacion: 1.05 }

const PAL = {
  pasto: '#8fc262', pastoOsc: '#6fa64d', tierra: '#8a5a3b', tierraOsc: '#6b4229', piedra: '#b9a58d', asfalto: '#5c6068',
  acera: '#e9e0cf', plaza: '#ead7b5', blanco: '#fbf6ec', crema: '#f6e7c8', ladrillo: '#d0694a', techoRojo: '#c8553f',
  techoAzul: '#4f78b8', techoVerde: '#5f9466', amarillo: '#f2c14e', madera: '#9a6a44', copa: ['#5c9c48', '#76b257', '#4d8a3e', '#8cc063'],
  fondoArriba: '#cfe1ec', fondoAbajo: '#f4ead8',
}

// ---- piezas de maqueta: plástico pintado, mate con un poco de brillo y cantos redondeados
const mats = new Map()
export const pintura = (color, op = {}) => {
  const k = color + JSON.stringify(op)
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0, ...op }))
  return mats.get(k)
}
const malla = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = x.receiveShadow = true; return x }
/** Una caja de maqueta apoyada en y = 0. */
export const caja = (w, h, d, color, r = 0.035) => { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)); g.translate(0, h / 2, 0); return malla(g, typeof color === 'string' ? pintura(color) : color) }
const cilindro = (r0, r1, h, color, seg = 20) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(0, h / 2, 0); return malla(g, pintura(color)) }
const bola = (r, color, seg = 20) => malla(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), pintura(color))
/** Un techo a dos aguas (prisma), con alero. */
function techo(w, d, h, color, alero = 0.07) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2 - alero, 0), new THREE.Vector2(w / 2 + alero, 0), new THREE.Vector2(0, h)])
  const g = new THREE.ExtrudeGeometry(s, { depth: d + alero * 2, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 })
  g.translate(0, 0, -(d + alero * 2) / 2)
  return malla(g, pintura(color))
}
/** Las ventanas: el vidrio enciende de tarde (emisivo cálido). */
const vidrio = new THREE.MeshStandardMaterial({ color: '#3d5566', roughness: 0.15, metalness: 0, emissive: new THREE.Color('#ffb860'), emissiveIntensity: 0 })
function ventana(w, h, marco = '#fbf6ec') {
  const g = new THREE.Group()
  g.add(caja(w + 0.05, h + 0.05, 0.03, marco, 0.012))
  const v = caja(w, h, 0.04, vidrio, 0.01)
  v.position.z = 0.005
  g.add(v)
  const cruz = caja(0.018, h, 0.05, marco, 0.005); g.add(cruz)
  const barra = caja(w, 0.018, 0.05, marco, 0.005); barra.position.y = h / 2; g.add(barra)
  return g
}
/** Una casita: paredes, techo, puerta, ventanas y chimenea. Mira hacia +z. */
export function casa({ w = 0.9, d = 0.8, h = 0.6, pared = PAL.blanco, tejado = PAL.techoRojo, puerta = '#7a4b33', pisos = 1, chimenea = true } = {}) {
  const g = new THREE.Group()
  g.add(caja(w, h, d, pared, 0.03))
  const t = techo(w, d, h * 0.55, tejado); t.position.y = h; g.add(t)
  const p = caja(0.18, 0.3, 0.04, puerta, 0.015); p.position.set(-w * 0.18, 0, d / 2); g.add(p)
  for (let i = 0; i < pisos; i++) { const v = ventana(0.18, 0.16); v.position.set(w * 0.2, 0.17 + i * 0.32, d / 2 + 0.01); g.add(v) }
  if (pisos > 1) { const v = ventana(0.18, 0.16); v.position.set(-w * 0.18, 0.5, d / 2 + 0.01); g.add(v) }
  for (const s of [-1, 1]) { const v = ventana(0.16, 0.15); v.rotation.y = s * Math.PI / 2; v.position.set(s * (w / 2 + 0.01), h * 0.45, 0); g.add(v) }
  if (chimenea) { const c = caja(0.12, 0.35, 0.12, PAL.ladrillo, 0.015); c.position.set(w * 0.25, h + 0.08, -d * 0.15); g.add(c) }
  return g
}
/** Un árbol de maqueta: tronco y copa de bolitas. */
export function arbol(semilla, alto = 1) {
  const r = U.azar(semilla), g = new THREE.Group()
  const tronco = cilindro(0.035, 0.05, 0.32, PAL.madera, 10); g.add(tronco)
  const copa = new THREE.Group(); copa.position.y = 0.32; g.add(copa)
  const color = PAL.copa[r.entero(0, 3)]
  for (let i = 0; i < 4; i++) { const b = bola(r.rango(0.14, 0.2), color, 16); b.position.set(r.rango(-0.08, 0.08), 0.12 + i * 0.07 + r.rango(0, 0.05), r.rango(-0.08, 0.08)); copa.add(b) }
  g.scale.setScalar(alto)
  g.userData.copa = copa
  return g
}
/** Una persona de maqueta (como las figuritas de los arquitectos). */
export function persona(semilla) {
  const r = U.azar(semilla), g = new THREE.Group()
  const ropa = ['#e25b45', '#3f7fd1', '#f2c14e', '#5aa37a', '#9a62c9', '#ef8a3c'][r.entero(0, 5)]
  const piernas = caja(0.07, 0.1, 0.045, ['#2f3a57', '#4a4a4a', '#6b5a43'][r.entero(0, 2)], 0.015); g.add(piernas)
  const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.07, 4, 10), pintura(ropa)); cuerpo.castShadow = true; cuerpo.position.y = 0.155; g.add(cuerpo)
  const cabeza = bola(0.038, ['#f1c3a0', '#c98e66', '#8d5a3c'][r.entero(0, 2)], 12); cabeza.position.y = 0.26; g.add(cabeza)
  return g
}
/** Un farol que se enciende. */
const bombilla = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0, roughness: 0.4 })
export function farol() {
  const g = new THREE.Group()
  g.add(cilindro(0.015, 0.02, 0.5, '#3a3f47', 8))
  const b = malla(new THREE.SphereGeometry(0.045, 14, 10), bombilla); b.position.y = 0.52; g.add(b)
  const s = cilindro(0.05, 0.03, 0.025, '#3a3f47', 12); s.position.y = 0.56; g.add(s)
  return g
}
/** Crecer desde el suelo: escala vertical 0 → 1.1 → 1 con un rebote (la pieza «se planta»). */
export const crecer = (obj, t, t0, dura = 0.45) => {
  const k = U.tramo(t, t0, t0 + dura)
  obj.visible = k > 0
  const y = U.curva.saleAtras(k, 2.2), xz = U.mezcla(0.6, 1, U.curva.saleAtras(U.limitar(k * 1.2), 1.5))
  const s = obj.userData.escala ?? 1
  obj.scale.set(xz * s, Math.max(0.001, y) * s, xz * s)
}

// ---- la base: una losa de tierra con canto, el pasto encima y el barrio pintado en el suelo
const MEDIA = 4.5, ANILLO = 3.0, RADIO = 1.0, CALLE = 0.62
/** El camino del anillo (rectángulo redondeado): u 0..1 → [x, z] y hacia dónde va. */
function anillo(u) {
  const recta = 2 * (ANILLO - RADIO), curva = (Math.PI / 2) * RADIO, L = 4 * (recta + curva)
  let s = (((u % 1) + 1) % 1) * L
  const lados = [[[-(ANILLO - RADIO), ANILLO], [1, 0]], [[ANILLO, ANILLO - RADIO], [0, -1]], [[ANILLO - RADIO, -ANILLO], [-1, 0]], [[-ANILLO, -(ANILLO - RADIO)], [0, 1]]]
  for (let i = 0; i < 4; i++) {
    const [[x0, z0], [dx, dz]] = lados[i]
    if (s < recta) return { p: [x0 + dx * s, z0 + dz * s], dir: Math.atan2(dx, dz) }
    s -= recta
    if (s < curva) {
      const a0 = Math.atan2(dz, dx) + Math.PI / 2, a = a0 - s / RADIO // gira a la derecha
      const cx = x0 + dx * recta - Math.cos(a0) * RADIO, cz = z0 + dz * recta - Math.sin(a0) * RADIO
      return { p: [cx + Math.cos(a) * RADIO, cz + Math.sin(a) * RADIO], dir: Math.atan2(Math.sin(a) * 0 + -Math.sin(a) * -1 * 0 + Math.cos(a - Math.PI / 2), Math.sin(a - Math.PI / 2)) }
    }
    s -= curva
  }
  return { p: [0, 0], dir: 0 }
}
const rectRedondo = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }

function suelo() {
  const N = 2048, k = N / (2 * MEDIA), X = (x) => (x + MEDIA) * k
  return U.lienzo(N, N, (ctx) => {
    const r = U.azar(3)
    ctx.fillStyle = PAL.pasto; ctx.fillRect(0, 0, N, N)
    for (let i = 0; i < 9000; i++) { ctx.fillStyle = r.prob(0.5) ? 'rgba(60,110,40,0.10)' : 'rgba(190,230,140,0.10)'; ctx.beginPath(); ctx.arc(r.rango(0, N), r.rango(0, N), r.rango(2, 9), 0, 7); ctx.fill() }
    // la acera de afuera, la calle y su línea
    const borde = (ancho, color) => { ctx.strokeStyle = color; ctx.lineWidth = ancho * k; rectRedondo(ctx, X(-ANILLO), X(-ANILLO), 2 * ANILLO * k, 2 * ANILLO * k, RADIO * k); ctx.stroke() }
    borde(CALLE + 0.36, PAL.acera)
    borde(CALLE + 0.06, '#c9c1b2')
    borde(CALLE, PAL.asfalto)
    for (let i = 0; i < 2000; i++) { ctx.fillStyle = r.prob(0.5) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)'; const a = r.rango(0, 6.28), u = r.rango(0, 1), q = anillo(u); ctx.fillRect(X(q.p[0] + r.rango(-0.3, 0.3)), X(q.p[1] + r.rango(-0.3, 0.3)), 3, 3) }
    ctx.setLineDash([0.22 * k, 0.18 * k]); borde(0.035, '#f4efe2'); ctx.setLineDash([])
    // la plaza: adoquines
    const P = ANILLO - CALLE / 2 - 0.18
    rectRedondo(ctx, X(-P), X(-P), 2 * P * k, 2 * P * k, (RADIO - 0.3) * k); ctx.fillStyle = PAL.plaza; ctx.fill()
    ctx.save(); ctx.clip()
    ctx.strokeStyle = 'rgba(150,120,80,0.25)'; ctx.lineWidth = 2
    for (let y = 0; y < N; y += 0.12 * k) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(N, y); ctx.stroke(); for (let x = ((y / (0.12 * k)) % 2) * 0.09 * k; x < N; x += 0.18 * k) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 0.12 * k); ctx.stroke() } }
    ctx.restore()
    // canteros de pasto en la plaza
    ctx.fillStyle = PAL.pasto
    for (const [x, z, w, h] of [[-2.3, 0.6, 1.1, 1.5], [1.25, 0.9, 1.0, 1.2]]) { rectRedondo(ctx, X(x), X(z), w * k, h * k, 0.2 * k); ctx.fill() }
    // el camino hasta la puerta
    ctx.fillStyle = '#d9c39c'; rectRedondo(ctx, X(-0.3), X(-0.25), 0.6 * k, 2.3 * k, 0.05 * k); ctx.fill()
  })
}

function base() {
  const g = new THREE.Group()
  const forma = new THREE.Shape(); forma.moveTo(-MEDIA + 0.6, -MEDIA)
  const R = 0.6
  forma.lineTo(MEDIA - R, -MEDIA); forma.quadraticCurveTo(MEDIA, -MEDIA, MEDIA, -MEDIA + R)
  forma.lineTo(MEDIA, MEDIA - R); forma.quadraticCurveTo(MEDIA, MEDIA, MEDIA - R, MEDIA)
  forma.lineTo(-MEDIA + R, MEDIA); forma.quadraticCurveTo(-MEDIA, MEDIA, -MEDIA, MEDIA - R)
  forma.lineTo(-MEDIA, -MEDIA + R); forma.quadraticCurveTo(-MEDIA, -MEDIA, -MEDIA + R, -MEDIA)
  // la losa: tierra en capas con piedritas y el pasto que cae un poco por el borde
  const geo = new THREE.ExtrudeGeometry(forma, { depth: 1.3, steps: 26, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 3, curveSegments: 10 })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -1.3, 0)
  const N = U.ruido(8), p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = N.n3(x * 1.3, y * 6, z * 1.3)
    const pasto = y > -0.16 + 0.05 * N.n2(x * 3, z * 3)
    if (pasto) c.set(PAL.pastoOsc)
    else { const capa = Math.floor((y * 4.5 + n * 0.5) * 1) % 3; c.set([PAL.tierra, PAL.tierraOsc, '#9b6a45'][(capa + 3) % 3]).multiplyScalar(0.92 + 0.12 * N.n3(x * 9, y * 9, z * 9)) }
    col.set([c.r, c.g, c.b], i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.add(malla(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })))
  // piedritas en el canto
  const r = U.azar(4), piedras = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 0), pintura(PAL.piedra, { flatShading: true }), 60)
  for (let i = 0; i < 60; i++) {
    const lado = r.entero(0, 3), s = r.rango(-MEDIA + 0.5, MEDIA - 0.5), y = r.rango(-1.2, -0.3)
    const pos = [[s, y, MEDIA + 0.06], [MEDIA + 0.06, y, s], [s, y, -MEDIA - 0.06], [-MEDIA - 0.06, y, s]][lado]
    U.colocar(piedras, i, pos, [r.rango(0, 3), r.rango(0, 3), 0], r.rango(0.5, 1.3))
  }
  piedras.castShadow = true
  g.add(piedras)
  // el suelo pintado encima
  const sg = new THREE.ShapeGeometry(forma, 12)
  sg.rotateX(-Math.PI / 2)
  const sp = sg.attributes.position, uv = sg.attributes.uv
  for (let i = 0; i < sp.count; i++) uv.setXY(i, (sp.getX(i) + MEDIA) / (2 * MEDIA), 1 - (sp.getZ(i) + MEDIA) / (2 * MEDIA))
  const top = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: suelo(), roughness: 0.85 }))
  top.position.y = 0.071
  top.receiveShadow = true
  g.add(top)
  return g
}

export async function construir(E) {
  const { scene } = E
  await U.fuente('Fredoka', 700)
  const PISO = 0.072

  // ---- luz: sol de media tarde, cálido y con sombras nítidas; cielo claro que rellena; fondo liso en degradado
  const SOL = new THREE.Vector3(-0.55, 0.75, 0.38).normalize()
  E.entorno({ arriba: '#bcd6ea', horizonte: '#f7ead7', abajo: '#a9b98f', intensidad: 0.55, paneles: [{ pos: SOL.clone().multiplyScalar(30).toArray(), tam: [8, 8], color: '#ffe2b8', potencia: 10, redondo: true }] })
  const sol = E.sol({ desde: SOL.clone().multiplyScalar(40).toArray(), color: '#ffe3bf', potencia: 3.1, cubre: 7, suave: 0.6, mapa: 4096 })
  const cielo = E.cielo({ color: '#cfe0ff', potencia: 0.85, cubre: 7, centro: [0, 0, 0] })
  const fondo = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { a: { value: new THREE.Color(PAL.fondoArriba) }, b: { value: new THREE.Color(PAL.fondoAbajo) }, k: { value: 1 } },
    vertexShader: 'varying vec3 d; void main(){ d = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 a, b; uniform float k; varying vec3 d; void main(){ float y = normalize(d).y; gl_FragColor = vec4(mix(b, a, smoothstep(-0.6, 0.5, y)) * k, 1.0); }',
  }))
  scene.add(fondo)

  scene.add(base())

  // ---- la panadería: dos pisos crema, toldo a rayas, vidriera, letrero y chimenea del horno
  const pan = new THREE.Group()
  pan.position.set(0, PISO, -0.95)
  scene.add(pan)
  const cuerpo = new THREE.Group(); pan.add(cuerpo)
  cuerpo.add(caja(2.0, 1.45, 1.3, PAL.crema, 0.04))
  const zocalo = caja(2.04, 0.16, 1.34, '#b9583f', 0.03); cuerpo.add(zocalo)
  const tt = techo(2.0, 1.3, 0.55, PAL.techoRojo, 0.1); tt.position.y = 1.45; cuerpo.add(tt)
  const chim = caja(0.22, 0.6, 0.22, PAL.ladrillo, 0.02); chim.position.set(0.55, 1.45, -0.25); cuerpo.add(chim)
  const vidriera = new THREE.Group()
  for (const x of [-0.6, 0.6]) { const v = ventana(0.5, 0.38, '#7a4b33'); v.position.set(x, 0.42, 0.66); vidriera.add(v) }
  const puerta = caja(0.36, 0.56, 0.05, '#7a4b33', 0.02); puerta.position.set(0, 0.04, 0.655); vidriera.add(puerta)
  const vp = ventana(0.2, 0.22, '#7a4b33'); vp.position.set(0, 0.36, 0.69); vidriera.add(vp)
  for (const x of [-0.55, 0, 0.55]) { const v = ventana(0.26, 0.24); v.position.set(x, 1.0, 0.66); vidriera.add(v) }
  cuerpo.add(vidriera)
  // el toldo: una lona a rayas que se despliega
  const rayas = U.lienzo(256, 64, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fbf6ec' : '#d9483b'; ctx.fillRect(i * 32, 0, 32, 64) } })
  const toldoPiv = new THREE.Group(); toldoPiv.position.set(0, 0.8, 0.66); cuerpo.add(toldoPiv)
  const toldo = malla(new THREE.BoxGeometry(1.9, 0.02, 0.42), new THREE.MeshStandardMaterial({ map: rayas, roughness: 0.7 }))
  toldo.geometry.translate(0, 0, 0.21); toldoPiv.add(toldo)
  const fleco = U.lienzo(256, 32, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#fbf6ec' : '#d9483b'; ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + 32, 0); ctx.lineTo(i * 32 + 32, 14); ctx.arc(i * 32 + 16, 14, 16, 0, Math.PI); ctx.fill() } })
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.1), new THREE.MeshStandardMaterial({ map: fleco, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }))
  fl.castShadow = true; fl.position.set(0, -0.05, 0.42); toldoPiv.add(fl)
  // el letrero: una tabla con su nombre, sobre el toldo
  const letrero = new THREE.Group(); letrero.position.set(0, 1.38, 0.8); cuerpo.add(letrero)
  const tabla = caja(1.4, 0.34, 0.06, '#7a4b33', 0.03); letrero.add(tabla)
  const nombre = U.textoPlano('PANADERÍA', { fuente: '700 120px "Fredoka"', color: '#f6e7c8', alto: 0.2, iluminado: true }); nombre.position.set(0, 0.17, 0.035); letrero.add(nombre)
  // un pan gigante en el techo, de cartel (el humor de la miniatura: el producto grande)
  const panG = new THREE.Group(); panG.position.set(-0.45, 1.84, 0.05); cuerpo.add(panG)
  const hogaza = malla(new THREE.SphereGeometry(0.32, 28, 18), pintura('#d39a52', { roughness: 0.62 })); hogaza.scale.set(1.25, 0.62, 0.8); panG.add(hogaza)
  for (let i = 0; i < 3; i++) { const corte = caja(0.05, 0.04, 0.34, '#f1d39c', 0.02); corte.position.set(-0.18 + i * 0.18, 0.15, 0); corte.rotation.y = 0.5; panG.add(corte) }
  // macetas con flores a los lados de la puerta
  for (const x of [-1.05, 1.05]) { const m = cilindro(0.09, 0.07, 0.14, '#c8553f', 14); m.position.set(x, 0, 0.75); cuerpo.add(m); const f = bola(0.11, ['#ef6f97', '#f2c14e'][x > 0 ? 1 : 0], 12); f.position.set(x, 0.2, 0.75); cuerpo.add(f) }

  // ---- el barrio: casas alrededor del anillo, mirando a la calle
  const CASAS = [
    { pos: [3.85, -1.0], giro: -Math.PI / 2, op: { pared: '#f2d6b3', tejado: PAL.techoAzul, pisos: 2, h: 0.85 } },
    { pos: [-3.85, 1.15], giro: Math.PI / 2, op: { pared: '#d8e7d2', tejado: PAL.techoRojo } },
    { pos: [1.3, -3.85], giro: 0, op: { pared: '#f6e0e3', tejado: PAL.techoVerde, pisos: 2, h: 0.85 } },
    { pos: [-2.7, 3.85], giro: Math.PI, op: { pared: PAL.blanco, tejado: '#a35a3c' } },
  ].map((c, i) => {
    const g = casa(c.op)
    g.position.set(c.pos[0], PISO, c.pos[1]); g.rotation.y = c.giro
    scene.add(g)
    return { g, t0: T.casas[i] }
  })
  // los árboles: llenan los rincones y el borde
  const LUGARES = [[3.85, 3.85], [3.65, 2.45], [2.4, 3.95], [-3.85, -3.85], [-2.55, -3.9], [-3.9, -2.45], [3.9, -3.75], [2.65, -3.95], [-3.95, 3.95], [-3.9, 2.55], [-1.95, 0.95], [-1.95, 1.8], [1.55, 1.35], [3.95, 0.7], [0.0, 3.95], [1.2, 3.9], [-0.3, -3.95], [3.95, -2.4], [-3.95, -0.6], [-1.3, 3.9], [3.6, 1.5]]
  const arboles = LUGARES.map(([x, z], i) => { const a = arbol(20 + i, 1.3 + U.hash(i, 3) * 0.6); a.position.set(x, PISO, z); a.rotation.y = U.hash(i, 7) * 6; a.userData.escala = a.scale.x; scene.add(a); return { g: a, t0: T.arboles + i * 0.09 } })
  // la plaza: bancas, faroles y flores
  const plaza = []
  for (const [x, z, giro] of [[1.0, 1.85, 0], [-1.2, 2.1, 0.2]]) { const b = new THREE.Group(); const asiento = caja(0.5, 0.05, 0.16, PAL.madera, 0.015); asiento.position.y = 0.12; b.add(asiento); const resp = caja(0.5, 0.14, 0.03, PAL.madera, 0.012); resp.position.set(0, 0.15, -0.07); b.add(resp); for (const s of [-1, 1]) { const p = caja(0.03, 0.12, 0.14, '#3a3f47', 0.008); p.position.x = s * 0.2; b.add(p) } b.position.set(x, PISO, z); b.rotation.y = giro; scene.add(b); plaza.push(b) }
  for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.25], [2.25, 2.25], [0.55, 0.6], [-0.55, 0.6]]) { const f = farol(); f.position.set(x, PISO, z); scene.add(f); plaza.push(f) }
  const flores = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 90)
  { const r = U.azar(12); const cols = ['#ef6f97', '#f2c14e', '#fbf6ec', '#9a62c9', '#e25b45'].map((c) => new THREE.Color(c)); for (let i = 0; i < 90; i++) { const [x, z, w, h] = i < 50 ? [-2.3, 0.6, 1.1, 1.5] : [1.25, 0.9, 1.0, 1.2]; U.colocar(flores, i, [x + r.rango(0.1, w - 0.1), PISO + 0.035, z + r.rango(0.1, h - 0.1)], null, r.rango(0.7, 1.3)); flores.setColorAt(i, cols[r.entero(0, 4)]) } flores.castShadow = true; scene.add(flores) }
  plaza.push(flores)
  // arbustos por el borde de la base y frente a las casas
  const arbustos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.65 }), 70)
  { const r = U.azar(31), cols = PAL.copa.map((c) => new THREE.Color(c)); let n = 0
    for (let i = 0; i < 70; i++) { const lado = i % 4, s = r.rango(-4.0, 4.0), d = r.rango(4.05, 4.3); const [x, z] = [[s, d], [d, s], [s, -d], [-d, s]][lado]; U.colocar(arbustos, n, [x, PISO + 0.06, z], null, [r.rango(0.8, 1.4), r.rango(0.6, 1.0), r.rango(0.8, 1.4)]); arbustos.setColorAt(n++, cols[r.entero(0, 3)]) } }
  arbustos.castShadow = true; scene.add(arbustos); plaza.push(arbustos)

  // ---- la vida: la camioneta de reparto da la vuelta, la gente camina, el horno echa humo
  const van = new THREE.Group(); scene.add(van)
  const carro = new THREE.Group(); van.add(carro)
  carro.add(Object.assign(caja(0.34, 0.24, 0.62, '#f2c14e', 0.06), {}))
  const cabina = caja(0.32, 0.14, 0.2, '#3d5566', 0.04); cabina.position.set(0, 0.2, 0.18); carro.add(cabina)
  for (const [x, z] of [[-0.17, 0.2], [0.17, 0.2], [-0.17, -0.2], [0.17, -0.2]]) { const rueda = malla(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16), pintura('#2b2b2e')); rueda.rotation.z = Math.PI / 2; rueda.position.set(x, 0.0, z); carro.add(rueda) }
  carro.position.y = 0.07
  const marca = U.textoPlano('PAN', { fuente: '700 120px "Fredoka"', color: '#7a4b33', alto: 0.1, iluminado: true }); marca.rotation.y = Math.PI / 2; marca.position.set(0.175, 0.16, -0.05); carro.add(marca)
  const gente = [0, 1, 2, 3, 4].map((i) => { const p = persona(40 + i); p.scale.setScalar(1.4); scene.add(p); return p })
  const RUTAS = [ // por la acera de afuera (u del anillo) y por la plaza (de un punto a otro, ida y vuelta)
    { tipo: 'anillo', u0: 0.1, vel: 0.022, lado: 0.55 }, { tipo: 'anillo', u0: 0.55, vel: -0.018, lado: 0.55 },
    { tipo: 'tramo', a: [-0.9, 0.9], b: [-0.12, 0.4], vel: 0.35 }, { tipo: 'tramo', a: [1.9, 1.3], b: [0.5, 2.2], vel: 0.3 }, { tipo: 'tramo', a: [-1.5, 2.6], b: [1.8, 2.5], vel: 0.32 },
  ]
  const humo = Array.from({ length: 7 }, (_, i) => { const b = malla(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: '#f4f1ec', roughness: 1, transparent: true, opacity: 0.9 })); b.castShadow = false; scene.add(b); return b })
  const CHIM = [0.55, PISO + 1.45 + 0.6, -0.95 - 0.25]

  // ---- cámara: desde arriba en diagonal con lente larga; gira despacio alrededor de la base y empuja al final
  const cam = {
    pos: U.camino([[0, [11.5, 12.5, 15.5]], [3.2, [6.5, 12.0, 18.0]], [6.4, [1.5, 10.8, 18.5]], [9, [0.6, 6.4, 11.2]]]),
    mira: U.camino([[0, [0, 0.2, 0]], [3.2, [0, 0.3, 0.1]], [6.4, [0, 0.5, -0.2]], [9, [0, 0.95, -0.6]]]),
    foco: U.pista([[0, [0, 0.3, 0]], [6.4, [0, 0.6, -0.4]], [9, [0, 1.0, -0.35]]]),
    ap: U.pista([[0, 0.55], [6.4, 0.5], [9, 0.38]]),
  }

  E.alActualizar((t) => {
    // se arma: la panadería, el toldo, el letrero, las casas, los árboles, la plaza
    crecer(cuerpo, t, T.panaderia, 0.5)
    const kt = U.curva.saleAtras(U.tramo(t, T.toldo, T.toldo + 0.4), 1.8)
    toldoPiv.rotation.x = U.mezcla(-1.5, 0.32, kt); toldoPiv.visible = t >= T.toldo
    const kl = U.curva.saleElastico(U.tramo(t, T.letrero, T.letrero + 0.7))
    letrero.rotation.x = U.mezcla(-Math.PI / 2, 0, kl); letrero.visible = t >= T.letrero
    panG.visible = t >= T.letrero + 0.2; panG.scale.setScalar(U.curva.saleAtras(U.tramo(t, T.letrero + 0.2, T.letrero + 0.6), 2.5) || 0.001)
    for (const c of CASAS) crecer(c.g, t, c.t0)
    for (const a of arboles) { crecer(a.g, t, a.t0, 0.4); a.g.userData.copa.rotation.z = Math.sin(t * 1.7 + a.t0 * 9) * 0.03 }
    plaza.forEach((p, i) => crecer(p, t, T.plaza + i * 0.05, 0.35))

    // la camioneta: entra desde el borde y da la vuelta al anillo (con un rebotito de suspensión)
    const kv = U.limitar((t - T.vida) / 0.4)
    van.visible = kv > 0
    const q = anillo(0.62 + Math.max(0, t - T.vida) * 0.06), q2 = anillo(0.62 + Math.max(0, t - T.vida) * 0.06 + 0.004)
    van.position.set(q.p[0] + 0.15 * Math.sign(q2.p[0] - q.p[0] || 0) * 0, PISO, q.p[1])
    van.rotation.y = Math.atan2(q2.p[0] - q.p[0], q2.p[1] - q.p[1])
    van.scale.setScalar(U.curva.saleAtras(kv, 2) || 0.001)
    carro.position.y = 0.07 + Math.abs(Math.sin(t * 9)) * 0.008
    // la gente
    gente.forEach((p, i) => {
      const R = RUTAS[i], k = U.limitar((t - T.vida - 0.15 * i) / 0.3)
      p.visible = k > 0
      let x, z, dir
      if (R.tipo === 'anillo') {
        const u = R.u0 + Math.max(0, t - T.vida) * R.vel, a = anillo(u), b = anillo(u + 0.002 * Math.sign(R.vel))
        const nx = b.p[1] - a.p[1], nz = -(b.p[0] - a.p[0]), nl = Math.hypot(nx, nz) || 1
        x = a.p[0] - (nx / nl) * R.lado; z = a.p[1] - (nz / nl) * R.lado; dir = Math.atan2(b.p[0] - a.p[0], b.p[1] - a.p[1])
      } else {
        const L = Math.hypot(R.b[0] - R.a[0], R.b[1] - R.a[1]), s = (Math.max(0, t - T.vida) * R.vel) / L, ida = Math.floor(s) % 2 === 0, f = s % 1, u = ida ? f : 1 - f
        x = U.mezcla(R.a[0], R.b[0], u); z = U.mezcla(R.a[1], R.b[1], u); dir = Math.atan2((R.b[0] - R.a[0]) * (ida ? 1 : -1), (R.b[1] - R.a[1]) * (ida ? 1 : -1))
      }
      p.position.set(x, PISO + Math.abs(Math.sin(t * 11 + i)) * 0.012, z)
      p.rotation.set(0, dir, Math.sin(t * 11 + i) * 0.05)
      p.scale.setScalar(1.4 * (U.curva.saleAtras(k, 2) || 0.001))
    })
    // el humo del horno: bolitas que suben, crecen y se desvanecen
    humo.forEach((b, i) => {
      const f = ((t - T.humo) * 0.45 + i / humo.length) % 1
      b.visible = t > T.humo + (i / humo.length) * 0.4
      b.position.set(CHIM[0] + f * 0.35 + Math.sin(f * 5 + i) * 0.05, CHIM[1] + f * 1.1, CHIM[2] - f * 0.2)
      b.scale.setScalar(0.5 + f * 1.4)
      b.material.opacity = 0.85 * (1 - f) * U.limitar((t - T.humo) * 2)
    })

    // cae la tarde: el sol baja y se pone naranja, el cielo se apaga y se encienden ventanas y faroles
    const kt2 = U.suave(T.tarde[0], T.tarde[1], t)
    sol.color.set('#ffe3bf').lerp(new THREE.Color('#ff9a52'), kt2)
    sol.intensity = U.mezcla(3.1, 1.6, kt2)
    sol.position.copy(SOL).lerp(new THREE.Vector3(-0.9, 0.32, 0.25).normalize(), kt2).multiplyScalar(40)
    cielo.color.set('#cfe0ff').lerp(new THREE.Color('#8c8fc0'), kt2); cielo.intensity = U.mezcla(0.85, 0.5, kt2)
    scene.environmentIntensity = U.mezcla(0.55, 0.3, kt2)
    fondo.material.uniforms.a.value.set(PAL.fondoArriba).lerp(new THREE.Color('#8d93c4'), kt2)
    fondo.material.uniforms.b.value.set(PAL.fondoAbajo).lerp(new THREE.Color('#f2c29a'), kt2)
    vidrio.emissiveIntensity = 2.4 * U.suave(T.tarde[0] + 0.3, T.tarde[1], t)
    bombilla.emissiveIntensity = 4 * U.suave(T.tarde[0] + 0.5, T.tarde[1] + 0.2, t)

    E.camara(cam.pos(t), cam.mira(t))
    E.enfoque(cam.foco(t), cam.ap(t))
  })
}
