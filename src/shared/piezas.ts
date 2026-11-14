/**
 * Las piezas animadas: diseño en movimiento (HyperFrames) que entra al editor como capa. La ficha dice qué se puede
 * cambiar; los valores «marca» y «marca2» toman los colores de la marca del proyecto y una imagen «marca», su logo.
 */

export type TipoValorPieza = 'texto' | 'color' | 'imagen' | 'numero' | 'si' | 'opcion'

export interface VariablePieza {
  id: string
  tipo: TipoValorPieza
  nombre: string
  /** Lo que trae si no se cambia. En colores, «marca» o «marca2»; en imágenes, «marca» (el logo) o vacío. */
  defecto: string | number | boolean
  /** Solo en «opcion»: las que se pueden elegir. */
  opciones?: { valor: string; nombre: string }[]
}

export interface PiezaAnimada {
  id: string
  nombre: string
  /** Para qué sirve, en una frase. */
  para: string
  categoria: string
  duracion: { defecto: number; min: number; max: number }
  /** Dónde va como capa (fracción del cuadro): la mayoría ocupa todo el cuadro. */
  capa: { x: number; y: number; ancho: number }
  vars: VariablePieza[]
  /** Ruta de un video de muestra (para verla antes de ponerla). */
  muestra?: string
  /** La creó el usuario con su agente (está en «Mis animaciones»). */
  propia?: boolean
  /** Lo que se le pidió al agente (para pedirle cambios después). */
  pedido?: string
  /** Es un estilo de subtítulos: dibuja las frases de `v.frases` (las de los textos de subtítulo) en toda la capa. */
  subtitulos?: boolean
}

export type ValoresPieza = Record<string, string | number | boolean>

/** Los valores con los de la marca resueltos (los colores «marca»/«marca2» y el logo). */
export function valoresConMarca(pieza: PiezaAnimada, valores: ValoresPieza, marca: { primary: string; secondary: string; logo?: string }): ValoresPieza {
  const salida: ValoresPieza = {}
  for (const x of pieza.vars) {
    let v = valores[x.id] ?? x.defecto
    if (x.tipo === 'color') v = v === 'marca' ? marca.primary : v === 'marca2' ? marca.secondary : v
    if (x.tipo === 'imagen' && v === 'marca') v = marca.logo ?? ''
    if (x.tipo === 'si') v = v === true || v === 'true'
    if (x.tipo === 'numero') v = Number(v) || 0
    salida[x.id] = v
  }
  return salida
}
