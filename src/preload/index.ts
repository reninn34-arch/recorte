import { contextBridge, ipcRenderer } from 'electron'
import type { Progreso, RecorteApi } from '../shared/api'
import type { Project } from '../shared/types'

const api: RecorteApi = {
  openVideo: () => ipcRenderer.invoke('dialog:open-video'),
  crearProyecto: (ruta) => ipcRenderer.invoke('proyecto:crear', ruta),
  listarProyectos: () => ipcRenderer.invoke('proyecto:listar'),
  abrirProyecto: (id) => ipcRenderer.invoke('proyecto:abrir', id),
  guardarProyecto: (proyecto: Project) => ipcRenderer.invoke('proyecto:guardar', proyecto),
  transcribir: (id) => ipcRenderer.invoke('proyecto:transcribir', id),
  generarClips: (id) => ipcRenderer.invoke('proyecto:generar', id),
  cargarAjustes: () => ipcRenderer.invoke('ajustes:cargar'),
  guardarAjustes: (ajustes, clave) => ipcRenderer.invoke('ajustes:guardar', ajustes, clave),
  agentesEstado: () => ipcRenderer.invoke('agentes:estado'),
  agentesConectar: (id) => ipcRenderer.invoke('agentes:conectar', id),
  renderizarClip: (id, clipId) => ipcRenderer.invoke('proyecto:renderizar', id, clipId),
  renderizarLote: (id, clipIds) => ipcRenderer.invoke('proyecto:renderizar-lote', id, clipIds),
  editarConAgente: (id) => ipcRenderer.invoke('proyecto:editar', id),
  renderizarEdicion: (id) => ipcRenderer.invoke('proyecto:renderizar-edicion', id),
  abrirEdicion: (id) => ipcRenderer.invoke('proyecto:abrir-edicion', id),
  crearVideo: (id, peticion, opciones) => ipcRenderer.invoke('proyecto:crear-video', id, peticion, opciones),
  abrirCreacion: (id) => ipcRenderer.invoke('proyecto:abrir-creacion', id),
  abrirSalida: (id, clipId) => ipcRenderer.invoke('proyecto:abrir-salida', id, clipId),
  onProgreso: (cb) => {
    const listener = (_evento: Electron.IpcRendererEvent, progreso: Progreso) => cb(progreso)
    ipcRenderer.on('progreso', listener)
    return () => ipcRenderer.removeListener('progreso', listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('recorte', api)
