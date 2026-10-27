import type { Engine, Settings } from './settings-schema'
import type { VaultIndex } from './vault-types'
import type { LearnerAnswer } from './teacher-protocol'
import type { SessionState, SessionSummary } from '../main/session/events'
import type { NoteMeta, StoredNote } from '../main/notes/store'

export type { SessionState, SessionSummary, NoteMeta, StoredNote }
export type { GraphData, ExtractorStatus } from './graph-types'
export type { Memory, ReviewLine, Grade } from './memory-types'
export type { ReviewItem, ReviewPlan, GradeResult } from '../main/memory/review'
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
  graphGet: 'graph:get',
  graphExtract: 'graph:extract',
  graphStatus: 'graph:status',
  graphChanged: 'graph:changed',
  graphPositions: 'graph:positions',
  graphSavePositions: 'graph:save-positions',
  reviewPlan: 'review:plan',
  reviewGrade: 'review:grade',
  reviewRecord: 'review:record',
  reviewMemory: 'review:memory',
  reviewIntervals: 'review:intervals'
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
  review: {
    plan(opts?: { conceptIds?: string[]; weakest?: boolean }): Promise<import('../main/memory/review').ReviewPlan>
    grade(req: { conceptId: string; exercise: import('./exercise-schema').Exercise; answer: string; confidence: number }): Promise<import('../main/memory/review').GradeResult>
    record(r: import('./memory-types').ReviewLine): Promise<{ memory: import('./memory-types').Memory; intervals: Record<import('./memory-types').Grade, string> }>
    memory(): Promise<Record<string, import('./memory-types').Memory>>
    intervals(conceptId: string): Promise<Record<import('./memory-types').Grade, string>>
  }
}
