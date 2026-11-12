import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { Bridge } from '../ai/bridge'
import { AuthRequiredError, EngineMissingError } from '../ai/errors'
import { appendJsonl, readJsonl } from '../store/jsonl'
import type { Grade } from '../../shared/memory-types'
import { checkTurnAgainst, formatSubmission, hintBlocked, practiceJsonSchema, PracticeTurnSchema, type PracticeTurn, type Submission } from '../../shared/practice-protocol'
import type { Material } from '../../shared/practice-types'
import type { MemoryStore } from '../memory/store'
import { reducePractice, type PracticeEvent, type PracticeState, type PracticeSummary } from './events'
import { firstPracticeMessage, PRACTICE_SYSTEM_PROMPT } from './prompt'

export type PracticeDeps = {
  bridge: Pick<Bridge, 'converse' | 'ask'>
  dir: string
  /** The material as the tutor reads it. */
  material: (m: Material) => Promise<string>
  /** A short label for lists: "Rolle, Lagrange · 1 fonte". */
  topic: (m: Material) => Promise<string>
  memory: Pick<MemoryStore, 'append' | 'read'>
  onUpdate: (s: PracticeState) => void
  now?: () => number
  uuid?: () => string
  onDone?: (lessonId: string) => Promise<void>
}

const AnyEvent = z.custom<PracticeEvent>((v) => !!v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string')

export function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  return `Il tutor non ha risposto correttamente (${e instanceof Error ? e.message : String(e)}). Premi Riprova.`
}

/** Practice is retrieval: each concluded problem is a review of the concepts it exercised. */
export function gradeFor(outcome: NonNullable<PracticeTurn['conclude']>['outcome'], maxRung: number | null): Grade {
  if (outcome === 'solved') return 3
  if (outcome === 'solved_hints') return (maxRung ?? 0) >= 3 ? 1 : 2
  return 1
}

export function createPracticeRunner(deps: PracticeDeps) {
  const now = deps.now ?? Date.now
  const uuid = deps.uuid ?? randomUUID
  const file = (id: string): string => join(deps.dir, `${id}.jsonl`)
  const chains = new Map<string, Promise<unknown>>()
  const inflight = new Set<string>()

  function serial<R>(id: string, job: () => Promise<R>): Promise<R> {
    const run = (chains.get(id) ?? Promise.resolve()).then(job, job)
    chains.set(id, run.catch(() => undefined))
    return run
  }
  const events = (id: string): Promise<PracticeEvent[]> => readJsonl(file(id), AnyEvent)
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

  async function record(s: PracticeState, turn: PracticeTurn): Promise<void> {
    const p = s.problems.find((x) => x.id === s.active)
    if (!turn.conclude || !p) return
    const grade = gradeFor(turn.conclude.outcome, p.maxRung)
    const ref = `train:${s.id}:${p.id}`
    const done = new Set((await deps.memory.read()).filter((r) => r.ref === ref).map((r) => r.conceptId))
    for (const conceptId of new Set(p.targets)) if (!done.has(conceptId)) await deps.memory.append({ conceptId, at: now(), grade, correct: turn.conclude.outcome !== 'surrendered', via: 'practice', ref, lessonId: s.material.lessonId })
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
    const needsActive = sub.kind === 'thinking' || sub.kind === 'hint' || sub.kind === 'dismiss'
    if (needsActive && !s.active) return 'non c\'è nessun problema aperto'
    if ((sub.kind === 'next' || sub.kind === 'ask') && s.active) return 'c\'è ancora un problema aperto'
    const p = s.problems.find((x) => x.id === s.active)
    if (sub.kind === 'hint' && p && hintBlocked(p)) return 'prima scrivi un tentativo, anche solo un pezzo di ragionamento'
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
      const [context, topic] = await Promise.all([deps.material(material), deps.topic(material)])
      inflight.add(id)
      return serial(id, async () => {
        await append(id, { t: 'created', id, mode: 'train', material, topic, at: now() })
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
      let names: string[]
      try {
        names = (await readdir(deps.dir)).filter((n) => n.endsWith('.jsonl'))
      } catch {
        return []
      }
      const all = await Promise.all(names.map((n) => load(n.replace(/\.jsonl$/, ''))))
      return all
        .filter((s) => s.id)
        .map((s) => ({ id: s.id, topic: s.topic, mode: s.mode, done: s.phase === 'done', updatedAt: s.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    /** Concepts some concluded problem has exercised: the catalog's "mai praticato" is the rest. */
    async practiced(): Promise<Set<string>> {
      const out = new Set<string>()
      for (const s of await this.list()) for (const p of (await load(s.id)).problems) if (p.status === 'done') p.targets.forEach((t) => out.add(t))
      return out
    }
  }
}
export type PracticeRunner = ReturnType<typeof createPracticeRunner>
