import { useId, useRef, useState } from 'react'

/** ARIA tabs with roving focus: arrows, Home and End move between tabs. */
export function TabSet({ label, tabs }: { label: string; tabs: { label: string; content: React.ReactNode }[] }): React.JSX.Element {
  const [sel, setSel] = useState(0)
  const id = useId().replace(/:/g, '')
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (i: number): void => {
    const n = (i + tabs.length) % tabs.length
    setSel(n)
    refs.current[n]?.focus()
  }
  return (
    <div className="nv-tabs">
      <div role="tablist" aria-label={label} className="nv-tablist">
        {tabs.map((t, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${id}-t${i}`}
            aria-selected={i === sel}
            aria-controls={`${id}-p${i}`}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => setSel(i)}
            onKeyDown={(e) => {
              const k = e.key
              if (k === 'ArrowRight') go(sel + 1)
              else if (k === 'ArrowLeft') go(sel - 1)
              else if (k === 'Home') go(0)
              else if (k === 'End') go(tabs.length - 1)
              else return
              e.preventDefault()
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div key={sel} role="tabpanel" id={`${id}-p${sel}`} aria-labelledby={`${id}-t${sel}`} className="nv-panel" tabIndex={0}>
        {tabs[sel]?.content}
      </div>
    </div>
  )
}
