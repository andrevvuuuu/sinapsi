import { createHash, randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { Bridge } from '../ai/bridge'
import { AuthRequiredError, EngineMissingError } from '../ai/errors'
import type { ExtractionLine, ExtractorStatus, GraphData } from '../../shared/graph-types'
import type { VaultIndex } from '../../shared/vault-types'
import { deriveGraph } from './derive'
import { ExtractReplySchema, mergeExtraction, pickCandidates } from './extract'
import { buildExtractPrompt } from './extract-prompt'
import type { GraphStore } from './store'

export const EXTRACT_TIMEOUT = 300_000
const IDLE_SECONDS = 300
type Reason = ExtractionLine['reason']

export type Extractor = {
  request(path: string, reason: 'manual' | 'study'): Promise<void>
  backgroundTick(opts: { idleSeconds: number; enabled: boolean; dailyLimit: number }): Promise<string | null>
  status(): ExtractorStatus
  graph(): Promise<GraphData>
}

const hash = (t: string): string => createHash('sha256').update(t).digest('hex')
const day = (ms: number): string => new Date(ms).toDateString()

function friendly(e: unknown): string {
  if (e instanceof AuthRequiredError) return `${e.engine === 'claude' ? 'Claude' : 'Gemini'} chiede di rifare l'accesso: apri il Terminale e scrivi ${e.engine}.`
  if (e instanceof EngineMissingError) return `${e.engine} non è installato su questo Mac.`
  return `Estrazione non riuscita (${e instanceof Error ? e.message.slice(0, 200) : String(e)}).`
}

/**
 * Progressive concept extraction: one serial queue, one job per note at a time. On demand, after
 * studying a note, and in the background while the Mac is idle, a few notes a day.
 */
export function createExtractor(deps: {
  bridge: Pick<Bridge, 'ask'>
  store: GraphStore
  vault: () => Promise<VaultIndex | null>
  readNote: (path: string) => Promise<string>
  workDir: string
  now?: () => number
  onChange: (s: ExtractorStatus) => void
  /** Subject ids being studied (sessions, notes vive): their notes are extracted first. */
  priorities?: () => Promise<string[]>
  /** Notes background extraction may touch (the ones with a nota viva); all when absent. */
  eligible?: () => Promise<Set<string>>
  /** Holds off system sleep during a call (background runs start right when the Mac goes idle). */
  keepAwake?: () => () => void
}): Extractor {
  const now = deps.now ?? Date.now
  const status: ExtractorStatus = { queued: [] }
  const pending = new Map<string, Promise<void>>()
  let chain: Promise<unknown> = Promise.resolve()
  const notify = (): void => deps.onChange({ ...status, queued: [...status.queued] })

  async function available(path: string): Promise<VaultIndex> {
    const idx = await deps.vault()
    if (!idx?.notes.some((n) => n.path === path && n.available)) throw new Error('Nota non trovata nel vault')
    return idx
  }

  async function run(path: string, reason: Reason, index: VaultIndex): Promise<void> {
    status.queued = status.queued.filter((p) => p !== path)
    status.running = path
    notify()
    const release = deps.keepAwake?.()
    try {
      const text = await deps.readNote(path)
      const h = hash(text)
      const g = deriveGraph(await deps.store.read())
      if (reason !== 'manual' && g.extracted[path]?.hash === h) {
        // Touched but unchanged: record it, so the background pass does not pick it again.
        if (reason === 'background') await deps.store.append('extraction', { notePath: path, hash: h, at: now(), reason, nodes: 0, chains: 0, dropped: 0, ok: true, skipped: true })
        return
      }
      const title = index.notes.find((n) => n.path === path)!.title
      await mkdir(deps.workDir, { recursive: true })
      const r = await deps.bridge.ask({
        task: 'extract',
        prompt: buildExtractPrompt({ noteTitle: title, noteText: text, candidates: pickCandidates(g, index, path, text) }),
        schema: ExtractReplySchema,
        timeoutMs: EXTRACT_TIMEOUT,
        cwd: deps.workDir
      })
      const merged = mergeExtraction(r.data as never, {
        notePath: path,
        known: new Set(g.concepts.map((c) => c.id)),
        mint: () => `n_${randomBytes(6).toString('hex')}`,
        mintChain: () => `arg_${randomBytes(6).toString('hex')}`,
        now: now()
      })
      for (const p of merged.props) await deps.store.append('prop', p)
      for (const c of merged.chains) await deps.store.append('chain', c)
      await deps.store.append('extraction', { notePath: path, hash: h, at: now(), reason, nodes: merged.props.length, chains: merged.chains.length, dropped: merged.dropped, ok: true })
      if (status.lastError?.notePath === path) status.lastError = undefined
    } catch (e) {
      console.warn('[graph] estrazione fallita', path, e)
      const message = friendly(e)
      status.lastError = { notePath: path, message }
      await deps.store
        .append('extraction', { notePath: path, hash: '', at: now(), reason, nodes: 0, chains: 0, dropped: 0, ok: false, error: message })
        .catch(() => undefined)
    } finally {
      release?.()
      status.running = undefined
      notify()
    }
  }

  function enqueue(path: string, reason: Reason, index: VaultIndex): Promise<void> {
    const existing = pending.get(path)
    if (existing) return existing
    status.queued.push(path)
    notify()
    const job = chain.then(() => run(path, reason, index))
    chain = job.catch(() => undefined)
    const done = job.finally(() => pending.delete(path))
    pending.set(path, done)
    return done
  }

  return {
    async request(path, reason) {
      const index = await available(path)
      return enqueue(path, reason, index)
    },
    async backgroundTick({ idleSeconds, enabled, dailyLimit }) {
      if (!enabled || idleSeconds < IDLE_SECONDS || pending.size > 0) return null
      const ledgers = await deps.store.read()
      const today = day(now())
      if (ledgers.extractions.filter((e) => e.reason === 'background' && !e.skipped && day(e.at) === today).length >= dailyLimit) return null
      const index = await deps.vault()
      if (!index) return null
      const g = deriveGraph(ledgers)
      // A note that failed in the background today is not retried until tomorrow.
      const failedToday = new Set(ledgers.extractions.filter((e) => !e.ok && day(e.at) === today).map((e) => e.notePath))
      const subjects = new Set((await deps.priorities?.()) ?? [])
      const extractedPaths = new Set(Object.keys(g.extracted))
      const linkedFromExtracted = new Set(
        index.notes.filter((n) => extractedPaths.has(n.path)).flatMap((n) => n.links.filter((l) => l.resolved).map((l) => l.target.toLowerCase()))
      )
      const rank = (n: VaultIndex['notes'][number]): number => (n.subject && subjects.has(n.subject) ? 0 : linkedFromExtracted.has(n.title.toLowerCase()) ? 1 : 2)
      // Never extracted, or edited in Obsidian after the last extraction.
      const stale = (n: VaultIndex['notes'][number]): boolean => !extractedPaths.has(n.path) || n.mtime > g.extracted[n.path].at
      const allowed = deps.eligible ? await deps.eligible() : null
      const candidates = index.notes.filter((n) => n.available && stale(n) && !failedToday.has(n.path) && (!allowed || allowed.has(n.path))).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, 'it'))
      const next = candidates[0]
      if (!next) return null
      await enqueue(next.path, 'background', index)
      return next.path
    },
    status: () => ({ ...status, queued: [...status.queued] }),
    graph: async () => deriveGraph(await deps.store.read())
  }
}
