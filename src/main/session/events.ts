import type { LearnerAnswer, Plan, Question, TeacherTurn } from '../../shared/teacher-protocol'

export type SessionEvent =
  | { t: 'created'; id: string; topic: string; noteTitle?: string; notePath?: string; at: number }
  | { t: 'learner'; text: string; answer?: LearnerAnswer; question?: Question; at: number }
  | { t: 'teacher'; turn: TeacherTurn; conversationId?: string; at: number }
  | { t: 'error'; message: string; at: number }

export type ChatItem =
  | { kind: 'learner'; text: string; answer?: LearnerAnswer; question?: Question }
  | { kind: 'teacher'; turn: TeacherTurn }
  | { kind: 'error'; message: string }

export type SessionState = {
  id: string
  topic: string
  noteTitle?: string
  phase: TeacherTurn['phase']
  plan?: Plan
  currentNodeId?: string
  doneNodeIds: string[]
  items: ChatItem[]
  pendingQuestion?: Question
  awaiting: 'teacher' | 'learner' | 'retry'
  summary?: TeacherTurn['summary']
  conversationId?: string
  hasTeacherTurn: boolean
  lastLearnerText?: string
  createdAt: number
  updatedAt: number
}

export type SessionSummary = { id: string; topic: string; phase: TeacherTurn['phase']; updatedAt: number }

/** Pure: the whole session state is derived from its event log. */
export function reduceSession(events: SessionEvent[]): SessionState {
  const s: SessionState = { id: '', topic: '', phase: 'probe', doneNodeIds: [], items: [], awaiting: 'learner', hasTeacherTurn: false, createdAt: 0, updatedAt: 0 }
  const correctChecks = new Set<string>()
  for (const e of events) {
    s.updatedAt = Math.max(s.updatedAt, e.at)
    switch (e.t) {
      case 'created':
        Object.assign(s, { id: e.id, topic: e.topic, noteTitle: e.noteTitle, createdAt: e.at })
        break
      case 'learner': {
        const q = e.question ?? s.pendingQuestion
        if (q?.role === 'check' && q.nodeId && e.answer?.choice !== undefined && e.answer.choice === q.correct) correctChecks.add(q.nodeId)
        s.items.push({ kind: 'learner', text: e.text, answer: e.answer, question: q })
        s.pendingQuestion = undefined
        s.lastLearnerText = e.text
        s.awaiting = 'teacher'
        break
      }
      case 'teacher': {
        const t = e.turn
        s.items.push({ kind: 'teacher', turn: t })
        s.phase = t.phase
        s.hasTeacherTurn = true
        if (e.conversationId) s.conversationId = e.conversationId
        if (t.plan) s.plan = t.plan
        if (t.summary) s.summary = t.summary
        const next = t.question?.nodeId
        if (next && next !== s.currentNodeId) {
          if (s.currentNodeId && correctChecks.has(s.currentNodeId) && !s.doneNodeIds.includes(s.currentNodeId)) s.doneNodeIds.push(s.currentNodeId)
          s.currentNodeId = next
        }
        s.pendingQuestion = t.question
        s.awaiting = 'learner'
        break
      }
      case 'error':
        s.items.push({ kind: 'error', message: e.message })
        s.awaiting = 'retry'
        break
    }
  }
  return s
}
