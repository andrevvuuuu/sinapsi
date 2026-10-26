import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '../../../shared/api'
import { AnswerCard } from './AnswerCard'
import { PlanMap } from './PlanMap'
import { QuestionDock } from './QuestionDock'
import { RichText } from './RichText'
import './session.css'

const PHASE: Record<SessionState['phase'], string> = { probe: 'Misura', plan: 'Piano', teach: 'Insegnamento', consolidate: 'Consolidamento', done: 'Conclusa' }

export function SessionView({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const api = window.sinapsi.session
  const [s, setS] = useState<SessionState | null>(null)
  const [free, setFree] = useState('')
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void api.get(id).then((x) => alive && setS(x))
    const off = api.onUpdate((x) => x.id === id && setS(x))
    return () => {
      alive = false
      off()
    }
  }, [api, id])

  useEffect(() => {
    const el = scroller.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [s?.items.length, s?.awaiting])

  if (!s) return <div className="sess" />
  const q = s.awaiting === 'learner' ? s.pendingQuestion : undefined
  const sendFree = (): void => {
    if (!free.trim()) return
    void api.say(id, free.trim())
    setFree('')
  }

  return (
    <div className="sess">
      <header className="top drag">
        <button type="button" className="pill nodrag" onClick={onBack}>
          ← Home
        </button>
        <h1>{s.topic}</h1>
        <span className="phase">{s.items.length <= 1 && !s.hasTeacherTurn ? 'Obiettivo' : PHASE[s.phase]}</span>
        <span className="sp" />
        {s.noteTitle && <span className="notechip">Dalla tua nota: {s.noteTitle}</span>}
      </header>
      <div className="body">
        <div className="scroll" ref={scroller}>
          <div className="col" aria-live="polite">
            {s.items.map((it, i) => {
              if (it.kind === 'teacher')
                return (
                  <div key={i} className="msg">
                    {it.turn.blocks.map((b, j) => (
                      <RichText key={j} md={b.md} />
                    ))}
                    {it.turn.summary && (
                      <div className="summary">
                        <h3>Hai imparato</h3>
                        <ul>{it.turn.summary.learned.map((x, k) => <li key={k}><RichText md={x} className="inline" /></li>)}</ul>
                        {it.turn.summary.shaky.length > 0 && (<><h3>Ancora incerto</h3><ul>{it.turn.summary.shaky.map((x, k) => <li key={k}><RichText md={x} className="inline" /></li>)}</ul></>)}
                        {it.turn.summary.misconceptions.length > 0 && (<><h3>Misconcezioni</h3><ul>{it.turn.summary.misconceptions.map((x, k) => <li key={k}><RichText md={x} className="inline" /></li>)}</ul></>)}
                      </div>
                    )}
                  </div>
                )
              if (it.kind === 'error')
                return (
                  <div key={i} className="card err" role="alert">
                    <p>{it.message}</p>
                    {i === s.items.length - 1 && (
                      <button type="button" className="pri" onClick={() => void api.retry(id)}>
                        Riprova
                      </button>
                    )}
                  </div>
                )
              if (it.question && it.answer) return <AnswerCard key={i} q={it.question} a={it.answer} />
              return (
                <div key={i} className="msg you">
                  <div>{i === 0 ? s.topic : it.text}</div>
                </div>
              )
            })}
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
          <div className="dockwrap">
            <div className="dock">
              {q && <QuestionDock key={q.id} question={q} onAnswer={(a) => void api.answer(id, a)} onSay={(t) => void api.say(id, t)} />}
              {!q && s.awaiting === 'learner' && s.phase !== 'done' && (
                <div className="shell">
                  <div className="inner composer">
                    <textarea aria-label="Fai una domanda al tutor" placeholder="Fai una domanda al tutor" value={free} rows={1} onChange={(e) => setFree(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFree() } }} />
                    <button type="button" className="pri" disabled={!free.trim()} onClick={sendFree}>
                      Invia
                    </button>
                  </div>
                </div>
              )}
              {s.phase === 'done' && (
                <div className="shell">
                  <div className="inner act">
                    <span>Sessione conclusa. La nota viva arriverà nella fase 3.</span>
                    <button type="button" className="pri" onClick={onBack}>
                      Torna alla home
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <aside className="side" aria-label="Il piano">
          <h2 className="lab">Il piano</h2>
          <PlanMap plan={s.plan} current={s.currentNodeId} done={s.doneNodeIds} />
        </aside>
      </div>
    </div>
  )
}
