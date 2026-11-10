import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { duracionesDeMedios, normalizarTimeline, quitarFuente, type Timeline } from '../shared/timeline'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import type {
  AnalisisResultado,
  IngestaResultado,
  OpcionesExport,
  Progreso,
  RenderLoteResultado,
  RenderResultado,
  TranscripcionResultado
} from '../shared/api'
import type { AjustesIA, Project } from '../shared/types'
import { Ajustes } from './ajustes'
import { conectarAgente, desconectarAgente, estadoAgentes, prepararAgentes, versionesAgentes, agenteDeOrden, marcarSesionCaida, VARIABLE_LLAVE } from './agentes'
import { estadoSistema, instalarHerramienta } from './sistema'
import { activarHerramientas } from './herramientas'
import { carpetaPorDefecto, copiarAVideos, carpetaDelProyecto } from './carpetas'
import { abrirFlow, agregarCuentaFlow, ajustesFlow, estadoFlow, leerSaldosFlow, pedirFlow, quitarCuentaFlow } from './flow'
import { MODELO_CHATGPT, MODELOS_IMAGEN, modelosVideoVigentes, type PedidoFlow } from '../shared/flow'
import { estadoChatGPT, generarImagenChatGPT } from './imagenchatgpt'
import { atenderMedios } from './mediosagente'
import { avisarSesionCaida, definirEntornoAgentes, empezarTrabajo, esParado, pararTrabajo, terminarTrabajo } from './ia'
import { comandoConEleccion } from './modelos'
import { catalogoAgente } from './catalogo'
import { crearMiniatura, crearProxy, duracionMedio, probeVideo } from './ffmpeg'
import { proponerClipsConAgente, proponerClipsConIA, proponerRecetaConAgente, proponerRecetaConIA } from './ia'
import { registrarMedia } from './media'
import { proponerClips } from './momentos'
import { Proyectos } from './proyectos'
import { recetaLocal } from './receta'
import { crearVideo } from './crear'
import { renderClip, renderReceta } from './render'
import { exportarTimeline } from './exportar'
import { Creaciones, EXTENSIONES_ADJUNTOS, pasoGuion, pasoVideo, type ConfigAgente } from './creaciones'
import { convertirAVoz, generarVozGemini, prepararVoz } from './voz'
import { montarVozEnVideo } from './montajevoz'
import { conectarVozGoogle, desconectarVozGoogle, estadoVozGoogle, generarVozGoogle } from './vozgoogle'
import { analizarMaterialCreacion } from './estilo/material'
import { anotar, archivoEntregado, pasoHacer, pasoPlan, revisarYPublicar } from './modoagente'
import { esAprobacion, pasoAnunciado } from '../shared/modoagente'
import { atenderVoz } from './vozagente'
import { proyectoDesdeReceta } from './recetaeditor'
import { medirReferencia } from './estilo/referencia'
import { analizarConGeminiVideo, interpretarEstilo } from './estilo/ficha'
import { viabilidadDe } from './estilo/viabilidad'
import { guardar } from './disco'
import { cambiaElGuion, ID_SEGURO, mismaNarracion, pideMontarVoz, textoNarracion, VOCES_GEMINI, vozDesactualizada, vozVigente } from '../shared/creacion'
import type { AgenteId, Creacion, EleccionTarea, MensajeCreacion, NivelModelo, PeticionCreacion, TareasCreacion } from '../shared/creacion'
import { turnoAgente } from './chat'
import { buscarActualizacion, estadoActualizacion, instalarActualizacion, prepararActualizaciones } from './actualizar'
import { activarGustos, agregarGustos, bloqueGustos, cargarGustos, olvidarGustos, quitarGusto, senalGusto, usoCreacion } from './gustos'
import type { MensajeChat, OperacionTL } from '../shared/chat'
import { transcribir } from './transcribir'

