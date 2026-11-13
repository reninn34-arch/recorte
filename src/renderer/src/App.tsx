import { useEffect, useRef, useState } from 'react'
import type { OpcionesExport, Preferencias, Progreso } from '../../shared/api'
import type { BrandKit, ClipSuggestion, Project, RenderJob } from '../../shared/types'
import { BrandView } from './components/BrandView'
import { AgentePanel } from './components/AgentePanel'
import { Editor } from './components/Editor'
import { AvisoActualizacion } from './components/AvisoActualizacion'
import { Novedades } from './components/Novedades'
import { Inicio } from './components/Inicio'
import { CrearIA } from './components/CrearIA'
import { EstudioCreacion } from './components/EstudioCreacion'
import { EstudioAgente } from './components/EstudioAgente'
import { ChatCreacion } from './components/ChatCreacion'
import type { AjustesCreacion, Creacion, MensajeCreacion, PeticionCreacion } from '../../shared/creacion'
import { esAprobacion } from '../../shared/modoagente'
import type { PuenteEditor } from './components/ChatAgente'
import type { MensajeChat } from '../../shared/chat'
import { useAgentes } from './hooks/agentes'
import { Opciones } from './components/Opciones'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { Icon } from './Icons'
import { timelineInicial, type Timeline } from '../../shared/timeline'

/** La transcripción no entra en la huella: es grande y el guardado la omite. */
function huella(proyecto: Project): string {
  const { transcript: _transcript, ...meta } = proyecto
  return JSON.stringify(meta)
}

