import { PICOS_POR_SEGUNDO } from './onda'

/**
 * Sincroniza tomas de la misma escena por su sonido (como «Crear secuencia multicámara» de Premiere, sincronizada por
 * audio): busca cuánto hay que correr una toma para que su sonido coincida con el de la principal.
 */

/** Resta la media y normaliza: lo que importa es la forma del sonido, no lo fuerte que grabó cada cámara. */
function preparar(picos: number[], cada: number): Float64Array {
  const n = Math.floor(picos.length / cada)
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let m = 0
    for (let j = 0; j < cada; j++) m = Math.max(m, picos[i * cada + j])
    x[i] = Math.sqrt(m)
  }
  let media = 0
  for (const v of x) media += v
  media /= n || 1
  let norma = 0
  for (let i = 0; i < n; i++) {
    x[i] -= media
    norma += x[i] * x[i]
  }
  norma = Math.sqrt(norma) || 1
  for (let i = 0; i < n; i++) x[i] /= norma
  return x
}

function correlacion(a: Float64Array, b: Float64Array, lag: number): number {
  let s = 0
  const desde = Math.max(0, -lag)
  const hasta = Math.min(a.length, b.length - lag)
  for (let i = desde; i < hasta; i++) s += a[i] * b[i + lag]
  return s
}

/**
 * El desfase (segundos) de la toma `b` respecto de `a`: el sonido que en `a` está en t, en `b` está en t + desfase.
 * `confianza`, de 0 a 1: cuánto se parecen los sonidos así alineados (por debajo de 0.3, probablemente no es la misma escena).
 */
export function desfasePorSonido(a: number[], b: number[], maximo = 120): { desfase: number; confianza: number } {
  // Primero a 10 picos por segundo (rápido), luego se afina a 50 alrededor del mejor.
  const cada = PICOS_POR_SEGUNDO / 10
  const A = preparar(a, cada)
  const B = preparar(b, cada)
  const lim = Math.min(maximo * 10, Math.max(A.length, B.length))
  let mejor = 0
  let mejorValor = -Infinity
  for (let lag = -lim; lag <= lim; lag++) {
    const v = correlacion(A, B, lag)
    if (v > mejorValor) {
      mejorValor = v
      mejor = lag
    }
  }
  const A2 = preparar(a, 1)
  const B2 = preparar(b, 1)
  let fino = mejor * cada
  let finoValor = -Infinity
  for (let lag = mejor * cada - cada; lag <= mejor * cada + cada; lag++) {
    const v = correlacion(A2, B2, lag)
    if (v > finoValor) {
      finoValor = v
      fino = lag
    }
  }
  return { desfase: Math.round((fino / PICOS_POR_SEGUNDO) * 1000) / 1000, confianza: Math.max(0, Math.min(1, finoValor)) }
}
