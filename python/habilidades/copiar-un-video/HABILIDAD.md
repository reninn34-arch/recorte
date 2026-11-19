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
(el resumen) y `tomas.md` (una línea por toma), y abre los fotogramas `tomas/toma-NN.jpg` de las tomas que importan:
el gancho (las 2-3 primeras), los cambios de ritmo y el cierre. Lo marcado «míralo» o «pista» confírmalo viendo el
fotograma. Si es larga o tiene música, `python kit/kit.py golpes entrada/<referencia>` da los golpes exactos.

Si la referencia es de las que se ven como una sola toma continua (un plano secuencia, un screencast), díselo al
usuario: ahí el ritmo sale de lo que pasa dentro (zooms, textos), no de los cortes.

## 2. La ficha de lo que vas a copiar
Escríbela en `notas.md` antes de hacer nada:
- **Ritmo**: duración mediana de las tomas, la más corta y la más larga, y cómo cambia (¿empieza rápido y se calma?).
- **Gancho**: qué pasa en los primeros 2-3 s (un texto grande, un zoom, un golpe de sonido, una pregunta).
- **Cámara por toma**: fija, acercar, alejar, paneo, cámara en mano. Acercar o alejar suave → `encuadre` con zoom que
  cambia; cámara en mano → un temblor leve; «foto con movimiento» → fotos con zoom o paneo lento.
- **Qué hay en pantalla**: proporción de gráficos frente a lo grabado, dónde va el texto (arriba, centro o abajo), su
  tamaño, color y cómo entra (míralo en los fotogramas).
- **Sonido**: tempo de la música, si corta en el golpe (si `ANALISIS.md` dice «Corta al ritmo», tus cortes van en los
  golpes de tu música) y si los cortes llevan un efecto (whoosh, pum: `kit.py sonidos`).
- **Color**: cálido, frío o neutro, y la luz media.
- **Cierre**: cómo termina (logo, llamada a la acción, fundido).

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
cortes por minuto, toma mediana, cámara, texto, si corta en el golpe. Si algo se aleja (tus tomas duran el doble, no
cortas en el golpe y ella sí), corrígelo. `python kit/kit.py revisar salida/<video> --referencia entrada/<ref>` pone
las dos lado a lado.

En las comprobaciones de `resultado.json`, di cómo quedó frente a la referencia («toma mediana 1,4 s frente a 1,3 s;
8 de 10 cortes en el golpe, como ella»).
