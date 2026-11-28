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
import { ValorArrastrable } from './ValorArrastrable'
import { reanclarTexto, rotuloEnMonitor } from '../rotulos'

/**
 * El rombo de fotograma clave de un ajuste de un texto, con sus flechas a la clave anterior y a la siguiente (como el de
 * las capas y el de CapCut). ◆ pone (o quita) la clave en el cabezal con lo que vale ahí; luego, en otro momento, se
 * cambia y se mueve solo. En una clave con otra después, elige cómo va hasta ella.
 */
export function RomboTexto({
  t,
  params,
  nombre,
  dt,
  valor,
  timeline,
  historial,
  onBuscar
}: {
  t: TextoTL
  params: ParametroClaveTexto[]
  nombre: string
  dt: number
  /** Lo que vale cada parámetro en el cabezal (lo que guarda la clave nueva). */
  valor: () => Partial<Record<ParametroClaveTexto, number>>
  timeline: Timeline
  historial: Historial
  onBuscar: (t: number) => void
}) {
  const lista = t.claves?.[params[0]] ?? []
  const aqui = lista.find((x) => Math.abs(x.f - dt) < 0.034)
  const anterior = [...lista].reverse().find((x) => x.f < dt - 0.02)
  const siguiente = lista.find((x) => x.f > dt + 0.02)
  const n = nombre.toLowerCase()
  return (
    <span className="ed-claves" onClick={(e) => e.preventDefault()}>
      {lista.length > 0 && (
        <button className="ed-clave-ir" disabled={!anterior} title="Ir a la clave anterior" aria-label={`Clave anterior de ${nombre}`} onClick={() => anterior && onBuscar(t.inicio + anterior.f)}>
          ‹
        </button>
      )}
      <button
        className={`ed-clave ${aqui ? 'is-on' : lista.length ? 'is-animado' : ''}`}
        aria-pressed={Boolean(aqui)}
        title={aqui ? `Quitar este fotograma clave de ${n}` : lista.length ? `Añadir un fotograma clave de ${n} en el cabezal` : `Animar ${n}: pone un fotograma clave en el cabezal. Mueve el cabezal, cámbialo y se anima solo.`}
        aria-label={aqui ? `Quitar la clave de ${nombre}` : `Poner una clave de ${nombre}`}
        onClick={() => {
          let nueva = timeline
          if (aqui) for (const p of params) nueva = quitarClaveTexto(nueva, t.id, p, aqui.f)
          else {
            const v = valor()
            for (const p of params) nueva = ponerClaveTexto(nueva, t.id, p, dt, v[p] ?? 0)
          }
          historial.aplicar(nueva)
        }}
      >
        ◆
      </button>
      {lista.length > 0 && (
        <button className="ed-clave-ir" disabled={!siguiente} title="Ir a la clave siguiente" aria-label={`Clave siguiente de ${nombre}`} onClick={() => siguiente && onBuscar(t.inicio + siguiente.f)}>
          ›
        </button>
      )}
      {aqui && siguiente && (
        <select
          className="ed-curva"
          value={aqui.curva ?? 'suave'}
          title={`Cómo va ${n} de esta clave a la siguiente`}
          aria-label={`Curva de ${nombre} hasta la clave siguiente`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            let nueva = timeline
            for (const p of params) nueva = curvaClaveTexto(nueva, t.id, p, aqui.f, e.target.value as CurvaClave)
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
  /**
   * Un ajuste del texto: su nombre (con ‹ ◆ › si se anima) y su número, que se arrastra o se escribe y tiene ↺ para
   * volver a su valor de siempre.
   */
  const ajuste = (
    nombre: string,
    valor: number,
    min: number,
    max: number,
    paso: number,
    formato: (v: number) => string,
    alCambiar: (v: number) => Timeline,
    porDefecto: number,
    titulo?: string,
    clave?: { params: ParametroClaveTexto[]; valor: () => Partial<Record<ParametroClaveTexto, number>> }
  ) => (
    <div className={`tl-ajuste aj en-linea ${clave ? 'con-claves' : ''}`} title={titulo}>
      <span>
        <span className="tl-ajuste-nombre">
          {nombre}
          {clave && <RomboTexto t={t} params={clave.params} nombre={nombre} dt={dt} valor={clave.valor} timeline={timeline} historial={historial} onBuscar={onBuscar} />}
        </span>
        <ValorArrastrable nombre={nombre} valor={valor} min={min} max={max} paso={paso} formato={formato} porDefecto={porDefecto} onEmpezar={empezarAjuste} onCambio={(v) => deslizar(alCambiar(v))} />
      </span>
    </div>
  )
  /** El sitio del texto como se ve ahora (sin sitio propio, el centro de su caja en el monitor). */
  const sitioAhora = () => {
    const d = typeof ahora.x === 'number' && typeof ahora.y === 'number' ? { x: ahora.x, y: ahora.y } : (reanclarTexto(ahora, ahora.alineacion, rotuloEnMonitor(t.id)) ?? { x: 0.5, y: 0.5 })
    return { x: d.x, y: d.y }
  }
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
      {ajuste('Espaciado', t.espaciado ?? 0, -0.1, 0.5, 0.01, (v) => `${Math.round(v * 100)}`, (v) => cambiar({ espaciado: v }), 0, 'El espacio entre letras')}
      {ajuste('Opacidad', ahora.opacidad ?? 1, 0, 1, 0.01, (v) => `${Math.round(v * 100)} %`, (v) => cambiarAhora({ opacidad: v }), 1, undefined, {
        params: ['opacidad'],
        valor: () => ({ opacidad: ahora.opacidad ?? 1 })
      })}
      {ajuste(
        'Giro',
        ahora.giro ?? 0,
        -180,
        180,
        1,
        (v) => `${Math.round(v)}°`,
        (v) => {
          // Sin sitio propio, primero lo toma (donde se ve): gira sobre él.
          const donde = libre ? {} : (reanclarTexto(ahora, undefined, rotuloEnMonitor(t.id)) ?? {})
          return cambiarAhora({ ...donde, giro: v })
        },
        0,
        'También se gira arrastrando el tirador redondo de arriba en el monitor',
        { params: ['giro'], valor: () => ({ giro: ahora.giro ?? 0 }) }
      )}
      <div className="tl-ajuste aj en-linea con-claves" title="El sitio se anima arrastrando el texto en el monitor en otro momento">
        <span>
          <span className="tl-ajuste-nombre">
            Sitio
            <RomboTexto t={t} params={['x', 'y']} nombre="Sitio" dt={dt} valor={sitioAhora} timeline={timeline} historial={historial} onBuscar={onBuscar} />
          </span>
          <span className="tl-dim">{libre ? `${Math.round((ahora.x ?? 0.5) * 100)} %, ${Math.round((ahora.y ?? 0.5) * 100)} %` : 'el de su posición'}</span>
        </span>
      </div>
      {t.sinCaja && (
        <>
          <span className="ed-seccion">Contorno, sombra y brillo</span>
          {!trazoElegido && <span className="tl-dim">Ahora lleva el halo oscuro de siempre. Mueve el contorno o la sombra para elegirlos tú.</span>}
          <div className="ed-fila-color">
            {ajuste('Contorno', t.contorno ?? 0, 0, LIMITE_TRAZO, 0.005, (v) => (v ? `${Math.round(v * 100)}` : 'no'), (v) => cambiar({ contorno: v, ...(t.sombra === undefined ? { sombra: 0 } : {}) }), 0, 'El grosor del borde de la letra')}
            <ColorBoton
              titulo="Color del contorno"
              valor={t.colorContorno ?? '#000000'}
              colores={coloresDelProyecto(timeline)}
              onCambio={(c) => historial.aplicar(cambiar({ colorContorno: c, ...(t.contorno === undefined ? { contorno: 0.06, sombra: t.sombra ?? 0 } : {}) }))}
            />
          </div>
          <div className="ed-fila-color">
            {ajuste('Sombra', t.sombra ?? 0, 0, LIMITE_TRAZO, 0.005, (v) => (v ? `${Math.round(v * 100)}` : 'no'), (v) => cambiar({ sombra: v, ...(t.contorno === undefined ? { contorno: 0 } : {}) }), 0, 'Lo que se separa la sombra (abajo a la derecha)')}
            <ColorBoton
              titulo="Color de la sombra"
              valor={t.colorSombra ?? '#000000'}
              colores={coloresDelProyecto(timeline)}
              onCambio={(c) => historial.aplicar(cambiar({ colorSombra: c, ...(t.sombra === undefined ? { sombra: 0.06, contorno: t.contorno ?? 0 } : {}) }))}
            />
          </div>
          <div className="ed-fila-color">
            {ajuste('Brillo', t.brillo ?? 0, 0, LIMITE_BRILLO, 0.01, (v) => (v ? `${Math.round(v * 100)}` : 'no'), (v) => cambiar({ brillo: v || undefined }), 0, 'Un brillo de color alrededor de la letra (como el neón)')}
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
