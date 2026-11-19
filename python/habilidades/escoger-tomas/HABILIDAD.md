---
nombre: Escoger las mejores tomas
cuando: el usuario trae más material del que cabe en el video (varios clips o clips largos) y hay que elegir qué usar, o pide «usa lo mejor», «quita lo malo», «hazlo corto con esto»
---

# Escoger las mejores tomas

Un editor mira todo el material antes de cortar. Aquí lo haces midiendo, en segundos y sin gastar.

**Cuándo NO usarla:** si el usuario quiere su clip entero, en su orden o tal cual («ponle subtítulos», «solo el
color», «no cortes nada»), no escojas ni descartes nada: respeta su material. Y si una toma «con fallos» es justo la
que pide (un momento movido pero importante, una escena oscura a propósito), se queda.

## 1. Analiza cada video
`python kit/kit.py analizar entrada/<video>` por cada uno. Lee su `ANALISIS.md` y su `tomas.md`: cada toma con su
tiempo (de la fuente), cámara, encuadre, luz, color, texto y **fallos** (oscura, quemada, borrosa, tiembla mucho).

## 2. Descarta y ordena
- Fuera las tomas con fallos, salvo que sean lo único que muestra algo importante (entonces corrígelas: más luz,
  estabilizar, recortar el trozo que tiembla).
- Fuera las de menos de 0,5 s y los trozos donde no pasa nada («acción: poca» y cámara fija durante mucho rato).
- Para el **gancho** (los primeros 2-3 s), la toma más llamativa: primer plano con la cara, acción, un movimiento de
  cámara. Para el **cierre**, una toma estable y clara (el producto, el lugar, la persona mirando a cámara).
- Alterna encuadres (un plano general y luego uno cerrado) y movimientos: dos tomas iguales seguidas se ven repetidas.
- Si hay voz, la voz manda: corta donde termina una frase (`vistazo/` y la transcripción tienen los tiempos), no en
  medio de una palabra.

## 3. Mira antes de decidir
Abre el fotograma (`tomas/toma-NN.jpg`) de cada toma que vas a usar en un momento clave. Lo medido no ve si alguien
tiene los ojos cerrados o si hay algo feo en el fondo.

## 4. Cuéntalo
En el resumen, en una línea: cuántas tomas había, cuántas usaste y por qué dejaste fuera las demás («de 23 tomas usé
9; dejé fuera 4 oscuras y 2 movidas»).
