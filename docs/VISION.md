# Visión de producto — Recorte

> Documento norte. Lo definió el fundador el 2025-11-05 y lo reorientó el mismo día:
> **Recorte es un EDITOR de video dirigido por agentes**, no un generador de clips.
> Monitor, línea de tiempo y herramientas: eso es lo que se ve. La extracción de
> clips de un video largo es **una herramienta más**, no la app entera.

## Reorientación (2026-11-05, fundador)

- La cara principal es el **editor**: monitor con el video, línea de tiempo con
  pistas (edición, momentos, voz) y playhead, y un panel de agente a la derecha.
  Hecho en `Editor.tsx` + `AgentePanel.tsx`.
- **El panel del agente ES el punto de conexión**: los 4 agentes (Kimi, Claude,
  Codex, Gemini) se listan ahí con su estado; un clic conecta (login del plan) o
  activa el que ya está conectado. Ajustes queda solo para lo avanzado (API, comando a mano).
- Las funciones viejas (clips, edición con agente, cola, medios) viven como
  **herramientas** en pestañas bajo la línea de tiempo.
- **HyperFrames** (`npm: hyperframes`, HTML → MP4) es el motor de generación
  mientras construimos el propio (fase 2): el agente escribe la composición y
  Recorte la renderiza. **Ya integrado** (2026-11-05): pestaña «Crear» del editor,
  `src/main/crear.ts`, probado de punta a punta con Kimi diseñando la composición
  (`npm run prueba:crear`).
- Horizonte: **orquestador de agentes** — varias suscripciones conectadas, cada
  una con un rol (orquestador, diseñador, editor), estilo "claude squad".

## Lo que Recorte quiere ser

**No** un recortador de videos. Una **plataforma de creación de contenido en video
dirigida por agentes de IA**, donde:

1. **Cualquier agente edita por ti.** El usuario sube el material (footage, audio,
   imágenes) y un agente — Kimi, Claude, DeepSeek, Codex, el que tenga — lo edita
   completo: cortes, color, efectos, subtítulos, ritmo, estilo de edición. El agente
   decide; Recorte ejecuta con precisión de fotograma.
