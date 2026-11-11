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
    version: '0.1.30',
    fecha: '2026-11-11',
    resumen: 'Acabado de documental: movimientos sin temblor, recortes sin borde verde, letras de revista y personajes que se mueven.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Movimientos como de cámara',
        texto: 'Los acercamientos, paneos y capas que se mueven ya no tiemblan, y los barridos llevan desenfoque de movimiento.'
      },
      {
        icono: 'image',
        titulo: 'Recortes limpios',
        texto: 'Al quitar un fondo verde ya no queda borde verde, y el humo o el pelo se quedan semitransparentes.'
      },
      {
        icono: 'type',
        titulo: 'Letras de revista',
        texto: 'Playfair Display (la serif cursiva de los títulos elegantes) y Anton (la condensada de los titulares enormes), en el editor y en el video final. Nueva letra «Titular».'
      },
      {
        icono: 'sparkles',
        titulo: 'Personajes que se mueven',
        texto: 'El agente puede animar un personaje recortado (un clip sin fondo encima del video), como en los documentales de redes.'
      },
      {
        icono: 'check',
        titulo: 'Sin textos dobles ni tapados',
        texto: 'El agente revisa que los títulos no repitan los subtítulos ni los tapen, y los subtítulos quedan a su altura en el editor.'
      }
    ]
  },
  {
    version: '0.1.29',
    fecha: '2026-11-11',
    resumen: 'El monitor ya reproduce sin saltos y el botón Exportar vuelve a estar a la vista.',
    novedades: [
      {
        icono: 'play',
        titulo: 'Reproducir sin saltos',
        texto: 'Las transiciones se ven como en el video final: la imagen anterior sale empujada o se funde, sin parpadeos a negro ni imágenes que se salen del cuadro.'
      },
      {
        icono: 'type',
        titulo: 'Subtítulos enteros',
        texto: 'Los rótulos y subtítulos del monitor usan su ancho y ya no se parten en dos líneas cortas.'
      },
      {
        icono: 'download',
        titulo: 'Exportar siempre a la vista',
        texto: 'Si la barra de la timeline no cabe, el zoom y Exportar pasan a una segunda línea en vez de esconderse.'
      }
    ]
  },
  {
    version: '0.1.28',
    fecha: '2026-11-10',
    resumen: 'Videos mucho más vivos: capas que se mueven, fondos que se quitan solos, filtros de película y transiciones con movimiento.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Capas que se mueven',
        texto: 'Una capa puede entrar desde un lado, cruzar volando, subir, acercarse o girar mientras está. En pausa ves dónde empieza y una silueta de dónde termina: arrastra cualquiera de las dos. Así se arman escenas por capas con efecto 3D.'
      },
      {
        icono: 'image',
        titulo: 'Quitar fondo',
        texto: 'Elige una capa de imagen y dale a «Quitar fondo»: queda solo la persona o el objeto. Un fondo liso sale al momento; cualquier otra foto la resuelve un modelo que se baja la primera vez (178 MB).'
      },
      {
        icono: 'sliders',
        titulo: 'Filtros de película',
        texto: 'En «Filtros»: grano, polvo y rayas, trama de puntos de revista, viñeta y parpadeo, para todo el video. Los rótulos siguen nítidos.'
      },
      {
        icono: 'film',
        titulo: 'Transiciones y texto que se arma',
        texto: 'Cada corte puede entrar con un barrido, zoom, desenfoque, destello o círculo. Los rótulos pueden aparecer palabra a palabra, letra a letra, con rebote o subiendo.'
      },
      {
        icono: 'sparkles',
        titulo: 'También para el agente',
        texto: 'El agente de Recorte y Claude Code usan todo esto: piden imágenes ya recortadas, mueven capas, ponen filtros y transiciones, y te lo dejan editable.'
      }
    ]
  },
  {
    version: '0.1.27',
    fecha: '2026-11-10',
    resumen: 'El agente ya hace mini documentales con títulos de revista, objetos de museo en 3D y fotos de archivo, y los puedes retocar en el editor.',
    novedades: [
      {
        icono: 'type',
        titulo: 'Títulos de revista',
        texto: 'Preguntas de gancho con una palabra enorme en serif cursiva roja, años subrayados, la etiqueta amarilla con un nombre, palabras que flotan y una palabra final que llena la pantalla. En el editor llegan como rótulos sueltos, con la nueva letra Cursiva.'
      },
      {
        icono: 'cubo',
        titulo: 'Objetos de museo y fotos de archivo',
        texto: 'Una obra, un cohete o un producto con su marco, bajo un foco de luz, entrando con un giro 3D. Y fotos en blanco y negro que caen una sobre otra.'
      },
      {
        icono: 'film',
        titulo: 'Copia el estilo de un video',
        texto: 'Pásale al agente un video de referencia: lista sus efectos, usa la pieza que hace cada uno y respeta su ritmo. Si algo no lo puede hacer, te lo dice.'
      },
      {
        icono: 'clock',
        titulo: 'Render más rápido',
        texto: 'Los videos con muchos textos se arman cerca de un tercio más rápido.'
      }
    ]
  },
  {
    version: '0.1.26',
    fecha: '2026-11-10',
    resumen: 'Oye cada voz antes de elegirla, graba tu voz frase por frase y tus retoques ya no se pierden al rehacer un video.',
    novedades: [
      {
        icono: 'play',
        titulo: 'Oye la voz antes de elegirla',
        texto: 'En el menú Voz de la caja, cada voz tiene su botón para oírla. La primera vez se genera una muestra corta y después suena al momento.'
      },
      {
        icono: 'music',
        titulo: 'Narra con tu voz',
        texto: 'En el editor, elige una frase de la narración y dale a «Grabar» para decirla tú, o graba una nueva donde está el cabezal. El silencio del principio y del final se quita solo.'
      },
      {
        icono: 'undo',
        titulo: 'Tus retoques se quedan',
        texto: 'Si le pides al agente otra versión, sabe lo que cambiaste a mano en el editor (rótulos, voz, logos, sonidos, música) y lo conserva.'
      },
      {
        icono: 'layers',
        titulo: 'Logos y sonidos sueltos',
        texto: 'El agente ya pone logos e íconos encima y efectos de sonido (whoosh, pop, ding…). En el editor llegan en sus pistas, para moverlos o quitarlos.'
      },
      {
        icono: 'sparkles',
        titulo: 'Crear desde tu agente',
        texto: 'Claude Code (u otro agente conectado) ya puede pedirle un video nuevo al agente de Recorte, conversar el plan y darle a «Hazlo». Antes de gastar en voz o clips te pregunta.'
      }
    ]
  },
  {
    version: '0.1.25',
    fecha: '2026-11-10',
    resumen: 'Claude Code (u otro agente) ya puede ver y editar tus proyectos de Recorte mientras la app está abierta.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Recorte desde tu agente',
        texto:
          'En Ajustes › «Recorte desde tu agente», un botón conecta Claude Code. Desde ahí puede ver tus proyectos, mirar cómo queda un momento, poner rótulos, logos y sonidos, cortar, transcribir y exportar. Solo funciona en tu equipo y con una contraseña propia.'
      },
      {
        icono: 'undo',
        titulo: 'Lo ves y lo deshaces',
        texto: 'Lo que cambia el agente aparece al momento en tu editor y se deshace con Ctrl+Z, como cualquier retoque tuyo.'
      },
      {
        icono: 'type',
        titulo: 'El chat sabe qué dice la narración',
        texto: 'Los videos que hace el agente se transcriben solos al abrirlos en el editor, así el cambio rápido entiende lo que se dice.'
      }
    ]
  },
  {
    version: '0.1.24',
    fecha: '2026-11-10',
    resumen: 'Logos encima del video, rótulos donde quieras y efectos de sonido, todo editable en la timeline. Y los agentes funcionan mejor.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Encima del video',
        texto:
          'Pon un logo, un ícono o una toma de apoyo encima del video con «Encima» o arrastrándolo desde la biblioteca. Muévelo en el monitor, cámbiale el tamaño por la esquina y elige si entra con pop o fundiéndose.'
      },
      {
        icono: 'type',
        titulo: 'Rótulos donde quieras',
        texto: 'Arrastra cualquier rótulo en el monitor para ponerlo en su sitio; se pega al centro con una guía.'
      },
      {
        icono: 'sparkles',
        titulo: 'Efectos de sonido',
        texto: 'Una pista nueva con whoosh, pop, ding y caja registradora, o un sonido de tu equipo, cada uno con su volumen.'
      },
      {
        icono: 'check',
        titulo: 'Subtítulos y agentes más fiables',
        texto:
          'Los subtítulos ya no salen duplicados en el editor. «Hazlo directo» arranca sin preguntar, Codex funciona en Windows, OpenCode y Gemini CLI se entienden mejor y los archivos con BOM ya no fallan.'
      }
    ]
  },
  {
    version: '0.1.23',
    fecha: '2026-11-10',
    resumen: 'El agente ve todo lo que tienes conectado y te propone usarlo cuando mejora el video, con un botón para activarlo.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Te propone tus herramientas',
        texto:
          'Si tienes la voz, Flow o ChatGPT conectados y no los elegiste, el agente te dice en la charla para qué servirían y cuánto cuestan. Un botón «Activar» los pone en la caja; nunca usa nada que no actives.'
      },
      {
        icono: 'layers',
        titulo: 'Las tarjetas se combinan con todo',
        texto: 'Ninguna tarjeta apaga herramientas: «Explicativo 3D» mezcla el 3D con tu voz, tus imágenes y clips generados y tu material.'
      }
    ]
  },
  {
    version: '0.1.22',
    fecha: '2026-11-10',
    resumen: 'Nueva tarjeta «Explicativo 3D»: un mundo 3D animado con personaje, íconos y texto palabra por palabra, que se guarda como plantilla para que cada video salga igual.',
    novedades: [
      {
        icono: 'cubo',
        titulo: 'Explicativo 3D',
        texto:
          'En «Enseñar». El agente arma un mundo 3D animado (un personaje del tema, dos ambientes, íconos 3D, texto palabra por palabra y tarjetitas) con tu guion o tu audio, sin fotos ni clips generados.'
      },
      {
        icono: 'layers',
        titulo: 'Su plantilla se reutiliza',
        texto: 'Cuando el primer video sale bien, Recorte guarda su diseño: los siguientes de ese tipo parten de él, se ven igual y gastan menos.'
      }
    ]
  },
  {
    version: '0.1.21',
    fecha: '2026-11-10',
    resumen: 'Subtítulos de principio a fin y editables uno a uno, las tarjetas de tipo de video vuelven a guiar al agente y más clips cuando los pides.',
    novedades: [
      {
        icono: 'type',
        titulo: 'Subtítulos editables',
        texto:
          'El agente pone los subtítulos y los rótulos en su receta, no pegados al video: en el editor cada frase es un texto suelto que cambias a mano (texto, letra, color y color de la caja) o con el chat. Y si hay voz, van de principio a fin.'
      },
      {
        icono: 'layers',
        titulo: 'Las tarjetas de tipo de video funcionan',
        texto: 'Clase, Lista, Promo, Historia… vuelven a darle al agente su estructura, su ritmo y su cierre. La creación muestra el tipo elegido.'
      },
      {
        icono: 'film',
        titulo: 'Anima lo que le pidas',
        texto: 'En un cambio sobre un video ya hecho, el agente puede generar los clips que le pidas (hasta 12) y te dice cuánto costaron. Antes se quedaba en los del primer plan.'
      }
    ]
  },
  {
    version: '0.1.20',
    fecha: '2026-11-10',
    resumen: 'Sube tu audio y el agente arma el video sobre él, con un guion gráfico que te dice cuántos clips de Flow usará y cuánto cuestan antes de gastar.',
    novedades: [
      {
        icono: 'music',
        titulo: 'Un video sobre tu audio',
        texto:
          'Con el «+» de la caja ya puedes subir audios (mp3, wav, m4a y los de WhatsApp). Recorte lo transcribe con sus tiempos y esa es la voz del video: cada escena calza con su frase.'
      },
      {
        icono: 'film',
        titulo: 'Guion gráfico con el costo',
        texto:
          'Antes de generar, el agente te muestra una escena por frase: sus segundos, qué se ve y si es clip o imagen, con el total de clips y créditos. Lo ajustan en el chat y solo se genera al decir «Hazlo».'
      },
      {
        icono: 'sparkles',
        titulo: 'Los clips que pida el guion',
        texto:
          'Ya no hay tope de 3 clips: se generan los del guion que apruebes (hasta 12). Primero hace la imagen de cada escena y la usa de referencia para que todo se vea coherente.'
      }
    ]
  },
  {
    version: '0.1.19',
    fecha: '2026-11-10',
    resumen: 'Todo pasa en el editor: conversas el plan con el agente, le pides cambios en vivo y, si se acaba el uso de tu plan, sigue solo donde iba.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Todo en el editor, con el chat al lado',
        texto:
          'Ya no hay pantalla de pasos: ves tu material y, al terminar, el editor ocupa ese lugar con el mismo chat. La caja del chat trae todo: material, agente y modelo, voz, imágenes, clips y «Pregúntame antes / Hazlo directo». Puedes parar al agente cuando quieras.'
      },
      {
        icono: 'sparkles',
        titulo: 'Conversa el plan',
        texto:
          'Con «Pregúntame antes» el agente te propone ideas y te pregunta con opciones hasta tener el plan; tú dices «Hazlo». También puede generarte imágenes o clips en plena charla (antes de un clip te dice cuánto cuesta).'
      },
      {
        icono: 'scissors',
        titulo: 'Cambios en el mismo video',
        texto:
          '«Cambio rápido» toca la timeline al momento, sin rehacer el video. Si el agente lo rehace, la versión nueva entra en el mismo editor y Ctrl+Z vuelve a la anterior con tus retoques.'
      },
      {
        icono: 'clock',
        titulo: 'Si se acaba el uso, no se pierde nada',
        texto:
          'Si tu plan se queda sin uso a mitad del video, queda en pausa y sigue solo cuando se renueva (con la app abierta), desde donde iba. O elige otro agente y dale a «Seguir donde iba». Si el render ya había terminado, te lo entrega igual.'
      },
      {
        icono: 'film',
        titulo: 'Mejor criterio de edición',
        texto:
          'La duración la decide el material (ya no 30 s por defecto), el agente ordena las tomas por lo que cuenta, pone los logos cuando se nombran, no tapa caras, no monta subtítulos y no deja renders a medias.'
      }
    ]
  },
  {
    version: '0.1.18',
    fecha: '2026-11-10',
    resumen: 'El agente genera imágenes y clips con tus cuentas, recibe carpetas enteras de material y eliges su modelo en un menú nuevo.',
    novedades: [
      {
        icono: 'image',
        titulo: 'Imágenes y clips para el agente',
        texto:
          'Elige en la caja imágenes de Google Flow (Nano Banana) o de ChatGPT y clips de Flow (Veo u Omni). El agente los pide cuando el video los necesita, con tus fotos de referencia si hace falta; los clips, hasta 3 y con tope de costo.'
      },
      {
        icono: 'carpeta',
        titulo: 'Una carpeta entera de material',
        texto: 'El botón «+» añade archivos o una carpeta: el agente recibe todas sus fotos y videos, también los de subcarpetas.'
      },
      {
        icono: 'sliders',
        titulo: 'Elegir modelo, más claro',
        texto:
          'Los agentes a un lado y sus modelos al otro, con para qué sirve cada uno, el recomendado y el esfuerzo. Aparecen los modelos nuevos (Fable 5.2) y los nombres exactos de ChatGPT (GPT-6-Luna, GPT-5.6-Terra…).'
      },
      {
        icono: 'check',
        titulo: 'Caja más simple',
        texto: 'Empieza sin voz, ya no pide la duración (dila en tu pedido si la quieres) y enviar es una flecha.'
      }
    ]
  },
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
