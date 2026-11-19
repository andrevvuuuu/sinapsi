import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, makeNotaViva, openVaultNote, startStudy } from './helpers'

/**
 * Every view in both themes: a screenshot in test-results/screens/<vista>-<tema>.png, and two checks on what is
 * on screen. Every visible button outside the dense bars is at least 44×44; no visible text is under 11 px.
 */

const THEMES = ['lavagna', 'trattato'] as const

/**
 * Dense bars keep their 36/28 px controls (--ctl-sm / --hit-min): their buttons are left out of the 44×44 check.
 * - `.nota .island button`: the nota viva island bar, the floating glass bar of the note.
 * - `.graph .gzoom button`, `.graph .gpanel button`, `.gnotch-dock button`: the graph's floating controls (zoom, menu panel, notch dock).
 * - `.mic.mic-sm`: the in-field microphone of size sm, inside short fields.
 * - `.tree .leaf`: the note rows of the side tree, dense macOS sidebar rows (36 px).
 */
const DENSE = ['.nota .island button', '.graph .gzoom button', '.mic.mic-sm', '.graph .gpanel button', '.gnotch-dock button', '.tree .leaf']

type Finding = string

/** The buttons under 44×44 and the text under 11 px on screen now, described so a reader finds them. */
async function audit(win: Page): Promise<Finding[]> {
  return win.evaluate((dense) => {
    const out: string[] = []
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      // Visually hidden helpers (.sr): a 1 px clipped box.
      if (r.width <= 1 && r.height <= 1) return false
      const cs = getComputedStyle(el)
      return (
        cs.visibility !== 'hidden' &&
        cs.display !== 'none' &&
        Number(cs.opacity) > 0 &&
        !el.closest('[aria-hidden="true"],[hidden],.sr,.gnotch-hidden-lens')
      )
    }
    const name = (el: Element): string => {
      const label = el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()
      return label.replace(/\s+/g, ' ').slice(0, 40)
    }
    const where = (el: Element): string => {
      const cls = (e: Element): string => (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).join('.') : '')
      const parent = el.parentElement
      return `${parent ? parent.tagName.toLowerCase() + cls(parent) + ' > ' : ''}${el.tagName.toLowerCase()}${cls(el)}`
    }
    for (const b of document.querySelectorAll('button')) {
      if (!shown(b) || dense.some((s) => b.matches(s))) continue
      const r = b.getBoundingClientRect()
      // Half a pixel of rounding (fractional layouts).
      if (r.width < 43.5 || r.height < 43.5) out.push(`button «${name(b)}» ${Math.round(r.width)}×${Math.round(r.height)} (${where(b)})`)
    }
    const seen = new Set<Element>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || seen.has(el) || !(n.textContent ?? '').trim()) continue
      seen.add(el)
      // KaTeX sets its own sub- and superscript sizes relative to the line; graph ring micro-badges are compact data viz.
      if (el.closest('.katex, script, style, title, .gnotch-ring-btn, .gnotch-mini-badge') || !shown(el)) continue
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < 11) out.push(`text «${name(el)}» ${size}px (${where(el)})`)
    }
    return [...new Set(out)]
  }, DENSE)
}

/** The theme in the settings too: the Home applies the stored theme again whenever it reloads them. */
async function setTheme(win: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await win.evaluate(async (t) => {
    await window.sinapsi.settings.set({ theme: t })
    document.documentElement.dataset.theme = t
  }, theme)
}

/** Shoots the view in both themes and checks it: no button under 44×44 outside DENSE, no text under 11 px. */
async function screen(win: Page, vista: string): Promise<void> {
  const found = new Set<Finding>()
  for (const theme of THEMES) {
    await setTheme(win, theme)
    await win.waitForTimeout(300) // the material's colour transition
    await win.screenshot({ path: `test-results/screens/${vista}-${theme}.png` })
    for (const f of await audit(win)) found.add(f)
  }
  // Soft: every view of the test is shot and checked even when an earlier one fails.
  expect.soft([...found], `${vista}: buttons under 44×44 or text under 11 px`).toEqual([])
}

async function launch(extra: Record<string, string> = {}): Promise<{ app: ElectronApplication; win: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      SINAPSI_FAKE_TEACHER: '1',
      SINAPSI_FAKE_NOTE: '1',
      SINAPSI_FAKE_EXTRACT: '1',
      SINAPSI_FAKE_REVIEW: '1',
      SINAPSI_FAKE_PRACTICE: '1',
      SINAPSI_FAKE_MEDIA: '1',
      SINAPSI_VAULT: resolve('tests/fixtures/vault'),
      SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')),
      ...extra
    }
  })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  await expect(win.getByLabel('Cosa vuoi studiare?')).toBeVisible()
  return { app, win }
}

