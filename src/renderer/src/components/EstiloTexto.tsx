import { ColorBoton, coloresDelProyecto } from './ControlesTexto'
import {
  COLOR_BRILLO,
  LIMITE_BRILLO,
  cambiarTexto,
  cambiarTextoEn,
  CURVAS_CLAVE,
  curvaClaveTexto,
  LIMITE_TRAZO,
  ponerClaveTexto,
  quitarClaveTexto,
  textoEn,
  type AlineacionTexto,
  type CurvaClave,
  type ParametroClaveTexto,
  type TextoTL,
  type Timeline
} from '../../../shared/timeline'
import type { Historial } from '../hooks/timeline'
import { reanclarTexto, rotuloEnMonitor } from '../rotulos'

/**
 * Los fotogramas clave de un texto: su sitio, su tamaño, su giro y su opacidad. ◆ pone (o quita) la clave en el cabezal
 * con lo que vale ahí; luego, en otro momento, se cambia (arrastrándolo en el monitor o aquí) y se mueve solo.
 */
function ClavesDelTexto({
  t,
  ahora,
  dt,
  timeline,
  historial,
  onBuscar
}: {
  t: TextoTL
  ahora: TextoTL
  dt: number
  timeline: Timeline
  historial: Historial
  onBuscar: (t: number) => void
}) {
  const filas: { nombre: string; params: ParametroClaveTexto[]; valor: () => Partial<Record<ParametroClaveTexto, number>> }[] = [
    {
      nombre: 'Sitio',
      params: ['x', 'y'],
      valor: () => {
        // Donde se ve ahora (sin sitio propio, el centro de su caja en el monitor).
        const d = typeof ahora.x === 'number' && typeof ahora.y === 'number' ? { x: ahora.x, y: ahora.y } : (reanclarTexto(ahora, ahora.alineacion, rotuloEnMonitor(t.id)) ?? { x: 0.5, y: 0.5 })
        return { x: d.x, y: d.y }
      }
    },
    { nombre: 'Tamaño', params: ['tamano'], valor: () => ({ tamano: ahora.tamano ?? 1 }) },
    { nombre: 'Giro', params: ['giro'], valor: () => ({ giro: ahora.giro ?? 0 }) },
    { nombre: 'Opacidad', params: ['opacidad'], valor: () => ({ opacidad: ahora.opacidad ?? 1 }) }
  ]
  const cerca = (f: number) => Math.abs(f - dt) < 0.034
  return (
    <>
      <span className="ed-seccion">Fotogramas clave</span>
      <p className="tl-dim">Toca ◆ para animarlo: pon el cabezal en otro momento del texto, cámbialo (en el monitor o aquí) y se mueve solo.</p>
      {filas.map((fila) => {
        const lista = t.claves?.[fila.params[0]] ?? []
        const aqui = lista.find((x) => cerca(x.f))
        const anterior = [...lista].reverse().find((x) => x.f < dt - 0.02)
        const siguiente = lista.find((x) => x.f > dt + 0.02)
        return (
          <div key={fila.nombre} className="ed-fila-clave">
            <span className="tl-ajuste-nombre">{fila.nombre}</span>
            <span className="ed-claves">
              {lista.length > 0 && (
                <button className="ed-clave-ir" disabled={!anterior} title="Ir a la clave anterior" aria-label={`Clave anterior de ${fila.nombre}`} onClick={() => anterior && onBuscar(t.inicio + anterior.f)}>
                  ‹
                </button>
              )}
              <button
                className={`ed-clave ${aqui ? 'is-on' : lista.length ? 'is-animado' : ''}`}
                aria-pressed={Boolean(aqui)}
                title={aqui ? `Quitar este fotograma clave de ${fila.nombre.toLowerCase()}` : `Poner un fotograma clave de ${fila.nombre.toLowerCase()} en el cabezal`}
                aria-label={aqui ? `Quitar la clave de ${fila.nombre}` : `Poner una clave de ${fila.nombre}`}
                onClick={() => {
                  let nueva = timeline
                  if (aqui) for (const p of fila.params) nueva = quitarClaveTexto(nueva, t.id, p, aqui.f)
                  else {
                    const v = fila.valor()
                    for (const p of fila.params) nueva = ponerClaveTexto(nueva, t.id, p, dt, v[p] ?? 0)
                  }
                  historial.aplicar(nueva)
                }}
              >
                ◆
              </button>
              {lista.length > 0 && (
                <button className="ed-clave-ir" disabled={!siguiente} title="Ir a la clave siguiente" aria-label={`Clave siguiente de ${fila.nombre}`} onClick={() => siguiente && onBuscar(t.inicio + siguiente.f)}>
                  ›
                </button>
              )}
              {aqui && siguiente && (
                <select
                  className="ed-curva"
                  value={aqui.curva ?? 'suave'}
                  title={`Cómo va ${fila.nombre.toLowerCase()} de esta clave a la siguiente`}
                  aria-label={`Curva de ${fila.nombre} hasta la clave siguiente`}
                  onChange={(e) => {
                    let nueva = timeline
                    for (const p of fila.params) nueva = curvaClaveTexto(nueva, t.id, p, aqui.f, e.target.value as CurvaClave)
                    historial.aplicar(nueva)
                  }}
                >
                  {CURVAS_CLAVE.map((x) => (
                    <option key={x.id} value={x.id} title={x.para}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </div>
        )
      })}
    </>
  )
}

/**
 * El estilo fino de un rótulo en el inspector: alineación, mayúsculas, espaciado, opacidad, giro y, sin caja, su
 * contorno y su sombra. Todo se ve igual en el monitor y en el MP4.
 */
export function EstiloTexto({
  texto: t,
  timeline,
  historial,
  deslizar,
  empezarAjuste,
  tiempo,
  onBuscar
}: {
  texto: TextoTL
  timeline: Timeline
  historial: Historial
  deslizar: (nueva: Timeline) => void
  empezarAjuste: () => void
  /** El cabezal (segundo de la timeline): lo que tiene fotogramas clave se ve y se cambia ahí. */
  tiempo: number
  onBuscar: (t: number) => void
}) {
  const dt = Math.min(t.duracion, Math.max(0, tiempo - t.inicio))
  /** El texto como está en el cabezal (con sus claves). */
  const ahora = textoEn(t, dt)
  const cambiar = (cambio: Partial<TextoTL>) => cambiarTexto(timeline, t.id, cambio)
  /** Lo que puede tener claves (sitio, tamaño, giro, opacidad) se cambia en la clave del cabezal si la tiene. */
  const cambiarAhora = (cambio: Partial<TextoTL>) => cambiarTextoEn(timeline, t.id, cambio, dt)
  /** Alinear (o girar) necesita un punto de anclaje: el texto se queda donde se ve y pasa a tener sitio propio. */
  const alinear = (a: AlineacionTexto | undefined) => {
    const donde = reanclarTexto({ ...ahora, alineacion: t.alineacion }, a, rotuloEnMonitor(t.id))
    if (!donde) return
    historial.aplicar(cambiarTextoEn(timeline, t.id, { ...donde, alineacion: a }, dt))
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
      {deslizador('Opacidad', ahora.opacidad ?? 1, 0, 1, 0.01, `${Math.round((ahora.opacidad ?? 1) * 100)} %`, (v) => cambiarAhora({ opacidad: v }))}
      {deslizador('Giro', ahora.giro ?? 0, -180, 180, 1, `${Math.round(ahora.giro ?? 0)}°`, (v) => {
        // Sin sitio propio, primero lo toma (donde se ve): gira sobre él.
        const donde = libre ? {} : (reanclarTexto(ahora, undefined, rotuloEnMonitor(t.id)) ?? {})
        return cambiarAhora({ ...donde, giro: v })
      }, 'También se gira arrastrando el tirador redondo de arriba en el monitor')}
      <ClavesDelTexto t={t} ahora={ahora} dt={dt} timeline={timeline} historial={historial} onBuscar={onBuscar} />
      {t.sinCaja && (
        <>
          <span className="ed-seccion">Contorno, sombra y brillo</span>
          {!trazoElegido && <span className="tl-dim">Ahora lleva el halo oscuro de siempre. Mueve el contorno o la sombra para elegirlos tú.</span>}
          <div className="ed-fila-color">
            {deslizador('Contorno', t.contorno ?? 0, 0, LIMITE_TRAZO, 0.005, t.contorno ? `${Math.round(t.contorno * 100)}` : 'no', (v) => cambiar({ contorno: v, ...(t.sombra === undefined ? { sombra: 0 } : {}) }), 'El grosor del borde de la letra')}
            <ColorBoton
              titulo="Color del contorno"
              valor={t.colorContorno ?? '#000000'}
              colores={coloresDelProyecto(timeline)}
              onCambio={(c) => historial.aplicar(cambiar({ colorContorno: c, ...(t.contorno === undefined ? { contorno: 0.06, sombra: t.sombra ?? 0 } : {}) }))}
            />
          </div>
          <div className="ed-fila-color">
            {deslizador('Sombra', t.sombra ?? 0, 0, LIMITE_TRAZO, 0.005, t.sombra ? `${Math.round(t.sombra * 100)}` : 'no', (v) => cambiar({ sombra: v, ...(t.contorno === undefined ? { contorno: 0 } : {}) }), 'Lo que se separa la sombra (abajo a la derecha)')}
            <ColorBoton
              titulo="Color de la sombra"
              valor={t.colorSombra ?? '#000000'}
              colores={coloresDelProyecto(timeline)}
              onCambio={(c) => historial.aplicar(cambiar({ colorSombra: c, ...(t.sombra === undefined ? { sombra: 0.06, contorno: t.contorno ?? 0 } : {}) }))}
            />
          </div>
          <div className="ed-fila-color">
            {deslizador('Brillo', t.brillo ?? 0, 0, LIMITE_BRILLO, 0.01, t.brillo ? `${Math.round(t.brillo * 100)}` : 'no', (v) => cambiar({ brillo: v || undefined }), 'Un brillo de color alrededor de la letra (como el neón)')}
            <ColorBoton
              titulo="Color del brillo"
              valor={t.colorBrillo ?? COLOR_BRILLO}
              colores={coloresDelProyecto(timeline)}
              onCambio={(c) => historial.aplicar(cambiar({ colorBrillo: c, ...(t.brillo ? {} : { brillo: 0.15 }) }))}
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
