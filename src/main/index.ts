import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, extname, join, resolve, sep } from 'node:path'
import type {
  AnalisisResultado,
  IngestaResultado,
  Progreso,
  RenderLoteResultado,
  RenderResultado,
  TranscripcionResultado
} from '../shared/api'
import type { AjustesIA, Project } from '../shared/types'
import { Ajustes } from './ajustes'
import { conectarAgente, estadoAgentes } from './agentes'
import { crearMiniatura, crearProxy, probeVideo } from './ffmpeg'
import { proponerClipsConAgente, proponerClipsConIA, proponerRecetaConAgente, proponerRecetaConIA } from './ia'
import { registrarMedia } from './media'
import { proponerClips } from './momentos'
import { Proyectos } from './proyectos'
import { recetaLocal } from './receta'
import { crearVideo } from './crear'
import { renderClip, renderReceta } from './render'
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
  const proyectos = new Proyectos()
  const ajustes = new Ajustes()
  registrarMedia(proyectos)

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

  ipcMain.handle('proyecto:crear', async (_evento, ruta: unknown): Promise<IngestaResultado> => {
    if (typeof ruta !== 'string' || !existsSync(ruta)) {
      throw new Error('No encuentro ese archivo.')
    }

    const info = await probeVideo(ruta)
    const id = randomUUID()
    const nombre = basename(ruta, extname(ruta)).replace(/[_-]+/g, ' ').trim() || 'Clase'
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
  })

  ipcMain.handle('proyecto:listar', () => proyectos.list())

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
      language: actual.language
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

  ipcMain.handle('agentes:estado', () => estadoAgentes())
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

    proyecto.clips = clips
    proyectos.save(proyecto)
    return { ok: true, project: proyecto, fuente, aviso }
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

    proyecto.receta = receta
    proyecto.recetaSalida = undefined
    proyectos.save(proyecto)
    return { ok: true, project: proyecto, fuente, aviso }
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
