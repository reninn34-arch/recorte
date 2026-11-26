// La cuenta de Google de la voz cuando su sesión ya no vale (se cambió la contraseña, se cerró en otro equipo): antes,
// «Conectar» veía la sesión vieja en el perfil de Edge, lo intentaba sin ventana, fallaba y nunca dejaba entrar de
// nuevo, y «Salir» no la borraba. Ahora «Conectar» la borra y abre la ventana para entrar, y «Salir» la borra.
// Con un perfil aparte (no toca la cuenta del usuario) y una sesión falsa. npm run prueba:google-sesion
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const datos = mkdtempSync(join(tmpdir(), 'recorte-google-'))
process.env.RECORTE_USERDATA = datos
// La app cree que había una cuenta conectada.
mkdirSync(join(datos, 'voz'), { recursive: true })
writeFileSync(join(datos, 'voz', 'cuenta.json'), JSON.stringify({ correo: 'vieja@ejemplo.com' }))

const { chromium } = await import('playwright-core')
const g = await import('../src/main/vozgoogle.ts')
const PUERTO = 9336
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const responde = () => fetch(`http://127.0.0.1:${PUERTO}/json/version`).then((r) => r.ok, () => false)
const cookies = async () => {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`, { timeout: 15_000 })
  try {
    return (await (await b.newBrowserCDPSession()).send('Storage.getCookies')).cookies
  } finally {
    await b.close()
  }
}
const sesionFalsa = async () => {
  const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`, { timeout: 15_000 })
  try {
    await (await b.newBrowserCDPSession()).send('Storage.setCookies', {
      cookies: [
        { name: 'SAPISID', value: 'vieja-y-sin-valor', domain: '.google.com', path: '/', secure: true, expires: Math.floor(Date.now() / 1000) + 30 * 86400 },
        { name: 'SID', value: 'vieja-y-sin-valor', domain: '.google.com', path: '/', secure: true, expires: Math.floor(Date.now() / 1000) + 30 * 86400 }
      ]
    })
  } finally {
    await b.close()
  }
}
/** Cierra el Edge de la prueba como si el usuario cerrara su ventana; si no se deja, lo termina (solo el de su perfil). */
const cerrarTodo = async () => {
  try {
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${PUERTO}`, { timeout: 10_000 })
    await Promise.race([(await b.newBrowserCDPSession()).send('Browser.close'), espera(5000)])
  } catch {}
  for (let i = 0; i < 20 && (await responde()); i++) await espera(250)
  if (await responde()) {
    const { spawnSync } = await import('node:child_process')
    const lista = spawnSync('wmic', ['process', 'where', "name='msedge.exe'", 'get', 'processid,commandline'], { encoding: 'utf8' }).stdout ?? ''
    for (const linea of lista.split(/\r?\n/)) if (linea.includes(datos)) spawnSync('taskkill', ['/F', '/PID', linea.trim().split(/\s+/).pop()])
    for (let i = 0; i < 20 && (await responde()); i++) await espera(250)
  }
  // Como en la vida real: Edge tarda unos segundos en soltar su perfil del todo.
  await espera(3000)
}

try {
  // Un Edge de una prueba anterior puede tardar en cerrarse del todo.
  for (let i = 0; i < 60 && (await responde()); i++) await espera(500)
  assert.ok(!(await responde()), `el puerto ${PUERTO} tiene que estar libre (¿hay una voz de Google generándose?)`)
  assert.equal(g.estadoVozGoogle().correo, 'vieja@ejemplo.com', 'empieza con la cuenta vieja')
  const { spawn } = await import('node:child_process')
  const exe = g.edgeExe()
  assert.ok(exe, 'hace falta Edge')

  // 1) Un perfil con la sesión vieja (cookies que Google ya no acepta).
  spawn(exe, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${join(datos, 'voz', 'perfil')}`, '--no-first-run', '--headless=new', 'about:blank'], { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
  await sesionFalsa()
  assert.ok((await cookies()).some((c) => c.name === 'SAPISID'), 'el perfil tiene la sesión vieja')
  await cerrarTodo()

  // 2) «Conectar»: ya no se queda en la sesión vieja; la borra y abre la ventana para entrar de nuevo.
  const conectando = g.conectarVozGoogle()
  let ventana = false
  // La ventana para entrar, quieta tres segundos seguidos (antes, sin ventana, se mira la sesión vieja).
  for (let i = 0, seguidas = 0; i < 120 && !ventana; i++) {
    await espera(1000)
    if (!(await responde())) {
      seguidas = 0
      continue
    }
    const lista = await fetch(`http://127.0.0.1:${PUERTO}/json/list`).then((r) => r.json(), () => [])
    // La ventana para entrar: cuando la app ya soltó la cuenta vieja (antes, sin ventana, mira la sesión vieja).
    seguidas = g.estadoVozGoogle().correo === null && lista.some((t) => t.type === 'page' && /accounts\.google\.com/.test(t.url)) ? seguidas + 1 : 0
    ventana = seguidas >= 3
  }
  assert.ok(ventana, 'se abre la ventana para entrar con Google')
  const quedan = await cookies()
  assert.ok(!quedan.some((c) => c.name === 'SAPISID' && c.value === 'vieja-y-sin-valor'), 'la sesión vieja se borró')
  assert.equal(g.estadoVozGoogle().correo, null, 'la cuenta vieja ya no cuenta como conectada')
  // El usuario cierra la ventana sin entrar: se cancela y lo dice.
  await cerrarTodo()
  const fin = await conectando
  assert.ok(fin.error, `se cancela con un aviso (${fin.error})`)
  assert.equal(g.estadoVozGoogle().conectando, false, 'y deja de estar «conectando»')

  // 3) «Salir» también borra la sesión del perfil.
  spawn(exe, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${join(datos, 'voz', 'perfil')}`, '--no-first-run', '--headless=new', 'about:blank'], { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
  await sesionFalsa()
  await cerrarTodo()
  const tras = await g.desconectarVozGoogle()
  assert.equal(tras.correo, null)
  spawn(exe, [`--remote-debugging-port=${PUERTO}`, `--user-data-dir=${join(datos, 'voz', 'perfil')}`, '--no-first-run', '--headless=new', 'about:blank'], { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40 && !(await responde()); i++) await espera(500)
  assert.ok(!(await cookies()).some((c) => c.name === 'SAPISID'), '«Salir» borra la sesión de Google del perfil')
  await cerrarTodo()
  console.log('cuenta de Google: con la sesión vieja, «Conectar» deja entrar de nuevo y «Salir» la borra ✓')
} finally {
  await cerrarTodo()
  await espera(500)
  // Edge puede tardar en soltar su perfil: si aún no se deja borrar, queda en la carpeta temporal.
  try {
    rmSync(datos, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  } catch {}
}
