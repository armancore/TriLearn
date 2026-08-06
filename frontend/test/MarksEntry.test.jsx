import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import Marks from '../src/pages/instructor/Marks'

const getMock = vi.fn()
const postMock = vi.fn()
const showToastMock = vi.fn()
const loadSubjectsMock = vi.fn()

vi.mock('../src/utils/api', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args)
  }
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'inst-1', role: 'INSTRUCTOR', name: 'Instructor' } })
}))

vi.mock('../src/context/ReferenceDataContext', () => ({
  useReferenceData: () => ({
    subjects: [{ id: 'sub-1', name: 'Math', code: 'MTH101' }],
    loadSubjects: loadSubjectsMock
  })
}))

vi.mock('../src/components/Toast', () => ({
  useToast: () => ({ showToast: showToastMock })
}))

vi.mock('../src/layouts/InstructorLayout', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../src/layouts/CoordinatorLayout', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../src/components/PageHeader', () => ({
  default: ({ title, actions = [] }) => (
    <header>
      <h1>{title}</h1>
      {actions.map((action) => (
        <button key={action.label} type="button" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </button>
      ))}
    </header>
  )
}))

vi.mock('../src/utils/logger', () => ({
  default: { error: vi.fn() }
}))

const students = [
  { id: 'student-1', name: 'Asha Student', rollNumber: 'BIT-001', semester: 1, section: 'A' },
  { id: 'student-2', name: 'Bikram Student', rollNumber: 'BIT-002', semester: 1, section: 'A' }
]

const renderMarks = () => render(
  <MemoryRouter initialEntries={['/instructor/marks?subject=sub-1']}>
    <Marks />
  </MemoryRouter>
)

describe('Marks entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadSubjectsMock.mockResolvedValue()
    getMock.mockImplementation((url) => {
      if (url === '/marks/subject/sub-1/students') {
        return Promise.resolve({ data: { students } })
      }

      if (url === '/marks/subject/sub-1') {
        return Promise.resolve({ data: { marks: [], total: 0, stats: { total: 0, published: 0, unpublished: 0, byExamType: [] } } })
      }

      return Promise.resolve({ data: {} })
    })
    postMock.mockResolvedValue({ data: { message: 'Saved' } })
  })

  test('renders mark entry fields for each student', async () => {
    renderMarks()

    fireEvent.click(screen.getByRole('button', { name: 'Add Exam Mark' }))

    expect(await screen.findByText('Asha Student')).toBeInTheDocument()
    expect(screen.getByText('Bikram Student')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Marks')).toHaveLength(2)
  })

  test('submitting with empty marks shows validation error', async () => {
    renderMarks()

    fireEvent.click(screen.getByRole('button', { name: 'Add Exam Mark' }))
    await screen.findByText('Asha Student')
    fireEvent.click(screen.getByRole('button', { name: 'Save Mark' }))

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.some((alert) => alert.textContent === 'Enter marks for at least one student')).toBe(true)
  })

  test('a successful save shows a success toast', async () => {
    renderMarks()

    fireEvent.click(screen.getByRole('button', { name: 'Add Exam Mark' }))
    await screen.findByText('Asha Student')
    fireEvent.change(screen.getAllByPlaceholderText('Marks')[0], { target: { value: '88' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Mark' }))

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith({ title: 'Exam marks added for 1 student.' })
    })
  })

  test('the bulk-add path calls the bulk marks endpoint', async () => {
    renderMarks()

    fireEvent.click(screen.getByRole('button', { name: 'Add Exam Mark' }))
    await screen.findByText('Asha Student')
    fireEvent.change(screen.getAllByPlaceholderText('Marks')[1], { target: { value: '76' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Mark' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/marks/bulk', {
        subjectId: 'sub-1',
        examType: 'MIDTERM',
        totalMarks: 100,
        entries: [{ studentId: 'student-2', obtainedMarks: 76, remarks: '' }]
      })
    })
  })
})
