import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '../../../shared/api'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { useDockHeight } from '../components/useDockHeight'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassShell, ScrollEdges, ViewScene } from '../components/glass'
import { AnswerCard } from './AnswerCard'
import { PlanMap } from './PlanMap'
import { QuestionDock } from './QuestionDock'
import { RichText } from './RichText'
import { sessionScore } from '../../../shared/score'
import './session.css'

const PHASE: Record<SessionState['phase'], string> = {
  probe: 'Misura',
  plan: 'Piano',
  teach: 'Insegnamento',
  consolidate: 'Consolidamento',
  done: 'Conclusa'
}

export function SessionView({
  id,
  onBack,
  onOpenNota
}: {
  id: string
  onBack: () => void
  onOpenNota?: (id: string) => void
}): React.JSX.Element {
  const api = window.sinapsi.session
  const [s, setS] = useState<SessionState | null>(null)
  const [free, setFree] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const createNota = async (): Promise<void> => {
    setCreating(true)
    try {
      onOpenNota?.(await window.sinapsi.notes.create({ sessionId: id }))
    } catch (e) {
      setCreateError(
        (e instanceof Error ? e.message : String(e)).replace(
          /^Error invoking remote method '[^']+': (Error: )?/,
          ''
        )
      )
    } finally {
      setCreating(false)
    }
  }
  const scroller = useRef<HTMLDivElement>(null)
  const dockwrap = useRef<HTMLDivElement>(null)
  // The tutor message the pending question comes with: its start is scrolled into view.
  const lastTutor = useRef<HTMLDivElement>(null)
  const freeField = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: freeField, value: free, onChange: setFree })
  const busy = dictation.state !== 'idle'

  useEffect(() => {
    let alive = true
    void api.get(id).then((x) => alive && setS(x))
    const off = api.onUpdate((x) => x.id === id && setS(x))
    return () => {
      alive = false
      off()
    }
  }, [api, id])

  const measureDock = useDockHeight(scroller, dockwrap, s !== null)
  const q = s?.awaiting === 'learner' ? s.pendingQuestion : undefined

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // The scroll target depends on the room the dock takes now, not after the next resize callback.
    measureDock()
    // A new question: read the message that leads to it from its start, not only its last lines.
    if (q && lastTutor.current && typeof lastTutor.current.scrollIntoView === 'function') {
      lastTutor.current.scrollIntoView({ block: 'start', behavior: 'smooth' })
    } else if (typeof el.scrollTo === 'function')
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [s?.items.length, s?.awaiting, q?.id, measureDock])

  if (!s) return <div className="sess" />
  const score = sessionScore(s.items)
  const sendFree = (): void => {
    if (busy || !free.trim()) return
    void api.say(id, free.trim())
    setFree('')
  }

  return (
    <ViewScene className="sess">
      <GlassSurface render={<header />} radius={0} className="top drag glass-bar glass-text">
        <button type="button" className="pill nodrag back-btn" onClick={onBack}>
          ← Home
        </button>
        <h1>{s.topic}</h1>
        <span className="phase">
          {s.items.length <= 1 && !s.hasTeacherTurn ? 'Obiettivo' : PHASE[s.phase]}
        </span>
        <span className="sp" />
        {(score.points > 0 || score.games > 0) && (
          <span className="score-pill" aria-label="Punteggio">
            {`★ ${score.points} · serie ${score.streak}`}
          </span>
        )}
        {s.noteTitle && <span className="notechip">Dalla tua nota: {s.noteTitle}</span>}
      </GlassSurface>
      <div className="body">
        <GlassContent layout="scroll" className="scroll edge-fade" ref={scroller}>
          <div className="col" aria-live="polite">
            {s.items.map((it, i) => {
              if (it.kind === 'teacher')
                return (
                  <div
                    key={i}
                    className="msg"
                    ref={i === s.items.length - 1 ? lastTutor : undefined}
                  >
                    {it.turn.blocks.map((b, j) => (
                      <RichText key={j} md={b.md} />
                    ))}
                    {it.turn.summary && (
                      <div className="summary">
                        <h3>Hai imparato</h3>
                        <ul>
                          {it.turn.summary.learned.map((x, k) => (
                            <li key={k}>
                              <RichText md={x} className="inline" />
                            </li>
                          ))}
                        </ul>
                        {it.turn.summary.shaky.length > 0 && (
                          <>
                            <h3>Ancora incerto</h3>
                            <ul>
                              {it.turn.summary.shaky.map((x, k) => (
                                <li key={k}>
                                  <RichText md={x} className="inline" />
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        <p className="score-line">
                          {`Punti ${score.points} · serie migliore ${score.bestStreak}${score.games ? ` · giochi ${score.games}` : ''}${score.calibration !== null ? ` · calibrazione ${score.calibration}%` : ''}`}
                        </p>
                        {it.turn.summary.misconceptions.length > 0 && (
                          <>
                            <h3>Misconcezioni</h3>
                            <ul>
                              {it.turn.summary.misconceptions.map((x, k) => (
                                <li key={k}>
                                  <RichText md={x} className="inline" />
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              if (it.kind === 'error')
                return (
                  <div key={i} className="card err" role="alert">
                    <p>{it.message}</p>
                    {i === s.items.length - 1 && s.awaiting === 'retry' && (
                      <button type="button" className="pri" onClick={() => void api.retry(id)}>
                        Riprova
                      </button>
                    )}
                  </div>
                )
              if (it.question && it.answer)
                return <AnswerCard key={i} q={it.question} a={it.answer} />
              return (
                <div key={i} className="msg you">
                  <div>{i === 0 ? s.topic : it.text}</div>
                </div>
              )
            })}
            {s.awaiting === 'retry' && s.items[s.items.length - 1]?.kind !== 'error' && (
              <div className="card err" role="alert">
                <p>Il tutor non ha finito di rispondere (forse l'app è stata chiusa).</p>
                <button type="button" className="pri" onClick={() => void api.retry(id)}>
                  Riprova
                </button>
              </div>
            )}
            {s.awaiting === 'teacher' && (
              <div className="msg typing-row">
                <span className="typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="lab">Il tutor sta pensando…</span>
              </div>
            )}
          </div>
        </GlassContent>
        {/* The library's scroll edge where the conversation passes under the bar and the dock. */}
        {/* Top edge only, like every other view: a bottom edge under the question dock refracted the cards' borders into bright bands. */}
        <ScrollEdges target={scroller} size={72} edges={['top']} />
        {/* Floats over the bottom of the conversation, which reserves its height (--dock-h). */}
        <div className="dockwrap" ref={dockwrap}>
          <div className="dock">
            {q && (
              <QuestionDock
                key={q.id}
                question={q}
                onAnswer={(a) => void api.answer(id, a)}
                onSay={(t) => void api.say(id, t)}
              />
            )}
            {!q && s.awaiting === 'learner' && s.phase !== 'done' && (
              <GlassShell>
                <div className="inner sc-input">
                  <div className="mic-field mic-fill mic-row">
                    <textarea
                      ref={freeField}
                      readOnly={busy}
                      aria-label="Fai una domanda al tutor"
                      placeholder="Fai una domanda al tutor"
                      value={free}
                      rows={1}
                      onChange={(e) => setFree(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          sendFree()
                        }
                      }}
                    />
                    <MicButton dictation={dictation} />
                  </div>
                  <button
                    type="button"
                    className="pri"
                    disabled={busy || !free.trim()}
                    onClick={sendFree}
                  >
                    Invia
                  </button>
                </div>
                <DictationError dictation={dictation} />
              </GlassShell>
            )}
            {s.phase === 'done' && (
              <GlassShell>
                <div className="inner act">
                  <span>
                    {s.notePath
                      ? 'Sessione conclusa. Ora posso scrivere la nota viva dalla tua nota e da questa sessione.'
                      : 'Sessione conclusa.'}
                  </span>
                  {s.notePath && (
                    <button
                      type="button"
                      className="pri"
                      disabled={creating}
                      onClick={() => void createNota()}
                    >
                      Crea la nota viva
                    </button>
                  )}
                  <button type="button" className={s.notePath ? 'ghost' : 'pri'} onClick={onBack}>
                    Torna alla home
                  </button>
                  {createError && <span role="alert">{createError}</span>}
                </div>
              </GlassShell>
            )}
          </div>
        </div>
        <aside className="side" aria-label="Il piano">
          <h2 className="lab">Il piano</h2>
          <PlanMap plan={s.plan} current={s.currentNodeId} done={s.doneNodeIds} />
        </aside>
      </div>
    </ViewScene>
  )
}
