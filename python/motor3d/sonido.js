// sonido.js — los sonidos de los estilos 3D de Recorte, sintetizados (sin archivos de audio). Escrito para Recorte
// desde cero. Corre igual en Node y en el navegador: genera las muestras directamente y entrega un WAV.
//
//   import { crearMezcla } from './sonido.js'
//   const M = crearMezcla(8, { conVoz: true })      // 8 segundos; conVoz: la narración va encima (ver abajo)
//   M.toca('pop', 1.2)                              // un sonido con nombre, en el segundo 1.2
//   M.menor(() => { for (...) M.toca('tic', t) })   // los sonidos chicos y frecuentes
//   M.tono(2, { f: [[0, 'C5'], [0.3, 'G5']], dur: 0.4, vol: 0.2 })
//   M.fondo('cuarto', 0, 8); M.musica('colchon', 0, 8, { bpm: 70 })
//   fs.writeFileSync('efectos.wav', M.aWav())
//
// Con voz (conVoz: true): sin fondos ni música, los sonidos «menores» al 60 % y todo un poco más bajo, para que la
// narración quede arriba y el video igual suene vivo. Los golpes grandes (la revelación, el resultado) van completos.
// Todo es determinista: el mismo código da siempre el mismo audio.

const SR = 48000
const NOTAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** 'A4' → 440 Hz, 'C#5', 'Eb3'; un número se deja igual. */
export function hz(n) {
  if (typeof n === 'number') return n
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n)
  if (!m) throw new Error('nota desconocida: ' + n)
  return 440 * 2 ** ((NOTAS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12 - 9) / 12)
}
function azar(clave) {
  let s = 2166136261
  for (const c of String(clave)) s = Math.imul(s ^ c.charCodeAt(0), 16777619)
  s >>>= 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let z = Math.imul(s ^ (s >>> 15), s | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296
  }
}
/** Una curva en el tiempo: un número fijo o [[dt, valor], ...], exponencial entre puntos (sirve para frecuencias). */
function curvaDe(v, conv = (x) => x) {
  if (!Array.isArray(v)) { const k = conv(v); return () => k }
  const P = v.map(([d, x]) => [d, Math.max(1e-3, conv(x))])
  return (dt) => {
    if (dt <= P[0][0]) return P[0][1]
    for (let i = 1; i < P.length; i++) if (dt <= P[i][0]) { const k = (dt - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] * (P[i][1] / P[i - 1][1]) ** k }
    return P[P.length - 1][1]
  }
}
/** Filtro de segundo orden (fórmulas clásicas de ecualizador), con frecuencia que puede moverse. */
function filtro(tipo, fCurva, q = 0.8) {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0, cuenta = 0
  const coef = (f) => {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al
    if (tipo === 'pasaBajos') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0 }
    else if (tipo === 'pasaAltos') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0 }
    else { b0 = al; b1 = 0; b2 = -al } // pasaBanda
    b0 /= a0; b1 /= a0; b2 /= a0; a1 = (-2 * cw) / a0; a2 = (1 - al) / a0
  }
  return (x, dt) => {
    if (cuenta++ % 32 === 0) coef(fCurva(dt))
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x; y2 = y1; y1 = y
    return y
  }
}
/** La forma del volumen: sube lineal en `ataque`, se queda `sostener`, y cae exponencial hasta callarse en `dur`. */
function envolvente(dt, dur, ataque, sostener) {
  if (dt < 0 || dt > dur) return 0
  if (dt < ataque) return dt / ataque
  if (dt < ataque + sostener) return 1
  const k = (dt - ataque - sostener) / Math.max(1e-4, dur - ataque - sostener)
  return 10 ** (-3.5 * k) * (1 - k)
}

