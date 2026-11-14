// «Revisar el audio»: encuentra lo que suena mal y sus arreglos lo dejan bien. Con audio de prueba hecho con FFmpeg:
// «palabras» (tonos con armónicos) separadas por pausas, y «respiraciones» (ruido agudo) en las pausas.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'recorte-audio-'))
mkdirSync(join(dir, 'media'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args])
  assert.equal(r.status, 0, String(r.stderr))
}
// Seis «palabras» de 0,6 s con pausas de 0,4 s (1 s cada una), y en tres pausas una respiración.
const palabra = "0.25*sin(2*PI*180*t)+0.12*sin(2*PI*360*t)+0.06*sin(2*PI*720*t)"
const enPalabra = 'lt(mod(t,1),0.6)'
const respiro = 'between(mod(t,1),0.7,0.92)*between(t,1,4)'
ff(['-f', 'lavfi', '-i', `aevalsrc='(${palabra})*${enPalabra}':s=48000:d=6.5`, '-f', 'lavfi', '-i', 'anoisesrc=c=white:a=0.05:d=6.5:r=48000',
  '-filter_complex', `[1]highpass=f=2500,volume='${respiro}':eval=frame[r];[0][r]amix=inputs=2:normalize=0,adelay=300,atrim=0:6.2[a]`, '-map', '[a]', join(dir, 'media', 'voz.wav')])
