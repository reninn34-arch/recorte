import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import { estiloPorId } from '../../../shared/estilos'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

function ImagenOVideo({ imagen, video }: { imagen: string; video: string }) {
  const [sinImagen, setSinImagen] = useState(false)
  return sinImagen ? <video src={video} preload="metadata" muted /> : <img src={imagen} alt="" loading="lazy" onError={() => setSinImagen(true)} />
}

/** Lo que el chat de la conversación pone en su sitio: tu material junto a tu pedido y el video entregado al final. */
export interface ExtrasChat {
  centro: true
  material?: React.ReactNode
  entrega?: React.ReactNode
}

/**
 * Una conversación con el agente, en el centro: tu pedido con tu material, el plan, sus pasos marcándose y, al
 * entregar, el video como una tarjeta para verlo o abrirlo en el editor (con cada foto, rótulo y frase de voz en su
 * pista). Es el mismo chat que va a la derecha del editor.
 */
export function EstudioAgente({
  creacion,
  trabajando,
  onEditor,
  chat
}: {
  creacion: Creacion
  trabajando: boolean
  /** Abre el video ya hecho en el editor (si no se abrió solo). */
  onEditor: () => void
  chat: (extras: ExtrasChat) => React.ReactNode
}) {
  const c = creacion
  const res = c.agente?.resultado
  const url = (archivo: string) => mediaUrl(`c-${c.id}`, archivo)

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

  const entrega =
    res?.tipo === 'imagen' ? (
      <div className="conv-entrega">
        <img className="conv-entrega-imagen" src={url(res.archivo)} alt="" />
      </div>
    ) : c.salida ? (
      <div className="conv-entrega">
        <video className={`conv-entrega-video ${c.formato}`} src={url(c.salida)} poster={c.portada ? url(c.portada) : undefined} controls preload="metadata" />
        <div className="conv-entrega-texto">
          <strong>{c.guion?.titulo ?? c.nombre} · versión {c.version}</strong>
          <span>{c.formato === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'} · guardado en tu carpeta de videos</span>
          <div className="conv-entrega-botones">
            <button className="btn primary" onClick={onEditor} disabled={trabajando}>
              <Icon name="layers" size={15} /> Abrir en el editor
            </button>
          </div>
          <span className="conv-entrega-nota">En el editor cada foto, rótulo y frase de voz queda suelta para tocarla a mano, con este mismo chat al lado.</span>
        </div>
      </div>
    ) : undefined

  return (
    <div className="conv">
      <header className="conv-cabeza">
        <div className="conv-titulo">
          <h1>{c.guion?.titulo ?? c.nombre}</h1>
          <span>
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
      <div className="conv-cuerpo">{chat({ centro: true, material, entrega })}</div>
    </div>
  )
}