test('home, settings, nota viva, graph', async () => {
  const { app, win } = await launch()
  await screen(win, 'home')

  await win.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
  await win.waitForTimeout(300) // the dialog's entrance
  await screen(win, 'impostazioni')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toHaveCount(0)

  await openVaultNote(win, 'Teorema di Rolle')
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await screen(win, 'nota')
  await win.getByRole('button', { name: '← Home' }).click()

  await goTo(win, 'Grafo')
  await expect(win.locator('.graph .gzoom')).toBeVisible()
  await win.waitForTimeout(600) // the layout settles
  await screen(win, 'grafo')

  // The detail card of a concept, reached from the menu's search.
  await win.getByRole('button', { name: 'Vista del grafo' }).click()
  await win.getByRole('combobox', { name: 'Cerca nel grafo' }).fill('Teorema di Rolle')
  await win.getByRole('option', { name: /Teorema di Rolle.*concetto/ }).click()
  await expect(win.getByRole('dialog', { name: 'Dettagli' })).toBeVisible()
  await win.waitForTimeout(300)
  await screen(win, 'grafo-scheda')
  await app.close()
})

test('session: Misura, then with the plan', async () => {
  const { app, win } = await launch()
  await startStudy(win, 'Teorema di Lagrange')
  await win.getByLabel('Il tuo obiettivo').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByRole('button', { name: /^A:/ })).toBeVisible()
  await win.waitForTimeout(600) // smooth transition to question
  await screen(win, 'sessione-misura')

  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await win.getByRole('button', { name: 'Approva il piano' }).click()
  await expect(win.getByRole('complementary', { name: 'Il piano' }).getByText('Pendenza della corda')).toBeVisible()
  await win.waitForTimeout(600)
  await screen(win, 'sessione-piano')
  await app.close()
})

