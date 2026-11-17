import { useState } from 'react'
import type { Creacion } from '../../../shared/creacion'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'

/**
 * «Mis videos»: todos tus videos en un solo lugar, los de cada conversación (aunque una tenga varios) y los que editas a
 * mano. Cada uno se abre en el editor; los de una conversación también se pueden ver en ella.
 */

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

function duracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Filtro = 'todos' | 'conversaciones' | 'a-mano'

export function MisVideos({
  creaciones,
  proyectos,
  onAbrirVideo,
  onVerConversacion,
  onAbrirProyecto
}: {
  creaciones: Creacion[]
  proyectos: Project[]
  /** Abre en el editor el video de una conversación. */
  onAbrirVideo: (id: string) => void
  onVerConversacion: (id: string) => void
  onAbrirProyecto: (id: string) => void
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [buscar, setBuscar] = useState('')

  // El nombre de cada conversación (el de su primer video) y qué número es cada video en ella.
  const primeras = new Map<string, Creacion>()
  for (const c of [...creaciones].sort((a, b) => a.createdAt - b.createdAt)) {
    const h = c.hilo ?? c.id
    if (!primeras.has(h)) primeras.set(h, c)
  }
  const numeroEnHilo = (c: Creacion) =>
    creaciones.filter((x) => (x.hilo ?? x.id) === (c.hilo ?? c.id) && x.createdAt <= c.createdAt).length

  const deChats = new Set(creaciones.map((c) => c.proyectoEditor).filter(Boolean))
  const texto = buscar.trim().toLowerCase()
  const coincide = (...t: (string | undefined)[]) => !texto || t.some((x) => x?.toLowerCase().includes(texto))

  const videos = [
    ...(filtro === 'a-mano' ? [] : creaciones.filter((c) => c.salida || c.agente?.resultado))
      .filter((c) => coincide(c.guion?.titulo, c.nombre, c.peticion, primeras.get(c.hilo ?? c.id)?.nombre))
      .map((c) => ({ tipo: 'creacion' as const, id: c.id, fecha: c.updatedAt, c })),
    ...(filtro === 'conversaciones' ? [] : proyectos.filter((p) => !deChats.has(p.id)))
      .filter((p) => coincide(p.name))
      .map((p) => ({ tipo: 'proyecto' as const, id: p.id, fecha: p.updatedAt, p }))
  ].sort((a, b) => b.fecha - a.fecha)

  return (
    <div className="mv">
      <header className="mv-cabeza">
        <h1>Mis videos</h1>
        <div className="mv-filtros" role="group" aria-label="Qué videos ver">
          {(
            [
              ['todos', 'Todos'],
              ['conversaciones', 'De conversaciones'],
              ['a-mano', 'Editados a mano']
            ] as const
          ).map(([id, nombre]) => (
            <button key={id} className={`ini-chip ${filtro === id ? 'is-on' : ''}`} onClick={() => setFiltro(id)}>
              {nombre}
            </button>
          ))}
        </div>
        <label className="mv-buscar">
          <Icon name="search" size={14} />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar un video…" aria-label="Buscar un video" />
        </label>
      </header>

      {videos.length ? (
        <div className="mv-grid">
          {videos.map((v) => {
            if (v.tipo === 'creacion') {
              const c = v.c
              const conv = primeras.get(c.hilo ?? c.id)
              const n = numeroEnHilo(c)
              return (
                <div key={v.id} className="mv-video">
                  <button className="mv-miniatura-boton" onClick={() => onAbrirVideo(c.id)} title="Abrir en el editor">
                    <span className={`mv-miniatura ${c.formato}`}>
                      {c.portada ? <img src={mediaUrl(`c-${c.id}`, c.portada)} alt="" loading="lazy" /> : <Icon name="sparkles" size={22} />}
                    </span>
                  </button>
                  <span className="mv-nombre">{c.guion?.titulo ?? c.nombre}</span>
                  <span className="mv-meta">
                    {n > 1 || (conv && conv.id !== c.id) ? `Video ${n} de «${conv?.guion?.titulo ?? conv?.nombre}» · ` : ''}versión {c.version} · {hace(c.updatedAt)}
                  </span>
                  <div className="mv-acciones">
                    <button className="btn small primary" onClick={() => onAbrirVideo(c.id)}>
                      <Icon name="layers" size={13} /> Editor
                    </button>
                    <button className="btn small ghost" onClick={() => onVerConversacion(c.id)}>
                      Ver conversación
                    </button>
                  </div>
                </div>
              )
            }
            const p = v.p
            return (
              <div key={v.id} className="mv-video">
                <button className="mv-miniatura-boton" onClick={() => onAbrirProyecto(p.id)} title="Abrir en el editor">
                  <span className="mv-miniatura">
                    {p.thumbnail ? <img src={mediaUrl(p.id, p.thumbnail)} alt="" loading="lazy" /> : <Icon name="film" size={22} />}
                    <span className="ini-video-duracion">{duracion(p.source.duration)}</span>
                  </span>
                </button>
                <span className="mv-nombre">{p.name}</span>
                <span className="mv-meta">Editado a mano · {hace(p.updatedAt)}</span>
                <div className="mv-acciones">
                  <button className="btn small primary" onClick={() => onAbrirProyecto(p.id)}>
                    <Icon name="layers" size={13} /> Editor
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mv-vacio">{texto ? 'Ningún video coincide con lo que buscas.' : 'Todavía no tienes videos aquí.'}</p>
      )}
    </div>
  )
}
