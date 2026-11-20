// El guion de la escena de Inflado: «oferta de verano, 50 %». Objetos de plástico inflable que se inflan, caen y
// rebotan en un estudio de color pastel. Tiempos y sonido.
export const DURACION = 7
export const POSTER = 6.2
export const T = {
  estrella: 0.3, // se infla en el centro
  pelota: 1.2, // cae desde arriba y rebota
  cifras: [2.1, 2.45, 2.8], // «5», «0», «%» se inflan uno por uno
  aro: 3.6, // un salvavidas cae y gira
  final: 4.6, // todo da un último salto juntos
}

export function sonido(M) {
  M.fondo('cuarto', 0, DURACION, { vol: 0.8 })
  M.musica('pulso', 0, DURACION, { bpm: 110, vol: 0.5, acordes: [['C4', 'E4', 'G4', 'B4'], ['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4', 'F4']] })
  const inflar = (t, pan) => { M.toca('subida', t, { vol: 0.45, dur: 0.55, pan }); M.toca('pop', t + 0.5, { vol: 0.7, f: 520, pan }) }
  inflar(T.estrella, 0)
  M.toca('soplo', T.pelota - 0.25, { vol: 0.5, dur: 0.4 })
  ;[0, 0.42, 0.7].forEach((d, i) => M.toca('golpe', T.pelota + 0.35 + d, { vol: 0.6 - i * 0.18, f: 170 - i * 10, pan: 0.4 }))
  T.cifras.forEach((t, i) => inflar(t, -0.3 + i * 0.3))
  M.toca('soplo', T.aro - 0.2, { vol: 0.5, dur: 0.5, pan: -0.4 })
  M.toca('golpe', T.aro + 0.3, { vol: 0.5, f: 150, pan: -0.4 })
  M.toca('palmada', T.final, { vol: 0.5 })
  M.toca('golpe', T.final + 0.42, { vol: 0.6, f: 130 })
  M.toca('exito', T.final + 0.5, { vol: 0.6, f: 'E6' })
  M.toca('destellos', T.final + 0.55, { vol: 0.5 })
}
