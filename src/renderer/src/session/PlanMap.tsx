import type { Plan } from '../../../shared/teacher-protocol'
import type { ConceptProgress, MinimalTree } from '../../../shared/session-types'

export interface PlanMapProps {
  plan?: Plan | null
  current?: string | null
  done?: string[]
  tree?: MinimalTree | null
  concepts?: Record<string, ConceptProgress> | null
}

const STATUS_LABELS: Record<ConceptProgress['status'], string> = {
  unseen: 'da vedere',
  explained: 'spiegato',
  probed: 'verificato',
  repairing: 'da riparare',
  mastered: 'padroneggiato'
}

function openObsidian(birth: string): void {
  const url = 'obsidian://open?path=' + encodeURIComponent(birth)
  const openExternal =
    window.sinapsi?.app?.openExternal ??
    (window as unknown as { api?: { app?: { openExternal?: (u: string) => Promise<void> } } }).api
      ?.app?.openExternal
  void openExternal?.(url)
}

/** The plan in dependency order: what is needed first sits on top, the goal at the end. */
function ordered(plan: Plan): Plan['nodes'] {
  const deps = new Map(
    plan.nodes.map((n) => [n.id, plan.edges.filter(([, to]) => to === n.id).map(([from]) => from)])
  )
  const out: Plan['nodes'] = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    deps.get(id)?.forEach(visit)
    const n = plan.nodes.find((x) => x.id === id)
    if (n) out.push(n)
  }
  plan.nodes.filter((n) => n.status !== 'goal').forEach((n) => visit(n.id))
  plan.nodes.forEach((n) => visit(n.id))
  return out
}

export function PlanMap({
  plan,
  current,
  done = [],
  tree,
  concepts
}: PlanMapProps): React.JSX.Element {
  if (tree?.nodes && tree.nodes.length > 0) {
    return (
      <aside className="tl-a plan-timeline" aria-label="Il piano">
        <span className="mono lab">Il piano</span>
        <ol className="map tree-map">
          {tree.nodes.map((n) => {
            const isCurrent = n.id === current
            const isDone = done.includes(n.id)
            const isGoal = Boolean(n.goal)
            const status: ConceptProgress['status'] = concepts?.[n.id]?.status ?? 'unseen'
            const statusLabel = STATUS_LABELS[status] ?? status

            const classes = [
              'node',
              'tree-node',
              isGoal ? 'goal' : '',
              isDone ? 'done' : '',
              isCurrent ? 'cur' : '',
              `status-${status}`
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <li key={n.id} className={classes}>
                <i aria-hidden="true" />
                <div className="node-content">
                  <div className="node-title-row">
                    <span className="node-name">{n.name}</span>
                    {n.birth && (
                      <button
                        type="button"
                        className="birth-link"
                        title={`Apri nota in Obsidian (${n.birth})`}
                        aria-label={`Apri nota in Obsidian: ${n.birth}`}
                        onClick={() => openObsidian(n.birth)}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 9v4H3V4h4" />
                          <path d="M9 3h4v4" />
                          <path d="M6 10L13 3" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="node-badges">
                    <span className={`chip role role-${n.role}`}>{n.role}</span>
                    <span className={`status-pill status-${status}`}>
                      <span className={`dot dot-${status}`} aria-hidden="true" />
                      <span className="status-label">{statusLabel}</span>
                    </span>
                    {isGoal && <span className="chip goal-chip">Obiettivo</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </aside>
    )
  }

  if (!plan || !plan.nodes || plan.nodes.length === 0) {
    return (
      <aside className="tl-a plan-timeline" aria-label="Il piano">
        <span className="mono lab">Il piano</span>
        <p className="empty">Il piano compare dopo la misura.</p>
      </aside>
    )
  }

  const nodes = ordered(plan)
  return (
    <aside className="tl-a plan-timeline" aria-label="Il piano">
      <span className="mono lab">Il piano</span>
      <ol className="map">
        {nodes.map((n) => {
          const isCurrent = n.id === current
          const isDone = done.includes(n.id)
          const isKnown = n.status === 'known'
          const isGoal = n.status === 'goal'

          const classes = [
            'node',
            isKnown ? 'own' : '',
            isGoal ? 'goal' : '',
            isDone ? 'done' : '',
            isCurrent ? 'cur' : ''
          ]
            .filter(Boolean)
            .join(' ')

          const subtitle = isCurrent
            ? 'adesso'
            : isDone
              ? 'fatto'
              : isKnown
                ? 'già tuo'
                : isGoal
                  ? 'obiettivo'
                  : 'da fare'

          return (
            <li key={n.id} className={classes}>
              <i aria-hidden="true" />
              <div>
                {n.title}
                <small>{subtitle}</small>
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
