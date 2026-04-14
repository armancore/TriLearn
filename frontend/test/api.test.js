import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAxiosClient = () => ({
  get: vi.fn(),
  post: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() }
  }
})

describe('api auth persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    window.sessionStorage.clear()
  })

  it('stores only a minimal auth snapshot in sessionStorage while keeping the full user in memory', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    const { getAuthState, setAuthState } = await import('../src/utils/api')

    setAuthState({
      token: 'token-1',
      user: {
        id: 'user-1',
        name: 'Taylor',
        role: 'STUDENT',
        email: 'student@example.com',
        phone: '9800000000',
        student: {
          rollNumber: '23-001',
          department: 'BCA',
          semester: 3,
          section: 'A'
        },
        mustChangePassword: false,
        profileCompleted: true
      }
    })

    expect(getAuthState().user).toMatchObject({
      id: 'user-1',
      email: 'student@example.com',
      student: {
        rollNumber: '23-001',
        department: 'BCA',
        semester: 3,
        section: 'A'
      }
    })

    expect(JSON.parse(window.sessionStorage.getItem('trilearn.auth.user'))).toEqual({
      name: 'Taylor',
      role: 'STUDENT',
      mustChangePassword: false,
      profileCompleted: true
    })
  })

  it('hydrates the full user from /auth/me after refresh succeeds', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()

    refreshClient.post.mockResolvedValue({
      data: {
        token: 'fresh-access-token',
        user: {
          name: 'Snapshot Only',
          role: 'ADMIN'
        }
      }
    })
    refreshClient.get.mockResolvedValue({
      data: {
        user: {
          id: 'user-7',
          name: 'Jordan',
          role: 'ADMIN',
          email: 'admin@example.com',
          coordinator: {
            department: 'BCA'
          },
          mustChangePassword: false,
          profileCompleted: true
        }
      }
    })

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    const { getAuthState, refreshSession } = await import('../src/utils/api')

    const result = await refreshSession()

    expect(refreshClient.post).toHaveBeenCalledWith('/auth/refresh')
    expect(refreshClient.get).toHaveBeenCalledWith('/auth/me', {
      headers: {
        Authorization: 'Bearer fresh-access-token'
      }
    })
    expect(result.user).toMatchObject({
      id: 'user-7',
      email: 'admin@example.com',
      coordinator: { department: 'BCA' }
    })
    expect(getAuthState().user).toMatchObject({
      id: 'user-7',
      email: 'admin@example.com',
      coordinator: { department: 'BCA' }
    })
    expect(JSON.parse(window.sessionStorage.getItem('trilearn.auth.user'))).toEqual({
      name: 'Jordan',
      role: 'ADMIN',
      mustChangePassword: false,
      profileCompleted: true
    })
  })
})
