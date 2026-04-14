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
    vi.restoreAllMocks()
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

  it('hydrates the full user from the refresh response without an extra /auth/me request', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()

    refreshClient.post.mockResolvedValue({
      data: {
        token: 'fresh-access-token',
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
    expect(refreshClient.get).not.toHaveBeenCalled()
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

  it('logs only sanitized axios metadata in response interceptor errors', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    await import('../src/utils/api')

    const interceptorReject = apiClient.interceptors.response.use.mock.calls[0][1]
    const error = {
      message: 'Request failed',
      config: {
        url: '/auth/login',
        method: 'post',
        headers: {
          Authorization: 'Bearer secret-token'
        },
        data: {
          password: 'super-secret'
        }
      },
      response: {
        status: 401
      }
    }

    await expect(interceptorReject(error)).rejects.toBe(error)
    expect(errorSpy).toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalledWith('API Error:', {
      message: 'Request failed',
      status: 401,
      url: '/auth/login',
      method: 'post'
    })
    expect(String(errorSpy.mock.calls[0][1])).not.toContain('secret-token')
    expect(String(errorSpy.mock.calls[0][1])).not.toContain('super-secret')
  })

  it('does not log canceled requests in response interceptor errors', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    await import('../src/utils/api')

    const interceptorReject = apiClient.interceptors.response.use.mock.calls[0][1]
    const canceledError = {
      message: 'canceled',
      code: 'ERR_CANCELED',
      name: 'CanceledError',
      config: {
        url: '/notifications',
        method: 'get'
      }
    }

    await expect(interceptorReject(canceledError)).rejects.toBe(canceledError)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not log protected-route 401 errors when there is no session hint', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    const { setAuthState } = await import('../src/utils/api')
    setAuthState({ token: null, user: null })

    const interceptorReject = apiClient.interceptors.response.use.mock.calls[0][1]
    const unauthorizedError = {
      message: 'Request failed with status code 401',
      config: {
        url: '/notifications',
        method: 'get'
      },
      response: {
        status: 401
      }
    }

    await expect(interceptorReject(unauthorizedError)).rejects.toBe(unauthorizedError)
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
