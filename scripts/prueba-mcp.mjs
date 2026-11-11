// El servidor MCP de Recorte sin abrir la app: contraseña, protocolo y que editar_timeline
// cambie el proyecto en disco y avise a la interfaz. npm run prueba:mcp
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServidorMcp } from '../src/main/mcp.ts'
import { herramientasRecorte } from '../src/main/mcprecorte.ts'
import { Proyectos } from '../src/main/proyectos.ts'

const dir = mkdtempSync(join(tmpdir(), 'recorte-prueba-mcp-'))
const proyectos = new Proyectos(join(dir, 'proyectos'))
const video = join(dir, 'clase.mp4')
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=4:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video])
const id = 'p-prueba'
mkdirSync(proyectos.carpeta(id), { recursive: true })
proyectos.create({
  id,
  name: 'Clase de prueba',
  source: { path: video, name: 'clase.mp4', duration: 4, width: 320, height: 180, fps: 30 },
  clips: [],
  brand: { name: 'x', primary: '#ffffff', secondary: '#000000', font: 'Inter' },
  createdAt: 1,
  updatedAt: 1,
  transcription: 'pendiente'
})

const avisos = []
const creadas = new Map()
const ocupadas = new Set()
const turnos = []
let vocesGeneradas = 0
const recortes = []
const animadas = []
const herramientas = herramientasRecorte({
  proyectos,
  listarCreaciones: () => [],
  ingerir: async () => assert.fail('no se usa'),
  agregarRutas: async () => assert.fail('no se usa'),
  transcribir: async () => ({ ok: false }),
  exportar: async () => ({ ok: false }),
  copiarSonido: async () => ({ archivo: 'media/pop.wav', duracion: 0.14, nombre: 'Pop' }),
  avisarCambio: (p, quien, conTimeline) => avisos.push({ p, quien, conTimeline }),
  abrirEnApp: () => {},
  animarImagen: async (pid, medio, tipo) => {
    animadas.push([medio, tipo])
    const p = proyectos.abrir(pid)
    p.medios = [...(p.medios ?? []), { id: 'm-anim', ruta: video, nombre: 'logo-ondear.webm', tipo: 'video', duracion: 4 }]
    proyectos.save(p)
    return { project: p, medio: 'm-anim' }
  },
  quitarFondo: async (pid, medio) => {
    recortes.push(medio)
    const p = proyectos.abrir(pid)
    p.medios = [...(p.medios ?? []), { id: 'm-recorte', ruta: video, nombre: 'logo-sin-fondo.png', tipo: 'imagen', duracion: 0 }]
    proyectos.save(p)
    return { project: p, medio: 'm-recorte' }
  },
  // Crear por MCP (6.3), con una creación y una voz de mentira.
  creaciones: {
    nueva: async (pet) => {
      const c = { id: 'c-prueba', nombre: pet.peticion.slice(0, 40), fase: 'plan', formato: pet.formato, mensajes: [], version: 0, vozElegida: pet.vozElegida, flow: pet.flow, directo: pet.directo }
      creadas.set(c.id, c)
      return c
    },
    get: (cid) => creadas.get(cid) ?? null,
    carpeta: (cid) => join(dir, 'creaciones', cid)
  },
  trabajando: (cid) => (ocupadas.has(cid) ? { desde: Date.now(), pct: 0.3, texto: 'Mirando tus archivos' } : null),
  charlar: (cid, texto) => {
    turnos.push({ cid, texto, que: 'charla' })
    ocupadas.add(cid)
  },
  hacer: (cid, texto) => turnos.push({ cid, texto, que: 'hacer' }),
  seguir: () => {},
  parar: (cid) => ocupadas.delete(cid),
  alEditor: async () => assert.fail('no se usa'),
  abrirCreacionEnApp: () => {},
  voz: {
    conectada: async () => true,
    porDefecto: async () => 'Kore',
    generar: async () => assert.fail('no se usa'),
    carpetaMuestras: join(dir, 'muestras'),
    duracion: async () => 1,
    delChat: async (_id, _tl, ops) => {
      vocesGeneradas++
      for (const o of ops) if (o.op === 'anadir_voz') o.audio = { archivo: 'media/voz-1.wav', duracion: 1.2, voz: 'Kore', texto: o.texto }
      return []
    }
  },
  flow: { conectado: () => true, derechos: () => true, generar: async () => assert.fail('no se usa') }
})
const servidor = new ServidorMcp(herramientas, 'secreto-de-prueba-0123456789', { nombre: 'recorte', version: '0', instrucciones: 'x' })
const puerto = await servidor.iniciar(47900 + Math.floor(Math.random() * 50))
const url = `http://127.0.0.1:${puerto}/mcp`
let sid = null
let k = 0
async function rpc(method, params, extra = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secreto-de-prueba-0123456789', ...(sid ? { 'Mcp-Session-Id': sid } : {}), ...extra },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++k, method, params })
  })
  sid = r.headers.get('mcp-session-id') ?? sid
  return { estado: r.status, cuerpo: r.status === 200 ? await r.json() : null }
}
const llamar = async (name, args) => (await rpc('tools/call', { name, arguments: args })).cuerpo.result

