import type { Bridge } from '../ai/bridge'
import { parseNota } from '../../shared/nota-schema'

/** e2e only (SINAPSI_FAKE_NOTE=1): a fixed nota viva, so tests never spend quota. */
export const FAKE_NOTA = {
  title: 'Teorema di Rolle',
  titleEm: 'del punto stazionario',
  eyebrow: 'Analisi 1 · Teorema',
  aka: ['Teorema 3.7'],
  lede: 'Se una funzione regolare parte e arriva alla stessa quota, da qualche parte è piatta.',
  tldr: ['Se $f(a)=f(b)$ esiste $c$ con $f\'(c)=0$.', 'Weierstrass + Fermat.'],
  provenance: { fromNote: ['Le sezioni nello stesso ordine'], added: ['Una figura interattiva'], flagged: ['Una formula da ricontrollare'] },
  sections: [
    {
      id: 's1',
      num: '§1',
      title: 'Enunciato',
      titleEm: 'formale',
      blocks: [
        { type: 'theorem', label: 'Teorema 3.7', md: 'Se $f$ è continua su $[a,b]$, derivabile in $(a,b)$ e $f(a)=f(b)$, esiste $c\\in(a,b)$ con $f\'(c)=0$.' },
        {
          type: 'figure',
          title: 'Figura 1 · La tangente diventa orizzontale',
          caption: 'Muovi il punto finché la tangente è piatta.',
          x: [-2, 2],
          y: [-1.5, 3],
          functions: { f: 'x^2 - 1' },
          params: [{ id: 'p', label: 'Punto $c$', min: -1.5, max: 1.5, step: 0.05, value: -1 }],
          elements: [
            { kind: 'curve', fn: 'f', color: 'accent' },
            { kind: 'line', x: 'p', y: 'f(p)', slope: "f'(p)", color: 'warn', greenWhen: "f'(p)" },
            { kind: 'point', x: 'p', y: 'f(p)', drag: 'p', label: 'c' }
          ],
          readouts: [{ label: "f'(c)", expr: "f'(p)" }],
          points: { label: 'Mostra i punti', param: 'p', expr: "f'(p)", at: 'f' }
        },
        { type: 'quiz', prompt: 'Rolle garantisce che $c$ sia unico?', options: ['Sì', 'No'], correct: 1, why: ['No: dice solo che esiste.', 'Esatto: almeno uno.'], fromNote: true }
      ]
    },
    {
      id: 's2',
      num: '§2',
      title: 'Dimostrazione',
      blocks: [
        {
          type: 'proof',
          steps: [
            { kicker: 'Passo 1', title: 'Weierstrass', md: '$f$ ha massimo e minimo su $[a,b]$.' },
            { kicker: 'Passo 2', title: 'Fermat', md: 'Un estremo interno ha derivata nulla.', tryPrompt: 'Perché almeno un estremo è interno?' }
          ]
        },
        { type: 'flag', md: 'Nella nota manca il caso $f$ costante.', correction: 'Se $f$ è costante ogni punto va bene.' }
      ]
    }
  ],
  recap: { ideas: ['Stessa quota agli estremi ⇒ un punto piatto.'], formulas: [{ label: 'Tesi', tex: "f'(c)=0" }] }
}

export function fakeNoteBridge(): Pick<Bridge, 'ask'> {
  return {
    ask: (async () => {
      await new Promise((r) => setTimeout(r, 300))
      return { data: parseNota(FAKE_NOTA), fromCache: false, engine: 'agy' as const }
    }) as Bridge['ask']
  }
}
