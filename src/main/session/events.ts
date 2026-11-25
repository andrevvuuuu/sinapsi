import type { Grade, MemoryState } from '../../shared/memory-types'
import { MISCONCEPTION_CONFIDENCE, sessionGrade } from '../../shared/memory-types'
import type { LearnerAnswer, Question, TeacherTurn } from '../../shared/teacher-protocol'
import type { MinimalTree } from './minimal-tree'

import type {
  ConceptProgress,
  Evidence,
  MasterySettings,
  SessionState
} from '../../shared/session-types'

export type {
  ChatItem,
  ConceptProgress,
  Evidence,
  MasterySettings,
  SessionState,
  SessionSummary,
  Stage
} from '../../shared/session-types'

export const DEFAULT_MASTERY: MasterySettings = { kOpen: 2, kChoice: 3, solidDays: 14 }
export function isGenerativeEvidence(x: Evidence): boolean {
  return (
    (x.kind === 'open' || (x.kind === 'game' && x.gameType === 'taboo')) &&
    x.verdict !== undefined
  )
}
export type SessionEvent =
  | {
      t: 'created'
      id: string
      topic: string
      noteTitle?: string
      notePath?: string
      tree?: MinimalTree
      mastery?: MasterySettings
      candidates?: { title: string; path: string }[]
      learnerProfile?: string
      prior?: Record<string, { state: MemoryState; S?: number; seen: boolean }>
      at: number
    }
  | { t: 'learner'; text: string; answer?: LearnerAnswer; question?: Question; at: number }
  | { t: 'teacher'; turn: TeacherTurn; conversationId?: string; at: number }
  | { t: 'error'; message: string; at: number }
  | {
      t: 'graded'
      questionId: string
      verdict: 'correct' | 'partial' | 'incorrect'
      hintsUsed: number
      reason: string
      at: number
    }
  | { t: 'contested' | 'peeked' | 'flagged'; questionId: string; at: number }
  | { t: 'validated'; questionId: string; ok: boolean; at: number }
  | { t: 'cancelled'; at: number }
  | { t: 'aborted'; at: number }
  | { t: 'ungraded'; questionId: string; at: number }
  | {
      t: 'confirmed'
      notePath?: string
      noteTitle?: string
      tree?: MinimalTree
      prior?: Record<string, { state: MemoryState; S?: number; seen: boolean }>
      at: number
    }