// El esquema tiene que declararse antes de que Electron esté listo.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'recorte-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function crearVentana(): void {
  const ventana = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b0c0a',
    autoHideMenuBar: true,
    title: 'Recorte',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  ventana.on('ready-to-show', () => ventana.show())

  ventana.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void ventana.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void ventana.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Lo que Recorte bajó (FFmpeg, Python, Node.js) va primero en el PATH de todo lo que lanza.
  activarHerramientas()
  prepararAgentes()
  prepararActualizaciones()
  const proyectos = new Proyectos()
  const ajustes = new Ajustes()
  const creaciones = new Creaciones()
  registrarMedia(proyectos, creaciones)

  /** Cuándo empezó a trabajar el agente en cada creación: la pantalla cuenta desde ahí, no desde que la abres. */
  const inicioCreacion = new Map<string, number>()
  const enviarProgreso = (progreso: Progreso) => {
    const desde = progreso.fase === 'creacion' ? inicioCreacion.get(progreso.id) : undefined
    const evento = desde !== undefined && progreso.desde === undefined ? { ...progreso, desde } : progreso
    for (const ventana of BrowserWindow.getAllWindows()) {
      ventana.webContents.send('progreso', evento)
    }
  }

  ipcMain.handle('dialog:open-video', async () => {
    const resultado = await dialog.showOpenDialog({
      title: 'Elegir una clase o webinar',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }]
    })
    return resultado.canceled ? null : resultado.filePaths[0]
  })

  // Importar un video: lo usa «Nuevo proyecto» y «Abrir en el editor» de una creación.
  const ingerir = async (ruta: unknown, nombreDado?: string): Promise<IngestaResultado> => {
    if (typeof ruta !== 'string' || !existsSync(ruta)) {
      throw new Error('No encuentro ese archivo.')
    }

    const info = await probeVideo(ruta)
    const id = randomUUID()
    const nombre = nombreDado?.trim() || basename(ruta, extname(ruta)).replace(/[_-]+/g, ' ').trim() || 'Clase'
    const carpeta = proyectos.carpeta(id)

    const proyecto: Project = {
      id,
      name: nombre,
      source: {
        path: ruta,
        name: basename(ruta),
        duration: info.duration,
        width: info.width,
        height: info.height,
        fps: info.fps
      },
      clips: [],
      brand: {
        name: nombre,
        primary: '#c9f26a',
        secondary: '#ff8a5c',
        font: 'Inter'
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      transcription: 'pendiente'
    }

    proyectos.create(proyecto)
    enviarProgreso({ id, fase: 'ingesta', pct: 0.05, texto: 'Leyendo el video' })

    try {
      await crearMiniatura(
        ruta,
        join(carpeta, 'miniatura.jpg'),
        Math.min(2, Math.max(0, info.duration / 2))
      )
      proyecto.thumbnail = 'miniatura.jpg'
      proyectos.save(proyecto)
      enviarProgreso({ id, fase: 'ingesta', pct: 0.25, texto: 'Miniatura lista' })
    } catch {
      // Sin miniatura, la interfaz usa su degradado.
    }

    // El proxy se genera en segundo plano: importar no debe esperar a un video de dos horas.
    if (info.height > 720 && info.duration > 30) {
      void crearProxy(ruta, join(carpeta, 'proxy.mp4'), info.duration, (pct) => {
        enviarProgreso({ id, fase: 'ingesta', pct: 0.25 + pct * 0.75, texto: 'Generando proxy' })
      })
        .then(() => {
          const actual = proyectos.get(id)
          if (!actual) return
          actual.proxy = 'proxy.mp4'
          proyectos.save(actual)
          enviarProgreso({ id, fase: 'ingesta', pct: 1, texto: 'Proxy listo' })
        })
        .catch(() => {
          enviarProgreso({ id, fase: 'ingesta', pct: 1, texto: 'Sin proxy; se usará el original' })
        })
    } else {
      enviarProgreso({ id, fase: 'ingesta', pct: 1, texto: 'Video listo' })
    }

    return {
      project: proyecto,
      videoUrl: `recorte-media://${id}/fuente`,
      thumbnailUrl: proyecto.thumbnail ? `recorte-media://${id}/${proyecto.thumbnail}` : undefined
    }
  }
  ipcMain.handle('proyecto:crear', (_evento, ruta: unknown) => ingerir(ruta))

  const configAgente = async (): Promise<ConfigAgente> => {
    const config = await ajustes.cargar()
    let api: ConfigAgente['api']
    if (config.activa && config.proveedor === 'api') {
      const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
      const clave = (await ajustes.clave()) ?? (esLocal ? 'local' : null)
      if (clave) api = { baseUrl: config.baseUrl, modelo: config.modelo, clave }
    }
    return {
      activa: config.activa && (config.proveedor === 'cli' || api !== undefined),
      proveedor: config.proveedor,
      comandoCli: config.comandoCli,
      api
    }
  }

  /**
   * La configuración de un paso de la creación. Si el usuario asignó esa tarea
   * a otro agente (modo avanzado) y ese agente está conectado, manda él, con el
   * nivel elegido; si no, el agente activo de siempre.
   */
  const configParaTarea = async (eleccion?: EleccionTarea): Promise<ConfigAgente> => {
    if (eleccion) {
      const agente = (await estadoAgentes()).find((a) => a.id === eleccion.agente)
      if (agente?.conectado && agente.instalado) {
        return { activa: true, proveedor: 'cli', comandoCli: comandoConEleccion(agente.comando, eleccion.agente, eleccion) }
      }
    }
    return configAgente()
  }

  const AGENTE_IDS = ['kimi', 'claude', 'codex', 'gemini', 'opencode', 'antigravity'] as const
  const NIVELES_MODELO = ['rapido', 'equilibrado', 'maximo'] as const
  /** Limpia lo que llega de la interfaz: solo agentes y niveles conocidos. */
  const limpiarTareas = (x: unknown): TareasCreacion | undefined => {
    if (!x || typeof x !== 'object') return undefined
    const limpiar = (e: unknown): EleccionTarea | undefined => {
      if (!e || typeof e !== 'object') return undefined
      const { agente, nivel, modelo, esfuerzo } = e as Record<string, unknown>
      if (typeof agente !== 'string' || !(AGENTE_IDS as readonly string[]).includes(agente)) return undefined
      return {
        agente: agente as EleccionTarea['agente'],
        ...(typeof modelo === 'string' && ID_SEGURO.test(modelo) ? { modelo } : {}),
        ...(typeof esfuerzo === 'string' && ID_SEGURO.test(esfuerzo) ? { esfuerzo } : {}),
        ...(typeof nivel === 'string' && (NIVELES_MODELO as readonly string[]).includes(nivel)
          ? { nivel: nivel as NivelModelo }
          : {})
      }
    }
    const t: TareasCreacion = {}
    const guion = limpiar((x as Record<string, unknown>).guion)
    const video = limpiar((x as Record<string, unknown>).video)
    if (guion) t.guion = guion
    if (video) t.video = video
    return guion || video ? t : undefined
  }

  // ===== Crear con IA =====
  const creandoAhora = new Set<string>()
  const mensaje = (rol: MensajeCreacion['rol'], texto: string, error = false): MensajeCreacion => ({
    id: randomUUID(),
    rol,
    texto,
    fecha: Date.now(),
    ...(error ? { error: true } : {})
  })
  const conCreacion = async (
    id: unknown,
    trabajo: (c: Creacion, senal: AbortSignal) => Promise<Creacion>
  ): Promise<Creacion> => {
    if (typeof id !== 'string') throw new Error('Creación inválida.')
    const c = creaciones.get(id)
    if (!c) throw new Error('Esa creación ya no existe.')
    if (creandoAhora.has(id)) throw new Error('El agente ya está trabajando en este video.')
    creandoAhora.add(id)
    inicioCreacion.set(id, Date.now())
    const senal = empezarTrabajo(`creacion:${id}`)
    try {
      return await trabajo(c, senal)
    } finally {
      terminarTrabajo(`creacion:${id}`, senal)
      creandoAhora.delete(id)
      inicioCreacion.delete(id)
    }
  }
  ipcMain.handle('creacion:parar', (_evento, id: unknown) => typeof id === 'string' && pararTrabajo(`creacion:${id}`))
  const textoError = (e: unknown) => (e instanceof Error ? e.message : String(e))

  /** La narración antes de tocar el guion: sirve para saber si la voz sigue sirviendo. */
  const fotoGuion = (c: Creacion): { texto: string; escenas: number } =>
    c.guion ? { texto: textoNarracion(c.guion), escenas: c.guion.escenas.length } : { texto: '', escenas: 0 }

  /**
   * Después de cambiar el guion: si cambió lo que se dice, rehace la voz de Gemini sola
   * (con el mismo timbre) o marca la voz propia como vieja; si solo cambiaron las
   * escenas, reajusta los tiempos sin volver a generar audio.
   */
  const refrescarVoz = async (
    c: Creacion,
    antes: { texto: string; escenas: number },
    onProgreso: (pct: number, texto: string) => void
  ): Promise<string> => {
    const voz = c.voz
    if (!voz || !c.guion) return ''
    const despues = textoNarracion(c.guion)
    if (!mismaNarracion(despues, antes.texto)) {
      if (voz.origen === 'propia') {
        voz.desactualizada = true
        return 'La narración cambió y tu voz grabada ya no dice el guion nuevo: grábala o súbela otra vez en Voz. Mientras tanto, el video va sin voz.'
      }
      const nombre = voz.vozGemini ?? 'Kore'
      try {
        const clave = await ajustes.claveVoz()
        const cuentaGoogle = estadoVozGoogle().correo
        if (!clave && !cuentaGoogle) throw new Error('no hay una cuenta de Google ni una clave de AI Studio conectada')
        onProgreso(0.1, `La narración cambió: rehago la voz (${nombre})`)
        const salida = join(creaciones.carpeta(c.id), 'composicion', 'media', 'voz.wav')
        if (clave) await generarVozGemini(despues, nombre, clave, salida)
        else await generarVozGoogle(despues, nombre, salida)
        c.voz = await prepararVoz(c, creaciones.carpeta(c.id), 'gemini', nombre, (pct, t) =>
          onProgreso(0.1 + pct * 0.9, t)
        )
        return `Volví a generar la voz (${nombre}) para que diga la narración nueva.`
      } catch (e) {
        voz.desactualizada = true
        return `La narración cambió, pero no pude rehacer la voz (${textoError(e)}). Quedó marcada como vieja: rehazla en el paso Voz y el video la usará.`
      }
    }
    if (c.guion.escenas.length !== antes.escenas) {
      try {
        onProgreso(0.4, 'Ajustando la voz a las escenas nuevas')
        c.voz = await prepararVoz(c, creaciones.carpeta(c.id), voz.origen, voz.vozGemini, (pct, t) =>
          onProgreso(0.4 + pct * 0.6, t)
        )
        return 'Ajusté los tiempos de la voz a las escenas nuevas.'
      } catch (e) {
        voz.desactualizada = true
        return `Cambió el número de escenas y no pude reajustar la voz (${textoError(e)}). Revísala en el paso Voz.`
      }
    }
    return ''
  }

  // ===== Copiar un estilo: análisis del material y de la referencia =====
  ipcMain.handle('estilo:analizar', (_evento, id: unknown, modo: unknown) =>
    conCreacion(id, async (c, senal) => {
      const carpeta = creaciones.carpeta(c.id)
      try {
        // Fase 1: el material del usuario, en local.
        await analizarMaterialCreacion(c, carpeta, (pct, texto) => enviarProgreso({ id: c.id, fase: 'creacion', pct: pct * 0.5, texto }), senal)
        // Fase 2: medir la referencia y que el agente la interprete.
        if (c.referencia) {
          const rutaRef = join(carpeta, c.referencia.archivo)
          const medido = await medirReferencia(rutaRef, carpeta, (pct, texto) => enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.5 + pct * 0.35, texto }), senal)
          enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.88, texto: 'El agente está estudiando el estilo' })
          let ficha
          if (modo === 'gemini') {
            const clave = await ajustes.claveVoz()
            if (!clave) throw new Error('Para analizar con Gemini hace falta tu llave de AI Studio (Ajustes → Voz).')
            try {
              ficha = await analizarConGeminiVideo(rutaRef, medido, clave, carpeta, senal)
            } catch (e) {
              if (esParado(e)) throw e
              c.mensajes.push(mensaje('agente', `Gemini no pudo ver el video (${textoError(e)}). Lo analizo con tu agente, por fotogramas.`))
              ficha = await interpretarEstilo(carpeta, medido, await configParaTarea(c.tareas?.guion), senal)
            }
          } else {
            ficha = await interpretarEstilo(carpeta, medido, await configParaTarea(c.tareas?.guion), senal)
          }
          // Si el agente no dio un ritmo, el de la ficha es el medido (así se ve y se puede editar).
          if (!ficha.ritmoSegundos && medido.medianaPlano > 0) {
            ficha.ritmoSegundos = Math.round(medido.medianaPlano * 10) / 10
            guardar(join(carpeta, 'analisis', 'estilo.json'), JSON.stringify(ficha, null, 2))
          }
          c.ficha = ficha
          c.viabilidad = (await viabilidadDe(c, ajustes)) ?? undefined
          c.mensajes.push(
            mensaje(
              'agente',
              `Estilo analizado: ${ficha.resumen}${ficha.nota ? ` ${ficha.nota}` : ficha.aproximada ? ' (ficha aproximada: tu agente no vio las imágenes, salió de lo medido).' : ''} Se puede copiar en un ${c.viabilidad?.porcentaje ?? '?'} % con lo que tienes conectado.`
            )
          )
        }
      } catch (e) {
        // Como en el guion y el video: parar o fallar deja un mensaje en el chat, no solo un aviso.
        c.mensajes.push(
          esParado(e)
            ? mensaje('agente', 'Lo paraste. Cuando quieras, vuelve a darle a «Analizar el estilo».')
            : mensaje('agente', `No pude analizar el estilo: ${textoError(e)}`, true)
        )
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  // ===== Modo agente: el agente trabaja con herramientas en la carpeta de la creación =====
  /** El avance según el tiempo: se acerca al 95 % sin llegar (lo que suele tardar = ~63 %). */
  const pctPorTiempo = (desde: number, suele: number) => 0.05 + 0.9 * (1 - Math.exp(-(Date.now() - desde) / 1000 / suele))
  const avisarAgente = (c: Creacion, linea: string, pct: number) => {
    if (!c.agente) c.agente = { registro: [], rondas: 0 }
    anotar(c.agente, linea)
    // «PASO 3: …»: el agente anuncia cada paso del plan y el chat lo marca (nunca hacia atrás).
    const paso = c.fase === 'video' && c.agente.plan ? pasoAnunciado(linea, c.agente.plan.pasos.length) : null
    if (paso && paso > (c.agente.paso ?? 0)) c.agente.paso = paso
    enviarProgreso({
      id: c.id,
      fase: 'creacion',
      pct,
      texto: linea.slice(0, 140),
      registro: c.agente.registro.slice(-10),
      ...(c.agente.paso ? { paso: c.agente.paso } : {}),
      ...(c.fase === 'video' && c.agente.plan?.pasos.length ? { pasos: c.agente.plan.pasos } : {})
    })
  }
  /** Una frase con la voz de Gemini del usuario (su clave de AI Studio o su cuenta de Google). */
  const generarFraseVoz = async (texto: string, voz: string, salida: string): Promise<void> => {
    const clave = await ajustes.claveVoz()
    if (clave) return generarVozGemini(texto, voz, clave, salida)
    if (!estadoVozGoogle().correo) throw new Error('no hay una cuenta de Google ni una clave de AI Studio conectada (Ajustes → Voz)')
    return generarVozGoogle(texto, voz, salida)
  }
  ipcMain.handle('agente:plan', (_evento, id: unknown, pedido: unknown) =>
    conCreacion(id, async (c, senal) => {
      const texto = typeof pedido === 'string' && pedido.trim() ? pedido.trim().slice(0, 2000) : undefined
      if (texto) c.mensajes.push(mensaje('usuario', texto))
      c.fase = 'plan'
      creaciones.guardar(c)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.1, texto: 'El agente está mirando tus archivos' })
      try {
        const desde = Date.now()
        const { plan, sesion } = await pasoPlan(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.video), (l) => avisarAgente(c, l, pctPorTiempo(desde, 180)), senal)
        // La conversación queda viva: «Hazlo» y cada cambio la retoman (no se vuelve a mirar todo).
        c.agente = { ...(c.agente ?? { registro: [], rondas: 0 }), plan, ...(sesion ? { sesion } : {}) }
        const partes = [plan.entendi, ...plan.pasos.map((p, i) => `${i + 1}. ${p}`)]
        if (plan.preguntas.length) partes.push(`Antes de hacerlo: ${plan.preguntas.join(' ')}`)
        // «Hazlo directo»: sin preguntas pendientes, empieza sin esperar la aprobación.
        const directo = c.directo === true && !plan.preguntas.length && !c.agente.resultado
        c.mensajes.push({
          ...mensaje('agente', partes.join('\n')),
          propuestas: plan.preguntas.length || directo ? [] : ['Hazlo']
        })
        if (directo) {
          creaciones.guardar(c)
          await hacerConAgente(c, senal)
        }
      } catch (e) {
        if (esParado(e)) c.mensajes.push(mensaje('agente', 'Lo paraste. Cuando quieras, escríbeme qué hacemos.'))
        else c.mensajes.push(mensaje('agente', `No pude preparar el plan: ${textoError(e)}`, true))
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  ipcMain.handle('agente:hacer', (_evento, id: unknown, pedido: unknown) =>
    conCreacion(id, async (c, senal) => {
      const texto = typeof pedido === 'string' && pedido.trim() ? pedido.trim().slice(0, 2000) : undefined
      if (texto) c.mensajes.push(mensaje('usuario', texto))
      await hacerConAgente(c, senal, texto)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  /** El agente hace (o cambia) el video, Recorte lo revisa y lo deja publicado en la creación. */
  async function hacerConAgente(c: Creacion, senal: AbortSignal, texto?: string): Promise<void> {
      const faseAntes = c.fase
      c.fase = 'video'
      if (!c.agente) c.agente = { registro: [], rondas: 0 }
      c.agente.registro = []
      delete c.agente.paso
      creaciones.guardar(c)
      const carpeta = creaciones.carpeta(c.id)
      const config = await configParaTarea(c.tareas?.video)
      // Mientras trabaja, Recorte atiende sus pedidos de voz con la voz elegida en la caja.
      const pararVoz = atenderVoz(join(carpeta, 'trabajo'), c.vozElegida, generarFraseVoz, (l) => avisarAgente(c, l, 0.5))
      // Y sus pedidos de imágenes y clips, con Flow o ChatGPT (lo que eligió en la caja).
      const pararMedios = atenderMedios(
        join(carpeta, 'trabajo'),
        c.flow,
        c.formato === 'horizontal' ? '16:9' : '9:16',
        {
          flow: (pedido, destino) => pedirFlow(pedido, destino, senal),
          chatgpt: (pedido, destino, nombre) => generarImagenChatGPT(pedido, destino, nombre, senal)
        },
        (l) => avisarAgente(c, l, 0.5)
      )
      try {
        enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.05, texto: 'El agente está trabajando' })
        // Si pide un cambio sobre lo hecho, va como pedido; si solo aprobó el plan, sin pedido.
        const cambio = texto && !esAprobacion(texto) ? texto : undefined
        const desde = Date.now()
        try {
          const turno = await pasoHacer(c, carpeta, config, cambio, (l) => avisarAgente(c, l, pctPorTiempo(desde, 480)), senal)
          if (turno.sesion) c.agente.sesion = turno.sesion
          creaciones.guardar(c)
        } catch (e) {
          // Si el agente falló al salir pero ya dejó un video nuevo, se revisa igual: no se
          // tira el trabajo (ni los créditos) por un error al cerrar.
          if (esParado(e) || !archivoEntregado(carpeta, desde)) throw e
          avisarAgente(c, `El agente terminó con un aviso (${textoError(e).slice(0, 120)}), pero dejó su entrega`, 0.93)
        }
        avisarAgente(c, 'Recorte revisa la entrega', 0.95)
        // Solo vale lo que el agente escribió en esta ronda (nunca el video anterior).
        let revisado = await revisarYPublicar(c, carpeta, c.version + 1, desde)
        if (revisado.problemas.length) {
          // Recorte encontró algo mal: el agente lo corrige una vez.
          avisarAgente(c, `Recorte revisó y encontró: ${revisado.problemas.join(' ')}`, 0.85)
          const turno = await pasoHacer(c, carpeta, config, `La revisión de Recorte encontró problemas en tu entrega: ${revisado.problemas.join(' ')} Corrígelo y vuelve a entregar.`, (l) => avisarAgente(c, l, 0.9), senal, true)
          if (turno.sesion) c.agente.sesion = turno.sesion
          revisado = await revisarYPublicar(c, carpeta, c.version + 1, desde)
        }
        if (!revisado.resultado) throw new Error(revisado.problemas.join(' '))
        c.version += 1
        c.agente.rondas += 1
        c.agente.resultado = revisado.resultado
        if (revisado.resultado.tipo === 'video') {
          c.salida = revisado.resultado.archivo
          c.portada = revisado.resultado.revision[1] ?? revisado.resultado.revision[0]
        }
        c.fase = 'listo'
        const copia = revisado.resultado.tipo === 'video' ? await copiarCreacion(c) : null
        const comprobado = revisado.resultado.comprobaciones.length ? ` Comprobé: ${revisado.resultado.comprobaciones.join('; ')}.` : ''
        c.mensajes.push({
          ...mensaje('agente', `${revisado.resultado.resumen}${comprobado}${copia ? ` Guardado en ${copia}.` : ''}`),
          propuestas: []
        })
      } catch (e) {
        c.fase = c.agente?.resultado ? 'listo' : faseAntes === 'video' ? 'plan' : faseAntes
        if (esParado(e)) c.mensajes.push(mensaje('agente', c.agente?.resultado ? 'Lo paraste. La versión anterior sigue intacta.' : 'Lo paraste. El plan sigue aquí.'))
        else c.mensajes.push(mensaje('agente', `No pude terminarlo: ${textoError(e)}`, true))
      } finally {
        pararVoz()
        pararMedios()
      }
  }

  ipcMain.handle('estilo:continuar', (_evento, id: unknown) =>
    conCreacion(id, async (c) => {
      if (c.fase === 'estilo') c.fase = 'guion'
      return creaciones.guardar(c)
    })
  )
  // Se recalcula al conectar algo (Flow, ChatGPT, la voz), sin volver a analizar.
  ipcMain.handle('estilo:viabilidad', (_evento, id: unknown) =>
    conCreacion(id, async (c) => {
      c.viabilidad = (await viabilidadDe(c, ajustes)) ?? undefined
      return creaciones.guardar(c)
    })
  )
  // Editar a mano lo básico de la ficha: subtítulos y ritmo.
  ipcMain.handle('estilo:ficha-guardar', (_evento, id: unknown, cambios: unknown) =>
    conCreacion(id, async (c) => {
      if (!c.ficha) throw new Error('Todavía no hay ficha de estilo.')
      const x = (cambios ?? {}) as { subtitulos?: { lleva?: unknown; modo?: unknown }; ritmoSegundos?: unknown }
      if (x.subtitulos && typeof x.subtitulos === 'object') {
        if (typeof x.subtitulos.lleva === 'boolean') c.ficha.subtitulos.lleva = x.subtitulos.lleva
        if (x.subtitulos.modo === 'palabra' || x.subtitulos.modo === 'frase') c.ficha.subtitulos.modo = x.subtitulos.modo
      }
      if (typeof x.ritmoSegundos === 'number' && Number.isFinite(x.ritmoSegundos)) {
        c.ficha.ritmoSegundos = Math.min(20, Math.max(0.3, x.ritmoSegundos))
      }
      guardar(join(creaciones.carpeta(c.id), 'analisis', 'estilo.json'), JSON.stringify(c.ficha, null, 2))
      c.viabilidad = (await viabilidadDe(c, ajustes)) ?? undefined
      return creaciones.guardar(c)
    })
  )

  ipcMain.handle('dialog:open-adjuntos', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Fotos o clips para tu video',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fotos y videos', extensions: EXTENSIONES_ADJUNTOS }]
    })
    return r.canceled ? [] : r.filePaths
  })
  // Una carpeta donde el usuario ya juntó el material del video: entra todo lo que sirva.
  ipcMain.handle('dialog:open-carpeta', async () => {
    const r = await dialog.showOpenDialog({ title: 'La carpeta con el material de tu video', properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('dialog:open-referencia', async () => {
    const r = await dialog.showOpenDialog({
      title: 'El video cuyo estilo quieres copiar',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }]
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  const destrabar = (c: Creacion): Creacion => {
    if (c.modo === 'agente' && c.fase === 'video' && !creandoAhora.has(c.id)) {
      // Se cerró la app con el agente trabajando: vuelve a donde estaba.
      c.fase = c.agente?.resultado ? 'listo' : 'plan'
      return creaciones.guardar(c)
    }
    if (c.fase === 'video' && !creandoAhora.has(c.id)) {
      c.fase = c.salida ? 'listo' : c.voz ? 'voz' : 'guion'
      creaciones.guardar(c)
    }
    return c
  }
  ipcMain.handle('creacion:listar', () => creaciones.listar().map(destrabar))
  ipcMain.handle('creacion:borrar', async (_evento, id: unknown) => {
    if (typeof id !== 'string' || !creaciones.get(id)) return false
    if (creandoAhora.has(id)) throw new Error('El agente está trabajando en esa creación: espera a que acabe.')
    await shell.trashItem(creaciones.carpeta(id))
    return true
  })
  ipcMain.handle('creacion:en-curso', () => Object.fromEntries(inicioCreacion))
  ipcMain.handle('creacion:abrir', (_evento, id: unknown) => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    return c ? destrabar(c) : null
  })
  ipcMain.handle('creacion:nueva', async (_evento, p: unknown) => {
    const x = (p ?? {}) as Partial<PeticionCreacion>
    if (typeof x.peticion !== 'string' || !x.peticion.trim()) throw new Error('Cuéntale al agente qué video quieres.')
    usoCreacion(x.formato === 'horizontal' ? 'horizontal' : 'vertical', typeof x.duracion === 'number' ? x.duracion : 30, typeof x.estilo === 'string' ? x.estilo : 'libre')
    return creaciones.nueva({
      peticion: x.peticion,
      estilo: typeof x.estilo === 'string' ? x.estilo : 'libre',
      formato: x.formato === 'horizontal' ? 'horizontal' : 'vertical',
      duracion: typeof x.duracion === 'number' ? x.duracion : 30,
      adjuntos: Array.isArray(x.adjuntos) ? x.adjuntos.filter((a): a is string => typeof a === 'string') : [],
      ...(x.modo === 'agente' ? { modo: 'agente' as const } : {}),
      ...(typeof x.referencia === 'string' && /\.(mp4|mov|webm|mkv|m4v)$/i.test(x.referencia) ? { referencia: x.referencia } : {}),
      tareas: limpiarTareas(x.tareas),
      ...(x.flow && typeof x.flow === 'object'
        ? (() => {
            const f = x.flow as { imagenes?: unknown; videos?: unknown; modeloImagen?: unknown; modeloVideo?: unknown }
            return {
              flow: {
                imagenes: Boolean(f.imagenes),
                videos: Boolean(f.videos),
                ...(typeof f.modeloImagen === 'string' && (MODELOS_IMAGEN.includes(f.modeloImagen) || f.modeloImagen === MODELO_CHATGPT)
                  ? { modeloImagen: f.modeloImagen }
                  : {}),
                ...(typeof f.modeloVideo === 'string' && modelosVideoVigentes().includes(f.modeloVideo) ? { modeloVideo: f.modeloVideo } : {})
              }
            }
          })()
        : {})
    })
  })
  ipcMain.handle('creacion:guion', (_evento, id: unknown, pedido: unknown) =>
    conCreacion(id, async (c, senal) => {
      const texto = typeof pedido === 'string' && pedido.trim() ? pedido.trim().slice(0, 2000) : undefined
      if (texto) c.mensajes.push(mensaje('usuario', texto))
      c.fase = 'guion'
      creaciones.guardar(c)
      // Si hay videos tuyos, el guionista recibe qué se dice y en qué segundo (local y en caché:
      // la primera vez tarda lo que tarde Whisper; después es instantáneo).
      if (c.adjuntos.some((a) => a.tipo === 'video')) {
        try {
          await analizarMaterialCreacion(c, creaciones.carpeta(c.id), (pct, t) => enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.02 + pct * 0.08, texto: t }), senal)
        } catch (e) {
          if (esParado(e)) {
            c.mensajes.push(mensaje('agente', 'Lo paraste mientras miraba tu material.'))
            enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
            return creaciones.guardar(c)
          }
          // Si el análisis falla, el guion se escribe igual (con solo los nombres de archivo).
        }
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.1, texto: c.guion ? 'Cambiando el guion' : 'Escribiendo el guion' })
      try {
        const antes = fotoGuion(c)
        const r = await pasoGuion(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.guion), texto, senal, bloqueGustos())
        c.guion = r.guion
        const aprendidos = agregarGustos(r.aprendido, 'aprendido').map((g) => g.texto)
        c.mensajes.push({
          ...mensaje('agente', r.mensaje),
          ...(r.propuestas.length ? { propuestas: r.propuestas } : {}),
          ...(aprendidos.length ? { aprendido: aprendidos } : {})
        })
        const notaVoz = await refrescarVoz(c, antes, (pct, t) =>
          enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.15 + pct * 0.8, texto: t })
        )
        if (notaVoz) c.mensajes.push(mensaje('agente', notaVoz))
      } catch (e) {
        if (esParado(e)) c.mensajes.push(mensaje('agente', c.guion ? 'Lo paraste. El guion sigue como estaba.' : 'Lo paraste antes de que terminara el guion.'))
        else c.mensajes.push(mensaje('agente', `No pude escribir el guion: ${textoError(e)}`, true))
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  ipcMain.handle('creacion:video', (_evento, id: unknown, pedido: unknown) =>
    conCreacion(id, async (c, senal) => {
      const texto = typeof pedido === 'string' && pedido.trim() ? pedido.trim().slice(0, 2000) : undefined
      if (texto) c.mensajes.push(mensaje('usuario', texto))
      if (texto && c.salida && c.voz && pideMontarVoz(texto)) {
        // «Pon la voz»: lo hace el montaje, no el agente.
        if (vozDesactualizada(c)) {
          c.mensajes.push(
            mensaje('agente', 'La voz que tengo no coincide con el guion actual. Regénerala o graba otra en el paso Voz; después la pongo en el video.', true)
          )
          enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
          return creaciones.guardar(c)
        }
        try {
          await montarVoz(c)
        } catch (e) {
          c.mensajes.push(mensaje('agente', `No pude poner la voz en el video: ${textoError(e)}`, true))
        }
        enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
        return creaciones.guardar(c)
      }
      const faseAntes = c.fase
      c.fase = 'video'
      creaciones.guardar(c)
      try {
        // Un retoque de aspecto (color, letra, animación) va directo al compositor: una sola
        // llamada al agente, sin reescribir el guion, rehacer la voz ni pedir medios a Flow.
        // Si el cambio toca lo que se dice o las escenas, primero se actualiza el guion (y la
        // voz si cambió la narración) y después el compositor cambia las escenas.
        const tocaGuion = Boolean(texto && c.salida && c.guion && cambiaElGuion(texto))
        if (tocaGuion && texto) {
          const antes = fotoGuion(c)
          enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.05, texto: 'Revisando el guion con tu cambio' })
          const g = await pasoGuion(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.guion), texto, senal, bloqueGustos())
          c.guion = g.guion
          creaciones.guardar(c)
          const notaVoz = await refrescarVoz(c, antes, (pct, t) =>
            enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.08 + pct * 0.17, texto: t })
          )
          if (notaVoz) c.mensajes.push(mensaje('agente', notaVoz))
        }
        const r = await pasoVideo(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.video), (pct, t) =>
          enviarProgreso({ id: c.id, fase: 'creacion', pct, texto: t })
        , texto && c.salida ? texto : undefined, senal, bloqueGustos(), !c.salida || tocaGuion)
        c.salida = r.salida
        c.portada = r.portada
        c.version += 1
        if (vozVigente(c)) c.vozMontada = c.version
        else delete c.vozMontada
        c.fase = 'listo'
        const copia = await copiarCreacion(c)
        c.mensajes.push(mensaje('agente', `${r.mensaje}${copia ? ` Guardado en ${copia}.` : ''}`))
      } catch (e) {
        c.fase = faseAntes === 'video' ? (c.salida ? 'listo' : 'guion') : faseAntes
        if (esParado(e)) {
          c.mensajes.push(mensaje('agente', c.salida ? 'Lo paraste. El video anterior sigue intacto.' : 'Lo paraste. El guion sigue aquí para cuando quieras hacer el video.'))
        } else c.mensajes.push(mensaje('agente', `No pude hacer el video: ${textoError(e)}`, true))
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  ipcMain.handle('creacion:editor', async (_evento, id: unknown) => {
    if (typeof id !== 'string') throw new Error('Creación inválida.')
    const c = creaciones.get(id)
    if (!c?.salida) throw new Error('Todavía no hay un video para editar.')
    // Si ya se abrió antes, se sigue en el mismo proyecto (con sus ediciones).
    if (c.proyectoEditor && (c.editorSalida ?? c.salida) === c.salida) {
      const previo = proyectos.abrir(c.proyectoEditor)
      if (previo) return previo
    }
    const ingesta = await ingerir(join(creaciones.carpeta(id), c.salida), `${c.guion?.titulo ?? c.nombre}${c.version > 1 ? ` (v${c.version})` : ''}`)
    c.proyectoEditor = ingesta.project.id
    c.editorSalida = c.salida
    creaciones.guardar(c)
    // Si el agente lo hizo con el kit, su receta se abre como timeline: cada foto, rótulo,
    // frase de voz y la música quedan sueltos en su pista. Si no, entra el video entero.
    const receta = c.modo === 'agente' ? c.agente?.resultado?.receta : undefined
    if (receta) {
      try {
        const carpeta = creaciones.carpeta(id)
        const p = ingesta.project
        const armado = await proyectoDesdeReceta(join(carpeta, receta), join(carpeta, 'trabajo'), proyectos.carpeta(p.id), p.source.duration)
        if (armado) {
          p.medios = armado.medios
          p.timeline = armado.timeline
          proyectos.save(p)
        }
      } catch {
        // Con una receta que no se puede leer, el editor abre el video entero, como antes.
      }
    }
    return proyectos.abrir(ingesta.project.id) ?? ingesta.project
  })
  // ===== Voz de las creaciones =====
  ipcMain.handle('voz:estado', async () => ({ ...(await ajustes.estadoVoz()), google: estadoVozGoogle() }))
  // La voz con la cuenta de Google: se entra en Edge (Google no deja entrar dentro de la app).
  ipcMain.handle('voz:google-conectar', () => {
    void conectarVozGoogle()
    return { ...estadoVozGoogle(), conectando: true }
  })
  ipcMain.handle('voz:google-desconectar', () => desconectarVozGoogle())
  ipcMain.handle('voz:guardar', (_evento, cambio: unknown) => {
    const x = (cambio ?? {}) as { clave?: unknown; vozGemini?: unknown }
    return ajustes.guardarVoz({
      clave: typeof x.clave === 'string' ? x.clave : undefined,
      vozGemini: typeof x.vozGemini === 'string' ? x.vozGemini : undefined
    })
  })
  /** La voz al video ya hecho, sin agente. Deja la versión nueva y su mensaje. */
  const montarVoz = async (c: Creacion) => {
    const r = await montarVozEnVideo(c, creaciones.carpeta(c.id), (pct, t) => enviarProgreso({ id: c.id, fase: 'creacion', pct, texto: t }))
    c.salida = r.salida
    if (r.portada) c.portada = r.portada
    c.version += 1
    c.vozMontada = c.version
    c.fase = 'listo'
    const copia = await copiarCreacion(c)
    c.mensajes.push(mensaje('agente', `${r.mensaje}${copia ? ` Guardado en ${copia}.` : ''}`))
  }

  const terminarVoz = async (c: Creacion, origen: 'gemini' | 'propia', vozGemini?: string) => {
    c.voz = await prepararVoz(c, creaciones.carpeta(c.id), origen, vozGemini, (pct, t) =>
      enviarProgreso({ id: c.id, fase: 'creacion', pct, texto: t })
    )
    c.fase = c.salida ? 'listo' : 'voz'
    if (!c.salida) {
      c.mensajes.push(
        mensaje('agente', `Voz lista (${c.voz.duracion.toFixed(1)} s${vozGemini ? `, voz ${vozGemini}` : ', tu voz'}). Las escenas ya siguen sus tiempos; cuando quieras, haz el video.`)
      )
      return
    }
    // El video ya existe: la voz se pone sola, sin rediseñar ni gastar tokens.
    try {
      await montarVoz(c)
    } catch (e) {
      c.mensajes.push(mensaje('agente', `La voz está lista, pero no pude ponerla en el video: ${textoError(e)}`, true))
    }
  }
  ipcMain.handle('creacion:montar-voz', (_evento, id: unknown) =>
    conCreacion(id, async (c) => {
      try {
        await montarVoz(c)
      } catch (e) {
        c.mensajes.push(mensaje('agente', `No pude poner la voz en el video: ${textoError(e)}`, true))
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  ipcMain.handle('creacion:voz-gemini', (_evento, id: unknown, voz: unknown) =>
    conCreacion(id, async (c) => {
      const nombre = typeof voz === 'string' && VOCES_GEMINI.some((v) => v.id === voz) ? voz : 'Kore'
      const clave = await ajustes.claveVoz()
      const cuentaGoogle = estadoVozGoogle().correo
      if (!clave && !cuentaGoogle) throw new Error('Conecta tu cuenta de Google o pega tu clave de AI Studio para generar la voz.')
      if (!c.guion) throw new Error('Primero hace falta el guion.')
      await ajustes.guardarVoz({ vozGemini: nombre })
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.1, texto: `Generando la voz (${nombre})` })
      try {
        const salida = join(creaciones.carpeta(c.id), 'composicion', 'media', 'voz.wav')
        if (clave) await generarVozGemini(textoNarracion(c.guion), nombre, clave, salida)
        else await generarVozGoogle(textoNarracion(c.guion), nombre, salida)
        await terminarVoz(c, 'gemini', nombre)
      } catch (e) {
        c.mensajes.push(mensaje('agente', `No pude generar la voz: ${textoError(e)}`, true))
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  ipcMain.handle('creacion:voz-propia', async (_evento, id: unknown, datos: unknown) => {
    let ruta: string | null = null
    if (!(datos instanceof Uint8Array)) {
      const r = await dialog.showOpenDialog({
        title: 'Tu voz para este video',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'webm', 'flac'] }]
      })
      if (r.canceled || !r.filePaths[0]) return null
      ruta = r.filePaths[0]
    }
    return conCreacion(id, async (c) => {
      if (!c.guion) throw new Error('Primero hace falta el guion.')
      const carpeta = creaciones.carpeta(c.id)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.2, texto: 'Preparando tu voz' })
      let temporal: string | null = null
      try {
        if (!ruta) {
          temporal = join(carpeta, 'grabacion.webm')
          writeFileSync(temporal, datos as Uint8Array)
        }
        await convertirAVoz(ruta ?? temporal!, carpeta)
        await terminarVoz(c, 'propia')
      } catch (e) {
        c.mensajes.push(mensaje('agente', `No pude usar ese audio: ${textoError(e)}`, true))
      } finally {
        if (temporal) rmSync(temporal, { force: true })
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  })
  ipcMain.handle('creacion:quitar-voz', (_evento, id: unknown) =>
    conCreacion(id, async (c) => {
      delete c.voz
      delete c.vozMontada
      rmSync(join(creaciones.carpeta(c.id), 'composicion', 'media', 'voz.wav'), { force: true })
      return creaciones.guardar(c)
    })
  )

  ipcMain.handle('creacion:mostrar', (_evento, id: unknown) => {
    if (typeof id !== 'string') return false
    const c = creaciones.get(id)
    if (!c?.salida) return false
    const ruta = join(creaciones.carpeta(id), c.salida)
    if (!existsSync(ruta)) return false
    shell.showItemInFolder(ruta)
    return true
  })

  ipcMain.handle('proyecto:listar', () => proyectos.list())

  // ===== Medios: más videos e imágenes en un proyecto =====
  ipcMain.handle('proyecto:agregar-medios', async (_evento, id: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id)) throw new Error('Proyecto inválido.')
    const r = await dialog.showOpenDialog({
      title: 'Videos o imágenes para tu proyecto',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos e imágenes', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (r.canceled || !r.filePaths.length) return null
    const carpeta = join(proyectos.carpeta(id), 'medios')
    mkdirSync(carpeta, { recursive: true })
    const nuevos: NonNullable<Project['medios']> = []
    const fallos: string[] = []
    for (const ruta of r.filePaths.slice(0, 50)) {
      const ext = extname(ruta).toLowerCase()
      const imagen = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)
      try {
        const info = await probeVideo(ruta)
        const mid = `m-${randomUUID().slice(0, 8)}`
        let miniatura: string | undefined
        if (!imagen) {
          await crearMiniatura(ruta, join(carpeta, `${mid}.jpg`), Math.min(1, Math.max(0, info.duration / 2))).then(
            () => (miniatura = `medios/${mid}.jpg`),
            () => {}
          )
        }
        nuevos.push({
          id: mid,
          ruta,
          nombre: basename(ruta),
          tipo: imagen ? 'imagen' : 'video',
          duracion: imagen ? 0 : info.duration,
          ancho: info.width,
          alto: info.height,
          conAudio: !imagen && info.hasAudio,
          ...(miniatura ? { miniatura } : {})
        })
      } catch {
        fallos.push(basename(ruta))
      }
    }
    const actual = proyectos.abrir(id)!
    actual.medios = [...(actual.medios ?? []), ...nuevos]
    proyectos.save(actual)
    return { project: actual, agregados: nuevos.map((m) => m.id), fallos }
  })
  // Una frase de narración hecha a mano en el editor: con el texto y la voz que diga el usuario,
  // sin pasar por el agente (no gasta sus créditos). El audio queda en la carpeta del proyecto.
  ipcMain.handle('proyecto:voz-frase', async (_evento, id: unknown, pedido: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id)) throw new Error('El proyecto ya no existe.')
    const x = (pedido ?? {}) as { texto?: unknown; voz?: unknown }
    const texto = typeof x.texto === 'string' ? x.texto.replace(/\s+/g, ' ').trim().slice(0, 600) : ''
    if (!texto) throw new Error('Escribe lo que tiene que decir.')
    const voz = typeof x.voz === 'string' && VOCES_GEMINI.some((v) => v.id === x.voz) ? x.voz : ((await ajustes.estadoVoz()).vozGemini ?? 'Kore')
    const media = join(proyectos.carpeta(id), 'media')
    mkdirSync(media, { recursive: true })
    const nombre = `voz-${randomUUID().slice(0, 8)}.wav`
    try {
      await generarFraseVoz(texto, voz, join(media, nombre))
    } catch (e) {
      throw new Error(`No pude generar la voz: ${textoError(e)}`)
    }
    const duracion = Math.round((await duracionMedio(join(media, nombre))) * 100) / 100
    if (!(duracion > 0)) throw new Error('La voz salió vacía. Inténtalo otra vez.')
    await ajustes.guardarVoz({ vozGemini: voz })
    return { archivo: `media/${nombre}`, duracion, texto, voz }
  })
  ipcMain.handle('proyecto:quitar-medio', (_evento, id: unknown, medio: unknown) => {
    if (typeof id !== 'string' || typeof medio !== 'string') throw new Error('Datos inválidos.')
    const actual = proyectos.abrir(id)
    if (!actual) throw new Error('El proyecto ya no existe.')
    // Quitarlo del proyecto quita también sus clips de la timeline (el archivo no se toca).
    actual.medios = (actual.medios ?? []).filter((m) => m.id !== medio)
    if (actual.timeline) actual.timeline = quitarFuente(actual.timeline, medio)
    rmSync(join(proyectos.carpeta(id), 'medios', `${medio}.jpg`), { force: true })
    proyectos.save(actual)
    return actual
  })
  // Borrar es mandar la carpeta a la Papelera: se puede recuperar y el video original no se toca.
  ipcMain.handle('proyecto:borrar', async (_evento, id: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id)) return false
    if (enRender.has(id) || enLote.has(id)) throw new Error('Ese proyecto está renderizando: espera a que acabe.')
    await shell.trashItem(proyectos.carpeta(id))
    return true
  })

  ipcMain.handle('proyecto:abrir', (_evento, id: unknown) => {
    if (typeof id !== 'string') return null
    return proyectos.abrir(id)
  })

  ipcMain.handle('proyecto:guardar', (_evento, proyecto: Project) => {
    if (!proyecto || typeof proyecto.id !== 'string') return
    const actual = proyectos.get(proyecto.id)
    if (!actual) return

    // El proceso principal es dueño de estos campos: la interfaz puede guardar
    // una copia anterior mientras el proxy o la transcripción avanzan.
    proyectos.save({
      ...proyecto,
      proxy: actual.proxy ?? proyecto.proxy,
      thumbnail: actual.thumbnail ?? proyecto.thumbnail,
      transcription: actual.transcription,
      transcriptionError: actual.transcriptionError,
      language: actual.language,
      // La timeline llega de la interfaz: se valida contra el material antes de tocar el disco.
      // Los medios los lleva el proceso principal (sus rutas no vienen de la interfaz).
      medios: actual.medios,
      timeline: proyecto.timeline
        ? normalizarTimeline(proyecto.timeline, actual.source.duration, duracionesDeMedios(actual.medios))
        : actual.timeline
    })
  })

  ipcMain.handle('proyecto:transcribir', async (_evento, id: unknown): Promise<TranscripcionResultado> => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }

    const proyecto = proyectos.get(id)
    if (!proyecto) return { ok: false, error: 'No existe el proyecto.' }

    proyecto.transcription = 'transcribiendo'
    proyecto.transcriptionError = undefined
    proyectos.save(proyecto)

    const resultado = await transcribir(proyecto, proyectos.carpeta(id), enviarProgreso)

    // Se relee el proyecto: el proxy pudo terminar y guardarse mientras transcribíamos.
    const actual = proyectos.get(id)
    if (!actual) return { ok: false, error: 'El proyecto ya no existe.' }

    if (resultado.ok) {
      const transcript = resultado.transcript ?? []
      proyectos.guardarTranscripcion(id, transcript)
      actual.transcript = transcript
      actual.transcription = 'lista'
      actual.language = resultado.language
      delete actual.transcriptionError
    } else {
      actual.transcription = 'error'
      actual.transcriptionError = resultado.error
    }
    proyectos.save(actual)

    return {
      ok: resultado.ok,
      error: resultado.error,
      project: actual,
      transcript: resultado.transcript
    }
  })

  ipcMain.handle('ajustes:cargar', () => ajustes.cargar())

  // El estado de cada agente con su forma de pago: con llave, «conectado» es tener la llave.
  const agentesConPago = async () => {
    const [lista, pagos] = await Promise.all([estadoAgentes(), ajustes.pagosAgentes()])
    return lista.map((a) => {
      const admiteLlave = Boolean(VARIABLE_LLAVE[a.id])
      const p = pagos[a.id] ?? { pago: 'suscripcion' as const, tieneLlave: false }
      return {
        ...a,
        admiteLlave,
        pago: p.pago,
        tieneLlave: p.tieneLlave,
        conectado: admiteLlave && p.pago === 'llave' ? p.tieneLlave : a.conectado
      }
    })
  }
  // Si un agente paga con llave, su proceso la recibe en su variable (p. ej. ANTHROPIC_API_KEY).
  definirEntornoAgentes(async (orden) => {
    const id = agenteDeOrden(orden)
    const variable = id ? VARIABLE_LLAVE[id] : undefined
    if (!id || !variable) return {}
    const llave = await ajustes.llaveSiPagaConLlave(id)
    return llave ? { [variable]: llave } : {}
  })
  // Si la sesión de un agente se cae mientras trabaja, deja de contar como conectado y la
  // interfaz se entera al momento (Inicio muestra «Conectar» y sale un aviso).
  avisarSesionCaida((orden) => {
    const id = agenteDeOrden(orden)
    if (!id) return
    marcarSesionCaida(id)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agentes:sesion-caida', id)
  })
  ipcMain.handle('agentes:estado', () => agentesConPago())
  // Los modelos de un agente con sus esfuerzos, preguntados al propio agente (ver catalogo.ts).
  ipcMain.handle('agentes:modelos', (_evento, id: unknown, forzar: unknown) =>
    typeof id === 'string' && (AGENTE_IDS as readonly string[]).includes(id) ? catalogoAgente(id as AgenteId, forzar === true) : []
  )
  ipcMain.handle('agentes:versiones', () => versionesAgentes())
  ipcMain.handle('agentes:pago', async (_evento, id: unknown, cambio: unknown) => {
    if (typeof id !== 'string') return agentesConPago()
    const x = (cambio ?? {}) as { pago?: unknown; llave?: unknown }
    await ajustes.guardarPagoAgente(id, {
      pago: x.pago === 'llave' || x.pago === 'suscripcion' ? x.pago : undefined,
      llave: typeof x.llave === 'string' ? x.llave : undefined
    })
    return agentesConPago()
  })
  ipcMain.handle('flow:estado', () => estadoFlow())
  ipcMain.handle('flow:ajustes', (_evento, cambio: unknown) => ajustesFlow((cambio ?? {}) as { aportar?: boolean; derechos?: boolean }))
  ipcMain.handle('flow:agregar', () => agregarCuentaFlow())
  ipcMain.handle('flow:quitar', (_evento, correo: unknown) => (typeof correo === 'string' ? quitarCuentaFlow(correo) : estadoFlow()))
  ipcMain.handle('flow:abrir', (_evento, correo: unknown) => (typeof correo === 'string' ? abrirFlow(correo) : undefined))
  ipcMain.handle('flow:saldos', () => leerSaldosFlow())
  ipcMain.handle('flow:generar', async (_evento, destino: unknown, pedido: unknown) => {
    const d = (destino ?? {}) as { creacion?: unknown; proyecto?: unknown }
    const p = (pedido ?? {}) as Partial<PedidoFlow>
    if ((p.tipo !== 'imagen' && p.tipo !== 'video') || typeof p.prompt !== 'string' || !p.prompt.trim()) {
      throw new Error('Pedido de Flow inválido.')
    }
    // Lo generado vive dentro del proyecto o de la creación, para que el editor y la composición lo usen.
    const carpetaBase =
      typeof d.creacion === 'string' ? join(creaciones.carpeta(d.creacion), 'composicion') : typeof d.proyecto === 'string' ? proyectos.carpeta(d.proyecto) : null
    if (!carpetaBase) throw new Error('Falta dónde guardar lo generado.')
    const r = await pedirFlow(
      {
        tipo: p.tipo,
        prompt: p.prompt.slice(0, 2000),
        formato: typeof p.formato === 'string' ? p.formato : '9:16',
        ...(typeof p.modelo === 'string' ? { modelo: p.modelo } : {}),
        ...(typeof p.tope === 'number' ? { tope: Math.max(0, Math.min(200, p.tope)) } : {}),
        ...(Array.isArray(p.referencias) ? { referencias: p.referencias.filter((x): x is string => typeof x === 'string') } : {})
      },
      join(carpetaBase, 'media')
    )
    return { ...r, relativo: `media/${basename(r.archivo)}` }
  })
  // ===== Dónde quedan los videos del usuario =====
  const carpetaVideos = async () => (await ajustes.carpetaVideos()) ?? carpetaPorDefecto()
  const estadoCarpeta = async () => ({ ruta: await carpetaVideos(), elegida: (await ajustes.carpetaVideos()) !== null })
  ipcMain.handle('carpeta:estado', () => estadoCarpeta())
  ipcMain.handle('carpeta:elegir', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Elige dónde guardar tus videos',
      defaultPath: await carpetaVideos(),
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    })
    if (r.canceled || !r.filePaths[0]) return null
    mkdirSync(r.filePaths[0], { recursive: true })
    await ajustes.guardarCarpetaVideos(r.filePaths[0])
    return estadoCarpeta()
  })
  ipcMain.handle('carpeta:propuesta', async () => {
    mkdirSync(carpetaPorDefecto(), { recursive: true })
    await ajustes.guardarCarpetaVideos(carpetaPorDefecto())
    return estadoCarpeta()
  })
  ipcMain.handle('carpeta:abrir', async (_evento, ruta: unknown) => {
    const base = await carpetaVideos()
    mkdirSync(base, { recursive: true })
    // Solo abre la carpeta de videos o algo dentro de ella.
    const objetivo = typeof ruta === 'string' && resolve(ruta).startsWith(resolve(base)) ? ruta : base
    if (existsSync(objetivo) && !statSync(objetivo).isDirectory()) shell.showItemInFolder(objetivo)
    else await shell.openPath(objetivo)
  })
  /** Copia el MP4 de una creación a la carpeta del usuario y lo dice en el mensaje. */
  const copiarCreacion = async (c: Creacion): Promise<string | null> => {
    if (!c.salida) return null
    try {
      const destino = copiarAVideos(await carpetaVideos(), c.guion?.titulo ?? c.nombre, join(creaciones.carpeta(c.id), c.salida), `${c.guion?.titulo ?? c.nombre} v${c.version}.mp4`)
      c.copia = destino
      return destino
    } catch {
      return null
    }
  }
  ipcMain.handle('sistema:estado', () => estadoSistema())
  ipcMain.handle('sistema:abrir-datos', async () => {
    await shell.openPath(app.getPath('userData'))
  })
  ipcMain.handle('sistema:instalar', (_evento, id: unknown) =>
    typeof id === 'string'
      ? instalarHerramienta(id, (pct, texto) => {
          for (const w of BrowserWindow.getAllWindows()) w.webContents.send('herramienta', { id, pct, texto })
        })
      : { ok: false, error: 'Herramienta desconocida.' }
  )
  ipcMain.handle('preferencias:cargar', () => ajustes.preferencias())
  ipcMain.handle('preferencias:guardar', (_evento, cambio: unknown) => ajustes.guardarPreferencias((cambio ?? {}) as object))
  ipcMain.handle('agentes:conectar', (_evento, id: unknown) => conectarAgente(id))
  ipcMain.handle('agentes:desconectar', async (_evento, id: unknown) => {
    const res = await desconectarAgente(id)
    // Solo deja de usar el agente que se desconecta, no el que esté editando ahora.
    const conf = await ajustes.cargar()
    if (res.ok && conf.activa && conf.proveedor === 'cli' && agenteDeOrden(conf.comandoCli) === id) {
      await ajustes.guardar({ ...conf, activa: false })
    }
    return res
  })
  ipcMain.handle('agentes:desactivar', async () => {
    const conf = await ajustes.cargar()
    return ajustes.guardar({ ...conf, activa: false })
  })

  ipcMain.handle(
    'ajustes:guardar',
    (_evento, datos: unknown, clave: unknown): Promise<AjustesIA> => {
      const entrada = (datos ?? {}) as Partial<AjustesIA>
      return ajustes.guardar(
        {
          activa: entrada.activa === true,
          proveedor: entrada.proveedor === 'cli' ? 'cli' : 'api',
          comandoCli: typeof entrada.comandoCli === 'string' ? entrada.comandoCli : '',
          baseUrl: typeof entrada.baseUrl === 'string' ? entrada.baseUrl : '',
          modelo: typeof entrada.modelo === 'string' ? entrada.modelo : ''
        },
        typeof clave === 'string' ? clave : undefined
      )
    }
  )

  ipcMain.handle('proyecto:generar', async (_evento, id: unknown): Promise<AnalisisResultado> => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }

    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'No existe el proyecto.' }
    if (proyecto.transcription !== 'lista' || !proyecto.transcript?.length) {
      return { ok: false, error: 'Primero transcribe la clase.' }
    }

    let clips: Project['clips']
    let fuente: 'ia' | 'local' = 'local'
    let aviso: string | undefined

    const config = await ajustes.cargar()
    if (config.activa && config.proveedor === 'cli') {
      // Modo plan: usa la sesión de un agente CLI local, sin clave API.
      try {
        clips = await proponerClipsConAgente(
          proyecto.transcript,
          proyecto.source.duration,
          config.comandoCli
        )
        fuente = 'ia'
      } catch (error) {
        aviso = `El agente falló (${error instanceof Error ? error.message : String(error)}). Usé la selección local.`
      }
    } else if (config.activa) {
      // Los servidores locales (Ollama, LM Studio) ignoran la clave.
      const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
      const clave = (await ajustes.clave()) ?? (esLocal ? 'local' : null)
      if (!clave) {
        aviso = 'La IA está activada pero falta la clave. Usé la selección local.'
      } else {
        try {
          clips = await proponerClipsConIA(proyecto.transcript, proyecto.source.duration, {
            baseUrl: config.baseUrl,
            modelo: config.modelo,
            clave
          })
          fuente = 'ia'
        } catch (error) {
          aviso = `La IA falló (${error instanceof Error ? error.message : String(error)}). Usé la selección local.`
        }
      }
    }

    clips ??= proponerClips(proyecto.transcript, proyecto.source.duration)
    if (clips.length === 0) {
      return {
        ok: false,
        error: 'No encontré momentos con suficiente duración. Prueba con una clase más larga.'
      }
    }

    // El agente puede tardar minutos: se relee el proyecto para no pisar lo que el
    // usuario editó mientras tanto (la timeline, la marca…).
    const actualGen = proyectos.abrir(id) ?? proyecto
    actualGen.clips = clips
    proyectos.save(actualGen)
    return { ok: true, project: actualGen, fuente, aviso }
  })

  // Fase 1: el agente edita el video completo y devuelve una RecetaEdicion.
  ipcMain.handle('proyecto:editar', async (_evento, id: unknown): Promise<AnalisisResultado> => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }

    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'No existe el proyecto.' }
    if (proyecto.transcription !== 'lista' || !proyecto.transcript?.length) {
      return { ok: false, error: 'Primero transcribe la clase.' }
    }

    let receta: Project['receta']
    let fuente: 'ia' | 'local' = 'local'
    let aviso: string | undefined

    const config = await ajustes.cargar()
    if (config.activa && config.proveedor === 'cli') {
      try {
        receta = await proponerRecetaConAgente(
          proyecto.transcript,
          proyecto.source.duration,
          config.comandoCli
        )
        fuente = 'ia'
      } catch (error) {
        aviso = `El agente falló (${error instanceof Error ? error.message : String(error)}). Armé una edición local.`
      }
    } else if (config.activa) {
      const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
      const clave = (await ajustes.clave()) ?? (esLocal ? 'local' : null)
      if (!clave) {
        aviso = 'La IA está activada pero falta la clave. Armé una edición local.'
      } else {
        try {
          receta = await proponerRecetaConIA(proyecto.transcript, proyecto.source.duration, {
            baseUrl: config.baseUrl,
            modelo: config.modelo,
            clave
          })
          fuente = 'ia'
        } catch (error) {
          aviso = `La IA falló (${error instanceof Error ? error.message : String(error)}). Armé una edición local.`
        }
      }
    }

    receta ??= recetaLocal(proyecto.transcript, proyecto.source.duration)

    const actualEd = proyectos.abrir(id) ?? proyecto
    actualEd.receta = receta
    actualEd.recetaSalida = undefined
    proyectos.save(actualEd)
    return { ok: true, project: actualEd, fuente, aviso }
  })

  const enRender = new Set<string>()
  const enLote = new Set<string>()

  ipcMain.handle(
    'proyecto:renderizar-edicion',
    async (_evento, id: unknown): Promise<RenderResultado> => {
      if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }
      if (enRender.has(id) || enLote.has(id)) {
        return { ok: false, error: 'Ya hay un render en marcha en este proyecto.' }
      }

      const proyecto = proyectos.abrir(id)
      if (!proyecto?.receta) return { ok: false, error: 'Primero genera la edición con el agente.' }
      if (!existsSync(proyecto.source.path)) {
        return { ok: false, error: 'El video original ya no está en esa ruta.' }
      }

      enRender.add(id)
      try {
        enviarProgreso({ id, fase: 'render', pct: 0, texto: 'Renderizando la edición' })

        let resultado: RenderResultado
        try {
          resultado = await renderReceta(
            proyecto,
            proyecto.receta,
            proyectos.carpeta(id),
            (pct, texto) => enviarProgreso({ id, fase: 'render', pct, texto })
          )
        } catch (error) {
          resultado = {
            ok: false,
            error: `No pude renderizar: ${error instanceof Error ? error.message : String(error)}`
          }
        }

        const actual = proyectos.abrir(id)
        if (!actual) return { ...resultado, ok: false, error: 'El proyecto ya no existe.' }
        if (resultado.ok && resultado.output) {
          actual.recetaSalida = resultado.output
          proyectos.save(actual)
        }

        return { ...resultado, project: actual }
      } finally {
        enRender.delete(id)
      }
    }
  )

  ipcMain.handle(
    'proyecto:crear-video',
    async (_evento, id: unknown, peticion: unknown, opciones: unknown): Promise<RenderResultado & { fuente?: 'ia' | 'local'; aviso?: string }> => {
      if (typeof id !== 'string' || typeof peticion !== 'string' || !peticion.trim()) {
        return { ok: false, error: 'Datos inválidos.' }
      }
      const incluirMaterial =
        typeof opciones === 'object' && opciones !== null
          ? (opciones as { incluirMaterial?: unknown }).incluirMaterial === true
          : false
      const estilo =
        typeof opciones === 'object' && opciones !== null
          ? String((opciones as { estilo?: unknown }).estilo ?? '')
          : ''
      if (enRender.has(id) || enLote.has(id)) {
        return { ok: false, error: 'Ya hay un render en marcha en este proyecto.' }
      }

      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, error: 'No existe el proyecto.' }

      enRender.add(id)
      try {
        enviarProgreso({ id, fase: 'render', pct: 0, texto: 'Creando el video' })

        const config = await ajustes.cargar()
        let api: { baseUrl: string; modelo: string; clave: string } | undefined
        if (config.activa && config.proveedor === 'api') {
          const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
          const clave = (await ajustes.clave()) ?? (esLocal ? 'local' : null)
          if (clave) api = { baseUrl: config.baseUrl, modelo: config.modelo, clave }
        }

        let resultado
        try {
          resultado = await crearVideo(
            proyecto,
            peticion.trim(),
            {
              activa: config.activa && (config.proveedor === 'cli' || api !== undefined),
              proveedor: config.proveedor,
              comandoCli: config.comandoCli,
              api
            },
            proyectos.carpeta(id),
            (pct, texto) => enviarProgreso({ id, fase: 'render', pct, texto }),
            { incluirMaterial, estilo }
          )
        } catch (error) {
          resultado = {
            ok: false,
            error: `No pude crear el video: ${error instanceof Error ? error.message : String(error)}`
          }
        }

        const actual = proyectos.abrir(id)
        if (!actual) return { ...resultado, ok: false, error: 'El proyecto ya no existe.' }
        if (resultado.ok && resultado.output) {
          actual.creacionSalida = resultado.output
          proyectos.save(actual)
        }

        return { ...resultado, project: actual }
      } finally {
        enRender.delete(id)
      }
    }
  )

  ipcMain.handle(
    'proyecto:renderizar',
    async (_evento, id: unknown, clipId: unknown): Promise<RenderResultado> => {
      if (typeof id !== 'string' || typeof clipId !== 'string') {
        return { ok: false, error: 'Datos inválidos.' }
      }
      const llave = `${id}:${clipId}`
      if (enRender.has(llave)) {
        return { ok: false, error: 'Ese clip ya se está renderizando.' }
      }
      if (enLote.has(id)) {
        return { ok: false, error: 'Hay un lote renderizándose en este proyecto.' }
      }

      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, error: 'No existe el proyecto.' }

      const clip = proyecto.clips.find((item) => item.id === clipId)
      if (!clip) return { ok: false, error: 'No existe ese clip.' }
      if (!existsSync(proyecto.source.path)) {
        return { ok: false, error: 'El video original ya no está en esa ruta.' }
      }

      enRender.add(llave)
      try {
        clip.status = 'renderizando'
        proyectos.save(proyecto)
        enviarProgreso({
          id,
          fase: 'render',
          pct: 0,
          texto: `Renderizando ${clip.title}`,
          clipId
        })

        let resultado: RenderResultado
        try {
          resultado = await renderClip(
            proyecto,
            clip,
            proyectos.carpeta(id),
            (pct, texto) => enviarProgreso({ id, fase: 'render', pct, texto, clipId })
          )
        } catch (error) {
          resultado = {
            ok: false,
            error: `No pude renderizar: ${error instanceof Error ? error.message : String(error)}`
          }
        }

        const actual = proyectos.abrir(id)
        if (!actual) return { ...resultado, ok: false, error: 'El proyecto ya no existe.' }

        const clipActual = actual.clips.find((item) => item.id === clipId)
        if (clipActual) {
          clipActual.status = resultado.ok ? 'listo' : 'error'
          if (resultado.output) clipActual.output = resultado.output
          if (resultado.cover) clipActual.cover = resultado.cover
          proyectos.save(actual)
        }

        return { ...resultado, project: actual }
      } finally {
        enRender.delete(llave)
      }
    }
  )

  ipcMain.handle(
    'proyecto:renderizar-lote',
    async (_evento, id: unknown, clipIds: unknown): Promise<RenderLoteResultado> => {
      const vacio = { renderizados: 0, fallidos: 0 }
      if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.', ...vacio }
      if (enLote.has(id)) {
        return { ok: false, error: 'Este proyecto ya tiene un lote en marcha.', ...vacio }
      }

      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, error: 'No existe el proyecto.', ...vacio }
      if (!existsSync(proyecto.source.path)) {
        return { ok: false, error: 'El video original ya no está en esa ruta.', ...vacio }
      }

      const ids = Array.isArray(clipIds)
        ? clipIds.filter((item): item is string => typeof item === 'string')
        : undefined

      // Por defecto el lote toma todo lo pendiente; los errores anteriores reintentan.
      const objetivos = proyecto.clips.filter(
        (clip) =>
          (ids ? ids.includes(clip.id) : true) &&
          clip.status !== 'listo' &&
          !enRender.has(`${id}:${clip.id}`)
      )
      if (objetivos.length === 0) {
        return { ok: false, error: 'No hay clips pendientes de render.', ...vacio }
      }

      enLote.add(id)
      let renderizados = 0
      let fallidos = 0

      try {
        for (let indice = 0; indice < objetivos.length; indice++) {
          const meta = objetivos[indice]
          const llave = `${id}:${meta.id}`
          enRender.add(llave)

          // Se relee el proyecto en cada clip: la interfaz pudo guardar cambios
          // de título, gancho o marca mientras corría el render anterior.
          const actual = proyectos.abrir(id)
          if (!actual) break
          const clip = actual.clips.find((item) => item.id === meta.id)
          if (!clip) {
            enRender.delete(llave)
            continue
          }

          const lote = { indice: indice + 1, total: objetivos.length }
          clip.status = 'renderizando'
          proyectos.save(actual)
          enviarProgreso({
            id,
            fase: 'render',
            pct: 0,
            texto: `Clip ${lote.indice} de ${lote.total}: ${clip.title}`,
            clipId: clip.id,
            lote
          })

          let resultado: RenderResultado
          try {
            resultado = await renderClip(actual, clip, proyectos.carpeta(id), (pct, texto) =>
              enviarProgreso({ id, fase: 'render', pct, texto, clipId: clip.id, lote })
            )
          } catch (error) {
            resultado = {
              ok: false,
              error: `No pude renderizar: ${error instanceof Error ? error.message : String(error)}`
            }
          }

          const final = proyectos.abrir(id)
          if (final) {
            const clipFinal = final.clips.find((item) => item.id === meta.id)
            if (clipFinal) {
              clipFinal.status = resultado.ok ? 'listo' : 'error'
              if (resultado.output) clipFinal.output = resultado.output
              if (resultado.cover) clipFinal.cover = resultado.cover
              proyectos.save(final)
            }
          }

          if (resultado.ok) renderizados++
          else fallidos++
          enviarProgreso({
            id,
            fase: 'render',
            pct: 1,
            texto: resultado.ok ? `Clip ${lote.indice} de ${lote.total} listo` : 'Clip con error',
            clipId: clip.id,
            lote
          })
          enRender.delete(llave)
        }
      } finally {
        enLote.delete(id)
      }

      const proyectoFinal = proyectos.abrir(id)
      return {
        ok: fallidos === 0,
        error:
          fallidos > 0
            ? fallidos === 1
              ? '1 clip falló durante el lote.'
              : `${fallidos} clips fallaron durante el lote.`
            : undefined,
        project: proyectoFinal ?? undefined,
        renderizados,
        fallidos
      }
    }
  )

  ipcMain.handle('proyecto:abrir-salida', (_evento, id: unknown, clipId: unknown) => {
    if (typeof id !== 'string' || typeof clipId !== 'string') return false

    const proyecto = proyectos.get(id)
    const clip = proyecto?.clips.find((item) => item.id === clipId)
    if (!clip?.output || !existsSync(clip.output)) return false

    const carpeta = resolve(proyectos.carpeta(id))
    const salida = resolve(clip.output)
    if (!salida.startsWith(carpeta + sep)) return false

    shell.showItemInFolder(salida)
    return true
  })

  ipcMain.handle('proyecto:abrir-edicion', (_evento, id: unknown) => {
    if (typeof id !== 'string') return false

    const proyecto = proyectos.get(id)
    if (!proyecto?.recetaSalida || !existsSync(proyecto.recetaSalida)) return false

    const carpeta = resolve(proyectos.carpeta(id))
    const salida = resolve(proyecto.recetaSalida)
    if (!salida.startsWith(carpeta + sep)) return false

    shell.showItemInFolder(salida)
    return true
  })

  ipcMain.handle(
    'proyecto:exportar-timeline',
    async (_evento, id: unknown, timeline: unknown, opciones: unknown): Promise<RenderResultado> => {
      if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }
      if (enRender.has(id) || enLote.has(id)) {
        return { ok: false, error: 'Ya hay un render en marcha en este proyecto.' }
      }
      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, error: 'El proyecto ya no existe.' }
      if (!existsSync(proyecto.source.path)) return { ok: false, error: 'El video original ya no está en esa ruta.' }

      const crudas = (opciones ?? {}) as Partial<OpcionesExport>
      const elegidas: OpcionesExport = {
        formato: crudas.formato === 'vertical' ? 'vertical' : 'original',
        subtitulos: crudas.subtitulos === true
      }
      // Se exporta la timeline que ve el usuario, validada contra el material.
      const valida = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios))

      enRender.add(id)
      try {
        let resultado: RenderResultado
        try {
          resultado = await exportarTimeline(
            proyecto,
            valida,
            proyectos.carpeta(id),
            elegidas,
            (pct, texto) => enviarProgreso({ id, fase: 'exportar', pct, texto }),
            carpetaDelProyecto(await carpetaVideos(), proyecto.name)
          )
        } catch (error) {
          resultado = { ok: false, error: `No pude exportar: ${error instanceof Error ? error.message : String(error)}` }
        }
        const actual = proyectos.abrir(id)
        if (!actual) return { ...resultado, ok: false, error: 'El proyecto ya no existe.' }
        if (resultado.ok && resultado.output) {
          actual.timelineSalida = resultado.output
          proyectos.save(actual)
        }
        return { ...resultado, project: actual }
      } finally {
        enRender.delete(id)
      }
    }
  )

  ipcMain.handle(
    'agente:chat',
    async (_evento, id: unknown, timeline: unknown, historial: unknown, peticion: unknown, referencia: unknown) => {
      if (typeof id !== 'string' || typeof peticion !== 'string' || !peticion.trim()) {
        return { ok: false, mensaje: '', operaciones: [], error: 'Mensaje vacío.' }
      }
      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, mensaje: '', operaciones: [], error: 'El proyecto ya no existe.' }
      const config = await ajustes.cargar()
      const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
      const clave = config.proveedor === 'api' ? ((await ajustes.clave()) ?? (esLocal ? 'local' : null)) : null
      const mensajes = Array.isArray(historial) ? (historial as MensajeChat[]).filter((m) => m && typeof m.texto === 'string') : []
      const senal = empezarTrabajo(`chat:${id}`)
      try {
        const turno = await turnoAgente(
          proyecto,
          normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios)),
          mensajes,
          peticion.slice(0, 4000),
          typeof referencia === 'string' ? referencia.slice(0, 500) : undefined,
          config,
          clave,
          senal,
          bloqueGustos()
        )
        // La voz que pidió cambiar o añadir se genera aquí, antes de aplicar nada: así la
        // interfaz recibe las frases con su audio listo y todo entra en un solo paso de deshacer.
        if (turno.ok && turno.operaciones.some((o) => o.op === 'cambiar_voz' || o.op === 'anadir_voz')) {
          const fallosVoz = await generarVocesDelChat(id, normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios)), turno.operaciones)
          if (fallosVoz.length) turno.mensaje = `${turno.mensaje}\n\nNo pude generar la voz: ${fallosVoz.join(' ')}`
        }
        // Solo se guarda lo nuevo; lo que ya sabía se confirma (suma una vez más).
        if (turno.aprendido?.length) turno.aprendido = agregarGustos(turno.aprendido, 'aprendido').map((g) => g.texto)
        return turno
      } finally {
        terminarTrabajo(`chat:${id}`, senal)
      }
    }
  )
  /**
   * Genera el audio de las frases que el agente del chat quiere cambiar o añadir y se lo pone
   * a cada operación (`audio`). Con la voz que pidió, la que ya tenía la frase o la del resto
   * de la narración. Devuelve lo que no se pudo generar.
   */
  async function generarVocesDelChat(id: string, tl: Timeline, ops: OperacionTL[]): Promise<string[]> {
    const fallos: string[] = []
    const media = join(proyectos.carpeta(id), 'media')
    mkdirSync(media, { recursive: true })
    const valida = (v?: string) => (v && VOCES_GEMINI.some((x) => x.id === v) ? v : undefined)
    // La voz de la narración: la más usada en sus frases; si no hay, la última que eligió el usuario.
    const cuenta = new Map<string, number>()
    for (const v of tl.voces ?? []) if (v.voz) cuenta.set(v.voz, (cuenta.get(v.voz) ?? 0) + 1)
    const deLaNarracion = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (await ajustes.estadoVoz()).vozGemini ?? 'Kore'
    for (const o of ops) {
      if (o.op !== 'cambiar_voz' && o.op !== 'anadir_voz') continue
      const frase = o.op === 'cambiar_voz' ? tl.voces?.[Math.round(o.voz_n) - 1] : undefined
      if (o.op === 'cambiar_voz' && (!frase || (o.texto === undefined && o.voz === undefined))) continue
      const texto = o.texto ?? frase?.texto ?? ''
      const voz = valida(o.voz) ?? valida(frase?.voz) ?? deLaNarracion
      if (!texto.trim()) {
        fallos.push(`la frase ${o.op === 'cambiar_voz' ? o.voz_n : 'nueva'} no dice nada.`)
        continue
      }
      const nombre = `voz-${randomUUID().slice(0, 8)}.wav`
      try {
        await generarFraseVoz(texto, voz, join(media, nombre))
        const duracion = Math.round((await duracionMedio(join(media, nombre))) * 100) / 100
        if (!(duracion > 0)) throw new Error('salió vacía')
        o.audio = { archivo: `media/${nombre}`, duracion, voz, texto }
      } catch (e) {
        fallos.push(`«${texto.slice(0, 60)}» (${textoError(e)}).`)
      }
    }
    return fallos
  }

  // Parar al agente del chat: corta su proceso (o la petición a la API) al instante.
  ipcMain.handle('agente:parar', (_evento, id: unknown) => typeof id === 'string' && pararTrabajo(`chat:${id}`))

  ipcMain.handle('chatgpt:estado', () => estadoChatGPT())
  ipcMain.handle('actualizacion:estado', () => estadoActualizacion())
  ipcMain.handle('actualizacion:buscar', () => buscarActualizacion())
  ipcMain.handle('actualizacion:instalar', () => instalarActualizacion())

  // El criterio que Recorte aprende del usuario (ver shared/gustos.ts).
  ipcMain.handle('gustos:ver', () => cargarGustos())
  ipcMain.handle('gustos:agregar', (_evento, texto: unknown) => {
    if (typeof texto === 'string' && texto.trim()) agregarGustos([texto], 'dicho')
    return cargarGustos()
  })
  ipcMain.handle('gustos:quitar', (_evento, id: unknown) => (typeof id === 'string' ? quitarGusto(id) : cargarGustos()))
  ipcMain.handle('gustos:activar', (_evento, activo: unknown) => activarGustos(activo !== false))
  ipcMain.handle('gustos:olvidar', () => olvidarGustos())
  ipcMain.handle('gustos:senal', (_evento, tipo: unknown, detalle: unknown) => {
    if ((tipo === 'deshizo' || tipo === 'corrigio' || tipo === 'eligio' || tipo === 'paro') && typeof detalle === 'string') senalGusto(tipo, detalle)
  })

  ipcMain.handle('proyecto:importar-musica', async (_evento, id: unknown) => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }
    if (!proyectos.get(id)) return { ok: false, error: 'El proyecto ya no existe.' }
    const eleccion = await dialog.showOpenDialog({
      title: 'Elige la música',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'] }]
    })
    const origen = eleccion.filePaths[0]
    if (eleccion.canceled || !origen) return null
    try {
      const ext = extname(origen).toLowerCase()
      const base = basename(origen, extname(origen))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'musica'
      const nombreArchivo = `${base}-${Date.now().toString(36)}${ext}`
      const carpetaMedia = join(proyectos.carpeta(id), 'media')
      mkdirSync(carpetaMedia, { recursive: true })
      copyFileSync(origen, join(carpetaMedia, nombreArchivo))
      return {
        ok: true,
        musica: { archivo: `media/${nombreArchivo}`, nombre: basename(origen), volumen: 0.35, ducking: true }
      }
    } catch (error) {
      return { ok: false, error: `No pude copiar la música: ${error instanceof Error ? error.message : String(error)}` }
    }
  })

  ipcMain.handle('proyecto:abrir-exportacion', async (_evento, id: unknown) => {
    if (typeof id !== 'string') return false
    const proyecto = proyectos.get(id)
    if (!proyecto?.timelineSalida || !existsSync(proyecto.timelineSalida)) return false
    const carpeta = resolve(proyectos.carpeta(id))
    const salida = resolve(proyecto.timelineSalida)
    const deVideos = resolve(await carpetaVideos())
    if (!salida.startsWith(carpeta + sep) && !salida.startsWith(deVideos + sep)) return false
    shell.showItemInFolder(salida)
    return true
  })

  ipcMain.handle('proyecto:abrir-creacion', (_evento, id: unknown) => {
    if (typeof id !== 'string') return false

    const proyecto = proyectos.get(id)
    if (!proyecto?.creacionSalida || !existsSync(proyecto.creacionSalida)) return false

    const carpeta = resolve(proyectos.carpeta(id))
    const salida = resolve(proyecto.creacionSalida)
    if (!salida.startsWith(carpeta + sep)) return false

    shell.showItemInFolder(salida)
    return true
  })

  crearVentana()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
