export type ChipAction =
  | { kind: 'learn'; topic: string }
  | { kind: 'resume'; id: string }
  | { kind: 'review'; conceptIds: string[] }
  | { kind: 'practice'; conceptIds: string[]; exam?: true }

export type Chip = { label: string; reason: string; action: ChipAction }

export type Suggestions = { learn: Chip[]; review: Chip[]; practice: Chip[] }
