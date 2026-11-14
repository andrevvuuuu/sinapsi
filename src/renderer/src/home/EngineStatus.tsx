import type { OpenRouterStatus as Status } from '../../../shared/api'

const LABEL: Record<Status, string> = {
  idle: 'pronto',
  busy: 'al lavoro',
  'no-key': 'serve la chiave',
  error: 'errore'
}

export function EngineStatus({
  status,
  onOpenSettings
}: {
  status: Status | Record<string, unknown> | null
  onOpenSettings?: () => void
}): React.JSX.Element | null {
  if (!status) return null
  const currentStatus: Status =
    typeof status === 'string' && (status in LABEL)
      ? (status as Status)
      : 'idle'
  const label = LABEL[currentStatus] ?? 'pronto'
  const isNoKey = currentStatus === 'no-key'
  const title = isNoKey
    ? 'OpenRouter: serve la chiave nelle impostazioni'
    : `OpenRouter ${label}`

  return (
    <div className="status" role="status" aria-label="Stato OpenRouter">
      <span
        className={`pill ${currentStatus}`}
        aria-label={`OpenRouter ${label}`}
        title={title}
        onClick={isNoKey && onOpenSettings ? onOpenSettings : undefined}
        style={isNoKey && onOpenSettings ? { cursor: 'pointer' } : undefined}
      >
        <i aria-hidden="true" />
        <b>OpenRouter</b>
        <small>{label}</small>
      </span>
    </div>
  )
}
