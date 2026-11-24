import { cadenaSonido, type SonidoClip } from '../../shared/timeline'

/**
 * El sonido del monitor por el contexto de audio: cada `<video>`/`<audio>` se conecta una sola vez (no se puede dos) y
 * de ahí sale a los altavoces y a un analizador (los medidores del mezclador). Al `<video>` de un clip se le puede poner
 * su cadena: mejorar voz, ecualizador de 3 bandas y compresor, con las mismas fórmulas que el MP4 (ver cadenaSonido).
 */

let contexto: AudioContext | null = null

interface Grafo {
  fuente: MediaElementAudioSourceNode
  salida: GainNode
  analizador: AnalyserNode
  cadena?: Cadena
}
interface Cadena {
  paso: BiquadFilterNode
  comp1: DynamicsCompressorNode
  ganancia1: GainNode
  presencia: BiquadFilterNode
  graves: BiquadFilterNode
  medios: BiquadFilterNode
  agudos: BiquadFilterNode
  comp2: DynamicsCompressorNode
  ganancia2: GainNode
}

const grafos = new WeakMap<HTMLMediaElement, Grafo>()

/**
 * El bus del medidor de sonoridad (LUFS, la norma EBU R128 / ITU-R BS.1770): todo lo que suena entra aquí, pasa por
 * el filtro de ponderación K (un realce de agudos y un corte de graves) y se mide canal por canal.
 */
export interface BusLufs {
  izq: AnalyserNode
  der: AnalyserNode
}
let busLufs: (BusLufs & { entrada: GainNode }) | null = null
function busDe(ctx: BaseAudioContext): BusLufs & { entrada: GainNode } {
  if (busLufs) return busLufs
  const entrada = ctx.createGain()
  entrada.channelCount = 2
  entrada.channelCountMode = 'explicit'
  entrada.channelInterpretation = 'speakers'
  const realce = ctx.createBiquadFilter()
  realce.type = 'highshelf'
  realce.frequency.value = 1681.97
  realce.gain.value = 4
  const corte = ctx.createBiquadFilter()
  corte.type = 'highpass'
  corte.frequency.value = 38.13
  corte.Q.value = 0.5
  const separar = ctx.createChannelSplitter(2)
  const izq = ctx.createAnalyser()
  const der = ctx.createAnalyser()
  izq.fftSize = der.fftSize = 2048
  entrada.connect(realce)
  realce.connect(corte)
  corte.connect(separar)
  separar.connect(izq, 0)
  separar.connect(der, 1)
  busLufs = { entrada, izq, der }
  return busLufs
}
/** Los analizadores del medidor de sonoridad (null hasta que suene algo por el contexto de audio). */
export function analizadoresLufs(): BusLufs | null {
  return busLufs
}

/**
 * El grafo de un elemento (lo crea la primera vez). Solo con el contexto en marcha: conectado a uno pausado, el elemento
 * se quedaría mudo. Sin marcha, lo pide y devuelve null (se vuelve a intentar).
 */
export function grafoDe(el: HTMLMediaElement): Grafo | null {
  const hecho = grafos.get(el)
  if (hecho) return hecho
  try {
    contexto ??= new AudioContext()
    if (contexto.state !== 'running') {
      void contexto.resume()
      return null
    }
    const fuente = contexto.createMediaElementSource(el)
    const salida = contexto.createGain()
    const analizador = contexto.createAnalyser()
    analizador.fftSize = 1024
    fuente.connect(salida)
    salida.connect(contexto.destination)
    salida.connect(analizador)
    salida.connect(busDe(contexto).entrada)
    const g: Grafo = { fuente, salida, analizador }
    grafos.set(el, g)
    return g
  } catch {
    return null
  }
}

/** ¿Este sonido necesita la cadena (mejorar voz, ecualizador o compresor)? */
export function necesitaCadena(s: Required<SonidoClip>): boolean {
  return s.realce > 0.005 || Math.abs(s.graves) > 0.05 || Math.abs(s.medios) > 0.05 || Math.abs(s.agudos) > 0.05 || s.comprimir > 0.005
}

