// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryOf } from '../../src/main/memory/fsrs'
import { memoryBrief } from '../../src/main/session/memory-brief'
import { firstMessage, TEACHER_SYSTEM_PROMPT } from '../../src/main/session/prompt'
import { createSessionRunner } from '../../src/main/session/runner'
import { Proof } from '../../src/renderer/src/nota/blocks/Proof'
import { TryIt } from '../../src/renderer/src/nota/blocks/Practice'
import { FadeContext } from '../../src/renderer/src/nota/context'
import { fadeOf, hiddenSteps, sectionConcepts, type Fade } from '../../src/renderer/src/nota/fading'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import type { Memory } from '../../src/shared/memory-types'
import type { Block } from '../../src/shared/nota-schema'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)

const NOTE = '/v/Lagrange.md'
const concept = (id: string, name: string, section?: string, depth = 0): Concept => ({
  id,
  name,
  statement: name,
  aliases: [],
  birth: NOTE,
  notes: [NOTE],
  sections: section ? { [NOTE]: section } : {},
  depth
})
const mem = (conceptId: string, R: number | null, extra: Partial<Memory> = {}): Memory => ({
  conceptId,
  state: R === null ? 'mai visto' : R >= 0.85 ? 'la sai' : R >= 0.6 ? 'incerto' : 'debole',
  R,
  due: null,
  reps: R === null ? 0 : 3,
  lapses: 0,
  lastAt: R === null ? null : 1,
  misconception: false,
  ...extra
})
const graph: GraphData = {
  concepts: [concept('n_lag', 'Teorema di Lagrange', '§3 Dimostrazione', 2), concept('n_rolle', 'Teorema di Rolle', '§3 Dimostrazione', 1), concept('n_cont', 'Continuità', '§1 Ipotesi', 0), { ...concept('n_x', 'Altro'), notes: ['/v/Altro.md'] }],
  chains: [],
  extracted: {}
}

describe('memoryOf', () => {
  it('keeps the FSRS stability and the last grade', () => {
    const m = memoryOf([{ conceptId: 'n_a', at: 0, grade: 3 }, { conceptId: 'n_a', at: 86_400_000, grade: 1 }], 2 * 86_400_000).get('n_a')!
    expect(m.lastGrade).toBe(1)
    expect(m.stability).toBeGreaterThan(0)
  })
})

describe('memory for the tutor', () => {
  it('lists the note’s concepts, bases first, with R, S and the last outcome', () => {
    const brief = memoryBrief(graph, { n_rolle: mem('n_rolle', 0.93, { stability: 25, lastGrade: 3 }), n_lag: mem('n_lag', 0.4, { stability: 0.2, lastGrade: 1, misconception: true, lapses: 1 }) }, NOTE)
    const lines = brief.split('\n')
    expect(lines[0]).toContain('2 su 3 già visti')
    expect(lines[1]).toBe('- Continuità — mai visto')
    expect(lines[2]).toBe('- Teorema di Rolle — la sai · R 93% · S 25 g · ultimo: Bene · 3 ripassi')
    expect(lines[3]).toContain('debole · R 40% · S 5 h · ultimo: Di nuovo (sbagliato con sicurezza: misconcezione)')
    expect(lines[3]).toContain('1 dimenticanza')
    expect(brief).not.toContain('Altro')
  })
  it('is empty for a note with no concepts in the graph', () => {
    expect(memoryBrief(graph, {}, '/v/Nuova.md')).toBe('')
  })
  it('goes into the first message, and the system prompt says how to use it', () => {
    expect(firstMessage('Lagrange', { title: 'L', text: 'testo' }, 'Stato di memoria…')).toMatch(/testo\n\nStato di memoria…$/)
    expect(firstMessage('Lagrange')).toBe('Voglio studiare: Lagrange')
    expect(TEACHER_SYSTEM_PROMPT).toContain('# Memoria di Andrea')
  })
  it('the runner sends it with the note', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-fade-'))
    const prompts: string[] = []
    const index = { root: '/v', scannedAt: 0, subjects: [], notes: [{ path: NOTE, title: 'Teorema di Lagrange', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: true }] } as VaultIndex
    const asked: string[] = []
    const runner = createSessionRunner({
      dir,
      bridge: { converse: async (r: { prompt: string; conversationId: string }) => (prompts.push(r.prompt), { data: { phase: 'probe', blocks: [] }, conversationId: r.conversationId, engine: 'claude' }) } as never,
      vault: async () => index,
      readNote: async () => 'TESTO',
      onUpdate: () => undefined,
      memory: async (p) => (asked.push(p), 'Stato di memoria dei concetti: Rolle la sai')
    })
    await runner.start('teorema di lagrange')
    expect(asked).toEqual([NOTE])
    expect(prompts[0]).toContain('TESTO\n\nStato di memoria dei concetti: Rolle la sai')
  })
})

