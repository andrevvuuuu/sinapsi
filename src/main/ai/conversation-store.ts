import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { OpenRouterMessage } from './openrouter'

export interface ConversationStore {
  load(id: string): Promise<OpenRouterMessage[]>
  save(id: string, messages: OpenRouterMessage[]): Promise<void>
  clear(id: string): Promise<void>
}

const MAX_TURNS = 24

export function trimHistory(
  messages: OpenRouterMessage[],
  maxTurns = MAX_TURNS
): OpenRouterMessage[] {
  if (messages.length <= maxTurns) return [...messages]
  const hasSystem = messages[0]?.role === 'system'
  const system = hasSystem ? [messages[0]] : []
  const nonSystem = hasSystem ? messages.slice(1) : messages
  const trimmedNonSystem = nonSystem.slice(-maxTurns)
  return [...system, ...trimmedNonSystem]
}

export function createConversationStore(dir: string): ConversationStore {
  const file = (id: string): string => join(dir, `${id}.json`)

  return {
    async load(id: string): Promise<OpenRouterMessage[]> {
      try {
        const filePath = file(id)
        if (!existsSync(filePath)) return []
        const raw = await readFile(filePath, 'utf8')
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    },

    async save(id: string, messages: OpenRouterMessage[]): Promise<void> {
      try {
        await mkdir(dir, { recursive: true })
        const trimmed = trimHistory(messages)
        await writeFile(file(id), JSON.stringify(trimmed, null, 2), 'utf8')
      } catch (e) {
        console.warn('[ai] conversazione non salvata', id, e)
      }
    },

    async clear(id: string): Promise<void> {
      try {
        const filePath = file(id)
        if (existsSync(filePath)) {
          const { unlink } = await import('node:fs/promises')
          await unlink(filePath)
        }
      } catch {
        // ignore
      }
    }
  }
}
