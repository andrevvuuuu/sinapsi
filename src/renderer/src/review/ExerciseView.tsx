import type { Exercise } from '../../../shared/exercise-schema'
import { Choice, TrueFalse } from './exercises/Choice'
import { GraphExercise } from './exercises/GraphExercise'
import { Estimate, Fill, Match, Open } from './exercises/Inputs'
import type { ExerciseState } from './exercises/shared'
import { Order, SpotError } from './exercises/Steps'

export type { ExerciseState }

/** One exercise: it reports its state; the review card decides when to check it. */
export function ExerciseView({ exercise, locked, onChange }: { exercise: Exercise; locked: boolean; onChange: (s: ExerciseState) => void }): React.JSX.Element {
  switch (exercise.type) {
    case 'mc':
    case 'counterexample':
      return <Choice exercise={exercise} locked={locked} onChange={onChange} />
    case 'truefalse':
      return <TrueFalse exercise={exercise} locked={locked} onChange={onChange} />
    case 'order':
      return <Order exercise={exercise} locked={locked} onChange={onChange} />
    case 'spoterror':
      return <SpotError exercise={exercise} locked={locked} onChange={onChange} />
    case 'fill':
      return <Fill exercise={exercise} locked={locked} onChange={onChange} />
    case 'match':
      return <Match exercise={exercise} locked={locked} onChange={onChange} />
    case 'estimate':
      return <Estimate exercise={exercise} locked={locked} onChange={onChange} />
    case 'graph':
      return <GraphExercise exercise={exercise} onChange={onChange} />
    case 'open':
      return <Open locked={locked} onChange={onChange} />
  }
}
