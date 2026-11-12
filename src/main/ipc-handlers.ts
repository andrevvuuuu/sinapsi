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
import type { Ingestor } from './notebook/ingest'
import type { NotebookStore } from './notebook/store'
import type { PracticeRunner } from './practice/runner'
import type { ExamService } from './practice/exam'
import { MaterialSchema, type Catalog, type Material } from '../shared/practice-types'
import { SubmissionSchema } from '../shared/practice-protocol'
import type { Stage } from './voice/dictation'
import { LessonEntrySchema, type LessonEvent } from '../shared/lesson-types'
import { pendingDigest, reduceLessons } from './lessons/reduce'
import { independentConcepts } from './memory/fading'
import { resolveLessonLaunch } from './lessons/launch'
import type { Memory } from '../shared/memory-types'

const Choice = z
  .object({ engine: z.enum(['agy', 'claude']), model: z.string().optional() })
  .strict()
const Patch = z
  .object({
    vaultPath: z.string().min(1),
    theme: z.enum(['lavagna', 'trattato', 'system']),
    engines: z
      .object(
        Object.fromEntries(TASKS.map((t) => [t, Choice])) as Record<
          (typeof TASKS)[number],
          typeof Choice
        >
      )
      .strict(),
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

const LessonId = z.string().uuid()
const LessonPatch = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    courseId: z.string().min(1).max(200).optional(),
    topic: z.string().min(1).max(500).optional(),
    sourceNote: z.string().max(1024).optional(),
    prerequisites: LessonEntrySchema.shape.prerequisites.optional(),
    core8020: LessonEntrySchema.shape.core8020.optional(),
    pacerType: LessonEntrySchema.shape.pacerType.optional(),
    conceptIds: LessonEntrySchema.shape.conceptIds.optional(),
    highYieldResources: LessonEntrySchema.shape.highYieldResources.optional()
  })
  .strict()
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function makeLessonHandlers(d: {
  read: () => Promise<LessonEvent[]>
  append: (e: LessonEvent) => Promise<void>
  now?: () => number
  uuid?: () => string
  memory: () => Promise<Record<string, Memory>>
  reviews?: () => Promise<import('../shared/memory-types').ReviewLine[]>
  readNote: (path: string) => Promise<string>
  vaultRoot: () => Promise<string>
  createPractice: (m: Material) => Promise<string>
  retryPractice: (id: string) => void
  validConceptIds?: () => Promise<Set<string>>
}) {
  const now = d.now ?? Date.now,
    uuid = d.uuid ?? (() => crypto.randomUUID())
  const entries = async (): Promise<ReturnType<typeof reduceLessons>> =>
    reduceLessons(await d.read())
  const stamp = (): string => new Date(now()).toISOString()
  return {
    list: async () => {
      // Memory and the unsupported-mastery set are read once for the whole list.
      const memory = await d.memory()
      const independent = independentConcepts((await d.reviews?.()) ?? [])
      return (await entries()).map((e) => {
        const r = resolveLessonLaunch(e, memory, now())
        return {
          ...e,
          nextMode: r.kind === 'disabled' ? 'disabled' : r.kind,
          launchReason: r.kind === 'disabled' ? r.reason : undefined,
          pending: pendingDigest(e, now()),
          independentConceptIds: e.conceptIds.filter((id) => independent.has(id))
        }
      })
    },
    get: async (id: unknown) => {
      const e = (await entries()).find((x) => x.id === LessonId.parse(id))
      if (!e) throw new Error('Lezione non trovata')
      const r = resolveLessonLaunch(e, await d.memory(), now())
      const independent = independentConcepts((await d.reviews?.()) ?? [])
      return {
        ...e,
        nextMode: r.kind === 'disabled' ? 'disabled' : r.kind,
        launchReason: r.kind === 'disabled' ? r.reason : undefined,
        pending: pendingDigest(e, now()),
        independentConceptIds: e.conceptIds.filter((id) => independent.has(id))
      }
    },
    create: async (input: unknown) => {
      const p = z
        .object({
          date: LessonEntrySchema.shape.date,
          courseId: LessonEntrySchema.shape.courseId,
          topic: LessonEntrySchema.shape.topic,
          sourceNote: LessonEntrySchema.shape.sourceNote,
          prerequisites: LessonEntrySchema.shape.prerequisites,
          core8020: LessonEntrySchema.shape.core8020,
          pacerType: LessonEntrySchema.shape.pacerType,
          conceptIds: LessonEntrySchema.shape.conceptIds,
          confusionQuestions: LessonEntrySchema.shape.confusionQuestions,
          activeMisconceptions: LessonEntrySchema.shape.activeMisconceptions,
          masteryLevel: LessonEntrySchema.shape.masteryLevel,
          highYieldResources: LessonEntrySchema.shape.highYieldResources,
          examWeight: LessonEntrySchema.shape.examWeight
        })
        .strict()
        .parse(input)
      if (d.validConceptIds) {
        const valid = await d.validConceptIds()
        if (p.conceptIds.some((conceptId) => !valid.has(conceptId))) {
          throw new Error('La lezione contiene concetti non presenti nel catalogo')
        }
      }
      const at = stamp()
      const e = LessonEntrySchema.parse({
        ...p,
        id: uuid(),
        schema: 1,
        digest: { digest: null, recall24h: null, weekly: null },
        createdAt: at,
        updatedAt: at
      })
      await d.append({ t: 'lesson-created', at, entry: e })
      return e
    },
    update: async (id: unknown, patch: unknown) => {
      const eid = LessonId.parse(id),
        p = LessonPatch.parse(patch),
        at = stamp()
      if (!(await entries()).some((e) => e.id === eid)) throw new Error('Lezione non trovata')
      if (p.conceptIds && d.validConceptIds) {
        const valid = await d.validConceptIds()
        if (p.conceptIds.some((conceptId) => !valid.has(conceptId))) {
          throw new Error('La lezione contiene concetti non presenti nel catalogo')
        }
      }
      await d.append({ t: 'lesson-updated', at, id: eid, patch: { ...p, updatedAt: at } })
      return true
    },
    addConfusion: async (id: unknown, text: unknown) => {
      const eid = LessonId.parse(id),
        q = z.string().min(1).max(1000).parse(text),
        at = stamp()
      await d.append({ t: 'confusion-added', at, id: eid, qid: uuid(), text: q })
    },
    resolveConfusion: async (id: unknown, qid: unknown) => {
      const eid = LessonId.parse(id),
        qid2 = LessonId.parse(qid)
      await d.append({ t: 'confusion-resolved', at: stamp(), id: eid, qid: qid2 })
    },
    setMastery: async (id: unknown, level: unknown) =>
      d.append({
        t: 'mastery-changed',
        at: stamp(),
        id: LessonId.parse(id),
        level: LessonEntrySchema.shape.masteryLevel.parse(level)
      }),
    archive: async (id: unknown) =>
      d.append({ t: 'lesson-archived', at: stamp(), id: LessonId.parse(id) }),
    launch: async (id: unknown, mode: unknown) => {
      const eid = LessonId.parse(id),
        forced = z.enum(['practice', 'review']).optional().parse(mode),
        e = (await entries()).find((x) => x.id === eid)
      if (!e) throw new Error('Lezione non trovata')
      let text = ''
      if (e.sourceNote) {
        const root = await d.vaultRoot()
        const { resolve, relative, isAbsolute } = await import('node:path')
        const full = resolve(root, e.sourceNote),
          rel = relative(resolve(root), full)
        if (rel && !rel.startsWith('..') && !isAbsolute(rel))
          try {
            text = await d.readNote(full)
          } catch {
            // An unavailable source note does not prevent launching from linked concepts.
          }
      }
      const result = resolveLessonLaunch(e, await d.memory(), now(), forced, text)
      if (result.kind === 'disabled') return result
      if (
        result.kind === 'practice' &&
        !result.material.conceptIds.every((x) => e.conceptIds.includes(x))
      )
        throw new Error('Filtro concetti non valido')
      let ref: string, destination: unknown
      if (result.kind === 'practice') {
        ref = await d.createPractice(result.material)
        d.retryPractice(ref)
        destination = { view: 'practice', id: ref }
      } else {
        ref = result.conceptIds.join(',')
        destination = { view: 'review', conceptIds: result.conceptIds }
      }
      await d.append({ t: 'session-launched', at: stamp(), id: eid, mode: result.kind, ref })
      return destination
    }
  }
}

