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
const AUTH_USER_STORAGE_KEY = 'trilearn.auth.user'
const REFRESH_COOLDOWN_STORAGE_KEY = 'trilearn.auth.refresh.cooldownUntil'
const AUTH_USER_PERSISTED_FIELDS = ['name', 'role', 'mustChangePassword', 'profileCompleted']

const buildStoredUserSnapshot = (user) => {
  if (!user || typeof user !== 'object') {
    return null
  }

  return AUTH_USER_PERSISTED_FIELDS.reduce((snapshot, field) => {
    if (Object.prototype.hasOwnProperty.call(user, field) && user[field] != null) {
      snapshot[field] = user[field]
    }

    return snapshot
  }, {})
}

const readStoredUser = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const serializedUser = window.sessionStorage.getItem(AUTH_USER_STORAGE_KEY)
    return serializedUser ? buildStoredUserSnapshot(JSON.parse(serializedUser)) : null
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
      const storedUserSnapshot = buildStoredUserSnapshot(user)

      if (storedUserSnapshot && Object.keys(storedUserSnapshot).length > 0) {
        window.sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(storedUserSnapshot))
      } else {
        window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
      }
    } else {
      window.sessionStorage.removeItem(AUTH_USER_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

const readStoredRefreshCooldownUntil = () => {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const rawValue = window.sessionStorage.getItem(REFRESH_COOLDOWN_STORAGE_KEY)
    const parsedValue = Number.parseInt(rawValue || '', 10)
    return Number.isFinite(parsedValue) ? parsedValue : 0
  } catch {
    return 0
  }
}

const writeStoredRefreshCooldownUntil = (value) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (value > Date.now()) {
      window.sessionStorage.setItem(REFRESH_COOLDOWN_STORAGE_KEY, String(value))
    } else {
      window.sessionStorage.removeItem(REFRESH_COOLDOWN_STORAGE_KEY)
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
let refreshCooldownUntil = readStoredRefreshCooldownUntil()

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

const getRetryAfterMs = (error, fallbackMs = 60_000) => {
  const rawRetryAfter = error?.response?.headers?.['retry-after']
  const parsedRetryAfterSeconds = Number.parseInt(rawRetryAfter, 10)

  if (Number.isFinite(parsedRetryAfterSeconds) && parsedRetryAfterSeconds > 0) {
    return parsedRetryAfterSeconds * 1000
  }

  return fallbackMs
}

const setRefreshCooldown = (cooldownUntil) => {
  refreshCooldownUntil = cooldownUntil
  writeStoredRefreshCooldownUntil(cooldownUntil)
}

const clearRefreshCooldown = () => {
  setRefreshCooldown(0)
}

const buildRefreshRateLimitError = () => {
  const retryAfterSeconds = Math.max(1, Math.ceil((refreshCooldownUntil - Date.now()) / 1000))
  const error = new Error('Session refresh is temporarily rate-limited')
  error.response = {
    status: 429,
    data: {
      message: `Too many session refresh attempts. Please wait about ${retryAfterSeconds} seconds and try again.`
    },
    headers: {
      'retry-after': String(retryAfterSeconds)
    }
  }
  return error
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
      /^\/(?:api\/v1\/)?uploads\//i.test(parsedUrl.pathname) &&
      /\.pdf$/i.test(parsedUrl.pathname)
    )
  } catch {
    return false
  }
}

export const isProtectedUploadUrl = (fileUrl) => {
  const resolvedUrl = resolveFileUrl(fileUrl)
  if (!resolvedUrl) {
    return false
  }

  try {
    const parsedUrl = new URL(resolvedUrl)
    const apiOriginUrl = new URL(API_ORIGIN)

    return parsedUrl.origin === apiOriginUrl.origin && /^\/(?:api\/v1\/)?uploads\//i.test(parsedUrl.pathname)
  } catch {
    return false
  }
}

