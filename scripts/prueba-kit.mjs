import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * Prueba del kit del modo agente (python/kit/kit.py) con material generado por FFmpeg:
 * golpes de una música con pulsos, fotogramas de prueba y un video de 4 s con todas las piezas.
 * Uso: node scripts/prueba-kit.mjs
 */

const raiz = resolve(import.meta.dirname, '..')
const kit = join(raiz, 'python', 'kit', 'kit.py')
const dir = mkdtempSync(join(tmpdir(), 'recorte-kit-'))
const python = process.platform === 'win32' ? 'python' : 'python3'

function correr(orden, args, cwd = dir) {
  const r = spawnSync(orden, args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${orden} ${args.join(' ')} falló: ${(r.stderr || r.stdout).slice(-800)}`)
  return r.stdout
}
const json = (salida) => JSON.parse(salida.trim().split('\n').at(-1))

try {
  mkdirSync(join(dir, 'entrada'))
  // Dos «fotos» y un clip, y una música con un pulso cada 0,5 s.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1200x1600', '-frames:v', '1', 'entrada/antes.jpg'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=1600x1200', '-frames:v', '1', 'entrada/despues.jpg'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=640x360:d=3', '-pix_fmt', 'yuv420p', 'entrada/clip.mp4'])
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*220*t)*exp(-25*mod(t,0.5))':d=6", 'entrada/musica.wav'])

  const g = json(correr(python, [kit, 'golpes', 'entrada/musica.wav', '--n', '6']))
  const bien = g.golpes.filter((t) => Math.abs(t * 2 - Math.round(t * 2)) < 0.06).length
  if (bien < 4) throw new Error(`Los golpes no caen cada 0,5 s: ${JSON.stringify(g)}`)
  console.log(`golpes: ${g.golpes.join(', ')} s (tempo ${g.tempo}) ✓`)

  const receta = {
    ancho: 540,
    alto: 960,
    fps: 24,
    duracion: 4,
    musica: { archivo: 'entrada/musica.wav', hasta: 3.5, fundido: 0.2 },
    momentos: [
      { tipo: 'foto', archivo: 'entrada/antes.jpg', desde: 0, hasta: 1, rotulo: 'Antes', encuadre: { zoom: 1.2, cx: 0.4, cy: 0.5 }, tapar: [[0, 0, 0.3, 0.3]] },
      { tipo: 'comparar', antes: 'entrada/antes.jpg', despues: 'entrada/despues.jpg', desde: 1, hasta: 2, modo: 'deslizar', brillo: true },
      { tipo: 'video', archivo: 'entrada/clip.mp4', inicio: 0.5, desde: 2, hasta: 2.8, rotulo: 'Así' },
      { tipo: 'collage', fotos: ['entrada/antes.jpg', 'entrada/despues.jpg'], rotulos: ['antes', 'después'], columnas: 2, desde: 2.8, hasta: 4, brillo: [1] },
      { tipo: 'texto', lineas: ['UNA FRASE', 'DE PRUEBA'], destacar: 1, oscurecer: 0.7, desde: 3.2, hasta: 4 }
    ]
  }
  writeFileSync(join(dir, 'receta.json'), JSON.stringify(receta))

  const p = json(correr(python, [kit, 'armar', 'receta.json', '--prueba', '0.5,1.6,2.4,3.8']))
  if (p.pruebas.length !== 4 || !p.pruebas.every((r) => existsSync(join(dir, r)))) throw new Error(`Faltan fotogramas de prueba: ${JSON.stringify(p)}`)
  console.log('fotogramas de prueba: 4 en revision/ ✓')

  const v = json(correr(python, [kit, 'armar', 'receta.json']))
  if (v.ancho !== 540 || v.alto !== 960 || Math.abs(v.duracion - 4) > 0.15 || !v.audio) throw new Error(`El video no salió como se pidió: ${JSON.stringify(v)}`)
  if (!existsSync(join(dir, v.hoja))) throw new Error('No dejó la hoja de revisión.')
  console.log(`video: ${v.ancho}×${v.alto}, ${v.duracion} s, con audio y hoja de revisión ✓`)

  writeFileSync(join(dir, 'mala.json'), JSON.stringify({ momentos: [{ tipo: 'foto', archivo: 'entrada/no-existe.jpg' }] }))
  const r = spawnSync(python, [kit, 'armar', 'mala.json'], { cwd: dir, encoding: 'utf8' })
  if (r.status === 0 || !/no encuentro/.test(r.stderr)) throw new Error(`Una receta con un archivo que falta debía decirlo: ${r.stderr}`)
  console.log('receta con un archivo que falta: lo dice en claro ✓')

  // La voz: el kit deja el pedido en voz/ y espera a Recorte. Aquí se hace de Recorte (un tono
  // por frase) para probar el buzón y que `armar` mezcle cada frase en su segundo, con la música.
  const trabajo = join(dir, 'trabajo')
  mkdirSync(join(trabajo, 'kit'), { recursive: true })
  mkdirSync(join(trabajo, 'voz'), { recursive: true })
  copyFileSync(kit, join(trabajo, 'kit', 'kit.py'))
  writeFileSync(join(trabajo, 'voz', 'narracion.txt'), 'Primera frase de prueba.\n\nSegunda frase, un poco más larga.\n', 'utf8')
  const pedir = spawn(python, ['kit/kit.py', 'voz', 'voz/narracion.txt'], { cwd: trabajo })
  let dicho = ''
  pedir.stdout.on('data', (b) => (dicho += b))
  const fin = new Promise((ok) => pedir.on('close', ok))
  let id = null
  for (let i = 0; i < 100 && !id; i++) {
    await new Promise((ok) => setTimeout(ok, 100))
    id = readdirSync(join(trabajo, 'voz')).map((n) => /^pedido-(\w+)\.json$/.exec(n)?.[1]).find(Boolean) ?? null
  }
  if (!id) throw new Error('El kit no dejó el pedido de voz.')
  const pedido = JSON.parse(readFileSync(join(trabajo, 'voz', `pedido-${id}.json`), 'utf8'))
  if (pedido.frases.length !== 2) throw new Error(`El pedido debía traer 2 frases: ${JSON.stringify(pedido)}`)
  const frases = pedido.frases.map((texto, i) => {
    const archivo = `voz/${id}-0${i + 1}.wav`
    correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${330 + i * 110}:duration=${1 + i * 0.5}`, '-ar', '24000', '-ac', '1', archivo], trabajo)
    return { texto, archivo, duracion: 1 + i * 0.5 }
  })
  writeFileSync(join(trabajo, 'voz', `respuesta-${id}.json`), JSON.stringify({ ok: true, voz: 'Kore', frases, total: 2.5 }))
  if ((await fin) !== 0) throw new Error('`kit.py voz` falló con una respuesta buena.')
  const dada = json(dicho)
  if (!dada.ok || dada.frases.length !== 2 || dada.frases[1].archivo !== frases[1].archivo) throw new Error(`El kit no devolvió las frases: ${dicho}`)
  console.log('voz: el kit pide, espera y devuelve cada frase con su archivo ✓')

  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=600x800', '-frames:v', '1', 'foto.jpg'], trabajo)
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=5', 'musica.wav'], trabajo)
  writeFileSync(
    join(trabajo, 'receta.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 4,
      musica: { archivo: 'musica.wav' },
      voz: [{ archivo: frases[0].archivo, en: 0.3 }, { archivo: frases[1].archivo, en: 1.8 }],
      momentos: [{ tipo: 'foto', archivo: 'foto.jpg', desde: 0, hasta: 4 }]
    })
  )
  const conVoz = json(correr(python, ['kit/kit.py', 'armar', 'receta.json'], trabajo))
  if (!conVoz.audio || Math.abs(conVoz.duracion - 4) > 0.2) throw new Error(`El video con voz no salió bien: ${JSON.stringify(conVoz)}`)
  // La voz está donde se pidió: entre 0,3 y 1,3 s suena mucho más que la música sola (a 0.25) entre 3,5 y 4 s.
  const volumen = (desde, dura) => {
    const r = spawnSync('ffmpeg', ['-v', 'info', '-ss', String(desde), '-t', String(dura), '-i', conVoz.salida, '-af', 'volumedetect', '-f', 'null', '-'], { cwd: trabajo, encoding: 'utf8' })
    return Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1])
  }
  const [conFrase, sinFrase] = [volumen(0.4, 0.8), volumen(3.5, 0.4)]
  if (!(conFrase > sinFrase + 4)) throw new Error(`La voz no suena sobre la música: ${conFrase} dB con frase, ${sinFrase} dB sin ella`)
  console.log(`voz en el video: ${conFrase} dB con frase frente a ${sinFrase} dB de música sola ✓`)

  // Sin voz elegida, Recorte lo dice y el kit termina con ese motivo.
  writeFileSync(join(trabajo, 'voz', 'una.txt'), 'Otra frase.\n', 'utf8')
  const negado = spawn(python, ['kit/kit.py', 'voz', 'voz/una.txt'], { cwd: trabajo })
  let motivo = ''
  negado.stderr.on('data', (b) => (motivo += b))
  const finNegado = new Promise((ok) => negado.on('close', ok))
  let otro = null
  for (let i = 0; i < 100 && !otro; i++) {
    await new Promise((ok) => setTimeout(ok, 100))
    otro = readdirSync(join(trabajo, 'voz')).map((n) => /^pedido-(\w+)\.json$/.exec(n)?.[1]).find((x) => x && x !== id) ?? null
  }
  writeFileSync(join(trabajo, 'voz', `respuesta-${otro}.json`), JSON.stringify({ ok: false, error: 'El usuario eligió hacer este video SIN voz.' }))
  if ((await finNegado) === 0 || !/SIN voz/.test(motivo)) throw new Error(`Sin voz elegida, el kit debía decirlo: ${motivo}`)
  console.log('voz no elegida: el kit lo dice y no inventa otra ✓')

  // Capas encima y efectos de sonido: un cuadrado rojo arriba a la izquierda y un «pop» en el segundo 2.
  mkdirSync(join(trabajo, 'kit', 'sonidos'), { recursive: true })
  copyFileSync(join(raiz, 'python', 'sonidos', 'pop.wav'), join(trabajo, 'kit', 'sonidos', 'pop.wav'))
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=200x200', '-frames:v', '1', 'logo.png'], trabajo)
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=600x800', '-frames:v', '1', 'negro.jpg'], trabajo)
  writeFileSync(
    join(trabajo, 'receta-capas.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 3, salida: 'salida/capas.mp4', fundido_final: 0,
      momentos: [{ tipo: 'foto', archivo: 'negro.jpg', desde: 0, hasta: 3, acercar: false }],
      capas: [{ archivo: 'logo.png', desde: 1, hasta: 3, x: 0.25, y: 0.2, ancho: 0.3, entrada: 'fundido' }],
      sonidos: [{ sonido: 'pop', en: 2, volumen: 1 }]
    })
  )
  const conCapas = json(correr(python, ['kit/kit.py', 'armar', 'receta-capas.json'], trabajo))
  const pixel = (t, x, y) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', conCapas.salida, '-frames:v', '1', '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: trabajo })
    return [...r.stdout]
  }
  const [antesCapa, conCapa] = [pixel(0.5, 67, 96), pixel(2.5, 67, 96)]
  if (!(antesCapa[0] < 40 && conCapa[0] > 180 && conCapa[1] < 80)) throw new Error(`La capa no está donde se pidió: ${antesCapa} antes, ${conCapa} con ella`)
  const vol = (desde, dura) => {
    const r = spawnSync('ffmpeg', ['-v', 'info', '-ss', String(desde), '-t', String(dura), '-i', conCapas.salida, '-af', 'volumedetect', '-f', 'null', '-'], { cwd: trabajo, encoding: 'utf8' })
    return Number(/max_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -99)
  }
  if (!conCapas.audio || !(vol(1.95, 0.3) > vol(0.5, 0.5) + 20)) throw new Error(`El «pop» no suena en su segundo: ${vol(1.95, 0.3)} dB frente a ${vol(0.5, 0.5)} dB`)
  console.log('capas y sonidos: la capa aparece en su sitio y el «pop» suena en su segundo ✓')

  // Las piezas de documental: título de revista, etiqueta, palabras, objeto con giro 3D y fotos apiladas.
  writeFileSync(
    join(trabajo, 'receta-docu.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 5, salida: 'salida/docu.mp4', color_acento: '#D62828',
      momentos: [
        { tipo: 'objeto', archivo: 'logo.png', fondo: 'negro.jpg', desde: 0, hasta: 2, ancho: 0.5, giro: 40 },
        { tipo: 'titulo', desde: 0.1, hasta: 2, y: 0.85, subrayado: '#D62828', grano: true, lineas: [{ texto: 'Una pregunta', tam: 0.05 }, { texto: 'Marte', fuente: 'cursiva', tam: 0.2, color: '#D62828' }] },
        { tipo: 'etiqueta', desde: 0.5, hasta: 2, texto: 'NOMBRE', x: 0.6, y: 0.6 },
        { tipo: 'apiladas', fotos: ['negro.jpg', 'logo.png', 'negro.jpg'], fondo: '#202020', desde: 2, hasta: 3.5 },
        { tipo: 'palabras', desde: 3.5, hasta: 5, palabras: ['uno', 'dos', 'tres'], destacar: [1], entrada: 'pop' }
      ]
    })
  )
  const docu = json(correr(python, ['kit/kit.py', 'armar', 'receta-docu.json', '--prueba', '0.3,1.5,3.2,4.8'], trabajo))
  if (docu.pruebas.length !== 4) throw new Error(`Faltan fotogramas de las piezas de documental: ${JSON.stringify(docu)}`)
  // En pleno giro el objeto (rojo) no es un rectángulo recto: su borde izquierdo y derecho tienen distinto alto.
  const columna = (t, x) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `revision/prueba-${t}.jpg`, '-vf', `crop=2:480:${x}:0`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: trabajo })
    let rojos = 0
    for (let i = 0; i < r.stdout.length; i += 6) if (r.stdout[i] > 120 && r.stdout[i + 1] < 90) rojos++
    return rojos
  }
  const [izq, der] = [columna('00.30', 80), columna('00.30', 186)]
  if (!(Math.abs(izq - der) > 6)) throw new Error(`El objeto no entra girando en 3D: ${izq} y ${der} píxeles rojos a cada lado`)
  const conTodo = json(correr(python, ['kit/kit.py', 'armar', 'receta-docu.json'], trabajo))
  if (Math.abs(conTodo.duracion - 5) > 0.2) throw new Error(`El video de documental no salió: ${JSON.stringify(conTodo)}`)
  // Una capa que cruza de izquierda a derecha (con giro) y los filtros: la capa está donde dice el recorrido
  // y la viñeta oscurece la esquina.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=600x800', '-frames:v', '1', 'blanco.jpg'], trabajo)
  writeFileSync(
    join(trabajo, 'receta-mueve.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 3, fundido_final: 0,
      momentos: [{ tipo: 'foto', archivo: 'blanco.jpg', desde: 0, hasta: 3, acercar: false }],
      capas: [{ archivo: 'logo.png', desde: 0, hasta: 3, x: 0.2, y: 0.5, ancho: 0.2, entrada: 'ninguna', fin: { x: 0.8, y: 0.5, giro: 45 } }],
      filtros: { grano: 0.3, vineta: 0.9, trama: 0.3, polvo: 0.3, parpadeo: 0.2 }
    })
  )
  json(correr(python, ['kit/kit.py', 'armar', 'receta-mueve.json', '--prueba', '0.3,2.8'], trabajo))
  const px = (t, x, y) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `revision/prueba-${t}.jpg`, '-vf', `crop=4:4:${x}:${y},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: trabajo })
    return [...r.stdout]
  }
  const rojoK = (v) => v[0] > 150 && v[1] < 90
  if (!rojoK(px('00.30', 52, 238)) || rojoK(px('00.30', 214, 238))) throw new Error(`Al empezar, la capa debía estar a la izquierda: ${px('00.30', 52, 238)}`)
  if (!rojoK(px('02.80', 214, 238)) || rojoK(px('02.80', 52, 238))) throw new Error(`Al terminar, la capa debía estar a la derecha: ${px('02.80', 214, 238)}`)
  const [esq, cen] = [px('00.30', 1, 1), px('00.30', 133, 400)]
  if (!(esq[0] + 40 < cen[0])) throw new Error(`La viñeta no oscurece la esquina: ${esq} frente a ${cen}`)
  console.log('capas que se mueven y filtros en el kit ✓')

  // Un barrido entre dos momentos: a mitad, lo de antes a un lado y lo nuevo al otro.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=600x800', '-frames:v', '1', 'rojo.jpg'], trabajo)
  writeFileSync(
    join(trabajo, 'receta-barrido.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 3, fundido_final: 0,
      momentos: [
        { tipo: 'foto', archivo: 'blanco.jpg', desde: 0, hasta: 1.5, acercar: false },
        { tipo: 'foto', archivo: 'rojo.jpg', desde: 1.5, hasta: 3, acercar: false, transicion: 'barrido-izquierda', entra: 0.6 },
        { tipo: 'titulo', desde: 0, hasta: 3, entrada: 'palabras', lineas: ['una pregunta que se arma'] }
      ]
    })
  )
  json(correr(python, ['kit/kit.py', 'armar', 'receta-barrido.json', '--prueba', '1.75'], trabajo))
  const [bi, bd] = [px('01.75', 10, 100), px('01.75', 255, 100)]
  if (!(bi[1] > 200 && rojoK(bd))) throw new Error(`El barrido no empuja: ${bi} a la izquierda y ${bd} a la derecha`)
  console.log('transiciones con movimiento en el kit ✓')

  // Recortes: un sujeto sobre verde croma (con un bolsillo verde por dentro) queda sin fondo y sin agujeros.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x00B140:s=400x500', '-vf', "drawbox=x=100:y=80:w=200:h=340:color=0x3C2814:t=fill,drawbox=x=180:y=230:w=40:h=40:color=0x00B140:t=fill", '-frames:v', '1', 'croma.png'], trabajo)
  const rec = json(correr(python, ['kit/kit.py', 'recortar', 'croma.png'], trabajo))
  if (Math.abs(rec.ancho - 200) > 8 || Math.abs(rec.alto - 340) > 8) throw new Error(`El recorte no se ajustó al sujeto: ${JSON.stringify(rec)}`)
  const alfa = (x, y) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', rec.archivo, '-vf', `crop=1:1:${x}:${y},format=rgba`, '-f', 'rawvideo', '-'], { cwd: trabajo })
    return r.stdout[3]
  }
  if (alfa(100, 170) < 250) throw new Error(`El bolsillo verde dentro del sujeto no debía quitarse: alfa ${alfa(100, 170)}`)
  const conSala = spawnSync(python, ['kit/kit.py', 'recortar', 'negro.jpg'], { cwd: trabajo, encoding: 'utf8' })
  if (conSala.status === 0) throw new Error('Una imagen de un solo color entera no tiene sujeto: debía decirlo')
  console.log(`recortes: el sujeto queda solo (${rec.ancho}×${rec.alto}), sin agujeros, y sin sujeto lo dice ✓`)
  console.log(`piezas de documental: título, etiqueta, palabras, objeto con giro 3D (${izq} frente a ${der}) y apiladas ✓`)
  console.log('prueba kit: ok')
} catch (error) {
  console.error(`prueba kit: error · ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
