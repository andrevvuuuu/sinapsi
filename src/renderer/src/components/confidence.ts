export type ConfKey = '12' | '37' | '63' | '88'

export const CONFIDENCE_OPTIONS: readonly { value: ConfKey; label: string }[] = [
  { value: '12', label: 'Tiro a indovinare' },
  { value: '37', label: 'Incerto' },
  { value: '63', label: 'Abbastanza sicuro' },
  { value: '88', label: 'Sicuro' }
]
