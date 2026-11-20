// El guion de la escena de Papel desplegable: «del grano a la taza». Un libro pop-up con tres páginas dobles; cada
// vuelta de hoja cierra una escena y levanta la siguiente. Tiempos y partitura, sin Three.js.
export const POSTER = 8.4 // el momento de la vista previa
export const DURACION = 9
export const VUELTA = 1.3 // lo que tarda una hoja en pasar
export const HOJAS = [0.0, 2.9, 5.7] // cuándo empieza a pasar cada hoja (la primera abre el libro)
export const llega = (j) => HOJAS[j] + VUELTA
export const PALABRAS = ['Crece en la montaña', 'Se seca y se tuesta', 'Y llega a tu taza']

export function sonido(M) {
  M.fondo('cuarto', 0, DURACION, { vol: 1 })
  M.musica('colchon', 0, DURACION, { bpm: 78, vol: 0.55, acordes: [['F3', 'A3', 'C4', 'E4'], ['D3', 'F3', 'A3', 'C4'], ['Bb2', 'D3', 'F3', 'A3']] })
  HOJAS.forEach((t0, j) => {
    const t1 = llega(j)
    M.toca('papel', t0 + 0.02, { vol: 1.3, dur: 0.5, pan: 0.4 })
    M.toca('soplo', t0 + 0.3, { vol: 0.5, dur: 0.8, f: 1500 })
    M.toca('papel', t0 + 0.55, { vol: 0.9, dur: 0.6 })
    M.menor(() => { for (let i = 0; i < 6; i++) M.toca('tic', t1 - 0.5 + i * 0.08, { vol: 0.4 + 0.06 * i, f: 1900 + i * 280, pan: -0.3 + i * 0.1 }) }) // el cartón se levanta
    M.toca('palmada', t1, { vol: 0.6, pan: -0.3 })
    M.toca('golpe', t1, { vol: 0.5, f: 105, pan: -0.3 })
    M.toca('campana', t1 + 0.15, { vol: 0.32, f: ['C5', 'E5', 'G5'][j] })
  })
  M.toca('exito', llega(2) + 1.6, { vol: 0.55, f: 'C6' })
}
