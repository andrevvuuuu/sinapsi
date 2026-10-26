import { useState } from 'react'
import Home from './home/Home'
import { SessionView } from './session/SessionView'

type View = { view: 'home' } | { view: 'session'; id: string }

export default function App(): React.JSX.Element {
  const [v, setV] = useState<View>({ view: 'home' })
  if (v.view === 'session') return <SessionView id={v.id} onBack={() => setV({ view: 'home' })} />
  return <Home onOpenSession={(id) => setV({ view: 'session', id })} />
}
