import { cambiarCapa, cambiarTextoEn, estadoCapa, ponerClaveCapa, textoEn, type Timeline } from '../../shared/timeline'
import { cajaEnCuadro, type Caja } from './guias'
import { reanclarTexto, rotuloEnMonitor } from './rotulos'

/**
 * Varias capas y textos a la vez (elegidos con Ctrl + clic): moverlos juntos, alinearlos y repartirlos, como en Canva o
 * Premiere. Todo en fracción del cuadro; lo bloqueado no se mueve.
 */

export type Pieza = { tipo: 'capa' | 'texto'; id: string }

/** Mueve cada pieza lo suyo (`dx`, `dy`): una capa con fotogramas clave, en el cabezal; un texto sin sitio propio lo toma. */
export function moverPiezas(tl: Timeline, piezas: (Pieza & { dx: number; dy: number })[], tiempo: number, medios: Record<string, number>): Timeline {
  let nueva = tl
  for (const p of piezas) {
    if (Math.abs(p.dx) < 1e-6 && Math.abs(p.dy) < 1e-6) continue
    if (p.tipo === 'capa') {
      const c = nueva.capas?.find((x) => x.id === p.id)
      if (!c || c.bloqueado) continue
      if (c.sigue) {
        nueva = cambiarCapa(nueva, c.id, { sigue: { ...c.sigue, dx: c.sigue.dx + p.dx, dy: c.sigue.dy + p.dy } }, medios)
        continue
      }
      // Sin fotogramas clave de sitio: se corre entera (su sitio y, si se mueve, también dónde termina).
      if (!c.claves?.x && !c.claves?.y) {
        nueva = cambiarCapa(
          nueva,
          c.id,
          { x: Math.min(1, Math.max(0, c.x + p.dx)), y: Math.min(1, Math.max(0, c.y + p.dy)), ...(c.fin ? { fin: { ...c.fin, x: c.fin.x + p.dx, y: c.fin.y + p.dy } } : {}) },
          medios
        )
        continue
      }
      // Con claves: la de cada eje, en el cabezal (lo que no tiene claves, fijo).
      const dt = Math.min(c.duracion, Math.max(0, tiempo - c.inicio))
      const ahora = estadoCapa(c, dt, false)
      for (const [eje, v, d] of [['x', ahora.x + p.dx, p.dx], ['y', ahora.y + p.dy, p.dy]] as const) {
        if (Math.abs(d) < 1e-6) continue
        nueva = c.claves?.[eje] ? ponerClaveCapa(nueva, c.id, eje, dt, v, medios) : cambiarCapa(nueva, c.id, { [eje]: Math.min(1, Math.max(0, c[eje] + d)) }, medios)
      }
    } else {
      const t = nueva.textos.find((x) => x.id === p.id)
      if (!t || t.bloqueado) continue
      const dt = Math.min(t.duracion, Math.max(0, tiempo - t.inicio))
      const base = reanclarTexto(textoEn(t, dt), t.alineacion, rotuloEnMonitor(t.id))
      if (!base) continue
      nueva = cambiarTextoEn(nueva, t.id, { x: Math.min(1, Math.max(0, base.x + p.dx)), y: Math.min(1, Math.max(0, base.y + p.dy)) }, dt)
    }
  }
  return nueva
}

/** La caja que ocupa una pieza en el monitor (lo que se ve de ella), si se ve. */
export function cajaDePieza(p: Pieza): Caja | null {
  const cuadro = document.querySelector('.monitor-cuadro')?.getBoundingClientRect()
  if (!cuadro?.width) return null
  const el =
    p.tipo === 'texto'
      ? rotuloEnMonitor(p.id)
      : ((document.querySelector(`.monitor-capa[data-capa="${CSS.escape(p.id)}"] > .monitor-capa-marco`) ?? document.querySelector(`.monitor-capa[data-capa="${CSS.escape(p.id)}"]`)) as HTMLElement | null)
  const r = el?.getBoundingClientRect()
  return r && r.width ? cajaEnCuadro(r, cuadro) : null
}

export type Alineacion = 'izquierda' | 'centro' | 'derecha' | 'arriba' | 'medio' | 'abajo' | 'repartir-h' | 'repartir-v'

/**
 * Cuánto se mueve cada pieza para alinearla: una sola, con el cuadro; varias, entre ellas (con la caja que las abarca).
 * «repartir» deja el mismo espacio entre cada una (de tres en adelante).
 */
export function alinearPiezas(cajas: { pieza: Pieza; caja: Caja }[], como: Alineacion): (Pieza & { dx: number; dy: number })[] {
  if (!cajas.length) return []
  const una = cajas.length === 1
  const todo: Caja = una
    ? { izq: 0, der: 1, arriba: 0, abajo: 1 }
    : { izq: Math.min(...cajas.map((c) => c.caja.izq)), der: Math.max(...cajas.map((c) => c.caja.der)), arriba: Math.min(...cajas.map((c) => c.caja.arriba)), abajo: Math.max(...cajas.map((c) => c.caja.abajo)) }
  if (como === 'repartir-h' || como === 'repartir-v') {
    if (cajas.length < 3) return []
    const h = como === 'repartir-h'
    const orden = [...cajas].sort((a, b) => (h ? a.caja.izq - b.caja.izq : a.caja.arriba - b.caja.arriba))
    const tam = (c: Caja) => (h ? c.der - c.izq : c.abajo - c.arriba)
    const libre = (h ? todo.der - todo.izq : todo.abajo - todo.arriba) - orden.reduce((s, c) => s + tam(c.caja), 0)
    const hueco = libre / (orden.length - 1)
    let pos = h ? todo.izq : todo.arriba
    return orden.map((c) => {
      const desde = h ? c.caja.izq : c.caja.arriba
      const d = pos - desde
      pos += tam(c.caja) + hueco
      return { ...c.pieza, dx: h ? d : 0, dy: h ? 0 : d }
    })
  }
  return cajas.map(({ pieza, caja }) => {
    const dx = como === 'izquierda' ? todo.izq - caja.izq : como === 'derecha' ? todo.der - caja.der : como === 'centro' ? (todo.izq + todo.der) / 2 - (caja.izq + caja.der) / 2 : 0
    const dy = como === 'arriba' ? todo.arriba - caja.arriba : como === 'abajo' ? todo.abajo - caja.abajo : como === 'medio' ? (todo.arriba + todo.abajo) / 2 - (caja.arriba + caja.abajo) / 2 : 0
    return { ...pieza, dx, dy }
  })
}
