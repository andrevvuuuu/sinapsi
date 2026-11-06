import { useEffect, useRef, useState } from 'react'
import type { PracticeProblem, PracticeState } from '../../../main/practice/events'
import { hintBlocked, MODE_IT, OUTCOME_IT, type Submission } from '../../../shared/practice-protocol'
import { useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import { useDockHeight } from '../components/useDockHeight'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import { GlassShell, ScrollEdges, ViewScene } from '../components/glass'
import { RichText } from '../session/RichText'
import { ExamView } from './ExamView'
import { snippet } from './exam-format'
import { PhotoButton } from './PhotoButton'
import './practice.css'

const PHASE_IT = { warmup: 'Riscaldamento', body: 'Corpo', retest: 'Ritest', done: 'Fine' } as const
const OUTCOME_CHIP = {
  solved: ['risolto', 'ok'],
  solved_hints: ['aiuti', 'mid'],
  surrendered: ['arreso', 'no']
} as const
const clean = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )
function ProblemDock({
  problem,
  sessionId,
  onSend
}: {
  problem: PracticeProblem
  sessionId: string
  onSend: (s: Submission) => Promise<void>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [line, setLine] = useState<number | undefined>(undefined)
  const [photoText, setPhotoText] = useState('')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation({ target: area, value: text, onChange: setText })
  const dictating = dictation.state !== 'idle'
  const middle = useRef<HTMLDivElement>(null)
  // One request at a time: a double click must not cost a second hint.
  const once = async (sub: Submission): Promise<boolean> => {
    if (sending.current) return false
    sending.current = true
    setBusy(true)
    try {
      await onSend(sub)
      return true
    } catch {
      return false
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  useEffect(() => area.current?.focus(), [problem.id])
  const ready = !!text.trim() || !!photoText || line !== undefined
  const send = async (): Promise<void> => {
    if (!ready || dictating) return
    const sub: Submission = {
      kind: 'thinking',
      ...(line !== undefined ? { line } : {}),
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(photoText ? { photoText } : {})
    }
    if (!(await once(sub))) return
    setText('')
    setPhotoText('')
    setLine(undefined)
  }
  return (
    <GlassShell render={<section />} aria-label="Problema">
      {/* Says there is more where the lines and the work scroll: the library's scroll edge, only where content is hidden. */}
      <ScrollEdges target={middle} size={18} blur={6} />
      {/* The statement and the send row stay in view; in a tall dock the lines and the work scroll between them. */}
      <div className="inner has-scroll">
        <div className="lab">Problema</div>
        <div className="st">
          <RichText md={problem.statement} />
        </div>
        <div className="dock-scroll" ref={middle}>
          {problem.lines && (
            <div className="lines" role="group" aria-label="Righe della dimostrazione">
              {problem.lines.map((l, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={line === i}
                  onClick={() => setLine(line === i ? undefined : i)}
                >
                  <span>{i + 1}</span>
                  <RichText md={l} />
                </button>
              ))}
            </div>
          )}
          <div className="work">
            <label className="lab" htmlFor="pr-wk">
              Il tuo ragionamento
            </label>
            <div className="mic-field">
              <textarea
                ref={area}
                readOnly={dictating}
                id="pr-wk"
                placeholder="Lavora qui, pensa ad alta voce. Puoi mandare anche solo un pezzo."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <MicButton dictation={dictation} />
            </div>
            <DictationError dictation={dictation} />
            {photoText && (
              <div className="att">
                <span className="file">letto dal foglio</span>
                <button type="button" className="linkish" onClick={() => setPhotoText('')}>
                  togli
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="row">
          <PhotoButton
            sessionId={sessionId}
            onText={(t) => setPhotoText((p) => [p, t].filter(Boolean).join('\n\n'))}
          />
          <button
            type="button"
            className="ghost warn"
            disabled={busy || hintBlocked(problem)}
            title={hintBlocked(problem) ? 'Prima scrivi un tentativo, anche solo un pezzo' : undefined}
            onClick={() => void once({ kind: 'hint' })}
          >
            {hintBlocked(problem) ? 'Prima un tentativo' : 'Dammi un indizio'}
          </button>
          <button
            type="button"
            className="ghost quiet"
            onClick={() => {
              if (
                window.confirm(
                  'Lasciare questo problema? Vedrai la soluzione e tornerà nel ritest.'
                )
              )
                void once({ kind: 'dismiss' })
            }}
          >
            Lascia il problema
          </button>
          <span className="sp" />
          <span className="hintk">↵ invia</span>
          <button
            type="button"
            className="pri"
            disabled={!ready || busy || dictating}
            onClick={() => void send()}
          >
            Invia
          </button>
        </div>
      </div>
    </GlassShell>
  )
}

function Arc({ state }: { state: PracticeState }): React.JSX.Element {
  const groups: [string, string, PracticeProblem[]][] = [
    ['warmup', 'Riscaldamento', state.problems.filter((p) => p.phase === 'warmup')],
    ['body', 'Corpo · argomenti mescolati', state.problems.filter((p) => p.phase === 'body')],
    ['retest', 'Ritest finale', state.problems.filter((p) => p.phase === 'retest')]
  ]
  const queued = state.problems.filter((p) => p.retest && p.phase !== 'retest')
  return (
    <aside className="side" aria-label="Andamento della sessione">
      <div className="lab">La sessione</div>
      <div className="arc">
        {groups.map(([phase, title, list]) => (
          <div key={phase}>
            <h3 className={state.phase === phase ? 'on' : ''}>{title}</h3>
            <ul>
              {list.map((p) => (
                <li key={p.id}>
                  <span>{snippet(p.statement)}</span>
                  {p.status === 'active' ? (
                    <span className="chip">in corso</span>
                  ) : (
                    p.outcome && (
                      <span className={'chip ' + OUTCOME_CHIP[p.outcome][1]}>
                        {OUTCOME_CHIP[p.outcome][0]}
                      </span>
                    )
                  )}
                </li>
              ))}
              {phase === 'retest' &&
                queued.map((p) => (
                  <li key={'q' + p.id}>
                    <span>{snippet(p.statement)}</span>
                    <span className="chip mid">in coda</span>
                  </li>
                ))}
              {list.length === 0 && (phase !== 'retest' || queued.length === 0) && (
                <li className="empty">
                  {phase === 'retest' ? 'Tutto ciò che sbagli torna qui, in forma nuova.' : '—'}
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  )
}

export function PracticeView({
  id,
  onBack,
  onStarted
}: {
  id: string
  onBack: () => void
  onStarted: (id: string) => void
}): React.JSX.Element {
  const api = window.sinapsi.practice
  const [s, setS] = useState<PracticeState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const askField = useRef<HTMLInputElement>(null)
  const askMic = useDictation({ target: askField, value: question, onChange: setQuestion })
  const asking = askMic.state !== 'idle'
  const end = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const dockwrap = useRef<HTMLDivElement>(null)
  const measureDock = useDockHeight(scroller, dockwrap, s !== null)

  useEffect(() => {
    let live = true
    void api.get(id).then((x) => live && setS(x))
    const off = api.onUpdate((x) => x.id === id && setS(x))
    return () => {
      live = false
      off()
    }
  }, [api, id])
  useEffect(() => {
    // The end must clear the dock as it is now, not after the next resize callback.
    measureDock()
    end.current?.scrollIntoView({ block: 'end' })
  }, [s?.items.length, s?.awaiting, measureDock])

  if (!s) return <div className="pr" />
  if (s.mode === 'exam') return <ExamView state={s} onBack={onBack} onStarted={onStarted} />

  const send = async (sub: Submission): Promise<void> => {
    setError(null)
    try {
      await api.submit(id, sub)
    } catch (e) {
      setError(clean(e))
      throw e
    }
  }
  const active = s.problems.find((p) => p.id === s.active)
  const learner = s.awaiting === 'learner' && s.phase !== 'done'
  // The problem each tutor turn belongs to: the last one posed before it.
  const problemAt = s.items.reduce<(string | undefined)[]>((acc, it, i) => {
    acc.push(it.kind === 'tutor' && it.turn.problem ? it.turn.problem.id : acc[i - 1])
    return acc
  }, [])

  return (
    <ViewScene className="pr">
      <GlassSurface render={<header />} radius={0} className="pr-top drag glass-bar glass-text">
        <button type="button" className="pill nodrag back-btn" onClick={onBack}>
          ← Home
        </button>
        <h1>Pratica</h1>
        <span className="lab">{PHASE_IT[s.phase]}</span>
        <span className="lab pr-topic">{s.topic}</span>
        <span className="sp" />
        {s.phase !== 'done' && (
          <button
            type="button"
            className="pill nodrag"
            disabled={!learner}
            onClick={() => {
              if (
                window.confirm('Chiudere la sessione? Il tutor fa il punto di ciò che hai fatto.')
              )
                void send({ kind: 'end' }).catch(() => undefined)
            }}
          >
            Termina
          </button>
        )}
      </GlassSurface>
      <div className="pr-body">
        {/* The conversation is the scene's live content; the library's scroll edge where it passes under the bar and the dock. */}
        <ScrollEdges target={scroller} size={72} />
        <GlassContent layout="scroll" className="pr-scroll edge-fade" ref={scroller}>
          <div className="pr-col" aria-live="polite">
            {s.items.map((it, i) => {
              if (it.kind === 'learner') {
                if (it.submission.kind === 'start')
                  return (
                    <div key={i} className="you">
                      <div>
                        <span className="lab">Materiale</span>
                        {s.topic}
                      </div>
                    </div>
                  )
                return (
                  <div key={i} className="you">
                    <div>{it.text}</div>
                  </div>
                )
              }
              if (it.kind === 'error')
                return (
                  <div key={i} className="pr-err">
                    <p>{it.message}</p>
                    {i === s.items.length - 1 && s.awaiting === 'retry' && (
                      <button type="button" className="ghost" onClick={() => void api.retry(id)}>
                        Riprova
                      </button>
                    )}
                  </div>
                )
              const t = it.turn
              const concluded = t.conclude
                ? s.problems.find((p) => p.id === problemAt[i])
                : undefined
              return (
                <div key={i}>
                  {t.blocks.map((b, k) => (
                    <div key={k} className="msg">
                      <RichText md={b.md} />
                    </div>
                  ))}
                  {t.problem && (
                    <div className="card">
                      <div className="lab">Problema</div>
                      <div className="st">
                        <RichText md={t.problem.statement} />
                      </div>
                    </div>
                  )}
                  {t.hint && (
                    <div className="hintmsg">
                      <span className="rung">R{t.hint.rung}</span>
                      <RichText md={t.hint.md} />
                    </div>
                  )}
                  {t.conclude && (
                    <article className="card" aria-label="Problema concluso">
                      <div className="pr-cardhead">
                        <span className="lab">Concluso</span>
                        <span className={'chip ' + OUTCOME_CHIP[t.conclude.outcome][1]}>
                          {OUTCOME_IT[t.conclude.outcome]}
                        </span>
                      </div>
                      <p className="verdict">{t.conclude.verdict}</p>
                      {concluded?.modelSolution && (
                        <div className="sol">
                          <div className="lab">Soluzione di riferimento</div>
                          <RichText md={concluded.modelSolution} />
                        </div>
                      )}
                      {concluded && (
                        <div className="meta">{`Modo: ${MODE_IT[concluded.mode]} · aiuto massimo: ${concluded.maxRung === null ? 'nessuno' : `R${concluded.maxRung}`}`}</div>
                      )}
                    </article>
                  )}
                  {t.summary && (
                    <article className="card" aria-label="Fine della sessione">
                      <div className="lab">Fine della sessione</div>
                      <p>{t.summary.note}</p>
                      {t.summary.solved.length > 0 && (
                        <p className="verdict">Venuto bene: {t.summary.solved.join(' · ')}</p>
                      )}
                      {t.summary.retest.length > 0 && (
                        <p className="verdict">Da riprendere: {t.summary.retest.join(' · ')}</p>
                      )}
                    </article>
                  )}
                </div>
              )
            })}
            {s.awaiting === 'retry' && s.items.at(-1)?.kind !== 'error' && (
              <div className="pr-err">
                <p>La risposta del tutor si è interrotta (l’app è stata chiusa mentre pensava).</p>
                <button type="button" className="ghost" onClick={() => void api.retry(id)}>
                  Riprova
                </button>
              </div>
            )}
            {s.awaiting === 'tutor' && (
              <div className="msg pr-pending" role="status">
                <span className="typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>{' '}
                Il tutor ci pensa…
              </div>
            )}
            <div ref={end} className="pr-end" />
          </div>
        </GlassContent>
        {/* Floats over the bottom of the conversation, which reserves its height (--dock-h). */}
        <div className="dockwrap" ref={dockwrap}>
          <div className="dock">
            {error && (
              <p className="pr-alert" role="alert">
                {error}
              </p>
            )}
            {learner && active && (
              <ProblemDock key={active.id} problem={active} sessionId={id} onSend={send} />
            )}
            {learner && !active && (
              <GlassShell>
                <form
                  className="inner pr-ask"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (asking || !question.trim()) return
                    void send({ kind: 'ask', text: question.trim() }).then(
                      () => setQuestion(''),
                      () => undefined
                    )
                  }}
                >
                  <div className="mic-field mic-fill">
                    <input
                      ref={askField}
                      readOnly={asking}
                      aria-label="Domande su questo problema"
                      placeholder="Domande su questo problema? Chiedi pure…"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                    <MicButton dictation={askMic} />
                  </div>
                  <button
                    type="button"
                    className="pri"
                    onClick={() => void send({ kind: 'next' }).catch(() => undefined)}
                  >
                    Prossimo problema
                  </button>
                </form>
                <DictationError dictation={askMic} />
              </GlassShell>
            )}
            {s.phase === 'done' && (
              <div className="row">
                <span className="sp" />
                <button type="button" className="pri" onClick={onBack}>
                  Torna alla home
                </button>
              </div>
            )}
          </div>
        </div>
        <Arc state={s} />
      </div>
    </ViewScene>
  )
}
