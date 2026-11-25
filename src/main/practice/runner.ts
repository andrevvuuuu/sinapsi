import { randomUUID } from 'node:crypto'
import { toTitleCase } from '../../shared/subjects'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Bridge } from '../ai/bridge'
import { AuthRequiredError, EngineMissingError } from '../ai/errors'
import { appendJsonl, readJsonl } from '../store/jsonl'
import { gradeFromOutcome, type Grade, type WeaknessLine } from '../../shared/memory-types'
import { checkTurnAgainst, formatSubmission, hintGate, practiceJsonSchema, PracticeTurnSchema, type PracticeTurn, type Submission } from '../../shared/practice-protocol'
import type { Material } from '../../shared/practice-types'
import { proceduralLens } from '../../shared/procedural'
import type { MemoryStore } from '../memory/store'
import type { WeaknessStore } from '../memory/store'
import type { EngineChoice } from '../../shared/settings-schema'
import { gradePracticeProblem, type PracticeGradeItem } from './grade'
import { reducePractice, type PracticeEvent, type PracticeState, type PracticeSummary } from './events'
import { firstPracticeMessage, PRACTICE_SYSTEM_PROMPT } from './prompt'

export type PracticeDeps = {
  bridge: Pick<Bridge, 'converse' | 'ask'>
  otherEngine?: () => Promise<EngineChoice | undefined>
  targetDetails?: (ids: string[]) => Promise<{ id: string; name: string; statement: string }[]>
  siblings?: (targetIds: string[]) => Promise<{ targetId: string; siblingId: string; targetName: string; siblingName: string }[]>
  dir: string
  /** The material as the tutor reads it. */
  material: (m: Material) => Promise<string>
  /** A short label for lists: "Rolle, Lagrange · 1 fonte". */
  topic: (m: Material) => Promise<string>
  memory: Pick<MemoryStore, 'append' | 'read'>
  weaknesses?: Pick<WeaknessStore, 'append' | 'resolveByEvidence'> & { read?: () => Promise<WeaknessLine[]> }
  onUpdate: (s: PracticeState) => void
  now?: () => number
  uuid?: () => string
  onDone?: (lessonId: string) => Promise<void>
  onCompass?: (lessonId: string, question: string) => Promise<void>
  onSolved?: (lessonId: string, questions: string[]) => Promise<void>
}

const AnyEvent = z.custom<PracticeEvent>((v) => !!v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string')

export function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  return `Il tutor non ha risposto correttamente (${e instanceof Error ? e.message : String(e)}). Premi Riprova.`
}

/** Practice is retrieval: each concluded problem is a review of the concepts it exercised. */
export function gradeFor(outcome: NonNullable<PracticeTurn['conclude']>['outcome'], maxRung?: number | null, confidence?: number): Grade {
  return gradeFromOutcome({
    outcome: outcome === 'surrendered' ? 'wrong' : 'correct',
    assisted: outcome === 'solved_hints' || (maxRung ?? 0) > 0,
    confidence
  })
}

function normalizeConceptText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
}

export function textMatchesConcept(text: string, id: string, name: string): boolean {
  const normText = normalizeConceptText(text)
  const normId = normalizeConceptText(id)
  const normName = normalizeConceptText(name)
  if (!normText) return false
  if (normId && (normText === normId || normText.includes(normId))) return true
  if (normName && (normText.includes(normName) || normName.includes(normText))) return true
  const stopWords = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'del', 'della', 'dei', 'delle', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'un', 'una', 'uno', 'teorema', 'principio', 'legge', 'formula', 'regola'])
  const words = normName.split(/\s+/).filter((w) => w.length >= 3 && !stopWords.has(w))
  return words.length > 0 && words.some((w) => normText.includes(w))
}

