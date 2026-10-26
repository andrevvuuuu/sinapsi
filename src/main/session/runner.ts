import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { TeacherTurnSchema, formatLearnerReply, teacherJsonSchema, type LearnerAnswer, type TeacherTurn } from '../../shared/teacher-protocol'
import type { VaultIndex } from '../../shared/vault-types'
import type { Bridge } from '../ai/bridge'
import { AuthRequiredError, EngineMissingError } from '../ai/errors'
import { appendJsonl, readJsonl } from '../store/jsonl'
import { reduceSession, type SessionEvent, type SessionState, type SessionSummary } from './events'
import { matchNote } from './note-match'
import { firstMessage, TEACHER_SYSTEM_PROMPT } from './prompt'
import { z } from 'zod'

export type SessionRunner = {
  /** Writes the opening events and returns at once; the first teacher turn is run by retry(). */
  create(topic: string): Promise<string>
  start(topic: string): Promise<string>
  answer(id: string, a: LearnerAnswer): Promise<void>
  say(id: string, text: string): Promise<void>
  retry(id: string): Promise<void>
  get(id: string): Promise<SessionState>
  list(): Promise<SessionSummary[]>
}

// Events are trusted (we wrote them); the schema only guards against a damaged line.
const AnyEvent = z.custom<SessionEvent>((v) => !!v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string')

function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}, poi premi Riprova.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  return `Il tutor non ha risposto correttamente (${e instanceof Error ? e.message : String(e)}). Premi Riprova.`
}

export function createSessionRunner(deps: {
  bridge: Pick<Bridge, 'converse'>
  dir: string
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  onUpdate: (s: SessionState) => void
  uuid?: () => string
}): SessionRunner {
  const uuid = deps.uuid ?? randomUUID
  const file = (id: string): string => join(deps.dir, `${id}.jsonl`)
  const chains = new Map<string, Promise<unknown>>()

  // One operation at a time per session, so events never interleave.
  function serial<R>(id: string, job: () => Promise<R>): Promise<R> {
    const run = (chains.get(id) ?? Promise.resolve()).then(job, job)
    chains.set(id, run.catch(() => undefined))
    return run
  }
  const load = async (id: string): Promise<SessionState> => reduceSession(await readJsonl(file(id), AnyEvent))
  async function append(id: string, e: SessionEvent): Promise<void> {
    await appendJsonl(file(id), e)
    deps.onUpdate(await load(id))
  }

  async function teacherTurn(id: string): Promise<void> {
    const s = await load(id)
    if (!s.lastLearnerText) return
    // A first turn that failed may already have created the CLI session: each first attempt gets a fresh id.
    const attempts = s.items.filter((i) => i.kind === 'error').length
    const conversationId = s.conversationId ?? (s.hasTeacherTurn || attempts === 0 ? id : uuid())
    try {
      const r = await deps.bridge.converse<TeacherTurn>({
        task: 'teach',
        conversationId,
        resume: s.hasTeacherTurn,
        systemPrompt: TEACHER_SYSTEM_PROMPT,
        prompt: s.lastLearnerText,
        schema: TeacherTurnSchema as z.ZodType<TeacherTurn>,
        jsonSchema: teacherJsonSchema(),
        cwd: deps.dir
      })
      await append(id, { t: 'teacher', turn: r.data, conversationId: r.conversationId, at: Date.now() })
    } catch (e) {
      await append(id, { t: 'error', message: friendly(e), at: Date.now() })
    }
  }

  const runner: SessionRunner = {
    async start(topic) {
      const id = await runner.create(topic)
      await runner.retry(id)
      return id
    },
    async create(topic) {
      await mkdir(deps.dir, { recursive: true })
      const id = uuid()
      const index = await deps.vault().catch(() => null)
      const note = index ? matchNote(index, topic) : null
      let noteText: string | undefined
      if (note) noteText = await deps.readNote(note.path).catch(() => undefined)
      return serial(id, async () => {
        await append(id, { t: 'created', id, topic, ...(note && noteText ? { noteTitle: note.title, notePath: note.path } : {}), at: Date.now() })
        await append(id, { t: 'learner', text: firstMessage(topic, note && noteText ? { title: note.title, text: noteText } : undefined), at: Date.now() })
        return id
      })
    },
    answer: (id, a) =>
      serial(id, async () => {
        const s = await load(id)
        const q = s.pendingQuestion
        if (!q || q.id !== a.questionId) throw new Error('nessuna domanda aperta con questo id')
        await append(id, { t: 'learner', text: formatLearnerReply(q, a), answer: a, question: q, at: Date.now() })
        await teacherTurn(id)
      }),
    say: (id, text) =>
      serial(id, async () => {
        const s = await load(id)
        if (s.awaiting !== 'learner' || (s.pendingQuestion && s.pendingQuestion.role !== 'plan')) throw new Error('prima rispondi alla domanda aperta')
        await append(id, { t: 'learner', text, question: s.pendingQuestion, at: Date.now() })
        await teacherTurn(id)
      }),
    retry: (id) =>
      serial(id, async () => {
        const s = await load(id)
        if (s.awaiting === 'learner') return
        await teacherTurn(id)
      }),
    get: (id) => load(id),
    async list() {
      let names: string[] = []
      try {
        names = (await readdir(deps.dir)).filter((n) => n.endsWith('.jsonl'))
      } catch {
        return []
      }
      const all = await Promise.all(names.map((n) => load(n.replace(/\.jsonl$/, ''))))
      return all.filter((s) => s.id).map((s) => ({ id: s.id, topic: s.topic, phase: s.phase, updatedAt: s.updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }
  return runner
}
