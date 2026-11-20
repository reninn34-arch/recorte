// El guion de la escena de Neón: un letrero de bar que se enciende de a partes, de noche. Tiempos y sonido.
export const DURACION = 7
export const POSTER = 5.8
// cuándo empieza a encenderse cada pieza (parpadea ~0.4 s y queda firme)
export const T = { copa: 0.35, palabra: 1.4, flecha: 3.0, horas: 4.1, falla: 5.6 }

export function sonido(M) {
  M.fondo('zumbido', 0, DURACION, { vol: 1 })
  M.fondo('lluvia', 0, DURACION, { vol: 0.5 })
  M.musica('pulso', 0, DURACION, { bpm: 92, vol: 0.45, acordes: [['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4']] })
  M.toca('clic', T.copa - 0.05, { vol: 0.8, pan: -0.4 })
  M.toca('neon', T.copa, { vol: 0.9, dur: 0.4, pan: -0.4 })
  M.toca('clic', T.palabra - 0.05, { vol: 0.8 })
  M.menor(() => { for (let i = 0; i < 7; i++) M.toca('neon', T.palabra + i * 0.09, { vol: 0.55, dur: 0.12, pan: -0.3 + i * 0.1 }) })
  M.toca('subida', T.palabra + 0.1, { vol: 0.35, dur: 0.6 })
  M.toca('clic', T.flecha - 0.05, { vol: 0.8, pan: 0.4 })
  M.menor(() => { for (let k = 0; k < 4; k++) M.toca('neon', T.flecha + k * 0.5, { vol: 0.5, dur: 0.15, pan: 0.4 }) })
  M.toca('neon', T.horas, { vol: 0.9, dur: 0.45, pan: 0.2 })
  M.toca('impacto', T.horas + 0.45, { vol: 0.45 })
  M.toca('neon', T.falla, { vol: 0.5, dur: 0.3, pan: -0.1 })
}
