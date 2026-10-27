import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The app's data folder (macOS Application Support), overridable for tests. */
export function dataDir(): string {
  const dir = process.env.SINAPSI_DATA || join(homedir(), 'Library', 'Application Support', 'Sinapsi')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * A test instance (SINAPSI_DATA set) gets its own Chromium profile: on macOS the default profile
 * folder ("sinapsi") is the data folder of the real app, and Chromium locks a profile for one
 * instance at a time — parallel e2e runs and the open app made each other quit at launch.
 */
export function chromiumProfileDir(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.SINAPSI_DATA ? join(env.SINAPSI_DATA, 'chromium') : null
}
