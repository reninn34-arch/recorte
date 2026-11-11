# Plan · Recorte como un solo agente

> Lo pidió el fundador el 2026-11-09. Recorte deja los dos modos (guiado y agente) y pasa a ser
> un solo agente con chat, como Claude Code: le pides el video, ves cómo avanza con pasos que se
> van marcando dentro del chat, y al terminar entras al editor con cada recurso suelto para tocarlo
> a mano. El objetivo de fondo: hacer y editar videos rápido, sin gastar créditos en retoques.

## Lo que hay hoy y por qué no alcanza

- **Dos modos.** «Guiado» (guion → voz → video, una pantalla por paso) y «Agente» (plan → hacer).
  El guiado es lento y obliga a esperar en cada pantalla.
- **La entrega es un MP4 cerrado.** `creacion:editor` mete el video terminado al editor como un solo
  clip: no se puede tocar una imagen, un rótulo ni una frase de la voz sin pedírselo al agente.
- **La timeline es corta.** `shared/timeline.ts` tiene una pista de clips, una de rótulos (texto y
  posición, sin estilo) y una música. No tiene imágenes sueltas, voz por frases ni capas.
- **La voz se elige tarde**, en su propia pantalla (`PasoVoz`), y solo en el modo guiado.

## A dónde vamos

1. **Una caja, un agente.** La caja de crear deja de tener el interruptor de modo. En ella se elige:
   agente y modelo, formato y duración, imágenes/clips, y **la voz** (Gemini, tu voz grabada, o sin voz).
2. **Todo pasa en el chat.** Sin pantallas por paso. El agente publica su lista de pasos y cada uno
   se marca al terminar (mirar archivos, guion, voz, imágenes, montaje, revisión). Si falta decidir
   algo, pregunta ahí mismo.
3. **La entrega es un proyecto, no un MP4.** El agente deja una receta (qué recurso, cuándo, con qué
   texto y efecto) más sus archivos. Recorte la abre en el editor con cada cosa en su pista.
4. **El editor es el lugar de trabajo.** Chat a la derecha, monitor al centro, pistas abajo. Lo que
   hizo el agente se toca a mano; lo que se le pida por chat cambia ese mismo proyecto.

## Fases

Cada fase se puede publicar sola y deja la app funcionando.

### Fase 1 · Un modo y el chat con pasos

> **Estado (2026-11-09): hecha, sin probar con un agente real.** La caja ya no tiene interruptor
> (agente y modelo, formato, duración, voz, «Pregúntame antes / Hazlo directo»); el agente pide la
> voz con `python kit/kit.py voz` y Recorte la atiende (`vozagente.ts`), el kit la mezcla en su
> segundo; los pasos del plan se marcan en el chat (`PasosPlan`, el agente anuncia «PASO n»).
> Falta de esta fase: oír una muestra de cada voz en el menú, narrar con tu voz grabada, las
> imágenes y clips de Flow para el agente, y quitar del estudio las pantallas del modo guiado
> (siguen para las creaciones viejas y para quien edita con una llave de API).
- Quitar el interruptor guiado/agente de `CajaCrear`; toda creación nace en modo agente.
  Las creaciones guiadas que ya existen se siguen pudiendo abrir.
- Menú **Voz** en la caja: sin voz, una voz de Gemini (con muestra para oírla) o tu voz.
  Se guarda en la creación y viaja en el pedido al agente.
- El agente recibe una herramienta de voz: `python kit/kit.py voz` pide a Recorte que genere la
  narración con la voz elegida (por frases, con sus tiempos) y la deja en la carpeta de trabajo.
- Pasos dentro del chat: el plan del agente se dibuja como lista con marcas, y cada paso se marca
  según el registro del turno. Plan y «Hazlo» siguen existiendo, pero «Hazlo» puede ir solo si
  el agente no tiene preguntas (opción en la caja: «Pregúntame antes» / «Hazlo directo»).
