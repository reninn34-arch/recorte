import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import type { SesionAgente } from '../shared/modoagente'
import { valoresConMarca, type PiezaAnimada } from '../shared/piezas'
import { rutaFfmpeg } from './ffmpeg'
import { carpetaDePieza, carpetaPropias, comandoHyperframes, listarPiezas, renderizarPieza } from './piezas'
import { rutaScriptPython } from './transcribir'

/**
 * El taller de animaciones: el agente conectado (Claude Code, Codex, Kimi, OpenCode…) crea una animación NUEVA a medida
 * —o cambia una que ya existe— trabajando como un diseñador de motion con HyperFrames: escribe la pieza, la renderiza
 * con `node taller/probar.mjs`, MIRA los cuadros que salen, corrige y repite. Recorte le prepara la carpeta (la guía,
 * dos piezas de ejemplo, el logo, los colores de la marca y las referencias del usuario), y al terminar comprueba que
 * se anima, le hace su muestra y la guarda en «Mis animaciones» (fuera de la app: no se pierde al actualizar).
 */

export interface PedidoPieza {
  /** El comando del agente que trabaja (de los conectados). */
  orden: string
  /** Lo que quiere el usuario, con sus palabras. */
  peticion: string
  marca: { nombre: string; primary: string; secondary: string; logo?: string }
  /** Videos o imágenes de referencia (rutas del equipo). */
  referencias?: string[]
  ancho: number
  alto: number
  /** Cambiar esta pieza (si es de la app, se hace una copia propia). */
  base?: string
}

const limpio = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'animacion'

