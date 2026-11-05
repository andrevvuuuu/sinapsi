import { useEffect, useRef, useState } from 'react'
import { ROLE_IT, type LearnerAnswer, type Question } from '../../../shared/teacher-protocol'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { RichText } from './RichText'
import { GameDock } from './games/GameDock'

const LETTERS = 'ABCDEF'

type Props = {
  question: Question
  onAnswer: (a: LearnerAnswer) => void
  onSay: (text: string) => void
}

export function QuestionDock({ question: q, onAnswer, onSay }: Props): React.JSX.Element {
  const [revealed, setRevealed] = useState(q.role !== 'check')
  const [thoughts, setThoughts] = useState('')
  const [pick, setPick] = useState<number | 'idk' | null>(null)
  const [confidence, setConfidence] = useState(50)
  const [text, setText] = useState('')
  // A new question takes the focus, so screen readers and the keyboard start from it.
  const head = useRef<HTMLDivElement>(null)
  useEffect(() => head.current?.focus(), [revealed])
  // Three free-text fields, only one on screen at a time: the plan change, the thoughts while reading, the answer.
  const planField = useRef<HTMLTextAreaElement>(null)
  const thoughtsField = useRef<HTMLTextAreaElement>(null)
  const answerField = useRef<HTMLTextAreaElement>(null)
  const planMic = useDictation({ target: planField, value: text, onChange: setText })
  const thoughtsMic = useDictation({
    target: thoughtsField,
    value: thoughts,
    onChange: setThoughts
  })
  const answerMic = useDictation({ target: answerField, value: text, onChange: setText })
  const planBusy = planMic.state !== 'idle'
  const thoughtsBusy = thoughtsMic.state !== 'idle'
  const answerBusy = answerMic.state !== 'idle'

  if (q.kind === 'game') return <GameDock question={q} onAnswer={onAnswer} />

  if (q.role === 'plan') {
    return (
      <div className="shell">
        <div className="inner">
          <div className="lab">Il piano</div>
          <div ref={head} tabIndex={-1} className="q-head">
            <RichText md={q.prompt} className="q" />
          </div>
          <div className="sc-input">
            <div className="mic-field mic-fill mic-row">
              <textarea
                ref={planField}
                readOnly={planBusy}
                aria-label="Chiedi una modifica al piano"
                placeholder="Vuoi cambiare qualcosa? Scrivilo qui."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={1}
              />
              <MicButton dictation={planMic} />
            </div>
          </div>
          <DictationError dictation={planMic} />
          <div className="act">
            <button
              type="button"
              className="ghost"
              disabled={planBusy || !text.trim()}
              onClick={() => onSay(text.trim())}
            >
              Chiedi una modifica
            </button>
            <button
              type="button"
              className="pri"
              disabled={planBusy}
              onClick={() => onSay('Approvo il piano.')}
            >
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
          <div className="mic-field mic-row">
            <textarea
              id="rtt"
              ref={thoughtsField}
              readOnly={thoughtsBusy}
              placeholder="Quello che ti viene in mente leggendo."
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              rows={1}
            />
            <MicButton dictation={thoughtsMic} size="sm" />
          </div>
          <DictationError dictation={thoughtsMic} />
        </div>
        <div className="shell">
          <div className="inner">
            <button
              type="button"
              className="invite"
              disabled={thoughtsBusy}
              aria-label="Verifica la tua comprensione"
              onClick={() => setRevealed(true)}
            >
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
  const ready = !answerBusy && (isChoice ? pick !== null : text.trim().length > 0)
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
        <div ref={head} tabIndex={-1} className="q-head">
          <RichText md={q.prompt} className="q" />
        </div>
        {isChoice && (
          <>
            <div className="opts" role="group" aria-label="Opzioni">
              {q.options!.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className="opt"
                  aria-pressed={pick === i}
                  aria-label={`${LETTERS[i]}: ${o}`}
                  onClick={() => setPick(i)}
                >
                  <span className="k" aria-hidden="true">
                    {LETTERS[i]}
                  </span>
                  <RichText md={o} className="inline" />
                </button>
              ))}
              <button
                type="button"
                className="opt idk"
                aria-pressed={pick === 'idk'}
                onClick={() => setPick('idk')}
              >
                Non lo so
              </button>
            </div>
            {pick !== 'idk' && (
              <div className="conf">
                <label className="lab" htmlFor="cf">
                  Fiducia
                </label>
                <input
                  id="cf"
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                />
                <output htmlFor="cf">{confidence}%</output>
              </div>
            )}
          </>
        )}
        <div className="think">
          <label className="lab" htmlFor="th">
            {isChoice ? 'Il tuo ragionamento' : 'La tua risposta'}
          </label>
          <div className="mic-field">
            <textarea
              id="th"
              ref={answerField}
              readOnly={answerBusy}
              placeholder={
                isChoice
                  ? 'Perché questa risposta? Quello che ti passa per la testa.'
                  : q.role === 'recall'
                    ? 'Tutto quello che ricordi, senza guardare.'
                    : 'Scrivi come ti viene.'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
            />
            <MicButton dictation={answerMic} />
          </div>
          <DictationError dictation={answerMic} />
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
