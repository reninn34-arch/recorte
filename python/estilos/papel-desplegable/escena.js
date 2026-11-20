// Escena de referencia del estilo Papel desplegable: un libro pop-up abierto sobre una mesa de madera, bajo una
// lámpara. Cada página doble tiene un piso impreso, tarjetas troqueladas que se levantan al abrirse y una cinta con
// palabras. Solo se mueven las hojas: al pasar, aplastan la escena vieja y la nueva sube de la canaleta.
// Lo reutilizable (papel, troquel, tarjetas plegables, libro, mesa) va arriba; lo de este tema, en ESCENAS.
import * as THREE from 'three'
import { U } from './escenario.js'
import { DURACION, VUELTA, HOJAS, PALABRAS } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'neutro', exposicion: 0.95, saturacion: 1.08, brillo: 0.1, umbral: 1.1, vineta: 0.4, grano: 0.014, fov: 26, fondo: '#060403' }

const C = { carton: '#f4ead6', crema: '#fbf3df', tinta: '#22364e', coral: '#e2604a', rosa: '#f2a593', amarillo: '#f4bd38', ocre: '#cf7d22', hoja: '#6f9f5a', salvia: '#a7c687', bosque: '#2f6652', cielo: '#cfe5df', cafe: '#6b3f25', grano: '#8a5232', crema2: '#efe0c0' }
const PW = 5.4, PD = 6.2, GROSOR = 0.04, PX = 140 // una página (el libro abierto mide 10.8); resolución de impresión

// ---- el lápiz: dibuja en unidades del mundo (x a la derecha, y hacia arriba)
function lapiz(ctx) {
  const a = {
    ctx,
    forma(col, fn) { ctx.fillStyle = col; ctx.beginPath(); fn(ctx); ctx.fill(); return a },
    elipse(col, x, y, rx, ry = rx, rot = 0) { return a.forma(col, (c) => c.ellipse(x, y, rx, ry, rot, 0, 7)) },
    caja(col, x, y, w, h, r = 0) { return a.forma(col, (c) => c.roundRect(x, y, w, h, r)) },
    linea(col, w, fn, guiones) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = ctx.lineJoin = 'round'; ctx.setLineDash(guiones || []); ctx.beginPath(); fn(ctx); ctx.stroke(); ctx.setLineDash([]); return a },
    cerro(col, x0, x1, alto, y0 = -0.1) { return a.forma(col, (c) => { c.moveTo(x0, y0); for (let x = x0; x <= x1 + 1e-6; x += 0.08) c.lineTo(x, alto(x)); c.lineTo(x1, y0) }) },
    texto(s, x, y, tam, col, alinear = 'center') { ctx.save(); ctx.translate(x, y); ctx.scale(tam / 100, -tam / 100); ctx.font = '700 100px "Fraunces"'; ctx.textAlign = alinear; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = col; ctx.fillText(s, 0, 0); ctx.restore(); return a },
  }
  return a
}
// el papel no es nunca parejo: unas motas de tinta multiplicadas sobre cada impresión
const motas = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256), r = U.azar(2); for (let i = 0; i < 65536; i++) { const v = 255 - 28 * r() ** 3 - (r.prob(0.01) ? 55 : 0); im.data.set([v, v, v * 0.985, 255], i * 4) } x.putImageData(im, 0, 0); return c })()
const entintar = (ctx, w, h) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = ctx.createPattern(motas, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over' }
let FIBRA = null
const fibra = () => FIBRA || (FIBRA = U.lienzo(512, 512, (ctx, w, h) => { const N = U.ruido(3), r = U.azar(8), im = ctx.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 128 + 60 * N.capas(x * 0.012, y * 0.012, 0, 2) + 25 * N.capas(x * 0.08, y * 0.08, 3, 2) + 12 * (U.hash(x, y) - 0.5); im.data.set([v, v, v, 255], (y * w + x) * 4) } ctx.putImageData(im, 0, 0); ctx.lineCap = 'round'; for (let i = 0; i < 2500; i++) { const x = r.rango(0, w), y = r.rango(0, h), q = r.rango(0, 6.3), L = r.rango(5, 22); ctx.strokeStyle = `rgba(255,255,255,${r.rango(0.05, 0.3)})`; ctx.lineWidth = r.rango(0.6, 1.4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(q) * L, y + Math.sin(q) * L); ctx.stroke() } }, { datos: true, repetir: [3, 3] }))
const papel = (map, op = {}) => new THREE.MeshStandardMaterial({ map, bumpMap: fibra(), bumpScale: 0.5, roughness: 0.93, metalness: 0, ...op })

