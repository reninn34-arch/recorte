// Un audio que sube el usuario puede ser una NARRACIÓN (lleva subtítulos hasta donde se habla) o MÚSICA (una canción,
// una base con «You ready? Yes!»: no lleva subtítulos salvo que los pida). Recorte lo distingue con su transcripción.
// npm run prueba:subtitulos-audio
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { subtitulosQueFaltan, audiosSubidos, clasificarAudio } = await import('../src/main/subtitulosreceta.ts')
const carpeta = mkdtempSync(join(tmpdir(), 'recorte-subs-'))
const vistazo = join(carpeta, 'trabajo', 'vistazo')
mkdirSync(vistazo, { recursive: true })
const receta = join(carpeta, 'receta.json')
const conAudio = { adjuntos: [{ archivo: 'trabajo/entrada/03-audio.mp3', nombre: 'audio.mp3', tipo: 'audio' }] }
const subs = (hasta) => ({ subtitulos: { frases: [{ desde: 0, hasta, texto: '…' }] } })
const transcripcion = (t) => writeFileSync(join(vistazo, 'narracion-01.json'), JSON.stringify(t))
try {
  // 1. La canción del comercial: 19.8 s y solo «You ready? … Yes!» (2.2 s de habla).
  transcripcion({ duration: 19.83, segments: [{ start: 0, end: 1.86, text: 'You ready?' }, { start: 2.25, end: 2.59, text: 'Yes!' }] })
  const [cancion] = audiosSubidos(carpeta)
  assert.ok(cancion.musica, 'es música')
  writeFileSync(receta, JSON.stringify({}))
  assert.equal(subtitulosQueFaltan(receta, conAudio, 19, audiosSubidos(carpeta)), null, 'una canción no pide subtítulos')
  writeFileSync(receta, JSON.stringify(subs(2.6)))
  assert.equal(subtitulosQueFaltan(receta, conAudio, 19, audiosSubidos(carpeta)), null)
  console.log('canción con unas palabras: es música y no pide subtítulos ✓')

  // 2. Una narración: habla casi todo el rato.
  transcripcion({ duration: 42, segments: [{ start: 0.5, end: 20, text: 'uno' }, { start: 20.3, end: 40, text: 'dos' }] })
  assert.equal(audiosSubidos(carpeta)[0].musica, false, 'es narración')
  writeFileSync(receta, JSON.stringify({}))
  assert.match(subtitulosQueFaltan(receta, conAudio, 42, audiosSubidos(carpeta)) ?? '', /no trae "subtitulos"/)
  writeFileSync(receta, JSON.stringify(subs(10)))
  assert.match(subtitulosQueFaltan(receta, conAudio, 42, audiosSubidos(carpeta)) ?? '', /se habla hasta el 40\.0/)
  writeFileSync(receta, JSON.stringify(subs(39.5)))
  assert.equal(subtitulosQueFaltan(receta, conAudio, 45, audiosSubidos(carpeta)), null, 'con el cierre después, basta hasta donde se habla')
  console.log('narración: pide subtítulos hasta donde se habla ✓')

  // 3. Un audio que no se pudo transcribir: como siempre, cuenta como narración.
  rmSync(join(vistazo, 'narracion-01.json'))
  writeFileSync(receta, JSON.stringify({}))
  assert.match(subtitulosQueFaltan(receta, conAudio, 30, audiosSubidos(carpeta)) ?? '', /no trae "subtitulos"/)

  // 4. Voz generada con música subida: la voz sí lleva subtítulos hasta el final.
  transcripcion({ duration: 19.83, segments: [{ start: 0, end: 1.86, text: 'You ready?' }] })
  writeFileSync(receta, JSON.stringify({ voz: [{ archivo: 'voz/frase-1.wav', en: 0 }], ...subs(10) }))
  assert.match(subtitulosQueFaltan(receta, { ...conAudio, vozElegida: 'Kore' }, 40, audiosSubidos(carpeta)) ?? '', /el video dura 40\.0/)
  console.log('voz generada (aunque haya música subida): subtítulos hasta el final, como siempre ✓')

  // 5. El corte: menos del 40 % del audio con habla es música; más, narración.
  assert.equal(clasificarAudio('01', { duration: 60, segments: [{ start: 5, end: 15, text: 'la la' }] }).musica, true)
  assert.equal(clasificarAudio('01', { duration: 60, segments: [{ start: 0, end: 50, text: 'texto largo' }] }).musica, false)
} finally {
  rmSync(carpeta, { recursive: true, force: true })
}
