import { describe, expect, it } from 'vitest'
import { push, pop, replace, backLabel, MAX_STACK_SIZE, type NavStack } from '../../src/renderer/src/nav/nav-stack'

describe('nav-stack', () => {
  it('pushes items onto the stack', () => {
    let s: NavStack<{ view: string }> = [{ view: 'home' }]
    s = push(s, { view: 'review' })
    expect(s).toEqual([{ view: 'home' }, { view: 'review' }])
  })

  it('limits stack to 20 elements, discarding oldest', () => {
    let s: NavStack<{ view: string; idx: number }> = []
    for (let i = 0; i < 25; i++) {
      s = push(s, { view: 'session', idx: i })
    }
    expect(s).toHaveLength(MAX_STACK_SIZE)
    expect(s[0].idx).toBe(5)
    expect(s[s.length - 1].idx).toBe(24)
  })

  it('pops items but never reduces stack below 1 element', () => {
    let s: NavStack<{ view: string }> = [{ view: 'home' }, { view: 'map' }]
    s = pop(s)
    expect(s).toEqual([{ view: 'home' }])

    // Popping single-element stack returns the same stack
    s = pop(s)
    expect(s).toEqual([{ view: 'home' }])
    expect(s).toHaveLength(1)
  })

  it('replaces stack with a single element', () => {
    const s: NavStack<{ view: string }> = [{ view: 'home' }, { view: 'map' }, { view: 'review' }]
    const next = replace(s, { view: 'plan' })
    expect(next).toEqual([{ view: 'plan' }])
  })

  it('calculates backLabel based on prev.view', () => {
    expect(backLabel({ view: 'home' })).toBe('← Oggi')
    expect(backLabel({ view: 'map' })).toBe('← Grafo')
    expect(backLabel({ view: 'plan' })).toBe('← Piano')
    expect(backLabel({ view: 'notes' })).toBe('← Note')
    expect(backLabel({ view: 'lessons' })).toBe('← Registro')
    expect(backLabel({ view: 'review' })).toBe('← Ripasso')
    expect(backLabel({ view: 'lesson' })).toBe('← Lezione')
    expect(backLabel({ view: 'other' })).toBe('← Indietro')
    expect(backLabel({ view: 'practice' })).toBe('← Indietro')
    expect(backLabel(undefined)).toBe('← Indietro')
    expect(backLabel(null)).toBe('← Indietro')
  })
})
