import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from '../src/context/AuthContext'

const getAuthStateMock = vi.fn()
const setAuthStateMock = vi.fn()
const refreshSessionMock = vi.fn()
const subscribeToAuthStateMock = vi.fn(() => () => {})
const registerUnauthorizedHandlerMock = vi.fn(() => () => {})

vi.mock('../src/utils/api', () => ({
  API_BASE_URL: 'http://localhost:5000/api/v1',
  getAuthState: () => getAuthStateMock(),
  refreshSession: (...args) => refreshSessionMock(...args),
  registerUnauthorizedHandler: (...args) => registerUnauthorizedHandlerMock(...args),
  setAuthState: (...args) => setAuthStateMock(...args),
  subscribeToAuthState: (...args) => subscribeToAuthStateMock(...args)
}))

const Consumer = () => {
  const { user, loading, login, updateUser } = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{user?.name || 'anonymous'}</span>
      <button type="button" onClick={() => login({ name: 'Taylor', role: 'ADMIN' }, 'token-1')}>Login</button>
      <button type="button" onClick={() => updateUser({ name: 'Jordan', role: 'ADMIN' })}>Update</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    getAuthStateMock.mockReturnValue({ user: null, token: null })
    refreshSessionMock.mockResolvedValue({ token: 'fresh-token', user: { name: 'Refreshed', role: 'ADMIN' } })
    setAuthStateMock.mockReset()
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
})
