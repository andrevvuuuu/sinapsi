import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('a review of freshly extracted concepts updates their memory in the graph', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_EXTRACT: '1', SINAPSI_FAKE_REVIEW: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  // extract Rolle's concepts by opening the note
  await win.getByText('Matematica', { exact: true }).click()
  await win.getByRole('button', { name: 'Teorema di Rolle' }).click()
  await expect(win.getByText('3 concetti nel grafo')).toBeVisible()
  await win.getByRole('button', { name: '← Home' }).click()

  // composer → Ripasso, no text
  await win.getByRole('button', { name: /^Ripasso/ }).click()
  await win.getByRole('button', { name: 'Inizia' }).click()
  await expect(win.getByRole('heading', { name: /3 concetti da fissare/ })).toBeVisible()
  await expect(win.getByRole('group', { name: 'Esercizi' }).getByRole('button')).toHaveCount(10)
  await win.getByRole('button', { name: 'Inizia ripasso' }).click()

  for (let k = 0; k < 3; k++) {
    await win.getByRole('button', { name: /La continuità/ }).click()
    await win.getByLabel('Quanto sei sicuro?').fill('80')
    await win.getByRole('button', { name: 'Verifica' }).click()
    await expect(win.getByText('Corretto')).toBeVisible()
    await expect(win.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' }).getByRole('button', { name: /Bene/ })).toContainText('proposta')
    await win.getByRole('button', { name: k === 2 ? 'Vedi riepilogo' : 'Prossima' }).click()
  }
  await expect(win.getByRole('heading', { name: 'Tutto di nuovo nitido.' })).toBeVisible()
  await win.screenshot({ path: 'test-results/review.png' })
  await win.getByRole('button', { name: 'Torna alla home' }).click()

  await win.getByRole('combobox', { name: 'Cerca nel grafo' }).fill('Weierstrass')
  await win.getByRole('option', { name: /Weierstrass.*concetto/ }).click()
  await expect(win.getByRole('dialog', { name: 'Dettagli' }).getByText(/la sai · \d+%/)).toBeVisible()
  await app.close()
})
