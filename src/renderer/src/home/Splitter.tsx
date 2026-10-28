import { useEffect, useRef } from 'react'

type Props = {
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  /** The panel grows when the line moves left/up (a panel on the right). */
  invert?: boolean
  onActive?: (dragging: boolean) => void
  className?: string
  style?: React.CSSProperties
}

const STEP = 16

/** A line between two sections that can be dragged, or moved with the arrow keys. */
export function Splitter({ orientation, label, value, min, max, onChange, invert, onActive, className, style }: Props): React.JSX.Element {
  const start = useRef<{ pos: number; value: number } | null>(null)
  const stop = useRef<(() => void) | null>(null)
  // Unmounted mid-drag (a view opens): no listener left behind.
  useEffect(() => () => stop.current?.(), [])
  const clamp = (v: number): number => Math.min(max, Math.max(min, Math.round(v)))
  const pos = (e: { clientX: number; clientY: number }): number => (orientation === 'vertical' ? e.clientX : e.clientY)

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    start.current = { pos: pos(e), value }
    onActive?.(true)
    document.body.classList.add('no-select')
    const move = (ev: PointerEvent): void => {
      if (!start.current) return
      const d = pos(ev) - start.current.pos
      onChange(clamp(start.current.value + (invert ? -d : d)))
    }
    const up = (): void => {
      start.current = null
      stop.current = null
      onActive?.(false)
      document.body.classList.remove('no-select')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    stop.current = up
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const onKeyDown = (e: React.KeyboardEvent): void => {
    const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
    const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
    let next: number | null = null
    if (e.key === forward) next = value + (invert ? -STEP : STEP)
    else if (e.key === back) next = value + (invert ? STEP : -STEP)
    else if (e.key === 'Home') next = min
    else if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    onChange(clamp(next))
  }
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`splitter ${orientation} nodrag` + (className ? ` ${className}` : '')}
      style={style}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  )
}
