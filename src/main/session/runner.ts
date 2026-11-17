import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { toTitleCase } from '../../shared/subjects'
import {
  TeacherTurnSchema,
  formatLearnerReply,
  teacherJsonSchema,
  type LearnerAnswer,
  type TeacherTurn
} from '../../shared/teacher-protocol'
import type { VaultIndex } from '../../shared/vault-types'
import type { GraphData } from '../../shared/graph-types'
import type { Bridge } from '../ai/bridge'
import type { EngineChoice, Settings } from '../../shared/settings-schema'
import type { MemoryStore, WeaknessStore } from '../memory/store'
import type { ReviewLine, WeaknessLine } from '../../shared/memory-types'
import { memoryOf } from '../memory/fsrs'
import { AiAbortError, AuthRequiredError, EngineMissingError } from '../ai/errors'
import { appendJsonl, readJsonl } from '../store/jsonl'
import {
  reduceSession,
  checkTurnAgainst,
  fsrsEvidence,
  stageInstruction,
  type SessionEvent,
  type SessionState,
  type SessionSummary,
  type MasterySettings
} from './events'
import { matchNotes } from './note-match'
import { firstMessage, teacherSystemPrompt } from './prompt'
import { minimalTree, resolveGoals, treeBrief } from './minimal-tree'
import { gradeOpenAnswer, validateChoices } from './grade'

export type SessionRunner = {
  /** Creates the session. With one candidate note (or fastStart) it confirms it at once; otherwise state.awaiting is 'confirm' and state.candidates lists the notes. */
  create(topic: string): Promise<string>
  confirm(id: string, notePath: string | null): Promise<void>
  start(topic: string): Promise<string>
  answer(id: string, a: LearnerAnswer): Promise<void>
  say(id: string, text: string): Promise<void>
  retry(id: string): Promise<void>
  contest(id: string, questionId: string): Promise<void>
  peek(id: string, questionId: string): Promise<void>
  flag(id: string, questionId: string): Promise<void>
  cancel(id: string): Promise<void>
  end(id: string): Promise<void>
  get(id: string): Promise<SessionState>
  list(): Promise<SessionSummary[]>
}

const AnyEvent = z.custom<SessionEvent>(
  (v) =>
    !!v &&
    typeof v === 'object' &&
    [
      'created',
      'confirmed',
      'learner',
      'teacher',
      'error',
      'graded',
      'contested',
      'peeked',
      'flagged',
      'validated',
      'cancelled',
      'aborted'
    ].includes(String((v as { t?: unknown }).t))
)
const noopSettings = async () => ({
  mastery: { kOpen: 2, kChoice: 3, solidDays: 14 },
  learnerProfile: '',
  graderEngine: 'other' as const,
  fastStart: false
})

function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError)
    return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  return `Il tutor non ha risposto correttamente (${e instanceof Error ? e.message : String(e)}). Premi Riprova.`
}

function sectionText(note: string, titles: string[]): string {
  const lines = note.split(/\r?\n/)
  const chunks: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (
      !match ||
      !titles.some((title) => title.toLocaleLowerCase() === match[1].toLocaleLowerCase())
    )
      continue
    const start = i
    i++
    while (i < lines.length && !/^#{1,6}\s+/.test(lines[i])) i++
    chunks.push(lines.slice(start, i).join('\n').trim())
    i--
  }
  return chunks.join('\n\n')
}

