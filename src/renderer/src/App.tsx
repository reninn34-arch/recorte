import { useEffect, useRef, useState } from 'react'
import type { Progreso } from '../../shared/api'
import type { BrandKit, ClipSuggestion, Project, RenderJob } from '../../shared/types'
import { BrandView } from './components/BrandView'
import { AgentePanel } from './components/AgentePanel'
import { Editor } from './components/Editor'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { Icon } from './Icons'

/** La transcripción no entra en la huella: es grande y el guardado la omite. */
function huella(proyecto: Project): string {
  const { transcript: _transcript, ...meta } = proyecto
  return JSON.stringify(meta)
}

function mensajeDe(error: unknown): string {
  const texto = error instanceof Error ? error.message : String(error)
  return texto.replace(/^Error invoking remote method '[^']+':\s*/, '')
}

/** Los clips ya renderizados vuelven a la cola al reabrir el proyecto. */
function colaDe(proyecto: Project): RenderJob[] {
  return proyecto.clips
    .filter((clip) => clip.status === 'listo' || clip.status === 'error' || clip.status === 'renderizando')
    .map((clip) => ({
      id: `job-${clip.id}`,
      clipId: clip.id,
      title: clip.title,
      progress: clip.status === 'listo' ? 100 : 0,
      status: clip.status === 'listo' ? 'listo' : clip.status === 'error' ? 'error' : 'en cola',
      output: clip.output
    }))
}

