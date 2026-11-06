import { useState } from 'react'
import type { LeafBlock } from '../../../../shared/nota-schema'
import { Inline } from '../Md'
import { asMath, plainText } from '../math'

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
                <Inline md={asMath(r.symbol)} />
              </td>
              <td>
                <Inline md={r.read} />
              </td>
              <td>
                {covered && !shown.has(i) ? (
                  <button type="button" className="nv-hide" aria-label={`Mostra il significato di ${plainText(r.symbol)}`} onClick={() => setShown(new Set(shown).add(i))}>
                    Mostra
                  </button>
                ) : (
                  <Inline md={r.meaning} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
