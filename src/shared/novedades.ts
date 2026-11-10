/**
 * Lo nuevo de cada versión, en palabras del usuario. De aquí salen tres cosas:
 * la ventana «Novedades» que se abre una vez tras actualizar, el aviso de versión
 * nueva y las notas del release en GitHub (scripts/notas-version.mjs).
 * Al sacar una versión, agrega su entrada ARRIBA con el mismo número de package.json.
 *
 * Este archivo no importa nada: Node lo lee tal cual (sin compilar) para las notas.
 */

export interface Novedad {
  /** Un icono de la app (ver Icons.tsx). */
  icono: string
  titulo: string
  texto: string
}

export interface VersionNovedades {
  version: string
  fecha: string
  /** Una frase que resume la versión. */
  resumen: string
  novedades: Novedad[]
}

export const NOVEDADES: VersionNovedades[] = [
  {
    version: '0.1.17',
    fecha: '2026-11-10',
    resumen: 'Crear es un solo agente con voz desde el principio, y el video que hace se abre en el editor con cada cosa suelta para retocarla a mano.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Un solo modo para crear',
        texto:
          'La caja de crear ya no tiene «Agente» y «Guiado»: eliges quién lo hace, el formato, la duración y la voz, y ves sus pasos marcándose en el chat. Con «Hazlo directo» empieza solo si no tiene dudas.'
      },
      {
        icono: 'music',
        titulo: 'Voz elegida desde el principio',
        texto:
          'Elige una de las 30 voces de Gemini en la caja. El agente escribe lo que dice y Recorte lo narra frase a frase; en el editor cambias el texto de una frase y la regeneras, o pasas toda la narración a otra voz.'
      },
      {
        icono: 'layers',
        titulo: 'El video del agente, editable',
        texto:
          'Al terminar se abre el editor con cada foto, clip, rótulo, frase de voz y la música en su pista. Cambia una imagen, el tamaño, color o letra de un rótulo, el encuadre, el acercamiento o los fundidos sin pedirle nada al agente.'
      },
      {
        icono: 'type',
        titulo: 'El chat del editor hace más',
        texto:
          'Pídele «cambia lo que dice la frase 2», «pon el título en amarillo y más grande» o «quítale el sonido al clip 3»: lo hace en el mismo proyecto y se deshace con Ctrl+Z.'
      },
      {
        icono: 'log-out',
        titulo: 'Cambiar de cuenta del agente',
        texto:
          'Después de «Desconectar», «Conectar» abre siempre la autorización del agente: puedes entrar con otra cuenta. Tu sesión fuera de Recorte no se toca.'
      },
      {
        icono: 'check',
        titulo: 'Agentes más fiables',
        texto:
          'Claude y Codex recuerdan la conversación entre el plan y cada cambio (gastan menos), Recorte sabe cuándo terminaron aunque dejen algo abierto, y un retoque pequeño ya no rehace el guion ni la voz.'
      }
    ]
  },
  {
    version: '0.1.15',
    fecha: '2026-11-09',
    resumen: 'Desconexión voluntaria de agentes y corrección de bloqueos al entregar o editar videos.',
    novedades: [
      {
        icono: 'log-out',
        titulo: 'Desconectar agentes',
        texto:
          'Ahora puedes desconectar tu cuenta o dejar de usar un agente activo en cualquier momento desde Inicio, sin necesidad de reiniciar la app ni borrar archivos a mano.'
      },
      {
        icono: 'sparkles',
        titulo: 'Entrega de video sin bloqueos',
        texto:
          'Se solucionó el problema donde la entrega del video se quedaba atascada en amarillo. Ahora el render y las comprobaciones entregan el video de inmediato al terminar.'
      }
    ]
  },
  {
    version: '0.1.13',
    fecha: '2026-11-08',
    resumen: 'Eliges el modelo y el esfuerzo de cada agente, el modo agente hace los videos con un kit más rápido y ya no se queda atascado.',
    novedades: [
      {
        icono: 'sliders',
        titulo: 'Modelo y esfuerzo de cada agente',
        texto:
          'En «Por paso» ves los modelos que tiene de verdad cada agente conectado (Claude Code, OpenCode, Antigravity…) y eliges cuánto piensa: bajo, medio, alto, muy alto o máximo, si el modelo lo admite. Cuando sale un modelo nuevo, aparece solo.'
      },
      {
        icono: 'sparkles',
        titulo: 'El kit del modo agente',
        texto:
          'El agente ya no programa el video desde cero: escribe una receta corta (qué foto, cuándo, con qué rótulo y efecto) y el kit de Recorte la hace en una sola pasada, con la música en su golpe. Fotos a pantalla completa, antes y después, collage, frases con brillo y más.'
      },
      {
        icono: 'check',
        titulo: 'Pasa solo al siguiente paso',
        texto:
          'Si el agente dejaba algo corriendo de fondo (un render, por ejemplo), Recorte seguía esperando aunque ya hubiera terminado, y la barra se ponía en amarillo. Ahora en cuanto el agente responde, pasa al siguiente paso.'
      },
      {
        icono: 'clock',
        titulo: 'El progreso sigue donde iba',
        texto:
          'Si sales del estudio y vuelves mientras el agente trabaja, el reloj y la barra siguen donde iban, y la lista de lo que hace se actualiza en vivo. Cada video lleva su propio progreso.'
      }
    ]
  },
  {
    version: '0.1.12',
    fecha: '2026-11-07',
    resumen: 'Recorte sabe de verdad si tu agente tiene la sesión iniciada.',
    novedades: [
      {
        icono: 'key',
        titulo: 'Sesión al día',
        texto:
          'Si cerraste sesión o caducó, Inicio vuelve a mostrar «Conectar» (antes Claude Code podía seguir apareciendo como listo). Y si se cae mientras trabaja, te avisa al momento para que lo reconectes.'
      }
    ]
  },
  {
    version: '0.1.11',
    fecha: '2026-11-07',
    resumen: 'Si el agente no puede trabajar, te dice por qué en claro.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Avisos que se entienden',
        texto:
          'Cuando el filtro de contenido de tu agente (por ejemplo Antigravity) rechaza el pedido, Recorte te lo explica y te dice qué probar, en vez de mostrar un error técnico. Y si el agente responde sin plan, ves lo que dijo.'
      }
    ]
  },
  {
    version: '0.1.10',
    fecha: '2026-11-07',
    resumen: 'La licencia del instalador ya se lee bien.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Licencia legible',
        texto: 'Al instalar Recorte, el acuerdo de licencia se ve con sus tildes, eñes y comillas, en vez de caracteres raros.'
      }
    ]
  },
  {
    version: '0.1.9',
    fecha: '2026-11-07',
    resumen: 'El modo agente trabaja mucho más rápido: mira un vistazo de tus archivos en vez de abrirlos enteros.',
    novedades: [
      {
        icono: 'clock',
        titulo: 'Plan en pocos minutos',
        texto:
          'Recorte prepara un vistazo de tus archivos (miniaturas de las fotos, fotogramas y audio de los videos) y el agente lo mira en segundos. El plan es solo un vistazo; lo pesado se hace al darle a «Hazlo», sin repetir lo que ya vio.'
      },
      {
        icono: 'sparkles',
        titulo: 'Sabes cuánto lleva',
        texto: 'La barra ya no inventa un porcentaje: muestra el tiempo que lleva frente a lo que suele tardar ese paso, te avisa si se pasa, y debajo ves lo último que hizo el agente.'
      }
    ]
  },
  {
    version: '0.1.8',
    fecha: '2026-11-07',
    resumen: 'Sube tus fotos del iPhone (HEIC) y carpetas comprimidas (.zip) directamente.',
    novedades: [
      {
        icono: 'paperclip',
        titulo: 'Zip y fotos HEIC',
        texto:
          'En Crear con IA ya puedes adjuntar un .zip (se abre y se usan sus fotos y videos) y fotos HEIC/HEIF del iPhone (se pasan a JPG solas). Si algo no se puede usar, te lo dice en el chat.'
      }
    ]
  },
  {
    version: '0.1.7',
    fecha: '2026-11-07',
    resumen: 'Antigravity también trabaja en modo agente, y las imágenes generadas ya no vienen elegidas por defecto.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Antigravity en modo agente',
        texto:
          'Con tu cuenta de Google, Antigravity ahora puede hacer videos en modo agente: mira tus fotos, escribe sus archivos y ejecuta FFmpeg o Python, siempre dentro de la carpeta del video.'
      },
      {
        icono: 'image',
        titulo: 'Sin imágenes por defecto',
        texto: 'En Crear con IA, «Imágenes» empieza en «Sin imágenes»: tú eliges si quieres que se generen y con qué.'
      }
    ]
  },
  {
    version: '0.1.6',
    fecha: '2026-11-07',
    resumen: 'Al día con los modelos nuevos de Google Flow.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Omni 1.2 Flash en los clips',
        texto:
          'El modelo nuevo de Flow ya se puede elegir en Crear con IA → Clips. Omni 1.1 Flash, Veo 3.1 Fast y Veo 3.1 Quality avisan que Flow los retira el 5 de diciembre, y desde ese día dejan de ofrecerse. Los costos ahora se muestran en puntos, como en Flow.'
      }
    ]
  },
  {
    version: '0.1.5',
    fecha: '2026-11-07',
    resumen: 'Modo agente: tu agente trabaja como un editor de verdad, con herramientas, y comprueba antes de entregarte.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Modo agente en Crear con IA',
        texto:
          'Elige «Agente» en la caja: mira tus archivos de verdad, te propone un plan corto y, cuando le dices «Hazlo», lo hace con FFmpeg, Python o HyperFrames. Sirve para cualquier cosa: un reel, un recurso con croma, una comparativa.'
      },
      {
        icono: 'check',
        titulo: 'Se comprueba antes de entregar',
        texto: 'Saca fotogramas de lo que hizo, los mira y corrige. Recorte también lo revisa y te enseña esos fotogramas junto al video.'
      },
      {
        icono: 'undo',
        titulo: 'Cambios sobre lo mismo',
        texto: '«Haz el brillo más fino»: el agente parte de su trabajo y cambia solo eso, conservando lo que te gustó.'
      },
      {
        icono: 'key',
        titulo: 'Avisos claros del agente',
        texto: 'Si la sesión de tu agente caducó o llegó al límite de su plan, ahora te lo dice en claro y te indica qué hacer.'
      }
    ]
  },
  {
    version: '0.1.4',
    fecha: '2026-11-07',
    resumen: 'Copia el estilo de edición de un video de referencia: Recorte lo mide, tu agente lo estudia y te dice qué se puede copiar con lo que tienes conectado.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Video de referencia en Crear con IA',
        texto:
          'Junto al clip de adjuntos hay un botón nuevo para subir un video cuyo estilo quieres copiar. Se analiza para copiar su edición; no entra en tu video.'
      },
      {
        icono: 'sparkles',
        titulo: 'Fase Estilo: ficha e informe de viabilidad',
        texto:
          'Recorte mide la referencia en tu equipo (planos, ritmo, voz, color) y tu agente estudia los fotogramas. Ves la ficha de estilo —editable en ritmo y subtítulos— y qué porcentaje se puede copiar con lo conectado hoy, con atajos para conectar lo que falta.'
      },
      {
        icono: 'layers',
        titulo: 'Tus videos entran completos y el agente sabe qué dicen',
        texto:
          'Antes solo se usaban los primeros 20 s de cada video tuyo; ahora entran completos. Al escribir el guion, el agente recibe qué se dice en cada segundo y elige los mejores trozos, y si hay referencia, también su ficha de estilo.'
      }
    ]
  },
  {
    version: '0.1.3',
    fecha: '2026-11-07',
    resumen: 'Las herramientas de video se bajan con un botón: ya no hay que instalar nada a mano.',
    novedades: [
      {
        icono: 'download',
        titulo: 'FFmpeg, Python y Node.js con un botón',
        texto:
          'En Ajustes → Herramientas de video, «Descargar» baja cada una de su página oficial a la carpeta de Recorte y comprueba que llegó bien. No se instala nada en Windows ni se tocan las que ya tengas.'
      },
      {
        icono: 'check',
        titulo: 'Instalar todo lo que falta',
        texto: 'Un solo botón baja e instala, en orden, lo que le falte a tu equipo: FFmpeg, Python con sus paquetes, Node.js y HyperFrames.'
      }
    ]
  },
  {
    version: '0.1.2',
    fecha: '2026-11-07',
    resumen: 'Imágenes con tu cuenta de ChatGPT, iconos nuevos y esta ventana para contarte lo nuevo.',
    novedades: [
      {
        icono: 'image',
        titulo: 'Imágenes con ChatGPT',
        texto:
          'Si conectas «ChatGPT (Codex)» en Ajustes → Agentes, en Crear con IA → Imágenes aparece «ChatGPT Imágenes», junto a los modelos de Google Flow. Usa el modelo de imágenes de tu plan de ChatGPT.'
      },
      {
        icono: 'sparkles',
        titulo: 'Iconos nuevos',
        texto: 'Todos los iconos de la app se rehicieron con un mismo estilo: más limpios y más fáciles de reconocer.'
      },
      {
        icono: 'gift',
        titulo: 'Novedades en cada versión',
        texto: 'Cuando Recorte se actualice, te contará aquí qué cambió. Las puedes volver a ver en Ajustes → Versión.'
      }
    ]
  },
  {
    version: '0.1.1',
    fecha: '2026-11-07',
    resumen: 'Botón de descarga, licencia y actualizaciones automáticas.',
    novedades: [
      {
        icono: 'download',
        titulo: 'Actualizaciones automáticas',
        texto: 'Recorte busca versiones nuevas al abrirse y cada cuatro horas, las baja solo y te avisa para reiniciar.'
      }
    ]
  },
  {
    version: '0.1.0',
    fecha: '2026-11-07',
    resumen: 'La primera versión publicada.',
    novedades: [
      {
        icono: 'scissors',
        titulo: 'Editor con timeline',
        texto: 'Clips, textos, música, zoom y color, con deshacer, varios medios por proyecto y exportación a MP4.'
      },
      {
        icono: 'sparkles',
        titulo: 'Un agente que edita, propone y aprende',
        texto: 'Le pides cambios con tus palabras, te propone los siguientes pasos y aprende tu criterio. Lo puedes parar, editar y reenviar.'
      },
      {
        icono: 'film',
        titulo: 'Crear con IA',
        texto: 'Del pedido al guion, la voz, las imágenes y clips de Google Flow, y el video terminado.'
      }
    ]
  }
]

/** Compara versiones x.y.z: negativo si a < b. */
export function compararVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Las versiones que el usuario aún no vio, de la más nueva a la más vieja (hasta la actual). */
export function novedadesPendientes(actual: string, vista?: string): VersionNovedades[] {
  return NOVEDADES.filter((v) => compararVersion(v.version, actual) <= 0 && (!vista || compararVersion(v.version, vista) > 0)).slice(
    0,
    vista ? undefined : 1
  )
}

/** Las notas del release en GitHub (Markdown). */
export function notasMarkdown(version: string): string {
  const v = NOVEDADES.find((x) => x.version === version)
  if (!v) return `Recorte ${version}.`
  return [
    v.resumen,
    '',
    ...v.novedades.map((n) => `- **${n.titulo}.** ${n.texto}`),
    '',
    '**Instalar:** descarga `Recorte-Setup.exe`. Si ya tienes Recorte, se actualiza solo y te avisa para reiniciar.',
    'Si Windows dice «Windows protegió tu PC»: *Más información* → *Ejecutar de todas formas*.'
  ].join('\n')
}
