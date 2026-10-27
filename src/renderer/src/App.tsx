import { useState } from 'react'
import Home from './home/Home'
import { NotaView } from './nota/NotaView'
import { NotePicker } from './nota/NotePicker'
import { SessionView } from './session/SessionView'

type View = { view: 'home' } | { view: 'session'; id: string } | { view: 'nota'; id: string } | { view: 'source'; path: string }

export default function App(): React.JSX.Element {
  const [v, setV] = useState<View>({ view: 'home' })
  const home = (): void => setV({ view: 'home' })
  const openNota = (id: string): void => setV({ view: 'nota', id })
  if (v.view === 'session') return <SessionView id={v.id} onBack={home} onOpenNota={openNota} />
  if (v.view === 'nota') return <NotaView key={v.id} id={v.id} onBack={home} />
  if (v.view === 'source') return <NotePicker path={v.path} onOpenNota={openNota} onBack={home} />
  return <Home onOpenSession={(id) => setV({ view: 'session', id })} onOpenNota={openNota} onOpenSource={(path) => setV({ view: 'source', path })} />
}