const getRequestPathFromResolvedUrl = (resolvedUrl) => {
  const parsedUrl = new URL(resolvedUrl)
  return `${parsedUrl.pathname}${parsedUrl.search}`
}

export const fetchFileBlob = async (fileUrl, { signal } = {}) => {
  const resolvedUrl = resolveFileUrl(fileUrl)
  if (!resolvedUrl) {
    throw new Error('Invalid file URL')
  }

  if (isProtectedUploadUrl(resolvedUrl)) {
    const response = await api.get(getRequestPathFromResolvedUrl(resolvedUrl), {
      signal,
      responseType: 'blob'
    })

    return {
      blob: response.data,
      resolvedUrl
    }
  }

  const response = await fetch(resolvedUrl, {
    method: 'GET',
    credentials: 'omit',
    signal
  })

  if (!response.ok) {
    throw new Error(`File request failed with status ${response.status}`)
  }

  return {
    blob: await response.blob(),
    resolvedUrl
  }
}

export const openFileUrl = async (fileUrl, { signal } = {}) => {
  const resolvedUrl = resolveFileUrl(fileUrl)
  if (!resolvedUrl) {
    throw new Error('Invalid file URL')
  }

  if (!isProtectedUploadUrl(resolvedUrl)) {
    window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
    return { resolvedUrl, objectUrl: null }
  }

  const { blob } = await fetchFileBlob(resolvedUrl, { signal })
  const objectUrl = window.URL.createObjectURL(blob)
  window.open(objectUrl, '_blank', 'noopener,noreferrer')

  window.setTimeout(() => {
    window.URL.revokeObjectURL(objectUrl)
  }, 60_000)

  return { resolvedUrl, objectUrl }
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

const isRetryableMethod = (requestConfig) => RETRYABLE_METHODS.has(requestConfig?.method?.toLowerCase())

const shouldRetryUnauthorizedRequest = (error) => {
  const originalRequest = error?.config

  return Boolean(
    error?.response?.status === 401 &&
    originalRequest &&
    !originalRequest._authRetryAttempted &&
    isRetryableMethod(originalRequest) &&
    requestUsedAccessToken(originalRequest) &&
    !isAuthRouteRequest(originalRequest)
  )
}

const requestUsedAccessToken = (requestConfig) => {
  const authorizationHeader =
    requestConfig?.headers?.Authorization ||
    requestConfig?.headers?.authorization

  return typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ')
}

const isAuthRouteRequest = (requestConfig) => {
  const requestUrl = String(requestConfig?.url || '')

  return (
    requestUrl.includes('/auth/login') ||
    requestUrl.includes('/auth/refresh') ||
    requestUrl.includes('/auth/logout')
  )
}

// Automatically add token to every request
api.interceptors.request.use(async (config) => {
  if (!authState.token && authState.user && !isAuthRouteRequest(config)) {
    try {
      await refreshSession()
    } catch {
      return config
    }
  }

  if (authState.token) {
    config.headers.Authorization = `Bearer ${authState.token}`
  }
  return config
})

export const refreshSession = async () => {
  if (refreshCooldownUntil > Date.now()) {
    throw buildRefreshRateLimitError()
  }

  if (!refreshPromise) {
    refreshPromise = refreshClient.post('/auth/refresh')
      .then((response) => {
        const { token, user } = response.data
        clearRefreshCooldown()
        setAuthState({ token, user })
        return response.data
      })
      .catch((error) => {
        if (error?.response?.status === 429) {
          setRefreshCooldown(Date.now() + getRetryAfterMs(error))
        }
        clearAuthState()
        throw error
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

    if (shouldRetryUnauthorizedRequest(error)) {
      originalRequest._authRetryAttempted = true
      await wait(200)
      return api(originalRequest)
    }

    if (
      error.response?.status === 401 &&
      !originalRequest?._retry &&
      (requestUsedAccessToken(originalRequest) || Boolean(authState.user)) &&
      !isAuthRouteRequest(originalRequest)
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
