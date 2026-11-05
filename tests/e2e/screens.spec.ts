import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { makeNotaViva } from './helpers'

/**
 * Every view in both themes: a screenshot in test-results/screens/<vista>-<tema>.png, and two checks on what is
 * on screen. Every visible button outside the dense bars is at least 44×44; no visible text is under 11 px.
 */

const THEMES = ['lavagna', 'trattato'] as const

/**
 * Dense bars keep their 36/28 px controls (--ctl-sm / --hit-min): their buttons are left out of the 44×44 check.
 * - `.nota .island button`: the nota viva island bar, the floating glass bar of the note.
 * - `.graph .gzoom button`: the graph's zoom controls, floating on the canvas.
 * - `.mic.mic-sm`: the in-field microphone of size sm, inside short fields.
 * - `.graph .gpanel button`: the graph menu panel (lens selector, «Disposizione e strati»), graph controls too.
 */
const DENSE = ['.nota .island button', '.graph .gzoom button', '.mic.mic-sm', '.graph .gpanel button']

/**
 * Known failures that later areas of Task 8 fix (8b Home/left panel/settings, 8c session and games, 8d review,
 * 8e practice and exam, 8f nota viva, figures, graph, notebook). Each entry is `<vista>: <finding>` exactly as
 * the check reports it; the area that fixes the finding removes its entries. A listed finding that no longer
 * occurs fails the test too, so the list never goes stale.
 */
const KNOWN: Record<string, string[]> = {
  // 8c: the plan's stage labels.
  'sessione-piano': ['text «già tuo» 10px (div > small)', 'text «adesso» 10px (div > small)', 'text «obiettivo» 10px (div > small)'],
  // 8f: the notebook's source bar, source rows and starter questions.
  notebook: [
    'button «File…» 56×36 (div.nb-add > button)',
    'button «YouTube» 77×36 (div.nb-add > button)',
    'button «Nota del vault» 111×36 (div.nb-add > button)',
    'button «VaultTeorema di Rolle» 253×19 (div.nb-src-main > button.nb-src-title)',
    'button «Aggiorna Teorema di Rolle» 80×36 (div.nb-src-act > button)',
    'button «Rimuovi Teorema di Rolle» 36×36 (div.nb-src-act > button.x)',
    'button «Riassumi le fonti selezionate» 204×36 (div.nb-starters > button)',
    'button «Quali sono i concetti chiave?» 202×36 (div.nb-starters > button)',
    'button «Che domande d’esame potrebbero uscire?» 286×36 (div.nb-starters > button)',
    'text «Vault» 10px (button.nb-src-title > span.nb-kind)'
  ]
}

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
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0 && !el.closest('[aria-hidden="true"],[hidden],.sr')
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
      // KaTeX sets its own sub- and superscript sizes relative to the line: typeset maths, not interface text.
      if (el.closest('.katex, script, style, title') || !shown(el)) continue
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

/** Shoots the view in both themes, then checks it against the known failures of `vista`. */
async function screen(win: Page, vista: string): Promise<void> {
  const found = new Set<Finding>()
  for (const theme of THEMES) {
    await setTheme(win, theme)
    await win.waitForTimeout(300) // the material's colour transition
    await win.screenshot({ path: `test-results/screens/${vista}-${theme}.png` })
    for (const f of await audit(win)) found.add(f)
  }
  const known = new Set(KNOWN[vista] ?? [])
  const fresh = [...found].filter((f) => !known.has(f))
  const fixed = [...known].filter((f) => !found.has(f))
  // Soft: every view of the test is shot and checked even when an earlier one fails.
  expect.soft(fresh, `${vista}: new buttons under 44×44 or text under 11 px`).toEqual([])
  expect.soft(fixed, `${vista}: known failures that no longer occur, remove them from KNOWN`).toEqual([])
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
      SINAPSI_FAKE_NOTEBOOK: '1',
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

  await win.getByText('Matematica', { exact: true }).click()
  await win.getByRole('button', { name: 'Teorema di Rolle' }).click()
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1, name: /Teorema di Rolle/ })).toBeVisible()
  await screen(win, 'nota')
  await win.getByRole('button', { name: '← Home' }).click()

  await expect
    .poll(async () => win.evaluate(async () => (await window.sinapsi.graph.get()).concepts.length), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await win.getByRole('button', { name: 'Vista del grafo' }).click()
  await expect(win.locator('.graph .gzoom')).toBeVisible()
  await win.waitForTimeout(600) // the layout settles
  await screen(win, 'grafo')
  await app.close()
})

