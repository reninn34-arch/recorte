/**
 * Sonrisa de caricatura: labios gorditos, el interior oscuro y los dientes, suave y brillante, para videos de
 * salud dental. Hecho para Recorte. Solo usa el núcleo de Three.js (se pasa THREE: no importa nada).
 *
 *   import { crear, animar } from './modelo.js'
 *   const boca = crear(THREE, { colorLabios: '#e46f7f' })
 *   escena.add(boca)
 *   // en cada cuadro (t en segundos):
 *   animar(boca, t, { apertura: 0.6, sonrisa: 1, mancha: 2, roto: -1, espacio: -1, desgaste: -1, brillo: 0 })
 *
 * Mide unas 2,4 unidades de ancho y está centrada en el origen, mirando a +z.
 * Los dientes de arriba van del 0 (izquierda) al n-1; los centrales son los del medio.
 */

const SEG = 48 // tramos a lo largo de cada labio
const RAD = 14 // vueltas alrededor del labio

export function crear(THREE, opciones = {}) {
  const o = {
    colorLabios: '#e46f7f',
    colorDiente: '#fbfaf4',
    colorInterior: '#4a1020',
    dientes: 8,
    ancho: 1.2, // la mitad del ancho de la boca
    ...opciones
  }
  const grupo = new THREE.Group()
  grupo.name = 'sonrisa'

  const materialLabio = new THREE.MeshPhysicalMaterial({
    color: o.colorLabios,
    roughness: 0.32,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
    sheen: 0.5,
    sheenColor: new THREE.Color('#ffd6dc')
  })
  const materialInterior = new THREE.MeshStandardMaterial({ color: o.colorInterior, roughness: 0.95, side: THREE.DoubleSide })

  // Un labio: un tubo que engorda en el centro y se cierra en punta en las comisuras.
  const tubo = () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * (RAD + 1) * 3), 3))
    const indices = []
    for (let i = 0; i < SEG; i++) {
      for (let j = 0; j < RAD; j++) {
        const a = i * (RAD + 1) + j
        const b = (i + 1) * (RAD + 1) + j
        indices.push(a, a + 1, b, b, a + 1, b + 1)
      }
    }
    g.setIndex(indices)
    return new THREE.Mesh(g, materialLabio)
  }
  const labioSup = tubo()
  const labioInf = tubo()

  // Lo oscuro de dentro: una franja entre la línea de los dos labios.
  const geoInterior = new THREE.BufferGeometry()
  geoInterior.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3))
  const idx = []
  for (let i = 0; i < SEG; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  geoInterior.setIndex(idx)
  const interior = new THREE.Mesh(geoInterior, materialInterior)

  // Cada diente: una cápsula aplanada con su propio material (para mancharlo o romperlo sin tocar a los demás).
  const geoDiente = new THREE.CapsuleGeometry(0.1, 0.22, 8, 20) // 0,42 de alto
  const fila = (abajo) =>
    Array.from({ length: o.dientes }, (_, i) => {
      const u = -0.78 + (1.56 * (i + 0.5)) / o.dientes
      const centro = 1 - Math.abs(u)
      const d = new THREE.Mesh(
        geoDiente,
        new THREE.MeshPhysicalMaterial({
          color: o.colorDiente,
          roughness: 0.16,
          clearcoat: 1,
          clearcoatRoughness: 0.06,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0
        })
      )
      // Juntos, sin huecos: el ancho es el paso entre dientes (los centrales, un poco más anchos).
      d.userData = { u, ancho: (1.56 / o.dientes) * (abajo ? 0.9 : 1) * (0.88 + 0.22 * centro), color: new THREE.Color(o.colorDiente) }
      return d
    })
  const dientes = fila(false)
  const dientesAbajo = fila(true)

  grupo.add(interior, ...dientes, ...dientesAbajo, labioSup, labioInf)
  grupo.userData = { o, labioSup, labioInf, interior, dientes, dientesAbajo }
  animar(grupo, 0, {})
  return grupo
}

/**
 * Pone la boca en un estado (todo es opcional y se puede animar de un cuadro a otro):
 *   apertura 0–1: cerrada → bien abierta, enseñando los dientes
 *   sonrisa 0–1: labios rectos → sonrisa amplia (las comisuras suben)
 *   mancha, roto, espacio, desgaste: el número de un diente de arriba con ese problema (-1: ninguno)
 *   brillo 0–1: los dientes se iluminan de blanco (el «después» del tratamiento)
 *   respira: false para dejarla quieta (si no, un vaivén suave)
 */
