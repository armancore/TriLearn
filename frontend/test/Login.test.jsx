import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Login from '../src/pages/auth/Login'

const loginMock = vi.fn()
const navigateMock = vi.fn()
const postMock = vi.fn()

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock
  })
}))

vi.mock('../src/utils/api', () => ({
  default: {
    post: (...args) => postMock(...args)
  }
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock
  }
})

describe('Login', () => {
  beforeEach(() => {
    loginMock.mockReset()
    navigateMock.mockReset()
    postMock.mockReset()
  })

  test('renders the login form', () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /login to edunexus/i })).toBeInTheDocument()
  })

  test('submits the login form and routes to the user home page', async () => {
    postMock.mockResolvedValue({
      data: {
        user: { role: 'ADMIN', name: 'Casey' },
        token: 'token-123'
      }
    })

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/enter your email/i), {
      target: { value: 'admin@example.com' }
    })
    fireEvent.change(screen.getByPlaceholderText(/enter your password/i), {
      target: { value: 'password123' }
    })
    fireEvent.click(screen.getByRole('button', { name: /login to edunexus/i }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/login', {
        email: 'admin@example.com',
        password: 'password123'
      })
    })

    expect(loginMock).toHaveBeenCalledWith({ role: 'ADMIN', name: 'Casey' }, 'token-123')
    expect(navigateMock).toHaveBeenCalledWith('/admin')
  })
})
