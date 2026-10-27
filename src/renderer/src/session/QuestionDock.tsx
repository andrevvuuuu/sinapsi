import { useState } from 'react'
import { ROLE_IT, type LearnerAnswer, type Question } from '../../../shared/teacher-protocol'
import { RichText } from './RichText'
import { GameDock } from './games/GameDock'

const LETTERS = 'ABCDEF'

type Props = { question: Question; onAnswer: (a: LearnerAnswer) => void; onSay: (text: string) => void }

export function QuestionDock({ question: q, onAnswer, onSay }: Props): React.JSX.Element {
  const [revealed, setRevealed] = useState(q.role !== 'check')
  const [thoughts, setThoughts] = useState('')
  const [pick, setPick] = useState<number | 'idk' | null>(null)
  const [confidence, setConfidence] = useState(50)
  const [text, setText] = useState('')

  if (q.kind === 'game') return <GameDock question={q} onAnswer={onAnswer} />

  if (q.role === 'plan') {
    return (
      <div className="shell">
        <div className="inner">
          <div className="lab">Il piano</div>
          <RichText md={q.prompt} className="q" />
          <div className="sc-input">
            <textarea aria-label="Chiedi una modifica al piano" placeholder="Vuoi cambiare qualcosa? Scrivilo qui." value={text} onChange={(e) => setText(e.target.value)} rows={1} />
          </div>
          <div className="act">
            <button type="button" className="ghost" disabled={!text.trim()} onClick={() => onSay(text.trim())}>
              Chiedi una modifica
            </button>
            <button type="button" className="pri" onClick={() => onSay('Approvo il piano.')}>
              Approva il piano
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!revealed) {
    return (
      <>
        <div className="rt">
          <label className="lab" htmlFor="rtt">
            Pensieri mentre leggi
          </label>
          <textarea id="rtt" placeholder="Quello che ti viene in mente leggendo." value={thoughts} onChange={(e) => setThoughts(e.target.value)} rows={1} />
        </div>
        <div className="shell">
          <div className="inner">
            <button type="button" className="invite" aria-label="Verifica la tua comprensione" onClick={() => setRevealed(true)}>
              <span>
                <b>Hai finito di leggere?</b>
                <span>Una domanda per vedere se il passo è arrivato.</span>
              </span>
              <span className="go">Verifica la tua comprensione</span>
            </button>
          </div>
        </div>
      </>
    )
  }

  const isChoice = q.kind === 'choice'
  const ready = isChoice ? pick !== null : text.trim().length > 0
  const send = (): void => {
    if (!ready) return
    const a: LearnerAnswer = { questionId: q.id }
    if (isChoice) {
      if (pick === 'idk') a.dontKnow = true
      else {
        a.choice = pick as number
        a.confidence = confidence
        if (text.trim()) a.text = text.trim()
      }
    } else a.text = text.trim()
    if (thoughts.trim()) a.thoughts = thoughts.trim()
    onAnswer(a)
  }
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="shell">
      <div className="inner">
        <div className="lab">{ROLE_IT[q.role]}</div>
        <RichText md={q.prompt} className="q" />
        {isChoice && (
          <>
            <div className="opts" role="group" aria-label="Opzioni">
              {q.options!.map((o, i) => (
                <button key={i} type="button" className="opt" aria-pressed={pick === i} aria-label={`${LETTERS[i]}: ${o}`} onClick={() => setPick(i)}>
                  <span className="k" aria-hidden="true">
                    {LETTERS[i]}
                  </span>
                  <RichText md={o} className="inline" />
                </button>
              ))}
              <button type="button" className="opt idk" aria-pressed={pick === 'idk'} onClick={() => setPick('idk')}>
                Non lo so
              </button>
            </div>
            {pick !== 'idk' && (
              <div className="conf">
                <label className="lab" htmlFor="cf">
                  Fiducia
                </label>
                <input id="cf" type="range" min={0} max={100} step={10} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
                <output htmlFor="cf">{confidence}%</output>
              </div>
            )}
          </>
        )}
        <div className="think">
          <label className="lab" htmlFor="th">
            {isChoice ? 'Il tuo ragionamento' : 'La tua risposta'}
          </label>
          <textarea
            id="th"
            placeholder={isChoice ? 'Perché questa risposta? Quello che ti passa per la testa.' : q.role === 'recall' ? 'Tutto quello che ricordi, senza guardare.' : 'Scrivi come ti viene.'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
          />
        </div>
        <div className="act">
          <span className="hint">↵ invia · ⇧↵ a capo</span>
          <button type="button" className="pri" disabled={!ready} onClick={send}>
            Invia risposta
          </button>
        </div>
      </div>
    </div>
  )
}
