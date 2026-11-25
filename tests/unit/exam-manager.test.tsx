// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExamManager } from '../../src/renderer/src/plan/ExamManager'
import type { ExamEntry } from '../../src/shared/exam-types'
import type { SinapsiApi } from '../../src/shared/api'

afterEach(cleanup)

const fakeExam: ExamEntry = {
  id: 'exam-1',
  courseId: 'Fisica 1',
  title: 'Orale',
  date: '2026-12-10',
  weight: 1,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z'
}

function setupSinapsi(overrides: Partial<SinapsiApi> = {}): {
  examsList: ReturnType<typeof vi.fn>
  examsCreate: ReturnType<typeof vi.fn>
  examsUpdate: ReturnType<typeof vi.fn>
  examsArchive: ReturnType<typeof vi.fn>
  tutorCalendar: ReturnType<typeof vi.fn>
  planWeek: ReturnType<typeof vi.fn>
} {
  const examsList = vi.fn().mockResolvedValue([fakeExam])
  const examsCreate = vi.fn().mockResolvedValue({ id: 'new-id' })
  const examsUpdate = vi.fn().mockResolvedValue({ id: 'updated-id' })
  const examsArchive = vi.fn().mockResolvedValue({ id: 'archived-id' })
  const tutorCalendar = vi.fn().mockResolvedValue({
    courses: [{ id: 'c1', nome: 'Fisica 1', orario: [], esami: [] }],
    lessons: [],
    nextLesson: null,
    exams: [
      {
        course: 'c2',
        courseName: 'Geometria',
        name: 'Scritto',
        date: '2026-12-20'
      }
    ]
  })
  const planWeek = vi.fn().mockResolvedValue({
    plan: { days: [] },
    readiness: [{ examId: 'exam-1', status: 'pronto' }]
  })
  const lessonsList = vi.fn().mockResolvedValue([
    { id: 'l1', courseId: 'Fisica 1', topic: 'Cinematica' }
  ])

  const api = {
    exams: {
      list: examsList,
      create: examsCreate,
      update: examsUpdate,
      archive: examsArchive
    },
    tutor: {
      calendar: tutorCalendar
    },
    plan: {
      week: planWeek
    },
    lessons: {
      list: lessonsList
    },
    ...overrides
  } as unknown as SinapsiApi

  Object.defineProperty(window, 'sinapsi', { configurable: true, value: api })

  return { examsList, examsCreate, examsUpdate, examsArchive, tutorCalendar, planWeek }
}

describe('ExamManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('autoFocusForm mette il focus sul primo campo quando true', async () => {
    setupSinapsi()
    render(<ExamManager autoFocusForm={true} />)

    const courseInput = screen.getByLabelText('Corso')
    await waitFor(() => {
      expect(document.activeElement).toBe(courseInput)
    })
  })

  it('non mette il focus sul primo campo quando autoFocusForm è false o omesso', async () => {
    setupSinapsi()
    render(<ExamManager />)

    const courseInput = screen.getByLabelText('Corso')
    expect(document.activeElement).not.toBe(courseInput)
  })

  it('crea un esame con corso, data, titolo e peso', async () => {
    const { examsCreate } = setupSinapsi()
    const onChanged = vi.fn()
    render(<ExamManager onChanged={onChanged} />)

    expect(await screen.findByText('Fisica 1')).toBeTruthy()

    const courseInput = screen.getByLabelText('Corso')
    const dateInput = screen.getByLabelText('Data')
    const titleInput = screen.getByLabelText('Titolo')
    const weightInput = screen.getByLabelText('Peso (0–1, facoltativo)')

    fireEvent.change(courseInput, { target: { value: 'Analisi 1' } })
    fireEvent.change(dateInput, { target: { value: '2026-12-18' } })
    fireEvent.change(titleInput, { target: { value: 'Scritto' } })
    fireEvent.change(weightInput, { target: { value: '0.8' } })

    const submitBtn = screen.getByRole('button', { name: 'Aggiungi esame' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(examsCreate).toHaveBeenCalledWith({
        courseId: 'Analisi 1',
        date: '2026-12-18',
        title: 'Scritto',
        weight: 0.8
      })
    })

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('importa un esame del tutor con 1 clic', async () => {
    const { examsCreate } = setupSinapsi()
    const onChanged = vi.fn()
    render(<ExamManager onChanged={onChanged} />)

    // Geometria · Scritto is in tutor exams but not in Sinapsi exams
    expect(await screen.findByText(/Geometria · Scritto/)).toBeTruthy()

    // 1 clic sul bottone «Aggiungi»
    const addBtn = screen.getByRole('button', { name: 'Aggiungi' })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(examsCreate).toHaveBeenCalledWith({
        courseId: 'Geometria',
        date: '2026-12-20'
      })
    })

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('non mostra il bottone «Aggiungi» per esami del tutor già presenti in Sinapsi', async () => {
    // Both tutor and Sinapsi have Fisica 1 on 2026-12-10
    const tutorWithDuplicate = vi.fn().mockResolvedValue({
      courses: [],
      lessons: [],
      nextLesson: null,
      exams: [
        {
          course: 'fis1',
          courseName: 'Fisica 1',
          name: 'Orale',
          date: '2026-12-10'
        }
      ]
    })
    setupSinapsi({ tutor: { calendar: tutorWithDuplicate } as unknown as SinapsiApi['tutor'] })

    render(<ExamManager />)

    expect(await screen.findByText('Fisica 1')).toBeTruthy()
    // Button «Aggiungi» should not exist since it's already imported
    expect(screen.queryByRole('button', { name: 'Aggiungi' })).toBeNull()
  })

  it('archivia un esame e invoca onChanged', async () => {
    const { examsArchive } = setupSinapsi()
    const onChanged = vi.fn()
    render(<ExamManager onChanged={onChanged} />)

    expect(await screen.findByText('Fisica 1')).toBeTruthy()

    const archiveBtn = screen.getByRole('button', { name: 'Archivia' })
    fireEvent.click(archiveBtn)

    await waitFor(() => {
      expect(examsArchive).toHaveBeenCalledWith('exam-1')
    })
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('modifica un esame e salva le modifiche', async () => {
    const { examsUpdate } = setupSinapsi()
    const onChanged = vi.fn()
    render(<ExamManager onChanged={onChanged} />)

    expect(await screen.findByText('Fisica 1')).toBeTruthy()

    const editBtn = screen.getByRole('button', { name: 'Modifica' })
    fireEvent.click(editBtn)

    expect(screen.getByRole('heading', { level: 3, name: 'Modifica esame' })).toBeTruthy()

    const titleInput = screen.getByLabelText('Titolo')
    fireEvent.change(titleInput, { target: { value: 'Orale finale' } })

    const saveBtn = screen.getByRole('button', { name: 'Salva modifiche' })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(examsUpdate).toHaveBeenCalledWith('exam-1', {
        courseId: 'Fisica 1',
        title: 'Orale finale',
        date: '2026-12-10',
        weight: 1
      })
    })
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalled()
    })
  })
})
