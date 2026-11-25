import type { VaultIndex } from '../../shared/vault-types'
import { scanVault, type ScanMemo, type Deps } from './scan'

export type VaultIndexCache = {
  get(root: string, excluded: string[]): Promise<VaultIndex>
  invalidate(): void
}

export type VaultIndexCacheOptions = {
  scan?: (
    root: string,
    excluded: string[],
    partial?: Partial<Deps>,
    memo?: ScanMemo
  ) => Promise<VaultIndex>
  ttlMs?: number
  now?: () => number
}

function sameExcluded(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((val, i) => val === sb[i])
}

export function createVaultIndexCache(options: VaultIndexCacheOptions = {}): VaultIndexCache {
  const scan = options.scan ?? scanVault
  const ttlMs = options.ttlMs ?? 30_000
  const now = options.now ?? Date.now

  const memo: ScanMemo = new Map()
  let lastIndex: VaultIndex | null = null
  let lastRoot: string | null = null
  let lastExcluded: string[] | null = null
  let lastScanAt = 0
  let invalidated = false

  let inFlight: Promise<VaultIndex> | null = null
  let inFlightRoot: string | null = null
  let inFlightExcluded: string[] | null = null
  let currentToken = 0

  return {
    async get(root: string, excluded: string[]): Promise<VaultIndex> {
      const currentTime = now()
      const isFresh =
        !invalidated &&
        lastIndex !== null &&
        lastRoot === root &&
        sameExcluded(lastExcluded ?? [], excluded) &&
        currentTime - lastScanAt < ttlMs

      if (isFresh) {
        return lastIndex!
      }

      if (inFlight && inFlightRoot === root && sameExcluded(inFlightExcluded ?? [], excluded)) {
        return inFlight
      }

      if (lastRoot !== null && lastRoot !== root) {
        memo.clear()
      }

      const token = ++currentToken
      inFlightRoot = root
      inFlightExcluded = [...excluded]

      const promise = (async () => {
        try {
          const idx = await scan(root, excluded, {}, memo)
          if (token === currentToken) {
            lastIndex = idx
            lastRoot = root
            lastExcluded = [...excluded]
            lastScanAt = now()
            invalidated = false
          }
          return idx
        } finally {
          if (token === currentToken) {
            inFlight = null
            inFlightRoot = null
            inFlightExcluded = null
          }
        }
      })()

      inFlight = promise
      return promise
    },

    invalidate(): void {
      invalidated = true
      lastIndex = null
      currentToken++
      inFlight = null
      inFlightRoot = null
      inFlightExcluded = null
    }
  }
}
