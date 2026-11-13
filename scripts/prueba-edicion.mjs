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
  VOLUMEN_SONIDO
} from '../src/shared/timeline.ts'
import { aplicarOperaciones, validarOperaciones } from '../src/shared/chat.ts'

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
  console.log('prueba edición: ok')
} catch (e) {
  console.error(`prueba edición: error · ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
}
