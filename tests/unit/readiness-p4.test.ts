import { describe, expect, it } from 'vitest'
import { readinessFor } from '../../src/main/planner/readiness'
import type { ExamEntry } from '../../src/shared/exam-types'
import type { LessonEntry } from '../../src/shared/lesson-types'
import type { Memory, ReviewLine } from '../../src/shared/memory-types'

const now = Date.parse('2026-11-12T12:00:00Z')
const exam: ExamEntry = { id:'11111111-1111-4111-8111-111111111111', courseId:'A', date:'2026-12-01', createdAt:new Date(now).toISOString(), updatedAt:new Date(now).toISOString() }
const lesson: LessonEntry = { id:'22222222-2222-4222-8222-222222222222', schema:1, date:'2026-11-12', courseId:'A', topic:'T', prerequisites:[], core8020:[], pacerType:'C', conceptIds:['c1','c2'], confusionQuestions:[{id:'33333333-3333-4333-8333-333333333333',text:'?',status:'resolved'}], activeMisconceptions:[], masteryLevel:'known', highYieldResources:[], digest:{digest:null,recall24h:null,weekly:null}, createdAt:new Date(now).toISOString(), updatedAt:new Date(now).toISOString() }
const review = (conceptId: string, patch: Partial<ReviewLine> = {}): ReviewLine => ({ conceptId, at:now, grade:3, ...patch })
const base = (patch: Partial<Parameters<typeof readinessFor>[0]> = {}) => readinessFor({ exam, lessons:[lesson], memories:{}, reviews:[], examResults:[], now, ...patch })

describe('readinessFor', () => {
  it('calculates the five signals, the mean of measured values and correct status thresholds', () => {
    const memories: Record<string, Memory> = { c1:{conceptId:'c1',state:'la sai',R:1,due:null,reps:1,lapses:0,lastAt:now,misconception:false}, c2:{conceptId:'c2',state:'la sai',R:1,due:null,reps:1,lapses:0,lastAt:now,misconception:false} }
    const result = base({ memories, reviews:[review('c1',{misconception:true}),review('c1',{type:'explain',correct:true}),review('c2',{type:'explain',correct:false})], examResults:[{conceptIds:['c1'],total:30,at:now}] })
    expect(result.signals.map((signal) => signal.key)).toEqual(['papers','errors','network','teach','doubts'])
    expect(result.signals.map((signal) => signal.value)).toEqual([1,1,1,0.5,1])
    expect(result.score).toBe(0.9)
    expect(result.status).toBe('pronto')
    expect(base({ memories:{}, reviews:[review('c1',{type:'explain',correct:false}),review('c2',{type:'explain',correct:false})] }).status).toBe('non ancora')
  })

  it('returns null signals where evidence is missing and da misurare when every signal is null', () => {
    const result = readinessFor({ exam, lessons:[], memories:{}, reviews:[], examResults:[], now })
    expect(result.signals.every((signal) => signal.value === null)).toBe(true)
    expect(result.score).toBeNull()
    expect(result.status).toBe('da misurare')
  })

  it('classifies scores at 0.6 as quasi and 0.8 as pronto', () => {
    const quasi = base({
      memories:{ c1:{conceptId:'c1',state:'la sai',R:1,due:null,reps:1,lapses:0,lastAt:now,misconception:false}, c2:{conceptId:'c2',state:'debole',R:0.2,due:null,reps:1,lapses:1,lastAt:now,misconception:true} },
      reviews:[review('c1',{misconception:true}),review('c2',{misconception:true}),review('c1',{type:'explain',correct:true}),review('c2',{type:'explain',correct:false})],
      examResults:[{conceptIds:['c1'],total:18,at:now}],
      lessons:[lesson]
    })
    expect(quasi.score).toBeCloseTo(0.62)
    expect(quasi.status).toBe('quasi')
    const ready = base({
      memories:{ c1:{conceptId:'c1',state:'la sai',R:1,due:null,reps:1,lapses:0,lastAt:now,misconception:false}, c2:{conceptId:'c2',state:'la sai',R:1,due:null,reps:1,lapses:0,lastAt:now,misconception:false} },
      reviews:[review('c1',{misconception:true}),review('c1',{type:'explain',correct:false}),review('c2',{type:'explain',correct:false})],
      examResults:[{conceptIds:['c1'],total:30,at:now}]
    })
    expect(ready.score).toBe(0.8)
    expect(ready.status).toBe('pronto')
  })
})
