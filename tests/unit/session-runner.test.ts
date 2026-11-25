import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reduceSession, type SessionEvent } from '../../src/main/session/events'
import { createSessionRunner } from '../../src/main/session/runner'
import type { ConverseRequest } from '../../src/main/ai/bridge'
import type { TeacherTurn } from '../../src/shared/teacher-protocol'
import type { VaultIndex } from '../../src/shared/vault-types'
import type { ReviewLine } from '../../src/shared/memory-types'

const probeTurn: TeacherTurn = {
  phase: 'probe',
  blocks: [{ type: 'text', md: 'Partiamo.' }],
  question: {
    id: 'q1',
    role: 'probe',
    kind: 'choice',
    prompt: 'Rolle?',
    options: ['a', 'b'],
    correct: 0,
    why: ['sì', 'no'],
    nodeId: 'rolle'
  }
}
const planTurn: TeacherTurn = {
  phase: 'plan',
  blocks: [{ type: 'text', md: 'Ecco il piano.' }],
  plan: {
    nodes: [
      { id: 'rolle', title: 'Rolle', status: 'known' },
      { id: 'corda', title: 'Corda', status: 'todo' },
      { id: 'lag', title: 'Lagrange', status: 'goal' }
    ],
    edges: [
      ['rolle', 'lag'],
      ['corda', 'lag']
    ]
  },
  question: { id: 'q2', role: 'plan', kind: 'open', prompt: 'Va bene?' }
}
const checkTurn = (id: string, nodeId: string): TeacherTurn => ({
  phase: 'teach',
  blocks: [{ type: 'text', md: 'Spiegazione.' }],
  question: {
    id,
    role: 'check',
    kind: 'choice',
    prompt: 'Verifica',
    options: ['x', 'y'],
    correct: 1,
    why: ['no', 'sì'],
    nodeId
  }
})
const at = 1

describe('reduceSession', () => {
  it('derives phase, plan, pending question and awaiting', () => {
    const ev: SessionEvent[] = [
      { t: 'created', id: 's', topic: 'Lagrange', at },
      { t: 'learner', text: 'Voglio studiare Lagrange', at },
      { t: 'teacher', turn: probeTurn, at },
      { t: 'learner', text: 'A', answer: { questionId: 'q1', choice: 0, confidence: 90 }, at },
      { t: 'teacher', turn: planTurn, at }
    ]
    const s = reduceSession(ev)
    expect(s).toMatchObject({ phase: 'plan', awaiting: 'learner', currentNodeId: 'rolle' })
    expect(s.plan?.nodes).toHaveLength(3)
    expect(s.pendingQuestion?.id).toBe('q2')
    expect(s.items).toHaveLength(4)
  })
  it('marks a node done after a correct check and a move to another node', () => {
    const ev: SessionEvent[] = [
      { t: 'created', id: 's', topic: 'x', at },
      { t: 'teacher', turn: planTurn, at },
      { t: 'teacher', turn: checkTurn('q3', 'corda'), at },
      { t: 'learner', text: 'B', answer: { questionId: 'q3', choice: 1, confidence: 80 }, at },
      { t: 'teacher', turn: checkTurn('q4', 'lag'), at }
    ]
    expect(reduceSession(ev).doneNodeIds).toEqual(['corda'])
  })
  it('awaits the teacher after a learner message and offers retry after an error', () => {
    const base: SessionEvent[] = [
      { t: 'created', id: 's', topic: 'x', at },
      { t: 'learner', text: 'ciao', at }
    ]
    expect(reduceSession(base).awaiting).toBe('teacher')
    expect(reduceSession([...base, { t: 'error', message: 'boom', at }]).awaiting).toBe('retry')
  })
})

function harness(
  converse: (r: ConverseRequest<TeacherTurn>) => Promise<TeacherTurn>,
  index: VaultIndex | null = null
) {
  return mkdtemp(join(tmpdir(), 'sinapsi-sess-')).then((dir) => {
    const calls: ConverseRequest<TeacherTurn>[] = []
    const updates: string[] = []
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async (r) => (
          calls.push(r as ConverseRequest<TeacherTurn>),
          {
            data: await converse(r as ConverseRequest<TeacherTurn>),
            conversationId: r.conversationId,
            engine: 'claude' as const
          }
        )
      } as never,
      vault: async () => index,
      readNote: async () => 'TESTO DELLA NOTA',
      onUpdate: (s) => updates.push(s.awaiting),
      uuid: () => '11111111-1111-4111-8111-111111111111'
    })
    return { dir, calls, updates, runner }
  })
}

