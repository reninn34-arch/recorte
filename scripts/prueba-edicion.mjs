import {
  borrarMarcador,
  cambiarMarcador,
  duracionTimeline,
  extraerRango,
  normalizarTimeline,
  ponerMarcador,
  rodarCorte,
  deslizarContenido,
  desplazarClip,
  cambiarPista,
  timelineActiva,
  tramos,
  VOLUMEN_SONIDO,
  soloTramo,
  subtitulosDesdeVoz,
  quitarSubtitulos,
  ESTILOS_SUBTITULO,
  sobrescribirClip,
  separarAudio,
  sonidoUnicoMulticam,
  anidarClips,
  desanidarClip,
  clipsSeguidos,
  largoClip,
  fuenteEnClip,
  clipEnFuente,
  ponerClaveRampa,
  quitarClaveRampa,
  dividir,
  cambiarSonido
} from '../src/shared/timeline.ts'
import { aplicarOperaciones, validarOperaciones } from '../src/shared/chat.ts'
import { aplicarLimpieza, buscarLimpieza, MULETILLAS } from '../src/shared/limpieza.ts'

/**
 * Las herramientas de edición del editor (sin la app): marcas en la regla y «Extraer» entre la entrada y la salida.
 * Uso: npm run prueba:edicion
 */

const ok = (cond, msj) => {
  if (!cond) throw new Error(msj)
}
const cerca = (a, b, msj) => ok(Math.abs(a - b) < 1e-3, `${msj}: ${a} en vez de ${b}`)

