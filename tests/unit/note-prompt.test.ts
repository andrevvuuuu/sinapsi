import { describe, expect, it } from 'vitest'
import { buildNotePrompt, sessionDigest } from '../../src/main/notes/prompt'
import { reduceSession, type SessionEvent } from '../../src/main/session/events'
import { NOTA_FORMAT } from '../../src/shared/nota-schema'
import type { Question } from '../../src/shared/teacher-protocol'

const check: Question = { id: 'q1', role: 'check', kind: 'choice', prompt: 'Quanti punti c?', options: ['Uno solo', 'Almeno uno'], correct: 1, why: ['no', 'sì'] }
const predict: Question = { id: 'q2', role: 'predict', kind: 'open', prompt: 'Che funzione costruiresti?' }
const events: SessionEvent[] = [
  { t: 'created', id: 'a', topic: 'Lagrange', noteTitle: 'Teorema di Lagrange', notePath: '/v/Lagrange.md', at: 1 },
  { t: 'learner', text: 'inizio', at: 2 },
  { t: 'learner', text: 'r1', answer: { questionId: 'q1', choice: 0, confidence: 80, text: 'perché è vicino a b' }, question: check, at: 3 },
  { t: 'learner', text: 'r2', answer: { questionId: 'q2', text: 'tolgo la retta così agli estremi fa zero' }, question: predict, at: 4 },
  {
    t: 'teacher',
    turn: { phase: 'done', blocks: [{ type: 'text', md: 'fine' }], summary: { learned: ['la funzione scarto'], shaky: ['il passo 5'], misconceptions: ['c è unico'] } },
    at: 5
  }
]

describe('sessionDigest', () => {
  const s = reduceSession(events)
  it('keeps the note path in the session state', () => {
    expect(s.notePath).toBe('/v/Lagrange.md')
  })
  it('turns answers into session-layer lines', () => {
    const d = sessionDigest(s)
    expect(d).toContain('Argomento: Lagrange')
    expect(d).toMatch(/^errore: .*Quanti punti c\?.*Uno solo.*80%/m)
    expect(d).toMatch(/^parole: perché è vicino a b/m)
    expect(d).toMatch(/^previsione: .*Che funzione costruiresti\?.*tolgo la retta/m)
    expect(d).toContain('Hai imparato: la funzione scarto')
    expect(d).toContain('Ancora incerto: il passo 5')
    expect(d).toContain('Misconcezioni: c è unico')
  })
  it('does not report a wrong answer given with low confidence as an error', () => {
    const low = reduceSession(events.map((e) => (e.t === 'learner' && e.answer?.questionId === 'q1' ? { ...e, answer: { ...e.answer, confidence: 30 } } : e)))
    expect(sessionDigest(low)).not.toMatch(/^errore:/m)
  })
  it('is capped at 8000 characters', () => {
    const many: SessionEvent[] = [events[0]]
    for (let i = 0; i < 200; i++) many.push({ t: 'learner', text: 'x', answer: { questionId: 'q2', text: 'a'.repeat(300) }, question: predict, at: 10 + i })
    expect(sessionDigest(reduceSession(many)).length).toBeLessThanOrEqual(8000)
  })
})

describe('buildNotePrompt', () => {
  it('contains the note, the format and the no-tools instruction', () => {
    const p = buildNotePrompt({ noteTitle: 'Teorema di Rolle', noteText: '## 1. Enunciato\ntesto' })
    expect(p).toContain('Teorema di Rolle')
    expect(p).toContain(NOTA_FORMAT)
    expect(p).toContain('## 1. Enunciato')
    expect(p).toContain('Non usare strumenti')
    expect(p).not.toContain('SESSIONE DI STUDIO')
  })
  it('truncates a very long note', () => {
    const p = buildNotePrompt({ noteTitle: 'Lunga', noteText: 'a'.repeat(70_000) })
    expect(p).toContain('[…nota troncata]')
    expect(p).not.toContain('a'.repeat(60_001))
  })
  it('adds the session digest when there is a session', () => {
    const p = buildNotePrompt({ noteTitle: 'Teorema di Lagrange', noteText: 't', session: reduceSession(events) })
    expect(p).toContain('SESSIONE DI STUDIO')
    expect(p).toContain('tolgo la retta')
  })
})
