import { useLayoutEffect, useRef, useState } from 'react'

const MODES = ['Studia', 'Esercitati', 'Ripassa'] as const
export type Mode = (typeof MODES)[number]

export function InkModes({
  mode,
  due,
  studyCount,
  practiceCount,
  onChange
}: {
  mode: Mode
  due: number
  studyCount: number | null
  practiceCount: number | null
  onChange: (mode: Mode) => void
}): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  const chips = useRef<Record<string, HTMLButtonElement | null>>({})
  const [box, setBox] = useState({ pill: 0, left: 0, width: 0 })

  useLayoutEffect(() => {
    const measure = (): void => {
      const r = row.current?.getBoundingClientRect(),
        p = pill.current?.getBoundingClientRect(),
        c = chips.current[mode]?.getBoundingClientRect()
      if (r && p && c) setBox({ pill: p.width, left: c.left - r.left, width: c.width })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [mode, due])

  const count =
    mode === 'Ripassa' ? due : mode === 'Esercitati' ? (practiceCount ?? '—') : (studyCount ?? '—')

  return (
    <div className="sh-mode-row" ref={row}>
      <svg className="sh-filter" aria-hidden="true">
        <defs>
          <filter id="sh-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="sh-ink-layer" aria-hidden="true">
        <span className="sh-ink-pill" style={{ width: box.pill }} />
        <span className="sh-ink-blob" style={{ left: box.left, width: box.width }} />
      </div>
      <div className="sh-count-pill" ref={pill}>
        <span className="sh-count-wrap">
          <b className="sh-count-number" key={`${mode}-${count}`}>
            {count}
          </b>
        </span>
        <span className="sh-count-label">{mode === 'Ripassa' ? 'dovuti' : 'suggerimenti'}</span>
      </div>
      <div
        className="sh-chips"
        role="radiogroup"
        aria-label="Modalità di studio"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const n = MODES[(MODES.indexOf(mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3]
          onChange(n)
          chips.current[n]?.focus()
        }}
      >
        {MODES.map((m) => (
          <button
            key={m}
            ref={(el) => {
              chips.current[m] = el
            }}
            type="button"
            role="radio"
            aria-checked={mode === m}
            tabIndex={mode === m ? 0 : -1}
            className={`sh-chip ${mode === m ? 'is-active' : ''}`}
            onClick={() => onChange(m)}
          >
            <span>{m}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
