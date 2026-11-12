// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlockView, NotaContext } from '../../src/renderer/src/nota/BlockView'
import { Proof } from '../../src/renderer/src/nota/blocks/Proof'
import type { Block } from '../../src/shared/nota-schema'

afterEach(cleanup)
const layersOff = (k: 'sessione' | 'quiz' | 'fonti') => ({ sessione: true, quiz: true, fonti: true, [k]: false })

const quiz: Block = { type: 'quiz', prompt: 'Rolle dà un solo $c$?', options: ['Sì', 'No'], correct: 1, why: ['No: solo esistenza.', 'Esatto: almeno uno.'] }

describe('quiz and flashcard', () => {
  it('explains a wrong pick, then locks on the right one', () => {
    render(<BlockView block={quiz} mode="leggi" />)
    fireEvent.click(screen.getByRole('button', { name: /Sì/ }))
    expect(screen.getByRole('status').textContent).toContain('No: solo esistenza.')
    expect((screen.getByRole('button', { name: /Sì/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: /No/ }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /No/ }))
    expect(screen.getByRole('status').textContent).toContain('Esatto: almeno uno.')
    expect((screen.getByRole('button', { name: /No/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('reveals a flashcard answer', () => {
    render(<BlockView block={{ type: 'flashcard', q: 'Che cosa dà Fermat?', a: 'Derivata nulla.' }} mode="leggi" />)
    expect(screen.queryByText('Derivata nulla.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mostra risposta' }))
    expect(screen.getByText('Derivata nulla.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lo sapevo' })).toBeTruthy()
  })
  it('hides quizzes when the Quiz layer is off', () => {
    render(
      <NotaContext.Provider value={{ layers: layersOff('quiz') }}>
        <BlockView block={quiz} mode="leggi" />
      </NotaContext.Provider>
    )
    expect(screen.queryByText(/Rolle dà un solo/)).toBeNull()
  })
})

describe('try it yourself', () => {
  const tryit: Block = { type: 'tryit', prompt: 'Calcola $g(a)$.', solution: 'Vale zero.' }
  it('shows the solution when reading', () => {
    render(<BlockView block={tryit} mode="leggi" />)
    expect(screen.getByText('Vale zero.')).toBeTruthy()
  })
  it('covers the solution in "Prova da solo" until he has tried', () => {
    render(<BlockView block={tryit} mode="prova" />)
    expect(screen.queryByText('Vale zero.')).toBeNull()
    fireEvent.change(screen.getByLabelText('La tua risposta'), { target: { value: 'zero' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ho provato, mostra' }))
    expect(screen.getByText('Vale zero.')).toBeTruthy()
  })
  it('keeps the solution covered until something is written, with an honest "Non lo so"', () => {
    render(<BlockView block={tryit} mode="prova" />)
    expect((screen.getByRole('button', { name: 'Ho provato, mostra' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('La tua risposta'), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Ho provato, mostra' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Non lo so, mostra' }))
    expect(screen.getByText('Vale zero.')).toBeTruthy()
  })
  it('always covers a "solo" exercise', () => {
    render(<BlockView block={{ type: 'exercise', level: 'solo', title: '$\\sin x\\le x$', steps: ['Poni $h=x-\\sin x$.'] }} mode="leggi" />)
    expect(screen.queryByText(/Poni/)).toBeNull()
    fireEvent.change(screen.getByLabelText('La tua risposta'), { target: { value: 'h crescente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confronta con la soluzione' }))
    expect(screen.getByText(/Poni/)).toBeTruthy()
  })
  it('grades the inline choices of a "completa" exercise', () => {
    render(<BlockView block={{ type: 'exercise', level: 'completa', title: 'ln x ≤ x − 1', steps: ['Punto di contatto: {{0|*1|e}}.'] }} mode="leggi" />)
    const pick = (k: number): void => {
      fireEvent.click(screen.getByRole('combobox'))
      fireEvent.click(screen.getAllByRole('option')[k])
    }
    pick(0)
    expect(screen.getByText('Rivedi questo passo')).toBeTruthy()
    pick(1)
    expect(screen.getByText('Giusto')).toBeTruthy()
  })
})

describe('glossary, flag, session, tabs, prose', () => {
  it('covers the meanings and reveals one on request', () => {
    render(<BlockView block={{ type: 'glossary', rows: [{ symbol: '$[a,b]$', read: 'intervallo chiuso', meaning: 'Estremi inclusi' }] }} mode="leggi" />)
    expect(screen.getByText('Estremi inclusi')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copri i significati e prova a dirli' }))
    expect(screen.queryByText('Estremi inclusi')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mostra il significato di [a,b]' }))
    expect(screen.getByText('Estremi inclusi')).toBeTruthy()
  })
  it('copies the correction for Obsidian', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<BlockView block={{ type: 'flag', md: 'Rotazione è impreciso.', correction: 'È un taglio verticale.' }} mode="leggi" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copia la correzione per Obsidian' }))
    expect(writeText).toHaveBeenCalledWith('È un taglio verticale.')
    expect(await screen.findByText('Copiata')).toBeTruthy()
  })
  it('hides session annotations when the Sessione layer is off', () => {
    const block: Block = { type: 'session', kind: 'errore', md: 'Avevi detto g sempre positiva.' }
    const { unmount } = render(<BlockView block={block} mode="leggi" />)
    expect(screen.getByText('Attenzione · errore in sessione')).toBeTruthy()
    unmount()
    render(
      <NotaContext.Provider value={{ layers: layersOff('sessione') }}>
        <BlockView block={block} mode="leggi" />
      </NotaContext.Provider>
    )
    expect(screen.queryByText(/g sempre positiva/)).toBeNull()
  })
  it('hides source chips when the Fonti layer is off', () => {
    const block: Block = { type: 'prose', md: 'Testo.', sources: ['Obsidian §1'] }
    const { unmount } = render(<BlockView block={block} mode="leggi" />)
    expect(screen.getByText('Obsidian §1')).toBeTruthy()
    unmount()
    render(
      <NotaContext.Provider value={{ layers: layersOff('fonti') }}>
        <BlockView block={block} mode="leggi" />
      </NotaContext.Provider>
    )
    expect(screen.queryByText('Obsidian §1')).toBeNull()
    expect(screen.getByText('Testo.')).toBeTruthy()
  })
  it('moves between tabs with the arrow keys', () => {
    render(<BlockView block={{ type: 'decode', formal: 'Formale', read: 'Si legge', meaning: 'Significa' }} mode="leggi" />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Notazione formale', 'Come si legge', 'Cosa significa'])
    expect(screen.getByRole('tabpanel').textContent).toContain('Formale')
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toContain('Si legge')
  })
  it('renders tabs blocks with their content', () => {
    render(<BlockView block={{ type: 'tabs', tabs: [{ label: 'Costanza', blocks: [{ type: 'prose', md: 'Uno' }] }, { label: 'Monotonia', blocks: [{ type: 'prose', md: 'Due' }] }] }} mode="leggi" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Monotonia' }))
    expect(screen.getByRole('tabpanel').textContent).toContain('Due')
  })
  it('renders model HTML inert', () => {
    const { container } = render(<BlockView block={{ type: 'prose', md: 'ciao <img src=x onerror="alert(1)"><script>alert(2)</script>' }} mode="leggi" />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('onerror') ?? null).toBeNull()
  })
  it('opens a "why" box', () => {
    render(<BlockView block={{ type: 'why', title: 'Perché proprio Rolle?', md: 'Perché dà derivata nulla.' }} mode="leggi" />)
    const b = screen.getByRole('button', { name: /Perché proprio Rolle/ })
    expect(b.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(b)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Perché dà derivata nulla.')).toBeTruthy()
  })
})

describe('proof', () => {
  const proof: Extract<Block, { type: 'proof' }> = {
    type: 'proof',
    steps: [
      { title: 'Strategia', md: 'Ridurre a Rolle.' },
      { title: 'Secante', md: 'La retta.', tryPrompt: 'Che retta?' },
      { title: 'Scarto', md: 'g = f − sec.' }
    ],
    figure: {
      type: 'figure',
      title: 'Figura · dimostrazione',
      x: [-2, 2],
      y: [-1, 3],
      functions: { f: 'x^2' },
      params: [],
      elements: [{ kind: 'curve', fn: 'f' }, { kind: 'point', x: '0', y: '0', label: 'g', steps: [2] }]
    }
  }
  it('follows the active step in the chain and the figure', () => {
    let activate: (i: number) => void = () => undefined
    render(<Proof block={proof} mode="leggi" observe={(_els, cb) => ((activate = cb), () => undefined)} />)
    expect(screen.queryByTestId('el-1')).toBeNull()
    act(() => activate(2))
    expect(screen.getByRole('button', { name: 'Scarto' }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByTestId('el-1')).toBeTruthy()
  })
  it('covers steps with a tryPrompt in "Prova da solo"', () => {
    render(<Proof block={proof} mode="prova" observe={() => () => undefined} />)
    expect(screen.queryByText('La retta.')).toBeNull()
    expect(screen.getByText('Che retta?')).toBeTruthy()
    expect(screen.getByText('Ridurre a Rolle.')).toBeTruthy()
  })
})
