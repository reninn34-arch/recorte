/** URL de un archivo del proyecto para el reproductor. `fuente` es el video original. */
export function mediaUrl(id: string, archivo: string): string {
  return `recorte-media://${id}/${archivo.split('/').map(encodeURIComponent).join('/')}`
}
