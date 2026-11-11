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
const herramientas = herramientasRecorte({
  proyectos,
  listarCreaciones: () => [],
  ingerir: async () => assert.fail('no se usa'),
  agregarRutas: async () => assert.fail('no se usa'),
  transcribir: async () => ({ ok: false }),
  exportar: async () => ({ ok: false }),
  copiarSonido: async () => ({ archivo: 'media/pop.wav', duracion: 0.14, nombre: 'Pop' }),
  avisarCambio: (p, quien, conTimeline) => avisos.push({ p, quien, conTimeline }),
  abrirEnApp: () => {}
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
      { op: 'anadir_sonido', sonido: 'pop', inicio: 1 }
    ]
  })
  assert.ok(!r.isError, r.content[0].text)
  const p = proyectos.get(id)
  assert.equal(p.timeline.textos[0].texto, 'Hola')
  assert.equal(p.timeline.textos[0].x, 0.3)
  assert.equal(p.timeline.sonidos[0].nombre, 'Pop')
  assert.deepEqual([avisos.length, avisos[0].quien, avisos[0].conTimeline], [1, 'claude-code', true], 'avisa a la interfaz quién y que cambió la timeline')
  // La voz nueva gasta créditos: todavía no por aquí.
  const voz = await llamar('editar_timeline', { proyecto: id, operaciones: [{ op: 'anadir_voz', inicio: 1, texto: 'hola' }] })
  assert.equal(voz.isError, true)
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
