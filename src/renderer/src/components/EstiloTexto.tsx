import { cambiarTexto, LIMITE_TRAZO, type AlineacionTexto, type TextoTL, type Timeline } from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { reanclarTexto, rotuloEnMonitor } from '../rotulos'

/**
 * El estilo fino de un rótulo en el inspector: alineación, mayúsculas, espaciado, opacidad, giro y, sin caja, su
 * contorno y su sombra. Todo se ve igual en el monitor y en el MP4.
 */
export function EstiloTexto({
  texto: t,
  timeline,
  historial,
  deslizar,
  empezarAjuste
}: {
  texto: TextoTL
  timeline: Timeline
  historial: Historial
  deslizar: (nueva: Timeline) => void
  empezarAjuste: () => void
}) {
  const cambiar = (cambio: Partial<TextoTL>) => cambiarTexto(timeline, t.id, cambio)
  /** Alinear (o girar) necesita un punto de anclaje: el texto se queda donde se ve y pasa a tener sitio propio. */
  const alinear = (a: AlineacionTexto | undefined) => {
    const donde = reanclarTexto(t, a, rotuloEnMonitor(t.id))
    if (!donde) return
    historial.aplicar(cambiar({ ...donde, alineacion: a }))
  }
  const libre = typeof t.x === 'number'
  const deslizador = (nombre: string, valor: number, min: number, max: number, paso: number, formato: string, alCambiar: (v: number) => Timeline, titulo?: string) => (
    <label className="tl-ajuste en-linea" title={titulo}>
      <span>
        {nombre} <b>{formato}</b>
      </span>
      <input type="range" min={min} max={max} step={paso} value={valor} onPointerDown={empezarAjuste} onFocus={empezarAjuste} onChange={(e) => deslizar(alCambiar(Number(e.target.value)))} />
    </label>
  )
  const trazoElegido = t.contorno !== undefined || t.sombra !== undefined
  return (
    <>
      <div className="ed-campo" role="group" aria-label="Alineación">
        <span>Alinear</span>
        <div className="ed-opciones">
          {(
            [
              [undefined, 'Centro', 'Las líneas centradas'],
              ['izquierda', 'Izquierda', 'Las líneas a la izquierda: el texto se ancla por su borde izquierdo'],
              ['derecha', 'Derecha', 'Las líneas a la derecha: el texto se ancla por su borde derecho']
            ] as const
          ).map(([a, nombre, titulo]) => (
            <button key={nombre} className={`chip ${t.alineacion === a ? 'is-on' : ''}`} title={titulo} aria-pressed={t.alineacion === a} onClick={() => t.alineacion !== a && alinear(a)}>
              {nombre}
            </button>
          ))}
        </div>
      </div>
      <label className="tl-check" title="Todo en mayúsculas (lo escrito no cambia)">
        <input type="checkbox" checked={t.mayusculas === true} onChange={(e) => historial.aplicar(cambiar({ mayusculas: e.target.checked }))} />
        <span>MAYÚSCULAS</span>
      </label>
      {deslizador('Espaciado', t.espaciado ?? 0, -0.1, 0.5, 0.01, `${Math.round((t.espaciado ?? 0) * 100)}`, (v) => cambiar({ espaciado: v }), 'El espacio entre letras')}
      {deslizador('Opacidad', t.opacidad ?? 1, 0, 1, 0.01, `${Math.round((t.opacidad ?? 1) * 100)} %`, (v) => cambiar({ opacidad: v }))}
      {deslizador('Giro', t.giro ?? 0, -180, 180, 1, `${Math.round(t.giro ?? 0)}°`, (v) => {
        // Sin sitio propio, primero lo toma (donde se ve): gira sobre él.
        const donde = libre ? {} : (reanclarTexto(t, undefined, rotuloEnMonitor(t.id)) ?? {})
        return cambiar({ ...donde, giro: v })
      }, 'También se gira arrastrando el tirador redondo de arriba en el monitor')}
      {t.sinCaja && (
        <>
          <span className="ed-seccion">Contorno y sombra</span>
          {!trazoElegido && <span className="tl-dim">Ahora lleva el halo oscuro de siempre. Mueve el contorno o la sombra para elegirlos tú.</span>}
          <div className="ed-fila-color">
            {deslizador('Contorno', t.contorno ?? 0, 0, LIMITE_TRAZO, 0.005, t.contorno ? `${Math.round(t.contorno * 100)}` : 'no', (v) => cambiar({ contorno: v, ...(t.sombra === undefined ? { sombra: 0 } : {}) }), 'El grosor del borde de la letra')}
            <input
              type="color"
              className="tl-color"
              title="Color del contorno"
              value={t.colorContorno ?? '#000000'}
              onPointerDown={empezarAjuste}
              onChange={(e) => deslizar(cambiar({ colorContorno: e.target.value, ...(t.contorno === undefined ? { contorno: 0.06, sombra: t.sombra ?? 0 } : {}) }))}
            />
          </div>
          <div className="ed-fila-color">
            {deslizador('Sombra', t.sombra ?? 0, 0, LIMITE_TRAZO, 0.005, t.sombra ? `${Math.round(t.sombra * 100)}` : 'no', (v) => cambiar({ sombra: v, ...(t.contorno === undefined ? { contorno: 0 } : {}) }), 'Lo que se separa la sombra (abajo a la derecha)')}
            <input
              type="color"
              className="tl-color"
              title="Color de la sombra"
              value={t.colorSombra ?? '#000000'}
              onPointerDown={empezarAjuste}
              onChange={(e) => deslizar(cambiar({ colorSombra: e.target.value, ...(t.sombra === undefined ? { sombra: 0.06, contorno: t.contorno ?? 0 } : {}) }))}
            />
          </div>
          {trazoElegido && (
            <button className="btn small ghost" onClick={() => historial.aplicar(cambiar({ contorno: undefined, sombra: undefined, colorContorno: undefined, colorSombra: undefined }))}>
              Volver al halo de siempre
            </button>
          )}
        </>
      )}
    </>
  )
}
