import { expect, type Page } from '@playwright/test'

/** The graph shows the notes vive only: open an Obsidian note, make its nota viva (fake writer), back home. */
export async function makeNotaViva(win: Page, title: string): Promise<void> {
  const note = win.getByRole('button', { name: title, exact: true })
  if (!(await note.isVisible())) await win.getByText('Matematica', { exact: true }).click()
  await note.click()
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1 })).toBeVisible()
  // The nota viva being ready starts the extraction of its note: wait for its concepts.
  await expect
    .poll(async () => win.evaluate(async (t) => (await window.sinapsi.graph.get()).concepts.filter((c) => c.birth.endsWith(`${t}.md`)).length, title), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await win.getByRole('button', { name: '← Home' }).click()
}
