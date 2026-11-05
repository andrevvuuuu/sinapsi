import { _electron as electron, expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
  await win.getByRole('button', { name: 'Impostazioni', exact: true }).click()
  await win.getByRole('dialog', { name: 'Impostazioni' }).getByRole('button', { name: 'Trattato' }).click()
  await expect(win.locator('html')).toHaveAttribute('data-theme', 'trattato')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Impostazioni' })).toHaveCount(0)
  await win.screenshot({ path: 'test-results/home.png' })
  await app.close()
})

/** A vault of three courses whose first steps have long titles: three suggestion chips. */
function longTitleVault(): string {
  const root = mkdtempSync(join(tmpdir(), 'sinapsi-vault-'))
  const courses = [
    ['Logica', 'Principio del Buon Ordinamento dei Naturali'],
    ['Analisi 1', 'Assioma di Completezza dei Numeri Reali'],
    ['Algebra Lineare', 'Principio di Induzione Matematica Forte']
  ]
  for (const [course, note] of courses) {
    mkdirSync(join(root, course))
    writeFileSync(join(root, course, `${course} MOC.md`), `# ${course}\n\n- [[${note}]]\n`)
    writeFileSync(join(root, course, `${note}.md`), `# ${note}\n\nTesto.\n`)
  }
  return root
}

/** Layout and contrast of the Home composer, measured in the page (WCAG ratios over the solid core). */
function measureComposer() {
  const rgba = (s: string): number[] => {
    const n = (s.match(/[\d.]+/g) ?? []).map(Number)
    // rgb(r g b / a) in 0–255, or color(srgb r g b / a) in 0–1
    const v = s.startsWith('color(') ? n.slice(0, 3).map((x) => x * 255) : n.slice(0, 3)
    return [...v, n.length > 3 ? n[3] : 1]
  }
  const over = (top: number[], under: number[]): number[] => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
  const lum = (c: number[]): number => {
    const [r, g, b] = c.slice(0, 3).map((x) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: number[], b: number[]): number => {
    const [x, y] = [lum(a), lum(b)]
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
  }
  const core = rgba(getComputedStyle(document.querySelector('.composer .core')!).backgroundColor)
  const chipEls = [...document.querySelectorAll<HTMLElement>('.composer .sg-chip')]
  const labels = chipEls.map((c) => c.querySelector<HTMLElement>('.sg-label')!)
  const ta = document.querySelector('.composer textarea')!
  const send = document.querySelector<HTMLButtonElement>('.composer .send')!
  const s = getComputedStyle(send)
  const sendFill = over(rgba(s.backgroundColor), core)
  return {
    tops: chipEls.map((c) => c.offsetTop),
    lines: labels.map((l) => Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight))),
    clipped: labels.map((l) => l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1),
    // The reason line over its chip's tint (the chips step aside while he types).
    why: chipEls.map((c) => ratio(rgba(getComputedStyle(c.querySelector('.sg-why')!).color), over(rgba(getComputedStyle(c).backgroundColor), core))),
    placeholder: ratio(rgba(getComputedStyle(ta, '::placeholder').color), core),
    disabled: send.disabled,
    opacity: Number(s.opacity),
    edge: Math.max(ratio(over(rgba(s.borderTopColor), core), core), ratio(sendFill, core)),
    icon: ratio(rgba(s.color), sendFill),
    fill: s.backgroundColor,
    // The keyboard focus ring: drawn, off the circle (the surface shows between fill and ring), ≥ 3:1 on the core.
    focused: send.matches(':focus-visible'),
    ring: { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset), contrast: ratio(over(rgba(s.outlineColor), core), core) }
  }
}

/** True once the send button's `prop` has reached the colour `token` resolves to (its colour transition is over). */
function sendSettled({ prop, token }: { prop: 'color' | 'backgroundColor'; token: string }): boolean {
  const send = document.querySelector<HTMLButtonElement>('.composer .send')!
  const probe = document.createElement('i')
  probe.style.color = `var(${token})`
  send.parentElement!.append(probe)
  const want = getComputedStyle(probe).color
  probe.remove()
  return getComputedStyle(send)[prop] === want
}