// ---- el troquel: imprime una pieza sobre transparente y la recorta dejando un margen de cartón crema alrededor
const MARGEN = 0.05
function troquelar(x0, y0, w, h, dibuja) {
  const cw = Math.ceil(w * PX), ch = Math.ceil(h * PX)
  const arte = document.createElement('canvas'); arte.width = cw; arte.height = ch
  const ax = arte.getContext('2d'); ax.setTransform(PX, 0, 0, -PX, -x0 * PX, (y0 + h) * PX); dibuja(lapiz(ax))
  return U.lienzo(cw, ch, (ctx) => {
    // el margen: la silueta del dibujo, corrida en un círculo, pintada de cartón
    const m = MARGEN * PX
    for (let k = 0; k < 16; k++) ctx.drawImage(arte, Math.cos((k / 16) * 6.283) * m, Math.sin((k / 16) * 6.283) * m)
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = C.crema; ctx.fillRect(0, 0, cw, ch)
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(arte, 0, 0)
    // la tinta nunca es pareja: motas multiplicadas, y la silueta vuelve a recortarse
    const silueta = document.createElement('canvas'); silueta.width = cw; silueta.height = ch; silueta.getContext('2d').drawImage(ctx.canvas, 0, 0)
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = ctx.createPattern(motas, 'repeat'); ctx.fillRect(0, 0, cw, ch)
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(silueta, 0, 0); ctx.globalCompositeOperation = 'source-over'
  })
}

// ---- una tarjeta plegable: se para sobre su página con la base en z0. Si cruza la canaleta se parte en dos mitades,
// una en cada página, que se doblan cada una con su página (al abrir el libro se ven como una sola).
function tarjeta(def, capa) {
  const tex = troquelar(def.x[0] - MARGEN, -0.08, def.x[1] - def.x[0] + 2 * MARGEN, def.alto + 0.08 + MARGEN, def.arte)
  const X0 = def.x[0] - MARGEN, ANCHO = def.x[1] - def.x[0] + 2 * MARGEN, ALTO = def.alto + 0.08 + MARGEN
  const mitades = []
  for (const lado of [-1, 1]) {
    const a = lado < 0 ? def.x[0] - MARGEN : Math.max(0, def.x[0] - MARGEN), b = lado < 0 ? Math.min(0, def.x[1] + MARGEN) : def.x[1] + MARGEN
    if (b - a < 0.01) continue
    const g = new THREE.PlaneGeometry(b - a, ALTO)
    g.translate((a + b) / 2, ALTO / 2 - 0.08, 0)
    const uv = g.attributes.uv, p = g.attributes.position
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - X0) / ANCHO, (p.getY(i) + 0.08) / ALTO)
    const mat = papel(tex, { transparent: false, alphaTest: 0.5, side: THREE.DoubleSide })
    const frente = new THREE.Mesh(g, mat)
    frente.castShadow = frente.receiveShadow = true
    frente.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 })
    // el canto: la misma silueta un pelo atrás, en cartón crudo
    const canto = new THREE.Mesh(g, papel(tex, { color: '#d9ccb0', alphaTest: 0.5, side: THREE.DoubleSide }))
    canto.position.z = -0.014
    const bisagra = new THREE.Group()
    bisagra.add(frente, canto)
    bisagra.position.set(0, GROSOR / 2 + 0.004 + capa * 0.003, def.z)
    mitades.push({ lado, bisagra, cerca: Math.max(0.35, lado < 0 ? -b : a), alto: def.alto, tiembla: def.tiembla || 0 })
  }
  return mitades
}
// cuánto se puede parar una mitad (0 acostada, PI/2 de pie) cuando su página forma un ángulo `abre` con la otra:
// su punta no puede pasar la mitad del ángulo, o atravesaría la otra página
const pararse = (m, abre) => { const lim = Math.min(abre / 2, Math.PI / 2); return lim >= Math.PI / 2 - 0.02 ? Math.PI / 2 : Math.asin(U.limitar((m.cerca * Math.tan(lim)) / m.alto)) }

