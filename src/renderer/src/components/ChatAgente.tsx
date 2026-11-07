import { useEffect, useRef, useState } from 'react'
import { aplicarOperaciones, MAX_MENSAJES, type MensajeChat } from '../../../shared/chat'
import { tramos, type Timeline } from '../../../shared/timeline'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import type { Elegido } from './TimelineEditor'
import { tc } from './TimelineEditor'

/**
 * El chat con el agente que edita. Cada respuesta trae operaciones sobre la timeline;
 * se aplican como un solo paso de deshacer, así que «Deshacer» (o Ctrl+Z) lo revierte.
 * Lo que el usuario mira en el editor (el cabezal, lo elegido) viaja con el mensaje.
 *
 * Mientras piensa se le puede parar (corta su proceso: deja de gastar). Cada mensaje
 * tuyo se puede editar, reenviar o usar para volver atrás: la conversación se corta
 * ahí y la timeline vuelve a como estaba antes de ese mensaje (también con Ctrl+Z).
 */

/** Lo que el editor comparte con el chat; se actualiza en cada render del editor. */
export interface PuenteEditor {
  timeline: Timeline
  tiempo: number
  elegido: Elegido
  aplicar: (t: Timeline) => void
  deshacer: () => void
}

const SUGERENCIAS = [
  'Quita las pausas y silencios',
  'Hazme una versión de 30 segundos con lo mejor',
  'Pon un título al inicio',
  '¿De qué trata el video?'
]

function referenciaDe(p: PuenteEditor | null): string | undefined {
  if (!p) return undefined
  const partes = [`cabezal en ${p.tiempo.toFixed(2)} s de la timeline`]
  if (p.elegido?.tipo === 'clip') {
    const t = tramos(p.timeline).find((x) => x.clip.id === p.elegido?.id)
    if (t) partes.push(`clip ${t.indice + 1} elegido (timeline ${t.inicio.toFixed(2)}–${t.fin.toFixed(2)}, fuente ${t.clip.entrada.toFixed(2)}–${t.clip.salida.toFixed(2)})`)
  } else if (p.elegido?.tipo === 'texto') {
    const i = p.timeline.textos.findIndex((x) => x.id === p.elegido?.id)
    if (i >= 0) partes.push(`texto ${i + 1} elegido («${p.timeline.textos[i].texto}»)`)
  }
  return partes.join('; ')
}

function etiquetaReferencia(p: PuenteEditor | null): string {
  if (!p) return ''
  if (p.elegido?.tipo === 'clip') {
    const t = tramos(p.timeline).find((x) => x.clip.id === p.elegido?.id)
    if (t) return `Clip ${t.indice + 1} · ${tc(p.tiempo)}`
  }
  if (p.elegido?.tipo === 'texto') {
    const x = p.timeline.textos.find((t) => t.id === p.elegido?.id)
    if (x) return `«${x.texto.slice(0, 18)}» · ${tc(p.tiempo)}`
  }
  return `Cabezal ${tc(p.tiempo)}`
}

