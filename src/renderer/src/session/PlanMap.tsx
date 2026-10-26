import type { Plan } from '../../../shared/teacher-protocol'

/** The plan in dependency order: what is needed first sits on top, the goal at the end. */
function ordered(plan: Plan): Plan['nodes'] {
  const deps = new Map(plan.nodes.map((n) => [n.id, plan.edges.filter(([, to]) => to === n.id).map(([from]) => from)]))
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

export function PlanMap({ plan, current, done }: { plan?: Plan; current?: string; done: string[] }): React.JSX.Element {
  if (!plan) return <p className="empty">Il piano compare dopo la misura.</p>
  return (
    <ol className="map">
      {ordered(plan).map((n) => {
        const cls = [n.status === 'known' ? 'own' : '', n.status === 'goal' ? 'goal' : '', done.includes(n.id) ? 'done' : '', n.id === current ? 'cur' : ''].join(' ')
        const sub = n.id === current ? 'adesso' : done.includes(n.id) ? 'fatto' : n.status === 'known' ? 'già tuo' : n.status === 'goal' ? 'obiettivo' : 'da fare'
        return (
          <li key={n.id} className={'node ' + cls}>
            <i aria-hidden="true" />
            <div>
              {n.title}
              <small>{sub}</small>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
