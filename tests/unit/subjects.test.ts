import { describe, expect, it } from 'vitest'
import { arrangeSubjects, moveSubject, placeSubject, toggleUniversity, toTitleCase } from '../../src/shared/subjects'

const names = ['Matematica', 'Arte', 'Fisica', 'Psicologia']
const none = { subjectOrder: [], universitySubjects: null }
const flat = (g: ReturnType<typeof arrangeSubjects>): [string[], string[]] => [g.university.map((s) => s.name), g.personal.map((s) => s.name)]

describe('subjects', () => {
  it('starts from the fixed university list, in its order', () => {
    const vault = ['Arte', 'Fisica', 'Biologia e Neuroscienze', 'Matematica', 'Informatica', 'Intelligenza Artificiale', 'Psicologia']
    expect(flat(arrangeSubjects(vault, none))).toEqual([
      ['Matematica', 'Intelligenza Artificiale', 'Informatica', 'Fisica', 'Biologia e Neuroscienze'],
      ['Arte', 'Psicologia']
    ])
  })

  it('splits by the guess until chosen, keeping the default order', () => {
    expect(flat(arrangeSubjects(names, none, ['Fisica', 'Matematica']))).toEqual([['Fisica', 'Matematica'], ['Arte', 'Psicologia']])
  })

  it('a saved choice wins over the guess, and saved order wins over the default', () => {
    const prefs = { subjectOrder: ['Psicologia', 'Arte'], universitySubjects: ['Arte'] }
    expect(flat(arrangeSubjects(names, prefs, ['Matematica']))).toEqual([['Arte'], ['Psicologia', 'Matematica', 'Fisica']])
  })

  it('moves inside a group, places across groups, toggles a subject', () => {
    const g = arrangeSubjects(names, none, ['Matematica', 'Fisica'])
    const down = moveSubject(g, none, 'Matematica', 1)
    expect(flat(arrangeSubjects(names, down))).toEqual([['Fisica', 'Matematica'], ['Arte', 'Psicologia']])
    expect(moveSubject(g, none, 'Matematica', -1)).toBe(none)
    const placed = placeSubject(g, 'Psicologia', true, 'Matematica')
    expect(flat(arrangeSubjects(names, placed))).toEqual([['Psicologia', 'Matematica', 'Fisica'], ['Arte']])
    const toggled = toggleUniversity(g, 'Fisica')
    expect(flat(arrangeSubjects(names, toggled))).toEqual([['Matematica'], ['Arte', 'Psicologia', 'Fisica']])
  })

  it('new subjects appear after the placed ones', () => {
    const prefs = { subjectOrder: ['Arte', 'Matematica'], universitySubjects: [] }
    expect(flat(arrangeSubjects([...names, 'Storia'], prefs))[1]).toEqual(['Arte', 'Matematica', 'Fisica', 'Psicologia', 'Storia'])
  })

})

describe('toTitleCase', () => {
  it('capitalises every word and keeps the rest as typed', () => {
    expect(toTitleCase('numeri naturali')).toBe('Numeri Naturali')
    expect(toTitleCase('introduzione ai sistemi')).toBe('Introduzione Ai Sistemi')
    expect(toTitleCase("  teorema  dell'algebra e LaTeX in FSRS ")).toBe("Teorema Dell'Algebra E LaTeX In FSRS")
    expect(toTitleCase('équazioni di primo-grado (lineari)')).toBe('Équazioni Di Primo-Grado (Lineari)')
  })
})
