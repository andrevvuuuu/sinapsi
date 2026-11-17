// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reduceSession, type SessionEvent } from '../../src/main/session/events'
import { TEACHER_SYSTEM_PROMPT } from '../../src/main/session/prompt'
import { createSessionRunner } from '../../src/main/session/runner'
import { Composer } from '../../src/renderer/src/home/Composer'
import { SettingsDialog } from '../../src/renderer/src/home/SettingsDialog'
import { QuestionDock } from '../../src/renderer/src/session/QuestionDock'
import { renderMd } from '../../src/renderer/src/session/render-md'
import { DEFAULT_ENGINES, type Settings } from '../../src/shared/settings-schema'
import type { TeacherTurn } from '../../src/shared/teacher-protocol'

afterEach(cleanup)
const turn: TeacherTurn = {
  phase: 'probe',
  blocks: [{ type: 'text', md: 'ciao' }],
  question: { id: 'q1', role: 'goal', kind: 'open', prompt: 'Cosa vuoi?' }
}

async function runner(converse: ReturnType<typeof vi.fn>) {
  const dir = await mkdtemp(join(tmpdir(), 'sinapsi-f9s-'))
  let n = 0
  return createSessionRunner({
    bridge: { converse } as never,
    dir,
    vault: async () => null,
    readNote: async () => '',
    onUpdate: vi.fn(),
    uuid: () => `uuid-${++n}`
  })
}

describe('retries in a learning session', () => {
  it('the first turn always opens a fresh conversation, so one Riprova is enough after a quit', async () => {
    const converse = vi.fn(async (r: { conversationId: string }) => ({
      data: turn,
      conversationId: r.conversationId,
      engine: 'claude'
    }))
    const r = await runner(converse)
    const id = await r.create('derivate')
    await r.retry(id)
    expect(converse.mock.calls[0][0].conversationId).not.toBe(id)
  })
  it('a retry after a mid-session error tells the tutor it is the same message again', async () => {
    const converse = vi
      .fn()
      .mockImplementationOnce(async (r: { conversationId: string }) => ({
        data: turn,
        conversationId: r.conversationId,
        engine: 'claude'
      }))
      .mockImplementationOnce(async () => Promise.reject(new Error('timeout')))
      .mockImplementation(async (r: { conversationId: string }) => ({
        data: { ...turn, question: { ...turn.question!, id: 'q2' } },
        conversationId: r.conversationId,
        engine: 'claude'
      }))
    const r = await runner(converse)
    const id = await r.create('derivate')
    await r.retry(id)
    await r.answer(id, { questionId: 'q1', text: 'esame' })
    await r.retry(id)
    const last = converse.mock.calls.at(-1)![0] as { prompt: string; resume: boolean }
    expect(last.resume).toBe(true)
    expect(last.prompt).toMatch(
      /^\(Ripeto il mio ultimo messaggio: forse non ti è arrivato\.\)\n\nRisposta alla domanda q1/
    )
  })
})

describe('the "adesso" point of the plan', () => {
  it('leaves a node that the new plan no longer has', () => {
    const plan = (ids: string[]) => ({
      nodes: ids.map((id) => ({ id, title: id, status: 'todo' as const })),
      edges: []
    })
    const events: SessionEvent[] = [
      { t: 'created', id: 's', topic: 't', at: 1 },
      {
        t: 'teacher',
        turn: {
          phase: 'teach',
          blocks: [],
          plan: plan(['a', 'b']),
          question: { id: 'q1', role: 'predict', kind: 'open', prompt: 'p', nodeId: 'a' }
        },
        at: 2
      },
      { t: 'learner', text: 'x', at: 3 },
      {
        t: 'teacher',
        turn: {
          phase: 'teach',
          blocks: [],
          plan: plan(['b', 'c']),
          question: { id: 'q2', role: 'predict', kind: 'open', prompt: 'p' }
        },
        at: 4
      }
    ]
    expect(reduceSession(events).currentNodeId).toBeUndefined()
  })
})

describe('tutor voice', () => {
  it('does not open with "hai ragione"', () => {
    expect(TEACHER_SYSTEM_PROMPT).toMatch(/Non aprire con "hai ragione/)
  })
})

describe('math and money', () => {
  it('"costa $5 e $10" stays text, real formulas are math, and screen readers get MathML', () => {
    expect(renderMd('costa $5 e $10')).toContain('costa $5 e $10')
    const html = renderMd('vale $f(x)=x^2$.')
    expect(html).toContain('katex')
    expect(html).toContain('<math')
  })
})

describe('composer and focus', () => {
  it('says when a topic is too long instead of failing silently', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Cosa vuoi studiare?'), {
      target: { value: 'x'.repeat(501) }
    })
    expect(screen.getByText(/massimo 500 caratteri/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Inizia' }).hasAttribute('disabled')).toBe(true)
  })
  it('a new question takes the focus', () => {
    render(
      <QuestionDock
        question={{ id: 'q1', role: 'goal', kind: 'open', prompt: 'Cosa vuoi saper fare?' }}
        onAnswer={vi.fn()}
        onSay={vi.fn()}
      />
    )
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.textContent).toContain('Cosa vuoi saper fare?')
  })
})

describe('settings dialog session section', () => {
  const dummySettings: Settings = {
    theme: 'system',
    vaultPath: '/vault',
    engines: DEFAULT_ENGINES,
    backgroundExtraction: true,
    dailyExtractionLimit: 5,
    reviewSessionSize: 10,
    gamesInSessions: true,
    microPauses: false,
    sessionLimit: false,
    sessionLimitMinutes: 50,
    mastery: { kOpen: 2, kChoice: 3, solidDays: 14 },
    learnerProfile: 'Studente di Matematica',
    graderEngine: 'other',
    fastStart: false
  }

  it('renders Sessioni settings and validates kOpen bounds', async () => {
    window.sinapsi = {
      settings: {
        set: vi.fn(async (s) => ({ ...dummySettings, ...s })),
        chooseVault: vi.fn()
      },
      vault: {
        index: vi.fn(async () => ({ notes: [] }))
      }
    } as never

    render(
      <SettingsDialog
        settings={dummySettings}
        onTheme={vi.fn()}
        onSaved={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Sessioni')).toBeTruthy()
    expect(screen.getByText('Soglie padronanza')).toBeTruthy()
    expect(screen.getByLabelText(/kOpen/)).toBeTruthy()
    expect(screen.getByLabelText(/kChoice/)).toBeTruthy()
    expect(screen.getByLabelText(/solidDays/)).toBeTruthy()
    expect(screen.getByLabelText(/Profilo dello studente/)).toBeTruthy()

    // Test validation
    const kOpenInput = screen.getByLabelText(/kOpen/)
    fireEvent.change(kOpenInput, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('kOpen')
  })

  it('saves session settings when valid', async () => {
    const setSpy = vi.fn(async (s) => ({ ...dummySettings, ...s }))
    window.sinapsi = {
      settings: {
        set: setSpy,
        chooseVault: vi.fn()
      },
      vault: {
        index: vi.fn(async () => ({ notes: [] }))
      }
    } as never
    const onSaved = vi.fn()

    render(
      <SettingsDialog
        settings={dummySettings}
        onTheme={vi.fn()}
        onSaved={onSaved}
        onClose={vi.fn()}
      />
    )
    const kOpenInput = screen.getByLabelText(/kOpen/)
    fireEvent.change(kOpenInput, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))

    await screen.findByText('Salvate.')
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mastery: expect.objectContaining({ kOpen: 4 }),
        learnerProfile: 'Studente di Matematica',
        graderEngine: 'other',
        fastStart: false
      })
    )
  })
})
