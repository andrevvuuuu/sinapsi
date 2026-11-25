import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, makeNotaViva } from './helpers'

test('concepts extracted from two notes join one graph', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_EXTRACT: '1', SINAPSI_FAKE_NOTE: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await goTo(win, 'Grafo')

  // The notch's «Stato del grafo» section carries the counts line.
  await win.getByRole('button', { name: 'Stato del grafo' }).click()
  await expect(win.locator('#gnotch-section-status')).toBeVisible()
  await expect(win.locator('#gnotch-section-status').getByText('Concetti')).toBeVisible()

  // a nota viva brings its note's concepts into the graph
  await makeNotaViva(win, 'Teorema di Rolle')
  await goTo(win, 'Grafo')
  await win.getByRole('button', { name: 'Stato del grafo' }).click()
  await expect(win.locator('#gnotch-section-status').getByText('3 concetti da 1 note · 1 catene · 0 in più note')).toBeVisible()

  // Lagrange recognises Rolle's theorem as the same concept
  await win.keyboard.press('Escape')
  await makeNotaViva(win, 'Teorema di Lagrange')
  await goTo(win, 'Grafo')
  await win.getByRole('button', { name: 'Stato del grafo' }).click()
  await expect(win.locator('#gnotch-section-status').getByText('4 concetti da 2 note · 2 catene · 1 in più note')).toBeVisible()
  await win.getByRole('button', { name: 'Vista del grafo' }).click()

  await win.getByRole('combobox', { name: 'Cerca nel grafo' }).fill('Teorema di Rolle')
  await win.getByRole('option', { name: /Teorema di Rolle.*concetto/ }).click()
  const card = win.getByRole('dialog', { name: 'Dettagli' })
  await expect(card.getByText('Compare in 2 tue note: un nodo solo')).toBeVisible()
  await expect(card.getByRole('button', { name: /Teorema di Weierstrass/ })).toBeVisible()
  await win.waitForTimeout(1200)
  await win.screenshot({ path: 'test-results/graph.png' })
  await app.close()
})
