// El guion de la escena de Plastilina: «una planta necesita agua, sol y tiempo». Tiempos (en segundos) que leen la
// imagen y el sonido por igual, y la partitura. Sin Three.js.
export const POSTER = 7.6 // el momento de la vista previa
export const DURACION = 8.5
// stop-motion: 15 poses por segundo; los eventos caen justo en una pose
export const POSES = 15
export const enPose = (t) => Math.round(t * POSES) / POSES
export const T = {
  gota: enPose(0.6), // la gota de agua salta desde la izquierda...
  cae: enPose(1.13), // ...y cae en la maceta
  agua: enPose(1.25), // «AGUA» se pega en el fondo
  brota: enPose(1.8), // el brote sale de la tierra
  hojas: [enPose(2.45), enPose(2.7)],
  sol: enPose(3.3), // el sol se pega arriba
  palabraSol: enPose(3.5),
  crece: enPose(4.3), // el tallo crece de a tirones
  hojas2: [enPose(4.9), enPose(5.15)],
  tiempo: enPose(5.0), // «TIEMPO»
  flor: enPose(6.2), // la flor abre pétalo a pétalo
  petalos: 6,
}
export const PALABRAS = [['AGUA', T.agua], ['SOL', T.palabraSol], ['TIEMPO', T.tiempo]]

export function sonido(M) {
  M.fondo('cuarto', 0, DURACION, { vol: 0.9 })
  M.musica('colchon', 0, DURACION, { bpm: 64, vol: 0.5, acordes: [['F3', 'A3', 'C4', 'G4'], ['Bb3', 'D4', 'F4', 'C5']] })
  M.toca('silbido', T.gota - 0.05, { vol: 0.4, pan: -0.5 })
  M.toca('plop', T.cae, { vol: 0.9, f: 260 })
  M.toca('gota', T.cae + 0.04, { vol: 0.8, f: 700 })
  PALABRAS.forEach(([, t], i) => { M.toca('presion', t, { vol: 0.6, pan: -0.2 + i * 0.2 }); M.toca('palmada', t, { vol: 0.45 }); M.toca('pop', t + 0.02, { vol: 0.4, f: 500 + i * 80 }) })
  M.menor(() => {
    M.toca('plop', T.brota, { vol: 0.6, f: 300 })
    ;[...T.hojas, ...T.hojas2].forEach((t, i) => M.toca('plop', t, { vol: 0.5, f: 330 + i * 40, pan: i % 2 ? 0.3 : -0.3 }))
    for (let k = 0; k < 6; k++) M.toca('plop', T.crece + k * 0.13, { vol: 0.3, f: 240 + k * 20 })
  })
  M.toca('golpe', T.sol, { vol: 0.5, f: 150, pan: 0.4 })
  M.toca('destellos', T.sol + 0.05, { vol: 0.45 })
  const escala = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6']
  M.menor(() => { for (let i = 0; i < T.petalos; i++) M.toca('pop', T.flor + i * (2 / 15), { vol: 0.5, f: 380 * 2 ** (i / 7), pan: -0.3 + i * 0.12 }) })
  M.tono(T.flor + 0.85, { f: escala[5], dur: 1.2, vol: 0.08, eco: 0.3 })
  M.toca('exito', T.flor + 0.9, { vol: 0.65, f: 'G5' })
}
