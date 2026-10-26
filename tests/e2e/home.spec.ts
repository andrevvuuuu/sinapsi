import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('home opens with the vault explorer and theme switch', async () => {
  const app = await electron.launch({
    ...(process.env.SINAPSI_APP_PATH ? { executablePath: process.env.SINAPSI_APP_PATH, args: [] } : { args: ['.'] }),
    env: { ...process.env, SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await expect(win).toHaveTitle('Sinapsi')
  await win.getByText('Matematica', { exact: true }).click()
  await expect(win.getByText('Teorema di Rolle')).toBeVisible()
  await expect(win.getByText('prompt')).toHaveCount(0)
  await win.getByRole('button', { name: 'Impostazioni' }).click()
  await win.getByRole('button', { name: 'Trattato' }).click()
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'trattato')
  await win.getByRole('button', { name: 'Impostazioni' }).click()
  await win.screenshot({ path: 'test-results/home.png' })
  await app.close()
})