- `EstudioCreacion` se reduce a chat + resultado; desaparecen las pantallas Guion, Voz y Estilo
  para las creaciones nuevas.

### Fase 2 · La entrega como proyecto editable

> **Estado (2026-11-09): hecha y probada sin agente** (un video armado con el kit, convertido y
> exportado; visto en la app). `recetaeditor.ts` convierte la receta en timeline: fotos y clips
> sueltos, rótulos, la voz frase a frase (`voces`) y la música; lo que no cabe (antes/después,
> collage, frase sobre fondo) entra como tramo mudo del video ya hecho. La entrega guarda su
> receta (`salidas/agente-vN.receta.json`) y al terminar se abre el editor solo.
> Falta: probarlo con un agente real; el acercamiento lento, los fundidos y la tipografía del
> kit (lo exportado desde el editor se ve más simple que el video del agente); el punto de
> centrado del encuadre (solo viaja el zoom). Una versión nueva del agente abre un proyecto
> nuevo: lo retocado a mano en la anterior no pasa (fase 4).
- Timeline v2 en `shared/timeline.ts`: pista de video con clips de **video o imagen** (encuadre,
  zoom, duración), pista de **rótulos con estilo** (fuente, tamaño, color, posición libre), pista de
  **voz por frases** (cada frase con su texto y su audio) y pista de música. Migración desde v1.
- `resultado.json` del agente pasa a apuntar a su receta; Recorte la convierte a timeline v2
  (`recetaATimeline`). Lo que la receta no pueda expresar (un efecto hecho con código propio) entra
  como clip de video ya renderizado: nunca se pierde, solo es menos editable.
- Al terminar, la creación abre el editor directamente, con el chat del agente al lado.
- El render del editor (`exportar.ts`) aprende las pistas nuevas.

### Fase 3 · Editor para tocar cada recurso

> **Estado (2026-11-09): hecho lo principal.** Rótulos con tamaño, color, varias líneas y sin caja
> (monitor y exportación); «Cambiar archivo» de un clip; «Sin sonido» por clip; la voz a mano
> (`InspectorVoz.tsx`, `proyecto:voz-frase`): cambiar el texto de una frase y regenerarla, otra
> voz, toda la voz con otra, y añadir una frase en el cabezal. Probado en la app salvo generar
> voz de verdad (necesita la cuenta de voz).
> Falta: tipografías, posición libre del rótulo, escribir varias líneas desde el panel (hoy es
> una sola), arrastrar de la biblioteca, pistas apiladas y narrar con tu voz grabada.
- Inspector por tipo: imagen (cambiar archivo, encuadre, zoom, duración), rótulo (texto, fuente,
  tamaño, color, posición), frase de voz (texto, volver a generar, cambiar de voz), música.
- Cambiar la voz de todo el video o regenerar una sola frase **a mano**, sin pasar por el agente.
- Biblioteca de recursos de la creación (lo que subió el usuario y lo que generó el agente) para
  arrastrar a la timeline.
- Pistas apiladas, imán, atajos de teclado y recorte fino.

### Fase 4 · El agente edita el mismo proyecto

> **Estado (2026-11-09): hecha, probada sin agente.** El chat del editor tiene operaciones para la
> narración (`cambiar_voz`, `anadir_voz`, `borrar_voz`: Recorte genera el audio de esa frase antes
> de aplicar, `generarVocesDelChat`), el sonido de cada clip (`sonido_clip`) y el estilo de los
> rótulos (tamaño, color, sin caja, letra). Ve los nombres de los medios y la narración. Cada
> turno es un solo paso de deshacer. Además: punto de encuadre, acercamiento lento y fundidos
> entre clips (monitor y exportación; en el monitor el fundido es sobre negro, en el MP4 sobre el
> clip anterior), letras de Windows y rótulos de varias líneas; el conversor trae el aspecto del kit.
> Falta: que una versión nueva del agente de creación conserve lo retocado a mano (hoy abre un
> proyecto nuevo; se recomienda pedir los cambios desde el chat del editor), posición libre de
> los rótulos y probarlo con un agente real.
- En el editor, un pedido por chat cambia la timeline (no rehace el video): el agente recibe el
  proyecto, devuelve los cambios y cada uno se puede deshacer con Ctrl+Z.
