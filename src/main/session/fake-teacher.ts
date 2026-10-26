import type { Bridge } from '../ai/bridge'
import type { TeacherTurn } from '../../shared/teacher-protocol'

/** Scripted tutor for end-to-end tests (SINAPSI_FAKE_TEACHER=1): no AI quota is used. */
export const FAKE_SCRIPT: TeacherTurn[] = [
  { phase: 'probe', blocks: [{ type: 'text', md: 'Prima di tutto: a cosa ti serve?' }], question: { id: 'q1', role: 'goal', kind: 'open', prompt: 'Cosa vuoi saper fare alla fine?' } },
  {
    phase: 'probe',
    blocks: [{ type: 'text', md: 'Vediamo da dove partiamo.' }],
    question: { id: 'q2', role: 'probe', kind: 'choice', prompt: 'Se $f(a)=f(b)$, cosa garantisce Rolle?', options: ["Esiste $c$ con $f'(c)=0$", '$f$ è costante'], correct: 0, why: ['È la tesi di Rolle.', 'Non serve che sia costante.'], nodeId: 'rolle' }
  },
  {
    phase: 'plan',
    blocks: [{ type: 'text', md: 'Partiamo da Rolle e ci arriviamo in due passi.' }],
    plan: {
      nodes: [{ id: 'rolle', title: 'Teorema di Rolle', status: 'known' }, { id: 'corda', title: 'Pendenza della corda', status: 'todo' }, { id: 'lagrange', title: 'Teorema di Lagrange', status: 'goal' }],
      edges: [['rolle', 'lagrange'], ['corda', 'lagrange']]
    },
    question: { id: 'q3', role: 'plan', kind: 'open', prompt: 'Ti va bene questo piano?' }
  },
  { phase: 'teach', blocks: [{ type: 'text', md: 'Primo passo.' }], question: { id: 'q4', role: 'predict', kind: 'open', prompt: 'Con un solo numero, quanto sale in media la funzione?', nodeId: 'corda' } },
  {
    phase: 'teach',
    blocks: [{ type: 'text', md: 'La pendenza media è $$\\frac{f(b)-f(a)}{b-a}$$' }],
    question: { id: 'q5', role: 'check', kind: 'choice', prompt: 'Pendenza tra $(1,2)$ e $(3,8)$?', options: ['3', '6'], correct: 0, why: ['(8−2)/(3−1) = 3.', 'È solo il dislivello.'], nodeId: 'corda' }
  },
  { phase: 'consolidate', blocks: [{ type: 'text', md: 'Abbiamo finito.' }], question: { id: 'q6', role: 'recall', kind: 'open', prompt: 'Svuota la testa: scrivi tutto quello che ricordi.', nodeId: 'lagrange' } },
  { phase: 'done', blocks: [{ type: 'text', md: 'Ecco cosa resta.' }], summary: { learned: ['Pendenza della corda'], shaky: ['Funzione ausiliaria g'], misconceptions: [] } }
]

export function fakeTeacher(): Pick<Bridge, 'converse'> {
  const counts = new Map<string, number>()
  return {
    async converse(req) {
      const key = req.conversationId
      const n = counts.get(key) ?? 0
      counts.set(key, n + 1)
      await new Promise((r) => setTimeout(r, 300))
      return { data: FAKE_SCRIPT[Math.min(n, FAKE_SCRIPT.length - 1)] as never, conversationId: key, engine: 'claude' }
    }
  }
}
