import { createContext, useContext, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  API_BASE_URL,
  clearAuthState,
  getAuthState,
  refreshSession,
  registerUnauthorizedHandler,
  setAuthState,
  subscribeToAuthState
} from '../utils/api'

const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate()
  const [user, setUser] = useState(getAuthState().user)
  const [token, setToken] = useState(getAuthState().token)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
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

    refreshSession()
      .catch(() => {
        clearAuthState()
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
  }, [navigate])

  const login = (userData, userToken) => {
    setAuthState({ user: userData, token: userToken })
  }

  const logout = () => {
    fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => null).finally(() => {
      clearAuthState()
      navigate('/login', { replace: true })
    })
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
