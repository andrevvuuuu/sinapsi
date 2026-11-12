// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConfidencePanel } from '../../src/renderer/src/review/ConfidencePanel'

afterEach(cleanup)
it('shows a clear empty state', async () => {
  window.sinapsi = { review: { calibration: vi.fn(async () => ({ overall: { n: 0, meanConfidence: 0, accuracy: 0, gap: 0 }, groups: [], confidentErrors: [] })), memory: vi.fn(async () => ({})) } } as never
  render(<ConfidencePanel onClinic={vi.fn()} />)
  expect(await screen.findByText(/Ancora nessuna risposta/)).toBeTruthy()
})
it('shows calibration and confident errors', async () => {
  window.sinapsi = { review: { calibration: vi.fn(async () => ({ overall: { n: 5, meanConfidence: 80, accuracy: 50, gap: 30 }, groups: [{ key: 'Matematica', n: 5, meanConfidence: 80, accuracy: 50, gap: 30 }], confidentErrors: [{ conceptId: 'c', name: 'Teorema', at: 1, confidence: 90 }] })), memory: vi.fn(async () => ({ c: { misconception: true } })) } } as never
  render(<ConfidencePanel onClinic={vi.fn()} />)
  expect((await screen.findAllByText(/più sicuro/)).length).toBeGreaterThan(0)
  expect(screen.getByText(/Teorema/)).toBeTruthy()
})