export function crearMezcla(duracion, op = {}) {
  const conVoz = Boolean(op.conVoz)
  const n = Math.ceil(duracion * SR)
  const L = new Float32Array(n), R = new Float32Array(n), EL = new Float32Array(n), ER = new Float32Array(n)
  let enMenor = false
  const volDe = (p, base) => (p.vol ?? base) * (conVoz && (p.menor || enMenor) ? 0.6 : 1) * (conVoz ? 0.8 : 1)

  // una voz: genera muestra por muestra desde t, la filtra, la pone en estéreo y manda una parte al eco
  function voz(t, p, fuente) {
    const dur = p.dur ?? 0.2, i0 = Math.max(0, Math.round(t * SR)), i1 = Math.min(n, Math.round((t + dur) * SR) + 1)
    if (i1 <= i0) return
    const vol = volDe(p, 0.3), ataque = Math.min(p.ataque ?? 0.004, dur * 0.9), sostener = Math.min(p.sostener ?? 0, dur - ataque)
    const pan = Math.max(-1, Math.min(1, p.pan ?? 0)), gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4)
    const fl = p.filtro ? filtro(p.filtro.tipo, curvaDe(p.filtro.f ?? 1000), p.filtro.q ?? 0.8) : null
    const eco = p.eco ?? 0
    for (let i = i0; i < i1; i++) {
      const dt = (i - Math.round(t * SR)) / SR
      let x = fuente(dt)
      if (fl) x = fl(x, dt)
      x *= vol * envolvente(dt, dur, ataque, sostener)
      L[i] += x * gl
      R[i] += x * gr
      if (eco) { EL[i] += x * gl * eco; ER[i] += x * gr * eco }
    }
  }

  const M = { duracion, conVoz, SR }
  /** Azar con semilla para la partitura: M.azar(7)() → 0..1; .rango(a, b). */
  M.azar = (semilla) => { const r = azar('partitura' + semilla); r.rango = (a, b) => a + (b - a) * r(); r.elige = (l) => l[Math.floor(r() * l.length)]; return r }
  /** Un oscilador. p: f (Hz, nota o [[dt, f], ...]), forma ('seno' | 'triangulo' | 'cuadrada' | 'sierra'), dur, vol, ataque, sostener, pan, eco, filtro: { tipo, f, q }, desafina (cents). */
  M.tono = (t, p = {}) => {
    const fC = curvaDe(p.f ?? 440, hz), forma = p.forma || 'seno', k = 2 ** ((p.desafina || 0) / 1200)
    let fase = 0
    voz(t, p, (dt) => {
      fase += (fC(dt) * k) / SR
      const ph = fase - Math.floor(fase)
      return forma === 'seno' ? Math.sin(2 * Math.PI * ph) : forma === 'triangulo' ? 1 - 4 * Math.abs(ph - 0.5) : forma === 'cuadrada' ? (ph < 0.5 ? 0.7 : -0.7) : 2 * ph - 1
    })
  }
  /** Ruido. p: color ('blanco' | 'rosa' | 'cafe'), dur, vol, ataque, sostener, pan, eco, filtro: { tipo, f, q }. */
  M.ruido = (t, p = {}) => {
    const r = azar('ruido' + t + (p.color || '') + JSON.stringify(p.filtro?.f ?? ''))
    let b0 = 0, b1 = 0, b2 = 0, cafe = 0
    voz(t, p, () => {
      const w = r() * 2 - 1
      if (p.color === 'rosa') { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; return (b0 + b1 + b2 + w * 0.1848) * 0.25 }
      if (p.color === 'cafe') { cafe = (cafe + 0.02 * w) / 1.02; return cafe * 3.5 }
      return w
    })
  }
  /** Lo que se programe dentro cuenta como sonido menor (más bajo cuando hay voz). */
  M.menor = (fn) => { const antes = enMenor; enMenor = true; try { fn() } finally { enMenor = antes } }

  // ---- sonidos con nombre: M.toca(nombre, t, { vol (escala), pan, f, dur, menor })
  const T = M.tono, Ru = M.ruido
  const S = {
    // gráficos en movimiento
    pop: (t, o) => { T(t, { f: [[0, o.f || 640], [0.07, (o.f || 640) * 0.42]], dur: 0.11, vol: 0.3 * o.v, pan: o.pan }); Ru(t, { dur: 0.012, filtro: { tipo: 'pasaAltos', f: 3200 }, vol: 0.1 * o.v, pan: o.pan }) },
    tic: (t, o) => Ru(t, { dur: 0.018, filtro: { tipo: 'pasaBanda', f: o.f || 4300, q: 2.4 }, vol: 0.32 * o.v, pan: o.pan }),
    clic: (t, o) => { T(t, { f: o.f || 2000, forma: 'cuadrada', dur: 0.02, vol: 0.07 * o.v, filtro: { tipo: 'pasaBajos', f: 3200 }, pan: o.pan }); Ru(t, { dur: 0.01, filtro: { tipo: 'pasaAltos', f: 2600 }, vol: 0.14 * o.v, pan: o.pan }) },
    toc: (t, o) => { T(t, { f: o.f || 800, dur: 0.07, vol: 0.24 * o.v, pan: o.pan }); Ru(t, { dur: 0.05, filtro: { tipo: 'pasaBanda', f: o.f || 800, q: 8 }, vol: 0.4 * o.v, pan: o.pan }) },
    soplo: (t, o) => { const d = o.dur || 0.45; Ru(t, { dur: d, color: 'rosa', filtro: { tipo: 'pasaBanda', f: [[0, 340], [d * 0.55, o.f || 2500], [d, 680]], q: 0.9 }, vol: 0.5 * o.v, ataque: d * 0.5, pan: o.pan, eco: 0.15 }) },
    silbido: (t, o) => { const d = o.dur || 0.18; Ru(t, { dur: d, filtro: { tipo: 'pasaAltos', f: [[0, 1800], [d, 5400]], q: 0.7 }, vol: 0.22 * o.v, ataque: d * 0.35, pan: o.pan }) },
    subida: (t, o) => { const d = o.dur || 0.8; Ru(t, { dur: d, color: 'rosa', filtro: { tipo: 'pasaBanda', f: [[0, 300], [d, 4200]], q: 1.2 }, vol: 0.4 * o.v, ataque: d * 0.95, pan: o.pan, eco: 0.2 }); T(t, { f: [[0, 170], [d, 700]], forma: 'triangulo', dur: d, vol: 0.06 * o.v, ataque: d * 0.9 }) },
    golpe: (t, o) => { T(t, { f: [[0, o.f || 125], [0.16, 40]], dur: 0.27, vol: 0.55 * o.v, pan: o.pan }); Ru(t, { dur: 0.09, color: 'cafe', filtro: { tipo: 'pasaBajos', f: 520 }, vol: 0.4 * o.v, pan: o.pan }) },
    impacto: (t, o) => { S.golpe(t, o); Ru(t, { dur: 0.75, color: 'rosa', filtro: { tipo: 'pasaBajos', f: [[0, 2300], [0.6, 280]] }, vol: 0.35 * o.v, eco: 0.35, pan: o.pan }) },
    sello: (t, o) => { S.golpe(t, { ...o, f: 160 }); Ru(t, { dur: 0.05, filtro: { tipo: 'pasaBanda', f: 1300, q: 1.2 }, vol: 0.4 * o.v, pan: o.pan }) },
    campana: (t, o) => { const f = hz(o.f || 'E6'); T(t, { f, dur: 1.3, vol: 0.2 * o.v, eco: 0.3, pan: o.pan }); T(t, { f: f * 2.76, dur: 0.45, vol: 0.05 * o.v, eco: 0.3, pan: o.pan }); T(t, { f: f * 5.4, dur: 0.15, vol: 0.02 * o.v, pan: o.pan }) },
    exito: (t, o) => { S.campana(t, { ...o, f: o.f || 'C6' }); S.campana(t + 0.09, { ...o, f: hz(o.f || 'C6') * 1.5, v: o.v * 0.85 }) },
    error: (t, o) => { T(t, { f: o.f || 'A3', forma: 'cuadrada', dur: 0.13, vol: 0.08 * o.v, sostener: 0.08, filtro: { tipo: 'pasaBajos', f: 1400 } }); T(t + 0.15, { f: hz(o.f || 'A3') * 0.8, forma: 'cuadrada', dur: 0.22, vol: 0.08 * o.v, sostener: 0.14, filtro: { tipo: 'pasaBajos', f: 1200 } }) },
    destellos: (t, o) => { const r = azar('destellos' + t), notas = ['C6', 'D6', 'E6', 'G6', 'A6', 'C7']; for (let i = 0; i < (o.n || 6); i++) { const ti = t + i * 0.045 + r() * 0.01, f = hz(notas[Math.floor(r() * notas.length)]), pan = r() * 1.2 - 0.6; T(ti, { f, dur: 0.6, vol: 0.04 * o.v, ataque: 0.002, eco: 0.35, pan }); T(ti, { f: f * 2.76, dur: 0.2, vol: 0.012 * o.v, pan }) } },
    falla: (t, o) => { const r = azar('falla' + t); for (let i = 0; i < 7; i++) T(t + i * 0.022, { f: 200 + r() * 1800, forma: 'cuadrada', dur: 0.02, vol: 0.06 * o.v, ataque: 0.001, sostener: 0.015, pan: r() * 1.4 - 0.7 }); Ru(t, { dur: 0.16, filtro: { tipo: 'pasaBanda', f: 2500, q: 0.6 }, vol: 0.12 * o.v }) },
    cuenta: (t, o) => S.tic(t, { ...o, f: o.f || 5200, v: o.v * 0.7 }),
    // materiales hechos a mano
    papel: (t, o) => { const d = o.dur || 0.35, r = azar('papel' + t); for (let x = 0; x < d; x += 0.022 + r() * 0.03) Ru(t + x, { dur: 0.05, filtro: { tipo: 'pasaBanda', f: 1100 + r() * 2800, q: 0.9 }, vol: 0.16 * o.v * (1 - (x / d) * 0.5), pan: o.pan }) },
    palmada: (t, o) => { Ru(t, { dur: 0.07, filtro: { tipo: 'pasaAltos', f: 900 }, vol: 0.45 * o.v, ataque: 0.001, pan: o.pan }); T(t, { f: [[0, 180], [0.06, 70]], dur: 0.1, vol: 0.25 * o.v, pan: o.pan }) },
    cinta: (t, o) => Ru(t, { dur: o.dur || 0.5, filtro: { tipo: 'pasaBanda', f: [[0, 900], [o.dur || 0.5, 2200]], q: 1.8 }, vol: 0.2 * o.v, ataque: 0.02, pan: o.pan }),
    presion: (t, o) => { S.golpe(t, { ...o, f: 95, v: o.v * 0.9 }); Ru(t + 0.01, { dur: 0.25, color: 'cafe', filtro: { tipo: 'pasaBajos', f: 700 }, vol: 0.3 * o.v, pan: o.pan }) },
    plop: (t, o) => { const f = o.f || 220; T(t, { f: [[0, f * 1.5], [0.05, f]], dur: 0.16, vol: 0.2 * o.v, pan: o.pan }); T(t, { f: [[0, 150], [0.07, 70]], dur: 0.1, vol: 0.22 * o.v, pan: o.pan }); Ru(t, { dur: 0.035, color: 'cafe', filtro: { tipo: 'pasaBajos', f: 900 }, vol: 0.3 * o.v, pan: o.pan }) },
    gota: (t, o) => T(t, { f: [[0, o.f || 900], [0.06, (o.f || 900) * 2.2]], dur: 0.09, vol: 0.12 * o.v, eco: 0.25, pan: o.pan }),
    trazo: (t, o) => { const d = o.dur || 0.4, r = azar('trazo' + t); for (let x = 0; x < d; x += 0.04 * (0.7 + r() * 0.6)) Ru(t + x, { dur: 0.05, filtro: { tipo: 'pasaBanda', f: (o.f || 3000) * (0.8 + r() * 0.4), q: 2 }, vol: 0.14 * o.v * (0.6 + r() * 0.5), ataque: 0.015, pan: o.pan }) },
    // máquinas y pantallas
    tecla: (t, o) => { const r = azar('tecla' + t); Ru(t, { dur: 0.025, filtro: { tipo: 'pasaBanda', f: 2600 + r() * 1200, q: 2 }, vol: 0.25 * o.v, ataque: 0.001, pan: o.pan }); T(t, { f: 160 + r() * 40, dur: 0.04, vol: 0.12 * o.v, pan: o.pan }) },
    tecleo: (t, o) => { const r = azar('tecleo' + t); for (let i = 0; i < (o.n || 8); i++) S.tecla(t + i * (o.ritmo || 0.09) * (0.75 + r() * 0.5), { v: o.v * (0.7 + r() * 0.4), pan: o.pan }) },
    neon: (t, o) => { const d = o.dur || 0.25, r = azar('neon' + t); for (let x = 0; x < d; x += 0.035 + r() * 0.04) T(t + x, { f: 120, forma: 'sierra', dur: 0.03, vol: 0.3 * o.v * (0.5 + r() * 0.5), filtro: { tipo: 'pasaBanda', f: 1200, q: 1.2 }, pan: o.pan }) },
    zumbido: (t, o) => { const d = o.dur || 0.3; T(t, { f: o.f || 110, forma: 'sierra', dur: d, vol: 0.1 * o.v, sostener: d * 0.7, filtro: { tipo: 'pasaBajos', f: 900 }, pan: o.pan }); T(t, { f: (o.f || 110) * 1.01, forma: 'sierra', dur: d, vol: 0.08 * o.v, sostener: d * 0.7, filtro: { tipo: 'pasaBajos', f: 900 }, pan: o.pan }) },
  }
  M.sonidos = Object.keys(S)
  M.toca = (nombre, t, o = {}) => {
    const fn = S[nombre]
    if (!fn) throw new Error(`sonido desconocido: ${nombre} (hay: ${M.sonidos.join(', ')})`)
    const oo = { ...o, v: o.vol ?? 1 }
    if (o.menor) M.menor(() => fn(t, oo))
    else fn(t, oo)
  }

  /** Fondos continuos (se omiten con voz): 'cuarto', 'siseo', 'zumbido', 'lluvia', 'viento'. */
  M.fondo = (nombre, t0, t1, o = {}) => {
    if (conVoz) return
    const v = o.vol ?? 1, d = t1 - t0, at = Math.min(0.5, d / 4), largo = (p) => ({ dur: d, ataque: at, sostener: d - at * 2, ...p })
    if (nombre === 'cuarto') Ru(t0, largo({ color: 'cafe', filtro: { tipo: 'pasaBajos', f: 320 }, vol: 0.12 * v }))
    else if (nombre === 'siseo') Ru(t0, largo({ color: 'rosa', filtro: { tipo: 'pasaAltos', f: 5000 }, vol: 0.03 * v }))
    else if (nombre === 'zumbido') { T(t0, largo({ f: 60, vol: 0.05 * v })); T(t0, largo({ f: 120, vol: 0.025 * v })) }
    else if (nombre === 'viento') Ru(t0, largo({ color: 'rosa', filtro: { tipo: 'pasaBanda', f: [[0, 400], [d / 2, 900], [d, 500]], q: 0.6 }, vol: 0.1 * v }))
    else if (nombre === 'lluvia') { Ru(t0, largo({ color: 'rosa', filtro: { tipo: 'pasaBanda', f: 2500, q: 0.4 }, vol: 0.09 * v })); const r = azar('lluvia'); for (let x = 0; x < d; x += 0.04 + r() * 0.08) Ru(t0 + x, { dur: 0.01, filtro: { tipo: 'pasaAltos', f: 4000 }, vol: 0.04 * v * r(), pan: r() * 1.6 - 0.8 }) }
    else throw new Error('fondo desconocido: ' + nombre)
  }
  /** Música de fondo suave (se omite con voz). nombre: 'colchon' (acordes) o 'pulso' (con ritmo). o: bpm, acordes, vol. */
  M.musica = (nombre, t0, t1, o = {}) => {
    if (conVoz) return
    const v = o.vol ?? 1, pulso = 60 / (o.bpm || 90), compas = pulso * 4
    const acordes = o.acordes || [['C4', 'E4', 'G4', 'B4'], ['A3', 'C4', 'E4', 'G4'], ['F3', 'A3', 'C4', 'E4'], ['G3', 'B3', 'D4', 'F4']]
    let i = 0
    for (let t = t0; t < t1 - 0.05; t += compas, i++) {
      const ac = acordes[i % acordes.length], largo = Math.min(compas, t1 - t)
      ac.forEach((nota, k) => {
        T(t, { f: nota, forma: 'triangulo', dur: largo + 0.4, vol: 0.035 * v, ataque: 0.3, sostener: largo - 0.3, filtro: { tipo: 'pasaBajos', f: 1300 }, pan: (k - 1.5) * 0.25, eco: 0.3 })
        T(t, { f: nota, dur: largo + 0.4, vol: 0.03 * v, ataque: 0.35, sostener: largo - 0.35, desafina: 6 })
      })
      if (nombre === 'pulso') for (let b = 0; b < 4 && t + b * pulso < t1 - 0.05; b++) {
        T(t + b * pulso, { f: [[0, 110], [0.1, 48]], dur: 0.18, vol: (b % 2 ? 0.15 : 0.24) * v })
        Ru(t + b * pulso + pulso / 2, { dur: 0.04, filtro: { tipo: 'pasaAltos', f: 7000 }, vol: 0.05 * v })
      }
    }
  }

  /** La mezcla final: eco de sala, un limitador suave y un WAV estéreo de 16 bits a 48 kHz. */
  M.muestras = () => {
    const out = [Float32Array.from(L), Float32Array.from(R)]
    // eco: peines con realimentación y pasatodos (una sala chica y cálida), distinto en cada canal
    const sala = (entrada, retardos, difusos) => {
      const y = new Float32Array(n)
      for (const d of retardos) {
        const buf = new Float32Array(d)
        let j = 0, lp = 0
        for (let i = 0; i < n; i++) { const s = buf[j]; lp = s * 0.6 + lp * 0.4; buf[j] = entrada[i] + lp * 0.78; y[i] += s * 0.25; j = (j + 1) % d }
      }
      for (const d of difusos) {
        const buf = new Float32Array(d)
        let j = 0
        for (let i = 0; i < n; i++) { const s = buf[j], x = y[i]; buf[j] = x + s * 0.5; y[i] = s - x * 0.5; j = (j + 1) % d }
      }
      return y
    }
    const eL = sala(EL, [1557, 1617, 1491, 1422], [225, 556]), eR = sala(ER, [1580, 1640, 1514, 1445], [248, 579])
    for (let i = 0; i < n; i++) { out[0][i] += eL[i] * 0.5; out[1][i] += eR[i] * 0.5 }
    let pico = 1e-9
    for (const c of out) for (let i = 0; i < n; i++) { const x = c[i]; c[i] = Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((Math.abs(x) - 0.6) / 0.4)); pico = Math.max(pico, Math.abs(c[i])) }
    const k = 0.89 / pico
    for (const c of out) for (let i = 0; i < n; i++) c[i] *= k
    return out
  }
  M.aWav = () => {
    const [a, b] = M.muestras(), bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer)
    const txt = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i) }
    txt(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); txt(8, 'WAVE'); txt(12, 'fmt ')
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true)
    txt(36, 'data'); dv.setUint32(40, n * 4, true)
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, a[i])) * 32767), true); dv.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, b[i])) * 32767), true) }
    return bytes
  }
  return M
}
