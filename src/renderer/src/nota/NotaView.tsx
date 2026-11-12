import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GlassContent, GlassSurface } from '@glass-sdk/liquid-glass'
import type { GraphData, Memory, StoredNote } from '../../../shared/api'
import type { Nota } from '../../../shared/nota-schema'
import { Inline, Md } from './Md'
import { BlockView, NotaContext } from './BlockView'
import { FadeContext, SectionContext, type Layers, type Mode } from './context'
import { fadeOf, sectionConcepts, type Fade } from './fading'
import './nota.css'
import { ScrollEdges, Seg, ViewScene } from '../components/glass'

const LAYERS: [keyof Layers, string][] = [
  ['sessione', 'Sessione'],
  ['quiz', 'Quiz'],
  ['fonti', 'Fonti']
]

/** The message of an error thrown in main, without Electron's "Error invoking remote method" prefix. */
export const remoteMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

/**
 * The nota's scene: the floating island (a glass surface) over the page, which scrolls under it as the scene's live
 * content. The page keeps the island's room at its top (the scroll edge band, .nota-scroll).
 */
export function NotaFrame({ bar, children }: { bar: ReactNode; children?: ReactNode }): React.JSX.Element {
  const page = useRef<HTMLDivElement>(null)
  return (
    <ViewScene className="nota">
      {bar}
      <ScrollEdges target={page} edges={['top']} size={66} />
      <GlassContent layout="scroll" className="nota-scroll edge-fade" ref={page}>
        {children}
      </GlassContent>
    </ViewScene>
  )
}

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
  const [retrying, setRetrying] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const retry = async (): Promise<void> => {
    setRetrying(true)
    setRetryError(null)
    try {
      await api.retry(id)
    } catch (e) {
      setRetryError(remoteMessage(e))
    } finally {
      setRetrying(false)
    }
  }

  useEffect(() => {
    let alive = true
    const load = (): void =>
      void api.get(id).then(
        (x) => alive && (setN(x), setLoadError(false)),
        () => alive && setLoadError(true)
      )
    load()
    const off = api.onUpdate((m) => m.id === id && load())
    return () => {
      alive = false
      off()
    }
  }, [api, id])

  // What he remembers of the note's concepts: proofs fade from the end as they consolidate (fading.ts).
  const [known, setKnown] = useState<{ graph: GraphData; memory: Record<string, Memory> } | null>(null)
  useEffect(() => {
    let alive = true
    const { graph, review } = window.sinapsi
    if (!graph?.get || !review?.memory) return
    void Promise.all([graph.get(), review.memory()]).then(
      ([g, memory]) => alive && setKnown({ graph: g, memory }),
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [])

  const bar = (
    <GlassSurface render={<nav />} radius="capsule" className="island glass-text" aria-label="Controlli della nota">
      <button type="button" className="back back-btn" onClick={onBack}>
        ← Home
      </button>
      {n?.status === 'ready' && (
        <>
          <span className="sep" aria-hidden="true" />
          <Seg
            label="Modalità"
            track="plain"
            className="nv-seg"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'leggi', label: 'Leggi' },
              { value: 'prova', label: 'Prova da solo' }
            ]}
          />
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
    </GlassSurface>
  )

  if (!n && loadError)
    return (
      <NotaFrame bar={bar}>
        <div className="nv-gen" role="alert">
          <h1>Questa nota non si riesce ad aprire</h1>
          <p>Il file della nota viva è danneggiato. Puoi crearne una nuova dalla nota Obsidian: aprila dalla home e scegli «Crea la nota viva».</p>
        </div>
      </NotaFrame>
    )
  if (!n) return <NotaFrame bar={bar} />
  if (n.status !== 'ready' || !n.nota)
    return (
      <NotaFrame bar={bar}>
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
              <button type="button" className="btn pri" disabled={retrying} onClick={() => void retry()}>
                Riprova
              </button>
              {retryError && <p role="alert">{retryError}</p>}
            </>
          )}
        </div>
      </NotaFrame>
    )

  return (
    <NotaContext.Provider value={{ layers, noteId: id }}>
      <NotaFrame bar={bar}>
        <Page nota={n.nota} stored={n} mode={mode} fade={known ? (section) => fadeOf(sectionConcepts(known.graph, n.sourcePath, section), known.memory) : undefined} />
      </NotaFrame>
    </NotaContext.Provider>
  )
}

function Page({ nota, stored, mode, fade }: { nota: Nota; stored: StoredNote; mode: Mode; fade?: (section: { num: string; title: string }) => Fade }): React.JSX.Element {
  const counts = nota.sections.flatMap((s) => s.blocks).reduce<Record<string, number>>((acc, b) => ((acc[b.type] = (acc[b.type] ?? 0) + 1), acc), {})
  const toc = nota.sections.map((s) => (
    <li key={s.id}>
      <a href={`#${s.id}`}>
        <b>{s.num.replace('§', '')}</b>
        <Inline md={s.title} />
      </a>
    </li>
  ))
  return (
    <main>
      <header className="hero">
        <div>
          {nota.eyebrow && (
            <span className="eyebrow enter">
              <Inline md={nota.eyebrow} />
            </span>
          )}
          <h1 className="enter">
            <Inline md={nota.title} />{' '}
            {nota.titleEm && (
              <em>
                <Inline md={nota.titleEm} />
              </em>
            )}
          </h1>
          {nota.aka.length > 0 && (
            <div className="aka" aria-label="Detto anche">
              {nota.aka.map((a, i) => (
                <span key={i}>
                  <Inline md={a} />
                </span>
              ))}
            </div>
          )}
          {nota.lede && <Md md={nota.lede} className="lede" />}
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
            <ul>{nota.provenance.fromNote.map((x, i) => <li key={i}><Inline md={x} /></li>)}</ul>
          </div>
          <div>
            <h3>{"Aggiunto dall'app"}</h3>
            <ul>{nota.provenance.added.map((x, i) => <li key={i}><Inline md={x} /></li>)}</ul>
          </div>
          <div>
            <h3>Segnalato, non cambiato</h3>
            <ul>{nota.provenance.flagged.map((x, i) => <li key={i}><Inline md={x} /></li>)}</ul>
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
                <Inline md={t} />
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
                  <Inline md={s.title} />{' '}
                  {s.titleEm && (
                    <em>
                      <Inline md={s.titleEm} />
                    </em>
                  )}
                </h2>
              </header>
              <FadeContext.Provider value={fade ? fade(s) : null}>
                <SectionContext.Provider value={s.titleEm ? `${s.title} ${s.titleEm}` : s.title}>
                  <div className="blocks">
                    {s.blocks.map((b, i) => (
                      <BlockView key={i} block={b} mode={mode} />
                    ))}
                  </div>
                </SectionContext.Provider>
              </FadeContext.Provider>
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
                          <Inline md={x} />
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
                          <span>
                            <Inline md={f.label} />
                          </span>
                          <Inline md={f.tex.includes('$') ? f.tex : `$${f.tex}$`} />
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
