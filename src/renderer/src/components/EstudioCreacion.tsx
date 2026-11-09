import { useEffect, useRef, useState } from 'react'
import { duracionEnVoz, duracionGuion, vozDesactualizada, type Creacion } from '../../../shared/creacion'
import { PasoVoz, type ControlVoz } from './PasoVoz'
import { PasoEstilo, type ControlEstilo } from './PasoEstilo'
import { PanelAgente } from './PanelAgente'
import { esAprobacion } from '../../../shared/modoagente'
import { estiloPorId } from '../../../shared/estilos'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * El estudio de una creación con IA. Arriba las fases; a la izquierda la conversación
 * (cada mensaje actualiza el guion y, si ya hay video, también la voz y las escenas);
 * al centro lo que hay ahora: el guion por escenas o el video. Al final, el video entra
 * al editor.
 */
export function EstudioCreacion({
  creacion,
  trabajando,
  desde: desdeTrabajo,
  progreso,
  onGuion,
  onVideo,
  onEditor,
  onMostrar,
  onVolver,
  onParar,
  voz,
  estilo,
  agente
}: {
  voz: ControlVoz
  estilo?: ControlEstilo
  /** Modo agente: pedir (o rehacer) el plan, y hacer o cambiar el video. */
  agente?: { plan: (pedido?: string) => void; hacer: (pedido?: string) => void }
  creacion: Creacion
  trabajando: boolean
  /** Cuándo empezó a trabajar el agente (ms): el reloj sigue aunque salgas y vuelvas. */
  desde?: number
  progreso: { pct: number; texto?: string; registro?: string[] } | null
  onGuion: (pedido?: string) => void
  onVideo: (pedido?: string) => void
  onEditor: () => void
  onMostrar: () => void
  onVolver: () => void
  /** Para al agente (y lo que falte por pedir a Flow): deja de gastar al instante. */
  onParar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState<number | null>(null)
  const [segundos, setSegundos] = useState(0)
  const lista = useRef<HTMLDivElement | null>(null)
  const c = creacion
  const hecho = Boolean(c.salida)
  const estiloEditorial = estiloPorId(c.estilo)
  const mediosGenerados = c.guion?.escenas.filter((e) => e.medio).length ?? 0
  const mediosPendientes = c.guion?.escenas.filter((e) => !e.medio && (e.imagen || e.clip)).length ?? 0

  useEffect(() => {
    setDesde(trabajando ? (desdeTrabajo ?? Date.now()) : null)
  }, [trabajando, desdeTrabajo])
  useEffect(() => {
    if (desde === null) return
    const contar = () => setSegundos(Math.max(0, Math.round((Date.now() - desde) / 1000)))
    contar()
    const reloj = setInterval(contar, 500)
    return () => clearInterval(reloj)
  }, [desde])
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: 'smooth' })
  }, [c.mensajes.length, trabajando])

  const modoAgente = c.modo === 'agente' && agente

  /** Lo que escribe el usuario: en modo agente, aprueba el plan, lo cambia o cambia el video. */
  function pedir(pedido: string) {
    if (modoAgente) {
      if (c.agente?.resultado) agente.hacer(pedido)
      else if (c.agente?.plan && esAprobacion(pedido)) agente.hacer(pedido)
      else agente.plan(pedido)
      return
    }
    // Con el video hecho, los cambios van al video; antes, al guion.
    if (hecho) onVideo(pedido)
    else onGuion(pedido)
  }

  function enviar() {
    const pedido = texto.trim()
    if (!pedido || trabajando) return
    setTexto('')
    pedir(pedido)
  }

  const fases = modoAgente
    ? [
        { nombre: 'Idea', hecha: true, actual: false },
        { nombre: 'Plan', hecha: Boolean(c.agente?.plan), actual: c.fase === 'plan' },
        { nombre: 'Hacer', hecha: Boolean(c.agente?.resultado) && c.fase !== 'video', actual: c.fase === 'video' },
        { nombre: 'Revisar', hecha: false, actual: c.fase === 'listo' },
        { nombre: 'Editor', hecha: Boolean(c.proyectoEditor), actual: false }
      ]
    : [
    { nombre: 'Idea', hecha: true, actual: false },
    ...(c.referencia
      ? [{ nombre: 'Estilo', hecha: Boolean(c.ficha) && c.fase !== 'estilo', actual: c.fase === 'estilo' }]
      : []),
    { nombre: 'Guion', hecha: Boolean(c.guion), actual: c.fase === 'guion' },
    { nombre: 'Voz', hecha: Boolean(c.voz) && !vozDesactualizada(c), actual: c.fase === 'voz' },
    { nombre: 'Video', hecha: hecho && c.fase !== 'video', actual: c.fase === 'video' },
    { nombre: 'Editor', hecha: Boolean(c.proyectoEditor), actual: false }
  ]

  return (
    <div className="estudio">
      <header className="estudio-cabeza">
        <button className="btn small ghost boton-volver" onClick={onVolver}>
          <Icon name="chevron" size={14} /> Inicio
        </button>
        <div className="estudio-titulo">
          <strong>{c.guion?.titulo ?? c.nombre}</strong>
          <span>
            {estiloEditorial.nombre} · {c.formato === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'} · {c.duracion} s
          </span>
        </div>
        <div className="estudio-fases">
          {fases.map((f) => (
            <span key={f.nombre} className={`estudio-fase ${f.actual ? 'is-actual' : f.hecha ? 'is-hecha' : ''}`}>
              {f.hecha && !f.actual && <Icon name="check" size={11} />} {f.nombre}
            </span>
          ))}
        </div>
      </header>

      <div className="estudio-cuerpo">
        <aside className="estudio-chat">
          <div className="chat-lista" ref={lista}>
            <div className="chat-msg usuario">
              <p>{c.peticion}</p>
              {c.adjuntos.length > 0 && <span className="chat-ref">{c.adjuntos.length} adjuntos</span>}
            </div>
            {c.mensajes.map((m) => (
              <div key={m.id} className={`chat-msg ${m.rol} ${m.error ? 'is-error' : ''}`}>
                <p>{m.texto}</p>
                {m.aprendido?.map((t) => (
                  <span key={t} className="chat-aprendi" title="Lo tendrá en cuenta en tus próximos videos. Lo ves y lo borras en Ajustes → Tu criterio.">
                    <Icon name="sparkles" size={11} /> Aprendí: {t}
                  </span>
                ))}
                {m.id === c.mensajes.at(-1)?.id && m.rol === 'agente' && !trabajando && m.propuestas?.length ? (
                  <div className="chat-propuestas">
                    {m.propuestas.map((t) => (
                      <button
                        key={t}
                        className="chip"
                        onClick={() => {
                          void window.recorte.gustoSenal('eligio', t)
                          if (modoAgente && t === 'Hazlo') agente.hacer()
                          else pedir(t)
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {trabajando && (
              <div className="chat-msg agente pensando">
                <span className="chat-puntos">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  {progreso?.texto ?? 'Trabajando'}… {segundos} s
                </span>
                <button className="chat-parar-mini" onClick={onParar} title="Parar al agente">
                  Parar
                </button>
              </div>
            )}
          </div>
          <div className="chat-redactar">
            <span className="tl-dim">
              {modoAgente
                ? c.agente?.resultado
                  ? 'Tu mensaje cambia el video: el agente toca solo eso y vuelve a comprobar.'
                  : 'Contesta sus preguntas o dile qué cambiar del plan; «Hazlo» para empezar.'
                : hecho
                  ? 'Tu mensaje actualiza el guion y, si hace falta, la voz; después se vuelve a renderizar.'
                  : 'Tu mensaje cambia el guion.'}
            </span>
            <div className="chat-caja">
              <textarea
                value={texto}
                rows={2}
                placeholder={
                  modoAgente
                    ? c.agente?.resultado
                      ? 'Haz el brillo más fino y que dure 2 s más'
                      : 'Hazlo, o: que el después entre por la derecha'
                    : hecho
                      ? 'Haz el título más grande y más rápido el final'
                      : 'Hazlo más corto y empieza con una pregunta'
                }
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && trabajando) {
                    e.preventDefault()
                    onParar()
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
              />
              {trabajando ? (
                <button className="btn small chat-parar" onClick={onParar} title="Parar al agente: deja de gastar al instante" aria-label="Parar">
                  <span className="chat-cuadro" />
                </button>
              ) : (
                <button className="btn primary small" disabled={!texto.trim()} onClick={enviar} aria-label="Enviar">
                  <Icon name="sparkles" size={14} />
                </button>
              )}
            </div>
          </div>
        </aside>

        <section className="estudio-centro">
          {c.fase === 'estilo' && estilo && (
            <PasoEstilo creacion={c} ocupado={trabajando} progreso={progreso} control={estilo} />
          )}

          {modoAgente && trabajando && (
            <PanelAgente creacion={c} trabajando desde={desdeTrabajo} progreso={progreso} onPlan={() => agente.plan()} onHacer={() => agente.hacer()} onParar={onParar} />
          )}

          {!modoAgente && c.fase === 'video' && trabajando && (
            <div className="estudio-progreso">
              <span>{progreso?.texto ?? 'Haciendo el video'}</span>
              <span className="tl-progreso">
                <span style={{ width: `${Math.round((progreso?.pct ?? 0.05) * 100)}%` }} />
              </span>
              <span className="tl-dim">Diseñar y renderizar tarda unos minutos.</span>
              <button className="btn small ghost" onClick={onParar}>
                Parar
              </button>
            </div>
          )}

          {hecho && c.fase !== 'video' && (
            <div className="estudio-video">
              <video
                key={c.salida}
                className={c.formato}
                src={mediaUrl(`c-${c.id}`, c.salida!)}
                poster={c.portada ? mediaUrl(`c-${c.id}`, c.portada) : undefined}
                controls
              />
              <div className="estudio-acciones">
                <button className="btn primary" onClick={onEditor} disabled={trabajando}>
                  <Icon name="layers" size={15} /> {c.proyectoEditor ? 'Seguir en el editor' : 'Abrir en el editor'}
                </button>
                <button className="btn ghost" onClick={onMostrar}>
                  <Icon name="folder" size={15} /> Mostrar archivo
                </button>
                <span className="tl-dim">Versión {c.version}. En el editor lo cortas, le pones música, rótulos o zoom.</span>
              </div>
            </div>
          )}

          {modoAgente && !trabajando && (
            <PanelAgente creacion={c} trabajando={false} progreso={progreso} onPlan={() => agente.plan()} onHacer={() => agente.hacer()} onParar={onParar} />
          )}

          {c.guion && c.fase !== 'video' && <PasoVoz creacion={c} ocupado={trabajando} control={voz} />}

          {c.guion ? (
            <div className={`estudio-guion ${hecho || c.fase === 'video' ? 'is-secundario' : ''}`}>
              <div className="estudio-guion-cabeza">
                <h2>Guion</h2>
                <span className="tl-dim">
                  {c.guion.escenas.length} escenas · {Math.round(c.voz ? c.voz.duracion : duracionGuion(c.guion))} s
                  {c.voz ? ' (según la voz)' : ''}
                </span>
                <span className="tl-flex" />
                {!hecho && (c.fase === 'guion' || c.fase === 'voz') && (
                  <button className="btn primary" onClick={() => onVideo()} disabled={trabajando}>
                    <Icon name="play" size={15} /> Hacer el video
                  </button>
                )}
                {hecho && c.fase !== 'video' && (
                  <button className="btn small ghost" onClick={() => onVideo()} disabled={trabajando} title="Vuelve a componer el video desde este guion">
                    Rehacer desde el guion
                  </button>
                )}
              </div>
              <div className="estudio-recursos" title="Lo que usa este video ahora mismo">
                <span>
                  <Icon name="music" size={11} />
                  {c.voz ? (c.voz.origen === 'gemini' ? `Voz ${c.voz.vozGemini ?? 'Gemini'}` : 'Tu voz') : 'Sin voz'}
                  {vozDesactualizada(c) ? ' · no coincide' : ''}
                </span>
                {mediosGenerados > 0 && (
                  <span>
                    <Icon name="image" size={11} /> {mediosGenerados} {mediosGenerados === 1 ? 'imagen' : 'imágenes'} de Flow
                  </span>
                )}
                {mediosPendientes > 0 && (
                  <span>
                    <Icon name="sparkles" size={11} /> Flow hará {mediosPendientes} {mediosPendientes === 1 ? 'medio' : 'medios'}
                  </span>
                )}
                {c.adjuntos.length > 0 && (
                  <span>
                    <Icon name="paperclip" size={11} /> {c.adjuntos.length} {c.adjuntos.length === 1 ? 'adjunto' : 'adjuntos'}
                  </span>
                )}
              </div>
              <ol className="estudio-escenas">
                {c.guion.escenas.map((e, i) => (
                  <li key={i}>
                    <span className="estudio-escena-n">{i + 1}</span>
                    <div>
                      <p>{e.texto || '—'}</p>
                      {e.narracion && <span className="estudio-narracion">Voz: «{e.narracion}»</span>}
                      <small>{e.visual}</small>
                      {(e.imagen || e.clip) && !e.medio && (
                        <span className="estudio-flow">
                          <Icon name="sparkles" size={11} /> Google Flow hará {e.clip ? 'un clip con Veo' : 'una imagen'} para esta escena
                        </span>
                      )}
                    </div>
                    <span className="estudio-escena-lado">
                      {e.medio &&
                        (e.medio.tipo === 'imagen' ? (
                          <img className="estudio-medio" src={mediaUrl(`c-${c.id}`, `composicion/${e.medio.archivo}`)} alt="" />
                        ) : (
                          <video className="estudio-medio" src={mediaUrl(`c-${c.id}`, `composicion/${e.medio.archivo}`)} muted loop autoPlay playsInline />
                        ))}
                      <span className="tl-dim">{(c.voz ? duracionEnVoz(c.voz, i) : e.duracion).toFixed(1)} s</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            !trabajando &&
            c.fase !== 'estilo' &&
            !modoAgente && (
              <div className="estudio-vacio">
                <p>Todavía no hay guion.</p>
                <button className="btn primary" onClick={() => onGuion()}>
                  Escribir el guion
                </button>
              </div>
            )
          )}
          {!c.guion && trabajando && c.fase !== 'estilo' && !modoAgente && (
            <div className="estudio-vacio">
              <p>El agente está escribiendo el guion…</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
