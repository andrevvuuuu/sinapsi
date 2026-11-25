import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { Settings, Engine } from '../../../shared/settings-schema'
import type { VaultResult, EngineStatus as Status, NoteMeta } from '../../../shared/api'
import type { LessonEntry } from '../../../shared/lesson-types'
import type { Memory } from '../../../shared/memory-types'

export type AppDataContextValue = {
  index: VaultResult | null
  settings: Settings | null
  aiStatus: Record<Engine, Status> | null
  due: number
  memory: Record<string, Memory> | null
  lessons: LessonEntry[]
  notes: NoteMeta[]
  refreshIndex: () => Promise<void>
  refreshMemory: () => Promise<void>
  refreshLessons: () => Promise<void>
  setSettings: React.Dispatch<React.SetStateAction<Settings | null>>
}

const computeDue = (m: Record<string, { due: number | null }> | null | undefined): number => {
  if (!m) return 0
  const now = Date.now()
  return Object.values(m).filter((x) => x && x.due !== null && x.due <= now).length
}

const defaultContext: AppDataContextValue = {
  index: null,
  settings: null,
  aiStatus: null,
  due: 0,
  memory: null,
  lessons: [],
  notes: [],
  refreshIndex: async () => undefined,
  refreshMemory: async () => undefined,
  refreshLessons: async () => undefined,
  setSettings: () => undefined
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export function useAppData(): AppDataContextValue {
  const ctx = useContext(AppDataContext)
  return ctx ?? defaultContext
}

export function AppDataProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [index, setIndex] = useState<VaultResult | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [aiStatus, setAiStatus] = useState<Record<Engine, Status> | null>(null)
  const [memory, setMemory] = useState<Record<string, Memory> | null>(null)
  const [due, setDue] = useState(0)
  const [lessons, setLessons] = useState<LessonEntry[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])

  const indexedWith = useRef<string | null>(null)
  const vaultKey = (s: Settings): string => [s.vaultPath, ...(s.excludedFolders ?? [])].join('\n')

  const refreshIndex = useCallback(async (): Promise<void> => {
    try {
      const res = await window.sinapsi?.vault?.index?.()
      if (res) setIndex(res)
    } catch {
      // Ignored
    }
  }, [])

  const refreshMemory = useCallback(async (): Promise<void> => {
    try {
      const m = await window.sinapsi?.review?.memory?.()
      if (m) {
        setMemory(m)
        setDue(computeDue(m))
      }
    } catch {
      // Ignored
    }
  }, [])

  const refreshLessons = useCallback(async (): Promise<void> => {
    try {
      const l = await window.sinapsi?.lessons?.list?.()
      if (l) setLessons(l)
    } catch {
      // Ignored
    }
  }, [])

  const refreshNotes = useCallback(async (): Promise<void> => {
    try {
      const n = await window.sinapsi?.notes?.list?.()
      if (n) setNotes(n)
    } catch {
      // Ignored
    }
  }, [])

  // Mount effect: exactly one IPC call per type, subscriptions, and theme application
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.sinapsi : undefined
    if (!api) return

    // 1. settings.get
    void api.settings?.get?.()
      .then((s) => {
        if (!s) return
        void import('./theme').then((theme) => theme.applyTheme(s.theme, true))
        setSettings(s)
        indexedWith.current ??= vaultKey(s)
      })
      .catch(() => undefined)

    // 2. vault.index
    void refreshIndex()

    // 3. ai.status
    void api.ai?.status?.()
      .then((st) => st && setAiStatus(st))
      .catch(() => undefined)

    // 4. lessons.list
    void refreshLessons()

    // 5. review.memory
    void refreshMemory()

    // 6. notes.list
    void refreshNotes()

    // Subscriptions
    const offVault = api.vault?.onChange?.((idx) => setIndex(idx))
    const offAi = api.ai?.onStatus?.((st) => setAiStatus(st))
    const offNotes = api.notes?.onUpdate?.(() => void refreshNotes())
    const offMemory = api.memory?.onChanged?.(() => void refreshMemory())

    return () => {
      offVault?.()
      offAi?.()
      offNotes?.()
      offMemory?.()
    }
  }, [refreshIndex, refreshMemory, refreshLessons, refreshNotes])

  // Track settings changes: reload index if vaultPath or excludedFolders changed
  useEffect(() => {
    if (!settings) return
    const key = vaultKey(settings)
    if (indexedWith.current === null) {
      indexedWith.current = key
    } else if (indexedWith.current !== key) {
      indexedWith.current = key
      void refreshIndex()
    }
  }, [settings, refreshIndex])

  const value: AppDataContextValue = {
    index,
    settings,
    aiStatus,
    due,
    memory,
    lessons,
    notes,
    refreshIndex,
    refreshMemory,
    refreshLessons,
    setSettings
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
