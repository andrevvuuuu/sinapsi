import type { Engine, Settings } from './settings-schema'
import type { VaultIndex } from './vault-types'
import type { LearnerAnswer } from './teacher-protocol'
import type { SessionState, SessionSummary } from '../main/session/events'
import type { NoteMeta, StoredNote } from '../main/notes/store'

export type { SessionState, SessionSummary, NoteMeta, StoredNote }
export type { GraphData, ExtractorStatus } from './graph-types'
export type { Memory, ReviewLine, Grade } from './memory-types'
export type { ReviewItem, ReviewPlan, GradeResult, ExplainResult } from '../main/memory/review'
export type { ExplainTurn } from '../main/memory/explain'
export type { Notebook, Source, SourceText, ChatTurn, Excerpt } from './notebook-types'
export type { PracticeState, PracticeSummary, PracticeItem, PracticeProblem } from '../main/practice/events'
export type { Catalog, Material } from './practice-types'
export type { ReviewSession } from '../main/memory/history'
export type { Chip, ChipAction, Suggestions } from '../main/suggest/suggest'
export type GraphPositions = Record<string, [number, number]>
export type NoteRequest = { sourcePath?: string; sessionId?: string }

export type EngineStatus = 'idle' | 'busy' | 'auth' | 'missing' | 'error'
export type VaultResult = VaultIndex | { error: 'missing' | 'unreadable'; path: string }

export const CH = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsChooseVault: 'settings:choose-vault',
  vaultIndex: 'vault:index',
  vaultChanged: 'vault:changed',
  aiStatus: 'ai:status',
  aiStatusChanged: 'ai:status-changed',
  openExternal: 'app:open-external',
  sessionStart: 'session:start',
  sessionList: 'session:list',
  sessionGet: 'session:get',
  sessionAnswer: 'session:answer',
  sessionSay: 'session:say',
  sessionRetry: 'session:retry',
  sessionUpdated: 'session:updated',
  notesCreate: 'notes:create',
  notesList: 'notes:list',
  notesGet: 'notes:get',
  notesRetry: 'notes:retry',
  notesUpdated: 'notes:updated',
  notesAttempt: 'notes:attempt',
  graphGet: 'graph:get',
  graphExtract: 'graph:extract',
  graphStatus: 'graph:status',
  graphChanged: 'graph:changed',
  graphPositions: 'graph:positions',
  graphSavePositions: 'graph:save-positions',
  reviewPlan: 'review:plan',
  reviewGrade: 'review:grade',
  reviewExplain: 'review:explain',
  voiceTranscribe: 'voice:transcribe',
  voiceMicrophone: 'voice:microphone',
  voiceStage: 'voice:stage',
  reviewRecord: 'review:record',
  reviewMemory: 'review:memory',
  reviewIntervals: 'review:intervals',
  reviewSessions: 'review:sessions',
  notebookList: 'notebook:list',
  notebookCreate: 'notebook:create',
  notebookUpdate: 'notebook:update',
  notebookRemove: 'notebook:remove',
  notebookAddFiles: 'notebook:add-files',
  notebookChooseFiles: 'notebook:choose-files',
  notebookAddYoutube: 'notebook:add-youtube',
  notebookAddVault: 'notebook:add-vault',
  notebookRemoveSource: 'notebook:remove-source',
  notebookRetrySource: 'notebook:retry-source',
  notebookText: 'notebook:text',
  notebookChat: 'notebook:chat',
  notebookAsk: 'notebook:ask',
  notebookOpenFile: 'notebook:open-file',
  notebookUpdated: 'notebook:updated',
  notebookBusy: 'notebook:busy',
  notebookRefreshSource: 'notebook:refresh-source',
  practiceCatalog: 'practice:catalog',
  practiceCreate: 'practice:create',
  practiceSubmit: 'practice:submit',
  practiceRetry: 'practice:retry',
  practiceGet: 'practice:get',
  practiceList: 'practice:list',
  practiceExamStart: 'practice:exam-start',
  practiceExamSave: 'practice:exam-save',
  practiceExamDeliver: 'practice:exam-deliver',
  practiceExamHand: 'practice:exam-hand',
  practiceExamSelf: 'practice:exam-self',
  practiceCalibration: 'practice:calibration',
  practicePhoto: 'practice:photo',
  practiceCamera: 'practice:camera',
  practiceUpdated: 'practice:updated',
  suggestGet: 'suggest:get',
  uiTransparency: 'ui:transparency',
  uiTransparencyChanged: 'ui:transparency-changed'
} as const

