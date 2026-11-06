import { useEffect, useRef, useState } from 'react'
import { DICTATION_SHORT, useDictation } from '../components/dictation'
import { DictationError, MicButton } from '../components/MicButton'
import {
  GlassContent,
  GlassMenu,
  GlassMenuContent,
  GlassMenuGroup,
  GlassMenuGroupLabel,
  GlassMenuItem,
  GlassMenuTrigger
} from '@glass-sdk/liquid-glass'
import { ViewScene } from '../components/glass'
import type { Notebook } from '../../../shared/notebook-types'
import type { TreeNode } from './build-tree'
import { IconPanel, IconUpload } from './icons'
import { NoteTree } from './NoteTree'
import { Splitter } from './Splitter'

const clean = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    ''
  )

type Props = {
  onClose: () => void
  onOpen: (id: string) => void
  tree?: TreeNode[]
  onOpenNote?: (path: string) => void
  vaultPath?: string
  onChooseVault?: () => void
  notebooksHeight?: number
  onNotebooksHeight?: (v: number) => void
}

/** Right panel: Importa fonti, the notebooks (NotebookLM-like), the Obsidian notes by folder, the vault folder. */
export function NotebookPanel({
  onClose,
  onOpen,
  tree = [],
  onOpenNote,
  vaultPath,
  onChooseVault,
  notebooksHeight,
  onNotebooksHeight
}: Props): React.JSX.Element {
  const api = window.sinapsi
  const [list, setList] = useState<Notebook[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const nameField = useRef<HTMLInputElement>(null)
  const nameMic = useDictation({
    target: nameField,
    value: name,
    onChange: setName,
    maxSeconds: DICTATION_SHORT
  })
  const naming = nameMic.state !== 'idle'
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!api.notebook) return
    const load = (): void => void api.notebook.list().then(setList, () => undefined)
    load()
    return api.notebook.onUpdate(load)
  }, [api])

  const importInto = async (id: string | null): Promise<void> => {
    setMenu(false)
    setError(null)
    try {
      const nb = id ?? (await api.notebook.create('Notebook'))
      const r = await api.notebook.chooseFiles(nb)
      if (r.rejected.length) setError(`Non posso importare: ${r.rejected.join(', ')}`)
      // Cancelled with a notebook created just for this import: leave no empty "Notebook" behind.
      if (!r.added.length && !id) await api.notebook.remove(nb)
      else if (r.added.length) onOpen(nb)
    } catch (e) {
      setError(clean(e))
    }
  }

  return (
    <aside className="right" aria-label="Notebook e note di Obsidian">
      {/* The panel is a scene for the import menu: its sections are the live content the menu's glass refracts. */}
      <ViewScene className="aside-scene">
        <div className="ph drag">
          <button
            type="button"
            className="icon-btn nodrag"
            aria-label="Chiudi il pannello Notebook"
            onClick={onClose}
          >
            <IconPanel />
          </button>
          {/* The library's menu: positioning, focus, keyboard and outside clicks are Base UI's; the popup is glass. */}
          <div className="imp-wrap nodrag">
            <GlassMenu open={menu} onOpenChange={setMenu}>
              <GlassMenuTrigger render={<button type="button" className="btn-imp on" />}>
                <IconUpload />
                Importa fonti
              </GlassMenuTrigger>
              <GlassMenuContent
                className="imp-menu glass-text"
                aria-label="In quale notebook?"
                side="bottom"
                align="end"
                sideOffset={6}
                radius={18}
              >
                <GlassMenuGroup>
                  <GlassMenuGroupLabel className="lab">In quale notebook?</GlassMenuGroupLabel>
                  {list.map((n) => (
                    <GlassMenuItem key={n.id} onClick={() => void importInto(n.id)}>
                      {n.name}
                    </GlassMenuItem>
                  ))}
                  <GlassMenuItem className="new" onClick={() => void importInto(null)}>
                    Nuovo notebook…
                  </GlassMenuItem>
                </GlassMenuGroup>
              </GlassMenuContent>
            </GlassMenu>
          </div>
        </div>
        <GlassContent layout="flow" className="aside-body">
          {error && (
            <p className="panel-alert" role="alert">
              {error}
            </p>
          )}
          <section
            className="nb-sec"
            aria-label="Notebook"
            style={notebooksHeight ? { maxHeight: notebooksHeight } : undefined}
          >
            <div className="sec-head">
              <h2>Notebook</h2>
              <button
                type="button"
                className="mini"
                aria-expanded={creating}
                aria-label="Nuovo notebook"
                onClick={() => setCreating((c) => !c)}
              >
                + Nuovo
              </button>
            </div>
            {creating && (
              <>
                <form
                  className="nb-new"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const n = name.trim()
                    if (!n || naming) return
                    void api.notebook.create(n).then(
                      (id) => {
                        setName('')
                        setCreating(false)
                        onOpen(id)
                      },
                      (er) => setError(clean(er))
                    )
                  }}
                >
                  <div className="mic-field mic-fill">
                    <input
                      ref={nameField}
                      readOnly={naming}
                      autoFocus
                      aria-label="Nome del notebook"
                      placeholder="Per esempio: Analisi 1"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <MicButton dictation={nameMic} size="sm" />
                  </div>
                  <button type="submit" className="btn pri" disabled={naming}>
                    Crea
                  </button>
                </form>
                <DictationError dictation={nameMic} />
              </>
            )}
            {list.length === 0 ? (
              <p className="empty">
                Nessun notebook ancora: le tue fonti (PDF, slide, registrazioni, video) e una chat che
                risponde solo da quelle.
              </p>
            ) : (
              <ul className="sessions scroll">
                {list.map((n) => {
                  const working = n.sources.some(
                    (s) => s.status === 'queued' || s.status === 'processing'
                  )
                  return (
                    <li key={n.id}>
                      <button type="button" onClick={() => onOpen(n.id)}>
                        <span className={'dot' + (working ? '' : ' nv-ready')} />
                        <span className="t">{n.name}</span>
                        <span className="s">
                          {n.sources.length === 1 ? '1 fonte' : `${n.sources.length} fonti`}
                          {n.subject ? ` · ${n.subject}` : ''}
                          {working ? ' · in lavorazione' : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          {onNotebooksHeight ? (
            <Splitter
              orientation="horizontal"
              label="Altezza dei notebook"
              value={notebooksHeight ?? 280}
              min={120}
              max={900}
              onChange={onNotebooksHeight}
              className="sec-split"
            />
          ) : (
            <div className="divider" />
          )}
          <section className="psec scroll obs-sec" aria-label="Note di Obsidian">
            <h2>Note di Obsidian</h2>
            {tree.length ? (
              <NoteTree nodes={tree} onOpen={(path) => onOpenNote?.(path)} />
            ) : (
              <p className="empty">Nessuna nota letta dal vault.</p>
            )}
          </section>
          <div className="pf">
            <div className="row">
              <span className="vp" title={vaultPath}>
                {vaultPath ? `Vault: ${vaultPath.split('/').pop()}` : 'Vault non scelto'}
              </span>
              <button type="button" className="mini" onClick={onChooseVault}>
                Cambia cartella del vault
              </button>
            </div>
          </div>
        </GlassContent>
      </ViewScene>
    </aside>
  )
}
