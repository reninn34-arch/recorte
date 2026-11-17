import { useEffect, useState } from 'react'
import type { EstadoUso } from '../../../shared/api'
import type { Creacion } from '../../../shared/creacion'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'

/**
 * La barra de la izquierda, como en un chat con un agente: empezar una conversación nueva, editar un video a mano y,
 * debajo, cada conversación (cada creación) por fecha con cómo va, y los proyectos que editas a mano. Abajo, cuánto le
 * queda al agente y a la voz, y Ajustes.
 */

const DIA = 86_400_000

function grupoDe(fecha: number, ahora = Date.now()): string {
  const hoy = new Date(ahora)
  hoy.setHours(0, 0, 0, 0)
  const t = hoy.getTime()
  if (fecha >= t) return 'Hoy'
  if (fecha >= t - DIA) return 'Ayer'
  if (fecha >= t - 6 * DIA) return 'Esta semana'
  if (fecha >= t - 29 * DIA) return 'Este mes'
  return 'Antes'
}

/** Cuándo se restablece, como lo dice la app de Claude: «3:20 p. m.» hoy, «mañana 10:00», «vie 1:00». */
function reinicio(ms: number): string {
  const d = new Date(ms)
  const hoy = new Date()
  const hora = d.toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === hoy.toDateString()) return `se restablece a las ${hora}`
  const manana = new Date(hoy)
  manana.setDate(hoy.getDate() + 1)
  if (d.toDateString() === manana.toDateString()) return `se restablece mañana ${hora}`
  return `se restablece el ${d.toLocaleDateString('es', { weekday: 'short' })} ${hora}`
}

/** Cómo va una conversación, en pocas palabras. */
export function estadoDeCreacion(c: Creacion, trabajando: boolean): string {
  if (trabajando) return c.fase === 'video' ? 'Haciendo el video…' : 'El agente está pensando…'
  if (c.agente?.pausa) return 'En pausa: se acabó el plan'
  if (c.fase === 'listo' || c.salida) return `Video listo${c.version > 1 ? ` · versión ${c.version}` : ''}`
  if (c.agente?.plan) return 'Esperando tu respuesta'
  if (c.guion) return 'Guion listo'
  return 'Empezando'
}

