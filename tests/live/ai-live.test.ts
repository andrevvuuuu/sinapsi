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
