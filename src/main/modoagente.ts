import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { COSTO_CLIP, MAX_CLIPS_VEO, VOCES_GEMINI, type Creacion } from '../shared/creacion'
import { MODELO_CHATGPT, MODELOS_IMAGEN, modelosVideoVigentes } from '../shared/flow'
import { estiloPorId } from '../shared/estilos'
import {
  MAX_REGISTRO,
  clipsDelPlan,
  limiteDeUso,
  MAX_CLIPS_GUION,
  validarCharla,
  validarEntrega,
  type CharlaPlan,
  type EstadoModoAgente,
  type ResultadoAgente,
  type SesionAgente
} from '../shared/modoagente'
import { resolverBinario } from './binarios'
import { ejecutar } from './crear'
import { probeVideo } from './ffmpeg'
import { extraerJson, falloDeAgente, Parado, rechazoPorPolitica } from './ia'
import { agenteConHerramientas, SesionPerdida, turnoAgente } from './turnoagente'
import { mediosDisponibles } from './mediosagente'
import { buscarPython, rutaScriptPython, transcribirArchivo } from './transcribir'
import { PIEZAS_ENCIMA } from './recetaeditor'

/**
 * El modo agente (ver shared/modoagente.ts). Cada creación en este modo tiene su carpeta
 * `trabajo/` con los archivos originales del usuario en `entrada/`, un manual de trabajo
 * (AGENTS.md y CLAUDE.md: lo leen Claude Code, Codex, Kimi y OpenCode) y `salida/`, donde
 * el agente deja lo que hace. El agente se lanza con su carpeta como directorio de trabajo
 * y con permiso para usar herramientas sin preguntar, pero solo dentro de ella.
 */

export interface ConfigModoAgente {
  activa: boolean
  proveedor: 'api' | 'cli'
  comandoCli: string
}

export const carpetaTrabajo = (carpeta: string): string => join(carpeta, 'trabajo')

const EXT_VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.m4v']
const EXT_IMAGEN = ['.png', '.jpg', '.jpeg', '.webp']
const EXT_AUDIO = ['.mp3', '.wav', '.m4a', '.ogg', '.opus', '.aac', '.flac']

/** Un nombre de archivo sin sorpresas para la línea de comandos (sin espacios ni tildes). */
export function nombreLimpio(nombre: string, i: number): string {
  const ext = extname(nombre).toLowerCase()
  const base = basename(nombre, extname(nombre))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${String(i + 1).padStart(2, '0')}-${base || 'archivo'}${ext}`
}

/** Copia los archivos del usuario tal cual (sin convertir: el color y la calidad exactos). */
export function copiarEntrada(
  rutas: string[],
  carpeta: string,
  /** Cuántos archivos hay ya en entrada/ (al añadir más desde el chat, la numeración sigue). */
  yaHay = 0
): { archivo: string; nombre: string; tipo: 'imagen' | 'video' | 'audio' }[] {
  const entrada = join(carpetaTrabajo(carpeta), 'entrada')
  mkdirSync(entrada, { recursive: true })
  mkdirSync(join(carpetaTrabajo(carpeta), 'salida'), { recursive: true })
  const copiados: { archivo: string; nombre: string; tipo: 'imagen' | 'video' | 'audio' }[] = []
  for (const [j, ruta] of rutas.slice(0, Math.max(0, 80 - yaHay)).entries()) {
    const i = yaHay + j
    if (!existsSync(ruta)) continue
    const ext = extname(ruta).toLowerCase()
    const tipo = EXT_VIDEO.includes(ext) ? 'video' : EXT_IMAGEN.includes(ext) ? 'imagen' : EXT_AUDIO.includes(ext) ? 'audio' : null
    if (!tipo) continue
    const destino = nombreLimpio(basename(ruta), i)
    copyFileSync(ruta, join(entrada, destino))
    copiados.push({ archivo: `trabajo/entrada/${destino}`, nombre: basename(ruta), tipo })
  }
  return copiados
}

// ---------------------------------------------------------------------------
// El manual de trabajo
// ---------------------------------------------------------------------------

/**
 * Copia el kit (python/kit: kit.py y RECETA.md) a la carpeta de trabajo, con las rutas de FFmpeg
 * que debe usar. Devuelve si quedó (sin Python no sirve y no se ofrece).
 */
function copiarKit(trabajo: string): boolean {
  const origen = rutaScriptPython('kit')
  if (!existsSync(join(origen, 'kit.py'))) return false
  const destino = join(trabajo, 'kit')
  mkdirSync(destino, { recursive: true })
  for (const n of ['kit.py', 'RECETA.md']) copyFileSync(join(origen, n), join(destino, n))
  // Las letras de documental (Playfair Display, Anton), para `"fuente": "cursiva" | "serif" | "titular"`.
  const letras = rutaScriptPython('fuentes')
  if (existsSync(letras)) {
    mkdirSync(join(destino, 'fuentes'), { recursive: true })
    for (const n of readdirSync(letras)) copyFileSync(join(letras, n), join(destino, 'fuentes', n))
  }
  // Los efectos de sonido incluidos, para `"sonidos": [{ "sonido": "pop" }]` en la receta.
  const sonidos = rutaScriptPython('sonidos')
  if (existsSync(sonidos)) {
    mkdirSync(join(destino, 'sonidos'), { recursive: true })
    for (const n of readdirSync(sonidos)) if (n.endsWith('.wav')) copyFileSync(join(sonidos, n), join(destino, 'sonidos', n))
  }
  // El FFmpeg de Recorte, aunque no esté en el PATH del agente.
  writeFileSync(join(destino, 'rutas.json'), JSON.stringify({ ffmpeg: resolverBinario('ffmpeg'), ffprobe: resolverBinario('ffprobe') }))
  return true
}

async function herramientasDisponibles(): Promise<string[]> {
  const ffmpeg = resolverBinario('ffmpeg')
  const ffprobe = resolverBinario('ffprobe')
  const hf = resolverBinario('hyperframes')
  const py = await buscarPython()
  const lineas = [
    `- FFmpeg: ${ffmpeg ? `"${ffmpeg}"` : '`ffmpeg` (del PATH)'}${ffprobe ? ` · ffprobe: "${ffprobe}"` : ''}. Cortar, unir, escalar, filtros, mezclar audio, sacar fotogramas, medir.`,
    py
      ? `- Python: ${[py.cmd, ...py.args].map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' ')} (trae NumPy y OpenCV; si te falta un paquete como Pillow, instálalo con \`-m pip install\`). Para animar píxel a píxel: genera los cuadros y pásalos a FFmpeg por tubería (rawvideo rgb24).`
      : '- Python: no está instalado (no lo uses).',
    hf
      ? `- HyperFrames: "${hf}" (HTML + GSAP renderizado a video: tipografía, motion graphics, diseño). \`hyperframes render <carpeta> -o salida/x.mp4\`.`
      : '- HyperFrames: no está instalado (no lo uses).'
  ]
  return lineas
}

