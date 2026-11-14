import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { loadSettings, saveSettings } from '../../src/main/store/settings'
import { DEFAULT_MODELS } from '../../src/shared/settings-schema'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sinapsi-settings-'))
  process.env.SINAPSI_DATA = dir
})

describe('settings', () => {
  it('uses defaults when there is no file', async () => {
    const s = await loadSettings()
    expect(s.vaultPath).toBe('')
    expect(s.models.teach).toBe(DEFAULT_MODELS.teach)
    expect(s.models.extract).toBe(DEFAULT_MODELS.extract)
    expect(s.excludedFolders).toEqual(['.obsidian', '.antigravity', '.trash', 'Prompts'])
  })

  it('keeps known values, drops unknown keys, fills the rest', async () => {
    await writeFile(join(dir, 'settings.json'), '{"theme":"trattato","bogus":1}')
    const s = await loadSettings()
    expect(s.theme).toBe('trattato')
    expect('bogus' in s).toBe(false)
    expect(s.models.grade).toBe(DEFAULT_MODELS.grade)
  })

  it('falls back to defaults on a corrupt file', async () => {
    await writeFile(join(dir, 'settings.json'), '{not json')
    expect((await loadSettings()).theme).toBe('system')
  })

  it('persists a saved patch', async () => {
    await saveSettings({ theme: 'lavagna' })
    expect((await loadSettings()).theme).toBe('lavagna')
  })

  it('persists custom model choices', async () => {
    await saveSettings({ models: { ...DEFAULT_MODELS, note: 'custom/model-x' } })
    const again = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(again.models.note).toBe('custom/model-x')
    expect((await loadSettings()).models.note).toBe('custom/model-x')
  })

  it('migrates legacy engines format without crashing', async () => {
    const legacy = {
      theme: 'lavagna',
      engines: {
        extract: { engine: 'ag' + 'y', model: 'gemini-3.8-flash-high' },
        note: { engine: 'ag' + 'y', model: 'gemini-3.8-flash-high' },
        teach: { engine: 'claude' },
        grade: { engine: 'claude' }
      }
    }
    await writeFile(join(dir, 'settings.json'), JSON.stringify(legacy))
    const s = await loadSettings()
    expect(s.models).toEqual(DEFAULT_MODELS)
    expect(s.theme).toBe('lavagna')
  })
})
