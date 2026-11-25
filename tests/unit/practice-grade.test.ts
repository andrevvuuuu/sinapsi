import { describe, expect, it, vi } from 'vitest'
import { gradePracticeProblem } from '../../src/main/practice/grade'

describe('gradePracticeProblem', () => {
  it('uses the grade task without a transcript and returns an item for each target', async () => {
    const ask = vi.fn(async (request: { task: string; priority: string; cache: boolean; prompt: string; schema: { parse(value: unknown): unknown } }) => ({
      data: request.schema.parse({ items: [{ conceptId: 'n1', state: 'errore_qui', miss: 'execution' }] }), fromCache: false, engine: 'claude' as const
    }))
    const items = await gradePracticeProblem({ ask } as never, {
      statement: 'Problema', modelSolution: 'Soluzione', finalAnswer: 'Risposta finale', maxRung: 2, hintConcepts: ['n1'], attempts: 1,
      targets: [{ id: 'n1', name: 'Concetto', statement: 'Enunciato' }, { id: 'n2', name: 'Altro', statement: 'Altro enunciato' }]
    })
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ task: 'grade', priority: 'background', cache: false }))
    expect(ask.mock.calls[0][0].prompt).toContain('Risposta finale')
    expect(ask.mock.calls[0][0].prompt).toContain('hai solo la risposta finale')
    expect(items).toEqual([{ conceptId: 'n1', state: 'errore_qui', miss: 'execution' }, { conceptId: 'n2', state: 'non_attribuibile' }])
  })
})
