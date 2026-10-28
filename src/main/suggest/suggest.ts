import type { GraphData } from '../../shared/graph-types'
import type { Memory } from '../../shared/memory-types'
import type { VaultIndex, VaultNote } from '../../shared/vault-types'
import type { NoteMeta } from '../notes/store'
import type { SessionSummary } from '../session/events'

export type ChipAction =
  | { kind: 'learn'; topic: string }
  | { kind: 'resume'; id: string }
  | { kind: 'review'; conceptIds: string[] }
  | { kind: 'practice'; conceptIds: string[]; exam?: true }
export type Chip = { label: string; reason: string; action: ChipAction }
export type Suggestions = { learn: Chip[]; review: Chip[]; practice: Chip[] }

export type SuggestInput = {
  index: VaultIndex | null
  notes: Pick<NoteMeta, 'sourcePath' | 'status'>[]
  sessions: SessionSummary[]
  practiced: Set<string>
  memory: Record<string, Memory>
  graph: GraphData
  now: number
}

const MAX = 3
const RESUME_DAYS = 30
const pct = (r: number): string => `${Math.round(r * 100)}%`
export const isMoc = (n: Pick<VaultNote, 'title' | 'type'>): boolean => /\bMOC$/i.test(n.title) || /moc/i.test(n.type ?? '')
const courseName = (moc: VaultNote): string => moc.title.replace(/\s*MOC$/i, '').trim() || moc.title

/**
 * What to do next, with the reason, from the structure of the vault alone (no AI):
 * a MOC lists its notes in course order, a link means "this note builds on that one".
 */
export function suggest(input: SuggestInput): Suggestions {
  const all = input.index?.notes ?? []
  const byPath = new Map(all.map((n) => [n.path, n]))
  const studied = new Set(input.notes.filter((m) => m.status === 'ready').map((m) => m.sourcePath))
  for (const s of input.sessions) if (s.phase === 'done' && s.notePath) studied.add(s.notePath)
  return { learn: learn(input, all, byPath, studied), review: review(input), practice: practice(input, byPath, studied) }
}

function learn(input: SuggestInput, all: VaultNote[], byPath: Map<string, VaultNote>, studied: Set<string>): Chip[] {
  const out: Chip[] = []
  const taken = new Set<string>()
  const push = (c: Chip, path?: string): void => {
    if (out.length >= MAX || (path && taken.has(path))) return
    if (path) taken.add(path)
    out.push(c)
  }
  // Notes it links to (existing, not MOCs): what it builds on.
  const deps = (n: VaultNote): VaultNote[] => [...new Set(n.links.filter((l) => l.resolved && l.path).map((l) => l.path!))].map((p) => byPath.get(p)).filter((x): x is VaultNote => !!x && !isMoc(x) && x.path !== n.path)
  const open = (n: VaultNote): boolean => !studied.has(n.path) && !taken.has(n.path)
  // The deepest unstudied note under n, so the first step is one he can take now.
  const firstStep = (n: VaultNote): { note: VaultNote; for?: VaultNote } => {
    const seen = new Set([n.path])
    let cur = n
    let dependent: VaultNote | undefined
    for (let depth = 0; depth < 4; depth++) {
      const next = deps(cur).find((d) => open(d) && !seen.has(d.path))
      if (!next) break
      seen.add(next.path)
      dependent = cur
      cur = next
    }
    return { note: cur, for: dependent }
  }

  const resume = input.sessions
    .filter((s) => s.phase !== 'done' && input.now - s.updatedAt <= RESUME_DAYS * 86_400_000 && !(s.notePath && studied.has(s.notePath)))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  if (resume) push({ label: resume.topic, reason: 'sessione da finire', action: { kind: 'resume', id: resume.id } }, resume.notePath ?? `session:${resume.id}`)

  const courses = all
    .filter(isMoc)
    .map((moc) => ({ moc, order: deps(moc) }))
    .filter((c) => c.order.length > 0)
  const started = courses.filter((c) => c.order.some((n) => studied.has(n.path))).sort((a, b) => count(b.order, studied) - count(a.order, studied))
  for (const c of started) {
    const next = c.order.find(open)
    if (!next) continue
    const step = firstStep(next)
    push(
      { label: step.note.title, reason: step.for ? `serve per capire «${step.for.title}»` : `prossimo passo in ${courseName(c.moc)}`, action: { kind: 'learn', topic: step.note.title } },
      step.note.path
    )
  }

  // A note many unstudied notes build on: understanding it unlocks them.
  const unlocks = new Map<string, number>()
  for (const n of all) if (!isMoc(n) && !studied.has(n.path)) for (const d of deps(n)) unlocks.set(d.path, (unlocks.get(d.path) ?? 0) + 1)
  const bases = [...unlocks]
    .filter(([p, k]) => k >= 2 && !studied.has(p))
    .sort((a, b) => b[1] - a[1])
    .map(([p, k]) => ({ note: byPath.get(p)!, k }))
  for (const b of bases.slice(0, 1)) push({ label: b.note.title, reason: `base di ${b.k} note`, action: { kind: 'learn', topic: b.note.title } }, b.note.path)

  for (const c of courses.filter((c) => !started.includes(c))) {
    const first = c.order.find(open)
    if (!first) continue
    const step = firstStep(first)
    push(
      { label: step.note.title, reason: step.for ? `serve per capire «${step.for.title}»` : `primo passo di ${courseName(c.moc)}`, action: { kind: 'learn', topic: step.note.title } },
      step.note.path
    )
  }
  return out
}

