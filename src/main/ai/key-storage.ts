import { readFile, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

export interface KeyManager {
  getKey(): Promise<string | null>
  setKey(key: string): Promise<void>
  hasKey(): Promise<boolean>
  clearKey(): Promise<void>
}

export interface KeyManagerOptions {
  storageFile: string
  secretFilePath?: string
  envKey?: string
  isPackaged?: boolean
  safeStorage?: typeof safeStorage
}

export function createKeyManager(opts: KeyManagerOptions): KeyManager {
  const getSafeStorage = (): typeof safeStorage | undefined => {
    if (opts.safeStorage) return opts.safeStorage
    try {
      return typeof safeStorage !== 'undefined' ? safeStorage : undefined
    } catch {
      return undefined
    }
  }

  const isPackaged = (): boolean => {
    if (opts.isPackaged !== undefined) return opts.isPackaged
    try {
      return typeof app !== 'undefined' ? app.isPackaged : false
    } catch {
      return false
    }
  }

  async function readStoredKey(): Promise<string | null> {
    try {
      if (!existsSync(opts.storageFile)) return null
      const buf = await readFile(opts.storageFile)
      const ss = getSafeStorage()
      if (ss && ss.isEncryptionAvailable()) {
        return ss.decryptString(buf).trim() || null
      }
      // Fallback for non-encrypted test environments
      const str = buf.toString('utf8').trim()
      return str || null
    } catch {
      return null
    }
  }

  return {
    async getKey(): Promise<string | null> {
      // 1. Stored key via safeStorage
      const stored = await readStoredKey()
      if (stored && stored.trim()) return stored.trim()

      // 2. Environment variable OPENROUTER_API_KEY
      const env = (opts.envKey ?? process.env.OPENROUTER_API_KEY ?? '').trim()
      if (env) return env

      // 3. secret-api.txt at repo root ONLY when !app.isPackaged
      if (!isPackaged()) {
        const secretFile = opts.secretFilePath ?? join(process.cwd(), 'secret-api.txt')
        try {
          if (existsSync(secretFile)) {
            const raw = await readFile(secretFile, 'utf8')
            const trimmed = raw.trim()
            if (trimmed) return trimmed
          }
        } catch {
          // ignore read failure
        }
      }

      return null
    },

    async setKey(key: string): Promise<void> {
      const trimmed = key.trim()
      if (!trimmed) {
        try {
          if (existsSync(opts.storageFile)) await unlink(opts.storageFile)
        } catch {
          // ignore unlink error
        }
        return
      }

      const ss = getSafeStorage()
      if (ss && ss.isEncryptionAvailable()) {
        const encrypted = ss.encryptString(trimmed)
        await writeFile(opts.storageFile, encrypted)
      } else {
        await writeFile(opts.storageFile, Buffer.from(trimmed, 'utf8'))
      }
    },

    async hasKey(): Promise<boolean> {
      const k = await this.getKey()
      return Boolean(k && k.length > 0)
    },

    async clearKey(): Promise<void> {
      try {
        if (existsSync(opts.storageFile)) await unlink(opts.storageFile)
      } catch {
        // ignore
      }
    }
  }
}

export async function resolveApiKey(): Promise<string | null> {
  const km = createKeyManager({ storageFile: join(process.cwd(), '.key.dat') })
  return km.getKey()
}
