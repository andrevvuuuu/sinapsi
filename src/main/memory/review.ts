import { mkdir } from 'node:fs/promises'
import type { Bridge } from '../ai/bridge'
import type { Exercise } from '../../shared/exercise-schema'
import type { Concept, GraphData } from '../../shared/graph-types'
import { proposeGrade, type ExerciseType, type Grade, type Memory, type ReviewLine } from '../../shared/memory-types'
import type { VaultIndex } from '../../shared/vault-types'
import { PACER_EXERCISE_TYPES, type PacerType } from '../../shared/lesson-types'
import { memoryOf, previewIntervals } from './fsrs'
import { buildExplainPrompt, explainReplySchema, MAX_QUESTIONS, questionsAsked, type ExplainReply, type ExplainTurn } from './explain'
import { buildGradePrompt, GradeSchema } from './grade-prompt'
import type { MemoryStore } from './store'
import { buildVariantsPrompt, fallbackExercise, variantsReplySchema, type VariantsStore } from './variants'

export type ReviewItem = {
  conceptId: string
  name: string
  notePath: string
  noteTitle: string
  subject: string | null
  R: number | null
  exercise: Exercise
  variantId: string | null
}
export type ReviewPlan = { items: ReviewItem[]; due: number }
export type GradeResult = { verdict: 'ok' | 'partial' | 'wrong'; feedback: string; proposed: Grade }
/** A "Spiegalo tu" turn: the picky student asks for the missing step, or gives the verdict. */
export type ExplainResult = { kind: 'question'; question: string } | ({ kind: 'verdict' } & GradeResult)
export type ReviewService = {
  plan(opts?: { conceptIds?: string[]; weakest?: boolean; misconceptions?: boolean }): Promise<ReviewPlan>
  prepare(notePath: string): Promise<void>
  grade(req: { conceptId: string; exercise: Exercise; answer: string; confidence: number }): Promise<GradeResult>
  explain(req: { conceptId: string; exercise: Exercise; turns: ExplainTurn[]; confidence: number }): Promise<ExplainResult>
  record(r: ReviewLine): Promise<{ memory: Memory; intervals: Record<Grade, string> }>
  memory(): Promise<Record<string, Memory>>
  intervals(conceptId: string): Promise<Record<Grade, string>>
}

export const NEW_PER_SESSION = 5
export const EXPLAIN_SHARE = 4
const VARIANTS_TIMEOUT = 300_000
const GRADE_TIMEOUT = 120_000

/** Next item from a different note than the previous one, when there is one: subjects get mixed. */
function interleave<T extends { notePath: string }>(xs: T[]): T[] {
  const rest = [...xs]
  const out: T[] = []
  while (rest.length) {
    const prev = out.at(-1)?.notePath
    const i = Math.max(0, rest.findIndex((x) => x.notePath !== prev))
    out.push(rest.splice(i, 1)[0])
  }
  return out
}