/** Dos notas cortas: el aviso de que algo terminó. */
function campana() {
  try {
    const ctx = new AudioContext()
    ;[660, 990].forEach((f, i) => {
      const osc = ctx.createOscillator()
      const gan = ctx.createGain()
      osc.frequency.value = f
      gan.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14)
      gan.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.14 + 0.02)
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.3)
      osc.connect(gan).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.14)
      osc.stop(ctx.currentTime + i * 0.14 + 0.32)
    })
    setTimeout(() => void ctx.close(), 900)
  } catch {
    // Sin audio: el aviso queda en la notificación.
  }
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
  const [vista, setVista] = useState('inicio')
  const [proyectos, setProyectos] = useState<Project[]>([])
  const [proyecto, setProyecto] = useState<Project | null>(null)
  const [seleccion, setSeleccion] = useState('')
  const [cola, setCola] = useState<RenderJob[]>([])
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [verNovedades, setVerNovedades] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [creaciones, setCreaciones] = useState<Creacion[]>([])
  const [creacion, setCreacion] = useState<Creacion | null>(null)
  // El chat del agente, plegado para dejar más sitio al editor (se recuerda).
  const [chatPlegado, setChatPlegado] = useState(() => {
    try {
      return localStorage.getItem('recorte.chatPlegado') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('recorte.chatPlegado', chatPlegado ? '1' : '0')
    } catch {
      // Sin almacenamiento: no se recuerda.
    }
  }, [chatPlegado])
  /** Las creaciones en las que trabaja el agente, con cuándo empezó cada una (puede haber varias a la vez). */
  const [enCurso, setEnCurso] = useState<Record<string, number>>({})
  /** El último aviso de progreso de cada creación (uno por creación: no se pisan entre ellas). */
  const [progresoCreacion, setProgresoCreacion] = useState<Record<string, Progreso>>({})
  const trabajandoCreacion = Boolean(creacion && enCurso[creacion.id])
  // Lo último de enCurso para los avisos de progreso, y las creaciones que el agente sigue solo
  // (tras renovarse el uso del plan) sin que la interfaz lo haya pedido.
  const enCursoRef = useRef(enCurso)
  enCursoRef.current = enCurso
  const solos = useRef(new Set<string>())
  const terminoSoloRef = useRef<(id: string) => void>(() => {})
  const [estadoVoz, setEstadoVoz] = useState<Awaited<ReturnType<typeof window.recorte.vozEstado>>>({ tieneClave: false })
  const [renderizando, setRenderizando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [lote, setLote] = useState<{ indice: number; total: number } | null>(null)
  const guardado = useRef('')
  const agentes = useAgentes(setAviso)
  const [carpetaVideos, setCarpetaVideos] = useState<string | undefined>()
  useEffect(() => {
    void window.recorte.carpetaEstado().then((e) => setCarpetaVideos(e.ruta)).catch(() => {})
  }, [vista])
  const preferencias = useRef<Preferencias>({ avisoNotificacion: true, avisoSonido: true })
  useEffect(() => {
    void window.recorte.preferenciasCargar().then((p) => (preferencias.current = p)).catch(() => {})
  }, [vista])

  /** Un trabajo largo terminó: si Recorte no está a la vista, avisa (según Ajustes → Avisos). */
  function avisarFin(texto: string) {
    if (document.hasFocus()) return
    const p = preferencias.current
    if (p.avisoNotificacion && 'Notification' in window) new Notification('Recorte', { body: texto, silent: true })
    if (p.avisoSonido) campana()
  }
  // El editor comparte con el chat su timeline, el cabezal y su deshacer.
  const puente = useRef<PuenteEditor | null>(null)

  const clip = proyecto?.clips.find((c) => c.id === seleccion) ?? proyecto?.clips[0]
  const progresoActual = progreso && proyecto && progreso.id === proyecto.id ? progreso : null

  function abrir(original: Project) {
    // Los proyectos viejos (y los recién importados) aún no tienen timeline: nace con
    // todo el material en un clip. Se guarda en cuanto el usuario la toque.
    const p =
      original.timeline || original.demo
        ? original
        : { ...original, timeline: timelineInicial(original.source.duration) }
    setProyecto(p)
    setSeleccion(p.clips[0]?.id ?? '')
    setCola(colaDe(p))
    guardado.current = huella(p)
  }

  // Un agente de fuera (por MCP) cambió un proyecto: si está abierto, sus pistas entran como un paso
  // de deshacer (timeline pendiente); sus medios, su transcripción y su último MP4, tal cual.
  useEffect(() => {
    const quitar = window.recorte.onProyectoExterno(({ proyecto: nuevo, conTimeline }) => {
      setProyecto((p) =>
        p && p.id === nuevo.id
          ? {
              ...p,
              name: nuevo.name,
              medios: nuevo.medios,
              transcription: nuevo.transcription,
              language: nuevo.language,
              timelineSalida: nuevo.timelineSalida,
              ...(conTimeline && nuevo.timeline ? { timelinePendiente: nuevo.timeline } : {})
            }
          : p
      )
      if (nuevo.transcription === 'lista') {
        void window.recorte.abrirProyecto(nuevo.id).then((completo) => {
          if (completo?.transcript) setProyecto((p) => (p && p.id === nuevo.id ? { ...p, transcript: completo.transcript } : p))
        })
      }
      void recargarProyectos()
    })
    const quitarAbrir = window.recorte.onAbrirProyecto((id) => {
      void (async () => {
        setVista('proyectos')
        if (proyectoRef.current?.id === id) return
        const p = await window.recorte.abrirProyecto(id)
        if (p) abrir(p)
      })()
    })
    return () => {
      quitar()
      quitarAbrir()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const proyectoRef = useRef(proyecto)
  proyectoRef.current = proyecto

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
        // Como en cualquier editor de video, se empieza en la pantalla de inicio:
        // el usuario elige qué proyecto abrir.
        const [lista, hechas] = await Promise.all([
          window.recorte.listarProyectos(),
          window.recorte.creacionesListar().catch(() => [] as Creacion[])
        ])
        if (!vivo) return
        setProyectos(lista)
        setCreaciones(hechas)
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
        if (evento.fase === 'creacion') {
          setProgresoCreacion((p) => ({ ...p, [evento.id]: evento }))
          if (evento.pct < 1 && !enCursoRef.current[evento.id] && !solos.current.has(evento.id)) {
            // Lo empezó el proceso principal (sigue solo tras el límite de uso): se ve trabajando.
            solos.current.add(evento.id)
            setEnCurso((e) => ({ ...e, [evento.id]: evento.desde ?? Date.now() }))
          } else if (evento.pct >= 1 && solos.current.has(evento.id)) {
            solos.current.delete(evento.id)
            setEnCurso(({ [evento.id]: _, ...resto }) => resto)
            terminoSoloRef.current(evento.id)
          }
          // La hora real de inicio la sabe el proceso principal.
          const desde = evento.desde
          if (desde !== undefined) setEnCurso((e) => (e[evento.id] !== undefined && e[evento.id] !== desde ? { ...e, [evento.id]: desde } : e))
        }
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

  // Volver a Inicio o a Ajustes puede cambiar los agentes: se releen.
  useEffect(() => {
    void agentes.refrescar().catch(() => {})
    if (vista === 'inicio') {
      void recargarProyectos()
      void window.recorte.creacionesListar().then(setCreaciones).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista])

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
        avisarFin(`La transcripción de «${resultado.project.name}» está lista.`)
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

  // ===== Crear con IA =====

  // Lo que se está viendo ahora, para decidir al terminar un paso largo (el cierre ya es viejo).
  const viendo = useRef<{ vista: string; creacion: string | null }>({ vista: 'inicio', creacion: null })
  viendo.current = { vista, creacion: creacion?.id ?? null }

  /** Corre un paso de la creación (guion o video) y deja la versión que devuelve. */
  async function pasoCreacion(id: string, paso: () => Promise<Creacion>) {
    // Ya, sin esperar al render: el primer aviso de progreso tiene que saber que esto lo pidió la interfaz.
    enCursoRef.current = { ...enCursoRef.current, [id]: enCursoRef.current[id] ?? Date.now() }
    setEnCurso((e) => ({ ...e, [id]: e[id] ?? Date.now() }))
    setProgresoCreacion(({ [id]: _, ...resto }) => resto)
    // Mientras trabaja, el mensaje del usuario ya se ve (el proceso principal lo guarda).
    try {
      const nueva = await paso()
      setCreacion((c) => (c && c.id === id ? nueva : c))
      const ultimo = nueva.mensajes[nueva.mensajes.length - 1]
      avisarFin(ultimo?.error ? 'El agente no pudo terminar: mira el estudio.' : nueva.fase === 'listo' ? 'Tu video con IA está listo.' : (ultimo?.texto ?? 'Listo.'))
      // El agente entregó una versión nueva y el usuario sigue en su estudio: directo al editor,
      // con cada recurso en su pista para retocarlo a mano. Si se fue a otra cosa, no se le mueve.
      const versionNueva = nueva.modo === 'agente' && nueva.fase === 'listo' && nueva.agente?.resultado?.tipo === 'video' && nueva.editorSalida !== nueva.salida
      const mirando = viendo.current.creacion === id && (viendo.current.vista === 'estudio' || viendo.current.vista === 'proyectos')
      if (versionNueva && !ultimo?.error && mirando) await abrirEnEditor(id)
    } catch (error) {
      setAviso(mensajeDe(error))
    } finally {
      setEnCurso(({ [id]: _, ...resto }) => resto)
    }
  }

  async function crearConIA(p: PeticionCreacion) {
    if (creando) return
    setCreando(true)
    try {
      const nueva = await window.recorte.creacionNueva(p)
      setCreacion(nueva)
      setVista('estudio')
      setCreando(false)
      // Modo agente: primero el plan. Con referencia: la fase Estilo espera al usuario
      // (antes se saltaba directo al guion). Si no, el guion, como siempre.
      if (nueva.modo === 'agente') await pasoCreacion(nueva.id, () => window.recorte.agentePlan(nueva.id))
      else if (nueva.fase !== 'estilo') await pasoCreacion(nueva.id, () => window.recorte.creacionGuion(nueva.id))
    } catch (error) {
      setAviso(`No pude empezar: ${mensajeDe(error)}`)
    } finally {
      setCreando(false)
    }
  }

  useEffect(() => {
    if (vista === 'estudio') void window.recorte.vozEstado().then(setEstadoVoz).catch(() => {})
  }, [vista])

  // Mientras el login de Google sigue abierto en Edge, preguntamos hasta que termine.
  useEffect(() => {
    if (!estadoVoz.google?.conectando) return
    const reloj = setInterval(() => void window.recorte.vozEstado().then(setEstadoVoz).catch(() => {}), 2000)
    return () => clearInterval(reloj)
  }, [estadoVoz.google?.conectando])

  function vozCreacion(paso: (id: string) => Promise<Creacion | null>) {
    if (!creacion || trabajandoCreacion) return
    const id = creacion.id
    void pasoCreacion(id, async () => (await paso(id)) ?? creacion)
  }

  async function abrirCreacionIA(id: string) {
    const [c, trabajos] = await Promise.all([window.recorte.creacionAbrir(id), window.recorte.creacionEnCurso().catch((): Record<string, number> => ({}))])
    // Si el agente sigue con ella (aunque se empezó en otra visita), se ve trabajando y con su hora real.
    if (trabajos[id] !== undefined) setEnCurso((e) => ({ ...e, [id]: trabajos[id] }))
    if (!c) {
      setAviso('No encontré esa creación.')
      return
    }
    setCreacion(c)
    setVista('estudio')
    if (c.modo === 'agente' && c.salida && c.agente?.resultado?.tipo === 'video' && trabajos[id] === undefined) await abrirEnEditor(id)
  }

  // ===== El chat de una creación del agente (en su pantalla y en el editor) =====

  /** Un mensaje para el agente: charla del plan, «Hazlo» o un cambio que rehace el video. */
  function pedirAlAgente(texto: string) {
    if (!creacion || trabajandoCreacion) return
    const c = creacion
    const id = c.id
    setCreacion(conPedido(c, texto))
    if (c.agente?.resultado) void pasoCreacion(id, () => window.recorte.agenteHacer(id, texto))
    else if (c.agente?.plan && esAprobacion(texto)) void pasoCreacion(id, () => window.recorte.agenteHacer(id, texto))
    else void pasoCreacion(id, () => window.recorte.agentePlan(id, texto))
  }

  function hazloAgente() {
    if (!creacion || trabajandoCreacion) return
    const id = creacion.id
    void pasoCreacion(id, () => window.recorte.agenteHacer(id))
  }

  /** El agente terminó algo que siguió solo: se recarga la creación y, si hay versión nueva y la estás mirando, al editor. */
  terminoSoloRef.current = (id: string) => {
    void (async () => {
      const nueva = await window.recorte.creacionAbrir(id).catch(() => null)
      if (!nueva) return
      setCreacion((c) => (c && c.id === id ? nueva : c))
      setCreaciones(await window.recorte.creacionesListar().catch(() => creaciones))
      avisarFin(nueva.fase === 'listo' ? 'Tu video con IA está listo.' : (nueva.mensajes.at(-1)?.texto ?? 'Listo.'))
      const mirando = viendo.current.creacion === id && (viendo.current.vista === 'estudio' || viendo.current.vista === 'proyectos')
      if (mirando && nueva.agente?.resultado?.tipo === 'video' && nueva.editorSalida !== nueva.salida) await abrirEnEditor(id)
    })()
  }

  // Un agente de fuera (por MCP) pide enseñar una creación: al frente, con su chat.
  const abrirCreacionRef = useRef(abrirCreacionIA)
  abrirCreacionRef.current = abrirCreacionIA
  useEffect(() => window.recorte.onAbrirCreacion((id) => void abrirCreacionRef.current(id)), [])

  function seguirAgente() {
    if (!creacion || trabajandoCreacion) return
    const id = creacion.id
    void pasoCreacion(id, () => window.recorte.agenteSeguir(id))
  }

  async function ajustarCreacion(ajustes: AjustesCreacion) {
    if (!creacion) return
    try {
      const nueva = await window.recorte.creacionAjustar(creacion.id, ajustes)
      setCreacion((c) => (c && c.id === nueva.id ? { ...c, vozElegida: nueva.vozElegida, directo: nueva.directo, flow: nueva.flow, tareas: nueva.tareas } : c))
    } catch (error) {
      setAviso(`No pude guardar ese cambio: ${mensajeDe(error)}`)
    }
  }

  async function adjuntarACreacion(rutas: string[]) {
    if (!creacion) return
    try {
      setAviso('Añadiendo tu material…')
      const nueva = await window.recorte.creacionAdjuntar(creacion.id, rutas)
      setCreacion((c) => (c && c.id === nueva.id ? nueva : c))
      setAviso(null)
    } catch (error) {
      setAviso(mensajeDe(error))
    }
  }

  async function anotarEnCreacion(mensajes: Partial<MensajeCreacion>[]) {
    if (!creacion) return
    try {
      const nueva = await window.recorte.creacionAnotar(creacion.id, mensajes)
      setCreacion((c) => (c && c.id === nueva.id ? nueva : c))
    } catch (error) {
      setAviso(mensajeDe(error))
    }
  }

  /** El chat de la creación; con `editor`, los cambios rápidos van a su timeline. */
  function chatDeCreacion(c: Creacion, editor?: { proyecto: Project; puente: typeof puente }) {
    return (
      <ChatCreacion
        creacion={c}
        agentes={agentes}
        trabajando={Boolean(enCurso[c.id])}
        desde={enCurso[c.id]}
        progreso={progresoCreacion[c.id] ?? null}
        onPedir={pedirAlAgente}
        onHazlo={hazloAgente}
        onSeguir={seguirAgente}
        onParar={() => void window.recorte.creacionParar(c.id)}
        onAjustar={(a) => void ajustarCreacion(a)}
        onAdjuntar={(r) => void adjuntarACreacion(r)}
        onAnotar={anotarEnCreacion}
        onConectar={() => setVista('inicio')}
        editor={editor}
      />
    )
  }

  function conPedido(c: Creacion, pedido?: string): Creacion {
    // El mensaje del usuario aparece al instante en el chat del estudio.
    return pedido ? { ...c, mensajes: [...c.mensajes, { id: crypto.randomUUID(), rol: 'usuario', texto: pedido, fecha: Date.now() }] } : c
  }

  function guionCreacion(pedido?: string) {
    if (!creacion || trabajandoCreacion) return
    const id = creacion.id
    setCreacion(conPedido(creacion, pedido))
    void pasoCreacion(id, () => window.recorte.creacionGuion(id, pedido))
  }

  function videoCreacion(pedido?: string) {
    if (!creacion || trabajandoCreacion) return
    const id = creacion.id
    setCreacion({ ...conPedido(creacion, pedido), fase: 'video' })
    void pasoCreacion(id, () => window.recorte.creacionVideo(id, pedido))
  }

  async function creacionAlEditor() {
    if (creacion) await abrirEnEditor(creacion.id)
  }

  async function abrirEnEditor(id: string) {
    try {
      const p = await window.recorte.creacionAlEditor(id)
      setCreacion((c) => (c && c.id === id ? { ...c, proyectoEditor: p.id, editorSalida: c.salida } : c))
      abrir(p)
      setVista('proyectos')
      await recargarProyectos()
    } catch (error) {
      setAviso(`No pude abrirlo en el editor: ${mensajeDe(error)}`)
    }
  }

  function cambiarClip(cambio: Partial<ClipSuggestion>) {    if (!clip) return
    setProyecto((p) =>
      p ? { ...p, clips: p.clips.map((c) => (c.id === clip.id ? { ...c, ...cambio } : c)) } : p
    )
  }

  async function exportarTimeline(opciones: OpcionesExport) {
    if (!proyecto?.timeline || exportando || renderizando || lote) return
    if (proyecto.demo) {
      setAviso('Estás viendo un proyecto de ejemplo. Importa un video para exportar de verdad.')
      return
    }
    const id = proyecto.id
    setExportando(true)
    try {
      const resultado = await window.recorte.exportarTimeline(id, proyecto.timeline, opciones)
      if (resultado.ok && resultado.output) {
        // Solo se toma la salida: la timeline pudo cambiar mientras se exportaba.
        setProyecto((p) => (p && p.id === id ? { ...p, timelineSalida: resultado.output } : p))
        setAviso(`Guardado en ${resultado.output}`)
        avisarFin('Tu video exportado está listo.')
      } else {
        setAviso(resultado.error ?? 'No pude exportar la timeline.')
      }
    } catch (error) {
      setAviso(`No pude exportar la timeline: ${mensajeDe(error)}`)
    } finally {
      setExportando(false)
    }
  }

  async function abrirExportacion() {
    if (!proyecto) return
    const ok = await window.recorte.abrirExportacion(proyecto.id)
    if (!ok) setAviso('No encontré el MP4 exportado. Puede que se haya movido o borrado.')
  }

  function cambiarChat(id: string, chat: MensajeChat[]) {
    setProyecto((p) => (p && p.id === id ? { ...p, chat } : p))
  }

  function cambiarTimeline(timeline: Timeline) {
    setProyecto((p) => (p ? { ...p, timeline } : p))
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


  if (cargando) {
    return (
      <div className="cargando">
        <span className="brand-mark"><Icon name="scissors" size={18} /></span>
        <strong>recorte</strong>
        <p>Abriendo tus proyectos…</p>
      </div>
    )
  }

  if (vista === 'ajustes' && !proyecto) {
    return (
      <>
        <Opciones agentes={agentes} onAviso={setAviso} onVolver={() => setVista('inicio')} onNovedades={() => setVerNovedades(true)} />
        {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
      </>
    )
  }

  if (vista === 'crear') {
    return (
      <>
        <CrearIA
          agentes={agentes}
          creando={creando}
          onCrear={(p) => void crearConIA(p)}
          onVolver={() => setVista('inicio')}
          onConectar={() => setVista('inicio')}
        />
        {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
      </>
    )
  }

  if (vista === 'estudio' && creacion && creacion.modo === 'agente') {
    return (
      <>
        <EstudioAgente
          creacion={creacion}
          trabajando={trabajandoCreacion}
          onVolver={() => setVista('inicio')}
          onEditor={() => void creacionAlEditor()}
          chat={chatDeCreacion(creacion)}
        />
        {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
      </>
    )
  }

  if (vista === 'estudio' && creacion) {
    return (
      <>
        <EstudioCreacion
          creacion={creacion}
          trabajando={trabajandoCreacion}
          desde={enCurso[creacion.id]}
          progreso={progresoCreacion[creacion.id] ?? null}
          onGuion={guionCreacion}
          onVideo={videoCreacion}
          onEditor={() => void creacionAlEditor()}
          onMostrar={() => void window.recorte.creacionMostrar(creacion.id)}
          onVolver={() => setVista('inicio')}
          onParar={() => void window.recorte.creacionParar(creacion.id)}
          voz={{
            ...estadoVoz,
            conectarGoogle: async () => {
              // La cuenta se conecta en Edge: se mira cada 2 s hasta que aparece (o 5 min).
              await window.recorte.vozGoogleConectar()
              const desde = Date.now()
              while (Date.now() - desde < 5 * 60_000) {
                await new Promise((r) => setTimeout(r, 2000))
                const e = await window.recorte.vozEstado().catch(() => null)
                if (!e) continue
                setEstadoVoz(e)
                if (e.google?.correo || !e.google?.conectando) break
              }
            },
            desconectarGoogle: async () => {
              await window.recorte.vozGoogleDesconectar()
              setEstadoVoz(await window.recorte.vozEstado())
            },
            guardarClave: async (clave) => {
              try {
                setEstadoVoz(await window.recorte.vozGuardar({ clave }))
                setAviso('Clave de AI Studio guardada.')
              } catch (error) {
                setAviso(`No pude guardar la clave: ${mensajeDe(error)}`)
              }
            },
            generar: (voz) => {
              setEstadoVoz((e) => ({ ...e, vozGemini: voz }))
              vozCreacion((id) => window.recorte.creacionVozGemini(id, voz))
            },
            usarGrabacion: (datos) => vozCreacion((id) => window.recorte.creacionVozPropia(id, datos)),
            subir: () => vozCreacion((id) => window.recorte.creacionVozPropia(id)),
            quitar: () => vozCreacion((id) => window.recorte.creacionQuitarVoz(id)),
            montar: () => vozCreacion((id) => window.recorte.creacionMontarVoz(id))
          }}
          agente={{
            plan: (pedido) => vozCreacion((id) => window.recorte.agentePlan(id, pedido)),
            hacer: (pedido) => vozCreacion((id) => window.recorte.agenteHacer(id, pedido))
          }}
          versiones={{
            cambio: (nueva) => setCreacion((c) => (c && c.id === nueva.id ? nueva : c)),
            nueva: (nueva) => {
              // «Otro video así»: se abre la creación nueva y empieza su plan (con el estilo de la otra).
              setCreacion(nueva)
              setVista('estudio')
              void pasoCreacion(nueva.id, () => window.recorte.agentePlan(nueva.id))
            }
          }}
          estilo={{
            geminiDisponible: Boolean(estadoVoz.tieneClave),
            analizar: (modo) => vozCreacion((id) => window.recorte.estiloAnalizar(id, modo)),
            continuar: () => vozCreacion((id) => window.recorte.estiloContinuar(id)),
            recalcular: () => vozCreacion((id) => window.recorte.estiloViabilidad(id)),
            guardarFicha: (ficha) => vozCreacion((id) => window.recorte.estiloFichaGuardar(id, ficha)),
            irAAjustes: () => setVista('ajustes')
          }}
        />
        {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
      </>
    )
  }

  if (!proyecto || vista === 'inicio' || vista === 'estudio') {
    return (
      <>
        <Inicio
          creaciones={creaciones}
          onCrearIA={() => setVista('crear')}
          onAjustes={() => setVista('ajustes')}
          onBorrar={async (tipo, id) => {
            try {
              if (tipo === 'proyecto') {
                await window.recorte.borrarProyecto(id)
                if (proyecto?.id === id) setProyecto(null)
                await recargarProyectos()
              } else {
                await window.recorte.borrarCreacion(id)
                if (creacion?.id === id) setCreacion(null)
                setCreaciones(await window.recorte.creacionesListar())
              }
              setAviso('Se fue a la Papelera. Si te equivocaste, lo recuperas desde ahí.')
            } catch (error) {
              setAviso(`No pude borrarlo: ${mensajeDe(error)}`)
            }
          }}
          onAbrirCreacion={(id) => void abrirCreacionIA(id)}
          proyectos={proyectos}
          agentes={agentes}
          onAbrir={abrirDesdeLista}
          onNuevo={importar}
          importando={importando}
          abierto={proyecto?.id}
        />
        {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
      </>
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
    <div className={`app ${vista === 'proyectos' ? 'is-editor' : ''}`}>
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
          onInicio={() => setVista('inicio')}
        />

        <div className={`content ${vista === 'proyectos' ? `is-editor ${chatPlegado ? 'is-chat-plegado' : ''}` : 'is-wide'}`}>
          {vista === 'proyectos' ? (
            <>
              <button
                className="chat-plegar"
                onClick={() => setChatPlegado((v) => !v)}
                title={chatPlegado ? 'Mostrar el chat del agente' : 'Ocultar el chat del agente: más sitio para editar'}
                aria-label={chatPlegado ? 'Mostrar el chat del agente' : 'Ocultar el chat del agente'}
                aria-expanded={!chatPlegado}
              >
                <Icon name={chatPlegado ? 'sparkles' : 'chevron'} size={14} />
              </button>
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
                onTranscribir={transcribir}
                onCambiarTimeline={cambiarTimeline}
                exportando={exportando}
                onExportar={exportarTimeline}
                onAbrirExportacion={abrirExportacion}
                puente={puente}
                onAviso={setAviso}
                carpetaVideos={carpetaVideos}
                onMedios={(medios) => setProyecto((p) => (p ? { ...p, medios } : p))}
                cola={cola}
                pendientesLote={pendientesLote}
                lote={lote}
                onRenderLote={renderizarLote}
                onAbrirSalida={abrirSalida}
                textoVacio={textoVacio}
                onPendienteAplicada={() => setProyecto((p) => (p ? { ...p, timelinePendiente: undefined } : p))}
              />
              {creacion?.modo === 'agente' && creacion.proyectoEditor === proyecto.id ? (
                chatDeCreacion(creacion, { proyecto, puente })
              ) : (
              <AgentePanel
                proyecto={proyecto}
                agentes={agentes}
                puente={puente}
                onCambiarChat={cambiarChat}
                onCambiarAgente={() => setVista('inicio')}
                editando={editando}
                generando={generando}
                renderizando={renderizando}
                onEditar={editarConAgente}
                onGenerar={generarLote}
                onRenderizarEdicion={renderizarEdicion}
                onAbrirAjustes={() => setVista('ajustes')}
              />
              )}
            </>
          ) : (
            <div className="workspace">
              {vista === 'marca' && (
                <BrandView project={proyecto} onChange={cambiarMarca} onSave={guardarMarca} />
              )}
              {vista === 'ajustes' && <Opciones agentes={agentes} onAviso={setAviso} onNovedades={() => setVerNovedades(true)} />}
            </div>
          )}
        </div>
      </main>

      {aviso && <Toast text={aviso} />}
        <AvisoActualizacion />
        <Novedades forzar={verNovedades} onCerrar={() => setVerNovedades(false)} />
    </div>
  )
}