export function animar(grupo, t, estado = {}) {
  const u = grupo.userData
  const W = u.o.ancho
  const lim = (v, d) => Math.min(1, Math.max(0, v ?? d))
  const apertura = lim(estado.apertura, 0)
  const sonrisa = lim(estado.sonrisa, 0.4)
  const vaiven = estado.respira === false ? 0 : Math.sin(t * 1.6) * 0.015
  const ancho = W * (1 + sonrisa * 0.08)

  // La línea de la boca: las comisuras suben con la sonrisa y el centro se abre con la apertura.
  const comisura = sonrisa * 0.2 + vaiven
  const abre = 0.03 + apertura * 0.5
  const curva = (s) => 1 - s * s // 1 en el centro, 0 en las comisuras
  const lineaSup = (x) => {
    const s = x / ancho
    return comisura + (abre * 0.45 - comisura * 0.15) * Math.pow(curva(s), 0.7)
  }
  const lineaInf = (x) => {
    const s = x / ancho
    // Al sonreír, el labio de abajo dibuja la «U».
    return comisura - (abre * 0.55 + comisura * 1.05) * Math.pow(curva(s), 0.85)
  }
  const fondo = (x) => 0.18 - 0.42 * (x / ancho) ** 2

  const rellenar = (malla, linea, grueso, haciaFuera) => {
    const p = malla.geometry.attributes.position
    for (let i = 0; i <= SEG; i++) {
      const s = -1 + (2 * i) / SEG
      const x = s * ancho
      const y = linea(x)
      const z = fondo(x)
      // Grosor: gordito en el centro, en punta en las comisuras; el centro del labio va por fuera de la línea.
      const r = grueso * Math.pow(Math.max(0, curva(s)), 0.55) + 0.012
      const cy = y + haciaFuera * r * 0.8
      for (let j = 0; j <= RAD; j++) {
        const a = (j / RAD) * Math.PI * 2
        p.setXYZ(i * (RAD + 1) + j, x, cy + Math.cos(a) * r * 0.85, z + Math.sin(a) * r * 1.1)
      }
    }
    p.needsUpdate = true
    malla.geometry.computeVertexNormals()
    malla.geometry.computeBoundingSphere()
  }
  rellenar(u.labioSup, lineaSup, 0.15, 1)
  rellenar(u.labioInf, lineaInf, 0.2, -1)

  const pi = u.interior.geometry.attributes.position
  for (let i = 0; i <= SEG; i++) {
    const x = (-1 + (2 * i) / SEG) * ancho
    pi.setXYZ(i * 2, x, lineaSup(x) + 0.04, fondo(x) - 0.1)
    pi.setXYZ(i * 2 + 1, x, lineaInf(x) - 0.04, fondo(x) - 0.1)
  }
  pi.needsUpdate = true
  u.interior.geometry.computeVertexNormals()
  u.interior.geometry.computeBoundingSphere()

  // Los dientes cuelgan del labio de arriba y suben del de abajo; con la boca cerrada casi no se ven.
  const brillo = lim(estado.brillo, 0)
  const ponerFila = (fila, arriba) =>
    fila.forEach((d, i) => {
      const x = d.userData.u * ancho
      const borde = arriba ? lineaSup(x) : lineaInf(x)
      const medio = (lineaSup(x) + lineaInf(x)) / 2
      let alto = Math.max(0.001, Math.min(arriba ? 0.36 : 0.3, Math.abs(borde - medio) + 0.02))
      let giro = 0
      let corrido = 0
      const m = d.material
      const c = d.userData.color
      m.color.setRGB(c.r, c.g, c.b)
      m.emissiveIntensity = brillo * 0.3
      // Con la boca casi cerrada, los dientes no asoman.
      d.visible = !(arriba && estado.espacio === i) && Math.abs(borde - medio) > 0.07
      if (arriba && estado.mancha === i) m.color.setRGB(0.8, 0.63, 0.36)
      if (arriba && estado.desgaste === i) alto *= 0.7
      if (arriba && estado.roto === i) {
        alto *= 0.6
        giro = 0.3
        corrido = 0.02
      }
      d.scale.set((d.userData.ancho * ancho) / 0.2, alto / 0.42, 0.6)
      d.rotation.set(0, Math.atan(d.userData.u * 0.9), giro)
      // El borde del diente queda metido bajo el labio.
      d.position.set(x + corrido, borde + (arriba ? -alto / 2 + 0.06 : alto / 2 - 0.06), fondo(x) - 0.05)
    })
  ponerFila(u.dientes, true)
  ponerFila(u.dientesAbajo, false)
}