export function createPracticeRunner(deps: PracticeDeps) {
  const now = deps.now ?? Date.now
  const uuid = deps.uuid ?? randomUUID
  const file = (id: string): string => join(deps.dir, `${id}.jsonl`)
  const chains = new Map<string, Promise<unknown>>()
  const inflight = new Set<string>()
  const writtenDiscriminations = new Set<string>()

  function serial<R>(id: string, job: () => Promise<R>): Promise<R> {
    const run = (chains.get(id) ?? Promise.resolve()).then(job, job)
    chains.set(id, run.catch(() => undefined))
    return run
  }
  // Each session file is read again only when it changed (mtime + size), as memoryStore does: Oggi and the catalog list every session.
  const eventCache = new Map<string, { mtimeMs: number; size: number; events: PracticeEvent[] }>()
  async function events(id: string): Promise<PracticeEvent[]> {
    const path = file(id)
    const st = await stat(path).catch(() => null)
    const hit = eventCache.get(id)
    // A copy every time: the reducer keeps references to event objects and the runner mutates the state it builds.
    if (st && hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return structuredClone(hit.events)
    const read = await readJsonl(path, AnyEvent)
    if (st) eventCache.set(id, { mtimeMs: st.mtimeMs, size: st.size, events: read })
    else eventCache.delete(id)
    return structuredClone(read)
  }
  /** Every session on disk, each file read at most once (and not at all if unchanged since the last call). */
  async function allStates(): Promise<PracticeState[]> {
    let names: string[]
    try {
      names = (await readdir(deps.dir)).filter((n) => n.endsWith('.jsonl'))
    } catch {
      return []
    }
    return (await Promise.all(names.map((n) => load(n.replace(/\.jsonl$/, ''))))).filter((s) => s.id)
  }
  async function load(id: string): Promise<PracticeState> {
    const s = reducePractice(await events(id))
    // Nobody is answering (the app quit mid-turn): offer Riprova.
    if (s.awaiting === 'tutor' && !inflight.has(id)) s.awaiting = 'retry'
    return s
  }
  async function append(id: string, e: PracticeEvent): Promise<void> {
    const before = await load(id)
    await appendJsonl(file(id), e)
    const after = await load(id)
    deps.onUpdate(after)
    if (before.phase !== 'done' && after.phase === 'done' && after.material.lessonId) await deps.onDone?.(after.material.lessonId)
  }

  async function checkDiscrimination(s: PracticeState): Promise<void> {
    if (!deps.siblings || !deps.weaknesses) return
    try {
      const allTargetIds = [...new Set(s.problems.flatMap((prob) => prob.targets))]
      if (allTargetIds.length === 0) return
      const siblingPairs = await deps.siblings(allTargetIds)
      const targetDetails = await deps.targetDetails?.(allTargetIds) ?? allTargetIds.map((id) => ({ id, name: id, statement: '' }))
      const targetNames = new Map(targetDetails.map((td) => [td.id, td.name]))

      const swapOccurrences = new Map<string, { targetId: string; siblingId: string; targetName: string; siblingName: string; problemIds: Set<string> }>()

      for (const prob of s.problems) {
        if (!prob.triage?.trim()) continue
        for (const tId of prob.targets) {
          const tName = targetNames.get(tId) ?? tId
          const relSibs = siblingPairs.filter((sp) => sp.targetId === tId)
          for (const sib of relSibs) {
            if (
              textMatchesConcept(prob.triage, sib.siblingId, sib.siblingName) &&
              !textMatchesConcept(prob.triage, tId, tName)
            ) {
              const key = `${tId}:${sib.siblingId}`
              let entry = swapOccurrences.get(key)
              if (!entry) {
                entry = { targetId: tId, siblingId: sib.siblingId, targetName: tName, siblingName: sib.siblingName, problemIds: new Set() }
                swapOccurrences.set(key, entry)
              }
              entry.problemIds.add(prob.id)
            }
          }
        }
      }

      for (const [key, entry] of swapOccurrences) {
        if (entry.problemIds.size >= 2) {
          const discRef = `practice:${s.id}:discrimination:${key}`
          if (!writtenDiscriminations.has(discRef)) {
            writtenDiscriminations.add(discRef)
            await deps.weaknesses.append({
              id: `w_${uuid().replace(/-/g, '').slice(0, 20)}`,
              conceptId: entry.targetId,
              text: `Confusione tra ${entry.targetName} e ${entry.siblingName}: indicato ${entry.siblingName} invece di ${entry.targetName}`,
              kind: 'discrimination',
              source: 'practice',
              ref: discRef,
              at: now(),
              status: 'active'
            })
          }
        }
      }
    } catch {
      // non-blocking discrimination tracking
    }
  }

  async function record(s: PracticeState, turn: PracticeTurn): Promise<void> {
    const p = s.problems.find((x) => x.id === s.active)
    if (!turn.conclude || !p) return
    const ref = `train:${s.id}:${p.id}`
    if ((await events(s.id)).some((event) => event.t === 'attributed' && event.problemId === p.id)) return
    const targets = [...new Set(p.targets)]
    const write = async (items: PracticeGradeItem[]): Promise<void> => {
      const done = new Set((await deps.memory.read()).filter((r) => r.ref === ref).map((r) => r.conceptId))
      for (const item of items) {
        const conceptId = item.conceptId
        if (!targets.includes(conceptId) || done.has(conceptId) || item.state === 'non_attribuibile') continue
        const assisted = p.hintConcepts.includes(conceptId)
        if (item.state === 'corretto') {
          await deps.memory.append({ conceptId, at: now(), grade: gradeFromOutcome({ outcome: 'correct', assisted, confidence: p.confidence }), correct: !assisted, via: 'practice', ref, lessonId: s.material.lessonId, rung: p.maxRung ?? 0, ...(p.confidence !== undefined ? { confidence: p.confidence } : {}) })
          if (!assisted) await deps.weaknesses?.resolveByEvidence(conceptId, now(), ref)
          continue
        }
        if (item.miss === 'execution' || item.miss === 'careless') {
          await deps.weaknesses?.append({ id: `w_${uuid().replace(/-/g, '').slice(0, 20)}`, conceptId, text: turn.conclude!.verdict.slice(0, 300), kind: 'execution', source: 'practice', ref, at: now(), status: 'active' })
          continue
        }
        await deps.memory.append({ conceptId, at: now(), grade: gradeFromOutcome({ outcome: 'wrong', confidence: p.confidence }), correct: false, via: 'practice', ref, lessonId: s.material.lessonId, rung: p.maxRung ?? 0, miss: item.miss, ...(p.confidence !== undefined ? { confidence: p.confidence } : {}) })
        if (item.miss === 'structural' || item.miss === 'discrimination') await deps.weaknesses?.append({ id: `w_${uuid().replace(/-/g, '').slice(0, 20)}`, conceptId, text: turn.conclude!.verdict.slice(0, 300), kind: item.miss === 'structural' ? 'misconception' : 'discrimination', source: 'practice', ref, at: now(), status: 'active' })
      }
      await append(s.id, { t: 'attributed', problemId: p.id, items, divergent: ['solved', 'solved_hints'].includes(turn.conclude!.outcome) && items.some((item) => item.state === 'errore_qui'), at: now() })
      await checkDiscrimination(s)
    }
    if (turn.conclude.outcome === 'solved' && p.hints === 0 && (p.maxRung ?? 0) === 0) {
      const done = new Set((await deps.memory.read()).filter((r) => r.ref === ref).map((r) => r.conceptId))
      for (const conceptId of targets) if (!done.has(conceptId)) {
        await deps.memory.append({ conceptId, at: now(), grade: gradeFromOutcome({ outcome: 'correct', confidence: p.confidence }), correct: true, via: 'practice', ref, lessonId: s.material.lessonId, rung: 0, ...(p.confidence !== undefined ? { confidence: p.confidence } : {}) })
        await deps.weaknesses?.resolveByEvidence(conceptId, now(), ref)
      }
      await checkDiscrimination(s)
      return
    }
    void (async () => {
      let items: PracticeGradeItem[]
      try {
        const details = await deps.targetDetails?.(targets) ?? targets.map((id) => ({ id, name: id, statement: '' }))
        const original = (await events(s.id)).find((event) => event.t === 'tutor' && event.turn.problem?.id === p.id)
        const modelSolution = original?.t === 'tutor' ? original.turn.problem?.modelSolution ?? '' : ''
        items = await gradePracticeProblem(deps.bridge, { statement: p.statement, modelSolution, finalAnswer: s.lastLearnerText ?? '', maxRung: p.maxRung, hintConcepts: p.hintConcepts, attempts: p.attempts, targets: details, engine: await deps.otherEngine?.() })
      } catch {
        items = targets.filter((id) => p.hintConcepts.includes(id)).map((conceptId) => ({ conceptId, state: 'corretto' as const }))
        const fallbackGrade = gradeFor(turn.conclude!.outcome, p.maxRung, p.confidence)
        const done = new Set((await deps.memory.read()).filter((r) => r.ref === ref).map((r) => r.conceptId))
        for (const item of items) if (!done.has(item.conceptId)) await deps.memory.append({ conceptId: item.conceptId, at: now(), grade: fallbackGrade, correct: turn.conclude!.outcome === 'solved' && (p.maxRung ?? 0) === 0, via: 'practice', ref, lessonId: s.material.lessonId, rung: p.maxRung ?? 0, miss: turn.conclude!.miss, ...(p.confidence !== undefined ? { confidence: p.confidence } : {}) })
        await append(s.id, { t: 'attributed', problemId: p.id, items, divergent: false, at: now() })
        await checkDiscrimination(s)
        return
      }
      await write(items)
    })().catch(() => undefined)
  }

  async function tutorTurn(id: string): Promise<void> {
    const s = await load(id)
    if (!s.lastLearnerText) return
    inflight.add(id)
    deps.onUpdate({ ...s, awaiting: 'tutor' })
    // Until the tutor has answered once, every attempt opens a fresh conversation: a quit mid-call may have created one.
    let conversationId = s.conversationId ?? uuid()
    let resume = s.hasTutorTurn
    try {
      const ask = async (prompt: string): Promise<PracticeTurn> => {
        const r = await deps.bridge.converse<PracticeTurn>({
          task: 'teach',
          conversationId,
          resume,
          systemPrompt: PRACTICE_SYSTEM_PROMPT,
          prompt,
          schema: PracticeTurnSchema as z.ZodType<PracticeTurn>,
          jsonSchema: practiceJsonSchema(),
          cwd: deps.dir
        })
        conversationId = r.conversationId
        resume = true
        return r.data
      }
      const asked = [...s.items].reverse().find((i) => i.kind === 'learner')
      const kind = asked?.kind === 'learner' ? asked.submission.kind : undefined
      let turn = await ask(s.lastLearnerText)
      const problem = checkTurnAgainst(s, turn, kind)
      if (problem) {
        turn = await ask(`Il turno precedente non va bene: ${problem}. Rimanda il turno corretto, secondo il protocollo.`)
        const again = checkTurnAgainst(s, turn, kind)
        // Leaving a problem must always show its solution, whatever the tutor does.
        if (again && kind === 'dismiss' && s.active) turn = { phase: s.phase, blocks: [], conclude: { outcome: 'surrendered', verdict: 'Problema lasciato.', retest: true } }
        else if (again) throw new Error(again)
      }
      // Only concepts of the material can be targets: a guessed id would become a phantom in memory.
      if (turn.problem) turn = { ...turn, problem: { ...turn.problem, targets: turn.problem.targets.filter((x) => s.material.conceptIds.includes(x)) } }
      inflight.delete(id)
      await append(id, { t: 'tutor', turn, conversationId, at: now() })
      await record(s, turn)
      if (s.material.lessonId && turn.conclude && ['solved', 'solved_hints'].includes(turn.conclude.outcome)) {
        const active = s.problems.find((p) => p.id === s.active)
        if (active?.compass) await deps.onSolved?.(s.material.lessonId, [active.compass.question])
      }
    } catch (e) {
      inflight.delete(id)
      await append(id, { t: 'error', message: friendly(e), at: now() })
    } finally {
      inflight.delete(id)
    }
  }

  function allowed(s: PracticeState, sub: Submission): string | null {
    if (s.mode !== 'train') return 'questa è una simulazione d\'esame'
    if (s.awaiting !== 'learner') return 'aspetta la risposta del tutor'
    if (s.phase === 'done') return 'la sessione è finita'
    const needsActive = sub.kind === 'thinking' || sub.kind === 'hint' || sub.kind === 'dismiss' || sub.kind === 'compass' || sub.kind === 'restate' || sub.kind === 'triage'
    if (needsActive && !s.active) return 'non c\'è nessun problema aperto'
    if ((sub.kind === 'next' || sub.kind === 'ask') && s.active) return 'c\'è ancora un problema aperto'
    const p = s.problems.find((x) => x.id === s.active)
    if (sub.kind === 'triage') {
      if (!s.triageEligible || !p?.triageActive) return 'il triage non è attivo per questo problema'
      if (p.attempts > 0) return 'il triage è possibile solo prima del primo tentativo'
      if (p.triage) return 'hai già indicato uno strumento per questo problema'
      if (!sub.text?.trim()) return 'indica quale strumento useresti'
      return null
    }
    if (p?.needsRestate && ['thinking', 'hint', 'compass'].includes(sub.kind)) return "Prima riformula con parole tue l'idea dell'indizio"
    if (sub.kind === 'restate' && !p?.needsRestate) return 'non serve riformulare un indizio adesso'
    if (sub.kind === 'hint' && p && hintGate(p) === 'attempt') return 'prima scrivi un tentativo, anche solo un pezzo di ragionamento'
    if (sub.kind === 'hint' && p && hintGate(p) === 'compass') return 'compila prima la Bussola della confusione per chiedere un indizio mirato'
    // The compass aims a hint at a precise question: it needs an attempt first, like any hint above rung 0.
    if (sub.kind === 'compass' && p && p.attempts === 0) return 'prima scrivi un tentativo, anche solo un pezzo di ragionamento'
    if (sub.kind === 'thinking' && !sub.text?.trim() && !sub.photoText?.trim() && sub.line === undefined) return 'scrivi il tuo ragionamento'
    return null
  }

  return {
    load,
    events,
    append,
    serial,
    inflight,
    async create(material: Material): Promise<string> {
      await mkdir(deps.dir, { recursive: true })
      const id = uuid()
      const [context, topic, lines] = await Promise.all([
        deps.material(material),
        deps.topic(material),
        deps.memory.read()
      ])
      const lens = proceduralLens(lines)
      const triageEligible = material.conceptIds.length > 0 &&
        material.conceptIds.every((conceptId) => lens.get(conceptId)?.lastOutcome === true)
      inflight.add(id)
      return serial(id, async () => {
        await append(id, { t: 'created', id, mode: 'train', material, topic: toTitleCase(topic), triageEligible, at: now() })
        await append(id, { t: 'learner', submission: { kind: 'start' }, text: firstPracticeMessage(context), at: now() })
        return id
      })
    },
    submit: (id: string, sub: Submission): Promise<void> =>
      serial(id, async () => {
        const s = await load(id)
        const why = allowed(s, sub)
        if (why) throw new Error(why)
        const problem = s.problems.find((p) => p.id === s.active)
        await append(id, { t: 'learner', submission: sub, text: formatSubmission(sub, problem), at: now() })
        if (sub.kind === 'triage') return
        if (sub.kind === 'compass' && s.material.lessonId && sub.compass) await deps.onCompass?.(s.material.lessonId, sub.compass.question)
        await tutorTurn(id)
      }),
    retry: (id: string): Promise<void> =>
      serial(id, async () => {
        const s = await load(id)
        if (s.mode !== 'train' || s.awaiting === 'learner') return
        await tutorTurn(id)
      }),
    get: (id: string): Promise<PracticeState> => load(id),
    async list(): Promise<PracticeSummary[]> {
      return (await allStates())
        .map((s) => ({ id: s.id, topic: s.topic, mode: s.mode, done: s.phase === 'done', updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    /** Concepts some concluded problem has exercised: the catalog's "mai praticato" is the rest. */
    async practiced(): Promise<Set<string>> {
      const out = new Set<string>()
      for (const s of await allStates()) for (const p of s.problems) if (p.status === 'done') p.targets.forEach((t) => out.add(t))
      return out
    }
  }
}
export type PracticeRunner = ReturnType<typeof createPracticeRunner>
