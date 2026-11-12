import type { EngineStatus as Status } from '../../../shared/api'
import type { Engine } from '../../../shared/settings-schema'

const NAMES: Record<Engine, string> = { agy: 'Gemini', claude: 'Claude' }
const LABEL: Record<Status, string> = { idle: 'pronto', busy: 'al lavoro', auth: "serve l'accesso", missing: 'non installato', error: 'errore' }
const CMD: Record<Engine, string> = { agy: 'agy', claude: 'claude' }

export function EngineStatus({ status }: { status: Record<Engine, Status> | null }): React.JSX.Element | null {
  if (!status) return null
  return (
    <div className="status" role="status" aria-label="Stato dei motori AI">
      {(Object.keys(NAMES) as Engine[]).map((e) => (
        <span
          key={e}
          className={'pill ' + status[e]}
          aria-label={`${NAMES[e]} ${LABEL[status[e]]}`}
          title={status[e] === 'auth' ? `${NAMES[e]} ${LABEL[status[e]]} · Apri il Terminale e scrivi: ${CMD[e]}` : `${NAMES[e]} ${LABEL[status[e]]}`}
        >
          <i aria-hidden="true" />
          <b>{NAMES[e]}</b><small>{LABEL[status[e]]}</small>
        </span>
      ))}
    </div>
  )
}
