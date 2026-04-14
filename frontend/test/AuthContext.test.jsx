import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/context/AuthContext'

const getAuthStateMock = vi.fn()
const setAuthStateMock = vi.fn()
const refreshSessionMock = vi.fn()
const subscribeToAuthStateMock = vi.fn(() => () => {})
const registerUnauthorizedHandlerMock = vi.fn(() => () => {})
const apiPostMock = vi.fn()

vi.mock('../src/utils/api', () => ({
  default: {
    post: (...args) => apiPostMock(...args)
  },
  getAuthState: () => getAuthStateMock(),
  refreshSession: (...args) => refreshSessionMock(...args),
  registerUnauthorizedHandler: (...args) => registerUnauthorizedHandlerMock(...args),
  setAuthState: (...args) => setAuthStateMock(...args),
  subscribeToAuthState: (...args) => subscribeToAuthStateMock(...args)
}))

const Consumer = () => {
  const { user, loading, login, logout, updateUser } = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{user?.name || 'anonymous'}</span>
      <button type="button" onClick={() => login({ name: 'Taylor', role: 'ADMIN' }, 'token-1')}>Login</button>
      <button type="button" onClick={() => logout()}>Logout</button>
      <button type="button" onClick={() => updateUser({ name: 'Jordan', role: 'ADMIN' })}>Update</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    getAuthStateMock.mockReturnValue({ user: null, token: null })
    refreshSessionMock.mockReset()
    refreshSessionMock.mockResolvedValue({ token: 'fresh-token', user: { name: 'Refreshed', role: 'ADMIN' } })
    setAuthStateMock.mockReset()
    apiPostMock.mockReset()
    apiPostMock.mockResolvedValue({ data: { message: 'Logged out successfully' } })
    subscribeToAuthStateMock.mockImplementation((listener) => {
      listener({ user: getAuthStateMock().user, token: getAuthStateMock().token })
      return () => {}
    })
  })

  it('hydrates cached users without showing the loading state', async () => {
    getAuthStateMock.mockReturnValue({ user: { name: 'Cached', role: 'ADMIN' }, token: null })

    render(
      <MemoryRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    expect(screen.getByTestId('name')).toHaveTextContent('Cached')
    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalled()
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('skips refresh and clears stale cached users on public auth routes', async () => {
    getAuthStateMock
      .mockReturnValueOnce({ user: { name: 'Cached', role: 'ADMIN' }, token: null })
      .mockReturnValue({ user: { name: 'Cached', role: 'ADMIN' }, token: null })

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(refreshSessionMock).not.toHaveBeenCalled()
      expect(setAuthStateMock).toHaveBeenCalledWith({ token: null, user: null })
      expect(screen.getByTestId('loading')).toHaveTextContent('false')
    })
  })

  it('uses setAuthState for login and user updates', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </MemoryRouter>
    )

    await act(async () => {
      screen.getByRole('button', { name: 'Login' }).click()
      screen.getByRole('button', { name: 'Update' }).click()
    })

    expect(setAuthStateMock).toHaveBeenCalledWith({ user: { name: 'Taylor', role: 'ADMIN' }, token: 'token-1' })
    expect(setAuthStateMock).toHaveBeenCalledWith({ user: { name: 'Jordan', role: 'ADMIN' }, token: null })
  })

  it('logs out through the shared API client', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <Consumer />
        </AuthProvider>
      </MemoryRouter>
    )

    await act(async () => {
      screen.getByRole('button', { name: 'Logout' }).click()
    })

    expect(apiPostMock).toHaveBeenCalledWith('/auth/logout')
    expect(setAuthStateMock).toHaveBeenCalledWith({ token: null, user: null })
  })
})
