import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * The nota viva of the user's Lagrange note (tests/fixtures/nota-lagrange.json, copied as written by Gemini):
 * plain-text formulas in titles, readouts and recap ideas, cloze blanks inside unclosed $…$, a Mermaid
 * flowchart in §5. Every formula on screen must be typeset, in both themes.
 */
const THEMES = ['lavagna', 'trattato'] as const
const RAW = /\$|\\frac|\\text|_\{|y_sec/

async function setTheme(win: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await win.evaluate(async (t) => {
    await window.sinapsi.settings.set({ theme: t })
    document.documentElement.dataset.theme = t
  }, theme)
}

/** The lines of visible text in the nota that still show raw math. */
const rawLines = (win: Page): Promise<string[]> =>
  win
    .locator('.nota main')
    .innerText()
    .then((t) => t.split('\n').filter((l) => RAW.test(l)))

test('every formula of the Lagrange nota viva is typeset, and §5 is a real diagram', async () => {
  const data = mkdtempSync(join(tmpdir(), 'sinapsi-e2e-'))
  mkdirSync(join(data, 'notes'))
  copyFileSync(resolve('tests/fixtures/nota-lagrange.json'), join(data, 'notes', '4d1fc3dc-5cb0-4ce5-b2f4-438fd14a32dd.json'))
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_NOTE: '1', SINAPSI_FAKE_EXTRACT: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: data }
  })
  const win = await app.firstWindow()
  const errors: string[] = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.getByRole('region', { name: 'Note vive' }).getByRole('button', { name: /Teorema di Lagrange/ }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Lagrange/ })).toBeVisible()

  // §5: the flowchart is drawn as an SVG, named after its section.
  const diagram = win.locator('#s5 .nv-mmd')
  await diagram.scrollIntoViewIfNeeded()
  await expect(diagram.locator('svg')).toBeVisible({ timeout: 20_000 })
  await expect(win.getByRole('img', { name: 'Diagramma: Architettura Logico-Deduttiva della Dimostrazione' })).toBeVisible()
  await expect(win.locator('#s5 pre')).toHaveCount(0)
  await expect(diagram).toContainText('Costruzione funzione ausiliaria di scarto')
  expect(await diagram.locator('svg').evaluate((s) => s.getBoundingClientRect().width)).toBeLessThanOrEqual(await diagram.evaluate((d) => d.clientWidth))

  // The guided exercise: one choice open, its options typeset.
  const guided = win.locator('.nv-ex.completa')
  await guided.scrollIntoViewIfNeeded()
  await guided.getByRole('combobox', { name: 'Scegli' }).nth(3).click()
  await expect(guided.getByRole('option')).toHaveCount(3)
  await expect(guided.getByRole('option').first().locator('.katex')).toBeVisible()

  const idee = win.locator('.after .bezel').filter({ has: win.getByRole('heading', { name: 'Le idee' }) })
  const svgNow = (): Promise<string> => diagram.locator('svg').evaluate((s) => s.querySelector('style')?.textContent ?? '')
  let before = ''
  for (const theme of THEMES) {
    const was = await win.evaluate(() => document.documentElement.dataset.theme)
    await setTheme(win, theme)
    // The diagram is drawn again in the theme's colours.
    if (was !== theme) await expect.poll(svgNow).not.toBe(before)
    before = await svgNow()
    await win.waitForTimeout(300)
    await idee.scrollIntoViewIfNeeded()
    await idee.screenshot({ path: `test-results/formule-idee-${theme}.png` })
    await guided.scrollIntoViewIfNeeded()
    await guided.screenshot({ path: `test-results/formule-esercizio-${theme}.png` })
    // The floating island would sit over a diagram taller than the window: hidden for this shot only.
    const hide = await win.addStyleTag({ content: '.nota .island{visibility:hidden}' })
    await diagram.screenshot({ path: `test-results/formule-diagramma-${theme}.png` })
    await hide.evaluate((el) => el.remove())
    expect(await rawLines(win), `raw math on screen in ${theme}`).toEqual([])
  }

  // The readouts and titles that carried plain-text math.
  await expect(idee.locator('.katex').first()).toBeVisible()
  await expect(win.locator('.fig .readout .katex').first()).toBeAttached()
  await expect(guided.locator('.h .katex').first()).toBeVisible()
  expect(errors).toEqual([])
  await app.close()
})
