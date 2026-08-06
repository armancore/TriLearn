import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import StudentDashboard from '../src/pages/student/Dashboard'

const getMock = vi.fn()

vi.mock('../src/utils/api', () => ({
  default: {
    get: (...args) => getMock(...args)
  }
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'student-1', role: 'STUDENT', name: 'Asha Student', student: { department: 'BIT', semester: 1 } } })
}))

vi.mock('../src/layouts/StudentLayout', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../src/components/LoadingSkeleton', () => ({
  default: () => <div data-testid="loading-skeleton" aria-live="polite">Loading...</div>
}))

vi.mock('../src/utils/logger', () => ({
  default: { error: vi.fn() }
}))

const dashboardResponses = {
  '/subjects': { subjects: [{ id: 'sub-1', name: 'Math', code: 'MTH101', semester: 1, department: 'BIT', _count: { assignments: 2, materials: 1 } }] },
  '/attendance/my': { summary: [{ code: 'MTH101', present: 8, late: 0, total: 10, percentage: '80%' }] },
  '/assignments': { assignments: [{ id: 'assign-1', title: 'Algebra Work', dueDate: '2099-01-01T00:00:00.000Z', totalMarks: 20, subject: { name: 'Math', code: 'MTH101' } }] },
  '/notices': { notices: [{ id: 'notice-1', title: 'Exam Notice', content: 'Midterm starts soon', type: 'ACADEMIC', createdAt: '2026-01-01T00:00:00.000Z' }] },
  '/routines': { routines: [] }
}

const renderDashboard = () => render(
  <MemoryRouter>
    <StudentDashboard />
  </MemoryRouter>
)

describe('Student dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMock.mockImplementation((url) => Promise.resolve({ data: dashboardResponses[url] || {} }))
  })

  test('stat cards render with data from the mocked API response', async () => {
    renderDashboard()

    expect(await screen.findByText('Welcome back, Asha Student')).toBeInTheDocument()
    expect(screen.getByText('Attendance')).toBeInTheDocument()
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
    expect(screen.getByText('Upcoming Tasks')).toBeInTheDocument()
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  test('loading skeleton shows while fetching', () => {
    getMock.mockImplementation(() => new Promise(() => {}))

    renderDashboard()

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
  })

  test('an error state renders the error message', async () => {
    getMock.mockRejectedValue(new Error('Network failed'))

    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your dashboard right now.')
  })

  test('renders dashboard sections after successful loading', async () => {
    renderDashboard()

    expect(await screen.findByText("Today's Routine")).toBeInTheDocument()
    expect(screen.getByText('Upcoming Assignments')).toBeInTheDocument()
    expect(screen.getAllByText('Recent Notices').length).toBeGreaterThan(0)
  })
})
