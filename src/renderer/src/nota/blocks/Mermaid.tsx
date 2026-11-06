import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { SectionContext } from '../context'
import { plainText } from '../math'
import { firstLabel, FONT, MIN_SCALE, mermaidTheme, prepareMermaid, sanitizeSvg } from './mermaid-theme'

// Mermaid keeps one global configuration: renders run one at a time so each uses its own theme.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = queue.then(fn, fn)
  queue = p.catch(() => undefined)
  return p
}
let seq = 0

async function draw(code: string, id: string): Promise<string> {
  const mermaid = (await import('mermaid')).default
  return serial(async () => {
    const theme = mermaidTheme()
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: FONT, themeVariables: theme, flowchart: { useMaxWidth: true, padding: 12, wrappingWidth: 280 } })
    const src = prepareMermaid(code)
    const target = `${id}-${++seq}`
    try {
      await mermaid.parse(src)
      const { svg } = await mermaid.render(target, src)
      return sanitizeSvg(svg)
    } finally {
      // A failed render can leave its scratch element in the page.
      document.getElementById(`d${target}`)?.remove()
    }
  })
}

const themeNow = (): string => document.documentElement.dataset.theme ?? ''

/** A ```mermaid block drawn as a diagram in the app's colours; its text with a note if it cannot be drawn. */
export default function Mermaid({ code }: { code: string }): React.JSX.Element {
  const section = useContext(SectionContext)
  const id = 'nv-mmd-' + useId().replace(/[^A-Za-z0-9]/g, '')
  const [theme, setTheme] = useState(themeNow)
  const [state, setState] = useState<{ svg: string } | { error: true } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)

  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(() => setTheme(themeNow()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    draw(code, id).then(
      (svg) => alive && setState({ svg }),
      (e) => {
        console.warn('[nota] diagramma non disegnato', e)
        if (alive) setState({ error: true })
      }
    )
    return () => {
      alive = false
    }
  }, [code, id, theme])

  // Fits the column; past MIN_SCALE it keeps its size and the box scrolls sideways.
  useLayoutEffect(() => {
    const svg = box.current?.querySelector('svg')
    if (!svg) return
    const w = Number(svg.getAttribute('viewBox')?.split(/[\s,]+/)[2])
    if (w > 0) svg.style.minWidth = `${Math.round(w * MIN_SCALE)}px`
    const el = scroller.current
    if (el) setWide(el.scrollWidth > el.clientWidth + 1)
  }, [state])

  if (state && 'error' in state)
    return (
      <div className="nv-mmd-fail">
        <pre>
          <code>{code}</code>
        </pre>
        <p>Questo diagramma non si è potuto disegnare: qui sopra c’è il suo testo.</p>
      </div>
    )
  if (!state)
    return (
      <p className="nv-mmd-wait" role="status">
        Disegno il diagramma…
      </p>
    )
  const name = plainText(section) || firstLabel(code)
  return (
    <div className="nv-mmd" ref={scroller} tabIndex={wide ? 0 : undefined} aria-label={wide ? 'Scorri il diagramma' : undefined} role={wide ? 'region' : undefined}>
      <div ref={box} role="img" aria-label={name ? `Diagramma: ${name}` : 'Diagramma'} dangerouslySetInnerHTML={{ __html: state.svg }} />
    </div>
  )
}