try {
  assert.equal((await rpc('ping', {}, { Authorization: 'Bearer otra' })).estado, 401, 'sin la contraseña, nada')
  // fetch no deja cambiar el Host: va con http.request.
  const conHost = await new Promise((ok) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/mcp', method: 'POST', headers: { Host: 'evil.example', Authorization: 'Bearer secreto-de-prueba-0123456789' } }, (res) => {
      res.resume()
      ok(res.statusCode)
    })
    q.end('{}')
  })
  assert.equal(conHost, 403, 'solo nombres locales')
  assert.equal((await rpc('ping', {}, { Origin: 'https://evil.example' })).estado, 403, 'ninguna página web')
  const ini = await rpc('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code' } })
  assert.equal(ini.cuerpo.result.protocolVersion, '2025-06-18')
  assert.ok(sid, 'da una sesión')
  const nombres = (await rpc('tools/list', {})).cuerpo.result.tools.map((t) => t.name)
  for (const n of ['listar_proyectos', 'ver_proyecto', 'ver_cuadro', 'editar_timeline', 'agregar_medios', 'exportar']) assert.ok(nombres.includes(n), n)

  assert.match((await llamar('listar_proyectos', {})).content[0].text, /Clase de prueba · id p-prueba/)
  const r = await llamar('editar_timeline', {
    proyecto: 'clase de prueba',
    operaciones: [
      { op: 'anadir_texto', inicio: 0.5, texto: 'Hola' },
      { op: 'cambiar_texto', texto_n: 1, x: 0.3, y: 0.2 },
      { op: 'anadir_sonido', sonido: 'pop', inicio: 1 },
      { op: 'filtros', grano: 0.3, vineta: 0.6 }
    ]
  })
  assert.ok(!r.isError, r.content[0].text)
  const p = proyectos.get(id)
  assert.equal(p.timeline.textos[0].texto, 'Hola')
  assert.equal(p.timeline.textos[0].x, 0.3)
  assert.equal(p.timeline.sonidos[0].nombre, 'Pop')
  assert.deepEqual(p.timeline.filtros, { grano: 0.3, vineta: 0.6 }, 'los filtros por chat o MCP')
  assert.deepEqual([avisos.length, avisos[0].quien, avisos[0].conTimeline], [1, 'claude-code', true], 'avisa a la interfaz quién y que cambió la timeline')
  // La voz nueva gasta: primero el costo y un código; con el código, se genera y entra.
  const opsVoz = [{ op: 'anadir_voz', inicio: 1, texto: 'hola' }]
  const voz = await llamar('editar_timeline', { proyecto: id, operaciones: opsVoz })
  const codigo = voz.content[0].text.match(/"confirmacion": "([0-9A-F]+)"/)?.[1]
  assert.ok(codigo, voz.content[0].text)
  assert.equal(vocesGeneradas, 0, 'sin confirmar no gasta')
  const otro = await llamar('editar_timeline', { proyecto: id, operaciones: [{ op: 'anadir_voz', inicio: 1, texto: 'otra cosa' }], confirmacion: codigo })
  assert.match(otro.content[0].text, /Esto gasta/, 'el código vale solo para ese pedido')
  const conCodigo = await llamar('editar_timeline', { proyecto: id, operaciones: opsVoz, confirmacion: codigo })
  assert.ok(!conCodigo.isError, conCodigo.content[0].text)
  assert.equal(vocesGeneradas, 1)
  assert.equal(proyectos.get(id).timeline.voces.at(-1).texto, 'hola')
  const repetido = await llamar('editar_timeline', { proyecto: id, operaciones: opsVoz, confirmacion: codigo })
  assert.match(repetido.content[0].text, /Esto gasta/, 'un código se usa una sola vez')

  // Crear: con voz pide permiso; con el código empieza la charla del plan y vuelve al momento.
  for (const n of ['crear_video', 'ver_creacion', 'hablar_con_agente', 'hacer_video', 'parar_agente', 'pasar_al_editor', 'ver_voces', 'probar_voz', 'generar_con_flow']) {
    assert.ok(nombres.includes(n), n)
  }
  const pedido = { peticion: 'Un video sobre el cuidado de los dientes', formato: 'vertical', voz: 'charon' }
  const sinPermiso = await llamar('crear_video', pedido)
  const cc = sinPermiso.content[0].text.match(/"confirmacion": "([0-9A-F]+)"/)?.[1]
  assert.ok(cc && creadas.size === 0, 'sin confirmar no crea nada')
  const creada = await llamar('crear_video', { ...pedido, confirmacion: cc })
  assert.match(creada.content[0].text, /id c-prueba/)
  assert.equal(creadas.get('c-prueba').vozElegida, 'Charon', 'la voz se reconoce sin importar mayúsculas')
  assert.deepEqual(turnos[0], { cid: 'c-prueba', texto: undefined, que: 'charla' })
  assert.match((await llamar('ver_creacion', { creacion: 'c-prueba' })).content[0].text, /TRABAJANDO.*Mirando tus archivos/)
  assert.equal((await llamar('hablar_con_agente', { creacion: 'c-prueba', mensaje: 'Más corto' })).isError, true, 'no se le habla mientras trabaja')
  ocupadas.delete('c-prueba')
  creadas.get('c-prueba').agente = { registro: [], rondas: 0, plan: { entendi: 'Un video de dientes', pasos: ['Guion', 'Voz', 'Montaje'], preguntas: [] } }
  assert.match((await llamar('ver_creacion', { creacion: 'c-prueba' })).content[0].text, /\[ \] 2\. Voz/)
  // Ya aceptó el gasto de esta creación: hablar y «Hazlo» no vuelven a pedirlo.
  assert.ok(!(await llamar('hablar_con_agente', { creacion: 'c-prueba', mensaje: 'Más corto' })).isError)
  ocupadas.delete('c-prueba')
  const hazlo = await llamar('hacer_video', { creacion: 'c-prueba' })
  assert.match(hazlo.content[0].text, /haciendo el video/)
  assert.deepEqual(turnos.map((t) => t.que), ['charla', 'charla', 'hacer'])
  // Sin voz conectada y con una voz desconocida, no hace nada.
  assert.equal((await llamar('crear_video', { peticion: 'x', voz: 'Nadie' })).isError, true)
  assert.match((await llamar('ver_voces', {})).content[0].text, /Charon: Informativa/)
  const sinFondo = await llamar('quitar_fondo', { proyecto: id, medio: 'm-logo' })
  assert.ok(!sinFondo.isError && /m-recorte/.test(sinFondo.content[0].text), sinFondo.content[0].text)
  assert.deepEqual(recortes, ['m-logo'])
  // Animar la imagen de una capa (sin créditos) y devolverla quieta.
  const conCapa = proyectos.get(id)
  conCapa.medios = [...(conCapa.medios ?? []), { id: 'm-logo', ruta: video, nombre: 'logo.png', tipo: 'imagen', duracion: 0 }]
  conCapa.timeline = { ...conCapa.timeline, capas: [{ id: 'k1', fuente: 'm-logo', inicio: 0, duracion: 2, x: 0.5, y: 0.5, ancho: 0.3 }] }
  delete conCapa.timelinePendiente
  proyectos.save(conCapa)
  const an = await llamar('animar_capa', { proyecto: id, capa: 1, tipo: 'ondear' })
  assert.ok(!an.isError, an.content[0].text)
  const capaAnim = proyectos.get(id).timeline.capas[0]
  assert.deepEqual([capaAnim.fuente, capaAnim.animada?.tipo, capaAnim.animada?.base, animadas[0]], ['m-anim', 'ondear', 'm-logo', ['m-logo', 'ondear']])
  await llamar('animar_capa', { proyecto: id, capa: 1, tipo: 'quieta' })
  const quieta = proyectos.get(id).timeline.capas[0]
  assert.deepEqual([quieta.fuente, quieta.animada, Math.round(quieta.ancho * 100) / 100], ['m-logo', undefined, 0.3], 'vuelve a la imagen quieta, a su tamaño')
  // Lo pendiente (aún no aplicado en el editor) manda al leer y editar.
  const conPendiente = proyectos.get(id)
  conPendiente.timelinePendiente = { ...conPendiente.timeline, textos: [] }
  proyectos.save(conPendiente)
  assert.match((await llamar('ver_proyecto', { proyecto: id })).content[0].text, /Textos \(rótulos\):\n {2}\(ninguno\)/)
  const mal = await llamar('ver_proyecto', { proyecto: 'no existe' })
  assert.equal(mal.isError, true)
  console.log('prueba mcp: ok')
} finally {
  servidor.detener()
  rmSync(dir, { recursive: true, force: true })
}