const GUIA = `# Cómo se hace una animación de Recorte

Eres un diseñador de motion graphics. Haces UNA pieza animada (un título, un rótulo, un contador, una transición, un
cierre, unos subtítulos con estilo…) que Recorte pone encima de un video como una capa con fondo TRANSPARENTE. Se dibuja
con HyperFrames (HTML + CSS + GSAP renderizado cuadro a cuadro). Tiene que verse hecha por un profesional.

## Los dos archivos que entregas (en esta carpeta)

### pieza.html: un fragmento (no un documento entero)
\`\`\`html
<style>
  #p-caja { position: absolute; left: 8%; right: 8%; top: 40%; text-align: center; }
  #p-titulo { font-family: 'Montserrat', sans-serif; font-weight: 900; font-size: 9vmin; color: var(--colorTexto); opacity: 0; }
</style>
<div id="p-caja"><div id="p-titulo" data-var-text="texto"></div></div>
<script>
  // Aquí ya existen: tl (la línea de tiempo de GSAP, en pausa), v (los valores: v.texto, v.color…),
  // W y H (el tamaño en píxeles) y DUR (lo que dura, en segundos). No crees otra línea de tiempo.
  const vmin = Math.min(W, H) / 100
  tl.set('#p-caja', { yPercent: -50 }, 0)
  tl.fromTo('#p-titulo', { opacity: 0, y: 4 * vmin }, { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(2)' }, 0.1)
  tl.to('#p-titulo', { opacity: 0, duration: 0.3 }, DUR - 0.3)
</script>
\`\`\`
- Recorte lo envuelve en la composición al tamaño del video del usuario (vertical u horizontal) y con la duración que
  él elija: usa SIEMPRE medidas relativas (vmin, %, W, H, DUR), nunca píxeles fijos ni tiempos que pasen de DUR.
- El fondo es transparente: no pongas un fondo de pantalla completa salvo que la pieza lo pida (un cierre, una
  transición); si lo pones, que se pueda quitar con un valor «si» (como conFondo en el ejemplo del cierre).
- Cada valor del usuario es una variable CSS (\`var(--color)\`) y está en \`v\`. Textos: \`data-var-text="id"\`; imágenes:
  \`<img data-var-src="logo" src="assets/logo.png">\`.
- Los ids y clases empiezan con \`p-\`. Todo lo que se ve depende solo del tiempo de \`tl\`: nada de Date.now(),
  setTimeout, setInterval, repeat: -1 ni Math.random() sin semilla (usa un generador con semilla, como el ejemplo).
- GSAP: NO pongas \`transform\` en el CSS de algo que GSAP mueve (lo pisa y se descentra): céntralo con
  \`tl.set(el, { xPercent: -50, yPercent: -50 }, 0)\`. Lo que aparece más tarde con \`fromTo\` lleva
  \`immediateRender: false\` (si no, se ve desde el cuadro 0). Lo que debe estar oculto al principio, \`opacity: 0\` en el CSS.
- Letras que funcionan sin internet: Inter, Montserrat, Poppins, Outfit, Nunito, Oswald, League Gothic, Archivo Black,
  Roboto, Open Sans, Lato, Playfair Display, EB Garamond, Space Mono, JetBrains Mono. Nada de imágenes ni letras de
  internet: dibuja con CSS y SVG, y usa solo el logo de \`assets/\`.
- Para el celular: textos de 4vmin o más, dentro del 90 % del cuadro, que no tapen el centro si no hace falta.

### pieza.json: su ficha (lo que el usuario podrá cambiar)
\`\`\`json
{
  "nombre": "Título con brillo",
  "para": "Una frase: para qué sirve y cómo se ve.",
  "categoria": "Mis animaciones",
  "duracion": { "defecto": 3, "min": 1.5, "max": 8 },
  "capa": { "x": 0.5, "y": 0.5, "ancho": 1 },
  "vars": [
    { "id": "texto", "tipo": "texto", "nombre": "Título", "defecto": "Hola" },
    { "id": "colorTexto", "tipo": "color", "nombre": "Color de la letra", "defecto": "#ffffff" },
    { "id": "color", "tipo": "color", "nombre": "Color de acento", "defecto": "marca" },
    { "id": "logo", "tipo": "imagen", "nombre": "Logo", "defecto": "marca" },
    { "id": "conFondo", "tipo": "si", "nombre": "Con fondo", "defecto": false },
    { "id": "numero", "tipo": "numero", "nombre": "Número", "defecto": 100 }
  ]
}
\`\`\`
- Tipos: texto, color (#rrggbb, o "marca" / "marca2" para los colores de la marca), imagen ("marca" = el logo), si, numero.
- Pon como variables los textos y colores que alguien querría cambiar; los textos por defecto, genéricos y en español.

## Cómo trabajas (obligatorio)
1. Mira \`ejemplos/\` (dos piezas que funcionan bien) y las referencias del usuario en \`referencias/\` si hay.
2. Escribe pieza.html y pieza.json.
3. Ejecuta \`node taller/probar.mjs\` (renderiza con los colores y el logo de la marca y deja \`revision/cuadros.png\`, ocho
   cuadros sobre un fondo de prueba, y \`revision/final.png\`). Si falla, lee el error y arréglalo.
4. MIRA las imágenes de \`revision/\` (ábrelas). Pregúntate como un director de arte: ¿se lee?, ¿está centrado y dentro
   del cuadro?, ¿las proporciones y el ritmo son buenos?, ¿algo aparece antes de tiempo o se corta?, ¿se ve profesional
   o se ve a plantilla barata? Corrige y vuelve al paso 3. Hazlo al menos dos veces.
5. Cuando esté bien, termina con una frase de lo que hiciste. No dejes renders en segundo plano.
`

