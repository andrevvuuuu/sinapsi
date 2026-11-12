import { useState, type DragEvent } from 'react'
import type { VaultIndex } from '../../../shared/vault-types'
import type { EngineStatus as Status, LessonEntry } from '../../../shared/api'
import { NoteTree } from '../home/NoteTree'
import { buildTree } from '../home/build-tree'
import { EngineStatus } from '../home/EngineStatus'
import { LogoMark } from '../home/LogoMark'
import {
  IconArrange,
  IconChevronDown,
  IconChevronUp,
  IconGrip,
  IconMinus,
  IconPlus,
  IconReview,
  IconSettings,
  IconStudy,
  IconSwap
} from './icons'
import {
  arrangeSubjects,
  moveSubject,
  placeSubject,
  toggleUniversity,
  type Subject,
  type SubjectPrefs
} from '../../../shared/subjects'

const PERSONAL_SHOWN = 8

export function Sidebar(p: {
  index: VaultIndex | null
  due: number
  lessons: LessonEntry[]
  status: Record<import('../../../shared/settings-schema').Engine, Status> | null
  current: 'review' | 'practice' | 'lessons' | null
  onHome: () => void
  onReview: () => void
  onPractice: () => void
  onOpenSource: (path: string) => void
  onLesson: (id: string) => void
  onLessons: () => void
  onSettings: () => void
  /** Saved order and university flags of the subjects. */
  subjectPrefs: SubjectPrefs
  /** University subjects to assume until Andrea chooses. */
  universityGuess: string[]
  onSubjectPrefs: (prefs: SubjectPrefs) => void
}): React.JSX.Element {
  const [subjectsOpen, setSubjectsOpen] = useState(true),
    [showAllSubjects, setShowAllSubjects] = useState(false)
  const countNotes = (node: ReturnType<typeof buildTree>[number]): number =>
    node.children ? node.children.reduce((total, child) => total + countNotes(child), 0) : 1
  const isSystemFolder = (name: string): boolean =>
    name.startsWith('.') || name.startsWith('_') || /^\d{2}\s/.test(name)
  const visibleNodes = (nodes: ReturnType<typeof buildTree>): ReturnType<typeof buildTree> =>
    nodes
      .filter((node) => !node.children || !isSystemFolder(node.name))
      .map((node) => (node.children ? { ...node, children: visibleNodes(node.children) } : node))
  const nodes = p.index
    ? visibleNodes(buildTree(p.index.notes))
        .filter((node) => node.children)
        .sort((a, b) => countNotes(b) - countNotes(a) || a.name.localeCompare(b.name, 'it'))
    : []
  const [arranging, setArranging] = useState(false)
  const [dragged, setDragged] = useState<string | null>(null)
  const byName = new Map(nodes.map((n) => [n.name, n]))
  const groups = arrangeSubjects(
    nodes.map((n) => n.name),
    p.subjectPrefs,
    p.universityGuess
  )
  const save = (next: SubjectPrefs): void => p.onSubjectPrefs(next)
  const drop = (e: DragEvent, toUniversity: boolean, before: string | null): void => {
    e.preventDefault()
    e.stopPropagation()
    const name = dragged ?? e.dataTransfer.getData('text/plain')
    setDragged(null)
    if (name && name !== before) save(placeSubject(groups, name, toUniversity, before))
  }
  const treeOf = (list: Subject[]): ReturnType<typeof buildTree> =>
    list.flatMap((s) => (byName.has(s.name) ? [byName.get(s.name)!] : []))
  const personalShown = showAllSubjects ? groups.personal : groups.personal.slice(0, PERSONAL_SHOWN)

  /** One group while arranging: rows to drag, nudge with the arrows, or send to the other group. */
  const arrangeList = (list: Subject[], university: boolean): React.JSX.Element => (
    <ol
      className="sh-arrange"
      aria-label={university ? 'Ordina le materie universitarie' : 'Ordina le materie personali'}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => drop(e, university, null)}
    >
      {list.length === 0 && <li className="sh-arrange-empty">Trascina qui una materia</li>}
      {list.map((s, i) => (
        <li
          key={s.name}
          className={`sh-arrange-row ${dragged === s.name ? 'is-dragging' : ''}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', s.name)
            setDragged(s.name)
          }}
          onDragEnd={() => setDragged(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => drop(e, university, s.name)}
        >
          <span className="sh-arrange-grip" aria-hidden="true">
            <IconGrip />
          </span>
          <span className="sh-arrange-name">{s.name}</span>
          <button
            type="button"
            className="sh-arrange-btn"
            aria-label={`Sposta ${s.name} più in alto`}
            disabled={i === 0}
            onClick={() => save(moveSubject(groups, p.subjectPrefs, s.name, -1))}
          >
            <IconChevronUp />
          </button>
          <button
            type="button"
            className="sh-arrange-btn"
            aria-label={`Sposta ${s.name} più in basso`}
            disabled={i === list.length - 1}
            onClick={() => save(moveSubject(groups, p.subjectPrefs, s.name, 1))}
          >
            <IconChevronDown />
          </button>
          <button
            type="button"
            className="sh-arrange-btn"
            aria-label={
              university ? `Sposta ${s.name} tra le personali` : `Sposta ${s.name} tra le universitarie`
            }
            title={university ? 'Sposta tra le personali' : 'Sposta tra le universitarie'}
            onClick={() => save(toggleUniversity(groups, s.name))}
          >
            <IconSwap />
          </button>
        </li>
      ))}
    </ol>
  )

  return (
    <aside className="sh-sidebar" aria-label="Navigazione laterale">
      <div className="sh-sidebar-top">
        <button
          type="button"
          className="sh-brand"
          onClick={p.onHome}
          aria-label="Sinapsi: torna a Oggi"
        >
          <LogoMark />
          <strong>Sinapsi</strong>
          <span className="sh-brand-tag">STUDIO</span>
        </button>
        <nav className="sh-side-actions" aria-label="Azioni rapide">
          <button
            className={`sh-side-action ${p.current === 'review' ? 'is-current' : ''}`}
            aria-current={p.current === 'review' ? 'page' : undefined}
            type="button"
            onClick={p.onReview}
          >
            <IconReview />
            <span>Ripassa</span>
            <small>{p.due} dovuti</small>
          </button>
          <button
            className={`sh-side-action ${p.current === 'practice' ? 'is-current' : ''}`}
            aria-current={p.current === 'practice' ? 'page' : undefined}
            type="button"
            onClick={p.onPractice}
          >
            <IconStudy />
            <span>Esercitati</span>
          </button>
        </nav>
      </div>
      <div className="sh-sidebar-scroll">
        <section className="sh-side-section sh-subjects" aria-label="Materie">
          <div className="sh-side-heading">
            <span>Materie universitarie</span>
            <span className="sh-side-tools">
              {subjectsOpen && (
                <button
                  type="button"
                  className={`sh-side-toggle ${arranging ? 'is-on' : ''}`}
                  aria-pressed={arranging}
                  aria-label={arranging ? 'Fine ordinamento materie' : 'Ordina le materie'}
                  title={arranging ? 'Fatto' : 'Ordina le materie'}
                  onClick={() => setArranging((v) => !v)}
                >
                  <IconArrange />
                </button>
              )}
              <button
                type="button"
                className="sh-side-toggle"
                aria-expanded={subjectsOpen}
                aria-label={subjectsOpen ? 'Nascondi materie' : 'Mostra materie'}
                onClick={() => setSubjectsOpen((v) => !v)}
              >
                {subjectsOpen ? <IconMinus /> : <IconPlus />}
              </button>
            </span>
          </div>
          {subjectsOpen &&
            (arranging ? (
              arrangeList(groups.university, true)
            ) : groups.university.length ? (
              <NoteTree nodes={treeOf(groups.university)} onOpen={p.onOpenSource} />
            ) : (
              <p className="sh-side-empty">Nessuna. Usa «Ordina» per sceglierle.</p>
            ))}
          {subjectsOpen && (
            <>
              <div className="sh-side-heading sh-side-subheading">
                <span>Materie personali</span>
              </div>
              {arranging ? (
                arrangeList(groups.personal, false)
              ) : (
                <>
                  <NoteTree nodes={treeOf(personalShown)} onOpen={p.onOpenSource} />
                  {groups.personal.length > PERSONAL_SHOWN && (
                    <button
                      className="sh-all-register"
                      type="button"
                      onClick={() => setShowAllSubjects((value) => !value)}
                    >
                      {showAllSubjects ? 'Mostra meno' : `Mostra tutte (${groups.personal.length})`}
                    </button>
                  )}
                </>
              )}
              {arranging && (
                <button type="button" className="sh-arrange-done" onClick={() => setArranging(false)}>
                  Fatto
                </button>
              )}
            </>
          )}
        </section>
        <section className="sh-side-section sh-register" aria-label="Registro lezioni">
          <div className="sh-side-heading">
            <span>Registro</span>
          </div>
          {p.lessons.slice(0, 3).map((x) => (
            <button
              className="sh-register-row"
              key={x.id}
              type="button"
              onClick={() => p.onLesson(x.id)}
            >
              <span>{x.topic}</span>
              <time>
                {new Date(x.updatedAt).toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: 'short'
                })}
              </time>
            </button>
          ))}
          <button
            className={`sh-all-register ${p.current === 'lessons' ? 'is-current' : ''}`}
            aria-current={p.current === 'lessons' ? 'page' : undefined}
            type="button"
            onClick={p.onLessons}
          >
            Tutto il registro
          </button>
        </section>
      </div>
      <div className="sh-sidebar-bottom">
        <EngineStatus status={p.status} />
        <button
          type="button"
          className="sh-settings"
          onClick={p.onSettings}
          aria-label="Impostazioni"
          title="Impostazioni"
        >
          <IconSettings />
        </button>
      </div>
    </aside>
  )
}