export function createSessionRunner(deps: {
  bridge: Pick<Bridge, 'converse'> & Partial<Pick<Bridge, 'ask'>>
  dir: string
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  onUpdate: (s: SessionState) => void
  uuid?: () => string
  games?: () => Promise<boolean>
  /** How well the learner remembers the note's concepts (memoryBrief); '' when the graph knows none. */
  memory?: (notePath: string) => Promise<string>
  memoryStore?: MemoryStore
  weaknesses?: WeaknessStore
  graph?: () => Promise<GraphData>
  settings?: () => Promise<
    Pick<Settings, 'mastery' | 'learnerProfile' | 'graderEngine' | 'fastStart'>
  >
  onPartial?: (id: string, text: string) => void
  otherEngine?: () => Promise<EngineChoice | undefined>
  teachEngine?: () => Promise<EngineChoice | undefined>
}): SessionRunner {
  const uuid = deps.uuid ?? randomUUID
  const file = (id: string) => join(deps.dir, `${id}.jsonl`)
  const chains = new Map<string, Promise<unknown>>()
  const inflight = new Map<string, AbortController>()
  const cache = new Map<string, SessionEvent[]>()
  const profileCache = new Map<string, string>()
  const finalizeStarted = new Set<string>()

  function serial<R>(id: string, job: () => Promise<R>): Promise<R> {
    const run = (chains.get(id) ?? Promise.resolve()).then(job, job)
    chains.set(
      id,
      run.catch(() => undefined)
    )
    return run
  }
  async function events(id: string): Promise<SessionEvent[]> {
    const cached = cache.get(id)
    if (cached) return cached
    const loaded = await readJsonl(file(id), AnyEvent)
    cache.set(id, loaded)
    return loaded
  }
  async function load(id: string): Promise<SessionState> {
    const state = reduceSession(await events(id))
    if (state.awaiting === 'teacher' && !inflight.has(id)) state.awaiting = 'retry'
    return state
  }
  async function append(id: string, event: SessionEvent): Promise<void> {
    await appendJsonl(file(id), event)
    const current = await events(id)
    current.push(event)
    cache.set(id, current)
    deps.onUpdate(await load(id))
  }

  async function finalize(id: string): Promise<void> {
    if (finalizeStarted.has(id)) return
    finalizeStarted.add(id)
    const state = await load(id)
    if (state.phase !== 'done' && !state.cancelled) return
    void (async () => {
      try {
        const evs = await events(id)
        const finished = await readJsonl(
          join(deps.dir, 'index.jsonl'),
          z.object({ id: z.string() }).passthrough()
        ).catch(() => [])
        if (finished.some((entry) => entry.id === id)) return
        if (deps.bridge.ask) {
          const choices = state.evidence
            .filter((e) => e.kind === 'choice' || e.kind === 'game')
            .map((e) => {
              const learner = evs.find(
                (x): x is Extract<SessionEvent, { t: 'learner' }> =>
                  x.t === 'learner' && x.question?.id === e.questionId
              )
              const q = learner?.question
              const node = state.tree?.nodes.find((n) => n.id === e.conceptId)
              return q && node
                ? {
                    questionId: e.questionId,
                    question: q.prompt,
                    correct: q.options?.[q.correct ?? -1] ?? q.prompt,
                    reference: `${node.statement}\n${node.sections[state.notePath ?? ''] ?? ''}`
                  }
                : null
            })
            .filter((x): x is NonNullable<typeof x> => !!x)
          if (choices.length) {
            try {
              const validated = await validateChoices(
                deps.bridge as Bridge,
                choices,
                await deps.otherEngine?.()
              )
              for (const item of validated)
                await append(id, { t: 'validated', ...item, at: Date.now() })
            } catch {
              // A failed audit must not block the stored session evidence.
            }
          }
        }
        const existing = (await deps.memoryStore?.read()) ?? []
        for (const evidence of fsrsEvidence(await load(id))) {
          const ref = `session:${id}:${evidence.conceptId}`
          if (existing.some((r) => r.ref === ref)) continue
          const line: ReviewLine = {
            via: 'session',
            conceptId: evidence.conceptId,
            at: evidence.at,
            grade: evidence.grade,
            confidence: evidence.confidence,
            correct: evidence.correct,
            source: evidence.source,
            sessionId: id,
            evidence: evidence.evidence,
            ref
          }
          await deps.memoryStore?.append(line)
        }
        const tree = state.tree?.nodes ?? []
        const allWeaknesses = (await deps.weaknesses?.read()) ?? []
        const hits = [...state.misconceptionHits]
        for (const graded of evs.filter(
          (event): event is Extract<SessionEvent, { t: 'graded' }> =>
            event.t === 'graded' && event.verdict === 'incorrect'
        )) {
          const learner = evs.find(
            (event): event is Extract<SessionEvent, { t: 'learner' }> =>
              event.t === 'learner' && event.question?.id === graded.questionId
          )
          hits.push({
            conceptId: learner?.question?.nodeId,
            questionId: graded.questionId,
            text: graded.reason,
            at: graded.at
          })
        }
        for (const text of state.summary?.misconceptions ?? []) {
          const match = tree.find(
            (n) =>
              n.name.toLocaleLowerCase() === text.toLocaleLowerCase() ||
              text.toLocaleLowerCase().includes(n.name.toLocaleLowerCase())
          )
          hits.push({ conceptId: match?.id, questionId: `summary:${text}`, text, at: Date.now() })
        }
        for (const hit of hits) {
          const conceptId =
            hit.conceptId ??
            tree.find((n) => n.name.toLocaleLowerCase() === hit.text.toLocaleLowerCase())?.id
          if (!conceptId || allWeaknesses.some((w) => w.ref === `session:${id}:${hit.questionId}`))
            continue
          const weakness: WeaknessLine = {
            id: uuid(),
            conceptId,
            text: hit.text.slice(0, 300),
            kind: 'misconception',
            source: 'session',
            ref: `session:${id}:${hit.questionId}`,
            at: hit.at,
            status: 'active'
          }
          await deps.weaknesses?.append(weakness)
          allWeaknesses.push(weakness)
        }
        for (const evidence of (await load(id)).evidence) {
          if (evidence.correct && (evidence.confidence ?? 0) >= 63)
            await deps.weaknesses?.resolveByEvidence(
              evidence.conceptId,
              evidence.at,
              `session:${id}:${evidence.questionId}`
            )
        }
        const fresh = await load(id)
        await appendJsonl(join(deps.dir, 'index.jsonl'), {
          id,
          topic: fresh.topic,
          notePath: fresh.notePath,
          goalConceptIds: fresh.tree?.goalIds ?? [],
          masteredIds: fresh.doneNodeIds,
          misconceptions: hits.map((h) => h.text),
          shakyIds: tree
            .filter((n) => fresh.concepts[n.id]?.status !== 'mastered')
            .map((n) => n.id),
          turns: fresh.items.filter((x) => x.kind === 'teacher').length,
          durationMs: Date.now() - fresh.createdAt,
          endedAt: Date.now()
        })
      } catch (error) {
        console.warn('[session] finalizzazione fallita', error)
      }
    })()
  }

  async function teacherTurn(id: string, extra = ''): Promise<void> {
    const state = await load(id)
    if (!state.lastLearnerText) return
    const controller = new AbortController()
    inflight.set(id, controller)
    deps.onUpdate({ ...state, awaiting: 'teacher' })
    // The first turn always opens a fresh conversation, so one Riprova is enough after a quit.
    const conversationId = state.conversationId ?? (state.hasTeacherTurn ? id : uuid())
    const repeated = state.hasTeacherTurn && state.items.at(-1)?.kind === 'error'
    const prompt = `${repeated ? '(Ripeto il mio ultimo messaggio: forse non ti è arrivato.)\n\n' : ''}${state.lastLearnerText}${extra ? `\n\n${extra}` : ''}\n\n${stageInstruction(state)}`
    const request = {
      task: 'teach' as const,
      conversationId,
      resume: state.hasTeacherTurn,
      systemPrompt: teacherSystemPrompt(profileCache.get(id) || state.learnerProfile || undefined),
      prompt,
      schema: TeacherTurnSchema as z.ZodType<TeacherTurn>,
      jsonSchema: teacherJsonSchema(),
      cwd: deps.dir,
      signal: controller.signal,
      onPartial: (text: string) => deps.onPartial?.(id, text),
      partialField: 'md'
    }
    try {
      let result = await deps.bridge.converse<TeacherTurn>(request)
      const reason = checkTurnAgainst(state, result.data)
      if (reason) {
        result = await deps.bridge.converse<TeacherTurn>({
          ...request,
          prompt: `La risposta precedente non rispetta lo stato della sessione: ${reason}. Rispondi di nuovo.`,
          resume: true,
          onPartial: undefined
        })
      }
      inflight.delete(id)
      await append(id, {
        t: 'teacher',
        turn: result.data,
        conversationId: result.conversationId,
        at: Date.now()
      })
      if (result.data.phase === 'done') await finalize(id)
    } catch (error) {
      inflight.delete(id)
      if (error instanceof AiAbortError || controller.signal.aborted)
        await append(id, { t: 'aborted', at: Date.now() })
      else await append(id, { t: 'error', message: friendly(error), at: Date.now() })
    }
  }

  async function createNow(topic: string): Promise<string> {
    await mkdir(deps.dir, { recursive: true })
    const id = uuid()
    const [index, options] = await Promise.all([
      deps.vault().catch(() => null),
      (deps.settings ?? noopSettings)()
    ])
    const candidates = index
      ? matchNotes(index, topic, 3).map((note) => ({ title: note.title, path: note.path }))
      : []
    profileCache.set(id, options.learnerProfile)
    await append(id, {
      t: 'created',
      id,
      topic: toTitleCase(topic),
      candidates,
      learnerProfile: options.learnerProfile,
      mastery: options.mastery as MasterySettings,
      at: Date.now()
    })
    // Nothing to choose: confirm now, the first turn starts with start/retry as before.
    if (candidates.length <= 1 || options.fastStart)
      await confirmNow(id, candidates[0]?.path ?? null, false)
    return id
  }

  async function confirmNow(id: string, notePath: string | null, turn = true): Promise<void> {
    const state = await load(id)
    if (state.awaiting !== 'confirm') return
    const index = await deps.vault().catch(() => null)
    const noteMeta = index?.notes.find((note) => note.path === notePath) ?? null
    const noteText = noteMeta ? await deps.readNote(noteMeta.path).catch(() => '') : ''
    const graph = await deps.graph?.().catch(() => undefined)
    const reviews = (await deps.memoryStore?.read()) ?? []
    const activeWeaknesses = (await deps.weaknesses?.active()) ?? []
    let tree: ReturnType<typeof minimalTree> | undefined
    let prior: Record<
      string,
      { state: import('../../shared/memory-types').MemoryState; S?: number; seen: boolean }
    > = {}
    if (graph) {
      const goals = resolveGoals(graph, state.topic, noteMeta?.path)
      const weaknessIds = new Set(
        activeWeaknesses.map((w) => w.conceptId).filter((x): x is string => !!x)
      )
      const memories = memoryOf(reviews, Date.now(), weaknessIds)
      tree = minimalTree(graph, goals, memories, activeWeaknesses, {
        solidDays: state.mastery.solidDays
      })
      prior = Object.fromEntries(
        tree.nodes.map((node) => [node.id, { state: node.state, S: node.S, seen: node.R !== null }])
      )
    }
    await append(id, {
      t: 'confirmed',
      notePath: noteMeta?.path,
      noteTitle: noteMeta?.title,
      tree,
      prior,
      at: Date.now()
    })
    const note = noteMeta && noteText ? { title: noteMeta.title, text: noteText } : undefined
    const sectionTitles =
      tree?.nodes.flatMap((node) =>
        node.sections[noteMeta?.path ?? ''] ? [node.sections[noteMeta?.path ?? '']] : []
      ) ?? []
    const sections =
      noteText && tree?.nodes.length
        ? sectionText(noteText, sectionTitles) ||
          '[Nessuna sezione referenziata trovata nella nota.]'
        : undefined
    const statements =
      tree?.nodes
        .filter((node) => node.birth !== noteMeta?.path)
        .map((node) => `${node.name}: ${node.statement}`) ?? []
    const memoryFallback = tree?.nodes.length
      ? ''
      : noteMeta
        ? await deps.memory?.(noteMeta.path).catch(() => '')
        : ''
    const message = firstMessage(
      state.topic,
      note,
      [memoryFallback, ...statements].filter(Boolean).join('\n'),
      { tree: tree?.nodes.length ? treeBrief(tree) : undefined, sections }
    )
    const gamesOn = (await deps.games?.().catch(() => true)) ?? true
    await append(id, {
      t: 'learner',
      text: `${message}${gamesOn ? '' : '\n\n(Giochi disattivati: non proporre giochi.)'}`,
      at: Date.now()
    })
    if (turn) await teacherTurn(id)
  }

  const pending = new Map<string, Promise<string>>()
  const runner: SessionRunner = {
    create(topic) {
      const key = topic.trim().toLocaleLowerCase()
      const prior = pending.get(key)
      if (prior) return prior
      const task = createNow(topic)
      pending.set(key, task)
      void task.finally(() => pending.delete(key))
      return task
    },
    confirm: (id, notePath) => serial(id, () => confirmNow(id, notePath)),
    async start(topic) {
      const id = await runner.create(topic)
      await runner.retry(id)
      return id
    },
    answer: (id, answer) =>
      serial(id, async () => {
        const state = await load(id)
        const question = state.pendingQuestion
        if (!question || question.id !== answer.questionId)
          throw new Error('nessuna domanda aperta con questo id')
        await append(id, {
          t: 'learner',
          text: formatLearnerReply(question, answer),
          answer,
          question,
          at: Date.now()
        })
        let extra = ''
        if (
          deps.bridge.ask &&
          state.tree?.nodes.some((n) => n.id === question.nodeId) &&
          (question.kind === 'open' || question.game?.type === 'taboo')
        ) {
          const node = state.tree.nodes.find((n) => n.id === question.nodeId)!
          const reference = `${node.statement}\n${node.sections[state.notePath ?? ''] ?? ''}`
          try {
            const settings = await (deps.settings ?? noopSettings)()
            const engine =
              settings.graderEngine === 'other'
                ? await deps.otherEngine?.()
                : await deps.teachEngine?.()
            const grade = await gradeOpenAnswer(deps.bridge as Bridge, {
              question: question.prompt,
              answerText: answer.text ?? answer.game?.detail ?? '',
              reference,
              engine
            })
            await append(id, { t: 'graded', questionId: question.id, ...grade, at: Date.now() })
            extra = `Verdetto del correttore: ${grade.verdict} (${grade.reason})`
          } catch {
            /* tutor continues with the learner's answer */
          }
        }
        await teacherTurn(id, extra)
      }),
    say: (id, text) =>
      serial(id, async () => {
        const state = await load(id)
        if (
          state.awaiting !== 'learner' ||
          (state.pendingQuestion && state.pendingQuestion.role !== 'plan')
        )
          throw new Error('prima rispondi alla domanda aperta')
        await append(id, { t: 'learner', text, question: state.pendingQuestion, at: Date.now() })
        await teacherTurn(id)
      }),
    retry: (id) =>
      serial(id, async () => {
        const state = await load(id)
        if (state.awaiting === 'learner' || state.awaiting === 'confirm') return
        await teacherTurn(id)
      }),
    contest: (id, questionId) => append(id, { t: 'contested', questionId, at: Date.now() }),
    peek: (id, questionId) => append(id, { t: 'peeked', questionId, at: Date.now() }),
    flag: (id, questionId) => append(id, { t: 'flagged', questionId, at: Date.now() }),
    async cancel(id) {
      inflight.get(id)?.abort()
    },
    end: (id) =>
      serial(id, async () => {
        await append(id, { t: 'cancelled', at: Date.now() })
        await finalize(id)
      }),
    get: load,
    async list() {
      const finished = await readJsonl(
        join(deps.dir, 'index.jsonl'),
        z.object({ id: z.string() }).passthrough()
      ).catch(() => [])
      const sessionIds = new Set([...finished.map((entry) => entry.id), ...cache.keys()])
      const all = await Promise.all([...sessionIds].map(load))
      return all
        .filter((s) => s.id)
        .map((s) => ({
          id: s.id,
          topic: s.topic,
          phase: s.phase,
          ...(s.notePath ? { notePath: s.notePath } : {}),
          updatedAt: s.updatedAt
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }
  return runner
}
