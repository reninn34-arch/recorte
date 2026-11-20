// El kit de personajes del motor 3D de Recorte: un personaje de caricatura (cabeza grande, cuerpo de frijol, brazos y
// piernas con codo y rodilla) que camina, saluda, habla con la boca al ritmo de la voz, mira, señala, salta, festeja y
// pone caras. No trae material propio: cada estilo lo viste con el suyo (plastilina, inflable, low poly…), así el
// personaje es del mismo mundo que todo lo demás.
//
//   const P = personaje({ material: (parte, color) => ..., forma: (geo, parte, i) => geo, colores, pelo, alto })
//   scene.add(P.grupo)
//   E.alActualizar((t) => P.animar(t, ACCIONES))       // ACCIONES: la lista de lo que hace (ver animar)
//
// El personaje mira hacia +z (de frente a una cámara en +z) y pisa en y = 0 de su grupo.
import * as THREE from 'three'
import { U } from './escenario.js'

const PARTES = ['piel', 'ropa', 'pantalon', 'zapato', 'pelo', 'ojo', 'pupila', 'brillo', 'boca', 'labio', 'mejilla', 'ceja']

/** Las caras: cejas (alto, giro: + baja la punta de adentro), sonrisa (+1 U, -1 ∩), boca abierta, ancho y ojos. */
const CARAS = {
  neutro: { cejaY: 0, cejaGiro: 0, sonrisa: 0.35, abre: 0, ancho: 1, ojos: 1 },
  feliz: { cejaY: 0.006, cejaGiro: -0.12, sonrisa: 1, abre: 0, ancho: 1.1, ojos: 0.92 },
  sorpresa: { cejaY: 0.028, cejaGiro: -0.2, sonrisa: 0, abre: 0.75, ancho: 0.55, ojos: 1.18 },
  triste: { cejaY: 0.008, cejaGiro: -0.45, sonrisa: -0.8, abre: 0, ancho: 0.85, ojos: 0.9 },
  enojo: { cejaY: -0.012, cejaGiro: 0.5, sonrisa: -0.45, abre: 0, ancho: 0.9, ojos: 0.85 },
  piensa: { cejaY: 0.012, cejaGiro: 0.15, sonrisa: -0.1, abre: 0, ancho: 0.7, ojos: 0.95 },
}

const angulo = (a, b, k) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k }
/** Cuánto pesa una acción en t: entra en `ent` segundos y sale en `sal` (después de t1, si tiene). */
const peso = (t, t0, t1, ent = 0.22, sal = 0.3) => {
  const a = U.suave(t0, t0 + ent, t)
  return t1 == null ? a : a * (1 - U.suave(t1, t1 + sal, t))
}

/** La boca a partir de la voz: los datos que escribe `boca-de-voz.mjs` ({ fps, valores }) → (t) => 0..1. */
export function bocaDe(datos, desde = datos.desde ?? 0) {
  return (t) => {
    const i = (t - desde) * datos.fps, k = Math.floor(i)
    if (k < 0 || k >= datos.valores.length - 1) return 0
    return U.mezcla(datos.valores[k], datos.valores[k + 1], i - k)
  }
}
/** Una boca que habla sin voz grabada (sílabas inventadas, ~5 por segundo, con alguna pausa). */
export const bocaInventada = (semilla = 1) => (t) => {
  const s = t * 5.2, k = Math.floor(s), f = s - k
  const h = U.hash(semilla, k)
  if (h < 0.14) return 0
  return (0.35 + 0.65 * U.hash(semilla + 7, k)) * Math.sin(Math.PI * f) ** 0.7
}

/**
 * Un personaje nuevo.
 * - `material(parte, color)`: el material del estilo para cada parte (piel, ropa, pantalon, zapato, pelo, ojo, pupila,
 *   brillo, boca, labio, mejilla, ceja). Se llama una vez por parte.
 * - `forma(geo, parte, i)`: opcional, deforma cada pieza como la haría el material (amasar en plastilina, caras
 *   planas en low poly…). Devuelve la geometría.
 * - `colores`: { piel, ropa, pantalon, zapato, pelo, ojo, pupila, boca, labio, mejilla }.
 * - `pelo`: 'corto' | 'largo' | 'cola' | 'coletas' | 'calvo'. `alto`: la altura en unidades de la escena (1 por defecto).
 * - `cara`: la cara de siempre ('feliz' por defecto). `semilla`: varía el parpadeo y los gestos.
 */
