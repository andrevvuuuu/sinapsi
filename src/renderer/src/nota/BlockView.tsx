import type { Block } from '../../../shared/nota-schema'
import { asMath } from './math'
import { RichText } from '../session/RichText'
import { Glossary } from './blocks/Glossary'
import { Exercise, TryIt } from './blocks/Practice'
import { Proof } from './blocks/Proof'
import { Flashcard, Quiz } from './blocks/Quiz'
import { TabSet } from './blocks/Tabs'
import { Flag, Prose, SessionNote, Theorem, Why } from './blocks/TextBlocks'
import type { Mode } from './context'
import { FigureView } from './figure/FigureView'

export { NotaContext } from './context'

export function BlockView({ block, mode }: { block: Block; mode: Mode }): React.JSX.Element | null {
  switch (block.type) {
    case 'prose':
      return <Prose block={block} />
    case 'theorem':
      return <Theorem block={block} />
    case 'decode':
      return (
        <div className="nv-deco">
          <div className="nv-sub">Decodifica logico-formale</div>
          <TabSet
            label="Decodifica"
            tabs={[
              { label: 'Notazione formale', content: <RichText md={asMath(block.formal, true)} /> },
              { label: 'Come si legge', content: <RichText md={block.read} /> },
              { label: 'Cosa significa', content: <RichText md={block.meaning} /> }
            ]}
          />
        </div>
      )
    case 'proof':
      return <Proof block={block} mode={mode} />
    case 'figure':
      return <FigureView fig={block} />
    case 'quiz':
      return <Quiz block={block} />
    case 'flashcard':
      return <Flashcard block={block} />
    case 'tryit':
      return <TryIt block={block} mode={mode} />
    case 'exercise':
      return <Exercise block={block} mode={mode} />
    case 'glossary':
      return <Glossary block={block} />
    case 'flag':
      return <Flag block={block} />
    case 'session':
      return <SessionNote block={block} />
    case 'why':
      return <Why block={block} />
    case 'tabs':
      return (
        <TabSet
          label="Schede"
          tabs={block.tabs.map((t) => ({
            label: t.label,
            content: t.blocks.length ? t.blocks.map((b, i) => <BlockView key={i} block={b} mode={mode} />) : <p className="nv-empty">Contenuto non disponibile per questa scheda.</p>
          }))}
        />
      )
  }
}
