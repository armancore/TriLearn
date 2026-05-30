import { beforeEach, describe, expect, it, vi } from 'vitest'

const createAxiosClient = () => ({
  get: vi.fn(),
  post: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() }
  }
})

const createStorageMock = () => {
  const values = new Map()

  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      values.set(key, String(value))
    }),
    removeItem: vi.fn((key) => {
      values.delete(key)
    }),
    clear: vi.fn(() => {
      values.clear()
    })
  }
}

describe('api auth persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    Object.defineProperty(window, 'localStorage', {
      value: createStorageMock(),
      configurable: true
    })
    window.sessionStorage.clear()
    window.localStorage.removeItem('trilearn.auth.user')
    window.localStorage.removeItem('trilearn.auth.session')
    window.localStorage.removeItem('trilearn.auth.refresh.cooldownUntil')
  })

  it('stores only a session hint while keeping the full user and token in memory', async () => {
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

    expect(getAuthState().token).toBe('token-1')
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

    expect(window.localStorage.getItem('trilearn.auth.user')).toBeNull()
    expect(window.localStorage.getItem('trilearn.auth.session')).toBe('1')
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
    expect(window.localStorage.getItem('trilearn.auth.user')).toBeNull()
    expect(window.localStorage.getItem('trilearn.auth.session')).toBe('1')
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
    expect(errorSpy.mock.calls[0][0]).toBe('API Error:')
    expect(JSON.parse(errorSpy.mock.calls[0][1])).toEqual({
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

  it('does not send protected requests without a token when session refresh fails', async () => {
    const apiClient = createAxiosClient()
    const refreshClient = createAxiosClient()
    const refreshError = {
      response: {
        status: 401,
        data: { message: 'Refresh token is invalid or expired' }
      }
    }

    refreshClient.post.mockRejectedValue(refreshError)

    vi.doMock('axios', () => ({
      default: {
        create: vi.fn()
          .mockReturnValueOnce(apiClient)
          .mockReturnValueOnce(refreshClient)
      }
    }))

    const { setAuthState } = await import('../src/utils/api')
    setAuthState({
      token: null,
      user: {
        name: 'Jordan',
        role: 'STUDENT',
        mustChangePassword: false,
        profileCompleted: true
      }
    })

    const interceptorResolve = apiClient.interceptors.request.use.mock.calls[0][0]
    const requestConfig = {
      url: '/subjects',
      method: 'get',
      headers: {}
    }

    await expect(interceptorResolve(requestConfig)).rejects.toBe(refreshError)
    expect(requestConfig.headers.Authorization).toBeUndefined()
  })
})
