import { readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_MODELS,
  settingsSchema,
  type Settings,
  type Task
} from '../../shared/settings-schema'
import type { ExerciseType } from '../../shared/memory-types'
import { dataDir } from './paths'

const file = (): string => join(dataDir(), 'settings.json')

const SETTINGS_VERSION = 4
// Exercise types added after a version: a list saved before it never chose to leave them out.
const NEW_TYPES: [number, ExerciseType][] = [[3, 'explain']]

export async function loadSettings(): Promise<Settings> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(file(), 'utf8'))
  } catch {
    raw = {}
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  // Migrate legacy engines format
  let models: Record<Task, string> = { ...DEFAULT_MODELS }
  if (obj.models && typeof obj.models === 'object') {
    models = { ...DEFAULT_MODELS, ...(obj.models as Record<string, string>) }
  } else if (obj.engines && typeof obj.engines === 'object') {
    models = { ...DEFAULT_MODELS }
  }

  const version = typeof obj.settingsVersion === 'number' ? obj.settingsVersion : 0
  const saved = obj.exerciseTypes
  const types = Array.isArray(saved)
    ? [
        ...saved,
        ...NEW_TYPES.filter(([v, t]) => version < v && !saved.includes(t)).map(([, t]) => t)
      ]
    : saved

  return settingsSchema(homedir()).parse({
    ...obj,
    exerciseTypes: types,
    models
  })
}

/** Merges the patch, validates, and writes atomically (temp file + rename). */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const next = settingsSchema(homedir()).parse({ ...current, ...patch })
  const tmp = file() + '.tmp'
  const stored = {
    settingsVersion: SETTINGS_VERSION,
    ...next
  }
  await writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8')
  await rename(tmp, file())
  return next
}