const Id = z.string().uuid()
const Topic = z.string().trim().min(1).max(500)
const Text = z.string().trim().min(1).max(5000)

/** Session handlers: validate everything coming from the window, then delegate to the runner. */
export function makeSessionHandlers(runner: SessionRunner) {
  return {
    start: async (topic: unknown) => runner.create(Topic.parse(topic)),
    list: () => runner.list(),
    get: async (id: unknown) => runner.get(Id.parse(id)),
    answer: async (id: unknown, a: unknown) =>
      runner.answer(Id.parse(id), LearnerAnswerSchema.parse(a) as LearnerAnswer),
    say: async (id: unknown, text: unknown) => runner.say(Id.parse(id), Text.parse(text)),
    retry: async (id: unknown) => runner.retry(Id.parse(id))
  }
}

const NoteRequest = z
  .object({ sourcePath: z.string().min(1).max(1024).optional(), sessionId: Id.optional() })
  .strict()
  .refine((r) => r.sourcePath || r.sessionId, 'serve una nota o una sessione')

const Attempt = z
  .object({
    noteId: Id,
    prompt: z.string().max(4000),
    text: z.string().max(20_000),
    skipped: z.boolean()
  })
  .strict()
export type NoteAttempt = z.infer<typeof Attempt>

export function makeNoteHandlers(
  gen: NoteGenerator,
  recordAttempt: (a: NoteAttempt) => Promise<void>
) {
  return {
    create: async (req: unknown) => gen.create(NoteRequest.parse(req)),
    list: () => gen.list(),
    get: async (id: unknown) => gen.get(Id.parse(id)),
    retry: async (id: unknown) => gen.retry(Id.parse(id)),
    attempt: async (a: unknown) => recordAttempt(Attempt.parse(a))
  }
}