const blank = (): ConceptProgress => ({
  status: 'unseen',
  openStreak: 0,
  choiceStreak: 0,
  lastConfidences: []
})
export function reduceSession(events: SessionEvent[]): SessionState {
  const s: SessionState = {
    id: '',
    topic: '',
    phase: 'probe',
    doneNodeIds: [],
    items: [],
    awaiting: 'learner',
    candidates: [],
    learnerProfile: '',
    hasTeacherTurn: false,
    createdAt: 0,
    updatedAt: 0,
    mastery: DEFAULT_MASTERY,
    prior: {},
    stage: 'goal',
    concepts: {},
    probeCount: 0,
    turnsSinceGame: 0,
    readyToFinish: false,
    recallDone: false,
    chunkSize: 2,
    misconceptionHits: [],
    evidence: [],
    cancelled: false,
    unverifiedIds: []
  }
  const raw: Evidence[] = []
  const exclusions = new Map<string, boolean>()
  const dontKnow = new Set<string>()
  const graded = new Map<string, Extract<SessionEvent, { t: 'graded' }>>()
  const answered = new Set<string>()
  const questionConcept = new Map<string, string>()
  const ungradedQuestionIds: string[] = []
  for (const e of events) {
    s.updatedAt = Math.max(s.updatedAt, e.at)
    switch (e.t) {
      case 'created':
        Object.assign(s, {
          id: e.id,
          topic: e.topic,
          noteTitle: e.noteTitle,
          notePath: e.notePath,
          candidates: e.candidates ?? [],
          learnerProfile: e.learnerProfile ?? '',
          tree: e.tree,
          mastery: e.mastery ?? DEFAULT_MASTERY,
          prior: e.prior ?? {},
          createdAt: e.at
        })
        s.awaiting = 'confirm'
        break
      case 'confirmed':
        s.notePath = e.notePath ?? s.notePath
        s.noteTitle = e.noteTitle ?? s.noteTitle
        s.tree = e.tree
        s.prior = e.prior ?? {}
        s.awaiting = 'teacher'
        break
      case 'learner': {
        const q = e.question ?? s.pendingQuestion,
          a = e.answer
        s.items.push({ kind: 'learner', text: e.text, answer: a, question: q })
        s.pendingQuestion = undefined
        s.lastLearnerText = e.text
        s.awaiting = 'teacher'
        if (q) {
          answered.add(q.id)
          if (q.role === 'probe') s.probeCount++
          if (q.role === 'recall') s.recallDone = true
          let correct: boolean | undefined
          const kind: Evidence['kind'] =
            q.kind === 'game' ? 'game' : q.kind === 'choice' ? 'choice' : 'open'
          let hints = 0
          const grade = graded.get(q.id)
          if (q.kind === 'choice' && a?.choice !== undefined) correct = a.choice === q.correct
          if (q.kind === 'game' && a?.game)
            correct = a.game.total > 0 && a.game.score / a.game.total >= 0.7
          if (a?.dontKnow) {
            correct = false
            dontKnow.add(q.id)
          }
          if (grade) {
            correct = grade.verdict === 'correct'
            hints = grade.hintsUsed
          }
          const gameType = q.kind === 'game' ? q.game?.type : undefined
          if (q.nodeId) questionConcept.set(q.id, q.nodeId)
          // Goal and plan questions have no concept: they are never evidence.
          if (q.nodeId && (correct !== undefined || kind === 'open'))
            raw.push({
              questionId: q.id,
              conceptId: q.nodeId,
              kind,
              gameType,
              correct: correct ?? false,
              hintsUsed: hints,
              verdict: grade?.verdict,
              confidence: a?.confidence,
              role: q.role,
              peeked: !!a?.peeked,
              excluded: !!a?.peeked || q.role === 'predict',
              at: e.at
            })
          if (kind === 'game') s.turnsSinceGame = 0
        }
        break
      }
      case 'teacher': {
        s.items.push({ kind: 'teacher', turn: e.turn })
        s.phase = e.turn.phase
        s.hasTeacherTurn = true
        if (e.conversationId) s.conversationId = e.conversationId
        if (e.turn.plan) {
          s.plan = e.turn.plan
          if (s.currentNodeId && !e.turn.plan.nodes.some((n) => n.id === s.currentNodeId))
            s.currentNodeId = undefined
        }
        if (e.turn.summary) s.summary = e.turn.summary
        const next = e.turn.question?.nodeId
        if (next) s.currentNodeId = next
        if (e.turn.question?.id && e.turn.question.nodeId)
          questionConcept.set(e.turn.question.id, e.turn.question.nodeId)
        s.pendingQuestion = e.turn.question
        s.awaiting = 'learner'
        if (s.hasTeacherTurn && s.stage === 'goal') s.stage = 'probe'
        if (e.turn.question?.role === 'plan') s.stage = 'plan'
        if (e.turn.phase === 'teach') s.stage = 'teach'
        if (e.turn.phase === 'consolidate') s.stage = 'consolidate'
        if (e.turn.phase === 'done') s.stage = 'done'
        break
      }
      case 'error':
        s.items.push({ kind: 'error', message: e.message })
        s.awaiting = 'retry'
        break
      case 'ungraded':
        ungradedQuestionIds.push(e.questionId)
        break
      case 'graded':
        graded.set(e.questionId, e)
        break
      case 'contested':
      case 'flagged':
        exclusions.set(e.questionId, true)
        break
      case 'peeked':
        exclusions.set(e.questionId, true)
        break
      case 'validated':
        if (!e.ok) exclusions.set(e.questionId, true)
        break
      case 'cancelled':
        s.cancelled = true
        break
      case 'aborted':
        s.items.push({ kind: 'error', message: 'Turno annullato' })
        s.awaiting = 'retry'
        break
    }
  }
  s.turnsSinceGame += Math.max(0, answered.size - (s.turnsSinceGame === 0 ? 1 : 0))
  s.evidence = raw.map((x) => {
    const g = graded.get(x.questionId)
    const isNonTabooGame = x.kind === 'game' && x.gameType !== 'taboo'
    const isUnjudgedTaboo = x.kind === 'game' && x.gameType === 'taboo' && !g
    return {
      ...x,
      ...(g
        ? { correct: g.verdict === 'correct', verdict: g.verdict, hintsUsed: g.hintsUsed }
        : {}),
      // An open answer the grader never judged says nothing reliable: it does not count.
      excluded:
        x.excluded ||
        exclusions.has(x.questionId) ||
        x.role === 'predict' ||
        isNonTabooGame ||
        isUnjudgedTaboo ||
        (x.kind === 'open' && !g && !dontKnow.has(x.questionId))
    }
  })
  const ungradedCounts = new Map<string, number>()
  for (const qid of ungradedQuestionIds) {
    const cid = questionConcept.get(qid) ?? raw.find((r) => r.questionId === qid)?.conceptId
    if (cid) {
      ungradedCounts.set(cid, (ungradedCounts.get(cid) ?? 0) + 1)
    }
  }
  for (const [cid, count] of ungradedCounts.entries()) {
    if (count >= 2 && !s.unverifiedIds.includes(cid)) {
      s.unverifiedIds.push(cid)
    }
  }
  const active = s.evidence.filter(
    (x) =>
      !x.excluded &&
      x.conceptId &&
      !x.conceptId.startsWith('new:') &&
      (!s.tree || s.tree.nodes.some((n) => n.id === x.conceptId))
  )
  for (const x of active) {
    if (!s.tree) {
      if (x.role === 'check' && x.correct && !s.doneNodeIds.includes(x.conceptId))
        s.doneNodeIds.push(x.conceptId)
      continue
    }
    const p = s.concepts[x.conceptId] ?? (s.concepts[x.conceptId] = blank())
    p.status = x.correct ? 'probed' : 'repairing'
    if (x.correct) {
      if (x.kind === 'open' || (x.kind === 'game' && x.gameType === 'taboo')) p.openStreak++
      else p.choiceStreak++
    } else {
      p.openStreak = 0
      p.choiceStreak = 0
      s.pendingRetest = { conceptId: x.conceptId, afterTurns: 1 }
      if ((x.confidence ?? 0) >= MISCONCEPTION_CONFIDENCE)
        s.misconceptionHits.push({
          conceptId: x.conceptId,
          questionId: x.questionId,
          text: 'Risposta errata con fiducia elevata',
          at: x.at
        })
    }
    if (x.confidence !== undefined)
      p.lastConfidences = [...p.lastConfidences, x.confidence].slice(-2)
  }
  for (const n of s.tree?.nodes ?? []) {
    const p = s.concepts[n.id] ?? (s.concepts[n.id] = blank())
    const prior = s.prior[n.id]
    const ev = active.filter((x) => x.conceptId === n.id)
    const isUnverified = s.unverifiedIds.includes(n.id)

    let mastered: boolean
    if (isUnverified) {
      const oldCold =
        prior?.state === 'la sai' && (prior.S ?? 0) >= s.mastery.solidDays && ev[0]?.correct
      mastered = p.openStreak >= s.mastery.kOpen || p.choiceStreak >= s.mastery.kChoice || oldCold
    } else {
      const hasGenerative = ev.some((x) => isGenerativeEvidence(x) && x.correct)
      const cold =
        prior?.state === 'la sai' &&
        (prior.S ?? 0) >= s.mastery.solidDays &&
        ev[0]?.correct &&
        isGenerativeEvidence(ev[0])
      mastered =
        p.openStreak >= s.mastery.kOpen ||
        (p.choiceStreak >= s.mastery.kChoice && hasGenerative) ||
        cold
    }

    if (mastered) {
      p.status = 'mastered'
      if (!s.doneNodeIds.includes(n.id)) s.doneNodeIds.push(n.id)
    }
  }
  const goals = s.tree?.goalIds ?? []
  s.readyToFinish = goals.length
    ? goals.every((id) => s.concepts[id]?.status === 'mastered') && s.recallDone
    : s.recallDone
  if (s.phase === 'done' && !s.readyToFinish) s.phase = 'consolidate'
  const cur = s.currentNodeId ? s.concepts[s.currentNodeId] : undefined
  s.chunkSize =
    cur?.status === 'repairing' ||
    !!s.tree?.nodes.find((n) => n.id === s.currentNodeId)?.weaknesses.length
      ? 1
      : (cur?.lastConfidences.length === 2 && cur.lastConfidences.every((c) => c >= MISCONCEPTION_CONFIDENCE)) ||
          s.prior[s.currentNodeId ?? '']?.state === 'la sai'
        ? 3
        : 2
  return s
}
export function checkTurnAgainst(state: SessionState, turn: TeacherTurn): string | null {
  if (turn.phase === 'done' && !state.readyToFinish && !state.cancelled)
    return "l'obiettivo non è ancora padroneggiato: continua"
  const q = turn.question
  if (q?.role === 'probe' && state.probeCount >= 3) return 'misura conclusa: passa al piano'
  if (turn.plan && state.tree?.nodes.length) {
    const ids = new Set(state.tree.nodes.map((n) => n.id))
    if (turn.plan.nodes.some((n) => !ids.has(n.id) && !/^new:/.test(n.id)))
      return 'id del piano non validi: usa gli id dell’albero o new:slug'
  }
  if (
    q &&
    ['check', 'predict', 'recall'].includes(q.role) &&
    state.tree?.nodes.length &&
    q.kind !== 'game' &&
    !q.nodeId
  )
    return 'manca nodeId'
  if (q?.kind === 'game' && state.turnsSinceGame < 2) return 'al massimo un gioco ogni tre turni'
  return null
}
export function stageInstruction(state: SessionState): string {
  const id = state.currentNodeId
  const n = state.tree?.nodes.find((x) => x.id === id)
  const mastered = state.doneNodeIds.join(', ') || 'nessuno'
  const retest = state.pendingRetest
    ? `${state.pendingRetest.conceptId} (dopo un turno su un altro concetto)`
    : 'nessuno'
  const coldGoals = (state.tree?.goalIds ?? []).filter(
    (goalId) => state.prior[goalId]?.seen && !state.evidence.some((e) => e.conceptId === goalId && e.role === 'probe')
  )
  const goalProbeInstruction = coldGoals.length
    ? `; prima di insegnare prerequisiti, fai un probe freddo sull'obiettivo già visto ${coldGoals.join(', ')}; dai priorità a questi obiettivi rispetto agli altri probe nel limite di 3`
    : ''
  const hasGenerativeCorrect =
    !!id &&
    state.evidence.some(
      (e) => !e.excluded && e.conceptId === id && isGenerativeEvidence(e) && e.correct
    )
  const openInstruction =
    id && !hasGenerativeCorrect
      ? '; per padroneggiare serve almeno una risposta aperta corretta'
      : ''
  const predictInstruction =
    id && !state.prior[id]?.seen && (state.concepts[id]?.status ?? 'unseen') === 'unseen'
      ? '; apri con una domanda di previsione (role predict) prima di spiegare'
      : ''
  return `[Stato sessione] fase: ${state.stage}; concetto: ${id ? `${id} «${n?.name ?? id}» (${state.concepts[id]?.status ?? 'unseen'})` : 'nessuno'}; passi per blocco: ${state.chunkSize}; retest da fare: ${retest}; probe rimasti: ${Math.max(0, 3 - state.probeCount)}; padroneggiati: ${mastered}; obiettivo: ${state.tree?.goalIds.join(', ') || state.topic}${goalProbeInstruction}${openInstruction}${predictInstruction}.`
}
export function fsrsEvidence(state: SessionState): {
  conceptId: string
  grade: Grade
  evidence: 'probe' | 'retest' | 'recall' | 'immediate'
  source: 'session-llm' | 'session-choice'
  confidence?: number
  correct: boolean
  at: number
}[] {
  const out: {
    conceptId: string
    grade: Grade
    evidence: 'probe' | 'retest' | 'recall' | 'immediate'
    source: 'session-llm' | 'session-choice'
    confidence?: number
    correct: boolean
    at: number
  }[] = []
  const treeNodeIds = state.tree ? new Set(state.tree.nodes.map((n) => n.id)) : null
  const validEvidences = state.evidence.filter(
    (e) =>
      !e.excluded &&
      e.conceptId &&
      !e.conceptId.startsWith('new:') &&
      (!treeNodeIds || treeNodeIds.has(e.conceptId))
  )
  for (const id of new Set(validEvidences.map((e) => e.conceptId))) {
    const es = validEvidences.filter((e) => e.conceptId === id)
    const prior = state.prior[id]?.seen
    let x: (typeof es)[number] | undefined
    let evKind: 'probe' | 'retest' | 'recall' | 'immediate'

    if (prior) {
      x = es.find((e) => e.role === 'probe')
      if (!x) continue
      evKind = (x.role === 'probe' ? 'probe' : x.role === 'recall' ? 'recall' : 'retest')
    } else {
      // Concetto nuovo (!prior.seen): scegliere es[1] ?? recall;
      // se esiste solo la prima evidenza (subito dopo la spiegazione), scriverla comunque con evidence: 'immediate'.
      const recall = es.find((e) => e.role === 'recall')
      if (es[1]) {
        x = es[1]
        evKind = x.role === 'recall' ? 'recall' : x.role === 'probe' ? 'probe' : 'retest'
      } else if (recall) {
        x = recall
        evKind = 'recall'
      } else if (es[0]) {
        x = es[0]
        evKind = 'immediate'
      } else {
        continue
      }
    }
    const verdict = x.verdict ?? (x.correct ? 'correct' : 'incorrect')
    out.push({
      conceptId: id,
      grade: sessionGrade({ verdict, hintsUsed: x.hintsUsed }),
      evidence: evKind,
      source: (x.kind === 'choice' ? 'session-choice' : 'session-llm') as
        'session-choice' | 'session-llm',
      ...(x.confidence !== undefined ? { confidence: x.confidence } : {}),
      correct: x.correct,
      at: x.at
    })
  }
  return out
}
