// @vitest-environment jsdom
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeHandlers } from '../../src/main/ipc-handlers'
import { memoryOf } from '../../src/main/memory/fsrs'
import { createReviewService } from '../../src/main/memory/review'
import { memoryStore } from '../../src/main/memory/store'
import { buildVariantsPrompt, variantsStore } from '../../src/main/memory/variants'
import { ExerciseView } from '../../src/renderer/src/review/ExerciseView'
import { ReviewView } from '../../src/renderer/src/review/ReviewView'
import type { ReviewItem } from '../../src/main/memory/review'
import type { Concept, GraphData } from '../../src/shared/graph-types'
import { settingsSchema } from '../../src/shared/settings-schema'
import type { VaultIndex } from '../../src/shared/vault-types'

afterEach(cleanup)
const T0 = new Date('2026-10-27T10:00:00Z').getTime()

describe('the exercise-type choice is saved', () => {
  it('the settings handler accepts exerciseTypes and reviewSessionSize', async () => {
    const settings = settingsSchema('/x').parse({})
    const saveSettings = vi.fn(async (p: object) => ({ ...settings, ...p }))
    const h = makeHandlers({ loadSettings: async () => settings, saveSettings, scan: vi.fn(), aiStatus: () => ({ agy: 'idle', claude: 'idle' }), openExternal: vi.fn(), chooseFolder: async () => null } as never)
    await expect(h.settingsSet({ exerciseTypes: ['mc', 'open'], reviewSessionSize: 8 })).resolves.toMatchObject({ exerciseTypes: ['mc', 'open'] })
    await expect(h.settingsSet({ exerciseTypes: [] })).rejects.toThrow()
  })
})

describe('memory right after a review', () => {
  it('a concept just answered "Di nuovo" is weak, not "la sai"', () => {
    const m = memoryOf([{ conceptId: 'a', at: T0, grade: 1 }], T0 + 60_000).get('a')!
    expect(m.state).toBe('debole')
    expect(m.R!).toBeLessThan(0.5)
  })
  it('a concept just answered "Difficile" is uncertain', () => {
    expect(memoryOf([{ conceptId: 'a', at: T0, grade: 2 }], T0 + 60_000).get('a')!.state).toBe('incerto')
  })
  it('retrievability falls within the day, not only from one day to the next', () => {
    const lines = [{ conceptId: 'a', at: T0, grade: 3 as const }, { conceptId: 'a', at: T0 + 600_000, grade: 3 as const }]
    const soon = memoryOf(lines, T0 + 700_000).get('a')!.R!
    const later = memoryOf(lines, T0 + 600_000 + 20 * 3_600_000).get('a')!.R!
    expect(later).toBeLessThan(soon)
  })
})

describe('variants follow the chosen types and do not block each other', () => {
  const C = (id: string, note: string): Concept => ({ id, name: id, statement: `${id} vale`, aliases: [], birth: `/v/${note}.md`, notes: [`/v/${note}.md`], sections: {}, depth: 0 })
  it('the prompt asks only for the chosen types', () => {
    const p = buildVariantsPrompt({ noteTitle: 'A', noteText: 'x', concepts: [C('n_a', 'A')], types: ['estimate', 'graph'] })
    expect(p).toContain('SOLO questi tipi: "estimate", "graph"')
    expect(p).not.toContain('{ "type": "order"')
  })
  it('generates notes in parallel, and a second plan waits for the same generation', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-rf4b-'))
    const graph: GraphData = { concepts: [C('a1', 'A'), C('b1', 'B')], chains: [], extracted: {} }
    const index: VaultIndex = { root: '/v', scannedAt: 1, subjects: [], notes: [] }
    let running = 0
    let peak = 0
    const ask = vi.fn(async (req: { prompt: string; schema: { parse(x: unknown): unknown } }) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 50))
      running--
      const id = /^(\w+) \| /m.exec(req.prompt)![1]
      return { data: req.schema.parse({ concepts: [{ id, exercises: [{ type: 'mc', prompt: 'q', options: ['a', 'b'], correct: 0, answer: 'a' }] }] }), fromCache: false, engine: 'agy' as const }
    })
    const svc = createReviewService({ bridge: { ask } as never, memory: memoryStore(dir), variants: variantsStore(dir), graph: async () => graph, vault: async () => index, readNote: async () => '', settings: async () => ({ reviewSessionSize: 12, exerciseTypes: ['mc'] }), workDir: join(dir, 'w'), now: () => T0 })
    const [p1, p2] = await Promise.all([svc.plan(), svc.plan()])
    expect(peak).toBe(2)
    expect(ask).toHaveBeenCalledTimes(2)
    for (const p of [p1, p2]) for (const i of p.items) expect(i.exercise.type).toBe('mc')
  })
})

