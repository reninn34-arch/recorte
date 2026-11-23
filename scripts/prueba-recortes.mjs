// Cortar y estirar el audio como en un editor serio: frases de la narración, sonidos y música que se dividen, se
// recortan por los bordes y se vuelven a estirar hasta donde llega su archivo.
// npm run prueba:recortes
import assert from 'node:assert/strict'
import {
  borrarTramoMusica,
  cambiarTramoMusica,
  cambiarVoz,
  conNegroHasta,
  finSinNegro,
  duracionTimeline,
  cambiarCapa,
  dividirMusica,
  dividirSonido,
  dividirVoz,
  extraerRango,
  normalizarTimeline,
  soloTramo,
  subtitulosDesdeVoz,
  tramosMusica
} from '../src/shared/timeline.ts'

let bien = 0
const caso = (nombre, fn) => {
  fn()
  bien++
  console.log(`bien  ${nombre}`)
}
const cerca = (a, b, txt) => assert.ok(Math.abs(a - b) < 0.01, `${txt ?? ''} ${a} ≠ ${b}`)

const base = normalizarTimeline(
  {
    clips: [{ id: 'c1', fuente: 'principal', entrada: 0, salida: 10 }],
    textos: [],
    voces: [{ id: 'v1', inicio: 1, duracion: 4, archivo: 'media/voz-1.wav', texto: 'uno dos tres cuatro' }],
    sonidos: [{ id: 's1', inicio: 0, duracion: 5, archivo: 'media/golpe.mp3', nombre: 'Golpe' }],
    musica: { archivo: 'media/musica.mp3', nombre: 'Música', volumen: 0.4, ducking: true }
  },
  10,
  {}
)

caso('dividir una frase de voz: dos pedazos que suenan igual y recuerdan su archivo', () => {
  const r = dividirVoz(base, 'v1', 3)
  const [a, b] = r.timeline.voces
  cerca(a.duracion, 2)
  assert.equal(a.desde, undefined)
  cerca(a.largo, 4)
  cerca(b.inicio, 3)
  cerca(b.duracion, 2)
  cerca(b.desde, 2)
  cerca(b.largo, 4)
  assert.equal(r.id, b.id)
  // Fuera de la frase o pegado al borde no corta.
  assert.equal(dividirVoz(base, 'v1', 0.5).timeline, base)
  assert.equal(dividirVoz(base, 'v1', 1.05).timeline, base)
})

caso('el pedazo dividido sobrevive a normalizar y rehacer la frase le quita el recorte', () => {
  const tl = dividirVoz(base, 'v1', 3).timeline
  const otra = normalizarTimeline(JSON.parse(JSON.stringify(tl)), 10, {})
  assert.deepEqual(otra.voces, tl.voces)
  const b = tl.voces[1]
  const rehecha = cambiarVoz(tl, b.id, { archivo: 'media/voz-2.wav', duracion: 3, texto: 'nuevo' })
  const n = rehecha.voces.find((v) => v.id === b.id)
  assert.equal(n.desde, undefined)
  assert.equal(n.largo, undefined)
  // Mover no le quita el recorte.
  const movida = cambiarVoz(tl, b.id, { inicio: 6 })
  cerca(movida.voces.find((v) => v.id === b.id).desde, 2)
})

caso('los subtítulos de una frase dividida: cada pedazo dice lo suyo, sin repetir', () => {
  const tl = dividirVoz(base, 'v1', 3).timeline
  const palabras = { 'media/voz-1.wav': [
    { texto: 'uno', inicio: 0, fin: 0.9 },
    { texto: 'dos', inicio: 1, fin: 1.9 },
    { texto: 'tres', inicio: 2.1, fin: 2.9 },
    { texto: 'cuatro', inicio: 3, fin: 3.9 }
  ] }
  const sub = subtitulosDesdeVoz(tl, [], {}, 6, palabras)
  const dichas = sub.textos.flatMap((t) => t.texto.replace(/\*/g, '').split(/\s+/)).map((w) => w.toLowerCase())
  assert.deepEqual(dichas, ['uno', 'dos', 'tres', 'cuatro'])
  // Y movido el segundo pedazo, sus palabras se van con él.
  const movida = cambiarVoz(tl, tl.voces[1].id, { inicio: 7 })
  const sub2 = subtitulosDesdeVoz(movida, [], {}, 6, palabras)
  const ultimo = sub2.textos[sub2.textos.length - 1]
  assert.ok(ultimo.inicio >= 6.99, `empieza en ${ultimo.inicio}`)
  assert.match(ultimo.texto.toLowerCase(), /tres/)
})

