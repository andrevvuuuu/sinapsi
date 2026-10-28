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

  await win.getByRole('group', { name: 'Tipo di sessione' }).getByRole('button', { name: 'Pratica', exact: true }).click()
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
  await win.screenshot({ path: 'test-results/practice-train.png' })
  await win.getByRole('button', { name: 'Prossimo problema' }).click()
  await expect(dock.getByRole('group', { name: 'Righe della dimostrazione' })).toBeVisible()
  await app.close()
})

test('an exam: a timed sheet, answers, delivery, a grade in thirtieths', async () => {
  const app = await launch()
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await win.getByRole('group', { name: 'Tipo di sessione' }).getByRole('button', { name: 'Pratica', exact: true }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('limiti notevoli')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
  await win.getByRole('button', { name: '30 min' }).click()
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
