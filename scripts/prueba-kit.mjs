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
  // Las mismas frases otra vez: se reutilizan sin pedir nada (sin gastar cuota).
  const otraVez = json(correr(python, ['kit/kit.py', 'voz', 'voz/narracion.txt'], trabajo))
  const pedidosAhora = readdirSync(join(trabajo, 'voz')).filter((n) => /^pedido-/.test(n)).length
  if (!(otraVez.reutilizadas === 2 && otraVez.nuevas === 0 && pedidosAhora === 1 && otraVez.frases[0].archivo === frases[0].archivo))
    throw new Error(`Las frases repetidas no se reutilizaron: ${JSON.stringify(otraVez)}`)
  console.log('voz repetida: se reutiliza sin volver a pedirla ✓')

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

  // Render quirúrgico: se cambia solo el segundo momento; el siguiente render dibuja solo esos segundos y copia
  // el resto del anterior.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'smptebars=s=600x800', '-frames:v', '1', 'barras.jpg'], trabajo)
  const dos = (rotulo) => ({
    ancho: 270, alto: 480, fps: 12, duracion: 6, fundido_final: 0,
    momentos: [
      { tipo: 'foto', archivo: 'foto.jpg', desde: 0, hasta: 3, rotulo: 'Uno' },
      { tipo: 'foto', archivo: 'barras.jpg', desde: 3, hasta: 6, rotulo }
    ]
  })
  writeFileSync(join(trabajo, 'receta-q.json'), JSON.stringify({ ...dos('Dos'), salida: 'salida/q1.mp4' }))
  const q1 = json(correr(python, ['kit/kit.py', 'armar', 'receta-q.json'], trabajo))
  writeFileSync(join(trabajo, 'receta-q.json'), JSON.stringify({ ...dos('Otro rótulo'), salida: 'salida/q2.mp4' }))
  const q2 = json(correr(python, ['kit/kit.py', 'armar', 'receta-q.json'], trabajo))
  const [hechos, de] = /(\d+) de (\d+)/.exec(q2.dibujados).slice(1).map(Number)
  if (!(hechos < de * 0.7 && hechos > 0 && /render anterior/.test(q2.dibujados))) throw new Error(`El render no fue quirúrgico: ${JSON.stringify(q2)}`)
  const gris = (archivo, t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', archivo, '-frames:v', '1', '-vf', 'crop=270:110:0:0', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { cwd: trabajo })
    return [...r.stdout]
  }
  // Cuántos píxeles cambian de verdad (más de 40 niveles): el ruido de recomprimir no cuenta.
  const dif = (a, b) => a.filter((v, i) => Math.abs(v - b[i]) > 40).length
  const [igual, cambio] = [dif(gris(q1.salida, 1.5), gris(q2.salida, 1.5)), dif(gris(q1.salida, 4.5), gris(q2.salida, 4.5))]
  if (!(igual < 30 && cambio > 300)) throw new Error(`Render quirúrgico: lo que no cambió difiere ${igual}, lo cambiado ${cambio}`)
  console.log(`render quirúrgico: ${q2.dibujados}; lo demás, igual que antes ✓`)
  // Ubicar lo que nombra el usuario y revisar como un editor.
  const hallado = json(correr(python, ['kit/kit.py', 'donde', 'el otro rotulo', '--receta', 'receta-q.json'], trabajo))
  const h0 = hallado.hallados[0]
  if (!(h0 && h0.desde === 3 && h0.cuadro && existsSync(join(trabajo, h0.cuadro)))) throw new Error(`donde no lo ubicó: ${JSON.stringify(hallado)}`)
  const rev = json(correr(python, ['kit/kit.py', 'revisar', q2.salida, '--referencia', q1.salida], trabajo))
  if (!(rev.cortes >= 1 && rev.referencia && Object.values(rev.imagenes).every((p) => existsSync(join(trabajo, p))) && existsSync(join(trabajo, 'revision', 'revisar.md'))))
    throw new Error(`revisar no dejó lo que debía: ${JSON.stringify(rev)}`)
  console.log(`donde (${h0.donde} ${h0.n}, ${h0.desde}–${h0.hasta} s) y revisar (${rev.cortes} corte, ${Object.keys(rev.imagenes).length} hojas) ✓`)

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

  // Animar una imagen recortada (sin créditos): la bandera ondea en la receta y como WebM con transparencia.
  writeFileSync(
    join(trabajo, 'receta-animar.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 2, fundido_final: 0,
      momentos: [{ tipo: 'foto', archivo: 'blanco.jpg', desde: 0, hasta: 2, acercar: false }],
      capas: [{ archivo: 'logo.png', desde: 0, hasta: 2, x: 0.5, y: 0.5, ancho: 0.6, entrada: 'ninguna', animar: { tipo: 'ondear', fuerza: 1 } }]
    })
  )
  json(correr(python, ['kit/kit.py', 'armar', 'receta-animar.json', '--prueba', '0.3,1.3'], trabajo))
  const filaRoja = (t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `revision/prueba-${t}.jpg`, '-vf', 'crop=270:2:0:166,scale=270:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: trabajo })
    let n = 0
    for (let i = 0; i < r.stdout.length; i += 3) if (r.stdout[i] > 150 && r.stdout[i + 1] < 90) n++
    return n
  }
  if (filaRoja('00.30') === filaRoja('01.30')) throw new Error('La capa con «animar» no se movió entre dos momentos')
  const anim = json(correr(python, ['kit/kit.py', 'animar', 'logo.png', '--tipo', 'balanceo', '--duracion', '1'], trabajo))
  if (!existsSync(join(trabajo, anim.archivo)) || anim.margen !== 0.08) throw new Error(`La animación no salió: ${JSON.stringify(anim)}`)
  console.log('animar una imagen (ondear, balanceo) sin créditos ✓')

  // Escena 2.5D: la cámara panea a la derecha; una capa pegada al fondo (profundidad 0) se va a la
  // izquierda con él, una muy cercana (1) se va 2,5 veces más y una sin profundidad no se mueve.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x224466:s=600x1066,drawgrid=w=40:h=40:c=white', '-frames:v', '1', 'cielo.jpg'], trabajo)
  writeFileSync(
    join(trabajo, 'receta-escena.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 3, fundido_final: 0,
      momentos: [{ tipo: 'foto', archivo: 'cielo.jpg', desde: 0, hasta: 3, encuadre: { zoom: 1.4, cx: 0.45, cy: 0.5 }, camara: { zoom: 1.4, cx: 0.55, cy: 0.5 } }],
      capas: [
        { archivo: 'logo.png', desde: 0, hasta: 3, x: 0.5, y: 0.25, ancho: 0.12, entrada: 'ninguna', profundidad: 0 },
        { archivo: 'logo.png', desde: 0, hasta: 3, x: 0.5, y: 0.5, ancho: 0.12, entrada: 'ninguna' },
        { archivo: 'logo.png', desde: 0, hasta: 3, x: 0.5, y: 0.75, ancho: 0.12, entrada: 'ninguna', profundidad: 1, desenfoque: 0.5 }
      ]
    })
  )
  json(correr(python, ['kit/kit.py', 'armar', 'receta-escena.json', '--prueba', '0.5,2.9'], trabajo))
  const centroRojo = (t, y) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `revision/prueba-${t}.jpg`, '-vf', `crop=270:2:0:${y},scale=270:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { cwd: trabajo })
    let suma = 0
    let n = 0
    for (let i = 0; i < r.stdout.length; i += 3) if (r.stdout[i] > 170 && r.stdout[i + 1] < 70 && r.stdout[i + 2] < 70) (suma += i / 3), n++
    return n ? suma / n : NaN
  }
  const mueve = (y) => centroRojo('02.90', y) - centroRojo('00.50', y)
  const [lejos, fija, cerca] = [mueve(120), mueve(240), mueve(360)]
  if (!(lejos < -15 && Math.abs(fija) < 2 && cerca < lejos * 2)) throw new Error(`El paralaje no va bien: lejos ${lejos}, fija ${fija}, cerca ${cerca} px`)
  console.log(`escena 2.5D en el kit: el fondo y lo lejano se mueven ${Math.round(lejos)} px, lo cercano ${Math.round(cerca)} px, lo fijo ${Math.round(fija)} ✓`)

  // Marioneta: una figura dibujada (tronco gris, brazo derecho rojo separado del cuerpo) con su esqueleto dado
  // (sin el modelo). Al saludar, el brazo rojo se levanta y sale hacia fuera: hay rojo más allá del borde de la imagen.
  writeFileSync(
    join(trabajo, 'figura.py'),
    [
      'from PIL import Image, ImageDraw',
      "im = Image.new('RGBA', (200, 400), (0, 0, 0, 0))",
      'd = ImageDraw.Draw(im)',
      "d.ellipse((75, 10, 125, 70), fill=(220, 180, 150, 255))",
      "d.rectangle((60, 80, 140, 220), fill=(90, 90, 90, 255))",
      "d.rectangle((70, 220, 95, 380), fill=(40, 40, 60, 255))",
      "d.rectangle((105, 220, 130, 380), fill=(40, 40, 60, 255))",
      "d.rectangle((20, 85, 38, 230), fill=(90, 90, 90, 255))",
      "d.rectangle((162, 85, 180, 230), fill=(230, 20, 20, 255))",
      "d.rectangle((140, 82, 180, 100), fill=(230, 20, 20, 255))",
      "d.rectangle((38, 82, 60, 100), fill=(90, 90, 90, 255))",
      "im.save('figura.png')"
    ].join('\n')
  )
  correr(python, ['figura.py'], trabajo)
  const puntos = {
    nariz: [0.5, 0.1], ojo_i: [0.55, 0.09], ojo_d: [0.45, 0.09], hombro_i: [0.85, 0.23], hombro_d: [0.15, 0.23],
    codo_i: [0.855, 0.4], codo_d: [0.145, 0.4], muneca_i: [0.855, 0.55], muneca_d: [0.145, 0.55], mano_i: [0.855, 0.575],
    mano_d: [0.145, 0.575], cadera_i: [0.6, 0.55], cadera_d: [0.4, 0.55], rodilla_i: [0.6, 0.75], rodilla_d: [0.4, 0.75],
    tobillo_i: [0.6, 0.93], tobillo_d: [0.4, 0.93]
  }
  writeFileSync(join(trabajo, 'puntos.json'), JSON.stringify(puntos))
  const mar = json(correr(python, ['kit/kit.py', 'animar', 'figura.png', '--tipo', 'saludar', '--lado', 'derecha', '--puntos', 'puntos.json', '--duracion', '2', '--salida', 'saluda.webm'], trabajo))
  if (!(mar.escala > 1.4) || !existsSync(join(trabajo, 'saluda.webm'))) throw new Error(`La marioneta no salió: ${JSON.stringify(mar)}`)
  const rojoArriba = (t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(t), '-i', 'saluda.webm', '-frames:v', '1', '-vf', `crop=iw-${Math.round(mar.margen * 200) + 206}:ih:${Math.round(mar.margen * 200) + 206}:0`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { cwd: trabajo })
    let n = 0
    for (let i = 0; i < r.stdout.length; i += 4) if (r.stdout[i + 3] > 128 && r.stdout[i] > 170 && r.stdout[i + 1] < 80) n++
    return n
  }
  const [quieto, saluda] = [rojoArriba(0), rojoArriba(1.2)]
  if (!(quieto === 0 && saluda > 30)) throw new Error(`Al saludar, el brazo no sale: ${quieto} px rojos fuera al empezar y ${saluda} saludando`)
  // Gestos seguidos en la misma capa: primero habla (el brazo abajo) y luego saluda (el brazo fuera), sin cortar.
  writeFileSync(join(trabajo, 'secuencia.json'), JSON.stringify([{ tipo: 'hablar', hasta: 0.8 }, { tipo: 'saludar', lado: 'derecha' }]))
  const sec = json(correr(python, ['kit/kit.py', 'animar', 'figura.png', '--secuencia', 'secuencia.json', '--puntos', 'puntos.json', '--duracion', '2', '--salida', 'secuencia.webm'], trabajo))
  const fueraSec = (t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-ss', String(t), '-i', 'secuencia.webm', '-frames:v', '1', '-vf', `crop=iw-${Math.round(sec.margen * 200) + 206}:ih:${Math.round(sec.margen * 200) + 206}:0`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { cwd: trabajo })
    let n = 0
    for (let i = 0; i < r.stdout.length; i += 4) if (r.stdout[i + 3] > 128 && r.stdout[i] > 170 && r.stdout[i + 1] < 80) n++
    return n
  }
  const [hablando, saludando] = [fueraSec(0.4), fueraSec(1.8)]
  if (!(hablando === 0 && saludando > 30)) throw new Error(`La secuencia de gestos no pasó de hablar a saludar: ${hablando} y ${saludando} px fuera`)
  console.log(`secuencia de gestos en una capa: habla y luego saluda (${saludando} px fuera) ✓`)
  // Escena viva: la figura sobre un escenario (una imagen plana) → el escenario sin ella y la figura como capa.
  correr('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x5a4632:s=400x711,drawgrid=w=50:h=50:c=0x8a7050', '-i', 'figura.png', '-filter_complex', '[0][1]overlay=100:180', '-frames:v', '1', 'plana.png'], trabajo)
  const viva = json(correr(python, ['kit/kit.py', 'escena', 'plana.png', '--sin-flow', '--planos', '0'], trabajo))
  const capaPers = viva.capas.at(-1)
  if (!(existsSync(join(trabajo, viva.personaje)) && existsSync(join(trabajo, viva.fondo)) && viva.momento.tipo === 'foto' && capaPers.archivo === viva.personaje && Math.abs(capaPers.x - 0.5) < 0.1))
    throw new Error(`escena no separó la figura de su escenario: ${JSON.stringify(viva)}`)
  console.log(`escena viva: la figura (${capaPers.ancho} de ancho, x ${capaPers.x}) separada de su escenario ✓`)
  // Velocidad: una escena 2.5D con cámara, capas y filtros a 1080×1920 no puede tardar más de 1,5 s por cuadro en un
  // núcleo (antes de OpenCV tardaba más del doble). Si sube, algo volvió a hacerse lento.
  writeFileSync(
    join(trabajo, 'velocidad.py'),
    [
      'import json, sys, time',
      "sys.path.insert(0, 'kit')",
      'import kit',
      "r = json.load(open('receta-escena.json'))",
      "r.update(ancho=1080, alto=1920, filtros={'grano': 0.3, 'polvo': 0.2, 'vineta': 0.5, 'trama': 0.3})",
      "json.dump(r, open('receta-velocidad.json', 'w'))",
      "_, L, m, d = kit.cargar('receta-velocidad.json')",
      'kit.cuadro(L, m, 0.5, d, 0)',
      'a = time.time()',
      'for k in range(6): kit.cuadro(L, m, 1 + k / 12, d, 0)',
      "print(json.dumps({'por_cuadro': (time.time() - a) / 6}))"
    ].join(String.fromCharCode(10))
  )
  const vel = json(correr(python, ['velocidad.py'], trabajo))
  if (!(vel.por_cuadro < 1.5)) throw new Error(`El render se volvió lento: ${vel.por_cuadro.toFixed(2)} s por cuadro a 1080×1920`)
  console.log(`velocidad: ${vel.por_cuadro.toFixed(2)} s por cuadro a 1080×1920 en un núcleo ✓`)
  console.log(`marioneta: con el esqueleto dado, el brazo se levanta a saludar (${saluda} px fuera de la imagen), capa ${mar.escala}× más ancha ✓`)

  // Cámara en mano y profundidad de campo en el kit: el fondo se mueve solo (con la foto quieta) y se desenfoca.
  writeFileSync(
    join(trabajo, 'receta-camara.json'),
    JSON.stringify({
      ancho: 270, alto: 480, fps: 12, duracion: 3, fundido_final: 0,
      momentos: [{ tipo: 'foto', archivo: 'cielo.jpg', desde: 0, hasta: 3, acercar: false, encuadre: { zoom: 1.2 }, temblor: 1, campo: 1, foco: 1 }]
    })
  )
  json(correr(python, ['kit/kit.py', 'armar', 'receta-camara.json', '--prueba', '0.6,1.6'], trabajo))
  const filaGris = (t) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `revision/prueba-${t}.jpg`, '-vf', 'crop=270:2:0:240,scale=270:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { cwd: trabajo })
    return [...r.stdout]
  }
  const [f1, f2] = [filaGris('00.60'), filaGris('01.60')]
  const cambia = f1.reduce((s, v, i) => s + Math.abs(v - f2[i]), 0) / f1.length
  const salto = Math.max(...f1.slice(1).map((v, i) => Math.abs(v - f1[i])))
  if (!(cambia > 1 && salto < 60)) throw new Error(`Cámara en mano y foco: cambio ${cambia.toFixed(1)}, borde más duro ${salto} (la rejilla debía verse movida y borrosa)`)
  console.log(`cámara en mano y profundidad de campo en el kit (el fondo se mueve ${cambia.toFixed(1)} y su borde más duro es ${salto}) ✓`)

  // Recortes: un sujeto sobre verde croma (con un hueco por dentro) queda sin fondo, y el hueco también.
  correr('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x00B140:s=400x500', '-vf', "drawbox=x=100:y=80:w=200:h=340:color=0x3C2814:t=fill,drawbox=x=180:y=230:w=40:h=40:color=0x00B140:t=fill", '-frames:v', '1', 'croma.png'], trabajo)
  const rec = json(correr(python, ['kit/kit.py', 'recortar', 'croma.png'], trabajo))
  if (Math.abs(rec.ancho - 200) > 8 || Math.abs(rec.alto - 340) > 8) throw new Error(`El recorte no se ajustó al sujeto: ${JSON.stringify(rec)}`)
  const alfa = (x, y) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', rec.archivo, '-vf', `crop=1:1:${x}:${y},format=rgba`, '-f', 'rawvideo', '-'], { cwd: trabajo })
    return r.stdout[3]
  }
  // Con croma, el verde de dentro es fondo que se ve por un hueco: queda transparente; el sujeto, opaco.
  if (alfa(100, 170) > 10 || alfa(40, 60) < 250) throw new Error(`El croma no se quitó bien: hueco ${alfa(100, 170)}, sujeto ${alfa(40, 60)}`)
  const conSala = spawnSync(python, ['kit/kit.py', 'recortar', 'negro.jpg'], { cwd: trabajo, encoding: 'utf8' })
  if (conSala.status === 0) throw new Error('Una imagen de un solo color entera no tiene sujeto: debía decirlo')
  console.log(`recortes: el sujeto queda solo (${rec.ancho}×${rec.alto}), con sus huecos vacíos, y sin sujeto lo dice ✓`)
  console.log(`piezas de documental: título, etiqueta, palabras, objeto con giro 3D (${izq} frente a ${der}) y apiladas ✓`)
  console.log('prueba kit: ok')
} catch (error) {
  console.error(`prueba kit: error · ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
