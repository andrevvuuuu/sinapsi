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
  let resolveChain = Promise.resolve()
  return {
    append: (line) => appendJsonl(file, line),
    read,
    active,
    activeFor: async (conceptIds) => {
      const ids = new Set(conceptIds)
      return (await active()).filter((line) => line.conceptId !== undefined && ids.has(line.conceptId))
    },
    resolveByEvidence: (conceptId, at, ref) => {
      const next = resolveChain.then(async () => {
        const all = await read()
        const latest = new Map<string, WeaknessLine>()
        for (const line of all) latest.set(line.id, line)
        const candidates = [...latest.values()].filter(
          (line) => line.conceptId === conceptId && line.status === 'active'
        )
        const resolvedIds = new Set(all.filter((l) => l.status === 'resolved').map((l) => l.id))
        for (const line of candidates) {
          if (ref !== undefined && all.some((l) => l.status === 'resolved' && l.id === line.id && l.ref === ref)) {
            continue
          }
          if (resolvedIds.has(line.id)) {
            continue
          }
          resolvedIds.add(line.id)
          await appendJsonl(file, { ...line, status: 'resolved', at, ...(ref === undefined ? {} : { ref }) })
        }
      })
      resolveChain = next.catch(() => undefined)
      return next
    }
  }
}
