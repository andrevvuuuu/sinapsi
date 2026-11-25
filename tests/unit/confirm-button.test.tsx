// @vitest-environment jsdom
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ConfirmButton } from '../../src/renderer/src/components/ConfirmButton'

describe('ConfirmButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('first click does not call onConfirm, switches to confirming state with focus on Conferma', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} />)

    const btn = screen.getByRole('button', { name: 'Elimina' })
    fireEvent.click(btn)

    expect(onConfirm).not.toHaveBeenCalled()
    const confirmBtn = screen.getByRole('button', { name: 'Conferma' })
    expect(confirmBtn).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Annulla' })).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(document.activeElement).toBe(confirmBtn)
  })

  it('clicking Conferma calls onConfirm and returns to initial state', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    const confirmBtn = screen.getByRole('button', { name: 'Conferma' })
    fireEvent.click(confirmBtn)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
  })

  it('clicking Annulla cancels and returns to initial state without calling onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    const cancelBtn = screen.getByRole('button', { name: 'Annulla' })
    fireEvent.click(cancelBtn)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
  })

  it('pressing Escape cancels and returns to initial state without calling onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect(screen.getByRole('button', { name: 'Conferma' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
  })

  it('returns to initial state after 4 seconds of inactivity', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect(screen.getByRole('button', { name: 'Conferma' })).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(screen.getByRole('button', { name: 'Conferma' })).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Elimina' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
  })

  it('does nothing when disabled', () => {
    const onConfirm = vi.fn()
    render(<ConfirmButton label="Elimina" onConfirm={onConfirm} disabled />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Conferma' })).toBeNull()
  })
})
