import { useCallback, useMemo, useRef } from 'react'
import type { Exercise } from '../../../../shared/exercise-schema'
import type { Figure } from '../../../../shared/nota-schema'
import { FigureView } from '../../nota/figure/FigureView'
import { evalIn, fmt, makeScope } from '../../nota/figure/plot'
import type { ExerciseState } from './shared'

/** The figure without what would give the answer away: "Mostra i punti", readouts, green hints. */
function withoutHints(f: Figure): Figure {
  const out: Figure = { ...f, elements: f.elements.map((el) => ({ ...el, greenWhen: undefined })) }
  delete out.points
  delete out.readouts
  return out
}

/** "Sul grafico": the point is right when the target expression is (almost) zero there. */
export function GraphExercise({
  exercise,
  onChange
}: {
  exercise: Extract<Exercise, { type: 'graph' }>
  onChange: (s: ExerciseState) => void
}): React.JSX.Element {
  const { param, target } = exercise
  const figure = useMemo(() => withoutHints(exercise.figure), [exercise.figure])
  const start = useRef<number | null>(null)
  const report = useCallback(
    (params: Record<string, number>) => {
      // The first report is the starting position: not an answer yet.
      if (start.current === null) {
        start.current = params[param]
        return
      }
      const v = evalIn(figure, target, makeScope(figure, params))
      const tol = 0.02 * (figure.y[1] - figure.y[0])
      onChange({
        answer: `${param} ≈ ${fmt(params[param])}`,
        correct: Number.isFinite(v) && Math.abs(v) <= tol,
        ready: true
      })
    },
    [figure, param, target, onChange]
  )
  return <FigureView fig={figure} onParams={report} />
}
