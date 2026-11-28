import { FUENTES_TEXTO, type Timeline } from '../../../shared/timeline'
import { Icon } from '../Icons'
import { Desplegable, ListaLetras, SelectorColor } from './PortadaHerramientas'

/** Los colores que ya se usan en el proyecto (letras, cajas, bordes, sombras, brillos), para tenerlos a mano. */
export function coloresDelProyecto(tl: Timeline, cuantos = 7): string[] {
  const vistos: string[] = []
  for (const t of tl.textos ?? []) {
    for (const c of [t.color, t.caja, t.colorContorno, t.colorSombra, t.colorBrillo, t.colorClave, t.pintado]) {
      const x = typeof c === 'string' ? c.toLowerCase() : null
      if (x && /^#[0-9a-f]{6}$/.test(x) && !vistos.includes(x)) vistos.push(x)
      if (vistos.length >= cuantos) return vistos
    }
  }
  return vistos
}

/** Un botón con la muestra de un color que abre el selector de color de Recorte (gotero, del proyecto, paleta). */
export function ColorBoton({ valor, onCambio, titulo, colores }: { valor: string; onCambio: (c: string) => void; titulo: string; colores: string[] }) {
  return (
    <Desplegable titulo={titulo} ancho={252} className="ct-color" boton={<span className="ct-muestra" style={{ background: valor }} />}>
      {() => <SelectorColor valor={valor} onCambio={onCambio} deFoto={colores} tituloFoto="Del proyecto" />}
    </Desplegable>
  )
}

/** Un botón con el nombre de la letra (escrito con ella) que abre la lista de letras de Recorte. */
export function LetraBoton({ valor, onCambio, propias }: { valor: string; onCambio: (letra: string) => void; propias: { id: string; nombre: string }[] }) {
  const f = FUENTES_TEXTO[valor]
  const propia = !f ? propias.find((l) => l.id === valor) : undefined
  const familia = f ? f.familia : propia ? `Recorte ${propia.id}` : 'Arial'
  return (
    <Desplegable
      titulo="Letra"
      ancho={264}
      className="ct-letra"
      boton={
        <>
          <span style={{ fontFamily: `"${familia}", Arial`, fontWeight: f?.negrita ? 700 : 400, fontStyle: f?.cursiva ? 'italic' : 'normal' }}>{f?.nombre ?? propia?.nombre ?? 'Normal'}</span>
          <Icon name="chevron" size={12} />
        </>
      }
    >
      {(cerrar) => (
        <ListaLetras
          valor={valor}
          propias={propias.map((l) => ({ id: l.id, nombre: `${l.nombre} (del proyecto)`, familia: `Recorte ${l.id}` }))}
          onCambio={(l) => {
            onCambio(l)
            cerrar()
          }}
        />
      )}
    </Desplegable>
  )
}
