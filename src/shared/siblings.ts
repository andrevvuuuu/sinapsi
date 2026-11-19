import type { GraphData } from './graph-types'

export function confusableSiblings(
  graph: GraphData,
  chosenIds: string[],
  perConcept = 2
): Map<string, string[]> {
  const conceptsById = new Map(graph.concepts.map((concept) => [concept.id, concept]))
  const chosenSet = new Set(chosenIds)
  const limit = Math.max(0, Math.floor(perConcept))
  const result = new Map<string, string[]>()

  for (const chosenId of chosenIds) {
    const chosen = conceptsById.get(chosenId)
    if (!chosen || result.has(chosenId)) continue

    const siblings = graph.concepts
      .filter((candidate) => candidate.id !== chosenId && !chosenSet.has(candidate.id))
      .map((candidate) => {
        const sameBirth = candidate.birth === chosen.birth
        const sharedChain = graph.chains.some((leftChain) => {
          if (leftChain.conclusion === chosenId) {
            const chosenPremises = new Set(leftChain.premises)
            if (
              graph.chains.some(
                (rightChain) =>
                  rightChain.conclusion === candidate.id &&
                  rightChain.premises.some((premise) => chosenPremises.has(premise))
              )
            ) {
              return true
            }
          }

          return (
            leftChain.premises.includes(chosenId) &&
            leftChain.premises.includes(candidate.id)
          )
        })

        return {
          id: candidate.id,
          score: (sharedChain ? 2 : 0) + (sameBirth ? 1 : 0),
          depthDifference: Math.abs(candidate.depth - chosen.depth)
        }
      })
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.depthDifference - right.depthDifference ||
          left.id.localeCompare(right.id)
      )
      .slice(0, limit)
      .map((candidate) => candidate.id)

    result.set(chosenId, siblings)
  }

  return result
}
