import { mkdir } from 'node:fs/promises'
import type { Bridge } from '../ai/bridge'
import type { ChainExercise, Exercise } from '../../shared/exercise-schema'
import type { Concept, GraphData } from '../../shared/graph-types'
import { retrievabilityAt } from '../../shared/retention'
import { MISCONCEPTION_CONFIDENCE, gradeFromOutcome, misconceptionConceptIds, proposeGrade, type ExerciseType, type Grade, type Memory, type Outcome, type ReviewLine, type WeaknessLine } from '../../shared/memory-types'
import type { VaultIndex } from '../../shared/vault-types'
import { PACER_EXERCISE_TYPES, type PacerType } from '../../shared/lesson-types'
import { memoryOf, previewIntervals } from './fsrs'
import { buildExplainPrompt, explainReplySchema, MAX_QUESTIONS, questionsAsked, type ExplainReply, type ExplainTurn } from './explain'
import { buildGradePrompt, GradeSchema } from './grade-prompt'
import type { MemoryStore } from './store'
import { buildVariantsPrompt, fallbackExercise, variantsReplySchema, type VariantsStore } from './variants'
import type { EngineChoice } from '../../shared/settings-schema'
import { ancestors } from '../graph/derive'
import { sectionText } from '../notes/section-text'
import { weakPrerequisites, suspectPremises, type CascadeMemory } from '../../shared/cascade'

export type ReviewItem = {
  cascadeOf?: string
  conceptId: string
  name: string
  notePath: string
  noteTitle: string
  subject: string | null
  R: number | null
  exercise: Exercise | ChainExercise
  variantId: string | null
  represented?: boolean
  representedCount?: number
}
export type ReviewPlan = {
  items: ReviewItem[]
  due: number
  toStudy: { conceptId: string; name: string; noteTitle: string }[]
}
export type GradeResult = { verdict: 'ok' | 'partial' | 'wrong'; feedback: string; proposed: Grade }
/** A "Spiegalo tu" turn: the picky student asks for the missing step, or gives the verdict. */
export type ExplainResult = { kind: 'question'; question: string } | ({ kind: 'verdict' } & GradeResult)
export function gradeChainIdeaUnits(checked: boolean[]): Grade {
  const total = checked.length
  const n = checked.filter(Boolean).length
  const outcome: Outcome = total > 0 && n === total ? 'correct' : n > 0 ? 'partial' : 'wrong'
  return gradeFromOutcome({ outcome })
}
export type ReviewService = {
  plan(opts?: { conceptIds?: string[]; weakest?: boolean; misconceptions?: boolean; examAt?: number; order?: 'due' | 'gain' }): Promise<ReviewPlan>
  prerequisites(conceptId: string, budget: number): Promise<ReviewItem[]>
  contest(req: { conceptId: string; exercise: Exercise; answer: string; confidence: number }): Promise<GradeResult>
  prepare(notePath: string): Promise<void>
  grade(req: { conceptId: string; exercise: Exercise; answer: string; confidence: number }): Promise<GradeResult>
  explain(req: { conceptId: string; exercise: Exercise; turns: ExplainTurn[]; confidence: number }): Promise<ExplainResult>
  record(r: ReviewLine | { conceptId: string; at: number; grade?: Grade | null; checked?: boolean[]; record?: boolean; type: 'chain' }): Promise<{ memory: Memory; intervals: Record<Grade, string> } | null>
  memory(): Promise<Record<string, Memory>>
  intervals(conceptId: string): Promise<Record<Grade, string>>
}

