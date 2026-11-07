import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { duracionesDeMedios, normalizarTimeline, quitarFuente } from '../shared/timeline'
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
import { conectarAgente, estadoAgentes, prepararAgentes, versionesAgentes, agenteDeOrden, VARIABLE_LLAVE } from './agentes'
import { estadoSistema, instalarHerramienta } from './sistema'
import { carpetaPorDefecto, copiarAVideos, carpetaDelProyecto } from './carpetas'
import { abrirFlow, agregarCuentaFlow, ajustesFlow, estadoFlow, leerSaldosFlow, pedirFlow, quitarCuentaFlow } from './flow'
import { MODELOS_IMAGEN, MODELOS_VIDEO, type PedidoFlow } from '../shared/flow'
import { definirEntornoAgentes, empezarTrabajo, esParado, pararTrabajo, terminarTrabajo } from './ia'
import { comandoConNivel } from './modelos'
import { crearMiniatura, crearProxy, probeVideo } from './ffmpeg'
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
import { pideMontarVoz, textoNarracion, VOCES_GEMINI } from '../shared/creacion'
import type { Creacion, EleccionTarea, MensajeCreacion, NivelModelo, PeticionCreacion, TareasCreacion } from '../shared/creacion'
import { turnoAgente } from './chat'
import { buscarActualizacion, estadoActualizacion, instalarActualizacion, prepararActualizaciones } from './actualizar'
import { activarGustos, agregarGustos, bloqueGustos, cargarGustos, olvidarGustos, quitarGusto, senalGusto, usoCreacion } from './gustos'
import type { MensajeChat } from '../shared/chat'
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
  prepararAgentes()
  prepararActualizaciones()
  const proyectos = new Proyectos()
  const ajustes = new Ajustes()
  const creaciones = new Creaciones()
  registrarMedia(proyectos, creaciones)

  const enviarProgreso = (progreso: Progreso) => {
    for (const ventana of BrowserWindow.getAllWindows()) {
      ventana.webContents.send('progreso', progreso)
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
        return { activa: true, proveedor: 'cli', comandoCli: comandoConNivel(agente.comando, eleccion.agente, eleccion.nivel) }
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
      const { agente, nivel } = e as Record<string, unknown>
      if (typeof agente !== 'string' || !(AGENTE_IDS as readonly string[]).includes(agente)) return undefined
      return {
        agente: agente as EleccionTarea['agente'],
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
    const senal = empezarTrabajo(`creacion:${id}`)
    try {
      return await trabajo(c, senal)
    } finally {
      terminarTrabajo(`creacion:${id}`, senal)
      creandoAhora.delete(id)
    }
  }
  ipcMain.handle('creacion:parar', (_evento, id: unknown) => typeof id === 'string' && pararTrabajo(`creacion:${id}`))
  const textoError = (e: unknown) => (e instanceof Error ? e.message : String(e))

  ipcMain.handle('dialog:open-adjuntos', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Fotos o clips para tu video',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fotos y videos', extensions: EXTENSIONES_ADJUNTOS }]
    })
    return r.canceled ? [] : r.filePaths
  })
  const destrabar = (c: Creacion): Creacion => {
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
      tareas: limpiarTareas(x.tareas),
      ...(x.flow && typeof x.flow === 'object'
        ? (() => {
            const f = x.flow as { imagenes?: unknown; videos?: unknown; modeloImagen?: unknown; modeloVideo?: unknown }
            return {
              flow: {
                imagenes: Boolean(f.imagenes),
                videos: Boolean(f.videos),
                ...(typeof f.modeloImagen === 'string' && MODELOS_IMAGEN.includes(f.modeloImagen) ? { modeloImagen: f.modeloImagen } : {}),
                ...(typeof f.modeloVideo === 'string' && MODELOS_VIDEO.includes(f.modeloVideo) ? { modeloVideo: f.modeloVideo } : {})
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
      enviarProgreso({ id: c.id, fase: 'creacion', pct: 0.1, texto: c.guion ? 'Cambiando el guion' : 'Escribiendo el guion' })
      try {
        const r = await pasoGuion(c, await configParaTarea(c.tareas?.guion), texto, senal, bloqueGustos())
        c.guion = r.guion
        const aprendidos = agregarGustos(r.aprendido, 'aprendido').map((g) => g.texto)
        c.mensajes.push({
          ...mensaje('agente', r.mensaje),
          ...(r.propuestas.length ? { propuestas: r.propuestas } : {}),
          ...(aprendidos.length ? { aprendido: aprendidos } : {})
        })
        if (c.voz) {
          // La narración cambió: la voz grabada ya no le corresponde.
          delete c.voz
          c.mensajes.push(mensaje('agente', 'Como cambió el guion, quité la voz anterior: vuelve a generarla o grabarla en el paso Voz.'))
        }
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
        const r = await pasoVideo(c, creaciones.carpeta(c.id), await configParaTarea(c.tareas?.video), (pct, t) =>
          enviarProgreso({ id: c.id, fase: 'creacion', pct, texto: t })
        , texto && c.salida ? texto : undefined, senal, bloqueGustos())
        c.salida = r.salida
        c.portada = r.portada
        c.version += 1
        if (c.voz) c.vozMontada = c.version
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
    return ingesta.project
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
  ipcMain.handle('agentes:estado', () => agentesConPago())
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
    typeof id === 'string' ? instalarHerramienta(id) : { ok: false, error: 'Herramienta desconocida.' }
  )
  ipcMain.handle('preferencias:cargar', () => ajustes.preferencias())
  ipcMain.handle('preferencias:guardar', (_evento, cambio: unknown) => ajustes.guardarPreferencias((cambio ?? {}) as object))
  ipcMain.handle('agentes:conectar', (_evento, id: unknown) => conectarAgente(id))

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
        // Solo se guarda lo nuevo; lo que ya sabía se confirma (suma una vez más).
        if (turno.aprendido?.length) turno.aprendido = agregarGustos(turno.aprendido, 'aprendido').map((g) => g.texto)
        return turno
      } finally {
        terminarTrabajo(`chat:${id}`, senal)
      }
    }
  )
  // Parar al agente del chat: corta su proceso (o la petición a la API) al instante.
  ipcMain.handle('agente:parar', (_evento, id: unknown) => typeof id === 'string' && pararTrabajo(`chat:${id}`))

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
