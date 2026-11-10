import { useEffect, useRef, useState } from 'react'
import { aplicarOperaciones, type MensajeChat } from '../../../shared/chat'
import type { AjustesCreacion, Creacion, MensajeCreacion } from '../../../shared/creacion'
import { clipsDelPlan, type PlanAgente } from '../../../shared/modoagente'
import { COSTO_CLIP } from '../../../shared/creacion'
import type { Project } from '../../../shared/types'
import type { Agentes } from '../hooks/agentes'
import { Icon } from '../Icons'
import { CajaCrear } from './CajaCrear'
import type { PuenteEditor } from './ChatAgente'
import { LogoAgente } from './Logos'
import { mediaUrl } from '../media'

/**
 * El chat de una creación con el agente, a la derecha del editor. Es una conversación:
 * con «Pregúntame antes» el agente propone ideas y pregunta hasta que el plan está listo
 * y tú dices «Hazlo»; mientras trabaja se ven sus pasos marcándose y lo último que hizo,
 * y se le puede parar. Con el video hecho, cada mensaje puede ser un cambio rápido sobre
 * la timeline (sin rehacer el video ni gastar en render) o un encargo para que el agente
 * lo rehaga. La caja de abajo es la de crear: voz, imágenes, clips, agente y material.
 */

export interface ProgresoCreacion {
  pct: number
  texto?: string
  registro?: string[]
  paso?: number
  pasos?: string[]
}

function PasosPlan({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol className="cr-pasos">
      {pasos.map((p, i) => {
        const n = i + 1
        const estado = n < actual ? 'is-hecho' : n === actual ? 'is-actual' : ''
        return (
          <li key={i} className={estado}>
            <span className="chat-paso-marca">{n < actual ? <Icon name="check" size={11} /> : null}</span>
            <span>{p}</span>
          </li>
        )
      })}
    </ol>
  )
}

const NOMBRE_MEDIO: Record<string, string> = { clip: 'Clip', imagen: 'Imagen', material: 'Tu material', diseno: 'Diseño' }
const seg = (s?: number) => (s === undefined ? '' : `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`)