export async function escribirManual(carpeta: string, c: Creacion): Promise<void> {
  const trabajo = carpetaTrabajo(carpeta)
  mkdirSync(join(trabajo, 'salida'), { recursive: true })
  mkdirSync(join(trabajo, 'revision'), { recursive: true })
  const conKit = copiarKit(trabajo)
  const { ancho, alto } = c.formato === 'horizontal' ? { ancho: 1920, alto: 1080 } : { ancho: 1080, alto: 1920 }
  const manual = `# Manual de trabajo de Recorte

Eres el editor de video de Recorte. Trabajas en ESTA carpeta y en ninguna otra. Hablas en español.

## Lo que tienes
- \`entrada/\`: los archivos originales del usuario (no los modifiques ni los borres).
- \`salida/\`: donde dejas el resultado final.
- \`revision/\`: donde sacas fotogramas de tu resultado para comprobarlo.
- \`vistazo/\`: lo que preparó Recorte para mirar rápido (miniaturas, fotogramas, audio y LEEME.txt).
- \`notas.md\`: tus apuntes del plan (lo que ya viste y mediste).
${conKit ? '- `kit/`: piezas probadas de Recorte para hacer el video sin programarlo (lee `kit/RECETA.md`).\n' : ''}- Cualquier otro archivo de trabajo (scripts, composiciones, temporales) va aquí mismo, en esta carpeta.

Herramientas:
${(await herramientasDisponibles()).join('\n')}

## Trabaja rápido (como un editor con oficio)
- Mira primero \`vistazo/\` (léete \`vistazo/LEEME.txt\`): hojas con todas las fotos en miniatura y fotogramas de cada
  video, y el audio en WAV ligero. Abre un original de \`entrada/\` solo si necesitas un detalle concreto, y entonces
  recorta esa zona en vez de mirar la foto entera.
- Una pregunta, una medición corta: un script de segundos (ffprobe, el volumen cada 0,1 s, los golpes, el color de
  una zona). No recorras videos fotograma a fotograma ni repitas lo que ya mediste.
- Antes del render completo, genera unos pocos fotogramas clave, míralos y corrige. Renderiza entero solo al final.
- **Los renders, en primer plano y esperando a que terminen.** Nunca los lances en segundo plano (\`&\`, \`nohup\`,
  \`Start-Process\`, «run in background») ni termines tu turno «mientras se renderiza»: al acabar tu turno Recorte
  cierra tus procesos y el render se corta sin dejar el video. Si tarda, espera (tienes hasta 30 min por comando).
- Si hay \`notas.md\`, léelo: es lo que ya miraste en el plan. Apunta ahí lo que midas (tiempos, colores, zonas).

${
    conKit
      ? `## El kit: úsalo primero
Con \`kit/\` no programas el video: escribes \`receta.json\` (qué foto o video, cuándo, con qué rótulo y efecto) y
\`python kit/kit.py armar receta.json\` lo hace en UNA pasada, con la música, y deja \`revision/hoja-final.jpg\`.
Trae fotos a pantalla completa con encuadre y acercamiento, video, antes/después (deslizar, lado, arriba), collage,
frases con brillo, rótulos, desenfocar zonas, fundidos, la música recortada, capas encima (logos, íconos con su «pop»)
y efectos de sonido (whoosh, pop, ding…). Para mini documentales trae además títulos de revista (serif cursiva, sans
gruesa, palabra roja enorme, subrayado, grano), la etiqueta de papel con un nombre, palabras sueltas que flotan, un objeto
de museo bajo un foco que entra girando en 3D y fotos de archivo que caen apiladas. Lee \`kit/RECETA.md\` (es corto).
- **Si el usuario trae un video de referencia para copiar su estilo**, haz una lista de sus efectos (qué letra, qué color,
  cómo entra cada cosa, cada cuánto cambia la imagen) y pon al lado la pieza del kit que hace cada uno: casi todo está.
  Respeta su ritmo (en estos documentales, un cambio cada 1–1,5 s: parte una escena en dos o tres momentos con otro
  encuadre o con un título encima) y su jerarquía de letras. Lo que el kit no tenga, dilo en el resumen.
  Fíjate si sus escenarios están hechos de capas (el cielo, las montañas, una casa y la persona se mueven a distinta
  velocidad): eso es la **escena 2.5D** de RECETA.md (cada pieza recortada como capa con \`profundidad\` sobre una foto
  con la cámara en movimiento). Úsala en los momentos clave. Si su personaje se mueve (gesticula, saluda, asiente), usa la
  **marioneta** del kit (\`"animar": "hablar"\`, \`"saludar"\`… sin créditos; mira RECETA.md) y elige una **toma de cámara**
  por momento (acercarse, alejarse, travelling, grúa, cámara en mano, profundidad de campo).
- \`python kit/kit.py golpes <audio-o-video>\`: los golpes de la música y el tempo, para poner cada momento en su golpe.
- \`python kit/kit.py encuadre <foto> --zoom 1.3 --cx .5 --cy .5\`: cómo queda una foto a pantalla completa.
- \`python kit/kit.py armar receta.json --prueba 0.5,3,8\`: solo esos fotogramas, en segundos, para corregir antes.
Escribe código propio solo para lo que el kit no tenga, y aun así usa el kit para el resto.

`
      : ''
  }${seccionPlantilla(c, trabajo)}${await seccionHerramientas(c)}## El método (síguelo siempre)
1. **Entiende el pedido.** ¿Es un video para redes, un recurso para otro editor (sin textos, con croma…),
   una pieza corta? No impongas un formato: haz lo que se pide.
2. **Mira los archivos de verdad.** Abre cada imagen de \`entrada/\` y míralas. De los videos, usa ffprobe y
   saca fotogramas con FFmpeg para verlos. Si hay transcripción en el pedido, úsala.
3. **Mide lo que importe, no lo adivines.** Colores exactos (con Python), posiciones, tamaños, duraciones.
   Si hay un fondo de croma, mide su color exacto y CONSÉRVALO intacto: nada semitransparente, sombras ni
   brillos sobre el croma (se mezclan y luego no se recorta limpio).
4. **Elige la herramienta.** FFmpeg para montar y cortar; Python + FFmpeg para animar con control de cada
   píxel; HyperFrames para diseño, tipografía y motion graphics.
5. **Hazlo** y deja el resultado en \`salida/\`.
6. **Compruébalo antes de entregar.** Saca fotogramas del resultado (inicio, momentos clave y final) a
   \`revision/\`, MÍRALOS y mide lo que se pueda (duración, tamaño, que nada se recorte, que el croma siga
   uniforme si lo hay). Si algo falla, corrígelo y vuelve a comprobar. No entregues sin mirar.
7. **Entrega** escribiendo \`resultado.json\` en esta carpeta:
   \`{"archivo": "salida/<nombre>", "receta": "receta.json", "resumen": "qué hiciste, en 1-3 frases", "comprobaciones": ["qué comprobaste y cómo salió", "…"]}\`
   (\`receta\` solo si lo hiciste con el kit: con ella el usuario abre cada foto, rótulo y frase de voz suelta en su editor para retocarla a mano. Por eso, si el kit alcanza, úsalo.)

## La duración la decide el material, no una cifra
No hay duración por defecto: NO recortes a 30 s (ni a ninguna cifra) si el usuario no la pide.
- Si alguien habla a cámara, el video dura lo que dura su mensaje completo: quita pausas largas, repeticiones y
  tomas falladas, pero no cortes ideas ni frases a medias (si dice «Cangrejal La Ñañita Pink», que termine el «Pink»).
- Con fotos o clips sin voz, lo que pida la historia y el ritmo de la música; sin relleno.
- Di en el plan cuánto durará y por qué (p. ej. «~1:30: es lo que dura su explicación sin pausas»).

## Criterio de edición (lo que espera el usuario)
- **El orden cuenta la historia.** Cuando alguien anuncia algo («te voy a enseñar el parqueo»), la toma siguiente es
  justo eso. Ordena las tomas por sentido, no por el nombre del archivo.
- **Lo que se nombra, se ve en ese momento.** Si nombra una red social, una marca o un producto, su logo o su imagen
  aparece justo al nombrarlo, en el orden en que lo dice; si señala con la mano, ponlo donde señala (cerca, sin tapar el dedo).
- **Nada tapa la cara ni las manos.** En los planos cerrados (la cara cerca de la cámara), sube o aparta los rótulos e
  íconos. Mira los fotogramas para comprobarlo.
- **Subtítulos limpios.** Nunca dos a la vez en pantalla (cada bloque termina cuando empieza el siguiente) y nunca se
  salen del cuadro: si una frase no cabe, parte el bloque o achica la letra. Corrige lo que la transcripción entienda mal.
  Si el video lleva voz, lleva subtítulos de PRINCIPIO A FIN (todas las escenas, también las que cambies después).
- **Textos editables, nunca quemados.** Subtítulos y rótulos van EN LA RECETA (\`"subtitulos"\` y \`rotulo\` o momentos
  \`texto\`, ver kit/RECETA.md), no dibujados con un script propio sobre el video: así el usuario los cambia uno a uno en
  el editor (texto, letra, color, caja). Si haces algo que el kit no tiene, que el texto siga yendo en la receta.
- **Identidad de la marca.** Si hay logo, toma de él los colores y el estilo para rótulos y transiciones; el logo
  completo va solo donde lo pida el usuario (normalmente, al cierre).
- **Sonido en los momentos clave** (un golpe de aire en los cortes, un «pop» al aparecer un rótulo, una campana o caja
  registradora en precios y promociones), siempre por debajo de la voz. Los recursos que crees (íconos, efectos), hazlos tú.

## Formato por defecto (salvo que el pedido diga otra cosa)
Video ${ancho}×${alto} (${c.formato === 'horizontal' ? '16:9' : '9:16 vertical'}), 30 fps, H.264 (libx264, yuv420p, \`-movflags +faststart\`), audio AAC si hay audio.
Con croma en H.264 4:2:0, alinea los bordes del croma a píxeles pares (el color se guarda en bloques de 2×2).

## La narración que trajo el usuario
${
    c.adjuntos.some((a) => a.tipo === 'audio')
      ? `El usuario subió su narración grabada (vistazo/narracion-NN.wav, con lo que dice frase por frase y sus segundos en
vistazo/narracion-NN.txt y cada palabra en el .json). ESA es la voz del video: no generes otra voz ni la cambies, y el video
dura lo que ella (más el cierre). Recorta solo el silencio del principio y del final.
- Cada escena dura lo que su frase: usa los tiempos de la transcripción para poner cada imagen, clip y texto en su segundo.
- Corrige lo que la transcripción entendió mal según el sentido (p. ej. «para tu casa» → «para tu caso»).
- En la receta del kit va como una sola entrada de voz: \`"voz": [{ "archivo": "vistazo/narracion-01.wav", "en": 0 }]\`.
- Los subtítulos (en \`"subtitulos"\` de la receta) con los tiempos de las palabras del .json, restando lo que recortes del principio.`
      : 'No trajo narración grabada.'
  }

