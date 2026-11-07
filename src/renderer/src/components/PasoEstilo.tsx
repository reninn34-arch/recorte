import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import { nombreRecurso, type FichaEstilo } from '../../../shared/estilo'
import { Icon } from '../Icons'

/**
 * La fase «Estilo» del estudio (solo si la creación tiene video de referencia):
 * primero se analiza el material y la referencia; después se muestra la ficha de
 * estilo —editable a mano en lo básico (subtítulos y ritmo)— y el informe de lo que
 * se puede copiar con lo conectado hoy, con atajos para conectar lo que falta.
 */

export interface ControlEstilo {
  /** La llave de AI Studio está: se puede ofrecer «Analizar con Gemini viendo el video». */
  geminiDisponible: boolean
  analizar: (modo?: 'gemini') => void
  continuar: () => void
  /** Recalcula la viabilidad (tras conectar algo). */
  recalcular: () => void
  guardarFicha: (cambios: { subtitulos?: { lleva?: boolean; modo?: 'palabra' | 'frase' }; ritmoSegundos?: number }) => void
  /** Lleva a Ajustes para conectar Flow, ChatGPT o la voz. */
  irAAjustes: () => void
}

function Fila({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="pe-fila">
      <span className="pe-titulo">{titulo}</span>
      <span>{children}</span>
    </div>
  )
}

function Ficha({ ficha, ocupado, onGuardar }: { ficha: FichaEstilo; ocupado: boolean; onGuardar: ControlEstilo['guardarFicha'] }) {
  const sub = ficha.subtitulos
  return (
    <div className="pe-ficha">
      <p className="pe-resumen">{ficha.resumen}</p>
      {(ficha.aproximada || ficha.nota) && (
        <p className="pe-aviso">
          <Icon name="sparkles" size={12} /> {ficha.nota ?? 'Ficha aproximada: tu agente no vio las imágenes, así que esto salió solo de lo medido.'}
        </p>
      )}
      <Fila titulo="Ritmo de corte">
        un plano cada{' '}
        <input
          className="pe-num"
          type="number"
          min={0.3}
          max={20}
          step={0.1}
          defaultValue={(ficha.ritmoSegundos ?? 0) || ''}
          placeholder="—"
          disabled={ocupado}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v) && v >= 0.3 && v !== ficha.ritmoSegundos) onGuardar({ ritmoSegundos: v })
          }}
        />{' '}
        s
      </Fila>
      <Fila titulo="Subtítulos">
        <label className="pe-check">
          <input type="checkbox" checked={sub.lleva} disabled={ocupado} onChange={(e) => onGuardar({ subtitulos: { lleva: e.target.checked } })} /> los lleva
        </label>
        {sub.lleva && (
          <>
            {sub.posicion && <> · {sub.posicion}</>}
            {sub.tamano && <> · {sub.tamano}</>}
            {sub.color && <> · {sub.color}</>}
            {sub.mayusculas ? ' · MAYÚSCULAS' : ''}
            {' · '}
            <select
              className="pe-select"
              value={sub.modo ?? 'frase'}
              disabled={ocupado}
              onChange={(e) => onGuardar({ subtitulos: { modo: e.target.value as 'palabra' | 'frase' } })}
            >
              <option value="palabra">palabra por palabra</option>
              <option value="frase">por frase</option>
            </select>
          </>
        )}
      </Fila>
      {ficha.gancho && <Fila titulo="Primeros 3 s">{ficha.gancho}</Fila>}
      {ficha.tipografia && <Fila titulo="Tipografía">{ficha.tipografia}</Fila>}
      {ficha.zooms && ficha.zooms !== 'ninguno' && <Fila titulo="Zooms">{ficha.zooms}</Fila>}
      {ficha.broll && <Fila titulo="B-roll">{ficha.broll}</Fila>}
      {ficha.recortesPersona ? <Fila titulo="Persona">recortada, sin fondo</Fila> : null}
      {ficha.textos && <Fila titulo="Textos">{ficha.textos}</Fila>}
      {ficha.motion && <Fila titulo="Motion">{ficha.motion}</Fila>}
      {ficha.transiciones && <Fila titulo="Transiciones">{ficha.transiciones}</Fila>}
      {ficha.musica && <Fila titulo="Música">{ficha.musica}</Fila>}
    </div>
  )
}

