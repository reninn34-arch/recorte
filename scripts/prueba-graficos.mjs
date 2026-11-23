// Los gráficos editables (tarjetas, rótulos con caja, botones): el modelo, su HTML y las operaciones del agente.
// El dibujo con Chromium se prueba en la app (scripts/vista-capas-textos.mjs).
// node scripts/prueba-graficos.mjs
import assert from 'node:assert/strict'
import { esDibujoGrafico, graficoCambiado, htmlDeGrafico, margenSombra, normalizarGrafico, PLANTILLAS_GRAFICO, plantillaConMarca, prepararGraficos } from '../src/shared/grafico.ts'
import { aplicarOperaciones, describirTimelineParaAgente, validarOperaciones } from '../src/shared/chat.ts'
import { MAX_IMAGEN, normalizarTimeline } from '../src/shared/timeline.ts'

let bien = 0
const caso = (nombre, fn) => {
  fn()
  bien++
  console.log(`bien  ${nombre}`)
}

caso('un gráfico vacío no vale', () => {
  assert.equal(normalizarGrafico(null), null)
  assert.equal(normalizarGrafico({ elementos: [] }), null)
  assert.equal(normalizarGrafico({ elementos: [{ tipo: 'texto', texto: '   ' }] }), null)
})

caso('normalizar limpia y pone lo de siempre', () => {
  const g = normalizarGrafico({ elementos: [{ tipo: 'texto', texto: 'Hola', tamano: 9999, peso: 650, color: 'rojo' }], fondo: { color: '#ABCDEF', radio: -5 }, sombra: 3, alinear: 'raro' })
  assert.equal(g.elementos[0].tamano, 600)
  assert.equal(g.elementos[0].peso, 700)
  assert.equal(g.elementos[0].color, '#e63946')
  assert.equal(g.fondo.color, '#abcdef')
  assert.equal(g.fondo.radio, 0)
  assert.equal(g.sombra, 1)
  assert.equal(g.alinear, 'centro')
  assert.equal(g.disposicion, 'columna')
  // Lo neutro no se guarda.
  const h = normalizarGrafico({ elementos: [{ tipo: 'texto', texto: 'x' }], fondo: { color: '#000000', radio: 4, opacidad: 1, borde: 0 } })
  assert.equal('opacidad' in h.fondo, false)
  assert.equal('borde' in h.fondo, false)
  // Idempotente.
  assert.deepEqual(normalizarGrafico(g), g)
})

caso('las plantillas llevan los colores de la marca', () => {
  for (const p of PLANTILLAS_GRAFICO) {
    const g = plantillaConMarca(p.grafico, { primary: '#112233', secondary: '#445566' })
    assert.ok(g, p.id)
    assert.ok(!JSON.stringify(g).includes('marca'), `${p.id} quedó con «marca»`)
  }
  const tarjeta = plantillaConMarca(PLANTILLAS_GRAFICO[0].grafico, { primary: '#112233' })
  assert.equal(tarjeta.fondo.color, '#112233')
})

caso('el HTML escapa el texto y usa la escala', () => {
  const g = normalizarGrafico({ elementos: [{ tipo: 'texto', texto: '<b>"A&B"</b>', tamano: 50 }], margenX: 10, margenY: 10 })
  const html = htmlDeGrafico(g, { familia: () => 'Arial', fuentesCss: '', imagen: () => undefined }, 2)
  assert.ok(html.includes('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;'))
  assert.ok(!html.includes('<b>"A'))
  assert.ok(html.includes('font-size:100px'))
  assert.ok(html.includes('padding:20px 20px'))
  // Una imagen que ya no está no rompe el gráfico.
  const conImagen = normalizarGrafico({ elementos: [{ tipo: 'imagen', medio: 'm-x', alto: 50 }, { tipo: 'texto', texto: 'ok' }] })
  assert.ok(!htmlDeGrafico(conImagen, { familia: () => undefined, fuentesCss: '', imagen: () => undefined }).includes('<img'))
})

caso('la sombra deja margen para no cortarse', () => {
  const sin = normalizarGrafico({ elementos: [{ tipo: 'texto', texto: 'x' }] })
  assert.equal(margenSombra(sin), 0)
  const con = normalizarGrafico({ elementos: [{ tipo: 'texto', texto: 'x' }], sombra: 1 })
  // Lo que baja (13) más tres veces el difuminado (26): 91.
  assert.ok(margenSombra(con) >= 13 + 26 * 2)
})

caso('cambiar un gráfico: textos en orden, fondo mezclado, null quita', () => {
  const g = plantillaConMarca(PLANTILLAS_GRAFICO[1].grafico, { primary: '#112233' })
  const c = graficoCambiado(g, { fondo: { color: '#000000' }, acento: null }, ['Ana Pérez', 'Gerente'])
  assert.equal(c.elementos[0].texto, 'Ana Pérez')
  assert.equal(c.elementos[1].texto, 'Gerente')
  assert.equal(c.fondo.color, '#000000')
  assert.equal(c.fondo.radio, g.fondo.radio)
  assert.equal(c.acento, undefined)
  // El original no se toca.
  assert.equal(g.elementos[0].texto, 'Nombre Apellido')
})

