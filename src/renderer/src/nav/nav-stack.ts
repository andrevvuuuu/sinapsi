export type NavStack<V> = V[]

export const MAX_STACK_SIZE = 20

export function push<V>(stack: NavStack<V>, v: V): NavStack<V> {
  const next = [...stack, v]
  if (next.length > MAX_STACK_SIZE) {
    return next.slice(-MAX_STACK_SIZE)
  }
  return next
}

export function pop<V>(stack: NavStack<V>): NavStack<V> {
  if (stack.length <= 1) {
    return stack
  }
  return stack.slice(0, -1)
}

export function replace<V>(_stack: NavStack<V>, v: V): NavStack<V> {
  return [v]
}

export type BackLabelResult =
  | '← Oggi'
  | '← Grafo'
  | '← Piano'
  | '← Note'
  | '← Registro'
  | '← Ripasso'
  | '← Lezione'
  | '← Indietro'

export function backLabel(prev?: { view?: string } | null): BackLabelResult {
  if (!prev || !prev.view) return '← Indietro'
  switch (prev.view) {
    case 'home':
      return '← Oggi'
    case 'map':
      return '← Grafo'
    case 'plan':
      return '← Piano'
    case 'notes':
      return '← Note'
    case 'lessons':
      return '← Registro'
    case 'review':
      return '← Ripasso'
    case 'lesson':
      return '← Lezione'
    default:
      return '← Indietro'
  }
}
