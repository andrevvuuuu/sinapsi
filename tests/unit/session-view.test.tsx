// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'

afterEach(cleanup)
const ID = '11111111-1111-4111-8111-111111111111'
const base: SessionState = {
  id: ID,
  topic: 'Teorema di Lagrange',
  noteTitle: 'Teorema di Lagrange del Valor Medio',
  phase: 'plan',
  doneNodeIds: [],
  awaiting: 'learner',
  hasTeacherTurn: true,
  createdAt: 1,
  updatedAt: 1,
  plan: {
    nodes: [
      { id: 'rolle', title: 'Teorema di Rolle', status: 'known' },
      { id: 'lag', title: 'Lagrange', status: 'goal' }
    ],
    edges: [['rolle', 'lag']]
  },
  items: [
    { kind: 'learner', text: 'Voglio studiare: Lagrange' },
    {
      kind: 'teacher',
      turn: { phase: 'plan', blocks: [{ type: 'text', md: 'Partiamo da **Rolle**.' }] }
    }
  ]
}

function mount(state: SessionState, overrides?: Partial<typeof window.sinapsi.session>) {
  const retry = vi.fn(async () => undefined)
  const peek = vi.fn(async () => undefined)
  const cancel = vi.fn(async () => undefined)
  const confirm = vi.fn(async () => undefined)
  const contest = vi.fn(async () => undefined)
  const flag = vi.fn(async () => undefined)
  const end = vi.fn(async () => undefined)
  const openExternal = vi.fn(async () => undefined)
  let partialCb: ((p: { id: string; text: string }) => void) | undefined

  window.sinapsi = {
    session: {
      get: vi.fn(async () => state),
      onUpdate: () => () => undefined,
      onPartial: (cb: (p: { id: string; text: string }) => void) => {
        partialCb = cb
        return () => {}
      },
      retry,
      peek,
      cancel,
      confirm,
      contest,
      flag,
      end,
      answer: vi.fn(),
      say: vi.fn(),
      ...overrides
    },
    app: {
      openExternal
    },
    memory: {
      stats: vi.fn(async () => ({
        calibration: [
          { level: 12, n: 0, correctRate: 0 },
          { level: 37, n: 2, correctRate: 0.5 },
          { level: 63, n: 4, correctRate: 0.75 },
          { level: 88, n: 5, correctRate: 0.8 }
        ],
        againRate: {
          afterSession: { n: 6, againRate: 0.15 },
          noSession: { n: 0, againRate: 0 }
        }
      }))
    }
  } as never

  render(<SessionView id={ID} onBack={vi.fn()} />)
  return {
    retry,
    peek,
    cancel,
    confirm,
    contest,
    flag,
    end,
    openExternal,
    emitPartial: (text: string) => partialCb?.({ id: ID, text })
  }
}

