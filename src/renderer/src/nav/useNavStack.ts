import { useCallback, useState } from 'react'
import {
  push as pushStack,
  pop as popStack,
  replace as replaceStack,
  backLabel,
  type NavStack,
  type BackLabelResult
} from './nav-stack'

export function useNavStack<V extends { view?: string }>(initial: V): {
  stack: NavStack<V>
  current: V
  prev: V | undefined
  backLabel: BackLabelResult
  push: (v: V) => void
  pop: () => void
  replace: (v: V) => void
  canPop: boolean
} {
  const [stack, setStack] = useState<NavStack<V>>([initial])

  const push = useCallback((v: V): void => {
    setStack((s) => pushStack(s, v))
  }, [])

  const pop = useCallback((): void => {
    setStack((s) => popStack(s))
  }, [])

  const replace = useCallback((v: V): void => {
    setStack((s) => replaceStack(s, v))
  }, [])

  const current = stack[stack.length - 1]
  const prev = stack.length >= 2 ? stack[stack.length - 2] : undefined
  const currentBackLabel = backLabel(prev)

  return {
    stack,
    current,
    prev,
    backLabel: currentBackLabel,
    push,
    pop,
    replace,
    canPop: stack.length > 1
  }
}
