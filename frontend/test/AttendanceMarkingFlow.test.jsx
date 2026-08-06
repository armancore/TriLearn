import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import Attendance from '../src/pages/instructor/Attendance'

const getMock = vi.fn()
const postMock = vi.fn()

vi.mock('../src/utils/api', () => ({
  default: {
    get: (...args) => getMock(...args),
    post: (...args) => postMock(...args)
  }
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'inst-1', role: 'INSTRUCTOR', name: 'Instructor' } })
}))

vi.mock('../src/layouts/InstructorLayout', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../src/layouts/CoordinatorLayout', () => ({
  default: ({ children }) => <div>{children}</div>
}))

vi.mock('../src/components/QrScanPanel', () => ({
  default: () => null
}))

vi.mock('../src/utils/logger', () => ({
  default: { error: vi.fn() }
}))

const roster = [
  {
    id: 'student-1',
    name: 'Asha Student',
    rollNumber: 'BIT-001',
    email: 'asha@example.com',
    semester: 1,
    department: 'BIT',
    section: 'A',
    status: 'PRESENT'
  },
  {
    id: 'student-2',
    name: 'Bikram Student',
    rollNumber: 'BIT-002',
    email: 'bikram@example.com',
    semester: 1,
    department: 'BIT',
    section: 'A',
    status: 'PRESENT'
  }
]

const mockWorkspaceRequests = () => {
  getMock.mockImplementation((url) => {
    if (url === '/subjects') {
      return Promise.resolve({ data: { subjects: [{ id: 'sub-1', name: 'Math', code: 'MTH101', semester: 1 }] } })
    }

    if (url === '/attendance/subject/sub-1/roster') {
      return Promise.resolve({ data: { roster } })
    }

    if (url === '/attendance/subject/sub-1') {
      return Promise.resolve({ data: { attendance: [], summary: { total: 2, present: 2, absent: 0, late: 0 } } })
    }

    return Promise.resolve({ data: {} })
  })
}

const renderAttendance = () => render(
  <MemoryRouter initialEntries={['/instructor/attendance?subject=sub-1&semester=1&section=A']}>
    <Attendance />
  </MemoryRouter>
)

describe('Attendance marking flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceRequests()
    postMock.mockResolvedValue({ data: { message: 'Saved' } })
  })

  test('renders the student list for the selected subject', async () => {
    renderAttendance()

    expect(await screen.findByText('Asha Student')).toBeInTheDocument()
    expect(screen.getByText('Bikram Student')).toBeInTheDocument()
  })

  test('clicking Present or Absent updates local state', async () => {
    renderAttendance()

    const studentCard = (await screen.findByText('Asha Student')).closest('.border')
    fireEvent.click(within(studentCard).getByRole('button', { name: 'ABSENT' }))

    expect(within(studentCard).getByRole('button', { name: 'ABSENT' })).toHaveClass('status-absent')
  })

  test('submitting calls the attendance endpoint with the selected payload', async () => {
    renderAttendance()

    const studentCard = (await screen.findByText('Bikram Student')).closest('.border')
    fireEvent.click(within(studentCard).getByRole('button', { name: 'ABSENT' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Attendance' }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/attendance/manual', {
        subjectId: 'sub-1',
        attendanceDate: expect.any(String),
        semester: 1,
        section: 'A',
        attendanceList: [
          { studentId: 'student-1', status: 'PRESENT' },
          { studentId: 'student-2', status: 'ABSENT' }
        ]
      })
    })
  })

  test('displays an error message when the API save fails', async () => {
    postMock.mockRejectedValueOnce({ response: { data: { message: 'Unable to save attendance' } } })
    renderAttendance()

    await screen.findByText('Asha Student')
    fireEvent.click(screen.getByRole('button', { name: 'Save Attendance' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save attendance')
  })
})