2. **Los videos también se crean desde cero.** El usuario pide ("un reel de 30 s
   sobre mi receta de ceviche") y la plataforma genera guion, voz, visuales y lo
   renderiza a MP4.
3. **Motor de video por código propio.** Composiciones declarativas (tipo
   HyperFrames) que se renderizan a MP4 dentro de la app. Objetivo: igualar o
   superar a HyperFrames, pero como motor abierto y local de Recorte.
4. **Skills internas.** Plantillas de edición, estilos y recetas que viven dentro
   del programa y que los agentes pueden invocar ("aplica la skill `reel-energico`").
5. **Inteligencia de contenido.** Un agente que mira tendencias (Instagram, TikTok,
   YouTube), propone un plan de contenido real para el nicho del usuario (comida,
   cursos, lo que sea) y lo convierte en videos listos para publicar.

## Principio de conexión universal

El usuario exigió libertad total de proveedor. Eso se traduce en una regla de
arquitectura:

> **El contrato entre agentes y Recorte es un documento, no un proveedor.**

Cualquier agente (CLI con stdin/stdout, API compatible con OpenAI, o local) puede
dirigir a Recorte si produce los documentos que Recorte entiende:

- `ClipSuggestion[]` — ya existe: qué momentos cortar.
- **Receta de edición** (fase 1): cómo editar — cortes, color, captions, efectos.
- **Composición** (fase 2): cómo crear — escenas, texto, imágenes, audio, timing.

Recorte valida, ejecuta y siempre tiene respaldo local si el agente falla.

## Fases

### Fase 0 — Hecho ✅

Recortador vertical con transcripción local (faster-whisper), selección de momentos
(local o por IA), render FFmpeg 1080×1920, portadas, subtítulos ASS, seguimiento de
cara, lote, y conexión con agentes por **API libre** o **CLI libre** (`comandoCli`).

### Fase 1 — El agente edita ✅ (v1, 2026-11-05)

De "proponer clips" a "editar el video" — hecho:

- Esquema `RecetaEdicion` con validador estricto (`src/main/receta.ts`): cortes,
  color (brillo/contraste/saturación), velocidad, transición corte/fundido y captions.
- Prompts de receta para API y CLI (`src/main/ia.ts`); cualquier agente dirige la edición.
- `renderReceta()` en `render.ts`: `filter_complex` multi-corte con `concat` o cadena
  `xfade`/`acrossfade`, captions remapeados al tiempo final.
- Vista de revisión en lenguaje humano antes de renderizar; respaldo local si falla el agente.
- Pendiente de esta fase: música con ducking, zooms y reencuadre por cara dentro de la
  receta (hoy la receta reencuadra por centro).

Plan original:

- Esquema `RecetaEdicion` (JSON): lista de operaciones sobre el material —
  cortes, orden, velocidad, color (LUTs/curvas básicas FFmpeg), zooms, captions con
  estilo, música con ducking, transiciones.
- `src/main/receta.ts`: validador estricto (todos los tiempos dentro del material,
  operaciones acotadas).
- `render.ts` aprende a ejecutar la receta completa, no solo un corte.
- El prompt del agente cambia: recibe transcripción + metadatos del material y
  devuelve la receta. Funciona con cualquier agente por el contrato de documento.
- Vista de revisión: la interfaz muestra la receta en lenguaje humano ("corté
  0:04–0:33, subí el contraste, puse captions Editorial") antes de renderizar.

### Fase 2 — Motor de composición (puente hecho ✅, propio pendiente)

**Puente con HyperFrames — hecho (2026-11-05/06):**

- `src/main/crear.ts`: la petición del usuario → el agente (CLI o API) escribe una
  composición HyperFrames standalone (HTML con timing, GSAP, 1080×1920) →
  `hyperframes render` la convierte en MP4 en `salidas/`.
- **Con material del usuario**: si se pide, Recorte corta hasta 3 fragmentos de 5 s
  del video fuente (repartidos a lo largo, H.264 + voz) en `creaciones/<nombre>/media/`
  y el prompt enseña al agente el contrato estricto de medios de HyperFrames
  (`<video>` como escena propia, timing solo en el `<video>`, nunca play()/seek()
  desde el código). El agente intercala titulares animados entre los fragmentos.
- Pestaña «Crear» en el editor (`CrearPanel.tsx`): eliges el **tipo de video** entre
  tarjetas de tema (clase, lista, promo, historia, noticia, receta, motivacional…),
  describes lo que quieres y decides si incluye fragmentos de tu material. Las guías
  editoriales viven en `src/shared/estilos.ts` (catálogo propio) y convierten al
  agente en un editor que adapta estructura y ritmo al tema.
  Respaldo: plantilla de marca local.
- `src/main/binarios.ts`: resuelve `hyperframes`, `kimi` y otros binarios globales
  aunque no estén en el PATH del usuario (npm-global de Daimon incluido).
- El agente tiene 10 min para diseñar (Kimi piensa en voz alta y puede tardar 5+ min).
- Probado de verdad: `npm run prueba:crear` — Kimi diseñó un promo intercalando 2
  fragmentos reales con titulares; MP4 1080×1920 con la voz del usuario. Además,
  prueba aislada con video colorido confirma que los fragmentos se ven a pantalla
  completa (el video de prueba habitual es un fondo oscuro sintético).

**Motor propio — pendiente:**

- Esquema `Composicion` (JSON): escenas con duración, capas (texto, imagen, video,
  forma), animaciones declarativas (entrada, salida, Ken Burns, cuenta numérica).
- Render: Electron ya trae Chromium — se renderiza la composición HTML offscreen,
  se captura fotograma a fotograma y se canaliza a FFmpeg. Sin dependencias nuevas
  pesadas ni licencias propias.
- Catálogo inicial: títulos cinéticos, captions, lower-thirds, tarjetas de datos,
  Ken Burns sobre imágenes. Es el semillero de las "skills" visuales.
- Honestidad: HyperFrames lleva años de madurez; el motor propio empieza mínimo y
  crece por demanda real, no por ambición.

### Fase 3 — Creación desde cero

- Pipeline: idea → guion (agente) → voz (TTS local, p. ej. Piper, o la voz del
  usuario) → visuales (material del usuario, imágenes generadas o stock) →
  composición (fase 2) → MP4.
- El agente produce un `PlanVideo` (guion + lista de escenas) que el usuario aprueba
  antes de gastar un solo render.

### Fase 4 — Inteligencia de contenido

- Conector de tendencias (Instagram/TikTok/YouTube): empezar por entrada manual
  ("pega 5 videos que te gustaron") antes de pelear con APIs y términos de servicio.
- El agente analiza y produce un `PlanContenido`: temas, ganchos, formatos y
  calendario. Cada ítem del plan se puede convertir en un `PlanVideo` de la fase 3.

### Fase 5 — Skills internas

- Directorio `skills/` dentro de la app: cada skill es un archivo declarativo
  (estilo de edición, paleta, caption, ritmo) que el agente puede invocar por nombre
  al producir recetas o composiciones.
- El usuario crea sus propias skills guardando "edítame como la última vez".

## Lo que NO cambia

- Local primero: el material nunca sale del equipo; solo viajan textos (guiones,
  transcripciones, recetas).
- Sin dependencias caras ni licencias dudosas sin preguntar al fundador.
- Verificación siempre: `typecheck`, `build`, `prueba:e2e` antes de dar nada por hecho.
- Diagnóstico honesto: decir qué es real y qué es maqueta.
