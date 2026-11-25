// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotePeek } from '../../src/renderer/src/components/NotePeek'

afterEach(cleanup)

describe('NotePeek', () => {
  beforeEach(() => {
    window.sinapsi = {
      notes: {
        list: vi.fn(async () => []),
        get: vi.fn(),
        create: vi.fn(),
        retry: vi.fn(),
        attempt: vi.fn(),
        onUpdate: vi.fn(() => () => undefined)
      },
      graph: {
        chainSource: vi.fn(async () => null)
      }
    } as never
  })

  it('renders with role="dialog", aria-modal="false" and aria-labelledby', async () => {
    render(
      <NotePeek
        concept={{
          id: 'c1',
          name: 'Teorema fondamentale',
          statement: 'Ogni polinomio ha radici.'
        }}
        notePath="/v/Algebra.md"
        noteTitle="Algebra"
        onClose={vi.fn()}
        onOpenNote={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Teorema fondamentale' })
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('false')
    expect(dialog.getAttribute('aria-labelledby')).toBe('note-peek-title')
    expect(screen.getByText('Ogni polinomio ha radici.')).toBeTruthy()
    expect(screen.getByText('Algebra')).toBeTruthy()
  })

  it('closes on ✕ click and returns focus to opener', async () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    opener.textContent = 'Apri'
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = render(
      <NotePeek
        concept={{ id: 'c1', name: 'Concetto A' }}
        notePath="/v/Test.md"
        onClose={onClose}
        onOpenNote={vi.fn()}
        triggerRef={{ current: opener }}
      />
    )

    const closeBtn = screen.getByRole('button', { name: 'Chiudi' })
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('closes on Escape key and returns focus to opener', async () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    opener.textContent = 'Apri'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <NotePeek
        concept={{ id: 'c1', name: 'Concetto B' }}
        notePath="/v/Test.md"
        onClose={onClose}
        onOpenNote={vi.fn()}
        triggerRef={{ current: opener }}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('shows "Apri Nota Viva completa" only when a live note exists for sourcePath', async () => {
    // 1. Without live note
    const { rerender } = render(
      <NotePeek
        concept={{ id: 'c1', name: 'Concetto C' }}
        notePath="/v/NoLive.md"
        onClose={vi.fn()}
        onOpenNote={vi.fn()}
      />
    )

    // Button says 'Apri la nota'
    expect(await screen.findByRole('button', { name: 'Apri la nota' })).toBeTruthy()

    // 2. With live note
    ;(window.sinapsi.notes.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'live_1', sourcePath: '/v/HasLive.md', title: 'Nota Viva' }
    ])

    rerender(
      <NotePeek
        concept={{ id: 'c1', name: 'Concetto C' }}
        notePath="/v/HasLive.md"
        onClose={vi.fn()}
        onOpenNote={vi.fn()}
      />
    )

    expect(await screen.findByRole('button', { name: 'Apri Nota Viva completa' })).toBeTruthy()
  })
})
