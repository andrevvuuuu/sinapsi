import type { Source } from '../../../shared/notebook-types'

export const KIND: Record<Source['kind'], string> = { pdf: 'PDF', slides: 'Slide', audio: 'Audio', youtube: 'YouTube', text: 'Testo', vault: 'Vault' }

export function statusText(s: Source): string {
  if (s.status === 'queued') return 'In coda'
  if (s.status === 'failed') return s.error ?? 'Non riuscita'
  if (s.status === 'ready') return s.info ?? 'Pronta'
  const verb = s.stage === 'download' ? 'Scarico il modello di trascrizione (solo la prima volta)…' : s.kind === 'audio' ? 'Trascrivo…' : s.kind === 'youtube' ? 'Leggo il video…' : 'Leggo…'
  return s.progress !== undefined ? `${verb} ${s.progress}%` : verb
}
