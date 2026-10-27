import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
    expect(s.engines.extract).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
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

  it('stores only engine choices that differ from the defaults, so new defaults reach old installs', async () => {
    await saveSettings({ theme: 'lavagna' })
    const onDisk = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(onDisk.engines ?? {}).toEqual({})
    await saveSettings({ engines: { ...(await loadSettings()).engines, note: { engine: 'claude', model: 'opus' } } })
    const again = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(again.engines).toEqual({ note: { engine: 'claude', model: 'opus' } })
    expect((await loadSettings()).engines.note).toEqual({ engine: 'claude', model: 'opus' })
  })

  it('ignores engine entries written by earlier versions as their defaults', async () => {
    const legacy = {
      theme: 'lavagna',
      engines: {
        extract: { engine: 'agy', model: 'gemini-3.8-flash-high' },
        note: { engine: 'agy', model: 'gemini-3.8-flash-high' },
        teach: { engine: 'claude' },
        grade: { engine: 'claude' }
      }
    }
    await writeFile(join(dir, 'settings.json'), JSON.stringify(legacy))
    const s = await loadSettings()
    expect(s.engines.note).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-medium' })
    expect(s.engines.teach).toEqual({ engine: 'claude', model: 'sonnet' })
    expect(s.theme).toBe('lavagna')
  })
})

describe('settings choices that equal an old default', () => {
  it('keeps a deliberate choice of an old default across a reload', async () => {
    const s = await loadSettings()
    await saveSettings({ engines: { ...s.engines, note: { engine: 'agy', model: 'gemini-3.8-flash-high' } } })
    expect((await loadSettings()).engines.note).toEqual({ engine: 'agy', model: 'gemini-3.8-flash-high' })
  })
})
