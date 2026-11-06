import type { ReviewService } from './memory/review'
import { MAX_QUESTIONS } from './memory/explain'
import { ExerciseSchema } from '../shared/exercise-schema'
import { EXERCISE_TYPES, ReviewLineSchema } from '../shared/memory-types'
import type { Extractor } from './graph/jobs'
import type { NoteGenerator } from './notes/generator'
import { access } from 'node:fs/promises'
import { z } from 'zod'
import type { EngineStatus, VaultResult } from '../shared/api'
import { TASKS, type Engine, type Settings } from '../shared/settings-schema'
import { LearnerAnswerSchema, type LearnerAnswer } from '../shared/teacher-protocol'
import type { SessionRunner } from './session/runner'
import type { VaultIndex } from '../shared/vault-types'
import { NOTEBOOKLM_PREFIX } from '../shared/notebook-types'
import type { Ingestor } from './notebook/ingest'
import type { NotebookChat } from './notebook/chat'
import type { NotebookStore } from './notebook/store'
import type { PracticeRunner } from './practice/runner'
import type { ExamService } from './practice/exam'
import { MaterialSchema, type Catalog, type Material } from '../shared/practice-types'
import { SubmissionSchema } from '../shared/practice-protocol'
import type { Stage } from './voice/dictation'

const Choice = z.object({ engine: z.enum(['agy', 'claude']), model: z.string().optional() }).strict()
const Patch = z
  .object({
    vaultPath: z.string().min(1),
    theme: z.enum(['lavagna', 'trattato', 'system']),
    engines: z.object(Object.fromEntries(TASKS.map((t) => [t, Choice])) as Record<(typeof TASKS)[number], typeof Choice>).strict(),
    excludedFolders: z.array(z.string()),
    backgroundExtraction: z.boolean(),
    dailyExtractionLimit: z.number().int().min(0).max(50),
    reviewSessionSize: z.number().int().min(1).max(20),
    exerciseTypes: z.array(z.enum(EXERCISE_TYPES)).min(1),
    gamesInSessions: z.boolean()
  })
  .partial()
  .strict()

export interface HandlerDeps {
  loadSettings(): Promise<Settings>
  saveSettings(patch: Partial<Settings>): Promise<Settings>
  scan(root: string, excluded: string[]): Promise<VaultIndex>
  aiStatus(): Record<Engine, EngineStatus>
  openExternal(url: string): Promise<void>
  chooseFolder(): Promise<string | null>
}

