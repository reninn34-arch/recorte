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
    version: '0.1.76',
    fecha: '2026-11-17',
    resumen: 'Los personajes animados mueven los brazos sin cortar la ropa, y los textos letra a letra ya no desaparecen en el monitor.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Brazos que se mueven sin cortar la ropa',
        texto:
          'Cuando un personaje recortado abre los brazos (explicar, saludar, señalar), lo que tapaban sus manos, como el borde de una falda o de un saco, ahora se rellena con la tela de alrededor. Ya no queda un hueco ni unas rayas que se van con el brazo.'
      },
      {
        icono: 'type',
        titulo: 'Los textos letra a letra no se borran en el monitor',
        texto:
          'Un texto que se escribe letra a letra (una carta, un telegrama) podía verse en blanco en la vista previa o al mirar un cuadro suelto, porque volvía a escribirse desde cero. Ahora, si ya se escribió, se ve entero.'
      },
      {
        icono: 'check',
        titulo: 'Claude Code sigue conectado al actualizar',
        texto:
          'Al actualizar Recorte, su conexión con Claude Code (MCP) espera a que la versión anterior suelte su puerto y se queda en el mismo. Si tiene que cambiarlo, se vuelve a registrar sola en Claude Code.'
      }
    ]
  },
  {
    version: '0.1.75',
    fecha: '2026-11-16',
    resumen: 'Los videos largos con IA ya no se cortan a los 40 minutos, y la voz espera el límite de Google en vez de rendirse.',
    novedades: [
      {
        icono: 'clock',
        titulo: 'Videos largos sin cortes',
        texto:
          'Antes Recorte paraba al agente a los 40 minutos aunque siguiera trabajando. Ahora solo lo para si lleva 20 minutos sin avanzar (sin decir nada ni crear archivos), con un tope de 2 horas por seguridad.'
      },
      {
        icono: 'volumen',
        titulo: 'La voz espera el límite de Google',
        texto:
          'Cuando Google pide esperar por el límite de voces por minuto, Recorte espera y sigue con la misma frase. Si es la cuota del día, prueba con el modelo ligero o te lo dice claro.'
      }
    ]
  },
  {
    version: '0.1.74',
    fecha: '2026-11-16',
    resumen: 'Los modelos de Gemini aparecen al día y los niveles siguen solos a los modelos nuevos.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Modelos de Gemini al día',
        texto:
          'La lista de modelos de Gemini se lee del Gemini CLI instalado (antes, cuando lo instalaba Recorte, solo salían Gemini 2.5 Flash y 2.5 Pro). Ahora aparecen los nuevos, como Gemini 3.1 Pro y 3.8 Flash.'
      },
      {
        icono: 'sparkles',
        titulo: 'Niveles que siguen a los modelos nuevos',
        texto:
          'Rápido, equilibrado y máximo ya no apuntan a modelos fijos: en Kimi salen de los modelos de tu cuenta y en Gemini usan «pro» y «flash», que Google mantiene en el mejor al que llega tu cuenta. Cuando sale un modelo nuevo, el nivel lo usa solo.'
      }
    ]
  },
  {
    version: '0.1.73',
    fecha: '2026-11-16',
    resumen: 'Los modelos de ChatGPT aparecen desde el primer momento, también en una instalación nueva.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Modelos de ChatGPT en una instalación nueva',
        texto:
          'Antes, la lista de modelos de ChatGPT (Codex) salía vacía hasta haber usado Codex una vez. Ahora Recorte se la pide a Codex sin gastar nada, y en cuanto lo usas aparecen los de tu cuenta.'
      }
    ]
  },
  {
    version: '0.1.72',
    fecha: '2026-11-16',
    resumen: 'En Mac, las versiones nuevas se bajan solas y se instalan con «Reiniciar y actualizar», como en Windows.',
    novedades: [
      {
        icono: 'download',
        titulo: 'Actualizaciones automáticas en Mac',
        texto:
          'Recorte baja solo la versión nueva y, cuando está lista, te avisa: «Reiniciar y actualizar» cambia la app en Aplicaciones y la vuelve a abrir. Ya no hay que ir a la página a bajarla. Si la app está en una carpeta donde no se puede escribir, sigue el aviso de bajarla a mano.'
      }
    ]
  },
  {
    version: '0.1.71',
    fecha: '2026-11-16',
    resumen: 'Flow y las voces de Google ya se conectan en Mac, con Edge o con Chrome.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Flow y las voces de Google en Mac',
        texto:
          'Para entrar con tu cuenta de Google, Recorte abre Microsoft Edge o, si no lo tienes, Google Chrome. Antes solo buscaba Edge en Windows, y en Mac los botones de Flow salían desactivados.'
      }
    ]
  },
  {
    version: '0.1.70',
    fecha: '2026-11-16',
    resumen: 'En Mac, Antigravity ya se instala y la búsqueda de actualizaciones funciona.',
    novedades: [
      {
        icono: 'download',
        titulo: 'Antigravity en Mac',
        texto: 'Al conectar el agente de Google en Mac salía «No pude descomprimir Antigravity (código 127)». Ya se instala y queda listo.'
      },
      {
        icono: 'check',
        titulo: 'Buscar actualizaciones en Mac',
        texto: 'En Ajustes → Versión ya no sale el error de «latest-mac.yml»: Recorte mira la última versión publicada y, si hay una nueva, te avisa con el botón «Descargar».'
      }
    ]
  },
  {
    version: '0.1.69',
    fecha: '2026-11-16',
    resumen: 'Conectar un agente ya no pide instalar Node.js a mano, también en Mac.',
    novedades: [
      {
        icono: 'download',
        titulo: 'Conectar agentes sin instalar nada a mano',
        texto:
          'Si al pulsar «Instalar y conectar» falta Node.js, Recorte lo baja solo a su carpeta y sigue con el agente. En Mac, la ventana de la Terminal para iniciar sesión ya encuentra Node.js y el agente que bajó Recorte.'
      }
    ]
  },
  {
    version: '0.1.68',
    fecha: '2026-11-16',
    resumen: 'El monitor reproduce sin trabarse los tramos pesados, y llegan los medidores de color, el color por zonas, el ecualizador y el borrado de objetos grandes.',
    novedades: [
      {
        icono: 'play',
        titulo: 'Vista previa renderizada',
        texto:
          'Los tramos con capas, piezas animadas o efectos se preparan solos en segundo plano mientras no reproduces, y el monitor los reproduce sin trabarse. En la regla de la línea de tiempo, una franja verde marca lo que ya está listo y una ámbar lo que se está preparando.'
      },
      {
        icono: 'sliders',
        titulo: 'Medidores de color',
        texto:
          'Con el botón de arriba a la derecha del monitor: forma de onda, vectorscopio (con la línea del tono de piel) e histograma, del cuadro que ves y con tu color aplicado.'
      },
      {
        icono: 'palette',
        titulo: 'Color por zonas',
        texto:
          'En el panel del clip: elige un color (los rojos, la piel, el cielo…) y cámbiale el tono, la saturación o la luz sin tocar el resto. En pausa el monitor te enseña el cuadro ya pintado.'
      },
      {
        icono: 'volumen',
        titulo: 'Ecualizador y compresor',
        texto:
          'En el sonido de cada clip: graves, medios y agudos, y un compresor que empareja lo fuerte y lo suave. Se oyen igual en el monitor y en el video exportado, y «Mejorar voz» ahora también se oye en el monitor.'
      },
      {
        icono: 'seleccion',
        titulo: 'Borrar objetos grandes',
        texto:
          'Al borrar un objeto grande, Recorte lo rellena con LaMa (se baja una vez, 208 MB): continúa lo que hay alrededor en vez de dejar una mancha. Con la cámara quieta va rápido; con la cámara en movimiento tarda unos segundos por cuadro.'
      },
      {
        icono: 'check',
        titulo: 'Arreglos',
        texto:
          'Exportar solo un tramo ya no repite las entradas de las capas ni reinicia los textos animados o los videos de encima, y sacar un cuadro en un proyecto de 60 fps ya no exporta la timeline entera.'
      }
    ]
  },
  {
    version: '0.1.67',
    fecha: '2026-11-16',
    resumen: 'Arregla el monitor que se veía negro en un clip sí y otro no, y llega Recorte para Mac.',
    novedades: [
      {
        icono: 'video',
        titulo: 'El monitor ya no se ve negro en los cortes',
        texto:
          'En la 0.1.66, al reproducir, un clip sí y otro no se veía negro (solo con los subtítulos encima): el segundo video del monitor quedaba fuera del cuadro. Ahora los dos ocupan el mismo lugar y se ven todos los clips.'
      },
      {
        icono: 'download',
        titulo: 'Recorte para Mac',
        texto:
          'Hay un .dmg para Mac con chip Apple (M1 y siguientes) y otro para Intel, en la página de versiones. En Ajustes → Herramientas de video, «Instalar todo lo que falta» baja FFmpeg, Python y Node.js también en Mac. La primera vez, macOS pide confirmar en Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente», porque la app aún no está firmada por Apple; por eso en Mac las versiones nuevas se avisan y se bajan a mano.'
      }
    ]
  },
  {
    version: '0.1.66',
    fecha: '2026-11-16',
    resumen: 'Arregla el monitor que se veía negro con los subtítulos animados y quita la pausa en los cortes al reproducir.',
    novedades: [
      {
        icono: 'video',
        titulo: 'El monitor vuelve a mostrar el video con las piezas animadas',
        texto:
          'En la 0.1.65 las piezas con transparencia (subtítulos «píldora», íconos) recibían una copia liviana sin transparencia y tapaban el video con un fondo negro. Ahora esos archivos no reciben copia, y las copias malas que ya se habían hecho se borran solas al abrir el proyecto.'
      },
      {
        icono: 'video',
        titulo: 'Cortes sin pausa al reproducir',
        texto:
          'Al llegar al corte entre dos clips, el monitor se detenía un instante y la voz podía desfasarse. Ahora tiene un segundo video listo en el siguiente clip y solo cambia de uno a otro, así que la reproducción sigue sin tropiezos.'
      }
    ]
  },
  {
    version: '0.1.65',
    fecha: '2026-11-16',
    resumen: 'El monitor va más fluido con videos 4K o pesados: Recorte les hace una copia liviana por su cuenta.',
    novedades: [
      {
        icono: 'video',
        titulo: 'Copias livianas de tus videos',
        texto:
          'Cuando agregas un video más grande que 1080p (o de un formato que el monitor lee mal, como HEVC o ProRes), Recorte hace en segundo plano una copia de 720p y el monitor la usa. Al exportar, y en los efectos como persona, borrar o cielo, se sigue usando el video original: la calidad final no cambia. Los videos chicos no se tocan.'
      }
    ]
  },
  {
    version: '0.1.64',
    fecha: '2026-11-16',
    resumen: 'Recorta cualquier objeto con un clic, borra objetos con su forma exacta, cambia el cielo y aguanta videos largos.',
    novedades: [
      {
        icono: 'seleccion',
        titulo: 'Recortar un objeto (rotoscopia)',
        texto:
          'En «Tapar una zona» elige el modo «Recortar (rotoscopia)», pon la zona sobre el objeto al empezar el clip y pulsa «Recortar lo marcado»: Recorte lo recorta con bordes finos (modelo SAM 2, se baja una vez, 156 MB) y lo sigue por todo el clip. Queda encima con transparencia: un texto «detrás» o lo que pongas debajo se ve por detrás de él.'
      },
      {
        icono: 'seleccion',
        titulo: 'Borrar objetos, ahora con su forma',
        texto:
          'El modo «Borrar» ya no rellena toda la caja: saca la forma exacta del objeto y lo sigue solo aunque se mueva, sin trazar su recorrido. Si no lo encuentra en el primer cuadro, te dice que ajustes la caja.'
      },
      {
        icono: 'seleccion',
        titulo: 'Cambiar el cielo',
        texto:
          'Elige un cielo (atardecer, azul, amanecer, nublado o noche) y pulsa «Cambiar el cielo» en un clip de exterior. Funciona mejor con el cielo bien visible arriba; con ramas finas el borde queda imperfecto.'
      },
      {
        icono: 'scissors',
        titulo: 'Videos largos',
        texto:
          'Separar a la persona, borrar objetos, recortar y cambiar el cielo ahora trabajan por tramos de 30 s que se guardan: si se corta o lo paras, al repetirlo sigue desde el último tramo.'
      }
    ]
  },
  {
    version: '0.1.63',
    fecha: '2026-11-16',
    resumen: 'Borra objetos de un video y quita las tomas repetidas cuando te equivocas al hablar.',
    novedades: [
      {
        icono: 'seleccion',
        titulo: 'Borrar un objeto del video',
        texto:
          'En «Tapar una zona» elige el modo «Borrar (rellenar)», pon la zona sobre un logo, una marca de agua o un cartel y pulsa «Borrar lo marcado»: Recorte lo rellena con lo que lo rodea. Si el objeto se mueve, usa «Seguir». También se lo puedes pedir al agente. Va bien con objetos chicos sobre fondos parejos.'
      },
      {
        icono: 'scissors',
        titulo: 'Tomas repetidas en la limpieza',
        texto:
          'Si te equivocas y repites la frase desde el principio, la Limpieza automática quita el intento fallido y deja la última toma. Se activa con la casilla «Tomas repetidas».'
      }
    ]
  },
  {
    version: '0.1.62',
    fecha: '2026-11-15',
    resumen: 'Separa a la persona del fondo en un video: textos y títulos por detrás de ella, o cámbiale el fondo.',
    novedades: [
      {
        icono: 'seleccion',
        titulo: 'Separar a la persona',
        texto:
          'Elige un clip y pulsa «Separar a la persona»: Recorte la recorta cuadro a cuadro (tal como se ve el clip, con su zoom y su color) y la pone encima. Tarda unos 10 segundos por cada segundo de clip y no gasta créditos.'
      },
      {
        icono: 'type',
        titulo: 'Texto detrás de la persona',
        texto:
          'Marca «Detrás de la persona» en un texto y queda por detrás de su cabeza y su cuerpo, como en los reels. Lo que pongas en las pistas 1 y 2 (títulos animados, logos) también queda detrás.'
      },
      {
        icono: 'image',
        titulo: 'Cambiar o desenfocar el fondo',
        texto: 'Con la persona separada, desenfoca el clip o pon una imagen a pantalla completa debajo: ella sigue nítida encima.'
      },
      {
        icono: 'enviar',
        titulo: 'También desde el chat',
        texto: 'Pídele «pon el título detrás de ella en el clip 3» y el agente separa a la persona y coloca el texto.'
      }
    ]
  },
  {
    version: '0.1.61',
    fecha: '2026-11-15',
    resumen: 'Los videos con muchos clips ya no agotan la memoria al armarse.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Armado sin quedarse sin memoria',
        texto:
          'Con muchos clips, el armado abría todos a la vez en cada núcleo y el equipo se quedaba sin memoria (el video se trababa sin avisar). Ahora cada clip se abre cuando le toca y se cierra al terminar: un promo de 12 clips se arma en minuto y medio. Y si algo se traba, el armado se corta y dice por qué.'
      }
    ]
  },
  {
    version: '0.1.60',
    fecha: '2026-11-15',
    resumen: 'Los videos que hace tu agente desde una tarjeta ya no se quedan colgados al armarse.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Videos con efectos de sonido que no terminaban',
        texto:
          'Si el video llevaba efectos de sonido (un pop, un confeti), el armado se quedaba trabado para siempre y la tarjeta acababa en «No dejaste un archivo nuevo». Ya arma normal: un promo de 17 s, en unos 2 minutos.'
      },
      {
        icono: 'sparkles',
        titulo: 'Recorte espera a tu agente',
        texto:
          'Si tu agente sigue trabajando después de decir que terminó (esperando un render), Recorte ya no lo corta a los 10 segundos: espera a que acabe.'
      }
    ]
  },
  {
    version: '0.1.59',
    fecha: '2026-11-14',
    resumen: 'Arreglos de los subtítulos animados y de las animaciones que se ponen juntas.',
    novedades: [
      {
        icono: 'type',
        titulo: 'Rótulo más ancho',
        texto: 'Los subtítulos estilo Rótulo usan el ancho del cuadro: una frase corta va en uno o dos renglones, no en cuatro.'
      },
      {
        icono: 'sparkles',
        titulo: 'Varias animaciones en un pedido',
        texto: 'Si el chat o un agente pone varias animaciones de una vez, quedan todas (antes solo se quedaba la última).'
      }
    ]
  },
  {
    version: '0.1.58',
    fecha: '2026-11-14',
    resumen: 'Los textos que ya tenías pueden volverse subtítulos animados.',
    novedades: [
      {
        icono: 'type',
        titulo: '«Es un subtítulo»',
        texto:
          'Al elegir un texto, marca «Es un subtítulo» y entra en los subtítulos animados con HyperFrames. Sirve para proyectos que hiciste antes, sin borrar y rehacer los textos; el chat y los agentes también pueden marcarlos.'
      }
    ]
  },
  {
    version: '0.1.57',
    fecha: '2026-11-14',
    resumen: 'Los subtítulos ahora los anima HyperFrames: estilos con movimiento de verdad, y si corriges una palabra se vuelven a animar.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Subtítulos animados con HyperFrames',
        texto:
          'En Texto › Subtítulos elige un estilo animado (Rótulo, Píldora o Palabra gigante), cambia sus colores y anímalos. Los textos siguen en la timeline: corriges una palabra o un tiempo a mano y se vuelven a animar con el cambio (al exportar, solos).'
      },
      {
        icono: 'type',
        titulo: 'Tus propios estilos de subtítulos',
        texto: 'Descríbele a tu agente cómo quieres que se muevan tus subtítulos y lo crea con HyperFrames; queda entre tus estilos para cualquier video.'
      },
      {
        icono: 'enviar',
        titulo: 'El chat también los pone',
        texto: 'Pídele «subtítulos tipo rótulo con las palabras clave en turquesa» y quedan animados; si después corrige un texto, se rehacen solos.'
      }
    ]
  },
  {
    version: '0.1.56',
    fecha: '2026-11-14',
    resumen: 'Subtítulos tipo rótulo con palabras clave en color, y una animación nueva de íconos para ilustrar lo que dices.',
    novedades: [
      {
        icono: 'type',
        titulo: 'Subtítulos «Rótulo» y palabras resaltadas',
        texto: 'Un estilo de subtítulos limpio y profesional: letra negra blanca en una caja oscura, que aparece y crece un poco. Escribe una palabra entre *asteriscos* y sale en el color que elijas. Y una letra nueva: «Negra».'
      },
      {
        icono: 'sparkles',
        titulo: 'Ícono animado',
        texto: 'En «Animadas»: un regalo, un anillo, globos, un osito, una bolsa, un corazón, una estrella o un lazo de fiesta que entra con un rebote, flota con brillitos y sale. Con tus colores, donde no tape a nadie.'
      }
    ]
  },
  {
    version: '0.1.55',
    fecha: '2026-11-14',
    resumen: 'Tu agente crea animaciones nuevas a tu medida: las diseña, las mira, las corrige y quedan en «Mis animaciones».',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Crea una animación nueva',
        texto: 'En «Animadas»: descríbela como a un diseñador (y si quieres, pásale un video o una imagen de referencia). Tu agente la hace con HyperFrames en unos minutos, la revisa cuadro a cuadro y la corrige. Queda en «Mis animaciones» para cualquier video, con tus colores y tu logo.'
      },
      {
        icono: 'undo',
        titulo: 'Pedir cambios y hacer tu versión',
        texto: '«Pedir cambios» en una animación tuya («más lenta», «sin confeti») y tu agente la corrige recordando lo que hizo. En las de la app, «Hacer mi versión» crea una copia tuya cambiada. En el chat del editor, si pides algo que ninguna hace, tu agente la crea y la pone.'
      }
    ]
  },
  {
    version: '0.1.54',
    fecha: '2026-11-14',
    resumen: 'Animaciones de diseño en movimiento con tu marca: títulos, rótulos, llamados a la acción, datos, transiciones y cierres con logo.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Pestaña «Animadas»',
        texto: 'Diez animaciones listas con tus colores y tu logo: título que golpea, rótulo inferior, frase con píldora, lista con checks, dato que cuenta, sello de oferta, llamado a la acción, barrido de marca, destellos y cierre con logo. Escribes tu texto, le das «Poner en el cabezal» y entra como una capa transparente. Para cambiarla, elígela y «Volver a animar».'
      },
      {
        icono: 'wand',
        titulo: 'Acabado profesional con el agente',
        texto: 'En el chat del editor: «Dale un acabado profesional» y el agente pone el título, los rótulos, la frase clave, el llamado a la acción y el cierre con tu logo, con criterio y efectos de sonido suaves. También lo puede hacer un agente conectado por MCP.'
      }
    ]
  },
  {
    version: '0.1.53',
    fecha: '2026-11-14',
    resumen: 'Las palabras pintadas se ven bien en cualquier cuadro.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Pintar palabras, pulido',
        texto: 'Al mirar un cuadro suelto (o exportar solo un tramo) a mitad de una frase, las palabras ya dichas salen pintadas y la que se está diciendo sigue pintándose: ya no vuelve a empezar desde cero.'
      }
    ]
  },
  {
    version: '0.1.52',
    fecha: '2026-11-14',
    resumen: 'Las palabras se pintan cuando se dicen: subtítulos tipo karaoke al ritmo exacto de la voz.',
    novedades: [
      {
        icono: 'type',
        titulo: 'Pintar palabras',
        texto: 'Una animación nueva para los textos: la frase entera se ve y cada palabra se rellena de color justo cuando se dice. Eliges el color en el texto. Y el estilo de subtítulos «Pintadas» lo pone en todos de una vez.'
      },
      {
        icono: 'volumen',
        titulo: 'Al ritmo de tu voz',
        texto: 'Al crear los subtítulos, Recorte escucha tu voz (también la que pones en la pista de voz) y sabe cuándo dices cada palabra: «Palabra a palabra» y «Pintar palabras» van con lo que dices, no a un ritmo fijo. Las frases se cortan en las comas y no dejan una palabra sola.'
      }
    ]
  },
  {
    version: '0.1.51',
    fecha: '2026-11-14',
    resumen: 'Revisar el audio encuentra y arregla lo que suena mal, separar el audio de un video está completo y los tiempos de la voz son más exactos.',
    novedades: [
      {
        icono: 'volumen',
        titulo: 'Revisar el audio',
        texto: 'En la pestaña IA: escucha tu edición y te dice dónde un corte se come una palabra (suena a que la persona se ahoga), los cortes secos, las respiraciones fuertes, el ruido de fondo y los silencios largos. Cada cosa con «Ir» y «Arreglar», o «Arreglar todo» de una vez (Ctrl+Z lo deshace).'
      },
      {
        icono: 'music',
        titulo: 'Separar audio, completo',
        texto: 'Clic derecho en un video con sonido: «Separar audio» siempre está, aunque el clip esté silenciado o con otra velocidad. Separa varios clips a la vez, vuelve a unirlo al video, y en el audio separado: dividir aquí (o la tecla S) y volumen rápido.'
      },
      {
        icono: 'type',
        titulo: 'Subtítulos y cortes justo a tiempo',
        texto: 'La transcripción pega cada frase a donde de verdad empieza y termina la voz: los subtítulos, «quitar pausas» y los cortes ya no se adelantan ni se atrasan.'
      },
      {
        icono: 'check',
        titulo: 'Arreglos',
        texto: 'Rehacer los cortes con el agente ya no borra la música, la voz ni las capas, y la vista de un cuadro muestra las capas animadas donde van. Los agentes conectados ahora pueden poner música y tu voz grabada (limpia) y elegir modelo y esfuerzo al crear un video.'
      }
    ]
  },
  {
    version: '0.1.50',
    fecha: '2026-11-13',
    resumen: 'El monitor a pantalla completa, una barra de controles que siempre cabe y los modelos de tus agentes al día solos.',
    novedades: [
      {
        icono: 'play',
        titulo: 'Monitor a pantalla completa',
        texto: 'Con el botón nuevo de la barra del monitor, la tecla F o el clic derecho, el video llena la pantalla con sus controles abajo. Sales con F o Esc.'
      },
      {
        icono: 'sliders',
        titulo: 'Controles que siempre caben',
        texto: 'En una ventana angosta la barra del monitor se acomoda sola en vez de cortarse, y las rutas largas del chat ya no se salen del panel.'
      },
      {
        icono: 'sparkles',
        titulo: 'Los modelos de tus agentes, al día',
        texto: 'Si tu cuenta de Kimi, Claude, ChatGPT (Codex), Gemini, OpenCode o Antigravity suma o quita un modelo, Recorte lo muestra solo: revisa al abrir y cada hora, sin gastar nada. Kimi ahora muestra todos los de tu cuenta, y si un modelo que elegiste ya no está, se usa el de siempre en vez de fallar.'
      }
    ]
  },
  {
    version: '0.1.49',
    fecha: '2026-11-13',
    resumen: 'Arrastra archivos a donde los quieras, usa el clic derecho en todo el editor y la app se ve bien en cualquier pantalla, también en monitores grandes.',
    novedades: [
      {
        icono: 'download',
        titulo: 'Arrastra tus archivos',
        texto: 'Suelta videos, fotos o audios desde Windows en el editor: en la pista de video entran en ese punto, sobre el monitor quedan encima y en Sonidos o Música suenan donde los dejas. También puedes pegarlos con Ctrl+V, y en la caja de Crear con IA se adjuntan solos.'
      },
      {
        icono: 'scissors',
        titulo: 'Clic derecho en todo el editor',
        texto: 'En un clip, un texto, una capa, un sonido, un hueco de la línea de tiempo, una marca, un medio o el monitor: dividir, duplicar, copiar, pegar, velocidad, estabilizar, añadir un texto aquí y más, a un clic. En los campos de texto, corregir la ortografía, copiar y pegar.'
      },
      {
        icono: 'sliders',
        titulo: 'Se adapta a tu pantalla',
        texto: 'En un monitor grande todo crece en proporción y ya no se ve diminuto. Ajústalo con Ctrl + y Ctrl − (Ctrl 0 vuelve a automático) o en Ajustes › Tamaño de la interfaz.'
      }
    ]
  },
  {
    version: '0.1.48',
    fecha: '2026-11-13',
    resumen: 'El editor completa sus herramientas: multicámara, rampas de velocidad, seguimiento, capas de ajuste, subtítulos editables, limpieza automática y mucho más.',
    novedades: [
      {
        icono: 'scissors',
        titulo: 'Limpieza automática',
        texto: 'En la pestaña IA: quita los silencios, las muletillas («eh», «mmm») y las palabras repetidas de una toma hablada con un clic. Te dice cuánto va a quitar antes, y se deshace todo junto.'
      },
      {
        icono: 'type',
        titulo: 'Subtítulos editables y plantillas',
        texto: 'En la pestaña Texto: los subtítulos de la voz como textos que corriges uno por uno, con estilos (Redes, Clásico, Limpio, Titular), y plantillas listas: rótulo inferior, título, cita, llamado a la acción y dato.'
      },
      {
        icono: 'film',
        titulo: 'Multicámara',
        texto: 'Varias tomas de la misma escena se sincronizan por el sonido; las ves a la vez y cortas entre ellas con un clic o con 1, 2, 3… También puedes dejar el sonido de una sola toma.'
      },
      {
        icono: 'velocidad',
        titulo: 'Velocidad, estabilizar y congelar',
        texto: 'Rampas de velocidad con ◆, Estabilizar un clip tembloroso, Congelar el cuadro del cabezal y Anidar varios clips en uno.'
      },
      {
        icono: 'ojo',
        titulo: 'Tapar zonas que siguen a alguien',
        texto: 'Difumina o tapa en negro una cara o una placa; la mueves en el monitor y con «Seguir lo que tapa» acompaña a lo que se mueve.'
      },
      {
        icono: 'palette',
        titulo: 'Capas de ajuste y más claves',
        texto: 'Una pista «Ajuste» que cambia el color o desenfoca todo lo de abajo en un tramo. Y fotogramas clave para Transformar, el color nuevo y el volumen.'
      },
      {
        icono: 'volumen',
        titulo: 'Sonido',
        texto: 'Separar el audio de un clip (cortes en J y L), recortar sonidos sueltos, hasta 3 pistas de sonidos, onda en los clips, Mejorar voz y Volumen para redes al exportar.'
      },
      {
        icono: 'layers',
        titulo: 'Monitor de origen, historial y más',
        texto: 'Abre un video con «Ver», marca su tramo e Insertar (,) o Sobrescribir (.). Historial para volver a cualquier paso, exportar entre entrada y salida, un cuadro como imagen o solo el sonido.'
      }
    ]
  },
  {
    version: '0.1.47',
    fecha: '2026-11-13',
    resumen: 'El editor da un salto hacia Premiere: transporte con código de tiempo, herramientas de edición, color tipo Lumetri, transformar y un mezclador de audio.',
    novedades: [
      {
        icono: 'clock',
        titulo: 'Transporte y código de tiempo',
        texto: 'Código de tiempo con cuadros (00:00:04:03), cuadro a cuadro, entrada y salida (I/O), «Extraer» lo que hay entre ellas (tecla \'), repetir, J/K/L, marcas en la regla (M) y saltos entre cortes con ↑ ↓.'
      },
      {
        icono: 'scissors',
        titulo: 'Herramientas de edición',
        texto: 'Paleta como la de Premiere: Selección (V), Recorte rodado (N), Deslizar (Y), Desplazar (U), Cuchilla (C) y Mano (H), con imán. Arrastra el divisor para agrandar la línea de tiempo.'
      },
      {
        icono: 'palette',
        titulo: 'Color, transformar y recortar',
        texto: 'Por clip: exposición, altas luces, sombras, blancos, negros, temperatura y tinte; escala, posición y rotación; y recortar los bordes. El monitor y el MP4 salen iguales.'
      },
      {
        icono: 'volumen',
        titulo: 'Mezclador de audio',
        texto: 'Un fader por pista (video, voz, sonidos y música) con su medidor de nivel, y el medidor general siempre a la vista en la barra de la línea de tiempo.'
      }
    ]
  },
  {
    version: '0.1.46',
    fecha: '2026-11-13',
    resumen: '«Explicativo 3D» trae piezas afinadas: la voz con ritmo natural, el texto palabra por palabra al segundo, el sonido y modelos 3D que se guardan.',
    novedades: [
      {
        icono: 'velocidad',
        titulo: 'Tu voz, con ritmo de video',
        texto: 'Con tu narración grabada, el agente acorta las pausas largas sin tocar tus palabras ni tu tono, y cada palabra en pantalla sale justo cuando la dices, escrita como en tu guion (los nombres y las marcas, bien escritos).'
      },
      {
        icono: 'music',
        titulo: 'El sonido del video 3D',
        texto: 'La música baja sola cuando hablas y entran los efectos de Recorte en su momento: un «pop» cuando aparece un ícono, un «whoosh» al cambiar de ambiente.'
      },
      {
        icono: 'cubo',
        titulo: 'Modelos 3D que se guardan',
        texto: 'Lo que el agente modela (una sonrisa, una muela, un frasco) queda guardado y el siguiente video lo reutiliza. Ya viene una sonrisa 3D que abre la boca y muestra un diente manchado, roto o que falta, y el brillo blanco del después.'
      }
    ]
  },
  {
    version: '0.1.45',
    fecha: '2026-11-13',
    resumen: 'El editor suma varias pistas de video, el sonido de cada clip y el desenfoque animado de las capas.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Varias pistas de video',
        texto: '«Encima» ahora tiene hasta tres pistas: arrastra una capa arriba o abajo para cambiarla de pista, o suelta un medio en la fila que quieras. La de arriba tapa a las demás, en el monitor y en el video exportado.'
      },
      {
        icono: 'volumen',
        titulo: 'El sonido de cada clip',
        texto: 'Con un clip de video elegido: su volumen, que entre y salga fundiéndose, y quitar el ruido de fondo (el zumbido, el aire, el siseo). El ruido y el volumen por encima de 100 % se oyen en el video exportado.'
      },
      {
        icono: 'film',
        titulo: 'Desenfoque animado y exportación más rápida',
        texto: 'El desenfoque de una capa ya tiene su rombo ◆ de fotograma clave: que algo empiece nítido y se vaya de foco, o al revés. Y los videos con capas de opacidad animada se exportan varias veces más rápido.'
      }
    ]
  },
  {
    version: '0.1.44',
    fecha: '2026-11-13',
    resumen: 'Fotogramas clave: anima a mano el encuadre, el color y el movimiento de tus clips y capas.',
    novedades: [
      {
        icono: 'film',
        titulo: 'Fotogramas clave en los clips',
        texto: 'Toca el rombo ◆ junto al zoom, el encuadre o el color de un clip, pon el cabezal en otro momento, cambia el valor y se anima solo, acelerando y frenando suave. Un zoom que entra y sale, un fundido a oscuro, el color que se apaga.'
      },
      {
        icono: 'layers',
        titulo: 'Fotogramas clave en las capas',
        texto: 'Los logos, personajes y fotos encima pueden animar su sitio, tamaño, giro y opacidad: entrar volando, crecer, girar, aparecer y desvanecerse. Mover la capa en el monitor pone la clave en el cabezal.'
      },
      {
        icono: 'check',
        titulo: 'Igual en el monitor y en el MP4',
        texto: 'Las claves van pegadas al material (se conservan al dividir y recortar) y el video exportado se mueve exactamente como lo ves en el monitor.'
      },
      {
        icono: 'wand',
        titulo: 'El agente también las usa',
        texto: 'El agente y la conexión por MCP pueden poner fotogramas clave en clips y capas para hacer animaciones a medida.'
      }
    ]
  },
  {
    version: '0.1.43',
    fecha: '2026-11-12',
    resumen: 'Un panel de efectos como el de los editores profesionales, y colores correctos al exportar con tarjeta AMD.',
    novedades: [
      {
        icono: 'sliders',
        titulo: 'Panel de efectos',
        texto: 'Con buscador y carpetas: looks de color (Cine, Vivo, Vintage, Noche, Blanco y negro…), efectos de video, transiciones, movimientos de cámara y aspectos de película. Cada uno muestra su vista previa sobre tu clip.'
      },
      {
        icono: 'sparkles',
        titulo: 'Aplícalos con un clic o arrastrando',
        texto: 'Toca un efecto para ponérselo al clip elegido, o arrástralo sobre cualquier clip de la línea de tiempo. En el inspector ajustas cada uno y lo quitas.'
      },
      {
        icono: 'image',
        titulo: 'Efectos nuevos de clip',
        texto: 'Desenfoque, sepia, giro de tono y negativo. Salen en el MP4 exactamente como los ves en el monitor.'
      },
      {
        icono: 'wand',
        titulo: 'Más herramientas para el agente',
        texto: 'El agente y la conexión por MCP ya pueden poner looks y efectos, cambiar la velocidad de un clip y ocultar o silenciar pistas.'
      },
      {
        icono: 'check',
        titulo: 'Colores correctos con tarjeta AMD',
        texto: 'Con una tarjeta AMD, los colores vivos salían ligeramente cambiados al exportar. Ya salen como en el monitor.'
      }
    ]
  },
  {
    version: '0.1.42',
    fecha: '2026-11-12',
    resumen: 'Un editor nuevo, ordenado como los editores profesionales, con velocidad, ondas de audio y más atajos.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Editor reorganizado',
        texto: 'La biblioteca a la izquierda (Medios, Texto, Audio, Efectos, IA), el monitor al centro, los ajustes de lo que elijas a la derecha y la línea de tiempo abajo. El chat del agente se pliega para dejar más sitio.'
      },
      {
        icono: 'film',
        titulo: 'Miniaturas y ondas',
        texto: 'Cada clip muestra su imagen en la línea de tiempo, y la voz, los sonidos y la música dibujan su onda.'
      },
      {
        icono: 'velocidad',
        titulo: 'Cámara lenta y rápida',
        texto: 'Cambia la velocidad de un clip de video, de 0,25× a 4×. Se ve en el monitor y sale igual en el MP4.'
      },
      {
        icono: 'ojo',
        titulo: 'Pistas con control',
        texto: 'Oculta o silencia una pista entera, o bloquéala para no moverla sin querer.'
      },
      {
        icono: 'copy',
        titulo: 'Copiar, pegar y elegir varios',
        texto: 'Ctrl+C, Ctrl+X y Ctrl+V sobre clips, textos, capas y sonidos. Con Ctrl + clic eliges varios y los borras de una vez. Ctrl+B divide.'
      },
      {
        icono: 'check',
        titulo: 'Arreglos',
        texto: 'El agente ya puede usar caminar, correr y los demás movimientos al componer una escena, y avisa si un texto queda donde el personaje salta o patea.'
      }
    ]
  },
  {
    version: '0.1.41',
    fecha: '2026-11-12',
    resumen: 'Sigue trabajando tus videos como en una charla: aprueba una versión, vuelve a otra y haz más videos con el mismo estilo.',
    novedades: [
      {
        icono: 'check',
        titulo: 'Así está bien',
        texto: 'Debajo del video ves todas sus versiones. Marca la buena: los cambios que pidas después parten de ella y conservan lo demás.'
      },
      {
        icono: 'undo',
        titulo: 'Volver a una versión',
        texto: 'Si un cambio empeoró el video, vuelve a una versión anterior con un clic. El agente sigue desde ahí, sin rehacer nada.'
      },
      {
        icono: 'sparkles',
        titulo: 'Otro video así',
        texto: 'Cuenta de qué trata el siguiente y el agente lo hace con el mismo estilo: letras, colores, ritmo, cámara, música, personajes y todo lo que corregiste.'
      },
      {
        icono: 'layers',
        titulo: 'Mis estilos',
        texto: 'Guarda el estilo de un video que te gustó con un nombre y elígelo en «Crear con IA» cuando quieras.'
      }
    ]
  },
  {
    version: '0.1.40',
    fecha: '2026-11-12',
    resumen: 'Personajes que se mueven enteros: caminan, corren, saltan y se sientan, como muñecos articulados.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Muñeco por piezas',
        texto: 'El agente corta al personaje en cabeza, torso, brazos, manos, piernas y pies, y cada pieza gira sobre su bisagra sin estirarse. Ideal para juguetes, figuras y dibujos.'
      },
      {
        icono: 'play',
        titulo: 'Camina, corre, salta y se sienta',
        texto: 'Movimientos nuevos para los personajes de cuerpo entero: caminar, correr, saltar, agacharse, sentarse, patear y bailar. Los pies siguen en el suelo. En el editor están en el menú de animar de cada capa.'
      },
      {
        icono: 'image',
        titulo: 'Escenarios por planos',
        texto: 'El agente arma cada lugar con su fondo y, por separado, lo que va delante (una mesa, una valla, plantas). El personaje queda entre ellos y la cámara 3D da sensación de espacio.'
      },
      {
        icono: 'check',
        titulo: 'Duración exacta',
        texto: 'Con tarjetas AMD, los videos del agente ya no duran medio segundo de más al final.'
      }
    ]
  },
  {
    version: '0.1.39',
    fecha: '2026-11-12',
    resumen: 'Música y efectos de sonido incluidos, videos más rápidos con tu tarjeta gráfica y una voz que ya no falla.',
    novedades: [
      {
        icono: 'music',
        titulo: 'Música libre incluida',
        texto: '30 pistas para tus videos, de seis ánimos: tensa, épica, emotiva, alegre, calma y misterio. Clásica de orquesta y piano, y moderna. Se pueden usar en cualquier video, también para vender, sin pagar ni dar crédito. El agente elige la que va con tu historia.'
      },
      {
        icono: 'sparkles',
        titulo: '34 efectos de sonido',
        texto: 'Además de whoosh, pop y ding: impacto de cine, subida de tensión, glitch, máquina de escribir, cámara de fotos, reloj, pasos, monedas y ambientes de lluvia, ciudad, fábrica o multitud. En el editor, el botón «Sonido» los muestra por grupos, y el agente los pone donde los pondría un editor.'
      },
      {
        icono: 'film',
        titulo: 'Usa tu tarjeta gráfica',
        texto: 'Si tu equipo tiene una tarjeta NVIDIA, AMD o Intel, los videos se codifican con ella y el recorte de personas y la profundidad van más rápido.'
      },
      {
        icono: 'clock',
        titulo: 'Mide tu equipo',
        texto: 'En Ajustes, «Medir velocidad» te dice cuánto tardaría tu equipo en hacer un documental y si usa la tarjeta gráfica.'
      },
      {
        icono: 'check',
        titulo: 'Voz sin fallos y mejor criterio',
        texto: 'La narración ya no falla al descargarse. Con Claude Code, el video lo hace Opus, el modelo más capaz, y también lo revisa con ojos frescos antes de entregártelo.'
      }
    ]
  },
  {
    version: '0.1.38',
    fecha: '2026-11-11',
    resumen: 'El agente arma los documentales por piezas: personajes, decorados y objetos sueltos, compuestos de forma creíble.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Por piezas',
        texto: 'En vez de pedir escenas enteras, el agente pide cada personaje sobre verde, los lugares vacíos y los objetos sueltos, y compone cada escena: el personaje animado delante de su escenario en 3D.'
      },
      {
        icono: 'image',
        titulo: 'Personajes que encajan',
        texto: 'El personaje queda de pie en el suelo del decorado, con su luz y su color, y con una sombra: ya no parece pegado encima.'
      },
      {
        icono: 'sparkles',
        titulo: 'Más variedad',
        texto: 'El mismo personaje hace cosas distintas en cada escena, con su misma cara, y cambia de plano. Si repite la misma pose demasiadas veces, el agente se entera y lo corrige.'
      }
    ]
  },
  {
    version: '0.1.37',
    fecha: '2026-11-11',
    resumen: 'Los videos del agente se renderizan varias veces más rápido, con el mismo resultado.',
    novedades: [
      {
        icono: 'clock',
        titulo: 'Render mucho más rápido',
        texto: 'El agente dibuja varios cuadros a la vez con todos los núcleos de tu equipo y cada cuadro tarda la mitad. Un documental de 50 s con escenas 3D y personajes animados pasó de unos 45 minutos a unos 10.'
      },
      {
        icono: 'check',
        titulo: 'Sabes cuánto falta',
        texto: 'Mientras renderiza, el agente ve cuánto le falta y, al terminar, cuánto tardó.'
      },
      {
        icono: 'sparkles',
        titulo: 'Al pasar al editor, sin repetir',
        texto: 'Si el mismo personaje con el mismo movimiento sale en varias escenas, se anima una sola vez.'
      }
    ]
  },
  {
    version: '0.1.36',
    fecha: '2026-11-11',
    resumen: 'Escenas vivas: el agente separa a las personas de su escenario y las anima, en vez de entregar fotos con zoom.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Escenas vivas',
        texto: 'De cada imagen con una persona, el agente la recorta, consigue el escenario sin ella, lo parte en planos y la pone delante animada como marioneta: una escena con distancia y movimiento, sin gastar créditos.'
      },
      {
        icono: 'image',
        titulo: 'El mismo personaje, la misma cara',
        texto: 'Genera primero al protagonista y lo usa de referencia en cada escena donde vuelve a salir.'
      },
      {
        icono: 'sparkles',
        titulo: 'Avisa si queda plano o lento',
        texto: 'Antes de entregar avisa si el video es casi todo fotos planas o si la imagen cambia demasiado despacio para redes.'
      },
      {
        icono: 'check',
        titulo: 'Tus ajustes se respetan',
        texto: 'Al abrir una creación, la caja del chat ya no le quita las imágenes si tu cuenta de Flow tarda en cargar.'
      }
    ]
  },
  {
    version: '0.1.35',
    fecha: '2026-11-11',
    resumen: 'Las correcciones ya son rápidas desde el segundo cambio, y el permiso de voz se pide una sola vez.',
    novedades: [
      {
        icono: 'scissors',
        titulo: 'Correcciones rápidas de verdad',
        texto: 'Al pedir un cambio, el agente solo vuelve a dibujar los segundos que cambian. Antes, la copia para el editor le hacía perder esa memoria y el video se rehacía entero.'
      },
      {
        icono: 'key',
        titulo: 'El permiso de voz, una vez',
        texto: 'Lo que aceptas gastar en una creación (la voz) queda guardado con ella: ya no se te pregunta en cada versión, aunque reinicies Recorte. Solo se vuelve a preguntar si el gasto cambia.'
      }
    ]
  },
  {
    version: '0.1.34',
    fecha: '2026-11-11',
    resumen: 'Correcciones quirúrgicas: el agente cambia solo lo que pides, sin rehacer ni gastar de más, y revisa como un editor.',
    novedades: [
      {
        icono: 'scissors',
        titulo: 'Cambios quirúrgicos',
        texto: 'Cuando pides un cambio, el agente ubica de qué hablas, cambia solo esa parte y solo vuelve a dibujar esos segundos: una corrección tarda minutos, no media hora. Te contesta punto por punto qué hizo con cada cosa.'
      },
      {
        icono: 'check',
        titulo: 'No gasta dos veces',
        texto: 'Las imágenes, clips y frases de voz que ya se generaron se reutilizan: en un cambio solo se pide lo nuevo.'
      },
      {
        icono: 'sparkles',
        titulo: 'Revisa como un editor',
        texto: 'Antes de entregar mira el ritmo, el movimiento en cada corte y el video al lado de la referencia, y un segundo agente lo revisa con ojos frescos. Avisa si algo tapa un texto, si un brazo sale del cuadro o si una imagen parpadea.'
      },
      {
        icono: 'wand',
        titulo: 'Gestos seguidos',
        texto: 'Un personaje marioneta puede hablar y luego señalar o saludar en la misma capa, pasando de un gesto a otro sin cortes.'
      }
    ]
  },
  {
    version: '0.1.33',
    fecha: '2026-11-11',
    resumen: 'Escenas 2.5D más limpias y personajes que gesticulan de verdad.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Una escena, varias tomas',
        texto: 'Si cortas a otro encuadre de la misma imagen, las capas con profundidad lo siguen calzadas: ya no se descuadran ni asoma lo que hay detrás.'
      },
      {
        icono: 'image',
        titulo: 'Fotos partidas en planos más limpias',
        texto: 'Al partir una foto en planos ya no queda la silueta fantasma de lo que tapaba, y cada plano trae margen para que su borde no entre al moverse.'
      },
      {
        icono: 'sparkles',
        titulo: '«Habla» se nota',
        texto: 'La marioneta que habla mueve más la cabeza, el tronco y las manos, como alguien que cuenta algo.'
      },
      {
        icono: 'wand',
        titulo: 'El agente revisa más',
        texto: 'Avisa si un texto cae donde se mueven los brazos de un personaje o si un fondo vacío se queda sin nada encima.'
      }
    ]
  },
  {
    version: '0.1.32',
    fecha: '2026-11-11',
    resumen: 'Escenas con distancia, personajes que gesticulan y una cámara 3D: todo sin gastar créditos.',
    novedades: [
      {
        icono: 'layers',
        titulo: 'Escena 2.5D',
        texto: 'Dale «Profundidad» a una capa y seguirá a la cámara del clip: lo lejano se mueve poco y lo cercano mucho, como un paisaje hecho de capas. También tiene «Desenfoque» para lo que está fuera de foco.'
      },
      {
        icono: 'sparkles',
        titulo: 'Personajes marioneta',
        texto: 'En el menú de movimiento de una persona recortada: «Marioneta: habla, asiente, ladea la cabeza, cambia el peso», y con los brazos separados del cuerpo «saluda, señala, explica». Recorte encuentra su esqueleto y la mueve por huesos (la primera vez baja un modelo de 134 MB).'
      },
      {
        icono: 'film',
        titulo: 'Cámara 3D',
        texto: 'En cada clip: «Toma de cámara» (acercarse, alejarse, travelling, grúa, empuje), paneo, cámara en mano y profundidad de campo con su foco. Con capas con profundidad encima, se ve en 3D.'
      },
      {
        icono: 'wand',
        titulo: 'El agente lo usa',
        texto: 'El agente arma escenas por capas, parte una foto en planos por distancia, mueve a los personajes y elige una toma por momento.'
      }
    ]
  },
  {
    version: '0.1.31',
    fecha: '2026-11-11',
    resumen: 'Anima tus imágenes recortadas sin gastar créditos: respiran, se balancean, ondean, flotan o echan humo.',
    novedades: [
      {
        icono: 'sparkles',
        titulo: 'Imágenes que se mueven',
        texto: 'Elige una capa de imagen y, en su menú de movimiento: «Respira», «Se balancea», «Ondea», «Flota» o «Humo». Se anima en bucle como en After Effects, sin clips ni créditos. Vuelve a «Imagen quieta» cuando quieras.'
      },
      {
        icono: 'layers',
        titulo: 'Mejor con la imagen sin fondo',
        texto: 'Quítale el fondo primero: así la bandera ondea sola y el personaje respira sin arrastrar el fondo.'
      },
      {
        icono: 'film',
        titulo: 'También el agente',
        texto: 'El agente de Recorte anima las piezas recortadas de sus videos (la bandera, el personaje, el humo) y te llegan animadas al editor.'
      }
    ]
  },
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
    ...instalar(version)
  ].join('\n')
}

