import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { tomasDelProyecto } from './analizarvideo'
import { AGENTES_CHAT_HERRAMIENTAS, turnoChatHerramientas } from './chatherramientas'
import { usarArchivoMcp } from './adaptadoresagente'
import { anadirHabilidad, carpetaHabilidadesUsuario, habilidadesConLecciones, leerLecciones, olvidarLeccion } from './habilidades'
import { anadirEstilo, borrarEstilo, catalogoEstilos, crearEstilo, quitarEstilo, registrarCatalogo } from './estiloscatalogo'
import { ANIMAR_CAPA, fuenteEnClip, timelineActiva, ubicar, tramos, zonaEn, frasesSubtitulos, huellaSubtitulos, subtitulosAlDia, duracionTimeline, duracionesDeMedios, FUENTE_PRINCIPAL, insertarClip, normalizarTimeline, quitarFuente, SONIDOS_INCLUIDOS, timelineInicial, timelineVacia, normalizarLetras, type LetraTL, type Timeline } from '../shared/timeline'
import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import type {
  AnalisisResultado,
  EstadoUso,
  IngestaResultado,
  OpcionesExport,
  Progreso,
  RenderLoteResultado,
  RenderResultado,
  TranscripcionResultado
} from '../shared/api'
import type { AjustesIA, MedioProyecto, Project } from '../shared/types'
import { Ajustes } from './ajustes'
import { conectarAgente, correr, desconectarAgente, estadoAgentes, prepararAgentes, versionesAgentes, agenteDeOrden, marcarSesionCaida, VARIABLE_LLAVE } from './agentes'
import { estadoSistema, instalarHerramienta } from './sistema'
import { activarHerramientas } from './herramientas'
import { carpetaPorDefecto, copiarAVideos, carpetaDelProyecto, nombreArchivo, rutaLibre } from './carpetas'
import { abrirFlow, agregarCuentaFlow, ajustesFlow, estadoFlow, leerSaldosFlow, pedirFlow, quitarCuentaFlow } from './flow'
import { cerrarEdgesOciosos } from './edgeperfil'
import { calentarAntigravity, cerrarAntigravity } from './antigravity'
import { MODELO_CHATGPT, MODELOS_IMAGEN, modelosVideoVigentes, type PedidoFlow } from '../shared/flow'
import { estadoChatGPT, generarImagenChatGPT } from './imagenchatgpt'
import { atenderMedios } from './mediosagente'
import { avisarSesionCaida, definirEntornoAgentes, empezarTrabajo, esParado, pararTrabajo, terminarTrabajo } from './ia'
import { comandoConEleccion, usarListaDeModelos } from './modelos'
// Los niveles (rápido, equilibrado, máximo) salen de la lista que se lee de cada agente: no hay nombres que envejezcan.
usarListaDeModelos(catalogoRecordado)
import { alCambiarCatalogo, catalogoAgente, catalogoRecordado, eleccionVigente } from './catalogo'
import { crearMiniatura, crearProxy, duracionMedio, probeVideo } from './ffmpeg'
import { prepararProxysDeMedios } from './proxysmedios'
import { proponerClipsConAgente, proponerClipsConIA, proponerRecetaConAgente, proponerRecetaConIA } from './ia'
import { registrarMedia } from './media'
import { proponerClips } from './momentos'
import { Proyectos } from './proyectos'
import { recetaLocal } from './receta'
import { crearVideo, ejecutar } from './crear'
import { renderClip, renderReceta } from './render'
import { exportarTimeline } from './exportar'
import { VistaPrevia } from './vistaprevia'
import { iniciarMcpRecorte } from './mcpapp'
import { resolverBinario } from './binarios'
import { apuntarAgotado, apuntarClaudeDeSalida, apuntarVoz, avisoAntesDeHacer, claudeLeido, claudeVigente, estadoUso, iniciarUso } from './uso'
import { bloqueRetoques, describirRetoques } from '../shared/retoques'
import { Creaciones, EXTENSIONES_ADJUNTOS, pasoGuion, pasoVideo, type ConfigAgente } from './creaciones'
import { convertirAVoz, generarVozGemini, prepararVoz } from './voz'
import { montarVozEnVideo } from './montajevoz'
import { conectarVozGoogle, desconectarVozGoogle, estadoVozGoogle, generarVozGoogle } from './vozgoogle'
import { analizarMaterialCreacion } from './estilo/material'
import { anotar, archivoEntregado, comandoAgentico, portadaClara, copiarEntrada, definirConectadas, LimiteUso, pasoHacer, pasoPlan, revisarYPublicar } from './modoagente'
import { prepararArchivos } from './archivos'
import { clipsDelPlan, esAprobacion, MAX_CLIPS_GUION, pasoAnunciado } from '../shared/modoagente'
import { estiloPorId } from '../shared/estilos'
import { guardarModelos } from './modelos3d'
import { picosDeArchivo } from './onda'
import { estabilizarTramo } from './estabilizar'
import { desfasePorSonido } from './multicam'
import { prepararEscala } from './escala'
import { arreglarVoz, revisarAudio } from './revisaraudio'
import { listarPiezas, renderizarPieza } from './piezas'
import { dibujarGrafico } from './graficos'
import { servirGraficos } from './servidorgraficos'
import { ANCHO_DISENO, normalizarGrafico, prepararGraficos, type Grafico } from '../shared/grafico'
import { borrarPiezaPropia, crearPiezaConAgente } from './tallerpiezas'
import { valoresConMarca, type PiezaAnimada, type ValoresPieza } from '../shared/piezas'
import { atenderVoz, avisoVozFaltante, vozQueFalto } from './vozagente'
import { proyectoDesdeReceta } from './recetaeditor'
import { medirReferencia } from './estilo/referencia'
import { analizarConGeminiVideo, interpretarEstilo } from './estilo/ficha'
import { viabilidadDe } from './estilo/viabilidad'
import { guardar } from './disco'
import { cambiaElGuion, ID_SEGURO, MAX_CLIPS_VEO, mismaNarracion, pideMontarVoz, textoMuestra, textoNarracion, VOCES_GEMINI, vozDesactualizada, vozVigente } from '../shared/creacion'
import type { AgenteId, AjustesCreacion, Creacion, EleccionTarea, MensajeCreacion, NivelModelo, PeticionCreacion, TareasCreacion } from '../shared/creacion'
import { leerCube as leerCubeLut } from '../shared/lut'
import { archivosVersion, armarBase, baseDe, EstilosPropios, versionBase } from './estilospropios'
import { turnoAgente } from './chat'
import { buscarActualizacion, estadoActualizacion, instalarActualizacion, prepararActualizaciones } from './actualizar'
import { borrarEstiloTexto, guardarEstiloTexto, leerEstilosTexto } from './estilostexto'
import { activarGustos, agregarGustos, bloqueGustos, cargarGustos, olvidarGustos, quitarGusto, senalGusto, usoCreacion } from './gustos'
import { aplicarOperaciones, type MensajeChat, type OperacionTL } from '../shared/chat'
import { buscarPython, rutaScriptPython, transcribir, transcribirArchivo } from './transcribir'
import { borrarObjetoDeClip, cambiarCieloDeClip, recortarObjetoDeClip, recortarPersonaDeClip, type ZonaObjeto } from './persona'

