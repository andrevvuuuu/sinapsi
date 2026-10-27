import type { ReviewService } from './memory/review'
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
    exerciseTypes: z.array(z.enum(EXERCISE_TYPES)).min(1)
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
    savePositions: async (p: unknown) => positions.write(Positions.parse(p))
  }
}

const PlanOpts = z.object({ conceptIds: z.array(z.string().min(1).max(64)).max(200).optional(), weakest: z.boolean().optional() }).strict()
const GradeReq = z.object({ conceptId: z.string().min(1).max(64), exercise: ExerciseSchema, answer: z.string().max(10_000), confidence: z.number().min(0).max(100) })

export function makeReviewHandlers(svc: ReviewService) {
  return {
    plan: async (opts: unknown) => svc.plan(PlanOpts.parse(opts ?? {})),
    grade: async (req: unknown) => svc.grade(GradeReq.parse(req)),
    record: async (r: unknown) => svc.record(ReviewLineSchema.parse(r)),
    memory: () => svc.memory(),
    intervals: async (id: unknown) => svc.intervals(z.string().min(1).max(64).parse(id))
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
  ingest: Pick<Ingestor, 'addFiles' | 'addYoutube' | 'addVaultNote' | 'retry' | 'remove' | 'decorate'>
  chat: Pick<NotebookChat, 'ask'>
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
    remove: async (id: unknown) => d.store.remove(await notebook(id)),
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
