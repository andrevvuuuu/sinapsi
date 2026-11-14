import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { transcribePhoto } from '../../src/main/practice/photo'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const ok = (reply: unknown) => vi.fn(async (req: { schema: { parse(x: unknown): unknown } }) => ({ data: req.schema.parse(reply), fromCache: false, model: 'test-model' }))

describe('transcribePhoto', () => {
  it('saves the photo next to the session and asks vision model with base64 image', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-photo-'))
    const ask = ok({ readable: true, text: '$\\cos c$' })
    expect(await transcribePhoto({ bridge: { ask } as never, dir, bytes: PNG })).toBe('$\\cos c$')
    await transcribePhoto({ bridge: { ask } as never, dir, bytes: JPG })
    expect((await readdir(dir)).sort()).toEqual(['foglio-1.png', 'foglio-2.jpg'])
    expect(new Uint8Array(await readFile(join(dir, 'foglio-1.png')))).toEqual(PNG)
    const req = ask.mock.calls[1][0] as unknown as { task: string; prompt: string; images: string[] }
    expect(req).toMatchObject({ task: 'photo' })
    expect(req.images[0]).toContain('data:image/jpeg;base64,')
    expect(req.prompt).toMatch(/Trascrivi/)
  })
  it('says when the sheet cannot be read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-photo-'))
    await expect(transcribePhoto({ bridge: { ask: ok({ readable: false, text: '' }) } as never, dir, bytes: PNG })).rejects.toThrow('Non riesco a leggere il foglio')
  })
  it('refuses files that are not photos, and photos over 15 MB', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sinapsi-photo-'))
    const ask = ok({ readable: true, text: 'x' })
    await expect(transcribePhoto({ bridge: { ask } as never, dir, bytes: new TextEncoder().encode('#!/bin/sh') })).rejects.toThrow('immagine')
    const big = new Uint8Array(15 * 1024 * 1024 + 1)
    big.set(PNG)
    await expect(transcribePhoto({ bridge: { ask } as never, dir, bytes: big })).rejects.toThrow('troppo grande')
    expect(ask).not.toHaveBeenCalled()
  })
})
