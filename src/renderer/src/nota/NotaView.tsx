import { useEffect, useState } from 'react'
import type { StoredNote } from '../../../shared/api'
import type { Nota } from '../../../shared/nota-schema'
import { RichText } from '../session/RichText'
import { BlockView, NotaContext } from './BlockView'
import type { Layers, Mode } from './context'
import './nota.css'

const LAYERS: [keyof Layers, string][] = [
  ['sessione', 'Sessione'],
  ['quiz', 'Quiz'],
  ['fonti', 'Fonti']
]

function Elapsed({ since }: { since: number }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.round((now - since) / 1000))
  return <>{s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`}</>
}

export function NotaView({ id, onBack }: { id: string; onBack: () => void }): React.JSX.Element {
  const api = window.sinapsi.notes
  const [n, setN] = useState<StoredNote | null>(null)
  const [mode, setMode] = useState<Mode>('leggi')
  const [layers, setLayers] = useState<Layers>({ sessione: true, quiz: true, fonti: true })

  useEffect(() => {
    let alive = true
    const load = (): void => void api.get(id).then((x) => alive && setN(x))
    load()
    const off = api.onUpdate((m) => m.id === id && load())
    return () => {
      alive = false
      off()
    }
  }, [api, id])

  const bar = (
    <nav className="island" aria-label="Controlli della nota">
      <button type="button" className="back" onClick={onBack}>
        ← Home
      </button>
      {n?.status === 'ready' && (
        <>
          <span className="sep" aria-hidden="true" />
          <div className="nv-seg" role="group" aria-label="Modalità">
            <button type="button" aria-pressed={mode === 'leggi'} onClick={() => setMode('leggi')}>
              Leggi
            </button>
            <button type="button" aria-pressed={mode === 'prova'} onClick={() => setMode('prova')}>
              Prova da solo
            </button>
          </div>
          <span className="sep" aria-hidden="true" />
          <div className="layers" role="group" aria-label="Strati">
            {LAYERS.map(([k, label]) => (
              <button key={k} type="button" className={'l-' + k} aria-pressed={layers[k]} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>
                <i aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  )

  if (!n) return <div className="nota">{bar}</div>
  if (n.status !== 'ready' || !n.nota)
    return (
      <div className="nota">
        {bar}
        <div className="state">
          <h1>{n.sourceTitle}</h1>
          {n.status === 'generating' ? (
            <p role="status">
              <span className="pulse" aria-hidden="true" />
              Sto scrivendo la nota viva…
              <br />
              <small>
                Gemini sta leggendo la tua nota{n.sessionId ? ' e la sessione' : ''}: di solito servono pochi minuti (<Elapsed since={n.updatedAt} />
                ).
              </small>
            </p>
          ) : (
            <>
              <p role="alert">{n.error ?? 'Qualcosa è andato storto.'}</p>
              <button type="button" className="btn pri" onClick={() => void api.retry(id)}>
                Riprova
              </button>
            </>
          )}
        </div>
      </div>
    )

  return (
    <NotaContext.Provider value={{ layers }}>
      <div className="nota">
        {bar}
        <Page nota={n.nota} stored={n} mode={mode} />
      </div>
    </NotaContext.Provider>
  )
}

function Page({ nota, stored, mode }: { nota: Nota; stored: StoredNote; mode: Mode }): React.JSX.Element {
  const counts = nota.sections.flatMap((s) => s.blocks).reduce<Record<string, number>>((acc, b) => ((acc[b.type] = (acc[b.type] ?? 0) + 1), acc), {})
  const toc = nota.sections.map((s) => (
    <li key={s.id}>
      <a href={`#${s.id}`}>
        <b>{s.num.replace('§', '')}</b>
        {s.title}
      </a>
    </li>
  ))
  return (
    <main>
      <header className="hero">
        <div>
          {nota.eyebrow && <span className="eyebrow enter">{nota.eyebrow}</span>}
          <h1 className="enter">
            {nota.title} {nota.titleEm && <em>{nota.titleEm}</em>}
          </h1>
          {nota.aka.length > 0 && (
            <div className="aka" aria-label="Detto anche">
              {nota.aka.map((a, i) => (
                <span key={i}>{a}</span>
              ))}
            </div>
          )}
          {nota.lede && <RichText md={nota.lede} className="lede" />}
          <div className="origin">
            <span>Nota Obsidian · {stored.sourceTitle}</span>
            {stored.sessionId && <span>Con la sessione di studio</span>}
            <span>Scritta il {new Date(stored.updatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
        <aside className="bezel scheda enter" aria-label="Scheda della nota">
          <div className="core">
            <dl>
              <dt>Sezioni</dt>
              <dd>{nota.sections.length}</dd>
              <dt>Figure interattive</dt>
              <dd>{(counts.figure ?? 0) + nota.sections.flatMap((s) => s.blocks).filter((b) => b.type === 'proof' && b.figure).length}</dd>
              <dt>Quiz e flashcard</dt>
              <dd>{(counts.quiz ?? 0) + (counts.flashcard ?? 0)}</dd>
              <dt>Esercizi</dt>
              <dd>{(counts.exercise ?? 0) + (counts.tryit ?? 0)}</dd>
            </dl>
          </div>
        </aside>
      </header>

      <details className="prov">
        <summary>
          <span>
            <b>Come è nata questa nota.</b> Struttura e contenuto vengono dalla tua nota Obsidian; ecco cosa è stato aggiunto e segnalato.
          </span>
        </summary>
        <div className="grid3">
          <div>
            <h3>Dalla tua nota Obsidian</h3>
            <ul>{nota.provenance.fromNote.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div>
            <h3>Aggiunto dall'app</h3>
            <ul>{nota.provenance.added.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div>
            <h3>Segnalato, non cambiato</h3>
            <ul>{nota.provenance.flagged.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
        {(stored.dropped ?? 0) > 0 && (
          <p className="dropped">{stored.dropped === 1 ? '1 blocco scartato perché non valido' : `${stored.dropped} blocchi scartati perché non validi`}</p>
        )}
      </details>

      {nota.tldr.length > 0 && (
        <section className="tldr" aria-labelledby="nv-tldr">
          <h2 id="nv-tldr">In tre righe</h2>
          <ol>
            {nota.tldr.map((t, i) => (
              <li key={i}>
                <RichText md={t} className="inline" />
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="page">
        <nav className="toc" aria-label="Indice">
          <h2>Indice</h2>
          <ol>
            {toc}
            <li>
              <a href="#nv-fine">
                <b>✓</b>Cosa ricordare
              </a>
            </li>
          </ol>
        </nav>
        <div className="content">
          <details className="mtoc">
            <summary>Indice della nota</summary>
            <ol>{toc}</ol>
          </details>
          {nota.sections.map((s) => (
            <section key={s.id} className="sec" id={s.id} aria-labelledby={`${s.id}-h`}>
              <header>
                {s.num && <span className="num">{s.num}</span>}
                <h2 id={`${s.id}-h`}>
                  {s.title} {s.titleEm && <em>{s.titleEm}</em>}
                </h2>
              </header>
              <div className="blocks">
                {s.blocks.map((b, i) => (
                  <BlockView key={i} block={b} mode={mode} />
                ))}
              </div>
            </section>
          ))}
          <section className="sec" id="nv-fine" aria-labelledby="nv-fine-h">
            <header>
              <span className="num">✓</span>
              <h2 id="nv-fine-h">
                Cosa <em>ricordare</em>
              </h2>
            </header>
            <div className="after">
              {nota.recap.ideas.length > 0 && (
                <div className="bezel">
                  <div className="core">
                    <h3>Le idee</h3>
                    <ul className="keep">
                      {nota.recap.ideas.map((x, i) => (
                        <li key={i}>
                          <b>{String(i + 1).padStart(2, '0')}</b>
                          <RichText md={x} className="inline" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {nota.recap.formulas.length > 0 && (
                <div className="bezel">
                  <div className="core">
                    <h3>Formulario</h3>
                    <div className="formulario">
                      {nota.recap.formulas.map((f, i) => (
                        <div key={i}>
                          <span>{f.label}</span>
                          <RichText md={`$${f.tex}$`} className="inline" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