const count = (notes: VaultNote[], studied: Set<string>): number => notes.filter((n) => studied.has(n.path)).length

function review(input: SuggestInput): Chip[] {
  const out: Chip[] = []
  const taken = new Set<string>()
  const name = new Map(input.graph.concepts.map((c) => [c.id, c.name]))
  const mem = Object.values(input.memory).filter((m) => name.has(m.conceptId))
  const due = mem.filter((m) => m.due !== null && m.due <= input.now).map((m) => m.conceptId)
  if (due.length) {
    out.push({ label: 'Ripasso del giorno', reason: `${due.length} ${due.length === 1 ? 'concetto' : 'concetti'} in scadenza`, action: { kind: 'review', conceptIds: due } })
    due.forEach((id) => taken.add(id))
  }
  // A weak premise drags down everything proved from it.
  const supports = new Map<string, Set<string>>()
  for (const ch of input.graph.chains) for (const p of ch.premises) supports.set(p, (supports.get(p) ?? new Set()).add(ch.conclusion))
  const fragile = mem
    .filter((m) => m.R !== null && m.R < 0.6 && (supports.get(m.conceptId)?.size ?? 0) >= 2 && !taken.has(m.conceptId))
    .sort((a, b) => supports.get(b.conceptId)!.size - supports.get(a.conceptId)!.size || a.R! - b.R!)[0]
  if (fragile) {
    out.push({ label: name.get(fragile.conceptId)!, reason: `base di ${supports.get(fragile.conceptId)!.size} concetti · ${pct(fragile.R!)}`, action: { kind: 'review', conceptIds: [fragile.conceptId] } })
    taken.add(fragile.conceptId)
  }
  const wrong = mem.filter((m) => m.misconception && !taken.has(m.conceptId)).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0]
  if (wrong) out.push({ label: name.get(wrong.conceptId)!, reason: 'sbagliato con sicurezza', action: { kind: 'review', conceptIds: [wrong.conceptId] } })
  return out.slice(0, MAX)
}

function practice(input: SuggestInput, byPath: Map<string, VaultNote>, studied: Set<string>): Chip[] {
  const out: Chip[] = []
  const born = new Map<string, string[]>()
  for (const c of input.graph.concepts) born.set(c.birth, [...(born.get(c.birth) ?? []), c.id])
  const done = [...studied].filter((p) => byPath.has(p) && born.has(p))
  const never = done.find((p) => born.get(p)!.every((id) => !input.practiced.has(id)))
  if (never) out.push({ label: byPath.get(never)!.title, reason: 'studiata, mai messa in pratica', action: { kind: 'practice', conceptIds: born.get(never)! } })
  // Several studied notes of one subject: time to try it as an exam.
  const bySubject = new Map<string, string[]>()
  for (const p of done) {
    const s = byPath.get(p)!.subject
    if (s) bySubject.set(s, [...(bySubject.get(s) ?? []), p])
  }
  const exam = [...bySubject].filter(([, ps]) => ps.length >= 3).sort((a, b) => b[1].length - a[1].length)[0]
  if (exam) out.push({ label: `Simulazione d’esame · ${exam[0]}`, reason: `${exam[1].length} note studiate`, action: { kind: 'practice', conceptIds: exam[1].flatMap((p) => born.get(p)!), exam: true } })
  const name = new Map(input.graph.concepts.map((c) => [c.id, c.name]))
  const half = Object.values(input.memory)
    .filter((m) => name.has(m.conceptId) && m.R !== null && m.R >= 0.5 && m.R < 0.8)
    .sort((a, b) => a.R! - b.R!)[0]
  if (half) out.push({ label: name.get(half.conceptId)!, reason: `a metà · ${pct(half.R!)}`, action: { kind: 'practice', conceptIds: [half.conceptId] } })
  return out.slice(0, MAX)
}
