import { useState } from 'react'
import { ANIMACIONES_TEXTO, BUCLES_TEXTO, durSalidaTexto, SALIDAS_TEXTO, type AnimacionTexto, type BucleTexto, type SalidaTexto, type TextoTL } from '../../../shared/timeline'

type Pestana = 'entrada' | 'salida' | 'bucle'

/** Nombres cortos para las tarjetas (los largos van en el título). */
const CORTOS: Record<string, string> = {
  rotulo: 'Rótulo',
  palabras: 'Palabra a palabra',
  'palabras-desenfoque': 'Palabras nítidas',
  desenfoque: 'Desenfoque',
  pintar: 'Pintar',
  maquina: 'Máquina',
  pop: 'Rebote',
  subir: 'Subir',
  zoom: 'Desde grande',
  izquierda: 'Desde la izquierda',
  derecha: 'Desde la derecha',
  fundido: 'Fundido',
  encoger: 'Encoger',
  agrandar: 'Agrandar'
}

/** Las animaciones que van palabra a palabra o letra a letra: su muestra se arma por trozos. */
const POR_TROZOS = new Set(['palabras', 'palabras-desenfoque', 'pintar', 'maquina'])

/**
 * Las animaciones de un texto como en CapCut: tres pestañas (Entrada, Salida, En bucle), cada una con una cuadrícula de
 * tarjetas que muestran la animación moviéndose. Al tocar una se aplica y se ve en el monitor (`onVer`).
 */
export function AnimacionesTexto({
  texto,
  onCambio,
  onVer,
  duracionSalida
}: {
  texto: TextoTL
  onCambio: (cambio: Partial<TextoTL>) => void
  /** Pone el cabezal donde se ve esa animación y reproduce. */
  onVer: (que: Pestana) => void
  /** El ajuste de lo que dura la salida (se muestra en su pestaña si tiene salida). */
  duracionSalida: React.ReactNode
}) {
  const [pestana, setPestana] = useState<Pestana>('entrada')
  const elegida = pestana === 'entrada' ? texto.animacion : pestana === 'salida' ? texto.salida : texto.bucle
  const lista: { id: string; nombre: string }[] = pestana === 'entrada' ? ANIMACIONES_TEXTO : pestana === 'salida' ? SALIDAS_TEXTO : BUCLES_TEXTO
  const poner = (id: string | undefined) => {
    if (pestana === 'entrada') onCambio({ animacion: id as AnimacionTexto | undefined })
    else if (pestana === 'salida') onCambio({ salida: id as SalidaTexto | undefined })
    else onCambio({ bucle: id as BucleTexto | undefined })
    if (id) onVer(pestana)
  }
  const cuenta = (p: Pestana) => (p === 'entrada' ? texto.animacion : p === 'salida' ? texto.salida : texto.bucle)
  return (
    <div className="at">
      <div className="at-pestanas" role="tablist" aria-label="Animación del texto">
        {(
          [
            ['entrada', 'Entrada'],
            ['salida', 'Salida'],
            ['bucle', 'En bucle']
          ] as const
        ).map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={pestana === id} className={pestana === id ? 'is-on' : ''} onClick={() => setPestana(id)}>
            {nombre}
            {cuenta(id) && <i className="at-punto" aria-label="(tiene una)" />}
          </button>
        ))}
      </div>
      <div className="at-rejilla" role="listbox" aria-label={pestana === 'entrada' ? 'Cómo aparece' : pestana === 'salida' ? 'Cómo se va' : 'Cómo se mueve mientras está'}>
        <button role="option" aria-selected={!elegida} className={`at-tarjeta ${!elegida ? 'is-on' : ''}`} onClick={() => poner(undefined)} title="Sin animación">
          <span className="at-muestra at-nada" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M5.6 18.4 18.4 5.6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <small>Ninguna</small>
        </button>
        {lista.map((a) => (
          <button
            key={a.id}
            role="option"
            aria-selected={elegida === a.id}
            className={`at-tarjeta ${elegida === a.id ? 'is-on' : ''}`}
            onClick={() => poner(a.id)}
            title={a.nombre}
          >
            <span className="at-muestra" aria-hidden="true">
              {POR_TROZOS.has(a.id) ? (
                <span className={`at-demo at-${pestana}-${a.id}`}>
                  {(a.id === 'maquina' ? ['A', 'b', 'c'] : ['Aa', 'Bb']).map((x, i) => (
                    <b key={i} style={{ animationDelay: `${i * (a.id === 'maquina' ? 0.18 : 0.3)}s` }}>
                      {x}
                    </b>
                  ))}
                </span>
              ) : (
                <span className={`at-demo at-${pestana}-${a.id}`}>Aa</span>
              )}
            </span>
            <small>{CORTOS[a.id] ?? a.nombre}</small>
          </button>
        ))}
      </div>
      {pestana === 'salida' && texto.salida && duracionSalida}
      {pestana === 'bucle' && texto.bucle && <span className="tl-dim">Se mueve mientras está en pantalla, después de entrar y antes de irse.</span>}
      {pestana === 'salida' && texto.salida && durSalidaTexto(texto) >= texto.duracion / 2 && (
        <span className="tl-dim">La salida dura la mitad del texto o más: se verá poco tiempo quieto.</span>
      )}
    </div>
  )
}
