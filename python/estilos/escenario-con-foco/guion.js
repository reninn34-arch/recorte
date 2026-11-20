// El guion de la escena de Escenario con foco: «El faro», un cuento en tres cuadros en un teatrito de juguete.
// 1. El puerto de noche: el farero llega y enciende el faro. 2. La tormenta: bajan las nubes, llueve y un barquito
// se pierde entre las olas. 3. Amanece: la luz del faro lo encuentra y lo trae al puerto. Cada cambio se hace a la
// vista: bajan y suben decorados colgados, entran recortes por las ranuras, se cambia el cartel del atril y la luz.
// Tiempos (el «libro de apuntes» del teatro) y sonido.
export const DURACION = 11
export const POSTER = 9.6
export const CARTELES = [
  { lugar: 'EL PUERTO', lineas: ['EL FARERO', 'ENCIENDE LA LUZ'] },
  { lugar: 'LA TORMENTA', lineas: ['UN BARCO', 'SE PIERDE'] },
  { lugar: 'AMANECE', lineas: ['LA LUZ LO', 'TRAE A CASA'] },
]
export const T = {
  farero: [0.25, 1.5], // entra por su ranura hasta la puerta del faro
  enciende: 1.75, // se prende la lámpara del faro y empieza a girar
  tormenta: 3.3, // cambio 1: bajan las nubes, se enfría la luz
  cartel: [3.45, 7.35], // se tira la tarjeta del atril y queda la siguiente
  lluvia: 3.7,
  barco: [4.0, 5.6], // el barquito entra por la derecha, entre las olas
  rayos: [4.75, 6.05],
  encuentra: 6.5, // el faro se detiene sobre el barco
  amanece: 7.2, // cambio 2: suben nubes y lluvia, luz de amanecer
  sol: [7.5, 8.9], // el sol sube por detrás de las olas
  vuelve: [7.7, 9.4], // el barco va hasta el muelle
  saluda: 9.4, // el farero levanta el farol
}

export function sonido(M) {
  M.fondo('cuarto', 0, DURACION, { vol: 1.1 })
  // el mar, siempre: oleaje lento de ruido grave
  for (let t = 0; t < DURACION; t += 2.2) M.ruido(t, { color: 'cafe', dur: 2.6, vol: 0.12, ataque: 0.9, filtro: { tipo: 'pasaBajos', f: [[0, 300], [1.2, 700], [2.6, 260]] } })
  M.musica('colchon', 0, T.tormenta, { bpm: 64, vol: 0.5, acordes: [['A3', 'E4', 'A4', 'C5']] })
  M.musica('colchon', T.tormenta, T.amanece, { bpm: 60, vol: 0.45, acordes: [['D3', 'A3', 'D4', 'F4'], ['C3', 'G3', 'C4', 'E4']] })
  M.musica('colchon', T.amanece, DURACION, { bpm: 66, vol: 0.55, acordes: [['F3', 'C4', 'A4', 'E5'], ['C3', 'G3', 'E4', 'C5']] })
  // escena 1
  M.menor(() => { for (let k = 0; k < 6; k++) M.toca('toc', T.farero[0] + 0.1 + k * 0.2, { vol: 0.3, f: 380 + (k % 2) * 40, pan: -0.7 + k * 0.05 }) }) // el patín en la ranura
  M.toca('clic', T.enciende - 0.05, { vol: 0.6, pan: -0.5 }); M.toca('zumbido', T.enciende, { vol: 0.35, dur: 0.5, pan: -0.5 })
  M.toca('campana', T.enciende + 0.25, { vol: 0.3, f: 'E5', pan: -0.5 })
  // cambio 1: las varas bajan, el cartel, el viento y la lluvia
  M.toca('soplo', T.tormenta, { vol: 0.5, dur: 0.9, f: 500 }); M.toca('golpe', T.tormenta + 0.7, { vol: 0.4, f: 90 })
  M.toca('papel', T.cartel[0], { vol: 0.7, dur: 0.4, pan: 0.5 })
  M.ruido(T.tormenta, { color: 'rosa', dur: T.amanece - T.tormenta + 0.6, vol: 0.09, ataque: 0.6, filtro: { tipo: 'pasaBanda', f: [[0, 500], [1.5, 1100], [3, 700], [4.2, 900]], q: 0.7 } })
  M.ruido(T.lluvia, { dur: T.amanece - T.lluvia + 0.4, vol: 0.05, ataque: 0.5, filtro: { tipo: 'pasaAltos', f: 3500 } })
  M.menor(() => { const r = M.azar(9); for (let t = T.lluvia; t < T.amanece; t += 0.03 + r() * 0.06) M.toca('gota', t, { vol: 0.08 + r() * 0.08, pan: r() * 1.6 - 0.8 }) })
  // el barco: crujidos de madera con cada ola
  M.menor(() => { for (let t = T.barco[0]; t < 9.6; t += 0.55) M.toca('toc', t, { vol: 0.22, f: 220, pan: 0.5 }) })
  T.rayos.forEach((t) => { M.toca('impacto', t, { vol: 0.85 }); M.ruido(t + 0.05, { color: 'cafe', dur: 1.6, vol: 0.25, ataque: 0.05, filtro: { tipo: 'pasaBajos', f: [[0, 900], [1.4, 120]] } }) })
  M.toca('subida', T.encuentra - 0.3, { vol: 0.35, dur: 0.35 }); M.toca('campana', T.encuentra, { vol: 0.45, f: 'A5' })
  // cambio 2 y el final
  M.toca('soplo', T.amanece, { vol: 0.45, dur: 1.0, f: 900 }); M.toca('papel', T.cartel[1], { vol: 0.7, dur: 0.4, pan: 0.5 })
  M.toca('campana', T.vuelve[1], { vol: 0.35, f: 'C6', pan: -0.3 }); M.toca('campana', T.vuelve[1] + 0.25, { vol: 0.3, f: 'G5', pan: -0.3 }) // la boya del puerto
  M.toca('exito', T.saluda, { vol: 0.5, f: 'F5' }); M.toca('destellos', T.saluda + 0.1, { vol: 0.4 })
  M.menor(() => { const r = M.azar(3); for (let i = 0; i < 40; i++) M.toca('palmada', T.saluda + 0.4 + r() * 1.1, { vol: 0.08 + r() * 0.12, pan: r() * 1.6 - 0.8 }) })
}