// ---- el tema: tres páginas dobles. piso(a) imprime el piso (las dos páginas, x de -PW a PW, y = profundidad);
// tarjetas: { x: [desde, hasta], z: base (+ hacia el lector), alto, arte(a) }.
const flor = (a, x, y, r, col) => { for (let k = 0; k < 5; k++) a.elipse(col, x + Math.cos(k * 1.257) * r * 0.6, y + Math.sin(k * 1.257) * r * 0.6, r * 0.45); a.elipse(C.amarillo, x, y, r * 0.35) }
const grano = (a, x, y, s, q = 0) => { a.elipse(C.cafe, x, y, s, s * 0.7, q); a.linea(C.ocre, s * 0.18, (c) => { c.moveTo(x - Math.cos(q) * s * 0.7, y - Math.sin(q) * s * 0.7); c.lineTo(x + Math.cos(q) * s * 0.7, y + Math.sin(q) * s * 0.7) }) }
const arbusto = (a, x, y, s, conFrutos = true, semilla = 1) => { const r = U.azar(semilla); a.caja(C.cafe, x - 0.06 * s, y - 0.1, 0.12 * s, 0.5 * s); for (let i = 0; i < 9; i++) a.elipse(i % 2 ? C.hoja : C.bosque, x + r.rango(-0.55, 0.55) * s, y + 0.45 * s + r.rango(0, 0.6) * s, r.rango(0.22, 0.34) * s, r.rango(0.14, 0.22) * s, r.rango(-0.8, 0.8)); if (conFrutos) for (let i = 0; i < 12; i++) a.elipse(C.coral, x + r.rango(-0.5, 0.5) * s, y + 0.45 * s + r.rango(0, 0.55) * s, 0.06 * s) }
const ESCENAS = [
  {
    piso(a) {
      a.caja('#dcebc1', -PW + 0.2, -PD / 2 + 0.2, 2 * PW - 0.4, PD - 0.4, 0.4)
      const r = U.azar(4)
      for (let i = 0; i < 40; i++) flor(a, r.rango(-PW + 0.5, PW - 0.5), r.rango(-PD / 2 + 0.5, PD / 2 - 0.5), 0.07, r.elige([C.crema, C.rosa, C.amarillo]))
      a.linea(C.tinta, 0.05, (c) => { c.moveTo(-4.6, 2.2); c.bezierCurveTo(-3, 1, -1, 2.4, 0.5, 1.4); c.bezierCurveTo(2, 0.4, 3, 1.8, 4.6, 0.8) }, [0.14, 0.16])
    },
    tarjetas: [
      { x: [-4.6, 4.6], z: -1.5, alto: 2.9, arte(a) {
        a.elipse(C.amarillo, 2.6, 2.2, 0.62); a.elipse('#f9d46c', 2.6, 2.2, 0.44)
        a.cerro(C.salvia, -4.6, 4.6, (x) => 1.5 + 0.9 * Math.max(0, 1 - Math.abs(x + 1.6) / 2.6) + 0.6 * Math.max(0, 1 - Math.abs(x - 2.2) / 2))
        a.cerro(C.hoja, -4.6, 4.6, (x) => 0.75 + 0.3 * Math.cos(x * 0.9))
        for (let k = 0; k < 7; k++) a.linea(C.bosque, 0.06, (c) => { const x = -4 + k * 1.3; c.moveTo(x, 0.2); c.quadraticCurveTo(x + 0.4, 0.55, x + 0.9, 0.3) })
      } },
      { x: [-1.7, 1.7], z: 0.2, alto: 2.3, tiembla: 1, arte(a) { arbusto(a, 0, 0, 1.6, true, 3) } },
      { x: [-4.3, -2.7], z: 0.7, alto: 1.4, arte(a) { arbusto(a, -3.5, 0, 0.9, true, 5) } },
      { x: [2.7, 4.3], z: 0.7, alto: 1.3, arte(a) { a.caja(C.ocre, 3.0, 0, 1.0, 0.7, 0.12); a.caja(C.cafe, 3.0, 0.55, 1.0, 0.12, 0.05); for (let i = 0; i < 7; i++) a.elipse(C.coral, 3.15 + i * 0.12, 0.75 + (i % 2) * 0.06, 0.07) } },
    ],
  },
  {
    piso(a) {
      a.caja('#f6e2b0', -PW + 0.2, -PD / 2 + 0.2, 2 * PW - 0.4, PD - 0.4, 0.4)
      const r = U.azar(6)
      for (let i = 0; i < 70; i++) grano(a, r.rango(-PW + 0.5, PW - 0.5), r.rango(-PD / 2 + 0.5, PD / 2 - 0.5), 0.08, r.rango(0, 3))
    },
    tarjetas: [
      { x: [-4.5, 4.5], z: -1.5, alto: 2.8, arte(a) {
        a.caja('#f3c98c', -4.5, -0.1, 9, 2.3, 0.1)
        for (let k = 0; k < 9; k++) a.linea('#f7dcae', 0.09, (c) => { c.moveTo(2.6, 2.2); c.lineTo(2.6 + Math.cos(k * 0.7 + 2.2) * 2.6, 2.2 + Math.sin(k * 0.7 + 2.2) * 2.6) })
        a.elipse(C.amarillo, 2.6, 2.2, 0.55)
        for (const x of [-3.7, -1.6]) { a.caja(C.ocre, x, 0.2, 1.7, 0.5, 0.06); const r = U.azar(x * 10); for (let i = 0; i < 18; i++) grano(a, x + 0.15 + r() * 1.4, 0.3 + r() * 0.3, 0.06, r() * 3) }
      } },
      { x: [-1.8, 1.8], z: 0.3, alto: 2.0, tiembla: 1, arte(a) {
        for (let k = 0; k < 6; k++) a.forma(k % 2 ? C.amarillo : C.coral, (c) => { const x = -1.1 + k * 0.44; c.moveTo(x - 0.2, 0); c.quadraticCurveTo(x, 0.9 + (k % 3) * 0.2, x + 0.2, 0) })
        a.caja(C.tinta, -1.6, 0.55, 3.2, 0.14, 0.05)
        a.forma('#3a3f4a', (c) => { c.moveTo(-1.5, 0.66); c.quadraticCurveTo(0, 0.1, 1.5, 0.66) })
        const r = U.azar(12); for (let i = 0; i < 26; i++) grano(a, r.rango(-1.2, 1.2), 0.72 + r.rango(0, 0.35), 0.09, r() * 3)
        a.caja(C.cafe, 1.4, 0.95, 0.9, 0.12, 0.05)
      } },
    ],
  },
  {
    piso(a) {
      a.caja(C.crema, -PW + 0.2, -PD / 2 + 0.2, 2 * PW - 0.4, PD - 0.4, 0.4)
      a.ctx.globalAlpha = 0.4
      for (let i = -8; i <= 8; i++) { a.caja(C.coral, i * 0.66 - 0.16, -PD / 2 + 0.2, 0.32, PD - 0.4); if (Math.abs(i) < 5) a.caja(C.coral, -PW + 0.2, i * 0.66 - 0.16, 2 * PW - 0.4, 0.32) }
      a.ctx.globalAlpha = 1
    },
    tarjetas: [
      { x: [-4.5, 4.5], z: -1.5, alto: 2.9, arte(a) {
        a.caja(C.cielo, -4.5, -0.1, 9, 1.8, 0.08)
        a.caja(C.coral, -1.8, 0.9, 3.6, 2.0, 0.12)
        a.caja('#fbe7b3', -1.58, 1.1, 3.16, 1.6)
        a.elipse(C.amarillo, -0.7, 2.25, 0.3)
        a.cerro(C.salvia, -1.58, 1.58, (x) => 1.45 + 0.15 * Math.cos(x * 1.8), 1.1)
        a.caja(C.coral, -0.06, 1.0, 0.12, 1.8); a.caja(C.coral, -1.7, 1.85, 3.4, 0.1); a.caja(C.tinta, -2.1, 0.8, 4.2, 0.12, 0.05)
        a.elipse(C.crema, 3.3, 1.9, 0.55); a.elipse(C.tinta, 3.3, 1.9, 0.48); a.elipse(C.crema, 3.3, 1.9, 0.4)
        a.linea(C.tinta, 0.06, (c) => { c.moveTo(3.3, 1.9); c.lineTo(3.3, 2.2) }); a.linea(C.tinta, 0.07, (c) => { c.moveTo(3.3, 1.9); c.lineTo(3.12, 1.72) })
      } },
      { x: [-1.5, 1.5], z: 0.35, alto: 2.4, tiembla: 1, arte(a) {
        a.elipse(C.crema, 0, 0.1, 1.35, 0.22); a.elipse('#e2d2b0', 0, 0.12, 1.0, 0.13)
        a.forma(C.coral, (c) => { c.moveTo(-0.95, 1.25); c.lineTo(0.95, 1.25); c.quadraticCurveTo(0.9, 0.15, 0, 0.15); c.quadraticCurveTo(-0.9, 0.15, -0.95, 1.25) })
        a.linea(C.coral, 0.16, (c) => c.arc(1.05, 0.8, 0.28, -1.4, 1.5))
        a.elipse(C.cafe, 0, 1.25, 0.95, 0.14)
        for (const x of [-0.45, 0, 0.45]) a.linea(C.crema, 0.1, (c) => { c.moveTo(x, 1.45); c.bezierCurveTo(x + 0.3, 1.7, x - 0.3, 1.9, x, 2.2) })
      } },
      { x: [-4.2, -2.6], z: 0.8, alto: 1.5, arte(a) { a.forma(C.tinta, (c) => { c.moveTo(-3.9, 0); c.lineTo(-2.9, 0); c.lineTo(-3.1, 1.0); c.lineTo(-3.7, 1.0) }); a.caja(C.tinta, -3.75, 1.0, 0.7, 0.14, 0.05); a.linea(C.tinta, 0.1, (c) => c.arc(-2.85, 0.6, 0.25, -1.4, 1.4)) } },
      { x: [2.6, 4.2], z: 0.8, alto: 1.2, arte(a) { a.elipse(C.crema, 3.4, 0.08, 0.75, 0.14); for (const [x, y] of [[3.05, 0.35], [3.5, 0.32], [3.3, 0.6]]) { a.elipse(C.ocre, x, y, 0.3); a.elipse('#f1c27a', x, y, 0.24) } } },
    ],
  },
]
// la cinta con las palabras: una tira crema con cola de golondrina, cerca del borde de adelante
const cinta = (texto) => {
  const tam = 0.5, med = document.createElement('canvas').getContext('2d')
  med.font = '700 100px "Fraunces"'
  const ancho = Math.max(2.2, (med.measureText(texto).width * tam) / 100) + 0.7
  return { x: [-ancho / 2 - 0.3, ancho / 2 + 0.3], z: 1.95, alto: 0.8, arte(a) {
    a.forma(C.crema, (c) => { c.moveTo(-ancho / 2 - 0.3, -0.05); c.lineTo(-ancho / 2 - 0.05, 0.36); c.lineTo(-ancho / 2 - 0.3, 0.78); c.lineTo(ancho / 2 + 0.3, 0.78); c.lineTo(ancho / 2 + 0.05, 0.36); c.lineTo(ancho / 2 + 0.3, -0.05) })
    a.caja(C.coral, -ancho / 2, 0.66, ancho, 0.05); a.caja(C.coral, -ancho / 2, 0.04, ancho, 0.05)
    a.texto(texto, 0, 0.22, tam, C.tinta)
  } }
}

