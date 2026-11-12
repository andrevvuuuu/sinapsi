import { describe, expect, it } from 'vitest'
import { GRADING_RIGOR } from '../../src/main/ai/rigor'
import { buildGradePrompt } from '../../src/main/memory/grade-prompt'
import { PRACTICE_SYSTEM_PROMPT } from '../../src/main/practice/prompt'

describe('grading rigor', () => {
  it('is part of the review grader and of the practice tutor', () => {
    const prompt = buildGradePrompt({
      concept: {
        name: 'Rolle',
        statement: 'f continua su [a,b], derivabile su (a,b), f(a)=f(b) ⇒ ∃c: f′(c)=0'
      },
      exercise: {
        type: 'open',
        prompt: 'Perché serve la continuità in [a,b]?',
        answer: 'Per Weierstrass.'
      } as never,
      answer: 'Perché sì',
      confidence: 80
    })
    expect(prompt).toContain(GRADING_RIGOR)
    expect(PRACTICE_SYSTEM_PROMPT).toContain(GRADING_RIGOR)
  })
  it('asks for the first unjustified step and no benefit of the doubt', () => {
    expect(GRADING_RIGOR).toContain('primo passaggio non giustificato')
    expect(GRADING_RIGOR).toContain('beneficio del dubbio')
  })
})
