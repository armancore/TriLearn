import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import Login from './Login'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    login: vi.fn()
  })
}))

vi.mock('../../utils/api', () => ({
  default: {
    post: vi.fn()
  }
}))

describe('Login', () => {
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
})
