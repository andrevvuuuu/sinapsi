import { useState } from 'react'
import { GlassMaterial } from './components/glass'
import Home from './home/Home'
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

type View =
  | { view: 'home' }
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

/** «Riduci trasparenza» lives outside the views, which replace each other (each view has its own glass scene). */
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
  const home = (): void => setV({ view: 'home' })
  const openNota = (id: string): void => setV({ view: 'nota', id })
  if (v.view === 'session') return <SessionView id={v.id} onBack={home} onOpenNota={openNota} />
  if (v.view === 'nota') return <NotaView key={v.id} id={v.id} onBack={home} />
  const openPractice = (id: string): void => setV({ view: 'practice', id })
  const launched = (result: LaunchDestination): void => {
    if ('view' in result) setV(result)
  }
  if (v.view === 'plan')
    return (
      <PlanView
        onBack={home}
        onOpenPracticeSetup={(conceptIds, exam) =>
          setV({ view: 'practice-setup', initial: { conceptIds, exam } })
        }
        onLaunched={launched}
      />
    )
  if (v.view === 'lessons')
    return (
      <LessonLogView
        onOpen={(id) => setV({ view: 'lesson', id })}
        onNew={() => setV({ view: 'lesson-new' })}
        onLaunched={launched}
        onOpenPlan={() => setV({ view: 'plan' })}
      />
    )
  if (v.view === 'lesson')
    return (
      <LessonDetail
        id={v.id}
        onBack={() => setV({ view: 'lessons' })}
        onEdit={() => setV({ view: 'lesson-edit', id: v.id })}
        onLaunched={launched}
      />
    )
  if (v.view === 'lesson-new')
    return (
      <LessonEditor
        onSaved={() => setV({ view: 'lessons' })}
        onBack={() => setV({ view: 'lessons' })}
      />
    )
  if (v.view === 'lesson-edit')
    return (
      <LessonEditor
        id={v.id}
        onSaved={() => setV({ view: 'lesson', id: v.id })}
        onBack={() => setV({ view: 'lesson', id: v.id })}
      />
    )
  if (v.view === 'practice-setup')
    return (
      <PracticeSetup
        initialText={v.text}
        initial={v.initial}
        onBack={home}
        onStarted={openPractice}
      />
    )
  if (v.view === 'practice')
    return <PracticeView key={v.id} id={v.id} onBack={home} onStarted={openPractice} />
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
      onOpenPractice={(text, initial) => setV({ view: 'practice-setup', text, initial })}
      onOpenPracticeSession={openPractice}
      onOpenReview={(query, conceptIds) =>
        setV({ view: 'review', query: query || undefined, conceptIds })
      }
      onOpenLessons={() => setV({ view: 'lessons' })}
      onOpenPlan={() => setV({ view: 'plan' })}
      onLaunched={launched}
    />
  )
}
