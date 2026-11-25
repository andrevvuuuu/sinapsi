import { describe, expect, it } from 'vitest'
import { sectionText } from '../../src/main/notes/section-text'

describe('sectionText', () => {
  it.each([
    ['§3', '## 3. Enunciato'],
    ['§ 3', '## 3) Enunciato'],
    ['3.', '### 3) Dimostrazione'],
    ['3)', '## 3 - Dimostrazione'],
    ['3 -', '## 3: Dimostrazione'],
    ['3:', '## §3 Dimostrazione'],
    ['§9 Relazioni, Equivalenze, Insiemi Quoziente e Partizioni', '## §9 Relazioni, Equivalenze, Insiemi Quoziente e Partizioni'],
    ['§2 Enunciato', '## 2. Enunciato'],
    ['Enunciato', '## **Enunciato**'],
    ['Teorema', '## [Teorema](https://example.test)']
  ])('matches title %s with heading %s', (title, heading) => {
    expect(sectionText(`${heading}\ncontenuto`, [title])).toBe(`${heading}\ncontenuto`)
  })

  it.each(['§3', '§ 3'])('matches a number-only title %s', (title) => {
    expect(sectionText('## 3. Enunciato\ncontenuto', [title])).toBe('## 3. Enunciato\ncontenuto')
  })

  it('does not match a different leading section number', () => {
    expect(sectionText('## 3. Enunciato\ncontenuto', ['§2 Enunciato'])).toBe('')
  })

  it('keeps the old case-insensitive exact-title behavior', () => {
    expect(sectionText('## ENUNCIATO\ncontenuto', ['Enunciato'])).toBe('## ENUNCIATO\ncontenuto')
    expect(sectionText('## Enunciato\ncontenuto', ['Dimostrazione'])).toBe('')
  })
})