- «Arregla lo que dice la voz en la escena 3» cambia el texto de esa frase y regenera solo ese audio
  con la voz elegida.
- Los cambios hechos a mano viajan al agente, para que no los pise.

## Lo que ya está hecho y sirve de base
- Adaptador común por agente con fin de turno explícito (`adaptadoresagente.ts`, `turnoagente.ts`).
- Sesión que sigue viva entre plan, «Hazlo» y cada cambio (Claude Code y Codex).
- El kit (`python/kit`) ya describe un video como receta con momentos: es el punto de partida de la
  timeline v2.
- La voz con Gemini por frases y sus tiempos (`voz.ts`, `montajevoz.ts`).

## Repaso de pendientes (2026-11-10)

Hecho desde que se anotó: imágenes y clips de Flow para el agente (0.1.18), tu narración grabada como
voz del video (0.1.20), probar con agentes reales (Claude Code, Codex y OpenCode hacen un video completo),
el aspecto del kit en el editor (acercamiento, fundidos, letras, encuadre), varias líneas en el panel de
texto, la versión nueva del agente en el mismo proyecto (Ctrl+Z vuelve a la anterior) y Codex en Windows
(sin sandbox, decidido por el fundador).

Sigue faltando, y va en la fase 6:
- Oír una muestra de cada voz en el menú de la caja.
- Posición libre de los rótulos (hoy solo arriba, centro o abajo).
- Pistas apiladas: una imagen o video encima de otro (íconos, logos de redes, tomas de apoyo).
- Una pista de efectos de sonido (el «whoosh» de un corte, el «pop» de un rótulo).
- Arrastrar de la biblioteca a la timeline.
- Narrar con tu voz grabada desde el editor (frase por frase).
- Que los retoques a mano viajen al agente cuando rehace el video (hoy no los conoce: se recuperan con Ctrl+Z).
- El cambio rápido sin transcripción: en un proyecto del agente no sabe qué se dice (debería usar la narración).
- Ver en el chat la descripción de cada imagen o clip generado.
- Probar con un agente real: Antigravity (sin uso hasta el 15-nov), Gemini CLI (con llave de AI Studio),
  Kimi (no instalado) y la tarjeta «Explicativo 3D».

### Fase 6 · Recorte por MCP (que un agente maneje la app)

Un servidor MCP dentro de Recorte (solo en el equipo, con una contraseña que se genera sola) para que
Claude Code, Claude en el escritorio, Codex u otro agente usen la app: lo que hagan queda en el editor,
editable. Lo que gasta créditos (voz, Flow) pide confirmación. Por partes:

**6.1 · Que el editor pueda lo que se hace a mano.** Antes del MCP, porque es lo que el MCP va a usar:
pistas apiladas (encima: imágenes, logos e íconos con su posición y animación de entrada), posición libre
de los rótulos, pista de efectos de sonido y arrastrar de la biblioteca. Con esto, un video como los de
Cangrejal (carteles con ícono, logos de redes al nombrarlas, tomas de apoyo, efectos) se arma entero en el
editor y no en un MP4 cerrado.

*Hecho (2026-11-10):* pistas «Encima» y «Sonidos» en la timeline; capas y rótulos se mueven en el monitor
(con imán al centro) y la capa cambia de tamaño por su esquina; entrada pop o fundido; cinco efectos incluidos
(python/sonidos) o uno del equipo; soltar medios de la biblioteca en el monitor, en «Encima» o en la pista de
video; la exportación los respeta (prueba:exportar) y el chat tiene anadir_capa, cambiar_capa, anadir_sonido y
posición libre. Falta que el kit del modo agente entregue capas y sonidos en su receta (va con 6.4).