// El esquema tiene que declararse antes de que Electron esté listo.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'recorte-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
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
  // La interfaz crece o se achica con la ventana (o con Ctrl + / Ctrl −).
  prepararEscala(ventana)

  ventana.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // Un archivo soltado donde nadie lo recibe no abre ese archivo en la ventana (se perdería la app).
  ventana.webContents.on('will-navigate', (evento, url) => {
    if (url.startsWith('file:') && !url.includes('/renderer/index.html')) evento.preventDefault()
  })

  // Clic derecho en un texto (la caja del chat, un rótulo, cualquier campo): cortar, copiar, pegar, seleccionar todo y
  // la ortografía, como en cualquier programa. Donde la app tiene su propio menú (el editor), ese manda.
  ventana.webContents.on('context-menu', (_evento, p) => {
    const editable = p.isEditable
    if (!editable && !p.selectionText.trim()) return
    const plantilla: Electron.MenuItemConstructorOptions[] = []
    if (editable && p.misspelledWord) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) plantilla.push({ label: s, click: () => ventana.webContents.replaceMisspelling(s) })
      if (!p.dictionarySuggestions.length) plantilla.push({ label: 'Sin sugerencias', enabled: false })
      plantilla.push(
        { label: 'Agregar al diccionario', click: () => ventana.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) },
        { type: 'separator' }
      )
    }
    if (editable) plantilla.push({ label: 'Deshacer', role: 'undo', enabled: p.editFlags.canUndo }, { label: 'Rehacer', role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' })
    plantilla.push(
      ...(editable ? [{ label: 'Cortar', role: 'cut' as const, enabled: p.editFlags.canCut }] : []),
      { label: 'Copiar', role: 'copy', enabled: p.editFlags.canCopy },
      ...(editable ? [{ label: 'Pegar', role: 'paste' as const, enabled: p.editFlags.canPaste }] : []),
      { type: 'separator' },
      { label: 'Seleccionar todo', role: 'selectAll' }
    )
    Menu.buildFromTemplate(plantilla).popup({ window: ventana })
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
  iniciarUso(join(app.getPath('userData'), 'uso.json'))
  // Los MCP de Claude Code que se vieron al arrancarlo (los de sus plugins), para permitirlos en el modo agente.
  usarArchivoMcp(join(app.getPath('userData'), 'mcp-claude.json'))
  // Los estilos de la sección «Estilos», como tipos de video (para que el agente siga el de la tarjeta elegida).
  registrarCatalogo()
  const carpetaMuestras = join(app.getPath('userData'), 'muestras-voz')
  registrarMedia(proyectos, creaciones, carpetaMuestras)

  /** Cuándo empezó a trabajar el agente en cada creación: la pantalla cuenta desde ahí, no desde que la abres. */
  const inicioCreacion = new Map<string, number>()
  /** El último aviso de cada creación (para que un agente de fuera vea cómo va). */
  const ultimoProgreso = new Map<string, { pct: number; texto: string }>()
  const enviarProgreso = (progreso: Progreso) => {
    if (progreso.fase === 'creacion') ultimoProgreso.set(progreso.id, { pct: progreso.pct, texto: progreso.texto ?? '' })
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
        return { activa: true, proveedor: 'cli', comandoCli: comandoConEleccion(agente.comando, eleccion.agente, eleccionVigente(eleccion)) }
      }
    }
    return configAgente()
  }

  /** El agente que hace el video de esta creación (el elegido para la tarea o el de siempre). */
  const agenteDeLaTarea = async (c: Creacion): Promise<string | null> =>
    c.tareas?.video?.agente ?? (c.tareas?.video ? null : agenteDeOrden((await configParaTarea()).comandoCli ?? ''))

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

  /** Lo de imágenes y clips generados que llega de la interfaz: solo modelos conocidos. */
  const limpiarFlow = (x: unknown): Creacion['flow'] | undefined => {
    if (!x || typeof x !== 'object') return undefined
    const f = x as { imagenes?: unknown; videos?: unknown; modeloImagen?: unknown; modeloVideo?: unknown }
    if (!f.imagenes && !f.videos) return undefined
    return {
      imagenes: Boolean(f.imagenes),
      videos: Boolean(f.videos),
      ...(typeof f.modeloImagen === 'string' && (MODELOS_IMAGEN.includes(f.modeloImagen) || f.modeloImagen === MODELO_CHATGPT)
        ? { modeloImagen: f.modeloImagen }
        : {}),
      ...(typeof f.modeloVideo === 'string' && modelosVideoVigentes().includes(f.modeloVideo) ? { modeloVideo: f.modeloVideo } : {})
    }
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
    if (clave) {
      try {
        await generarVozGemini(texto, voz, clave, salida)
        apuntarVoz('hecha')
        return
      } catch (e) {
        // La cuota del día de la clave: se recuerda hasta cuándo (para el panel de uso y el aviso antes de hacer).
        if (/cuota de voz de tu clave por hoy/i.test(e instanceof Error ? e.message : String(e))) apuntarVoz('cuota-dia')
        throw e
      }
    }
    if (!estadoVozGoogle().correo) throw new Error('no hay una cuenta de Google ni una clave de AI Studio conectada (Ajustes → Voz)')
    // Con la cuenta, AI Studio responde 429 tanto por el límite por minuto como por el del día: se espera un minuto y se
    // vuelve a pedir unas veces; si sigue, es la cuota del día.
    for (let intento = 0; ; intento++) {
      try {
        await generarVozGoogle(texto, voz, salida)
        apuntarVoz('hecha')
        return
      } catch (e) {
        const es429 = /\(429\)/.test(e instanceof Error ? e.message : String(e))
        if (es429 && intento >= 4) apuntarVoz('cuota-dia')
        if (intento >= 4 || !es429) throw e
        await new Promise((r) => setTimeout(r, 60_000))
      }
    }
  }
  /** El uso de todo lo que tiene cuota (los agentes instalados, la voz si está conectada, Flow si tiene cuentas). */
  const usoAhora = async (): Promise<EstadoUso> => {
    const agentes = (await estadoAgentes()).filter((a) => a.instalado && a.conectado).map((a) => a.id)
    // Cambió la cuenta de Claude Code (o nunca se leyó con esta): se lee ya, de fondo; el panel la ve en su siguiente vistazo.
    if (agentes.includes('claude') && !claudeVigente()) leerClaude()
    const voz = Boolean(estadoVozGoogle().correo || (await ajustes.claveVoz()))
    return estadoUso({ agentes, voz, flow: estadoFlow().cuentas.map((c) => ({ correo: c.correo, creditos: c.creditos, leido: c.leido })) })
  }
  /** Una lectura de Claude a la vez (con la consulta mínima, el modelo más barato). */
  let leyendoClaude: Promise<void> | null = null
  const leerClaude = (): Promise<void> => {
    if (!leyendoClaude && resolverBinario('claude')) {
      leyendoClaude = correr('claude -p "Responde solo: ok" --model haiku --output-format stream-json --verbose', 90_000, 2_000_000)
        .then((r) => void apuntarClaudeDeSalida(r.salida))
        .finally(() => (leyendoClaude = null))
    }
    return leyendoClaude ?? Promise.resolve()
  }
  /** Vuelve a leer el uso de uno: Claude con una consulta mínima, Flow sus créditos. */
  const usoActualizar = async (id: string): Promise<EstadoUso> => {
    if (id === 'claude') await leerClaude()
    else if (id === 'flow') await leerSaldosFlow()
    return usoAhora()
  }
  // Claude no dice su uso hasta que trabaja: al abrir Recorte (y cada hora, si en ese rato el agente no trabajó, que
  // lo cuenta gratis en cada turno) se le hace la consulta mínima, para que el panel no espere a un video.
  const leerClaudeSiHaceFalta = () => {
    if (Date.now() - claudeLeido() > 55 * 60_000) void usoActualizar('claude').catch(() => {})
  }
  setTimeout(leerClaudeSiHaceFalta, 15_000)
  // Si los videos los hace Antigravity, se arranca ya (tarda unos 30 s): el primer turno no lo espera.
  setTimeout(() => {
    void configParaTarea()
      .then((cfg) => {
        if (agenteDeOrden(cfg.comandoCli ?? '') === 'antigravity') calentarAntigravity()
      })
      .catch(() => {})
  }, 10_000)
  setInterval(leerClaudeSiHaceFalta, 60 * 60_000)
  ipcMain.handle('uso:estado', () => usoAhora())
  ipcMain.handle('uso:actualizar', (_e, id: unknown) => usoActualizar(String(id)))
  /**
   * Mientras el agente trabaja (en la charla del plan o haciendo el video), Recorte atiende sus
   * pedidos de voz (con la voz elegida en la caja) y de imágenes y clips (Flow o ChatGPT).
   * Devuelve con qué dejar de atenderlos.
   */
  const atenderPedidos = (c: Creacion, senal: AbortSignal): (() => void) => {
    const trabajo = join(creaciones.carpeta(c.id), 'trabajo')
    const pararVoz = atenderVoz(trabajo, c.vozElegida, generarFraseVoz, (l) => avisarAgente(c, l, 0.5))
    const pararMedios = atenderMedios(
      trabajo,
      c.flow,
      c.formato === 'horizontal' ? '16:9' : '9:16',
      {
        flow: (pedido, destino) => pedirFlow(pedido, destino, senal),
        chatgpt: (pedido, destino, nombre) => generarImagenChatGPT(pedido, destino, nombre, senal)
      },
      (l) => avisarAgente(c, l, 0.5),
      // Haciendo el video: los clips del guion gráfico aprobado. En la charla, uno o dos de muestra como mucho.
      // En un cambio que el usuario pide sobre lo ya hecho («anima también estas»), lo que pida, hasta el máximo.
      c.fase === 'video' ? (c.agente?.resultado ? MAX_CLIPS_GUION : clipsDelPlan(c.agente?.plan) || MAX_CLIPS_VEO) : 2
    )
    let parado = false
    return () => {
      if (parado) return
      parado = true
      pararVoz()
      pararMedios()
    }
  }
  // El agente ve todo lo que el usuario tiene conectado (para proponérselo aunque no lo eligiera).
  definirConectadas(async () => ({
    voz: Boolean((await ajustes.claveVoz()) || estadoVozGoogle().correo),
    flow: estadoFlow().cuentas.length > 0,
    chatgpt: Boolean(estadoChatGPT().conectado)
  }))
  // ===== Plantillas de las tarjetas con estilo propio (Explicativo 3D) =====
  const carpetaEstilos = join(app.getPath('userData'), 'estilos')
  /** Antes de trabajar: la plantilla que funcionó en videos anteriores de ese tipo, a trabajo/plantilla/. */
  const traerPlantilla = (c: Creacion) => {
    const estilo = estiloPorId(c.estilo)
    if (!estilo.plantilla) return
    const origen = join(carpetaEstilos, estilo.id)
    const destino = join(creaciones.carpeta(c.id), 'trabajo', 'plantilla')
    if (existsSync(origen) && !existsSync(destino)) cpSync(origen, destino, { recursive: true })
  }
  /** Tras un video que salió bien: su plantilla queda para los siguientes (sin dependencias ni renders pesados). */
  const guardarPlantilla = (c: Creacion) => {
    const estilo = estiloPorId(c.estilo)
    const origen = join(creaciones.carpeta(c.id), 'trabajo', 'plantilla')
    if (!estilo.plantilla || !existsSync(origen)) return
    const destino = join(carpetaEstilos, estilo.id)
    const nueva = `${destino}.nueva`
    rmSync(nueva, { recursive: true, force: true })
    cpSync(origen, nueva, {
      recursive: true,
      filter: (ruta) => {
        if (/[\\/](node_modules|\.cache|renders?|out|salida)([\\/]|$)/i.test(ruta)) return false
        try {
          return statSync(ruta).isDirectory() || statSync(ruta).size < 40 * 1024 * 1024
        } catch {
          return false
        }
      }
    })
    rmSync(destino, { recursive: true, force: true })
    renameSync(nueva, destino)
  }
  /** Las imágenes y clips que el agente generó desde `desde` (para verlos en su mensaje del chat). */
  const mediosNuevos = (c: Creacion, desde: number): string[] => {
    const dir = join(creaciones.carpeta(c.id), 'trabajo', 'medios')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((n) => /\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(n))
      .map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs }))
      .filter((x) => x.t >= desde - 1000)
      .sort((a, b) => a.t - b.t)
      .slice(0, 12)
      .map((x) => `trabajo/medios/${x.n}`)
  }
  ipcMain.handle('agente:plan', (_evento, id: unknown, pedido: unknown) =>
    conCreacion(id, async (c, senal) => {
      const texto = typeof pedido === 'string' && pedido.trim() ? pedido.trim().slice(0, 2000) : undefined
      if (texto) c.mensajes.push(mensaje('usuario', texto))
      await charlaConAgente(c, senal)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  )
  /** Un turno de la charla del plan (y, con «Hazlo directo» y sin dudas, el video). */
  async function charlaConAgente(c: Creacion, senal: AbortSignal): Promise<void> {
      traerPlantilla(c)
      c.fase = 'plan'
      creaciones.guardar(c)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.1, texto: 'El agente está mirando tus archivos' })
      // En la charla también puede generar imágenes o clips para enseñarte una idea (o porque se los pides).
      const dejarDeAtender = atenderPedidos(c, senal)
      const desdeCharla = Date.now()
      try {
        const desde = desdeCharla
        const { charla, sesion } = await pasoPlan(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.video), (l) => avisarAgente(c, l, pctPorTiempo(desde, 180)), senal)
        // La conversación queda viva: cada respuesta, «Hazlo» y cada cambio la retoman (no se vuelve a mirar todo).
        // Con «Hazlo directo» el agente a veces solo cuenta lo que hará: eso ya es su plan.
        const plan =
          charla.plan ??
          c.agente?.plan ??
          (c.directo === true && charla.mensaje ? { entendi: charla.mensaje.slice(0, 400), pasos: [], preguntas: [] } : undefined)
        c.agente = { ...(c.agente ?? { registro: [], rondas: 0 }), ...(plan ? { plan } : {}), ...(sesion ? { sesion } : {}) }
        // «Hazlo directo»: sin preguntas pendientes, empieza sin esperar la aprobación.
        // «Hazlo directo»: con el plan listo empieza sin esperar, aunque el agente dude de algo (decide él).
        const directo = c.directo === true && Boolean(plan) && !c.agente.resultado
        // Lo que dice el agente es su mensaje; si no dijo nada, el plan en limpio.
        const texto = charla.mensaje || (plan ? [plan.entendi, ...(plan.preguntas.length ? [`Antes de hacerlo: ${plan.preguntas.join(' ')}`] : [])].join('\n') : '')
        const propuestas = directo ? [] : charla.propuestas.length ? charla.propuestas : plan && !plan.preguntas.length ? ['Hazlo'] : []
        const generados = mediosNuevos(c, desde)
        c.mensajes.push({ ...mensaje('agente', texto), propuestas, ...(charla.plan ? { plan: charla.plan } : {}), ...(generados.length ? { medios: generados } : {}) })
        // Con el plan listo, antes de hacer el video: si al agente le queda poco o la voz ya se acabó por hoy, se dice ya
        // (no a mitad del video).
        if (plan) {
          try {
            const aviso = avisoAntesDeHacer(await usoAhora(), await agenteDeLaTarea(c), Boolean(c.vozElegida))
            if (aviso) c.mensajes.push(mensaje('agente', aviso, true))
          } catch {
            // Sin leer el uso, se sigue sin aviso.
          }
        }
        dejarDeAtender()
        if (directo) {
          creaciones.guardar(c)
          await hacerConAgente(c, senal)
        }
      } catch (e) {
        if (esParado(e)) c.mensajes.push(mensaje('agente', 'Lo paraste. Cuando quieras, escríbeme qué hacemos.'))
        else if (e instanceof LimiteUso) pausar(c, 'plan', desdeCharla, e)
        else c.mensajes.push(mensaje('agente', `No pude preparar el plan: ${textoError(e)}`, true))
      } finally {
        dejarDeAtender()
      }
  }
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
  async function hacerConAgente(c: Creacion, senal: AbortSignal, texto?: string, seguir = false): Promise<void> {
      const faseAntes = c.fase
      traerPlantilla(c)
      c.fase = 'video'
      if (!c.agente) c.agente = { registro: [], rondas: 0 }
      c.agente.registro = []
      delete c.agente.paso
      creaciones.guardar(c)
      const carpeta = creaciones.carpeta(c.id)
      const base = await configParaTarea(c.tareas?.video)
      // Hacer el video (planificar escenas por piezas, revisar con criterio) rinde mucho más con el modelo más capaz: con
      // Claude Code y sin una elección del usuario para esta tarea, va con Opus (la charla del plan sigue con el de siempre).
      const config =
        !c.tareas?.video && base.proveedor === 'cli' && /^\s*claude/.test(base.comandoCli ?? '') && !/--model/.test(base.comandoCli ?? '')
          ? { ...base, comandoCli: `${(base.comandoCli ?? '').trim()} --model opus` }
          : base
      // Mientras trabaja, Recorte atiende sus pedidos de voz, imágenes y clips.
      const dejarDeAtender = atenderPedidos(c, senal)
      let desdeHacer = Date.now()
      try {
        enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.05, texto: seguir ? 'El agente sigue donde iba' : 'El agente está trabajando' })
        // Si pide un cambio sobre lo hecho, va como pedido; si solo aprobó el plan, sin pedido.
        const pedido = texto && !esAprobacion(texto) ? texto : undefined
        // Lo que retocó a mano en el editor viaja con el pedido, para que la versión nueva no lo pise.
        const retoques = c.agente.resultado && !seguir ? retoquesDe(c) : []
        if (retoques.length) avisarAgente(c, `Le paso al agente ${retoques.length === 1 ? 'tu retoque' : `tus ${retoques.length} retoques`} a mano`, 0.06)
        const cambio0 = pedido || retoques.length ? `${pedido ?? 'Haz una versión nueva conservando lo que retoqué.'}${bloqueRetoques(retoques)}` : undefined
        // Si volvió a una versión anterior, el agente lo sabe antes de tocar nada.
        const cambio = cambio0 && c.agente.nota && !seguir ? `${c.agente.nota}\n\n${cambio0}` : cambio0
        // Al seguir tras el límite, lo que dejó desde la ronda cortada cuenta como de esta ronda.
        const desde = seguir ? (c.agente.pausa?.desde ?? Date.now()) : Date.now()
        desdeHacer = desde
        // Lo último que dijo el agente: si no escribe su resumen en resultado.json, vale como resumen.
        let dicho = ''
        try {
          const turno = await pasoHacer(c, carpeta, config, cambio, (l) => avisarAgente(c, l, pctPorTiempo(desde, 480)), senal, false, seguir)
          dicho = turno.respuesta
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
        let revisado = await revisarYPublicar(c, carpeta, c.version + 1, desde, (l) => avisarAgente(c, l, 0.96))
        if (revisado.problemas.length) {
          // Recorte encontró algo mal: el agente lo corrige una vez.
          avisarAgente(c, `Recorte revisó y encontró: ${revisado.problemas.join(' ')}`, 0.85)
          // Sin archivo, casi siempre es un render que quedó en segundo plano y se cortó al cerrar el turno.
          const sinArchivo = !archivoEntregado(carpeta, desde)
            ? ' Si dejaste un render en segundo plano, se cortó al terminar tu turno: vuelve a lanzarlo EN PRIMER PLANO y espera a que acabe antes de escribir resultado.json.'
            : ''
          const turno = await pasoHacer(c, carpeta, config, `La revisión de Recorte encontró problemas en tu entrega: ${revisado.problemas.join(' ')}${sinArchivo} Corrígelo y vuelve a entregar.`, (l) => avisarAgente(c, l, 0.9), senal, true)
          if (turno.respuesta) dicho = turno.respuesta
          if (turno.sesion) c.agente.sesion = turno.sesion
          revisado = await revisarYPublicar(c, carpeta, c.version + 1, desde, (l) => avisarAgente(c, l, 0.96))
        }
        if (!revisado.resultado) throw new Error(revisado.problemas.join(' '))
        delete c.agente.pausa
        try {
          guardarPlantilla(c)
          if (estiloPorId(c.estilo).plantilla) guardarModelos(join(creaciones.carpeta(c.id), 'trabajo'))
        } catch {
          // Si no se pudo guardar, el video igual está bien: la próxima vez la arma otra vez.
        }
        c.version += 1
        c.agente.rondas += 1
        // Sin resumen en resultado.json, lo que dijo el agente al terminar (no un «Listo.» a secas).
        if (revisado.resultado.resumen === 'Listo.' && dicho.trim()) {
          revisado.resultado.resumen = dicho.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 900) || 'Listo.'
        }
        // Entregado: todos los pasos del plan quedan hechos (aunque no los anunciara uno a uno).
        if (c.agente.plan?.pasos.length) c.agente.paso = c.agente.plan.pasos.length
        c.agente.resultado = revisado.resultado
        // Cada entrega queda en el historial: se puede volver a ella o aprobarla.
        c.versiones = [
          ...(c.versiones ?? []).filter((v) => v.n !== c.version),
          { n: c.version, archivo: revisado.resultado.archivo, fecha: Date.now(), ...(pedido ? { pedido: pedido.slice(0, 600) } : {}), resultado: revisado.resultado }
        ]
        // El aviso (volvió a una versión) ya lo recibió.
        delete c.agente.nota
        if (revisado.resultado.tipo === 'video') {
          c.salida = revisado.resultado.archivo
          c.portada = await portadaClara(carpeta, revisado.resultado.revision)
        }
        c.fase = 'listo'
        const copia = revisado.resultado.tipo === 'video' ? await copiarCreacion(c) : null
        // Lo comprobado va como lista aparte (no pegado al resumen con «;»); la carpeta, en el botón de la tarjeta.
        const comprobado = revisado.resultado.comprobaciones.map((x) => x.trim().replace(/[\s;.]+$/, '')).filter(Boolean)
        c.mensajes.push({
          ...mensaje('agente', revisado.resultado.resumen || (copia ? 'Listo: tu video está en tu carpeta de videos.' : 'Listo.')),
          ...(comprobado.length ? { comprobado } : {}),
          propuestas: []
        })
        // Si parte de la narración no se pudo generar (casi siempre, la cuota diaria de voz), el video se entrega igual,
        // pero Recorte lo dice claro: cuánto faltó, por qué y qué hacer (el agente no siempre lo cuenta en su resumen).
        const faltante = vozQueFalto(join(carpeta, 'trabajo'), desde)
        if (faltante) c.mensajes.push(mensaje('agente', avisoVozFaltante(faltante), true))
      } catch (e) {
        c.fase = c.agente?.resultado ? 'listo' : faseAntes === 'video' ? 'plan' : faseAntes
        if (esParado(e)) c.mensajes.push(mensaje('agente', c.agente?.resultado ? 'Lo paraste. La versión anterior sigue intacta.' : 'Lo paraste. El plan sigue aquí.'))
        else if (e instanceof LimiteUso) pausar(c, 'hacer', desdeHacer, e)
        else c.mensajes.push(mensaje('agente', `No pude terminarlo: ${textoError(e)}`, true))
      } finally {
        dejarDeAtender()
      }
  }

  // ===== Sin uso del plan a mitad: pausa, «Seguir donde iba» y reanudar solo =====
  const horaCorta = (ms: number): string => {
    const d = new Date(ms)
    const hoy = new Date()
    const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`
    const manana = new Date(hoy)
    manana.setDate(hoy.getDate() + 1)
    if (d.toDateString() === manana.toDateString()) return `mañana a las ${hora}`
    return `el ${d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })} a las ${hora}`
  }
  /** Deja la creación en pausa (nada se pierde) y, si se sabe cuándo se renueva, la reanuda sola. */
  const pausar = (c: Creacion, etapa: 'plan' | 'hacer', desde: number, e: LimiteUso) => {
    if (!c.agente) c.agente = { registro: [], rondas: 0 }
    const agente = c.tareas?.video?.agente
    c.agente.pausa = { motivo: 'limite', etapa, desde, ...(e.reanudar ? { reanudar: e.reanudar } : {}), ...(agente ? { agente } : {}) }
    // Para el panel de uso: este agente quedó sin plan hasta entonces.
    void agenteDeLaTarea(c).then((id) => id && apuntarAgotado(id, e.reanudar))
    const cuando = e.reanudar
      ? `Se renueva ${horaCorta(e.reanudar)}: a esa hora sigo solo desde donde iba, con la app abierta.`
      : 'Cuando se renueve, dale a «Seguir donde iba».'
    c.mensajes.push({
      ...mensaje(
        'agente',
        `Se acabó el uso de tu plan justo mientras ${etapa === 'plan' ? 'preparaba el plan' : 'hacía el video'}. No se pierde nada: lo que llevo sigue en su carpeta. ${cuando} Si no quieres esperar, elige otro agente en la caja y dale a «Seguir donde iba»: continúa desde lo que dejé.`
      ),
      propuestas: ['Seguir donde iba']
    })
    creaciones.guardar(c)
    programarReanudar(c)
  }
  const relojes = new Map<string, ReturnType<typeof setTimeout>>()
  /** A la hora en que se renueva el uso, sigue solo (si nadie lo siguió antes). */
  const programarReanudar = (c: Creacion) => {
    const id = c.id
    const cuando = c.agente?.pausa?.reanudar
    clearTimeout(relojes.get(id))
    relojes.delete(id)
    if (!cuando) return
    // setTimeout no aguanta más de ~24 días; se revisa cada 6 horas como mucho.
    const espera = Math.min(Math.max(5_000, cuando - Date.now()), 6 * 3_600_000)
    relojes.set(
      id,
      setTimeout(() => {
        relojes.delete(id)
        const actual = creaciones.get(id)
        if (!actual?.agente?.pausa?.reanudar) return
        if (Date.now() < actual.agente.pausa.reanudar) return programarReanudar(actual)
        if (creandoAhora.has(id)) return
        void seguirCreacion(id).catch(() => {})
      }, espera)
    )
  }
  /** Sigue una creación en pausa: la charla o el video, desde donde se cortó. */
  const seguirCreacion = (id: unknown) =>
    conCreacion(id, async (c, senal) => {
      const pausa = c.agente?.pausa
      if (!pausa) throw new Error('No hay nada en pausa en esta creación.')
      clearTimeout(relojes.get(c.id))
      relojes.delete(c.id)
      c.mensajes.push(mensaje('usuario', 'Seguir donde iba'))
      if (pausa.etapa === 'plan') {
        delete c.agente!.pausa
        await charlaConAgente(c, senal)
      } else {
        await hacerConAgente(c, senal, undefined, true)
      }
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    })
  ipcMain.handle('agente:seguir', (_evento, id: unknown) => seguirCreacion(id))
  // Al abrir la app, las pausas con hora vuelven a esperar su hora.
  for (const c of creaciones.listar()) if (c.agente?.pausa?.reanudar) programarReanudar(c)

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
  /**
   * Lo que el usuario cambia en la caja del chat a mitad de la creación (la voz, imágenes y
   * clips, quién lo hace, «Pregúntame antes / Hazlo directo»): vale desde el siguiente turno.
   */
  ipcMain.handle('creacion:ajustar', (_evento, id: unknown, cambios: unknown) => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    if (!c) throw new Error('Esa creación ya no existe.')
    const x = (cambios ?? {}) as Record<string, unknown>
    if ('vozElegida' in x) {
      if (typeof x.vozElegida === 'string' && VOCES_GEMINI.some((v) => v.id === x.vozElegida)) c.vozElegida = x.vozElegida
      else delete c.vozElegida
    }
    if ('directo' in x) {
      if (x.directo === true) c.directo = true
      else delete c.directo
    }
    if ('flow' in x) {
      const flow = limpiarFlow(x.flow)
      if (flow) c.flow = flow
      else delete c.flow
    }
    if ('tareas' in x) {
      const tareas = limpiarTareas(x.tareas)
      if (tareas) c.tareas = tareas
      else delete c.tareas
    }
    return creaciones.guardar(c)
  })
  /** Más material desde el «+» del chat: entra a trabajo/entrada y el vistazo se rehace. */
  ipcMain.handle('creacion:adjuntar', async (_evento, id: unknown, rutas: unknown) => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    if (!c) throw new Error('Esa creación ya no existe.')
    if (creandoAhora.has(c.id)) throw new Error('Espera a que el agente termine (o páralo) para añadir archivos.')
    const lista = Array.isArray(rutas) ? rutas.filter((r): r is string => typeof r === 'string') : []
    if (!lista.length) return c
    const carpeta = creaciones.carpeta(c.id)
    const preparando = join(carpeta, '.preparando')
    try {
      const { listos, descartados } = await prepararArchivos(lista, preparando)
      const nuevos = copiarEntrada(listos, carpeta, c.adjuntos.filter((a) => a.archivo.startsWith('trabajo/entrada/')).length)
      c.adjuntos.push(...nuevos)
      // El vistazo (miniaturas, fotogramas) se vuelve a preparar con lo nuevo.
      rmSync(join(carpeta, 'trabajo', 'vistazo'), { recursive: true, force: true })
      const nombres = nuevos.map((a) => a.nombre)
      if (nombres.length) {
        c.mensajes.push(mensaje('usuario', `Añadí ${nombres.length === 1 ? 'un archivo' : `${nombres.length} archivos`}: ${nombres.slice(0, 8).join(', ')}${nombres.length > 8 ? '…' : ''}`))
      }
      if (descartados.length) c.mensajes.push(mensaje('agente', `No pude usar: ${descartados.join('; ')}.`, true))
    } finally {
      rmSync(preparando, { recursive: true, force: true })
    }
    return creaciones.guardar(c)
  })
  /** Los mensajes de un cambio rápido en la timeline (el chat del editor) quedan en la conversación. */
  ipcMain.handle('creacion:anotar', (_evento, id: unknown, nuevos: unknown) => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    if (!c) throw new Error('Esa creación ya no existe.')
    const texto = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
    const lista = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string').slice(0, 20).map((t) => t.slice(0, 240)) : [])
    for (const m of Array.isArray(nuevos) ? nuevos.slice(0, 4) : []) {
      if (!m || typeof m !== 'object') continue
      const y = m as Record<string, unknown>
      if (y.rol !== 'usuario' && y.rol !== 'agente') continue
      const cambios = lista(y.cambios)
      const fallos = lista(y.fallos)
      c.mensajes.push({
        ...mensaje(y.rol, texto(y.texto, 4000), y.error === true),
        ...(cambios.length ? { cambios } : {}),
        ...(fallos.length ? { fallos } : {}),
        ...(lista(y.propuestas).length ? { propuestas: lista(y.propuestas).slice(0, 4) } : {})
      })
    }
    return creaciones.guardar(c)
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
      ...(limpiarFlow(x.flow) ? { flow: limpiarFlow(x.flow) } : {}),
      // La voz elegida en la caja y «Hazlo directo» (antes se perdían aquí y el agente no los recibía).
      ...(typeof x.vozElegida === 'string' && VOCES_GEMINI.some((v) => v.id === x.vozElegida) ? { vozElegida: x.vozElegida } : {}),
      ...(x.directo === true ? { directo: true } : {})
    }).then((c) => conBase(c, x.base))
  })

  // ===== Versiones: «Así está bien», volver a una anterior, «Otro video así» y «Mis estilos» =====
  const propios = new EstilosPropios(join(app.getPath('userData'), 'estilos-propios'))
  /** Un video nuevo que parte del estilo de otro: copia su paquete a trabajo/base-estilo/. */
  const conBase = (c: Creacion, base: PeticionCreacion['base']): Creacion => {
    if (!base) return c
    const destino = join(creaciones.carpeta(c.id), 'trabajo', 'base-estilo')
    try {
      if (typeof base.propio === 'string') {
        const meta = propios.copiarA(base.propio, destino)
        c.base = baseDe(meta, 'propio', meta.id)
      } else if (typeof base.creacion === 'string') {
        const o = creaciones.get(base.creacion)
        if (!o) return c
        const n = typeof base.version === 'number' && base.version >= 1 && base.version <= o.version ? base.version : versionBase(o)
        armarBase(o, creaciones.carpeta(o.id), n, destino)
        c.base = baseDe({ nombre: o.guion?.titulo ?? o.nombre }, 'creacion', o.id, n)
      }
    } catch (e) {
      c.mensajes.push(mensaje('agente', `No pude copiar el estilo de partida: ${textoError(e)}. Lo hago desde cero.`, true))
    }
    return creaciones.guardar(c)
  }
  const sinTrabajar = (id: unknown): Creacion => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    if (!c) throw new Error('Esa creación ya no existe.')
    if (creandoAhora.has(c.id)) throw new Error('El agente está trabajando en este video: espera a que acabe.')
    return c
  }
  const numVersion = (c: Creacion, n: unknown): number => {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > c.version) throw new Error('Esa versión no existe.')
    return n
  }
  /** Deja la versión n como la vigente: su video y su receta (la de ahora queda guardada aparte). */
  const volverA = (c: Creacion, n: number): void => {
    const carpeta = creaciones.carpeta(c.id)
    const { video, receta } = archivosVersion(carpeta, n)
    if (!video) throw new Error(`No encuentro el video de la versión ${n}.`)
    const trabajo = join(carpeta, 'trabajo')
    const actual = join(trabajo, 'receta.json')
    if (receta) {
      if (existsSync(actual)) copyFileSync(actual, join(trabajo, `receta-antes-de-volver-a-v${n}.json`))
      copyFileSync(join(carpeta, receta), actual)
    }
    const guardada = c.versiones?.find((v) => v.n === n)?.resultado
    const fotos = [0, 1, 2, 3, 4, 5].map((i) => `salidas/agente-v${n}-r${i}.jpg`).filter((r) => existsSync(join(carpeta, r)))
    const resultado = guardada ?? {
      archivo: video,
      tipo: /\.(png|jpg)$/i.test(video) ? ('imagen' as const) : ('video' as const),
      resumen: `Versión ${n}.`,
      comprobaciones: [],
      revision: fotos.filter((r) => !/-r0\.jpg$/.test(r)),
      ...(receta ? { receta } : {})
    }
    if (!c.agente) c.agente = { registro: [], rondas: 0 }
    c.agente.resultado = resultado
    c.agente.nota = `OJO: el usuario VOLVIÓ a la versión ${n} (${video.replace('salidas/', '')}): lo que hiciste después no le sirvió.${receta ? ` receta.json ya es la de esa versión (la que tenías quedó en receta-antes-de-volver-a-v${n}.json).` : ''} Parte de la versión ${n} y conserva todo lo que no se pide cambiar.`
    if (resultado.tipo === 'video') {
      c.salida = video
      c.portada = resultado.revision[1] ?? resultado.revision[0] ?? c.portada
    }
  }
  ipcMain.handle('creacion:aprobar', (_evento, id: unknown, n: unknown) => {
    const c = sinTrabajar(id)
    const v = numVersion(c, n)
    const vigente = c.agente?.resultado?.archivo === archivosVersion(creaciones.carpeta(c.id), v).video
    if (!vigente) volverA(c, v)
    c.aprobada = v
    c.mensajes.push(mensaje('usuario', `Así está bien (versión ${v}).`))
    c.mensajes.push({
      ...mensaje('agente', `Anotado: la versión ${v} es la buena. Si me pides algo, parto de ella y conservo lo demás. Con «Otro video así» hago uno nuevo con este mismo estilo, o guárdalo en «Mis estilos» para usarlo cuando quieras.`),
      propuestas: []
    })
    return creaciones.guardar(c)
  })
  ipcMain.handle('creacion:volver', (_evento, id: unknown, n: unknown) => {
    const c = sinTrabajar(id)
    const v = numVersion(c, n)
    volverA(c, v)
    c.mensajes.push(mensaje('usuario', `Vuelve a la versión ${v}.`))
    c.mensajes.push({ ...mensaje('agente', `Volví a la versión ${v}. Lo que me pidas ahora parte de ella.`), propuestas: [] })
    return creaciones.guardar(c)
  })
  /** «Otro video así»: una creación nueva con lo mismo de esta (agente, formato, voz, Flow) y su estilo de base. */
  ipcMain.handle('creacion:otro-asi', async (_evento, id: unknown, peticion: unknown, n: unknown) => {
    const o = typeof id === 'string' ? creaciones.get(id) : null
    if (!o) throw new Error('Esa creación ya no existe.')
    if (typeof peticion !== 'string' || !peticion.trim()) throw new Error('Cuéntale de qué trata el video nuevo.')
    const v = typeof n === 'number' ? numVersion(o, n) : versionBase(o)
    const nueva = await creaciones.nueva({
      peticion: peticion.trim().slice(0, 4000),
      estilo: o.estilo,
      formato: o.formato,
      duracion: o.duracion,
      adjuntos: [],
      ...(o.modo === 'agente' ? { modo: 'agente' as const } : {}),
      ...(o.tareas ? { tareas: o.tareas } : {}),
      ...(o.flow ? { flow: o.flow } : {}),
      ...(o.vozElegida ? { vozElegida: o.vozElegida } : {}),
      ...(o.directo ? { directo: true } : {})
    })
    // En la misma conversación que aquella (la de la primera creación).
    nueva.hilo = o.hilo ?? o.id
    return conBase(nueva, { creacion: o.id, version: v })
  })
  ipcMain.handle('estilos-propios:listar', () => propios.listar())
  ipcMain.handle('estilos-propios:guardar', (_evento, id: unknown, nombre: unknown, n: unknown) => {
    const c = typeof id === 'string' ? creaciones.get(id) : null
    if (!c) throw new Error('Esa creación ya no existe.')
    const v = typeof n === 'number' ? numVersion(c, n) : versionBase(c)
    const e = propios.guardar(c, creaciones.carpeta(c.id), v, typeof nombre === 'string' ? nombre : '')
    c.mensajes.push({ ...mensaje('agente', `Guardé el estilo de la versión ${v} como «${e.nombre}» en «Mis estilos». Lo eliges al crear un video nuevo.`), propuestas: [] })
    creaciones.guardar(c)
    return e
  })
  ipcMain.handle('estilos-propios:borrar', (_evento, id: unknown) => {
    if (typeof id === 'string') propios.borrar(id)
    return propios.listar()
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
  /**
   * La versión del agente sin subtítulos ni rótulos (`resultado.limpio`), como un medio más: los tramos
   * que la receta no separa salen de ella, así los textos solo están en su pista (editables) y no se
   * ven dos veces. Null si no hay (el editor usa el video entregado).
   */
  const medioLimpio = async (c: Creacion): Promise<MedioProyecto | null> => {
    const rel = c.agente?.resultado?.limpio
    if (!rel) return null
    const ruta = join(creaciones.carpeta(c.id), rel)
    if (!existsSync(ruta)) return null
    try {
      const info = await probeVideo(ruta)
      return {
        id: `m-${randomUUID().slice(0, 8)}`,
        ruta,
        nombre: `Versión ${c.version} del agente (sin textos)`,
        tipo: 'video',
        duracion: info.duration,
        ancho: info.width,
        alto: info.height,
        conAudio: info.hasAudio
      }
    } catch {
      return null
    }
  }
  /** Los tramos fijos (los del video entregado) pasan a salir de `fuente`. */
  const tramosDe = (tl: Timeline, fuente: string): Timeline => ({ ...tl, clips: tl.clips.map((x) => (x.fuente === FUENTE_PRINCIPAL ? { ...x, fuente } : x)) })
  /**
   * La timeline tal como la entregó el agente (junto a su video, `salidas/agente-vN.editor.json`):
   * con ella se sabe después qué retocó el usuario a mano.
   */
  const rutaEntregada = (c: Creacion, salida: string) => join(creaciones.carpeta(c.id), `${salida.replace(/\.mp4$/i, '')}.editor.json`)
  const guardarEntregada = (c: Creacion, tl: Timeline) => {
    if (!c.salida) return
    try {
      guardar(rutaEntregada(c, c.salida), JSON.stringify(tl))
    } catch {
      // Sin ella, el agente no se entera de los retoques (como antes), pero el editor sigue igual.
    }
  }
  /** Lo que el usuario retocó a mano en el editor sobre la última versión que abrió (para el agente). */
  const retoquesDe = (c: Creacion): string[] => {
    if (!c.proyectoEditor || !c.editorSalida) return []
    const p = proyectos.abrir(c.proyectoEditor)
    const entregada = join(creaciones.carpeta(c.id), `${c.editorSalida.replace(/\.mp4$/i, '')}.editor.json`)
    // Con una versión pendiente sin aplicar, el usuario todavía no tocó esa versión.
    if (!p?.timeline || p.timelinePendiente || !existsSync(entregada)) return []
    try {
      const base = JSON.parse(readFileSync(entregada, 'utf8')) as Timeline
      const medios = new Map((p.medios ?? []).map((m) => [m.id, m]))
      return describirRetoques(base, p.timeline, {
        medio: (f) => {
          const m = medios.get(f)
          return m ? `${m.tipo === 'imagen' ? 'la imagen' : 'el video'} «${m.nombre}» (${m.ruta})` : 'tu video entregado'
        },
        archivo: (rel) => join(proyectos.carpeta(p.id), rel)
      })
    } catch {
      return []
    }
  }
  ipcMain.handle('creacion:editor', (_evento, id: unknown) => creacionAlEditor(id))
  /** El proyecto del editor de una creación con video (lo crea, o mete la versión nueva en el mismo). */
  async function creacionAlEditor(id: unknown): Promise<Project> {
    if (typeof id !== 'string') throw new Error('Creación inválida.')
    const c = creaciones.get(id)
    if (!c?.salida) throw new Error('Todavía no hay un video para editar.')
    // Si ya se abrió antes, se sigue en el mismo proyecto (con sus ediciones).
    if (c.proyectoEditor && (c.editorSalida ?? c.salida) === c.salida) {
      const previo = proyectos.abrir(c.proyectoEditor)
      if (previo) return previo
    }
    // Una versión nueva del agente entra en el MISMO proyecto: su video como un medio más y sus
    // pistas como timeline pendiente, que el editor aplica como un paso de deshacer.
    if (c.proyectoEditor) {
      const previo = proyectos.abrir(c.proyectoEditor)
      if (previo) {
        try {
          return await versionNuevaAlEditor(c, previo)
        } catch (e) {
          // Si la versión nueva no se pudo traer, se entra igual al proyecto de siempre (con sus ediciones): nunca
          // te deja afuera del editor. El aviso dice qué pasó.
          console.error('[editor] no pude traer la versión nueva', e)
          return { ...previo, avisoEditor: `Abrí tu proyecto de siempre: no pude traer la versión ${c.version} (${textoError(e).slice(0, 160)}).` }
        }
      }
    }
    return ingerirCreacion(c)
  }
  /** Una versión nueva del agente entra en el MISMO proyecto del editor. */
  async function versionNuevaAlEditor(c: Creacion, previo: Project): Promise<Project> {
    const id = c.id
    if (!c.salida) throw new Error('Todavía no hay un video para editar.')
    {
      {
        const carpeta = creaciones.carpeta(id)
        const ruta = join(carpeta, c.salida)
        const info = await probeVideo(ruta)
        const mid = `m-${randomUUID().slice(0, 8)}`
        const medio: MedioProyecto = {
          id: mid,
          ruta,
          nombre: `Versión ${c.version} del agente`,
          tipo: 'video',
          duracion: info.duration,
          ancho: info.width,
          alto: info.height,
          conAudio: info.hasAudio
        }
        const medios = [...(previo.medios ?? []), medio]
        let timeline = insertarClip(timelineVacia(), { fuente: mid, entrada: 0, salida: info.duration }).timeline
        const receta = c.modo === 'agente' ? c.agente?.resultado?.receta : undefined
        if (receta) {
          try {
            const armado = await proyectoDesdeReceta(join(carpeta, receta), join(carpeta, 'trabajo'), proyectos.carpeta(previo.id), info.duration)
            if (armado) {
              medios.push(...armado.medios)
              // Lo que la receta no puede separar sale del video nuevo (sin textos, si lo hay), no del primero.
              const limpio = await medioLimpio(c)
              if (limpio) medios.push(limpio)
              timeline = tramosDe(armado.timeline, limpio?.id ?? mid)
            }
          } catch {
            // Sin receta legible, la versión entra como un solo clip.
          }
        }
        previo.medios = medios
        previo.timelinePendiente = timeline
        proyectos.save(previo)
        guardarEntregada(c, timeline)
        c.editorSalida = c.salida
        creaciones.guardar(c)
        const listo = proyectos.abrir(previo.id) ?? previo
        // Si el editor ya está abierto en este proyecto (porque esto tardó y se entró sin esperar), la versión nueva
        // le llega igual, como un paso que se deshace con Ctrl+Z.
        const { transcript: _t, ...ligero } = listo
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: { ...ligero, timeline }, quien: 'recorte', conTimeline: true })
        return listo
      }
    }
  }
  /** El primer paso al editor: el video entregado entra como proyecto nuevo (con su receta, si la hay). */
  async function ingerirCreacion(c: Creacion): Promise<Project> {
    const id = c.id
    if (!c.salida) throw new Error('Todavía no hay un video para editar.')
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
          // Los tramos fijos, de la versión sin textos: así los subtítulos y rótulos no salen dos veces.
          const limpio = await medioLimpio(c)
          p.medios = [...armado.medios, ...(limpio ? [limpio] : [])]
          p.timeline = limpio ? tramosDe(armado.timeline, limpio.id) : armado.timeline
          proyectos.save(p)
        }
      } catch {
        // Con una receta que no se puede leer, el editor abre el video entero, como antes.
      }
    }
    // Sin frases de voz sueltas, el chat no sabría qué se dice: se transcribe solo, sin esperar.
    const abierto = proyectos.abrir(ingesta.project.id) ?? ingesta.project
    guardarEntregada(c, abierto.timeline ?? timelineInicial(abierto.source.duration))
    if (!abierto.timeline?.voces?.length) {
      void transcribirProyecto(abierto.id).then((r) => {
        if (!r.ok || !r.project) return
        const { transcript: _t, ...ligero } = r.project
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
      })
    }
    return abierto
  }
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
  // Dónde está el usuario en el editor de cada proyecto (lo manda el editor al moverse): para el chat y el MCP.
  ipcMain.handle('editor:donde', (_evento, id: unknown, texto: unknown) => {
    if (typeof id === 'string' && typeof texto === 'string') dondeEnEditor.set(id, { texto: texto.slice(0, 500), fecha: Date.now() })
  })
  // El «+» de la caja del chat del editor: archivos sueltos o carpetas (de una carpeta, sus videos e imágenes).
  ipcMain.handle('proyecto:agregar-rutas', async (_evento, id: unknown, rutas: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id) || !Array.isArray(rutas)) return null
    const MEDIO = /\.(mp4|mov|mkv|webm|m4v|jpe?g|png|webp)$/i
    const archivos: string[] = []
    for (const r of rutas.filter((x): x is string => typeof x === 'string' && existsSync(x))) {
      if (statSync(r).isDirectory()) {
        for (const n of readdirSync(r)) if (MEDIO.test(n)) archivos.push(join(r, n))
      } else if (MEDIO.test(r)) archivos.push(r)
    }
    if (!archivos.length) return { agregados: [], fallos: ['Ahí no hay videos ni imágenes que pueda usar.'] }
    const hecho = await agregarRutas(id, archivos)
    const { transcript: _t, ...ligero } = hecho.project
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'chat', conTimeline: false })
    return { agregados: hecho.agregados, fallos: hecho.fallos }
  })
  ipcMain.handle('proyecto:agregar-medios', async (_evento, id: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id)) throw new Error('Proyecto inválido.')
    const r = await dialog.showOpenDialog({
      title: 'Videos o imágenes para tu proyecto',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos e imágenes', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v', 'jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (r.canceled || !r.filePaths.length) return null
    return agregarRutas(id, r.filePaths)
  })
  /** Agrega archivos a la biblioteca del proyecto (los copia no: se usan desde su ruta). */
  /** La copia liviana de los videos de la biblioteca (para el monitor): se hace en segundo plano y el editor la usa al estar lista. */
  function avisarProxysDeMedios(id: string) {
    prepararProxysDeMedios(
      proyectos,
      id,
      (p) => {
        const { transcript: _t, ...ligero } = p
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
      },
      (pct, texto) => enviarProgreso({ id, fase: 'ingesta', pct, texto })
    )
  }
  async function agregarRutas(id: string, rutas: string[]): Promise<{ project: Project; agregados: string[]; fallos: string[] }> {
    const carpeta = join(proyectos.carpeta(id), 'medios')
    mkdirSync(carpeta, { recursive: true })
    const nuevos: NonNullable<Project['medios']> = []
    const fallos: string[] = []
    for (const ruta of rutas.slice(0, 50)) {
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
    avisarProxysDeMedios(id)
    return { project: actual, agregados: nuevos.map((m) => m.id), fallos }
  }
  /** Copia un audio a `media/` del proyecto (para ponerlo como sonido o música). */
  async function copiarAudio(id: string, origen: string): Promise<{ archivo: string; nombre: string; duracion: number }> {
    const duracion = await duracionMedio(origen)
    if (!(duracion > 0)) throw new Error(`No pude leer el audio «${basename(origen)}».`)
    const base =
      basename(origen, extname(origen))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'sonido'
    const archivo = `sonido-${base}-${Date.now().toString(36)}${extname(origen).toLowerCase()}`
    const carpetaMedia = join(proyectos.carpeta(id), 'media')
    mkdirSync(carpetaMedia, { recursive: true })
    copyFileSync(origen, join(carpetaMedia, archivo))
    return { archivo: `media/${archivo}`, nombre: basename(origen, extname(origen)).slice(0, 60), duracion }
  }
  // Archivos soltados o pegados en el editor: los videos y las fotos van a la biblioteca; los audios, a `media/`.
  ipcMain.handle('proyecto:importar-rutas', async (_evento, id: unknown, rutas: unknown) => {
    if (typeof id !== 'string' || !Array.isArray(rutas)) throw new Error('Datos inválidos.')
    if (!proyectos.get(id)) throw new Error('El proyecto ya no existe.')
    const lista = rutas.filter((r): r is string => typeof r === 'string' && existsSync(r) && statSync(r).isFile()).slice(0, 50)
    const esAudio = (r: string) => ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac'].includes(extname(r).toLowerCase())
    const audios: { archivo: string; nombre: string; duracion: number }[] = []
    const fallos: string[] = []
    for (const r of lista.filter(esAudio)) {
      try {
        audios.push(await copiarAudio(id, r))
      } catch {
        fallos.push(basename(r))
      }
    }
    const otros = lista.filter((r) => !esAudio(r))
    const r = otros.length ? await agregarRutas(id, otros) : { project: proyectos.abrir(id)!, agregados: [], fallos: [] }
    return { project: r.project, agregados: r.agregados, audios, fallos: [...fallos, ...r.fallos] }
  })
  /**
   * La muestra de una voz de Gemini para oírla antes de elegirla. Cada voz se genera una sola vez
   * (la misma que da probar_voz por MCP) y queda en `userData/muestras-voz`.
   */
  ipcMain.handle('voz:muestra', async (_evento, voz: unknown) => {
    const v = VOCES_GEMINI.find((x) => x.id === voz)
    if (!v) throw new Error('Esa voz no existe.')
    const ruta = join(carpetaMuestras, `${v.id}.wav`)
    if (!existsSync(ruta)) {
      mkdirSync(carpetaMuestras, { recursive: true })
      try {
        await generarFraseVoz(textoMuestra(v.id), v.id, ruta)
      } catch (e) {
        rmSync(ruta, { force: true })
        throw new Error(`No pude generar la muestra: ${textoError(e)}`)
      }
    }
    return `recorte-media://muestras/${v.id}.wav`
  })
  /**
   * Una frase narrada con tu propia voz, grabada en el editor: se pasa a WAV, se le quita el
   * silencio de los bordes y queda en la carpeta del proyecto, como las de Gemini.
   */
  ipcMain.handle('proyecto:voz-grabada', async (_evento, id: unknown, datos: unknown, texto: unknown) => {
    if (typeof id !== 'string' || !proyectos.get(id)) throw new Error('El proyecto ya no existe.')
    if (!(datos instanceof Uint8Array) || datos.length < 200) throw new Error('La grabación salió vacía.')
    const media = join(proyectos.carpeta(id), 'media')
    mkdirSync(media, { recursive: true })
    const nombre = `voz-propia-${randomUUID().slice(0, 8)}`
    const temporal = join(media, `${nombre}.webm`)
    const salida = join(media, `${nombre}.wav`)
    writeFileSync(temporal, datos)
    try {
      const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
      // El silencio del principio y del final (el clic de grabar), fuera; lo de en medio, tal cual.
      const bordes = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse'
      const r = await ejecutar([`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${temporal}"`, '-vn', '-ac', '1', '-ar', '48000', '-af', bordes, '-t', '120', `"${salida}"`], media, 120_000)
      if (r.codigo !== 0 || !existsSync(salida)) throw new Error(`No pude leer la grabación: ${r.salida.trim().slice(-200)}`)
    } finally {
      rmSync(temporal, { force: true })
    }
    const duracion = Math.round((await duracionMedio(salida)) * 100) / 100
    if (!(duracion > 0.2)) {
      rmSync(salida, { force: true })
      throw new Error('No se oye nada en la grabación. Revisa el micrófono y vuelve a grabar.')
    }
    return { archivo: `media/${nombre}.wav`, duracion, texto: typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim().slice(0, 600) : '' }
  })
  /**
   * Quita el fondo de una imagen de la biblioteca con el kit (un fondo liso al momento; cualquier otra foto,
   * con el modelo ISNet) y la agrega como un medio nuevo (un PNG con transparencia), para usarla como capa.
   * El original no se toca.
   */
  async function quitarFondo(id: string, medio: string): Promise<{ project: Project; medio: string }> {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const m = p.medios?.find((x) => x.id === medio)
    if (!m) throw new Error('Ese medio ya no está en la biblioteca.')
    const py = await buscarPython()
    const kit = rutaScriptPython(join('kit', 'kit.py'))
    if (!py || !existsSync(kit)) throw new Error('Hace falta Python para quitar fondos (Ajustes › Sistema).')
    const carpeta = join(proyectos.carpeta(id), 'recortes')
    mkdirSync(carpeta, { recursive: true })
    const esVideo = m.tipo === 'video'
    // Un video sobre verde (llave de color): sale un WebM con transparencia; una imagen, un PNG.
    const salida = join(carpeta, `${basename(m.nombre, extname(m.nombre)).slice(0, 40)}-sin-fondo-${randomUUID().slice(0, 6)}.${esVideo ? 'webm' : 'png'}`)
    const cita = (x: string) => (/[\s"]/.test(x) ? `"${x}"` : x)
    // La primera vez con una foto de fondo variado se baja el modelo (178 MB): hasta 15 minutos.
    const r = await ejecutar(
      [[py.cmd, ...py.args].map(cita).join(' '), cita(kit), esVideo ? 'recortar-video' : 'recortar', cita(m.ruta), '--salida', cita(salida)],
      carpeta,
      900_000
    )
    if (r.codigo !== 0 || !existsSync(salida)) {
      const motivo = r.salida.trim().split('\n').filter(Boolean).pop() ?? ''
      throw new Error(motivo.length < 300 && motivo ? motivo : 'No pude quitarle el fondo.')
    }
    const agregado = await agregarRutas(id, [salida])
    const nuevo = agregado.agregados[0]
    if (!nuevo) throw new Error(`No pude agregar el recorte: ${agregado.fallos.join(', ')}`)
    return { project: agregado.project, medio: nuevo }
  }
  /**
   * Congelar cuadro (como «Insertar segmento congelado» de Premiere): el cuadro de un video en el segundo `segundo` de
   * su fuente sale como imagen a la biblioteca, para ponerlo como un clip quieto.
   */
  async function congelarCuadro(id: string, fuente: string, segundo: number): Promise<{ project: Project; medio: string }> {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const ruta = fuente === 'principal' ? p.source.path : p.medios?.find((m) => m.id === fuente && m.tipo === 'video')?.ruta
    if (!ruta) throw new Error('Solo se congela un cuadro de un video.')
    const carpeta = join(proyectos.carpeta(id), 'congelados')
    mkdirSync(carpeta, { recursive: true })
    const salida = join(carpeta, `cuadro-${Math.round(Math.max(0, segundo) * 1000)}-${randomUUID().slice(0, 6)}.png`)
    const r = await ejecutar(
      [`"${resolverBinario('ffmpeg') ?? 'ffmpeg'}"`, '-y', '-v', 'error', '-ss', Math.max(0, segundo).toFixed(3), '-i', `"${ruta}"`, '-frames:v', '1', `"${salida}"`],
      carpeta,
      60_000
    )
    if (r.codigo !== 0 || !existsSync(salida)) throw new Error('No pude sacar ese cuadro del video.')
    const agregado = await agregarRutas(id, [salida])
    const nuevo = agregado.agregados[0]
    if (!nuevo) throw new Error(`No pude agregar el cuadro: ${agregado.fallos.join(', ')}`)
    return { project: agregado.project, medio: nuevo }
  }
  // Estabilizar: el tramo que usa el clip sale estabilizado a la biblioteca (el original no se toca).
  ipcMain.handle('proyecto:estabilizar', async (_evento, id: unknown, fuente: unknown, desde: unknown, hasta: unknown) => {
    if (typeof id !== 'string' || typeof fuente !== 'string' || typeof desde !== 'number' || typeof hasta !== 'number' || !(hasta > desde)) throw new Error('Datos inválidos.')
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const ruta = fuente === 'principal' ? p.source.path : p.medios?.find((m) => m.id === fuente && m.tipo === 'video')?.ruta
    if (!ruta) throw new Error('Solo se estabiliza un video.')
    // Un poco de margen a cada lado: así el clip se puede alargar un poco después sin volver a estabilizar.
    const a = Math.max(0, desde - 1)
    const b = hasta + 1
    const salida = await estabilizarTramo(ruta, a, b, join(proyectos.carpeta(id), 'estabilizados'), (f) =>
      enviarProgreso({ id, fase: 'render', pct: f, texto: `Estabilizando ${Math.round(f * 100)} %` })
    )
    const agregado = await agregarRutas(id, [salida])
    const nuevo = agregado.agregados[0]
    if (!nuevo) throw new Error(`No pude agregar la toma estabilizada: ${agregado.fallos.join(', ')}`)
    return { project: agregado.project, medio: nuevo, desde: a }
  })
  // Seguir una zona tapada (una cara que se mueve): su centro en cada momento del tramo, con OpenCV.
  ipcMain.handle('proyecto:seguir-zona', async (_evento, id: unknown, fuente: unknown, pedido: unknown) => {
    const q = (pedido ?? {}) as { desde?: unknown; hasta?: unknown; en?: unknown; x?: unknown; y?: unknown; ancho?: unknown; alto?: unknown }
    const nums = [q.desde, q.hasta, q.en, q.x, q.y, q.ancho, q.alto]
    if (typeof id !== 'string' || typeof fuente !== 'string' || !nums.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('Datos inválidos.')
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const ruta = fuente === 'principal' ? p.source.path : p.medios?.find((m) => m.id === fuente && m.tipo === 'video')?.ruta
    if (!ruta) throw new Error('Solo se sigue algo dentro de un video.')
    const py = await buscarPython()
    const script = rutaScriptPython('seguir.py')
    if (!py || !existsSync(script)) throw new Error('Hace falta Python para seguir una zona (Ajustes › Sistema).')
    const carpeta = join(proyectos.carpeta(id), 'seguimiento')
    mkdirSync(carpeta, { recursive: true })
    const salida = join(carpeta, `zona-${randomUUID().slice(0, 8)}.json`)
    const cita = (x: string) => (/[\s"]/.test(x) ? `"${x}"` : x)
    const arg = (n: string, v: unknown) => [`--${n}`, String(v)]
    const r = await ejecutar(
      [
        [py.cmd, ...py.args].map(cita).join(' '),
        cita(script),
        cita(ruta),
        cita(salida),
        ...arg('desde', q.desde),
        ...arg('hasta', q.hasta),
        ...arg('en', q.en),
        ...arg('x', q.x),
        ...arg('y', q.y),
        ...arg('ancho', q.ancho),
        ...arg('alto', q.alto)
      ],
      carpeta,
      600_000
    )
    if (r.codigo !== 0 || !existsSync(salida)) {
      const motivo = r.salida.trim().split('\n').filter(Boolean).pop() ?? ''
      throw new Error(motivo && motivo.length < 300 ? motivo : 'No pude seguir esa zona.')
    }
    const datos = JSON.parse(readFileSync(salida, 'utf8')) as { recorrido: { f: number; x: number; y: number }[]; perdido: number }
    rmSync(salida, { force: true })
    return datos
  })
  // Anidar: los clips elegidos se renderizan en un solo video (con su color, sus efectos y su sonido) que entra a la
  // biblioteca; el editor pone ese clip en su lugar y guarda los de dentro para desanidar.
  ipcMain.handle('proyecto:anidar', async (_evento, id: unknown, clips: unknown) => {
    if (typeof id !== 'string' || !Array.isArray(clips) || clips.length < 2) throw new Error('Elige al menos dos clips seguidos.')
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const dentro = normalizarTimeline({ version: 1, clips, textos: [] }, p.source.duration, duracionesDeMedios(p.medios))
    if (dentro.clips.length < 2) throw new Error('Esos clips ya no están en el proyecto.')
    const carpeta = join(proyectos.carpeta(id), 'anidados', randomUUID().slice(0, 8))
    const r = await exportarTimeline(p, dentro, proyectos.carpeta(id), { formato: 'original', subtitulos: false, calidad: 'alta' }, (pct) =>
      enviarProgreso({ id, fase: 'render', pct, texto: `Anidando ${Math.round(pct * 100)} %` })
    , carpeta)
    if (!r.ok || !r.output) throw new Error(r.error ?? 'No pude anidar esos clips.')
    const final = join(carpeta, `anidado-${dentro.clips.length}-clips.mp4`)
    renameSync(r.output, final)
    const agregado = await agregarRutas(id, [final])
    const nuevo = agregado.agregados[0]
    if (!nuevo) throw new Error(`No pude agregar el anidado: ${agregado.fallos.join(', ')}`)
    const m = agregado.project.medios?.find((x) => x.id === nuevo)
    return { project: agregado.project, medio: nuevo, duracion: m?.duracion ?? duracionTimeline(dentro) }
  })
  // Multicámara: el desfase de cada toma respecto de la primera, comparando la forma de su sonido.
  ipcMain.handle('proyecto:sincronizar', async (_evento, id: unknown, fuentes: unknown) => {
    if (typeof id !== 'string' || !Array.isArray(fuentes) || fuentes.length < 2) throw new Error('Elige al menos dos tomas.')
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const rutas = fuentes.map((f) => (f === 'principal' ? p.source.path : p.medios?.find((m) => m.id === f && m.tipo === 'video')?.ruta))
    if (rutas.some((r) => !r)) throw new Error('Una de las tomas ya no está en la biblioteca.')
    const picos = await Promise.all(rutas.map((r) => picosDeArchivo(r!, proyectos.carpeta(id))))
    if (!picos[0]?.length) throw new Error('La primera toma no tiene sonido: no hay con qué sincronizar.')
    return fuentes.map((f, i) => {
      if (i === 0) return { fuente: String(f), desfase: 0, confianza: 1 }
      if (!picos[i]?.length) return { fuente: String(f), desfase: 0, confianza: 0 }
      return { fuente: String(f), ...desfasePorSonido(picos[0]!, picos[i]!) }
    })
  })
  // Separar el audio: el sonido de un tramo de un video sale a `media/` como WAV, para ponerlo en una pista de sonidos.
  ipcMain.handle('proyecto:extraer-audio', async (_evento, id: unknown, fuente: unknown, desde: unknown, hasta: unknown, velocidad: unknown) => {
    if (typeof id !== 'string' || typeof fuente !== 'string' || typeof desde !== 'number' || typeof hasta !== 'number' || !(hasta > desde)) throw new Error('Datos inválidos.')
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const m = fuente === 'principal' ? null : p.medios?.find((x) => x.id === fuente && x.tipo === 'video')
    const ruta = fuente === 'principal' ? p.source.path : m?.ruta
    if (!ruta) throw new Error('Solo se separa el sonido de un video.')
    const media = join(proyectos.carpeta(id), 'media')
    mkdirSync(media, { recursive: true })
    const nombre = `audio-${randomUUID().slice(0, 8)}.wav`
    // Con la velocidad del clip (0.25× a 4×): atempo la cambia sin cambiar el tono, en pasos de 0.5 a 2.
    const v = typeof velocidad === 'number' && Number.isFinite(velocidad) ? Math.min(4, Math.max(0.25, velocidad)) : 1
    const pasos: number[] = []
    for (let resto = v; Math.abs(resto - 1) > 0.001; ) {
      const paso = Math.min(2, Math.max(0.5, resto))
      pasos.push(paso)
      resto /= paso
    }
    const tempo = pasos.length ? ['-af', pasos.map((x) => `atempo=${x.toFixed(4)}`).join(',')] : []
    const r = await ejecutar(
      [`"${resolverBinario('ffmpeg') ?? 'ffmpeg'}"`, '-y', '-v', 'error', '-ss', Math.max(0, desde).toFixed(3), '-t', (hasta - desde).toFixed(3), '-i', `"${ruta}"`, '-vn', ...tempo, '-ac', '2', '-ar', '48000', `"${join(media, nombre)}"`],
      media,
      300_000
    )
    if (r.codigo !== 0 || !existsSync(join(media, nombre))) throw new Error('Ese video no tiene sonido que separar.')
    const duracion = Math.round((await duracionMedio(join(media, nombre))) * 1000) / 1000
    return { archivo: `media/${nombre}`, duracion: duracion || hasta - desde, nombre: `Sonido de ${fuente === 'principal' ? p.name : m!.nombre}`.slice(0, 60) }
  })
  ipcMain.handle('proyecto:congelar', (_evento, id: unknown, fuente: unknown, segundo: unknown) => {
    if (typeof id !== 'string' || typeof fuente !== 'string' || typeof segundo !== 'number' || !Number.isFinite(segundo)) throw new Error('Datos inválidos.')
    return congelarCuadro(id, fuente, segundo)
  })
  /**
   * Anima una imagen recortada de la biblioteca (respira, se balancea, ondea, flota, humo) con el kit: un
   * WebM con transparencia en bucle que entra a la biblioteca. Como el «Puppet» de After Effects: sin créditos.
   */
  async function animarImagen(id: string, medio: string, tipo: string): Promise<{ project: Project; medio: string; escala: number; avisos?: string[] }> {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const m = p.medios?.find((x) => x.id === medio)
    if (!m || m.tipo !== 'imagen') throw new Error('Solo se anima una imagen (mejor recortada, sin fondo).')
    if (!ANIMAR_CAPA.some((a) => a.id === tipo)) throw new Error('Ese movimiento no existe.')
    const py = await buscarPython()
    const kit = rutaScriptPython(join('kit', 'kit.py'))
    if (!py || !existsSync(kit)) throw new Error('Hace falta Python para animar (Ajustes › Sistema).')
    const carpeta = join(proyectos.carpeta(id), 'animadas')
    mkdirSync(carpeta, { recursive: true })
    const salida = join(carpeta, `${basename(m.nombre, extname(m.nombre)).slice(0, 40)}-${tipo}-${randomUUID().slice(0, 6)}.webm`)
    const cita = (x: string) => (/[\s"]/.test(x) ? `"${x}"` : x)
    const r = await ejecutar([[py.cmd, ...py.args].map(cita).join(' '), cita(kit), 'animar', cita(m.ruta), '--tipo', tipo, '--salida', cita(salida)], carpeta, 600_000)
    if (r.codigo !== 0 || !existsSync(salida)) {
      const motivo = r.salida.trim().split('\n').filter(Boolean).pop() ?? ''
      throw new Error(motivo.length < 300 && motivo ? motivo : 'No pude animarla.')
    }
    const agregado = await agregarRutas(id, [salida])
    const nuevo = agregado.agregados[0]
    if (!nuevo) throw new Error(`No pude agregar la animación: ${agregado.fallos.join(', ')}`)
    // Lo que contesta el kit: cuánto más ancha es la animación que la imagen y, en la marioneta, sus avisos.
    let info: { escala?: number; avisos?: string[] } = {}
    try {
      info = JSON.parse(r.salida.trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop() ?? '{}')
    } catch {
      info = {}
    }
    return {
      project: agregado.project,
      medio: nuevo,
      escala: typeof info.escala === 'number' && info.escala >= 1 ? info.escala : 1.16,
      ...(Array.isArray(info.avisos) && info.avisos.length ? { avisos: info.avisos.map(String) } : {})
    }
  }
  ipcMain.handle('proyecto:animar-imagen', (_evento, id: unknown, medio: unknown, tipo: unknown) => {
    if (typeof id !== 'string' || typeof medio !== 'string' || typeof tipo !== 'string') throw new Error('Datos inválidos.')
    return animarImagen(id, medio, tipo)
  })
  // La onda de un video o audio del proyecto (para la línea de tiempo): sus picos, calculados una vez y guardados.
  ipcMain.handle('proyecto:onda', (_evento, id: unknown, fuente: unknown) => {
    if (typeof id !== 'string' || typeof fuente !== 'string') return null
    const proyecto = proyectos.get(id)
    if (!proyecto) return null
    const ruta = fuente === 'principal' ? proyecto.source.path : proyecto.medios?.find((m) => m.id === fuente && m.tipo === 'video')?.ruta
    return ruta ? picosDeArchivo(ruta, proyectos.carpeta(id)) : null
  })
  ipcMain.handle('proyecto:quitar-fondo', (_evento, id: unknown, medio: unknown) => {
    if (typeof id !== 'string' || typeof medio !== 'string') throw new Error('Datos inválidos.')
    return quitarFondo(id, medio)
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
    const abierto = proyectos.abrir(id)
    // Los videos de la biblioteca que aún no tienen su copia liviana (proyectos de antes) la reciben ahora, en segundo plano.
    if (abierto?.medios?.length) avisarProxysDeMedios(id)
    return abierto
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

  ipcMain.handle('proyecto:transcribir', (_evento, id: unknown) => transcribirProyecto(id))
  async function transcribirProyecto(id: unknown): Promise<TranscripcionResultado> {
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
  }

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
    const llave = (await ajustes.llaveSiPagaConLlave(id)) ?? (id === 'gemini' ? await ajustes.claveVoz() : undefined)
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
  // Si un agente suma o quita modelos, la interfaz se entera sola.
  alCambiarCatalogo((id, modelos) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('agentes:modelos-cambiaron', id, modelos)
  })
  // Al abrir y cada hora se pregunta a los agentes conectados qué modelos tienen (no gasta nada).
  const revisarModelos = async () => {
    try {
      const conectados = (await estadoAgentes()).filter((a) => a.instalado && a.conectado)
      for (const a of conectados) await catalogoAgente(a.id as AgenteId, a.id === 'claude' || a.id === 'opencode' || a.id === 'antigravity').catch(() => [])
    } catch {
      // Se intenta en la próxima vuelta.
    }
  }
  setTimeout(() => void revisarModelos(), 20_000)
  setInterval(() => void revisarModelos(), 60 * 60_000)
  // ===== Piezas animadas (HyperFrames) =====
  ipcMain.handle('piezas:lista', () => listarPiezas().map((p) => ({ ...p, muestra: p.muestra ? `recorte-media://piezas/${p.id}.mp4?v=${Date.now()}` : undefined })))
  /** Anima una pieza con sus datos al tamaño del video, la agrega a la biblioteca y devuelve el medio. */
  async function animarPieza(id: string, piezaId: string, valores: ValoresPieza, duracion: number) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const pieza = listarPiezas().find((x) => x.id === piezaId)
    if (!pieza) throw new Error('Esa pieza no existe.')
    const resueltos = valoresConMarca(pieza, valores, { primary: p.brand.primary, secondary: p.brand.secondary, logo: p.brand.logo })
    // Las imágenes: el logo de la marca, un medio de la biblioteca (por su id) o una ruta del equipo.
    const imagenes: Record<string, string> = {}
    for (const x of pieza.vars.filter((y) => y.tipo === 'imagen')) {
      const v = String(resueltos[x.id] ?? '')
      const medio = p.medios?.find((m) => m.id === v && m.tipo === 'imagen')
      const ruta = medio ? medio.ruta : v && existsSync(v) ? v : v && existsSync(join(proyectos.carpeta(id), v)) ? join(proyectos.carpeta(id), v) : ''
      imagenes[x.id] = ruta
      if (!ruta) resueltos[x.id] = ''
    }
    const ancho = p.source.width || 1080
    const alto = p.source.height || 1920
    const r = await renderizarPieza(proyectos.carpeta(id), piezaId, resueltos, imagenes, ancho, alto, duracion)
    const ruta = join(proyectos.carpeta(id), r.archivo)
    const ya = p.medios?.find((m) => m.ruta === ruta)
    if (ya) return { project: p, medio: ya.id, duracion: r.duracion }
    const hecho = await agregarRutas(id, [ruta])
    if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar la animación a la biblioteca.')
    return { project: hecho.project, medio: hecho.agregados[0], duracion: r.duracion }
  }
  /**
   * Dibuja un gráfico editable (src/shared/grafico.ts) a un PNG y lo deja en la biblioteca (el mismo diseño, el mismo
   * medio). Devuelve el medio y el ancho que le toca a la capa (en fracción del cuadro) para verse a su tamaño de diseño.
   */
  async function dibujarGraficoEn(id: string, crudo: unknown, letras?: LetraTL[]): Promise<{ project: Project; medio: string; ancho: number; grafico: Grafico }> {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const grafico = normalizarGrafico(crudo)
    if (!grafico) throw new Error('El gráfico no lleva nada que se vea (ni un texto ni una imagen).')
    const imagenes: Record<string, string> = {}
    for (const e of grafico.elementos) {
      if (e.tipo !== 'imagen') continue
      const medio = p.medios?.find((m) => m.id === e.medio && m.tipo === 'imagen')
      const ruta = e.medio === 'logo' ? p.brand.logo : medio?.ruta
      if (ruta && existsSync(ruta)) imagenes[e.medio] = ruta
    }
    const anchoVideo = p.source.width || 1080
    const escala = anchoVideo / ANCHO_DISENO
    const d = await dibujarGrafico(proyectos.carpeta(id), grafico, { letras: normalizarLetras(letras ?? p.timeline?.letras), imagenes, escala })
    const ancho = Math.min(1, Math.max(0.05, d.ancho / anchoVideo))
    const ya = p.medios?.find((m) => m.ruta === d.ruta)
    if (ya) return { project: p, medio: ya.id, ancho, grafico }
    const hecho = await agregarRutas(id, [d.ruta])
    if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar el gráfico a la biblioteca.')
    return { project: hecho.project, medio: hecho.agregados[0], ancho, grafico }
  }
  ipcMain.handle('grafico:dibujar', (_evento, id: unknown, grafico: unknown, letras: unknown) => {
    if (typeof id !== 'string') throw new Error('Datos inválidos.')
    return dibujarGraficoEn(id, grafico, Array.isArray(letras) ? (letras as LetraTL[]) : undefined)
  })
  /**
   * Anima los subtítulos con su estilo de HyperFrames: las frases salen de los textos de subtítulo (lo que se corrigió a
   * mano) y el render queda como un medio del proyecto. Devuelve la timeline con los subtítulos animados al día.
   */
  async function animarSubtitulos(id: string, tl: Timeline, onProgreso?: (pct: number, texto?: string) => void) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const s = tl.subtitulosHF
    if (!s) throw new Error('Elige primero un estilo de subtítulos animados.')
    const pieza = listarPiezas().find((x) => x.id === s.pieza && x.subtitulos)
    if (!pieza) throw new Error(`No existe el estilo de subtítulos «${s.pieza}».`)
    const { inicio, duracion, frases } = frasesSubtitulos(tl)
    if (!frases.length) throw new Error('No hay subtítulos: créalos desde la voz primero.')
    const valores = { ...valoresConMarca(pieza, s.valores, { primary: p.brand.primary, secondary: p.brand.secondary, logo: p.brand.logo }), frases: JSON.stringify(frases) }
    const r = await renderizarPieza(proyectos.carpeta(id), pieza.id, valores, {}, p.source.width || 1080, p.source.height || 1920, duracion, onProgreso)
    const ruta = join(proyectos.carpeta(id), r.archivo)
    let project = p
    let medio = p.medios?.find((m) => m.ruta === ruta)?.id
    if (!medio) {
      const hecho = await agregarRutas(id, [ruta])
      if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar los subtítulos a la biblioteca.')
      project = hecho.project
      medio = hecho.agregados[0]
    }
    const timeline: Timeline = { ...tl, subtitulosHF: { ...s, medio, huella: huellaSubtitulos(tl), inicio, duracion: r.duracion } }
    return { project, timeline }
  }
  /**
   * Separa del fondo a la persona de un clip (tal como se ve) y deja el recorte en la biblioteca: se pone encima del
   * mismo clip, en la pista más alta, y lo que quede entre los dos se ve detrás de ella.
   */
  async function recortarPersona(id: string, tl: Timeline, clipId: string) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const r = await recortarPersonaDeClip(p, proyectos.carpeta(id), tl, clipId, (pct, texto) => enviarProgreso({ id, fase: 'persona', pct, texto: texto ?? 'Separando a la persona' }))
    let project = p
    let medio = p.medios?.find((m) => m.ruta === r.archivo)?.id
    if (!medio) {
      const hecho = await agregarRutas(id, [r.archivo])
      if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar el recorte a la biblioteca.')
      project = hecho.project
      medio = hecho.agregados[0]
    }
    return { project, medio, inicio: r.inicio, duracion: r.duracion, clip: clipId }
  }
  /** Borra un objeto de un clip (tal como se ve) y deja el clip sin él en la biblioteca: va encima del mismo clip. */
  async function borrarObjeto(id: string, tl: Timeline, clipId: string, zona: ZonaObjeto, hasta?: ZonaObjeto) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const r = await borrarObjetoDeClip(p, proyectos.carpeta(id), tl, clipId, zona, hasta, (pct, texto) => enviarProgreso({ id, fase: 'persona', pct, texto: texto ?? 'Borrando el objeto' }))
    let project = p
    let medio = p.medios?.find((m) => m.ruta === r.archivo)?.id
    if (!medio) {
      const hecho = await agregarRutas(id, [r.archivo])
      if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar el clip a la biblioteca.')
      project = hecho.project
      medio = hecho.agregados[0]
    }
    return { project, medio, inicio: r.inicio, duracion: r.duracion, clip: clipId }
  }
  /** Recorta un objeto de un clip (rotoscopia por clic): el WebM con transparencia queda en la biblioteca y va encima del clip. */
  async function recortarObjeto(id: string, tl: Timeline, clipId: string, zona: ZonaObjeto) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const r = await recortarObjetoDeClip(p, proyectos.carpeta(id), tl, clipId, zona, (pct, texto) => enviarProgreso({ id, fase: 'persona', pct, texto: texto ?? 'Recortando el objeto' }))
    let project = p
    let medio = p.medios?.find((m) => m.ruta === r.archivo)?.id
    if (!medio) {
      const hecho = await agregarRutas(id, [r.archivo])
      if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar el recorte a la biblioteca.')
      project = hecho.project
      medio = hecho.agregados[0]
    }
    return { project, medio, inicio: r.inicio, duracion: r.duracion, clip: clipId }
  }
  /** Cambia el cielo de un clip (tal como se ve) y deja el clip con el cielo nuevo en la biblioteca: va encima del mismo clip. */
  async function cambiarCielo(id: string, tl: Timeline, clipId: string, cielo: string) {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const r = await cambiarCieloDeClip(p, proyectos.carpeta(id), tl, clipId, cielo, (pct, texto) => enviarProgreso({ id, fase: 'persona', pct, texto: texto ?? 'Cambiando el cielo' }))
    let project = p
    let medio = p.medios?.find((m) => m.ruta === r.archivo)?.id
    if (!medio) {
      const hecho = await agregarRutas(id, [r.archivo])
      if (!hecho.agregados.length) throw new Error(hecho.fallos[0] ?? 'No pude agregar el clip a la biblioteca.')
      project = hecho.project
      medio = hecho.agregados[0]
    }
    return { project, medio, inicio: r.inicio, duracion: r.duracion, clip: clipId }
  }
  /** Antes de exportar (o de que el agente mire): si los subtítulos animados quedaron atrás, se vuelven a animar. */
  async function subtitulosListos(id: string, tl: Timeline, onProgreso?: (pct: number, texto?: string) => void): Promise<Timeline> {
    if (!tl.subtitulosHF || subtitulosAlDia(tl) || !frasesSubtitulos(tl).frases.length) return tl
    const r = await animarSubtitulos(id, tl, onProgreso)
    // Que el editor también los tenga al día (si no lo cambiaron mientras tanto).
    const guardado = proyectos.abrir(id)
    if (guardado?.timeline && huellaSubtitulos(guardado.timeline) === huellaSubtitulos(tl)) {
      guardado.timeline = { ...guardado.timeline, subtitulosHF: r.timeline.subtitulosHF }
      proyectos.save(guardado)
      const { transcript: _t, ...ligero } = guardado
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: true })
    }
    return r.timeline
  }
  /**
   * Crea (o cambia) una animación con el agente conectado: trabaja en su carpeta como un diseñador de motion (escribe,
   * renderiza, mira y corrige) y la deja en «Mis animaciones». Tarda minutos; lo que va haciendo llega por 'piezas:progreso'.
   */
  let creandoPieza: AbortController | null = null
  const conMuestraUrl = (p: PiezaAnimada) => ({ ...p, muestra: p.muestra ? `recorte-media://piezas/${p.id}.mp4` : undefined })
  async function crearPieza(id: string, peticion: string, referencias: string[], base?: string): Promise<PiezaAnimada> {
    const p = proyectos.abrir(id)
    if (!p) throw new Error('El proyecto ya no existe.')
    const config = await configAgente()
    if (config.proveedor !== 'cli' || !config.comandoCli) {
      throw new Error('Para crear animaciones nuevas conecta un agente que trabaje en tu equipo (Claude Code, Codex, Kimi u OpenCode).')
    }
    if (creandoPieza) throw new Error('Ya hay una animación creándose: espera a que termine o párala.')
    creandoPieza = new AbortController()
    const avisar = (texto: string) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('piezas:progreso', { texto })
    }
    try {
      const pieza = await crearPiezaConAgente(
        {
          orden: config.comandoCli,
          peticion,
          marca: { nombre: p.brand.name || p.name, primary: p.brand.primary, secondary: p.brand.secondary, logo: p.brand.logo },
          referencias,
          ancho: p.source.width || 1080,
          alto: p.source.height || 1920,
          ...(base ? { base } : {})
        },
        avisar,
        creandoPieza.signal
      )
      return conMuestraUrl(pieza)
    } finally {
      creandoPieza = null
    }
  }
  ipcMain.handle('piezas:crear', async (_evento, id: unknown, peticion: unknown, referencias: unknown, base: unknown) => {
    if (typeof id !== 'string' || typeof peticion !== 'string' || !peticion.trim()) throw new Error('Dime qué animación quieres.')
    const refs = Array.isArray(referencias) ? referencias.filter((r): r is string => typeof r === 'string' && existsSync(r)) : []
    return crearPieza(id, peticion.trim().slice(0, 2000), refs, typeof base === 'string' ? base : undefined)
  })
  ipcMain.handle('piezas:parar', () => {
    creandoPieza?.abort()
    return true
  })
  ipcMain.handle('piezas:borrar', (_evento, piezaId: unknown) => typeof piezaId === 'string' && borrarPiezaPropia(piezaId))
  ipcMain.handle('piezas:animar', async (_evento, id: unknown, piezaId: unknown, valores: unknown, duracion: unknown) => {
    if (typeof id !== 'string' || typeof piezaId !== 'string' || !valores || typeof valores !== 'object' || typeof duracion !== 'number') throw new Error('Datos inválidos.')
    return animarPieza(id, piezaId, valores as ValoresPieza, duracion)
  })

  // Recorta el objeto de la primera zona «Recortar» del clip (su caja al empezar el clip).
  ipcMain.handle('objeto:recortar', async (_evento, id: unknown, timeline: unknown, clip: unknown) => {
    const p = typeof id === 'string' ? proyectos.abrir(id) : null
    if (!p || !timeline || typeof timeline !== 'object' || typeof clip !== 'string') throw new Error('Datos inválidos.')
    const tl = normalizarTimeline(timeline, p.source.duration, duracionesDeMedios(p.medios))
    const tr = tramos(tl).find((t) => t.clip.id === clip)
    const z = tr?.clip.zonas?.find((x) => x.modo === 'recortar')
    if (!tr || !z) throw new Error('Marca primero una zona en modo «Recortar» sobre el objeto.')
    const e = zonaEn(z, tr.clip.entrada)
    return recortarObjeto(p.id, tl, clip, { x: e.x, y: e.y, ancho: z.ancho, alto: z.alto })
  })
  ipcMain.handle('cielo:cambiar', async (_evento, id: unknown, timeline: unknown, clip: unknown, cielo: unknown) => {
    const p = typeof id === 'string' ? proyectos.abrir(id) : null
    if (!p || !timeline || typeof timeline !== 'object' || typeof clip !== 'string' || typeof cielo !== 'string' || !cielo.trim() || cielo.length > 400) throw new Error('Datos inválidos.')
    return cambiarCielo(p.id, normalizarTimeline(timeline, p.source.duration, duracionesDeMedios(p.medios)), clip, cielo.trim())
  })
  // Borra el objeto de la primera zona «Borrar» del clip (sigue su recorrido si la zona sigue algo que se mueve).
  ipcMain.handle('objeto:borrar', async (_evento, id: unknown, timeline: unknown, clip: unknown) => {
    const p = typeof id === 'string' ? proyectos.abrir(id) : null
    if (!p || !timeline || typeof timeline !== 'object' || typeof clip !== 'string') throw new Error('Datos inválidos.')
    const tl = normalizarTimeline(timeline, p.source.duration, duracionesDeMedios(p.medios))
    const tr = tramos(tl).find((t) => t.clip.id === clip)
    const z = tr?.clip.zonas?.find((x) => x.modo === 'borrar')
    if (!tr || !z) throw new Error('Marca primero una zona en modo «Borrar» sobre el objeto.')
    const largo = tr.fin - tr.inicio
    const pasos: number[][] = []
    for (let s = 0; s <= largo + 1e-6; s += z.recorrido?.length ? 0.1 : largo || 1) {
      const e = zonaEn(z, fuenteEnClip(tr.clip, Math.min(s, largo)))
      pasos.push([Math.round(s * 1000) / 1000, e.x, e.y, z.ancho, z.alto])
    }
    return borrarObjeto(p.id, tl, clip, { x: z.x, y: z.y, ancho: z.ancho, alto: z.alto, recorrido: pasos })
  })
  ipcMain.handle('persona:recortar', async (_evento, id: unknown, timeline: unknown, clip: unknown) => {
    const p = typeof id === 'string' ? proyectos.abrir(id) : null
    if (!p || !timeline || typeof timeline !== 'object' || typeof clip !== 'string') throw new Error('Datos inválidos.')
    return recortarPersona(p.id, normalizarTimeline(timeline, p.source.duration, duracionesDeMedios(p.medios)), clip)
  })
  ipcMain.handle('subtitulos:animar', async (_evento, id: unknown, timeline: unknown) => {
    const p = typeof id === 'string' ? proyectos.abrir(id) : null
    if (!p || !timeline || typeof timeline !== 'object') throw new Error('Datos inválidos.')
    const tl = normalizarTimeline(timeline, p.source.duration, duracionesDeMedios(p.medios))
    return animarSubtitulos(p.id, tl, (pct, texto) => enviarProgreso({ id: p.id, fase: 'subtitulos', pct, texto: texto ?? 'Animando los subtítulos' }))
  })

  // Las palabras de cada audio de voz con su segundo (para subtítulos que van con lo que se dice). Se guardan junto al
  // audio: si no cambió, no se vuelve a transcribir.
  ipcMain.handle('voz:palabras', async (_evento, id: unknown, archivos: unknown) => {
    const p = typeof id === 'string' ? proyectos.get(id) : null
    if (!p || !Array.isArray(archivos)) throw new Error('Datos inválidos.')
    const carpeta = proyectos.carpeta(p.id)
    const salida: Record<string, { texto: string; inicio: number; fin: number }[]> = {}
    for (const archivo of archivos.filter((a): a is string => typeof a === 'string' && /^media\/[\w.-]+$/.test(a)).slice(0, 200)) {
      const ruta = join(carpeta, archivo)
      if (!existsSync(ruta)) continue
      const guardado = `${ruta}.palabras.json`
      try {
        if (existsSync(guardado) && statSync(guardado).mtimeMs >= statSync(ruta).mtimeMs) {
          salida[archivo] = JSON.parse(readFileSync(guardado, 'utf8'))
          continue
        }
      } catch {
        // Se vuelve a transcribir.
      }
      const r = await transcribirArchivo(ruta, `${ruta}.transcripcion.json`, () => {})
      if (!r.ok || !r.transcript) continue
      const palabras = r.transcript.flatMap((s) => s.words.map((w) => ({ texto: w.text.trim(), inicio: Math.round(w.start * 1000) / 1000, fin: Math.round(w.end * 1000) / 1000 }))).filter((w) => w.texto)
      salida[archivo] = palabras
      try {
        writeFileSync(guardado, JSON.stringify(palabras))
        rmSync(`${ruta}.transcripcion.json`, { force: true })
      } catch {
        // Solo es un recuerdo.
      }
    }
    return salida
  })
  // Revisar el audio de la edición (palabras cortadas, cortes secos, respiraciones, ruido…) y arreglar una frase de voz.
  ipcMain.handle('audio:revisar', async (_evento, id: unknown, timeline: unknown) => {
    const p = typeof id === 'string' ? proyectos.get(id) : null
    if (!p || !timeline || typeof timeline !== 'object') throw new Error('Proyecto inválido.')
    return revisarAudio(p, timeline as Timeline, proyectos.carpeta(p.id))
  })
  ipcMain.handle('audio:arreglar-voz', async (_evento, id: unknown, archivo: unknown, accion: unknown, ventanas: unknown) => {
    const p = typeof id === 'string' ? proyectos.get(id) : null
    if (!p || typeof archivo !== 'string' || !/^media\/[\w.-]+$/.test(archivo) || (accion !== 'respiraciones' && accion !== 'limpiar')) throw new Error('Datos inválidos.')
    const v = Array.isArray(ventanas)
      ? ventanas.filter((w): w is [number, number] => Array.isArray(w) && w.length === 2 && w.every((n) => typeof n === 'number' && Number.isFinite(n))).slice(0, 500)
      : []
    return arreglarVoz(proyectos.carpeta(p.id), archivo, accion, v)
  })
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
  // Cuánto tardaría este equipo en un video del agente: el kit dibuja unos cuadros de prueba (unos segundos).
  ipcMain.handle('sistema:medir-render', async () => {
    const py = await buscarPython()
    const kit = rutaScriptPython(join('kit', 'kit.py'))
    if (!py || !existsSync(kit)) throw new Error('Hace falta Python para medirlo (instálalo justo arriba).')
    const cita = (x: string) => (/[\s"]/.test(x) ? `"${x}"` : x)
    const r = await ejecutar([[py.cmd, ...py.args].map(cita).join(' '), cita(kit), 'medir'], app.getPath('temp'), 180_000)
    const linea = r.salida.trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop()
    if (r.codigo !== 0 || !linea) throw new Error(r.salida.trim().split(/\r?\n/).pop() || 'No pude medirlo.')
    return JSON.parse(linea)
  })
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

  ipcMain.handle('proyecto:exportar-timeline', (_evento, id: unknown, timeline: unknown, opciones: unknown) => exportarProyecto(id, timeline, opciones))
  // Exportar el cuadro del cabezal como imagen (la cámara de Premiere): con todo lo de encima, a la medida del video.
  ipcMain.handle('proyecto:exportar-cuadro', async (_evento, id: unknown, timeline: unknown, segundo: unknown) => {
    if (typeof id !== 'string' || typeof segundo !== 'number' || !Number.isFinite(segundo)) return { ok: false, error: 'Datos inválidos.' }
    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'El proyecto ya no existe.' }
    const valida = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios))
    const tmp = join(proyectos.carpeta(id), 'cuadro-tmp')
    rmSync(tmp, { recursive: true, force: true })
    try {
      const fps = proyecto.source.fps > 0 ? proyecto.source.fps : 30
      const r = await exportarTimeline(proyecto, valida, proyectos.carpeta(id), { formato: 'original', subtitulos: false, desde: Math.max(0, segundo), hasta: segundo + Math.max(0.12, 3 / fps), calidad: 'alta' }, () => {}, tmp)
      if (!r.ok || !r.output) return { ok: false, error: r.error ?? 'No pude sacar el cuadro.' }
      const destino = carpetaDelProyecto(await carpetaVideos(), proyecto.name)
      mkdirSync(destino, { recursive: true })
      const t = Math.max(0, segundo)
      const nombre = `cuadro-${String(Math.floor(t / 60)).padStart(2, '0')}m${(t % 60).toFixed(2).padStart(5, '0').replace('.', 's')}.png`
      const salida = rutaLibre(destino, nombreArchivo(nombre))
      const e = await ejecutar([`"${resolverBinario('ffmpeg') ?? 'ffmpeg'}"`, '-y', '-v', 'error', '-i', `"${r.output}"`, '-frames:v', '1', `"${salida}"`], destino, 60_000)
      if (e.codigo !== 0 || !existsSync(salida)) return { ok: false, error: 'No pude guardar la imagen.' }
      return { ok: true, archivo: salida }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
  // La portada (como la de CapCut): el cuadro de un momento con todo lo de encima, y la imagen ya compuesta.
  ipcMain.handle('portada:cuadro', async (_evento, id: unknown, timeline: unknown, segundo: unknown) => {
    if (typeof id !== 'string' || typeof segundo !== 'number' || !Number.isFinite(segundo)) return { ok: false, error: 'Datos inválidos.' }
    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'El proyecto ya no existe.' }
    const valida = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios))
    const carpeta = proyectos.carpeta(id)
    // Cada pedido en su carpeta: al mover el momento, el anterior aún puede estar trabajando.
    const tmp = join(carpeta, `portada-tmp-${randomUUID().slice(0, 8)}`)
    try {
      const fps = proyecto.source.fps > 0 ? proyecto.source.fps : 30
      const t = Math.max(0, Math.min(segundo, duracionTimeline(valida) - 1 / fps))
      const r = await exportarTimeline(proyecto, valida, carpeta, { formato: 'original', subtitulos: false, desde: t, hasta: t + Math.max(0.12, 3 / fps), calidad: 'alta' }, () => {}, tmp)
      if (!r.ok || !r.output) return { ok: false, error: r.error ?? 'No pude sacar ese cuadro.' }
      const dir = join(carpeta, 'portada')
      mkdirSync(dir, { recursive: true })
      for (const viejo of readdirSync(dir)) if (viejo.startsWith('fondo-')) rmSync(join(dir, viejo), { force: true })
      const archivo = `portada/fondo-${Date.now().toString(36)}.png`
      const e = await ejecutar(
        [`"${resolverBinario('ffmpeg') ?? 'ffmpeg'}"`, '-y', '-v', 'error', '-i', `"${r.output}"`, '-frames:v', '1', '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', `"${join(carpeta, archivo)}"`],
        carpeta,
        60_000
      )
      if (e.codigo !== 0 || !existsSync(join(carpeta, archivo))) return { ok: false, error: 'No pude sacar ese cuadro.' }
      return { ok: true, archivo }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
  // Una imagen de una carpeta del usuario (como «Subir» de CapCut): se copia a `portada/` del proyecto, sin pasar por
  // la biblioteca.
  ipcMain.handle('portada:importar', async (_evento, id: unknown) => {
    if (typeof id !== 'string') return { ok: false, error: 'Datos inválidos.' }
    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'El proyecto ya no existe.' }
    // En las pruebas (RECORTE_PRUEBA_IMAGEN_PORTADA) no hay quien elija en el diálogo.
    const prueba = process.env.RECORTE_PRUEBA_IMAGEN_PORTADA
    const r = prueba
      ? { canceled: false, filePaths: [prueba] }
      : await dialog.showOpenDialog({
          title: 'La imagen para la portada',
          properties: ['openFile'],
          filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
    const origen = r.filePaths[0]
    if (r.canceled || !origen) return { ok: false }
    const ext = extname(origen).toLowerCase().replace('.jpeg', '.jpg')
    if (!['.png', '.jpg', '.webp'].includes(ext)) return { ok: false, error: 'Elige una imagen PNG, JPG o WebP.' }
    const dir = join(proyectos.carpeta(id), 'portada')
    mkdirSync(dir, { recursive: true })
    const archivo = `portada/foto-${createHash('sha1').update(readFileSync(origen)).digest('hex').slice(0, 12)}${ext}`
    copyFileSync(origen, join(proyectos.carpeta(id), archivo))
    return { ok: true, archivo, nombre: basename(origen) }
  })
  // La tira de cuadros para elegir el momento (como la de CapCut): cuadros pequeños del material, rápidos, a lo largo
  // del video. El cuadro final (con todo lo de encima) lo hace «portada:cuadro» al soltar.
  ipcMain.handle('portada:tira', async (_evento, id: unknown, timeline: unknown, cuantos: unknown) => {
    if (typeof id !== 'string') return { ok: false, cuadros: [] }
    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, cuadros: [] }
    const valida = timelineActiva(normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios)))
    const total = duracionTimeline(valida)
    const n = Math.max(4, Math.min(24, typeof cuantos === 'number' ? Math.round(cuantos) : 12))
    const carpeta = proyectos.carpeta(id)
    const dir = join(carpeta, 'portada', 'tira')
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const sello = Date.now().toString(36)
    const cuadros: { t: number; archivo: string }[] = []
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * total
      const u = ubicar(valida, t)
      if (!u) continue
      const ruta = u.clip.fuente === FUENTE_PRINCIPAL ? proyecto.source.path : proyecto.medios?.find((m) => m.id === u.clip.fuente)?.ruta
      if (!ruta || !existsSync(ruta)) continue
      const esImagen = proyecto.medios?.find((m) => m.id === u.clip.fuente)?.tipo === 'imagen'
      const archivo = `portada/tira/${sello}-${i}.jpg`
      const e = await ejecutar(
        [`"${resolverBinario('ffmpeg') ?? 'ffmpeg'}"`, '-y', '-v', 'error', ...(esImagen ? [] : ['-ss', u.tFuente.toFixed(3)]), '-i', `"${ruta}"`, '-frames:v', '1', '-vf', 'scale=-2:200', '-q:v', '4', `"${join(carpeta, archivo)}"`],
        carpeta,
        30_000
      )
      if (e.codigo === 0 && existsSync(join(carpeta, archivo))) cuadros.push({ t, archivo })
    }
    return { ok: true, cuadros }
  })
  ipcMain.handle('portada:guardar', (_evento, id: unknown, datos: unknown) => {
    const prefijo = 'data:image/png;base64,'
    if (typeof id !== 'string' || typeof datos !== 'string' || !datos.startsWith(prefijo) || datos.length > 60_000_000) return { ok: false, error: 'Datos inválidos.' }
    const proyecto = proyectos.abrir(id)
    if (!proyecto) return { ok: false, error: 'El proyecto ya no existe.' }
    const png = Buffer.from(datos.slice(prefijo.length), 'base64')
    const dir = join(proyectos.carpeta(id), 'portada')
    mkdirSync(dir, { recursive: true })
    const archivo = `portada/portada-${createHash('sha1').update(png).digest('hex').slice(0, 12)}.png`
    writeFileSync(join(proyectos.carpeta(id), archivo), png)
    return { ok: true, archivo }
  })
  async function exportarProyecto(id: unknown, timeline: unknown, opciones: unknown): Promise<RenderResultado> {
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
        subtitulos: crudas.subtitulos === true,
        ...(typeof crudas.desde === 'number' && typeof crudas.hasta === 'number' && Number.isFinite(crudas.desde) && Number.isFinite(crudas.hasta) && crudas.hasta > crudas.desde
          ? { desde: Math.max(0, crudas.desde), hasta: crudas.hasta }
          : {}),
        ...(crudas.resolucion === '1080' || crudas.resolucion === '720' ? { resolucion: crudas.resolucion } : {}),
        ...(crudas.calidad === 'alta' || crudas.calidad === 'ligera' ? { calidad: crudas.calidad } : {}),
        ...(crudas.normalizar === true ? { normalizar: true } : {}),
        ...(crudas.soloAudio === 'wav' || crudas.soloAudio === 'mp3' ? { soloAudio: crudas.soloAudio } : {})
      }
      // Se exporta la timeline que ve el usuario, validada contra el material.
      let valida = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios))

      enRender.add(id)
      try {
        let resultado: RenderResultado
        try {
          // Los subtítulos animados, al día con lo corregido a mano (HyperFrames los vuelve a dibujar).
          valida = await subtitulosListos(id, valida, (pct, texto) => enviarProgreso({ id, fase: 'exportar', pct: pct * 0.3, texto: texto ?? 'Animando los subtítulos' }))
          resultado = await exportarTimeline(
            proyectos.abrir(id) ?? proyecto,
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
        // Solo el sonido no es «el último video» (ese sigue siendo el MP4 anterior).
        if (resultado.ok && resultado.output && !elegidas.soloAudio) {
          actual.timelineSalida = resultado.output
          proyectos.save(actual)
        }
        return { ...resultado, project: actual }
      } finally {
        enRender.delete(id)
      }
  }

  ipcMain.handle(
    'agente:chat',
    async (_evento, id: unknown, timeline: unknown, historial: unknown, peticion: unknown, referencia: unknown, ajustesChat: unknown) => {
      if (typeof id !== 'string' || typeof peticion !== 'string' || !peticion.trim()) {
        return { ok: false, mensaje: '', operaciones: [], error: 'Mensaje vacío.' }
      }
      const proyecto = proyectos.abrir(id)
      if (!proyecto) return { ok: false, mensaje: '', operaciones: [], error: 'El proyecto ya no existe.' }
      // Lo elegido en la caja del chat (lo que viene con el mensaje; si no, lo guardado en el proyecto).
      const opciones = ajustesDeChat(ajustesChat) ?? proyecto.chatAjustes ?? {}
      // Quién edita: el agente y modelo elegidos en la caja, si están conectados; si no, el de siempre.
      const config = opciones.tareas?.video
        ? { ...(await ajustes.cargar()), ...(await configParaTarea(opciones.tareas.video)) }
        : await ajustes.cargar()
      const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(config.baseUrl)
      const clave = config.proveedor === 'api' ? ((await ajustes.clave()) ?? (esLocal ? 'local' : null)) : null
      const mensajes = Array.isArray(historial) ? (historial as MensajeChat[]).filter((m) => m && typeof m.texto === 'string') : []
      const senal = empezarTrabajo(`chat:${id}`)
      try {
        const tlActual = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios))
        // Con un agente que trabaja con herramientas (Claude Code) y el MCP de Recorte activo, el chat edita mirando y
        // comprobando, a través del MCP. Con una llave de API (sin herramientas), como siempre: texto → operaciones.
        const agentico = config.proveedor === 'cli' ? comandoAgentico(config.comandoCli) : null
        const estadoMcp = mcp.estado()
        if (agentico && AGENTES_CHAT_HERRAMIENTAS.includes(agentico.agente) && estadoMcp.activo) {
          // El agente parte de lo que el usuario ve ahora (puede haber editado a mano sin que se guardara).
          const enDisco = proyectos.get(id)
          if (enDisco) {
            enDisco.timeline = tlActual
            delete enDisco.timelinePendiente
            proyectos.save(enDisco)
          }
          const conHerramientas = await turnoChatHerramientas({
            agente: agentico.agente,
            proyecto: enDisco ?? proyecto,
            historial: mensajes,
            peticion: peticion.slice(0, 4000),
            referencia: typeof referencia === 'string' ? referencia.slice(0, 500) : dondeEsta(id),
            gustos: bloqueGustos(),
            base: agentico.orden,
            mcp: { url: estadoMcp.url, contrasena: estadoMcp.contrasena },
            carpeta: join(app.getPath('userData'), 'chat-agente', id),
            senal,
            permisos: permisosDelChat(opciones),
            onPaso: (texto) => _evento.sender.send('agente:chat-paso', { id, texto })
          })
          // Si su versión no vio las herramientas de Recorte, sigue como chat de texto (abajo).
          if (!conHerramientas.sinHerramientas) return conHerramientas
        }
        const turno = await turnoAgente(
          proyecto,
          normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios)),
          mensajes,
          peticion.slice(0, 4000),
          typeof referencia === 'string' ? referencia.slice(0, 500) : undefined,
          config,
          clave,
          senal,
          bloqueGustos(),
          await tomasDelProyecto(proyecto, proyectos.carpeta(id)).catch(() => '')
        )
        // La voz que pidió cambiar o añadir se genera aquí, antes de aplicar nada: así la
        // interfaz recibe las frases con su audio listo y todo entra en un solo paso de deshacer.
        if (turno.ok && turno.operaciones.some((o) => o.op === 'cambiar_voz' || o.op === 'anadir_voz')) {
          const fallosVoz = await generarVocesDelChat(id, normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios(proyecto.medios)), turno.operaciones)
          if (fallosVoz.length) turno.mensaje = `${turno.mensaje}\n\nNo pude generar la voz: ${fallosVoz.join(' ')}`
        }
        // Las animaciones NUEVAS que pidió: el agente las crea (minutos) y pasan a ponerse como cualquier pieza.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'crear_pieza') continue
            try {
              const nueva = await crearPieza(id, o.peticion, [])
              Object.assign(o, { op: 'anadir_pieza', pieza: nueva.id })
            } catch (e) {
              turno.mensaje = `${turno.mensaje}\n\nNo pude crear la animación: ${e instanceof Error ? e.message : String(e)}`
            }
          }
        }
        // La persona que pidió separar del fondo: el recorte se hace aquí y queda en la biblioteca antes de aplicar.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'recortar_persona') continue
            try {
              const base = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios((proyectos.abrir(id) ?? proyecto).medios))
              const clip = base.clips[Math.round(o.clip) - 1]
              if (!clip) continue
              const r = await recortarPersona(id, base, clip.id)
              o.medio = r.medio
              o.clipId = clip.id
              o.duracionReal = r.duracion
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            } catch (e) {
              turno.mensaje = `${turno.mensaje}

No pude separar a la persona: ${e instanceof Error ? e.message : String(e)}`
            }
          }
        }
        // El objeto que pidió recortar: se hace aquí (SAM 2) y el recorte queda en la biblioteca antes de aplicar.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'rotoscopiar') continue
            try {
              const base = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios((proyectos.abrir(id) ?? proyecto).medios))
              const clip = base.clips[Math.round(o.clip) - 1]
              if (!clip) continue
              const r = await recortarObjeto(id, base, clip.id, { x: o.x, y: o.y, ancho: o.ancho, alto: o.alto })
              o.medio = r.medio
              o.clipId = clip.id
              o.duracionReal = r.duracion
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            } catch (e) {
              turno.mensaje = `${turno.mensaje}\n\nNo pude recortar el objeto: ${e instanceof Error ? e.message : String(e)}`
            }
          }
        }
        // El cielo que pidió cambiar: se hace aquí y el clip con el cielo nuevo queda en la biblioteca antes de aplicar.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'cambiar_cielo') continue
            try {
              const base = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios((proyectos.abrir(id) ?? proyecto).medios))
              const clip = base.clips[Math.round(o.clip) - 1]
              if (!clip) continue
              const r = await cambiarCielo(id, base, clip.id, o.cielo)
              o.medio = r.medio
              o.clipId = clip.id
              o.duracionReal = r.duracion
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            } catch (e) {
              turno.mensaje = `${turno.mensaje}\n\nNo pude cambiar el cielo: ${e instanceof Error ? e.message : String(e)}`
            }
          }
        }
        // El objeto que pidió borrar: se rellena aquí y el clip sin él queda en la biblioteca antes de aplicar.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'borrar_objeto') continue
            try {
              const base = normalizarTimeline(timeline, proyecto.source.duration, duracionesDeMedios((proyectos.abrir(id) ?? proyecto).medios))
              const clip = base.clips[Math.round(o.clip) - 1]
              if (!clip) continue
              const zona = { x: o.x, y: o.y, ancho: o.ancho, alto: o.alto }
              const r = await borrarObjeto(id, base, clip.id, zona, o.hasta_x !== undefined && o.hasta_y !== undefined ? { ...zona, x: o.hasta_x, y: o.hasta_y } : undefined)
              o.medio = r.medio
              o.clipId = clip.id
              o.duracionReal = r.duracion
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            } catch (e) {
              turno.mensaje = `${turno.mensaje}

No pude borrar el objeto: ${e instanceof Error ? e.message : String(e)}`
            }
          }
        }
        // Las piezas animadas que pidió: se animan aquí (con la marca) y quedan en la biblioteca antes de aplicar.
        if (turno.ok) {
          const fallosPieza: string[] = []
          for (const o of turno.operaciones) {
            if (o.op !== 'anadir_pieza') continue
            try {
              const r = await animarPieza(id, o.pieza, o.valores ?? {}, o.duracion ?? listarPiezas().find((x) => x.id === o.pieza)?.duracion.defecto ?? 3)
              o.medio = r.medio
              o.duracionReal = r.duracion
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            } catch (e) {
              fallosPieza.push(`${o.pieza}: ${e instanceof Error ? e.message : String(e)}`)
            }
          }
          if (fallosPieza.length) turno.mensaje = `${turno.mensaje}\n\nNo pude animar: ${fallosPieza.join(' ')}`
        }
        // Los gráficos editables que pone o cambia: se dibujan aquí y quedan en la biblioteca antes de aplicar.
        if (turno.ok && turno.operaciones.some((o) => o.op === 'anadir_grafico' || o.op === 'cambiar_grafico')) {
          const actual = proyectos.abrir(id) ?? proyecto
          const base = normalizarTimeline(timeline, actual.source.duration, duracionesDeMedios(actual.medios))
          const fallosGrafico = await prepararGraficos(
            turno.operaciones,
            base,
            async (g) => {
              const r = await dibujarGraficoEn(id, g, base.letras)
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
              return r
            },
            (m) => proyectos.abrir(id)?.medios?.find((x) => x.id === m)?.ancho
          )
          if (fallosGrafico.length) turno.mensaje = `${turno.mensaje}\n\nNo pude dibujar un gráfico: ${fallosGrafico.join(' ')}`
        }
        // Los subtítulos animados: si quedan con estilo y no al día (lo eligió o corrigió textos), se animan aquí y el
        // render viaja en la operación (así entran al día en el mismo paso de deshacer).
        if (turno.ok && turno.operaciones.length) {
          try {
            const actual = proyectos.abrir(id) ?? proyecto
            const base = normalizarTimeline(timeline, actual.source.duration, duracionesDeMedios(actual.medios))
            const despues = aplicarOperaciones(base, turno.operaciones, { duracionFuente: actual.source.duration, transcript: actual.transcript, medios: duracionesDeMedios(actual.medios) }).timeline
            if (despues.subtitulosHF && !subtitulosAlDia(despues) && frasesSubtitulos(despues).frases.length) {
              const r = await animarSubtitulos(id, despues)
              turno.operaciones.push({ op: 'subtitulos_animados', estilo: despues.subtitulosHF.pieza, valores: {}, render: r.timeline.subtitulosHF })
              const { transcript: _t, ...ligero } = r.project
              for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien: 'recorte', conTimeline: false })
            }
          } catch (e) {
            turno.mensaje = `${turno.mensaje}

No pude animar los subtítulos (se animan al exportar): ${e instanceof Error ? e.message : String(e)}`
          }
        }
        // Los efectos de sonido que pidió: su audio se copia al proyecto antes de aplicar.
        if (turno.ok) {
          for (const o of turno.operaciones) {
            if (o.op !== 'anadir_sonido') continue
            const audio = await copiarSonidoIncluido(id, o.sonido)
            if (audio) o.audio = audio
          }
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
  // La vista previa renderizada del monitor (ver main/vistaprevia.ts).
  const vistaPrevia = new VistaPrevia(proyectos, (id, clave) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('vista:lista', { id, clave })
  })
  ipcMain.handle('vista:existentes', (_e, id: string, claves: string[]) => vistaPrevia.existentes(id, Array.isArray(claves) ? claves : []))
  ipcMain.handle('vista:preparar', (_e, id: string, timeline: Timeline, desde: number) => timeline && Array.isArray(timeline.clips) ? vistaPrevia.preparar(id, timeline, Number(desde) || 0) : undefined)
  ipcMain.handle('vista:pausar', (_e, id: string) => vistaPrevia.pausar(id))
  ipcMain.handle('vista:cuadro', (_e, id: string, timeline: Timeline, t: number) =>
    timeline && Array.isArray(timeline.clips) && Number.isFinite(t) ? vistaPrevia.cuadro(id, timeline, Math.max(0, t)) : null
  )
  ipcMain.handle('vista:salida', (_e, id: string, timeline: Timeline, indice: number) =>
    typeof id === 'string' && timeline && Array.isArray(timeline.clips) && Number.isInteger(indice) && indice > 0 ? vistaPrevia.cuadroSalida(id, timeline, indice) : null
  )
  ipcMain.handle('actualizacion:estado', () => estadoActualizacion())
  ipcMain.handle('actualizacion:buscar', () => buscarActualizacion())
  ipcMain.handle('actualizacion:instalar', () => instalarActualizacion())

  // Las habilidades del agente (ver habilidades.ts): verlas, añadir las suyas y olvidar una lección.
  const vistaHabilidades = () =>
    habilidadesConLecciones().map((h) => ({ id: h.id, nombre: h.nombre, cuando: h.cuando, origen: h.origen, aprendido: h.aprendido }))
  ipcMain.handle('habilidades:ver', () => vistaHabilidades())
  ipcMain.handle('habilidades:anadir', async (_evento, carpeta: unknown) => {
    const eleccion = await dialog.showOpenDialog(
      carpeta
        ? { title: 'Elige la carpeta de la habilidad', properties: ['openDirectory'] }
        : { title: 'Elige la habilidad (.md)', properties: ['openFile'], filters: [{ name: 'Habilidad', extensions: ['md'] }] }
    )
    const ruta = eleccion.filePaths[0]
    if (eleccion.canceled || !ruta) return null
    const r = anadirHabilidad(ruta)
    return r.id ? { ok: true, id: r.id } : { ok: false, error: r.error }
  })
  ipcMain.handle('habilidades:olvidar-leccion', (_evento, id: unknown, leccion: unknown) => {
    if (typeof id === 'string' && typeof leccion === 'string') olvidarLeccion(id, leccion)
    return vistaHabilidades()
  })
  ipcMain.handle('habilidades:abrir-carpeta', async () => {
    mkdirSync(carpetaHabilidadesUsuario(), { recursive: true })
    await shell.openPath(carpetaHabilidadesUsuario())
  })

  // La sección «Estilos» (ver estiloscatalogo.ts): el catálogo, añadir o quitar uno y crear los suyos.
  const vistaEstilos = () => catalogoEstilos((id) => leerLecciones(id).length)
  const esId = (x: unknown): x is string => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{1,48}$/.test(x)
  ipcMain.handle('estilos:catalogo', () => vistaEstilos())
  ipcMain.handle('estilos:anadir', (_evento, id: unknown) => {
    if (esId(id)) anadirEstilo(id)
    return vistaEstilos()
  })
  ipcMain.handle('estilos:quitar', (_evento, id: unknown) => {
    if (esId(id)) quitarEstilo(id)
    return vistaEstilos()
  })
  ipcMain.handle('estilos:crear', (_evento, datos: unknown) => {
    const d = (datos ?? {}) as { nombre?: unknown; descripcion?: unknown; grupo?: unknown }
    const r = crearEstilo({
      nombre: typeof d.nombre === 'string' ? d.nombre : '',
      descripcion: typeof d.descripcion === 'string' ? d.descripcion : '',
      grupo: typeof d.grupo === 'string' ? d.grupo : undefined
    })
    return { ...r, catalogo: vistaEstilos() }
  })
  ipcMain.handle('estilos:borrar', (_evento, id: unknown) => {
    if (esId(id)) borrarEstilo(id)
    return vistaEstilos()
  })

  // El criterio que Recorte aprende del usuario (ver shared/gustos.ts).
  ipcMain.handle('gustos:ver', () => cargarGustos())
  ipcMain.handle('estilos-texto:ver', () => leerEstilosTexto())
  ipcMain.handle('estilos-texto:guardar', (_evento, nombre: unknown, pinta: unknown) => guardarEstiloTexto(typeof nombre === 'string' ? nombre : 'Mi estilo', pinta))
  ipcMain.handle('estilos-texto:borrar', (_evento, id: unknown) => (typeof id === 'string' ? borrarEstiloTexto(id) : leerEstilosTexto()))
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

  // Un LUT 3D (.cube) para el color de un clip: se comprueba que se puede leer y se copia a media/luts/ del proyecto.
  ipcMain.handle('proyecto:importar-lut', async (_evento, id: unknown) => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }
    if (!proyectos.get(id)) return { ok: false, error: 'El proyecto ya no existe.' }
    const eleccion = await dialog.showOpenDialog({ title: 'Elige el LUT', properties: ['openFile'], filters: [{ name: 'LUT 3D', extensions: ['cube'] }] })
    const origen = eleccion.filePaths[0]
    if (eleccion.canceled || !origen) return null
    try {
      leerCubeLut(readFileSync(origen, 'utf8'))
    } catch (error) {
      return { ok: false, error: `Ese archivo no es un LUT que pueda usar: ${error instanceof Error ? error.message : String(error)}` }
    }
    const base = basename(origen, extname(origen)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lut'
    const nombreArchivo = `${base}-${Date.now().toString(36)}.cube`
    const carpetaLuts = join(proyectos.carpeta(id), 'media', 'luts')
    mkdirSync(carpetaLuts, { recursive: true })
    copyFileSync(origen, join(carpetaLuts, nombreArchivo))
    return { ok: true, lut: { archivo: `media/luts/${nombreArchivo}`, nombre: basename(origen, extname(origen)), intensidad: 1 } }
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

  /** Copia un efecto de sonido incluido a `media/` del proyecto. Sin audio, devuelve null. */
  async function copiarSonidoIncluido(id: string, sonido: string): Promise<{ archivo: string; duracion: number; nombre: string } | null> {
    const s = SONIDOS_INCLUIDOS.find((x) => x.id === sonido)
    const origen = s ? rutaScriptPython(join('sonidos', `${s.id}.wav`)) : ''
    if (!s || !existsSync(origen)) return null
    try {
      const media = join(proyectos.carpeta(id), 'media')
      mkdirSync(media, { recursive: true })
      const nombre = `sonido-${s.id}-${randomUUID().slice(0, 8)}.wav`
      copyFileSync(origen, join(media, nombre))
      return { archivo: `media/${nombre}`, duracion: Math.round((await duracionMedio(join(media, nombre))) * 100) / 100 || 0.5, nombre: s.nombre }
    } catch {
      return null
    }
  }

  // ===== Recorte por MCP: que un agente de fuera vea y edite los proyectos =====
  /** Trae la ventana al frente y le pide a la interfaz que abra algo (un proyecto o una creación). */
  const alFrente = (canal: string, id: string) => {
    const w = BrowserWindow.getAllWindows()[0]
    if (!w) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
    w.webContents.send(canal, id)
  }
  /**
   * Un turno del agente de una creación pedido por MCP: empieza ya y sigue solo (el agente de fuera
   * pregunta cómo va con ver_creacion). La interfaz lo ve trabajando por sus avisos de progreso.
   */
  const enSegundoPlano = (id: string, texto: string | undefined, turno: (c: Creacion, senal: AbortSignal) => Promise<void>) => {
    if (creandoAhora.has(id)) throw new Error('El agente ya está trabajando en este video: espera a que acabe (mira ver_creacion) o páralo.')
    if (!creaciones.get(id)) throw new Error('Esa creación ya no existe.')
    ultimoProgreso.delete(id)
    void conCreacion(id, async (c, senal) => {
      if (texto) c.mensajes.push(mensaje('usuario', texto.slice(0, 2000)))
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.02, texto: 'Empezando' })
      await turno(c, senal)
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 1, texto: 'Listo' })
      return creaciones.guardar(c)
    }).catch(() => {})
  }
  // El kit del agente pide aquí el dibujo de sus gráficos editables (no tiene Chromium); solo dentro de las creaciones.
  void servirGraficos(join(app.getPath('userData'), 'creaciones'), (g, o) => dibujarGrafico(o.base, g, { imagenes: {}, escala: o.escala, base: o.base, salida: o.salida })).catch(() => {})
  const mcp = iniciarMcpRecorte({
    proyectos,
    uso: () => usoAhora(),
    listarCreaciones: () => creaciones.listar(),
    ingerir: (ruta) => ingerir(ruta),
    agregarRutas,
    transcribir: (id) => transcribirProyecto(id),
    exportar: (id, timeline, opciones) => exportarProyecto(id, timeline, opciones),
    copiarSonido: copiarSonidoIncluido,
    donde: (id) => dondeEsta(id),
    avisarCambio: (proyecto, quien, conTimeline) => {
      const { transcript: _t, ...ligero } = proyecto
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('proyecto:externo', { proyecto: ligero, quien, conTimeline: Boolean(conTimeline) })
    },
    abrirEnApp: (id) => alFrente('proyecto:abrir', id),
    quitarFondo: (id, medio) => quitarFondo(id, medio),
    piezas: { listar: listarPiezas, animar: animarPieza },
    dibujarGrafico: (id, g, letras) => dibujarGraficoEn(id, g, letras),
    subtitulos: (id, tl) => subtitulosListos(id, tl),
    persona: async (id, tl, clip) => {
      const r = await recortarPersona(id, tl, clip)
      return { medio: r.medio, duracion: r.duracion }
    },
    recortarObjeto: async (id, tl, clip, zona) => {
      const r = await recortarObjeto(id, tl, clip, zona)
      return { medio: r.medio, duracion: r.duracion }
    },
    cambiarCielo: async (id, tl, clip, cielo) => {
      const r = await cambiarCielo(id, tl, clip, cielo)
      return { medio: r.medio, duracion: r.duracion }
    },
    borrarObjeto: async (id, tl, clip, zona, hasta) => {
      const r = await borrarObjeto(id, tl, clip, zona, hasta)
      return { medio: r.medio, duracion: r.duracion }
    },
    animarImagen: (id, medio, tipo) => animarImagen(id, medio, tipo),
    // ===== Crear por MCP (6.3) =====
    creaciones: {
      nueva: (p) => creaciones.nueva(p),
      get: (id) => creaciones.get(id),
      carpeta: (id) => creaciones.carpeta(id),
      guardar: (c) => {
        creaciones.guardar(c)
      }
    },
    trabajando: (id) => (creandoAhora.has(id) ? { desde: inicioCreacion.get(id) ?? Date.now(), ...ultimoProgreso.get(id) } : null),
    charlar: (id, texto) => enSegundoPlano(id, texto, (c, senal) => charlaConAgente(c, senal)),
    hacer: (id, texto) => enSegundoPlano(id, texto, (c, senal) => hacerConAgente(c, senal, texto)),
    seguir: (id) => {
      if (creandoAhora.has(id)) throw new Error('El agente ya está trabajando en este video.')
      void seguirCreacion(id).catch(() => {})
    },
    parar: (id) => pararTrabajo(`creacion:${id}`),
    alEditor: (id) => creacionAlEditor(id),
    abrirCreacionEnApp: (id) => alFrente('creacion:abrir-externa', id),
    voz: {
      conectada: async () => Boolean((await ajustes.claveVoz()) || estadoVozGoogle().correo),
      porDefecto: async () => (await ajustes.estadoVoz()).vozGemini ?? 'Kore',
      generar: (texto, voz, salida) => generarFraseVoz(texto, voz, salida),
      carpetaMuestras,
      duracion: (ruta) => duracionMedio(ruta),
      delChat: (id, tl, ops) => generarVocesDelChat(id, tl, ops)
    },
    flow: {
      conectado: () => estadoFlow().cuentas.length > 0,
      derechos: () => estadoFlow().derechos === true,
      generar: (pedido, carpeta) => pedirFlow(pedido, carpeta)
    }
  })
  ipcMain.handle('mcp:estado', () => mcp.estado())
  ipcMain.handle('mcp:conectar-claude', () => mcp.conectarClaude())
  ipcMain.handle('mcp:nueva-contrasena', () => mcp.nuevaContrasena())

  // Un efecto de sonido para la pista de sonidos: uno de los incluidos o uno del equipo.
  ipcMain.handle('proyecto:poner-sonido', async (_evento, id: unknown, incluido: unknown) => {
    if (typeof id !== 'string') return { ok: false, error: 'Proyecto inválido.' }
    if (!proyectos.get(id)) return { ok: false, error: 'El proyecto ya no existe.' }
    let origen: string
    let nombre: string
    if (typeof incluido === 'string') {
      const s = SONIDOS_INCLUIDOS.find((x) => x.id === incluido)
      if (!s) return { ok: false, error: 'Ese sonido no existe.' }
      origen = rutaScriptPython(join('sonidos', `${s.id}.wav`))
      nombre = s.nombre
    } else {
      const eleccion = await dialog.showOpenDialog({
        title: 'Elige el efecto de sonido',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'] }]
      })
      if (eleccion.canceled || !eleccion.filePaths[0]) return null
      origen = eleccion.filePaths[0]
      nombre = basename(origen, extname(origen)).slice(0, 60)
    }
    try {
      const duracion = await duracionMedio(origen)
      if (!(duracion > 0)) return { ok: false, error: 'No pude leer ese audio.' }
      const base = basename(origen, extname(origen))
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'sonido'
      const nombreArchivo = `sonido-${base}-${Date.now().toString(36)}${extname(origen).toLowerCase()}`
      const carpetaMedia = join(proyectos.carpeta(id), 'media')
      mkdirSync(carpetaMedia, { recursive: true })
      copyFileSync(origen, join(carpetaMedia, nombreArchivo))
      return { ok: true, sonido: { archivo: `media/${nombreArchivo}`, nombre, duracion } }
    } catch (error) {
      return { ok: false, error: `No pude poner el sonido: ${error instanceof Error ? error.message : String(error)}` }
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

// Al salir, cierra el Edge sin ventana que Flow y la voz dejan abierto un rato entre pedidos.
let cerrandoEdges = false
app.on('before-quit', (e) => {
  if (cerrandoEdges) return
  cerrandoEdges = true
  e.preventDefault()
  cerrarAntigravity()
  void Promise.race([cerrarEdgesOciosos(), new Promise((r) => setTimeout(r, 4000))]).finally(() => app.quit())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Las opciones de la caja del chat que manda la interfaz, limpias (o null si no vino nada válido). */
function ajustesDeChat(crudo: unknown): AjustesCreacion | null {
  if (!crudo || typeof crudo !== 'object') return null
  const a = crudo as Record<string, unknown>
  const flow = a.flow && typeof a.flow === 'object' ? (a.flow as Record<string, unknown>) : null
  const video = a.tareas && typeof a.tareas === 'object' ? (a.tareas as { video?: unknown }).video : undefined
  const tarea = video && typeof video === 'object' && typeof (video as { agente?: unknown }).agente === 'string' ? (video as EleccionTarea) : null
  return {
    vozElegida: typeof a.vozElegida === 'string' && a.vozElegida ? a.vozElegida : null,
    directo: a.directo === true,
    flow: flow
      ? {
          imagenes: flow.imagenes === true,
          videos: flow.videos === true,
          ...(typeof flow.modeloImagen === 'string' ? { modeloImagen: flow.modeloImagen } : {}),
          ...(typeof flow.modeloVideo === 'string' ? { modeloVideo: flow.modeloVideo } : {})
        }
      : null,
    tareas: tarea ? { video: tarea } : null
  }
}

/** Lo que el agente del chat puede usar, según la caja, en palabras para su pedido. */
function permisosDelChat(o: AjustesCreacion): string {
  const f = o.flow
  return [
    f?.imagenes
      ? `- Imágenes generadas: SÍ, con ${f.modeloImagen ?? 'Google Flow'} (generar_con_flow; te devuelve el costo: pregúntale antes de confirmar).`
      : '- Imágenes generadas: NO. El usuario eligió «Sin imágenes»: no generes ninguna; usa su material.',
    f?.videos
      ? `- Clips generados: SÍ, con ${f.modeloVideo ?? 'Veo'} (gastan créditos de Flow: dile cuántos y cuánto cuestan y espera su «sí»).`
      : '- Clips generados: NO. El usuario eligió «Sin clips»: no generes ninguno.',
    o.vozElegida
      ? `- Voz: la narración nueva va con la voz «${o.vozElegida}» (anadir_voz o cambiar_voz con "voz": "${o.vozElegida}").`
      : '- Voz: NO generes narración nueva (eligió «Sin voz»); la que ya tiene el proyecto sí la puedes mover o recortar.',
    o.directo
      ? '- Eligió «Hazlo directo»: no preguntes lo que puedas decidir tú con sensatez; hazlo y cuéntalo.'
      : '- Eligió «Pregúntame antes»: si el cambio es grande o se puede entender de dos formas, pregunta antes de editar.'
  ].join('\n')
}

/** Dónde está el usuario en el editor de cada proyecto (lo último que mandó el editor). */
const dondeEnEditor = new Map<string, { texto: string; fecha: number }>()

/** Dónde está en el editor de ese proyecto, si lo tuvo abierto hace poco (si no, no se sabe). */
function dondeEsta(id: string): string | undefined {
  const d = dondeEnEditor.get(id)
  return d && Date.now() - d.fecha < 6 * 60 * 60_000 ? d.texto : undefined
}
