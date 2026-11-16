import type { Plan } from '../../../shared/teacher-protocol'

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
  done = []
}: {
  plan?: Plan | null
  current?: string | null
  done?: string[]
}): React.JSX.Element {
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
