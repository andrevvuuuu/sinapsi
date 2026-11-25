// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider, useAppData } from '../../src/renderer/src/shell/AppData'

afterEach(cleanup)

function Consumer(): React.JSX.Element {
  const { index, settings, aiStatus, due, lessons, notes } = useAppData()
  return (
    <div>
      <span data-testid="settings">{settings?.theme ?? 'no-theme'}</span>
      <span data-testid="notes-count">{notes.length}</span>
      <span data-testid="due">{due}</span>
      <span data-testid="lessons">{lessons.length}</span>
      <span data-testid="index">{index && 'notes' in index ? index.notes.length : 0}</span>
      <span data-testid="status">{aiStatus?.agy ?? 'none'}</span>
    </div>
  )
}

describe('AppDataProvider', () => {
  it('calls settings.get, vault.index, ai.status, lessons.list, review.memory exactly once each at mount', async () => {
    const getSettings = vi.fn(async () => ({ theme: 'lavagna', vaultPath: '/v', excludedFolders: [] }))
    const indexVault = vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [] }))
    const aiStatus = vi.fn(async () => ({ agy: 'idle', claude: 'idle' }))
    const listLessons = vi.fn(async () => [{ id: 'l1', topic: 'Test' }])
    const reviewMemory = vi.fn(async () => ({
      c1: { conceptId: 'c1', state: 'mai visto' as const, due: Date.now() - 1000, lastReview: null, reps: 0, lapses: 0, stability: 1, difficulty: 5 }
    }))
    const listNotes = vi.fn(async () => [])

    window.sinapsi = {
      settings: { get: getSettings, set: vi.fn() },
      vault: { index: indexVault, onChange: vi.fn(() => () => undefined) },
      ai: { status: aiStatus, onStatus: vi.fn(() => () => undefined) },
      lessons: { list: listLessons },
      review: { memory: reviewMemory },
      notes: { list: listNotes, onUpdate: vi.fn(() => () => undefined) },
      memory: { onChanged: vi.fn(() => () => undefined) }
    } as never

    render(
      <AppDataProvider>
        <Consumer />
      </AppDataProvider>
    )

    expect(getSettings).toHaveBeenCalledTimes(1)
    expect(indexVault).toHaveBeenCalledTimes(1)
    expect(aiStatus).toHaveBeenCalledTimes(1)
    expect(listLessons).toHaveBeenCalledTimes(1)
    expect(reviewMemory).toHaveBeenCalledTimes(1)
    expect(listNotes).toHaveBeenCalledTimes(1)

    // Check that values are delivered to consumer
    expect((await screen.findByTestId('settings')).textContent).toBe('lavagna')
    expect(screen.getByTestId('due').textContent).toBe('1')
    expect(screen.getByTestId('lessons').textContent).toBe('1')
  })
})
