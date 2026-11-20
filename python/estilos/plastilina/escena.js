// Escena de referencia del estilo Plastilina: «una planta necesita agua, sol y tiempo». Todo es plastilina sobre una
// mesa con fondo de cartulina, animado como stop-motion (15 poses por segundo, sin estela); solo la cámara se desliza.
// Lo reutilizable para cualquier tema (la superficie, el material, las manos que amasan, el set y el reloj del
// stop-motion) está en material.js. Lo de este tema (maceta, gota, planta, sol, palabras) está en construir().
import * as THREE from 'three'
import { U } from './escenario.js'
import { reloj, aplasta, plastilina, amasar, pieza, cartulina } from './material.js'
import { letras3d, fuenteGoogle } from './letras3d.js'
import { DURACION, POSES, T, PALABRAS } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'neutro', exposicion: 1.0, brillo: 0.05, umbral: 1.2, vineta: 0.28, grano: 0.016, fov: 28, obturador: 0, fondo: '#3a2a12' }

// una caja de plastilina: cada color con el que se le mezcló un poco
const CAJA = {
  fondo: '#e7ad3f', maceta: ['#c4573b', '#de7a4a'], tierra: ['#5a3a28', '#7a5136'], agua: ['#2f86d4', '#76b9ef'],
  tallo: ['#4f9a4c', '#86c25e'], hoja: ['#5fae4f', '#a9d66b'], sol: ['#f7c335', '#f39a1d'], petalo: ['#ef6f97', '#f7a7bf'],
  centro: ['#f5b82e', '#e8891a'], crema: ['#f6ead0', '#ecd3a4'],
}

const { pose, desde, tiembla } = reloj(POSES)

