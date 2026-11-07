# Tarea: «Copiar un estilo» en Crear con IA — fases 1 y 2

Trabajas en **Recorte** (este repositorio): un editor de video de escritorio en Electron + React +
TypeScript, con FFmpeg y Python, que manejan agentes de IA. Responde y escribe todo (código,
comentarios, textos de la interfaz) en **español**, con el mismo tono de lo que ya hay.

Antes de escribir una línea, lee: `docs/ARQUITECTURA.md`, `src/shared/creacion.ts`,
`src/main/creaciones.ts`, `src/main/index.ts` (los IPC `creacion:*`), `src/main/transcribir.ts`,
`src/main/ffmpeg.ts`, `src/main/herramientas.ts`, `src/main/ia.ts`, `src/main/flow.ts`,
`src/main/imagenchatgpt.ts`, `src/shared/flow.ts`, `src/renderer/src/components/CajaCrear.tsx`,
`src/renderer/src/components/EstudioCreacion.tsx`. Sigue sus patrones; no inventes otros.

## Qué hay que construir (solo esto)

El usuario, en **Crear con IA**, sube **su material** (videos de varios minutos y fotos) y **un
video de referencia** cuyo estilo de edición quiere copiar. En estas dos fases Recorte todavía NO
monta el video: **analiza** el material y la referencia, y muestra la **ficha de estilo** y el
**informe de lo que se puede copiar**. Lo que no tenga referencia debe funcionar exactamente
igual que hoy.

### Fase 1 — Analizar el material del usuario (local, sin tokens)

Por cada video subido, en la carpeta de la creación (`<creacion>/analisis/`), guardar un
`material.json` con:
- duración, resolución, fps y si tiene audio (ffprobe, `rutaFfprobe()`);
- la transcripción con tiempos por palabra (reutiliza la de `transcribir.ts`, no hagas otra);
- los cortes de plano con FFmpeg (`select='gt(scene,0.3)',showinfo` o equivalente) y, por
  escena: inicio, fin y una miniatura JPG pequeña (≤ 480 px de ancho);
- una «hoja de contacto» por video (`tile`, p. ej. 4×4 fotogramas) para que el agente la vea.

El análisis se cachea: si el archivo no cambió (tamaño + fecha), no se repite. Debe poderse
**parar** con la señal de `empezarTrabajo/pararTrabajo` de `ia.ts` (matando FFmpeg y Python) y
mostrar progreso como los demás pasos de la creación (`enviarProgreso`).

El prompt del guion (`promptGuion` en `creaciones.ts`) debe recibir un **resumen** de este mapa
(qué se dice y en qué segundos, escenas), no los datos crudos completos: que el agente elija
trozos reales del material en vez de nombrar solo el archivo.

### Fase 2 — Ficha de estilo de la referencia + informe de viabilidad

1. **Medir en local** (sin agente) la referencia y guardar `estilo-medido.json`: duración,
   formato (9:16 / 16:9 / 1:1), duración de cada plano (lista y promedio/mediana), cortes por
   minuto, si hay voz (Whisper) y su estructura (inicio/gancho, desarrollo, cierre por tiempos),
   volumen integrado (loudnorm en modo análisis), silencios, y colores dominantes de los
   fotogramas clave. Fotogramas clave: uno por plano (máximo 24) + hojas de contacto.
2. **El agente interpreta** las hojas de contacto + `estilo-medido.json` + la transcripción y
   devuelve SOLO JSON con la ficha (`estilo.json`): subtítulos (sí/no, posición, tamaño
   relativo, color, palabra por palabra o por frase, mayúsculas), tipografía (descripción),
   zooms/punch-ins (frecuencia), B-roll (frecuencia y tipo), recortes de persona, textos en
   pantalla, motion graphics (cuáles), transiciones, música/efectos, gancho de los primeros 3 s,
   y una lista de **recursos** que usa la referencia, cada uno con un `tipo`:
   `material` | `motion` | `subtitulos` | `recorte` | `imagen_generada` | `clip_generado` |
   `voz` | `musica`, con cuántos y una descripción. Valida y limpia el JSON como hace
   `validarGuion`/`leerCriterio`; nunca confíes en él tal cual.
3. **Cómo ve imágenes cada agente**: compruébalo de verdad con cada uno antes de darlo por
   hecho (Claude Code, Codex `-i`, Gemini CLI con `@ruta`, Kimi, OpenCode, API compatible con
   OpenAI con `image_url` en base64). Si un agente no puede ver imágenes, la ficha se hace solo
   con lo medido y la interfaz lo dice («ficha aproximada: tu agente no ve imágenes»).
4. **Modo Gemini (opcional)**: si hay llave de Google AI Studio guardada (la de la voz:
   `ajustes.claveVoz()`), ofrecer «Analizar con Gemini viendo el video completo». Consulta la
   documentación oficial actual de la API de Gemini para subir video (Files API) antes de
   escribirlo; no inventes endpoints ni modelos. Si falla, se cae al modo normal.
