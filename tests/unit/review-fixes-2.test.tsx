// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildArgs } from '../../src/main/ai/engines'
import { navigationDecision } from '../../src/main/navigation'
import { matchNote } from '../../src/main/session/note-match'
import { createSessionRunner } from '../../src/main/session/runner'
import { SessionView } from '../../src/renderer/src/session/SessionView'
import type { SessionState } from '../../src/shared/api'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)
const at = 1

describe('phase 2 review fixes', () => {
  it('offers Riprova for a session reopened after a restart mid-turn', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf2-'))
    const id = '33333333-3333-4333-8333-333333333333'
    await writeFile(join(dir, `${id}.jsonl`), [JSON.stringify({ t: 'created', id, topic: 'x', at }), JSON.stringify({ t: 'learner', text: 'ciao', at })].join('\n') + '\n')
    const runner = createSessionRunner({ dir, bridge: { converse: vi.fn() } as never, vault: async () => null, readNote: async () => '', onUpdate: () => undefined })
    expect((await runner.get(id)).awaiting).toBe('retry')
  })

  it('announces that the tutor is working as soon as a retry starts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf2-'))
    const seen: string[] = []
    let fail = true
    const turn = { phase: 'probe', blocks: [], question: { id: 'q1', role: 'goal', kind: 'open', prompt: 'Obiettivo?' } }
    const runner = createSessionRunner({
      dir, vault: async () => null, readNote: async () => '', onUpdate: (s) => seen.push(s.awaiting),
      bridge: { converse: async () => { if (fail) { fail = false; throw new Error('x') } return { data: turn, conversationId: 'c', engine: 'claude' } } } as never
    })
    const id = await runner.start('x')
    seen.length = 0
    await runner.retry(id)
    expect(seen[0]).toBe('teacher')
    expect(seen.at(-1)).toBe('learner')
  })

  it('shows Riprova only while a retry is possible', async () => {
    const ID = '11111111-1111-4111-8111-111111111111'
    const s: SessionState = { id: ID, topic: 't', phase: 'probe', doneNodeIds: [], awaiting: 'teacher', hasTeacherTurn: false, createdAt: 1, updatedAt: 1, items: [{ kind: 'learner', text: 'x' }, { kind: 'error', message: 'boom' }] }
    window.sinapsi = { session: { get: vi.fn(async () => s), onUpdate: () => () => undefined, retry: vi.fn(), answer: vi.fn(), say: vi.fn() } } as never
    render(<SessionView id={ID} onBack={vi.fn()} />)
    await screen.findByText('boom')
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull()
  })

  it('never lets the app window navigate away', () => {
    expect(navigationDecision('https://esempio.it/fonte')).toEqual({ allow: false, external: 'https://esempio.it/fonte' })
    expect(navigationDecision('javascript:alert(1)')).toEqual({ allow: false })
    expect(navigationDecision('file:///etc/passwd')).toEqual({ allow: false })
  })

  it('does not ground a session in a note that shares one generic word', () => {
    const n = (title: string) => ({ path: `/v/${title}.md`, title, folder: '', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: true })
    const idx: VaultIndex = { root: '/v', scannedAt: 0, subjects: [], notes: [n('Teorema 3.8'), n('Numeri Naturali')] }
    expect(matchNote(idx, 'Teorema di Lagrange')).toBeNull()
  })

  it('locks the tutor out of every tool and MCP server', () => {
    const { args } = buildArgs('claude', 'x', { conversation: { id: 'a', resume: false } })
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args).toContain('--strict-mcp-config')
  })
})
