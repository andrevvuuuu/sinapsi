import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { appendJsonl, readJsonl } from '../../src/main/store/jsonl'

const Rec = z.object({ n: z.number() })
let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-jsonl-'))
})

describe('jsonl ledgers', () => {
  it('reads back appended records in order', async () => {
    const f = join(dir, 'a.jsonl')
    for (const n of [1, 2, 3]) await appendJsonl(f, { n })
    expect(await readJsonl(f, Rec)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }])
  })

  it('returns an empty list when the file does not exist', async () => {
    expect(await readJsonl(join(dir, 'none.jsonl'), Rec)).toEqual([])
  })

  it('skips a truncated last line and invalid records', async () => {
    const f = join(dir, 'b.jsonl')
    await writeFile(f, '{"n":1}\n{"n":"x"}\n{"n":2}\n{"a":')
    expect(await readJsonl(f, Rec)).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('keeps every line intact under 50 concurrent appends', async () => {
    const f = join(dir, 'c.jsonl')
    await Promise.all(Array.from({ length: 50 }, (_, n) => appendJsonl(f, { n })))
    const lines = (await readFile(f, 'utf8')).trim().split('\n')
    expect(lines).toHaveLength(50)
    expect(lines.every((l) => Rec.safeParse(JSON.parse(l)).success)).toBe(true)
  })
})
