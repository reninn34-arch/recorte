# El motor 3D de Recorte (para los estilos 3D)

Está en `motor3d/`. Lo usan los estilos que traen una escena de referencia (`escena.js` + `guion.js` en su carpeta de
habilidad). Con él, un video 3D hecho en código se ve filmado: tiene desenfoque real, sombras suaves, luz que se
mete en los rincones, estela de movimiento y acabado de cine.

- `escenario.js` — el motor. Cada cuadro es el promedio de muchas pasadas de la escena. Entre pasada y pasada se
  mueven un poco el tiempo, la cámara dentro de su lente, las luces dentro de su superficie y el píxel.
- `sonido.js` — los efectos, sintetizados, con los mismos tiempos que la imagen. Escribe un WAV.
- `letras3d.js` — letras sólidas en 3D desde una fuente de Google (para palabras o números hechos del material).
- `personaje.js` — el kit de personajes: uno de caricatura que camina, saluda, habla con la voz, señala, salta y pone
  caras, vestido con el material del estilo (ver «Personajes»).
- `boca-de-voz.mjs` — `node motor3d/boca-de-voz.mjs voz.wav boca.js --desde 1.7`: cuánto abre la boca en cada cuadro.
- `sonido-a-wav.mjs` — `node motor3d/sonido-a-wav.mjs guion.js efectos.wav [--voz]`.

## Cómo se hace un video con un estilo que tiene escena de referencia

1. **Lee la referencia entera** (`habilidades/estilo-<id>/escena.js` y `guion.js`). Muestra el ESTILO: materiales, luz,
   cámara, acabado y cómo se mueven las cosas. No muestra la historia: sus objetos y su tema son de su ejemplo. Antes de
   copiar nada, decide qué tiene que mostrar el video del usuario. Después construye ESAS cosas con el mismo aspecto.
2. **Arma la composición de HyperFrames** en una carpeta:
   - copia los `.js` y el `package.json` de `motor3d/` al lado de tu `index.html`, y también los `.js` de la carpeta del
     estilo que no son su escena ni su guion (por ejemplo `material.js` en Plastilina);
   - escribe tu `guion.js` y tu `escena.js`, con la misma forma que la referencia;
   - copia el `index.html` de abajo y cambia solo el tamaño (1080×1920 vertical, 1920×1080 horizontal).
3. **El guion primero** (`guion.js`, sin Three.js):
   - `DURACION`;
   - una tabla de tiempos con cada idea: cuándo empieza, cuándo termina, qué se dice y qué pasa en pantalla;
   - `sonido(M)`.

   Si hay voz, los tiempos salen de la transcripción. Lo que ilustra una palabra aparece CON la palabra (hasta 0.2 s
   antes, nunca después). Dentro de una idea, sigue construyendo esa idea y sostenla hasta que termine la frase. Los
   cambios grandes van en las pausas. Termina un segundo después de la última palabra, en el resultado.
4. **La escena** (`escena.js`) exporta `ACABADO`, `DURACION` y `construir(E)`.
   - `construir` arma todo una vez y registra `E.alActualizar((t) => ...)`. Esa función deja TODO como está en el
     segundo t: se llama varias veces por cuadro con tiempos distintos.
   - No uses `Math.random`, `Date` ni temporizadores. Para variar, `U.azar(semilla)`.
   - Todo se construye en código: nada de modelos, imágenes ni HDR bajados.
   - Formas simples, bien iluminadas y terminadas, mejor que modelos complicados que se ven mal.
   - Es video para el celular: las palabras, grandes y pocas (claves, etiquetas, números; nunca la frase que se dice).
     El tema llena el cuadro y nada importante sale del encuadre durante el movimiento de cámara. El primer cuadro ya
     vale la pena y el último se sostiene.
   - Si la historia sigue en el mismo lugar, la cámara viaja dentro del mismo mundo. Si cambia de lugar o de tiempo,
     cambia como lo haría el material (una página, un giro del set, un cambio de luz), nunca con un corte seco.
5. **Revisa antes de renderizar todo.** Saca 4-6 cuadros sueltos (por ejemplo con `npx hyperframes snapshot`) y
   míralos: encuadre, luz, que se lea. Corrige y recién ahí renderiza.
