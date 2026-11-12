import type { Settings } from '../../../shared/settings-schema'
import { applyTheme } from './theme'
import './theme-switch.css'

export function ThemeSwitch({
  theme,
  onChange,
  bare = false,
  buttonRef
}: {
  theme: Settings['theme']
  onChange: (theme: Settings['theme']) => void
  /** Only the switch, without the «Tema» row around it. */
  bare?: boolean
  buttonRef?: React.Ref<HTMLButtonElement>
}): React.JSX.Element {
  const light = theme === 'trattato'
  const toggle = (): void => {
    const nextTheme: Settings['theme'] = light ? 'lavagna' : 'trattato'
    applyTheme(nextTheme, true)
    onChange(nextTheme)
  }
  return (
    <div className={bare ? 'sh-switch-bare' : 'sh-switch-row'}>
      {!bare && <span>Tema</span>}
      <button
        ref={buttonRef}
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={light ? 'Passa al tema scuro (lavagna)' : 'Passa al tema chiaro (trattato)'}
        className="sh-switch"
        onClick={toggle}
        // Enter and Space toggle on keydown (instant); preventDefault stops the button's own click from toggling it back.
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          toggle()
        }}
      >
        <span className="sh-switch-knob" aria-hidden="true" />
      </button>
    </div>
  )
}
