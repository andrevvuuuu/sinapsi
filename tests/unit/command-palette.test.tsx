// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CommandPalette,
  scoreMatch,
  isSubsequence,
  normalize
} from '../../src/renderer/src/shell/CommandPalette'
import { AppDataProvider } from '../../src/renderer/src/shell/AppData'
import { AppShell } from '../../src/renderer/src/shell/AppShell'

afterEach(cleanup)

describe('CommandPalette filtering and scoring', () => {
  it('normalizes strings removing accents and case', () => {
    expect(normalize('Proprietà')).toBe('proprieta')
    expect(normalize('ÀÈÌÒÙ')).toBe('aeiou')
  })

  it('matches subsequences correctly', () => {
    expect(isSubsequence('trm', 'teorema')).toBe(true)
    expect(isSubsequence('trolle', 'teorema di rolle')).toBe(true)
    expect(isSubsequence('xyz', 'teorema')).toBe(false)
  })

  it('ranks prefix > word prefix > substring > subsequence', () => {
    // Prefix
    expect(scoreMatch('teo', 'Teorema')).toBe(1)
    // Word prefix
    expect(scoreMatch('rol', 'Teorema di Rolle')).toBe(2)
    // Substring
    expect(scoreMatch('orema', 'Teorema')).toBe(3)
    // Subsequence without accents
    expect(scoreMatch('trolle', 'Teorema di Rolle')).toBe(4)
    expect(scoreMatch('prop', 'Proprietà di Cauchy')).toBe(1)
    expect(scoreMatch('cau', 'Proprietà di Cauchy')).toBe(2)
    expect(scoreMatch('cauc', 'Proprietà di Cauchy')).toBe(2)
  })
})

describe('CommandPalette component', () => {
  const mockNote = {
    path: '/vault/Matematica/Teorema di Rolle.md',
    title: 'Teorema di Rolle',
    aliases: ['Rolle'],
    folder: 'Matematica',
    tags: [],
    links: [],
    headings: [],
    blockIds: [],
    subject: null,
    mtime: 0,
    size: 0,
    available: true
  }

  const mockApi = {
    settings: { get: vi.fn(async () => ({ theme: 'lavagna', vaultPath: '/v', excludedFolders: [] })), set: vi.fn() },
    vault: { index: vi.fn(async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [mockNote] })), onChange: () => () => undefined },
    ai: { status: vi.fn(async () => ({ agy: 'idle', claude: 'idle' })), onStatus: () => () => undefined },
    lessons: { list: vi.fn(async () => [{ id: 'l1', topic: 'Algebra Lineare' }]) },
    review: { memory: vi.fn(async () => ({})) },
    notes: { list: vi.fn(async () => []), onUpdate: () => () => undefined },
    graph: { get: vi.fn(async () => ({ concepts: [{ id: 'c1', name: 'Derivata' }] })), onChange: () => () => undefined }
  }

  it('finds a note by subsequence without accents, navigates with ↓ and executes with Enter, closes on Esc', async () => {
    window.sinapsi = mockApi as never

    const onOpenSource = vi.fn()
    const onClose = vi.fn()

    render(
      <AppDataProvider>
        <CommandPalette
          onClose={onClose}
          onOpenSource={onOpenSource}
          onStudy={vi.fn()}
          onMapReview={vi.fn()}
          onLesson={vi.fn()}
          onReview={vi.fn()}
          onPractice={vi.fn()}
          onNavigate={vi.fn()}
          onNotes={vi.fn()}
          onLessons={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </AppDataProvider>
    )

    const input = screen.getByRole('combobox')
    expect(input).toBe(document.activeElement)

    // Type query with subsequence "trolle"
    fireEvent.change(input, { target: { value: 'trolle' } })

    // Should find "Teorema di Rolle"
    expect(await screen.findByText('Teorema di Rolle')).toBeTruthy()

    // Keydown ArrowDown + Enter
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenSource).toHaveBeenCalledWith('/vault/Matematica/Teorema di Rolle.md')
    expect(onClose).toHaveBeenCalled()

    // Test Esc closes
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('⌘K in AppShell opens CommandPalette, and Esc closes it', async () => {
    window.sinapsi = mockApi as never

    const { queryByRole } = render(
      <AppDataProvider>
        <AppShell
          view="home"
          onNavigate={vi.fn()}
          onHome={vi.fn()}
          onReview={vi.fn()}
          onPractice={vi.fn()}
          onOpenSource={vi.fn()}
          onLesson={vi.fn()}
          onLessons={vi.fn()}
          onNotes={vi.fn()}
          index={null}
          livePaths={[]}
          onSettingsChanged={vi.fn()}
          onStudy={vi.fn()}
          onMapReview={vi.fn()}
        >
          <div>Shell Content</div>
        </AppShell>
      </AppDataProvider>
    )

    // Palette is initially closed
    expect(queryByRole('combobox')).toBeNull()

    // Press ⌘K
    fireEvent.keyDown(window, { key: 'k', metaKey: true })

    // Palette is now open
    expect(await screen.findByRole('combobox')).toBeTruthy()

    // Press Esc
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })

    // Palette is closed
    expect(queryByRole('combobox')).toBeNull()
  })
})
