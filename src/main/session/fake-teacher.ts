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
  {
    phase: 'teach',
    blocks: [{ type: 'text', md: 'Giusto. Un gioco veloce prima di andare avanti.' }],
    question: { id: 'q5b', role: 'check', kind: 'game', prompt: 'Abbina ogni teorema a ciò che garantisce.', game: { type: 'match', pairs: [['Rolle', 'derivata nulla in un punto'], ['Lagrange', 'tangente parallela alla corda']] }, nodeId: 'lagrange' }
  },
  {
    phase: 'consolidate',
    blocks: [{ type: 'text', md: 'Ultimo giro: vero o falso, svelto.' }],
    question: {
      id: 'q5c',
      role: 'recall',
      kind: 'game',
      prompt: 'Lampo sul teorema di Lagrange.',
      game: {
        type: 'speed',
        items: [
          { statement: 'Lagrange richiede $f$ derivabile in $(a,b)$', true: true, why: 'È un’ipotesi.' },
          { statement: 'Il punto $c$ è sempre unico', true: false, why: 'Ne esiste almeno uno.' },
          { statement: 'Rolle è un caso particolare di Lagrange', true: true, why: 'Con $f(a)=f(b)$.' }
        ]
      },
      nodeId: 'lagrange'
    }
  },
  { phase: 'consolidate', blocks: [{ type: 'text', md: 'Abbiamo finito.' }], question: { id: 'q6', role: 'recall', kind: 'open', prompt: 'Svuota la testa: scrivi tutto quello che ricordi.', nodeId: 'lagrange' } },
  { phase: 'done', blocks: [{ type: 'text', md: 'Ecco cosa resta.' }], summary: { learned: ['Pendenza della corda'], shaky: ['Funzione ausiliaria g'], misconceptions: [] } }
]

/** e2e only (SINAPSI_FAKE_TEACHER_SCRIPT=long-measure): the Misura question of Andrea's screenshot, after a long tutor message — four options of two or three lines with math. */
export const LONG_MEASURE_SCRIPT: TeacherTurn[] = [
  FAKE_SCRIPT[0],
  {
    phase: 'probe',
    blocks: [
      {
        type: 'text',
        md: [
          'Bene, allora partiamo da un esempio concreto. Il **Principio del Buon Ordinamento** dice che ogni sottoinsieme non vuoto di $\\mathbb{N}$ ha un elemento minimo.',
          'Considera l’insieme $S = \\{ n \\in \\mathbb{N} : n^2 > 50 \\}$. Non è vuoto, perché $8^2 = 64 > 50$, quindi per il principio ha un minimo. Il minimo è $8$: infatti $7^2 = 49 \\le 50$, e nessun numero più piccolo di $7$ può stare in $S$.',
          'Ora la parte delicata. Nelle dimostrazioni per assurdo si usa spesso così: si suppone che l’insieme dei controesempi $C$ non sia vuoto, si prende il suo minimo $m$ e si costruisce un controesempio più piccolo di $m$, che è impossibile.',
          'Ti propongo quattro ragionamenti su questo schema. Uno solo è corretto: leggili con calma prima di scegliere.'
        ].join('\n\n')
      }
    ],
    question: {
      id: 'q2',
      role: 'probe',
      kind: 'choice',
      prompt: 'Quale ragionamento è corretto?',
      options: [
        'Se $C \\neq \\emptyset$ ha minimo $m$ e da $m$ si ricava un controesempio $m’ < m$, allora $C$ non ha minimo, contro il principio: dunque $C = \\emptyset$ e la proprietà vale per ogni $n \\in \\mathbb{N}$.',
        'Se $C \\neq \\emptyset$ basta trovare un elemento $c \\in C$ con $c > 0$: allora $c - 1 \\in C$ e, ripetendo, si arriva a $0 \\in C$, che è assurdo perché la proprietà vale in $0$ per verifica diretta.',
        'Il principio garantisce che $C$ abbia un massimo $M$; se da $M$ si ricava un controesempio $M + 1 > M$ si ottiene un assurdo, quindi $C$ è vuoto e la proprietà vale per tutti gli $n \\ge 0$.',
        'Si prende il minimo $m$ di $\\mathbb{N} \\setminus C$ e si mostra che $m + 1 \\in \\mathbb{N} \\setminus C$: per il principio $\\mathbb{N} \\setminus C = \\mathbb{N}$, quindi $C = \\emptyset$ senza bisogno di altri passaggi.'
      ],
      correct: 0,
      why: ['È lo schema corretto.', 'Non usa il minimo.', 'Il principio non dà un massimo.', 'Il minimo del complementare non basta.'],
      nodeId: 'rolle'
    }
  },
  ...FAKE_SCRIPT.slice(2)
]

export function fakeTeacher(script: TeacherTurn[] = FAKE_SCRIPT): Pick<Bridge, 'converse'> {
  const counts = new Map<string, number>()
  return {
    async converse(req) {
      const key = req.conversationId
      const n = counts.get(key) ?? 0
      counts.set(key, n + 1)
      await new Promise((r) => setTimeout(r, 300))
      return { data: script[Math.min(n, script.length - 1)] as never, conversationId: key, engine: 'claude' }
    }
  }
}
