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

## Pendiente de decidir
- Codex en Windows no puede escribir con su sandbox: o trabaja sin sandbox, o se avisa en la app
  de que en Windows no sirve para el modo agente.

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