test('session: Misura, then with the plan', async () => {
  const { app, win } = await launch()
  await win.getByLabel('Cosa vuoi studiare?').fill('Teorema di Lagrange')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByLabel('La tua risposta').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByRole('button', { name: /^A:/ })).toBeVisible()
  await win.waitForTimeout(600) // the smooth scroll to the question
  await screen(win, 'sessione-misura')

  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByLabel('Fiducia').fill('90')
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await win.getByRole('button', { name: 'Approva il piano' }).click()
  await expect(win.getByRole('complementary', { name: 'Il piano' }).getByText('Pendenza della corda')).toBeVisible()
  await win.waitForTimeout(600)
  await screen(win, 'sessione-piano')
  await app.close()
})

test('review', async () => {
  const { app, win } = await launch()
  await makeNotaViva(win, 'Teorema di Rolle')
  await win.getByRole('group', { name: 'Tipo di sessione' }).getByRole('button', { name: /^Ripasso/ }).click()
  await win.getByRole('button', { name: 'Inizia' }).click()
  await expect(win.getByRole('heading', { name: /concetti da fissare/ })).toBeVisible()
  await win.getByRole('button', { name: 'Inizia ripasso' }).click()
  await expect(win.getByRole('button', { name: /La continuità/ })).toBeVisible()
  await screen(win, 'ripasso')
  await app.close()
})

test('practice: training and exam', async () => {
  const { app, win } = await launch()
  await makeNotaViva(win, 'Teorema di Rolle')
  await win.getByRole('group', { name: 'Tipo di sessione' }).getByRole('button', { name: 'Pratica', exact: true }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('rolle')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByRole('button', { name: 'Inizia allenamento' }).click()
  await expect(win.getByRole('region', { name: 'Problema' }).getByText(/Mostra che per ogni/)).toBeVisible()
  await screen(win, 'pratica-allenamento')
  await win.getByRole('button', { name: '← Home' }).click()

  await win.getByRole('group', { name: 'Tipo di sessione' }).getByRole('button', { name: 'Pratica', exact: true }).click()
  await win.getByLabel('Cosa vuoi studiare?').fill('limiti notevoli')
  await win.getByRole('button', { name: 'Inizia' }).click()
  await win.getByRole('radio', { name: /Simulazione d'esame/ }).click()
  await win.getByRole('button', { name: '30 min' }).click()
  await win.getByRole('button', { name: 'Inizia simulazione · 30 min' }).click()
  await expect(win.getByRole('timer')).toBeVisible()
  await screen(win, 'pratica-esame')
  await app.close()
})

test('notebook', async () => {
  const { app, win } = await launch()
  const panel = win.getByRole('complementary', { name: 'Notebook' })
  await panel.getByRole('button', { name: 'Nuovo notebook' }).click()
  await panel.getByLabel('Nome del notebook').fill('Analisi 1')
  await panel.getByRole('button', { name: 'Crea' }).click()
  await expect(win.getByLabel('Nome del notebook')).toHaveValue('Analisi 1')
  await win.getByRole('button', { name: 'Nota del vault' }).click()
  await win.getByLabel('Cerca una nota').fill('Rolle')
  await win.getByRole('button', { name: 'Teorema di Rolle', exact: true }).click()
  await expect(win.getByRole('list', { name: 'Fonti' }).getByText('Teorema di Rolle')).toBeVisible()
  await screen(win, 'notebook')
  await app.close()
})