describe('SessionView', () => {
  it('shows teacher text, the note chip and the plan', async () => {
    mount(base)
    expect(await screen.findByText('Rolle')).toBeTruthy()
    expect(screen.getByText(/Dalla tua nota: Teorema di Lagrange del Valor Medio/)).toBeTruthy()
    expect(screen.getByText('Teorema di Rolle')).toBeTruthy()
  })

  it('shows the typing indicator while the tutor works and can cancel via Annulla', async () => {
    const { cancel } = mount({ ...base, awaiting: 'teacher' })
    expect(await screen.findByText('Preparo…')).toBeTruthy()
    const cancelBtn = screen.getByRole('button', { name: 'Annulla' })
    fireEvent.click(cancelBtn)
    expect(cancel).toHaveBeenCalledWith(ID)
  })

  it('streams partial markdown text when onPartial fires', async () => {
    const { emitPartial, cancel } = mount({ ...base, awaiting: 'teacher' })
    expect(await screen.findByText('Preparo…')).toBeTruthy()
    emitPartial('Ecco la **spiegazione** parziale.')
    expect(await screen.findByText('spiegazione')).toBeTruthy()
    const cancelBtn = screen.getByRole('button', { name: 'Annulla' })
    fireEvent.click(cancelBtn)
    expect(cancel).toHaveBeenCalledWith(ID)
  })

  it('offers Riprova after an error', async () => {
    const { retry } = mount({
      ...base,
      awaiting: 'retry',
      items: [...base.items, { kind: 'error', message: 'Claude non risponde' }]
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(retry).toHaveBeenCalledWith(ID)
  })

  it('blurs preceding text in retrieval mode and unblurs calling peek once on Mostra lezione', async () => {
    const { peek } = mount({
      ...base,
      items: [
        { kind: 'learner', text: 'Voglio studiare: Lagrange' },
        {
          kind: 'teacher',
          turn: { phase: 'plan', blocks: [{ type: 'text', md: 'Partiamo da **Rolle**.' }] }
        },
        {
          question: {
            id: 'q-prev',
            role: 'probe',
            kind: 'choice',
            prompt: 'Precedente',
            options: ['A', 'B'],
            correct: 0
          },
          answer: { questionId: 'q-prev', choice: 0 }
        }
      ],
      awaiting: 'learner',
      stage: 'probe',
      pendingQuestion: {
        id: 'q-probe',
        role: 'probe',
        kind: 'open',
        prompt: 'Qual è la tesi?'
      }
    })
    expect(await screen.findByRole('region', { name: 'Recupero attivo' })).toBeTruthy()

    const history = document.querySelector('.history') as HTMLElement
    expect(history).toBeTruthy()
    expect(history.getAttribute('data-blurred')).toBe('true')

    const youBubble = document.querySelector('.msg.you') as HTMLElement
    expect(youBubble).toBeTruthy()
    expect(history.contains(youBubble)).toBe(true)

    const ansCard = document.querySelector('.card') as HTMLElement
    expect(ansCard).toBeTruthy()
    expect(history.contains(ansCard)).toBe(true)

    const gate = screen.getByRole('region', { name: 'Recupero attivo' })
    expect(history.contains(gate)).toBe(false)
    expect(gate.closest('.history')).toBeNull()

    const peekBtn = screen.getByRole('button', { name: 'Mostra lezione' })
    fireEvent.click(peekBtn)
    expect(peek).toHaveBeenCalledTimes(1)
    expect(peek).toHaveBeenCalledWith(ID, 'q-probe')

    expect(screen.queryByRole('region', { name: 'Recupero attivo' })).toBeNull()
    expect(history.hasAttribute('data-blurred')).toBe(false)
  })

  it('shows note confirmation card and calls confirm with note path or null', async () => {
    const { confirm } = mount({
      ...base,
      awaiting: 'confirm',
      candidates: [
        { title: 'Appunti di Analisi', path: 'analisi.md' },
        { title: 'Algebra Lineare', path: 'algebra.md' }
      ]
    })
    expect(await screen.findByText('Su quale nota lavoriamo?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Appunti di Analisi' }))
    expect(confirm).toHaveBeenCalledWith(ID, 'analisi.md')

    fireEvent.click(screen.getByRole('button', { name: 'Nessuna nota' }))
    expect(confirm).toHaveBeenCalledWith(ID, null)
  })

  it('shows verdict badge and Contesta button on open answer, calling contest', async () => {
    const { contest } = mount({
      ...base,
      evidence: [
        {
          questionId: 'q-open-1',
          conceptId: 'c1',
          kind: 'open',
          correct: false,
          verdict: 'partial',
          hintsUsed: 0,
          role: 'probe',
          peeked: false,
          excluded: false,
          at: 1
        }
      ],
      items: [
        {
          question: {
            id: 'q-open-1',
            role: 'probe',
            kind: 'open',
            prompt: 'Definisci la continuità'
          },
          answer: { questionId: 'q-open-1', text: 'Il limite coincide con il valore' }
        }
      ]
    })
    expect(await screen.findByText('parziale')).toBeTruthy()
    const contestBtn = screen.getByRole('button', { name: 'Contesta' })
    fireEvent.click(contestBtn)
    expect(contest).toHaveBeenCalledWith(ID, 'q-open-1')
    expect(await screen.findByText('contestata')).toBeTruthy()
  })

  it('shows Segnala risposta errata button on multiple choice answer, calling flag', async () => {
    const { flag } = mount({
      ...base,
      items: [
        {
          question: {
            id: 'q-mc-1',
            role: 'probe',
            kind: 'choice',
            prompt: 'Segno della derivata',
            options: ['Positiva', 'Negativa'],
            correct: 0
          },
          answer: { questionId: 'q-mc-1', choice: 0 }
        }
      ]
    })
    const flagBtn = await screen.findByRole('button', { name: 'Segnala risposta errata' })
    fireEvent.click(flagBtn)
    expect(flag).toHaveBeenCalledWith(ID, 'q-mc-1')
    expect(await screen.findByText('segnalata')).toBeTruthy()
  })

  it('shows Termina ora in header while not done, calling end', async () => {
    const { end } = mount({ ...base, phase: 'teach' })
    const endBtn = await screen.findByRole('button', { name: 'Termina ora' })
    fireEvent.click(endBtn)
    fireEvent.click(screen.getByRole('button', { name: 'Conferma' }))
    expect(end).toHaveBeenCalledWith(ID)
  })

  it('renders MinimalTree in PlanMap when present and opens obsidian on note link', async () => {
    const { openExternal } = mount({
      ...base,
      tree: {
        goalIds: ['c2'],
        nodes: [
          {
            id: 'c1',
            name: 'Derivate parziali',
            statement: 'stmt1',
            role: 'base',
            R: null,
            state: 'learning' as never,
            weaknesses: [],
            sections: {},
            birth: 'Matematica/Derivate.md',
            goal: false
          },
          {
            id: 'c2',
            name: 'Gradiente',
            statement: 'stmt2',
            role: 'derivata',
            R: null,
            state: 'learning' as never,
            weaknesses: [],
            sections: {},
            birth: 'Matematica/Gradiente.md',
            goal: true
          }
        ],
        chains: [],
        pruned: []
      },
      concepts: {
        c1: { status: 'explained', openStreak: 1, choiceStreak: 0, lastConfidences: [] },
        c2: { status: 'mastered', openStreak: 3, choiceStreak: 2, lastConfidences: [] }
      }
    })
    expect(await screen.findByText('Derivate parziali')).toBeTruthy()
    expect(screen.getByText('Gradiente')).toBeTruthy()
    expect(screen.getByText('base')).toBeTruthy()
    expect(screen.getByText('derivata')).toBeTruthy()
    expect(screen.getByText('spiegato')).toBeTruthy()
    expect(screen.getByText('padroneggiato')).toBeTruthy()

    const noteLink = screen.getByRole('button', {
      name: 'Apri nota in Obsidian: Matematica/Derivate.md'
    })
    fireEvent.click(noteLink)
    expect(openExternal).toHaveBeenCalledWith(
      'obsidian://open?path=' + encodeURIComponent('Matematica/Derivate.md')
    )
  })

  it('renders Calibrazione block in summary when phase is done', async () => {
    mount({
      ...base,
      phase: 'done',
      items: [
        {
          kind: 'teacher',
          turn: {
            phase: 'done',
            blocks: [{ type: 'text', md: 'Sessione terminata' }],
            summary: {
              learned: ['Rolle', 'Lagrange'],
              shaky: [],
              misconceptions: []
            }
          }
        }
      ]
    })
    expect(await screen.findByRole('region', { name: 'Calibrazione' })).toBeTruthy()
    expect(screen.getAllByText(/88%/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Sicuro/)).toBeTruthy()
    expect(screen.queryByText(/12%/)).toBeNull() // n=0 is hidden
    expect(screen.getByText(/Tasso Ripeti/)).toBeTruthy()
  })
})
