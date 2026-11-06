import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { makeNotaViva } from './helpers'

const launch = () =>
  electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_PRACTICE: '1', SINAPSI_FAKE_EXTRACT: '1', SINAPSI_FAKE_NOTE: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })

test('a training session: material, a problem, a hint, the solution, the next problem', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  // concepts in the graph: open Rolle once
  await makeNotaViva(win, 'Teorema di Rolle')

  await win.getByRole('tablist', { name: 'Tipo di sessione' }).getByRole('tab', { name: 'Pratica', exact: true }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('rolle')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await expect(win.getByRole('status').filter({ hasText: 'per «rolle»' })).toBeVisible()
  await win.screenshot({ path: 'test-results/practice-setup.png' })
  await win.getByRole('button', { name: 'Inizia allenamento' }).click()

  const dock = win.getByRole('region', { name: 'Problema' })
  await expect(dock.getByText(/Mostra che per ogni/)).toBeVisible()
  await dock.getByRole('button', { name: 'Dammi un indizio' }).click()
  await expect(win.getByText('R0')).toBeVisible()
  await dock.getByLabel('Il tuo ragionamento').fill('uso il teorema del valor medio')
  await dock.getByRole('button', { name: 'Invia' }).click()
  const card = win.getByRole('article', { name: 'Problema concluso' })
  await expect(card.getByText('Risolto con aiuti')).toBeVisible()
  await expect(card.getByText('Soluzione di riferimento')).toBeVisible()
  await expect(win.getByRole('complementary', { name: 'Andamento della sessione' }).getByText('in coda')).toBeVisible()
  // The conclusion, last in the conversation, ends above the dock that floats over it.
  await expect
    .poll(async () => {
      const c = (await card.boundingBox())!
      return c.y + c.height - (await win.locator('.pr .dock').boundingBox())!.y
    })
    .toBeLessThanOrEqual(0)
  await win.screenshot({ path: 'test-results/practice-train.png' })
  await win.getByRole('button', { name: 'Prossimo problema' }).click()
  await expect(dock.getByRole('group', { name: 'Righe della dimostrazione' })).toBeVisible()
  await app.close()
})

test('an exam: a timed sheet, answers, delivery, a grade in thirtieths', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await win.getByRole('tablist', { name: 'Tipo di sessione' }).getByRole('tab', { name: 'Pratica', exact: true }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('limiti notevoli')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
  await win.getByRole('tab', { name: '30 min' }).click()
  await win.getByRole('button', { name: 'Inizia simulazione · 30 min' }).click()
  await expect(win.getByRole('timer')).toBeVisible()
  await win.getByLabel('Risposta all’esercizio 1').fill('Vale $1$.')
  await win.screenshot({ path: 'test-results/practice-exam.png' })
  win.once('dialog', (d) => void d.accept())
  await win.getByRole('button', { name: 'Consegna' }).click()
  await expect(win.getByText('21/30')).toBeVisible()
  await expect(win.getByText('Manca la derivabilità.')).toBeVisible()
  await win.screenshot({ path: 'test-results/practice-grade.png' })
  await app.close()
})

test('an exam on paper: sheet and clock, pens down, self-grade before the correction, calibration over time', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  for (const [round, selfs] of [[1, ['12', '16']], [2, ['10', '9,5']]] as const) {
    await win.getByRole('tablist', { name: 'Tipo di sessione' }).getByRole('tab', { name: 'Pratica', exact: true }).click()
    await win.getByLabel('Cosa vuoi studiare?').fill('limiti notevoli')
    await win.getByRole('button', { name: 'Inizia' }).click()
    await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
    await win.getByRole('tab', { name: '30 min' }).click()
    await win.getByRole('tab', { name: 'Carta e penna' }).click()
    await win.getByRole('button', { name: 'Inizia simulazione su carta · 30 min' }).click()
    await expect(win.getByRole('timer')).toBeVisible()
    await expect(win.getByText('Enuncia e dimostra il teorema di Rolle.')).toBeVisible()
    await expect(win.getByLabel('Risposta all’esercizio 1')).toHaveCount(0)
    if (round === 1) await win.screenshot({ path: 'test-results/paper-sheet.png' })
    win.once('dialog', (d) => void d.accept())
    await win.getByRole('button', { name: 'Ho finito: consegno' }).click()
    await expect(win.getByRole('heading', { name: 'Penne giù' })).toBeVisible()
    await expect(win.getByText('Weierstrass e Fermat.')).toBeVisible()
    await expect(win.getByRole('timer')).toHaveCount(0)
    await expect(win.getByRole('button', { name: 'Correggi' })).toBeDisabled()
    for (const [i, v] of selfs.entries()) {
      await win.getByLabel(`Il tuo voto all’esercizio ${i + 1}`).fill(v)
      await win.getByRole('region', { name: `Esercizio ${i + 1}` }).getByRole('button', { name: 'Conferma il mio voto' }).click()
      await expect(win.getByLabel(`Risposta all’esercizio ${i + 1}`)).toBeVisible()
    }
    await win.getByLabel('Risposta all’esercizio 1').fill('Vale $1$.')
    await win.getByLabel('Risposta all’esercizio 2').fill('Per Weierstrass ha max e min.')
    if (round === 1) await win.screenshot({ path: 'test-results/paper-self.png' })
    win.once('dialog', (d) => void d.accept())
    await win.getByRole('button', { name: 'Correggi' }).click()
    await expect(win.getByRole('region', { name: 'Voto' }).getByText('21/30')).toBeVisible()
    const panel = win.getByRole('region', { name: 'Calibrazione' })
    await expect(panel).toBeVisible()
    if (round === 1) {
      await expect(panel.getByText('28/30')).toBeVisible()
      await expect(panel.getByText('Ti sei sopravvalutato di 3,5 punti in media a esercizio.')).toBeVisible()
      await win.screenshot({ path: 'test-results/paper-grade.png' })
      await win.getByRole('button', { name: '← Home' }).click()
    } else {
      await expect(panel.getByText('Su 2 simulazioni a carta', { exact: false })).toBeVisible()
      await win.screenshot({ path: 'test-results/paper-history.png', fullPage: true })
    }
  }
  await app.close()
})
