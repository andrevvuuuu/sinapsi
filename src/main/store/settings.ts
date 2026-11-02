import { readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_ENGINES, settingsSchema, TASKS, type EngineChoice, type Settings, type Task } from '../../shared/settings-schema'
import type { ExerciseType } from '../../shared/memory-types'
import { dataDir } from './paths'

const file = (): string => join(dataDir(), 'settings.json')

// Phases 1–2 wrote every engine choice to disk, defaults included. Entries equal to what those
// versions used as defaults were never chosen by the user, so they must not hide today's defaults.
const OLD_GEMINI = { engine: 'agy', model: 'gemini-3.8-flash-high' }
const LEGACY: Record<Task, object[]> = {
  extract: [OLD_GEMINI],
  note: [OLD_GEMINI],
  variants: [OLD_GEMINI],
  notebook: [OLD_GEMINI],
  teach: [{ engine: 'claude' }],
  grade: [{ engine: 'claude' }]
}
const SETTINGS_VERSION = 3
// Exercise types added after a version: a list saved before it never chose to leave them out.
const NEW_TYPES: [number, ExerciseType][] = [[3, 'explain']]
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

function dropEngines(engines: unknown, isDefault: (t: Task, c: unknown) => boolean): Partial<Record<Task, EngineChoice>> {
  if (!engines || typeof engines !== 'object') return {}
  const out: Partial<Record<Task, EngineChoice>> = {}
  for (const t of TASKS) {
    const c = (engines as Record<string, unknown>)[t]
    if (c !== undefined && !isDefault(t, c)) out[t] = c as EngineChoice
  }
  return out
}

export async function loadSettings(): Promise<Settings> {
  let raw: unknown = {}
  try {
    raw = JSON.parse(await readFile(file(), 'utf8'))
  } catch {
    raw = {}
  }
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  // Files written from phase 3 on carry a version: their engine entries are real choices.
  const legacy = obj.settingsVersion === undefined
  const engines = dropEngines(obj.engines, (t, c) => legacy && LEGACY[t].some((l) => same(l, c)))
  const version = typeof obj.settingsVersion === 'number' ? obj.settingsVersion : 0
  const saved = obj.exerciseTypes
  const types = Array.isArray(saved) ? [...saved, ...NEW_TYPES.filter(([v, t]) => version < v && !saved.includes(t)).map(([, t]) => t)] : saved
  return settingsSchema(homedir()).parse({ ...obj, exerciseTypes: types, engines: { ...DEFAULT_ENGINES, ...engines } })
}

/** Merges the patch, validates, and writes atomically (temp file + rename). */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = settingsSchema(homedir()).parse({ ...(await loadSettings()), ...patch })
  const tmp = file() + '.tmp'
  // Only real choices go to disk, so a future change of default reaches this install too.
  const stored = { settingsVersion: SETTINGS_VERSION, ...next, engines: dropEngines(next.engines, (t, c) => same(DEFAULT_ENGINES[t], c)) }
  await writeFile(tmp, JSON.stringify(stored, null, 2), 'utf8')
  await rename(tmp, file())
  return next
}
