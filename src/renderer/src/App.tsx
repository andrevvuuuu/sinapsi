import { useEffect, useState } from 'react'
import type { Settings } from '../../shared/settings-schema'
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
import { AppShell } from './shell/AppShell'
import { TodayView } from './shell/TodayView'
import { NotesView } from './shell/NotesView'
import type { Destination } from './shell/LiquidDock'
import { useNavStack } from './nav/useNavStack'
import { AppDataProvider, useAppData } from './shell/AppData'

type View =
  | { view: 'home' }
  | { view: 'map' }
  | { view: 'notes' }
  | { view: 'session'; id: string }
  | { view: 'nota'; id: string }
  | { view: 'source'; path: string }
  | {
      view: 'review'
      query?: string
      conceptIds?: string[]
      cascadeWeak?: string[]
      examAt?: number
      order?: 'due' | 'gain'
    }
  | { view: 'practice-setup'; text?: string; initial?: { conceptIds: string[]; exam?: boolean } }
  | { view: 'practice'; id: string }
  | { view: 'lessons' }
  | { view: 'lesson'; id: string }
  | { view: 'lesson-new' }
  | { view: 'lesson-edit'; id: string }
  | { view: 'plan'; addExam?: boolean }

/** «Riduci trasparenza» lives outside the views. */
export default function App(): React.JSX.Element {
  return (
    <AppDataProvider>
      <GlassMaterial />
      <Views />
    </AppDataProvider>
  )
}

function Views(): React.JSX.Element {
  const { current: v, push, pop, replace, backLabel: currentBackLabel } =
    useNavStack<View>({ view: 'home' })
  const { index, setSettings } = useAppData()
  const [focusStudy, setFocusStudy] = useState(false)

  // Global shortcut ⌘[ -> pop, ignored if focus is inside a non-empty text input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey && e.key === '[') {
        const active = document.activeElement
        const isInput =
          active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
        if (isInput && active.value.trim().length > 0) return
        e.preventDefault()
        pop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pop])

  const onSettingsChanged = (s: Settings): void => {
    setSettings(s)
  }

  const openNota = (id: string): void => push({ view: 'nota', id })
  const openPractice = (id: string): void => push({ view: 'practice', id })
  const launched = (result: LaunchDestination): void => {
    if ('view' in result) push(result)
  }
  const study = (topic: string): void =>
    void window.sinapsi?.session
      ?.start?.(topic)
      .then((id) => push({ view: 'session', id }))
      .catch(() => replace({ view: 'home' }))
  const askTutor = (conceptId: string, name: string): void =>
    void window.sinapsi?.session
      ?.start?.(name, { goalIds: [conceptId] })
      .then((id) => push({ view: 'session', id }))
      .catch(() => replace({ view: 'home' }))

  const onDock = (destination: Destination): void => {
    if (destination === 'Oggi') {
      setFocusStudy(false)
      replace({ view: 'home' })
    } else if (destination === 'Mappa') {
      replace({ view: 'map' })
    } else {
      replace({ view: 'plan' })
    }
  }

  if (v.view === 'session')
    return (
      <SessionView
        id={v.id}
        onBack={pop}
        onOpenNota={openNota}
        backLabel={currentBackLabel}
      />
    )
  if (v.view === 'nota')
    return <NotaView key={v.id} id={v.id} onBack={pop} backLabel={currentBackLabel} />
  if (v.view === 'practice')
    return (
      <PracticeView
        key={v.id}
        id={v.id}
        onBack={pop}
        onStarted={openPractice}
        backLabel={currentBackLabel}
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
        onPractice={(text, initial) => push({ view: 'practice-setup', text, initial })}
        onReview={(query, conceptIds) => push({ view: 'review', query, conceptIds })}
        onLessons={() => replace({ view: 'lessons' })}
        onPlan={(opts) => replace({ view: 'plan', addExam: opts?.addExam })}
        onLaunched={launched}
        onSession={(id) => push({ view: 'session', id })}
        onPracticeSession={openPractice}
      />
    )
  if (v.view === 'plan')
    content = (
      <PlanView
        addExam={v.addExam}
        onOpenPracticeSetup={(conceptIds, exam) =>
          push({ view: 'practice-setup', initial: { conceptIds, exam } })
        }
        onLaunched={launched}
        onReview={(query, conceptIds) => push({ view: 'review', query, conceptIds })}
      />
    )
  if (v.view === 'lessons')
    content = (
      <LessonLogView
        onOpen={(id) => push({ view: 'lesson', id })}
        onNew={() => push({ view: 'lesson-new' })}
        onLaunched={launched}
        onOpenPlan={() => push({ view: 'plan' })}
      />
    )
  if (v.view === 'lesson')
    content = (
      <LessonDetail
        id={v.id}
        onBack={pop}
        onEdit={() => push({ view: 'lesson-edit', id: v.id })}
        onLaunched={launched}
      />
    )
  if (v.view === 'lesson-new')
    content = (
      <LessonEditor
        onSaved={() => replace({ view: 'lessons' })}
        onBack={pop}
      />
    )
  if (v.view === 'lesson-edit')
    content = (
      <LessonEditor
        id={v.id}
        onSaved={pop}
        onBack={pop}
      />
    )
  if (v.view === 'practice-setup')
    content = (
      <PracticeSetup
        initialText={v.text}
        initial={v.initial}
        onBack={pop}
        onStarted={openPractice}
        backLabel={currentBackLabel}
      />
    )
  if (v.view === 'review')
    content = (
      <ReviewView
        key={`${v.query}|${v.conceptIds?.join(',')}|${v.cascadeWeak?.join(',')}|${v.order}|${v.examAt}`}
        query={v.query}
        conceptIds={v.conceptIds}
        cascadeWeak={v.cascadeWeak}
        examAt={v.examAt}
        order={v.order}
        onBack={pop}
        onStudy={study}
        onPractice={(conceptIds) =>
          push({ view: 'practice-setup', initial: { conceptIds } })
        }
        onOpenNote={(path) => push({ view: 'source', path })}
        backLabel={currentBackLabel}
      />
    )
  if (v.view === 'source')
    content = (
      <NotePicker
        path={v.path}
        onOpenNota={openNota}
        onBack={pop}
        backLabel={currentBackLabel}
      />
    )
  if (v.view === 'notes')
    content = <NotesView onOpenNota={openNota} />

  const livePaths = [] as string[]
  return (
    <AppShell
      view={shellView === 'map' ? 'map' : shellView}
      index={index}
      livePaths={livePaths}
      onNavigate={onDock}
      onHome={() => {
        setFocusStudy(false)
        replace({ view: 'home' })
      }}
      onReview={() => push({ view: 'review' })}
      onPractice={() => push({ view: 'practice-setup' })}
      onOpenSource={(path) => push({ view: 'source', path })}
      onLesson={(id) => push({ view: 'lesson', id })}
      onLessons={() => replace({ view: 'lessons' })}
      onNotes={() => replace({ view: 'notes' })}
      onSettingsChanged={onSettingsChanged}
      onStudy={study}
      onMapReview={(ids, opts) => {
        const o = opts as
          | { cascadeWeak?: string[]; examAt?: number; order?: 'due' | 'gain' }
          | undefined
        push({
          view: 'review',
          conceptIds: ids.length ? ids : undefined,
          cascadeWeak: o?.cascadeWeak,
          examAt: o?.examAt,
          order: o?.order
        })
      }}
      onMapAskTutor={askTutor}
    >
      {content}
    </AppShell>
  )
}