export default function App() {
  const [vista, setVista] = useState('proyectos')
  const [proyectos, setProyectos] = useState<Project[]>([])
  const [proyecto, setProyecto] = useState<Project | null>(null)
  const [seleccion, setSeleccion] = useState('')
  const [cola, setCola] = useState<RenderJob[]>([])
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [renderizando, setRenderizando] = useState(false)
  const [lote, setLote] = useState<{ indice: number; total: number } | null>(null)
  const guardado = useRef('')

  const clip = proyecto?.clips.find((c) => c.id === seleccion) ?? proyecto?.clips[0]
  const progresoActual = progreso && proyecto && progreso.id === proyecto.id ? progreso : null

  function abrir(p: Project) {
    setProyecto(p)
    setSeleccion(p.clips[0]?.id ?? '')
    setCola(colaDe(p))
    guardado.current = huella(p)
  }

  async function recargarProyectos() {
    try {
      setProyectos(await window.recorte.listarProyectos())
    } catch {
      // La lista lateral es secundaria: si falla, el proyecto abierto sigue funcionando.
    }
  }

  useEffect(() => {
    let vivo = true

    void (async () => {
      try {
        const lista = await window.recorte.listarProyectos()
        if (!vivo) return
        setProyectos(lista)
        const primero = lista[0] ? await window.recorte.abrirProyecto(lista[0].id) : null
        if (!vivo) return
        if (primero) abrir(primero)
      } catch (error) {
        if (!vivo) return
        setAviso(`No pude leer tus proyectos: ${mensajeDe(error)}`)
      } finally {
        if (vivo) setCargando(false)
      }
    })()

    return () => {
      vivo = false
    }
  }, [])

  useEffect(
    () =>
      window.recorte.onProgreso((evento) => {
        setProgreso(evento)
        if (evento.fase === 'render' && evento.lote) setLote(evento.lote)
        if (evento.fase === 'render' && evento.clipId) {
          setCola((previa) =>
            previa.map((job) =>
              job.clipId === evento.clipId && job.status !== 'listo'
                ? { ...job, progress: Math.round(evento.pct * 100), status: 'renderizando' }
                : job
            )
          )
        }
      }),
    []
  )

  useEffect(() => {
    if (!aviso) return
    const reloj = setTimeout(() => setAviso(null), 5600)
    return () => clearTimeout(reloj)
  }, [aviso])

  // Guardado con retardo: escribir un título no debe tocar el disco en cada tecla.
  useEffect(() => {
    if (!proyecto || proyecto.demo) return
    const actual = huella(proyecto)
    if (actual === guardado.current) return

    const reloj = setTimeout(() => {
      guardado.current = actual
      void window.recorte
        .guardarProyecto(proyecto)
        .catch(() => setAviso('No pude guardar el proyecto en el disco.'))
    }, 700)

    return () => clearTimeout(reloj)
  }, [proyecto])

  async function importar() {
    if (importando) return
    const ruta = await window.recorte.openVideo()
    if (!ruta) return

    setImportando(true)
    try {
      const resultado = await window.recorte.crearProyecto(ruta)
      abrir(resultado.project)
      setVista('proyectos')
      setAviso(`«${resultado.project.name}» está lista. Ahora transcríbela.`)
      await recargarProyectos()
    } catch (error) {
      setAviso(`No pude importar el video: ${mensajeDe(error)}`)
    } finally {
      setImportando(false)
    }
  }

  async function abrirDesdeLista(id: string) {
    if (id === proyecto?.id) {
      setVista('proyectos')
      return
    }
    try {
      const p = await window.recorte.abrirProyecto(id)
      if (!p) {
        setAviso('No encontré ese proyecto. Puede que se haya movido la carpeta.')
        return
      }
      abrir(p)
      setVista('proyectos')
    } catch (error) {
      setAviso(`No pude abrir el proyecto: ${mensajeDe(error)}`)
    }
  }

  async function transcribir() {
    if (!proyecto || proyecto.demo || proyecto.transcription === 'transcribiendo') return
    const id = proyecto.id

    setProyecto((p) =>
      p ? { ...p, transcription: 'transcribiendo', transcriptionError: undefined } : p
    )

    try {
      const resultado = await window.recorte.transcribir(id)
      if (resultado.ok && resultado.project) {
        abrir(resultado.project)
        setAviso(
          `Transcripción lista: ${resultado.transcript?.length ?? 0} segmentos con tiempos por palabra.`
        )
      } else {
        setProyecto((p) =>
          p && p.id === id
            ? {
                ...p,
                transcription: 'error',
                transcriptionError: resultado.error ?? 'La transcripción falló.'
              }
            : p
        )
        setAviso(resultado.error ?? 'No pude transcribir la clase.')
      }
    } catch (error) {
      setProyecto((p) =>
        p && p.id === id
          ? { ...p, transcription: 'error', transcriptionError: mensajeDe(error) }
          : p
      )
      setAviso(`No pude transcribir la clase: ${mensajeDe(error)}`)
    }

    await recargarProyectos()
  }

  async function generarLote() {
    if (!proyecto || generando) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Importa una clase para trabajar con material real.')
      return
    }
    if (proyecto.transcription !== 'lista') {
      setAviso('Primero transcribe la clase: los momentos salen de la transcripción.')
      return
    }

    setGenerando(true)
    try {
      const resultado = await window.recorte.generarClips(proyecto.id)
      if (resultado.ok && resultado.project) {
        abrir(resultado.project)
        setAviso(
          resultado.aviso ??
            `${resultado.project.clips.length} momentos propuestos${
              resultado.fuente === 'ia' ? ' con IA' : ''
            }. Revisa el gancho y el corte de cada uno.`
        )
      } else {
        setAviso(resultado.error ?? 'No pude analizar la transcripción.')
      }
    } catch (error) {
      setAviso(`No pude analizar la transcripción: ${mensajeDe(error)}`)
    } finally {
      setGenerando(false)
    }
  }

  // Fase 1: el agente propone una RecetaEdicion completa sobre el material.
  async function editarConAgente() {
    if (!proyecto || editando) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Importa una clase para trabajar con material real.')
      return
    }
    if (proyecto.transcription !== 'lista') {
      setAviso('Primero transcribe la clase: la edición sale de la transcripción.')
      return
    }

    setEditando(true)
    try {
      const resultado = await window.recorte.editarConAgente(proyecto.id)
      if (resultado.ok && resultado.project) {
        abrir(resultado.project)
        setAviso(
          resultado.aviso ??
            `Edición propuesta${resultado.fuente === 'ia' ? ' por el agente' : ''}. Revísala y renderiza cuando quieras.`
        )
      } else {
        setAviso(resultado.error ?? 'No pude generar la edición.')
      }
    } catch (error) {
      setAviso(`No pude generar la edición: ${mensajeDe(error)}`)
    } finally {
      setEditando(false)
    }
  }

  async function renderizarEdicion() {
    if (!proyecto || renderizando) return
    setRenderizando(true)
    try {
      const resultado = await window.recorte.renderizarEdicion(proyecto.id)
      if (resultado.ok && resultado.project) {
        abrir(resultado.project)
        setAviso('Edición renderizada. Ábrela para revisar el resultado.')
      } else {
        setAviso(resultado.error ?? 'No pude renderizar la edición.')
      }
    } catch (error) {
      setAviso(`No pude renderizar la edición: ${mensajeDe(error)}`)
    } finally {
      setRenderizando(false)
    }
  }

  async function abrirEdicion() {
    if (!proyecto) return
    const ok = await window.recorte.abrirEdicion(proyecto.id)
    if (!ok) setAviso('Todavía no hay una edición renderizada.')
  }

  // Fase 2: crear video desde cero con HyperFrames (motor puente).
  async function crearVideo(peticion: string, opciones: { incluirMaterial: boolean; estilo: string }) {
    if (!proyecto || creando) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Crea un proyecto para generar videos.')
      return
    }

    setCreando(true)
    try {
      const resultado = await window.recorte.crearVideo(proyecto.id, peticion, opciones)
      if (resultado.ok && resultado.project) {
        abrir(resultado.project)
        setAviso(
          resultado.aviso ??
            `Video creado${resultado.fuente === 'ia' ? ' con el agente' : ' con la plantilla local'}. Ábrelo para revisarlo.`
        )
      } else {
        setAviso(resultado.aviso ?? resultado.error ?? 'No pude crear el video.')
      }
    } catch (error) {
      setAviso(`No pude crear el video: ${mensajeDe(error)}`)
    } finally {
      setCreando(false)
    }
  }

  async function abrirCreacion() {
    if (!proyecto) return
    const ok = await window.recorte.abrirCreacion(proyecto.id)
    if (!ok) setAviso('Todavía no hay un video creado.')
  }

  function cambiarClip(cambio: Partial<ClipSuggestion>) {    if (!clip) return
    setProyecto((p) =>
      p ? { ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, ...cambio } : c)) } : p
    )
  }

  function cambiarMarca(cambio: Partial<BrandKit>) {
    setProyecto((p) => (p ? { ...p, brand: { ...p.brand, ...cambio } } : p))
  }

  async function renderizar() {
    if (!proyecto || !clip || renderizando || lote) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Importa una clase para renderizar de verdad.')
      return
    }

    setRenderizando(true)
    setCola((previa) => [
      ...previa.filter((job) => job.clipId !== clip.id),
      {
        id: crypto.randomUUID(),
        clipId: clip.id,
        title: clip.title,
        progress: 0,
        status: 'renderizando'
      }
    ])
    setProyecto((p) =>
      p
        ? { ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, status: 'renderizando' } : c)) }
        : p
    )

    try {
      const resultado = await window.recorte.renderizarClip(proyecto.id, clip.id)
      if (resultado.ok && resultado.project) {
        setProyecto(resultado.project)
        setSeleccion(resultado.project.clips.find((c) => c.id === clip.id)?.id ?? seleccion)
        guardado.current = huella(resultado.project)
        setCola((previa) =>
          previa.map((job) =>
            job.clipId === clip.id
              ? { ...job, progress: 100, status: 'listo', output: resultado.output }
              : job
          )
        )
        setAviso(`Clip renderizado: ${resultado.output?.split(/[\\/]/).pop() ?? 'MP4 listo'}.`)
      } else {
        setProyecto((p) =>
          p
            ? {
                ...p,
                clips: p.clips.map((c) => (c.id === clip.id ? { ...c, status: 'error' } : c))
              }
            : p
        )
        setCola((previa) =>
          previa.map((job) => (job.clipId === clip.id ? { ...job, status: 'error' } : job))
        )
        setAviso(resultado.error ?? 'No pude renderizar el clip.')
      }
    } catch (error) {
      setCola((previa) =>
        previa.map((job) => (job.clipId === clip.id ? { ...job, status: 'error' } : job))
      )
      setAviso(`No pude renderizar el clip: ${mensajeDe(error)}`)
    } finally {
      setRenderizando(false)
    }
  }

  async function renderizarLote() {
    if (!proyecto || renderizando || lote) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Importa una clase para renderizar de verdad.')
      return
    }

    const pendientes = proyecto.clips.filter(
      (c) => c.status !== 'listo' && c.status !== 'renderizando'
    )
    if (pendientes.length === 0) {
      setAviso('Todos los clips ya están renderizados.')
      return
    }

    const ids = new Set(pendientes.map((c) => c.id))
    setLote({ indice: 0, total: pendientes.length })
    setCola((previa) => [
      ...previa.filter((job) => !ids.has(job.clipId)),
      ...pendientes.map((c) => ({
        id: crypto.randomUUID(),
        clipId: c.id,
        title: c.title,
        progress: 0,
        status: 'en cola' as const
      }))
    ])
    setProyecto((p) =>
      p
        ? { ...p, clips: p.clips.map((c) => (ids.has(c.id) ? { ...c, status: 'renderizando' } : c)) }
        : p
    )

    try {
      const resultado = await window.recorte.renderizarLote(proyecto.id)
      if (resultado.project) {
        const final = resultado.project
        setProyecto(final)
        guardado.current = huella(final)
        setCola((previa) =>
          previa.map((job) => {
            if (!ids.has(job.clipId)) return job
            const c = final.clips.find((item) => item.id === job.clipId)
            if (!c) return job
            if (c.status === 'listo') {
              return { ...job, progress: 100, status: 'listo', output: c.output }
            }
            if (c.status === 'error') return { ...job, status: 'error' }
            return job
          })
        )
      }
      setAviso(
        resultado.ok
          ? `Lote listo: ${resultado.renderizados === 1 ? '1 clip renderizado' : `${resultado.renderizados} clips renderizados`}.`
          : (resultado.error ?? 'El lote terminó con errores.')
      )
    } catch (error) {
      setAviso(`No pude renderizar el lote: ${mensajeDe(error)}`)
    } finally {
      setLote(null)
    }
  }

  async function abrirSalida(job: RenderJob) {
    if (!proyecto) return
    const abierto = await window.recorte.abrirSalida(proyecto.id, job.clipId)
    if (!abierto) setAviso('No encontré el MP4. Puede que se haya movido o borrado.')
  }

  function guardarMarca() {
    setAviso('Marca guardada en el proyecto.')
  }

  function guardarAjustes() {
    setAviso('Los ajustes de render se conectan junto con el motor de render.')
  }

  if (cargando) {
    return (
      <div className="cargando">
        <span className="brand-mark"><Icon name="scissors" size={18} /></span>
        <strong>recorte</strong>
        <p>Abriendo tus proyectos…</p>
      </div>
    )
  }

  if (!proyecto) {
    return (
      <div className="cargando bienvenida">
        <span className="brand-mark"><Icon name="scissors" size={22} /></span>
        <strong>recorte</strong>
        <p>Tu editor de video dirigido por agentes. Empieza importando una clase o cualquier material.</p>
        <button className="btn primary" onClick={importar} disabled={importando}>
          <Icon name="upload" size={16} /> {importando ? 'Importando…' : 'Nuevo proyecto'}
        </button>
        {aviso && <Toast text={aviso} />}
      </div>
    )
  }

  const textoVacio = generando
    ? 'Buscando momentos en la transcripción…'
    : proyecto.transcription === 'transcribiendo'
      ? 'La transcripción está en marcha. Los momentos aparecerán al terminar.'
      : proyecto.transcription === 'lista'
        ? 'La clase ya está transcrita. Pulsa «Generar lote» para proponer momentos.'
        : proyecto.transcription === 'error'
          ? 'La transcripción falló. Reinténtala desde la tarjeta de la clase.'
          : 'Transcribe la clase para que la IA encuentre los mejores momentos.'

  const pendientesLote = proyecto.clips.filter(
    (c) => c.status !== 'listo' && c.status !== 'renderizando'
  ).length

  return (
    <div className="app">
      <Sidebar
        active={vista}
        onChange={setVista}
        proyectos={proyectos}
        activo={proyecto.id}
        onAbrir={abrirDesdeLista}
        onNuevo={importar}
      />

      <main className="main">
        <TopBar
          name={proyecto.name}
          onImport={importar}
          onBatch={generarLote}
          puedeGenerar={proyecto.transcription === 'lista'}
          importando={importando}
          generando={generando}
        />

        <div className={`content ${vista === 'proyectos' ? 'is-editor' : 'is-wide'}`}>
          {vista === 'proyectos' ? (
            <>
              <Editor
                proyecto={proyecto}
                progreso={progresoActual}
                seleccion={seleccion}
                onSelect={setSeleccion}
                clip={clip}
                onCambiarClip={cambiarClip}
                onRenderClip={renderizar}
                renderizando={renderizando}
                editando={editando}
                generando={generando}
                onEditar={editarConAgente}
                onRenderizarEdicion={renderizarEdicion}
                onAbrirEdicion={abrirEdicion}
                onCrear={crearVideo}
                creando={creando}
                onAbrirCreacion={abrirCreacion}
                onTranscribir={transcribir}
                cola={cola}
                pendientesLote={pendientesLote}
                lote={lote}
                onRenderLote={renderizarLote}
                onAbrirSalida={abrirSalida}
                textoVacio={textoVacio}
              />
              <AgentePanel
                proyecto={proyecto}
                editando={editando}
                generando={generando}
                renderizando={renderizando}
                onEditar={editarConAgente}
                onGenerar={generarLote}
                onRenderizarEdicion={renderizarEdicion}
                onAbrirAjustes={() => setVista('ajustes')}
                onAviso={setAviso}
              />
            </>
          ) : (
            <div className="workspace">
              {vista === 'marca' && (
                <BrandView project={proyecto} onChange={cambiarMarca} onSave={guardarMarca} />
              )}
              {vista === 'ajustes' && <SettingsView onSave={guardarAjustes} onAviso={setAviso} />}
            </div>
          )}
        </div>
      </main>

      {aviso && <Toast text={aviso} />}
    </div>
  )
}
