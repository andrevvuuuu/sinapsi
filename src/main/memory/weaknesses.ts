import { join } from 'node:path'
import { WeaknessLineSchema, type WeaknessLine } from '../../shared/memory-types'
import { appendJsonl, readJsonl } from '../store/jsonl'

export type WeaknessStore = {
  append(l: WeaknessLine): Promise<void>
  read(): Promise<WeaknessLine[]>
  active(): Promise<WeaknessLine[]>
  activeFor(conceptIds: string[]): Promise<WeaknessLine[]>
  resolveByEvidence(conceptId: string, at: number, ref?: string): Promise<void>
}

/** Append-only weakness evidence in weaknesses.jsonl. */
export function weaknessStore(dir: string): WeaknessStore {
  const file = join(dir, 'weaknesses.jsonl')
  const read = (): Promise<WeaknessLine[]> => readJsonl(file, WeaknessLineSchema)
  const active = async (): Promise<WeaknessLine[]> => {
    const latest = new Map<string, WeaknessLine>()
    for (const line of await read()) latest.set(line.id, line)
    return [...latest.values()].filter((line) => line.status === 'active')
  }
  return {
    append: (line) => appendJsonl(file, line),
    read,
    active,
    activeFor: async (conceptIds) => {
      const ids = new Set(conceptIds)
      return (await active()).filter((line) => line.conceptId !== undefined && ids.has(line.conceptId))
    },
    resolveByEvidence: async (conceptId, at, ref) => {
      for (const line of await active()) {
        if (line.conceptId === conceptId) await appendJsonl(file, { ...line, status: 'resolved', at, ...(ref === undefined ? {} : { ref }) })
      }
    }
  }
}
