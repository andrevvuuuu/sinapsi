import { expect, type Page } from '@playwright/test'

export type Destination = 'Oggi' | 'Ripassa' | 'Esercitati' | 'Registro' | 'Note' | 'Grafo' | 'Piano'

/** Navigates to any of the app's main sections via sidebar or bottom liquid dock. */
export async function goTo(win: Page, dest: Destination): Promise<void> {
  if (dest === 'Grafo' || dest === 'Piano') {
    const dock = win.getByRole('navigation', { name: 'Sezioni principali' })
    if (!(await dock.isVisible())) {
      const sidebar = win.getByRole('navigation', { name: 'Azioni rapide' })
      if (await sidebar.isVisible()) {
        await sidebar.getByRole('button', { name: 'Oggi' }).click()
      } else {
        const back = win.getByRole('button', { name: /^← |Torna alla home/ })
        if (await back.isVisible()) await back.click()
      }
      await expect(dock).toBeVisible()
    }
    await dock.getByRole('menuitem', { name: dest }).click()
  } else {
    const sidebar = win.getByRole('navigation', { name: 'Azioni rapide' })
    if (!(await sidebar.isVisible())) {
      const back = win.getByRole('button', { name: /^← |Torna alla home/ })
      if (await back.isVisible()) {
        await back.click()
        await expect(sidebar).toBeVisible()
      }
    }
    await sidebar.getByRole('button', { name: dest }).click()
  }
}

/** In the 'Note' view, expands the subject folder if needed and opens an Obsidian note. */
export async function openVaultNote(win: Page, title: string): Promise<void> {
  await goTo(win, 'Note')
  const materie = win.getByRole('region', { name: 'Materie' })
  await expect(materie).toBeVisible()
  const note = materie.getByRole('button', { name: title, exact: true })
  if (!(await note.isVisible())) {
    await materie.getByText('Matematica', { exact: true }).click()
  }
  await expect(note).toBeVisible()
  await note.click()
  await expect(win.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible()
}

/** The graph shows the notes vive only: open an Obsidian note, make its nota viva (fake writer), back home. */
export async function makeNotaViva(win: Page, title: string): Promise<void> {
  await openVaultNote(win, title)
  await win.getByRole('button', { name: 'Crea la nota viva' }).click()
  await expect(win.getByRole('heading', { level: 1 })).toBeVisible()
  // The nota viva being ready starts the extraction of its note: wait for its concepts.
  await expect
    .poll(
      async () =>
        win.evaluate(
          async (t) =>
            (await window.sinapsi.graph.get()).concepts.filter((c) => c.birth.endsWith(`${t}.md`)).length,
          title
        ),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0)
  await win.getByRole('button', { name: /^← / }).click()
}

/** Starts a study session on Today view with the specified topic. */
export async function startStudy(win: Page, text: string): Promise<void> {
  await goTo(win, 'Oggi')
  const composer = win.getByRole('region', { name: 'Compositore di studio' })
  await expect(composer).toBeVisible()
  const studyMode = composer.getByRole('button', { name: 'Studia' })
  if (await studyMode.isVisible()) {
    if ((await studyMode.getAttribute('aria-pressed')) !== 'true') {
      await studyMode.click()
    }
  }
  const input = composer.getByRole('textbox', { name: 'Cosa vuoi studiare?' })
  await input.fill(text)
  await composer.getByRole('button', { name: 'Inizia studio' }).click()
}
