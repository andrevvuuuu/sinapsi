import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { makePdf } from '../unit/helpers/pdf'

test('a notebook imports a PDF, a video and a vault note, and answers from them with citations', async () => {
  const files = mkdtempSync(join(tmpdir(), 'sinapsi-e2e-files-'))
  const pdf = join(files, 'Dispensa Rolle.pdf')
  writeFileSync(pdf, makePdf(['Teorema di Rolle: nel corso lo chiamiamo lemma del cammello.', 'Dimostrazione: si usa Weierstrass e poi Fermat.']))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_NOTEBOOK: '1', SINAPSI_FAKE_MEDIA: '1', SINAPSI_FAKE_EXTRACT: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  const panel = win.getByRole('complementary', { name: 'Notebook' })
  await panel.getByRole('button', { name: 'Nuovo notebook' }).click()
  await panel.getByLabel('Nome del notebook').fill('Analisi 1')
  await panel.getByRole('button', { name: 'Crea' }).click()
  await expect(win.getByLabel('Nome del notebook')).toHaveValue('Analisi 1')

  // The file dialog is native: add the PDF through the same call the dialog makes.
  const id = await win.evaluate(async () => (await window.sinapsi.notebook.list())[0].id)
  await win.evaluate(([nb, p]) => window.sinapsi.notebook.addFiles(nb, [p]), [id, pdf] as const)
  await win.getByRole('button', { name: 'YouTube' }).click()
  await win.getByLabel('Link del video').fill('https://www.youtube.com/watch?v=abcdefghijk')
  await win.getByRole('button', { name: 'Aggiungi' }).click()
  await win.getByRole('button', { name: 'Nota del vault' }).click()
  await win.getByLabel('Cerca una nota').fill('Rolle')
  await win.getByRole('button', { name: 'Teorema di Rolle', exact: true }).click()

  const list = win.getByRole('list', { name: 'Fonti' })
  await expect(list.getByText('2 pagine')).toBeVisible()
  await expect(list.getByText('Video di prova')).toBeVisible()
  await expect(win.getByText('Risponde solo dalle fonti selezionate (3 di 3 pronte)')).toBeVisible()

  await win.getByLabel('Chiedi alle tue fonti').fill('Come si chiama Rolle nel corso?')
  await win.getByRole('button', { name: 'Chiedi' }).click()
  await expect(win.getByText('Secondo le tue fonti, la risposta è nel primo estratto.')).toBeVisible()
  await expect(win.getByText('Le fonti non dicono chi lo ha dimostrato.')).toBeVisible()
  await win.getByRole('button', { name: /^Fonte 1: Dispensa Rolle, p\. 1/ }).click()
  const viewer = win.getByRole('complementary', { name: 'Dispensa Rolle' })
  await expect(viewer.locator('mark')).toContainText('lemma del cammello')
  await win.screenshot({ path: 'test-results/notebook.png' })

  await win.getByRole('button', { name: 'Collega NotebookLM' }).click()
  await win.getByLabel('Link del notebook su NotebookLM').fill('https://notebooklm.google.com/notebook/abc')
  await win.getByRole('button', { name: 'Salva link' }).click()
  await expect(win.getByRole('button', { name: 'Apri in NotebookLM' })).toBeVisible()
  await app.close()
})