caso('un sonido dividido se puede volver a alargar hasta donde iba', () => {
  const r = dividirSonido(base, 's1', 2)
  const [a, b] = r.timeline.sonidos
  cerca(a.largo, 5)
  cerca(b.largo, 5)
  cerca(b.desde, 2)
})

caso('la música sin cortar es un solo trozo de todo el video', () => {
  const t = tramosMusica(base)
  assert.equal(t.length, 1)
  assert.equal(t[0].id, 'musica')
  cerca(t[0].duracion, 10)
  assert.equal(base.musica.tramos, undefined)
})

caso('dividir la música: dos trozos que siguen sonando igual', () => {
  const r = dividirMusica(base, 4)
  const t = r.timeline.musica.tramos
  assert.equal(t.length, 2)
  assert.equal(t[0].id, 'musica')
  cerca(t[0].duracion, 4)
  cerca(t[1].inicio, 4)
  cerca(t[1].desde, 4)
  cerca(t[1].duracion, 6)
  assert.equal(r.timeline.musica.volumen, 0.4)
  assert.equal(r.timeline.musica.ducking, true)
  // Sobrevive a normalizar.
  assert.deepEqual(normalizarTimeline(JSON.parse(JSON.stringify(r.timeline)), 10, {}).musica, r.timeline.musica)
})

caso('recortar, mover y borrar trozos de música', () => {
  const tl = dividirMusica(base, 4).timeline
  const id2 = tl.musica.tramos[1].id
  const recortado = cambiarTramoMusica(tl, id2, { inicio: 5, duracion: 5, desde: 5 })
  cerca(recortado.musica.tramos[1].inicio, 5)
  // Alargar el primero: la música se repite, llega hasta el final del video y no más.
  const largo = cambiarTramoMusica(tl, 'musica', { duracion: 99 })
  cerca(largo.musica.tramos[0].duracion, 10)
  const sinUno = borrarTramoMusica(tl, 'musica')
  assert.equal(sinUno.musica.tramos.length, 1)
  const sinNada = borrarTramoMusica(sinUno, id2)
  assert.equal(sinNada.musica, undefined)
})

caso('extraer un tramo corre los trozos de música con el video', () => {
  const tl = dividirMusica(base, 4).timeline
  const r = extraerRango(tl, 2, 3)
  const t = r.musica.tramos
  cerca(t[0].duracion, 3, 'el primero pierde 1 s')
  cerca(t[1].inicio, 3, 'el segundo se corre')
  cerca(t[1].desde, 4, 'y suena lo mismo')
  // Exportar solo un tramo: el trozo que ya sonaba sigue donde iba.
  const s = soloTramo(tl, 5, 8)
  const ts = tramosMusica(s)
  assert.equal(ts.length, 1)
  cerca(ts[0].inicio, 0)
  cerca(ts[0].desde, 5)
  cerca(ts[0].duracion, 3)
})

caso('estirar una foto de encima más allá del final alarga el video con negro, y al volver se acorta', () => {
  const medios = { principal: 10, foto: 600 }
  const tl = normalizarTimeline({ ...base, capas: [{ id: 'f1', fuente: 'foto', inicio: 6, duracion: 4 }] }, 10, { foto: 600 })
  const larga = cambiarCapa(conNegroHasta(tl, 14, 'f1'), 'f1', { duracion: 8 }, medios)
  cerca(duracionTimeline(larga), 14, 'el video dura hasta donde acaba la foto')
  assert.equal(larga.clips.at(-1).fuente, 'negro')
  cerca(larga.capas[0].duracion, 8, 'la foto no se corta')
  cerca(finSinNegro(larga), 10)
  // Sobrevive a guardar y abrir.
  const otra = normalizarTimeline(JSON.parse(JSON.stringify(larga)), 10, { foto: 600 })
  cerca(duracionTimeline(otra), 14)
  cerca(otra.capas[0].duracion, 8)
  // Volver a acortarla: el negro se acorta con ella y, si cabe en el video, se va.
  const menos = cambiarCapa(conNegroHasta(larga, 12, 'f1'), 'f1', { duracion: 6 }, medios)
  cerca(duracionTimeline(menos), 12)
  const dentro = cambiarCapa(conNegroHasta(larga, 9, 'f1'), 'f1', { duracion: 3 }, medios)
  cerca(duracionTimeline(dentro), 10)
  assert.ok(dentro.clips.every((c) => c.fuente !== 'negro'))
  // Otra capa que ya llegaba al negro lo sostiene.
  const dos = { ...larga, capas: [...larga.capas, { id: 'f2', fuente: 'foto', inicio: 11, duracion: 2, x: 0.5, y: 0.5, ancho: 0.3 }] }
  cerca(duracionTimeline(conNegroHasta(dos, 9, 'f1')), 13)
})

console.log(`\n${bien} bien`)