## La voz
${
    c.vozElegida && conKit
      ? `El usuario eligió la voz «${c.vozElegida}». Si el video lleva narración (casi siempre que explica o cuenta algo), la
genera Recorte con esa voz: escribe \`voz/narracion.txt\` (una frase por línea) y corre \`python kit/kit.py voz voz/narracion.txt\`.
Te devuelve cada frase con su archivo y su duración: ajusta cada momento a su frase y ponlas en \`"voz"\` de la receta
(lee «La voz» en \`kit/RECETA.md\`). No uses otra voz ni otro programa de voz. Si el video es solo música e imagen, no hace falta.`
      : 'El usuario eligió hacer este video SIN voz: no pongas narración ni generes voz por tu cuenta.'
  }

## Imágenes y clips generados
${(() => {
    const m = mediosDisponibles(c.flow)
    if (!conKit || (!m.imagenes && !m.clips)) {
      return 'El usuario no eligió generar imágenes ni clips: trabaja con sus archivos y con lo que diseñes con código (fondos, formas, tipografía).'
    }
    return [
      m.imagenes
        ? `- Imágenes con ${m.imagenes}: \`python kit/kit.py imagen "descripción" [--ref entrada/foto.jpg]\`. Úsalas cuando el video necesite algo que no está en sus archivos (una escena, un objeto, un fondo). Con \`--recorte\` sale sin fondo (un PNG para capas que se mueven: personas, objetos, aviones; mira kit/RECETA.md). Un clip con \`--recorte\` y \`--ref\` de esa imagen da el personaje MOVIÉNDOSE sin fondo (gasta créditos).`
        : '- Imágenes generadas: NO (el usuario no las eligió).',
      m.clips
        ? `- Clips de video con ${m.clips}: \`python kit/kit.py clip "descripción" [--ref …]\`. GASTAN créditos del usuario: solo los de las escenas "clip" del guion gráfico que aprobó (${clipsDelPlan(c.agente?.plan) ? `${clipsDelPlan(c.agente?.plan)} clips` : `${MAX_CLIPS_VEO} como mucho, para los momentos clave`}); en un cambio sobre lo ya hecho, los que el usuario pida en ese cambio (hasta ${MAX_CLIPS_GUION}), y en el resumen di cuántos fueron y cuánto costaron. Haz antes la imagen de cada escena y pásala con --ref al clip para que todo se vea coherente.`
        : '- Clips generados: NO (el usuario no los eligió).',
      'Lee «Imágenes y clips generados» en `kit/RECETA.md`. Sin texto escrito dentro de lo generado: los rótulos van en la receta.'
    ].join('\n')
  })()}

## Reglas
- No salgas de esta carpeta, no borres nada de \`entrada/\` y no toques archivos del sistema.
- No bajes material de internet con derechos de terceros ni uses servicios de pago por tu cuenta: lo generado se pide a Recorte (arriba).
- Si algo del pedido es ambiguo, elige lo más sensato para el objetivo y dilo en el resumen.
- Guarda los archivos de texto (receta.json, resultado.json, notas.md) en UTF-8 SIN BOM, con sus tildes y «comillas»:
  en PowerShell no uses Set-Content ni Out-File (agregan BOM o pierden las tildes); escríbelos con Python o con
  \`[IO.File]::WriteAllText(ruta, texto, (New-Object Text.UTF8Encoding $false))\`.
- Textos en pantalla solo si el pedido los pide o el tipo de video claramente los necesita.
`
  writeFileSync(join(trabajo, 'AGENTS.md'), manual, 'utf8')
  writeFileSync(join(trabajo, 'CLAUDE.md'), manual, 'utf8')
}

// ---------------------------------------------------------------------------
// Lanzar al agente en su carpeta
// ---------------------------------------------------------------------------

/**
 * El agente que trabajará con herramientas en la carpeta, o null si ese no puede (una API).
 * Antigravity va por ACP (Recorte le hace de «manos» solo dentro de su carpeta); los demás,
 * por su CLI con su adaptador (`turnoagente.ts`).
 */
export function comandoAgentico(base: string): { orden: string; agente: string; conSesion: boolean } | null {
  const a = agenteConHerramientas(base)
  return a ? { orden: base.trim(), ...a } : null
}

/** Lo que devuelve un turno del modo agente: la respuesta y la conversación para retomarla. */
export interface TurnoModoAgente {
  respuesta: string
  sesion?: SesionAgente
}

/**
 * El agente se quedó sin uso de su plan a mitad de un turno. `reanudar`: cuándo se renueva
 * (ms), si lo dijo. Lo que ya hizo sigue en su carpeta y su conversación sigue viva.
 */
export class LimiteUso extends Error {
  constructor(
    readonly reanudar: number | undefined,
    readonly detalle: string
  ) {
    super('Tu agente se quedó sin uso de su plan.')
    this.name = 'LimiteUso'
  }
}

/**
 * La plantilla del tipo de video (las tarjetas con estilo propio, como «Explicativo 3D»): si ya hay una
 * de videos anteriores, se parte de ella; si no, el agente la arma reutilizable y Recorte la guarda.
 */
function seccionPlantilla(c: Creacion, trabajo: string): string {
  const estilo = estiloPorId(c.estilo)
  if (!estilo.plantilla) return ''
  const hay = existsSync(join(trabajo, 'plantilla'))
  return `## La plantilla de «${estilo.nombre}»
Este tipo de video tiene su estilo visual propio y NO se hace con el kit (el kit no hace 3D): se hace con código
(HyperFrames con Three.js) dentro de \`plantilla/\`, en esta carpeta.
${
    hay
      ? `\`plantilla/\` es lo que funcionó en videos anteriores de este tipo. PARTE DE ELLA: cambia el contenido (textos,
momentos, tiempos, el personaje o los íconos si el tema es otro, los colores si la marca es otra) y conserva el diseño, la
cámara, las luces y las animaciones. No la rehagas desde cero: así sale igual de bien y gasta mucho menos.`
      : `Es la primera vez: arma \`plantilla/\` para que sirva a los siguientes videos. Separa los DATOS del video (qué pasa
en cada frase: texto, palabra clave, tiempos, qué hace el personaje, qué ícono o tarjetita aparece) en
\`plantilla/momentos.json\` del DISEÑO (escenas, personaje 3D, íconos, luces, cámara, colores) en el código, para que el
próximo video solo cambie los datos. Cuando el video salga bien, Recorte la guarda.`
  }
Aquí no hay receta del kit: los textos van dentro de la animación (en \`plantilla/momentos.json\`, para cambiarlos fácil).
Renderiza a \`salida/\` en primer plano (nada de renders en segundo plano) y comprueba fotogramas antes de entregar.

`
}

/**
 * Lanza al agente en su carpeta (ver `turnoConSesion`). Si se queda sin uso de su plan,
 * lo dice como error o como respuesta corta: en los dos casos sale `LimiteUso`.
 */
export async function trabajarAgente(
  ...args: Parameters<typeof turnoConSesion>
): Promise<TurnoModoAgente> {
  let turno: TurnoModoAgente
  try {
    turno = await turnoConSesion(...args)
  } catch (e) {
    if (e instanceof Parado || e instanceof LimiteUso) throw e
    const texto = e instanceof Error ? e.message : String(e)
    const limite = limiteDeUso(texto)
    if (limite) throw new LimiteUso(limite.reanudar, texto.slice(0, 300))
    throw e
  }
  const limite = turno.respuesta.length < 1500 ? limiteDeUso(turno.respuesta) : null
  if (limite) throw new LimiteUso(limite.reanudar, turno.respuesta.slice(0, 300))
  return turno
}

/**
 * Lanza al agente en su carpeta. Con `sesion` (del mismo agente) retoma esa conversación;
 * si ya no existe, empieza otra con `promptCompleto` (el pedido con todo el contexto).
 */