const Positions = z
  .record(z.string().max(2048), z.tuple([z.number().finite(), z.number().finite()]))
  .refine((p) => Object.keys(p).length <= 20_000, 'troppe posizioni')

export function makeGraphHandlers(
  x: Extractor,
  positions: { read(): Promise<unknown>; write(p: Record<string, [number, number]>): Promise<void> }
) {
  return {
    get: () => x.graph(),
    status: () => x.status(),
    extract: async (path: unknown, reason: unknown = 'manual') =>
      x.request(z.string().min(1).max(1024).parse(path), z.enum(['manual', 'study']).parse(reason)),
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
      await positions.write(
        keys.length > 20_000
          ? Object.fromEntries(keys.slice(-20_000).map((k) => [k, merged[k]]))
          : merged
      )
    }
  }
}

const PlanOpts = z
  .object({
    conceptIds: z.array(z.string().min(1).max(64)).max(200).optional(),
    weakest: z.boolean().optional()
  })
  .strict()
const GradeReq = z.object({
  conceptId: z.string().min(1).max(64),
  exercise: ExerciseSchema,
  answer: z.string().max(10_000),
  confidence: z.number().min(0).max(100)
})

const ExplainReq = z.object({
  conceptId: z.string().min(1).max(64),
  exercise: ExerciseSchema,
  turns: z
    .array(
      z
        .object({ by: z.enum(['andrea', 'claude']), text: z.string().trim().min(1).max(10_000) })
        .strict()
    )
    .min(1)
    .max(2 * MAX_QUESTIONS + 1),
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
export function makeVoiceHandlers(d: {
  transcribe: (bytes: Uint8Array, onStage?: (s: Stage) => void) => Promise<string>
  microphone: () => Promise<boolean>
}) {
  return {
    transcribe: async (bytes: unknown, onStage?: (s: Stage) => void) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('registrazione non valida')
      return d.transcribe(bytes, onStage)
    },
    microphone: () => d.microphone()
  }
}

const Name = z.string().trim().min(1).max(80)
const AbsPath = z
  .string()
  .min(2)
  .max(4096)
  .refine((p) => p.startsWith('/'), 'percorso non valido')
const Subject = z.string().trim().min(1).max(200)

export function makeNotebookHandlers(d: {
  store: NotebookStore
  ingest: Pick<
    Ingestor,
    'addFiles' | 'addYoutube' | 'retry' | 'remove' | 'decorate' | 'removeNotebook'
  >
  chooseFiles: () => Promise<string[]>
}) {
  async function notebook(id: unknown): Promise<string> {
    const nb = Id.parse(id)
    if (!(await d.store.notebooks()).some((n) => n.id === nb))
      throw new Error('Notebook non trovato')
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
    bucketFor: async (subject: unknown) => d.store.bucketFor(Subject.parse(subject)),
    remove: async (id: unknown) => {
      const nb = await notebook(id)
      return d.ingest.removeNotebook(nb)
    },
    addFiles: async (id: unknown, paths: unknown) => {
      const nb = await notebook(id)
      return d.ingest.addFiles(nb, z.array(AbsPath).min(1).max(200).parse(paths))
    },
    chooseFiles: async (id: unknown) => {
      const nb = await notebook(id)
      const paths = await d.chooseFiles()
      return paths.length ? d.ingest.addFiles(nb, paths) : { added: [], rejected: [] }
    },
    addYoutube: async (id: unknown, url: unknown) =>
      d.ingest.addYoutube(await notebook(id), z.string().trim().max(2048).parse(url)),
    removeSource: async (id: unknown) => d.ingest.remove((await source(id)).id),
    retrySource: async (id: unknown) => d.ingest.retry((await source(id)).id)
  }
}

const MaterialInput = MaterialSchema.strict().refine(
  (m) => m.conceptIds.length + m.sourceIds.length > 0 || m.free.trim().length > 0,
  'Scegli almeno un concetto, una fonte o scrivi un argomento'
)
const Duration = z
  .number()
  .int()
  .min(5)
  .max(300)
  .refine((n) => n % 5 === 0, 'la durata va a passi di 5 minuti')
const Points = z
  .number()
  .min(0)
  .max(30)
  .refine((n) => Number.isInteger(n * 2), 'i punti vanno a mezzi punti')
const Answers = z
  .record(z.string().max(64), z.string().max(20_000))
  .refine((a) => Object.keys(a).length <= 50, 'troppe risposte')

/** "Rolle, Lagrange, Fermat e altri 2 · 1 fonte": the label of a practice session in lists. */
export function practiceTopic(m: Material, names: Map<string, string>): string {
  const concepts = m.conceptIds.map((id) => names.get(id) ?? id)
  let head =
    concepts.slice(0, 3).join(', ') + (concepts.length > 3 ? ` e altri ${concepts.length - 3}` : '')
  if (!head && m.free.trim()) {
    const f = m.free.trim().replace(/\s+/g, ' ')
    head =
      f.length > 40
        ? f.slice(0, f.slice(0, 40).lastIndexOf(' ') > 0 ? f.slice(0, 40).lastIndexOf(' ') : 40) +
          '…'
        : f
  }
  const src = m.sourceIds.length
    ? `${m.sourceIds.length} ${m.sourceIds.length === 1 ? 'fonte' : 'fonti'}`
    : ''
  return [head, src].filter(Boolean).join(' · ') || 'Pratica'
}

export function makePracticeHandlers(d: {
  runner: Pick<PracticeRunner, 'create' | 'submit' | 'retry' | 'list'>
  exam: Pick<
    ExamService,
    'start' | 'retry' | 'save' | 'deliver' | 'get' | 'hand' | 'selfGrade' | 'calibration'
  >
  catalog: () => Promise<Catalog>
  photo: (id: string, bytes: Uint8Array) => Promise<string>
  camera: () => Promise<boolean>
}) {
  return {
    catalog: () => d.catalog(),
    create: async (m: unknown) => d.runner.create(MaterialInput.parse(m) as Material),
    submit: async (id: unknown, s: unknown) =>
      d.runner.submit(Id.parse(id), SubmissionSchema.parse(s)),
    get: async (id: unknown) => d.exam.get(Id.parse(id)),
    retry: async (id: unknown) => {
      const pid = Id.parse(id)
      return (await d.exam.get(pid)).mode === 'exam' ? d.exam.retry(pid) : d.runner.retry(pid)
    },
    list: () => d.runner.list(),
    examStart: async (m: unknown, minutes: unknown, paper?: unknown) =>
      d.exam.start(
        MaterialInput.parse(m) as Material,
        Duration.parse(minutes),
        z.boolean().optional().parse(paper) ?? false
      ),
    examSave: async (id: unknown, a: unknown) => d.exam.save(Id.parse(id), Answers.parse(a)),
    examDeliver: async (id: unknown, a: unknown) => d.exam.deliver(Id.parse(id), Answers.parse(a)),
    examHand: async (id: unknown) => d.exam.hand(Id.parse(id)),
    examSelf: async (id: unknown, problemId: unknown, points: unknown) =>
      d.exam.selfGrade(
        Id.parse(id),
        z.string().min(1).max(64).parse(problemId),
        Points.parse(points)
      ),
    calibration: () => d.exam.calibration(),
    photo: async (id: unknown, bytes: unknown) => {
      if (!(bytes instanceof Uint8Array)) throw new Error('foto non valida')
      return d.photo(Id.parse(id), bytes)
    },
    camera: () => d.camera()
  }
}