/** Qué archivo bajar en cada equipo, con su enlace a esta versión, y cómo abrirlo la primera vez. */
function instalar(version: string): string[] {
  const base = `https://github.com/reninn34-arch/recorte/releases/download/v${version}`
  return [
    `## Descargar Recorte ${version}`,
    '',
    '| Tu equipo | Archivo |',
    '| --- | --- |',
    `| Windows 10 u 11 | [Recorte-Setup.exe](${base}/Recorte-Setup.exe) |`,
    `| Mac con chip Apple (M1, M2, M3, M4…) | [Recorte-Mac-arm64.dmg](${base}/Recorte-Mac-arm64.dmg) |`,
    `| Mac con procesador Intel | [Recorte-Mac-x64.dmg](${base}/Recorte-Mac-x64.dmg) |`,
    '',
    '**Windows:** abre el instalador. Si ya tienes Recorte, se actualiza solo y te avisa para reiniciar.',
    'Si Windows dice «Windows protegió tu PC»: *Más información* → *Ejecutar de todas formas*.',
    '',
    '**Mac:** ¿cuál es tu Mac? Menú Apple → *Acerca de esta Mac*: si dice «Chip Apple M…», baja el de chip Apple; si dice',
    '«Procesador Intel», el de Intel. Abre el .dmg y arrastra Recorte a *Aplicaciones*. La primera vez, macOS dice que no',
    'puede comprobar la app (aún no está firmada por Apple): ve a *Ajustes del Sistema → Privacidad y seguridad* y da clic en',
    '*Abrir igualmente*. En Mac, las versiones nuevas se avisan en la app y se bajan desde aquí.'
  ]
}