6. **Renderiza:** `npx hyperframes render <carpeta> --quality high -o mudo.mp4`. Usa la GPU y reparte los cuadros en
   varios navegadores. Cuenta con 1 a 2 minutos por cada 10 s a 1080p.
7. **Sonido:** `node motor3d/sonido-a-wav.mjs <carpeta>/guion.js efectos.wav --voz` (sin `--voz` si no hay narración).
   Con voz, la voz va encima y los efectos debajo:

   ```
   ffmpeg -i mudo.mp4 -i voz.wav -i efectos.wav -filter_complex "[1:a]apad=whole_dur=DURACION,loudnorm=I=-17:TP=-2,asplit=2[v1][v2];[2:a]loudnorm=I=-26:TP=-4:LRA=20[fx0];[fx0][v1]sidechaincompress=threshold=0.05:ratio=3:attack=10:release=250[fx];[v2][fx]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k final.mp4
   ```

   Sin voz: `ffmpeg -i mudo.mp4 -i efectos.wav -af loudnorm=I=-15:TP=-1.5 -c:v copy -c:a aac -shortest final.mp4`.

   Si la voz no empieza en el segundo 0, agrega `adelay=MS|MS,` antes de `apad` (MS = milisegundos).

## Personajes

Cuando el video tiene un protagonista (alguien que cuenta, enseña o vive la historia), hazlo con `personaje.js`, no
desde cero. El ejemplo completo está en `habilidades/estilo-plastilina/personaje/` (escena.js + guion.js + boca.js):
Lupe, de plastilina, entra, saluda, habla con su voz, señala su planta, se sorprende y festeja.

```js
import { personaje, bocaDe } from './personaje.js'
import { BOCA } from './boca.js' // de boca-de-voz.mjs
const P = personaje({
  alto: 1.4, pelo: 'coletas', cara: 'feliz', semilla: 4,
  colores: { piel: '#e9a77f', ropa: '#e2574c', pantalon: '#3d5a9c', zapato: '#f2d04a', pelo: '#5a3220' },
  material: (parte, color) => materialDelEstilo(color), // el MISMO material que el resto de la escena
  forma: (geo, parte, i) => geo, // opcional: como lo deforma el material (amasar, caras planas…)
})
P.ponerEn(-2.3, 0.7, Math.PI / 2) // x, z y hacia dónde mira (0 = de frente a la cámara)
scene.add(P.grupo)
const ACCIONES = [
  { hace: 'camina', t0: 0, t1: 1.6, hasta: [-0.35, 0.35] },
  { hace: 'saluda', t0: 1.6, t1: 2.6, mano: 'der' },
  { hace: 'habla', t0: 1.7, t1: 5.7, boca: bocaDe(BOCA) },
  { hace: 'senala', t0: 4.0, t1: 5.6, hacia: [0.95, 1.25, 0.15] },
  { hace: 'cara', t0: 5.85, t1: 6.35, como: 'sorpresa' },
]
E.alActualizar((t) => P.animar(t, ACCIONES)) // en stop-motion, pásale el tiempo en poses
```

- Acciones: `camina` (hasta [x, z]; al llegar mira a la cámara, o `luego: 'sigue'`), `gira`, `saluda`, `habla`,
  `mira` (un punto), `senala` (un punto), `salta`, `festeja`, `piensa`, `cara` (feliz, sorpresa, triste, enojo,
  piensa, neutro). Se mezclan solas: puede caminar y hablar, o saludar mientras camina.
- La boca: con narración, `boca-de-voz.mjs` sobre la MISMA voz del video y `--desde` el segundo en que entra; la boca
  sigue cada sílaba y se cierra en las pausas. Sin voz grabada, `habla` sin `boca` inventa sílabas.
- Lo que el personaje dice va con su boca: los `habla` cubren solo las frases suyas (si hay un narrador aparte, el
  personaje no mueve la boca).
- Sus partes para el material: piel, ropa, pantalon, zapato, pelo, ojo, pupila, brillo, boca, labio, mejilla, ceja.
  Los ojos y la boca tienen que leerse a la distancia del teléfono: si queda chico en el cuadro, acércale la cámara
  cuando habla.
