import { useEffect, useState } from 'react'
import type { EstadoUso, ServicioUso } from '../../../shared/api'
import { Icon } from '../Icons'
import { LogoAgente } from './Logos'

/**
 * Ajustes › Uso: cuánto le queda a cada cosa con cuota (los agentes, la voz de Google, los créditos de Flow) y cuándo se
 * renueva, con lo que cada uno informa (sin gastar). «Actualizar» vuelve a leerlo: en Claude es una consulta mínima.
 */

const LOGO: Record<string, string> = { voz: 'gemini', flow: 'gemini' }

function hace(t?: number): string {
  if (!t) return ''
  const min = Math.round((Date.now() - t) / 60_000)
  return min < 1 ? 'leído ahora' : min < 60 ? `leído hace ${min} min` : min < 48 * 60 ? `leído hace ${Math.round(min / 60)} h` : `leído hace ${Math.round(min / 1440)} días`
}

function cuando(ms: number): string {
  const d = new Date(ms)
  const hoy = new Date()
  const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`
  const manana = new Date(hoy)
  manana.setDate(hoy.getDate() + 1)
  if (d.toDateString() === manana.toDateString()) return `mañana a las ${hora}`
  return `el ${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${hora}`
}

const PUNTO: Record<ServicioUso['nivel'], string> = { ok: 'ok', alto: 'aviso', agotado: 'error', 'sin-datos': 'medio' }

function Fila({ s, actualizando, onActualizar }: { s: ServicioUso; actualizando: boolean; onActualizar: () => void }) {
  return (
    <div className="op-fila uso-fila">
      <LogoAgente id={(LOGO[s.id] ?? s.id) as Parameters<typeof LogoAgente>[0]['id']} size={36} />
      <div className="op-fila-texto">
        <strong>
          <span className={`agente-punto ${PUNTO[s.nivel]}`} /> {s.nombre}
          {s.cuenta && <span className="uso-cuenta">· cuenta {s.cuenta}</span>}
        </strong>
        {s.ventanas.map((v) => (
          <div key={v.nombre} className="uso-ventana">
            <div className="uso-barra" aria-hidden>
              <i className={v.usado >= 0.999 ? 'agotado' : v.usado >= 0.9 ? 'alto' : ''} style={{ width: `${Math.round(v.usado * 100)}%` }} />
            </div>
            <span>
              {v.nombre}: {Math.round(v.usado * 100)} % usado{v.renueva ? ` · se renueva ${cuando(v.renueva)}` : ''}
            </span>
          </div>
        ))}
        {s.agotadoHasta && <span className="uso-agotado">Sin cuota hasta {cuando(s.agotadoHasta)}.</span>}
        {(s.nota || s.leido) && <span>{[s.nota, hace(s.leido)].filter(Boolean).join(' · ')}</span>}
        {!s.ventanas.length && !s.nota && !s.agotadoHasta && <span>Todavía sin datos: se ven al usarlo.</span>}
      </div>
      {s.actualizable && (
        <div className="op-fila-lado">
          <button className="btn small" disabled={actualizando} onClick={onActualizar} title={s.id === 'claude' ? 'Hace una consulta mínima con el modelo más barato para leer tu uso' : 'Vuelve a leer los créditos'}>
            {actualizando ? 'Leyendo…' : 'Actualizar'}
          </button>
        </div>
      )}
    </div>
  )
}

export function SeccionUso({ onAviso }: { onAviso: (texto: string) => void }) {
  const [uso, setUso] = useState<EstadoUso | null>(null)
  const [actualizando, setActualizando] = useState<string | null>(null)

  useEffect(() => {
    void window.recorte.usoEstado().then(setUso).catch(() => setUso(null))
  }, [])

  async function actualizar(id: string) {
    setActualizando(id)
    try {
      setUso(await window.recorte.usoActualizar(id))
    } catch {
      onAviso('No pude leer el uso ahora.')
    } finally {
      setActualizando(null)
    }
  }

  if (!uso?.servicios.length) return null
  return (
    <section className="op-seccion">
      <div className="op-titulo">
        <h3>Uso</h3>
        <button className="btn small ghost" onClick={() => void window.recorte.usoEstado().then(setUso)} title="Volver a mirar">
          <Icon name="repetir" size={14} />
        </button>
      </div>
      <div className="op-tarjeta">
        {uso.servicios.map((s) => (
          <Fila key={s.id} s={s} actualizando={actualizando === s.id} onActualizar={() => void actualizar(s.id)} />
        ))}
      </div>
      <p className="op-nota">
        Lo que informa cada uno, sin gastar: Claude lo cuenta en cada turno y Codex lo guarda en sus sesiones. Si a un agente
        le queda poco o la voz se acabó por hoy, Recorte te avisa en el plan antes de hacer el video.
      </p>
    </section>
  )
}
