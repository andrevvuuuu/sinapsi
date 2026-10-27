import { useState } from 'react'
import Home from './home/Home'
import { NotaView } from './nota/NotaView'
import { NotePicker } from './nota/NotePicker'
import { ReviewView } from './review/ReviewView'
import { SessionView } from './session/SessionView'

type View =
  | { view: 'home' }
  | { view: 'session'; id: string }
  | { view: 'nota'; id: string }
  | { view: 'source'; path: string }
  | { view: 'review'; query?: string; conceptIds?: string[] }

export default function App(): React.JSX.Element {
  const [v, setV] = useState<View>({ view: 'home' })
  const home = (): void => setV({ view: 'home' })
  const openNota = (id: string): void => setV({ view: 'nota', id })
  if (v.view === 'session') return <SessionView id={v.id} onBack={home} onOpenNota={openNota} />
  if (v.view === 'nota') return <NotaView key={v.id} id={v.id} onBack={home} />
  const study = (topic: string): void =>
    void window.sinapsi.session
      .start(topic)
      .then((id) => setV({ view: 'session', id }))
      .catch(() => setV({ view: 'home' }))
  if (v.view === 'review')
    return (
      <ReviewView
        key={`${v.query}|${v.conceptIds?.join(',')}`}
        query={v.query}
        conceptIds={v.conceptIds}
        onBack={home}
        onStudy={study}
        onOpenNote={(path) => setV({ view: 'source', path })}
      />
    )
  if (v.view === 'source') return <NotePicker path={v.path} onOpenNota={openNota} onBack={home} />
  return (
    <Home
      onOpenSession={(id) => setV({ view: 'session', id })}
      onOpenNota={openNota}
      onOpenSource={(path) => setV({ view: 'source', path })}
      onOpenReview={(query, conceptIds) =>
        setV({ view: 'review', query: query || undefined, conceptIds })
      }
    />
  )
}
