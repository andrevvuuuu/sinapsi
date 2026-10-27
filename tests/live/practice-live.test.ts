import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createBridge } from '../../src/main/ai/bridge'
import { nodeSpawn } from '../../src/main/ai/engines'
import { memoryStore } from '../../src/main/memory/store'
import { createExamService } from '../../src/main/practice/exam'
import { transcribePhoto } from '../../src/main/practice/photo'
import { createPracticeRunner } from '../../src/main/practice/runner'
import { DEFAULT_ENGINES } from '../../src/shared/settings-schema'
import { makePdf } from '../unit/helpers/pdf'

const CONTEXT = `CONCETTI SCELTI (id | nome | enunciato) — usa questi id in "targets"
n_rolle | Teorema di Rolle | Se f è continua in [a,b], derivabile in (a,b) e f(a)=f(b), esiste c in (a,b) con f'(c)=0.
n_lagr | Teorema di Lagrange | Se f è continua in [a,b] e derivabile in (a,b), esiste c in (a,b) con f(b)-f(a)=f'(c)(b-a).
n_ferm | Teorema di Fermat | Se f ha un estremo locale interno in c ed è derivabile in c, allora f'(c)=0.

CATENE DI RAGIONAMENTO (premesse ⇒ conclusione)
Teorema di Fermat ⇒ Teorema di Rolle
Teorema di Rolle ⇒ Teorema di Lagrange`

// Real Claude through the CLI: training turns, an exam sheet and its grading, the photo of a sheet.
describe.runIf(process.env.LIVE_AI === '1')('live practice', () => {
  it('trains, examines and reads a sheet', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-live-practice-'))
    const bridge = createBridge({ spawn: nodeSpawn, cacheDir: join(dir, 'c'), usageFile: join(dir, 'usage.jsonl'), engines: async () => DEFAULT_ENGINES })
    const memory = memoryStore(join(dir, 'm'))
    const deps = { bridge, dir: join(dir, 'p'), material: async () => CONTEXT, topic: async () => 'Rolle, Lagrange, Fermat', memory, onUpdate: () => undefined }
    const runner = createPracticeRunner(deps)
    const material = { conceptIds: ['n_rolle', 'n_lagr', 'n_ferm'], sourceIds: [], free: '' }

    let t = Date.now()
    const id = await runner.create(material)
    await runner.retry(id)
    let s = await runner.get(id)
    const p1 = s.problems[0]
    console.log(`[live practice] primo problema in ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify({ phase: s.phase, p1, blocks: s.items.at(-1) }, null, 1))
    expect(s.active).toBe(p1.id)
    expect(p1.targets.every((x) => material.conceptIds.includes(x))).toBe(true)
    const events = await runner.events(id)
    const posed = events.find((e) => e.t === 'tutor')
    expect(posed?.t === 'tutor' && posed.turn.problem?.modelSolution.length).toBeGreaterThan(20)

    t = Date.now()
    await runner.submit(id, { kind: 'hint' })
    s = await runner.get(id)
    const hint = s.items.at(-1)
    console.log(`[live practice] indizio in ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify(hint))
    expect(hint?.kind === 'tutor' && hint.turn.hint?.rung).toBeLessThanOrEqual(1)

    t = Date.now()
    await runner.submit(id, { kind: 'dismiss' })
    s = await runner.get(id)
    console.log(`[live practice] resa in ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify(s.problems[0]))
    expect(s.problems[0]).toMatchObject({ status: 'done', outcome: 'surrendered' })
    expect(s.problems[0].modelSolution).toBeTruthy()
    expect((await memory.read()).every((r) => r.grade === 1 && r.via === 'practice')).toBe(true)

    const exam = createExamService({ ...deps, runner })
    t = Date.now()
    const eid = await exam.start(material, 30)
    await exam.retry(eid)
    let e = await exam.get(eid)
    console.log(`[live practice] compito in ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify(e.exam?.sheet, null, 1))
    expect(e.exam!.sheet.problems.reduce((a, p) => a + p.points, 0)).toBe(30)
    const first = e.exam!.sheet.problems[0]
    t = Date.now()
    await exam.deliver(eid, { [first.id]: 'Non lo so fare.' })
    e = await exam.get(eid)
    console.log(`[live practice] voto in ${Math.round((Date.now() - t) / 1000)} s:`, JSON.stringify(e.exam?.grade, null, 1))
    expect(e.exam!.grade!.total).toBeLessThan(10)

    const pdf = join(dir, 'foglio.pdf')
    await writeFile(pdf, makePdf(['Per Lagrange esiste c tra a e b:', 'sin a - sin b = cos(c) (a - b)', 'quindi |sin a - sin b| <= |a - b|']))
    execFileSync('sips', ['-s', 'format', 'png', pdf, '--out', join(dir, 'foglio.png')])
    t = Date.now()
    const text = await transcribePhoto({ bridge, dir: join(dir, 'foto'), bytes: new Uint8Array(await readFile(join(dir, 'foglio.png'))) })
    console.log(`[live practice] foto in ${Math.round((Date.now() - t) / 1000)} s:`, text)
    expect(text.toLowerCase()).toContain('lagrange')
  }, 1_800_000)
})
