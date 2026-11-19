import type { ReviewLine } from '../../shared/memory-types'
import { proceduralLens } from '../../shared/procedural'

/** Concepts with two correct, unsupported practice reviews on separate local calendar days. */
export function independentConcepts(lines: ReviewLine[]): Set<string> {
  return new Set([...proceduralLens(lines)].filter(([, lens]) => lens.independent).map(([id]) => id))
}
