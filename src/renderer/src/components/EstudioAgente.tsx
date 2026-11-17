import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import { estiloPorId } from '../../../shared/estilos'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

function ImagenOVideo({ imagen, video }: { imagen: string; video: string }) {
  const [sinImagen, setSinImagen] = useState(false)
  return sinImagen ? <video src={video} preload="metadata" muted /> : <img src={imagen} alt="" loading="lazy" onError={() => setSinImagen(true)} />
}

/** Lo que el chat de la conversación pone en su sitio: los videos anteriores, tu material y el video entregado. */
export interface ExtrasChat {
  centro: true
  material?: React.ReactNode
  entrega?: React.ReactNode
  antes?: React.ReactNode
}

/** La tarjeta de un video de la conversación: verlo, y abrirlo en el editor con cada pieza en su pista. */
function TarjetaVideo({ c, numero, onEditor, ocupado }: { c: Creacion; numero?: number; onEditor: () => void; ocupado: boolean }) {
  const url = (archivo: string) => mediaUrl(`c-${c.id}`, archivo)
  const res = c.agente?.resultado
  if (res?.tipo === 'imagen') {
    return (
      <div className="conv-entrega">
        <img className="conv-entrega-imagen" src={url(res.archivo)} alt="" />
      </div>
    )
  }
  if (!c.salida) return null
  return (
    <div className="conv-entrega">
      <video className={`conv-entrega-video ${c.formato}`} src={url(c.salida)} poster={c.portada ? url(c.portada) : undefined} controls preload="metadata" />
      <div className="conv-entrega-texto">
        <strong>
          {numero ? `Video ${numero} · ` : ''}
          {c.guion?.titulo ?? c.nombre} · versión {c.version}
        </strong>
        <span>{c.formato === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'} · guardado en tu carpeta de videos</span>
        <div className="conv-entrega-botones">
          <button className="btn primary" onClick={onEditor} disabled={ocupado}>
            <Icon name="layers" size={15} /> Abrir en el editor
          </button>
        </div>
        <span className="conv-entrega-nota">En el editor cada foto, rótulo y frase de voz queda suelta para tocarla a mano, con este mismo chat al lado.</span>
      </div>
    </div>
  )
}

/** Un video anterior de la conversación, ya cerrado: lo que pediste, lo último que dijo el agente y su tarjeta. */
function VideoAnterior({ c, numero, onEditor, ocupado }: { c: Creacion; numero: number; onEditor: () => void; ocupado: boolean }) {
  const ultimo = [...c.mensajes].reverse().find((m) => m.rol === 'agente' && m.texto && !m.error)
  return (
    <div className="conv-anterior">
      <span className="conv-separador">Video {numero}</span>
      <div className="chat-msg usuario">
        <p>{c.peticion}</p>
      </div>
      {ultimo && (
        <div className="chat-msg agente conv-anterior-resumen">
          <p>{ultimo.texto}</p>
        </div>
      )}
      <TarjetaVideo c={c} numero={numero} onEditor={onEditor} ocupado={ocupado} />
    </div>
  )
}

/**
 * Una conversación con el agente, en el centro: tu pedido con tu material, el plan, sus pasos marcándose y, al
 * entregar, el video como una tarjeta para verlo o abrirlo en el editor (con cada foto, rótulo y frase de voz en su
 * pista). Con «Otro video así» la conversación sigue con otro video del mismo estilo: los anteriores quedan arriba,
 * cada uno con su tarjeta. Es el mismo chat que va a la derecha del editor.
 */
export function EstudioAgente({
  creacion,
  anteriores,
  trabajando,
  onEditor,
  onAbrirVideo,
  chat
}: {
  creacion: Creacion
  /** Los videos anteriores de esta conversación (del más viejo al más nuevo). */
  anteriores: Creacion[]
  trabajando: boolean
  /** Abre el video de ahora en el editor. */
  onEditor: () => void
  /** Abre en el editor un video anterior de la conversación. */
  onAbrirVideo: (id: string) => void
  chat: (extras: ExtrasChat) => React.ReactNode
}) {
  const c = creacion
  const url = (archivo: string) => mediaUrl(`c-${c.id}`, archivo)
  const numero = anteriores.length + 1

  const material =
    c.adjuntos.length > 0 ? (
      <div className="ea-material conv-material">
        {c.adjuntos.map((a) => (
          <figure key={a.archivo} title={a.nombre} className={a.tipo === 'video' ? 'is-video' : ''}>
            {a.tipo === 'imagen' ? (
              <img src={url(a.archivo)} alt="" loading="lazy" />
            ) : a.tipo === 'audio' ? (
              <div className="ea-audio">
                <Icon name="music" size={20} />
                <span>Tu narración</span>
                <audio src={url(a.archivo)} controls preload="metadata" />
              </div>
            ) : (
              // Los .MOV del iPhone (HEVC) no siempre se ven aquí: se muestra su hoja de fotogramas del vistazo y, si aún
              // no existe, el video.
              <ImagenOVideo
                imagen={url(`trabajo/vistazo/video-${String(c.adjuntos.filter((x) => x.tipo === 'video').indexOf(a) + 1).padStart(2, '0')}.jpg`)}
                video={`${url(a.archivo)}#t=0.5`}
              />
            )}
            <figcaption>
              {a.tipo === 'video' && <Icon name="film" size={11} />} {a.nombre}
            </figcaption>
          </figure>
        ))}
      </div>
    ) : undefined

  const antes = anteriores.length ? (
    <>
      {anteriores.map((a, i) => (
        <VideoAnterior key={a.id} c={a} numero={i + 1} onEditor={() => onAbrirVideo(a.id)} ocupado={trabajando} />
      ))}
      <span className="conv-separador">Video {numero}</span>
    </>
  ) : undefined

  const entrega = <TarjetaVideo c={c} numero={anteriores.length ? numero : undefined} onEditor={onEditor} ocupado={trabajando} />
  const primera = anteriores[0] ?? c

  return (
    <div className="conv">
      <header className="conv-cabeza">
        <div className="conv-titulo">
          <h1>{primera.guion?.titulo ?? primera.nombre}</h1>
          <span>
            {anteriores.length ? `${numero} videos · ` : ''}
            {estiloPorId(c.estilo).nombre} · {c.formato === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'} · {c.vozElegida ? `Voz ${c.vozElegida}` : 'Sin voz'} ·{' '}
            {c.directo ? 'Hazlo directo' : 'Pregúntame antes'}
          </span>
        </div>
        {c.salida && (
          <button className="btn small" onClick={onEditor} disabled={trabajando}>
            <Icon name="layers" size={14} /> Abrir en el editor
          </button>
        )}
      </header>
      <div className="conv-cuerpo">{chat({ centro: true, material, entrega: c.salida || c.agente?.resultado ? entrega : undefined, antes })}</div>
    </div>
  )
}
