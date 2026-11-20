// El guion de la isla: la duración, los tiempos y el sonido. Sin Three.js: lo leen la escena (imagen) y
// sonido-a-wav.mjs (audio) por igual.
export const POSTER = 5.5 // el momento de la vista previa
export const DURACION = 6

/** El sonido, con los mismos tiempos que la imagen. M es una mezcla de sonido.js. */
export function sonido(M) {
  M.fondo('viento', 0, DURACION, { vol: 0.8 })
  M.musica('colchon', 0, DURACION, { bpm: 60, acordes: [['D4', 'F#4', 'A4', 'C#5'], ['G3', 'B3', 'D4', 'F#4']], vol: 0.8 })
  M.toca('golpe', 0.3, { vol: 0.7, f: 140 })
  M.toca('palmada', 0.3, { vol: 0.4 })
  // los árboles brotan: uno de cada tres suena, la nota sube a medida que el bosque se extiende
  const r = M.azar(11), escala = [0, 2, 4, 7, 9]
  M.menor(() => {
    for (let i = 0; i < 34; i++) {
      const t = 1.05 + i * 0.1 + r.rango(-0.02, 0.02), nota = escala[i % 5] + 12 * Math.floor(i / 10)
      M.toca('pop', t, { vol: 0.35, f: 420 * 2 ** (nota / 24), pan: r.rango(-0.5, 0.5) })
    }
  })
  M.toca('soplo', 2.1, { vol: 0.5, dur: 1.2, f: 1600 })
  M.toca('exito', 4.6, { vol: 0.6, f: 'A5' })
  M.toca('destellos', 4.7, { vol: 0.5 })
}
