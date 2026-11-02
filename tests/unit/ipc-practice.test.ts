import { describe, expect, it, vi } from 'vitest'
import { makePracticeHandlers, practiceTopic } from '../../src/main/ipc-handlers'

const ID = '11111111-1111-4111-8111-111111111111'
function setup() {
  const runner = { create: vi.fn(async () => ID), submit: vi.fn(async () => undefined), retry: vi.fn(async () => undefined), get: vi.fn(async () => ({ mode: 'train' })), list: vi.fn(async () => []) }
  const exam = { start: vi.fn(async () => ID), retry: vi.fn(async () => undefined), save: vi.fn(async () => undefined), deliver: vi.fn(async () => undefined), get: vi.fn(async () => ({ mode: 'exam' })), hand: vi.fn(async () => undefined), selfGrade: vi.fn(async () => undefined), calibration: vi.fn(async () => []) }
  const photo = vi.fn(async () => 'testo')
  const h = makePracticeHandlers({ runner, exam, catalog: async () => ({ subjects: [], sources: [], suggested: [] }), photo, camera: async () => true })
  return { h, runner, exam, photo }
}
const material = { conceptIds: ['n_1'], sourceIds: [], free: '' }

describe('practice handlers', () => {
  it('needs some material, and validates its shape', async () => {
    const { h, runner } = setup()
    await expect(h.create({ conceptIds: [], sourceIds: [], free: '  ' })).rejects.toThrow('Scegli')
    await expect(h.create({ ...material, sourceIds: ['../x'] })).rejects.toThrow()
    await expect(h.create({ ...material, extra: 1 })).rejects.toThrow()
    expect(await h.create(material)).toBe(ID)
    expect(runner.create).toHaveBeenCalledWith(material)
  })
  it('validates submissions, ids and exam duration and answers', async () => {
    const { h, exam } = setup()
    await expect(h.submit('x', { kind: 'hint' })).rejects.toThrow()
    await expect(h.submit(ID, { kind: 'shout' })).rejects.toThrow()
    await expect(h.examStart(material, 4)).rejects.toThrow()
    await expect(h.examStart(material, 301)).rejects.toThrow()
    await expect(h.examStart(material, 47)).rejects.toThrow()
    await h.examStart(material, 45)
    expect(exam.start).toHaveBeenCalledWith(material, 45, false)
    await h.examStart(material, 45, true)
    expect(exam.start).toHaveBeenLastCalledWith(material, 45, true)
    await expect(h.examStart(material, 45, 'sì')).rejects.toThrow()
    await expect(h.examSave(ID, { e1: 'x'.repeat(20_001) })).rejects.toThrow()
    await h.examDeliver(ID, { e1: 'r' })
    expect(exam.deliver).toHaveBeenCalledWith(ID, { e1: 'r' })
    await expect(h.examSelf(ID, 'e1', 2.3)).rejects.toThrow()
    await expect(h.examSelf(ID, 'e1', -1)).rejects.toThrow()
    await expect(h.examSelf(ID, '', 2)).rejects.toThrow()
    await h.examSelf(ID, 'e1', 7.5)
    expect(exam.selfGrade).toHaveBeenCalledWith(ID, 'e1', 7.5)
  })
  it('routes get and retry by mode, and passes photo bytes', async () => {
    const { h, runner, exam, photo } = setup()
    await h.get(ID)
    expect(exam.get).toHaveBeenCalledWith(ID)
    exam.get.mockResolvedValueOnce({ mode: 'exam' } as never)
    await h.retry(ID)
    expect(exam.retry).toHaveBeenCalledWith(ID)
    exam.get.mockResolvedValueOnce({ mode: 'train' } as never)
    await h.retry(ID)
    expect(runner.retry).toHaveBeenCalledWith(ID)
    await expect(h.photo(ID, 'non bytes')).rejects.toThrow()
    expect(await h.photo(ID, new Uint8Array([1, 2]))).toBe('testo')
    expect(photo).toHaveBeenCalledWith(ID, new Uint8Array([1, 2]))
  })
})

describe('practiceTopic', () => {
  it('names the session after its material', () => {
    const names = new Map([['n_1', 'Rolle'], ['n_2', 'Lagrange'], ['n_3', 'Fermat'], ['n_4', 'Taylor']])
    expect(practiceTopic({ conceptIds: ['n_1', 'n_2'], sourceIds: [], free: '' }, names)).toBe('Rolle, Lagrange')
    expect(practiceTopic({ conceptIds: ['n_1', 'n_2', 'n_3', 'n_4'], sourceIds: ['a'], free: '' }, names)).toBe('Rolle, Lagrange, Fermat e altri 1 · 1 fonte')
    expect(practiceTopic({ conceptIds: [], sourceIds: ['a', 'b'], free: 'autovalori e autovettori di matrici simmetriche reali' }, names)).toBe('autovalori e autovettori di matrici… · 2 fonti')
  })
})