export interface SinapsiApi {
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
    chooseVault(): Promise<Settings>
  }
  vault: {
    index(): Promise<VaultResult>
    onChange(cb: (index: VaultIndex) => void): () => void
  }
  ai: {
    status(): Promise<Record<Engine, EngineStatus>>
    onStatus(cb: (s: Record<Engine, EngineStatus>) => void): () => void
  }
  app: { openExternal(url: string): Promise<void> }
  session: {
    start(topic: string): Promise<string>
    list(): Promise<SessionSummary[]>
    get(id: string): Promise<SessionState>
    answer(id: string, a: LearnerAnswer): Promise<void>
    say(id: string, text: string): Promise<void>
    retry(id: string): Promise<void>
    onUpdate(cb: (s: SessionState) => void): () => void
  }
  notes: {
    create(req: NoteRequest): Promise<string>
    list(): Promise<NoteMeta[]>
    get(id: string): Promise<StoredNote>
    retry(id: string): Promise<void>
    /** "Prima prova tu": what he wrote before revealing (or that he had nothing). */
    attempt(a: { noteId: string; prompt: string; text: string; skipped: boolean }): Promise<void>
    onUpdate(cb: (m: NoteMeta) => void): () => void
  }
  graph: {
    get(): Promise<import('./graph-types').GraphData>
    /** manual (default) always re-extracts; study skips a note unchanged since its last extraction. */
    extract(path: string, reason?: 'manual' | 'study'): Promise<void>
    status(): Promise<import('./graph-types').ExtractorStatus>
    onChange(cb: (e: { status: import('./graph-types').ExtractorStatus; graph?: import('./graph-types').GraphData }) => void): () => void
    positions(): Promise<GraphPositions>
    savePositions(p: GraphPositions): Promise<void>
  }
  /** Dictation into any text field, with mlx_whisper kept in memory. */
  voice: {
    /** A recording (WebM or MP4) as Italian text. */
    transcribe(bytes: Uint8Array): Promise<string>
    /** Asks macOS for the microphone. */
    microphone(): Promise<boolean>
    /** What the running transcription is doing: downloading the model, loading it, transcribing. */
    onStage(cb: (s: 'download' | 'load' | 'transcribe') => void): () => void
  }
  review: {
    plan(opts?: { conceptIds?: string[]; weakest?: boolean }): Promise<import('../main/memory/review').ReviewPlan>
    grade(req: { conceptId: string; exercise: import('./exercise-schema').Exercise; answer: string; confidence: number }): Promise<import('../main/memory/review').GradeResult>
    /** "Spiegalo tu": the whole dialogue so far, Andrea's last turn included. */
    explain(req: { conceptId: string; exercise: import('./exercise-schema').Exercise; turns: import('../main/memory/explain').ExplainTurn[]; confidence: number }): Promise<import('../main/memory/review').ExplainResult>
    record(r: import('./memory-types').ReviewLine): Promise<{ memory: import('./memory-types').Memory; intervals: Record<import('./memory-types').Grade, string> }>
    memory(): Promise<Record<string, import('./memory-types').Memory>>
    intervals(conceptId: string): Promise<Record<import('./memory-types').Grade, string>>
    /** Past Ripasso sittings, newest first. */
    sessions(): Promise<import('../main/memory/history').ReviewSession[]>
  }
  notebook: {
    list(): Promise<import('./notebook-types').Notebook[]>
    create(name: string): Promise<string>
    update(id: string, patch: { name?: string; subject?: string | null; link?: string | null }): Promise<void>
    remove(id: string): Promise<void>
    addFiles(id: string, paths: string[]): Promise<{ added: string[]; rejected: string[] }>
    chooseFiles(id: string): Promise<{ added: string[]; rejected: string[] }>
    addYoutube(id: string, url: string): Promise<string>
    addVault(id: string, path: string): Promise<string>
    removeSource(id: string): Promise<void>
    retrySource(id: string): Promise<void>
    /** Re-reads a vault note added as a source. */
    refreshSource(id: string): Promise<void>
    /** A question of this notebook is still waiting for its answer. */
    busy(id: string): Promise<boolean>
    text(sourceId: string): Promise<import('./notebook-types').SourceText | null>
    chat(id: string): Promise<import('./notebook-types').ChatTurn[]>
    /** Resolves when the answer (or the error) has been written to the chat. */
    ask(id: string, question: string, sourceIds: string[]): Promise<void>
    openFile(sourceId: string): Promise<void>
    /** Path of a dropped file (Electron's webUtils). */
    pathForFile(file: File): string
    onUpdate(cb: (e: { notebookId?: string }) => void): () => void
  }
  practice: {
    catalog(): Promise<import('./practice-types').Catalog>
    /** Returns at once; the first problem arrives through onUpdate. */
    create(material: import('./practice-types').Material): Promise<string>
    submit(id: string, s: import('./practice-protocol').Submission): Promise<void>
    retry(id: string): Promise<void>
    get(id: string): Promise<import('../main/practice/events').PracticeState>
    list(): Promise<import('../main/practice/events').PracticeSummary[]>
    /** paper: the sheet and the clock only, answers typed or photographed afterwards. */
    examStart(material: import('./practice-types').Material, minutes: number, paper?: boolean): Promise<string>
    examSave(id: string, answers: Record<string, string>): Promise<void>
    examDeliver(id: string, answers: Record<string, string>): Promise<void>
    /** Paper exam: pens down, the solutions are shown. */
    examHand(id: string): Promise<void>
    /** Paper exam: the points given to one problem before the correction (once). */
    examSelf(id: string, problemId: string, points: number): Promise<void>
    calibration(): Promise<import('./calibration').CalibrationExam[]>
    /** Transcription of the photo of a sheet (text + LaTeX). */
    photo(id: string, bytes: Uint8Array): Promise<string>
    /** Asks macOS for the camera (Continuity Camera shows the iPhone among the cameras). */
    camera(): Promise<boolean>
    onUpdate(cb: (s: import('../main/practice/events').PracticeState) => void): () => void
  }
  /** What to study, review or practise next, each with its reason (no AI). */
  suggest: { get(): Promise<import('../main/suggest/suggest').Suggestions> }
  /** macOS appearance settings the Liquid Glass material follows. */
  ui: {
    /** True when «Riduci trasparenza» is on: the glass becomes a solid surface. */
    reducedTransparency(): Promise<boolean>
    onReducedTransparency(cb: (reduced: boolean) => void): () => void
  }
}