export function PasoEstilo({ creacion, ocupado, progreso, control }: { creacion: Creacion; ocupado: boolean; progreso: { pct: number; texto?: string } | null; control: ControlEstilo }) {
  const c = creacion
  const [modoGemini, setModoGemini] = useState(false)
  if (!c.referencia) return null

  // Aún sin analizar: la puerta de entrada de la fase.
  if (!c.ficha) {
    return (
      <div className="estudio-voz paso-estilo">
        <div className="estudio-guion-cabeza">
          <h2>Estilo</h2>
          <span className="tl-dim">La referencia: {c.referencia.nombre}</span>
        </div>
        {ocupado ? (
          <div className="estudio-progreso">
            <span>{progreso?.texto ?? 'Analizando'}</span>
            <span className="tl-progreso">
              <span style={{ width: `${Math.round((progreso?.pct ?? 0.05) * 100)}%` }} />
            </span>
            <span className="tl-dim">Se miden tus videos y la referencia en tu equipo; la escucha con Whisper puede tardar unos minutos.</span>
          </div>
        ) : (
          <>
            <p className="tl-dim">
              Primero Recorte analiza tu material y la referencia en tu equipo (planos, ritmo, voz, color). Después tu agente
              estudia los fotogramas y te enseña la ficha de estilo y qué se puede copiar con lo que tienes conectado.
            </p>
            <div className="voz-fila">
              <button className="btn primary" onClick={() => control.analizar()}>
                <Icon name="sparkles" size={14} /> Analizar el estilo
              </button>
              {control.geminiDisponible && (
                <button className="btn ghost" onClick={() => (setModoGemini(true), control.analizar('gemini'))} disabled={modoGemini}>
                  Analizar con Gemini viendo el video completo
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  const v = c.viabilidad
  return (
    <div className="estudio-voz paso-estilo">
      <div className="estudio-guion-cabeza">
        <h2>Estilo</h2>
        <span className="tl-dim">Copiado de: {c.referencia.nombre}</span>
        <span className="tl-flex" />
        <button className="btn small ghost" onClick={() => control.analizar()} disabled={ocupado} title="Vuelve a medir la referencia y a pedir la ficha al agente">
          Volver a analizar
        </button>
      </div>

      <Ficha ficha={c.ficha} ocupado={ocupado} onGuardar={control.guardarFicha} />

      {v && (
        <div className="pe-viabilidad">
          <div className="estudio-guion-cabeza">
            <h2>Qué se puede copiar</h2>
            <span className="tl-dim">Este estilo se puede copiar en un {v.porcentaje} % con lo que tienes conectado.</span>
          </div>
          <ul className="pe-lista">
            {v.items.map((item) => (
              <li key={item.tipo} className={item.estado === 'si' ? 'ok' : item.estado === 'parcial' ? 'parcial' : 'falta'}>
                <Icon name={item.estado === 'si' ? 'check' : item.estado === 'parcial' ? 'sliders' : 'x'} size={13} />
                <span>
                  <b>{nombreRecurso(item.tipo)}.</b> {item.detalle}
                </span>
              </li>
            ))}
          </ul>
          {v.paraConectar.length > 0 && (
            <div className="voz-fila">
              <span className="tl-dim">Para subir el porcentaje: {v.paraConectar.join(' · ')}</span>
              <button className="btn small" onClick={control.irAAjustes}>
                Conectar en Ajustes
              </button>
              <button className="btn small ghost" onClick={control.recalcular} disabled={ocupado} title="Tras conectar algo, recalcula sin volver a analizar">
                Ya lo conecté
              </button>
            </div>
          )}
        </div>
      )}

      <div className="voz-fila">
        <button className="btn primary" onClick={control.continuar} disabled={ocupado}>
          Continuar así (≈{v?.porcentaje ?? '?'} % parecido) →
        </button>
        <span className="tl-dim">El guion que se escriba después recibe esta ficha.</span>
      </div>
    </div>
  )
}
