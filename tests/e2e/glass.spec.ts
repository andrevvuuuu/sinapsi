import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

type Look = { backdrop: string; alpha: number }

/** backdrop-filter and the alpha of the background colour of the first element matching each selector. */
async function looks(win: Page, selectors: string[]): Promise<Record<string, Look>> {
  return win.evaluate((sels) => {
    const out: Record<string, { backdrop: string; alpha: number }> = {}
    for (const s of sels) {
      const el = document.querySelector(s)
      if (!el) throw new Error(`missing ${s}`)
      const cs = getComputedStyle(el)
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)
      const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean) : []
      out[s] = { backdrop: cs.backdropFilter, alpha: parts.length > 3 ? Number(parts[3]) : 1 }
    }
    return out
  }, selectors)
}

async function expectGlass(win: Page, selectors: string[]): Promise<void> {
  const l = await looks(win, selectors)
  // The material's own filter (tokens.css .glass), not a plain blur.
  for (const s of selectors) expect(l[s].backdrop, `${s} is glass`).toContain('saturate(')
}

/** Text to read stays on a full surface: no backdrop, opaque background. */
async function expectSolid(win: Page, selectors: string[]): Promise<void> {
  const l = await looks(win, selectors)
  for (const s of selectors) {
    expect(l[s].backdrop, `${s} has no backdrop`).toBe('none')
    expect(l[s].alpha, `${s} is opaque`).toBe(1)
  }
}

async function shoot(win: Page, name: string): Promise<void> {
  for (const theme of ['lavagna', 'trattato']) {
    await win.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await win.waitForTimeout(250)
    await win.screenshot({ path: `test-results/glass-${name}-${theme}.png` })
  }
  await win.evaluate(() => (document.documentElement.dataset.theme = 'lavagna'))
}

test('Liquid Glass on the controls, solid surfaces under the text, content scrolling under the bar', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_TEACHER: '1', SINAPSI_FAKE_NOTE: '1', SINAPSI_FAKE_EXTRACT: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await expect(win.locator('html')).toHaveAttribute('data-glass', 'on')

  // Home: mode selector and composer shell are glass, the field inside is solid.
  await expect(win.getByLabel('Cosa vuoi studiare?')).toBeVisible()
  await expectGlass(win, ['.composer .modes-pill', '.composer .shell'])
  await expectSolid(win, ['.composer .core'])
  // Before macOS answers (no data-glass) and with «Riduci trasparenza» the glass is a solid surface.
  for (const state of [null, 'solid']) {
    await win.evaluate((v) => (v ? (document.documentElement.dataset.glass = v) : delete document.documentElement.dataset.glass), state)
    await win.waitForTimeout(300) // the material's colour transition
    await expectSolid(win, ['.composer .modes-pill', '.composer .shell'])
  }
  await win.evaluate(() => (document.documentElement.dataset.glass = 'on'))
  await shoot(win, 'home')

  // Settings dialog: a glass outer shell, the form on a solid core.
  await win.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
  await win.waitForTimeout(300) // the dialog's entrance
  await expectGlass(win, ['.settings-dlg'])
  await expectSolid(win, ['.settings-dlg .sd-core'])
  await shoot(win, 'settings')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toHaveCount(0)

  // Nota viva: the island is glass.
  await win.getByText('Matematica', { exact: true }).click()
  await win.getByRole('button', { name: 'Teorema di Rolle' }).click()
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await expectGlass(win, ['.nota .island'])
  await shoot(win, 'nota')
  await win.getByRole('button', { name: '← Home' }).click()

  // Graph: the floating controls and the menu are glass.
  await expect
    .poll(async () => win.evaluate(async () => (await window.sinapsi.graph.get()).concepts.length), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await expect(win.locator('.graph .gzoom')).toBeVisible()
  await win.getByRole('button', { name: 'Vista del grafo' }).click()
  await expect(win.getByRole('heading', { name: 'Il tuo grafo' })).toBeVisible()
  await expectGlass(win, ['.graph .gmenu-btn', '.graph .gpanel', '.graph .gzoom'])
  await win.waitForTimeout(600)
  await shoot(win, 'graph')
  await win.keyboard.press('Escape')

  // Session: bar and answer shell are glass, the question inside and its options are solid,
  // and the conversation scrolls under the bar.
  await win.getByLabel('Cosa vuoi studiare?').fill('Teorema di Lagrange')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByLabel('La tua risposta').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByRole('button', { name: /^A:/ })).toBeVisible()
  await expectGlass(win, ['.sess .top', '.sess .shell'])
  await expectSolid(win, ['.sess .inner'])
  const opt = await looks(win, ['.opt'])
  expect(opt['.opt'].backdrop).toBe('none')
  // At rest, scrolled to the top, nothing is under the bar.
  await win.evaluate(() => document.querySelector('.sess .scroll')!.scrollTo({ top: 0 }))
  const [scrollTop, barTop, barBottom, firstTop] = await win.evaluate(() => [
    document.querySelector('.sess .scroll')!.getBoundingClientRect().top,
    document.querySelector('.sess .top')!.getBoundingClientRect().top,
    document.querySelector('.sess .top')!.getBoundingClientRect().bottom,
    document.querySelector('.sess .col > *')!.getBoundingClientRect().top
  ])
  expect(scrollTop).toBeLessThanOrEqual(barTop)
  expect(firstTop).toBeGreaterThanOrEqual(barBottom)
  await shoot(win, 'session')
  await app.close()
})
