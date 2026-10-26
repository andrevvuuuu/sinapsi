import { readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { settingsSchema, type Settings } from '../../shared/settings-schema'
import { dataDir } from './paths'

const file = (): string => join(dataDir(), 'settings.json')

export async function loadSettings(): Promise<Settings> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(file(), 'utf8'))
  } catch {
    raw = {}
  }
  return settingsSchema(homedir()).parse(raw && typeof raw === 'object' ? raw : {})
}

/** Merges the patch, validates, and writes atomically (temp file + rename). */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = settingsSchema(homedir()).parse({ ...(await loadSettings()), ...patch })
  const tmp = file() + '.tmp'
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8')
  await rename(tmp, file())
  return next
}
