import { useContext, useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { Inline, Md } from '../Md'
import { plainText } from '../math'
import { NotaContext } from '../context'

type B<T extends LeafBlock['type']> = Extract<LeafBlock, { type: T }>

export function Prose({ block }: { block: B<'prose'> }): React.JSX.Element {
  const { layers } = useContext(NotaContext)
  return (
    <div className="nv-prose">
      {layers.fonti && block.sources && block.sources.length > 0 && (
        <p className="nv-srcs">
          {block.sources.map((s, i) => (
            <span key={i} className={'nv-src' + (/obsidian/i.test(s) ? ' ob' : '')}>
              <Inline md={s} />
            </span>
          ))}
        </p>
      )}
      <Md md={block.md} />
    </div>
  )
}

export function Theorem({ block }: { block: B<'theorem'> }): React.JSX.Element {
  return (
    <div className="nv-thm" role="group" aria-label={block.label ? `Enunciato: ${plainText(block.label)}` : 'Enunciato'}>
      {block.label && (
        <div className="t">
          <Inline md={block.label} />
        </div>
      )}
      <Md md={block.md} />
    </div>
  )
}

export function Why({ block }: { block: B<'why'> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="nv-why">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
        <Inline md={block.title} />
      </button>
      {open && <Md md={block.md} className="body" />}
    </div>
  )
}

export function Flag({ block }: { block: B<'flag'> }): React.JSX.Element | null {
  const [state, setState] = useState<'idle' | 'copied' | 'failed' | 'hidden'>('idle')
  if (state === 'hidden') return null
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(block.correction ?? block.md)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <div className="nv-flag" role="note">
      <b>Segnalazione sulla tua nota</b>
      <Md md={block.md} />
      {block.correction && (
        <div className="nv-correction">
          <span>Correzione proposta</span>
          <Md md={block.correction} />
        </div>
      )}
      <div className="nv-row">
        <button type="button" className="nv-chip" onClick={() => void copy()}>
          Copia la correzione per Obsidian
        </button>
        <button type="button" className="nv-chip" onClick={() => setState('hidden')}>
          Ignora
        </button>
        <span role="status" className="nv-note">
          {state === 'copied' ? 'Copiata' : state === 'failed' ? 'Non sono riuscito a copiarla' : ''}
        </span>
      </div>
    </div>
  )
}

const SESSION_LABEL: Record<B<'session'>['kind'], string> = {
  previsione: 'La tua previsione in sessione',
  parole: 'Le tue parole in sessione',
  errore: 'Attenzione · errore in sessione'
}

export function SessionNote({ block }: { block: B<'session'> }): React.JSX.Element | null {
  const { layers } = useContext(NotaContext)
  if (!layers.sessione) return null
  return (
    <div className={'nv-ann ' + block.kind}>
      <span className="who">{SESSION_LABEL[block.kind]}</span>
      <Md md={block.md} />
    </div>
  )
}
