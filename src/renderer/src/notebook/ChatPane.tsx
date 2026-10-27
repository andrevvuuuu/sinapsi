import { useEffect, useRef, useState } from 'react'
import type { ChatTurn, Excerpt } from '../../../shared/notebook-types'
import { RichText } from '../session/RichText'

const STARTERS = ['Riassumi le fonti selezionate', 'Quali sono i concetti chiave?', 'Che domande d’esame potrebbero uscire?']

type Props = {
  turns: ChatTurn[]
  pending: boolean
  selected: number
  ready: number
  onAsk: (q: string) => void
  onRetry: (index: number) => void
  onCite: (e: Excerpt) => void
}

export function ChatPane({ turns, pending, selected, ready, onAsk, onRetry, onCite }: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const end = useRef<HTMLDivElement>(null)
  // Braces: scrollIntoView may return a promise, and an effect must not return anything but a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, pending])
  const canAsk = !pending && selected > 0 && q.trim().length > 0
  const send = (): void => {
    if (!canAsk) return
    onAsk(q.trim())
    setQ('')
  }

  return (
    <section className="nb-chat" aria-label="Chat sulle fonti">
      <div className="nb-turns">
        {turns.length === 0 && !pending && (
          <div className="nb-hello">
            <h2>Chiedi alle tue fonti</h2>
            <p>Rispondo solo con quello che c’è scritto nelle fonti selezionate, e ti dico dove. Se le fonti non lo dicono, te lo dico.</p>
            <div className="nb-starters">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <div key={i} className="nb-q">
              {t.text}
            </div>
          ) : t.role === 'error' ? (
            <div key={i} className="nb-err">
              <p>Non sono riuscito a rispondere: {t.text}</p>
              <button type="button" onClick={() => onRetry(i)} disabled={pending}>
                Riprova
              </button>
            </div>
          ) : (
            <article key={i} className="nb-a">
              {t.claims.map((c, k) => (
                <div key={k} className="nb-claim">
                  <RichText md={c.text} />
                  <span className="nb-cites">
                    {c.sources.map((n) => {
                      const e = t.excerpts.find((x) => x.n === n)
                      return e ? (
                        <button key={n} type="button" className="nb-cite" aria-label={`Fonte ${n}: ${e.title}, ${e.label}`} title={`${e.title}, ${e.label}`} onClick={() => onCite(e)}>
                          {n}
                        </button>
                      ) : null
                    })}
                  </span>
                </div>
              ))}
              {t.missing && (
                <div className="nb-missing">
                  <span className="lab">Le fonti non dicono</span>
                  <p>{t.missing}</p>
                </div>
              )}
              {t.dropped > 0 && <p className="nb-dropped">{t.dropped === 1 ? 'Ho tolto 1 frase che non citava le fonti.' : `Ho tolto ${t.dropped} frasi che non citavano le fonti.`}</p>}
            </article>
          )
        )}
        {pending && (
          <div className="nb-pending" role="status">
            Cerco nelle tue fonti…
          </div>
        )}
        <div ref={end} />
      </div>
      <form
        className="nb-ask"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <div className="inrow">
          <textarea
            aria-label="Chiedi alle tue fonti"
            placeholder="Chiedi alle tue fonti…"
            rows={1}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button type="submit" className="nb-send" disabled={!canAsk}>
            Chiedi
          </button>
        </div>
        <p className="nb-foot">{ready === 0 ? 'Nessuna fonte pronta: aggiungine una a sinistra.' : selected === 0 ? 'Seleziona almeno una fonte.' : `Risponde solo dalle fonti selezionate (${selected} di ${ready} pronte)`}</p>
      </form>
    </section>
  )
}
