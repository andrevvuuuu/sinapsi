import type { Settings } from '../../../shared/settings-schema'

const DOTS = [
  { id: 0, sun: [12, 12, 1.2, 1], moon: [12, 12, 1.1, 1] },
  { id: 1, sun: [12, 8, 1.1, 1], moon: [13, 8, 1.1, 1] },
  { id: 2, sun: [12, 16, 1.1, 1], moon: [13, 16, 1.1, 1] },
  { id: 3, sun: [8, 12, 1.1, 1], moon: [9, 12, 1.1, 1] },
  { id: 4, sun: [16, 12, 1.1, 1], moon: [15, 12, 0.8, 0.8] },
  { id: 5, sun: [9, 9, 1.0, 1], moon: [10, 9, 1.1, 1] },
  { id: 6, sun: [15, 9, 1.0, 1], moon: [16, 9, 0.9, 0.7] },
  { id: 7, sun: [9, 15, 1.0, 1], moon: [10, 15, 1.1, 1] },
  { id: 8, sun: [15, 15, 1.0, 1], moon: [16, 15, 0.9, 0.7] },
  { id: 9, sun: [12, 4, 1.0, 1], moon: [14, 5, 0.9, 0.9] },
  { id: 10, sun: [12, 20, 1.0, 1], moon: [14, 19, 0.9, 0.9] },
  { id: 11, sun: [4, 12, 1.0, 1], moon: [7, 12, 1.0, 1] },
  { id: 12, sun: [20, 12, 1.0, 1], moon: [18, 12, 0.1, 0] },
  { id: 13, sun: [6, 6, 0.9, 0.9], moon: [11, 6, 1.0, 1] },
  { id: 14, sun: [18, 6, 0.9, 0.9], moon: [17, 7, 0.1, 0] },
  { id: 15, sun: [6, 18, 0.9, 0.9], moon: [11, 18, 1.0, 1] },
  { id: 16, sun: [18, 18, 0.9, 0.9], moon: [17, 17, 0.1, 0] },
  { id: 17, sun: [12, 6, 0.8, 0.8], moon: [8, 9, 0.9, 0.9] },
  { id: 18, sun: [12, 18, 0.8, 0.8], moon: [8, 15, 0.9, 0.9] },
  { id: 19, sun: [6, 12, 0.8, 0.8], moon: [6, 12, 0.8, 0.7] },
  { id: 20, sun: [18, 12, 0.8, 0.8], moon: [15, 10, 0.8, 0.7] },
  { id: 21, sun: [8, 8, 0.7, 0.7], moon: [12, 10, 0.8, 0.8] },
  { id: 22, sun: [16, 8, 0.7, 0.7], moon: [15, 14, 0.8, 0.7] },
  { id: 23, sun: [8, 16, 0.7, 0.7], moon: [12, 14, 0.8, 0.8] },
  { id: 24, sun: [16, 16, 0.7, 0.7], moon: [10, 7, 0.8, 0.8] }
]

export function ThemeSwitch({
  theme,
  onChange
}: {
  theme: Settings['theme']
  onChange: (theme: Settings['theme']) => void
}): React.JSX.Element {
  const light = theme === 'trattato'
  return (
    <div className="sh-theme-row">
      <span>Tema</span>
      <button
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={light ? 'Passa al tema scuro (lavagna)' : 'Passa al tema chiaro (trattato)'}
        className={`sh-theme-switch ${light ? 'is-light' : ''}`}
        onClick={() => onChange(light ? 'lavagna' : 'trattato')}
      >
        <span className="sh-knob">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {DOTS.map((d) => {
              const [cx, cy, r, op] = light ? d.sun : d.moon
              return <circle key={d.id} cx={cx} cy={cy} r={r} opacity={op} />
            })}
          </svg>
        </span>
      </button>
    </div>
  )
}