**6.2 · Ver y editar por MCP.** Listar proyectos y creaciones, leer la timeline, aplicar cambios (las
mismas operaciones del cambio rápido, más las de 6.1), añadir medios, transcribir y exportar. El cambio
rápido usa la transcripción de la narración en los proyectos del agente.

*Hecho (2026-11-10):* servidor MCP dentro de Recorte (`mcp.ts`, Streamable HTTP con respuestas JSON, sin
dependencias) en 127.0.0.1:47110 con contraseña propia (`userData/mcp.json`), protegido contra otros Host y Origin.
Herramientas (`mcprecorte.ts`): listar_proyectos, ver_proyecto, ver_cuadro (la imagen exportada de un segundo),
editar_timeline (las operaciones del chat), agregar_medios, crear_proyecto, transcribir, exportar y abrir_en_recorte.
Lo que cambia el agente llega al editor abierto como timeline pendiente (un paso de Ctrl+Z). Ajustes › «Recorte desde
tu agente» lo registra en Claude Code (`claude mcp add --scope user`) y da la configuración para otros. Probado con
Claude Code real y con `prueba:mcp`. Los proyectos del agente se transcriben solos al abrirse y el chat usa esa
narración. Sin voz nueva por MCP todavía (gasta créditos: 6.3).

**6.3 · Crear por MCP.** Empezar una creación, conversar el plan, «Hazlo», generar una frase de voz (con su
muestra) y pedir imágenes o clips a Flow, con confirmación del gasto.

*Hecho (2026-11-10), probado con `prueba:mcp` (sin agente ni voz de verdad):* crear_video (la misma creación del
modo agente: petición, formato, duración, archivos, voz, imágenes y clips de Flow, «Hazlo directo»), ver_creacion
(si trabaja y en qué, el plan con sus pasos marcados, la conversación con sus opciones y lo generado),
hablar_con_agente, hacer_video (también «seguir» tras el límite de uso), parar_agente y pasar_al_editor (el proyecto
del editor de lo entregado). Los turnos van en segundo plano: la herramienta vuelve al momento y la app lo ve
trabajando como cuando sigue solo. ver_voces, probar_voz (una muestra por voz, guardada en `userData/muestras-voz`),
voz nueva en editar_timeline (cambiar_voz, anadir_voz) y generar_con_flow (imagen o clip a la biblioteca del
proyecto). Lo que gasta (voz, clips) responde primero con el costo y un código de un solo uso, atado a ese pedido;
el gasto de una creación se acepta una vez. abrir_en_recorte también abre una creación con su chat.
Falta: probarlo con Claude Code real tras reiniciar Recorte.

**6.4 · Los agentes de Recorte por MCP.** Que el agente que trabaja dentro de Recorte pida voz, imágenes y
clips por MCP en vez de los archivos de pedido, y que al rehacer un video reciba los retoques a mano.

*Hecho (2026-11-10), probado con `prueba:kit` y `prueba:retoques` (sin agente real):*
- **El buzón de archivos se queda.** Se decidió no pasar voz, imágenes y clips del agente interno a MCP: el buzón
  (`kit.py voz|imagen|clip`) funciona con todos los agentes, también con los que no salen a la red, y no tiene
  puertos ni llaves que repartir. MCP queda para los agentes de fuera.
- **Los retoques a mano viajan al agente.** Al pasar una versión al editor se guarda su timeline tal como se entregó
  (`salidas/agente-vN.editor.json`). Al pedir otra versión, `describirRetoques` (`shared/retoques.ts`) compara esa
  timeline con la de ahora (rótulos: texto, tiempo, sitio y estilo; frases de voz con la ruta del audio ya regenerado,
  para no volver a pedirlo; capas; sonidos; música; clips) y el agente lo recibe con su pedido para pasarlo a su receta.