describe('backward fading', () => {
  it('fades by the weakest concept already seen', () => {
    const cs = graph.concepts.slice(0, 2)
    expect(fadeOf(cs, {})).toEqual({ stage: 0, names: [] })
    expect(fadeOf(cs, { n_rolle: mem('n_rolle', 0.5) }).stage).toBe(1)
    expect(fadeOf(cs, { n_rolle: mem('n_rolle', 0.95, { misconception: true }) }).stage).toBe(1)
    expect(fadeOf(cs, { n_rolle: mem('n_rolle', 0.7), n_lag: mem('n_lag', 0.95) }).stage).toBe(2)
    expect(fadeOf(cs, { n_rolle: mem('n_rolle', 0.9, { stability: 5 }) }).stage).toBe(3)
    expect(fadeOf(cs, { n_rolle: mem('n_rolle', 0.9, { stability: 30 }), n_lag: mem('n_lag', null) })).toEqual({ stage: 4, names: ['Teorema di Rolle'] })
  })
  it('hides from the end: one step, two, half, all', () => {
    expect([0, 1, 2, 3, 4].map((s) => hiddenSteps(s as Fade['stage'], 8))).toEqual([0, 1, 2, 4, 8])
    expect(hiddenSteps(3, 4)).toBe(3)
    expect(hiddenSteps(2, 1)).toBe(1)
  })
  it('finds the section’s concepts, or the whole note’s', () => {
    expect(sectionConcepts(graph, NOTE, { num: '§3', title: 'Dimostrazione' }).map((c) => c.id)).toEqual(['n_lag', 'n_rolle'])
    expect(sectionConcepts(graph, NOTE, { num: '', title: 'Ipotesi' }).map((c) => c.id)).toEqual(['n_cont'])
    expect(sectionConcepts(graph, NOTE, { num: '§9', title: 'Esempi' }).map((c) => c.id)).toEqual(['n_lag', 'n_rolle', 'n_cont'])
    // The extraction may name the section by number only.
    const byNum: GraphData = { ...graph, concepts: [concept('a', 'A', '§3'), concept('b', 'B', '§2')] }
    expect(sectionConcepts(byNum, NOTE, { num: '§3', title: 'Dimostrazione' }).map((c) => c.id)).toEqual(['a'])
  })

  const proof: Extract<Block, { type: 'proof' }> = {
    type: 'proof',
    steps: [
      { title: 'Strategia', md: 'Ridurre a Rolle.' },
      { title: 'Secante', md: 'La retta.', tryPrompt: 'Che retta?' },
      { title: 'Scarto', md: 'g = f − sec.' }
    ]
  }
  const withFade = (fade: Fade | null, el: React.JSX.Element): React.JSX.Element => <FadeContext.Provider value={fade}>{el}</FadeContext.Provider>

  it('covers the last steps and lets him uncover each one', () => {
    render(withFade({ stage: 2, names: ['Teorema di Rolle'] }, <Proof block={proof} mode="leggi" observe={() => () => undefined} />))
    expect(screen.getByText('Ridurre a Rolle.')).toBeTruthy()
    expect(screen.queryByText('La retta.')).toBeNull()
    expect(screen.queryByText('g = f − sec.')).toBeNull()
    expect(screen.getByText(/Gli ultimi 2 passi sono nascosti/).textContent).toContain("«Teorema di Rolle» l'hai già ripassato")
    expect(screen.getByText('Che retta?')).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText('La tua risposta')[1], { target: { value: 'la secante' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Scopri il passo' })[1])
    expect(screen.getByText('g = f − sec.')).toBeTruthy()
    expect(screen.queryByText('La retta.')).toBeNull()
  })
  it('shows the whole proof on request', () => {
    render(withFade({ stage: 4, names: ['A', 'B'] }, <Proof block={proof} mode="leggi" observe={() => () => undefined} />))
    expect(screen.getByText(/La dimostrazione è nascosta/)).toBeTruthy()
    expect(screen.queryByText('Ridurre a Rolle.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mostra tutta la dimostrazione' }))
    expect(screen.getByText('Ridurre a Rolle.')).toBeTruthy()
    expect(screen.getByText('g = f − sec.')).toBeTruthy()
  })
  it('leaves a proof of new concepts worked in full', () => {
    render(withFade({ stage: 0, names: [] }, <Proof block={proof} mode="leggi" observe={() => () => undefined} />))
    expect(screen.getByText('g = f − sec.')).toBeTruthy()
    expect(screen.queryByText(/nascost/)).toBeNull()
  })
  it('turns "Prova da solo" on by itself for concepts already seen', () => {
    const tryit: Extract<Block, { type: 'tryit' }> = { type: 'tryit', prompt: 'Calcola $c$.', solution: 'Viene 1.' }
    render(withFade({ stage: 1, names: ['A'] }, <TryIt block={tryit} mode="leggi" />))
    expect(screen.queryByText('Viene 1.')).toBeNull()
    cleanup()
    render(withFade({ stage: 0, names: [] }, <TryIt block={tryit} mode="leggi" />))
    expect(screen.getByText('Viene 1.')).toBeTruthy()
  })
})
