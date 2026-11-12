// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudyPacer } from '../../src/renderer/src/components/StudyPacer'

const MIN = 60_000
const mount = async (s: object, onEnd = vi.fn()): Promise<typeof onEnd> => {
  window.sinapsi = { settings: { get: vi.fn(async () => ({ microPauses: false, sessionLimit: false, sessionLimitMinutes: 50, ...s })) } } as never
  await act(async () => void render(<StudyPacer onEnd={onEnd} />))
  return onEnd
}
const pass = async (ms: number): Promise<void> => {
  for (let t = 0; t < ms; t += 60_000) await act(async () => void vi.advanceTimersByTime(60_000))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StudyPacer', () => {
  it('stays silent when both options are off', async () => {
    await mount({})
    await pass(120 * MIN)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('suggests a micro-pause after 10 minutes, then counts the 15-second rest down', async () => {
    await mount({ microPauses: true })
    await pass(9 * MIN)
    expect(screen.queryByText('Micro-pausa')).toBeNull()
    await pass(1 * MIN + 2000)
    expect(screen.getByText('Micro-pausa')).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Faccio la pausa' })))
    expect(screen.getByText('Pausa in corso')).toBeTruthy()
    await act(async () => void vi.advanceTimersByTime(16_000))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('nudges to close at the session limit and can grant ten more minutes', async () => {
    const onEnd = await mount({ sessionLimit: true, sessionLimitMinutes: 30 })
    await pass(30 * MIN + 2000)
    expect(screen.getByText('Limite di durata raggiunto')).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Altri 10 minuti' })))
    expect(screen.queryByRole('status')).toBeNull()
    await pass(10 * MIN + 2000)
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Chiudi la sessione' })))
    expect(onEnd).toHaveBeenCalled()
  })
})
