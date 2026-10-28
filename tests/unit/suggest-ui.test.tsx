// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/renderer/src/home/Composer'
import Home from '../../src/renderer/src/home/Home'
import { PracticeSetup } from '../../src/renderer/src/practice/PracticeSetup'
import { settingsSchema } from '../../src/shared/settings-schema'

afterEach(cleanup)
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), clear: () => data.clear() })
})

const SUG = {
  learn: [{ label: 'Principio di Induzione', reason: 'prossimo passo in Analisi 1', action: { kind: 'learn' as const, topic: 'Principio di Induzione' } }],
  review: [{ label: 'Ripasso del giorno', reason: '4 concetti in scadenza', action: { kind: 'review' as const, conceptIds: ['n_a'] } }],
  practice: [{ label: 'Simulazione d’esame · Analisi 1', reason: '3 note studiate', action: { kind: 'practice' as const, conceptIds: ['n_a', 'n_b'], exam: true as const } }]
}

describe('suggestion chips in the composer', () => {
  it('show the ones of the chosen mode, with their reason, and act on click', () => {
    const onPick = vi.fn()
    render(<Composer onSubmit={vi.fn()} suggestions={SUG} onPick={onPick} />)
    const chip = screen.getByRole('button', { name: 'Principio di Induzione — prossimo passo in Analisi 1' })
    expect(chip.textContent).toContain('prossimo passo in Analisi 1')
    fireEvent.click(screen.getByRole('button', { name: 'Ripasso' }))
    expect(screen.queryByRole('button', { name: /Principio di Induzione/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ripasso del giorno — 4 concetti in scadenza' }))
    expect(onPick).toHaveBeenCalledWith(SUG.review[0].action)
  })
  it('step aside while he types, and are absent when there is nothing to suggest', () => {
    render(<Composer onSubmit={vi.fn()} suggestions={SUG} onPick={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Cosa vuoi studiare?'), { target: { value: 'Rolle' } })
    expect(screen.queryByRole('group', { name: 'Consigliati' })).toBeNull()
    cleanup()
    render(<Composer onSubmit={vi.fn()} suggestions={{ learn: [], review: [], practice: [] }} onPick={vi.fn()} />)
    expect(screen.queryByRole('group', { name: 'Consigliati' })).toBeNull()
  })
})

describe('the home acts on a chip', () => {
  function mount() {
    const settings = settingsSchema('/x').parse({})
    const start = vi.fn(async () => 'sess1')
    window.sinapsi = {
      settings: { get: vi.fn(async () => settings), set: vi.fn(), chooseVault: vi.fn() },
      vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] })), onChange: () => () => undefined },
      ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
      app: { openExternal: vi.fn() },
      session: { list: vi.fn(async () => []), start },
      suggest: { get: vi.fn(async () => SUG) }
    } as never
    const props = { onOpenSession: vi.fn(), onOpenReview: vi.fn(), onOpenPractice: vi.fn() }
    render(<Home {...props} />)
    return { start, ...props }
  }
  it('learn starts a session on the note; review and practice open with the concepts', { timeout: 10_000 }, async () => {
    const { start, onOpenSession, onOpenReview, onOpenPractice } = mount()
    const chip = (await screen.findByText('prossimo passo in Analisi 1')).closest('button')!
    expect(chip.getAttribute('aria-label')).toBe('Principio di Induzione — prossimo passo in Analisi 1')
    await act(async () => fireEvent.click(chip))
    expect(start).toHaveBeenCalledWith('Principio di Induzione')
    expect(onOpenSession).toHaveBeenCalledWith('sess1')
    const modes = within(screen.getByRole('group', { name: 'Tipo di sessione' }))
    fireEvent.click(modes.getByRole('button', { name: 'Ripasso' }))
    fireEvent.click(screen.getByRole('button', { name: /^Ripasso del giorno/ }))
    expect(onOpenReview).toHaveBeenCalledWith('', ['n_a'])
    fireEvent.click(modes.getByRole('button', { name: 'Pratica' }))
    fireEvent.click(screen.getByRole('button', { name: /^Simulazione/ }))
    expect(onOpenPractice).toHaveBeenCalledWith('', { conceptIds: ['n_a', 'n_b'], exam: true })
  })
})

describe('Pratica opened from a chip', () => {
  it('starts with those concepts chosen and the exam selected', async () => {
    const catalog = { subjects: [{ name: 'Analisi 1', notes: [{ path: '/v/A.md', title: 'A', concepts: [{ id: 'n_a', name: 'Alfa', R: null, due: false, practiced: false }, { id: 'n_z', name: 'Zeta', R: null, due: false, practiced: false }] }] }], sources: [], suggested: [{ id: 'n_z', name: 'Zeta', why: 'x' }] }
    const examStart = vi.fn(async () => 'e1')
    window.sinapsi = { practice: { catalog: vi.fn(async () => catalog), create: vi.fn(), examStart } } as never
    render(<PracticeSetup initial={{ conceptIds: ['n_a'], exam: true }} onBack={vi.fn()} onStarted={vi.fn()} />)
    await screen.findByText('Alfa')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Inizia/ })))
    expect(examStart).toHaveBeenCalledWith({ conceptIds: ['n_a'], sourceIds: [], free: '' }, 60)
  })
})
