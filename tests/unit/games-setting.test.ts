import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeHandlers } from '../../src/main/ipc-handlers'
import { TEACHER_SYSTEM_PROMPT } from '../../src/main/session/prompt'
import { createSessionRunner } from '../../src/main/session/runner'
import { settingsSchema } from '../../src/shared/settings-schema'

describe('games setting and prompt', () => {
  it('is on by default and can be switched off', async () => {
    const s = settingsSchema('/x').parse({})
    expect(s.gamesInSessions).toBe(true)
    const h = makeHandlers({ loadSettings: async () => s, saveSettings: vi.fn(async (p: object) => ({ ...s, ...p })), scan: vi.fn(), aiStatus: vi.fn(), openExternal: vi.fn(), chooseFolder: vi.fn() } as never)
    await expect(h.settingsSet({ gamesInSessions: false })).resolves.toMatchObject({ gamesInSessions: false })
  })
  it('teaches the tutor when and how to use games', () => {
    expect(TEACHER_SYSTEM_PROMPT).toMatch(/# Giochi/)
    for (const t of ['"speed"', '"match"', '"order"', '"spot"', '"taboo"']) expect(TEACHER_SYSTEM_PROMPT).toContain(t)
    expect(TEACHER_SYSTEM_PROMPT).toMatch(/"kind": "choice" \| "open" \| "game"/)
  })
  it('tells the tutor not to use games when they are off', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-games-'))
    const make = (games: boolean) => createSessionRunner({ bridge: { converse: vi.fn() } as never, dir, vault: async () => null, readNote: async () => '', onUpdate: vi.fn(), games: async () => games })
    const off = make(false)
    const id = await off.create('derivate')
    expect((await off.get(id)).lastLearnerText).toContain('Giochi disattivati')
    const on = make(true)
    const id2 = await on.create('derivate')
    expect((await on.get(id2)).lastLearnerText).not.toContain('Giochi')
  })
})