export const NEW_PER_SESSION = 5
export const EXPLAIN_SHARE = 4
/** The part of the note a concept comes from: its section when found, else the whole note. */
const conceptSection = (c: Concept | undefined, notePath: string | undefined, text: string): string => {
  const title = c && notePath ? c.sections[notePath] : undefined
  return (title && sectionText(text, [title])) || text
}

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
  /** Active weaknesses: variants aim at least one exercise at each. */
  weaknesses?: () => Promise<WeaknessLine[]>
  now?: () => number
  workDir: string
  otherEngine?: () => Promise<EngineChoice | undefined>
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
        const ids = new Set(cs.map((c) => c.id))
        const weak = ((await deps.weaknesses?.().catch(() => [])) ?? []).filter((w) => w.conceptId && ids.has(w.conceptId))
        const title = index?.notes.find((n) => n.path === notePath)?.title ?? notePath.split('/').pop()!.replace(/\.md$/, '')
        const r = await deps.bridge.ask({
          task: 'variants',
          prompt: buildVariantsPrompt({ noteTitle: title, noteText: text, concepts: cs, types, depth: cs.length > 0 && cs.every((c) => ['C', 'A'].includes(pacers.get(c.id) ?? '')), weaknesses: weak }),
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
    async plan(opts: { conceptIds?: string[]; weakest?: boolean; misconceptions?: boolean; examAt?: number; order?: 'due' | 'gain' } = {}) {
      const [g, reviews, settings, index, pacers, rawWeaknesses] = await Promise.all([
        deps.graph(),
        deps.memory.read(),
        deps.settings(),
        deps.vault(),
        deps.pacerOf?.() ?? Promise.resolve(new Map<string, PacerType>()),
        deps.weaknesses ? deps.weaknesses().catch(() => []) : Promise.resolve([])
      ])
      const t = now()
      const misconceptionIds = misconceptionConceptIds(rawWeaknesses)
      const mem = memoryOf(reviews, t, misconceptionIds)
      const byId = new Map(g.concepts.map((c) => [c.id, c]))
      const R = (id: string): number => mem.get(id)?.R ?? -1
      const dueIds = g.concepts.filter((c) => (mem.get(c.id)?.due ?? Infinity) <= t).map((c) => c.id)
      const activeWeaknessIds = new Set(
        rawWeaknesses.filter((w) => w.status === 'active' && w.conceptId).map((w) => w.conceptId!)
      )
      const retestIds = g.concepts.filter((c) => {
        const last = reviews.filter((r) => r.conceptId === c.id).sort((a, b) => b.at - a.at)[0]
        const lastWeakness = rawWeaknesses
          .filter((w) => w.conceptId === c.id && w.status === 'active')
          .sort((a, b) => b.at - a.at)[0]
        const refAt = last && lastWeakness ? Math.max(last.at, lastWeakness.at) : (last?.at ?? lastWeakness?.at ?? null)
        if (refAt === null) return false
        const age = (t - refAt) / 86_400_000
        const isHighConfError = !!last && last.correct === false && (last.confidence ?? 0) >= MISCONCEPTION_CONFIDENCE
        const hasActiveWeakness = activeWeaknessIds.has(c.id)
        return (isHighConfError || hasActiveWeakness) && age >= 1 && age <= 3
      }).map((c) => c.id)

      const reviewedIds = new Set(reviews.map((r) => r.conceptId))
      const noteTitleOf = (birth: string): string =>
        index?.notes.find((n) => n.path === birth)?.title ?? birth.split('/').pop()!.replace(/\.md$/, '')

      let candidateConcepts: Concept[]
      let toStudy: { conceptId: string; name: string; noteTitle: string }[] = []
      if (opts.misconceptions) {
        candidateConcepts = g.concepts.filter((c) => mem.get(c.id)?.misconception || misconceptionIds.has(c.id)).sort((a, b) => R(a.id) - R(b.id))
      } else if (opts.conceptIds) {
        candidateConcepts = opts.conceptIds.map((id) => byId.get(id)).filter((c): c is Concept => !!c)
      } else if (opts.weakest) {
        candidateConcepts = g.concepts.filter((c) => reviewedIds.has(c.id)).sort((a, b) => R(a.id) - R(b.id))
        toStudy = g.concepts
          .filter((c) => !reviewedIds.has(c.id))
          .sort((a, b) => a.depth - b.depth)
          .slice(0, NEW_PER_SESSION)
          .map((c) => ({ conceptId: c.id, name: c.name, noteTitle: noteTitleOf(c.birth) }))
      } else {
        const retests = retestIds.map((id) => byId.get(id)!).filter((c) => !!c && (reviewedIds.has(c.id) || activeWeaknessIds.has(c.id))).sort((a, b) => R(a.id) - R(b.id))
        const due = dueIds.map((id) => byId.get(id)!).filter((c) => reviewedIds.has(c.id)).sort((a, b) => R(a.id) - R(b.id))
        candidateConcepts = [...retests, ...due.filter((c) => !retestIds.includes(c.id))]
        toStudy = g.concepts
          .filter((c) => !reviewedIds.has(c.id))
          .sort((a, b) => a.depth - b.depth)
          .slice(0, NEW_PER_SESSION)
          .map((c) => ({ conceptId: c.id, name: c.name, noteTitle: noteTitleOf(c.birth) }))
      }

      const size = settings.reviewSessionSize
      const maxChains = Math.max(0, Math.floor(size * 0.2))

      const reaches = (from: string, target: string): boolean => {
        const seen = new Set<string>(); const stack = [from]
        while (stack.length) { const id = stack.pop()!; if (id === target) return true; if (seen.has(id)) continue; seen.add(id); for (const edge of g.chains) if (edge.premises.includes(id)) stack.push(edge.conclusion) }
        return false
      }

      const validChains = g.chains.filter((chain) => {
        if (!chain.premises.every((id) => (mem.get(id)?.reps ?? 0) > 0)) return false
        if ((mem.get(chain.conclusion)?.reps ?? 0) <= 0) return false
        if (chain.premises.some((id) => reaches(chain.conclusion, id))) return false
        const conclusion = byId.get(chain.conclusion)
        if (!conclusion) return false
        const premises = chain.premises.map((id) => byId.get(id)).filter((c): c is Concept => !!c)
        if (premises.length !== chain.premises.length) return false
        return true
      })

      let chosen: Concept[]
      let finalChains: (typeof g.chains[number])[]

      if (maxChains === 0 || candidateConcepts.length === 0) {
        chosen = candidateConcepts.slice(0, size)
        finalChains = []
      } else {
        const topConcepts = candidateConcepts.slice(0, size)
        const topSet = new Set(topConcepts.map((c) => c.id))
        const touchingChains = validChains.filter(
          (ch) => ch.premises.some((id) => topSet.has(id)) || topSet.has(ch.conclusion)
        )
        const candidateChains = touchingChains.slice(0, maxChains)
        const conceptCount = Math.max(0, size - candidateChains.length)
        chosen = candidateConcepts.slice(0, conceptCount)
        let chosenSet = new Set(chosen.map((c) => c.id))
        finalChains = candidateChains.filter(
          (ch) => ch.premises.some((id) => chosenSet.has(id)) || chosenSet.has(ch.conclusion)
        )
        if (finalChains.length < candidateChains.length) {
          chosen = candidateConcepts.slice(0, Math.max(0, size - finalChains.length))
          chosenSet = new Set(chosen.map((c) => c.id))
          finalChains = candidateChains.filter(
            (ch) => ch.premises.some((id) => chosenSet.has(id)) || chosenSet.has(ch.conclusion)
          )
        }
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
      const conceptItems: ReviewItem[] = chosen.map((c) => {
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
          noteTitle: noteTitleOf(c.birth),
          subject: note?.subject ?? null,
          R: mem.get(c.id)?.R ?? null,
          exercise: pick?.exercise ?? fallbackExercise(c),
          variantId: pick?.id ?? null
        }
      })

      const chainItems: ReviewItem[] = []
      for (const chain of finalChains) {
        const conclusion = byId.get(chain.conclusion)!
        const premises = chain.premises.map((id) => byId.get(id)!).filter((c): c is Concept => !!c)
        const note = index?.notes.find((n) => n.path === conclusion.birth)
        chainItems.push({
          conceptId: conclusion.id,
          name: conclusion.name,
          notePath: conclusion.birth,
          noteTitle: noteTitleOf(conclusion.birth),
          subject: note?.subject ?? null,
          R: mem.get(conclusion.id)?.R ?? null,
          variantId: null,
          exercise: {
            type: 'chain',
            chainId: chain.id,
            premises: premises.map(({ id, name, statement }) => ({ id, name, statement })),
            conclusion: { id: conclusion.id, name: conclusion.name, statement: conclusion.statement },
            prompt: `Perché da ${premises.map((p) => p.name).join(', ')} segue ${conclusion.name}?`,
            answer: premises.map((p) => `Uso ${p.name}: ${p.statement}`).join('\n'),
            question: `Perché da ${premises.map((p) => p.name).join(', ')} segue ${conclusion.name}?`,
            ideaUnits: premises.map((p) => `Uso ${p.name}: ${p.statement}`)
          }
        })
      }

      let items = [...conceptItems, ...chainItems]
      const examAt = opts.examAt
      if (opts.order === 'gain' && examAt !== undefined) {
        const gain = (id: string, minutes: number): number => {
          const m = mem.get(id)
          if (!m) return 0
          const before = retrievabilityAt(m, examAt) ?? 0
          const afterMemory = memoryOf([...reviews.filter((r) => r.conceptId === id), { conceptId: id, at: t, grade: 3 }], t).get(id)
          return ((afterMemory ? retrievabilityAt(afterMemory, examAt) ?? before : before) - before) / minutes
        }
        items.sort((a, b) => gain(b.conceptId, 1.5) - gain(a.conceptId, 1.5))
      } else if (!opts.conceptIds) {
        items = interleave(items)
      }
      items = items.slice(0, size)

      return {
        items,
        due: dueIds.length,
        toStudy
      }
    },

    async prerequisites(conceptId: string, budget: number): Promise<ReviewItem[]> {
      if (budget <= 0) return []
      const [g, reviews, rawWeaknesses] = await Promise.all([
        deps.graph(),
        deps.memory.read(),
        deps.weaknesses ? deps.weaknesses().catch(() => []) : Promise.resolve([])
      ])
      const t = now()
      const misconceptionIds = misconceptionConceptIds(rawWeaknesses)
      const mem = memoryOf(reviews, t, misconceptionIds)

      const parentsRecord: Record<string, string[]> = {}
      for (const c of g.chains) {
        parentsRecord[c.conclusion] = [...(parentsRecord[c.conclusion] ?? []), ...c.premises]
      }
      const depthRecord: Record<string, number> = {}
      for (const c of g.concepts) {
        depthRecord[c.id] = c.depth
      }
      const memRecord: Record<string, CascadeMemory | undefined> = {}
      for (const [id, m] of mem) {
        if (m && typeof m.R === 'number') {
          memRecord[id] = { R: m.R, stability: m.stability ?? 0, reps: m.reps }
        }
      }

      const weak = weakPrerequisites(
        { parents: parentsRecord, depth: depthRecord, memory: memRecord },
        conceptId,
        { cap: budget }
      )

      const anc = ancestors(g, conceptId)
      const suspects = suspectPremises(g, mem)
      const suspectAncestors = suspects.filter((id) => anc.has(id) && id !== conceptId)

      const seen = new Set<string>()
      const candidateIds: string[] = []
      for (const id of [...weak, ...suspectAncestors]) {
        if (id !== conceptId && !seen.has(id) && g.concepts.some((c) => c.id === id)) {
          seen.add(id)
          candidateIds.push(id)
        }
      }

      if (candidateIds.length === 0) return []

      const planned = await this.plan({ conceptIds: candidateIds })
      return planned.items
        .filter((item) => item.conceptId !== conceptId)
        .map((item) => ({ ...item, cascadeOf: conceptId }))
        .slice(0, budget)
    },

    async contest(req: { conceptId: string; exercise: Exercise; answer: string; confidence: number }): Promise<GradeResult> {
      try {
        const c = (await deps.graph()).concepts.find((x) => x.id === req.conceptId)
        await mkdir(deps.workDir, { recursive: true })
        const engine = await deps.otherEngine?.()

        if (req.exercise.type === 'explain') {
          const notePath = c?.birth
          const [text, index] = await Promise.all([notePath ? deps.readNote(notePath).catch(() => '') : '', deps.vault()])
          const noteTitle = index?.notes.find((n) => n.path === notePath)?.title ?? notePath?.split('/').pop()!.replace(/\.md$/, '') ?? ''
          const r = await deps.bridge.ask({
            task: 'grade',
            prompt: buildExplainPrompt({
              concept: { name: c?.name ?? '', statement: c?.statement ?? '' },
              exercise: req.exercise,
              noteTitle,
              noteText: conceptSection(c, notePath, text),
              turns: [
                { by: 'andrea', text: req.answer },
                { by: 'claude', text: 'Chiarimento' },
                { by: 'claude', text: 'Secondo chiarimento' }
              ],
              confidence: req.confidence
            }),
            schema: explainReplySchema(false),
            timeoutMs: GRADE_TIMEOUT,
            cwd: deps.workDir,
            ...(engine ? { engine } : {})
          })
          const reply = r.data as { action: 'grade'; verdict: GradeResult['verdict']; feedback: string }
          return {
            verdict: reply.verdict,
            feedback: reply.feedback,
            proposed: proposeGrade({
              correct: reply.verdict === 'ok' ? true : reply.verdict === 'partial' ? 'partial' : false,
              confidence: req.confidence
            })
          }
        }

        const r = await deps.bridge.ask({
          task: 'grade',
          prompt: buildGradePrompt({
            concept: { name: c?.name ?? '', statement: c?.statement ?? '' },
            exercise: req.exercise,
            answer: req.answer,
            confidence: req.confidence
          }),
          schema: GradeSchema,
          timeoutMs: GRADE_TIMEOUT,
          cwd: deps.workDir,
          ...(engine ? { engine } : {})
        })
        const { verdict, feedback } = r.data as { verdict: GradeResult['verdict']; feedback: string }
        return {
          verdict,
          feedback,
          proposed: proposeGrade({
            correct: verdict === 'ok' ? true : verdict === 'partial' ? 'partial' : false,
            confidence: req.confidence
          })
        }
      } catch (e) {
        console.warn('[review] contestazione non riuscita', e)
        return {
          verdict: 'partial',
          feedback: 'Non sono riuscito a correggere: valuta tu confrontando con la risposta di riferimento.',
          proposed: 2
        }
      }
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
          prompt: buildExplainPrompt({ concept: { name: c?.name ?? '', statement: c?.statement ?? '' }, exercise: req.exercise, noteTitle, noteText: conceptSection(c, notePath, text), turns: req.turns, confidence: req.confidence }),
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
      if ('type' in r && r.type === 'chain') {
        const chainResult = r as { conceptId: string; at: number; grade?: Grade | null; checked?: boolean[]; record?: boolean; type: 'chain' }
        if (chainResult.record === false || (chainResult.grade === null && chainResult.checked === undefined)) return null
        const grade = chainResult.checked ? gradeChainIdeaUnits(chainResult.checked) : Math.min(3, chainResult.grade ?? 1) as Grade
        r = { conceptId: chainResult.conceptId, at: chainResult.at, grade, type: 'chain' } as ReviewLine
      }
      await deps.memory.append(r)
      const reviews = (await deps.memory.read()).filter((x) => x.conceptId === r.conceptId)
      const t = now()
      return { memory: memoryOf(reviews, t).get(r.conceptId)!, intervals: previewIntervals(reviews, t) }
    },

    async memory() {
      const activeWeaknesses = (await deps.weaknesses?.().catch(() => [])) ?? []
      return Object.fromEntries(memoryOf(await deps.memory.read(), now(), misconceptionConceptIds(activeWeaknesses)))
    },

    async intervals(conceptId) {
      return previewIntervals((await deps.memory.read()).filter((r) => r.conceptId === conceptId), now())
    }
  }
}
