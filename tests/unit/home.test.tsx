// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from '../../src/renderer/src/home/Home'
import type { SinapsiApi, VaultResult } from '../../src/shared/api'
import { settingsSchema } from '../../src/shared/settings-schema'

function mockApi(index: VaultResult, status = { agy: 'idle', claude: 'idle' } as const): SinapsiApi {
  const settings = settingsSchema('/Users/x').parse({})
  return {
    settings: { get: vi.fn(async () => settings), set: vi.fn(async () => settings), chooseVault: vi.fn(async () => settings) },
    vault: { index: vi.fn(async () => index), onChange: () => () => undefined },
    ai: { status: vi.fn(async () => ({ ...status })), onStatus: () => () => undefined },
    app: { openExternal: vi.fn(async () => undefined) }
  }
}
const idx: VaultResult = {
  root: '/v', scannedAt: 0, subjects: [],
  notes: [{ path: '/v/Matematica/Teorema di Rolle.md', title: 'Teorema di Rolle', folder: 'Matematica', tags: [], aliases: [], links: [], headings: [], blockIds: [], subject: null, mtime: 0, size: 0, available: true }]
}

afterEach(cleanup)

describe('Home', () => {
  it('shows the vault notes in the explorer', async () => {
    window.sinapsi = mockApi(idx)
    render(<Home />)
    expect(await screen.findByText('Teorema di Rolle')).toBeTruthy()
  })

  it('explains a missing vault and lets you pick the folder', async () => {
    window.sinapsi = mockApi({ error: 'missing', path: '/Users/x/Obsidian Vault' })
    render(<Home />)
    expect(await screen.findByText('Non trovo il tuo vault Obsidian')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scegli la cartella del vault' }))
    expect(window.sinapsi.settings.chooseVault).toHaveBeenCalled()
  })

  it('says when an engine needs a new login', async () => {
    window.sinapsi = mockApi(idx, { agy: 'auth', claude: 'idle' } as never)
    render(<Home />)
    expect(await screen.findByText(/serve l'accesso/)).toBeTruthy()
  })

  it('opens an Obsidian note from the tree inside the app', async () => {
    window.sinapsi = mockApi(idx)
    const onOpenSource = vi.fn()
    render(<Home onOpenSource={onOpenSource} />)
    fireEvent.click(await screen.findByText('Teorema di Rolle'))
    expect(onOpenSource).toHaveBeenCalledWith('/v/Matematica/Teorema di Rolle.md')
  })

  it('lists the notes vive and opens one', async () => {
    const ID = '11111111-1111-4111-8111-111111111111'
    window.sinapsi = {
      ...mockApi(idx),
      notes: { list: vi.fn(async () => [{ id: ID, createdAt: 1, updatedAt: 1, status: 'ready', sourcePath: '/v/x.md', sourceTitle: 'Lagrange', title: 'Teorema di Lagrange' }]), onUpdate: () => () => undefined }
    } as never
    const onOpenNota = vi.fn()
    render(<Home onOpenNota={onOpenNota} />)
    expect(await screen.findByRole('heading', { name: 'Note vive' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Teorema di Lagrange/ }))
    expect(onOpenNota).toHaveBeenCalledWith(ID)
  })
})