/**
 * Pone en el elemento la cadena de este sonido (o la deja neutra). Devuelve false si el contexto aún no está en marcha
 * (hay que volver a llamarla, por ejemplo al reproducir).
 */
export function aplicarCadena(el: HTMLMediaElement, s: Required<SonidoClip>): boolean {
  const g = grafos.get(el) ?? (necesitaCadena(s) ? grafoDe(el) : null)
  if (!g) return !necesitaCadena(s)
  const ctx = g.fuente.context
  if (!g.cadena) {
    if (!necesitaCadena(s)) return true
    const c: Cadena = {
      paso: ctx.createBiquadFilter(),
      comp1: ctx.createDynamicsCompressor(),
      ganancia1: ctx.createGain(),
      presencia: ctx.createBiquadFilter(),
      graves: ctx.createBiquadFilter(),
      medios: ctx.createBiquadFilter(),
      agudos: ctx.createBiquadFilter(),
      comp2: ctx.createDynamicsCompressor(),
      ganancia2: ctx.createGain()
    }
    c.paso.type = 'highpass'
    // Como el paso alto de FFmpeg (Q 0,707: sin pico).
    c.paso.Q.value = Math.SQRT1_2
    c.presencia.type = 'peaking'
    c.graves.type = 'lowshelf'
    c.medios.type = 'peaking'
    c.agudos.type = 'highshelf'
    g.fuente.disconnect()
    g.fuente.connect(c.paso)
    c.paso.connect(c.comp1).connect(c.ganancia1).connect(c.presencia).connect(c.graves).connect(c.medios).connect(c.agudos).connect(c.comp2).connect(c.ganancia2).connect(g.salida)
    g.cadena = c
  }
  const c = g.cadena
  const p = cadenaSonido(s)
  const t = ctx.currentTime
  // Sin un paso, el nodo queda neutro (paso alto en 10 Hz, compresor sin compresión, bandas a 0 dB).
  c.paso.frequency.setValueAtTime(p.realce ? p.realce.pasoAlto : 10, t)
  ponerCompresor(c.comp1, c.ganancia1, p.realce ? p.realce.compresor : null, t)
  c.presencia.frequency.setValueAtTime(3000, t)
  c.presencia.Q.setValueAtTime(p.realce ? p.realce.presenciaQ : 1, t)
  c.presencia.gain.setValueAtTime(p.realce ? p.realce.presencia : 0, t)
  c.graves.frequency.setValueAtTime(p.eq.fGraves, t)
  c.graves.gain.setValueAtTime(p.eq.graves, t)
  c.medios.frequency.setValueAtTime(p.eq.fMedios, t)
  c.medios.Q.setValueAtTime(p.eq.qMedios, t)
  c.medios.gain.setValueAtTime(p.eq.medios, t)
  c.agudos.frequency.setValueAtTime(p.eq.fAgudos, t)
  c.agudos.gain.setValueAtTime(p.eq.agudos, t)
  ponerCompresor(c.comp2, c.ganancia2, p.compresor, t)
  return true
}

function ponerCompresor(
  comp: DynamicsCompressorNode,
  ganancia: GainNode,
  x: { umbral: number; razon: number; ataque: number; suelta: number; rodilla: number; maquillaje: number } | null,
  t: number
): void {
  comp.threshold.setValueAtTime(x ? x.umbral : 0, t)
  comp.ratio.setValueAtTime(x ? x.razon : 1, t)
  comp.attack.setValueAtTime(x ? x.ataque : 0.003, t)
  comp.release.setValueAtTime(x ? x.suelta : 0.25, t)
  comp.knee.setValueAtTime(x ? x.rodilla : 0, t)
  // El compresor del navegador sube solo el volumen (su «maquillaje» automático: 0,6 de lo que baja a 0 dB); el de FFmpeg
  // no. Se quita aquí para que suene igual que el MP4, y se pone el de la cadena.
  const automatico = x ? 0.6 * Math.max(0, -x.umbral - x.rodilla / 2) * (1 - 1 / x.razon) : 0
  ganancia.gain.setValueAtTime(x ? x.maquillaje * Math.pow(10, -automatico / 20) : 1, t)
}
