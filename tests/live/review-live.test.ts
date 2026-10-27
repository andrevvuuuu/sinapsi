import { mkdtemp, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { deriveGraph } from '../../src/main/graph/derive'
import { graphStore } from '../../src/main/graph/store'
import { createReviewService } from '../../src/main/memory/review'
import { memoryStore } from '../../src/main/memory/store'
import { variantsStore } from '../../src/main/memory/variants'
import { scanVault } from '../../src/main/vault/scan'
import { DEFAULT_ENGINES, DEFAULT_EXCLUDED } from '../../src/shared/settings-schema'
import { EXERCISE_TYPES } from '../../src/shared/memory-types'

// Real variants (Gemini) and grading (Claude) on concepts already extracted into LIVE_GRAPH_DIR.
describe.runIf(process.env.LIVE_AI === '1' && !!process.env.LIVE_GRAPH_DIR)('live review', () => {
  it('writes varied exercises for Rolle and grades open answers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-review-'))
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
    const vault = await scanVault(join(homedir(), 'Obsidian Vault'), DEFAULT_EXCLUDED)
    const g = deriveGraph(await graphStore(process.env.LIVE_GRAPH_DIR!).read())
    const rolle = vault.notes.find((n) => n.title === 'Teorema di Rolle')!.path
    const ids = g.concepts.filter((c) => c.birth === rolle).map((c) => c.id)
    const vars = variantsStore(dir)
    const svc = createReviewService({
      bridge,
      memory: memoryStore(dir),
      variants: vars,
      graph: async () => g,
      vault: async () => vault,
      readNote: (p) => readFile(p, 'utf8'),
      settings: async () => ({ reviewSessionSize: 12, exerciseTypes: [...EXERCISE_TYPES] }),
      workDir: join(dir, 'w')
    })
    const t0 = Date.now()
    const plan = await svc.plan({ conceptIds: ids })
    const all = await vars.read()
    console.log(`[live review] varianti: ${all.length} per ${ids.length} concetti in ${Math.round((Date.now() - t0) / 1000)} s`)
    for (const id of ids) {
      const mine = all.filter((v) => v.conceptId === id)
      console.log(`  ${g.concepts.find((c) => c.id === id)!.name}: ${mine.map((v) => v.exercise.type).join(', ')}`)
      expect(mine.length).toBeGreaterThanOrEqual(4)
      expect(new Set(mine.map((v) => v.exercise.type)).size).toBeGreaterThanOrEqual(3)
    }
    console.log(JSON.stringify(plan.items.map((i) => i.exercise), null, 1).slice(0, 3000))
    const concept = g.concepts.find((c) => c.name === 'Teorema di Rolle')!
    const ex = { type: 'open' as const, prompt: 'Che cosa garantisce il teorema di Rolle, e sotto quali ipotesi?', answer: concept.statement }
    const right = await svc.grade({ conceptId: concept.id, exercise: ex, answer: 'Se f è continua su [a,b], derivabile in (a,b) e f(a)=f(b), allora esiste un punto c interno con derivata nulla.', confidence: 80 })
    const wrong = await svc.grade({ conceptId: concept.id, exercise: ex, answer: 'Che la funzione è costante su tutto l intervallo.', confidence: 80 })
    console.log('[live review] giusta:', right, '\n[live review] sbagliata:', wrong)
    expect(right.verdict).toBe('ok')
    expect(wrong.verdict).toBe('wrong')
    console.log((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim())
  }, 900_000)
})