/** Pure handlers: every payload from the window is validated here before use. */
export function makeHandlers(d: HandlerDeps) {
  return {
    settingsGet: () => d.loadSettings(),
    settingsSet: async (patch: unknown) => d.saveSettings(Patch.parse(patch) as Partial<Settings>),
    async settingsChooseVault(): Promise<Settings> {
      const dir = await d.chooseFolder()
      return dir ? d.saveSettings({ vaultPath: dir }) : d.loadSettings()
    },
    async vaultIndex(): Promise<VaultResult> {
      const s = await d.loadSettings()
      try {
        await access(s.vaultPath)
      } catch {
        return { error: 'missing', path: s.vaultPath }
      }
      try {
        return await d.scan(s.vaultPath, s.excludedFolders)
      } catch {
        return { error: 'unreadable', path: s.vaultPath }
      }
    },
    aiStatus: async () => d.aiStatus(),
    async openExternal(url: unknown): Promise<void> {
      const u = z.string().parse(url)
      if (!/^(obsidian|https):\/\//.test(u)) throw new Error('link non consentito')
      await d.openExternal(u)
    }
  }
}
export type Handlers = ReturnType<typeof makeHandlers>

const Id = z.string().uuid()
const Topic = z.string().trim().min(1).max(500)
const Text = z.string().trim().min(1).max(5000)

/** Session handlers: validate everything coming from the window, then delegate to the runner. */
export function makeSessionHandlers(runner: SessionRunner) {
  return {
    start: async (topic: unknown) => runner.create(Topic.parse(topic)),
    list: () => runner.list(),
    get: async (id: unknown) => runner.get(Id.parse(id)),
    answer: async (id: unknown, a: unknown) => runner.answer(Id.parse(id), LearnerAnswerSchema.parse(a) as LearnerAnswer),
    say: async (id: unknown, text: unknown) => runner.say(Id.parse(id), Text.parse(text)),
    retry: async (id: unknown) => runner.retry(Id.parse(id))
  }
}

const NoteRequest = z
  .object({ sourcePath: z.string().min(1).max(1024).optional(), sessionId: Id.optional() })
  .strict()
  .refine((r) => r.sourcePath || r.sessionId, 'serve una nota o una sessione')

export function makeNoteHandlers(gen: NoteGenerator) {
  return {
    create: async (req: unknown) => gen.create(NoteRequest.parse(req)),
    list: () => gen.list(),
    get: async (id: unknown) => gen.get(Id.parse(id)),
    retry: async (id: unknown) => gen.retry(Id.parse(id))
  }
}

const Positions = z.record(z.string().max(2048), z.tuple([z.number().finite(), z.number().finite()])).refine((p) => Object.keys(p).length <= 20_000, 'troppe posizioni')

export function makeGraphHandlers(x: Extractor, positions: { read(): Promise<unknown>; write(p: Record<string, [number, number]>): Promise<void> }) {
  return {
    get: () => x.graph(),
    status: () => x.status(),
    extract: async (path: unknown, reason: unknown = 'manual') => x.request(z.string().min(1).max(1024).parse(path), z.enum(['manual', 'study']).parse(reason)),
    positions: async () => {
      const r = Positions.safeParse(await positions.read().catch(() => ({})))
      return r.success ? r.data : {}
    },
    // Merged with what is stored: concepts hidden from the graph keep their place for when they come back.
    savePositions: async (p: unknown) => {
      const next = Positions.parse(p)
      const old = Positions.safeParse(await positions.read().catch(() => ({})))
      const merged = { ...(old.success ? old.data : {}), ...next }
      const keys = Object.keys(merged)
      await positions.write(keys.length > 20_000 ? Object.fromEntries(keys.slice(-20_000).map((k) => [k, merged[k]])) : merged)
    }
  }
}

const PlanOpts = z.object({ conceptIds: z.array(z.string().min(1).max(64)).max(200).optional(), weakest: z.boolean().optional() }).strict()
const GradeReq = z.object({ conceptId: z.string().min(1).max(64), exercise: ExerciseSchema, answer: z.string().max(10_000), confidence: z.number().min(0).max(100) })

const ExplainReq = z.object({
  conceptId: z.string().min(1).max(64),
  exercise: ExerciseSchema,
  turns: z.array(z.object({ by: z.enum(['andrea', 'claude']), text: z.string().trim().min(1).max(10_000) }).strict()).min(1).max(2 * MAX_QUESTIONS + 1),
  confidence: z.number().min(0).max(100)
})

export function makeReviewHandlers(svc: ReviewService) {
  return {
    plan: async (opts: unknown) => svc.plan(PlanOpts.parse(opts ?? {})),
    grade: async (req: unknown) => svc.grade(GradeReq.parse(req)),
    explain: async (req: unknown) => svc.explain(ExplainReq.parse(req)),
    record: async (r: unknown) => svc.record(ReviewLineSchema.parse(r)),
    memory: () => svc.memory(),
    intervals: async (id: unknown) => svc.intervals(z.string().min(1).max(64).parse(id))
  }
}

/** Dictation anywhere in the app: the renderer sends the recording, the stages come back through onStage. */
export function makeVoiceHandlers(d: { transcribe: (bytes: Uint8Array, onStage?: (s: Stage) => void) => Promise<string>; microphone: () => Promise<boolean> }) {
  return {
    transcribe: async (bytes: unknown, onStage?: (s: Stage) => void) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('registrazione non valida')
      return d.transcribe(bytes, onStage)
    },
    microphone: () => d.microphone()
  }
}

