// Fase 6.4: la receta del agente trae capas y sonidos al editor, y lo que el usuario retoca a mano
// se le cuenta al agente cuando rehace el video. npm run prueba:retoques
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { proyectoDesdeReceta } from '../src/main/recetaeditor.ts'
import { bloqueRetoques, describirRetoques } from '../src/shared/retoques.ts'
import { FUENTE_PRINCIPAL } from '../src/shared/timeline.ts'

const raiz = resolve(import.meta.dirname, '..')
const dir = mkdtempSync(join(tmpdir(), 'recorte-retoques-'))
const ff = (...args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]).status, 0, args.join(' '))

try {
  const trabajo = join(dir, 'trabajo')
  const proyecto = join(dir, 'proyecto')
  mkdirSync(join(trabajo, 'entrada'), { recursive: true })
  mkdirSync(join(trabajo, 'kit', 'sonidos'), { recursive: true })
  mkdirSync(proyecto)
  copyFileSync(join(raiz, 'python', 'sonidos', 'pop.wav'), join(trabajo, 'kit', 'sonidos', 'pop.wav'))
  copyFileSync(join(raiz, 'python', 'kit', 'kit.py'), join(trabajo, 'kit', 'kit.py'))
  ff('-f', 'lavfi', '-i', 'testsrc2=s=600x800', '-frames:v', '1', join(trabajo, 'entrada', 'foto.jpg'))
  ff('-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', join(trabajo, 'entrada', 'logo.png'))
  writeFileSync(
    join(trabajo, 'receta.json'),
    JSON.stringify({
      ancho: 540, alto: 960, duracion: 4,
      momentos: [{ tipo: 'foto', archivo: 'entrada/foto.jpg', desde: 0, hasta: 4, rotulo: 'Hola', encuadre: { zoom: 1.2, cx: 0.5 }, camara: { zoom: 1.32, cx: 0.6 } }],
      capas: [
        { archivo: 'entrada/logo.png', desde: 1, hasta: 3, x: 0.3, y: 0.2, ancho: 0.25, entrada: 'pop', profundidad: 0.5, desenfoque: 0.3 },
        { archivo: 'entrada/logo.png', desde: 0, hasta: 4, x: 0.6, y: 0.5, ancho: 0.4, entrada: 'ninguna', animar: 'balanceo' }
      ],
      filtros: { grano: 0.3, vineta: 0.5 },
      sonidos: [{ sonido: 'pop', en: 1 }, { sonido: 'no-existe', en: 2 }]
    })
  )
  const armado = await proyectoDesdeReceta(join(trabajo, 'receta.json'), trabajo, proyecto, 4)
  assert.ok(armado, 'la receta se convierte')
  const tl = armado.timeline
  assert.equal(tl.capas?.length, 2, 'las capas entran en «Encima»')
  const animadaTl = tl.capas.find((x) => x.animada)
  assert.ok(animadaTl, 'la capa con «animar» llega animada')
  assert.equal(animadaTl.animada.tipo, 'balanceo')
  assert.ok(armado.medios.some((m) => m.id === animadaTl.fuente && m.tipo === 'video'), 'su animación es un video de la biblioteca')
  assert.ok(armado.medios.some((m) => m.id === animadaTl.animada.base && m.tipo === 'imagen'), 'y guarda su imagen de base')
  assert.ok(Math.abs(animadaTl.ancho - 0.4 * 1.16) < 0.01, 'un poco más ancha por el margen de la animación')
  tl.capas = tl.capas.filter((x) => !x.animada)
  assert.deepEqual([tl.capas[0].x, tl.capas[0].y, tl.capas[0].ancho, tl.capas[0].entrada, tl.capas[0].inicio, tl.capas[0].duracion], [0.3, 0.2, 0.25, 'pop', 1, 2])
  assert.ok(armado.medios.some((m) => m.id === tl.capas[0].fuente && m.tipo === 'imagen'), 'su imagen queda en la biblioteca')
  assert.deepEqual([tl.capas[0].profundidad, tl.capas[0].desenfoque], [0.5, 0.3], 'la escena 2.5D llega: profundidad y desenfoque')
  const aj = tl.clips[0].ajustes
  assert.ok(aj.zoom === 1.2 && Math.abs(aj.acercar - 0.1) < 0.01 && aj.panx > 0.05 && !aj.pany, `la cámara de la foto llega como zoom, acercar y paneo: ${JSON.stringify(aj)}`)
  assert.equal(tl.sonidos?.length, 1, 'el «pop» entra en «Sonidos» (el que no existe, no)')
  assert.equal(tl.sonidos[0].nombre, 'pop')
  assert.deepEqual(tl.filtros, { grano: 0.3, vineta: 0.5 }, 'los filtros de la receta son los filtros del editor')
  console.log('receta → editor: capas y sonidos en su pista ✓')

  // Las piezas de documental: el título, la etiqueta y las palabras llegan como rótulos sueltos.
  writeFileSync(
    join(trabajo, 'receta-docu.json'),
    JSON.stringify({
      ancho: 540, alto: 960, duracion: 4, fuente: 'normal', color_acento: '#D62828',
      momentos: [
        { tipo: 'foto', archivo: 'entrada/foto.jpg', desde: 0, hasta: 2 },
        { tipo: 'objeto', archivo: 'entrada/logo.png', desde: 2, hasta: 3 },
        { tipo: 'foto', archivo: 'entrada/foto.jpg', desde: 3, hasta: 4, transicion: 'zoom' },
        { tipo: 'titulo', desde: 0, hasta: 2, y: 0.2, lineas: [{ texto: 'Una pregunta', tam: 0.04 }, { texto: 'Marte', fuente: 'cursiva', tam: 0.2, color: '#D62828' }] },
        { tipo: 'etiqueta', desde: 0.5, hasta: 2, texto: 'ELON MUSK', x: 0.6, y: 0.55 },
        { tipo: 'palabras', desde: 2, hasta: 4, palabras: ['Riesgo', 'Fracaso'], destacar: [1] },
        { tipo: 'titulo', desde: 3, hasta: 4, lineas: [{ texto: 'PLAN', fuente: 'gruesa', tam: 0.34 }] }
      ]
    })
  )
  const docu = await proyectoDesdeReceta(join(trabajo, 'receta-docu.json'), trabajo, proyecto, 4)
  assert.ok(docu)
  const rot = (texto) => docu.timeline.textos.find((t) => t.texto === texto)
  assert.equal(docu.timeline.clips.length, 3, 'las fotos sueltas y el objeto como tramo del video hecho')
  assert.equal(docu.timeline.clips[1].fuente, FUENTE_PRINCIPAL)
  assert.deepEqual([docu.timeline.clips[2].transicion, docu.timeline.clips[2].fundido], ['zoom', 0.45], 'la transición del momento es la del clip')
  assert.equal(rot('ELON MUSK').animacion, 'pop', 'la etiqueta entra con rebote')
  assert.deepEqual([rot('Marte').fuente, rot('Marte').color, rot('Marte').sinCaja], ['cursiva', '#d62828', true])
  assert.ok(rot('Marte').y > rot('Una pregunta').y, 'las líneas del título van una debajo de otra')
  assert.ok(rot('Marte').tamano > 3 && rot('Una pregunta').tamano < 1, 'cada línea con su tamaño')
  assert.deepEqual([rot('ELON MUSK').caja, rot('ELON MUSK').color, rot('ELON MUSK').x], ['#ffd60a', '#111111', 0.6], 'la etiqueta es un rótulo con su caja amarilla')
  assert.ok(rot('Fracaso').inicio > rot('Riesgo').inicio && rot('Fracaso').color === '#d62828', 'las palabras entran escalonadas y la destacada en el acento')
  assert.equal(rot('PLAN').tamano, 5.67, 'una palabra que llena la pantalla (0,34 del ancho)')
  console.log('receta → editor: títulos, etiqueta y palabras como rótulos editables ✓')

  // Los retoques: el usuario cambia el rótulo, mueve la capa, quita el sonido, regenera una frase y añade un rótulo.
  const entregada = {
    ...tl,
    voces: [{ id: 'voz-1', inicio: 0.3, duracion: 1.5, archivo: 'media/voz-01.wav', texto: 'Bienvenidos', voz: 'Kore' }]
  }
  const actual = structuredClone(entregada)
  actual.textos[0].texto = 'Hola a todos'
  actual.capas[0].x = 0.7
  actual.sonidos = []
  actual.filtros = { grano: 0.3, vineta: 0.8 }
  actual.capas[0].fin = { x: 0.9, y: 0.2, ancho: 0.25, giro: 0 }
  actual.voces[0] = { ...actual.voces[0], texto: 'Bienvenidos a la clínica', archivo: 'media/voz-nueva.wav' }
  actual.textos.push({ id: 'texto-nuevo', inicio: 2, duracion: 1, texto: 'Llámanos', posicion: 'abajo', x: 0.5, y: 0.9 })
  const ctx = { medio: (f) => (f === FUENTE_PRINCIPAL ? 'tu video' : `la imagen «${f}»`), archivo: (r) => `C:/proyecto/${r}` }
  const retoques = describirRetoques(entregada, actual, ctx)
  const todo = retoques.join('\n')
  assert.match(todo, /decía «Hola» y ahora dice «Hola a todos»/)
  assert.match(todo, /Cambió la capa .*x 0\.70/)
  assert.match(todo, /Quitó el sonido «pop»/)
  assert.match(todo, /ahora dice «Bienvenidos a la clínica».*usa C:\/proyecto\/media\/voz-nueva\.wav/)
  assert.match(todo, /Añadió el rótulo «Llámanos» de 2 s a 3 s, en x 0\.50, y 0\.90/)
  assert.ok(!/clips/.test(todo), 'los clips no se tocaron: no se mencionan')
  assert.match(todo, /se mueve hasta x 0\.90/)
  assert.match(todo, /filtros del video así .*vineta 0\.8/)
  assert.equal(retoques.length, 6, todo)
  assert.deepEqual(describirRetoques(entregada, structuredClone(entregada), ctx), [], 'sin retoques, nada')
  assert.equal(bloqueRetoques([]), '')
  assert.match(bloqueRetoques(retoques), /RETOQUES QUE EL USUARIO HIZO A MANO[\s\S]*- Quitó el sonido/)
  // Los clips: si los reordena, se le da la lista nueva.
  const reordenada = structuredClone(entregada)
  reordenada.clips = [{ ...entregada.clips[0], salida: 2.5 }]
  assert.match(describirRetoques(entregada, reordenada, ctx).join('\n'), /Cambió los clips[\s\S]*1\. 0 s–2,5 s/)
  console.log('retoques a mano: se describen para el agente ✓')
  console.log('prueba retoques: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
