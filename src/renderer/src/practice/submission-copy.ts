import type { Submission } from '../../../shared/practice-protocol'

export function learnerBubble(sub: Submission): string | null {
  if (!sub || typeof sub !== 'object') return null

  switch (sub.kind) {
    case 'hint':
      return 'Mi serve un indizio'
    case 'next':
      return 'Prossimo problema'
    case 'dismiss':
      return 'Lascio questo problema'
    case 'end':
      return 'Basta così per oggi'
    case 'thinking':
    case 'ask':
    case 'restate': {
      const text = sub.text?.trim()
      return text || null
    }
    case 'triage': {
      const text = sub.text?.trim()
      return text ? `Strumento: ${text}` : null
    }
    case 'compass': {
      if (!sub.compass) return null
      const known = sub.compass.known?.trim()
      const stuck = sub.compass.stuck?.trim()
      const question = sub.compass.question?.trim()
      const parts: string[] = []
      if (known) parts.push(`So già: ${known}`)
      if (stuck) parts.push(`Mi blocco: ${stuck}`)
      if (question) parts.push(`Domanda: ${question}`)
      return parts.length > 0 ? parts.join(' / ') : null
    }
    case 'start':
      return null
    default:
      return null
  }
}