// La misma voz empezando a mitad de la primera palabra (como cuando un corte se come el «En» de «Encuentro»).
ff(['-ss', '0.6', '-i', join(dir, 'media', 'voz.wav'), join(dir, 'media', 'voz-cortada.wav')])
// Un video con esa voz para los cortes de la pista de video.
ff(['-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=6.2:r=30', '-i', join(dir, 'media', 'voz.wav'), '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(dir, 'video.mp4')])

try {
  const { revisarAudio, arreglarVoz } = await import('../src/main/revisaraudio.ts')
  const { aplicarOperaciones } = await import('../src/shared/chat.ts')
  const p = { source: { path: join(dir, 'video.mp4'), duration: 6.2 }, medios: [], transcript: [] }
  const tipos = (r) => r.map((x) => x.tipo)

  // Palabras en 0,3–0,9, 1,3–1,9… Cortes: el 1 acaba a mitad de la 2.ª (1,6 s) y el 2 empieza a mitad de la 4.ª (3,6 s).
  let tl = { version: 1, clips: [{ id: 'a', fuente: 'principal', entrada: 0, salida: 1.6 }, { id: 'b', fuente: 'principal', entrada: 3.6, salida: 6.1 }], textos: [] }
  let r = await revisarAudio(p, tl, dir)
  assert.equal(tipos(r).filter((t) => t === 'palabra-cortada').length, 2, JSON.stringify(r))
  for (const x of [...r].filter((y) => y.arreglo?.tipo === 'ops').sort((a, b) => b.t - a.t)) tl = aplicarOperaciones(tl, x.arreglo.ops, { duracionFuente: 6.2 }).timeline
  assert.ok(tl.clips[0].salida >= 1.9 && tl.clips[0].salida <= 2.3, `el 1 termina en la pausa: ${tl.clips[0].salida}`)
  assert.ok(tl.clips[1].entrada >= 2.9 && tl.clips[1].entrada <= 3.3, `el 2 empieza en la pausa: ${tl.clips[1].entrada}`)
  r = await revisarAudio(p, tl, dir)
  assert.equal(tipos(r).filter((t) => t === 'palabra-cortada').length, 0, JSON.stringify(r))
  console.log('cortes que se comen una palabra: se encuentran y quedan en la pausa ✓')

  // Cortes en las pausas: nada que decir.
  const limpio = { version: 1, clips: [{ id: 'a', fuente: 'principal', entrada: 0, salida: 2.1 }, { id: 'b', fuente: 'principal', entrada: 2.95, salida: 6.1 }], textos: [] }
  assert.equal(tipos(await revisarAudio(p, limpio, dir)).filter((t) => t === 'palabra-cortada').length, 0)
  console.log('cortes en las pausas: sin falsas alarmas ✓')

  // Voz: la cortada y con respiraciones.
  const conVoz = (archivo) => ({ version: 1, clips: [], textos: [], voces: [{ id: 'v', inicio: 0, duracion: 6.2, archivo, texto: 'prueba' }] })
  r = await revisarAudio(p, conVoz('media/voz-cortada.wav'), dir)
  assert.ok(tipos(r).includes('voz-cortada'), JSON.stringify(r))
  r = await revisarAudio(p, conVoz('media/voz.wav'), dir)
  assert.ok(!tipos(r).includes('voz-cortada'), 'la entera no está cortada')
  const aire = r.find((x) => x.tipo === 'respiracion')
  assert.ok(aire && aire.arreglo.ventanas.length >= 3, JSON.stringify(r))
  console.log(`voz: frase cortada y ${aire.arreglo.ventanas.length} respiraciones encontradas ✓`)
  const nueva = await arreglarVoz(dir, 'media/voz.wav', 'respiraciones', aire.arreglo.ventanas)
  r = await revisarAudio(p, conVoz(nueva.archivo), dir)
  assert.ok(!tipos(r).includes('respiracion'), JSON.stringify(r))
  assert.ok(Math.abs(nueva.duracion - 6.2) < 0.05, 'la voz dura lo mismo')
  console.log('bajar las respiraciones: quedan suaves y la voz dura lo mismo ✓')
  // «reconstruir» solo cambia la pista de video: la música, la voz, las capas y los sonidos se quedan.
  const { ventanaTimeline, valorClave } = await import('../src/shared/timeline.ts')
  const base = {
    version: 1, clips: [{ id: 'a', fuente: 'principal', entrada: 0, salida: 6 }], textos: [],
    musica: { archivo: 'media/m.mp3', nombre: 'm', volumen: 0.4, ducking: true },
    voces: [{ id: 'v', inicio: 0.5, duracion: 2, archivo: 'media/voz.wav', texto: 'hola' }],
    capas: [{ id: 'c', medio: 'm1', inicio: 1, duracion: 3, x: 0.5, y: 0.5, ancho: 0.5, claves: { ancho: [{ f: 0, v: 0.1 }, { f: 1, v: 0.6 }] } }],
    sonidos: [{ id: 's', inicio: 1, duracion: 0.5, archivo: 'media/pop.wav', nombre: 'pop' }]
  }
  const re = aplicarOperaciones(base, [{ op: 'reconstruir', cortes: [{ entrada: 0, salida: 2 }, { entrada: 3, salida: 5 }] }], { duracionFuente: 6.2 }).timeline
  assert.equal(re.clips.length, 2)
  assert.ok(re.musica && re.voces?.length === 1 && re.capas?.length === 1 && re.sonidos?.length === 1, JSON.stringify(re))
  console.log('reconstruir conserva música, voz, capas y sonidos ✓')
  // Separar el audio de un clip, dividirlo y volver a unirlo: el clip vuelve a sonar y no queda ningún pedazo suelto.
  const { separarAudio, dividirSonido, unirAudio } = await import('../src/shared/timeline.ts')
  let sep = separarAudio({ version: 1, clips: [{ id: 'k', fuente: 'principal', entrada: 0, salida: 4 }], textos: [] }, 'k', 'media/a.wav', 'Sonido', 4)
  assert.ok(sep.clips[0].mudo && sep.sonidos[0].deClip === 'k')
  sep = dividirSonido(sep, sep.sonidos[0].id, 1.5).timeline
  assert.equal(sep.sonidos.length, 2)
  assert.deepEqual([sep.sonidos[1].inicio, sep.sonidos[1].desde, sep.sonidos[1].duracion], [1.5, 1.5, 2.5])
  const unido = unirAudio(sep, sep.sonidos[1].id)
  assert.ok(!unido.clips[0].mudo && !unido.sonidos?.length, JSON.stringify(unido))
  console.log('separar, dividir y volver a unir el audio: sin pedazos sueltos ✓')
  // Un cuadro suelto a mitad de una capa animada: la animación sigue donde iba (antes quedaba en su primera clave).
  const v = ventanaTimeline(base, 2, 2.4)
  assert.ok(Math.abs(valorClave(v.capas[0].claves.ancho, 0) - 0.6) < 0.01, JSON.stringify(v.capas[0]))
  console.log('cuadro suelto con capas animadas: la capa va donde debe ✓')
  // «Pintar palabras»: en el MP4 cada palabra se rellena (\kf) al ritmo de sus tiempos, y sin tiempos se reparten.
  const { animarAss } = await import('../src/main/exportar.ts')
  const { tiemposPalabras } = await import('../src/shared/timeline.ts')
  const rot = { id: 't', inicio: 0, duracion: 2, texto: 'Hola a todos', posicion: 'abajo', animacion: 'pintar', tiempos: [0.2, 0.8, 1.0] }
  const ass = animarAss(rot, 'Hola a todos', null)
  assert.equal(ass.inicio, String.raw`\2c&HFFFFFF&\1c&H4DE1FF&`)
  assert.equal(ass.cuerpo, String.raw`{\k20\kf60}Hola {\kf20}a {\kf70}todos`)
  const repartidas = tiemposPalabras({ ...rot, tiempos: undefined })
  assert.equal(repartidas.length, 3)
  assert.ok(repartidas[2].inicio > 0.9 && repartidas[2].inicio < 1.2, JSON.stringify(repartidas))
  console.log('pintar palabras: karaoke al ritmo de la voz en el MP4 ✓')
  console.log('prueba audio: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