caso('esDibujoGrafico: los PNG de gráficos, no los demás', () => {
  assert.ok(esDibujoGrafico('C:\\p\\graficos\\grafico-0a1b2c3d4e5f.png'))
  assert.ok(esDibujoGrafico('/p/graficos/grafico-0a1b2c3d4e5f.png'))
  assert.ok(!esDibujoGrafico('C:\\p\\medios\\logo.png'))
})

// Las operaciones del agente, con el dibujo simulado.
const base = normalizarTimeline({ clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 10 }], textos: [] }, 10, {})
const medios = { 'm-g1': MAX_IMAGEN, 'm-g2': MAX_IMAGEN }
const anchos = { 'm-g1': 600, 'm-g2': 900 }
let n = 0
const dibujar = async (g) => ({ medio: `m-g${++n}`, ancho: 600 / 1080, grafico: g })

caso('validar: anadir_grafico necesita un gráfico con algo', () => {
  const ops = validarOperaciones([
    { op: 'anadir_grafico', inicio: 1, grafico: { elementos: [] } },
    { op: 'anadir_grafico', inicio: 1, duracion: 2, y: 0.3, grafico: { elementos: [{ tipo: 'texto', texto: 'OFERTA' }] } },
    { op: 'cambiar_grafico', capa_n: 1 },
    { op: 'cambiar_grafico', capa_n: 1, textos: ['NUEVA'] }
  ])
  assert.deepEqual(ops.map((o) => o.op), ['anadir_grafico', 'cambiar_grafico'])
})

const ops1 = validarOperaciones([{ op: 'anadir_grafico', inicio: 1, duracion: 2, y: 0.3, salida: 'fundido', grafico: { fondo: { color: '#0a6cf0', radio: 20 }, elementos: [{ tipo: 'texto', texto: 'OFERTA' }] } }])
const fallos1 = await prepararGraficos(ops1, base, dibujar, (m) => anchos[m])
const r1 = aplicarOperaciones(base, ops1, { duracionFuente: 10, medios })
caso('aplicar anadir_grafico: una capa con su diseño, su sitio y su salida', () => {
  assert.deepEqual(fallos1, [])
  assert.deepEqual(r1.fallos, [])
  const c = r1.timeline.capas[0]
  assert.equal(c.fuente, 'm-g1')
  assert.equal(c.grafico.elementos[0].texto, 'OFERTA')
  assert.equal(c.inicio, 1)
  assert.equal(c.duracion, 2)
  assert.equal(c.y, 0.3)
  assert.equal(c.salida, 'fundido')
  assert.ok(Math.abs(c.ancho - 600 / 1080) < 0.01)
  assert.ok(describirTimelineParaAgente(r1.timeline, [], 10).includes('GRÁFICO EDITABLE'))
})

caso('el gráfico sobrevive a normalizar la timeline', () => {
  const otra = normalizarTimeline(JSON.parse(JSON.stringify(r1.timeline)), 10, medios)
  assert.deepEqual(otra.capas[0].grafico, r1.timeline.capas[0].grafico)
})

const ops2 = validarOperaciones([{ op: 'cambiar_grafico', capa_n: 1, textos: ['GRATIS HOY'] }])
const fallos2 = await prepararGraficos(ops2, r1.timeline, dibujar, (m) => anchos[m])
const r2 = aplicarOperaciones(r1.timeline, ops2, { duracionFuente: 10, medios })
caso('aplicar cambiar_grafico: texto nuevo, dibujo nuevo y su escala', () => {
  assert.deepEqual(fallos2, [])
  assert.deepEqual(r2.fallos, [])
  const antes = r1.timeline.capas[0]
  const c = r2.timeline.capas[0]
  assert.equal(c.grafico.elementos[0].texto, 'GRATIS HOY')
  assert.equal(c.fuente, 'm-g2')
  // El dibujo nuevo es 900/600 más ancho: la capa también.
  assert.ok(Math.abs(c.ancho - antes.ancho * 1.5) < 0.01, `${c.ancho} vs ${antes.ancho * 1.5}`)
  assert.equal(c.y, antes.y)
  assert.equal(c.salida, 'fundido')
})

caso('cambiar_grafico en una capa que no es gráfico avisa', () => {
  const r = aplicarOperaciones(base, validarOperaciones([{ op: 'cambiar_grafico', capa_n: 3, textos: ['x'] }]), { duracionFuente: 10, medios })
  assert.equal(r.fallos.length, 1)
})

console.log(`\n${bien} bien`)
