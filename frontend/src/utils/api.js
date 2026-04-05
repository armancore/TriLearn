import axios from 'axios'

const normalizeApiBaseUrl = (rawValue) => {
  const fallbackUrl = 'http://localhost:5000/api/v1'
  const trimmedValue = String(rawValue || '').trim()

  if (!trimmedValue) {
    return fallbackUrl
  }

  if (/\/api\/v\d+\/?$/i.test(trimmedValue)) {
    return trimmedValue.replace(/\/+$/, '')
  }

  if (/\/api\/?$/i.test(trimmedValue)) {
    return `${trimmedValue.replace(/\/+$/, '')}/v1`
  }

  return `${trimmedValue.replace(/\/+$/, '')}/api/v1`
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL)
export const API_ORIGIN = API_BASE_URL.replace(/\/api(?:\/v\d+)?\/?$/, '')
const AUTH_USER_STORAGE_KEY = 'edunexus.auth.user'

const readStoredUser = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const serializedUser = window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY)
    return serializedUser ? JSON.parse(serializedUser) : null
  } catch {
    return null
  }
}

const writeStoredUser = (user) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (user) {
      window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(user))
    } else {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

let authState = {
  token: null,
  user: readStoredUser()
}
let unauthorizedHandler = null

const authSubscribers = new Set()

const notifyAuthSubscribers = () => {
  const snapshot = { ...authState }
  authSubscribers.forEach((listener) => listener(snapshot))
}

export const getAuthState = () => ({ ...authState })

export const subscribeToAuthState = (listener) => {
  authSubscribers.add(listener)
  return () => {
    authSubscribers.delete(listener)
  }
}

export const registerUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

export const hasSessionHint = () => {
  return Boolean(authState.token || authState.user)
}

export const setAuthState = ({ token = null, user = null } = {}) => {
  authState = { token, user }
  writeStoredUser(user)
  notifyAuthSubscribers()
}

const clearAuthState = () => {
  setAuthState({ token: null, user: null })
}

const handleUnauthorizedRedirect = () => {
  clearAuthState()

  if (typeof unauthorizedHandler === 'function') {
    unauthorizedHandler()
    return
  }

  window.location.href = '/login'
}

export const resolveFileUrl = (fileUrl) => {
  if (!fileUrl) return null

  const normalizedFileUrl = String(fileUrl).trim()
  if (!normalizedFileUrl) return null

  if (/^(data:|blob:)/i.test(normalizedFileUrl)) {
    return null
  }

  if (/^https?:\/\//i.test(normalizedFileUrl)) {
    try {
      const absoluteUrl = new URL(normalizedFileUrl)
      return ['http:', 'https:'].includes(absoluteUrl.protocol) ? absoluteUrl.toString() : null
    } catch {
      return null
    }
  }

  try {
    const resolvedUrl = new URL(normalizedFileUrl, `${API_ORIGIN}/`)
    return ['http:', 'https:'].includes(resolvedUrl.protocol) ? resolvedUrl.toString() : null
  } catch {
    return null
  }
}

export const isEmbeddablePdfUrl = (fileUrl) => {
  const resolvedUrl = resolveFileUrl(fileUrl)
  if (!resolvedUrl) {
    return false
  }

  try {
    const parsedUrl = new URL(resolvedUrl)
    const apiOriginUrl = new URL(API_ORIGIN)

    return (
      parsedUrl.origin === apiOriginUrl.origin &&
      /^\/uploads\//i.test(parsedUrl.pathname) &&
      /\.pdf$/i.test(parsedUrl.pathname)
    )
  } catch {
    return false
  }
}

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

let refreshPromise = null
const RETRYABLE_METHODS = new Set(['get', 'head', 'options'])
const MAX_NETWORK_RETRIES = 2

const wait = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

const shouldRetryRequest = (error) => {
  const method = error.config?.method?.toLowerCase()
  if (!RETRYABLE_METHODS.has(method)) {
    return false
  }

  if (error.code === 'ERR_CANCELED') {
    return false
  }

  if (!error.response) {
    return true
  }

  return [502, 503, 504].includes(error.response.status)
}

// Automatically add token to every request
api.interceptors.request.use((config) => {
  if (authState.token) {
    config.headers.Authorization = `Bearer ${authState.token}`
  }
  return config
})

export const refreshSession = async () => {
  if (!refreshPromise) {
    refreshPromise = refreshClient.post('/auth/refresh')
      .then((response) => {
        const { token, user } = response.data
        setAuthState({ token, user })
        return response.data
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

// Handle token expiry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (
      originalRequest &&
      shouldRetryRequest(error)
    ) {
      originalRequest._retryCount = originalRequest._retryCount || 0

      if (originalRequest._retryCount < MAX_NETWORK_RETRIES) {
        originalRequest._retryCount += 1
        await wait(300 * originalRequest._retryCount)
        return api(originalRequest)
      }
    }

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.url?.includes('/auth/login') &&
      !originalRequest?.url?.includes('/auth/refresh') &&
      !originalRequest?.url?.includes('/auth/logout')
    ) {
      originalRequest._retry = true

      try {
        const { token } = await refreshSession()

        originalRequest.headers = originalRequest.headers || {}
        originalRequest.headers.Authorization = `Bearer ${token}`

        return api(originalRequest)
      } catch (refreshError) {
        handleUnauthorizedRedirect()
        return Promise.reject(refreshError)
      }
    }

    if (error.response?.status === 401) {
      handleUnauthorizedRedirect()
    }

    return Promise.reject(error)
  }
)

export default api