const Name = z.string().trim().min(1).max(80)
const NotebookPatch = z
  .object({
    name: Name,
    subject: z.string().min(1).max(200).nullable(),
    link: z
      .string()
      .trim()
      .max(2048)
      .refine((u) => u.startsWith(NOTEBOOKLM_PREFIX), 'serve un link https://notebooklm.google.com/…')
      .nullable()
  })
  .partial()
  .strict()
const AbsPath = z.string().min(2).max(4096).refine((p) => p.startsWith('/'), 'percorso non valido')
const Question = z.string().trim().min(1).max(4000)

export function makeNotebookHandlers(d: {
  store: NotebookStore
  ingest: Pick<Ingestor, 'addFiles' | 'addYoutube' | 'addVaultNote' | 'retry' | 'remove' | 'decorate'> & Partial<Pick<Ingestor, 'refresh' | 'removeNotebook'>>
  chat: Pick<NotebookChat, 'ask'> & Partial<Pick<NotebookChat, 'busy'>>
  vault: () => Promise<VaultIndex | null>
  chooseFiles: () => Promise<string[]>
  openPath: (path: string) => Promise<unknown> | void
}) {
  async function notebook(id: unknown): Promise<string> {
    const nb = Id.parse(id)
    if (!(await d.store.notebooks()).some((n) => n.id === nb)) throw new Error('Notebook non trovato')
    return nb
  }
  async function source(id: unknown): Promise<import('../shared/notebook-types').Source> {
    const s = await d.store.source(Id.parse(id))
    if (!s) throw new Error('Fonte non trovata')
    return s
  }
  return {
    list: async () => d.ingest.decorate(await d.store.notebooks()),
    create: async (name: unknown) => d.store.create(Name.parse(name)),
    update: async (id: unknown, patch: unknown) => d.store.update(await notebook(id), NotebookPatch.parse(patch)),
    remove: async (id: unknown) => {
      const nb = await notebook(id)
      return d.ingest.removeNotebook ? d.ingest.removeNotebook(nb) : d.store.remove(nb)
    },
    busy: async (id: unknown) => d.chat.busy?.(await notebook(id)) ?? false,
    refreshSource: async (id: unknown) => d.ingest.refresh?.((await source(id)).id),
    addFiles: async (id: unknown, paths: unknown) => {
      const nb = await notebook(id)
      return d.ingest.addFiles(nb, z.array(AbsPath).min(1).max(200).parse(paths))
    },
    chooseFiles: async (id: unknown) => {
      const nb = await notebook(id)
      const paths = await d.chooseFiles()
      return paths.length ? d.ingest.addFiles(nb, paths) : { added: [], rejected: [] }
    },
    addYoutube: async (id: unknown, url: unknown) => d.ingest.addYoutube(await notebook(id), z.string().trim().max(2048).parse(url)),
    addVault: async (id: unknown, path: unknown) => {
      const nb = await notebook(id)
      const p = z.string().max(4096).parse(path)
      const note = (await d.vault())?.notes.find((n) => n.path === p && n.available)
      if (!note) throw new Error('Nota non trovata nel vault')
      return d.ingest.addVaultNote(nb, note.path, note.title)
    },
    removeSource: async (id: unknown) => d.ingest.remove((await source(id)).id),
    retrySource: async (id: unknown) => d.ingest.retry((await source(id)).id),
    text: async (id: unknown) => d.store.readText((await source(id)).id),
    chat: async (id: unknown) => d.store.chat(await notebook(id)),
    ask: async (id: unknown, question: unknown, sourceIds: unknown) => d.chat.ask(await notebook(id), Question.parse(question), z.array(Id).max(500).parse(sourceIds)),
    openFile: async (id: unknown) => {
      const s = await source(id)
      if (s.kind === 'youtube' || s.kind === 'vault') throw new Error('Questa fonte non ha un file')
      await d.openPath(`${d.store.filesDir(s.id)}/${s.origin}`)
    }
  }
}

