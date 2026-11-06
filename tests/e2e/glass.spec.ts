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

/**
 * The library's material: each element is a @glass-sdk/liquid-glass surface, its outline drawn (the clip-path it writes
 * once it has measured the shape), and its scene has prepared the material maps of all its surfaces (data-glass-ready),
 * which its live content draws through the scene's SVG filter.
 */
async function expectGlass(win: Page, selectors: string[]): Promise<void> {
  for (const s of selectors)
    await expect
      .poll(
        () =>
          win.evaluate((sel) => {
            const el = document.querySelector<HTMLElement>(sel)
            if (!el) return `missing ${sel}`
            if (!el.classList.contains('lg-surface')) return 'not a library surface'
            if (!el.style.clipPath) return 'outline not drawn'
            const scene = el.closest('.lg-scene')
            if (scene?.getAttribute('data-glass-ready') !== 'true') return 'material not ready'
            const content = scene.querySelector<HTMLElement>('.lg-content')
            if (!content || !/url\(["']?#lg-/.test(content.style.filter)) return 'content not filtered by the scene'
            return 'glass'
          }, s),
        { message: `${s} is glass`, timeout: 10_000 }
      )
      .toBe('glass')
}

/** Text to read stays on a full surface: no backdrop, opaque background, not glass. */
async function expectSolid(win: Page, selectors: string[]): Promise<void> {
  const l = await looks(win, selectors)
  for (const s of selectors) {
    expect(l[s].backdrop, `${s} has no backdrop`).toBe('none')
    expect(l[s].alpha, `${s} is opaque`).toBe(1)
    expect(await win.locator(s).first().evaluate((el) => el.classList.contains('lg-surface')), `${s} is not glass`).toBe(false)
  }
}

/**
 * Never glass in glass: no surface inside another one, but the library's selection lenses (a tab indicator in its
 * own track, a slider's pressed lens), which play the part of the old lens. No backdrop inside a backdrop either
 * (the modal scrim, a dimming blur behind dialogs since before the glass, is not part of the control layer). And every
 * surface floats above its scene's live content, never inside it (the content would refract its own controls).
 */
async function expectNoNestedGlass(win: Page): Promise<void> {
  const nested = await win.evaluate(() => {
    const lens = (el: Element): boolean => el.matches('.lg-tab-indicator, .lg-control-lens')
    const glassy = (el: Element): boolean => !el.matches('.overlay-scrim') && getComputedStyle(el).backdropFilter !== 'none'
    const out: string[] = []
    for (const el of document.querySelectorAll('body *')) {
      const surface = el.classList.contains('lg-surface') && !lens(el)
      if (surface && el.parentElement?.closest('.lg-surface')) out.push(`${el.className} in ${el.parentElement.closest('.lg-surface')!.className}`)
      if (el.classList.contains('lg-surface')) {
        const scene = el.closest('.lg-scene')
        const content = scene && [...scene.querySelectorAll('.lg-content')].find((c) => c.closest('.lg-scene') === scene)
        if (content?.contains(el)) out.push(`${el.className} inside the content of its scene`)
      }
      if (!glassy(el)) continue
      for (let up = el.parentElement; up; up = up.parentElement)
        if (glassy(up)) {
          out.push(`${el.className} in ${up.className}`)
          break
        }
    }
    return out
  })
  expect(nested, 'glass inside glass').toEqual([])
}

/** The theme in the settings too: the Home applies the stored theme again whenever it reloads them. */
async function setTheme(win: Page, theme: string): Promise<void> {
  await win.evaluate(async (t) => {
    await window.sinapsi.settings.set({ theme: t as 'lavagna' | 'trattato' })
    document.documentElement.dataset.theme = t
  }, theme)
}

async function shoot(win: Page, name: string): Promise<void> {
  for (const theme of ['lavagna', 'trattato']) {
    await setTheme(win, theme)
    await win.waitForTimeout(250)
    await win.screenshot({ path: `test-results/glass-${name}-${theme}.png` })
  }
  await setTheme(win, 'lavagna')
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
    await win.waitForTimeout(300)
    const shell = await looks(win, ['.composer .shell'])
    expect(shell['.composer .shell'].alpha, 'the shell is a full surface').toBe(1)
    // A segmented track goes back to its faint pre-glass look, a filled track under a full-surface selection.
    const seg = await looks(win, ['.composer .modes-pill', '.composer .modes-pill .lg-tab-indicator'])
    expect(seg['.composer .modes-pill'].alpha, 'the track is filled').toBeGreaterThan(0)
    expect(seg['.composer .modes-pill .lg-tab-indicator'].alpha, 'the selection is a full surface').toBe(1)
  }
  await win.evaluate(() => (document.documentElement.dataset.glass = 'on'))
  await shoot(win, 'home')

  // Segmented controls: the library's tabs, a glass track and a glass selection that moves onto the chosen option.
  const lensGap = (group: string): Promise<number> =>
    win.evaluate((g) => {
      const track = document.querySelector(`[role="tablist"][aria-label="${g}"]`)!
      const l = track.querySelector('.lg-tab-indicator')!.getBoundingClientRect()
      const b = track.querySelector('[role="tab"][aria-selected="true"]')!.getBoundingClientRect()
      return Math.max(Math.abs(l.left - b.left), Math.abs(l.top - b.top), Math.abs(l.width - b.width), Math.abs(l.height - b.height))
    }, group)
  for (const [group, pick, back] of [
    ['Tipo di sessione', 'Pratica', 'Apprendimento'],
    ['Sessioni da mostrare', 'Pratica', 'Tutte']
  ] as const) {
    await expectGlass(win, [`[role="tablist"][aria-label="${group}"]`, `[role="tablist"][aria-label="${group}"] .lg-tab-indicator`])
    expect(await lensGap(group)).toBeLessThanOrEqual(1)
    await win.getByRole('tablist', { name: group }).getByRole('tab', { name: pick, exact: true }).click()
    await expect.poll(() => lensGap(group), { message: 'the selection slides onto the option' }).toBeLessThanOrEqual(1)
    await shoot(win, `seg-${pick === 'Pratica' && group === 'Tipo di sessione' ? 'modes' : 'left'}`)
    await win.getByRole('tablist', { name: group }).getByRole('tab', { name: back, exact: true }).click()
    await expect.poll(() => lensGap(group)).toBeLessThanOrEqual(1)
  }

  // Settings dialog: a glass outer shell, the form on a solid core.
  await win.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
  await win.waitForTimeout(300) // the dialog's entrance
  await expectGlass(win, ['.settings-dlg', '.settings-dlg [aria-label="Tema"] .lg-tab-indicator'])
  await expectSolid(win, ['.settings-dlg .sd-core'])
  await expectNoNestedGlass(win)
  await shoot(win, 'settings')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toHaveCount(0)

  // Nota viva: the island is glass.
  await win.getByText('Matematica', { exact: true }).click()
  await win.getByRole('button', { name: 'Teorema di Rolle' }).click()
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await expectGlass(win, ['.nota .island', '.nota .island .lg-tab-indicator'])
  await expectNoNestedGlass(win)
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
  await expectNoNestedGlass(win)
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
  // The conversation is the live content the bar and the dock refract.
  expect(await win.locator('.sess .scroll').evaluate((el) => el.classList.contains('lg-content'))).toBe(true)
  await expectNoNestedGlass(win)
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
