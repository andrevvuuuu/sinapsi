import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'

// Real calls to agy and claude: run with LIVE_AI=1 npx vitest run tests/live --config vitest.live.config.ts
describe.runIf(process.env.LIVE_AI === '1')('live engines', () => {
  it.each(['extract', 'teach'] as const)('%s answers with valid JSON', async (task) => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-'))
    const b = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES })
    const r = await b.ask({ task, prompt: 'Rispondi solo con questo JSON: {"ok":true}', schema: z.object({ ok: z.boolean() }) })
    expect(r.data).toEqual({ ok: true })
  }, 200_000)
})

describe.runIf(process.env.LIVE_AI === '1')('live conversation', () => {
  it('remembers across two Claude turns', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-'))
    const b = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES })
    const S = z.object({ n: z.number() })
    const js = { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] }
    const id = crypto.randomUUID()
    await b.converse({ task: 'teach', conversationId: id, resume: false, systemPrompt: 'Rispondi solo in JSON.', prompt: 'Ricorda il numero 7. Metti n=7.', schema: S, jsonSchema: js, cwd: dir })
    const r = await b.converse({ task: 'teach', conversationId: id, resume: true, prompt: 'Quale numero ti ho detto? Mettilo in n.', schema: S, jsonSchema: js, cwd: dir })
    expect(r.data).toEqual({ n: 7 })
  }, 300_000)
})

describe.runIf(process.env.LIVE_AI === '1')('live tutor', () => {
  it('runs the first two turns of a real session', async () => {
    const { createSessionRunner } = await import('../../src/main/session/runner')
    const { scanVault } = await import('../../src/main/vault/scan')
    const { TeacherTurnSchema } = await import('../../src/shared/teacher-protocol')
    const { readFile } = await import('node:fs/promises')
    const { homedir } = await import('node:os')
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-sess-'))
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES })
    const runner = createSessionRunner({
      bridge, dir, readNote: (p) => readFile(p, 'utf8'), onUpdate: () => undefined,
      vault: () => scanVault(`${homedir()}/Obsidian Vault`, ['.obsidian', '.antigravity', '.trash', 'Prompts'])
    })
    const id = await runner.start('Teorema di Rolle')
    let s = await runner.get(id)
    expect(s.noteTitle).toBe('Teorema di Rolle')
    if (s.awaiting !== 'learner') console.log('ERRORE', JSON.stringify(s.items))
    expect(s.awaiting).toBe('learner')
    const q = s.pendingQuestion!
    console.log('TURNO 1', JSON.stringify(s.items[1]).slice(0, 1500))
    await runner.answer(id, q.kind === 'choice' ? { questionId: q.id, choice: 0, confidence: 60, text: 'mi sembra la definizione' } : { questionId: q.id, text: "Voglio capirlo bene per l'esame di Analisi 1, anche la dimostrazione." })
    s = await runner.get(id)
    console.log('TURNO 2', JSON.stringify(s.items[s.items.length - 1]).slice(0, 1500))
    for (const it of s.items) if (it.kind === 'teacher') expect(TeacherTurnSchema.safeParse(it.turn).success).toBe(true)
    expect(s.items.filter((i) => i.kind === 'error')).toHaveLength(0)
  }, 600_000)
})
