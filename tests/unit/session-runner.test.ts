import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reduceSession, type SessionEvent } from '../../src/main/session/events'
import { createSessionRunner } from '../../src/main/session/runner'
import type { ConverseRequest } from '../../src/main/ai/bridge'
import type { TeacherTurn } from '../../src/shared/teacher-protocol'
import type { VaultIndex } from '../../src/shared/vault-types'

const probeTurn: TeacherTurn = {
  phase: 'probe', blocks: [{ type: 'text', md: 'Partiamo.' }],
  question: { id: 'q1', role: 'probe', kind: 'choice', prompt: 'Rolle?', options: ['a', 'b'], correct: 0, why: ['sì', 'no'], nodeId: 'rolle' }
}
const planTurn: TeacherTurn = {
  phase: 'plan', blocks: [{ type: 'text', md: 'Ecco il piano.' }],
  plan: { nodes: [{ id: 'rolle', title: 'Rolle', status: 'known' }, { id: 'corda', title: 'Corda', status: 'todo' }, { id: 'lag', title: 'Lagrange', status: 'goal' }], edges: [['rolle', 'lag'], ['corda', 'lag']] },
  question: { id: 'q2', role: 'plan', kind: 'open', prompt: 'Va bene?' }
}
const checkTurn = (id: string, nodeId: string): TeacherTurn => ({
  phase: 'teach', blocks: [{ type: 'text', md: 'Spiegazione.' }],
  question: { id, role: 'check', kind: 'choice', prompt: 'Verifica', options: ['x', 'y'], correct: 1, why: ['no', 'sì'], nodeId }
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
    const base: SessionEvent[] = [{ t: 'created', id: 's', topic: 'x', at }, { t: 'learner', text: 'ciao', at }]
    expect(reduceSession(base).awaiting).toBe('teacher')
    expect(reduceSession([...base, { t: 'error', message: 'boom', at }]).awaiting).toBe('retry')
  })
})

function harness(converse: (r: ConverseRequest<TeacherTurn>) => Promise<TeacherTurn>, index: VaultIndex | null = null) {
  return mkdtemp(join(tmpdir(), 'sinapsi-sess-')).then((dir) => {
    const calls: ConverseRequest<TeacherTurn>[] = []
    const updates: string[] = []
    const runner = createSessionRunner({
      dir,
      bridge: { converse: async (r) => (calls.push(r as ConverseRequest<TeacherTurn>), { data: await converse(r as ConverseRequest<TeacherTurn>), conversationId: r.conversationId, engine: 'claude' as const }) } as never,
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
    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8')).trim().split('\n').map((l) => JSON.parse(l).t)
    expect(log).toEqual(['created', 'learner', 'teacher', 'learner', 'teacher'])
  })

  it('grounds the first message in the matching Obsidian note', async () => {
    const index = { root: '/v', scannedAt: 0, subjects: [], notes: [{ path: '/v/L.md', title: 'Teorema di Lagrange', folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: true }] }
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
    await writeFile(join(dir, `${id}.jsonl`), [JSON.stringify({ t: 'created', id, topic: 'x', at }), JSON.stringify({ t: 'learner', text: 'Voglio studiare: x', at })].join('\n') + '\n')
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
    await Promise.all([runner.answer(id, { questionId: 'q1', choice: 0, confidence: 50 }), runner.answer(id, { questionId: 'q2', choice: 1, confidence: 50 })])
    const log = (await readFile(join(dir, `${id}.jsonl`), 'utf8')).trim().split('\n').map((l) => JSON.parse(l).t)
    expect(log).toEqual(['created', 'learner', 'teacher', 'learner', 'teacher', 'learner', 'teacher'])
  })

  it('lists sessions newest first', async () => {
    const { runner } = await harness(async () => probeTurn)
    await runner.start('primo')
    const list = await runner.list()
    expect(list[0]).toMatchObject({ topic: 'primo', phase: 'probe' })
  })
})

describe('fake teacher script', () => {
  it('is made only of valid turns', async () => {
    const { FAKE_SCRIPT } = await import('../../src/main/session/fake-teacher')
    const { TeacherTurnSchema } = await import('../../src/shared/teacher-protocol')
    for (const t of FAKE_SCRIPT) expect(TeacherTurnSchema.safeParse(t).success).toBe(true)
  })
})
