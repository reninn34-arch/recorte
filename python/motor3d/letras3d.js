// letras3d.js — letras sólidas en 3D a partir de una fuente de Google (o cualquier .woff/.ttf/.otf). Escrito para
// Recorte. Lee el contorno real de cada letra con opentype.js y lo extruye con bisel redondeado.
//
//   import { letras3d, fuenteGoogle } from './letras3d.js'
//   const L = await letras3d('$7,612', { fuente: fuenteGoogle('Fredoka', 600), tam: 1.2, fondo: 0.3, bisel: 0.06 })
//   new THREE.Mesh(L.geometria, material)              // todo el texto en una pieza, centrado
//   L.letras.forEach((l) => { const m = new THREE.Mesh(l.geometria, mat); m.position.set(l.x, l.y, 0) })   // una por una
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const OPENTYPE = 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js'
let opentype = null
const fuentes = new Map()

/** La dirección de una fuente de Google (Fontsource en jsDelivr). peso: 400, 600, 700... */
export const fuenteGoogle = (familia, peso = 700, estilo = 'normal') => {
  const id = familia.toLowerCase().replace(/\s+/g, '-')
  return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${peso}-${estilo}.woff`
}

async function cargarFuente(url) {
  if (!opentype) opentype = await import(OPENTYPE)
  if (!fuentes.has(url)) fuentes.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`no se pudo bajar la fuente ${url} (${r.status})`); return r.arrayBuffer() }).then((b) => opentype.parse(b)))
  return fuentes.get(url)
}

const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y } return s / 2 }
const adentro = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i].y > p.y) !== (pts[j].y > p.y) && p.x < ((pts[j].x - pts[i].x) * (p.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c; return c }

/** Los contornos de una letra (en unidades de tam, y hacia arriba) → formas de Three con sus agujeros. */
function formasDe(path, k, curvas) {
  const sub = []
  let actual = null
  for (const c of path.commands) {
    if (c.type === 'M') { actual = new THREE.Path(); actual.moveTo(c.x * k, -c.y * k); sub.push(actual) }
    else if (c.type === 'L') actual.lineTo(c.x * k, -c.y * k)
    else if (c.type === 'Q') actual.quadraticCurveTo(c.x1 * k, -c.y1 * k, c.x * k, -c.y * k)
    else if (c.type === 'C') actual.bezierCurveTo(c.x1 * k, -c.y1 * k, c.x2 * k, -c.y2 * k, c.x * k, -c.y * k)
    else if (c.type === 'Z') actual.closePath()
  }
  const cont = sub.map((p) => ({ p, pts: p.getPoints(curvas) })).filter((c) => c.pts.length > 2).map((c) => ({ ...c, a: area(c.pts) }))
  if (!cont.length) return []
  // el sentido del contorno más grande es el de «afuera»; los del sentido contrario son agujeros
  const signo = Math.sign(cont.reduce((m, c) => (Math.abs(c.a) > Math.abs(m.a) ? c : m)).a)
  const fuera = cont.filter((c) => Math.sign(c.a) === signo).map((c) => ({ ...c, forma: new THREE.Shape(signo > 0 ? c.pts : c.pts.slice().reverse()) }))
  for (const h of cont.filter((c) => Math.sign(c.a) !== signo)) {
    const dueno = fuera.filter((f) => adentro(h.pts[0], f.pts)).sort((a, b) => Math.abs(a.a) - Math.abs(b.a))[0]
    if (dueno) dueno.forma.holes.push(new THREE.Path(signo > 0 ? h.pts : h.pts.slice().reverse()))
  }
  return fuera.map((f) => f.forma)
}

/**
 * Texto en 3D. op: fuente (url), tam (alto de la letra, 1), fondo (grosor, 0.25 · tam), bisel (0.04 · tam),
 * pasosBisel (4), curvas (pasos por curva, 10), espaciado (en tam, 0), interlinea (1.15), alinear ('center' | 'left' | 'right').
 * Devuelve { geometria, letras: [{ char, linea, geometria, x, y, ancho }], ancho, alto }: la geometría completa está
 * centrada en el origen; cada letra tiene su origen en su propio centro y (x, y) dice dónde va.
 */
export async function letras3d(texto, op = {}) {
  const f = await cargarFuente(op.fuente || fuenteGoogle('Fredoka', 600))
  const tam = op.tam ?? 1, k = tam / f.unitsPerEm * (1 / 0.72), fondo = op.fondo ?? 0.25 * tam, bisel = Math.min(op.bisel ?? 0.04 * tam, fondo / 2.2)
  const extr = { depth: Math.max(1e-3, fondo - 2 * bisel), bevelEnabled: bisel > 0, bevelThickness: bisel, bevelSize: bisel * 0.85, bevelSegments: op.pasosBisel ?? 4, curveSegments: op.curvas ?? 10 }
  const lineas = String(texto).split('\n'), lh = (op.interlinea ?? 1.15) * tam * 1.25
  const letras = []
  let anchoMax = 0
  lineas.forEach((linea, li) => {
    const glifos = f.stringToGlyphs(linea)
    let x = 0
    const fila = []
    glifos.forEach((g, i) => {
      const formas = formasDe(g.getPath(0, 0, f.unitsPerEm), k, op.curvas ?? 10)
      const adv = g.advanceWidth * k
      if (formas.length) {
        const geo = new THREE.ExtrudeGeometry(formas, extr)
        geo.translate(0, 0, -extr.depth / 2)
        geo.computeBoundingBox()
        const c = new THREE.Vector3()
        geo.boundingBox.getCenter(c)
        geo.translate(-c.x, -c.y, 0)
        fila.push({ char: linea[i], linea: li, geometria: geo, x: x + c.x, y: c.y, ancho: adv })
      }
      const sig = glifos[i + 1]
      x += adv + (sig ? f.getKerningValue(g, sig) * k : 0) + (op.espaciado ?? 0) * tam
    })
    const dx = op.alinear === 'left' ? 0 : op.alinear === 'right' ? -x : -x / 2
    for (const l of fila) { l.x += dx; l.y -= li * lh; letras.push(l) }
    anchoMax = Math.max(anchoMax, x)
  })
  // el bloque, centrado en alto
  const ys = letras.map((l) => l.y)
  const cy = ys.length ? (Math.max(...ys) + Math.min(...ys)) / 2 : 0
  for (const l of letras) l.y -= cy
  const geometria = letras.length ? mergeGeometries(letras.map((l) => l.geometria.clone().translate(l.x, l.y, 0))) : new THREE.BufferGeometry()
  return { geometria, letras, ancho: anchoMax, alto: lineas.length * lh }
}

/**
 * Los contornos de un texto como líneas (para neón, alambre, trazos que se dibujan): una lista de
 * { letra, cerrado: true, puntos: [THREE.Vector2...] } en unidades del mundo, centrada. op: fuente, tam, curvas, espaciado.
 */
export async function contornos(texto, op = {}) {
  const f = await cargarFuente(op.fuente || fuenteGoogle('Fredoka', 600))
  const tam = op.tam ?? 1, k = tam / f.unitsPerEm * (1 / 0.72), curvas = op.curvas ?? 12
  const out = []
  let x = 0
  const glifos = f.stringToGlyphs(String(texto))
  glifos.forEach((g, i) => {
    let actual = null
    for (const c of g.getPath(0, 0, f.unitsPerEm).commands) {
      if (c.type === 'M') { actual = new THREE.Path(); actual.moveTo(x + c.x * k, -c.y * k); out.push({ letra: i, path: actual }) }
      else if (c.type === 'L') actual.lineTo(x + c.x * k, -c.y * k)
      else if (c.type === 'Q') actual.quadraticCurveTo(x + c.x1 * k, -c.y1 * k, x + c.x * k, -c.y * k)
      else if (c.type === 'C') actual.bezierCurveTo(x + c.x1 * k, -c.y1 * k, x + c.x2 * k, -c.y2 * k, x + c.x * k, -c.y * k)
    }
    const sig = glifos[i + 1]
    x += g.advanceWidth * k + (sig ? f.getKerningValue(g, sig) * k : 0) + (op.espaciado ?? 0) * tam
  })
  const lista = out.map((o) => ({ letra: o.letra, cerrado: true, puntos: o.path.getPoints(curvas) })).filter((o) => o.puntos.length > 2)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const o of lista) for (const p of o.puntos) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y) }
  for (const o of lista) for (const p of o.puntos) { p.x -= (x0 + x1) / 2; p.y -= (y0 + y1) / 2 }
  return lista
}