export function createReviewService(deps: {
  bridge: Pick<Bridge, 'ask'>
  memory: MemoryStore
  variants: VariantsStore
  graph: () => Promise<GraphData>
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  settings: () => Promise<{ reviewSessionSize: number; exerciseTypes: ExerciseType[] }>
  pacerOf?: () => Promise<Map<string, PacerType>>
  now?: () => number
  workDir: string
}): ReviewService {
  const now = deps.now ?? Date.now
  // One generation per concept and type set per app run: a second plan waits for the one in flight
  // instead of starting another (or falling back), and a failure never loops on quota.
  const attempted = new Map<string, Promise<void>>()

  // Plans run their variant check one after the other: the second sees what the first generated.
  let gate: Promise<unknown> = Promise.resolve()
  function ensureVariants(concepts: Concept[], allowed: Set<ExerciseType>, index: VaultIndex | null): Promise<void> {
    const run = gate.then(async () => generateMissing(concepts, allowed, index, (await deps.pacerOf?.()) ?? new Map()))
    gate = run.catch(() => undefined)
    return run
  }

  async function generateMissing(concepts: Concept[], allowed: Set<ExerciseType>, index: VaultIndex | null, pacers: Map<string, PacerType>): Promise<void> {
    const [have, checked] = await Promise.all([deps.variants.read(), allowed.has('explain') ? deps.variants.explainChecked() : new Set<string>()])
    const typesKey = [...allowed].sort().join(',')
    const general: ExerciseType[] = [...allowed].filter((t) => t !== 'explain')
    const waiting: Promise<void>[] = []
    // Per note and type set: a concept with nothing to ask gets every type; one that only lacks the
    // check for a "Spiegalo tu" (concepts from before it existed) gets just that.
    const byNote = new Map<string, { notePath: string; types: ExerciseType[]; concepts: Concept[] }>()
    for (const c of concepts) {
      const pending = attempted.get(`${c.id}|${typesKey}`)
      if (pending) {
        waiting.push(pending)
        continue
      }
      const mine = have.filter((v) => v.conceptId === c.id)
      const explainDue = allowed.has('explain') && !checked.has(c.id) && !mine.some((v) => v.exercise.type === 'explain')
      const types = general.length && !mine.some((v) => general.includes(v.exercise.type)) ? (explainDue ? [...allowed] : general) : explainDue ? (['explain'] as ExerciseType[]) : null
      if (!types) continue
      const key = `${c.birth}|${types.join(',')}`
      const job = byNote.get(key) ?? { notePath: c.birth, types, concepts: [] }
      job.concepts.push(c)
      byNote.set(key, job)
    }
    await mkdir(deps.workDir, { recursive: true })
    const generateNote = async ({ notePath, types, concepts: cs }: { notePath: string; types: ExerciseType[]; concepts: Concept[] }): Promise<void> => {
      try {
        const text = await deps.readNote(notePath).catch(() => '')
        const title = index?.notes.find((n) => n.path === notePath)?.title ?? notePath.split('/').pop()!.replace(/\.md$/, '')
        const r = await deps.bridge.ask({
          task: 'variants',
          prompt: buildVariantsPrompt({ noteTitle: title, noteText: text, concepts: cs, types, depth: cs.length > 0 && cs.every((c) => ['C', 'A'].includes(pacers.get(c.id) ?? '')) }),
          schema: variantsReplySchema(new Set(cs.map((c) => c.id)), now, new Set(types)),
          timeoutMs: VARIANTS_TIMEOUT,
          cwd: deps.workDir
        })
        for (const v of (r.data as { variants: Awaited<ReturnType<VariantsStore['read']>> }).variants) await deps.variants.append(v)
        if (types.includes('explain')) for (const c of cs) await deps.variants.markExplainChecked(c.id, now())
      } catch (e) {
        console.warn('[review] varianti non generate', notePath, e)
      }
    }
    // Notes in parallel, a few at a time (agy queues per engine anyway; this caps prompt reads).
    const jobs = [...byNote.values()]
    const runNext = async (): Promise<void> => {
      const job = jobs.shift()
      if (!job) return
      const p = generateNote(job)
      for (const c of job.concepts) attempted.set(`${c.id}|${typesKey}`, p)
      await p
      await runNext()
    }
    await Promise.all([...waiting, ...Array.from({ length: Math.min(3, jobs.length) }, runNext)])
  }

  return {
    /** Right after an extraction: the variants of that note's concepts, so the first Ripasso doesn't wait. */
    async prepare(notePath: string) {
      const [g, settings, index] = await Promise.all([deps.graph(), deps.settings(), deps.vault()])
      const concepts = g.concepts.filter((c) => c.birth === notePath)
      if (concepts.length) await ensureVariants(concepts, new Set(settings.exerciseTypes), index)
    },
    async plan(opts: { conceptIds?: string[]; weakest?: boolean; misconceptions?: boolean } = {}) {
      const [g, reviews, settings, index, pacers] = await Promise.all([deps.graph(), deps.memory.read(), deps.settings(), deps.vault(), deps.pacerOf?.() ?? Promise.resolve(new Map<string, PacerType>())])
      const t = now()
      const mem = memoryOf(reviews, t)
      const byId = new Map(g.concepts.map((c) => [c.id, c]))
      const R = (id: string): number => mem.get(id)?.R ?? -1
      const dueIds = g.concepts.filter((c) => (mem.get(c.id)?.due ?? Infinity) <= t).map((c) => c.id)
      let chosen: Concept[]
      if (opts.misconceptions) chosen = g.concepts.filter((c) => mem.get(c.id)?.misconception).sort((a, b) => R(a.id) - R(b.id)).slice(0, settings.reviewSessionSize)
      else if (opts.conceptIds) chosen = opts.conceptIds.map((id) => byId.get(id)).filter((c): c is Concept => !!c)
      else if (opts.weakest) {
        const reviewed = g.concepts.filter((c) => mem.has(c.id)).sort((a, b) => R(a.id) - R(b.id))
        const fresh = g.concepts.filter((c) => !mem.has(c.id)).sort((a, b) => a.depth - b.depth)
        chosen = [...reviewed, ...fresh].slice(0, settings.reviewSessionSize)
      } else {
        const due = dueIds.map((id) => byId.get(id)!).sort((a, b) => R(a.id) - R(b.id))
        const fresh = g.concepts.filter((c) => !mem.has(c.id)).sort((a, b) => a.depth - b.depth).slice(0, NEW_PER_SESSION)
        chosen = [...due, ...fresh].slice(0, settings.reviewSessionSize)
      }

      const allowed = new Set(settings.exerciseTypes.length ? settings.exerciseTypes : (['open'] as ExerciseType[]))
      const allowedFor = (c: Concept): Set<ExerciseType> => {
        const pacer = pacers.get(c.id)
        if (!pacer) return allowed
        const intersection = [...allowed].filter((t) => PACER_EXERCISE_TYPES[pacer].includes(t))
        return intersection.length ? new Set(intersection) : allowed
      }
      const groups = new Map<string, { types: Set<ExerciseType>; concepts: Concept[] }>()
      for (const c of chosen) {
        const types = allowedFor(c), key = [...types].sort().join(',')
        const group = groups.get(key) ?? { types, concepts: [] }
        group.concepts.push(c); groups.set(key, group)
      }
      await Promise.all([...groups.values()].map((group) => ensureVariants(group.concepts, group.types, index)))
      const variants = await deps.variants.read()
      const lastAsked = new Map<string, number>()
      for (const r of reviews) if (r.variantId) lastAsked.set(r.variantId, Math.max(lastAsked.get(r.variantId) ?? 0, r.at))

      // "Spiegalo tu" is long and only exists for proofs and key definitions: at most one item in four.
      const explainCap = Math.max(1, Math.floor(chosen.length / EXPLAIN_SHARE))
      let explains = 0
      const items: ReviewItem[] = chosen.map((c) => {
        const allowedHere = allowedFor(c)
        const all = variants.filter((v) => v.conceptId === c.id && allowedHere.has(v.exercise.type))
        const others = all.filter((v) => v.exercise.type !== 'explain')
        const mine = explains >= explainCap && others.length ? others : all
        const lastType = [...reviews].filter((r) => r.conceptId === c.id && r.type).sort((a, b) => b.at - a.at)[0]?.type
        // Never-asked first, then the least recently asked; a different type from last time when possible.
        const pick = [...mine].sort((a, b) => (lastAsked.get(a.id) ?? -1) - (lastAsked.get(b.id) ?? -1) || Number(a.exercise.type === lastType) - Number(b.exercise.type === lastType))[0]
        if (pick?.exercise.type === 'explain') explains++
        const note = index?.notes.find((n) => n.path === c.birth)
        return {
          conceptId: c.id,
          name: c.name,
          notePath: c.birth,
          noteTitle: note?.title ?? c.birth.split('/').pop()!.replace(/\.md$/, ''),
          subject: note?.subject ?? null,
          R: mem.get(c.id)?.R ?? null,
          exercise: pick?.exercise ?? fallbackExercise(c),
          variantId: pick?.id ?? null
        }
      })
      return { items: opts.conceptIds ? items : interleave(items), due: dueIds.length }
    },

    async grade(req) {
      try {
        const c = (await deps.graph()).concepts.find((x) => x.id === req.conceptId)
        await mkdir(deps.workDir, { recursive: true })
        const r = await deps.bridge.ask({
          task: 'grade',
          prompt: buildGradePrompt({ concept: { name: c?.name ?? '', statement: c?.statement ?? '' }, exercise: req.exercise, answer: req.answer, confidence: req.confidence }),
          schema: GradeSchema,
          timeoutMs: GRADE_TIMEOUT,
          cwd: deps.workDir
        })
        const { verdict, feedback } = r.data as { verdict: GradeResult['verdict']; feedback: string }
        return { verdict, feedback, proposed: proposeGrade({ correct: verdict === 'ok' ? true : verdict === 'partial' ? 'partial' : false, confidence: req.confidence }) }
      } catch (e) {
        console.warn('[review] correzione non riuscita', e)
        return { verdict: 'partial', feedback: 'Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento.', proposed: 2 }
      }
    },

    async explain(req) {
      try {
        if (req.exercise.type !== 'explain') throw new Error('non è uno «Spiegalo tu»')
        const c = (await deps.graph()).concepts.find((x) => x.id === req.conceptId)
        const notePath = c?.birth
        const [text, index] = await Promise.all([notePath ? deps.readNote(notePath).catch(() => '') : '', deps.vault()])
        const noteTitle = index?.notes.find((n) => n.path === notePath)?.title ?? notePath?.split('/').pop()!.replace(/\.md$/, '') ?? ''
        await mkdir(deps.workDir, { recursive: true })
        const r = await deps.bridge.ask({
          task: 'grade',
          prompt: buildExplainPrompt({ concept: { name: c?.name ?? '', statement: c?.statement ?? '' }, exercise: req.exercise, noteTitle, noteText: text, turns: req.turns, confidence: req.confidence }),
          schema: explainReplySchema(questionsAsked(req.turns) < MAX_QUESTIONS),
          timeoutMs: GRADE_TIMEOUT,
          cwd: deps.workDir
        })
        const reply = r.data as ExplainReply
        if (reply.action === 'ask') return { kind: 'question', question: reply.question }
        const { verdict, feedback } = reply
        return { kind: 'verdict', verdict, feedback, proposed: proposeGrade({ correct: verdict === 'ok' ? true : verdict === 'partial' ? 'partial' : false, confidence: req.confidence }) }
      } catch (e) {
        console.warn('[review] spiegazione non corretta', e)
        return { kind: 'verdict', verdict: 'partial', feedback: 'Non sono riuscito a correggere: confronta tu la tua spiegazione con i passaggi di riferimento.', proposed: 2 }
      }
    },

    async record(r) {
      await deps.memory.append(r)
      const reviews = (await deps.memory.read()).filter((x) => x.conceptId === r.conceptId)
      const t = now()
      return { memory: memoryOf(reviews, t).get(r.conceptId)!, intervals: previewIntervals(reviews, t) }
    },

    async memory() {
      return Object.fromEntries(memoryOf(await deps.memory.read(), now()))
    },

    async intervals(conceptId) {
      return previewIntervals((await deps.memory.read()).filter((r) => r.conceptId === conceptId), now())
    }
  }
}