export function ChatAgente({
  proyecto,
  puente,
  listo,
  nombreAgente,
  onCambiarChat,
  onConectar
}: {
  proyecto: Project
  puente: React.RefObject<PuenteEditor | null>
  listo: boolean
  nombreAgente?: string
  onCambiarChat: (id: string, mensajes: MensajeChat[]) => void
  onConectar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState<number | null>(null)
  const [segundos, setSegundos] = useState(0)
  const [conReferencia, setConReferencia] = useState(true)
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)
  const [, refrescar] = useState(0)
  // Cada envío tiene su número: si lo paran (o se rebobina), su respuesta tardía se ignora.
  const turno = useRef(0)
  const enCurso = useRef<MensajeChat[] | null>(null)
  const lista = useRef<HTMLDivElement | null>(null)
  // La timeline que dejó cada respuesta: «Deshacer» solo actúa si nadie editó después.
  const dejadas = useRef(new Map<string, Timeline>())
  const mensajes = proyecto.chat ?? []
  const proyectoId = proyecto.id

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes.length, pensando])

  useEffect(() => {
    if (pensando === null) return
    const reloj = setInterval(() => setSegundos(Math.round((Date.now() - pensando) / 1000)), 500)
    return () => clearInterval(reloj)
  }, [pensando])

  // La etiqueta del cabezal se refresca sola mientras el chat está a la vista.
  useEffect(() => {
    const reloj = setInterval(() => refrescar((x) => x + 1), 400)
    return () => clearInterval(reloj)
  }, [])

  async function enviar(peticion: string, base: MensajeChat[] = mensajes, desde?: Timeline) {
    const limpio = peticion.trim()
    const p0 = puente.current
    if (!limpio || pensando !== null || !p0) return
    // Tras volver atrás, el puente aún no trae la timeline restaurada: se usa la que toca.
    const p = desde ? { ...p0, timeline: desde } : p0
    const referencia = conReferencia ? referenciaDe(p) : undefined
    const delUsuario: MensajeChat = {
      id: crypto.randomUUID(),
      rol: 'usuario',
      texto: limpio,
      fecha: Date.now(),
      referencia: conReferencia ? etiquetaReferencia(p) : undefined,
      antes: p.timeline
    }
    const historial = base
    const conPregunta = [...historial, delUsuario].slice(-MAX_MENSAJES)
    onCambiarChat(proyectoId, conPregunta)
    setTexto('')
    setEditando(null)
    setPensando(Date.now())
    setSegundos(0)
    const mio = ++turno.current
    enCurso.current = conPregunta

    let respuesta: MensajeChat
    try {
      // Al agente le basta el texto: las timelines guardadas no viajan.
      const sinAntes = historial.map(({ antes: _a, ...m }) => m)
      const r0 = await window.recorte.chatAgente(proyectoId, p.timeline, sinAntes, limpio, referencia)
      if (turno.current !== mio) return
      if (r0.parado) {
        respuesta = { id: crypto.randomUUID(), rol: 'agente' as const, texto: 'Lo paraste. No cambié nada.', fecha: Date.now(), parado: true }
      } else if (!r0.ok) {
        respuesta = { id: crypto.randomUUID(), rol: 'agente', texto: r0.error ?? 'El agente no pudo responder.', fecha: Date.now(), error: true }
      } else {
        // Se aplica sobre la timeline de ahora (el usuario pudo seguir editando).
        const actual = puente.current ?? p
        const r = aplicarOperaciones(actual.timeline, r0.operaciones, {
          duracionFuente: proyecto.source.duration,
          transcript: proyecto.transcript
        })
        respuesta = {
          id: crypto.randomUUID(),
          rol: 'agente',
          texto: r0.mensaje,
          fecha: Date.now(),
          propuestas: r0.propuestas?.length ? r0.propuestas : undefined,
          aprendido: r0.aprendido?.length ? r0.aprendido : undefined,
          cambios: r.cambios.length ? r.cambios : undefined,
          fallos: r.fallos.length ? r.fallos : undefined
        }
        if (r.timeline !== actual.timeline && r.cambios.length) {
          actual.aplicar(r.timeline)
          dejadas.current.set(respuesta.id, r.timeline)
        }
      }
    } catch (error) {
      if (turno.current !== mio) return
      respuesta = {
        id: crypto.randomUUID(),
        rol: 'agente',
        texto: `No pude hablar con el agente: ${error instanceof Error ? error.message : String(error)}`,
        fecha: Date.now(),
        error: true
      }
    }
    setPensando(null)
    enCurso.current = null
    onCambiarChat(proyectoId, [...conPregunta, respuesta].slice(-MAX_MENSAJES))
  }

  /** Para al agente: su proceso se corta y lo que hubiera respondido ya no cuenta. */
  function parar() {
    if (pensando === null) return
    void window.recorte.pararAgente(proyectoId)
    turno.current += 1
    const base = enCurso.current ?? mensajes
    const pedido = [...base].reverse().find((x) => x.rol === 'usuario')
    if (pedido) void window.recorte.gustoSenal('paro', `«${pedido.texto.slice(0, 120)}»`)
    enCurso.current = null
    setPensando(null)
    onCambiarChat(proyectoId, [
      ...base,
      { id: crypto.randomUUID(), rol: 'agente' as const, texto: 'Lo paraste. No cambié nada.', fecha: Date.now(), parado: true }
    ].slice(-MAX_MENSAJES))
  }

  /**
   * Vuelve al punto justo antes de un mensaje tuyo: borra ese mensaje y lo que vino
   * después, y si el agente cambió la timeline desde entonces, la deja como estaba
   * (un solo paso de deshacer). Devuelve la conversación que queda.
   */
  function volverA(m: MensajeChat): { quedan: MensajeChat[]; timeline?: Timeline } {
    const i = mensajes.findIndex((x) => x.id === m.id)
    if (i < 0) return { quedan: mensajes }
    const quedan = mensajes.slice(0, i)
    const despues = mensajes.slice(i)
    const p = puente.current
    const huboCambios = despues.some((x) => x.rol === 'agente' && x.cambios?.some((c) => !c.endsWith('(deshecho)')))
    let timeline = p?.timeline
    if (p && m.antes && huboCambios && p.timeline !== m.antes) {
      p.aplicar(m.antes)
      timeline = m.antes
    }
    for (const x of despues) dejadas.current.delete(x.id)
    onCambiarChat(proyectoId, quedan)
    return { quedan, timeline }
  }

  function reenviar(m: MensajeChat, texto = m.texto) {
    if (pensando !== null || !texto.trim()) return
    if (texto.trim() !== m.texto.trim()) {
      void window.recorte.gustoSenal('corrigio', `«${m.texto.slice(0, 100)}» → «${texto.trim().slice(0, 100)}»`)
    }
    const { quedan, timeline } = volverA(m)
    void enviar(texto, quedan, timeline)
  }

  function elegir(propuesta: string) {
    if (pensando !== null) return
    void window.recorte.gustoSenal('eligio', propuesta)
    void enviar(propuesta)
  }

  /** «Olvidar» un gusto que el agente acaba de aprender (se puede gestionar en Ajustes). */
  async function olvidar(m: MensajeChat, texto: string) {
    const g = await window.recorte.gustos().catch(() => null)
    const x = g?.lista.find((t) => t.texto === texto)
    if (x) await window.recorte.gustoQuitar(x.id)
    onCambiarChat(proyectoId, mensajes.map((y) => (y.id === m.id ? { ...y, aprendido: y.aprendido?.filter((t) => t !== texto) } : y)))
  }

  function volverYEditarAbajo(m: MensajeChat) {
    if (pensando !== null) return
    volverA(m)
    setTexto(m.texto)
  }

  function deshacer(m: MensajeChat) {
    const p = puente.current
    const dejada = dejadas.current.get(m.id)
    if (!p || !dejada || p.timeline !== dejada) return
    p.deshacer()
    dejadas.current.delete(m.id)
    if (m.cambios?.length) void window.recorte.gustoSenal('deshizo', m.cambios.join('; ').slice(0, 220))
    onCambiarChat(proyectoId, mensajes.map((x) => (x.id === m.id ? { ...x, cambios: x.cambios?.map((c) => `${c} (deshecho)`) } : x)))
  }

  if (!listo) {
    return (
      <div className="chat chat-vacio">
        <p>Conecta un agente para pedirle cambios con tus palabras.</p>
        <button className="btn primary small" onClick={onConectar}>
          Conectar mi agente
        </button>
      </div>
    )
  }

  const p = puente.current
  return (
    <div className="chat">
      <div className="chat-lista" ref={lista}>
        {mensajes.length === 0 && pensando === null && (
          <div className="chat-bienvenida">
            <p>
              Pídele a {nombreAgente ?? 'tu agente'} que edite contigo. Trabaja sobre la timeline: todo lo que haga se puede
              deshacer y retocar a mano.
            </p>
            {!proyecto.transcript?.length && <p className="tl-dim">Transcribe el video para que sepa qué se dice.</p>}
            <div className="chat-sugerencias">
              {SUGERENCIAS.map((s) => (
                <button key={s} className="chip" onClick={() => void enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {mensajes.map((m, i) => {
          const ultimo = i === mensajes.length - 1
          const dejada = dejadas.current.get(m.id)
          const puedeDeshacer = Boolean(dejada && p && p.timeline === dejada)
          return (
            <div key={m.id} className={`chat-msg ${m.rol} ${m.error ? 'is-error' : ''} ${m.parado ? 'is-parado' : ''}`}>
              {m.referencia && <span className="chat-ref">{m.referencia}</span>}
              {editando?.id === m.id ? (
                <div className="chat-editar">
                  <textarea
                    autoFocus
                    value={editando.texto}
                    rows={3}
                    onChange={(e) => setEditando({ id: m.id, texto: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        reenviar(m, editando.texto)
                      } else if (e.key === 'Escape') setEditando(null)
                    }}
                  />
                  <div className="chat-editar-botones">
                    <button className="btn small ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </button>
                    <button className="btn small primary" disabled={!editando.texto.trim()} onClick={() => reenviar(m, editando.texto)}>
                      Reenviar
                    </button>
                  </div>
                  <span className="chat-editar-nota">Se borra lo que vino después y la timeline vuelve a como estaba.</span>
                </div>
              ) : (
                <p>{m.texto}</p>
              )}
              {m.rol === 'usuario' && pensando === null && editando?.id !== m.id && (
                <div className="chat-acciones">
                  <button title="Editar este mensaje y reenviarlo" aria-label="Editar" onClick={() => setEditando({ id: m.id, texto: m.texto })}>
                    <Icon name="type" size={12} />
                  </button>
                  <button title="Reenviar igual (vuelve a este punto y lo pide otra vez)" aria-label="Reenviar" onClick={() => reenviar(m)}>
                    <Icon name="redo" size={12} />
                  </button>
                  <button
                    title="Volver aquí: borra desde este mensaje, deja la timeline como estaba y te pone el texto abajo"
                    aria-label="Volver aquí"
                    onClick={() => volverYEditarAbajo(m)}
                  >
                    <Icon name="undo" size={12} />
                  </button>
                </div>
              )}
              {m.cambios && (
                <ul className="chat-cambios">
                  {m.cambios.map((c, i) => (
                    <li key={i}>
                      <Icon name="check" size={12} /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {m.fallos && (
                <ul className="chat-cambios fallos">
                  {m.fallos.map((c, i) => (
                    <li key={i}>
                      <Icon name="x" size={12} /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {puedeDeshacer && (
                <button className="chat-deshacer" onClick={() => deshacer(m)}>
                  <Icon name="undo" size={12} /> Deshacer
                </button>
              )}
              {m.aprendido?.map((t) => (
                <span key={t} className="chat-aprendi" title="Lo tendrá en cuenta en tus próximos videos. Lo ves todo en Ajustes → Tu criterio.">
                  <Icon name="sparkles" size={11} /> Aprendí: {t}
                  <button onClick={() => void olvidar(m, t)}>Olvidar</button>
                </span>
              ))}
              {ultimo && m.rol === 'agente' && pensando === null && m.propuestas?.length ? (
                <div className="chat-propuestas">
                  {m.propuestas.map((t) => (
                    <button key={t} className="chip" onClick={() => elegir(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
        {pensando !== null && (
          <div className="chat-msg agente pensando">
            <span className="chat-puntos">
              <i />
              <i />
              <i />
            </span>
            <span>
              {nombreAgente ?? 'El agente'} está editando… {segundos} s
            </span>
            <button className="chat-parar-mini" onClick={parar} title="Parar al agente (Esc)">
              Parar
            </button>
          </div>
        )}
      </div>

      <div className="chat-redactar">
        {p && (
          <button
            className={`chat-ref-toggle ${conReferencia ? 'is-on' : ''}`}
            onClick={() => setConReferencia((v) => !v)}
            title={conReferencia ? 'El agente sabe dónde estás. Clic para no enviarlo.' : 'Clic para decirle al agente dónde estás'}
          >
            <Icon name="search" size={11} /> {conReferencia ? etiquetaReferencia(p) : 'Sin referencia'}
          </button>
        )}
        <div className="chat-caja">
          <textarea
            value={texto}
            placeholder={pensando !== null ? 'Escribe lo siguiente mientras tanto… (Esc para parar)' : 'Pídele un cambio… (Enter envía)'}
            rows={2}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && pensando !== null) {
                e.preventDefault()
                parar()
              } else if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (pensando === null) void enviar(texto)
              }
            }}
          />
          {pensando !== null ? (
            <button className="btn small chat-parar" onClick={parar} title="Parar al agente: deja de gastar al instante" aria-label="Parar">
              <span className="chat-cuadro" />
            </button>
          ) : (
            <button className="btn primary small" disabled={!texto.trim()} onClick={() => void enviar(texto)} aria-label="Enviar">
              <Icon name="sparkles" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
