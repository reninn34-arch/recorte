import { contextBridge, ipcRenderer } from 'electron'
import type { EstadoActualizacion, Progreso, RecorteApi } from '../shared/api'
import type { Project } from '../shared/types'

const api: RecorteApi = {
  openVideo: () => ipcRenderer.invoke('dialog:open-video'),
  crearProyecto: (ruta) => ipcRenderer.invoke('proyecto:crear', ruta),
  listarProyectos: () => ipcRenderer.invoke('proyecto:listar'),
  abrirProyecto: (id) => ipcRenderer.invoke('proyecto:abrir', id),
  guardarProyecto: (proyecto: Project) => ipcRenderer.invoke('proyecto:guardar', proyecto),
  borrarProyecto: (id) => ipcRenderer.invoke('proyecto:borrar', id),
  borrarCreacion: (id) => ipcRenderer.invoke('creacion:borrar', id),
  agregarMedios: (id) => ipcRenderer.invoke('proyecto:agregar-medios', id),
  quitarFondo: (id, medio) => ipcRenderer.invoke('proyecto:quitar-fondo', id, medio),
  animarImagen: (id, medio, tipo) => ipcRenderer.invoke('proyecto:animar-imagen', id, medio, tipo),
  quitarMedio: (id, medio) => ipcRenderer.invoke('proyecto:quitar-medio', id, medio),
  transcribir: (id) => ipcRenderer.invoke('proyecto:transcribir', id),
  generarClips: (id) => ipcRenderer.invoke('proyecto:generar', id),
  cargarAjustes: () => ipcRenderer.invoke('ajustes:cargar'),
  guardarAjustes: (ajustes, clave) => ipcRenderer.invoke('ajustes:guardar', ajustes, clave),
  agentesEstado: () => ipcRenderer.invoke('agentes:estado'),
  agentesModelos: (id, forzar) => ipcRenderer.invoke('agentes:modelos', id, forzar),
  agentesConectar: (id) => ipcRenderer.invoke('agentes:conectar', id),
  agentesDesconectar: (id) => ipcRenderer.invoke('agentes:desconectar', id),
  agentesDesactivar: () => ipcRenderer.invoke('agentes:desactivar'),
  agentesVersiones: () => ipcRenderer.invoke('agentes:versiones'),
  agentesPago: (id, cambio) => ipcRenderer.invoke('agentes:pago', id, cambio),
  sistemaEstado: () => ipcRenderer.invoke('sistema:estado'),
  sistemaMedirRender: () => ipcRenderer.invoke('sistema:medir-render'),
  sistemaInstalar: (id) => ipcRenderer.invoke('sistema:instalar', id),
  sistemaAbrirDatos: () => ipcRenderer.invoke('sistema:abrir-datos'),
  carpetaEstado: () => ipcRenderer.invoke('carpeta:estado'),
  carpetaElegir: () => ipcRenderer.invoke('carpeta:elegir'),
  carpetaUsarPropuesta: () => ipcRenderer.invoke('carpeta:propuesta'),
  carpetaAbrir: (ruta) => ipcRenderer.invoke('carpeta:abrir', ruta),
  flowEstado: () => ipcRenderer.invoke('flow:estado'),
  flowAjustes: (cambio) => ipcRenderer.invoke('flow:ajustes', cambio),
  flowAgregarCuenta: () => ipcRenderer.invoke('flow:agregar'),
  flowQuitarCuenta: (correo) => ipcRenderer.invoke('flow:quitar', correo),
  flowAbrir: (correo) => ipcRenderer.invoke('flow:abrir', correo),
  flowLeerSaldos: () => ipcRenderer.invoke('flow:saldos'),
  flowGenerar: (destino, pedido) => ipcRenderer.invoke('flow:generar', destino, pedido),
  preferenciasCargar: () => ipcRenderer.invoke('preferencias:cargar'),
  preferenciasGuardar: (cambio) => ipcRenderer.invoke('preferencias:guardar', cambio),
  renderizarClip: (id, clipId) => ipcRenderer.invoke('proyecto:renderizar', id, clipId),
  renderizarLote: (id, clipIds) => ipcRenderer.invoke('proyecto:renderizar-lote', id, clipIds),
  editarConAgente: (id) => ipcRenderer.invoke('proyecto:editar', id),
  renderizarEdicion: (id) => ipcRenderer.invoke('proyecto:renderizar-edicion', id),
  abrirEdicion: (id) => ipcRenderer.invoke('proyecto:abrir-edicion', id),
  crearVideo: (id, peticion, opciones) => ipcRenderer.invoke('proyecto:crear-video', id, peticion, opciones),
  abrirCreacion: (id) => ipcRenderer.invoke('proyecto:abrir-creacion', id),
  abrirSalida: (id, clipId) => ipcRenderer.invoke('proyecto:abrir-salida', id, clipId),
  exportarTimeline: (id, timeline, opciones) => ipcRenderer.invoke('proyecto:exportar-timeline', id, timeline, opciones),
  abrirExportacion: (id) => ipcRenderer.invoke('proyecto:abrir-exportacion', id),
  vozFrase: (id, pedido) => ipcRenderer.invoke('proyecto:voz-frase', id, pedido),
  vozGrabada: (id, datos, texto) => ipcRenderer.invoke('proyecto:voz-grabada', id, datos, texto),
  vozMuestra: (voz) => ipcRenderer.invoke('voz:muestra', voz),
  importarMusica: (id) => ipcRenderer.invoke('proyecto:importar-musica', id),
  mcpEstado: () => ipcRenderer.invoke('mcp:estado'),
  mcpConectarClaude: () => ipcRenderer.invoke('mcp:conectar-claude'),
  mcpNuevaContrasena: () => ipcRenderer.invoke('mcp:nueva-contrasena'),
  onProyectoExterno: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, e: { proyecto: Project; quien: string; conTimeline: boolean }) => cb(e)
    ipcRenderer.on('proyecto:externo', listener)
    return () => ipcRenderer.removeListener('proyecto:externo', listener)
  },
  onAbrirProyecto: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('proyecto:abrir', listener)
    return () => ipcRenderer.removeListener('proyecto:abrir', listener)
  },
  onAbrirCreacion: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('creacion:abrir-externa', listener)
    return () => ipcRenderer.removeListener('creacion:abrir-externa', listener)
  },
  ponerSonido: (id, incluido) => ipcRenderer.invoke('proyecto:poner-sonido', id, incluido),
  elegirAdjuntos: () => ipcRenderer.invoke('dialog:open-adjuntos'),
  elegirCarpeta: () => ipcRenderer.invoke('dialog:open-carpeta'),
  elegirReferencia: () => ipcRenderer.invoke('dialog:open-referencia'),
  creacionesListar: () => ipcRenderer.invoke('creacion:listar'),
  creacionAbrir: (id) => ipcRenderer.invoke('creacion:abrir', id),
  creacionEnCurso: () => ipcRenderer.invoke('creacion:en-curso'),
  creacionNueva: (peticion) => ipcRenderer.invoke('creacion:nueva', peticion),
  estiloAnalizar: (id, modo) => ipcRenderer.invoke('estilo:analizar', id, modo),
  agentePlan: (id, pedido) => ipcRenderer.invoke('agente:plan', id, pedido),
  agenteHacer: (id, pedido) => ipcRenderer.invoke('agente:hacer', id, pedido),
  agenteSeguir: (id) => ipcRenderer.invoke('agente:seguir', id),
  creacionAjustar: (id, cambios) => ipcRenderer.invoke('creacion:ajustar', id, cambios),
  creacionAdjuntar: (id, rutas) => ipcRenderer.invoke('creacion:adjuntar', id, rutas),
  creacionAnotar: (id, mensajes) => ipcRenderer.invoke('creacion:anotar', id, mensajes),
  estiloContinuar: (id) => ipcRenderer.invoke('estilo:continuar', id),
  estiloViabilidad: (id) => ipcRenderer.invoke('estilo:viabilidad', id),
  estiloFichaGuardar: (id, cambios) => ipcRenderer.invoke('estilo:ficha-guardar', id, cambios),
  creacionGuion: (id, pedido) => ipcRenderer.invoke('creacion:guion', id, pedido),
  creacionVideo: (id, pedido) => ipcRenderer.invoke('creacion:video', id, pedido),
  creacionAlEditor: (id) => ipcRenderer.invoke('creacion:editor', id),
  creacionMostrar: (id) => ipcRenderer.invoke('creacion:mostrar', id),
  vozEstado: () => ipcRenderer.invoke('voz:estado'),
  vozGuardar: (cambio) => ipcRenderer.invoke('voz:guardar', cambio),
  vozGoogleConectar: () => ipcRenderer.invoke('voz:google-conectar'),
  vozGoogleDesconectar: () => ipcRenderer.invoke('voz:google-desconectar'),
  creacionVozGemini: (id, voz) => ipcRenderer.invoke('creacion:voz-gemini', id, voz),
  creacionVozPropia: (id, datos) => ipcRenderer.invoke('creacion:voz-propia', id, datos),
  creacionQuitarVoz: (id) => ipcRenderer.invoke('creacion:quitar-voz', id),
  creacionMontarVoz: (id) => ipcRenderer.invoke('creacion:montar-voz', id),
  chatAgente: (id, timeline, historial, peticion, referencia) =>
    ipcRenderer.invoke('agente:chat', id, timeline, historial, peticion, referencia),
  pararAgente: (id) => ipcRenderer.invoke('agente:parar', id),
  gustos: () => ipcRenderer.invoke('gustos:ver'),
  gustoAgregar: (texto) => ipcRenderer.invoke('gustos:agregar', texto),
  gustoQuitar: (id) => ipcRenderer.invoke('gustos:quitar', id),
  gustosActivar: (activo) => ipcRenderer.invoke('gustos:activar', activo),
  gustosOlvidar: () => ipcRenderer.invoke('gustos:olvidar'),
  gustoSenal: (tipo, detalle) => ipcRenderer.invoke('gustos:senal', tipo, detalle),
  creacionParar: (id) => ipcRenderer.invoke('creacion:parar', id),
  chatgptEstado: () => ipcRenderer.invoke('chatgpt:estado'),
  actualizacionEstado: () => ipcRenderer.invoke('actualizacion:estado'),
  actualizacionBuscar: () => ipcRenderer.invoke('actualizacion:buscar'),
  actualizacionInstalar: () => ipcRenderer.invoke('actualizacion:instalar'),
  onActualizacion: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, e: EstadoActualizacion) => cb(e)
    ipcRenderer.on('actualizacion', listener)
    return () => ipcRenderer.removeListener('actualizacion', listener)
  },
  onSesionCaida: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, id: Parameters<Parameters<RecorteApi['onSesionCaida']>[0]>[0]) => cb(id)
    ipcRenderer.on('agentes:sesion-caida', listener)
    return () => ipcRenderer.removeListener('agentes:sesion-caida', listener)
  },
  onHerramienta: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, p: { id: string; pct: number; texto: string }) => cb(p)
    ipcRenderer.on('herramienta', listener)
    return () => ipcRenderer.removeListener('herramienta', listener)
  },
  onProgreso: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, progreso: Progreso) => cb(progreso)
    ipcRenderer.on('progreso', listener)
    return () => ipcRenderer.removeListener('progreso', listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('recorte', api)