describe('session runner', () => {
  it('starts a session and resumes the conversation on the next answer', async () => {
    const turns = [probeTurn, planTurn]
    const { runner, calls, dir } = await harness(async () => turns.shift()!)
    const id = await runner.start('Teorema di Lagrange')
    await runner.answer(id, { questionId: 'q1', choice: 0, confidence: 90 })
    expect(calls[0]).toMatchObject({ resume: false, conversationId: id, task: 'teach' })
    expect(calls[0].systemPrompt).toContain('Protocollo')
    expect(calls[1].resume).toBe(true)
    expect(calls[1].prompt).toContain('Risposta alla domanda q1 (misura)')
    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).t)
    expect(log).toEqual(['created', 'confirmed', 'learner', 'teacher', 'learner', 'teacher'])
  })

  it('grounds the first message in the matching Obsidian note', async () => {
    const index = {
      root: '/v',
      scannedAt: 0,
      subjects: [],
      notes: [
        {
          path: '/v/L.md',
          title: 'Teorema di Lagrange',
          folder: '',
          tags: [],
          aliases: [],
          links: [],
          headings: [],
          blockIds: [],
          subject: null,
          mtime: 0,
          size: 0,
          available: true
        }
      ]
    }
    const { runner, calls } = await harness(async () => probeTurn, index)
    const id = await runner.start('teorema di lagrange')
    expect(calls[0].prompt).toContain('TESTO DELLA NOTA')
    expect((await runner.get(id)).noteTitle).toBe('Teorema di Lagrange')
  })

  it('records an error and retries the same learner input', async () => {
    let fail = true
    const { runner, calls } = await harness(async () => {
      if (fail) {
        fail = false
        throw new Error('CLI esploso')
      }
      return probeTurn
    })
    const id = await runner.start('Lagrange')
    expect((await runner.get(id)).awaiting).toBe('retry')
    await runner.retry(id)
    expect(calls[1].prompt).toBe(calls[0].prompt)
    expect(calls[1].resume).toBe(false)
    expect((await runner.get(id)).awaiting).toBe('learner')
  })

  it('can retry a session reopened after the app closed mid-turn', async () => {
    const { runner, dir } = await harness(async () => probeTurn)
    const id = '22222222-2222-4222-8222-222222222222'
    await writeFile(
      join(dir, `${id}.jsonl`),
      [
        JSON.stringify({ t: 'created', id, topic: 'x', at }),
        JSON.stringify({ t: 'learner', text: 'Voglio studiare: x', at })
      ].join('\n') + '\n'
    )
    expect((await runner.get(id)).awaiting).toBe('retry')
    await runner.retry(id)
    expect((await runner.get(id)).awaiting).toBe('learner')
  })

  it('serializes two answers fired together', async () => {
    const turns = [probeTurn, checkTurn('q2', 'a'), checkTurn('q3', 'a')]
    const { runner, dir } = await harness(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return turns.shift()!
    })
    const id = await runner.start('x')
    await Promise.all([
      runner.answer(id, { questionId: 'q1', choice: 0, confidence: 50 }),
      runner.answer(id, { questionId: 'q2', choice: 1, confidence: 50 })
    ])
    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).t)
    expect(log).toEqual([
      'created',
      'confirmed',
      'learner',
      'teacher',
      'learner',
      'teacher',
      'learner',
      'teacher'
    ])
  })

  it('lists sessions newest first', async () => {
    const { runner } = await harness(async () => probeTurn)
    await runner.start('primo')
    const list = await runner.list()
    expect(list[0]).toMatchObject({ topic: 'Primo', phase: 'probe' })
  })

  it('creates candidates, confirms a minimal tree, and grades an open answer statelessly', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-grade-'))
    const asks: unknown[] = []
    const noteIndex: VaultIndex = {
      root: '/v',
      scannedAt: 0,
      subjects: [],
      notes: [
        {
          path: '/v/L.md',
          title: 'Lagrange',
          folder: '',
          tags: [],
          aliases: [],
          links: [],
          headings: ['Teorema'],
          blockIds: [],
          subject: null,
          mtime: 0,
          size: 0,
          available: true
        }
      ]
    }
    let call = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({
          data:
            call++ === 0
              ? {
                  phase: 'teach',
                  blocks: [],
                  question: {
                    id: 'open',
                    role: 'check',
                    kind: 'open',
                    prompt: 'Spiega',
                    nodeId: 'c'
                  }
                }
              : probeTurn,
          conversationId: 's',
          engine: 'claude'
        }),
        ask: async (request) => {
          asks.push(request)
          return {
            data: { verdict: 'correct', hintsUsed: 0, reason: 'Dimostrato' },
            fromCache: false,
            engine: 'agy'
          }
        }
      } as never,
      vault: async () => noteIndex,
      readNote: async () => '# Teorema\n\nEnunciato dal testo.',
      graph: async () => ({
        concepts: [
          {
            id: 'c',
            name: 'Lagrange',
            statement: 'Il teorema.',
            aliases: [],
            birth: '/v/L.md',
            notes: ['/v/L.md'],
            sections: { '/v/L.md': 'Teorema' },
            depth: 0
          }
        ],
        chains: [],
        extracted: {}
      }),
      memoryStore: { read: async () => [], append: async () => undefined },
      onUpdate: () => undefined
    })
    const id = await runner.create('Lagrange')
    const created = { id }
    // A single candidate is confirmed at once; the first turn starts with retry.
    expect((await runner.get(id)).candidates).toEqual([{ title: 'Lagrange', path: '/v/L.md' }])
    expect((await runner.get(id)).awaiting).not.toBe('confirm')
    await runner.retry(id)
    await runner.answer(created.id, { questionId: 'open', text: 'Risposta', confidence: 99 })
    expect(asks).toHaveLength(1)
    expect((asks[0] as { prompt: string }).prompt).not.toContain('99')
    const state = await runner.get(created.id)
    expect(state.items.some((item) => item.kind === 'teacher')).toBe(true)
  })

  it('waits for the note choice when several notes match, then confirm starts the turn', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-confirm-'))
    const note = (path: string, title: string) => ({
      path,
      title,
      folder: '',
      tags: [],
      aliases: [],
      links: [],
      headings: [],
      mtime: 0,
      size: 0,
      available: true
    })
    let turns = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => (
          turns++,
          {
            data: { phase: 'probe', blocks: [{ type: 'text', md: 'ok' }] },
            conversationId: 'c',
            engine: 'claude'
          }
        )
      } as never,
      vault: async () =>
        ({
          root: '/v',
          scannedAt: 0,
          subjects: [],
          notes: [note('/v/A.md', 'Derivate'), note('/v/B.md', 'Derivate parziali')]
        }) as never,
      readNote: async () => '# Derivate',
      onUpdate: () => undefined
    })
    const id = await runner.start('derivate')
    const waiting = await runner.get(id)
    expect(waiting.awaiting).toBe('confirm')
    expect(waiting.candidates.length).toBeGreaterThan(1)
    expect(turns).toBe(0)
    await runner.confirm(id, '/v/B.md')
    expect(turns).toBe(1)
    expect((await runner.get(id)).lastLearnerText).toContain('Derivate')
  })

  it('records an aborted event when a live turn is cancelled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-abort-'))
    let signalTeacher: (() => void) | undefined
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: (_request: ConverseRequest<TeacherTurn>) =>
          new Promise((_resolve, reject) => {
            signalTeacher = () => reject(new Error('abort'))
            if (_request.signal?.aborted) signalTeacher()
            else _request.signal?.addEventListener('abort', signalTeacher, { once: true })
          })
      } as never,
      vault: async () => null,
      readNote: async () => '',
      onUpdate: () => undefined
    })
    const created = { id: await runner.create('x') }
    const pendingTurn = runner.retry(created.id)
    while (!signalTeacher) await new Promise((resolve) => setTimeout(resolve, 1))
    await runner.cancel(created.id)
    await pendingTurn
    expect((await runner.get(created.id)).items.at(-1)).toEqual({
      kind: 'error',
      message: 'Turno annullato'
    })
  })

  it('writes one session review per concept and finalizes idempotently', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-finalize-'))
    const reviews: { ref?: string; via?: string }[] = []
    let calls = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({
          data:
            calls++ === 0
              ? {
                  phase: 'probe',
                  blocks: [],
                  question: {
                    id: 'recall',
                    role: 'recall',
                    kind: 'choice',
                    prompt: 'Ricorda',
                    options: ['giusta', 'sbagliata'],
                    correct: 0,
                    why: ['Sì.', 'No.'],
                    nodeId: 'concept'
                  }
                }
              : {
                  phase: 'done',
                  blocks: [],
                  summary: { learned: ['concept'], shaky: [], misconceptions: [] }
                },
          conversationId: 'session',
          engine: 'claude'
        })
      } as never,
      vault: async () => null,
      readNote: async () => '',
      memoryStore: {
        read: async () => reviews as never,
        append: async (review) => {
          reviews.push(review)
        }
      },
      onUpdate: () => undefined
    })
    const id = await runner.start('concept')
    await runner.answer(id, { questionId: 'recall', choice: 0, confidence: 88 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await runner.end(id)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ via: 'session', ref: `session:${id}:concept` })
  })

  it('does not prevent writing after end() when finalize is called before done', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-finalize-latch-'))
    const reviews: ReviewLine[] = []
    let calls = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({
          data:
            calls++ === 0
              ? {
                  phase: 'probe',
                  blocks: [],
                  question: {
                    id: 'recall',
                    role: 'recall',
                    kind: 'choice',
                    prompt: 'Ricorda',
                    options: ['giusta', 'sbagliata'],
                    correct: 0,
                    why: ['Sì.', 'No.'],
                    nodeId: 'concept'
                  }
                }
              : {
                  phase: 'teach',
                  blocks: [],
                  question: {
                    id: 'check',
                    role: 'check',
                    kind: 'choice',
                    prompt: 'Verifica',
                    options: ['a', 'b'],
                    correct: 0,
                    why: ['a', 'b'],
                    nodeId: 'concept'
                  }
                },
          conversationId: 'session',
          engine: 'claude'
        })
      } as never,
      vault: async () => null,
      readNote: async () => '',
      memoryStore: {
        read: async () => reviews,
        append: async (review: ReviewLine) => {
          reviews.push(review)
        }
      } as never,
      onUpdate: () => undefined
    })

    const id = await runner.start('concept')
    await runner.answer(id, { questionId: 'recall', choice: 0, confidence: 88 })
    // Calling finalize prematurely should be a no-op and must not latch-lock future finalization
    await runner.finalize?.(id)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reviews).toHaveLength(0)

    // Now end the session; finalize should proceed and write the review and index entry
    await runner.end(id)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({ via: 'session', ref: `session:${id}:concept` })
    const index = await readFile(join(dir, 'index.jsonl'), 'utf8').catch(() => '')
    expect(index).toContain(id)
  })

  it('appends an error event and no teacher turn when the second turn is still invalid', async () => {
    const invalidTurn: TeacherTurn = {
      phase: 'done',
      blocks: [],
      summary: { learned: [], shaky: [], misconceptions: [] }
    }
    let converseCalls = 0
    const { runner, dir } = await harness(async () => {
      converseCalls++
      return invalidTurn
    })

    const id = await runner.start('Lagrange')
    expect(converseCalls).toBe(2)

    const state = await runner.get(id)
    expect(state.awaiting).toBe('retry')
    expect(state.items.filter((i) => i.kind === 'teacher')).toHaveLength(0)

    const lastItem = state.items.at(-1)
    expect(lastItem?.kind).toBe('error')
    expect(lastItem).toMatchObject({
      kind: 'error',
      message: expect.stringContaining("l'obiettivo non è ancora padroneggiato")
    })

    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l).t)
    expect(log).toEqual(['created', 'confirmed', 'learner', 'error'])
  })

  it('discards ReviewLine with conceptId outside the vault graph during finalize', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-ghost-'))
    const reviews: ReviewLine[] = []
    let call = 0
    const turns: TeacherTurn[] = [
      {
        phase: 'probe',
        blocks: [],
        question: {
          id: 'q-valid',
          role: 'recall',
          kind: 'choice',
          prompt: 'Valido',
          options: ['a', 'b'],
          correct: 0,
          why: ['ok', 'no'],
          nodeId: 'valid-concept'
        }
      },
      {
        phase: 'teach',
        blocks: [],
        question: {
          id: 'q-ghost',
          role: 'recall',
          kind: 'choice',
          prompt: 'Fantasma',
          options: ['c', 'd'],
          correct: 0,
          why: ['ok', 'no'],
          nodeId: 'ghost-concept'
        }
      },
      {
        phase: 'done',
        blocks: [],
        summary: { learned: ['valid-concept'], shaky: [], misconceptions: [] }
      }
    ]

    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({
          data: turns[call++] ?? turns.at(-1)!,
          conversationId: 'session',
          engine: 'claude'
        })
      } as never,
      vault: async () => null,
      readNote: async () => '',
      graph: async () => ({
        concepts: [
          {
            id: 'valid-concept',
            name: 'Valid',
            statement: 'Enunciato valido',
            aliases: [],
            birth: '/v/A.md',
            notes: ['/v/A.md'],
            sections: {},
            depth: 0
          }
        ],
        chains: [],
        extracted: {},
        retired: [],
        dormant: []
      }),
      memoryStore: {
        read: async () => reviews,
        append: async (review: ReviewLine) => {
          reviews.push(review)
        }
      } as never,
      onUpdate: () => undefined
    })

    const id = await runner.start('Valid', ['valid-concept'])
    await runner.answer(id, { questionId: 'q-valid', choice: 0, confidence: 90 })
    await runner.answer(id, { questionId: 'q-ghost', choice: 0, confidence: 90 })
    await runner.end(id)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(reviews.length).toBeGreaterThan(0)
    expect(reviews.map((r) => r.conceptId)).toEqual(['valid-concept'])
    expect(reviews.some((r) => r.conceptId === 'ghost-concept')).toBe(false)
  })

  it('says the tutor is working, not that it stopped, while an open answer is being graded', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-grading-'))
    const turns: TeacherTurn[] = [
      { phase: 'teach', blocks: [], question: { id: 'q1', role: 'check', kind: 'open', prompt: 'Spiega', nodeId: 'c' } },
      { phase: 'teach', blocks: [{ type: 'text', md: 'Bene.' }] }
    ]
    let release!: () => void
    const updates: string[] = []
    let n = 0
    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({ data: turns[n++] ?? turns.at(-1)!, conversationId: 's', engine: 'claude' }),
        ask: async () => {
          await new Promise<void>((r) => (release = r))
          throw new Error('grader down')
        }
      } as never,
      vault: async () => ({ root: '/v', scannedAt: 0, subjects: [], notes: [{ path: '/v/C.md', title: 'Cauchy', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: true }] }),
      readNote: async () => '# Teorema\n\nEnunciato.',
      graph: async () => ({ concepts: [{ id: 'c', name: 'Cauchy', statement: 's', aliases: [], birth: '/v/C.md', notes: ['/v/C.md'], sections: { '/v/C.md': 'Teorema' }, depth: 0 }], chains: [], extracted: {} }),
      onUpdate: (s) => updates.push(s.awaiting)
    })
    const id = await runner.create('Cauchy')
    await runner.retry(id)
    const st = await runner.get(id)
    expect(st.tree?.nodes.some((x) => x.id === 'c')).toBe(true)
    updates.length = 0
    const done = runner.answer(id, { questionId: 'q1', text: 'risposta' })
    await new Promise((r) => setTimeout(r, 20))
    expect((await runner.get(id)).awaiting).toBe('teacher')
    expect(updates).not.toContain('retry')
    release()
    await done
    expect(updates).not.toContain('retry')
  })

  it('appends an ungraded event when gradeOpenAnswer fails, applies fallback at >=2, and writes unverifiedIds to index.jsonl', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-session-ungraded-'))
    const noteIndex: VaultIndex = {
      root: '/v',
      scannedAt: 0,
      subjects: [],
      notes: [
        {
          path: '/v/L.md',
          title: 'Lagrange',
          folder: '',
          tags: [],
          aliases: [],
          links: [],
          headings: [],
          blockIds: [],
          subject: null,
          mtime: 0,
          size: 0,
          available: true
        }
      ]
    }
    let turnCount = 0
    const turns: TeacherTurn[] = [
      {
        phase: 'teach',
        blocks: [],
        question: { id: 'q-open-1', role: 'check', kind: 'open', prompt: 'Spiega 1', nodeId: 'c' }
      },
      {
        phase: 'teach',
        blocks: [],
        question: { id: 'q-open-2', role: 'check', kind: 'open', prompt: 'Spiega 2', nodeId: 'c' }
      },
      {
        phase: 'teach',
        blocks: [],
        question: { id: 'q-choice-1', role: 'check', kind: 'choice', prompt: 'Scelta 1', options: ['a', 'b'], correct: 0, why: ['ok', 'no'], nodeId: 'c' }
      },
      {
        phase: 'teach',
        blocks: [],
        question: { id: 'q-choice-2', role: 'check', kind: 'choice', prompt: 'Scelta 2', options: ['a', 'b'], correct: 0, why: ['ok', 'no'], nodeId: 'c' }
      },
      {
        phase: 'teach',
        blocks: [],
        question: { id: 'q-choice-3', role: 'check', kind: 'choice', prompt: 'Scelta 3', options: ['a', 'b'], correct: 0, why: ['ok', 'no'], nodeId: 'c' }
      },
      {
        phase: 'done',
        blocks: [],
        summary: { learned: ['c'], shaky: [], misconceptions: [] }
      }
    ]

    const runner = createSessionRunner({
      dir,
      bridge: {
        converse: async () => ({
          data: turns[turnCount++] ?? turns.at(-1)!,
          conversationId: 's',
          engine: 'claude'
        }),
        ask: async () => {
          throw new Error('LLM grader crashed')
        }
      } as never,
      vault: async () => noteIndex,
      readNote: async () => '# Teorema\n\nEnunciato.',
      graph: async () => ({
        concepts: [
          {
            id: 'c',
            name: 'Lagrange',
            statement: 'Il teorema.',
            aliases: [],
            birth: '/v/L.md',
            notes: ['/v/L.md'],
            sections: { '/v/L.md': 'Teorema' },
            depth: 0
          }
        ],
        chains: [],
        extracted: {}
      }),
      onUpdate: () => undefined
    })

    const id = await runner.create('Lagrange')
    await runner.retry(id)

    // First open answer fails grading -> 1 ungraded
    await runner.answer(id, { questionId: 'q-open-1', text: 'Risposta 1' })
    let state = await runner.get(id)
    expect(state.unverifiedIds).toEqual([])

    // Second open answer fails grading -> 2 ungraded -> fallback active
    await runner.answer(id, { questionId: 'q-open-2', text: 'Risposta 2' })
    state = await runner.get(id)
    expect(state.unverifiedIds).toEqual(['c'])

    // Read session file directly to verify AnyEvent parsing of 'ungraded'
    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    const ungradedEvents = log.filter((e: { t: string }) => e.t === 'ungraded')
    expect(ungradedEvents).toHaveLength(2)

    // Complete 3 choices -> achieves kChoice = 3
    await runner.answer(id, { questionId: 'q-choice-1', choice: 0 })
    await runner.answer(id, { questionId: 'q-choice-2', choice: 0 })
    await runner.answer(id, { questionId: 'q-choice-3', choice: 0 })
    state = await runner.get(id)
    expect(state.doneNodeIds).toContain('c')

    // Finalize session
    await runner.end(id)
    await new Promise((resolve) => setTimeout(resolve, 30))

    // Check index.jsonl contains unverifiedIds
    const indexContent = await readFile(join(dir, 'index.jsonl'), 'utf8')
    const indexLine = JSON.parse(indexContent.trim().split('\n').pop()!)
    expect(indexLine.id).toBe(id)
    expect(indexLine.unverifiedIds).toEqual(['c'])
    expect(indexLine.masteredIds).toContain('c')
  })

  it('session interrupted from a previous launch (new runner, empty cache) appears in list()', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-prev-session-'))
    const id = 'prev-123'
    const now = Date.now()
    const events: SessionEvent[] = [
      {
        t: 'created',
        id,
        topic: 'Teorema di Rolle',
        at: now - 3600_000,
        candidates: [{ title: 'Rolle', path: '/v/Rolle.md' }],
        learnerProfile: '',
        mastery: { kOpen: 2, kChoice: 3, solidDays: 14 }
      },
      {
        t: 'confirmed',
        notePath: '/v/Rolle.md',
        noteTitle: 'Rolle',
        at: now - 3500_000
      },
      {
        t: 'learner',
        text: 'Iniziamo',
        at: now - 3400_000
      },
      {
        t: 'teacher',
        turn: {
          phase: 'teach',
          blocks: [{ type: 'text', md: 'Spiegazione' }],
          question: {
            id: 'q1',
            role: 'check',
            kind: 'choice',
            prompt: 'Test?',
            options: ['a', 'b'],
            correct: 0,
            why: ['sì', 'no'],
            nodeId: 'rolle'
          }
        },
        at: now - 3300_000
      }
    ]
    await writeFile(join(dir, `${id}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n')

    const runner = createSessionRunner({
      dir,
      bridge: { converse: async () => ({ data: probeTurn, conversationId: 'c', engine: 'claude' }) } as never,
      vault: async () => null,
      readNote: async () => '',
      onUpdate: () => undefined
    })

    const list = await runner.list()
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id,
      topic: 'Teorema di Rolle',
      phase: 'teach',
      notePath: '/v/Rolle.md'
    })
  })

  it('session older than 8 days is recovered as abandoned, writing only cold evidence, second call does not duplicate', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-abandoned-'))
    const id = 'aban-456'
    const eightDaysAgo = Date.now() - 8 * 86_400_000
    const reviews: ReviewLine[] = []
    const events: SessionEvent[] = [
      {
        t: 'created',
        id,
        topic: 'Analisi Matematica',
        at: eightDaysAgo,
        candidates: [],
        learnerProfile: '',
        mastery: { kOpen: 2, kChoice: 3, solidDays: 14 }
      },
      {
        t: 'confirmed',
        at: eightDaysAgo + 1000
      },
      // Cold evidence: recall for c-cold
      {
        t: 'learner',
        text: 'Risposta recall',
        question: {
          id: 'q-recall',
          role: 'recall',
          kind: 'choice',
          prompt: 'Ricorda?',
          options: ['giusta', 'sbagliata'],
          correct: 0,
          why: ['ok', 'no'],
          nodeId: 'c-cold'
        },
        answer: { questionId: 'q-recall', choice: 0, confidence: 90 },
        at: eightDaysAgo + 2000
      },
      // Immediate evidence: single check for c-immediate
      {
        t: 'learner',
        text: 'Risposta check',
        question: {
          id: 'q-check',
          role: 'check',
          kind: 'choice',
          prompt: 'Verifica?',
          options: ['giusta', 'sbagliata'],
          correct: 0,
          why: ['ok', 'no'],
          nodeId: 'c-immediate'
        },
        answer: { questionId: 'q-check', choice: 0, confidence: 90 },
        at: eightDaysAgo + 3000
      }
    ]
    await writeFile(join(dir, `${id}.jsonl`), events.map((e) => JSON.stringify(e)).join('\n') + '\n')

    const runner = createSessionRunner({
      dir,
      bridge: { converse: async () => ({ data: probeTurn, conversationId: 'c', engine: 'claude' }) } as never,
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

    await runner.recover()

    // Expect only cold evidence (c-cold), NOT immediate evidence (c-immediate)
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      conceptId: 'c-cold',
      evidence: 'recall',
      sessionId: id,
      ref: `session:${id}:c-cold`
    })

    // Expect index line with status 'abandoned'
    const indexContent = await readFile(join(dir, 'index.jsonl'), 'utf8')
    const indexLines = indexContent.trim().split('\n').map((l) => JSON.parse(l))
    expect(indexLines).toHaveLength(1)
    expect(indexLines[0]).toMatchObject({
      id,
      status: 'abandoned',
      topic: 'Analisi Matematica'
    })

    // Second call to recover must not duplicate reviews or index entries
    await runner.recover()
    expect(reviews).toHaveLength(1)
    const indexContentAfter = await readFile(join(dir, 'index.jsonl'), 'utf8')
    const indexLinesAfter = indexContentAfter.trim().split('\n').map((l) => JSON.parse(l))
    expect(indexLinesAfter).toHaveLength(1)
  })
})

describe('fake teacher script', () => {
  it('is made only of valid turns', async () => {
    const { FAKE_SCRIPT, LONG_MEASURE_SCRIPT } = await import('../../src/main/session/fake-teacher')
    const { TeacherTurnSchema } = await import('../../src/shared/teacher-protocol')
    for (const t of [...FAKE_SCRIPT, ...LONG_MEASURE_SCRIPT])
      expect(TeacherTurnSchema.safeParse(t).success).toBe(true)
  })
})
