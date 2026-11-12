import type { LessonEntry } from '../../shared/lesson-types'
import type { Memory } from '../../shared/memory-types'
import type { Material } from '../../shared/practice-types'
import { PRACTICE_MAX_CONCEPTS } from '../../shared/practice-types'
import { pendingDigest } from './reduce'
export type LaunchResult =
  | { kind: 'practice'; material: Material }
  | { kind: 'review'; conceptIds: string[] }
  | { kind: 'disabled'; reason: string }
export function resolveLessonLaunch(
  entry: LessonEntry,
  memories: Record<string, Memory>,
  now: number,
  mode?: 'practice' | 'review',
  sourceText = ''
): LaunchResult {
  const ids = [...new Set(entry.conceptIds)]
  const weakFirst = [...ids].sort((a, b) => (memories[a]?.R ?? -1) - (memories[b]?.R ?? -1))
  const practice = (): LaunchResult =>
    !ids.length && !entry.sourceNote
      ? { kind: 'disabled', reason: 'Collega almeno un concetto o una nota' }
      : {
          kind: 'practice',
          material: {
            conceptIds: weakFirst.slice(0, PRACTICE_MAX_CONCEPTS),
            sourceIds: [],
            free: sourceText.slice(0, 20000),
            lessonId: entry.id
          }
        }
  if (mode === 'practice') return practice()
  const due = ids.filter(
    (id) =>
      memories[id]?.due !== null && memories[id]?.due !== undefined && memories[id].due! <= now
  )
  if (mode === 'review')
    return ids.length
      ? { kind: 'review', conceptIds: ids }
      : { kind: 'disabled', reason: 'Nessun concetto della lezione è disponibile per il ripasso' }
  if (pendingDigest(entry, now)) return practice()
  if (due.length) return { kind: 'review', conceptIds: due }
  return practice()
}
