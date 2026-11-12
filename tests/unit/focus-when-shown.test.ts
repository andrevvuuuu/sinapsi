// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusWhenShown } from '../../src/renderer/src/components/glass-theme'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** jsdom has no frames of its own: the queued frames are run by hand. */
function frames(): () => void {
  const queue: FrameRequestCallback[] = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb))
  return () => queue.splice(0).forEach((cb) => cb(0))
}

describe('focusWhenShown', () => {
  it('focuses the element once it can take the focus', () => {
    const run = frames()
    const target = document.body.appendChild(document.createElement('button'))
    target.style.visibility = 'hidden'
    const refuse = vi.spyOn(target, 'focus').mockImplementation(() => undefined)
    focusWhenShown(target)
    expect(document.activeElement).not.toBe(target)
    refuse.mockRestore()
    run()
    expect(document.activeElement).toBe(target)
  })

  it('gives up when the focus moves elsewhere first, and never pulls it back', () => {
    const run = frames()
    const target = document.body.appendChild(document.createElement('button'))
    const other = document.body.appendChild(document.createElement('input'))
    const refuse = vi.spyOn(target, 'focus').mockImplementation(() => undefined)
    focusWhenShown(target)
    refuse.mockRestore()
    other.focus()
    run()
    run()
    expect(document.activeElement).toBe(other)
  })
})
