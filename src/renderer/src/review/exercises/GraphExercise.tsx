import { useCallback } from 'react'
import type { Exercise } from '../../../../shared/exercise-schema'
import { FigureView } from '../../nota/figure/FigureView'
import { evalIn, fmt, makeScope } from '../../nota/figure/plot'
import type { ExerciseState } from './shared'

/** "Sul grafico": the point is right when the target expression is (almost) zero there. */
export function GraphExercise({ exercise, onChange }: { exercise: Extract<Exercise, { type: 'graph' }>; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  const { figure, param, target } = exercise
  const report = useCallback(
    (params: Record<string, number>) => {
      const v = evalIn(figure, target, makeScope(figure, params))
      const tol = 0.02 * (figure.y[1] - figure.y[0])
      onChange({ answer: `${param} ≈ ${fmt(params[param])}`, correct: Number.isFinite(v) && Math.abs(v) <= tol, ready: true })
    },
    [figure, param, target, onChange]
  )
  return <FigureView fig={figure} onParams={report} />
}