export function BarraChats({
  creaciones,
  proyectos,
  enCurso,
  activa,
  proyectoAbierto,
  importando,
  onNueva,
  onEditarAMano,
  onAbrirCreacion,
  onAbrirProyecto,
  onBorrar,
  onAjustes,
  agenteActivo
}: {
  creaciones: Creacion[]
  proyectos: Project[]
  /** Las creaciones en las que el agente está trabajando ahora (id → desde cuándo). */
  enCurso: Record<string, number | undefined>
  activa?: string
  proyectoAbierto?: string
  importando: boolean
  onNueva: () => void
  onEditarAMano: () => void
  onAbrirCreacion: (id: string) => void
  onAbrirProyecto: (id: string) => void
  onBorrar: (tipo: 'proyecto' | 'creacion', id: string) => Promise<void>
  onAjustes: () => void
  /** El agente con el que trabajas: su uso es el que se ve abajo. */
  agenteActivo?: string
}) {
  const [borrando, setBorrando] = useState<{ tipo: 'proyecto' | 'creacion'; id: string; nombre: string } | null>(null)
  const [enCursoBorrar, setEnCursoBorrar] = useState(false)
  const [uso, setUso] = useState<EstadoUso | null>(null)

  useEffect(() => {
    let vivo = true
    const leer = () => void window.recorte.usoEstado?.().then((u) => vivo && setUso(u)).catch(() => {})
    leer()
    // Cambia mientras el agente trabaja (y Recorte lee Claude al abrirse): se vuelve a mirar cada 30 s.
    const reloj = setInterval(leer, 30_000)
    return () => {
      vivo = false
      clearInterval(reloj)
    }
  }, [])

  // Las conversaciones, de la más reciente a la más vieja, en grupos por fecha.
  const orden = [...creaciones].sort((a, b) => b.updatedAt - a.updatedAt)
  const grupos: { nombre: string; lista: Creacion[] }[] = []
  for (const c of orden) {
    const g = grupoDe(c.updatedAt)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.nombre === g) ultimo.lista.push(c)
    else grupos.push({ nombre: g, lista: [c] })
  }
  // Los proyectos que salieron de una conversación ya están en ella: aquí, solo los que editas a mano.
  const deChats = new Set(creaciones.map((c) => c.proyectoEditor).filter(Boolean))
  const aMano = [...proyectos].filter((p) => !deChats.has(p.id)).sort((a, b) => b.updatedAt - a.updatedAt)

  // Lo que más importa del uso: el agente con el que trabajas (sus ventanas, como en su app) y la voz.
  const agente = uso?.servicios.find((s) => s.id === agenteActivo) ?? uso?.servicios.find((s) => s.ventanas.length && s.id !== 'voz' && s.id !== 'flow')
  const voz = uso?.servicios.find((s) => s.id === 'voz')

  return (
    <nav className="bc" aria-label="Conversaciones">
      {borrando && (
        <div className="confirmar-fondo" onClick={() => !enCursoBorrar && setBorrando(null)}>
          <div className="confirmar" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
            <h3>¿Borrar «{borrando.nombre}»?</h3>
            <p>
              {borrando.tipo === 'proyecto'
                ? 'Se va a la Papelera con su timeline, transcripción y proxys. Tu video original y lo que ya exportaste a tu carpeta no se tocan.'
                : 'Se va a la Papelera con la conversación, su guion, voz y versiones. Las copias que ya están en tu carpeta de videos no se tocan.'}
            </p>
            <div className="confirmar-botones">
              <button className="btn small ghost" onClick={() => setBorrando(null)} disabled={enCursoBorrar}>
                Cancelar
              </button>
              <button
                className="btn small peligro"
                disabled={enCursoBorrar}
                onClick={async () => {
                  setEnCursoBorrar(true)
                  try {
                    await onBorrar(borrando.tipo, borrando.id)
                    setBorrando(null)
                  } finally {
                    setEnCursoBorrar(false)
                  }
                }}
              >
                <Icon name="trash" size={14} /> {enCursoBorrar ? 'Borrando…' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bc-marca">
        <span className="brand-mark"><Icon name="scissors" size={16} /></span>
        <span className="brand-name">recorte</span>
      </div>

      <button className="bc-nueva" onClick={onNueva}>
        <Icon name="plus" size={16} /> Nueva conversación
      </button>
      <button className="bc-accion" onClick={onEditarAMano} disabled={importando}>
        <Icon name="film" size={16} /> {importando ? 'Importando…' : 'Editar un video a mano'}
      </button>

      <div className="bc-lista">
        {grupos.map((g) => (
          <div key={g.nombre} className="bc-grupo">
            <span className="bc-grupo-nombre">{g.nombre}</span>
            {g.lista.map((c) => {
              const nombre = c.guion?.titulo ?? c.nombre
              const trabajando = Boolean(enCurso[c.id])
              return (
                <div key={c.id} className={`bc-item ${activa === c.id ? 'is-activa' : ''}`}>
                  <button className="bc-item-abrir" onClick={() => onAbrirCreacion(c.id)} title={c.peticion}>
                    <span className="bc-item-nombre">{nombre}</span>
                    <span className={`bc-item-estado ${trabajando ? 'is-trabajando' : ''}`}>
                      {trabajando && <span className="bc-latido" aria-hidden />}
                      {estadoDeCreacion(c, trabajando)}
                    </span>
                  </button>
                  <button className="bc-item-borrar" aria-label={`Borrar ${nombre}`} title="Borrar" onClick={() => setBorrando({ tipo: 'creacion', id: c.id, nombre })}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              )
            })}
          </div>
        ))}

        {aMano.length > 0 && (
          <div className="bc-grupo">
            <span className="bc-grupo-nombre">Editados a mano</span>
            {aMano.map((p) => (
              <div key={p.id} className={`bc-item ${proyectoAbierto === p.id ? 'is-activa' : ''}`}>
                <button className="bc-item-abrir" onClick={() => onAbrirProyecto(p.id)} title={p.source.path}>
                  <span className="bc-item-nombre">{p.name}</span>
                  <span className="bc-item-estado">
                    <Icon name="film" size={11} /> {p.timeline ? `${p.timeline.clips.length} ${p.timeline.clips.length === 1 ? 'clip' : 'clips'}` : 'Proyecto'}
                  </span>
                </button>
                <button className="bc-item-borrar" aria-label={`Borrar ${p.name}`} title="Borrar" onClick={() => setBorrando({ tipo: 'proyecto', id: p.id, nombre: p.name })}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {!creaciones.length && !aMano.length && <p className="bc-vacio">Tus conversaciones aparecen aquí.</p>}
      </div>

      {(agente || voz) && (
        <button className="bc-uso" onClick={onAjustes} title={`Ver el uso de todo en Ajustes${agente?.cuenta ? ` · ${agente.nombre} usa la cuenta ${agente.cuenta}` : ''}`}>
          {agente && (
            <>
              <span className="bc-uso-titulo">
                <b>{agente.nombre.replace(/ Code$/, '')}</b>
                {agente.cuenta && <span>{agente.cuenta}</span>}
              </span>
              {agente.ventanas.length ? (
                agente.ventanas.map((v) => (
                  <span key={v.nombre} className="bc-uso-ventana">
                    <span className="bc-uso-fila">
                      <span>{v.nombre === '5 horas' ? 'Límite de 5 horas' : v.nombre === 'semana' ? 'Semanal' : v.nombre[0].toUpperCase() + v.nombre.slice(1)}</span>
                      <b className={v.usado >= 0.9 ? 'is-alto' : ''}>{Math.round(v.usado * 100)} %</b>
                    </span>
                    <span className="bc-uso-barra">
                      <i className={v.usado >= 0.9 ? 'is-alto' : ''} style={{ width: `${Math.round(v.usado * 100)}%` }} />
                    </span>
                    {v.renueva && <span className="bc-uso-reinicio">{reinicio(v.renueva)[0].toUpperCase() + reinicio(v.renueva).slice(1)}</span>}
                  </span>
                ))
              ) : (
                <span className="bc-uso-fila">
                  <span>{agente.agotadoHasta ? `Sin plan hasta ${reinicio(agente.agotadoHasta)}` : agente.nota ?? 'Leyendo su uso…'}</span>
                </span>
              )}
            </>
          )}
          {voz && (
            // Aparte, con su raya: no es parte del agente de arriba.
            <span className="bc-uso-voz">
              <span>Voz de Google · hoy</span>
              <b className={voz.agotadoHasta ? 'is-agotado' : 'is-ok'}>{voz.agotadoHasta ? `agotada, ${reinicio(voz.agotadoHasta)}` : 'disponible'}</b>
            </span>
          )}
        </button>
      )}

      <button className="bc-accion" onClick={onAjustes}>
        <Icon name="settings" size={16} /> Ajustes
      </button>
    </nav>
  )
}

/** La pantalla con la barra de conversaciones a la izquierda y lo de cada vista a la derecha. */
export function Escritorio({ barra, children }: { barra: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="escritorio">
      {barra}
      <div className="escritorio-cuerpo">{children}</div>
    </div>
  )
}
