import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../src/components/ProtectedRoute'

const useAuthMock = vi.fn()

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => useAuthMock()
}))

const renderProtectedRoute = (initialPath = '/protected', authValue = { user: null, loading: false }, allowedRoles) => {
  useAuthMock.mockReturnValue(authValue)

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/change-password" element={<div>Change password page</div>} />
        <Route path="/student/profile" element={<div>Student profile page</div>} />
        <Route
          path="/protected"
          element={(
            <ProtectedRoute allowedRoles={allowedRoles}>
              <div>Protected content</div>
            </ProtectedRoute>
          )}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('redirects guests to the login page', () => {
    renderProtectedRoute('/protected', { user: null, loading: false })
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('redirects users who must change their password', () => {
    renderProtectedRoute('/protected', {
      user: { role: 'ADMIN', mustChangePassword: true },
      loading: false
    })

    expect(screen.getByText('Change password page')).toBeInTheDocument()
  })

  it('redirects incomplete students to their profile page', () => {
    renderProtectedRoute('/protected', {
      user: { role: 'STUDENT', profileCompleted: false, mustChangePassword: false },
      loading: false
    })

    expect(screen.getByText('Student profile page')).toBeInTheDocument()
  })

  it('renders allowed content for authorized users', () => {
    renderProtectedRoute('/protected', {
      user: { role: 'ADMIN', mustChangePassword: false },
      loading: false
    }, ['ADMIN'])

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
