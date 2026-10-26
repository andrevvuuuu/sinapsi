import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeHandlers } from '../../src/main/ipc-handlers'
import { scanVault } from '../../src/main/vault/scan'
import { settingsSchema } from '../../src/shared/settings-schema'

function setup(vaultPath: string) {
  const settings = settingsSchema('/Users/x').parse({ vaultPath })
  const openExternal = vi.fn(async () => undefined)
  const h = makeHandlers({
    loadSettings: async () => settings,
    saveSettings: async (p) => ({ ...settings, ...p }),
    scan: scanVault,
    aiStatus: () => ({ agy: 'idle', claude: 'idle' }),
    openExternal,
    chooseFolder: async () => null
  })
  return { h, openExternal }
}

describe('ipc handlers', () => {
  it('reports a missing vault folder instead of failing', async () => {
    const { h } = setup('/non/esiste/vault')
    expect(await h.vaultIndex()).toEqual({ error: 'missing', path: '/non/esiste/vault' })
  })

  it('returns the index for an existing vault', async () => {
    const { h } = setup(resolve('tests/fixtures/vault'))
    const r = await h.vaultIndex()
    expect('notes' in r && r.notes.length).toBe(4)
  })

  it('rejects invalid settings patches', async () => {
    const { h } = setup('/v')
    await expect(h.settingsSet({ theme: 'x' })).rejects.toThrow()
    await expect(h.settingsSet({ bogus: 1 })).rejects.toThrow()
    await expect(h.settingsSet({ theme: 'trattato' })).resolves.toMatchObject({ theme: 'trattato' })
  })

  it('opens only obsidian:// and https:// links', async () => {
    const { h, openExternal } = setup('/v')
    await expect(h.openExternal('file:///etc/passwd')).rejects.toThrow()
    await h.openExternal('obsidian://open?path=%2FUsers%2Fx%2FNota.md')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})
