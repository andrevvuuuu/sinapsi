import { useEffect, useId, useRef, useState } from 'react'
import { RichText } from '../session/RichText'
import './math-select.css'

/**
 * A select whose options can hold formulas: native <option>s can only show plain text, so LaTeX
 * came out raw. Same role as a select (combobox) for screen readers and tests.
 */
export function MathSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  state
}: {
  label: string
  options: string[]
  value: number | null
  onChange: (index: number) => void
  disabled?: boolean
  state?: 'ok' | 'no'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const wrap = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const uid = useId()
  const listId = `${uid}-list`
  const optId = (k: number): string => `${uid}-opt-${k}`
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  const pick = (k: number): void => {
    onChange(k)
    setOpen(false)
    btn.current?.focus()
  }
  return (
    <span className="msel" ref={wrap} data-state={state}>
      <button
        ref={btn}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(hi) : undefined}
        onBlur={(e) => {
          // Tab or a click elsewhere closes the list.
          if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
        disabled={disabled}
        onClick={() => {
          setHi(value ?? 0)
          setOpen((o) => !o)
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            setHi(value ?? 0)
            setOpen(true)
          } else if (open && e.key === 'ArrowDown') {
            e.preventDefault()
            setHi((h) => Math.min(options.length - 1, h + 1))
          } else if (open && e.key === 'ArrowUp') {
            e.preventDefault()
            setHi((h) => Math.max(0, h - 1))
          } else if (open && e.key === 'Home') {
            e.preventDefault()
            setHi(0)
          } else if (open && e.key === 'End') {
            e.preventDefault()
            setHi(options.length - 1)
          } else if (open && e.key === 'Enter') {
            e.preventDefault()
            pick(hi)
          } else if (open && e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
          }
        }}
      >
        {value === null ? '…' : <RichText md={options[value]} className="inline" />}
      </button>
      {open && (
        <span className="msel-list" role="listbox" id={listId} aria-label={label}>
          {options.map((o, k) => (
            <span key={k} id={optId(k)} role="option" aria-selected={k === value} className={k === hi ? 'hi' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(k)}>
              <RichText md={o} className="inline" />
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
