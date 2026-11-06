/// <reference types="vite/client" />

import type { RecorteApi } from '../../shared/api'

declare global {
  interface Window {
    recorte: RecorteApi
  }
}

export {}
