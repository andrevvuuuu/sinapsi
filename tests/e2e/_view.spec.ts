import { _electron as electron, test } from '@playwright/test'
test('view live nota', async () => {
  test.setTimeout(120_000)
  const app = await electron.launch({ args: ['.'], env: { ...process.env, SINAPSI_DATA: '/private/tmp/claude-501/-Users-andreaantonelli/69f2a64e-b7b9-44f8-bdf1-7b290094a2a1/scratchpad/viewdata', SINAPSI_VAULT: process.env.HOME + '/Obsidian Vault' } })
  const win = await app.firstWindow()
  await win.setViewportSize({ width: 1440, height: 900 })
  for (const theme of ['trattato', 'lavagna']) {
    await win.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await win.getByRole('button', { name: /Teorema di Lagrange/ }).first().click()
    await win.waitForTimeout(1500)
    await win.screenshot({ path: '/private/tmp/claude-501/-Users-andreaantonelli/69f2a64e-b7b9-44f8-bdf1-7b290094a2a1/scratchpad/shots/' + theme + '-hero.png' })
    const figs = win.locator('figure.fig')
    const n = await figs.count()
    console.log('figures', n)
    for (let i = 0; i < n; i++) {
      await figs.nth(i).scrollIntoViewIfNeeded()
      await win.waitForTimeout(400)
      await figs.nth(i).screenshot({ path: '/private/tmp/claude-501/-Users-andreaantonelli/69f2a64e-b7b9-44f8-bdf1-7b290094a2a1/scratchpad/shots/' + theme + '-fig' + i + '.png' })
      if (theme === 'lavagna') break
    }
    await win.getByRole('button', { name: '← Home' }).click()
  }
  await app.close()
})
