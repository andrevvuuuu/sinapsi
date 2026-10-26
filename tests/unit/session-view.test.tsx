// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'

afterEach(cleanup)
const ID = '11111111-1111-4111-8111-111111111111'
const base: SessionState = {
  id: ID, topic: 'Teorema di Lagrange', noteTitle: 'Teorema di Lagrange del Valor Medio', phase: 'plan', doneNodeIds: [], awaiting: 'learner', hasTeacherTurn: true, createdAt: 1, updatedAt: 1,
  plan: { nodes: [{ id: 'rolle', title: 'Teorema di Rolle', status: 'known' }, { id: 'lag', title: 'Lagrange', status: 'goal' }], edges: [['rolle', 'lag']] },
  items: [{ kind: 'learner', text: 'Voglio studiare: Lagrange' }, { kind: 'teacher', turn: { phase: 'plan', blocks: [{ type: 'text', md: 'Partiamo da **Rolle**.' }] } }]
}
function mount(state: SessionState) {
  const retry = vi.fn(async () => undefined)
  window.sinapsi = { session: { get: vi.fn(async () => state), onUpdate: () => () => undefined, retry, answer: vi.fn(), say: vi.fn() } } as never
  render(<SessionView id={ID} onBack={vi.fn()} />)
  return { retry }
}

describe('SessionView', () => {
  it('shows teacher text, the note chip and the plan', async () => {
    mount(base)
    expect(await screen.findByText('Rolle')).toBeTruthy()
    expect(screen.getByText(/Dalla tua nota: Teorema di Lagrange del Valor Medio/)).toBeTruthy()
    expect(screen.getByText('Teorema di Rolle')).toBeTruthy()
  })
  it('shows the typing indicator while the tutor works', async () => {
    mount({ ...base, awaiting: 'teacher' })
    expect(await screen.findByText('Il tutor sta pensando…')).toBeTruthy()
  })
  it('offers Riprova after an error', async () => {
    const { retry } = mount({ ...base, awaiting: 'retry', items: [...base.items, { kind: 'error', message: 'Claude non risponde' }] })
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(retry).toHaveBeenCalledWith(ID)
  })
})
