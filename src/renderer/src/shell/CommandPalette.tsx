import { useEffect, useMemo, useRef, useState } from 'react'
import { GlassOverlay, GlassShell } from '../components/glass'
import { useAppData } from './AppData'
import type { Destination } from './LiquidDock'
import './command-palette.css'

export type CommandPaletteProps = {
  onClose: () => void
  onOpenSource: (path: string) => void
  onStudy: (name: string) => void
  onMapReview: (ids: string[]) => void
  onLesson: (id: string) => void
  onReview: () => void
  onPractice: () => void
  onNavigate: (dest: Destination) => void
  onNotes: () => void
  onLessons: () => void
  onOpenSettings: () => void
}

export type PaletteItemType = 'azione' | 'nota' | 'concetto' | 'lezione'

export type PaletteItem = {
  id: string
  type: PaletteItemType
  title: string
  badge?: string
  aliases?: string[]
  run: () => void
}

export function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isSubsequence(query: string, text: string): boolean {
  let qi = 0
  let ti = 0
  while (qi < query.length && ti < text.length) {
    if (query[qi] === text[ti]) {
      qi++
    }
    ti++
  }
  return qi === query.length
}

/**
 * Matching quality:
 * 1: Prefix (starts with query)
 * 2: Word prefix (any word starts with query)
 * 3: Substring (contains query)
 * 4: Subsequence
 * -1: No match
 */