test('home composer: full suggestion titles on one row, legible secondary text and send states', async () => {
  const app = await electron.launch({
    ...(process.env.SINAPSI_APP_PATH ? { executablePath: process.env.SINAPSI_APP_PATH, args: [] } : { args: ['.'] }),
    env: { ...process.env, SINAPSI_VAULT: longTitleVault(), SINAPSI_DATA: mkdtempSync(join(tmpdir(), 'sinapsi-e2e-')) }
  })
  const win = await app.firstWindow()
  const chips = win.locator('.composer .sg-chip')
  await expect(chips).toHaveCount(3)
  const field = win.getByLabel('Cosa vuoi studiare?')
  const rectBefore = await win.locator('.composer').evaluate((el) => el.getBoundingClientRect())

  for (const theme of ['lavagna', 'trattato']) {
    await win.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await expect.poll(() => win.evaluate(sendSettled, { prop: 'color', token: '--btn-disabled-ink' })).toBe(true)
    const m = await win.evaluate(measureComposer)
    expect(new Set(m.tops).size, `${theme}: chips on one row`).toBe(1)
    for (const l of m.lines) expect(l, `${theme}: title at most two lines`).toBeLessThanOrEqual(2)
    expect(m.lines.some((l) => l === 2), `${theme}: a long title takes its second line`).toBe(true)
    expect(m.clipped, `${theme}: these titles fit whole in two lines`).toEqual([false, false, false])
    for (const w of m.why) expect(w, `${theme}: secondary line AA`).toBeGreaterThanOrEqual(4.5)
    expect(m.placeholder, `${theme}: placeholder AA`).toBeGreaterThanOrEqual(4.5)
    // Disabled: drawn at full opacity, outline and icon at least 3:1.
    expect(m.disabled).toBe(true)
    expect(m.opacity, `${theme}: disabled send not faded out`).toBe(1)
    expect(m.edge, `${theme}: disabled send outline ≥ 3:1`).toBeGreaterThanOrEqual(3)
    expect(m.icon, `${theme}: disabled send icon ≥ 3:1`).toBeGreaterThanOrEqual(3)

    await win.screenshot({ path: `test-results/home-composer-${theme}.png` })

    await field.fill('Limiti')
    await expect.poll(() => win.evaluate(sendSettled, { prop: 'backgroundColor', token: '--accent' })).toBe(true)
    // Reach the enabled send by keyboard: from the microphone, Tab.
    await win.locator('.composer .mic').focus()
    await win.keyboard.press('Tab')
    await expect(win.locator('.composer .send')).toBeFocused()
    const on = await win.evaluate(measureComposer)
    expect(on.focused, `${theme}: keyboard focus shows on send`).toBe(true)
    expect(on.ring.style, `${theme}: send focus ring drawn`).toBe('solid')
    expect(on.ring.width, `${theme}: send focus ring width`).toBeGreaterThanOrEqual(2)
    expect(on.ring.offset, `${theme}: send focus ring stands off the filled circle`).toBeGreaterThanOrEqual(2)
    expect(on.ring.contrast, `${theme}: send focus ring ≥ 3:1 on the core`).toBeGreaterThanOrEqual(3)
    await win.screenshot({ path: `test-results/home-composer-send-focus-${theme}.png` })
    expect(on.disabled).toBe(false)
    expect(on.opacity).toBe(1)
    expect(on.fill, `${theme}: enabled send is filled differently from disabled`).not.toBe(m.fill)
    expect(on.icon, `${theme}: enabled send icon AA on its fill`).toBeGreaterThanOrEqual(4.5)
    await field.fill('')
  }
  // Same place, same width: only the few px the second title line needs.
  const after = await win.locator('.composer').evaluate((el) => el.getBoundingClientRect())
  expect(after.width).toBe(rectBefore.width)
  expect(after.bottom).toBe(rectBefore.bottom)
  await app.close()
})
