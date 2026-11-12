import { useState } from 'react'
import type { VaultIndex } from '../../../shared/vault-types'
import type { Settings } from '../../../shared/settings-schema'
import type { EngineStatus as Status, LessonEntry } from '../../../shared/api'
import { NoteTree } from '../home/NoteTree'
import { buildTree } from '../home/build-tree'
import { EngineStatus } from '../home/EngineStatus'
import { LogoMark } from '../home/LogoMark'
import { IconMinus, IconPlus, IconReview, IconSettings, IconStudy } from './icons'
import { ThemeSwitch } from './ThemeSwitch'

export function Sidebar(p: {
  index: VaultIndex | null
  due: number
  lessons: LessonEntry[]
  status: Record<import('../../../shared/settings-schema').Engine, Status> | null
  theme: Settings['theme']
  onTheme: (v: Settings['theme']) => void
  onReview: () => void
  onPractice: () => void
  onOpenSource: (path: string) => void
  onLesson: (id: string) => void
  onLessons: () => void
  onSettings: () => void
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
  const shownNodes = showAllSubjects ? nodes : nodes.slice(0, 8)
  return (
    <aside className="sh-sidebar" aria-label="Navigazione laterale">
      <div className="sh-sidebar-top">
        <div className="sh-brand">
          <LogoMark />
          <strong>Sinapsi</strong>
          <span className="sh-brand-tag">STUDIO</span>
        </div>
        <nav className="sh-side-actions" aria-label="Azioni rapide">
          <button className="sh-side-action" type="button" onClick={p.onReview}>
            <IconReview />
            <span>Ripassa</span>
            <small>{p.due} dovuti</small>
          </button>
          <button className="sh-side-action" type="button" onClick={p.onPractice}>
            <IconStudy />
            <span>Esercitati</span>
          </button>
        </nav>
      </div>
      <div className="sh-sidebar-scroll">
        <section className="sh-side-section" aria-label="Materie">
          <div className="sh-side-heading">
            <span>Materie</span>
            <button
              type="button"
              className="sh-side-toggle"
              aria-expanded={subjectsOpen}
              aria-label={subjectsOpen ? 'Nascondi materie' : 'Mostra materie'}
              onClick={() => setSubjectsOpen((v) => !v)}
            >
              {subjectsOpen ? <IconMinus /> : <IconPlus />}
            </button>
          </div>
          {subjectsOpen && (
            <>
              <NoteTree nodes={shownNodes} onOpen={p.onOpenSource} />
              {nodes.length > 8 && (
                <button
                  className="sh-all-register"
                  type="button"
                  onClick={() => setShowAllSubjects((value) => !value)}
                >
                  {showAllSubjects ? 'Mostra meno' : `Mostra tutte (${nodes.length})`}
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
          <button className="sh-all-register" type="button" onClick={p.onLessons}>
            Tutto il registro
          </button>
        </section>
      </div>
      <div className="sh-sidebar-bottom">
        <EngineStatus status={p.status} />
        <button type="button" className="sh-settings" onClick={p.onSettings}>
          <IconSettings />
          <span>Impostazioni</span>
        </button>
        <ThemeSwitch theme={p.theme} onChange={p.onTheme} />
      </div>
    </aside>
  )
}