export function scoreMatch(query: string, rawText: string): number {
  if (!query) return 0
  const q = normalize(query)
  const t = normalize(rawText)

  if (t.startsWith(q)) return 1

  const words = t.split(/[\s_\-–—/.,;:!?()\[\]"']+/)
  for (const w of words) {
    if (w.startsWith(q)) return 2
  }

  if (t.includes(q)) return 3

  if (isSubsequence(q, t)) return 4

  return -1
}

export function CommandPalette({
  onClose,
  onOpenSource,
  onStudy,
  onLesson,
  onReview,
  onPractice,
  onNavigate,
  onNotes,
  onLessons,
  onOpenSettings
}: CommandPaletteProps): React.JSX.Element {
  const { index, lessons } = useAppData()
  const [concepts, setConcepts] = useState<Array<{ id: string; name: string }>>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  // Save previous focus on mount and restore on unmount
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => {
      previousFocus.current?.focus?.()
    }
  }, [])

  // Read concepts from graph once on open
  useEffect(() => {
    let alive = true
    window.sinapsi?.graph
      ?.get?.()
      .then((g) => {
        if (alive && g?.concepts) {
          setConcepts(g.concepts.map((c) => ({ id: c.id, name: c.name })))
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  // Build items catalog
  const allItems = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: 'act-review',
        type: 'azione',
        title: 'Ripassa',
        badge: 'Azione',
        run: () => {
          onReview()
          onClose()
        }
      },
      {
        id: 'act-practice',
        type: 'azione',
        title: 'Esercitati',
        badge: 'Azione',
        run: () => {
          onPractice()
          onClose()
        }
      },
      {
        id: 'act-plan',
        type: 'azione',
        title: 'Piano',
        badge: 'Azione',
        run: () => {
          onNavigate('Piano')
          onClose()
        }
      },
      {
        id: 'act-map',
        type: 'azione',
        title: 'Grafo',
        badge: 'Azione',
        run: () => {
          onNavigate('Mappa')
          onClose()
        }
      },
      {
        id: 'act-notes',
        type: 'azione',
        title: 'Note',
        badge: 'Azione',
        run: () => {
          onNotes()
          onClose()
        }
      },
      {
        id: 'act-lessons',
        type: 'azione',
        title: 'Registro',
        badge: 'Azione',
        run: () => {
          onLessons()
          onClose()
        }
      },
      {
        id: 'act-settings',
        type: 'azione',
        title: 'Impostazioni',
        badge: 'Azione',
        run: () => {
          onOpenSettings()
          onClose()
        }
      }
    ]

    const noteItems: PaletteItem[] = (index && 'notes' in index ? index.notes : []).map((n) => ({
      id: `note-${n.path}`,
      type: 'nota',
      title: n.title,
      aliases: n.aliases,
      badge: 'Nota',
      run: () => {
        onOpenSource(n.path)
        onClose()
      }
    }))

    const conceptItems: PaletteItem[] = concepts.map((c) => ({
      id: `concept-${c.id}`,
      type: 'concetto',
      title: c.name,
      badge: 'Concetto',
      run: () => {
        onStudy(c.name)
        onClose()
      }
    }))

    const lessonItems: PaletteItem[] = lessons.map((l) => ({
      id: `lesson-${l.id}`,
      type: 'lezione',
      title: l.topic,
      badge: 'Lezione',
      run: () => {
        onLesson(l.id)
        onClose()
      }
    }))

    return [...actions, ...noteItems, ...conceptItems, ...lessonItems]
  }, [
    index,
    concepts,
    lessons,
    onReview,
    onPractice,
    onNavigate,
    onNotes,
    onLessons,
    onOpenSettings,
    onOpenSource,
    onStudy,
    onLesson,
    onClose
  ])

  // Filter and rank items up to 50
  const filteredRankedItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim()
    if (!q) {
      return allItems.slice(0, 50)
    }

    const scored: Array<{ item: PaletteItem; score: number }> = []
    for (const item of allItems) {
      const candidates = [item.title, ...(item.aliases ?? [])]
      const scores = candidates.map((c) => scoreMatch(q, c)).filter((s) => s > 0)
      if (scores.length > 0) {
        scored.push({ item, score: Math.min(...scores) })
      }
    }

    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.item.title.length - b.item.title.length
    })

    return scored.slice(0, 50).map((s) => s.item)
  }, [allItems, query])

  // Group items by type: Azioni, Note, Concetti, Lezioni
  const grouped = useMemo<{ type: PaletteItemType; title: string; items: PaletteItem[] }[]>(() => {
    const order: Array<{ type: PaletteItemType; title: string }> = [
      { type: 'azione', title: 'Azioni' },
      { type: 'nota', title: 'Note' },
      { type: 'concetto', title: 'Concetti' },
      { type: 'lezione', title: 'Lezioni' }
    ]

    return order
      .map((grp) => ({
        ...grp,
        items: filteredRankedItems.filter((it) => it.type === grp.type)
      }))
      .filter((grp) => grp.items.length > 0)
  }, [filteredRankedItems])

  const flatList = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Scroll active item into view
  useEffect(() => {
    if (flatList.length > 0 && selectedIndex >= 0 && selectedIndex < flatList.length) {
      const el = document.getElementById(`cmd-item-${flatList[selectedIndex].id}`)
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, flatList])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (flatList.length > 0) {
        setSelectedIndex((idx) => (idx + 1) % flatList.length)
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (flatList.length > 0) {
        setSelectedIndex((idx) => (idx - 1 + flatList.length) % flatList.length)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatList.length > 0 && flatList[selectedIndex]) {
        flatList[selectedIndex].run()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const selectedItem = flatList[selectedIndex]

  return (
    <GlassOverlay className="overlay" onClose={onClose}>
      <GlassShell
        radius={24}
        className="cmd-palette glass-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Palette comandi"
      >
        <div className="cmd-core dlg-core">
          <div className="cmd-input-wrap">
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-listbox"
              aria-activedescendant={selectedItem ? `cmd-item-${selectedItem.id}` : undefined}
              aria-autocomplete="list"
              className="cmd-input"
              placeholder="Cerca note, concetti, lezioni, azioni..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div
            id="cmd-listbox"
            role="listbox"
            className="cmd-listbox"
            aria-label="Risultati comandi"
          >
            {flatList.length === 0 ? (
              <div className="cmd-empty">Nessun risultato</div>
            ) : (
              grouped.map((group) => (
                <div key={group.type} className="cmd-group" role="group" aria-label={group.title}>
                  <div className="cmd-group-title" role="presentation">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const isSelected = selectedItem?.id === item.id
                    return (
                      <div
                        key={item.id}
                        id={`cmd-item-${item.id}`}
                        role="option"
                        aria-selected={isSelected}
                        className={`cmd-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => item.run()}
                      >
                        <span className="cmd-item-title">{item.title}</span>
                        {item.badge && <span className="cmd-item-badge">{item.badge}</span>}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </GlassShell>
    </GlassOverlay>
  )
}
