import { useEffect, useRef, useState } from 'react'
import { StudyPacer } from '../components/StudyPacer'
import type { SessionState } from '../../../shared/api'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { useDockHeight } from '../components/useDockHeight'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassShell, ViewScene } from '../components/glass'
import { AnswerCard } from './AnswerCard'
import { ConfirmButton } from '../components/ConfirmButton'
import { PlanMap } from './PlanMap'
import { QuestionDock } from './QuestionDock'
import { RichText } from './RichText'
import { sessionScore } from '../../../shared/score'
import { Skeleton } from '../components/Skeleton'
import { useWaitStage } from '../components/useWaitStage'
import './session.css'

const PHASE: Record<SessionState['phase'], string> = {
  probe: 'Misura',
  plan: 'Piano',
  teach: 'Insegnamento',
  consolidate: 'Consolidamento',
  done: 'Conclusa'
}

const CONFIDENCE_NAMES: Record<number, string> = {
  12: 'Tiro a indovinare',
  37: 'Incerto',
  63: 'Abbastanza sicuro',
  88: 'Sicuro'
}

function CalibrationBlock({
  stats
}: {
  stats: Awaited<ReturnType<typeof window.sinapsi.memory.stats>> | null
}): React.JSX.Element | null {
  if (!stats) return null
  const visibleLevels = (stats.calibration ?? []).filter((c) => c.n > 0)
  const afterN = stats.againRate?.afterSession?.n ?? 0
  const noN = stats.againRate?.noSession?.n ?? 0
  const hasAgain = afterN > 0 || noN > 0
  if (visibleLevels.length === 0 && !hasAgain) return null

  return (
    <div className="calib-block" role="region" aria-label="Calibrazione">
      <h3>Calibrazione</h3>
      {visibleLevels.length > 0 && (
        <ul className="calib-levels">
          {visibleLevels.map((c) => (
            <li key={c.level} className="calib-level-item">
              <b>{c.level}%</b> ({CONFIDENCE_NAMES[c.level] ?? `${c.level}%`}):{' '}
              {Math.round(c.correctRate * 100)}% corrette vs {c.level}% dichiarato ({c.n}{' '}
              {c.n === 1 ? 'risposta' : 'risposte'})
            </li>
          ))}
        </ul>
      )}
      {hasAgain && (
        <p className="calib-again">
          {afterN > 0
            ? `Tasso Ripeti (Again) al primo ripasso post-sessione: ${Math.round(
                stats.againRate!.afterSession.againRate * 100
              )}% (${afterN} ${afterN === 1 ? 'ripasso' : 'ripassi'})`
            : `Tasso Ripeti (Again) al primo ripasso: ${Math.round(
                stats.againRate!.noSession.againRate * 100
              )}% (${noN} ${noN === 1 ? 'ripasso' : 'ripassi'})`}
        </p>
      )}
    </div>
  )
}

