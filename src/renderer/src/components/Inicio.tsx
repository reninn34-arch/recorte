import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import type { Project } from '../../../shared/types'
import type { Agentes } from '../hooks/agentes'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'
import { ListaAgentes } from './ListaAgentes'
import { CarpetaVideos } from './CarpetaVideos'

/**
 * La pantalla de inicio, como al abrir cualquier editor de video: crear un proyecto o
 * abrir uno reciente. A la derecha, el agente que edita contigo; si no hay ninguno
 * conectado, la conexión es lo primero que se ve, con un clic y sin comandos.
 */

function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

function hace(fecha: number): string {
  const min = Math.round((Date.now() - fecha) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.round(horas / 24)
  if (dias < 30) return dias === 1 ? 'ayer' : `hace ${dias} días`
  return new Date(fecha).toLocaleDateString('es')
}

export function Inicio({
  proyectos,
  agentes,
  onAbrir,
  onNuevo,
  importando,
  abierto,
  creaciones,
  onCrearIA,
  onAbrirCreacion,
  onAjustes,
  onBorrar
}: {
  onAjustes: () => void
  onBorrar: (tipo: 'proyecto' | 'creacion', id: string) => Promise<void>
  creaciones: Creacion[]
  onCrearIA: () => void
  onAbrirCreacion: (id: string) => void
  proyectos: Project[]
  agentes: Agentes
  onAbrir: (id: string) => void
  onNuevo: () => void
  importando: boolean
  abierto?: string
}) {
  const sinAgente = agentes.cargado && !agentes.listo
  const [borrando, setBorrando] = useState<{ tipo: 'proyecto' | 'creacion'; id: string; nombre: string } | null>(null)
  const [enCurso, setEnCurso] = useState(false)

  return (
    <div className="inicio">
      {borrando && (
        <div className="confirmar-fondo" onClick={() => !enCurso && setBorrando(null)}>
          <div className="confirmar" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true">
            <h3>¿Borrar «{borrando.nombre}»?</h3>
            <p>
              {borrando.tipo === 'proyecto'
                ? 'Se va a la Papelera con su timeline, transcripción y proxys. Tu video original y lo que ya exportaste a tu carpeta no se tocan.'
                : 'Se va a la Papelera con su guion, voz y versiones. Las copias que ya están en tu carpeta de videos no se tocan.'}
            </p>
            <div className="confirmar-botones">
              <button className="btn small ghost" onClick={() => setBorrando(null)} disabled={enCurso}>
                Cancelar
              </button>
              <button
                className="btn small peligro"
                disabled={enCurso}
                onClick={async () => {
                  setEnCurso(true)
                  try {
                    await onBorrar(borrando.tipo, borrando.id)
                    setBorrando(null)
                  } finally {
                    setEnCurso(false)
                  }
                }}
              >
                <Icon name="trash" size={14} /> {enCurso ? 'Borrando…' : 'Borrar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="inicio-cabeza">
        <div className="brand">
          <span className="brand-mark"><Icon name="scissors" size={17} /></span>
          <span className="brand-name">recorte</span>
        </div>
        <div className="inicio-cabeza-lado">
          <span className="pill"><span className="dot" /> Todo en tu equipo</span>
          <button className="btn small ghost" onClick={onAjustes}>
            <Icon name="settings" size={15} /> Ajustes
          </button>
        </div>
      </header>

      <div className="inicio-cuerpo">
        <section className="inicio-proyectos">
          <CarpetaVideos modo="aviso" />

          <div className="inicio-puertas">
            <button className="inicio-puerta" onClick={onNuevo} disabled={importando}>
              <span className="inicio-puerta-icono"><Icon name="film" size={22} /></span>
              <strong>{importando ? 'Importando…' : 'Editar un video'}</strong>
              <span>Importa tu grabación y edítala en la timeline, a mano o con el agente.</span>
            </button>
            <button className="inicio-puerta is-ia" onClick={onCrearIA}>
              <span className="inicio-puerta-icono"><Icon name="sparkles" size={22} /></span>
              <strong>Crear con IA</strong>
              <span>Cuéntale la idea: el agente escribe el guion y hace el video. Sin grabar nada.</span>
            </button>
          </div>

          <div className="inicio-titulo">
            <h2>Recientes</h2>
          </div>

          <div className="inicio-grid">
            {creaciones.map((c) => (
              <div
                key={c.id}
                className="inicio-tarjeta"
                role="button"
                tabIndex={0}
                onClick={() => onAbrirCreacion(c.id)}
                onKeyDown={(ev) => ev.key === 'Enter' && onAbrirCreacion(c.id)}
                title={c.peticion}
              >
                <button
                  className="inicio-borrar"
                  title="Borrar"
                  aria-label="Borrar"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setBorrando({ tipo: 'creacion', id: c.id, nombre: c.guion?.titulo ?? c.nombre })
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
                <span className={`inicio-miniatura ${c.formato}`}>
                  {c.portada ? <img src={mediaUrl(`c-${c.id}`, c.portada)} alt="" /> : <Icon name="sparkles" size={24} />}
                  <span className="inicio-tipo"><Icon name="sparkles" size={11} /> IA</span>
                </span>
                <span className="inicio-nombre">{c.guion?.titulo ?? c.nombre}</span>
                <span className="inicio-meta">
                  {hace(c.updatedAt)} · {c.fase === 'listo' ? `versión ${c.version}` : c.fase === 'video' ? 'haciendo el video' : c.guion ? 'guion listo' : 'empezando'}
                </span>
              </div>
            ))}
            {proyectos.map((p) => (
              <div
                key={p.id}
                className={`inicio-tarjeta ${p.id === abierto ? 'is-abierto' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => onAbrir(p.id)}
                onKeyDown={(ev) => ev.key === 'Enter' && onAbrir(p.id)}
                title={p.source.path}
              >
                <button
                  className="inicio-borrar"
                  title="Borrar"
                  aria-label="Borrar"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    setBorrando({ tipo: 'proyecto', id: p.id, nombre: p.name })
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
                <span className="inicio-miniatura">
                  {p.thumbnail ? <img src={mediaUrl(p.id, p.thumbnail)} alt="" /> : <Icon name="film" size={24} />}
                  <span className="inicio-duracion">{duracion(p.source.duration)}</span>
                </span>
                <span className="inicio-nombre">{p.name}</span>
                <span className="inicio-meta">
                  {hace(p.updatedAt)}
                  {p.timeline ? ` · ${p.timeline.clips.length} ${p.timeline.clips.length === 1 ? 'clip' : 'clips'}` : ''}
                  {p.transcription === 'lista' ? ' · transcrito' : ''}
                </span>
              </div>
            ))}
          </div>

          {proyectos.length === 0 && creaciones.length === 0 && (
            <p className="inicio-vacio">Todavía no hay nada aquí. Empieza por una de las dos puertas: todo se queda en tu equipo.</p>
          )}
        </section>

        <aside className={`inicio-agente ${sinAgente ? 'is-pide' : ''}`}>
          <h2>{agentes.activo ? 'Tu agente' : 'Conecta tu agente'}</h2>
          <p>
            {agentes.activo
              ? `${agentes.activo.nombre} edita contigo con tu propia cuenta.`
              : 'Elige con qué cuenta trabaja la IA. Recorte lo instala y abre el inicio de sesión: sin comandos ni claves.'}
          </p>

          <div className="inicio-agentes">
            <ListaAgentes agentes={agentes} compacta />
          </div>

          <button className="op-enlace" onClick={onAjustes}>
            Ver todo en Ajustes: forma de pago, voz y herramientas
          </button>
        </aside>
      </div>
    </div>
  )
}
