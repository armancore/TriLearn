const LEGACY_AUTH_USER_STORAGE_KEY = 'trilearn.auth.user'
const AUTH_SESSION_HINT_STORAGE_KEY = 'trilearn.auth.session'

const clearLegacyStoredUser = () => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(LEGACY_AUTH_USER_STORAGE_KEY)
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

clearLegacyStoredUser()

const readStoredSessionHint = () => {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(AUTH_SESSION_HINT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const writeStoredSessionHint = (hasSession) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (hasSession) {
      window.localStorage.setItem(AUTH_SESSION_HINT_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(AUTH_SESSION_HINT_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures so auth remains functional in restricted environments.
  }
}

let hasStoredSessionHint = readStoredSessionHint()

let authState = {
  token: null,
  user: null
}

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

export const hasSessionHint = () => {
  return Boolean(authState.token || authState.user || hasStoredSessionHint)
}

export const setAuthState = ({ token = null, user = null } = {}) => {
  authState = { token, user }
  hasStoredSessionHint = Boolean(token || user)
  writeStoredSessionHint(hasStoredSessionHint)
  notifyAuthSubscribers()
}

export const clearAuthState = () => {
  setAuthState({ token: null, user: null })
}
