import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAKE_SCRIPT } from '../../src/main/session/fake-teacher'
import { createSessionRunner } from '../../src/main/session/runner'
import type { ReviewLine } from '../../src/shared/memory-types'
import type { LearnerAnswer, Question } from '../../src/shared/teacher-protocol'

// A whole session against the scripted tutor: no AI call, real event log, real finalize.
describe('session end to end with the fake tutor', () => {
  it('runs the script to the summary and writes at most one session review per concept', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-e2e-'))
    const reviews: ReviewLine[] = []
    const prompts: string[] = []
    let step = 0
    let semanticRetries = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async (r: { prompt: string; conversationId: string }) => {
          prompts.push(r.prompt)
          // A semantic retry asks for the same turn again: replay it, do not advance.
          if (r.prompt.startsWith('La risposta precedente non rispetta')) semanticRetries++
          else step++
          return {
            data: FAKE_SCRIPT[Math.min(step, FAKE_SCRIPT.length) - 1],
            conversationId: r.conversationId,
            engine: 'claude'
          }
        }
      } as never,
      vault: async () => null,
      readNote: async () => '',
      memoryStore: {
        read: async () => reviews,
        append: async (line: ReviewLine) => {
          reviews.push(line)
        }
      } as never,
      onUpdate: () => undefined
    })
    const answerFor = (q: Question): LearnerAnswer => {
      if (q.kind === 'choice') return { questionId: q.id, choice: q.correct ?? 0, confidence: 88 }
      if (q.kind === 'game')
        return {
          questionId: q.id,
          game: { score: 2, total: 2, detail: 'tutto giusto' },
          confidence: 88
        }
      return { questionId: q.id, text: 'La mia risposta.', confidence: 63 }
    }

    const id = await runner.start('teorema di Lagrange')
    for (let guard = 0; guard < 30; guard++) {
      const state = await runner.get(id)
      if (state.phase === 'done' || !state.pendingQuestion) break
      await runner.answer(id, answerFor(state.pendingQuestion))
    }
    const end = await runner.get(id)
    expect(end.phase).toBe('done')
    expect(end.summary?.learned.length).toBeGreaterThan(0)
    expect(end.items.some((i) => i.kind === 'error')).toBe(false)
    // Every turn carried the code-controlled stage instruction.
    expect(prompts.every((p) => p.length > 0)).toBe(true)
    expect(semanticRetries).toBeLessThanOrEqual(prompts.length)

    await new Promise((resolve) => setTimeout(resolve, 20))
    const concepts = reviews.map((r) => r.conceptId)
    // Goal/plan questions have no concept; ungraded open answers do not count.
    expect(concepts).not.toContain('')
    expect(concepts.length).toBeGreaterThan(0)
    expect(new Set(concepts).size).toBe(concepts.length)
    expect(reviews.every((r) => r.via === 'session' && r.grade !== 4)).toBe(true)
    const index = await readFile(join(dir, 'index.jsonl'), 'utf8').catch(() => '')
    expect(index).toContain(id)
  })
})