const mc: ReviewItem = { conceptId: 'n_w', name: 'Weierstrass', notePath: '/v/R.md', noteTitle: 'R', subject: null, R: 0.4, variantId: 'v_1', exercise: { type: 'mc', prompt: 'Quale?', options: ['Giusta', 'Sbagliata'], correct: 0, answer: 'Giusta.' } }
function mountReview(items: ReviewItem[], setImpl?: () => Promise<unknown>) {
  const settings = settingsSchema('/x').parse({})
  let resolveRecord: () => void = () => undefined
  const api = {
    review: {
      plan: vi.fn(async () => ({ items, due: items.length })),
      grade: vi.fn(),
      record: vi.fn(() => new Promise((r) => (resolveRecord = () => r({ memory: { R: 0.9 }, intervals: {} })))),
      intervals: vi.fn(async () => ({ 1: 'a', 2: 'b', 3: 'c', 4: 'd' })),
      memory: vi.fn(async () => ({}))
    },
    settings: { get: vi.fn(async () => settings), set: vi.fn(setImpl ?? (async (p: object) => ({ ...settings, ...p }))) }
  }
  window.sinapsi = api as never
  render(<ReviewView onBack={vi.fn()} onStudy={vi.fn()} onOpenNote={vi.fn()} />)
  return { api, finishRecord: () => resolveRecord() }
}

describe('the review screen', () => {
  it('reverts a type chip and says so when saving fails', async () => {
    mountReview([mc], async () => Promise.reject(new Error('rifiutato')))
    const chip = await screen.findByRole('button', { name: 'Riordina i passi' })
    await act(async () => fireEvent.click(chip))
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(/non salvata/i)
  })
  it('records once even when "Prossima" is clicked twice', async () => {
    const { api, finishRecord } = mountReview([mc, { ...mc, conceptId: 'n_f', name: 'Fermat' }])
    fireEvent.click(await screen.findByRole('button', { name: 'Inizia ripasso' }))
    fireEvent.click(screen.getByRole('button', { name: /Giusta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    const next = await screen.findByRole('button', { name: 'Prossima' })
    fireEvent.click(next)
    fireEvent.click(next)
    await act(async () => finishRecord())
    expect(api.review.record).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('2 / 2')).toBeTruthy()
  })
  it('moves focus to "Prossima" after checking, and to the question of the next item', async () => {
    const { finishRecord } = mountReview([mc, { ...mc, conceptId: 'n_f', name: 'Fermat' }])
    fireEvent.click(await screen.findByRole('button', { name: 'Inizia ripasso' }))
    fireEvent.click(screen.getByRole('button', { name: /Giusta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Verifica' }))
    const next = await screen.findByRole('button', { name: 'Prossima' })
    expect(document.activeElement).toBe(next)
    fireEvent.click(next)
    await act(async () => finishRecord())
    expect(document.activeElement?.id).toBe('rv-q')
  })
})

describe('the graph exercise does not give the answer away', () => {
  it('hides points, readouts and green hints, and waits for a move', () => {
    const onChange = vi.fn()
    render(
      <ExerciseView
        locked={false}
        onChange={onChange}
        exercise={{
          type: 'graph',
          prompt: 'Trova',
          param: 'p',
          target: "f'(p)",
          answer: '0',
          figure: {
            type: 'figure',
            title: 'Fig',
            x: [-2, 2],
            y: [-1, 3],
            functions: { f: 'x^2' },
            params: [{ id: 'p', label: 'Punto', min: -1.5, max: 1.5, step: 0.05, value: -1 }],
            elements: [{ kind: 'curve', fn: 'f' }, { kind: 'line', x: 'p', y: 'f(p)', slope: "f'(p)", greenWhen: "f'(p)" }],
            readouts: [{ label: "f'(p)", expr: "f'(p)" }],
            points: { label: 'Mostra i punti', param: 'p', expr: "f'(p)" }
          }
        }}
      />
    )
    expect(screen.queryByRole('button', { name: 'Mostra i punti' })).toBeNull()
    expect(screen.queryByTestId('readout-0')).toBeNull()
    expect(onChange.mock.calls.some((c) => c[0].ready)).toBe(false)
    fireEvent.change(screen.getByRole('slider', { name: 'Punto' }), { target: { value: '0' } })
    expect(onChange.mock.calls.at(-1)![0]).toMatchObject({ ready: true, correct: true })
    expect(screen.getByTestId('el-1').getAttribute('class')).not.toContain('good')
  })
})
