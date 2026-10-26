import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSettings, saveSettings } from '../../src/main/store/settings'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-settings-'))
  process.env.SINAPSI_DATA = dir
})

describe('settings', () => {
  it('uses defaults when there is no file', async () => {
    const s = await loadSettings()
    expect(s.vaultPath.endsWith('/Obsidian Vault')).toBe(true)
    expect(s.engines.teach.engine).toBe('claude')
    expect(s.engines.extract).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-high' })
    expect(s.excludedFolders).toEqual(['.obsidian', '.antigravity', '.trash', 'Prompts'])
  })

  it('keeps known values, drops unknown keys, fills the rest', async () => {
    await writeFile(join(dir, 'settings.json'), '{"theme":"trattato","bogus":1}')
    const s = await loadSettings()
    expect(s.theme).toBe('trattato')
    expect('bogus' in s).toBe(false)
    expect(s.engines.grade.engine).toBe('claude')
  })

  it('falls back to defaults on a corrupt file', async () => {
    await writeFile(join(dir, 'settings.json'), '{not json')
    expect((await loadSettings()).theme).toBe('system')
  })

  it('persists a saved patch', async () => {
    await saveSettings({ theme: 'lavagna' })
    expect((await loadSettings()).theme).toBe('lavagna')
  })
})