const MaterialInput = MaterialSchema.strict().refine((m) => m.conceptIds.length + m.sourceIds.length > 0 || m.free.trim().length > 0, 'Scegli almeno un concetto, una fonte o scrivi un argomento')
const Duration = z.number().int().min(5).max(300).refine((n) => n % 5 === 0, 'la durata va a passi di 5 minuti')
const Points = z.number().min(0).max(30).refine((n) => Number.isInteger(n * 2), 'i punti vanno a mezzi punti')
const Answers = z.record(z.string().max(64), z.string().max(20_000)).refine((a) => Object.keys(a).length <= 50, 'troppe risposte')

/** "Rolle, Lagrange, Fermat e altri 2 · 1 fonte": the label of a practice session in lists. */
export function practiceTopic(m: Material, names: Map<string, string>): string {
  const concepts = m.conceptIds.map((id) => names.get(id) ?? id)
  let head = concepts.slice(0, 3).join(', ') + (concepts.length > 3 ? ` e altri ${concepts.length - 3}` : '')
  if (!head && m.free.trim()) {
    const f = m.free.trim().replace(/\s+/g, ' ')
    head = f.length > 40 ? f.slice(0, f.slice(0, 40).lastIndexOf(' ') > 0 ? f.slice(0, 40).lastIndexOf(' ') : 40) + '…' : f
  }
  const src = m.sourceIds.length ? `${m.sourceIds.length} ${m.sourceIds.length === 1 ? 'fonte' : 'fonti'}` : ''
  return [head, src].filter(Boolean).join(' · ') || 'Pratica'
}

export function makePracticeHandlers(d: {
  runner: Pick<PracticeRunner, 'create' | 'submit' | 'retry' | 'list'>
  exam: Pick<ExamService, 'start' | 'retry' | 'save' | 'deliver' | 'get' | 'hand' | 'selfGrade' | 'calibration'>
  catalog: () => Promise<Catalog>
  photo: (id: string, bytes: Uint8Array) => Promise<string>
  camera: () => Promise<boolean>
}) {
  return {
    catalog: () => d.catalog(),
    create: async (m: unknown) => d.runner.create(MaterialInput.parse(m) as Material),
    submit: async (id: unknown, s: unknown) => d.runner.submit(Id.parse(id), SubmissionSchema.parse(s)),
    get: async (id: unknown) => d.exam.get(Id.parse(id)),
    retry: async (id: unknown) => {
      const pid = Id.parse(id)
      return (await d.exam.get(pid)).mode === 'exam' ? d.exam.retry(pid) : d.runner.retry(pid)
    },
    list: () => d.runner.list(),
    examStart: async (m: unknown, minutes: unknown, paper?: unknown) => d.exam.start(MaterialInput.parse(m) as Material, Duration.parse(minutes), z.boolean().optional().parse(paper) ?? false),
    examSave: async (id: unknown, a: unknown) => d.exam.save(Id.parse(id), Answers.parse(a)),
    examDeliver: async (id: unknown, a: unknown) => d.exam.deliver(Id.parse(id), Answers.parse(a)),
    examHand: async (id: unknown) => d.exam.hand(Id.parse(id)),
    examSelf: async (id: unknown, problemId: unknown, points: unknown) => d.exam.selfGrade(Id.parse(id), z.string().min(1).max(64).parse(problemId), Points.parse(points)),
    calibration: () => d.exam.calibration(),
    photo: async (id: unknown, bytes: unknown) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('foto non valida')
      return d.photo(Id.parse(id), bytes)
    },
    camera: () => d.camera()
  }
}
