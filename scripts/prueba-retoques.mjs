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
  ff('-f', 'lavfi', '-i', 'testsrc2=s=600x800', '-frames:v', '1', join(trabajo, 'entrada', 'foto.jpg'))
  ff('-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', join(trabajo, 'entrada', 'logo.png'))
  writeFileSync(
    join(trabajo, 'receta.json'),
    JSON.stringify({
      ancho: 540, alto: 960, duracion: 4,
      momentos: [{ tipo: 'foto', archivo: 'entrada/foto.jpg', desde: 0, hasta: 4, rotulo: 'Hola' }],
      capas: [{ archivo: 'entrada/logo.png', desde: 1, hasta: 3, x: 0.3, y: 0.2, ancho: 0.25, entrada: 'pop' }],
      sonidos: [{ sonido: 'pop', en: 1 }, { sonido: 'no-existe', en: 2 }]
    })
  )
  const armado = await proyectoDesdeReceta(join(trabajo, 'receta.json'), trabajo, proyecto, 4)
  assert.ok(armado, 'la receta se convierte')
  const tl = armado.timeline
  assert.equal(tl.capas?.length, 1, 'la capa entra en «Encima»')
  assert.deepEqual([tl.capas[0].x, tl.capas[0].y, tl.capas[0].ancho, tl.capas[0].entrada, tl.capas[0].inicio, tl.capas[0].duracion], [0.3, 0.2, 0.25, 'pop', 1, 2])
  assert.ok(armado.medios.some((m) => m.id === tl.capas[0].fuente && m.tipo === 'imagen'), 'su imagen queda en la biblioteca')
  assert.equal(tl.sonidos?.length, 1, 'el «pop» entra en «Sonidos» (el que no existe, no)')
  assert.equal(tl.sonidos[0].nombre, 'pop')
  console.log('receta → editor: capas y sonidos en su pista ✓')

  // Los retoques: el usuario cambia el rótulo, mueve la capa, quita el sonido, regenera una frase y añade un rótulo.
  const entregada = {
    ...tl,
    voces: [{ id: 'voz-1', inicio: 0.3, duracion: 1.5, archivo: 'media/voz-01.wav', texto: 'Bienvenidos', voz: 'Kore' }]
  }
  const actual = structuredClone(entregada)
  actual.textos[0].texto = 'Hola a todos'
  actual.capas[0].x = 0.7
  actual.sonidos = []
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
  assert.equal(retoques.length, 5, todo)
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
