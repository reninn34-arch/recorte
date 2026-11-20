// Escena de referencia del estilo Neón: un letrero de bar en una pared de ladrillo, de noche, sobre el piso mojado.
// Las piezas son tubos de luz que se encienden con parpadeo; iluminan la pared de su color y se reflejan, borrosas, en
// el charco. Lo reutilizable (tubo de neón, encendido, pared, piso mojado con reflejo) va arriba.
import * as THREE from 'three'
import { U } from './escenario.js'
import { contornos, fuenteGoogle } from './letras3d.js'
import { DURACION, T } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'suave', exposicion: 1.05, brillo: 0.9, umbral: 0.85, vineta: 0.38, grano: 0.03, fov: 32, obturador: 0.5, fondo: '#030206', aberracion: 0.012 }

const NEON = { rosa: '#ff3fb4', celeste: '#2fd8ff', amarillo: '#ffd23a', naranja: '#ff7a2f' }

// ---- encendido de un tubo: apagado, unos destellos cortos (de a 1-3 cuadros) y firme. Devuelve 0..1.
function encendido(t, t0, semilla = 1, dura = 0.42) {
  if (t < t0) return 0
  if (t > t0 + dura) return 1
  const cuadro = Math.floor((t - t0) * 30), u = (t - t0) / dura
  return U.hash(cuadro, semilla) < 0.25 + u * 0.7 ? 1 : 0.05
}

// ---- un tubo de neón a lo largo de una línea de puntos [x, y]: el vidrio con el gas encendido y su soporte
function tubo(puntos, color, op = {}) {
  const v = puntos.map((p) => new THREE.Vector3(p.x ?? p[0], p.y ?? p[1], 0))
  const curva = new THREE.CatmullRomCurve3(v, Boolean(op.cerrado), 'centripetal', 0.2)
  const geo = new THREE.TubeGeometry(curva, Math.max(16, v.length * 3), op.radio ?? 0.028, 8, Boolean(op.cerrado))
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
  const m = new THREE.Mesh(geo, mat)
  m.userData = { color: new THREE.Color(color), largo: curva.getLength() }
  return m
}
// pone un grupo de tubos a un nivel de encendido (0 = vidrio apagado, 1 = brillando)
function prender(grupo, k, fuerza = 5) {
  grupo.traverse((m) => { if (m.isMesh && m.userData.color) m.material.color.copy(m.userData.color).multiplyScalar(k > 0.5 ? fuerza * k : 0.06) })
}

// ---- la pared: ladrillo oscuro con junta, pintado en canvas, con relieve
function pared() {
  const tex = U.lienzo(1024, 1024, (ctx, w, h) => {
    const r = U.azar(4), N = U.ruido(4)
    ctx.fillStyle = '#1a1416'; ctx.fillRect(0, 0, w, h)
    const fh = 64, fw = 128
    for (let y = 0; y < h; y += fh) for (let x = -fw; x < w; x += fw) {
      const dx = (y / fh) % 2 ? fw / 2 : 0, tono = 40 + r.rango(-12, 14)
      ctx.fillStyle = `rgb(${tono + 18},${tono * 0.7},${tono * 0.62})`
      ctx.fillRect(x + dx + 4, y + 4, fw - 8, fh - 8)
    }
    const im = ctx.getImageData(0, 0, w, h), d = im.data
    for (let i = 0; i < d.length; i += 4) { const p = i / 4, k = 1 + 0.25 * N.capas((p % w) * 0.02, Math.floor(p / w) * 0.02, 0, 3) + (U.hash(p, 7) - 0.5) * 0.12; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k }
    ctx.putImageData(im, 0, 0)
  }, { repetir: [4, 3] })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2, roughness: 0.9 }))
  m.position.set(0, 6, 0)
  m.receiveShadow = true
  return m
}

