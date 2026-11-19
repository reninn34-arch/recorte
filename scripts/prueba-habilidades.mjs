// Las habilidades del agente (src/main/habilidades.ts): las de Recorte se listan y llegan al manual; lo que el agente
// aprende al entregar se guarda, no se repite y vuelve con la habilidad; crea habilidades nuevas; el usuario añade las
// suyas (también una skill de Claude Code tal cual) y olvida lo que no le sirve. npm run prueba:habilidades
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const datos = mkdtempSync(join(tmpdir(), 'recorte-habilidades-'))
process.env.RECORTE_USERDATA = datos
const H = await import('../src/main/habilidades.ts')
const { validarEntrega } = await import('../src/shared/modoagente.ts')

try {
  // 1. Las de Recorte.
  const ids = H.listarHabilidades().map((h) => h.id)
  assert.ok(ids.includes('copiar-un-video') && ids.includes('escoger-tomas'), `faltan las de Recorte: ${ids}`)
  assert.ok(H.listarHabilidades().every((h) => h.origen === 'recorte' && h.cuando.length > 20))
  console.log(`las de Recorte: ${ids.join(', ')} ✓`)

  // 2. Al manual: la lista con su «cuándo» y cada una copiada en trabajo/habilidades/.
  const trabajo = join(datos, 'trabajo')
  let seccion = H.prepararHabilidades(trabajo)
  assert.match(seccion, /`copiar-un-video` — Editar como un video: el usuario trae un video de referencia/)
  assert.match(seccion, /"lecciones": \[\{"habilidad": "id"/)
  // No atan: lo que pide el usuario ahora manda sobre la habilidad y sobre lo aprendido.
  assert.match(seccion, /punto\s+de partida, no una jaula/)
  assert.match(seccion, /1\. Lo que el usuario pide AHORA[\s\S]*2\. Lo aprendido[\s\S]*3\. Los pasos de la habilidad/)
  assert.ok(existsSync(join(trabajo, 'habilidades', 'copiar-un-video', 'HABILIDAD.md')))
  console.log('llegan al manual del agente, con cuándo usar cada una ✓')

  // 3. El agente entrega lo que aprendió (validarEntrega lo lee de resultado.json).
  const entrega = validarEntrega({
    archivo: 'salida/v.mp4',
    resumen: 'Listo',
    habilidades: ['copiar-un-video'],
    lecciones: [
      { habilidad: 'copiar-un-video', leccion: 'Este usuario quiere   los subtítulos amarillos y en mayúsculas.' },
      { habilidad: 'no-existe', leccion: 'esto no se guarda' },
      { habilidad: 'escoger-tomas', leccion: '' }
    ],
    habilidad_nueva: { id: 'Antes y Después', nombre: 'Antes y después', cuando: 'cuando pide comparar un antes y un después', cuerpo: '# Antes y después\n\n1. Pon el antes a la izquierda.\n2. Desliza la línea al ritmo.' }
  })
  assert.deepEqual(entrega.habilidades, ['copiar-un-video'])
  assert.equal(entrega.lecciones.length, 2)
  assert.ok(entrega.habilidadNueva.cuerpo.includes('\n1. Pon'), 'el cuerpo de la habilidad nueva conserva sus líneas')
  assert.equal(H.guardarLecciones(entrega.lecciones), 1, 'solo se guarda la de una habilidad que existe')
  console.log('resultado.json: lecciones y habilidad nueva se leen; las de habilidades que no existen, no ✓')

  // 4. No se repite: la misma lección (con otras mayúsculas o espacios) sube al final en vez de duplicarse.
  assert.equal(H.guardarLecciones([{ habilidad: 'copiar-un-video', leccion: 'Los cortes van en el golpe aunque la referencia no.' }]), 1)
  assert.equal(H.guardarLecciones([{ habilidad: 'copiar-un-video', leccion: 'este usuario quiere los subtitulos amarillos y en MAYUSCULAS' }]), 0)
  const aprendido = H.leerLecciones('copiar-un-video')
  assert.equal(aprendido.length, 2)
  assert.match(aprendido[1], /amarillos/i, 'la repetida sube al final')
  console.log('lo aprendido no se repite: lo que vuelve a salir sube ✓')

  // 5. Vuelve con la habilidad la próxima vez.
  seccion = H.prepararHabilidades(trabajo)
  assert.match(seccion, /Editar como un video: .* \(2 lecciones aprendidas\)/)
  const copiada = readFileSync(join(trabajo, 'habilidades', 'copiar-un-video', 'HABILIDAD.md'), 'utf8')
  assert.match(copiada, /## Lo aprendido en usos anteriores[\s\S]*subtitulos amarillos/i)
  console.log('la próxima vez el agente lee lo aprendido con la habilidad ✓')

  // 6. Tope: como mucho MAX_LECCIONES, salen las más viejas.
  H.guardarLecciones(Array.from({ length: H.MAX_LECCIONES + 5 }, (_, i) => ({ habilidad: 'escoger-tomas', leccion: `lección número ${i}` })))
  const tope = H.leerLecciones('escoger-tomas')
  assert.equal(tope.length, H.MAX_LECCIONES)
  assert.match(tope.at(-1), /número 44/)
  console.log(`como mucho ${H.MAX_LECCIONES} lecciones por habilidad ✓`)

  // 7. La habilidad que creó el agente queda como del usuario, y no pisa una que ya existe.
  assert.equal(H.guardarHabilidadNueva(entrega.habilidadNueva), 'antes-y-despues')
  assert.equal(H.guardarHabilidadNueva({ ...entrega.habilidadNueva, id: 'copiar-un-video' }), null)
  const nueva = H.listarHabilidades().find((h) => h.id === 'antes-y-despues')
  assert.equal(nueva?.origen, 'usuario')
  console.log('el agente crea una habilidad nueva y no pisa las que hay ✓')

  // 8. El usuario añade las suyas: una skill de Claude Code (carpeta con SKILL.md, name/description) y un .md suelto.
  const skill = join(datos, 'mi-skill-de-claude')
  mkdirSync(skill)
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: Ganchos virales\ndescription: cuando pide un video para TikTok con gancho\n---\n\nEmpieza con una pregunta.\n')
  writeFileSync(join(skill, 'ejemplo.txt'), 'un ejemplo')
  assert.equal(H.anadirHabilidad(skill).id, 'mi-skill-de-claude')
  const suelto = join(datos, 'Títulos Grandes.md')
  writeFileSync(suelto, '---\nnombre: Títulos grandes\ncuando: cuando pide títulos llamativos\n---\nGrandes y cortos.\n')
  assert.equal(H.anadirHabilidad(suelto).id, 'titulos-grandes')
  const sinCabecera = join(datos, 'nada.md')
  writeFileSync(sinCabecera, 'solo texto')
  assert.match(H.anadirHabilidad(sinCabecera).error, /cabecera/)
  H.prepararHabilidades(trabajo)
  assert.ok(existsSync(join(trabajo, 'habilidades', 'mi-skill-de-claude', 'ejemplo.txt')), 'lo que trae la skill viaja con ella')
  assert.match(readFileSync(join(trabajo, 'habilidades', 'mi-skill-de-claude', 'HABILIDAD.md'), 'utf8'), /Empieza con una pregunta/)
  console.log('añadir: una skill de Claude Code tal cual y un .md suelto; sin cabecera, un error claro ✓')

  // 9. Olvidar una lección.
  const vista = H.habilidadesConLecciones().find((h) => h.id === 'copiar-un-video')
  H.olvidarLeccion('copiar-un-video', vista.aprendido[0])
  assert.equal(H.leerLecciones('copiar-un-video').length, 1)
  console.log('olvidar una lección desde Ajustes ✓')

  console.log('prueba habilidades: ok')
} finally {
  rmSync(datos, { recursive: true, force: true })
}