async function turnoConSesion(
  orden: string,
  cwd: string,
  prompt: string,
  onLinea: (texto: string) => void,
  senal?: AbortSignal,
  timeoutMs = 40 * 60_000,
  imagenes: string[] = [],
  entregaLista?: () => boolean,
  sesion?: SesionAgente,
  promptCompleto = prompt
): Promise<TurnoModoAgente> {
  const cmd = comandoAgentico(orden)
  if (!cmd) throw new Error('Este agente no sabe trabajar con herramientas en una carpeta.')
  let turno: TurnoModoAgente
  if (cmd.orden.startsWith('antigravity:acp')) {
    const [{ trabajarAntigravity }, { opcionesAntigravity }] = await Promise.all([import('./antigravity'), import('./modelos')])
    const respuesta = await trabajarAntigravity(promptCompleto, cwd, onLinea, senal, timeoutMs, imagenes, opcionesAntigravity(cmd.orden)).catch((e: unknown) => {
      if (e instanceof Parado) throw e
      throw new Error(falloDeAgente(cmd.orden, e instanceof Error ? e.message : String(e)))
    })
    turno = { respuesta }
  } else {
    const retomar = cmd.conSesion && sesion?.agente === cmd.agente ? sesion.id : undefined
    const lanzar = (conSesion?: string) =>
      turnoAgente({ base: cmd.orden, cwd, prompt: conSesion ? prompt : promptCompleto, sesion: conSesion, onLinea, senal, timeoutMs, entregaLista })
    let r
    try {
      r = await lanzar(retomar)
    } catch (e) {
      // La conversación ya no está (otra cuenta, se borró): se empieza otra con todo el contexto.
      if (!(e instanceof SesionPerdida)) throw e
      onLinea('La conversación anterior del agente ya no está: empiezo una nueva con todo el contexto')
      r = await lanzar(undefined)
    }
    const id = r.sesion ?? retomar
    turno = {
      respuesta: r.respuesta,
      ...(id
        ? {
            sesion: {
              agente: cmd.agente,
              id,
              ...(r.costoUsd !== undefined ? { costoUsd: r.costoUsd } : sesion?.costoUsd !== undefined ? { costoUsd: sesion.costoUsd } : {})
            }
          }
        : {})
    }
  }
  // Un rechazo del filtro de contenido llega como respuesta «normal» y corta: dilo en claro.
  const rechazo = turno.respuesta.length < 1500 ? rechazoPorPolitica(turno.respuesta) : null
  if (rechazo) throw new Error(rechazo)
  return turno
}

// ---------------------------------------------------------------------------
// Los pasos
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// El vistazo: lo que Recorte prepara para que el agente no tenga que abrir los originales
// ---------------------------------------------------------------------------

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/**
 * `trabajo/vistazo/`: una hoja con todas las fotos en miniatura (fotos.jpg), una hoja de
 * fotogramas por video (video-NN.jpg), el audio de cada video en WAV ligero (audio-NN.wav,
 * 16 kHz mono, para medir golpes o transcribir rápido) y LEEME.txt con qué es cada cosa.
 * Mirar esto cuesta segundos; abrir las fotos de 12 MP y recorrer los videos, minutos.
 */
