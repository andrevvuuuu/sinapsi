import type { ExerciseType } from '../../../shared/memory-types'

export const TYPE_LABEL: Record<ExerciseType, string> = {
  open: 'Risposta aperta',
  mc: 'Scelta multipla',
  truefalse: 'Vero o falso, e perché',
  order: 'Riordina i passi',
  fill: 'Completa il passaggio',
  match: 'Abbina',
  counterexample: 'Scegli il controesempio',
  estimate: 'Stima',
  spoterror: "Trova l'errore",
  graph: 'Sul grafico'
}
export const MODE: Record<ExerciseType, string> = {
  open: 'Richiamo',
  mc: 'Distinzione',
  truefalse: 'Distinzione',
  order: 'Composizione',
  fill: 'Richiamo',
  match: 'Distinzione',
  counterexample: 'Distinzione',
  estimate: 'Composizione',
  spoterror: 'Composizione',
  graph: 'Sul grafico'
}
