import { useEffect, useState } from 'react'
import { GlassMaterial } from './components/glass'
import { NotaView } from './nota/NotaView'
import { NotePicker } from './nota/NotePicker'
import { PracticeSetup } from './practice/PracticeSetup'
import { PracticeView } from './practice/PracticeView'
import { ReviewView } from './review/ReviewView'
import { SessionView } from './session/SessionView'
import { LessonLogView } from './lessons/LessonLogView'
import { LessonDetail } from './lessons/LessonDetail'
import { LessonEditor } from './lessons/LessonEditor'
import { PlanView } from './plan/PlanView'
import type { LaunchDestination } from '../../shared/lesson-types'
import type { VaultResult } from '../../shared/api'
import { AppShell } from './shell/AppShell'
import { TodayView } from './shell/TodayView'
import type { Destination } from './shell/LiquidDock'

type View =
  | { view: 'home' }
  | { view: 'map' }
  | { view: 'session'; id: string }
  | { view: 'nota'; id: string }
  | { view: 'source'; path: string }
  | { view: 'review'; query?: string; conceptIds?: string[] }
  | { view: 'practice-setup'; text?: string; initial?: { conceptIds: string[]; exam?: boolean } }
  | { view: 'practice'; id: string }
  | { view: 'lessons' }
  | { view: 'lesson'; id: string }
  | { view: 'lesson-new' }
  | { view: 'lesson-edit'; id: string }
  | { view: 'plan' }

/** «Riduci trasparenza» lives outside the views. */
export default function App(): React.JSX.Element {
  return (
    <>
      <GlassMaterial />
      <Views />
    </>
  )
}

function Views(): React.JSX.Element {
  const [v, setV] = useState<View>({ view: 'home' })
  const [index, setIndex] = useState<VaultResult | null>(null)
  const [focusStudy, setFocusStudy] = useState(false)
  useEffect(() => {
    void window.sinapsi.vault
      .index()
      .then(setIndex)
      .catch(() => undefined)
    return window.sinapsi.vault.onChange(setIndex)
  }, [])
  const home = (): void => setV({ view: 'home' })
  const openNota = (id: string): void => setV({ view: 'nota', id })
  const openPractice = (id: string): void => setV({ view: 'practice', id })
  const launched = (result: LaunchDestination): void => {
    if ('view' in result) setV(result)
  }
  const study = (topic: string): void =>
    void window.sinapsi.session
      .start(topic)
      .then((id) => setV({ view: 'session', id }))
      .catch(() => setV({ view: 'home' }))
  const onDock = (destination: Destination): void => {
    if (destination === 'Oggi') {
      setFocusStudy(false)
      home()
    } else if (destination === 'Studia') {
      setFocusStudy(true)
      home()
    } else if (destination === 'Ripassa') setV({ view: 'review' })
    else if (destination === 'Mappa') setV({ view: 'map' })
    else setV({ view: 'plan' })
  }
  if (v.view === 'session') return <SessionView id={v.id} onBack={home} onOpenNota={openNota} />
  if (v.view === 'nota') return <NotaView key={v.id} id={v.id} onBack={home} />
  if (v.view === 'practice')
    return <PracticeView key={v.id} id={v.id} onBack={home} onStarted={openPractice} />
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
  const shellView = v.view
  let content: React.ReactNode = null
  if (v.view === 'home')
    content = (
      <TodayView
        focusStudy={focusStudy}
        onFocusDone={() => setFocusStudy(false)}
        onStudy={study}
        onPractice={(text, initial) => setV({ view: 'practice-setup', text, initial })}
        onReview={(query, conceptIds) => setV({ view: 'review', query, conceptIds })}
        onLessons={() => setV({ view: 'lessons' })}
        onPlan={() => setV({ view: 'plan' })}
        onLaunched={launched}
        onSession={(id) => setV({ view: 'session', id })}
        onPracticeSession={openPractice}
      />
    )
  if (v.view === 'plan')
    content = (
      <PlanView
        onBack={home}
        onOpenPracticeSetup={(conceptIds, exam) =>
          setV({ view: 'practice-setup', initial: { conceptIds, exam } })
        }
        onLaunched={launched}
      />
    )
  if (v.view === 'lessons')
    content = (
      <LessonLogView
        onOpen={(id) => setV({ view: 'lesson', id })}
        onNew={() => setV({ view: 'lesson-new' })}
        onLaunched={launched}
        onOpenPlan={() => setV({ view: 'plan' })}
      />
    )
  if (v.view === 'lesson')
    content = (
      <LessonDetail
        id={v.id}
        onBack={() => setV({ view: 'lessons' })}
        onEdit={() => setV({ view: 'lesson-edit', id: v.id })}
        onLaunched={launched}
      />
    )
  if (v.view === 'lesson-new')
    content = (
      <LessonEditor
        onSaved={() => setV({ view: 'lessons' })}
        onBack={() => setV({ view: 'lessons' })}
      />
    )
  if (v.view === 'lesson-edit')
    content = (
      <LessonEditor
        id={v.id}
        onSaved={() => setV({ view: 'lesson', id: v.id })}
        onBack={() => setV({ view: 'lesson', id: v.id })}
      />
    )
  if (v.view === 'practice-setup')
    content = (
      <PracticeSetup
        initialText={v.text}
        initial={v.initial}
        onBack={home}
        onStarted={openPractice}
      />
    )
  if (v.view === 'source')
    content = <NotePicker path={v.path} onOpenNota={openNota} onBack={home} />
  const livePaths = [] as string[]
  return (
    <AppShell
      view={shellView === 'map' ? 'map' : shellView}
      index={index}
      livePaths={livePaths}
      onNavigate={onDock}
      onReview={() => setV({ view: 'review' })}
      onPractice={() => setV({ view: 'practice-setup' })}
      onOpenSource={(path) => setV({ view: 'source', path })}
      onLesson={(id) => setV({ view: 'lesson', id })}
      onLessons={() => setV({ view: 'lessons' })}
      onSettingsChanged={() => undefined}
      onStudy={study}
      onMapReview={(ids) => setV({ view: 'review', conceptIds: ids })}
    >
      {content}
    </AppShell>
  )
}
