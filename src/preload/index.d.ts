import type { SinapsiApi } from '../shared/api'

declare global {
  interface Window {
    sinapsi: SinapsiApi
  }
}
