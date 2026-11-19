import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, openVaultNote, startStudy } from './helpers'

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
    // The library's tab indicator inside its own glass track, and a slider's pressed lens: nothing else.
    const lens = (el: Element): boolean =>
      (el.matches('.lg-tab-indicator') && !!el.parentElement?.closest('.lg-surface')?.matches('.lg-tabs-list')) || el.matches('.lg-control-lens')
    const scrim = (el: Element): boolean => el.matches('.overlay, .overlay-scrim, .gv, .dlg-drop')
    const isSettingsCard = (el: Element): boolean => !!el.closest('.settings-dlg .sd-core')
    const glassy = (el: Element): boolean => !scrim(el) && !isSettingsCard(el) && getComputedStyle(el).backdropFilter !== 'none'
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

/** A selection drawn as a full lens (a segmented control on glass or on a solid core): visible, opaque, not a glass surface. */
async function expectLens(win: Page, selector: string): Promise<void> {
  const lens = win.locator(selector)
  await expect(lens).toBeVisible()
  expect(await lens.evaluate((el) => el.classList.contains('lg-surface')), `${selector} is not glass`).toBe(false)
  expect((await looks(win, [selector]))[selector].alpha, `${selector} is a full lens`).toBe(1)
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

  // Settings dialog: a glass outer shell, the form on a solid core.
  await win.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
  await win.waitForTimeout(300) // the dialog's entrance
  await expectGlass(win, ['.settings-dlg'])
  await expectSolid(win, ['.settings-dlg .sd-core'])
  // On the solid core Correttore's selection is a full lens
  await expectLens(win, '.settings-dlg [aria-label="Correttore"] .lg-tab-indicator')
  await expectNoNestedGlass(win)
  await shoot(win, 'settings')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toHaveCount(0)

  // Nota viva: open note and create nota viva; the island is glass, mode selector lens inside.
  await openVaultNote(win, 'Teorema di Rolle')
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await expectGlass(win, ['.nota .island'])
  await expectLens(win, '.nota .island .lg-tab-indicator')
  await expectNoNestedGlass(win)
  await shoot(win, 'nota')
  await win.getByRole('button', { name: '← Home' }).click()

  // Graph: zoom controls are glass when a live note exists.
  await goTo(win, 'Grafo')
  await expect(win.locator('.graph .gzoom')).toBeVisible()
  await expectGlass(win, ['.graph .gzoom'])
  await expectNoNestedGlass(win)
  await shoot(win, 'graph')

  // Session: bar is glass, conversation scrolls under the bar.
  await startStudy(win, 'Teorema di Lagrange')
  await win.getByLabel('Il tuo obiettivo').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByRole('button', { name: /^A:/ })).toBeVisible()
  await expectGlass(win, ['.sess .top'])
  // Select confidence to reveal tab indicator lens
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  // Fiducia segmented tab indicator is a lens
  await expectLens(win, '.sess .conf .lg-tab-indicator')
  // The conversation is the live content the bar refracts.
  expect(await win.locator('.sess .scroll').evaluate((el) => el.classList.contains('lg-content'))).toBe(true)
  await expectNoNestedGlass(win)
  await shoot(win, 'session')
  await app.close()
})
