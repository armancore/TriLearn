import axios from 'axios'
import { API_BASE_URL, API_ORIGIN } from './apiConfig'
import {
  clearAuthState,
  getAuthState,
  hasSessionHint,
  setAuthState,
  subscribeToAuthState
} from './apiAuthState'
import { isRequestCanceled } from './http'

export {
  API_BASE_URL,
  API_ORIGIN,
  getAuthState,
  hasSessionHint,
  setAuthState,
  subscribeToAuthState
}

const REFRESH_LOCK_TIMEOUT_MS = 10_000
const REFRESH_LOCK_POLL_MS = 100
const REFRESH_LOCK_MAX_WAIT_MS = 12_000
const REFRESH_LOCK_OWNER = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const getRefreshStorageScope = () => {
  if (typeof window === 'undefined') {
    return REFRESH_LOCK_OWNER
  }

  try {
    const existingScope = window.sessionStorage.getItem('trilearn.auth.refresh.scope')
    if (existingScope) {
      return existingScope
    }

    const nextScope = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.sessionStorage.setItem('trilearn.auth.refresh.scope', nextScope)
    return nextScope
  } catch {
    return REFRESH_LOCK_OWNER
  }
}
const REFRESH_STORAGE_SCOPE = getRefreshStorageScope()
const REFRESH_COOLDOWN_STORAGE_KEY = `trilearn.auth.refresh.${REFRESH_STORAGE_SCOPE}.cooldownUntil`
const REFRESH_LOCK_STORAGE_KEY = `trilearn.auth.refresh.${REFRESH_STORAGE_SCOPE}.lock`
const CSRF_COOKIE_NAME = 'csrfToken'
const CSRF_HEADER_NAME = 'X-CSRF-Token'
const CSRF_SAFE_METHODS = new Set(['get', 'head', 'options'])

const readStoredRefreshCooldownUntil = () => {
  if (typeof window === 'undefined') {
    return 0
  }

  try {
    const rawValue = window.localStorage.getItem(REFRESH_COOLDOWN_STORAGE_KEY)
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
      window.localStorage.setItem(REFRESH_COOLDOWN_STORAGE_KEY, String(value))
    } else {
      window.localStorage.removeItem(REFRESH_COOLDOWN_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

const readRefreshLock = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(REFRESH_LOCK_STORAGE_KEY)
    return rawValue ? JSON.parse(rawValue) : null
  } catch {
    return null
  }
}

const writeRefreshLock = (lock) => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    window.localStorage.setItem(REFRESH_LOCK_STORAGE_KEY, JSON.stringify(lock))
    const storedLock = readRefreshLock()
    return storedLock?.owner === lock.owner
  } catch {
    return false
  }
}

