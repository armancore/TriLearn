import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { ThemeProvider, useTheme } from '../context/ThemeContext'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { getHomeRouteForRole } from '../utils/auth'

const RootNavigation = () => {
  const { user, loading } = useAuth()
  const { resolvedTheme } = useTheme()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) {
      return
    }

    const inAuthGroup = segments[0] === 'auth'

    if (!user && !inAuthGroup) {
      router.replace('/auth/login')
      return
    }

    if (user?.mustChangePassword && segments[1] !== 'change-password') {
      router.replace('/auth/change-password')
      return
    }

    const atRoot = segments.length === 0

    if (user && !user.mustChangePassword && atRoot) {
      router.replace(getHomeRouteForRole(user.role))
      return
    }

    if (user && !user.mustChangePassword && inAuthGroup) {
      router.replace(getHomeRouteForRole(user.role))
    }
  }, [loading, router, segments, user])

  if (loading) {
    return <LoadingSpinner fullScreen />
  }

  return (
    <>
      <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}

const RootLayout = () => (
  <ThemeProvider>
    <AuthProvider>
      <RootNavigation />
    </AuthProvider>
  </ThemeProvider>
)

export default RootLayout
