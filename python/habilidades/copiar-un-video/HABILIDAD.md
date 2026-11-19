---
nombre: Editar como un video
cuando: el usuario trae un video de referencia y pide hacerlo o editarlo «como este», «igual», «con este estilo», «así», o copiar la edición de un TikTok, Reel o anuncio
---

# Editar como un video

Copias la FORMA de la referencia (cómo está editada), nunca su contenido (sus imágenes, su música, su marca). El
video que entregas lleva el material y la historia del usuario.

Copia lo que el usuario pide de ella, no más: si dice «solo el ritmo» o «los subtítulos como este», copia eso y el
resto lo decides tú como siempre. Si dice «igualito», cópialo todo. Lo que la referencia hace mal (una toma movida, un
texto que tapa una cara) no se copia.

## 1. Analízala, no la adivines
`python kit/kit.py analizar entrada/<referencia>` (local, gratis, segundos). Lee `analisis/<nombre>/ANALISIS.md`
(el resumen) y `tomas.md` (una línea por toma), y MIRA las imágenes (una foto por toma no basta: dentro de una toma
pasan cosas):
- `vistazo.jpg`: todo el video en una hoja. Cómo se arma, qué entra, cuándo y desde dónde (cae, vuela girando desde un
  lado, aparece de golpe, crece).
- `tomas/toma-NN-tira.jpg`: lo que pasa dentro de cada toma larga, cuadro a cuadro.
- `tomas/toma-NN-texto.jpg` (de cerca) y `toma-NN-texto-tira.jpg` (cuadro a cuadro, de arriba abajo): la letra y su
  animación. Si `ANALISIS.md` dice «se anima», busca en la tira qué hace (letras que parpadean, que se escriben, que
  suben).
- `cierre.jpg`: cómo termina.
Lo marcado «míralo» o «pista» confírmalo en las imágenes. Si es larga o tiene música, `python kit/kit.py golpes
entrada/<referencia>` da los golpes exactos.

Si la referencia es de las que se ven como una sola toma continua (un plano secuencia, un screencast), díselo al
usuario: ahí el ritmo sale de lo que pasa dentro (zooms, textos), no de los cortes.

## 2. La ficha de lo que vas a copiar
Escríbela en `notas.md` antes de hacer nada:
- **Ritmo**: duración mediana de las tomas, la más corta y la más larga, y cómo cambia (¿empieza rápido y se calma?).
- **Gancho**: qué pasa en los primeros 2-3 s (un texto grande, un zoom, un golpe de sonido, una pregunta).
- **Cámara por toma**: fija, acercar, alejar, paneo, cámara en mano. Acercar o alejar suave → `encuadre` con zoom que
  cambia; cámara en mano → un temblor leve; «foto con movimiento» → fotos con zoom o paneo lento.
- **Qué hay en pantalla**: proporción de gráficos frente a lo grabado y cómo entra cada cosa (de qué lado, girando o
  no, con rebote o seca, todas a la vez o una tras otra y cada cuánto).
- **El texto**, mirando su recorte de cerca: dónde va; la letra (gruesa o fina, redonda o recta, con o sin serifa,
  mayúsculas o no) y la de Google Fonts que más se le parece; sus colores (uno o dos tonos, degradado); si lleva sombra,
  contorno o caja detrás (si no lleva, el tuyo tampoco); y su animación, de la tira. El texto se hace con HyperFrames o
  rótulos con esa letra, nunca dibujado a mano con la letra del sistema.
- **Sonido**: tempo de la música, si corta en el golpe (si `ANALISIS.md` dice «Corta al ritmo», tus cortes van en los
  golpes de tu música) y si los cortes llevan un efecto (whoosh, pum: `kit.py sonidos`).
- **Color**: cálido, frío o neutro, y la luz media.
- **Cierre**, de `cierre.jpg` y de «El cierre» en `ANALISIS.md`: cómo termina (se oscurece, un logo, el usuario de
  Instagram, una web, una llamada a la acción, un texto legal) y cuánto dura. Es parte de la edición: cópialo con los
  datos del usuario. Si no los tienes (su @, su logo), pregúntaselos con todas las letras («la referencia cierra con su
  Instagram; ¿cuál es el tuyo?»). Nunca lo quites por tu cuenta ni lo escondas en una línea del plan.

## 3. Di qué copias tal cual y qué adaptas
En el plan o en el resumen, antes de hacerlo, en dos listas cortas:
- **Tal cual**: lo que el kit hace igual (casi todo: ritmo, cámara, textos, transiciones, color, efectos).
- **Adaptado**, con el porqué:
  - sus tomas no son las del usuario: si trae menos, parte las suyas en más momentos (otro encuadre, un zoom, un
    texto encima); si trae más, usa las mejores (habilidad `escoger-tomas`);
  - su canción no la tienes: una de la biblioteca (`kit.py musica`) con un tempo parecido y la misma energía;
  - su letra exacta: la más parecida de las que hay;
  - lo que el kit no tenga: dilo, no lo inventes a medias.

## 4. Hazlo y compáralo
Cuando lo tengas, `python kit/kit.py analizar salida/<tu video>` y compara su `ANALISIS.md` con el de la referencia:
cortes por minuto, toma mediana, cámara, texto, si corta en el golpe, y el cierre (cuándo empieza y cuánto dura). Pon
su `vistazo.jpg`, su texto de cerca y su `cierre.jpg` junto a los de la referencia y míralos. Si algo se aleja (tus tomas duran el doble, no
cortas en el golpe y ella sí), corrígelo. `python kit/kit.py revisar salida/<video> --referencia entrada/<ref>` pone
las dos lado a lado.

En las comprobaciones de `resultado.json`, di cómo quedó frente a la referencia («toma mediana 1,4 s frente a 1,3 s;
8 de 10 cortes en el golpe, como ella»).