export async function construir(E) {
  const { scene } = E
  await U.fuente('Fraunces', 700)

  // ---- el libro: hojas que giran sobre el lomo (eje z en x = 0). La hoja j lleva en su frente la página derecha de
  // la escena j - 1 y en su dorso la izquierda de la escena j: al pasar, cierra una y abre la otra.
  const imprimir = (lado, piso) => U.lienzo(Math.round(PW * PX), Math.round(PD * PX), (ctx, w, h) => {
    ctx.fillStyle = C.carton; ctx.fillRect(0, 0, w, h)
    ctx.setTransform(PX, 0, 0, PX, lado < 0 ? PW * PX : 0, (PD / 2) * PX)
    if (piso) piso(lapiz(ctx))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const g = ctx.createLinearGradient(lado < 0 ? w : 0, 0, lado < 0 ? w - 70 : 70, 0); g.addColorStop(0, 'rgba(70,50,30,0.32)'); g.addColorStop(1, 'rgba(70,50,30,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h) // la página se hunde en la canaleta
    entintar(ctx, w, h)
  })
  // el piso se dibuja con y = profundidad hacia el lector; la página es un plano con u = x y v = profundidad
  const pagina = (lado, piso, mira) => {
    const g = new THREE.PlaneGeometry(PW, PD)
    g.rotateX(mira > 0 ? -Math.PI / 2 : Math.PI / 2)
    g.translate(PW / 2, (mira * GROSOR) / 2, 0)
    const uv = g.attributes.uv, p = g.attributes.position
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv.setXY(i, lado > 0 ? x / PW : 1 - x / PW, 1 - (z + PD / 2) / PD) }
    const m = new THREE.Mesh(g, papel(imprimir(lado, piso)))
    m.receiveShadow = m.castShadow = true
    return m
  }
  const libro = new THREE.Group()
  scene.add(libro)
  const canto = new THREE.MeshStandardMaterial({ color: '#f1e7d2', roughness: 0.95 })
  const hojas = HOJAS.map((_, j) => {
    const g = new THREE.Group()
    g.add(pagina(1, j ? ESCENAS[j - 1].piso : null, 1), pagina(-1, ESCENAS[j].piso, -1))
    const borde = new THREE.Mesh(new THREE.BoxGeometry(PW, GROSOR * 0.9, PD), canto); borde.position.x = PW / 2; g.add(borde)
    libro.add(g)
    return g
  })
  const BLOQUE = 0.28, MESA = -BLOQUE - 0.06
  const bloque = (lado, piso) => {
    const g = new THREE.Group()
    const caja = new THREE.Mesh(new THREE.BoxGeometry(PW, BLOQUE, PD), new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.95 }))
    caja.position.set((lado * PW) / 2, -BLOQUE / 2 - 0.01, 0); caja.castShadow = caja.receiveShadow = true
    g.add(caja)
    if (lado > 0) { const t = pagina(1, piso, 1); t.position.y = -0.01; g.add(t) } else { const t = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), papel(imprimir(-1, (a) => { a.caja('#f4bd38', -PW, -PD / 2, PW, PD); for (let i = -6; i <= 0; i++) for (let k = -4; k <= 4; k++) a.elipse('#f8cf63', i * 0.8 + 0.4, k * 0.8 + (i % 2 ? 0.4 : 0), 0.25) }))); t.rotation.x = -Math.PI / 2; t.position.set(-PW / 2, -0.01, 0); t.receiveShadow = true; g.add(t) }
    libro.add(g)
    return g
  }
  const bloqueD = bloque(1, ESCENAS[ESCENAS.length - 1].piso)
  bloque(-1)
  const tela = new THREE.MeshStandardMaterial({ color: '#1f4a4b', roughness: 0.8 })
  for (const lado of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.25, 0.06, PD + 0.45), tela); t.position.set(lado * (PW / 2 + 0.17), MESA + 0.03, 0); t.castShadow = t.receiveShadow = true; libro.add(t) }

  // ---- las tarjetas de cada escena: las mitades izquierdas van en el dorso de su hoja; las derechas, en el frente de
  // la hoja siguiente (o en el bloque, la última)
  const escenas = ESCENAS.map((esc, s) => {
    const mitades = []
    ;[...esc.tarjetas, cinta(PALABRAS[s])].forEach((def, capa) => {
      for (const m of tarjeta(def, capa)) {
        if (m.lado < 0) { const vuelta = new THREE.Group(); vuelta.rotation.z = Math.PI; vuelta.add(m.bisagra); hojas[s].add(vuelta) }
        else (s + 1 < hojas.length ? hojas[s + 1] : bloqueD).add(m.bisagra)
        mitades.push(m)
      }
    })
    return { mitades }
  })

  // ---- la mesa y la lámpara
  const madera = U.lienzo(1024, 1024, (ctx, w, h) => {
    const N = U.ruido(12), im = ctx.createImageData(w, h)
    for (let y = 0; y < h; y++) { const tabla = Math.floor(y / 128), tono = 0.8 + 0.3 * U.hash(tabla, 3); for (let x = 0; x < w; x++) { const v = U.limitar(0.5 + 1.2 * N.capas(x * 0.0018 + tabla * 9, y * 0.04, tabla, 3)) * tono; im.data.set([38 + 76 * v, 22 + 45 * v, 12 + 22 * v, 255], (y * w + x) * 4) } }
    ctx.putImageData(im, 0, 0)
    for (let p = 0; p < 8; p++) { ctx.fillStyle = 'rgba(8,4,2,0.8)'; ctx.fillRect(0, p * 128, w, 2) }
  }, { repetir: [4, 4] })
  const mesa = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: madera, bumpMap: madera, bumpScale: 1, roughness: 0.55 }))
  mesa.rotation.x = -Math.PI / 2; mesa.position.y = MESA; mesa.receiveShadow = true; scene.add(mesa)
  const taza = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.8, 1.9, 40), new THREE.MeshStandardMaterial({ color: '#1d3a44', roughness: 0.3 }))
  taza.position.set(-7, MESA + 0.95, -6); taza.castShadow = taza.receiveShadow = true; scene.add(taza)
  const lapizM = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.8, 6), new THREE.MeshStandardMaterial({ color: '#d99a1e', roughness: 0.45 }))
  lapizM.rotation.set(Math.PI / 2, 0, 1.2); lapizM.position.set(6.6, MESA + 0.09, -5.2); lapizM.castShadow = true; scene.add(lapizM)

  E.entorno({ arriba: '#2a2119', horizonte: '#3d3024', abajo: '#6b5740', intensidad: 0.7, paneles: [{ pos: [9, 11, 7], tam: [7, 7], color: '#ffd9a6', potencia: 3 }, { pos: [-12, 6, -9], tam: [6, 8], color: '#8fa8ff', potencia: 1 }] })
  E.foco({ desde: [-4.5, 9.5, 10], hacia: [0.2, 0.8, 0], color: '#ffe9d0', potencia: 820, angulo: 0.62, penumbra: 0.85, suave: 1.3, mapa: 4096 })
  E.foco({ desde: [8, 5.5, -10], hacia: [0, 1, 0], color: '#c2d0ff', potencia: 140, angulo: 0.5, penumbra: 1, sombra: false })
  E.cielo({ color: '#ffe8d2', potencia: 0.75, cubre: 9 })

  // ---- cámara: un deslizamiento lento de izquierda a derecha que respira hacia atrás en cada vuelta de hoja
  const lejos = Math.max(1, 1.78 / (E.W / E.H)) // en formatos más angostos se aleja para que entre el libro
  const cam = {
    pos: U.camino([[0, [-1.6, 6.1, 11.4]], [1.4, [-1.1, 5.9, 11.1]], [3.0, [-0.5, 6.4, 12.0]], [4.4, [0.1, 6.0, 11.3]], [5.8, [0.5, 6.4, 12.0]], [7.2, [1.0, 6.0, 11.3]], [9, [1.2, 5.7, 10.8]]]),
    mira: U.camino([[0, [-0.2, 1.0, 0.3]], [4.4, [0, 1.1, 0.3]], [9, [0.1, 1.0, 0.4]]]),
  }

  const giro = (t, t0) => { const u = (t - t0) / VUELTA; if (u <= 0) return 0; if (u < 1) return Math.PI * u * u * (2.2 - 1.2 * u); const v = t - t0 - VUELTA; return Math.PI - 0.035 * Math.abs(Math.sin(v * 11)) * Math.exp(-v * 6) }
  E.alActualizar((t) => {
    const phi = HOJAS.map((t0) => giro(t, t0))
    hojas.forEach((h, j) => { h.rotation.z = phi[j]; h.position.y = 0.002 * (hojas.length - j) * (phi[j] < Math.PI / 2 ? 1 : -1) })
    escenas.forEach((esc, s) => {
      const abre = phi[s] - (s + 1 < phi.length ? phi[s + 1] : 0) // el ángulo entre las dos páginas de esta escena
      const llegó = t - (HOJAS[s] + VUELTA)
      for (const m of esc.mitades) {
        const q = pararse(m, abre) + (llegó > 0 ? 0.06 * m.tiembla * Math.sin(llegó * 19) * Math.exp(-llegó * 3) : 0)
        m.bisagra.rotation.x = Math.PI / 2 - q // acostada cae hacia el lector, dentro de su página
        m.bisagra.visible = abre > 0.02
      }
    })
    const p = cam.pos(t), a = cam.mira(t)
    E.camara([a[0] + (p[0] - a[0]) * lejos, a[1] + (p[1] - a[1]) * lejos, a[2] + (p[2] - a[2]) * lejos], a)
    E.enfoque([0, 1.0, 0.9], 0.1)
  })
}