export async function prepararVistazo(c: Creacion, carpeta: string): Promise<string[]> {
  const trabajo = carpetaTrabajo(carpeta)
  const dir = join(trabajo, 'vistazo')
  const leeme = join(dir, 'LEEME.txt')
  const hojas: string[] = []
  if (existsSync(leeme)) {
    for (const n of readdirSync(dir)) if (/^(fotos|video-\d+)\.jpg$/.test(n)) hojas.push(join(dir, n))
    return hojas
  }
  mkdirSync(join(dir, 'tmp'), { recursive: true })
  const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
  const lineas: string[] = ['Vistazo que preparó Recorte (míralo antes que los originales de entrada/):', '']

  const fotos = c.adjuntos.filter((a) => a.tipo === 'imagen')
  if (fotos.length) {
    const lista: string[] = []
    for (const a of fotos) {
      // Numeradas seguidas (solo las que salen): una secuencia con huecos se corta ahí.
      const mini = join(dir, 'tmp', `m${String(lista.length + 1).padStart(2, '0')}.jpg`)
      // Todas del mismo tamaño y formato de color (las JPG del móvil y las HEIC convertidas
      // no coinciden, y FFmpeg corta la hoja al primer cambio).
      const r = await ejecutar(
        [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${join(carpeta, a.archivo)}"`, '-frames:v', '1', '-vf',
          `"scale=360:480:force_original_aspect_ratio=decrease,pad=360:480:(ow-iw)/2:(oh-ih)/2:black,format=yuvj420p"`, '-q:v', '4', `"${mini}"`],
        trabajo,
        60_000
      )
      if (r.codigo === 0 && existsSync(mini)) lista.push(`  ${lista.length + 1}. ${a.archivo.replace(/^trabajo\//, '')} («${a.nombre}»)`)
    }
    const columnas = Math.min(4, Math.max(1, lista.length))
    const filas = Math.ceil(lista.length / columnas)
    const r = !lista.length ? { codigo: 1 } : await ejecutar(
      [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${join(dir, 'tmp', 'm%02d.jpg')}"`, '-vf', `tile=${columnas}x${filas}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', `"${join(dir, 'fotos.jpg')}"`],
      trabajo,
      60_000
    )
    if (r.codigo === 0) {
      hojas.push(join(dir, 'fotos.jpg'))
      lineas.push(`fotos.jpg: las ${lista.length} fotos en miniatura, de izquierda a derecha y de arriba abajo:`, ...lista, '')
    }
  }

  for (const [i, a] of c.adjuntos.filter((x) => x.tipo === 'video').entries()) {
    const n = String(i + 1).padStart(2, '0')
    const ruta = join(carpeta, a.archivo)
    let info = ''
    try {
      const v = await probeVideo(ruta)
      info = `${mmss(v.duration)} (${v.duration.toFixed(2)} s), ${v.width}×${v.height}, ${v.hasAudio ? 'con audio' : 'sin audio'}`
      const fps = Math.max(0.05, 12 / Math.max(1, v.duration))
      const r = await ejecutar(
        [`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vf', `fps=${fps.toFixed(4)},scale=240:-2,tile=6x2:padding=4:color=white`, '-frames:v', '1', '-q:v', '4', `"${join(dir, `video-${n}.jpg`)}"`],
        trabajo,
        120_000
      )
      if (r.codigo === 0) hojas.push(join(dir, `video-${n}.jpg`))
      if (v.hasAudio) {
        await ejecutar([`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vn', '-ac', '1', '-ar', '16000', `"${join(dir, `audio-${n}.wav`)}"`], trabajo, 120_000)
      }
    } catch {
      info = 'no se pudo leer'
    }
    lineas.push(
      `video-${n}.jpg: 12 fotogramas repartidos de ${a.archivo.replace(/^trabajo\//, '')} («${a.nombre}») — ${info}.`,
      ...(existsSync(join(dir, `audio-${n}.wav`)) ? [`audio-${n}.wav: su audio en WAV 16 kHz mono (para medir golpes o transcribir rápido).`] : []),
      ''
    )
  }
  // Una narración grabada: el video se arma sobre ella, frase por frase con sus tiempos.
  for (const [i, a] of c.adjuntos.filter((x) => x.tipo === 'audio').entries()) {
    const n = String(i + 1).padStart(2, '0')
    const ruta = join(carpeta, a.archivo)
    const wav = join(dir, `narracion-${n}.wav`)
    await ejecutar([`"${ffmpeg}"`, '-y', '-v', 'error', '-i', `"${ruta}"`, '-vn', '-ac', '1', '-ar', '48000', `"${wav}"`], trabajo, 120_000)
    const json = join(dir, `narracion-${n}.json`)
    const r = existsSync(wav) ? await transcribirArchivo(wav, json, () => {}) : { ok: false as const }
    let frases = ''
    let dura = ''
    if (r.ok && existsSync(json)) {
      try {
        const t = JSON.parse(readFileSync(json, 'utf8').replace(/^\uFEFF/, '')) as { duration?: number; segments?: { start: number; end: number; text: string }[] }
        dura = t.duration ? `, dura ${t.duration.toFixed(2)} s` : ''
        frases = (t.segments ?? []).map((s) => `  [${s.start.toFixed(2)}–${s.end.toFixed(2)}] ${s.text.trim()}`).join('\n')
        writeFileSync(join(dir, `narracion-${n}.txt`), frases + '\n', 'utf8')
      } catch {
        // Sin transcripción legible, el agente la oye por su cuenta.
      }
    }
    lineas.push(
      `narracion-${n}.wav: la NARRACIÓN que grabó el usuario (${a.archivo.replace(/^trabajo\//, '')}, «${a.nombre}»${dura}). El video se arma sobre ella.`,
      ...(frases
        ? [`narracion-${n}.txt y .json: lo que dice, frase por frase con sus segundos (el .json trae cada palabra con su tiempo). Corrige lo que la transcripción entendió mal según el sentido.`, frases]
        : ['(No pude transcribirla: transcríbela tú o escúchala con el audio en WAV.)']),
      ''
    )
  }
  rmSync(join(dir, 'tmp'), { recursive: true, force: true })
  writeFileSync(leeme, lineas.join('\n'), 'utf8')
  return hojas
}

/** Lo que ven en el pedido los agentes que reciben imágenes (Antigravity): las hojas del vistazo, no los originales. */
async function imagenesDeEntrada(c: Creacion, carpeta: string): Promise<string[]> {
  return prepararVistazo(c, carpeta)
}

function contexto(c: Creacion): string {
  const archivos = c.adjuntos.length
    ? c.adjuntos
        .map((a) => `- ${a.archivo.replace(/^trabajo\//, '')} (${a.tipo === 'imagen' ? 'imagen' : a.tipo === 'audio' ? 'audio: su narración grabada' : 'video'}, «${a.nombre}»)`)
        .join('\n')
    : '- (ninguno: el usuario no subió archivos)'
  const charla = c.mensajes
    .slice(-12)
    .map((m) => `${m.rol === 'usuario' ? 'Usuario' : 'Tú'}: ${m.texto}`)
    .join('\n')
  // La tarjeta de tipo de video que eligió en «Crear con IA»: su dirección editorial.
  const estilo = estiloPorId(c.estilo)
  const tipo =
    estilo.id !== 'libre'
      ? `\n\nTIPO DE VIDEO QUE ELIGIÓ: «${estilo.nombre}» (${estilo.descripcion}). Síguelo como dirección editorial, salvo que su pedido o la charla digan otra cosa :\n${estilo.guia}`
      : ''
  return `PEDIDO ORIGINAL DEL USUARIO:\n"""\n${c.peticion}\n"""\n\nArchivos en entrada/:\n${archivos}${tipo}\n\nFormato elegido en la app: ${c.formato === 'horizontal' ? 'horizontal 16:9' : 'vertical 9:16'}, duración: la que pida el usuario; si no la dice, la decides tú según el material y lo que se cuenta (lee «La duración la decide el material» en AGENTS.md), sin recortar a una cifra fija.${charla ? `\n\nConversación hasta ahora:\n${charla}` : ''}`
}

/** Lo último que dijo el usuario en la conversación (para el turno que retoma la sesión). */
function ultimoDelUsuario(c: Creacion): string {
  return [...c.mensajes].reverse().find((m) => m.rol === 'usuario')?.texto ?? ''
}

const FORMATO_PLAN = `{"sugiere": {"voz": "Kore (solo si no eligió voz)", "imagenes": true, "clips": 3, "porque": "para qué, en una frase (solo lo conectado y NO elegido que mejoraría el video; si nada, omite sugiere)"}, "mensaje": "lo que le dices al usuario en el chat", "propuestas": ["respuestas cortas que puede tocar"], "entendi": "qué vas a hacer, en 1-2 frases, con los datos que mediste", "pasos": ["paso corto", "…"], "preguntas": ["lo que aún necesitas saber (vacío si nada)"], "herramienta": "Kit de Recorte | FFmpeg | Python + FFmpeg | HyperFrames | …", "escenas": [{"texto": "lo que se dice en esta escena", "desde": 0.0, "hasta": 3.2, "medio": "clip | imagen | material | diseno", "visual": "qué se ve, en palabras del usuario", "prompt": "el prompt para el generador (si es clip o imagen)"}]}`

/** Cuándo y cómo arma el guion gráfico (las escenas) en el plan. */
function comoGuionGrafico(c: Creacion): string {
  const m = mediosDisponibles(c.flow)
  const narracion = c.adjuntos.some((a) => a.tipo === 'audio')
  if (!m.imagenes && !m.clips) {
    return narracion
      ? 'El usuario trajo su narración grabada: en "escenas" pon una por frase con sus segundos (desde/hasta de vistazo/narracion-NN.txt) y qué se ve, con su material o con diseño (no eligió generar imágenes ni clips).'
      : ''
  }
  return `GUION GRÁFICO: como el video se hace con ${[m.imagenes && `imágenes de ${m.imagenes}`, m.clips && `clips de ${m.clips}`].filter(Boolean).join(' y ')}, el plan trae "escenas":
- Una escena por frase o idea del guion${narracion ? ' (el de su narración grabada: usa los segundos de vistazo/narracion-NN.txt para desde/hasta)' : ' (si el usuario pegó su guion, respétalo palabra por palabra; si no, escríbelo tú)'}.
- Cada escena dice qué se ve ("visual", corto y claro para el usuario) y su "prompt" para el generador (en inglés, detallado:
  sujeto, acción, encuadre, luz, estilo; sin texto escrito dentro). "medio": "clip" para lo que tiene que moverse
  (una acción, un proceso), "imagen" para lo que puede ser un plano fijo con movimiento de cámara, "material" si usas
  un archivo suyo, "diseno" para textos, logo o cierre.
- Los clips duran hasta 8 s: una escena más larga va en dos clips o con una imagen; una más corta se recorta.
- Para que todas las escenas se vean coherentes (el mismo diente, la misma persona, el mismo lugar), define al principio
  del guion gráfico el estilo común y repítelo en cada prompt; y haz primero la imagen de la escena y pásala con --ref al clip.
${m.clips ? `- En "mensaje" dile cuántos clips son y lo que cuestan (${m.clips}: ${costoClips(c)} por clip), y que solo se generan cuando diga «Hazlo». Como mucho ${MAX_CLIPS_GUION} clips.` : ''}`
}

/** El costo por clip del modelo elegido, en palabras. */
function costoClips(c: Creacion): string {
  const modelo = c.flow?.modeloVideo
  const costo = modelo ? COSTO_CLIP[modelo] : undefined
  return costo ? `${costo} créditos` : 'unos créditos'
}

/** Lo que el usuario tiene conectado en Recorte (lo pone index.ts: voz, Flow, ChatGPT). */
export interface Conectadas {
  voz: boolean
  flow: boolean
  chatgpt: boolean
}
let leerConectadas: () => Promise<Conectadas> = async () => ({ voz: false, flow: false, chatgpt: false })
export function definirConectadas(fn: () => Promise<Conectadas>): void {
  leerConectadas = fn
}

/**
 * Todas sus herramientas, elegidas o solo conectadas: el agente usa lo elegido y propone lo que
 * mejoraría el video (con un botón para activarlo). Nunca usa lo que el usuario no activó.
 */
async function seccionHerramientas(c: Creacion): Promise<string> {
  const k = await leerConectadas().catch(() => ({ voz: false, flow: false, chatgpt: false }))
  const m = mediosDisponibles(c.flow)
  const fotos = c.adjuntos.filter((a) => a.tipo === 'imagen').length
  const videos = c.adjuntos.filter((a) => a.tipo === 'video').length
  const narracion = c.adjuntos.some((a) => a.tipo === 'audio')
  const costos = modelosVideoVigentes()
    .map((x) => `${x} ${COSTO_CLIP[x] ?? '?'} créditos`)
    .join(', ')
  const linea = (nombre: string, elegido: string | null, conectado: boolean, detalle: string) =>
    `- ${nombre}: ${elegido ? `ELEGIDO (${elegido}).` : conectado ? `conectado pero NO elegido (${detalle}).` : 'no está conectado.'}`
  return `## Todas tus herramientas (úsalas para el mejor resultado)
${linea('Voz que narra', c.vozElegida ?? null, k.voz, `voces de Gemini: ${VOCES_GEMINI.map((v) => v.id).join(', ')}`)}
${linea('Imágenes generadas', m.imagenes ?? null, k.flow || k.chatgpt, [k.flow && `Google Flow: ${MODELOS_IMAGEN.join(', ')} (gratis)`, k.chatgpt && `ChatGPT: ${MODELO_CHATGPT}`].filter(Boolean).join('; '))}
${linea('Clips generados', m.clips ?? null, k.flow, `Google Flow: ${costos}`)}
- Su material: ${fotos} ${fotos === 1 ? 'foto' : 'fotos'}, ${videos} ${videos === 1 ? 'video' : 'videos'}${narracion ? ' y su narración grabada' : ''}.
Lo ELEGIDO lo usas. Lo conectado pero NO elegido todavía no lo puedes usar (Recorte no atiende el pedido), pero si
mejoraría el video, PROPÓNSELO: en la charla, en "mensaje" (para qué y cuánto cuesta) y en "sugiere" del plan; el usuario
lo activa con un botón y vale desde el siguiente turno. Si no hay voz, ni narración, ni material, y la voz está conectada,
propón narrar. Si estás haciendo el video sin charla («Hazlo directo»), no lo uses: al final del resumen di qué habría
mejorado con lo que tiene conectado.

`
}

/** Cómo conversa el agente antes de hacer el video, según lo que eligió el usuario en la caja. */
function comoConversar(c: Creacion): string {
  if (c.directo === true) {
    return `El usuario eligió «Hazlo directo»: NO le preguntes nada. Decide tú lo más sensato en lo que dudes, deja "preguntas" vacío y en "mensaje" cuéntale en 1-2 frases qué vas a hacer (y lo que decidiste por él). Recorte empieza el video en cuanto respondas.`
  }
  return `El usuario eligió «Pregúntame antes»: quiere CONVERSAR contigo hasta llegar al mejor video, como con un editor de verdad.
En "mensaje" háblale con naturalidad y en tono cercano (tutéalo): lo que viste en sus archivos que importa, tu idea (gancho del
inicio, estructura, ritmo, estilo de textos y subtítulos, música, sonidos, cierre) y, si de verdad cambia el resultado, hasta 3
preguntas concretas con opciones («¿cierras con el logo o con el teléfono?»). Sin rodeos ni listas eternas.
En "propuestas" pon de 2 a 4 respuestas cortas que pueda tocar (por ejemplo las opciones de tu pregunta; y «Hazlo» cuando el plan esté listo).
El plan ("entendi", "pasos") va siempre al día con lo que hayan hablado. No hagas el video hasta que el usuario diga «Hazlo».
${generarEnCharla(c)}`
}

/** Lo que puede generar en plena charla (imágenes, clips), según lo que eligió el usuario en la caja. */
function generarEnCharla(c: Creacion): string {
  const m = mediosDisponibles(c.flow)
  if (!m.imagenes && !m.clips) {
    return 'Si te pide una imagen o un clip generado, dile que elija un modelo en «Imágenes» o «Clips» de la caja del chat y te lo vuelva a pedir.'
  }
  return [
    'Si en la charla te pide una imagen o un clip (o quieres enseñarle una idea), genéralo YA con el kit y cuéntale cómo salió: se le muestra en el chat.',
    m.imagenes ? `- Imagen: \`python kit/kit.py imagen "descripción detallada"\` (con ${m.imagenes}; puedes pasar --ref con sus fotos).` : '',
    m.clips
      ? `- Clip: \`python kit/kit.py clip "descripción"\` (con ${m.clips}). Gasta créditos: ANTES de pedirlo dile cuántos clips y cuánto cuestan y espera su «sí».`
      : '',
    'Escribe tú la descripción para el generador (detallada, sin texto dentro de la imagen) y, si no salió bien, rehazla una vez.'
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Paso 1: la charla del plan. El agente mira los archivos, conversa con el usuario y deja el
 * plan al día; cada respuesta del usuario es otro turno de la misma conversación. No produce nada.
 */
export async function pasoPlan(
  c: Creacion,
  carpeta: string,
  config: ConfigModoAgente,
  onLinea: (t: string) => void,
  senal?: AbortSignal
): Promise<{ charla: CharlaPlan; sesion?: SesionAgente }> {
  const trabajo = carpetaTrabajo(carpeta)
  const cmd = config.activa && config.proveedor === 'cli' ? comandoAgentico(config.comandoCli) : null
  if (!cmd) throw new Error('El modo agente necesita un agente que trabaje con herramientas (Claude Code, Antigravity, Kimi, Codex u OpenCode). Conéctalo en Inicio.')
  await escribirManual(carpeta, c)
  onLinea('Recorte prepara un vistazo de tus archivos')
  await prepararVistazo(c, carpeta)
  const completo = `Lee AGENTS.md (tu manual). Esto es SOLO LA CHARLA DEL PLAN: un vistazo rápido, de pocos minutos.
Mira vistazo/LEEME.txt y las hojas de vistazo/ (miniaturas y fotogramas), entiende el pedido y propón cómo lo harás.
TODAVÍA NO HAGAS EL VIDEO: no midas el audio a fondo, no hagas pruebas ni renders y no crees nada en salida/.
Escribe en notas.md, en pocas líneas, lo que viste (qué es cada archivo y lo importante de cada uno) para usarlo después.

${comoConversar(c)}
${comoGuionGrafico(c)}

${contexto(c)}

Responde SOLO con JSON, sin texto alrededor:
${FORMATO_PLAN}`
  // Con la conversación viva, basta con lo nuevo que dijo el usuario.
  const corto = `El usuario te contesta: «${ultimoDelUsuario(c)}».
Sigue la charla: respóndele y deja el plan al día con eso (sigue SIN hacer el video; ya miraste los archivos, no lo repitas salvo que te pida mirar algo nuevo).
${comoConversar(c)}
${comoGuionGrafico(c)}
Responde SOLO con JSON, sin texto alrededor:
${FORMATO_PLAN}`
  const turno = await trabajarAgente(cmd.orden, trabajo, corto, onLinea, senal, 30 * 60_000, await imagenesDeEntrada(c, carpeta), undefined, c.agente?.sesion, completo)
  let datos: unknown = null
  try {
    datos = extraerJson(turno.respuesta)
  } catch {
    // Sin JSON: contestó en prosa; eso es su mensaje y el plan sigue como estaba.
  }
  const charla = validarCharla(datos, datos ? '' : turno.respuesta)
  if (!charla) throw new Error('El agente no respondió nada.')
  return { charla, ...(turno.sesion ? { sesion: turno.sesion } : {}) }
}

/** Paso 2: el agente hace (o cambia) el video siguiendo el plan, se comprueba y entrega. */
export async function pasoHacer(
  c: Creacion,
  carpeta: string,
  config: ConfigModoAgente,
  pedido: string | undefined,
  onLinea: (t: string) => void,
  senal?: AbortSignal,
  /** Lo pide la revisión de Recorte, no el usuario: corregir la entrega de esta ronda. */
  esCorreccion = false,
  /** Se había quedado sin uso a mitad: sigue desde lo que dejó (este agente u otro). */
  seguir = false
): Promise<TurnoModoAgente> {
  const trabajo = carpetaTrabajo(carpeta)
  const cmd = config.activa && config.proveedor === 'cli' ? comandoAgentico(config.comandoCli) : null
  if (!cmd) throw new Error('El modo agente necesita un agente que trabaje con herramientas (Claude Code, Antigravity, Kimi, Codex u OpenCode). Conéctalo en Inicio.')
  await escribirManual(carpeta, c)
  const resultadoJson = join(trabajo, 'resultado.json')
  // Al seguir, su resultado.json (si alcanzó a escribirlo) vale: no se borra.
  if (!seguir && existsSync(resultadoJson)) rmSync(resultadoJson, { force: true })
  const plan = c.agente?.plan
  const hay = c.agente?.resultado
  await prepararVistazo(c, carpeta)
  // Al seguir tras el límite, lo que dejó desde que empezó la ronda cortada también cuenta.
  const desde = seguir ? (c.agente?.pausa?.desde ?? Date.now()) : Date.now()
  const versionAnterior = hay ? hay.archivo.replace(/^salidas\//, '') : ''
  // El chat marca los pasos del plan según estas líneas (`pasoAnunciado`).
  const anunciar = plan?.pasos.length
    ? `\nPara que el usuario vea cómo vas: al EMPEZAR cada paso del plan escribe una línea suelta «PASO n: lo que haces» (n del 1 al ${plan.pasos.length}, el número del paso).\n`
    : ''
  // Un cambio sobre un video ya hecho no repite el método entero: toca solo lo pedido
  // (menos tiempo y menos créditos del plan del usuario).
  const completo =
    hay && pedido
      ? `ESTO ES UN CAMBIO sobre un video que ya hiciste, no un video nuevo. Tu manual sigue en AGENTS.md por si lo necesitas.

${contexto(c)}

YA HICISTE ESTA VERSIÓN: ${versionAnterior} (lo que dijiste: ${hay.resumen}). Tus archivos de trabajo (receta.json, scripts, composiciones) siguen en esta carpeta.

LO QUE PIDE AHORA EL USUARIO: ${pedido}

Cómo trabajar para no gastar de más:
- No vuelvas a mirar vistazo/ ni entrada/ ni a medir lo que ya mediste (está en notas.md), y no rehagas el plan.
- Abre el archivo de trabajo que produjo la versión anterior, cambia SOLO lo que se pide y conserva todo lo demás tal cual.
- Renderiza a un archivo NUEVO en salida/ (otro nombre, p. ej. con -v2), mira 2 o 3 fotogramas de lo que cambiaste y entrega.
Al terminar escribe resultado.json como dice el manual y termina (no dejes servidores ni procesos abiertos).`
      : `Lee AGENTS.md (tu manual) y sigue el método completo, del paso 1 al 7. Empieza por notas.md y vistazo/: no repitas lo que ya viste.

${contexto(c)}
${plan ? `\nEL PLAN QUE EL USUARIO APROBÓ:\n${plan.entendi}\n${plan.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n${anunciar}` : ''}${hay ? `\nYA HICISTE UNA VERSIÓN: ${versionAnterior} (lo que dijiste: ${hay.resumen}). Tus archivos de trabajo siguen en esta carpeta: parte de ellos y cambia solo lo que se pide, conservando lo que al usuario le gustó.\n` : ''}${pedido ? `\nLO QUE PIDE AHORA EL USUARIO: ${pedido}\n` : ''}
Cuando termines y lo hayas comprobado mirando los fotogramas, escribe resultado.json como dice el manual y termina (no dejes servidores ni previsualizaciones abiertas).`
  // Retomando la conversación, el agente ya sabe qué vio, qué planeó y qué hizo: solo lo nuevo.
  const corto = esCorreccion && pedido
    ? `${pedido}
Corrige solo eso partiendo de lo que acabas de hacer, vuelve a comprobarlo y vuelve a escribir resultado.json como dice el manual. Termina sin dejar procesos abiertos.`
    : hay && pedido
      ? `Cambio sobre la versión que entregaste (${versionAnterior}): ${pedido}
Cambia SOLO eso, partiendo de tus archivos de trabajo, y conserva todo lo demás tal cual. No vuelvas a mirar ni a medir lo que ya conoces.
Renderiza a un archivo NUEVO en salida/, mira 2 o 3 fotogramas de lo que cambiaste y vuelve a escribir resultado.json como dice el manual. Termina sin dejar procesos abiertos.`
      : `El usuario aprobó el plan${pedido ? ` con esto: ${pedido}` : ''}. Ahora hazlo: sigue el método de AGENTS.md del paso 2 al 7 (ya miraste los archivos y apuntaste en notas.md: no lo repitas).${anunciar}
Cuando lo hayas comprobado mirando los fotogramas, escribe resultado.json como dice el manual y termina (no dejes servidores ni previsualizaciones abiertas).`
  const entregaLista = () => fecha(resultadoJson) >= desde && archivoEntregado(carpeta, desde) !== null
  if (seguir) {
    // Se cortó por el límite de uso: ni de cero ni repitiendo lo hecho.
    const comoSeguir = `Te quedaste sin uso de tu plan a mitad de este trabajo y ya se renovó (o el usuario eligió seguir con otro agente).
SIGUE EXACTAMENTE DESDE DONDE IBAS: mira lo que ya hay en esta carpeta (notas.md, tus scripts, receta.json, salida/, revision/)
y no rehagas lo que ya está hecho. Si un render quedó a medias, vuelve a lanzarlo en primer plano y espera a que acabe.
Termina, compruébalo mirando fotogramas, escribe resultado.json como dice el manual y termina sin dejar procesos abiertos.${anunciar}`
    const completoSeguir = `Lee AGENTS.md (tu manual). Otro turno de trabajo (quizá de otro agente) empezó este video y se cortó porque se acabó el uso del plan.

${contexto(c)}
${plan ? `\nEL PLAN QUE EL USUARIO APROBÓ:\n${plan.entendi}\n${plan.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n` : ''}
${comoSeguir}`
    return trabajarAgente(cmd.orden, trabajo, comoSeguir, onLinea, senal, 40 * 60_000, await imagenesDeEntrada(c, carpeta), entregaLista, c.agente?.sesion, completoSeguir)
  }
  return trabajarAgente(cmd.orden, trabajo, corto, onLinea, senal, 40 * 60_000, await imagenesDeEntrada(c, carpeta), entregaLista, c.agente?.sesion, completo)
}

// ---------------------------------------------------------------------------
// La revisión de Recorte (independiente del agente)
// ---------------------------------------------------------------------------

/** Dentro de la carpeta de trabajo (el agente no puede entregar archivos de fuera). */
const dentroDe = (base: string, ruta: string): boolean => {
  const r = resolve(ruta).toLowerCase()
  const b = resolve(base).toLowerCase()
  return r === b || r.startsWith(b.endsWith(sep) ? b : b + sep)
}

const esArchivo = (ruta: string): boolean => {
  try {
    return statSync(ruta).isFile()
  } catch {
    return false
  }
}

const fecha = (ruta: string): number => {
  try {
    return statSync(ruta).mtimeMs
  } catch {
    return 0
  }
}

/**
 * El archivo que entregó el agente en ESTA ronda: el de resultado.json o, si no, el más
 * nuevo de salida/. Con `desde`, solo vale lo que se escribió después de empezar: así una
 * edición fallida nunca «entrega» el video anterior ni un fotograma de revisión.
 */
export function archivoEntregado(
  carpeta: string,
  desde = 0
): { ruta: string; entrega: ReturnType<typeof validarEntrega> } | null {
  const trabajo = carpetaTrabajo(carpeta)
  const fresco = (ruta: string) => !desde || fecha(ruta) >= desde - 2000
  const valido = (ruta: string) =>
    dentroDe(trabajo, ruta) && esArchivo(ruta) && [...EXT_VIDEO, ...EXT_IMAGEN].includes(extname(ruta).toLowerCase())
  let entrega = validarEntrega({})
  try {
    entrega = validarEntrega(JSON.parse(readFileSync(join(trabajo, 'resultado.json'), 'utf8').replace(/^\uFEFF/, '')))
  } catch {
    // Sin resultado.json: se busca en salida/.
  }
  if (entrega.archivo) {
    // Los agentes escriben la ruta de muchas formas: «salida/x.mp4», «./salida/x.mp4»,
    // «trabajo/salida/x.mp4», con comillas o absoluta. Todas valen si quedan dentro de trabajo/.
    const raw = entrega.archivo.trim().replace(/^['"`]|['"`]$/g, '').replace(/\\/g, '/')
    const relativa = raw.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/^trabajo\//i, '')
    const candidatas = [
      isAbsolute(entrega.archivo.trim()) ? resolve(entrega.archivo.trim()) : null,
      join(trabajo, relativa),
      join(trabajo, 'salida', basename(raw))
    ].filter(Boolean) as string[]
    for (const r of candidatas) if (valido(r) && fresco(r)) return { ruta: r, entrega }
  }
  const salida = join(trabajo, 'salida')
  if (!existsSync(salida)) return null
  const candidatos = readdirSync(salida)
    .map((n) => join(salida, n))
    .filter((r) => valido(r) && fresco(r))
    .map((ruta) => ({ ruta, fecha: fecha(ruta) }))
    .sort((a, b) => b.fecha - a.fecha)
  return candidatos[0] ? { ruta: candidatos[0].ruta, entrega } : null
}

/** La receta del kit que dice la entrega (o `receta.json`), si está dentro de trabajo/ y trae momentos. */
function recetaEntregada(carpeta: string, dicha?: string): string | null {
  const trabajo = carpetaTrabajo(carpeta)
  for (const candidata of [dicha, 'receta.json']) {
    if (!candidata) continue
    const ruta = resolve(trabajo, candidata.replace(/\\/g, '/').replace(/^trabajo\//i, ''))
    if (!dentroDe(trabajo, ruta) || !esArchivo(ruta) || extname(ruta).toLowerCase() !== '.json') continue
    try {
      const r = JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '')) as { momentos?: unknown }
      if (Array.isArray(r.momentos) && r.momentos.length) return ruta
    } catch {
      // No es una receta: se prueba la siguiente.
    }
  }
  return null
}

/**
 * Revisa el resultado por su cuenta: que exista y se abra, cuánto dura y mide, y saca
 * fotogramas para que el usuario lo vea. Copia el final a `salidas/` con su versión.
 */
export async function revisarYPublicar(
  c: Creacion,
  carpeta: string,
  version: number,
  desde = 0,
  onLinea: (t: string) => void = () => {}
): Promise<{ resultado?: ResultadoAgente; problemas: string[] }> {
  const hallado = archivoEntregado(carpeta, desde)
  if (!hallado) {
    return {
      problemas: [
        desde
          ? 'No dejaste un archivo nuevo en salida/ en esta ronda (resultado.json no apunta a nada nuevo).'
          : 'No dejaste ningún archivo final en salida/ ni en resultado.json.'
      ]
    }
  }
  const ext = extname(hallado.ruta).toLowerCase()
  const tipo: ResultadoAgente['tipo'] = EXT_IMAGEN.includes(ext) ? 'imagen' : 'video'
  const problemas: string[] = []
  const salidas = join(carpeta, 'salidas')
  mkdirSync(salidas, { recursive: true })
  const nombre = `agente-v${version}${ext}`
  copyFileSync(hallado.ruta, join(salidas, nombre))

  let info: { duracion?: number; ancho?: number; alto?: number } = {}
  const revision: string[] = []
  if (tipo === 'video') {
    try {
      const v = await probeVideo(hallado.ruta)
      info = { duracion: Math.round(v.duration * 100) / 100, ancho: v.width, alto: v.height }
      if (!(v.duration > 0.2)) problemas.push(`El video dura ${v.duration} s: está vacío o roto.`)
      if (!v.width || !v.height) problemas.push('El video no tiene imagen.')
    } catch (e) {
      problemas.push(`El archivo no se puede abrir como video (${e instanceof Error ? e.message.slice(0, 120) : 'error'}).`)
    }
    if (!problemas.length && info.duracion) {
      const ffmpeg = resolverBinario('ffmpeg') ?? 'ffmpeg'
      const momentos = [0.05, 0.25, 0.5, 0.75, 0.97].map((f) => Math.max(0, info.duracion! * f))
      for (const [i, t] of momentos.entries()) {
        const archivo = `agente-v${version}-r${i + 1}.jpg`
        const r = await ejecutar(
          [`"${ffmpeg}"`, '-y', '-v', 'error', '-ss', t.toFixed(2), '-i', `"${hallado.ruta}"`, '-frames:v', '1', '-vf', `scale='min(540,iw)':-2`, '-q:v', '4', `"${join(salidas, archivo)}"`],
          carpeta,
          60_000
        )
        if (r.codigo === 0 && existsSync(join(salidas, archivo))) revision.push(`salidas/${archivo}`)
      }
      if (!revision.length) {
        // Intento de fotograma al inicio como respaldo
        const archivo0 = `agente-v${version}-r0.jpg`
        const r0 = await ejecutar(
          [`"${ffmpeg}"`, '-y', '-v', 'error', '-ss', '0', '-i', `"${hallado.ruta}"`, '-frames:v', '1', '-vf', `scale='min(540,iw)':-2`, '-q:v', '4', `"${join(salidas, archivo0)}"`],
          carpeta,
          30_000
        )
        if (r0.codigo === 0 && existsSync(join(salidas, archivo0))) revision.push(`salidas/${archivo0}`)
      }
    }
  } else {
    revision.push(`salidas/${nombre}`)
  }
  if (problemas.length) return { problemas }
  // La receta de esta versión se guarda con ella: la siguiente ronda puede cambiar la de trabajo.
  let receta: string | undefined
  let limpio: string | undefined
  const rutaReceta = tipo === 'video' ? recetaEntregada(carpeta, hallado.entrega.receta) : null
  if (rutaReceta) {
    // Con voz, los subtítulos van en la receta (editables) y de principio a fin.
    const faltan = subtitulosQueFaltan(rutaReceta, c, info.duracion)
    if (faltan) return { problemas: [faltan] }
    try {
      copyFileSync(rutaReceta, join(salidas, `agente-v${version}.receta.json`))
      receta = `salidas/agente-v${version}.receta.json`
    } catch {
      // Sin receta, el editor abre el video entero.
    }
    if (receta) {
      onLinea('Recorte prepara la versión editable (sin textos pegados al video)')
      limpio = (await renderLimpio(rutaReceta, carpeta, version)) ?? undefined
    }
  }
  return {
    problemas,
    resultado: {
      ...(receta ? { receta } : {}),
      ...(limpio ? { limpio } : {}),
      archivo: `salidas/${nombre}`,
      tipo,
      resumen: hallado.entrega.resumen || 'Listo.',
      comprobaciones: hallado.entrega.comprobaciones,
      revision,
      ...info
    }
  }
}

/**
 * Si el video lleva voz, la receta tiene que traer sus subtítulos (en `"subtitulos"`, editables) y
 * llegar hasta el final de lo que se dice. Devuelve el problema para que el agente lo corrija, o null.
 */
function subtitulosQueFaltan(rutaReceta: string, c: Creacion, duracion?: number): string | null {
  let r: { voz?: unknown[]; subtitulos?: { frases?: { hasta?: unknown }[] } }
  try {
    r = JSON.parse(readFileSync(rutaReceta, 'utf8').replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  const conVoz = (Array.isArray(r.voz) && r.voz.length > 0) || Boolean(c.vozElegida) || c.adjuntos.some((a) => a.tipo === 'audio')
  if (!conVoz) return null
  const frases = Array.isArray(r.subtitulos?.frases) ? r.subtitulos!.frases! : []
  if (!frases.length) {
    return 'El video lleva voz pero la receta no trae "subtitulos": ponlos EN LA RECETA (ver «Subtítulos» en kit/RECETA.md), de principio a fin, y NO los quemes con un script propio (el usuario los edita en su editor). Vuelve a armar con el kit.'
  }
  const ultimo = Math.max(...frases.map((f) => (typeof f.hasta === 'number' ? f.hasta : 0)))
  // Lo que queda sin subtítulo al final, sin contar un cierre con logo (unos segundos).
  if (duracion && ultimo < duracion - 12) {
    return `Los subtítulos de la receta acaban en el segundo ${ultimo.toFixed(1)} y el video dura ${duracion.toFixed(1)} s: faltan los del final. Cubre todo lo que se dice y vuelve a armar con el kit.`
  }
  return null
}

/**
 * La receta renderizada sin subtítulos ni rótulos, para los tramos fijos del editor (los textos van
 * en su pista). Si algo falla, null: el editor usa el video entregado, como antes.
 */
async function renderLimpio(rutaReceta: string, carpeta: string, version: number): Promise<string | null> {
  try {
    const r = JSON.parse(readFileSync(rutaReceta, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown> & { momentos?: Record<string, unknown>[] }
    const momentos = Array.isArray(r.momentos) ? r.momentos : []
    const conTextos =
      Boolean((r.subtitulos as { frases?: unknown[] } | undefined)?.frases?.length) ||
      momentos.some((m) => m.rotulo || (m.tipo === 'texto' && Number(m.oscurecer ?? 0) > 0) || PIEZAS_ENCIMA.includes(String(m.tipo))) ||
      (Array.isArray(r.capas) && r.capas.length > 0) ||
      Boolean(r.filtros)
    if (!conTextos) return null
    const trabajo = carpetaTrabajo(carpeta)
    const kit = join(trabajo, 'kit', 'kit.py')
    const py = await buscarPython()
    if (!py || !existsSync(kit)) return null
    // Las capas y los sonidos también tienen su pista en el editor.
    delete r.subtitulos
    delete r.capas
    delete r.sonidos
    delete r.filtros
    r.momentos = momentos
      // Los rótulos que van encima de otra cosa son textos del editor: fuera.
      .filter((m) => !(m.tipo === 'texto' && Number(m.oscurecer ?? 0) > 0) && !PIEZAS_ENCIMA.includes(String(m.tipo)))
      .map((m) => ({ ...m, rotulo: null }))
    const nombre = `.limpio-v${version}.mp4`
    r.salida = `salida/${nombre}`
    // Junto a la receta original: sus rutas relativas siguen valiendo.
    const limpia = join(dirname(rutaReceta), '.receta-limpia.json')
    writeFileSync(limpia, JSON.stringify(r), 'utf8')
    const res = await ejecutar(
      [[py.cmd, ...py.args].map((x) => (x.includes(' ') ? `"${x}"` : x)).join(' '), `"${kit}"`, 'armar', `"${limpia}"`],
      trabajo,
      30 * 60_000
    )
    const hecho = join(dirname(rutaReceta), 'salida', nombre)
    if (res.codigo !== 0 || !existsSync(hecho)) return null
    const destino = `salidas/agente-v${version}-limpio.mp4`
    copyFileSync(hecho, join(carpeta, destino))
    rmSync(hecho, { force: true })
    return destino
  } catch {
    return null
  }
}

/** Añade líneas al registro (las últimas MAX_REGISTRO). */
export function anotar(estado: EstadoModoAgente, linea: string): void {
  estado.registro = [...estado.registro, linea].slice(-MAX_REGISTRO)
}
