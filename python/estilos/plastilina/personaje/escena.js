// Ejemplo de personaje en Plastilina: el kit de personajes del motor (personaje.js) vestido con el material del estilo
// (material.js). Lupe, de plastilina, entra caminando, saluda, habla con su voz (la boca sale de boca.js), señala su
// planta, se sorprende con el sol y festeja. Todo en poses de stop-motion; solo la cámara se mueve en tiempo real.
import * as THREE from 'three'
import { U } from './escenario.js'
import { personaje, bocaDe } from './personaje.js'
import { reloj, aplasta, plastilina, amasar, pieza, cartulina } from './material.js'
import { BOCA } from './boca.js'
import { DURACION, POSES, T } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'neutro', exposicion: 1.0, brillo: 0.05, umbral: 1.2, vineta: 0.28, grano: 0.016, fov: 30, obturador: 0, fondo: '#2f4a5a' }
const { pose, desde, tiembla } = reloj(POSES)

const claro = (c, k = 0.18) => '#' + new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k).getHexString()

export async function construir(E) {
  const { scene } = E
  E.entorno({ arriba: '#f3f7fa', horizonte: '#cfdde4', abajo: '#4a5a52', intensidad: 0.25, paneles: [{ pos: [-9, 11, 10], tam: [14, 10], color: '#fff4e6', potencia: 2.2 }] })
  const POT = 1250
  const lampara = E.foco({ desde: [-6, 10, 9], hacia: [0, 1, -0.3], color: '#fff2e0', potencia: POT, angulo: 0.55, penumbra: 1, suave: 1.3, cerca: 6, lejos: 40, sesgo: -0.0003 })
  E.cielo({ color: '#f4f8ff', potencia: 0.7, cubre: 8, centro: [0, 1.2, -0.3], abierto: 0.85 })
  const set = cartulina('#8cc7d9')
  scene.add(set.malla)
  const PARED = set.pared + 0.02

  // Lupe: el kit del motor con plastilina y amasada a mano
  const lupe = personaje({
    alto: 1.45,
    pelo: 'coletas',
    semilla: 4,
    colores: { piel: '#e9a77f', ropa: '#e2574c', pantalon: '#3d5a9c', zapato: '#f2d04a', pelo: '#5a3220', mejilla: '#ee7f7a' },
    // el personaje es chico: las marcas de la plastilina van más finas (escala) y la piel, más lisa
    material: (parte, color) => plastilina([color, claro(color)], { escala: 0.4, veta: parte === 'piel' ? 0.15 : parte === 'ojo' || parte === 'pupila' ? 0.1 : 0.4, relieve: parte === 'piel' ? 0.0025 : 0.004, rugosidad: parte === 'pupila' || parte === 'brillo' ? 0.3 : 0.58 }),
    forma: (geo, parte, i) => (parte === 'brillo' ? geo : amasar(geo, { amp: 0.005, tam: 0.07, semilla: 100 + i, dedos: parte === 'piel' || parte === 'ropa' ? 2 : 0, tamDedo: 0.05, hondo: 0.006 })),
  })
  lupe.ponerEn(-2.3, 0.7, Math.PI / 2)
  scene.add(lupe.grupo)

  // su planta: maceta, tallo y dos hojas
  const PLANTA = [0.95, 0, 0.15]
  const maceta = new THREE.Group()
  const perfil = [[0, 0], [0.3, 0], [0.33, 0.05], [0.4, 0.5], [0.46, 0.52], [0.47, 0.66], [0.42, 0.69], [0.38, 0.64]].map(([x, y]) => new THREE.Vector2(x, y))
  maceta.add(pieza(amasar(new THREE.LatheGeometry(perfil, 40), { amp: 0.02, tam: 0.3, semilla: 3, dedos: 4, tamDedo: 0.12, hondo: 0.02 }), plastilina(['#c4573b', '#de7a4a'], { veta: 0.35, dosCaras: true })))
  const tierra = pieza(amasar(new THREE.CylinderGeometry(0.41, 0.41, 0.06, 32, 2), { amp: 0.02, tam: 0.2, semilla: 4, dedos: 4, tamDedo: 0.1, hondo: 0.02 }), plastilina(['#5a3a28', '#7a5136'], { relieve: 0.009 }))
  tierra.position.y = 0.62
  maceta.add(tierra)
  const curva = new THREE.CatmullRomCurve3([[0, 0, 0], [0.03, 0.25, 0.02], [-0.03, 0.5, 0], [0, 0.72, 0]].map((v) => new THREE.Vector3(...v)))
  const tallo = pieza(amasar(new THREE.TubeGeometry(curva, 30, 0.045, 10), { amp: 0.006, tam: 0.12, semilla: 7 }), plastilina(['#4f9a4c', '#86c25e']))
  tallo.position.y = 0.64
  maceta.add(tallo)
  for (const [h, giro, s] of [[0.95, 0.3, 1], [1.15, 3.3, 0.85], [1.34, 1.4, 0.7]]) {
    const g = new THREE.SphereGeometry(0.17, 22, 12); g.scale(1.3, 0.3, 0.85); g.translate(0.2, 0, 0)
    const hoja = pieza(amasar(g, { amp: 0.008, tam: 0.1, semilla: 20 + h * 10, dedos: 2, tamDedo: 0.07, hondo: 0.01 }), plastilina(['#5fae4f', '#a9d66b'], { veta: 0.5 }))
    const brazo = new THREE.Group(); brazo.add(hoja); hoja.rotation.z = 0.35; brazo.rotation.y = giro; brazo.scale.setScalar(s); brazo.position.y = h
    maceta.add(brazo)
  }
  maceta.position.set(...PLANTA)
  maceta.rotation.y = 0.4
  scene.add(maceta)
  const PUNTA = [PLANTA[0], 1.25, PLANTA[2]]

  // el sol que se pega en la pared
  const sol = new THREE.Group()
  sol.add(pieza(amasar(new THREE.SphereGeometry(0.4, 32, 20), { amp: 0.02, tam: 0.3, semilla: 50, dedos: 4, tamDedo: 0.15, hondo: 0.02 }), plastilina(['#f7c335', '#f39a1d'])))
  sol.children[0].scale.z = 0.55
  const matRayo = plastilina(['#f7c335', '#f39a1d'])
  for (let i = 0; i < 9; i++) { const g = new THREE.ConeGeometry(0.085, 0.3, 10); g.translate(0, 0.6, 0); const m = pieza(amasar(g, { amp: 0.01, tam: 0.1, semilla: 60 + i }), matRayo); m.rotation.z = (i / 9) * Math.PI * 2 + 0.2; m.scale.z = 0.6; sol.add(m) }
  const SOL = [2.0, 2.75, PARED + 0.25]
  sol.position.set(...SOL)
  scene.add(sol)

  // lo que hace Lupe (el kit mezcla las acciones solo)
  const ACCIONES = [
    { hace: 'camina', t0: T.camina[0], t1: T.camina[1], hasta: [-0.35, 0.35] },
    { hace: 'saluda', t0: T.saluda[0], t1: T.saluda[1], mano: 'der' },
    { hace: 'habla', t0: T.habla[0], t1: T.habla[1], boca: bocaDe(BOCA) },
    { hace: 'senala', t0: T.senala[0], t1: T.senala[1], hacia: PUNTA, mano: 'izq' },
    { hace: 'mira', t0: T.sol, t1: T.salta, hacia: SOL },
    { hace: 'cara', t0: T.sol, t1: T.salta, como: 'sorpresa', entra: 0.1 },
    { hace: 'salta', t0: T.salta, alto: 0.3 },
    { hace: 'festeja', t0: T.festeja[0], t1: T.festeja[1] },
  ]

  const cam = {
    pos: U.camino([[0, [-0.9, 1.05, 4.6]], [1.8, [-0.2, 1.0, 3.9]], [4.0, [0.25, 1.0, 3.8]], [5.8, [0.6, 1.25, 4.6]], [8.6, [0.3, 1.1, 4.3]]]),
    mira: U.camino([[0, [-1.2, 0.75, 0.4]], [1.8, [-0.3, 0.95, 0.3]], [4.0, [0.2, 0.9, 0.2]], [5.8, [0.5, 1.3, -0.4]], [8.6, [0.2, 1.0, 0.1]]]),
    foco: U.pista([[0, [-1.6, 0.9, 0.6]], [1.6, [-0.35, 1.1, 0.35]], [5.8, [-0.35, 1.1, 0.35]], [8.6, [-0.35, 1.1, 0.35]]]),
  }

  E.alActualizar((t) => {
    const tp = pose(t)
    lupe.animar(tp, ACCIONES)
    const as = desde(tp, T.sol), [sw, sh] = aplasta(as)
    sol.visible = as >= 0
    sol.scale.set(sw, sw, sh)
    sol.rotation.z = as >= 0 ? Math.floor(as / 4) * 0.06 : 0
    maceta.rotation.z = desde(tp, T.senala[0] + 0.3) >= 0 && desde(tp, T.senala[0] + 0.3) < 6 ? tiembla(5, tp, 0.03) : 0
    lampara.intensity = POT * (1 + tiembla(3, tp, 0.012))
    E.camara(cam.pos(t), cam.mira(t))
    E.enfoque(cam.foco(t), 0.035)
  })
}