- **La receta trae capas y sonidos.** `"capas"` (imagen, segundos, centro, ancho, entrada pop/fundido) y `"sonidos"`
  (uno de los incluidos, que ahora se copian a `kit/sonidos/`, o un archivo). El kit los dibuja y mezcla, el conversor
  los deja en «Encima» y «Sonidos», y la versión sin textos sale sin ellos.
Falta: probarlo con un agente real (que use capas y sonidos y respete los retoques); las capas de video no van en la receta.

**6.5 · Lo que queda de la voz.** Muestra de cada voz en el menú y narrar con tu voz grabada frase por frase.

*Hecho (2026-11-10), compila y pasan las pruebas; sin mirarlo en la app ni probarlo con micrófono y voz de verdad:*
- En el menú Voz de la caja, cada voz tiene su botón para oírla (`voz:muestra`). La muestra se genera la primera vez y
  se guarda en `userData/muestras-voz`, la misma carpeta que usa probar_voz por MCP (`textoMuestra`). Se sirve como
  `recorte-media://muestras/<voz>.wav`.
- En el panel de la narración del editor, «Grabar»: con una frase elegida reemplaza su audio por tu voz; sin frase,
  añade una nueva en el cabezal. Se pasa a WAV con el silencio de los bordes recortado (`proyecto:voz-grabada`,
  `media/voz-propia-….wav`) y es un paso de Ctrl+Z. «Toda la voz con…» no toca las frases grabadas.

### Fase 5 · Todo en el editor, con el chat como conversación

> **Estado (2026-11-10): hecha, probada sin agente real** (pruebas de modo agente, adaptadores, medios, kit y e2e;
> capturas de la app con datos de prueba). Lo pidió el fundador tras probar 0.1.18: la pantalla Idea/Plan/Hacer/Revisar
> sobraba, en el editor no se podía parar al agente ni usar la caja, y quería conversar el plan como en un chat.
- Sin la pantalla de pasos: una creación del agente se ve con su material al centro y el chat a la derecha
  (`EstudioAgente.tsx`); al entregar, el editor ocupa ese lugar con el mismo chat (`ChatCreacion.tsx`).
- «Pregúntame antes» es una charla: el agente propone ideas y pregunta con opciones (`mensaje` y `propuestas` del
  plan, `validarCharla`); el plan va en una tarjeta con «Hazlo». Sin JSON, su prosa es su mensaje.
- La caja del chat es la de crear (`CajaCrear` con `chat`): agente y modelo, voz, imágenes, clips, «+» para archivos
  y carpetas (`creacion:adjuntar`) y «Pregúntame antes / Hazlo directo» (`creacion:ajustar`); mientras trabaja, el
  botón de enviar es el de parar (y Esc).
- Con el video hecho: «Cambio rápido» toca la timeline al momento (operaciones, Ctrl+Z, `creacion:anotar`) o
  «Que lo rehaga el agente».
- En la charla el agente puede generar imágenes y clips (Flow/ChatGPT) y se ven en su mensaje; antes de clips dice
  cuántos y cuánto cuestan.
- La duración la decide el material (sin 30 s por defecto) y el manual trae el criterio de edición aprendido.
- Renders: nunca en segundo plano (se cortaban al cerrar el turno); Claude Code espera hasta 30 min por comando.
- Una versión nueva del agente entra en el MISMO proyecto: su video como un medio más y sus pistas como
  `timelinePendiente`, que el editor aplica como un paso de deshacer (Ctrl+Z vuelve a la anterior con lo retocado).
- Sin uso del plan a mitad: `LimiteUso` (venga como error o como respuesta), la creación queda en `pausa` con la hora
  en que se renueva (`limiteDeUso` entiende «resets 5pm», «in 6 days, 7 hours», «try again at…», el «|epoch» de
  Claude) y sigue sola a esa hora con la app abierta; «Seguir donde iba» sigue ya, también con otro agente. Si el
  render ya había terminado, se entrega igual. Probado con un Claude de prueba (`prueba-modo-agente`).
Falta: probarlo con un agente real; tomar del registro qué imagen se pidió para mostrar su descripción.