/** El script que prueba la pieza: la envuelve como Recorte, la renderiza y deja cuadros para mirarla. */
export const PROBAR = `// Prueba la pieza como la animará Recorte: node taller/probar.mjs [segundos]
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const r = JSON.parse(readFileSync('taller/rutas.json', 'utf8'))
const pieza = JSON.parse(readFileSync('pieza.json', 'utf8'))
const fragmento = readFileSync('pieza.html', 'utf8')
const dur = Number(process.argv[2]) || pieza.duracion?.defecto || 3
const valores = {}
for (const x of pieza.vars ?? []) {
  let v = x.defecto
  if (x.tipo === 'color') v = v === 'marca' ? r.marca.primary : v === 'marca2' ? r.marca.secondary : v
  if (x.tipo === 'imagen') v = v === 'marca' && r.logo ? 'assets/logo.png' : ''
  if (x.tipo === 'si') v = v === true || v === 'true'
  if (x.tipo === 'numero') v = Number(v) || 0
  valores[x.id] = v
}
const dir = join(process.cwd(), 'taller', 'render')
rmSync(dir, { recursive: true, force: true })
mkdirSync(join(dir, 'assets'), { recursive: true })
if (r.logo && existsSync(r.logo)) copyFileSync(r.logo, join(dir, 'assets', 'logo.png'))
const guion = /<script>([\\s\\S]*?)<\\/script>/.exec(fragmento)?.[1] ?? ''
const cuerpo = fragmento.replace(/<script>[\\s\\S]*?<\\/script>/, '')
const tipo = (t) => (t === 'color' ? 'color' : t === 'numero' ? 'number' : t === 'si' ? 'boolean' : 'string')
const decl = (pieza.vars ?? []).map((x) => ({ id: x.id, type: tipo(x.tipo), label: x.nombre, default: valores[x.id] }))
const esc = (s) => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;')
const html = \`<!doctype html>
<html lang="es" data-composition-variables='\${esc(JSON.stringify(decl))}'>
<head><meta charset="UTF-8" /><meta name="viewport" content="width=\${r.ancho}, height=\${r.alto}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>* { margin: 0; padding: 0; box-sizing: border-box; } html, body { margin: 0; width: \${r.ancho}px; height: \${r.alto}px; overflow: hidden; background: transparent; } #root { position: relative; width: 100%; height: 100%; overflow: hidden; }</style>
</head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="\${dur.toFixed(2)}" data-width="\${r.ancho}" data-height="\${r.alto}">
\${cuerpo}
</div>
<script>
(function () {
  window.__timelines = window.__timelines || {}
  const tl = gsap.timeline({ paused: true })
  const W = \${r.ancho}, H = \${r.alto}, DUR = \${dur.toFixed(3)}
  const v = Object.assign(\${JSON.stringify(valores)}, (window.__hyperframes && window.__hyperframes.getVariables && window.__hyperframes.getVariables()) || {})
  \${guion}
  if (tl.duration() < DUR) tl.set({}, {}, DUR)
  window.__timelines['main'] = tl
})()
</script></body></html>\`
writeFileSync(join(dir, 'index.html'), html)
writeFileSync(join(dir, 'valores.json'), JSON.stringify(valores))
const salida = join(process.cwd(), 'taller', 'render.webm')
rmSync(salida, { force: true })
const enConsola = process.platform === 'win32'
const citar = (x) => (enConsola && /[\\s&()^]/.test(x) ? '"' + x + '"' : x)
const args = [...r.hf.slice(1), 'render', dir, '--format', 'webm', '--quality', 'draft', '--workers', '2', '--variables-file', join(dir, 'valores.json'), '-o', salida]
const h = spawnSync(citar(r.hf[0]), args.map(citar), { shell: enConsola, encoding: 'utf8', timeout: 8 * 60_000 })
if (h.status !== 0 || !existsSync(salida)) {
  console.log('NO SE PUDO ANIMAR. Lo que dijo HyperFrames:')
  console.log(String((h.stdout ?? '') + (h.stderr ?? '')).split('\\n').slice(-25).join('\\n'))
  process.exit(1)
}
mkdirSync('revision', { recursive: true })
const fondo = 'color=c=0x5a6170:s=' + r.ancho + 'x' + r.alto + ':d=' + dur
const f = (extra, archivo) =>
  spawnSync(r.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', fondo, '-c:v', 'libvpx-vp9', '-i', salida, '-filter_complex', '[0][1]overlay=shortest=1,' + extra, '-frames:v', '1', archivo], { encoding: 'utf8' })
const ancho = r.ancho > r.alto ? 480 : 270
f('fps=' + (8 / dur).toFixed(4) + ',scale=' + ancho + ':-2,tile=4x2:padding=6:color=white', join('revision', 'cuadros.png'))
spawnSync(r.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', fondo, '-c:v', 'libvpx-vp9', '-sseof', '-0.15', '-i', salida, '-filter_complex', '[0][1]overlay', '-frames:v', '1', join('revision', 'final.png')])
console.log('Listo: mira revision/cuadros.png (8 cuadros de 0 a ' + dur + ' s, de izquierda a derecha y de arriba abajo) y revision/final.png.')
`

/**
 * Crea (o cambia) una animación con el agente. `onLinea` cuenta lo que va haciendo. Devuelve la pieza guardada en
 * «Mis animaciones».
 */
