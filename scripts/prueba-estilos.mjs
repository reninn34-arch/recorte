// La sección «Estilos» (src/main/estiloscatalogo.ts): el catálogo de Recorte se lista con su ficha, se añade y se
// quita, el usuario crea los suyos, la tarjeta elegida llega al agente como guía, y cada estilo es una habilidad que
// aprende. npm run prueba:estilos
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const datos = mkdtempSync(join(tmpdir(), 'recorte-estilos-'))
process.env.RECORTE_USERDATA = datos
const C = await import('../src/main/estiloscatalogo.ts')
const H = await import('../src/main/habilidades.ts')
const { estiloPorId } = await import('../src/shared/estilos.ts')
const lecciones = (id) => H.leerLecciones(id).length

try {
  // 1. Los de Recorte, con su ficha completa.
  let cat = C.catalogoEstilos(lecciones)
  const ids = cat.map((e) => e.id)
  for (const id of ['plastilina', 'low-poly', 'papel-desplegable', 'diorama-miniatura', 'neon', 'inflado', 'escenario-con-foco']) {
    assert.ok(ids.includes(id), `falta ${id}`)
  }
  // solo se publican estilos terminados: con su escena de referencia y su vista previa
  for (const id of ids) assert.ok(existsSync(join('python/estilos', id, 'escena.js')) && existsSync(join('python/estilos', id, 'vista.mp4')), `${id} no tiene escena o vista`)
  for (const e of cat) {
    assert.ok(e.nombre && e.para && e.descripcion.length > 40 && e.colores.length === 3, `ficha incompleta: ${e.id}`)
    assert.equal(e.grupo, '3d')
    assert.equal(e.origen, 'recorte')
  }
  console.log(`el catálogo de Recorte: ${ids.length} estilos con su ficha ✓`)

  // 1b. El sonido de una escena de referencia sale del guion, sin navegador: un WAV estéreo de 48 kHz
  {
    const { crearMezcla } = await import('../python/motor3d/sonido.js')
    const G = await import('../python/estilos/plastilina/guion.js')
    const M = crearMezcla(G.DURACION, { conVoz: true })
    G.sonido(M)
    const wav = M.aWav()
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF')
    assert.equal(wav.length, 44 + Math.ceil(G.DURACION * 48000) * 4)
    console.log('el sonido de una escena sale de su guion ✓')
    // todos los que traen escena: guion con duración y sonido, vista hecha y la guía que manda a la referencia
    const { readdirSync } = await import('node:fs')
    const conEscena = readdirSync('python/estilos').filter((id) => existsSync(join('python/estilos', id, 'escena.js')))
    for (const id of conEscena) {
      const g = await import(`../python/estilos/${id}/guion.js`)
      assert.ok(g.DURACION > 0 && typeof g.sonido === 'function', `guion incompleto: ${id}`)
      const M2 = crearMezcla(g.DURACION, { conVoz: false }); g.sonido(M2)
      for (const f of ['vista.mp4', 'vista.jpg']) assert.ok(existsSync(join('python/estilos', id, f)), `${id} sin ${f}`)
      assert.match(readFileSync(join('python/estilos', id, 'ESTILO.md'), 'utf8'), /escena de referencia completa/, `${id}: la guía no manda a la escena`)
    }
    console.log(`${conEscena.length} estilos con escena de referencia, guion, sonido y vista ✓`)
    // la boca de un personaje sale de la voz: abre al hablar y se cierra en las pausas
    const salida = join(tmpdir(), `boca-${Date.now()}.mjs`)
    const r = spawnSync(process.execPath, ['python/motor3d/boca-de-voz.mjs', 'python/estilos/plastilina/personaje/voz.wav', salida, '--desde', '1.7'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const { BOCA } = await import(pathToFileURL(salida).href)
    assert.equal(BOCA.fps, 30)
    assert.equal(BOCA.desde, 1.7)
    assert.ok(BOCA.valores.some((v) => v > 0.8) && BOCA.valores.filter((v) => v === 0).length > 20, 'la boca no sigue la voz')
    console.log('la boca del personaje sigue la voz ✓')
  }

  // 2. La primera vez no hay ninguno añadido: los añade el usuario (al final, en su orden) y los quita.
  assert.deepEqual(cat.filter((e) => e.anadido).map((e) => e.id), [], 'ningún estilo viene añadido')
  for (const id of ['plastilina', 'neon', 'inflado', 'diorama-miniatura']) C.anadirEstilo(id)
  C.quitarEstilo('neon')
  cat = C.catalogoEstilos(lecciones)
  assert.deepEqual(cat.filter((e) => e.anadido).map((e) => e.id), ['plastilina', 'inflado', 'diorama-miniatura'])
  assert.equal(cat[0].id, 'plastilina', 'lo añadido va primero, en su orden')
  C.anadirEstilo('no-existe')
  assert.ok(!C.leerAnadidos().includes('no-existe'))
  console.log('añadir y quitar tarjetas, en orden ✓')

  // 3. La tarjeta elegida llega al agente: estiloPorId la encuentra con su guía y guarda plantilla (3D).
  C.registrarCatalogo()
  const e = estiloPorId('cat-plastilina')
  assert.equal(e.nombre, 'Plastilina')
  assert.ok(e.plantilla)
  assert.match(e.guia, /ESTILO ELEGIDO EN SU TARJETA: «Plastilina»/)
  assert.match(e.guia, /habilidades\/estilo-plastilina\/HABILIDAD\.md/)
  assert.match(e.guia, /se aplasta al tocar el suelo/)
  assert.match(e.guia, /lo que pida en su mensaje manda/)
  assert.equal(estiloPorId('cat-no-existe').id, 'libre')
  console.log('la tarjeta elegida llega al agente con su guía ✓')

  // 4. Cada estilo es una habilidad: el agente lo usa si lo nombran, y aprende de él.
  const habs = H.listarHabilidades()
  const hab = habs.find((h) => h.id === 'estilo-neon')
  assert.ok(hab, 'el estilo no es habilidad')
  assert.match(hab.cuando, /estilo «Neón»/)
  const trabajo = join(datos, 'trabajo')
  const seccion = H.prepararHabilidades(trabajo)
  assert.match(seccion, /`estilo-neon` — Estilo «Neón»/)
  const copia = readFileSync(join(trabajo, 'habilidades', 'estilo-neon', 'HABILIDAD.md'), 'utf8')
  assert.match(copia, /Se encienden con parpadeo/)
  assert.ok(!existsSync(join(trabajo, 'habilidades', 'estilo-neon', 'vista.mp4')), 'la vista previa no va al trabajo')
  // los estilos con escena de referencia la llevan a su habilidad, y el motor 3D va entero al trabajo
  for (const f of ['escena.js', 'guion.js']) assert.ok(existsSync(join(trabajo, 'habilidades', 'estilo-plastilina', f)), `falta ${f} de plastilina`)
  for (const f of ['escenario.js', 'sonido.js', 'letras3d.js', 'personaje.js', 'sonido-a-wav.mjs', 'boca-de-voz.mjs', 'LEEME.md']) assert.ok(existsSync(join(trabajo, 'motor3d', f)), `falta motor3d/${f}`)
  // el material del estilo y el ejemplo de personaje (su código, sin la voz de prueba)
  assert.ok(existsSync(join(trabajo, 'habilidades', 'estilo-plastilina', 'material.js')), 'falta material.js de plastilina')
  for (const f of ['escena.js', 'guion.js', 'boca.js']) assert.ok(existsSync(join(trabajo, 'habilidades', 'estilo-plastilina', 'personaje', f)), `falta personaje/${f}`)
  assert.ok(!existsSync(join(trabajo, 'habilidades', 'estilo-plastilina', 'personaje', 'voz.wav')), 'la voz de prueba no va al trabajo')
  assert.match(readFileSync(join(trabajo, 'habilidades', 'estilo-plastilina', 'HABILIDAD.md'), 'utf8'), /escena de referencia completa/)
  H.guardarLecciones([{ habilidad: 'estilo-neon', leccion: 'A este usuario le gusta el neón en rosa y celeste, sin amarillo.' }])
  assert.equal(C.catalogoEstilos(lecciones).find((x) => x.id === 'neon').lecciones, 1)
  assert.match(readFileSync(join(H.prepararHabilidades(trabajo) && trabajo, 'habilidades', 'estilo-neon', 'HABILIDAD.md'), 'utf8'), /rosa y celeste/)
  console.log('cada estilo es una habilidad que aprende; el motor 3D y la escena de referencia llegan al agente ✓')

  // 5. Crear uno propio: queda añadido, con su guía tal cual, y se borra.
  assert.ok(C.crearEstilo({ nombre: '', descripcion: 'algo largo de verdad para pasar' }).error)
  assert.ok(C.crearEstilo({ nombre: 'Corto', descripcion: 'poco' }).error)
  const r = C.crearEstilo({ nombre: 'Lujo negro', descripcion: 'Fondo negro mate, letras finas en mayúsculas, el producto gira despacio bajo un foco.' })
  assert.equal(r.id, 'lujo-negro')
  const propio = C.catalogoEstilos(lecciones).find((x) => x.id === 'lujo-negro')
  assert.ok(propio.anadido && propio.origen === 'usuario' && propio.etiqueta === 'MÍO')
  assert.match(estiloPorId('cat-lujo-negro').guia, /producto gira despacio bajo un foco/)
  assert.equal(C.crearEstilo({ nombre: 'Lujo negro', descripcion: 'Otro distinto con el mismo nombre para probar.' }).id, 'lujo-negro-2')
  C.borrarEstilo('lujo-negro')
  assert.ok(!C.catalogoEstilos(lecciones).some((x) => x.id === 'lujo-negro'))
  assert.ok(!C.leerAnadidos().includes('lujo-negro'))
  console.log('crear y borrar un estilo propio ✓')

  console.log('prueba estilos: ok')
} finally {
  rmSync(datos, { recursive: true, force: true })
}
