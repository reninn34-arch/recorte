import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

function ImagenOVideo({ imagen, video }: { imagen: string; video: string }) {
  const [sinImagen, setSinImagen] = useState(false)
  return sinImagen ? <video src={video} preload="metadata" muted /> : <img src={imagen} alt="" loading="lazy" onError={() => setSinImagen(true)} />
}

/**
 * Lo que se ve de una creación del agente mientras todavía no hay video: tu material al
 * centro y, en cuanto el agente entrega, el editor ocupa este mismo lugar (con cada foto,
 * rótulo y frase de voz en su pista). El chat va a la derecha, como en el editor.
 */
export function EstudioAgente({
  creacion,
  trabajando,
  onVolver,
  onEditor,
  chat
}: {
  creacion: Creacion
  trabajando: boolean
  onVolver: () => void
  /** Abre el video ya hecho en el editor (si no se abrió solo). */
  onEditor: () => void
  chat: React.ReactNode
}) {
  const c = creacion
  const res = c.agente?.resultado
  const url = (archivo: string) => mediaUrl(`c-${c.id}`, archivo)

  return (
    <div className="estudio estudio-agente">
      <header className="estudio-cabeza">
        <button className="btn small ghost boton-volver" onClick={onVolver}>
          <Icon name="chevron" size={14} /> Inicio
        </button>
        <div className="estudio-titulo">
          <strong>{c.nombre}</strong>
          <span>
            {c.formato === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'} · {c.vozElegida ? `Voz ${c.vozElegida}` : 'Sin voz'} ·{' '}
            {c.directo ? 'Hazlo directo' : 'Pregúntame antes'}
          </span>
        </div>
      </header>

      <div className="ea-cuerpo">
        <section className="ea-centro">
          {res?.tipo === 'imagen' ? (
            <img className="ea-resultado" src={url(res.archivo)} alt="" />
          ) : c.salida ? (
            <div className="ea-listo">
              <video className={`ea-video ${c.formato}`} src={url(c.salida)} poster={c.portada ? url(c.portada) : undefined} controls />
              <button className="btn primary" onClick={onEditor} disabled={trabajando}>
                <Icon name="layers" size={15} /> Abrir en el editor
              </button>
            </div>
          ) : (
            <>
              <div className="ea-aviso">
                <Icon name="sparkles" size={14} />
                <span>
                  {trabajando
                    ? 'El agente está trabajando. Cuando entregue, el video se abre aquí mismo en el editor, con cada pieza en su pista para tocarla a mano.'
                    : c.directo
                      ? 'Cuéntale lo que quieras en el chat. Al terminar, el video se abre aquí en el editor.'
                      : 'Habla con el agente en el chat: te propone ideas y te pregunta hasta tener el plan. Cuando digas «Hazlo», lo hace y se abre aquí en el editor.'}
                </span>
              </div>
              {c.adjuntos.length > 0 ? (
                <div className="ea-material">
                  {c.adjuntos.map((a) => (
                    <figure key={a.archivo} title={a.nombre} className={a.tipo === 'video' ? 'is-video' : ''}>
                      {a.tipo === 'imagen' ? (
                        <img src={url(a.archivo)} alt="" loading="lazy" />
                      ) : a.tipo === 'audio' ? (
                        <div className="ea-audio">
                          <Icon name="music" size={22} />
                          <span>Tu narración</span>
                          <audio src={url(a.archivo)} controls preload="metadata" />
                        </div>
                      ) : (
                        // Los .MOV del iPhone (HEVC) no siempre se ven aquí: se muestra su hoja de
                        // fotogramas del vistazo y, si aún no existe, el video.
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
              ) : (
                <p className="tl-dim">Sin material: el agente lo hará con diseño, textos y lo que genere. Añade fotos o videos con el «+» del chat.</p>
              )}
            </>
          )}
        </section>
        {chat}
      </div>
    </div>
  )
}
