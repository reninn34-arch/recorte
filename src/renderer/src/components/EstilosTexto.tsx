import { useEffect, useState } from 'react'
import { COLOR_BRILLO, ESTILOS_TEXTO_LISTOS, FUENTES_TEXTO, pintaDeTexto, type PintaTexto, type TextoTL } from '../../../shared/timeline'
import { sombraBrillo } from '../rotulos'
import type { EstiloTextoGuardado } from '../../../shared/api'
import { Icon } from '../Icons'

/** Una muestra «Aa» con la pinta de un estilo: la letra, sus colores, su caja, su borde y su sombra (como el monitor). */
function Muestra({ pinta }: { pinta: PintaTexto }) {
  const f = pinta.fuente ? FUENTES_TEXTO[pinta.fuente] : FUENTES_TEXTO.normal
  const familia = f?.familia ?? 'Arial'
  const conCaja = !pinta.sinCaja
  return (
    <span
      className="et-aa"
      style={{
        fontFamily: `"${familia}", Arial, sans-serif`,
        fontWeight: f?.negrita ? 700 : 400,
        fontStyle: f?.cursiva ? 'italic' : 'normal',
        color: pinta.color ?? '#ffffff',
        background: conCaja ? (pinta.caja ?? '#000000b0') : 'transparent',
        padding: conCaja ? '0.08em 0.35em' : undefined,
        borderRadius: conCaja ? '0.2em' : undefined,
        textTransform: pinta.mayusculas ? 'uppercase' : 'none',
        WebkitTextStroke: !conCaja && pinta.contorno ? `${(pinta.contorno * 2).toFixed(3)}em ${pinta.colorContorno ?? '#000000'}` : undefined,
        paintOrder: 'stroke fill',
        textShadow: conCaja
          ? 'none'
          : [pinta.sombra ? `${pinta.sombra}em ${pinta.sombra}em 0 ${pinta.colorSombra ?? '#000000'}` : '', pinta.brillo ? sombraBrillo(pinta.brillo, pinta.colorBrillo ?? COLOR_BRILLO) : '']
              .filter(Boolean)
              .join(', ') || (pinta.contorno ? 'none' : '0 0 0.12em #000c'),
        letterSpacing: pinta.espaciado ? `${pinta.espaciado}em` : undefined
      }}
    >
      Aa
    </span>
  )
}

/** Si dos pintas son la misma (para marcar el estilo que ya tiene el texto). */
function igual(a: PintaTexto, b: PintaTexto): boolean {
  return JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
}

/**
 * Los estilos de un texto, como los «Aa» de CapCut: los listos y los guardados por el usuario, en tarjetas que muestran
 * cómo queda. Un toque y el texto toma esa pinta (no cambia su tamaño, su sitio ni su animación).
 */
export function EstilosTexto({ texto, onPoner }: { texto: TextoTL; onPoner: (pinta: PintaTexto) => void }) {
  const [pestana, setPestana] = useState<'listos' | 'mios'>('listos')
  const [mios, setMios] = useState<EstiloTextoGuardado[]>([])
  const [guardado, setGuardado] = useState(false)
  useEffect(() => {
    let vivo = true
    void window.recorte
      .estilosTexto()
      .then((l) => vivo && setMios(l))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  const actual = pintaDeTexto(texto)

  async function guardar() {
    const n = mios.length + 1
    setMios(await window.recorte.estiloTextoGuardar(`Mi estilo ${n}`, actual))
    setPestana('mios')
    setGuardado(true)
    window.setTimeout(() => setGuardado(false), 2000)
  }

  const lista = pestana === 'listos' ? ESTILOS_TEXTO_LISTOS.map((e) => ({ id: e.id, nombre: e.nombre, pinta: e.pinta })) : mios
  return (
    <div className="et">
      <div className="et-cabeza">
        <div className="at-pestanas et-pestanas" role="tablist" aria-label="Estilos del texto">
          <button role="tab" aria-selected={pestana === 'listos'} className={pestana === 'listos' ? 'is-on' : ''} onClick={() => setPestana('listos')}>
            Listos
          </button>
          <button role="tab" aria-selected={pestana === 'mios'} className={pestana === 'mios' ? 'is-on' : ''} onClick={() => setPestana('mios')}>
            Míos{mios.length ? ` · ${mios.length}` : ''}
          </button>
        </div>
      </div>
      {lista.length === 0 ? (
        <p className="tl-dim et-vacio">Aún no tienes estilos guardados. Arregla un texto como te guste y toca «Guardar este estilo como mío».</p>
      ) : (
        <div className="et-rejilla" role="listbox" aria-label={pestana === 'listos' ? 'Estilos listos' : 'Mis estilos'}>
          {lista.map((e) => (
            <div key={e.id} className="et-celda">
              <button role="option" aria-selected={igual(actual, pintaDeTexto(e.pinta))} className={`et-tarjeta ${igual(actual, pintaDeTexto(e.pinta)) ? 'is-on' : ''}`} title={e.nombre} aria-label={e.nombre} onClick={() => onPoner(e.pinta)}>
                <Muestra pinta={e.pinta} />
              </button>
              {pestana === 'mios' && (
                <button
                  className="et-borrar"
                  title={`Borrar «${e.nombre}»`}
                  aria-label={`Borrar «${e.nombre}»`}
                  onClick={() => void window.recorte.estiloTextoBorrar(e.id).then(setMios)}
                >
                  <Icon name="x" size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <button className="btn small ghost et-guardar" onClick={() => void guardar()} title="Guarda la letra, los colores, la caja, el borde y la sombra de este texto para usarlos en cualquier proyecto">
        {guardado ? <Icon name="check" size={13} /> : <Icon name="plus" size={13} />} {guardado ? 'Guardado en «Míos»' : 'Guardar este estilo como mío'}
      </button>
    </div>
  )
}