export async function construir(E) {
  const { scene } = E
  scene.add(pared())

  // ---- las piezas del letrero (en el plano de la pared, un poco delante)
  const piezas = new THREE.Group()
  piezas.position.z = 0.12
  scene.add(piezas)
  // la copa: dibujada a mano con líneas
  const copa = new THREE.Group()
  copa.add(tubo([[-0.7, 0.75], [0.7, 0.75], [0.05, 0.05], [0.05, -0.6], [0.4, -0.75], [-0.4, -0.75], [-0.05, -0.6], [-0.05, 0.05]], NEON.rosa, { cerrado: true }))
  const aceituna = []; for (let k = 0; k < 16; k++) aceituna.push([0.22 + 0.12 * Math.cos((k / 16) * 6.28), 0.45 + 0.12 * Math.sin((k / 16) * 6.28)])
  copa.add(tubo(aceituna, NEON.amarillo, { cerrado: true, radio: 0.022 }), tubo([[0.32, 0.55], [0.55, 0.95]], NEON.amarillo, { radio: 0.02 }))
  copa.position.set(-3.1, 2.75, 0)
  copa.rotation.z = 0.08
  // la palabra: los contornos de una letra manuscrita, cada uno un tubo
  const palabra = new THREE.Group()
  for (const c of await contornos('Abierto', { fuente: fuenteGoogle('Pacifico', 400), tam: 0.95 })) palabra.add(tubo(c.puntos, NEON.celeste, { cerrado: true, radio: 0.022 }))
  palabra.position.set(0.2, 2.95, 0)
  palabra.rotation.z = -0.04
  // la flecha que parpadea hacia la puerta
  const flecha = new THREE.Group()
  flecha.add(tubo([[0, 0.7], [0, -0.45]], NEON.amarillo), tubo([[-0.4, -0.05], [0, -0.5], [0.4, -0.05]], NEON.amarillo))
  flecha.position.set(3.3, 2.75, 0)
  // «24 h»
  const horas = new THREE.Group()
  for (const c of await contornos('24h', { fuente: fuenteGoogle('Baloo 2', 800), tam: 0.62 })) horas.add(tubo(c.puntos, NEON.naranja, { cerrado: true, radio: 0.02 }))
  horas.position.set(0.3, 1.65, 0)
  piezas.add(copa, palabra, flecha, horas)
  // soportes: tornillos de metal donde se agarran los tubos
  const metal = new THREE.MeshStandardMaterial({ color: '#8b8f96', roughness: 0.35, metalness: 0.9 })
  for (const [x, y] of [[-3.6, 3.4], [-2.6, 2.1], [-1.6, 3.4], [1.9, 3.5], [-0.9, 1.75], [1.4, 1.6], [3.3, 3.45]]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8), metal); s.rotation.x = Math.PI / 2; s.position.set(x, y, 0.06); scene.add(s) }
  // la puerta, abajo a la derecha, apenas visible
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.85, 0.1), new THREE.MeshStandardMaterial({ color: '#141a22', roughness: 0.6, metalness: 0.4 }))
  puerta.position.set(3.3, 0.925, 0.05)
  scene.add(puerta)

  // ---- cada pieza ilumina la pared de su color
  const luces = [[copa, NEON.rosa, [-3.1, 2.7, 0.9]], [palabra, NEON.celeste, [0.2, 2.9, 1.0]], [flecha, NEON.amarillo, [3.3, 2.7, 0.9]], [horas, NEON.naranja, [0.3, 1.6, 0.9]]].map(([g, col, p]) => {
    const l = new THREE.PointLight(col, 0, 7, 1.6); l.position.set(...p); scene.add(l); return { g, l }
  })

  // ---- el piso mojado: asfalto oscuro y brillante; debajo, el letrero dado vuelta hace de reflejo. En cada pasada el
  // reflejo se corre un poco al azar: promediado, queda borroso como en un charco de verdad.
  const asfalto = U.lienzo(512, 512, (ctx, w, h) => { const r = U.azar(9), im = ctx.createImageData(w, h); for (let i = 0; i < im.data.length; i += 4) { const v = 20 + r() * 26; im.data.set([v, v, v * 1.05, 255], i) } ctx.putImageData(im, 0, 0) }, { repetir: [8, 8] })
  const charcos = U.lienzo(512, 512, (ctx, w, h) => { const N = U.ruido(13), im = ctx.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const q = N.capas(x * 0.008, y * 0.008, 0, 3), v = 30 + 200 * U.suave(-0.12, 0.05, -q); im.data.set([v, v, v, 255], (y * w + x) * 4) } ctx.putImageData(im, 0, 0) }, { datos: true, repetir: [2, 2] })
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), new THREE.MeshStandardMaterial({ map: asfalto, roughnessMap: charcos, roughness: 1, metalness: 0.1, alphaMap: charcos, transparent: true, opacity: 1, depthWrite: false }))
  piso.rotation.x = -Math.PI / 2
  piso.position.z = 7
  piso.receiveShadow = true
  scene.add(piso)
  const reflejo = piezas.clone()
  reflejo.scale.y = -1
  scene.add(reflejo)
  // la pared también se refleja en el agua, oscura (si no, el charco parece un agujero negro)
  const paredR = pared()
  paredR.material = paredR.material.clone()
  paredR.material.color.setScalar(0.45)
  paredR.position.set(0, -6, 0)
  paredR.scale.y = -1
  scene.add(paredR)
  const tubosDe = (g) => { const l = []; g.traverse((m) => m.isMesh && l.push(m)); return l }
  const pares = [copa, palabra, flecha, horas].map((g, i) => [g, reflejo.children[i]])
  // al clonar, el color guardado se vuelve un número: se lo devuelve como color, y cada tubo con su material propio
  const originales = []; piezas.traverse((m) => m.isMesh && originales.push(m))
  let n = 0
  reflejo.traverse((m) => { if (m.isMesh) { const o = originales[n++]; m.material = o.material.clone(); m.userData.color = o.userData.color.clone() } })

  // ---- cámara: de cerca a la copa, se desliza hasta ver el letrero entero y empuja un poco al final
  const cam = {
    pos: U.camino([[0, [-2.6, 2.4, 4.2]], [1.6, [-1.2, 2.3, 6.0]], [3.2, [0.9, 1.9, 7.2]], [5.0, [-0.1, 0.4, 9.0]], [7, [-0.3, 0.3, 8.3]]]),
    fov: U.pista([[0, 32], [3.2, 32], [5.0, 44], [7, 44]]),
    mira: U.camino([[0, [-3.0, 2.7, 0]], [1.6, [-0.6, 2.7, 0]], [3.2, [1.2, 2.4, 0]], [5.0, [-0.1, 1.0, 0]], [7, [-0.2, 1.0, 0]]]),
  }

  E.alActualizar((t) => {
    const k = {
      copa: encendido(t, T.copa, 1),
      palabra: encendido(t, T.palabra, 2, 0.6),
      flecha: t < T.flecha ? 0 : Math.floor((t - T.flecha) * 2) % 2 === 0 ? 1 : 0.05, // parpadea de medio en medio segundo
      horas: encendido(t, T.horas, 4),
    }
    // una letra de la palabra que falla de vez en cuando
    const falla = t > T.falla && t < T.falla + 0.3 && U.hash(Math.floor(t * 30), 9) < 0.5
    ;[['copa', copa], ['palabra', palabra], ['flecha', flecha], ['horas', horas]].forEach(([n, g], i) => {
      prender(g, k[n])
      prender(pares[i][1], k[n], 1.6)
      luces[i].l.intensity = k[n] > 0.5 ? 9 : 0
    })
    if (falla) { const tubos = tubosDe(palabra); tubos[3].material.color.multiplyScalar(0.02); tubosDe(pares[1][1])[3].material.color.multiplyScalar(0.02) }
    // el reflejo borroso
    const [a, b] = E.pasada.k
    reflejo.position.set((a - 0.5) * 0.12, (b - 0.5) * 0.25, 0.12 + (b - 0.5) * 0.1)
    const p = cam.pos(t), m = cam.mira(t)
    E.camara(p, m, cam.fov(t))
    E.enfoque(m, 0.035)
  })
}
