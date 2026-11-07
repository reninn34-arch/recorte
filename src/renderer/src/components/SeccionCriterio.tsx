import { useEffect, useState } from 'react'
import { favorito, type Gustos } from '../../../shared/gustos'
import { ESTILOS } from '../../../shared/estilos'
import { Icon } from '../Icons'

/**
 * Ajustes → «Tu criterio»: lo que Recorte aprendió de cómo editas (y lo que tú le
 * dices). Todo se ve, se borra uno a uno o entero, y el aprendizaje se puede apagar.
 */
export function SeccionCriterio({ onAviso }: { onAviso: (t: string) => void }) {
  const [g, setG] = useState<Gustos | null>(null)
  const [nuevo, setNuevo] = useState('')
  const [confirmar, setConfirmar] = useState(false)

  useEffect(() => {
    void window.recorte.gustos().then(setG).catch(() => {})
  }, [])

  if (!g) return null
  const favFormato = favorito(g.usos.formato)
  const favDuracion = favorito(g.usos.duracion)
  const favEstilo = favorito(g.usos.estilo)
  const nombreEstilo = ESTILOS.find((e) => e.id === favEstilo)?.nombre
  const habitos = [
    favFormato && (favFormato === 'vertical' ? 'vertical 9:16' : 'horizontal 16:9'),
    favDuracion && `${favDuracion} s`,
    nombreEstilo && favEstilo !== 'libre' && nombreEstilo
  ].filter(Boolean)

  async function agregar() {
    const t = nuevo.trim()
    if (!t) return
    setG(await window.recorte.gustoAgregar(t))
    setNuevo('')
  }

  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>Tu criterio</h3>
        <label className="op-interruptor">
          <span>Aprender de cómo edito</span>
          <button
            role="switch"
            aria-checked={g.activo}
            className={g.activo ? 'is-on' : ''}
            onClick={() => void window.recorte.gustosActivar(!g.activo).then(setG)}
          >
            <i />
          </button>
        </label>
      </div>
      <div className="op-tarjeta">
        <div className="op-fila criterio-anadir">
          <span className="op-icono"><Icon name="sparkles" size={16} /></span>
          <div className="op-fila-texto">
            <strong>Dile qué te gusta</strong>
            <span>El agente lo respeta en cada edición y en cada video nuevo, salvo que pidas otra cosa.</span>
            <div className="criterio-caja">
              <input
                value={nuevo}
                maxLength={140}
                placeholder="Ej.: títulos cortos en mayúsculas, cortes rápidos, sin música"
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void agregar()}
              />
              <button className="btn small primary" disabled={!nuevo.trim()} onClick={() => void agregar()}>
                Añadir
              </button>
            </div>
          </div>
        </div>
        {g.lista.length === 0 ? (
          <div className="op-fila">
            <div className="op-fila-texto">
              <span>
                Todavía no sabe nada de ti. Mientras editas con el agente, aprende de lo que le dices, de lo que deshaces y de lo
                que corriges.
              </span>
            </div>
          </div>
        ) : (
          <ul className="criterio-lista">
            {[...g.lista]
              .sort((a, b) => b.veces - a.veces || b.fecha - a.fecha)
              .map((x) => (
                <li key={x.id}>
                  <span className={`criterio-origen ${x.origen}`}>{x.origen === 'dicho' ? 'Tú' : 'Aprendido'}</span>
                  <span className="criterio-texto">{x.texto}</span>
                  {x.veces > 1 && <span className="criterio-veces">×{x.veces}</span>}
                  <button
                    className="criterio-quitar"
                    title="Olvidar esto"
                    aria-label={`Olvidar: ${x.texto}`}
                    onClick={() => void window.recorte.gustoQuitar(x.id).then(setG)}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
          </ul>
        )}
        {habitos.length > 0 && (
          <div className="op-fila">
            <span className="op-icono"><Icon name="clock" size={16} /></span>
            <div className="op-fila-texto">
              <strong>Lo que más usas</strong>
              <span>Crear con IA empieza así: {habitos.join(' · ')}.</span>
            </div>
          </div>
        )}
      </div>
      <p className="op-nota">
        Todo se guarda solo en tu equipo.{' '}
        {confirmar ? (
          <>
            ¿Seguro?{' '}
            <button
              className="op-enlace"
              onClick={() =>
                void window.recorte.gustosOlvidar().then((x) => {
                  setG(x)
                  setConfirmar(false)
                  onAviso('Olvidé todo lo que había aprendido de ti.')
                })
              }
            >
              Sí, olvidar todo
            </button>{' '}
            <button className="op-enlace" onClick={() => setConfirmar(false)}>
              No
            </button>
          </>
        ) : (
          (g.lista.length > 0 || g.senales.length > 0 || habitos.length > 0) && (
            <button className="op-enlace" onClick={() => setConfirmar(true)}>
              Olvidar todo
            </button>
          )
        )}
      </p>
    </section>
  )
}