- `P.manos.der.add(objeto)` para que sostenga algo. Mide 1 de alto por defecto; los pies pisan y = 0.
- **Si el usuario ya tiene su personaje en three.js** (un rig propio, con sus controles): úsalo a él, no el kit.
  Carga su código tal cual en la composición, ponle su grupo dentro de la escena (escalado a ~1.4 de alto) y
  escribe un adaptador con el mismo `animar(t, ACCIONES)` que traduzca cada acción a sus controles (caminar, brazos,
  cabeza, ojos, boca). Su boca sigue la voz igual: el valor de `bocaDe` elige entre las bocas que tenga (cerrada,
  chica, abierta). Para que sea del mundo del estilo, cambia sus materiales por los del estilo (conserva la textura
  de su cara como `map`) y oculta lo que sea de su dibujo original, como los contornos. No le cambies la forma: es
  su personaje.
- Su tamaño junto a los objetos lo decide la historia. En estilos de recortes (papel, teatro, sombras), el personaje
  es un recorte plano en un palito, como los de la escena de Escenario con foco, no este kit.

## index.html de la composición

```html
<!doctype html>
<html lang="es"><head><meta charset="UTF-8" />
<style>* { margin: 0; padding: 0; } html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; } #lienzo { width: 100%; height: 100%; display: block; }</style>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/" } }</script>
</head><body>
<div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="DURACION" data-width="1080" data-height="1920">
  <canvas id="lienzo" width="1080" height="1920"></canvas>
</div>
<script type="module">
import { crearEscenario, conectarHyperFrames } from './escenario.js'
import * as escena from './escena.js'
const E = crearEscenario(document.getElementById('lienzo'), { ...escena.ACABADO, ancho: 1080, alto: 1920, duracion: escena.DURACION, muestras: 32 })
await escena.construir(E)
conectarHyperFrames(E)
</script>
</body></html>
```

`data-duration` es la DURACION del guion. `muestras: 32` es la calidad de entrega; para probar rápido usa 4-8.

## Lo que da el motor

- `E.entorno({ arriba, horizonte, abajo, paneles, intensidad })`: un cielo y paneles de luz hechos en código, para los
  reflejos y el relleno.
- `E.sol({ desde, color, potencia, cubre, suave })`, `E.foco({ desde, hacia, potencia, angulo, penumbra, suave })`:
  `suave` es el radio de la luz y da sombras de borde suave.
- `E.cielo({ color, potencia, cubre, centro })`: luz de toda la cúpula que los objetos tapan (sombras de contacto
  suaves).
- `E.camara(pos, mira, fov?)`, `E.enfoque(punto | distancia, apertura)`: la apertura es el radio de la lente; 0 deja
  todo nítido y 0.03-0.1 da miniatura o macro.
- `E.encima((ctx, t, W, H) => ...)`: dibujo 2D nítido encima de todo. `E.filtro(glsl)`: un filtro sobre la imagen
  revelada (pintura, tramado).
- `ACABADO`: `tono` (`neutro` deja los colores de los materiales, `cine` da contraste, `suave` para luces fuertes),
  `exposicion`, `brillo`/`umbral` (bloom), `vineta`, `grano`, `saturacion`, `contraste`, `obturador` (0 = sin estela,
  para stop-motion), `fov`, `fondo`.
- `U`: `tramo`, `curva`, `resorte`, `pista` (claves que se detienen), `camino` (claves que fluyen, para la cámara),
  `azar`, `hash`, `ruido`, `lienzo` (texturas en canvas), `textoPlano`, `fuente` (Google Fonts para canvas),
  `colocar` (instancias).
- `sonido.js`: `M.toca(nombre, t, { vol, pan, f, dur })` con pop, tic, clic, toc, soplo, silbido, subida, golpe,
  impacto, sello, campana, exito, error, destellos, falla, cuenta, papel, palmada, cinta, presion, plop, gota, trazo,
  tecla, tecleo, neon y zumbido. Además:
  - `M.tono(...)` y `M.ruido(...)` para sonidos propios;
  - `M.menor(() => ...)` para lo chico y frecuente;
  - `M.fondo(...)` y `M.musica(...)`, que se omiten con voz.

  Los golpes grandes (la revelación, el resultado) van completos y, si se puede, en una pausa de la voz.

Para Recorte (desarrollo): `node scripts/motor3d.mjs cuadros|video|vista <id>` prueba las escenas de referencia.
