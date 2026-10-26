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
  // recall
  await win.getByLabel('La tua risposta').fill('pendenza media, Rolle, funzione g')
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByText('Hai imparato')).toBeVisible()
  await win.screenshot({ path: 'test-results/session.png' })

  await win.getByRole('button', { name: 'Torna alla home' }).click()
  await expect(win.getByRole('button', { name: /Teorema di Lagrange.*Apprendimento/ })).toBeVisible()
  await app.close()
})
