import { describe, expect, it, vi } from 'vitest'
import { makeSessionHandlers } from '../../src/main/ipc-handlers'
import type { SessionRunner } from '../../src/main/session/runner'

const ID = '11111111-1111-4111-8111-111111111111'
function setup() {
  const runner: SessionRunner = {
    create: vi.fn(async () => ID),
    start: vi.fn(async () => ID),
    answer: vi.fn(async () => undefined),
    say: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    get: vi.fn(async () => ({}) as never),
    list: vi.fn(async () => [])
  }
  return { runner, h: makeSessionHandlers(runner) }
}

describe('session handlers', () => {
  it('starts a session with a valid topic', async () => {
    const { h } = setup()
    expect(await h.start('Teorema di Lagrange')).toBe(ID)
  })
  it('rejects an empty topic', async () => {
    await expect(setup().h.start('  ')).rejects.toThrow()
  })
  it('rejects ids that are not UUIDs', async () => {
    await expect(setup().h.get('../../etc/passwd')).rejects.toThrow()
  })
  it('rejects confidence above 100', async () => {
    await expect(setup().h.answer(ID, { questionId: 'q1', choice: 0, confidence: 120 })).rejects.toThrow()
  })
  it('passes a valid answer to the runner', async () => {
    const { h, runner } = setup()
    await h.answer(ID, { questionId: 'q1', choice: 0, confidence: 70 })
    expect(runner.answer).toHaveBeenCalledWith(ID, { questionId: 'q1', choice: 0, confidence: 70 })
  })
})
