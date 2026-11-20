// El guion del ejemplo de personaje en Plastilina: Lupe entra caminando, saluda y se presenta con su voz, señala su
// planta, se sorprende con el sol y festeja. Tiempos (en segundos del video) y sonido.
export const DURACION = 8.6
export const POSTER = 4.9
export const POSES = 15 // stop-motion: 15 poses por segundo, como la escena del estilo
export const VOZ = { archivo: 'voz.wav', desde: 1.7 } // la narración entra en el segundo 1.7
export const T = {
  camina: [0, 1.6], // entra desde la izquierda
  saluda: [1.6, 2.6], // «¡Hola!» (1.77)
  habla: [1.7, 5.7],
  senala: [4.0, 5.6], // «…cuidar tu planta»
  sol: 5.85, // el sol se pega en la pared
  salta: 6.35,
  festeja: [7.0, 8.2],
}

export function sonido(M) {
  M.fondo('cuarto', 0, DURACION, { vol: 0.8 })
  M.musica('colchon', 0, DURACION, { bpm: 84, vol: 0.45, acordes: [['C4', 'E4', 'G4', 'C5'], ['A3', 'C4', 'E4', 'A4'], ['F3', 'A3', 'C4', 'F4'], ['G3', 'B3', 'D4', 'G4']] })
  M.menor(() => { for (let k = 0; k < 6; k++) M.toca('toc', 0.18 + k * 0.26, { vol: 0.4, f: 700 + (k % 2) * 90, pan: -0.6 + k * 0.1 }) }) // pasitos de plastilina
  M.toca('soplo', T.saluda[0] + 0.05, { vol: 0.25, dur: 0.3 })
  M.toca('papel', T.senala[0] + 0.1, { vol: 0.35, dur: 0.25, pan: 0.3 })
  M.toca('plop', T.sol, { vol: 0.7, pan: 0.5 }); M.toca('campana', T.sol + 0.1, { vol: 0.3, f: 'G5', pan: 0.5 })
  M.toca('subida', T.salta, { vol: 0.4, dur: 0.4 }); M.toca('golpe', T.salta + 0.62, { vol: 0.5, f: 160 })
  M.toca('exito', T.festeja[0], { vol: 0.5, f: 'C6' }); M.toca('destellos', T.festeja[0] + 0.05, { vol: 0.45 })
}
