import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { TEACHER_SYSTEM_PROMPT } from '../../src/main/session/prompt'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'
import { TeacherTurnSchema, teacherJsonSchema, type TeacherTurn } from '../../src/shared/teacher-protocol'

// The real tutor, asked mid-lesson for a game: it must answer with a valid game question.
describe.runIf(process.env.LIVE_AI === '1')('live games', () => {
  it('the tutor proposes a playable game', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-games-'))
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'u.jsonl'), engines: async () => DEFAULT_ENGINES })
    const t0 = Date.now()
    const r = await bridge.converse<TeacherTurn>({
      task: 'teach',
      conversationId: randomUUID(),
      resume: false,
      systemPrompt: TEACHER_SYSTEM_PROMPT,
      prompt:
        'Voglio studiare: Teorema di Lagrange. (Contesto per la prova: abbiamo già fatto misura e piano, e mi hai spiegato Rolle, la pendenza della corda e la funzione ausiliaria g; le mie verifiche sono andate bene.) Adesso, per variare, proponimi un gioco su quello che abbiamo visto.',
      schema: TeacherTurnSchema as z.ZodType<TeacherTurn>,
      jsonSchema: teacherJsonSchema(),
      cwd: dir
    })
    console.log(`[live games] in ${Math.round((Date.now() - t0) / 1000)} s:`, JSON.stringify(r.data, null, 1))
    expect(r.data.question?.kind).toBe('game')
    expect(r.data.question?.game).toBeTruthy()
  }, 300_000)
})
