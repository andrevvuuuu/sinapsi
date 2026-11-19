import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, openVaultNote } from './helpers'

test('a nota viva written from an Obsidian note, with live figure and quiz', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_NOTE: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await openVaultNote(win, 'Teorema di Rolle')
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await expect(win.getByRole('navigation', { name: 'Indice' })).toContainText('Dimostrazione')

  // figure: the slider moves the readout, "Mostra i punti" finds c = 0
  const slider = win.getByRole('slider', { name: 'Punto c' })
  await slider.fill('0.5')
  await expect(win.locator('.readout')).toContainText('1,00')
  await win.getByRole('button', { name: 'Mostra i punti' }).click()
  await win.getByRole('button', { name: /p ≈ 0,00/ }).click()
  await expect(win.getByText('Diventa verde', { exact: false })).toBeVisible()

  // quiz
  await win.getByRole('button', { name: /Sì/ }).click()
  await expect(win.getByText('No: dice solo che esiste.')).toBeVisible()

  // "Prova da solo" covers the second proof step
  await expect(win.getByText('Un estremo interno ha derivata nulla.')).toBeVisible()
  await win.getByRole('tab', { name: 'Prova da solo' }).click()
  await expect(win.getByText('Un estremo interno ha derivata nulla.')).toHaveCount(0)
  await expect(win.getByText('Perché almeno un estremo è interno?')).toBeVisible()
  await win.screenshot({ path: 'test-results/nota.png', fullPage: true })

  // back home: returns to today view, and the nota is listed in Note
  await win.getByRole('button', { name: '← Home' }).click()
  await expect(win.getByRole('heading', { level: 1, name: 'Oggi' })).toBeVisible()
  await goTo(win, 'Note')
  await expect(win.getByRole('region', { name: 'Note' }).getByText(/Teorema di Rolle/)).toBeVisible()
  await app.close()
})