export async function construir(E) {
  const { scene } = E
  const r = U.azar(9)

  // luz: una lámpara grande y suave arriba a la izquierda, luz de cielo que se mete en cada rincón
  E.entorno({ arriba: '#f7f1e6', horizonte: '#d9c9a8', abajo: '#6b5330', intensidad: 0.25, paneles: [{ pos: [-9, 11, 10], tam: [14, 10], color: '#fff2df', potencia: 2.2 }] })
  const POT = 1300
  const lampara = E.foco({ desde: [-7, 10.5, 9], hacia: [0.3, 1.2, -0.5], color: '#fff0dc', potencia: POT, angulo: 0.55, penumbra: 1, suave: 1.3, cerca: 6, lejos: 40, sesgo: -0.0003 })
  E.cielo({ color: '#fff6e8', potencia: 0.7, cubre: 8, centro: [0, 1.5, -0.5], abierto: 0.85 })
  const set = cartulina(CAJA.fondo)
  scene.add(set.malla)
  const PARED = set.pared + 0.02

  // la maceta, con su tierra
  const maceta = new THREE.Group()
  const perfil = [[0, 0], [0.42, 0], [0.47, 0.06], [0.58, 0.75], [0.66, 0.78], [0.68, 0.98], [0.6, 1.02], [0.55, 0.96]].map(([x, y]) => new THREE.Vector2(x, y))
  maceta.add(pieza(amasar(new THREE.LatheGeometry(perfil, 48), { amp: 0.025, tam: 0.4, semilla: 3, dedos: 5, tamDedo: 0.18, hondo: 0.025 }), plastilina(CAJA.maceta, { veta: 0.35, dosCaras: true })))
  const tierra = pieza(amasar(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 40, 2), { amp: 0.03, tam: 0.25, semilla: 4, dedos: 6, tamDedo: 0.15, hondo: 0.03 }), plastilina(CAJA.tierra, { veta: 0.3, relieve: 0.009 }))
  tierra.position.y = 0.92
  maceta.add(tierra)
  const MACETA = [0.55, 0, 0.1]
  maceta.position.set(...MACETA)
  maceta.rotation.y = 0.3
  scene.add(maceta)
  const BOCA = [MACETA[0], 0.95, MACETA[2]]

  // la gota de agua: salta desde la izquierda en un arco y se aplasta en la tierra
  const gota = pieza(amasar(new THREE.SphereGeometry(0.17, 28, 20), { amp: 0.015, tam: 0.2, semilla: 6, dedos: 2, tamDedo: 0.1, hondo: 0.015 }), plastilina(CAJA.agua, { rugosidad: 0.4, veta: 0.5 }))
  gota.geometry.translate(0, 0.17, 0)
  scene.add(gota)
  const GOTA0 = [-2.4, 0, 0.9]

  // la planta: un tallo que crece a tirones, hojas que brotan, una flor que abre
  const curvaTallo = new THREE.CatmullRomCurve3([[0, 0, 0], [0.03, 0.3, 0.02], [-0.04, 0.6, 0.0], [0.02, 0.85, -0.03], [0, 1, 0]].map((v) => new THREE.Vector3(...v)))
  const tallo = pieza(amasar(new THREE.TubeGeometry(curvaTallo, 40, 0.055, 10), { amp: 0.008, tam: 0.15, semilla: 7 }), plastilina(CAJA.tallo, { veta: 0.4 }))
  tallo.position.set(...BOCA)
  scene.add(tallo)
  const hojaGeo = [1, 2, 3].map((s) => { const g = new THREE.SphereGeometry(0.2, 24, 12); g.scale(1.25, 0.3, 0.85); g.translate(0.22, 0, 0); return amasar(g, { amp: 0.01, tam: 0.12, semilla: 20 + s, dedos: 2, tamDedo: 0.08, hondo: 0.01 }) })
  const hojas = [[T.hojas[0], 0.3, 0.4, 1], [T.hojas[1], 0.46, 3.4, 1], [T.hojas2[0], 0.62, 1.1, 0.9], [T.hojas2[1], 0.78, 4.0, 0.8]].map(([t0, h, giro, s], i) => {
    const m = pieza(hojaGeo[i % 3], plastilina(CAJA.hoja, { veta: 0.5 }))
    const g = new THREE.Group(); g.add(m); m.rotation.z = 0.35; g.rotation.y = giro; scene.add(g)
    return { g, t0, h, s }
  })
  const flor = new THREE.Group()
  const centro = pieza(amasar(new THREE.SphereGeometry(0.13, 24, 16), { amp: 0.012, tam: 0.1, semilla: 30, dedos: 3, tamDedo: 0.06, hondo: 0.012 }), plastilina(CAJA.centro, { relieve: 0.012 }))
  centro.scale.set(1, 0.7, 1)
  flor.add(centro)
  const matPetalo = plastilina(CAJA.petalo, { veta: 0.5 })
  const petalos = Array.from({ length: T.petalos }, (_, i) => {
    const g = new THREE.SphereGeometry(0.16, 22, 12); g.scale(1, 0.28, 0.62); g.translate(0.21, 0, 0)
    const m = pieza(amasar(g, { amp: 0.01, tam: 0.1, semilla: 40 + i, dedos: 1, tamDedo: 0.07, hondo: 0.012 }), matPetalo)
    const brazo = new THREE.Group(); brazo.add(m); brazo.rotation.y = (i / T.petalos) * Math.PI * 2; m.rotation.z = 0.18
    flor.add(brazo)
    return m
  })
  flor.rotation.x = 0.75 // mira hacia la cámara
  scene.add(flor)

  // el sol, pegado arriba en la pared
  const sol = new THREE.Group()
  sol.add(pieza(amasar(new THREE.SphereGeometry(0.42, 32, 20), { amp: 0.02, tam: 0.3, semilla: 50, dedos: 4, tamDedo: 0.15, hondo: 0.02 }), plastilina(CAJA.sol)))
  sol.children[0].scale.z = 0.55
  const matRayo = plastilina(CAJA.sol)
  for (let i = 0; i < 9; i++) {
    const g = new THREE.ConeGeometry(0.09, 0.32, 10); g.translate(0, 0.62, 0)
    const m = pieza(amasar(g, { amp: 0.01, tam: 0.1, semilla: 60 + i }), matRayo)
    m.rotation.z = (i / 9) * Math.PI * 2 + 0.2
    m.scale.z = 0.6
    sol.add(m)
  }
  sol.position.set(2.6, 3.05, PARED + 0.25)
  scene.add(sol)

  // las palabras: letras de plastilina crema que se aplastan contra el fondo
  const LUGAR = { AGUA: [-1.95, 2.15], SOL: [2.6, 2.1], TIEMPO: [-0.1, 3.75] }
  const palabras = []
  for (const [texto, t0] of PALABRAS) {
    const L = await letras3d(texto, { fuente: fuenteGoogle('Fredoka', 600), tam: texto === 'TIEMPO' ? 0.62 : 0.5, fondo: 0.16, bisel: 0.045, pasosBisel: 4 })
    const mat = plastilina(CAJA.crema, { veta: 0.25, relieve: 0.004 })
    const g = new THREE.Group()
    L.letras.forEach((l, i) => { const m = pieza(amasar(l.geometria, { amp: 0.012, tam: 0.18, semilla: 70 + i + texto.length * 7, dedos: 1, tamDedo: 0.1, hondo: 0.012 }), mat); m.position.set(l.x, l.y + r.rango(-0.02, 0.02), 0); m.rotation.z = r.rango(-0.05, 0.05); g.add(m) })
    g.position.set(LUGAR[texto][0], LUGAR[texto][1], PARED + 0.08)
    scene.add(g)
    palabras.push({ g, t0, id: texto.length * 13 })
  }

  // cámara: un solo deslizamiento. Macro en la maceta, sigue a cada idea, se aleja para ver todo y empuja al final.
  const cam = {
    pos: U.camino([[0, [1.3, 1.35, 3.7]], [1.3, [0.0, 1.6, 6.1]], [3.4, [1.0, 2.0, 7.5]], [5.0, [0.2, 2.2, 9.3]], [6.3, [0.55, 1.9, 7.0]], [8.5, [0.4, 2.1, 8.3]]]),
    mira: U.camino([[0, [0.55, 0.78, 0.1]], [1.3, [-0.45, 1.2, -1.0]], [3.4, [1.0, 1.65, -1.2]], [5.0, [0.1, 1.8, -1.2]], [6.3, [0.5, 1.5, -0.3]], [8.5, [0.3, 1.72, -0.8]]]),
    foco: U.pista([[0, [0.55, 0.95, 0.1]], [1.3, [0.3, 1.1, -0.2]], [3.0, [0.4, 1.4, -0.6]], [3.6, [1.6, 2.2, -1.8]], [5.0, [0.4, 1.6, -0.6]], [6.3, [0.55, 1.95, 0.15]], [8.5, [0.4, 1.8, -0.2]]]),
    ap: U.pista([[0, 0.05], [1.3, 0.06], [5, 0.05], [8.5, 0.045]]),
  }

  E.alActualizar((t) => {
    const tp = pose(t) // la plastilina vive en poses; la cámara, en tiempo real

    // la gota: cuatro poses para ir de la mesa a la maceta en arco; al caer se aplasta y se hunde
    const ag = desde(tp, T.gota), ac = desde(tp, T.cae), vuelo = desde(tp, T.cae) - desde(tp, T.gota)
    gota.visible = ag >= 0 && ac < 4
    if (ac < 0) {
      const u = U.limitar(ag / Math.max(1, -vuelo)), alto = 1.55 * 4 * u * (1 - u)
      gota.position.set(U.mezcla(GOTA0[0], BOCA[0], u), U.mezcla(GOTA0[1], BOCA[1], u) + alto, U.mezcla(GOTA0[2], BOCA[2], u))
      gota.scale.set(0.9, 1.15, 0.9)
      gota.rotation.set(u * 2, 0, u * 1.5)
      if (ag === 0) gota.scale.set(1.2, 0.7, 1.2) // toma impulso
    } else {
      const s = [[1.5, 0.45], [1.7, 0.25], [1.5, 0.12], [1.2, 0.05]][Math.min(ac, 3)]
      gota.position.set(...BOCA)
      gota.scale.set(s[0], s[1], s[0])
      gota.rotation.set(0, 0, 0)
    }
    tierra.material.color.set(CAJA.tierra[0]).multiplyScalar(ac >= 2 ? 0.8 : 1) // la tierra queda mojada

    // el tallo: sale y crece de a tirones (una altura nueva cada dos poses)
    const ab = desde(tp, T.brota), acr = desde(tp, T.crece)
    let alto = ab < 0 ? 0 : Math.min(0.55, 0.12 + Math.floor(ab / 2) * 0.11)
    if (acr >= 0) alto = Math.min(1.45, 0.55 + Math.floor(acr / 2) * 0.12)
    tallo.visible = alto > 0
    tallo.scale.set(1, Math.max(0.001, alto), 1)
    tallo.rotation.z = (ab >= 0 && ab < 6) || (acr >= 0 && acr < 18) ? tiembla(7, tp, 0.04) : 0
    for (const h of hojas) {
      const a = desde(tp, h.t0), [w, y] = aplasta(a)
      h.g.visible = a >= 0
      h.g.position.set(BOCA[0], BOCA[1] + Math.min(h.h, alto * 0.92), BOCA[2])
      h.g.scale.set(h.s * w, h.s * y, h.s * w)
      h.g.rotation.z = a >= 0 && a < 5 ? tiembla(h.t0 * 10, tp, 0.08) : 0
    }
    // la flor: el centro aparece en la punta y los pétalos se pegan uno cada dos poses
    const af = desde(tp, T.flor)
    flor.visible = af >= 0
    flor.position.set(BOCA[0], BOCA[1] + alto + 0.02, BOCA[2] + 0.02)
    const [cw, ch] = aplasta(af)
    centro.scale.set(cw, 0.7 * ch, cw)
    petalos.forEach((p, i) => { const a = af - 2 - i * 2, [w, y] = aplasta(a); p.visible = a >= 0; p.scale.set(w, y, w) })
    flor.rotation.y = af >= 0 && af < 20 ? tiembla(91, tp, 0.05) : 0

    // el sol: se pega a la pared, se aplasta y queda; los rayos giran un paso cada cuatro poses
    const as = desde(tp, T.sol), [sw, sh] = aplasta(as)
    sol.visible = as >= 0
    sol.scale.set(sw, sw, sh)
    sol.rotation.z = as >= 0 ? Math.floor(as / 4) * 0.06 : 0

    // las palabras: se tiran contra la pared, se aplastan, saltan y se asientan; temblando un poco al principio
    for (const p of palabras) {
      const a = desde(tp, p.t0), [w, y] = aplasta(a), suelto = U.limitar(1 - a / 6)
      p.g.visible = a >= 0
      p.g.scale.set(w, w, y)
      p.g.rotation.z = tiembla(p.id, tp, 0.04) * suelto
    }

    lampara.intensity = POT * (1 + tiembla(3, tp, 0.012)) // ningún cuadro se fotografía exactamente igual
    E.camara(cam.pos(t), cam.mira(t))
    E.enfoque(cam.foco(t), cam.ap(t))
  })
}
