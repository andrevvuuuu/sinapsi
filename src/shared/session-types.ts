import type { MemoryState } from './memory-types'
import type { Game, LearnerAnswer, Plan, Question, TeacherTurn } from './teacher-protocol'

export type TreeNode = {
  id: string
  name: string
  statement: string
  role: 'base' | 'derivata'
  R: number | null
  S?: number
  state: MemoryState
  weaknesses: string[]
  sections: Record<string, string>
  birth: string
  goal: boolean
}

export type MinimalTree = {
  goalIds: string[]
  nodes: TreeNode[]
  chains: { premises: string[]; conclusion: string }[]
  pruned: string[]
}

export type MasterySettings = { kOpen: number; kChoice: number; solidDays: number }
export type Stage = 'goal' | 'probe' | 'plan' | 'teach' | 'repair' | 'consolidate' | 'done'

export type ConceptProgress = {
  status: 'unseen' | 'explained' | 'probed' | 'repairing' | 'mastered'
  openStreak: number
  choiceStreak: number
  lastConfidences: number[]
}

export type Evidence = {
  questionId: string
  conceptId: string
  kind: 'open' | 'choice' | 'game'
  gameType?: Game['type']
  correct: boolean
  verdict?: 'correct' | 'partial' | 'incorrect'
  hintsUsed: number
  confidence?: number
  role: string
  peeked: boolean
  excluded: boolean
  at: number
}

export type ChatItem =
  | { kind: 'learner'; text: string; answer?: LearnerAnswer; question?: Question }
  | { kind: 'teacher'; turn: TeacherTurn }
  | { kind: 'error'; message: string }

export type SessionState = {
  id: string
  topic: string
  noteTitle?: string
  notePath?: string
  phase: TeacherTurn['phase']
  plan?: Plan
  currentNodeId?: string
  doneNodeIds: string[]
  items: ChatItem[]
  pendingQuestion?: Question
  awaiting: 'teacher' | 'learner' | 'retry' | 'confirm'
  candidates: { title: string; path: string }[]
  learnerProfile: string
  summary?: TeacherTurn['summary']
  conversationId?: string
  hasTeacherTurn: boolean
  lastLearnerText?: string
  createdAt: number
  updatedAt: number
  tree?: MinimalTree
  mastery: MasterySettings
  prior: Record<string, { state: MemoryState; S?: number; seen: boolean }>
  stage: Stage
  concepts: Record<string, ConceptProgress>
  probeCount: number
  turnsSinceGame: number
  pendingRetest?: { conceptId: string; afterTurns: number }
  readyToFinish: boolean
  recallDone: boolean
  chunkSize: 1 | 2 | 3
  misconceptionHits: { conceptId?: string; questionId: string; text: string; at: number }[]
  evidence: Evidence[]
  cancelled: boolean
  unverifiedIds: string[]
}

export type SessionSummary = {
  id: string
  topic: string
  phase: TeacherTurn['phase']
  notePath?: string
  updatedAt: number
  status?: 'completed' | 'cancelled' | 'abandoned'
}
