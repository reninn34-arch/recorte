// El guion de la escena de Diorama miniatura: «la panadería del barrio». Una maqueta de una manzana sobre su base de
// tierra: se arma pieza por pieza, el barrio cobra vida (la camioneta da la vuelta, la gente camina, sale humo del
// horno) y cae la tarde con las ventanas encendidas mientras la cámara se acerca a la panadería. Tiempos y sonido.
export const DURACION = 9
export const POSTER = 6.7
export const T = {
  panaderia: 0.35, // sube del suelo
  toldo: 0.95, // se despliega el toldo
  letrero: 1.25, // el letrero se levanta
  casas: [1.4, 1.65, 1.9, 2.15],
  arboles: 1.7, // empiezan los árboles (uno cada 0.09 s)
  plaza: 2.7, // bancas, faroles y flores
  vida: 3.1, // la camioneta y la gente
  humo: 3.4,
  tarde: [5.6, 6.8], // cae la tarde y se encienden las luces
  acerca: 6.4, // la cámara empuja hacia la panadería
}

export function sonido(M) {
  M.fondo('viento', 0, DURACION, { vol: 0.6 })
  M.musica('pulso', 0.2, DURACION, { bpm: 104, vol: 0.4, acordes: [['C4', 'E4', 'G4', 'B4'], ['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4', 'F4']] })
  M.toca('golpe', T.panaderia + 0.15, { vol: 0.55, f: 150 }); M.toca('pop', T.panaderia + 0.2, { vol: 0.6, f: 380 })
  M.toca('papel', T.toldo, { vol: 0.5, dur: 0.35 })
  M.toca('clic', T.letrero + 0.2, { vol: 0.5 })
  T.casas.forEach((t, i) => M.toca('pop', t + 0.15, { vol: 0.5, f: 330 + i * 40, pan: [-0.6, 0.6, -0.3, 0.4][i] }))
  const r = M.azar(5), escala = [0, 4, 7, 9, 12]
  M.menor(() => { for (let i = 0; i < 14; i++) M.toca('pop', T.arboles + i * 0.09 + 0.1, { vol: 0.3, f: 520 * 2 ** (escala[i % 5] / 24 + Math.floor(i / 5) * 0.25), pan: r.rango(-0.6, 0.6) }) })
  M.menor(() => { for (let i = 0; i < 6; i++) M.toca('toc', T.plaza + i * 0.07, { vol: 0.35, f: 900 + i * 60, pan: r.rango(-0.4, 0.4) }) })
  M.ruido(T.vida, { color: 'rosa', dur: DURACION - T.vida, vol: 0.05, ataque: 0.6, filtro: { tipo: 'pasaBajos', f: 260 } }) // el motorcito de la camioneta
  M.toca('campana', T.vida + 1.4, { vol: 0.3, f: 'E6', pan: 0.3 }) // la campanita de la puerta
  M.toca('campana', T.vida + 1.55, { vol: 0.2, f: 'G6', pan: 0.3 })
  M.toca('soplo', T.tarde[0], { vol: 0.35, dur: 1.2, f: 900 })
  M.menor(() => { for (let i = 0; i < 7; i++) M.toca('tic', T.tarde[0] + 0.3 + i * 0.12, { vol: 0.3, f: 2000 + i * 150, pan: r.rango(-0.5, 0.5) }) }) // las luces que se encienden
  M.toca('exito', T.acerca + 1.3, { vol: 0.45, f: 'C6' })
}
