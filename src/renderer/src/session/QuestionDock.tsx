import { useEffect, useRef, useState } from 'react'
import { ROLE_IT, type LearnerAnswer, type Question } from '../../../shared/teacher-protocol'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { GlassShell, ScrollEdges, Seg } from '../components/glass'
import { RichText } from './RichText'
import { GameDock } from './games/GameDock'
import { focusWhenShown } from '../components/glass-theme'

import { CONFIDENCE_OPTIONS, type ConfKey } from '../components/confidence'

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
  const [confidence, setConfidence] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [pressedOpt, setPressedOpt] = useState<number | 'idk' | null>(null)

  const isChoice = q.kind === 'choice'
  const isGoal = q.role === 'goal'
  const revealOpen = pick !== null && pick !== 'idk'

  useEffect(() => {
    setConfidence(null)
    setPick(null)
    setText('')
    setThoughts('')
    setRevealed(q.role !== 'check')
    setPressedOpt(null)
  }, [q.id, q.role])

  const pickOption = (i: number | 'idk'): void => {
    setPick(i)
    setPressedOpt(i)
  }

  useEffect(() => {
    if (pressedOpt === null) return
    const t = setTimeout(() => setPressedOpt(null), 120)
    return () => clearTimeout(t)
  }, [pressedOpt])

  // A new question takes the focus, so screen readers and the keyboard start from it.
  const head = useRef<HTMLDivElement>(null)
  // Once the dock's glass shell shows (a frame after it mounts).
  useEffect(() => focusWhenShown(head.current), [revealed])
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
  const middle = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!revealed || q.kind === 'game' || q.role === 'plan') return

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          el.isContentEditable ||
          el.getAttribute('contenteditable') === 'true' ||
          Boolean(el.closest('input, textarea, select, [contenteditable]')))
      ) {
        return
      }
      const tgt = e.target
      if (
        tgt instanceof HTMLElement &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.tagName === 'SELECT' ||
          tgt.isContentEditable ||
          tgt.getAttribute('contenteditable') === 'true' ||
          Boolean(tgt.closest('input, textarea, select, [contenteditable]')))
      ) {
        return
      }

      const k = e.key.toUpperCase()
      if (isChoice && q.options && k >= 'A' && k <= 'F') {
        const idx = k.charCodeAt(0) - 65
        if (idx < q.options.length) {
          e.preventDefault()
          pickOption(idx)
          return
        }
      }

      const isConfidenceOpen = (!isChoice && !isGoal) || (isChoice && !isGoal && revealOpen)
      if (isConfidenceOpen && ['1', '2', '3', '4'].includes(e.key)) {
        const numIdx = Number(e.key) - 1
        const opt = CONFIDENCE_OPTIONS[numIdx]
        if (opt) {
          e.preventDefault()
          setConfidence(Number(opt.value))
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [revealed, q.kind, q.role, isChoice, isGoal, q.options, revealOpen])

  if (q.kind === 'game') return <GameDock question={q} onAnswer={onAnswer} />

  if (q.role === 'plan') {
    return (
      <GlassShell>
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
              <MicButton dictation={planMic} size="sm" />
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
      </GlassShell>
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
        <GlassShell>
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
        </GlassShell>
      </>
    )
  }

  const hasConfidence = confidence !== null
  const ready =
    !answerBusy &&
    (isChoice
      ? pick === 'idk' || (pick !== null && (isGoal || hasConfidence))
      : text.trim().length > 0 && (isGoal || hasConfidence))
  const send = (): void => {
    if (!ready) return
    const a: LearnerAnswer = { questionId: q.id }
    if (isChoice) {
      if (pick === 'idk') a.dontKnow = true
      else {
        a.choice = pick as number
        if (!isGoal && confidence !== null) {
          a.confidence = confidence
        }
        if (text.trim()) a.text = text.trim()
      }
    } else {
      a.text = text.trim()
      if (!isGoal && confidence !== null) {
        a.confidence = confidence
      }
    }
    if (thoughts.trim()) a.thoughts = thoughts.trim()
    onAnswer(a)
  }
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // The question and the send row stay in view; in a tall dock the options and fields scroll between them.
  return (
    <GlassShell>
      {/* Says there is more where the options scroll: the library's scroll edge, only where content is hidden. */}
      <ScrollEdges target={middle} size={18} blur={6} />
      <div className="inner has-scroll">
        <div className="lab">{ROLE_IT[q.role]}</div>
        <div ref={head} tabIndex={-1} className="q-head">
          <RichText md={q.prompt} className="q" />
        </div>
        <div className="dock-scroll" ref={middle}>
          {isChoice && (
            <>
              <div className="opts" role="group" aria-label="Opzioni">
                {q.options!.map((o, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`opt ${pressedOpt === i ? 'opt-press' : ''}`}
                    aria-pressed={pick === i}
                    aria-label={`${LETTERS[i]}: ${o}`}
                    onClick={() => pickOption(i)}
                  >
                    <span className="k" aria-hidden="true">
                      {LETTERS[i]}
                    </span>
                    <RichText md={o} className="inline" />
                  </button>
                ))}
                <button
                  type="button"
                  className={`opt idk ${pressedOpt === 'idk' ? 'opt-press' : ''}`}
                  aria-pressed={pick === 'idk'}
                  onClick={() => pickOption('idk')}
                >
                  Non lo so
                </button>
              </div>
              {!isGoal && (
                <div
                  className="qd-reveal"
                  data-open={revealOpen ? '' : undefined}
                  inert={!revealOpen ? true : undefined}
                >
                  <div className="qd-reveal-inner">
                    <div className="conf" role="group" aria-labelledby="cf-l">
                      <span className="lab" id="cf-l">
                        Fiducia
                      </span>
                      <Seg<ConfKey>
                        label="Fiducia"
                        track="plain"
                        value={confidence !== null ? (String(confidence) as ConfKey) : null}
                        onChange={(v) => setConfidence(Number(v))}
                        options={CONFIDENCE_OPTIONS}
                      />
                    </div>
                    <div className="think">
                      <label className="lab" htmlFor="th">
                        Il tuo ragionamento
                      </label>
                      <div className="mic-field">
                        <textarea
                          id="th"
                          ref={answerField}
                          readOnly={answerBusy}
                          placeholder="Perché questa risposta? Quello che ti passa per la testa."
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onKeyDown={onKey}
                        />
                        <MicButton dictation={answerMic} />
                      </div>
                      <DictationError dictation={answerMic} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {!isChoice && (
            <div className="think">
              <label className="lab" htmlFor="th">
                {isGoal ? 'Il tuo obiettivo' : 'La tua risposta'}
              </label>
              <div className="mic-field">
                <textarea
                  id="th"
                  ref={answerField}
                  readOnly={answerBusy}
                  placeholder={
                    q.role === 'recall'
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
          )}
          {!isChoice && !isGoal && (
            <div className="conf" role="group" aria-labelledby="cf-l-open">
              <span className="lab" id="cf-l-open">
                Fiducia
              </span>
              <Seg<ConfKey>
                label="Fiducia"
                track="plain"
                value={confidence !== null ? (String(confidence) as ConfKey) : null}
                onChange={(v) => setConfidence(Number(v))}
                options={CONFIDENCE_OPTIONS}
              />
            </div>
          )}
        </div>
        <div className="act">
          <span className="hint">↵ invia · ⇧↵ a capo</span>
          <button type="button" className="pri" disabled={!ready} onClick={send}>
            Invia risposta
          </button>
        </div>
      </div>
    </GlassShell>
  )
}
