// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LaunchButton } from '../../src/renderer/src/lessons/LaunchButton'
import type { LessonEntry } from '../../src/shared/lesson-types'

const lesson = (nextMode: LessonEntry['nextMode'], launchReason?: string): LessonEntry => ({
  id: '00000000-0000-4000-8000-000000000001',
  schema: 1,
  date: '2026-11-12',
  courseId: 'Analisi',
  topic: 'Limiti',
  prerequisites: [],
  core8020: [],
  pacerType: 'C',
  conceptIds: ['limiti'],
  confusionQuestions: [],
  activeMisconceptions: [],
  masteryLevel: 'unknown',
  highYieldResources: [],
  digest: { digest: null, recall24h: null, weekly: null },
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
  nextMode,
  launchReason
})

describe('LaunchButton', () => {
  afterEach(cleanup)
  it('shows the reason when launch is disabled', () => {
    Object.defineProperty(window, 'sinapsi', {
      configurable: true,
      value: { lessons: { launch: vi.fn() } }
    })
    render(
      <LaunchButton
        lesson={lesson('disabled', 'Collega almeno un concetto')}
        onLaunched={vi.fn()}
      />
    )
    expect(screen.getByText('Collega almeno un concetto')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Avvia/ })).toHaveProperty('disabled', true)
  })

  it('launches and returns the destination', async () => {
    const onLaunched = vi.fn()
    const destination = { view: 'review' as const, conceptIds: ['limiti'] }
    const launch = vi.fn().mockResolvedValue(destination)
    Object.defineProperty(window, 'sinapsi', { configurable: true, value: { lessons: { launch } } })
    render(<LaunchButton lesson={lesson('review')} onLaunched={onLaunched} />)
    fireEvent.click(screen.getByRole('button', { name: 'Avvia sessione · Ripasso' }))
    await waitFor(() => expect(launch).toHaveBeenCalledWith(lesson('review').id, undefined))
    await waitFor(() => expect(onLaunched).toHaveBeenCalledWith(destination))
  })
})
