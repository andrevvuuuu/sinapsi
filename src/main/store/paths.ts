import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The app's data folder (macOS Application Support), overridable for tests. */
export function dataDir(): string {
  const dir = process.env.SINAPSI_DATA || join(homedir(), 'Library', 'Application Support', 'Sinapsi')
  mkdirSync(dir, { recursive: true })
  return dir
}