export function SessionView({
  id,
  onBack,
  onOpenNota,
  backLabel = '← Oggi'
}: {
  id: string
  onBack: () => void
  onOpenNota?: (id: string) => void
  backLabel?: string
}): React.JSX.Element {
  const api = window.sinapsi.session
  const [s, setS] = useState<SessionState | null>(null)
  const [free, setFree] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [partialText, setPartialText] = useState('')
  const [peekedQIds, setPeekedQIds] = useState<Set<string>>(new Set())
  const [memoryStats, setMemoryStats] = useState<Awaited<
    ReturnType<typeof window.sinapsi.memory.stats>
  > | null>(null)

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
    const offPartial = api.onPartial?.((p: { id: string; text: string }) => {
      if (p.id === id && alive) setPartialText(p.text)
    })
    return () => {
      alive = false
      off()
      offPartial?.()
    }
  }, [api, id])

  useEffect(() => {
    if (s?.awaiting !== 'teacher') {
      setPartialText('')
    }
  }, [s?.awaiting])

  useEffect(() => {
    if (s?.phase !== 'done') return
    let alive = true
    const fn = window.sinapsi?.memory?.stats
    if (typeof fn === 'function') {
      void fn()
        .then((res) => {
          if (alive) setMemoryStats(res)
        })
        .catch(() => {
          if (alive) setMemoryStats(null)
        })
    }
    return () => {
      alive = false
    }
  }, [s?.phase])

  const measureDock = useDockHeight(scroller, dockwrap, s !== null)
  const q = s?.awaiting === 'learner' ? s.pendingQuestion : undefined

  // Closed-book only when the tutor says so (hideLesson) on a recall-type question: a question about what is on screen keeps it visible.
  const isRetrieval = Boolean(q && q.hideLesson === true && ['check', 'recall', 'probe'].includes(q.role))
  const isPeeked =
    (q && peekedQIds.has(q.id)) ||
    Boolean(s?.evidence?.some((e) => e.questionId === q?.id && e.peeked))
  const isBlurred = isRetrieval && !isPeeked

  const handlePeek = (): void => {
    if (!q) return
    setPeekedQIds((prev) => new Set(prev).add(q.id))
    void api.peek(id, q.id)
  }

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

  const isAwaitingTeacher = s?.awaiting === 'teacher'
  const waitStage = useWaitStage({
    engine: 'claude',
    active: Boolean(s && isAwaitingTeacher),
    writing: Boolean(partialText)
  })

  if (!s) {
    return (
      <div className="sess">
        <header className="top drag glass-bar" aria-hidden="true">
          <Skeleton width={80} height={28} radius="pill" />
          <Skeleton width={180} height={22} radius="sm" />
          <span className="sp" />
          <Skeleton width={110} height={24} radius="pill" />
        </header>
        <main className="body split" aria-hidden="true">
          <div className="scroll">
            <div className="col">
              <div className="history">
                <div className="msg t-msg">
                  <Skeleton width="65%" height={56} radius="lg" />
                </div>
                <div className="msg l-msg">
                  <Skeleton width="45%" height={40} radius="lg" />
                </div>
              </div>
            </div>
          </div>
          <aside className="dockwrap ops">
            <div className="dock">
              <Skeleton width="100%" height={120} radius="lg" />
            </div>
          </aside>
        </main>
      </div>
    )
  }
  const score = sessionScore(s.items)
  const sendFree = (): void => {
    if (busy || !free.trim()) return
    void api.say(id, free.trim())
    setFree('')
  }

  const hasOperative = Boolean(
    q ||
    (s.awaiting === 'learner' && s.phase !== 'done') ||
    s.phase === 'done' ||
    s.awaiting === 'confirm'
  )

  return (
    <ViewScene className="sess">
      <StudyPacer onEnd={onBack} />
      <GlassSurface render={<header />} radius={0} className="top drag glass-bar glass-text">
        <button type="button" className="nodrag back-btn" onClick={onBack}>
          {backLabel}
        </button>
        <h1>{s.topic}</h1>
        <span className="phase mono">
          {s.items.length <= 1 && !s.hasTeacherTurn ? 'Obiettivo' : PHASE[s.phase]}
        </span>
        {s.phase !== 'done' && (
          <ConfirmButton
            className="nodrag end-btn"
            label="Termina ora"
            onConfirm={() => void api.end(id)}
          />
        )}
        <span className="sp" />
        {(score.points > 0 || score.games > 0) && (
          <span className="score score-pill" aria-label="Punteggio">
            {`★ ${score.points} · serie ${score.streak}`}
          </span>
        )}
        {s.noteTitle && <span className="notechip">Dalla tua nota: {s.noteTitle}</span>}
      </GlassSurface>

      <PlanMap
        plan={s.plan}
        current={s.currentNodeId}
        done={s.doneNodeIds}
        tree={s.tree}
        concepts={s.concepts}
      />

      <main className="body split">
        <GlassContent
          layout="scroll"
          className="scroll edge-fade"
          ref={scroller}
          aria-label="La lezione"
        >
          <div className="col" aria-live="polite">
            <div
              className="history"
              data-blurred={isBlurred || undefined}
              aria-hidden={isBlurred || undefined}
            >
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
                          <CalibrationBlock stats={memoryStats} />
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
                if (it.question && it.answer) {
                  const ev = s.evidence?.find((e) => e.questionId === it.question!.id)
                  return (
                    <AnswerCard
                      key={i}
                      q={it.question}
                      a={it.answer}
                      sessionId={id}
                      evidence={ev}
                      onContest={(qid) => void api.contest(id, qid)}
                      onFlag={(qid) => void api.flag(id, qid)}
                    />
                  )
                }
                return (
                  <div key={i} className="msg you">
                    <div>{i === 0 ? s.topic : it.text}</div>
                  </div>
                )
              })}
            </div>
            {isBlurred && (
              <div className="retrieval-gate" role="region" aria-label="Recupero attivo">
                <p>La lezione è nascosta per stimolare il richiamo attivo.</p>
                <button type="button" className="pri" onClick={handlePeek}>
                  Mostra lezione
                </button>
              </div>
            )}
            {s.awaiting === 'retry' && s.items[s.items.length - 1]?.kind !== 'error' && (
              <div className="card err" role="alert">
                <p>Il tutor non ha finito di rispondere (forse l'app è stata chiusa).</p>
                <button type="button" className="pri" onClick={() => void api.retry(id)}>
                  Riprova
                </button>
              </div>
            )}
            {s.awaiting === 'teacher' && (
              <div className="msg typing-row streaming-row">
                {partialText ? (
                  <div className="streaming-content">
                    <RichText md={partialText} className="stream-md" />
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => void api.cancel(id)}
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="lab mono" role="status" aria-live="polite">
                      {waitStage.label}
                    </span>
                    <button
                      type="button"
                      className="cancel-btn"
                      onClick={() => void api.cancel(id)}
                    >
                      Annulla
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </GlassContent>

        <aside className="dockwrap ops" ref={dockwrap}>
          <div className="dock">
            {s.awaiting === 'confirm' && (
              <GlassShell>
                <div className="inner confirm-card">
                  <div className="lab">Nota di partenza</div>
                  <h3 className="confirm-title">Su quale nota lavoriamo?</h3>
                  <div className="confirm-list">
                    {(s.candidates ?? []).map((c) => (
                      <button
                        key={c.path}
                        type="button"
                        className="opt confirm-opt"
                        onClick={() => void api.confirm(id, c.path)}
                      >
                        <span>{c.title}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="opt confirm-opt idk"
                      onClick={() => void api.confirm(id, null)}
                    >
                      Nessuna nota
                    </button>
                  </div>
                </div>
              </GlassShell>
            )}
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
            {!hasOperative && (
              <div className="ops-empty">
                <p>Il tutor sta preparando il prossimo passo.</p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </ViewScene>
  )
}