export function personaje(op = {}) {
  const C = {
    piel: '#f2b48c', ropa: '#3f7fd1', pantalon: '#2f3a57', zapato: '#3a2a22', pelo: '#3b2417', ojo: '#fbf8f2', pupila: '#1b1512',
    brillo: '#ffffff', boca: '#3d1216', labio: '#7a2a2c', mejilla: '#f08a8a', ceja: null, ...(op.colores || {}),
  }
  C.ceja = C.ceja || C.pelo
  const mats = new Map()
  const material = (parte) => {
    if (!mats.has(parte)) mats.set(parte, op.material ? op.material(parte, C[parte]) : new THREE.MeshStandardMaterial({ color: C[parte], roughness: parte === 'pupila' || parte === 'ojo' ? 0.25 : 0.6 }))
    return mats.get(parte)
  }
  let n = 0
  const pieza = (geo, parte) => {
    const g = op.forma ? op.forma(geo, parte, n++) : geo
    const m = new THREE.Mesh(g, material(parte))
    m.castShadow = m.receiveShadow = true
    return m
  }
  const grupo = new THREE.Group() // dónde está y hacia dónde mira (lo mueve animar)
  const cuerpo = new THREE.Group() // el rebote, los saltos y el aplastarse
  grupo.add(cuerpo)
  cuerpo.scale.setScalar(op.alto ?? 1)

  // ---- el cuerpo: piernas de 0 a 0.32, torso de 0.30 a 0.58, cabeza centrada en 0.78
  const CADERA = 0.32, MUSLO = 0.15, CANILLA = 0.13
  const torso = new THREE.Group()
  torso.position.y = CADERA
  cuerpo.add(torso)
  const panza = pieza(new THREE.CapsuleGeometry(0.135, 0.1, 8, 20), 'ropa')
  panza.scale.set(1, 1, 0.82)
  panza.position.y = 0.16
  torso.add(panza)
  const cintura = pieza(new THREE.CapsuleGeometry(0.128, 0.03, 8, 20), 'pantalon') // la cadera, que tapa el borde de la ropa
  cintura.scale.set(1.04, 0.7, 0.86)
  cintura.position.y = 0.025
  torso.add(cintura)

  // ---- la cabeza
  const cabeza = new THREE.Group()
  cabeza.position.y = 0.46 - CADERA + 0.34 // centro de la cabeza, medido desde la cadera
  torso.add(cabeza)
  const R = 0.21
  const craneo = pieza(new THREE.SphereGeometry(R, 40, 28), 'piel')
  craneo.scale.set(1.04, 0.96, 0.98)
  cabeza.add(craneo)
  const cuello = pieza(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 14), 'piel')
  cuello.position.y = -R * 0.95
  cabeza.add(cuello)
  // algo pegado a la cara: va sobre la esfera, mirando hacia afuera
  const enCara = (obj, x, y, salir = 0) => {
    const z = Math.sqrt(Math.max(0, R * R - x * x - y * y)) * 0.98
    const nrm = new THREE.Vector3(x * 1.04, y * 0.96, z).normalize()
    obj.position.set(x * 1.04, y * 0.96, z).addScaledVector(nrm, salir)
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm)
    cabeza.add(obj)
    return obj
  }
  const ojos = [-1, 1].map((s) => {
    const g = new THREE.Group()
    const blanco = pieza(new THREE.SphereGeometry(0.052, 24, 16), 'ojo')
    blanco.scale.set(0.92, 1.15, 0.5)
    g.add(blanco)
    const pupila = new THREE.Group()
    const pu = pieza(new THREE.SphereGeometry(0.03, 20, 14), 'pupila')
    pu.scale.set(1, 1.1, 0.5)
    pupila.add(pu)
    const br = pieza(new THREE.SphereGeometry(0.009, 10, 8), 'brillo')
    br.position.set(0.011, 0.014, 0.012)
    pupila.add(br)
    pupila.position.z = 0.02
    g.add(pupila)
    enCara(g, s * 0.075, 0.025, 0.004)
    return { g, pupila, s }
  })
  const cejas = ojos.map((o) => {
    const c = pieza(new THREE.CapsuleGeometry(0.011, 0.045, 4, 8), 'ceja')
    c.rotation.z = Math.PI / 2
    const g = new THREE.Group()
    g.add(c)
    enCara(g, o.s * 0.08, 0.095, 0.006)
    return { g, base: g.position.clone(), giro: g.quaternion.clone(), s: o.s }
  })
  enCara(pieza(new THREE.SphereGeometry(0.022, 14, 10), 'piel'), 0, -0.025, -0.004)
  ;[-1, 1].forEach((s) => { const m = pieza(new THREE.SphereGeometry(0.03, 14, 10), 'mejilla'); m.scale.set(1.2, 0.75, 0.3); enCara(m, s * 0.12, -0.045, -0.006) })
  const boca = enCara(new THREE.Group(), 0, -0.085, 0.012)
  const sonrisa = pieza(new THREE.TorusGeometry(0.045, 0.011, 8, 24, Math.PI), 'labio') // un arco ∩; con escala y negativa, U
  boca.add(sonrisa)
  const hueco = pieza(new THREE.SphereGeometry(0.05, 22, 14), 'boca')
  boca.add(hueco)

  // ---- el pelo
  const pelo = op.pelo ?? 'corto'
  if (pelo !== 'calvo') {
    const casco = pieza(new THREE.SphereGeometry(R * 1.07, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.52), 'pelo')
    casco.scale.set(1.04, 0.98, 1)
    casco.rotation.x = -0.62
    casco.position.set(0, 0.02, -0.02)
    cabeza.add(casco)
    const fleco = pieza(new THREE.CapsuleGeometry(0.045, 0.13, 6, 12), 'pelo')
    fleco.rotation.z = Math.PI / 2 + 0.25
    enCara(new THREE.Group().add(fleco), -0.06, 0.165, -0.025)
    if (pelo === 'largo') {
      const atras = pieza(new THREE.CapsuleGeometry(R * 0.95, 0.16, 8, 20), 'pelo')
      atras.scale.set(1.05, 1, 0.55)
      atras.position.set(0, -0.06, -0.09)
      cabeza.add(atras)
    }
    if (pelo === 'coletas') for (const s of [-1, 1]) {
      const c = pieza(new THREE.SphereGeometry(0.07, 18, 12), 'pelo')
      c.scale.set(0.75, 1.3, 0.75)
      c.position.set(s * R * 1.08, -0.02, -0.06)
      c.rotation.z = s * 0.5
      cabeza.add(c)
    }
    if (pelo === 'cola') {
      const cola = pieza(new THREE.SphereGeometry(0.075, 18, 12), 'pelo')
      cola.scale.set(0.8, 1.35, 0.8)
      cola.position.set(0, 0.06, -R * 1.12)
      cabeza.add(cola)
    }
  }

  // ---- brazos: hombro → codo → mano (cada pivote es un grupo, el brazo cuelga hacia -y)
  const brazos = [-1, 1].map((s) => {
    const hombro = new THREE.Group()
    hombro.position.set(s * 0.15, 0.225, 0)
    torso.add(hombro)
    const arriba = pieza(new THREE.CapsuleGeometry(0.04, 0.08, 6, 12), 'ropa')
    arriba.position.y = -0.06
    hombro.add(arriba)
    const codo = new THREE.Group()
    codo.position.y = -0.12
    hombro.add(codo)
    const abajo = pieza(new THREE.CapsuleGeometry(0.034, 0.075, 6, 12), 'piel')
    abajo.position.y = -0.055
    codo.add(abajo)
    const mano = new THREE.Group()
    mano.position.y = -0.115
    codo.add(mano)
    const palma = pieza(new THREE.SphereGeometry(0.045, 18, 12), 'piel')
    palma.scale.set(0.85, 1, 0.7)
    mano.add(palma)
    const pulgar = pieza(new THREE.CapsuleGeometry(0.014, 0.025, 4, 8), 'piel')
    pulgar.position.set(-s * 0.03, 0.01, 0.022)
    pulgar.rotation.z = -s * 0.7
    mano.add(pulgar)
    return { s, hombro, codo, mano }
  })
  // ---- piernas: cadera → rodilla → pie
  const piernas = [-1, 1].map((s) => {
    const cadera = new THREE.Group()
    cadera.position.set(s * 0.068, CADERA, 0)
    cuerpo.add(cadera)
    const muslo = pieza(new THREE.CapsuleGeometry(0.05, MUSLO - 0.04, 6, 12), 'pantalon')
    muslo.position.y = -MUSLO / 2
    cadera.add(muslo)
    const rodilla = new THREE.Group()
    rodilla.position.y = -MUSLO
    cadera.add(rodilla)
    const canilla = pieza(new THREE.CapsuleGeometry(0.044, CANILLA - 0.05, 6, 12), 'pantalon')
    canilla.position.y = -CANILLA / 2 + 0.01
    rodilla.add(canilla)
    const tobillo = new THREE.Group()
    tobillo.position.y = -CANILLA
    rodilla.add(tobillo)
    const pie = pieza(new THREE.SphereGeometry(0.058, 20, 12), 'zapato')
    pie.scale.set(0.82, 0.55, 1.35)
    pie.position.set(0, -0.012, 0.03)
    tobillo.add(pie)
    return { s, cadera, rodilla, tobillo }
  })

  // ---- quietos a propósito: respira, se balancea, parpadea
  const sem = op.semilla ?? 1
  const parpadeo = (t) => {
    let c = 0
    for (const k of [Math.floor(t / 3.1) - 1, Math.floor(t / 3.1)]) {
      const t0 = k * 3.1 + 0.4 + U.hash(sem, k) * 1.9, d = t - t0
      if (d >= 0 && d < 0.16) c = Math.max(c, 1 - Math.abs(d / 0.08 - 1))
      if (U.hash(sem + 3, k) < 0.25 && d >= 0.22 && d < 0.38) c = Math.max(c, 1 - Math.abs((d - 0.22) / 0.08 - 1)) // a veces, doble
    }
    return c
  }

  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), ea = new THREE.Euler(), abajo = new THREE.Vector3(0, -1, 0), v = new THREE.Vector3(), m4 = new THREE.Matrix4()
  const brazoA = (b, x, z, codo, k = 1, giroY = 0) => {
    ea.set(x, giroY, z)
    qa.setFromEuler(ea)
    b.hombro.quaternion.slerp(qa, k)
    b.codo.rotation.x = U.mezcla(b.codo.rotation.x, codo, k)
  }
  // un brazo apuntando a un punto del mundo
  const apuntar = (b, punto, k) => {
    grupo.updateMatrixWorld(true)
    m4.copy(b.hombro.parent.matrixWorld).invert()
    v.set(...punto).applyMatrix4(m4).sub(b.hombro.position).normalize()
    qb.setFromUnitVectors(abajo, v)
    b.hombro.quaternion.slerp(qb, k)
    b.codo.rotation.x = U.mezcla(b.codo.rotation.x, -0.1, k)
  }

  const P = {
    grupo, cuerpo, cabeza, torso,
    manos: { izq: brazos[1].mano, der: brazos[0].mano }, // para que sostenga cosas: P.manos.der.add(objeto)
    lugar: [0, 0], giro: 0,
    /** Lo pone en un lugar (x, z) mirando hacia `giro` (0 = de frente a +z). */
    ponerEn(x, z, giro = 0) { P.lugar = [x, z]; P.giro = giro; return P },
    /**
     * Lo deja como está en el segundo t según sus ACCIONES (cada una con t0 y, si dura, t1):
     * - { hace: 'camina', t0, t1, hasta: [x, z] }       camina desde donde esté; `luego: 'frente'` (o un giro) al llegar
     * - { hace: 'gira', t0, hacia: giro | [x, z] }       se da vuelta
     * - { hace: 'saluda', t0, t1, mano: 'der' | 'izq' }
     * - { hace: 'habla', t0, t1, boca: (t) => 0..1 }      con bocaDe(datos) sigue la voz; sin boca, sílabas inventadas
     * - { hace: 'mira', t0, t1?, hacia: [x, y, z] }       gira la cabeza y los ojos
     * - { hace: 'senala', t0, t1, hacia: [x, y, z], mano }
     * - { hace: 'salta', t0, alto? }   { hace: 'festeja', t0, t1 }   { hace: 'piensa', t0, t1 } (mano al mentón)
     * - { hace: 'cara', t0, t1?, como: 'feliz' | 'sorpresa' | 'triste' | 'enojo' | 'piensa' | 'neutro' }
     * Las acciones se mezclan solas (camina y habla a la vez, saluda mientras camina…).
     */
    animar(t, acciones = []) {
      const L = acciones.slice().sort((a, b) => a.t0 - b.t0)
      // dónde está y hacia dónde mira
      let [x, z] = P.lugar, giro = P.giro, fase = 0, andar = 0
      for (const a of L) {
        if (t < a.t0) break
        if (a.hace === 'camina') {
          const dx = a.hasta[0] - x, dz = a.hasta[1] - z, largo = Math.hypot(dx, dz), dir = Math.atan2(dx, dz)
          const k = U.tramo(t, a.t0, a.t1), kk = U.mezcla(k, U.curva.entraSale(k), 0.45)
          giro = angulo(giro, dir, U.suave(a.t0, a.t0 + 0.3, t))
          x += dx * kk; z += dz * kk
          fase = (largo * kk) / (0.2 * (op.alto ?? 1)) * Math.PI
          andar = Math.max(andar, peso(t, a.t0, a.t1, 0.18, 0.18))
          if (t >= a.t1) {
            const luego = a.luego ?? 'frente'
            if (luego !== 'sigue') giro = angulo(giro, luego === 'frente' ? 0 : luego, U.suave(a.t1, a.t1 + 0.45, t))
          }
        } else if (a.hace === 'gira') {
          const hacia = Array.isArray(a.hacia) ? Math.atan2(a.hacia[0] - x, a.hacia[1] - z) : a.hacia
          giro = angulo(giro, hacia, U.suave(a.t0, a.t0 + (a.dura ?? 0.4), t))
        }
      }
      grupo.position.set(x, 0, z)
      grupo.rotation.y = giro

      // la base: quieto (respira y se mece) o caminando
      const resp = Math.sin(t * 2.1 + sem) * 0.5 + 0.5
      const paso = Math.sin(fase), rebote = Math.abs(Math.cos(fase))
      cuerpo.position.y = andar * 0.022 * (rebote - 0.6) * (op.alto ?? 1)
      torso.rotation.set(andar * 0.06, andar * 0.12 * paso, Math.sin(t * 0.9 + sem) * 0.02 * (1 - andar))
      torso.scale.set(1, 1 + resp * 0.012, 1)
      for (const p of piernas) {
        const sw = p.s * paso * andar
        p.cadera.rotation.set(-0.5 * sw, 0, 0)
        p.rodilla.rotation.x = andar * (0.1 + 0.85 * Math.max(0, -p.s * Math.cos(fase)) ** 1.5)
        p.tobillo.rotation.x = -0.5 * sw * 0.5
      }
      for (const b of brazos) {
        b.hombro.quaternion.identity()
        b.codo.rotation.set(0, 0, 0)
        brazoA(b, 0.4 * b.s * paso * andar + Math.sin(t * 1.3 + b.s) * 0.03, b.s * (0.14 + resp * 0.02), -0.2 - 0.25 * andar)
      }
      cabeza.rotation.set(Math.sin(t * 1.1 + sem) * 0.025, -andar * 0.08 * paso, Math.sin(t * 0.7 + sem) * 0.03)
      cuerpo.scale.set(op.alto ?? 1, op.alto ?? 1, op.alto ?? 1)

      // la cara de siempre
      const cara = { ...CARAS[op.cara ?? 'feliz'] }
      const mezclaCara = (c, k) => { for (const q in cara) cara[q] = U.mezcla(cara[q], CARAS[c][q], k) }
      let abre = 0, mira = null, kMira = 0

      for (const a of L) {
        if (t < a.t0 - 0.5) break
        const w = peso(t, a.t0, a.t1, a.entra, a.sale)
        if (w <= 0) continue
        const d = t - a.t0
        const b = brazos[a.mano === 'izq' ? 1 : 0]
        if (a.hace === 'saluda') {
          brazoA(b, -0.15, b.s * 2.55, -0.25, w)
          b.codo.rotation.z = b.s * (0.15 + 0.45 * Math.sin(d * 11)) * w
          cabeza.rotation.z += -b.s * 0.08 * w
          mezclaCara('feliz', w)
        } else if (a.hace === 'habla') {
          const f = a.boca ?? bocaInventada(sem + Math.round(a.t0 * 10))
          const vb = U.limitar(f(t)) * w
          abre = Math.max(abre, vb)
          cabeza.rotation.x += -0.07 * vb + Math.sin(d * 2.3) * 0.03 * w
          cabeza.rotation.y += Math.sin(d * 1.1 + 1) * 0.08 * w
          if (a.manos !== false) { // gestos: una mano acompaña lo que dice
            const g = brazos[Math.floor(d / 1.6) % 2]
            const sube = 0.5 + 0.5 * Math.sin(d * 3.1)
            brazoA(g, -0.55 - 0.25 * sube, g.s * 0.35, -1.0 - 0.3 * vb, w * U.suave(0, 0.3, (d % 1.6)) * (1 - U.suave(1.3, 1.6, d % 1.6)))
          }
        } else if (a.hace === 'mira') {
          mira = a.hacia; kMira = Math.max(kMira, w)
        } else if (a.hace === 'senala') {
          apuntar(b, a.hacia, w)
          mira = a.hacia; kMira = Math.max(kMira, w * 0.8)
        } else if (a.hace === 'salta') {
          const alto = (a.alto ?? 0.35)
          const agacha = U.suave(0, 0.12, d) * (1 - U.suave(0.12, 0.18, d)), u = U.limitar((d - 0.15) / 0.45), cae = U.suave(0.6, 0.66, d) * (1 - U.suave(0.66, 0.9, d))
          if (d < 0 || d > 1) continue
          cuerpo.position.y += alto * 4 * u * (1 - u) * (op.alto ?? 1)
          const sq = 1 - 0.14 * (agacha + cae) + 0.08 * Math.sin(Math.PI * u) * (u > 0 && u < 1 ? 1 : 0)
          cuerpo.scale.set((op.alto ?? 1) * (2 - sq) ** 0.5, (op.alto ?? 1) * sq, (op.alto ?? 1) * (2 - sq) ** 0.5)
          for (const p of piernas) p.rodilla.rotation.x += 0.9 * (agacha + cae) + 0.6 * Math.sin(Math.PI * u)
          for (const p of piernas) p.cadera.rotation.x -= 0.5 * (agacha + cae) + 0.3 * Math.sin(Math.PI * u)
          for (const br of brazos) brazoA(br, -0.3, br.s * (0.3 + 2.0 * Math.sin(Math.PI * u)), -0.3, 1)
          mezclaCara('feliz', 1)
        } else if (a.hace === 'festeja') {
          for (const br of brazos) brazoA(br, -0.2, br.s * (2.5 + 0.15 * Math.sin(d * 14 + br.s)), -0.2, w)
          cuerpo.position.y += Math.abs(Math.sin(d * 7)) * 0.05 * w * (op.alto ?? 1)
          mezclaCara('feliz', w)
          abre = Math.max(abre, 0.45 * w)
        } else if (a.hace === 'piensa') {
          brazoA(brazos[0], -1.25, -0.25, -2.1, w, 0.5)
          cabeza.rotation.z += 0.12 * w; cabeza.rotation.x += -0.08 * w
          mezclaCara('piensa', w)
        } else if (a.hace === 'cara') {
          mezclaCara(a.como, w)
        }
      }

      // mirar: la cabeza gira hacia el punto (con límite) y los ojos terminan el giro
      if (mira && kMira > 0) {
        grupo.updateMatrixWorld(true)
        m4.copy(torso.matrixWorld).invert()
        v.set(...mira).applyMatrix4(m4).sub(cabeza.position)
        const yaw = U.limitar(Math.atan2(v.x, v.z), -1.1, 1.1), pitch = U.limitar(Math.atan2(v.y, Math.hypot(v.x, v.z)), -0.5, 0.6)
        cabeza.rotation.y = U.mezcla(cabeza.rotation.y, yaw * 0.75, kMira)
        cabeza.rotation.x = U.mezcla(cabeza.rotation.x, -pitch * 0.7, kMira)
        for (const o of ojos) o.pupila.position.set(U.limitar(yaw * 0.02, -0.014, 0.014) * kMira, U.limitar(pitch * 0.03, -0.012, 0.014) * kMira, 0.02)
      } else for (const o of ojos) o.pupila.position.set(0, 0, 0.02)

      // la cara: cejas, ojos (con parpadeo) y boca
      const cierra = parpadeo(t)
      for (const o of ojos) o.g.scale.set(cara.ojos, cara.ojos * Math.max(0.08, 1 - cierra), cara.ojos)
      for (const c of cejas) {
        c.g.position.copy(c.base)
        c.g.position.y += cara.cejaY
        c.g.quaternion.copy(c.giro)
        c.g.rotateZ(c.s * cara.cejaGiro)
      }
      const a = Math.max(abre, cara.abre)
      hueco.visible = a > 0.06
      hueco.scale.set(cara.ancho * (0.85 + 0.25 * (1 - a)) * (1 + Math.max(0, cara.sonrisa) * 0.15), 0.08 + 0.75 * a, 0.35)
      hueco.position.set(0, -0.004 - 0.02 * a, -0.01)
      sonrisa.visible = a < 0.25
      const sy = -cara.sonrisa
      sonrisa.scale.set(cara.ancho, Math.sign(sy || 1) * Math.max(0.18, Math.abs(sy)) * 0.7, 1)
      sonrisa.position.y = sy > 0 ? -0.022 * sy : 0.014 * -sy
    },
  }
  return P
}

export { PARTES, CARAS }
