import { createContext, useContext, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  default as api,
  getAuthState,
  refreshSession,
  registerUnauthorizedHandler,
  setAuthState,
  subscribeToAuthState
} from '../utils/api'

const AuthContext = createContext()
const PUBLIC_AUTH_ROUTES = new Set(['/login', '/forgot-password', '/reset-password', '/student-intake', '/verify-email'])
const clearClientSession = () => {
  setAuthState({ token: null, user: null })
}

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState(getAuthState().user)
  const [token, setToken] = useState(getAuthState().token)
  const [loading, setLoading] = useState(true)
  const isPublicAuthRoute = PUBLIC_AUTH_ROUTES.has(location.pathname)

  useEffect(() => {
    let isMounted = true
    const currentAuthState = getAuthState()
    const unsubscribe = subscribeToAuthState((nextState) => {
      if (!isMounted) {
        return
      }

      setToken(nextState.token)
      setUser(nextState.user)
    })
    const unregisterUnauthorizedHandler = registerUnauthorizedHandler(() => {
      navigate('/login', { replace: true })
    })

    if (isPublicAuthRoute) {
      // Public auth pages should not silently refresh in the background.
      // If we only have a cached user and no live access token, clear the
      // stale client session so React dev effect replays do not bounce into
      // protected screens or spam refresh attempts.
      if (!currentAuthState.token && currentAuthState.user) {
        clearClientSession()
      }

      setLoading(false)
      return () => {
        isMounted = false
        unsubscribe()
        unregisterUnauthorizedHandler()
      }
    }

    if (currentAuthState.token) {
      setLoading(false)
      return () => {
        isMounted = false
        unsubscribe()
        unregisterUnauthorizedHandler()
      }
    }

    if (!currentAuthState.token && !currentAuthState.user) {
      setLoading(false)
      return () => {
        isMounted = false
        unsubscribe()
        unregisterUnauthorizedHandler()
      }
    }

    refreshSession()
      .catch(() => {
        clearClientSession()
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
      unsubscribe()
      unregisterUnauthorizedHandler()
    }
  }, [isPublicAuthRoute, navigate])

  const login = (userData, userToken) => {
    setAuthState({ user: userData, token: userToken })
  }

  const logout = async ({ skipRequest = false } = {}) => {
    clearClientSession()
    navigate('/login', { replace: true })

    if (!skipRequest) {
      await api.post('/auth/logout').catch(() => null)
    }
  }

  const updateUser = (userData) => {
    setAuthState({ user: userData, token })
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
