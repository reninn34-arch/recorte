import { useRef, useState } from 'react'
import { anguloEn, cambiarAngulo, ubicar, type FuenteId, type Timeline } from '../../../shared/timeline'
import { useSincronizar, type FuentesVista, type Historial } from '../hooks/timeline'
import { Icon } from '../Icons'

/**
 * La multicámara (como el monitor multicámara de Premiere): las tomas de la misma escena, sincronizadas por su sonido,
 * se ven a la vez; un clic (o 1, 2, 3… en el teclado) corta a esa toma en el cabezal.
 */

/** Una toma en miniatura, en el mismo momento de la escena que el cabezal. */
function Toma({ url, segundo, reproduciendo }: { url: string; segundo: number | null; reproduciendo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useSincronizar(ref, segundo, reproduciendo, 0)
  return <video ref={ref} src={url} muted preload="auto" />
}

export function PanelMulticam({
  timeline,
  historial,
  fuentes,
  nombres,
  tiempo,
  reproduciendo,
  duracionDe,
  sincronizar,
  sonidoUnico
}: {
  /** Deja sonando el audio de la toma `n` en todo (las tomas quedan mudas). */
  sonidoUnico?: (n: number) => Promise<void>
  timeline: Timeline
  historial: Historial
  fuentes: FuentesVista
  /** Las tomas que se pueden usar: el video principal y los videos de la biblioteca. */
  nombres: { fuente: FuenteId; nombre: string }[]
  tiempo: number
  reproduciendo: boolean
  duracionDe: (fuente: FuenteId) => number
  /** Calcula el desfase de cada toma respecto de la primera, por su sonido. */
  sincronizar: (fuentes: FuenteId[]) => Promise<{ fuente: FuenteId; desfase: number; confianza: number }[]>
}) {
  const [elegidas, setElegidas] = useState<FuenteId[]>(() => nombres.map((n) => n.fuente).slice(0, 4))
  const [trabajando, setTrabajando] = useState(false)
  const [aviso, setAviso] = useState('')
  const mc = timeline.multicam

  if (!mc) {
    return (
      <>
        <span className="ed-seccion">Multicámara</span>
        <p className="tl-dim">
          Si grabaste la misma escena con varias cámaras (o el celular y la cámara), elige las tomas: Recorte las sincroniza por el sonido
          y las ves todas a la vez para cortar entre ellas mientras reproduces.
        </p>
        {nombres.length < 2 ? (
          <p className="tl-dim">Agrega a la biblioteca las otras tomas de la escena (Medios → Importar).</p>
        ) : (
          <>
            {nombres.map((n) => (
              <label key={n.fuente} className="tl-check">
                <input
                  type="checkbox"
                  checked={elegidas.includes(n.fuente)}
                  onChange={(e) => setElegidas((x) => (e.target.checked ? [...x, n.fuente] : x.filter((f) => f !== n.fuente)))}
                />
                {n.nombre}
              </label>
            ))}
            <button
              className="btn small primary"
              disabled={elegidas.length < 2 || trabajando}
              onClick={async () => {
                setTrabajando(true)
                setAviso('')
                try {
                  // La primera toma es la que ya está en la línea de tiempo (si está entre las elegidas).
                  const enUso = timeline.clips[0]?.fuente
                  const orden = enUso && elegidas.includes(enUso) ? [enUso, ...elegidas.filter((f) => f !== enUso)] : elegidas
                  const r = await sincronizar(orden)
                  const dudosas = r.filter((x) => x.confianza < 0.3).map((x) => nombres.find((n) => n.fuente === x.fuente)?.nombre ?? x.fuente)
                  historial.aplicar({
                    ...timeline,
                    multicam: { angulos: r.map((x) => ({ fuente: x.fuente, desfase: x.desfase, nombre: nombres.find((n) => n.fuente === x.fuente)?.nombre })) }
                  })
                  setAviso(
                    dudosas.length
                      ? `Ojo: el sonido de ${dudosas.join(', ')} no se parece mucho; revisa que sea la misma escena.`
                      : 'Listo: las tomas quedaron sincronizadas. Reproduce y toca una toma (o 1, 2, 3…) para cortar a ella.'
                  )
                } catch (error) {
                  setAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
                } finally {
                  setTrabajando(false)
                }
              }}
            >
              <Icon name="film" size={14} /> {trabajando ? 'Sincronizando…' : `Sincronizar ${elegidas.length} tomas por el sonido`}
            </button>
          </>
        )}
        {aviso && <p className="tl-dim">{aviso}</p>}
      </>
    )
  }

  const u = ubicar(timeline, tiempo)
  const actual = anguloEn(timeline, tiempo)
  const origen = u ? mc.angulos.find((a) => a.fuente === u.clip.fuente) : undefined
  // El momento de la escena en el cabezal (según la toma que se ve).
  const escena = u && origen ? u.tFuente - origen.desfase : null
  return (
    <>
      <span className="ed-seccion">
        Multicámara
        <button
          className="ed-seccion-quitar"
          title="Deja de usar la multicámara (los cortes que hiciste se quedan)"
          onClick={() => {
            const { multicam: _m, ...resto } = timeline
            historial.aplicar(resto)
          }}
        >
          Quitar
        </button>
      </span>
      <p className="tl-dim">Reproduce y toca una toma (o pulsa 1, 2, 3…) para cortar a ella en el cabezal.</p>
      <div className="mc-rejilla">
        {mc.angulos.map((a, n) => {
          const f = fuentes[a.fuente]
          return (
            <button
              key={a.fuente}
              className={`mc-toma ${n === actual ? 'is-actual' : ''}`}
              title={`Cortar a ${a.nombre ?? `la toma ${n + 1}`} en el cabezal (${n + 1})`}
              onClick={() => historial.aplicar(cambiarAngulo(timeline, tiempo, n, duracionDe))}
            >
              {f?.tipo === 'video' ? <Toma url={f.url} segundo={escena === null ? null : Math.max(0, escena + a.desfase)} reproduciendo={reproduciendo} /> : <span className="mc-vacia" />}
              <span className="mc-etiqueta">
                <b>{n + 1}</b> {a.nombre ?? `Toma ${n + 1}`}
              </span>
            </button>
          )
        })}
      </div>
      {sonidoUnico && (
        <label className="tl-check mc-sonido" title="Las cámaras graban el sonido distinto: deja sonando el de una sola toma en todo el video (las tomas quedan mudas)">
          Sonido de
          <select
            defaultValue=""
            disabled={trabajando}
            onChange={async (e) => {
              const n = Number(e.target.value)
              e.target.value = ''
              if (!Number.isFinite(n) || e.target.selectedIndex < 0) return
              setTrabajando(true)
              setAviso('')
              try {
                await sonidoUnico(n)
                setAviso(`Listo: suena ${mc.angulos[n].nombre ?? `la toma ${n + 1}`} en todo el video; las tomas quedaron mudas.`)
              } catch (error) {
                setAviso(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
              } finally {
                setTrabajando(false)
              }
            }}
          >
            <option value="" disabled>
              {trabajando ? 'Separando…' : 'cada toma (elige una para todo)'}
            </option>
            {mc.angulos.map((a, n) => (
              <option key={a.fuente} value={n}>
                {n + 1} · {a.nombre ?? `Toma ${n + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      {aviso && <p className="tl-dim">{aviso}</p>}
    </>
  )
}