5. **Informe de lo que se puede copiar** (`viabilidad`), calculado en código (no por el agente)
   a partir de la lista de recursos y de lo que el usuario tiene conectado hoy:
   - siempre posibles: `material`, `motion` (HyperFrames), `subtitulos`, `recorte` (local);
   - `imagen_generada`: necesita Google Flow (`estadoFlow().cuentas.length > 0`) o ChatGPT
     (`estadoChatGPT().conectado`);
   - `clip_generado`: necesita Flow (Veo) y gasta créditos: muestra el costo estimado con
     `COSTO_CLIP`;
   - `voz`: Gemini (llave) o voz propia; `musica`: la sube el usuario (no hay generador).
   Da un porcentaje «parecido posible», qué falta, qué conectar para subirlo, y qué sustitución
   se hará si no conecta nada (imagen → tarjeta de diseño animada; clip → trozo del material).
   El porcentaje se recalcula al conectar algo, sin volver a analizar.

### Interfaz

- En `CajaCrear.tsx`: un botón para añadir **«Video de referencia»** (uno, aparte de tu
  material), con su nota: «Se analiza para copiar su edición; no entra en tu video».
- En `EstudioCreacion.tsx`: si la creación tiene referencia, una fase nueva **«Estilo»** antes
  del guion, que muestra la ficha (editable a mano en lo básico: subtítulos, ritmo), y el
  informe: «Este estilo se puede copiar en un 70% con lo que tienes conectado», con la lista ✅/⚠️,
  los botones **Conectar Flow** / **Conectar ChatGPT** (que llevan a Ajustes) y
  **Continuar así (≈70% parecido)**. El guion que se escriba después recibe la ficha.
- Sin referencia, el estudio se ve y funciona igual que hoy.

## Dónde va el código (aislado)

- Nuevo: `src/main/estilo/` (`material.ts`, `referencia.ts`, `ficha.ts`, `viabilidad.ts`) y
  `src/shared/estilo.ts` (tipos y funciones puras, p. ej. `calcularViabilidad`).
- `Creacion` gana campos **opcionales** (`referencia?`, `estilo?`, `viabilidad?`). No cambies ni
  quites campos existentes; las creaciones viejas deben abrirse igual.
- IPC nuevos con prefijo `estilo:` en `index.ts`, expuestos en `preload/index.ts` y tipados en
  `shared/api.ts`.
- Añade la entrada de la próxima versión arriba en `src/shared/novedades.ts` (sin cambiar el
  número de `package.json`) y una sección en `docs/ARQUITECTURA.md`.

## Reglas que NO se negocian

- **No copies código ni recursos de Sloth** (`C:\Users\Alex\Desktop\sloth`): su licencia no lo
  permite. Puedes mirarlo como referencia de ideas, nada más.
- No toques lo que no es de esta tarea: nada de refactors, renombres ni «mejoras» de paso, no
  cambies la licencia, el workflow de releases ni `electron-builder.yml`.
- No gastes créditos: **no generes imágenes, clips ni voz** en estas fases (no llames a
  `pedirFlow`, `generarImagenChatGPT` ni a la voz). Nada de dependencias nuevas de npm o pip
  salvo que sea imprescindible, y dilo si lo haces.
- Nunca pidas, escribas ni registres llaves o contraseñas; no las pongas en logs ni en prompts.
- Windows: los archivos van con saltos de línea **LF**. Si editas con Python, abre con
  `newline=''`; comprueba al final que ningún archivo tocado tenga `\r\n`.
- Las pruebas usan un `--user-data-dir` temporal y un `ajustes.json` con `carpetaVideos`
  temporal: **nunca** escribas en `%APPDATA%\recorte` ni en la carpeta Videos del usuario.
  Borra lo temporal al terminar.
- Material de prueba: genéralo tú con FFmpeg (`testsrc2`, `drawtext`, `sine`), no bajes videos
  de internet ni uses videos con derechos de terceros.
- **No hagas commit, push, ni publiques versión.** Al terminar, deja los cambios sin confirmar.

## Cómo comprobar que está bien (obligatorio antes de decir «listo»)

1. `npm run typecheck` y `npm run build` sin errores.
2. `npm run prueba:e2e` sigue pasando (no rompiste nada).
3. Un script nuevo `scripts/prueba-estilo.mjs` (añádelo a `package.json` como
   `prueba:estilo`) que, con un material de 2 min y una referencia de 30 s generados con FFmpeg,
   compruebe: `material.json` con escenas y miniaturas; `estilo-medido.json` con planos y
   cortes por minuto coherentes con lo que generaste (p. ej. si la referencia corta cada 1,5 s,
   que la mediana salga entre 1,2 y 1,8 s); `viabilidad` correcta con y sin Flow/ChatGPT
   conectados (simúlalos); que parar el análisis mata FFmpeg; y que una creación sin referencia
   no cambia.
4. Abre la app de verdad (con datos temporales) y revisa la fase «Estilo» con una captura.

## Qué entregar

Un resumen corto: qué hiciste, la lista de archivos nuevos y cambiados, qué comprobaste y con qué
resultado, y **qué no pudiste comprobar** (por ejemplo, qué agentes ven imágenes y cuáles no).
Si algo de este pedido no se puede hacer bien, dilo en vez de simularlo.
