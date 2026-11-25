import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { makeHandlers, SettingsPatch } from '../../src/main/ipc-handlers'
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

  it('saves the whole payload of the settings dialog', async () => {
    const { h } = setup('/v')
    const payload = {
      engines: settingsSchema('/x').parse({}).engines,
      backgroundExtraction: true,
      dailyExtractionLimit: 6,
      reviewSessionSize: 12,
      gamesInSessions: true,
      microPauses: false,
      sessionLimit: true,
      sessionLimitMinutes: 50,
      mastery: { kOpen: 2, kChoice: 3, solidDays: 14 },
      learnerProfile: '',
      graderEngine: 'same',
      fastStart: true
    }
    await expect(h.settingsSet(payload)).resolves.toMatchObject({ mastery: payload.mastery, graderEngine: 'same', fastStart: true })
    await expect(h.settingsSet({ mastery: { kOpen: 9, kChoice: 3, solidDays: 14 } })).rejects.toThrow()
    await expect(h.settingsSet({ learnerProfile: 'x'.repeat(2001) })).rejects.toThrow()
  })

  it('lets every stored setting be patched', () => {
    expect(Object.keys(SettingsPatch.shape).sort()).toEqual(Object.keys(settingsSchema('/x').shape).sort())
  })

  it('opens only obsidian:// and https:// links', async () => {
    const { h, openExternal } = setup('/v')
    await expect(h.openExternal('file:///etc/passwd')).rejects.toThrow()
    await h.openExternal('obsidian://open?path=%2FUsers%2Fx%2FNota.md')
    expect(openExternal).toHaveBeenCalledTimes(1)
  })
})