function TarjetaPlan({
  plan,
  puedeHacer,
  onHazlo,
  modeloClip
}: {
  plan: PlanAgente
  puedeHacer: boolean
  onHazlo: () => void
  /** El modelo de clips elegido en la caja: para decir lo que cuestan. */
  modeloClip?: string
}) {
  const escenas = plan.escenas ?? []
  const clips = clipsDelPlan(plan)
  const porClip = modeloClip ? COSTO_CLIP[modeloClip] : undefined
  return (
    <div className="cr-plan">
      <div className="cr-plan-cabeza">
        <b>Plan</b>
        {plan.herramienta && <span className="tl-dim">con {plan.herramienta}</span>}
      </div>
      {plan.entendi && <p>{plan.entendi}</p>}
      {escenas.length > 0 && (
        <div className="cr-guion">
          <span className="cr-guion-titulo">Guion gráfico · {escenas.length} escenas</span>
          <ol>
            {escenas.map((e, i) => (
              <li key={i} title={e.prompt ? `Prompt: ${e.prompt}` : undefined}>
                <span className="cr-escena-cabeza">
                  <b>{i + 1}</b>
                  {e.desde !== undefined && (
                    <span className="tl-dim">
                      {seg(e.desde)}
                      {e.hasta !== undefined ? `–${seg(e.hasta)}` : ''}
                    </span>
                  )}
                  <span className={`cr-medio is-${e.medio}`}>{NOMBRE_MEDIO[e.medio]}</span>
                </span>
                {e.texto && <span className="cr-escena-texto">«{e.texto}»</span>}
                {e.visual && <span className="cr-escena-visual">{e.visual}</span>}
              </li>
            ))}
          </ol>
          {clips > 0 && (
            <span className="cr-costo">
              <Icon name="film" size={12} /> {clips} {clips === 1 ? 'clip' : 'clips'}
              {modeloClip ? ` con ${modeloClip}` : ''}
              {porClip ? ` ≈ ${clips * porClip} créditos` : ''} · se generan solo al decir «Hazlo»
            </span>
          )}
        </div>
      )}
      {plan.pasos.length > 0 && !escenas.length && (
        <ol>
          {plan.pasos.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ol>
      )}
      {puedeHacer && (
        <button className="btn primary small" onClick={onHazlo}>
          <Icon name="play" size={13} /> Hazlo
        </button>
      )}
    </div>
  )
}

/** «hoy a las 17:01», «mañana a las 09:01» o «el lunes 16 a las 21:01». */
function cuandoEs(ms: number): string {
  const d = new Date(ms)
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  const hoy = new Date()
  const manana = new Date(hoy)
  manana.setDate(hoy.getDate() + 1)
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`
  if (d.toDateString() === manana.toDateString()) return `mañana a las ${hora}`
  return `el ${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric' })} a las ${hora}`
}

/** Cambio rápido (timeline, sin render) o que el agente lo rehaga. */
type Via = 'rapido' | 'agente'

export function ChatCreacion({
  creacion,
  agentes,
  trabajando,
  desde,
  progreso,
  onPedir,
  onHazlo,
  onSeguir,
  onParar,
  onAjustar,
  onAdjuntar,
  onAnotar,
  onConectar,
  editor
}: {
  creacion: Creacion
  agentes: Agentes
  trabajando: boolean
  /** Cuándo empezó el agente (ms), lo dice el proceso principal: salir y volver no reinicia el reloj. */
  desde?: number
  progreso: ProgresoCreacion | null
  /** Un mensaje para el agente de la creación (la charla del plan o un cambio que rehace el video). */
  onPedir: (texto: string) => void
  onHazlo: () => void
  /** Sigue donde iba tras quedarse sin uso del plan (con el agente que esté elegido). */
  onSeguir: () => void
  onParar: () => void
  onAjustar: (ajustes: AjustesCreacion) => void
  onAdjuntar: (rutas: string[]) => void
  /** Deja en la conversación los mensajes de un cambio rápido. */
  onAnotar: (mensajes: Partial<MensajeCreacion>[]) => Promise<void>
  onConectar: () => void
  /** Si el video ya está en el editor: el proyecto y su timeline, para los cambios rápidos. */
  editor?: { proyecto: Project; puente: React.RefObject<PuenteEditor | null> }
}) {
  const c = creacion
  const lista = useRef<HTMLDivElement | null>(null)
  const hayVideo = Boolean(c.agente?.resultado)
  const [via, setVia] = useState<Via>('rapido')
  // El cambio rápido en curso: su pedido (para verlo ya) y cuándo empezó.
  const [rapido, setRapido] = useState<{ texto: string; desde: number } | null>(null)
  const turnoRapido = useRef(0)
  const [segundos, setSegundos] = useState(0)

  const ocupado = trabajando || rapido !== null
  const inicio = rapido?.desde ?? (trabajando ? (desde ?? null) : null)
  useEffect(() => {
    if (inicio === null) return
    const contar = () => setSegundos(Math.max(0, Math.round((Date.now() - inicio) / 1000)))
    contar()
    const reloj = setInterval(contar, 500)
    return () => clearInterval(reloj)
  }, [inicio])
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [c.mensajes.length, trabajando, rapido, progreso?.registro?.length])

  // El plan vigente es el último que dejó la charla; «Hazlo» va en ese, mientras no haya video.
  const ultimoConPlan = [...c.mensajes].reverse().find((m) => m.plan)?.id

  async function cambioRapido(texto: string) {
    const ed = editor
    const p0 = ed?.puente.current
    if (!ed || !p0) return
    const mio = ++turnoRapido.current
    setRapido({ texto, desde: Date.now() })
    const historial: MensajeChat[] = c.mensajes.slice(-10).map((m) => ({ id: m.id, rol: m.rol, texto: m.texto, fecha: m.fecha }))
    let respuesta: Partial<MensajeCreacion>
    try {
      const r = await window.recorte.chatAgente(ed.proyecto.id, p0.timeline, historial, texto)
      if (turnoRapido.current !== mio) return
      if (r.parado) respuesta = { rol: 'agente', texto: 'Lo paraste. No cambié nada.' }
      else if (!r.ok) respuesta = { rol: 'agente', texto: r.error ?? 'El agente no pudo responder.', error: true }
      else {
        // Se aplica sobre la timeline de ahora (pudiste seguir editando mientras pensaba).
        const actual = ed.puente.current ?? p0
        const hecho = aplicarOperaciones(actual.timeline, r.operaciones, {
          duracionFuente: ed.proyecto.source.duration,
          transcript: ed.proyecto.transcript
        })
        if (hecho.timeline !== actual.timeline && hecho.cambios.length) actual.aplicar(hecho.timeline)
        respuesta = {
          rol: 'agente',
          texto: r.mensaje,
          ...(hecho.cambios.length ? { cambios: hecho.cambios } : {}),
          ...(hecho.fallos.length ? { fallos: hecho.fallos } : {}),
          ...(r.propuestas?.length ? { propuestas: r.propuestas } : {})
        }
      }
    } catch (error) {
      if (turnoRapido.current !== mio) return
      respuesta = { rol: 'agente', texto: `No pude hablar con el agente: ${error instanceof Error ? error.message : String(error)}`, error: true }
    }
    await onAnotar([{ rol: 'usuario', texto }, respuesta])
    if (turnoRapido.current === mio) setRapido(null)
  }

  function enviar(texto: string) {
    if (ocupado) return
    if (hayVideo && editor && via === 'rapido') void cambioRapido(texto)
    else onPedir(texto)
  }

  function parar() {
    if (rapido && editor) {
      turnoRapido.current += 1
      void window.recorte.pararAgente(editor.proyecto.id)
      const texto = rapido.texto
      setRapido(null)
      void onAnotar([{ rol: 'usuario', texto }, { rol: 'agente', texto: 'Lo paraste. No cambié nada.' }])
      return
    }
    onParar()
  }

  const enPlan = !hayVideo && !c.agente?.plan
  const registro = progreso?.registro ?? []
  // El agente que hace esta creación: el elegido en su caja o, si no, el activo.
  const activo = agentes.lista.find((a) => a.id === c.tareas?.video?.agente) ?? agentes.activo

  return (
    <aside className="agente-panel chat-creacion">
      <div className="panel-head">
        <button className="agente-actual" onClick={onConectar} title="Cambiar de agente">
          {activo && <LogoAgente id={activo.id} size={26} />}
          <span className="agente-actual-texto">
            <strong>{activo?.nombre ?? 'Tu agente'}</strong>
            <span>{trabajando ? 'Trabajando en tu video' : rapido ? 'Cambiando la timeline' : hayVideo ? 'Pídele cambios o tócalo a mano' : 'Hablemos de tu video'}</span>
          </span>
        </button>
      </div>

      <div className="chat-lista" ref={lista}>
        <div className="chat-msg usuario">
          <p>{c.peticion}</p>
          {c.adjuntos.length > 0 && <span className="chat-ref">{c.adjuntos.length} {c.adjuntos.length === 1 ? 'archivo' : 'archivos'}</span>}
        </div>
        {c.mensajes.map((m) => {
          const ultimo = m.id === c.mensajes.at(-1)?.id
          return (
            <div key={m.id} className={`chat-msg ${m.rol} ${m.error ? 'is-error' : ''}`}>
              {m.texto && <p>{m.texto}</p>}
              {m.medios?.length ? (
                <div className="cr-medios">
                  {m.medios.map((r) =>
                    /\.(mp4|mov|webm)$/i.test(r) ? (
                      <video key={r} src={mediaUrl(`c-${c.id}`, r)} controls muted playsInline preload="metadata" />
                    ) : (
                      <a key={r} href={mediaUrl(`c-${c.id}`, r)} target="_blank" rel="noreferrer" title="Ver en grande">
                        <img src={mediaUrl(`c-${c.id}`, r)} alt="" loading="lazy" />
                      </a>
                    )
                  )}
                </div>
              ) : null}
              {m.plan && (
                <TarjetaPlan
                  plan={m.plan}
                  puedeHacer={m.id === ultimoConPlan && !hayVideo && !ocupado}
                  onHazlo={onHazlo}
                  modeloClip={c.flow?.videos ? c.flow.modeloVideo : undefined}
                />
              )}
              {m.cambios && (
                <ul className="chat-cambios">
                  {m.cambios.map((x, i) => (
                    <li key={i}>
                      <Icon name="check" size={12} /> {x}
                    </li>
                  ))}
                </ul>
              )}
              {m.fallos && (
                <ul className="chat-cambios fallos">
                  {m.fallos.map((x, i) => (
                    <li key={i}>
                      <Icon name="x" size={12} /> {x}
                    </li>
                  ))}
                </ul>
              )}
              {m.aprendido?.map((t) => (
                <span key={t} className="chat-aprendi" title="Lo tendrá en cuenta en tus próximos videos. Lo ves y lo borras en Ajustes → Tu criterio.">
                  <Icon name="sparkles" size={11} /> Aprendí: {t}
                </span>
              ))}
              {ultimo && m.rol === 'agente' && !ocupado && m.propuestas?.length ? (
                <div className="chat-propuestas">
                  {/* «Hazlo» ya es el botón del plan: no se repite como respuesta rápida. */}
                  {m.propuestas
                    .filter((t) => !(m.plan && m.id === ultimoConPlan && !hayVideo && /^haz(lo)?[.!]*$/i.test(t.trim())))
                    // «Seguir donde iba» ya está en el aviso de pausa.
                    .filter((t) => !(c.agente?.pausa && /^seguir donde iba/i.test(t.trim())))
                    .map((t) => (
                    <button
                      key={t}
                      className="chip"
                      onClick={() => {
                        void window.recorte.gustoSenal('eligio', t)
                        if (/^seguir donde iba/i.test(t.trim()) && c.agente?.pausa) onSeguir()
                        else if (/^haz(lo)?\b/i.test(t.trim()) && !hayVideo) onHazlo()
                        else enviar(t)
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}

        {c.agente?.pausa && !ocupado && (
          <div className="cr-pausa">
            <Icon name="clock" size={14} />
            <span>
              En pausa: se acabó el uso de tu plan.{' '}
              {c.agente.pausa.reanudar
                ? `Sigo solo ${cuandoEs(c.agente.pausa.reanudar)}, cuando se renueve (con la app abierta).`
                : 'Sigue cuando se renueve.'}{' '}
              O elige otro agente abajo y sigue ya.
            </span>
            <button className="btn small primary" onClick={onSeguir}>
              Seguir donde iba
            </button>
          </div>
        )}

        {rapido && (
          <div className="chat-msg usuario">
            <p>{rapido.texto}</p>
          </div>
        )}

        {trabajando && progreso?.pasos?.length ? (
          <div className="chat-msg agente chat-pasos">
            <PasosPlan pasos={progreso.pasos} actual={progreso.paso ?? 0} />
          </div>
        ) : null}

        {ocupado && (
          <div className="chat-msg agente pensando">
            <span className="chat-puntos">
              <i />
              <i />
              <i />
            </span>
            <span>
              {rapido ? 'Cambiando la timeline' : enPlan ? 'Mirando tus archivos' : (progreso?.texto ?? 'Trabajando')}… {segundos} s
            </span>
            <button className="chat-parar-mini" onClick={parar} title="Parar al agente (Esc)">
              Parar
            </button>
          </div>
        )}
        {trabajando && registro.length > 0 && (
          <ol className="cr-registro" title="Lo último que hizo el agente">
            {registro.slice(-5).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="chat-redactar">
        {hayVideo && editor && (
          <div className="cr-via" role="radiogroup" aria-label="Cómo hacer el cambio">
            <button className={via === 'rapido' ? 'is-on' : ''} onClick={() => setVia('rapido')} title="Cambia la timeline al momento: textos, cortes, orden, voz… sin rehacer el video">
              <Icon name="scissors" size={12} /> Cambio rápido
            </button>
            <button className={via === 'agente' ? 'is-on' : ''} onClick={() => setVia('agente')} title="El agente rehace el video con su método (tarda y gasta más)">
              <Icon name="sparkles" size={12} /> Que lo rehaga el agente
            </button>
          </div>
        )}
        <CajaCrear
          agentes={agentes}
          creando={false}
          estilo={c.estilo}
          onConectar={onConectar}
          chat={{
            creacion: c,
            ocupado,
            onParar: parar,
            onEnviar: enviar,
            onAjustar,
            onAdjuntar,
            placeholder: hayVideo
              ? via === 'rapido' && editor
                ? 'Cambia el título del inicio, quita el clip 3…'
                : 'Qué cambiar del video…'
              : c.agente?.plan
                ? 'Contéstale, cámbiale el plan o di «Hazlo»'
                : 'Escríbele al agente…'
          }}
        />
      </div>
    </aside>
  )
}