try {
  const base = normalizarTimeline(
    {
      version: 1,
      clips: [
        { id: 'a', fuente: 'principal', entrada: 0, salida: 4 },
        { id: 'b', fuente: 'principal', entrada: 10, salida: 14 }
      ],
      textos: [
        { id: 't-antes', inicio: 0.5, duracion: 1, texto: 'antes', posicion: 'abajo' },
        { id: 't-cruza', inicio: 2.5, duracion: 2, texto: 'cruza', posicion: 'abajo' },
        { id: 't-dentro', inicio: 3.2, duracion: 0.5, texto: 'dentro', posicion: 'abajo' },
        { id: 't-despues', inicio: 6, duracion: 1, texto: 'después', posicion: 'abajo' }
      ],
      sonidos: [
        { id: 's-cruza', inicio: 2.8, duracion: 1, archivo: 'media/a.wav', nombre: 'a' },
        { id: 's-despues', inicio: 5.5, duracion: 0.5, archivo: 'media/b.wav', nombre: 'b' }
      ]
    },
    20
  )

  // Marcas: una por punto, con nombre y color, y se quitan.
  let r = ponerMarcador(base, 3)
  const id = r.id
  ok(r.timeline.marcadores?.length === 1, 'No puso la marca.')
  ok(ponerMarcador(r.timeline, 3.001).timeline === r.timeline, 'Puso otra marca en el mismo cuadro.')
  let tl = cambiarMarcador(r.timeline, id, { nombre: '  Corte aquí ', color: 'rojo' })
  ok(tl.marcadores[0].nombre === 'Corte aquí' && tl.marcadores[0].color === 'rojo', `La marca no guardó nombre y color: ${JSON.stringify(tl.marcadores)}`)
  ok(!borrarMarcador(tl, id).marcadores, 'No se quitó la marca.')
  tl = ponerMarcador(ponerMarcador(tl, 6.5).timeline, 4).timeline
  ok(normalizarTimeline(tl, 20).marcadores.length === 3, 'Las marcas no sobreviven a guardar y abrir.')
  console.log('marcas: una por punto, con nombre y color, se quitan y se guardan ✓')

  // Extraer de 3 a 5 s: el video pasa de 8 a 6 s y lo de después se corre 2 s.
  const x = extraerRango(tl, 3, 5)
  cerca(duracionTimeline(x), 6, 'El video no quedó 2 s más corto')
  ok(x.clips.length === 2 && x.clips[0].salida === 3 && x.clips[1].entrada === 11, `Los clips no se cortaron bien: ${JSON.stringify(x.clips)}`)
  const texto = (i) => x.textos.find((t) => t.id === i)
  ok(texto('t-antes') && !texto('t-dentro'), 'El texto de dentro debía irse y el de antes quedarse.')
  cerca(texto('t-cruza').inicio, 2.5, 'El texto que cruza movió su inicio')
  cerca(texto('t-cruza').duracion, 0.5, 'El texto que cruza no se acortó hasta la entrada')
  cerca(texto('t-despues').inicio, 4, 'El texto de después no se corrió')
  ok(x.sonidos?.length === 1 && x.sonidos[0].id === 's-despues', `El sonido que cruza el tramo debía irse: ${JSON.stringify(x.sonidos)}`)
  cerca(x.sonidos[0].inicio, 3.5, 'El sonido de después no se corrió')
  ok(x.marcadores.map((m) => m.t).join(',') === '3,4.5', `Las marcas no quedaron bien: ${JSON.stringify(x.marcadores)}`)
  ok(extraerRango(tl, 0, 8) === tl, 'Extraer todo el video no debía dejarlo vacío.')
  ok(extraerRango(tl, 2, 2.05) === tl, 'Un tramo más corto que un clip mínimo no se extrae.')
  console.log('extraer: corta el video, acorta o quita lo que cruza y corre lo de después ✓')
  // El agente usa el color tipo Lumetri y transforma la imagen.
  const ops = validarOperaciones([
    { op: 'color', clip: 1, temperatura: 0.4, sombras: 0.3 },
    { op: 'zoom', clip: 2, escala: 0.6, giro: 10, recorteIzq: 0.1 }
  ])
  const hecho = aplicarOperaciones(base, ops, { duracionFuente: 20, medios: {} })
  const [c1, c2] = hecho.timeline.clips
  ok(c1.ajustes?.temperatura === 0.4 && c1.ajustes?.sombras === 0.3, `El agente no puso el color: ${JSON.stringify(c1.ajustes)} ${JSON.stringify(hecho.fallos)}`)
  ok(c2.ajustes?.escala === 0.6 && c2.ajustes?.giro === 10 && c2.ajustes?.recorteIzq === 0.1, `El agente no transformó el clip: ${JSON.stringify(c2.ajustes)}`)
  console.log('el agente corrige el color (temperatura, sombras) y transforma y recorta la imagen ✓')
  // Edición fina sobre tres clips de una fuente de 20 s: [0–4] [10–14] [16–18].
  const tres = normalizarTimeline({ version: 1, clips: [
    { id: 'a', fuente: 'principal', entrada: 0, salida: 4 },
    { id: 'b', fuente: 'principal', entrada: 10, salida: 14 },
    { id: 'c', fuente: 'principal', entrada: 16, salida: 18 }
  ], textos: [] }, 20)
  const dur = () => 20
  const rod = rodarCorte(tres, 0, 1.5, dur)
  ok(rod.clips[0].salida === 5.5 && rod.clips[1].entrada === 11.5 && duracionTimeline(rod) === duracionTimeline(tres), `Recorte rodado mal: ${JSON.stringify(rod.clips)}`)
  const rodTope = rodarCorte(tres, 0, -10, dur)
  cerca(rodTope.clips[0].salida, 0.1, 'El recorte rodado debía parar en el mínimo del clip')
  const des = deslizarContenido(tres, 'b', 2, dur)
  ok(des.clips[1].entrada === 12 && des.clips[1].salida === 16 && duracionTimeline(des) === duracionTimeline(tres), `Deslizar mal: ${JSON.stringify(des.clips[1])}`)
  ok(deslizarContenido(tres, 'b', 30, dur).clips[1].salida === 20, 'Deslizar debía parar al final de la fuente')
  const desp = desplazarClip(tres, 'b', 1, dur)
  ok(desp.clips[0].salida === 5 && desp.clips[1].entrada === 10 && desp.clips[1].salida === 14 && desp.clips[2].entrada === 17, `Desplazar mal: ${JSON.stringify(desp.clips)}`)
  cerca(tramos(desp)[1].inicio, 5, 'El clip desplazado debía empezar 1 s después')
  ok(desplazarClip(tres, 'a', 1, dur) === tres, 'El primer clip no se desplaza (no tiene vecino a la izquierda).')
  console.log('edición fina: recorte rodado, deslizar el contenido y desplazar el clip, sin cambiar la duración total ✓')

  // El mezclador: el fader de cada pista llega al monitor y al MP4 (timelineActiva).
  let mez = cambiarPista(normalizarTimeline({ ...base, sonidos: base.sonidos, voces: [{ id: 'v1', inicio: 1, duracion: 1, archivo: 'media/v.wav', texto: 'hola', volumen: 0.8 }] }, 20), 'voz', { volumen: 0.5 })
  mez = cambiarPista(mez, 'video', { volumen: 1.5 })
  mez = cambiarPista(mez, 'sonidos', { volumen: 9 })
  ok(mez.pistas.sonidos.volumen === 2, 'El fader no debía pasar de 200 %.')
  const act = timelineActiva(mez)
  cerca(act.voces[0].volumen, 0.4, 'El fader de la voz no se aplicó')
  cerca(act.clips[0].sonido.volumen, 1.5, 'El fader del video no se aplicó')
  ok(act.sonidos.every((x, i) => Math.abs(x.volumen - 2 * (base.sonidos[i].volumen ?? VOLUMEN_SONIDO)) < 1e-6), `El fader de sonidos no se aplicó: ${JSON.stringify(act.sonidos)}`)
  ok(!cambiarPista(mez, 'voz', { volumen: 1 }).pistas.voz, 'Un fader en 0 dB no se guarda.')
  ok(!normalizarTimeline({ ...mez, pistas: { texto: { volumen: 0.3 } } }, 20).pistas, 'Una pista sin audio no tiene fader.')
  console.log('mezclador: el fader de cada pista llega a voz, video y sonidos, hasta +6 dB ✓')
  // Solo un tramo (exportar entre la entrada y la salida).
  const tramo = soloTramo(tl, 2, 6)
  cerca(duracionTimeline(tramo), 4, 'El tramo debía durar 4 s')
  ok(!tramo.textos.some((t) => t.id === 't-antes') && tramo.textos.some((t) => t.id === 't-cruza'), `El tramo debía quitar el texto de antes y dejar el que cruza: ${JSON.stringify(tramo.textos.map((t) => t.id))}`)
  cerca(tramo.clips[0].entrada, 2, 'El tramo debía empezar en el segundo 2 del material')
  // Pistas de sonidos: hasta 3, la 1 no se guarda.
  let son = cambiarSonido(base, 's-cruza', { pista: 2 })
  ok(son.sonidos.find((x) => x.id === 's-cruza').pista === 2, 'El sonido no cambió de pista.')
  ok(cambiarSonido(son, 's-cruza', { pista: 7 }).sonidos.find((x) => x.id === 's-cruza').pista === 3, 'No hay más de 3 pistas de sonidos.')
  ok(cambiarSonido(son, 's-cruza', { pista: 1 }).sonidos.find((x) => x.id === 's-cruza').pista === undefined, 'La pista 1 no se guarda.')
  console.log('solo un tramo para exportar, y los sonidos en hasta 3 pistas ✓')
  // Rampa de velocidad: la duración, el cuadro de cada momento (y al revés) y dividir sin cambiar nada.
  let ra = normalizarTimeline({ version: 1, clips: [{ id: 'r', fuente: 'principal', entrada: 2, salida: 8 }], textos: [] }, 20)
  ra = ponerClaveRampa(ponerClaveRampa(ra, 'r', 2, 1), 'r', 8, 0.5)
  const cr = ra.clips[0]
  ok(cr.rampa.length === 2 && largoClip(cr) > 6 && largoClip(cr) < 12, `La rampa debía alargar el clip: ${largoClip(cr)}`)
  cerca(duracionTimeline(ra), largoClip(cr), 'La timeline debía durar lo del clip con rampa')
  for (const dt of [0, 1.3, 4.2, largoClip(cr)]) cerca(clipEnFuente(cr, fuenteEnClip(cr, dt)), dt, `Ida y vuelta en ${dt}`)
  const partida = dividir(ra, 3)
  cerca(duracionTimeline(partida), duracionTimeline(ra), 'Dividir un clip con rampa no debía cambiar la duración')
  ok(!quitarClaveRampa(ra, 'r').clips[0].rampa && duracionTimeline(quitarClaveRampa(ra, 'r')) === 6, 'Quitar la rampa debía devolver la velocidad fija')
  console.log(`rampa de velocidad: 6 s de fuente duran ${largoClip(cr).toFixed(2)} s, ida y vuelta exacta y se divide sin cambiar ✓`)
  // Anidar: dos clips seguidos pasan a ser uno (con los de dentro guardados) y se desanidan igual que estaban.
  ok(clipsSeguidos(tres, ['a', 'c']) === null && clipsSeguidos(tres, ['b', 'a']).join() === '0,1', 'Solo se anidan clips seguidos.')
  const an = anidarClips(tres, ['a', 'b'], 'm-anidado', 8)
  ok(an.timeline.clips.length === 2 && an.timeline.clips[0].anidado.length === 2 && an.timeline.clips[0].fuente === 'm-anidado', `El anidado no quedó bien: ${JSON.stringify(an.timeline.clips)}`)
  cerca(duracionTimeline(an.timeline), duracionTimeline(tres), 'Anidar no debía cambiar la duración')
  const sinAnidar = desanidarClip(an.timeline, an.id)
  ok(sinAnidar.clips.map((c) => `${c.entrada}-${c.salida}`).join() === tres.clips.map((c) => `${c.entrada}-${c.salida}`).join(), 'Desanidar debía devolver los clips de dentro')
  ok(normalizarTimeline(an.timeline, 20, { 'm-anidado': 8 }).clips[0].anidado.length === 2, 'Los clips de dentro sobreviven a guardar y abrir.')
  console.log('anidar: dos clips seguidos en uno, misma duración, y se desanidan como estaban ✓')
  // Sobrescribir: un tramo de 3 s entra en el segundo 2 tapando lo que hay, sin cambiar la duración.
  const so = sobrescribirClip(tres, { fuente: 'mx', entrada: 0, salida: 3 }, 2)
  cerca(duracionTimeline(so.timeline), duracionTimeline(tres), 'Sobrescribir no debía cambiar la duración')
  const ts = tramos(so.timeline)
  ok(ts.some((x) => x.clip.id === so.id && Math.abs(x.inicio - 2) < 1e-6 && Math.abs(x.fin - 5) < 1e-6), `El clip nuevo debía ir de 2 a 5: ${JSON.stringify(ts.map((x) => [x.clip.fuente, x.inicio, x.fin]))}`)
  ok(ts[0].clip.salida === 2 && ts[2].clip.entrada === 11, `Lo de antes y después debía quedar recortado: ${JSON.stringify(so.timeline.clips)}`)
  const alFinal = sobrescribirClip(tres, { fuente: 'mx', entrada: 0, salida: 4 }, 8)
  cerca(duracionTimeline(alFinal.timeline), 12, 'Sobrescribir pasado el final debía alargar la timeline')
  // Separar el audio: el clip queda mudo y su sonido queda suelto en el mismo sitio.
  const sep = separarAudio(tres, 'b', 'media/audio-b.wav', 'Sonido', 4)
  const sb = sep.sonidos.find((x) => x.archivo === 'media/audio-b.wav')
  ok(sep.clips[1].mudo === true && sb && sb.inicio === 4 && sb.duracion === 4 && sb.largo === 4, `Separar el audio no quedó bien: ${JSON.stringify(sb)} ${sep.clips[1].mudo}`)
  // Multicámara con un solo sonido: las tomas mudas y un sonido de principio a fin.
  const mc = { ...tres, multicam: { angulos: [{ fuente: 'principal', desfase: 0 }, { fuente: 'mb', desfase: 1 }] } }
  const uno = sonidoUnicoMulticam(mc, 'media/toma1.wav', 'Toma 1', 10)
  ok(uno.clips.every((c) => c.mudo) && uno.sonidos.some((x) => x.archivo === 'media/toma1.wav' && x.inicio === 0 && x.duracion === 10), 'La multicámara no quedó con un solo sonido.')
  console.log('sobrescribir, separar el audio y la multicámara con un solo sonido ✓')
  // Subtítulos editables desde la voz: frases cortas, en su segundo, sin pisarse, con el estilo elegido.
  const palabrasDe = (frase, desde, paso) => frase.split(' ').map((text, k) => ({ text, start: desde + k * paso, end: desde + k * paso + paso * 0.9 }))
  const transcript = [
    { id: 's1', start: 0.5, end: 4, text: '', words: palabrasDe('Hola a todos hoy les cuento algo muy importante.', 0.5, 0.4) },
    { id: 's2', start: 5, end: 7, text: '', words: palabrasDe('Empecemos ya', 5, 0.5) }
  ]
  const conSubs = subtitulosDesdeVoz(normalizarTimeline({ version: 1, clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 10 }], textos: [{ id: 'mio', inicio: 8, duracion: 1, texto: 'mío', posicion: 'arriba' }] }, 20), transcript, ESTILOS_SUBTITULO.find((x) => x.id === 'redes').estilo)
  const subs = conSubs.textos.filter((x) => x.subtitulo)
  ok(subs.length === 3 && subs[0].texto === 'Hola a todos hoy les cuento' && subs[1].texto === 'algo muy importante.' && subs[2].texto === 'Empecemos ya', `Los subtítulos no se partieron bien: ${JSON.stringify(subs.map((x) => x.texto))}`)
  cerca(subs[0].inicio, 0.5, 'El primer subtítulo debía empezar con la primera palabra')
  ok(subs.every((x, k) => k === 0 || x.inicio >= subs[k - 1].inicio + subs[k - 1].duracion - 1e-6), 'Los subtítulos no debían pisarse.')
  ok(subs.every((x) => x.fuente === 'gruesa' && x.animacion === 'palabras'), 'Los subtítulos debían tener el estilo elegido.')
  ok(conSubs.textos.some((x) => x.id === 'mio') && normalizarTimeline(conSubs, 20).textos.filter((x) => x.subtitulo).length === 3, 'Los otros textos se quedan y los subtítulos sobreviven a guardar.')
  ok(quitarSubtitulos(conSubs).textos.length === 1, 'Quitar los subtítulos debía dejar solo el texto propio.')
  console.log('subtítulos editables desde la voz: frases cortas, en su segundo, sin pisarse y con su estilo ✓')
  // Limpieza automática: un silencio largo, un «eh» y un «que que».
  const w = (text, start, end) => ({ text, start, end })
  const tr2 = [{ id: 's', start: 0, end: 10, text: '', words: [w('Hola', 0, 0.4), w('eh,', 0.5, 0.8), w('les', 0.9, 1.1), w('cuento', 1.2, 1.6), w('que', 1.7, 1.9), w('que', 2.0, 2.2), w('hoy', 2.3, 2.5), w('vamos', 4.5, 4.9), w('bien.', 5.0, 5.4)] }]
  const limpio0 = normalizarTimeline({ version: 1, clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 6 }], textos: [{ id: 'tx', inicio: 4.6, duracion: 0.8, texto: 'vamos', posicion: 'abajo' }] }, 20)
  const halla = buscarLimpieza(limpio0, tr2, { silencios: true, minimo: 0.7, muletillas: true, lista: MULETILLAS, repeticiones: true })
  ok(halla.silencios >= 1 && halla.muletillas === 1 && halla.repeticiones === 1, `La limpieza no encontró lo esperado: ${JSON.stringify(halla)}`)
  const limpio = aplicarLimpieza(limpio0, halla.tramos)
  cerca(duracionTimeline(limpio), 6 - halla.segundos, 'La limpieza debía acortar justo lo encontrado')
  ok(limpio.textos[0] && limpio.textos[0].inicio < 4.6 - 1.5, `El texto de «vamos» debía correrse con el video: ${JSON.stringify(limpio.textos)}`)
  ok(buscarLimpieza(limpio0, tr2, { silencios: false, minimo: 0.7, muletillas: false, lista: [], repeticiones: false }).tramos.length === 0, 'Sin nada marcado no se quita nada.')
  console.log(`limpieza automática: ${halla.silencios} silencio, 1 muletilla y 1 repetición; ${halla.segundos.toFixed(2)} s menos y el texto se corre con el video ✓`)
  console.log('prueba edición: ok')
} catch (e) {
  console.error(`prueba edición: error · ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
}