export async function crearPiezaConAgente(p: PedidoPieza, onLinea: (t: string) => void, senal?: AbortSignal): Promise<PiezaAnimada> {
  const hf = comandoHyperframes()
  if (!hf) throw new Error('Para crear animaciones hace falta HyperFrames (o Node, que trae npx).')
  mkdirSync(carpetaPropias(), { recursive: true })
  // Dónde trabaja: la pieza propia que se cambia, o una nueva (copiando la de la app si se parte de una de ellas).
  const basePropia = p.base && carpetaDePieza(p.base)?.startsWith(carpetaPropias()) ? p.base : undefined
  const id = basePropia ?? `${limpio(p.peticion)}-${Date.now().toString(36)}`
  const dir = join(carpetaPropias(), id)
  mkdirSync(join(dir, 'taller'), { recursive: true })
  if (p.base && !basePropia) {
    const origen = carpetaDePieza(p.base)
    if (origen) for (const n of ['pieza.html', 'pieza.json']) copyFileSync(join(origen, n), join(dir, n))
  }
  // La guía (la leen Claude Code, Codex, Kimi y OpenCode), los ejemplos, la marca y la herramienta de prueba.
  writeFileSync(join(dir, 'AGENTS.md'), GUIA, 'utf8')
  writeFileSync(join(dir, 'CLAUDE.md'), GUIA, 'utf8')
  writeFileSync(join(dir, 'taller', 'probar.mjs'), PROBAR, 'utf8')
  for (const ej of ['cierre-logo', 'titulo-impacto', 'frase-pildora']) {
    const o = join(rutaScriptPython('piezas'), ej)
    if (!existsSync(o)) continue
    mkdirSync(join(dir, 'ejemplos', ej), { recursive: true })
    for (const n of ['pieza.html', 'pieza.json']) copyFileSync(join(o, n), join(dir, 'ejemplos', ej, n))
  }
  const logo = p.marca.logo && existsSync(p.marca.logo) ? join(dir, 'taller', `logo${extname(p.marca.logo).toLowerCase() || '.png'}`) : null
  if (logo) copyFileSync(p.marca.logo!, logo)
  const vertical = p.alto >= p.ancho
  const escala = Math.min(1, 1080 / Math.min(p.ancho, p.alto))
  const ancho = Math.round((p.ancho * escala) / 2) * 2
  const alto = Math.round((p.alto * escala) / 2) * 2
  writeFileSync(
    join(dir, 'taller', 'rutas.json'),
    JSON.stringify({ hf, ffmpeg: rutaFfmpeg(), ancho, alto, marca: { primary: p.marca.primary, secondary: p.marca.secondary }, logo }),
    'utf8'
  )
  // Las referencias del usuario: las imágenes tal cual; de cada video, una hoja de cuadros para mirarla de un vistazo.
  const imagenes: string[] = []
  const refs = (p.referencias ?? []).filter((r) => existsSync(r)).slice(0, 8)
  if (refs.length) mkdirSync(join(dir, 'referencias'), { recursive: true })
  refs.forEach((r, i) => {
    const ext = extname(r).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const d = join(dir, 'referencias', `ref-${i + 1}${ext}`)
      copyFileSync(r, d)
      imagenes.push(d)
    } else if (['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(ext)) {
      const d = join(dir, 'referencias', `ref-${i + 1}-cuadros.jpg`)
      spawnSync(rutaFfmpeg(), ['-v', 'error', '-y', '-i', r, '-vf', 'fps=2,scale=320:-2,tile=6x3', '-frames:v', '1', d])
      if (existsSync(d)) imagenes.push(d)
    }
  })
  const cambio = Boolean(p.base) && existsSync(join(dir, 'pieza.html'))
  const pedido = `${
    cambio
      ? `Esta carpeta ya tiene una animación (pieza.html y pieza.json). CÁMBIALA según lo que pide el usuario, sin rehacer lo que funciona:`
      : `Haz una animación nueva para el usuario. Lo que pide:`
  }
«${p.peticion}»

La marca: «${p.marca.nombre}», color principal ${p.marca.primary} ("marca"), segundo color ${p.marca.secondary} ("marca2")${
    logo ? ', y su logo (lo tienes en assets/logo.png al probar; usa una variable imagen con defecto "marca")' : ' (sin logo)'
  }.
Sus videos son ${vertical ? 'verticales (9:16, para el celular)' : 'horizontales (16:9)'}: la pieza tiene que verse bien así (y adaptarse si se usa en el otro formato).
${refs.length ? `Referencias del usuario en referencias/ (míralas: inspírate en su estilo y su ritmo, sin copiar marcas ni personajes).` : ''}
Lee AGENTS.md (cómo se hace y las reglas) y sigue sus pasos: escribe, prueba con \`node taller/probar.mjs\`, MIRA revision/cuadros.png,
corrige y repite hasta que se vea como hecha por un buen diseñador de motion.`
  // Si ya trabajó en esta pieza, se retoma su conversación (sabe lo que hizo).
  let sesion: SesionAgente | undefined
  try {
    sesion = JSON.parse(readFileSync(join(dir, 'taller', 'sesion.json'), 'utf8'))
  } catch {
    sesion = undefined
  }
  onLinea(cambio ? 'El agente está cambiando la animación' : 'El agente está diseñando la animación')
  const { trabajarAgente } = await import('./modoagente')
  const turno = await trabajarAgente(p.orden, dir, pedido, onLinea, senal, 25 * 60_000, imagenes, undefined, sesion, pedido)
  if (turno.sesion) writeFileSync(join(dir, 'taller', 'sesion.json'), JSON.stringify(turno.sesion), 'utf8')

  // Lo que entregó tiene que estar y animarse.
  if (!existsSync(join(dir, 'pieza.html')) || !existsSync(join(dir, 'pieza.json'))) throw new Error('El agente no dejó la animación (falta pieza.html o pieza.json).')
  let ficha: Record<string, unknown>
  try {
    ficha = JSON.parse(readFileSync(join(dir, 'pieza.json'), 'utf8'))
  } catch {
    throw new Error('El agente dejó pieza.json mal escrito.')
  }
  ficha.categoria = 'Mis animaciones'
  ficha.pedido = [typeof ficha.pedido === 'string' ? ficha.pedido : '', p.peticion].filter(Boolean).join(' · ').slice(-600)
  if (!Array.isArray(ficha.vars)) ficha.vars = []
  writeFileSync(join(dir, 'pieza.json'), JSON.stringify(ficha, null, 2), 'utf8')
  const pieza = listarPiezas().find((x) => x.id === id)
  if (!pieza) throw new Error('La animación del agente no se pudo leer.')
  onLinea('Recorte comprueba que se anima y le hace su muestra')
  await hacerMuestra(pieza, p.marca, ancho, alto)
  return listarPiezas().find((x) => x.id === id) ?? pieza
}