const clearRefreshLock = (owner) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const storedLock = readRefreshLock()
    if (!storedLock || storedLock.owner === owner) {
      window.localStorage.removeItem(REFRESH_LOCK_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

let unauthorizedHandler = null
let refreshCooldownUntil = readStoredRefreshCooldownUntil()

export const registerUnauthorizedHandler = (handler) => {
  unauthorizedHandler = handler

  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

const getRetryAfterMs = (error, fallbackMs = 60_000) => {
  const rawRetryAfter = error?.response?.headers?.['retry-after']
  const parsedRetryAfterSeconds = Number.parseInt(rawRetryAfter, 10)

  if (Number.isFinite(parsedRetryAfterSeconds) && parsedRetryAfterSeconds > 0) {
    return parsedRetryAfterSeconds * 1000
  }

  return fallbackMs
}

const sanitizeAxiosError = (error) => ({
  message: error?.message,
  status: error?.response?.status,
  data: error?.response?.data,
  url: error?.config?.url,
  method: error?.config?.method
})

const formatAxiosErrorForConsole = (error) => {
  try {
    return JSON.stringify(sanitizeAxiosError(error), null, 2)
  } catch {
    return sanitizeAxiosError(error)
  }
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
  const apiRelativePath = parsedUrl.pathname.replace(/^\/api\/v\d+(?=\/uploads\/)/i, '')
  return `${apiRelativePath}${parsedUrl.search}`
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

const csrfClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

let refreshPromise = null
let csrfPromise = null
const RETRYABLE_METHODS = new Set(['get', 'head', 'options'])
const MAX_NETWORK_RETRIES = 2

const wait = (ms) => new Promise((resolve) => {
  window.setTimeout(resolve, ms)
})

const acquireRefreshLock = async () => {
  if (typeof window === 'undefined') {
    return null
  }

  const startedAt = Date.now()

  while (Date.now() - startedAt < REFRESH_LOCK_MAX_WAIT_MS) {
    const now = Date.now()
    const currentLock = readRefreshLock()

    if (!currentLock || currentLock.expiresAt <= now || currentLock.owner === REFRESH_LOCK_OWNER) {
      const nextLock = {
        owner: REFRESH_LOCK_OWNER,
        expiresAt: now + REFRESH_LOCK_TIMEOUT_MS
      }

      if (writeRefreshLock(nextLock)) {
        return nextLock.owner
      }
    }

    await wait(REFRESH_LOCK_POLL_MS)
  }

  return null
}

const releaseRefreshLock = (owner) => {
  if (owner) {
    clearRefreshLock(owner)
  }
}

const readCookie = (name) => {
  if (typeof document === 'undefined') {
    return null
  }

  const encodedName = `${encodeURIComponent(name)}=`
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(encodedName))

  return cookie ? decodeURIComponent(cookie.slice(encodedName.length)) : null
}

const shouldSendCsrfToken = (requestConfig) => {
  const method = String(requestConfig?.method || 'get').toLowerCase()
  return !CSRF_SAFE_METHODS.has(method)
}

const ensureCsrfToken = async () => {
  const existingToken = readCookie(CSRF_COOKIE_NAME)
  if (existingToken) {
    return existingToken
  }

  if (!csrfPromise) {
    csrfPromise = csrfClient.get('/auth/csrf')
      .then((response) => response.data?.csrfToken || readCookie(CSRF_COOKIE_NAME))
      .finally(() => {
        csrfPromise = null
      })
  }

  return csrfPromise
}

const attachCsrfToken = async (config) => {
  if (!shouldSendCsrfToken(config)) {
    return config
  }

  const csrfToken = await ensureCsrfToken()
  if (csrfToken) {
    config.headers = config.headers || {}
    config.headers[CSRF_HEADER_NAME] = csrfToken
  }

  return config
}

const shouldRetryRequest = (error) => {
  const method = error.config?.method?.toLowerCase()
  if (!RETRYABLE_METHODS.has(method)) {
    return false
  }

  if (isRequestCanceled(error)) {
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

const shouldRefreshUnauthorizedRequest = (error, {
  hadSessionHintBeforeUnauthorized,
  usedAccessTokenBeforeUnauthorized
} = {}) => {
  const originalRequest = error?.config

  return Boolean(
    error?.response?.status === 401 &&
    originalRequest &&
    !originalRequest._retry &&
    (usedAccessTokenBeforeUnauthorized || hadSessionHintBeforeUnauthorized) &&
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

api.interceptors.request.use(async (config) => {
  await attachCsrfToken(config)
  return config
})

export const refreshSession = async () => {
  if (refreshCooldownUntil > Date.now()) {
    throw buildRefreshRateLimitError()
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshLockOwner = await acquireRefreshLock()

      try {
        const refreshConfig = await attachCsrfToken({ method: 'post' })
        const response = await refreshClient.post('/auth/refresh', undefined, refreshConfig)
        const { user } = response.data
        clearRefreshCooldown()
        setAuthState({ user })
        return response.data
      } catch (error) {
        if (error?.response?.status === 429) {
          setRefreshCooldown(Date.now() + getRetryAfterMs(error))
        }
        clearAuthState()
        throw error
      } finally {
        releaseRefreshLock(refreshLockOwner)
        refreshPromise = null
      }
    })()
  }

  return refreshPromise
}

// Handle token expiry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const hadSessionHintBeforeUnauthorized = hasSessionHint()
    const usedAccessTokenBeforeUnauthorized = requestUsedAccessToken(originalRequest)
    const shouldRefresh = shouldRefreshUnauthorizedRequest(error, {
      hadSessionHintBeforeUnauthorized,
      usedAccessTokenBeforeUnauthorized
    })

    const shouldSuppressExpectedUnauthorizedError = (
      error?.response?.status === 401 &&
      (!hadSessionHintBeforeUnauthorized || shouldRefresh) &&
      !isAuthRouteRequest(error?.config)
    )

    if (
      import.meta.env.DEV &&
      !isRequestCanceled(error) &&
      !shouldSuppressExpectedUnauthorizedError
    ) {
      console.error('API Error:', formatAxiosErrorForConsole(error))
    }

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

    if (shouldRefresh) {
      originalRequest._retry = true

      try {
        await refreshSession()

        return api(originalRequest)
      } catch (refreshError) {
        handleUnauthorizedRedirect()
        return Promise.reject(refreshError)
      }
    }

    if (shouldRetryUnauthorizedRequest(error)) {
      originalRequest._authRetryAttempted = true
      await wait(200)
      return api(originalRequest)
    }

    if (
      error?.response?.status === 401 &&
      !isAuthRouteRequest(originalRequest)
    ) {
      clearAuthState()
    }

    if (
      error.response?.status === 401 &&
      !isAuthRouteRequest(originalRequest) &&
      hadSessionHintBeforeUnauthorized
    ) {
      handleUnauthorizedRedirect()
    }

    return Promise.reject(error)
  }
)

export default api
