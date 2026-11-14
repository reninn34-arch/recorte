// Subtítulos animados con HyperFrames: los textos de subtítulo son el guion, un estilo los dibuja encima; si se
// corrige un texto quedan «por animar» (se ven como texto) y al volver a animar entran al día en el MP4.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-subs-'))
mkdirSync(join(dir, 'media'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  assert.equal(r.status, 0, String(r.stderr))
}
try {
  const tl0 = await import('../src/shared/timeline.ts')
  const { aplicarOperaciones, validarOperaciones } = await import('../src/shared/chat.ts')
  const { renderizarPieza, listarPiezas } = await import('../src/main/piezas.ts')
  const { valoresConMarca } = await import('../src/shared/piezas.ts')
  const { exportarTimeline } = await import('../src/main/exportar.ts')
  const { normalizarTimeline, frasesSubtitulos, huellaSubtitulos, subtitulosAlDia, timelineActiva, CAPA_SUBTITULOS, cambiarTexto } = tl0

  // Los estilos de la app.
  const estilos = listarPiezas().filter((p) => p.subtitulos)
  assert.deepEqual(estilos.map((p) => p.id).sort(), ['subtitulos-palabra', 'subtitulos-pildora', 'subtitulos-rotulo'])
  assert.ok(estilos.every((p) => p.categoria === 'Subtítulos' && p.duracion.max >= 600 && !p.vars.some((v) => v.tipo === 'texto')))

  // Un video gris de 4 s, vertical chico, y dos subtítulos.
  ff(['-f', 'lavfi', '-i', 'color=c=0x808080:s=360x640:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(dir, 'fondo.mp4')])
  const proyecto = { id: 'p', name: 'prueba', source: { path: join(dir, 'fondo.mp4'), width: 360, height: 640, fps: 30, duration: 4 }, brand: { primary: '#ff5a7a', secondary: '#33c9c1' }, medios: [] }
  let tl = normalizarTimeline(
    {
      clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 4 }],
      textos: [
        { id: 't1', texto: 'Todo en un *solo* lugar', inicio: 0.5, duracion: 1.5, posicion: 'abajo', subtitulo: true, tiempos: [0, 0.3, 0.5, 0.7, 1.0] },
        { id: 't2', texto: 'Ven a visitarnos', inicio: 2.0, duracion: 1.6, posicion: 'abajo', subtitulo: true },
        { id: 't3', texto: 'Un rótulo que no es subtítulo', inicio: 0, duracion: 1, posicion: 'arriba' }
      ]
    },
    4
  )
  // Las frases para la pieza: en orden, con sus palabras, las resaltadas y su segundo (desde que empieza la capa).
  const f = frasesSubtitulos(tl)
  assert.equal(f.inicio, 0.2)
  assert.equal(f.frases.length, 2)
  assert.deepEqual(f.frases[0].p.map((x) => x.w), ['Todo', 'en', 'un', 'solo', 'lugar'])
  assert.deepEqual(f.frases[0].p.map((x) => x.k), [false, false, false, true, false])
  assert.deepEqual(f.frases[0].p.map((x) => x.a), [0.3, 0.6, 0.8, 1.0, 1.3])
  assert.equal(f.frases[1].a, 1.8)
  assert.ok(Math.abs(f.duracion - (3.6 - 0.2 + 0.4)) < 1e-6)

  // Sin estilo, nada cambia; con estilo y sin render, se ven como texto (no al día).
  assert.equal(timelineActiva(tl), tl)
  const ops = validarOperaciones([{ op: 'subtitulos_animados', estilo: 'subtitulos-rotulo', valores: { colorClave: '#72f9fd', y: 70 } }])
  assert.equal(ops.length, 1)
  tl = aplicarOperaciones(tl, ops, { duracionFuente: 4, transcript: [], medios: {} }).timeline
  assert.equal(tl.subtitulosHF.pieza, 'subtitulos-rotulo')
  assert.equal(tl.subtitulosHF.valores.colorClave, '#72f9fd')
  assert.equal(subtitulosAlDia(tl), false)
  assert.equal(timelineActiva(tl).textos.length, 3, 'por animar: los subtítulos se ven como texto')

  // El render de verdad (HyperFrames), como lo hace la app.
  const pieza = estilos.find((p) => p.id === 'subtitulos-rotulo')
  const valores = { ...valoresConMarca(pieza, tl.subtitulosHF.valores, proyecto.brand), frases: JSON.stringify(f.frases) }
  const t0 = Date.now()
  const r = await renderizarPieza(dir, pieza.id, valores, {}, 360, 640, f.duracion)
  console.log(`render de subtítulos: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  const medio = { id: 'm-subs', ruta: join(dir, r.archivo), tipo: 'video', conAudio: false, nombre: 'subs.webm', duracion: r.duracion, ancho: 360, alto: 640 }
  const conMedio = { ...proyecto, medios: [medio] }
  tl = { ...tl, subtitulosHF: { ...tl.subtitulosHF, medio: medio.id, huella: huellaSubtitulos(tl), inicio: f.inicio, duracion: r.duracion } }
  // Sobrevive a normalizar (con el medio en la biblioteca) y queda al día.
  tl = normalizarTimeline(tl, 4, { 'm-subs': r.duracion })
  assert.equal(subtitulosAlDia(tl), true)
  const activa = timelineActiva(tl)
  assert.deepEqual(activa.textos.map((t) => t.id), ['t3'], 'al día: los subtítulos los dibuja la capa')
  const capa = activa.capas.find((c) => c.id === CAPA_SUBTITULOS)
  assert.ok(capa && capa.fuente === 'm-subs' && capa.inicio === 0.2 && capa.ancho === 1)
  // Sin el medio, no se queda colgado (vuelve a texto).
  assert.equal(normalizarTimeline(tl, 4, {}).subtitulosHF.medio, undefined)

  // En el MP4: a los 1,3 s se ve el bloque oscuro (#0a2540) abajo, y la palabra clave turquesa.
  const salida = join(dir, 'salida')
  const ex = await exportarTimeline(conMedio, tl, dir, { formato: 'original', subtitulos: false }, () => {}, salida)
  assert.equal(ex.ok, true, ex.error)
  const mp4 = join(salida, 'timeline-prueba-original.mp4')
  const cuadro = (t) => {
    const x = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 })
    return x.stdout
  }
  const pix = (buf, x, y) => [...buf.subarray((y * 360 + x) * 3, (y * 360 + x) * 3 + 3)]
  const enFila = (buf, y, prueba) => Array.from({ length: 360 }, (_, x) => pix(buf, x, y)).some(prueba)
  const oscuro = ([r, g, b]) => r < 40 && g < 60 && b > 40 && b < 110
  const turquesa = ([r, g, b]) => r < 150 && g > 180 && b > 180
  const c1 = cuadro(1.3)
  const filas = Array.from({ length: 120 }, (_, k) => 400 + k)
  assert.ok(filas.some((y) => enFila(c1, y, oscuro)), 'el bloque del rótulo se ve')
  assert.ok(filas.some((y) => enFila(c1, y, turquesa)), 'la palabra resaltada va en su color')
  // Antes de que empiece la voz, nada abajo (gris).
  const c0 = cuadro(0.05)
  assert.ok(!filas.some((y) => enFila(c0, y, oscuro)), 'sin subtítulo antes de tiempo')
  ff(['-ss', '1.3', '-i', mp4, '-frames:v', '1', join(process.env.CUADRO_SUBS || join(dir, 'cuadro.png'))])

  // Corregir un subtítulo a mano: quedan por animar (texto de nuevo) hasta el siguiente render.
  const corregido = cambiarTexto(tl, 't2', { texto: 'Ven a *visitarnos* hoy' })
  assert.equal(subtitulosAlDia(corregido), false)
  assert.equal(timelineActiva(corregido).textos.length, 3)
  // Cambiar un color del estilo también.
  assert.equal(subtitulosAlDia({ ...tl, subtitulosHF: { ...tl.subtitulosHF, valores: { ...tl.subtitulosHF.valores, y: 50 } } }), false)
  // Mover el rótulo que no es subtítulo no los toca.
  assert.equal(subtitulosAlDia(cambiarTexto(tl, 't3', { texto: 'Otro rótulo' })), true)

  // El render viaja en la operación del chat: entra al día en el mismo paso.
  const sinRender = { ...tl, subtitulosHF: { pieza: 'subtitulos-rotulo', valores: tl.subtitulosHF.valores } }
  const conRender = aplicarOperaciones(sinRender, [{ op: 'subtitulos_animados', estilo: 'subtitulos-rotulo', valores: {}, render: tl.subtitulosHF }], { duracionFuente: 4, transcript: [], medios: { 'm-subs': r.duracion } }).timeline
  assert.equal(subtitulosAlDia(conRender), true)
  // "ninguno" vuelve al texto simple.
  const ninguno = aplicarOperaciones(tl, validarOperaciones([{ op: 'subtitulos_animados', estilo: 'ninguno' }]), { duracionFuente: 4, transcript: [], medios: {} }).timeline
  assert.equal(ninguno.subtitulosHF, undefined)
  // Sin subtítulos no se puede elegir estilo.
  const sinSubs = aplicarOperaciones({ ...tl, textos: [], subtitulosHF: undefined }, ops, { duracionFuente: 4, transcript: [], medios: {} })
  assert.equal(sinSubs.fallos.length, 1)
  // Un texto viejo (no marcado) se marca como subtítulo desde el chat o el MCP, y se desmarca.
  const marcado = aplicarOperaciones(sinSubs.timeline, validarOperaciones([{ op: 'anadir_texto', inicio: 1, texto: 'Hola', subtitulo: true }, { op: 'cambiar_texto', texto_n: 1, subtitulo: true }]), { duracionFuente: 4, transcript: [], medios: {} }).timeline
  assert.equal(marcado.textos.filter((t) => t.subtitulo).length, 1)
  const desmarcado = aplicarOperaciones(marcado, validarOperaciones([{ op: 'cambiar_texto', texto_n: 1, subtitulo: false }]), { duracionFuente: 4, transcript: [], medios: {} }).timeline
  assert.equal(desmarcado.textos.filter((t) => t.subtitulo).length, 0)
  assert.ok(!('subtitulo' in desmarcado.textos[0]))
  // Varias piezas en un mismo pedido: quedan todas (antes cada una borraba a la anterior).
  const dos = aplicarOperaciones(tl, [
    { op: 'anadir_pieza', pieza: 'icono-animado', inicio: 0.5, valores: {}, medio: 'm-a', duracionReal: 1 },
    { op: 'anadir_pieza', pieza: 'icono-animado', inicio: 2, valores: {}, medio: 'm-b', duracionReal: 1 }
  ], { duracionFuente: 4, transcript: [], medios: { 'm-subs': r.duracion } }).timeline
  assert.deepEqual(dos.capas.map((c) => c.fuente), ['m-a', 'm-b'])
  console.log('subtítulos animados: todo bien')
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
}