test('review: setup, exercise, verdict, summary', async () => {
  const { app, win } = await launch()
  await makeNotaViva(win, 'Teorema di Rolle')
  await goTo(win, 'Oggi')
  await win.getByRole('radiogroup', { name: 'Modalità di studio' }).getByRole('button', { name: 'Ripassa' }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('rolle')
  await win.getByRole('button', { name: 'Inizia studio' }).click()
  // Setup: the concepts to review and the exercise-type selector.
  await expect(win.getByRole('heading', { name: /concetti da fissare/ })).toBeVisible()
  await expect(win.getByRole('group', { name: 'Esercizi' })).toBeVisible()
  await screen(win, 'ripasso-setup')

  // An exercise ready to answer: nothing picked yet, «Verifica» disabled.
  await win.getByRole('button', { name: 'Inizia ripasso' }).click()
  await expect(win.getByRole('button', { name: /La continuità/ })).toBeVisible()
  await expect(win.getByRole('button', { name: 'Verifica' })).toBeDisabled()
  await win.waitForTimeout(500) // the card's entrance
  await screen(win, 'ripasso-esercizio')

  // The verdict with the grade buttons.
  await win.getByRole('button', { name: /La continuità/ }).click()
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Verifica' }).click()
  await expect(win.getByRole('group', { name: 'Quanto ti è costato ricordarlo?' })).toBeVisible()
  await screen(win, 'ripasso-verdetto')

  // The summary: «Di nuovo» on the first item, so its callout and «Rifai subito gli errori» show too.
  await win.getByRole('button', { name: /Di nuovo/ }).click()
  for (let k = 0; k < 3; k++) {
    if (k > 0) {
      await win.getByRole('button', { name: /La continuità/ }).click()
      await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
      await win.getByRole('button', { name: 'Verifica' }).click()
    }
    await win.getByRole('button', { name: k === 2 ? 'Vedi riepilogo' : 'Prossima' }).click()
  }
  await expect(win.getByRole('heading', { name: /nitido/ })).toBeVisible()
  await expect(win.getByRole('button', { name: 'Rifai subito gli errori' })).toBeVisible()
  await screen(win, 'ripasso-riepilogo')
  await app.close()
})

test('practice: training and exam', async () => {
  const { app, win } = await launch()
  await makeNotaViva(win, 'Teorema di Rolle')
  await goTo(win, 'Oggi')
  await win.getByRole('radiogroup', { name: 'Modalità di studio' }).getByRole('button', { name: 'Esercitati' }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('rolle')
  await win.getByRole('button', { name: 'Inizia studio' }).click()
  // The setup, in exam mode: material, the two modes, the duration and the place.
  await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
  await screen(win, 'pratica-setup')
  // The long placeholder of the free topic stays on its one line: nothing wraps into a clipped second line.
  const free = win.getByLabel('Argomento libero')
  expect(await free.evaluate((t) => t.scrollHeight - t.clientHeight), 'free topic: placeholder clipped').toBeLessThanOrEqual(0)
  // The material dialog, whole inside the window at 1280×820 and 1280×720.
  await win.getByRole('button', { name: 'Scegli…' }).click()
  await expect(win.getByRole('dialog', { name: 'Scegli il materiale' })).toBeVisible()
  await win.waitForTimeout(300)
  for (const h of [820, 720]) {
    await app.evaluate(({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0].setContentSize(1280, h), h)
    await expect.poll(() => win.evaluate(() => window.innerHeight)).toBe(h)
    const r = await win.getByRole('dialog', { name: 'Scegli il materiale' }).boundingBox()
    expect(r!.y, `material dialog at ${h}: top inside the window`).toBeGreaterThanOrEqual(0)
    expect(r!.y + r!.height, `material dialog at ${h}: bottom inside the window`).toBeLessThanOrEqual(h)
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 820))
  await expect.poll(() => win.evaluate(() => window.innerHeight)).toBe(820)
  await screen(win, 'pratica-materiale')
  await win.getByRole('button', { name: 'Chiudi' }).click()
  await win.getByRole('radio', { name: /Allenamento/ }).click()
  await win.getByRole('button', { name: 'Inizia allenamento' }).click()
  const dock = win.getByRole('region', { name: 'Problema' })
  await expect(dock.getByText(/Mostra che per ogni/)).toBeVisible()
  await screen(win, 'pratica-allenamento')
  // «Foto del foglio» from the glass dock: its overlay covers the whole window, not just the dock.
  await dock.getByRole('button', { name: 'Foto del foglio' }).click()
  await expect(win.getByRole('dialog', { name: 'Foto del foglio' })).toBeVisible()
  const overlay = await win.locator('.pr-overlay').boundingBox()
  expect([overlay!.x, overlay!.y, overlay!.width, overlay!.height]).toEqual([0, 0, 1280, 820])
  await screen(win, 'pratica-foto')
  // At 1280×720 the photo dialog's actions are on screen at rest, below the (capped) camera preview.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
  await expect.poll(() => win.evaluate(() => window.innerHeight)).toBe(720)
  const scatta = win.getByRole('button', { name: 'Scatta' })
  const actions = (await scatta.count()) > 0
    ? [win.locator('.pr-photo label.pr-file'), scatta]
    : [win.locator('.pr-photo label.pr-file')]
  for (const action of actions) {
    const r = (await action.boundingBox())!
    expect(r.y, 'photo dialog at 720: action top on screen').toBeGreaterThanOrEqual(0)
    expect(r.y + r.height, 'photo dialog at 720: action bottom on screen').toBeLessThanOrEqual(720)
    const hit = await win.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.pr-file, button')?.textContent?.trim(), [r.x + r.width / 2, r.y + r.height / 2])
    expect(hit, 'photo dialog at 720: action not covered').toBeTruthy()
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 820))
  await expect.poll(() => win.evaluate(() => window.innerHeight)).toBe(820)
  await win.getByRole('button', { name: 'Chiudi' }).click()
  await win.getByRole('button', { name: '← Home' }).click()

  await goTo(win, 'Oggi')
  await win.getByRole('radiogroup', { name: 'Modalità di studio' }).getByRole('button', { name: 'Esercitati' }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('limiti notevoli')
  await win.getByRole('button', { name: 'Inizia studio' }).click()
  await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
  await win.getByRole('tab', { name: '30 min' }).click()
  await win.getByRole('button', { name: 'Inizia simulazione · 30 min' }).click()
  await expect(win.getByRole('timer')).toBeVisible()
  await screen(win, 'pratica-esame')
  // The photo dialog from an exercise of the exam: the same portal, the overlay covers the window.
  await win.getByRole('region', { name: 'Esercizio 1' }).getByRole('button', { name: 'Foto del foglio' }).click()
  await expect(win.getByRole('dialog', { name: 'Foto del foglio' })).toBeVisible()
  const examOverlay = await win.locator('.pr-overlay').boundingBox()
  expect([examOverlay!.x, examOverlay!.y, examOverlay!.width, examOverlay!.height]).toEqual([0, 0, 1280, 820])
  await screen(win, 'pratica-esame-foto')
  await win.getByRole('button', { name: 'Chiudi' }).click()
  await app.close()
})
