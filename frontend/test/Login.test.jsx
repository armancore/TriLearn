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
    expect(screen.getByRole('button', { name: /login to trilearn/i })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /login to trilearn/i }))

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/auth/login', {
        email: 'admin@example.com',
        password: 'password123'
      })
    })

    expect(loginMock).toHaveBeenCalledWith({ role: 'ADMIN', name: 'Casey' }, 'token-123')
    expect(navigateMock).toHaveBeenCalledWith('/admin')
  })

  test('renders and submits the login captcha challenge after repeated failures', async () => {
    postMock
      .mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            message: 'Please complete the security check to continue.',
            requiresCaptcha: true,
            captchaChallenge: {
              prompt: 'What is 2 + 3?',
              token: 'captcha-token-1'
            }
          }
        }
      })
      .mockResolvedValueOnce({
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
    fireEvent.click(screen.getByRole('button', { name: /login to trilearn/i }))

    await waitFor(() => {
      expect(screen.getByText(/what is 2 \+ 3\?/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/enter the answer/i), {
      target: { value: '5' }
    })
    fireEvent.click(screen.getByRole('button', { name: /login to trilearn/i }))

    await waitFor(() => {
      expect(postMock).toHaveBeenLastCalledWith('/auth/login', {
        email: 'admin@example.com',
        password: 'password123',
        captchaToken: 'captcha-token-1',
        captchaAnswer: '5'
      })
    })
  })
})
