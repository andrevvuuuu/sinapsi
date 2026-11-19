import { _electron as electron, expect, test, type Locator } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startStudy } from './helpers'

test('a full learning session with the scripted tutor', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_TEACHER: '1', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await startStudy(win, 'Teorema di Lagrange')
  await expect(win.getByText('Dalla tua nota: Teorema di Lagrange')).toBeVisible()

  // goal (open)
  await win.getByLabel('Il tuo obiettivo').fill("passare l'esame")
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // probe (choice + confidence)
  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // plan
  await win.getByRole('button', { name: 'Approva il piano' }).click()
  await expect(win.getByRole('complementary', { name: 'Il piano' }).getByText('Pendenza della corda')).toBeVisible()
  // predict
  await win.getByLabel('La tua risposta').fill('il rapporto tra dislivello e distanza')
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  // check behind the invite
  await win.getByLabel('Pensieri mentre leggi').fill('come una velocità media')
  // The small microphone sits inside its one-line field, not over the box's padding.
  const fit = await win.evaluate(() => {
    const field = document.querySelector('#rtt')!.getBoundingClientRect()
    const mic = document.querySelector('.rt .mic')!.getBoundingClientRect()
    return { top: mic.top - field.top, bottom: field.bottom - mic.bottom }
  })
  expect(fit.top, 'mic top inside the field').toBeGreaterThanOrEqual(-0.5)
  expect(fit.bottom, 'mic bottom inside the field').toBeGreaterThanOrEqual(-0.5)
  await win.locator('.rt').screenshot({ path: 'test-results/session-thoughts.png' })
  await win.getByRole('button', { name: 'Verifica la tua comprensione' }).click()
  await win.getByRole('button', { name: /^A:/ }).click()
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByText('Corretto').last()).toBeVisible()
  // game: Coppie
  const coppie = win.getByRole('dialog', { name: 'Gioco · Coppie' })
  await coppie.getByRole('group', { name: 'Voci' }).getByRole('button', { name: 'Rolle' }).click()
  await coppie.getByRole('group', { name: 'Corrispondenti' }).getByRole('button', { name: 'derivata nulla in un punto' }).click()
  await coppie.getByRole('group', { name: 'Voci' }).getByRole('button', { name: 'Lagrange' }).click()
  await coppie.getByRole('group', { name: 'Corrispondenti' }).getByRole('button', { name: 'tangente parallela alla corda' }).click()
  await expect(coppie.getByText('2/2')).toBeVisible()
  await coppie.getByRole('button', { name: 'Continua' }).click()
  // game: Lampo
  const lampo = win.getByRole('dialog', { name: 'Gioco · Lampo' })
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
  await win.getByRole('tab', { name: 'Sicuro', exact: true }).click()
  await win.getByRole('button', { name: 'Invia risposta' }).click()
  await expect(win.getByText('Hai imparato')).toBeVisible()
  await win.screenshot({ path: 'test-results/session.png' })

  await win.getByRole('button', { name: 'Torna alla home' }).click()
  await expect(win.getByRole('region', { name: 'Attività recente' }).getByRole('button', { name: /Teorema di Lagrange/i })).toBeVisible()
  await app.close()
})

/**
 * The edges of a scroller that the library's scroll edges (GlassScrollEdges) blur now: each blurred edge is a ramp in the
 * SVG filter it puts on the scroller (a white flood along that edge), so its place says which edge it is.
 */
async function blurredEdges(scroller: Locator): Promise<string[]> {
  return scroller.evaluate((el) => {
    const id = (el as HTMLElement).style.filter.match(/url\(["']?#([^"')]+)/)?.[1]
    const filter = id ? document.getElementById(id) : null
    if (!filter) return []
    const h = el.clientHeight
    return [...filter.querySelectorAll('feFlood[result$="step"]')].map((f) => (Number(f.getAttribute('y')) < h / 2 ? 'top' : 'bottom')).sort()
  })
}

// Split layout (conversation left, question panel right): in a 720 px window a long question must keep its head and the
// send row in view, with only the options scrolling inside the panel.
test('long measure question in a 720px-high window', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, SINAPSI_FAKE_TEACHER: '1', SINAPSI_FAKE_TEACHER_SCRIPT: 'long-measure', SINAPSI_VAULT: resolve('tests/fixtures/vault'), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
  await expect.poll(() => win.evaluate(() => [window.innerWidth, window.innerHeight].join('×'))).toBe('1280×720')
  await startStudy(win, 'Principio del Buon Ordinamento')
  await win.getByLabel('Il tuo obiettivo').fill('Saper usare il principio del buon ordinamento nelle dimostrazioni per assurdo, e capire quando conviene rispetto all’induzione.')
  await win.getByRole('button', { name: 'Invia risposta' }).click()

  const send = win.getByRole('button', { name: 'Invia risposta' })
  await expect(win.getByRole('button', { name: /^D:/ })).toBeAttached()
  await expect(send).toBeInViewport({ ratio: 1 })
  await expect(win.locator('.dock .q-head')).toBeInViewport({ ratio: 0.99 }) // subpixel layout
  await win.waitForTimeout(800) // the smooth scroll to the tutor message
  const dock = (await win.locator('.dock').boundingBox())!
  expect(dock.y + dock.height, 'the panel ends inside the window').toBeLessThanOrEqual(720)
  // The tutor message that leads to the question starts in view, below the bar.
  const tutor = win.locator('.sess .msg').filter({ hasText: 'Buon Ordinamento' }).last()
  const barBottom = (await win.locator('.sess .top').boundingBox())!.y + (await win.locator('.sess .top').boundingBox())!.height
  expect((await tutor.boundingBox())!.y).toBeGreaterThanOrEqual(barBottom - 1)
  // The options area inside the dock says there is more below, and only there (the library's scroll edge).
  const middle = win.locator('.dock .dock-scroll')
  await expect.poll(() => blurredEdges(middle)).toEqual(['bottom'])
  await win.screenshot({ path: 'test-results/session-measure-long.png' })
  // The keyboard reaches a hidden option: focus scrolls it into view inside the dock.
  await win.getByRole('button', { name: /^D:/ }).focus()
  await win.keyboard.press('Tab')
  const idk = win.getByRole('button', { name: 'Non lo so' })
  await expect(idk).toBeFocused()
  const [area, idkBox] = [(await middle.boundingBox())!, (await idk.boundingBox())!]
  expect(idkBox.y).toBeGreaterThanOrEqual(area.y)
  expect(idkBox.y + idkBox.height).toBeLessThanOrEqual(area.y + area.height)
  await middle.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect.poll(() => blurredEdges(middle)).toEqual(['top'])
  await middle.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect.poll(() => blurredEdges(middle)).toEqual(['bottom'])
  // Scrolled to the end, the last tutor message stays in the conversation column, left of the panel.
  await win.evaluate(() => {
    const el = document.querySelector('.sess .scroll')!
    el.scrollTo({ top: el.scrollHeight })
  })
  await win.waitForTimeout(200)
  const t = (await tutor.boundingBox())!
  expect(t.x + t.width).toBeLessThanOrEqual(dock.x)
  expect(t.y + t.height).toBeLessThanOrEqual(720)
  await win.screenshot({ path: 'test-results/session-measure-long-end.png' })
  await app.close()
})
