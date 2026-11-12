// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfusionCompassCard } from '../../src/renderer/src/practice/ConfusionCompassCard'


describe('ConfusionCompassCard', () => {
  it('keeps the request disabled until stuck and question are entered, then sends all values', () => {
    const onSend = vi.fn(async () => true)
    render(<ConfusionCompassCard disabled={false} onSend={onSend} />)
    const button = screen.getByRole('button', { name: "Chiedi l'indizio" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Cosa so già'), { target: { value: 'Definizione' } })
    fireEvent.change(screen.getByLabelText('Dove mi blocco'), { target: { value: 'Non so applicarla' } })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('La mia domanda precisa'), { target: { value: 'Quale ipotesi manca?' } })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    expect(onSend).toHaveBeenCalledWith({ kind: 'compass', compass: { known: 'Definizione', stuck: 'Non so applicarla', question: 'Quale ipotesi manca?' } })
  })
})
