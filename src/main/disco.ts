import { renameSync, writeFileSync } from 'node:fs'

/** Escribe primero a un temporal y luego reemplaza, para no dejar un JSON a medias. */
export function guardar(ruta: string, texto: string): void {
  const temporal = `${ruta}.${process.pid}.tmp`
  writeFileSync(temporal, texto)
  renameSync(temporal, ruta)
}
