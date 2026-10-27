import { mkdtemp, readFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { createExtractor } from '../../src/main/graph/jobs'
import { graphStore } from '../../src/main/graph/store'
import { scanVault } from '../../src/main/vault/scan'
import { DEFAULT_ENGINES, DEFAULT_EXCLUDED } from '../../src/shared/settings-schema'

// Real extraction of three linked notes. LIVE_AI=1; LIVE_GRAPH_DIR=<folder> keeps the ledgers.
describe.runIf(process.env.LIVE_AI === '1')('live extraction', () => {
  it('extracts Fermat, Rolle and Lagrange and links the same ideas across notes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-graph-'))
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
    const vault = await scanVault(join(homedir(), 'Obsidian Vault'), DEFAULT_EXCLUDED)
    const store = graphStore(process.env.LIVE_GRAPH_DIR ?? join(dir, 'graph'))
    const x = createExtractor({ bridge, store, vault: async () => vault, readNote: (p) => readFile(p, 'utf8'), workDir: join(dir, 'w'), onChange: () => undefined })
    const titles = ['Teorema di Fermat sui Punti Stazionari', 'Teorema di Rolle', 'Teorema di Lagrange del Valor Medio']
    for (const t of titles) {
      const path = vault.notes.find((n) => n.title === t)!.path
      const t0 = Date.now()
      await x.request(path, 'manual')
      const g = await x.graph()
      const mine = g.concepts.filter((c) => c.notes.includes(path))
      console.log(`[live graph] ${t}: ${Math.round((Date.now() - t0) / 1000)} s, ${mine.length} concetti (${mine.filter((c) => c.birth !== path).length} ritrovati), errore: ${x.status().lastError?.message ?? '—'}`)
      expect(x.status().lastError).toBeUndefined()
      expect(mine.length).toBeGreaterThanOrEqual(5)
      expect(g.chains.filter((c) => c.notes.includes(path)).length).toBeGreaterThanOrEqual(3)
    }
    const g = await x.graph()
    for (const c of g.concepts) expect(c.statement).not.toMatch(/\b(Andrea|studente|la nota)\b/i)
    const lagrange = vault.notes.find((n) => n.title === titles[2])!.path
    const shared = g.concepts.filter((c) => c.notes.includes(lagrange) && c.birth !== lagrange)
    console.log(`[live graph] totale ${g.concepts.length} concetti, ${g.chains.length} catene; Lagrange riusa: ${shared.map((c) => c.name).join(', ')}`)
    console.log((await readFile(join(dir, 'usage.jsonl'), 'utf8')).trim())
    expect(shared.length).toBeGreaterThanOrEqual(1)
  }, 1_200_000)
})
