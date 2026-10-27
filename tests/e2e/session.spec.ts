import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('a full learning session with the scripted tutor', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_TEACHER: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await win.getByLabel('Cosa vuoi studiare?').fill('Teorema di Lagrange')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await expect(win.getByText('Dalla tua nota: Teorema di Lagrange')).toBeVisible()

  // goal (open)
  await win.getByLabel('La tua risposta').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // probe (choice + confidence)
  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByLabel('Fiducia').fill('90')
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // plan
  await win.getByRole('button', { name: 'Approva il piano' }).click()
  await expect(win.getByRole('complementary', { name: 'Il piano' }).getByText('Pendenza della corda')).toBeVisible()
  // predict
  await win.getByLabel('La tua risposta').fill('il rapporto tra dislivello e distanza')
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // check behind the invite
  await win.getByLabel('Pensieri mentre leggi').fill('come una velocità media')
  await win.getByRole('button', { name: 'Verifica la tua comprensione' }).click()
  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByText('Corretto').last()).toBeVisible()
  // game: Coppie
  const coppie = win.getByRole('region', { name: 'Gioco «Coppie»' })
  await coppie.getByRole('group', { name: 'Voci' }).getByRole('button', { name: 'Rolle' }).click()
  await coppie.getByRole('group', { name: 'Corrispondenti' }).getByRole('button', { name: 'derivata nulla in un punto' }).click()
  await coppie.getByRole('group', { name: 'Voci' }).getByRole('button', { name: 'Lagrange' }).click()
  await coppie.getByRole('group', { name: 'Corrispondenti' }).getByRole('button', { name: 'tangente parallela alla corda' }).click()
  await expect(coppie.getByText('2/2')).toBeVisible()
  await coppie.getByRole('button', { name: 'Continua' }).click()
  // game: Lampo
  const lampo = win.getByRole('region', { name: 'Gioco «Lampo»' })
  for (const v of ['Vero', 'Falso', 'Vero']) {
    await lampo.getByRole('button', { name: v }).click()
    await win.waitForTimeout(1300)
  }
  await expect(lampo.getByText('3/3')).toBeVisible()
  await win.screenshot({ path: 'test-results/game.png' })
  await lampo.getByRole('button', { name: 'Continua' }).click()
  await expect(win.getByLabel('Punteggio')).toContainText('serie')
  // recall
  await win.getByLabel('La tua risposta').fill('pendenza media, Rolle, funzione g')
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByText('Hai imparato')).toBeVisible()
  await win.screenshot({ path: 'test-results/session.png' })

  await win.getByRole('button', { name: 'Torna alla home' }).click()
  await expect(win.getByRole('button', { name: /Teorema di Lagrange.*Apprendimento/ })).toBeVisible()
  await app.close()
})
