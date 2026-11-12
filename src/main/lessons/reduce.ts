import type { DigestStep, LessonEntry, LessonEvent } from '../../shared/lesson-types'
export function reduceLessons(events: LessonEvent[]): LessonEntry[] {
  const map = new Map<string, LessonEntry>(),
    archived = new Set<string>()
  for (const e of events) {
    if (e.t === 'lesson-created') map.set(e.entry.id, e.entry)
    else if (e.t === 'lesson-archived') archived.add(e.id)
    else {
      const x = map.get(e.id)
      if (!x) continue
      if (e.t === 'lesson-updated') map.set(e.id, { ...x, ...e.patch })
      if (e.t === 'digest-done') map.set(e.id, { ...x, digest: { ...x.digest, [e.step]: e.at } })
      if (e.t === 'mastery-changed') map.set(e.id, { ...x, masteryLevel: e.level })
      if (e.t === 'confusion-added')
        map.set(e.id, {
          ...x,
          confusionQuestions: [...x.confusionQuestions, { id: e.qid, text: e.text, status: 'open' }]
        })
      if (e.t === 'confusion-resolved')
        map.set(e.id, {
          ...x,
          confusionQuestions: x.confusionQuestions.map((q) =>
            q.id === e.qid ? { ...q, status: 'resolved', resolvedAt: e.at } : q
          )
        })
    }
  }
  return [...map.values()].filter((x) => !archived.has(x.id))
}
export function pendingDigest(entry: LessonEntry, now: number): DigestStep | null {
  const d = entry.digest
  if (!d.digest) return 'digest'
  if (!d.recall24h && now - Date.parse(d.digest) >= 24 * 3600_000) return 'recall24h'
  if (d.recall24h && !d.weekly && now - Date.parse(d.recall24h) >= 7 * 24 * 3600_000)
    return 'weekly'
  return null
}
