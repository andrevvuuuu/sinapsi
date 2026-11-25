import { useState, useEffect, useRef } from 'react'
import './confirm-button.css'

export interface ConfirmButtonProps {
  label: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  className?: string
  disabled?: boolean
}

export function ConfirmButton({
  label,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  onConfirm,
  className,
  disabled = false
}: ConfirmButtonProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!confirming) return

    confirmBtnRef.current?.focus()

    const timer = setTimeout(() => {
      setConfirming(false)
    }, 4000)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirming(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [confirming])

  if (!confirming) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    )
  }

  return (
    <span className="confirm-btn-group nodrag">
      <span role="status" aria-live="polite" className="sr">
        Richiesta di conferma
      </span>
      <button
        ref={confirmBtnRef}
        type="button"
        className="confirm-btn-primary nodrag"
        onClick={() => {
          setConfirming(false)
          onConfirm()
        }}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="confirm-btn-cancel nodrag"
        onClick={() => setConfirming(false)}
      >
        {cancelLabel}
      </button>
    </span>
  )
}
