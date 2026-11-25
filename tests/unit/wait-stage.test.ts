// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWaitStage } from '../../src/renderer/src/components/useWaitStage'
import type { EngineStatus } from '../../src/shared/api'

describe('useWaitStage', () => {
  let onStatusCb: ((statuses: Record<string, EngineStatus>) => void) | null = null
  let mockStatus: Record<string, EngineStatus> = { agy: 'idle', claude: 'idle' }

  beforeEach(() => {
    vi.useFakeTimers()
    onStatusCb = null
    mockStatus = { agy: 'idle', claude: 'idle' }

    window.sinapsi = {
      ai: {
        status: vi.fn(async () => mockStatus),
        onStatus: vi.fn((cb: (statuses: Record<string, EngineStatus>) => void) => {
          onStatusCb = cb
          return () => {
            onStatusCb = null
          }
        })
      }
    } as never
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('busy → thinking', async () => {
    const { result } = renderHook(() =>
      useWaitStage({ engine: 'agy', active: true, writing: false })
    )

    // Flush initial status() promise
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.stage).toBe('preparing')
    expect(result.current.label).toBe('Preparo…')

    // Motore diventa busy → thinking
    act(() => {
      onStatusCb?.({ agy: 'busy' })
    })
    expect(result.current.stage).toBe('thinking')
    expect(result.current.label).toBe('Ci sto ragionando')
  })

  it('writing → writing e non torna indietro', async () => {
    let writing = false
    const { result, rerender } = renderHook(
      ({ w }) => useWaitStage({ engine: 'claude', active: true, writing: w }),
      { initialProps: { w: writing } }
    )

    await act(async () => {
      await Promise.resolve()
    })

    // Diventa busy
    act(() => {
      onStatusCb?.({ claude: 'busy' })
    })
    expect(result.current.stage).toBe('thinking')

    // Writing diventa true
    writing = true
    rerender({ w: writing })
    expect(result.current.stage).toBe('writing')
    expect(result.current.label).toBe('Sto scrivendo')

    // Motore invia busy o idle → non torna indietro a thinking
    act(() => {
      onStatusCb?.({ claude: 'busy' })
    })
    expect(result.current.stage).toBe('writing')

    act(() => {
      onStatusCb?.({ claude: 'idle' })
    })
    expect(result.current.stage).toBe('writing')
  })

  it('20 s senza segnali → slow', async () => {
    const { result } = renderHook(() =>
      useWaitStage({ engine: 'agy', active: true, writing: false })
    )

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      onStatusCb?.({ agy: 'busy' })
    })
    expect(result.current.stage).toBe('thinking')

    // Avanza di 19 secondi: ancora thinking
    act(() => {
      vi.advanceTimersByTime(19000)
    })
    expect(result.current.stage).toBe('thinking')
    expect(result.current.seconds).toBe(19)

    // Al 20° secondo senza segnali → slow
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.stage).toBe('slow')
    expect(result.current.label).toBe('Ci sta mettendo più del solito…')
    expect(result.current.seconds).toBe(20)

    // Nuovo segnale → esce da slow
    act(() => {
      onStatusCb?.({ agy: 'busy' })
    })
    expect(result.current.stage).toBe('thinking')
  })

  it('motore già busy all’avvio → queued', async () => {
    mockStatus = { agy: 'busy', claude: 'idle' }

    const { result } = renderHook(() =>
      useWaitStage({ engine: 'agy', active: true, writing: false })
    )

    // Initial status() resolves with busy
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.stage).toBe('queued')
    expect(result.current.label).toBe('In coda: il motore sta finendo un altro lavoro')

    // Torna idle una volta → preparing
    act(() => {
      onStatusCb?.({ agy: 'idle' })
    })
    expect(result.current.stage).toBe('preparing')

    // Poi diventa busy (attività nostra) → thinking
    act(() => {
      onStatusCb?.({ agy: 'busy' })
    })
    expect(result.current.stage).toBe('thinking')
  })
})
