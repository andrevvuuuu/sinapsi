import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, makeNotaViva } from './helpers'

test('a review of freshly extracted concepts updates their memory in the graph', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_EXTRACT: '1', SINAPSI_FAKE_NOTE: '1', SINAPSI_FAKE_REVIEW: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  // extract Rolle's concepts by opening the note
  await makeNotaViva(win, 'Teorema di Rolle')

  // composer → Ripassa for 'rolle'
  await goTo(win, 'Oggi')
  const composer = win.getByRole('region', { name: 'Compositore di studio' })
  await composer.getByRole('button', { name: 'Ripassa' }).click()
  await composer.getByRole('textbox', { name: 'Cosa vuoi studiare?' }).fill('rolle')
  await composer.getByRole('button', { name: 'Inizia studio' }).click()

  await expect(win.getByRole('heading', { name: /3 concetti da fissare/ })).toBeVisible()
  await expect(win.getByRole('group', { name: 'Esercizi' }).getByRole('button')).toHaveCount(12)
  await win.getByRole('button', { name: 'Inizia ripasso' }).click()

  for (let k = 0; k < 3; k++) {
    await win.getByRole('button', { name: /La continuità/ }).click()
    await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
    await win.getByRole('button', { name: 'Verifica' }).click()
    await expect(win.getByText('Corretto')).toBeVisible()
    await expect(win.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' }).getByRole('button', { name: /Bene/ })).toContainText('proposta')
    await win.getByRole('button', { name: k === 2 ? 'Vedi riepilogo' : 'Prossima' }).click()
  }
  await expect(win.getByRole('heading', { name: 'Tutto di nuovo nitido.' })).toBeVisible()
  await win.screenshot({ path: 'test-results/review.png' })
  await win.getByRole('button', { name: 'Torna alla home' }).click()

  await goTo(win, 'Grafo')
  await win.getByRole('button', { name: 'Vista del grafo' }).click()
  await win.getByRole('combobox', { name: 'Cerca nel grafo' }).fill('Weierstrass')
  await win.getByRole('option', { name: /Weierstrass.*concetto/ }).click()
  await expect(win.getByRole('dialog', { name: 'Dettagli' }).getByText(/la sai · \d+%/)).toBeVisible()
  await app.close()
})

test('Spiegalo tu: a spoken explanation, one question from the picky student, then the verdict', async () => {
  const app = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    env: { ...process.env, SINAPSI_FAKE_EXTRACT: '1', SINAPSI_FAKE_NOTE: '1', SINAPSI_FAKE_REVIEW: '1', SINAPSI_FAKE_MEDIA: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await makeNotaViva(win, 'Teorema di Rolle')
  // Only Spiegalo tu, so the first item is one.
  await win.evaluate(() => window.sinapsi.settings.set({ exerciseTypes: ['explain'] }))

  await goTo(win, 'Oggi')
  const composer = win.getByRole('region', { name: 'Compositore di studio' })
  await composer.getByRole('button', { name: 'Ripassa' }).click()
  await composer.getByRole('textbox', { name: 'Cosa vuoi studiare?' }).fill('rolle')
  await composer.getByRole('button', { name: 'Inizia studio' }).click()

  await expect(win.getByRole('heading', { name: /concetti da fissare/ })).toBeVisible()
  await expect(win.getByRole('group', { name: 'Esercizi' }).getByRole('button', { pressed: true })).toHaveText(['Spiegalo tu'])
  await win.getByRole('button', { name: 'Inizia ripasso' }).click()

  await expect(win.getByText(/compagno pignolo/)).toBeVisible()
  await win.getByRole('button', { name: 'Detta' }).click()
  await win.getByRole('button', { name: /Ferma/ }).click()
  await expect(win.getByLabel('La tua spiegazione, a libro chiuso')).toHaveValue(/Lagrange segue da Rolle/)
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Verifica' }).click()
  await expect(win.getByText('Perché il massimo è in un punto interno?')).toBeVisible()
  await win.getByLabel('La tua risposta').fill('Se massimo e minimo sono agli estremi, f è costante.')
  await win.screenshot({ path: 'test-results/review-explain-question.png' })
  await win.getByRole('button', { name: 'Rispondi' }).click()
  await expect(win.getByText('Quasi')).toBeVisible()
  await expect(win.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' }).getByRole('button', { name: /Di nuovo/ })).toContainText('proposta')
  await win.screenshot({ path: 'test-results/review-explain-verdict.png' })
  await win.getByRole('button', { name: /Prossima|Vedi riepilogo/ }).click()
  const reviews = await win.evaluate(async () => window.sinapsi.review.memory())
  expect(Object.values(reviews).some((m) => m.reps === 1)).toBe(true)
  await app.close()
})