/** La muestra de una pieza (como las de la app): animada con la marca, sobre un fondo neutro, chica y en bucle. */
export async function hacerMuestra(pieza: PiezaAnimada, marca: { primary: string; secondary: string; logo?: string }, ancho: number, alto: number): Promise<void> {
  const carpeta = carpetaDePieza(pieza.id)
  if (!carpeta) return
  const trabajo = mkdtempSync(join(tmpdir(), 'recorte-muestra-'))
  try {
    const v = valoresConMarca(pieza, {}, marca)
    const imagenes = Object.fromEntries(pieza.vars.filter((x) => x.tipo === 'imagen').map((x) => [x.id, String(v[x.id] ?? '')]))
    const r = await renderizarPieza(trabajo, pieza.id, v, imagenes, ancho, alto, pieza.duracion.defecto)
    const [w, h] = ancho >= alto ? [480, 270] : [270, 480]
    const fondo = `gradients=s=${ancho}x${alto}:c0=0x3a4256:c1=0x1f2430:x0=0:y0=0:x1=${ancho}:y1=${alto}:d=${r.duracion}:speed=0.01:r=30`
    const f = spawnSync(rutaFfmpeg(), [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', fondo, '-c:v', 'libvpx-vp9', '-i', join(trabajo, r.archivo),
      '-filter_complex', `[0][1]overlay=shortest=1,scale=${w}:${h},format=yuv420p`, '-an', '-c:v', 'libx264', '-crf', '27', '-movflags', '+faststart',
      join(carpeta, 'muestra.mp4')
    ])
    if (f.status !== 0) throw new Error('No pude hacer la muestra.')
  } finally {
    try {
      rmSync(trabajo, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 })
    } catch {
      // Queda en temporales.
    }
  }
}

/** Borra una animación de «Mis animaciones» (las de la app no se borran). */
export function borrarPiezaPropia(id: string): boolean {
  const carpeta = carpetaDePieza(id)
  if (!carpeta || !carpeta.startsWith(carpetaPropias())) return false
  rmSync(carpeta, { recursive: true, force: true })
  return true
}

/** Las piezas propias (para limpiar renders viejos en el futuro, o listarlas). */
export const piezasPropias = (): string[] => (existsSync(carpetaPropias()) ? readdirSync(carpetaPropias()) : [])
