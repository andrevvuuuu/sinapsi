import { useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { RichText } from '../../session/RichText'
import { asMath } from '../math'

const plain = (s: string): string => s.replace(/\$/g, '').replace(/\\text\{([^}]*)\}/g, '$1').trim()

export function Glossary({ block }: { block: Extract<LeafBlock, { type: 'glossary' }> }): React.JSX.Element {
  const [covered, setCovered] = useState(false)
  const [shown, setShown] = useState<Set<number>>(new Set())
  return (
    <div className="nv-glos">
      <div className="bar">
        <span className="nv-sub">Simboli · come si legge · cosa significa</span>
        <button
          type="button"
          className="nv-chip"
          aria-pressed={covered}
          onClick={() => {
            setCovered(!covered)
            setShown(new Set())
          }}
        >
          Copri i significati e prova a dirli
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Simbolo</th>
            <th scope="col">Come si legge</th>
            <th scope="col">Significato</th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <RichText md={asMath(r.symbol)} className="inline" />
              </td>
              <td>
                <RichText md={r.read} className="inline" />
              </td>
              <td>
                {covered && !shown.has(i) ? (
                  <button type="button" className="nv-hide" aria-label={`Mostra il significato di ${plain(r.symbol)}`} onClick={() => setShown(new Set(shown).add(i))}>
                    Mostra
                  </button>
                ) : (
                  <RichText md={r.meaning} className="inline" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
