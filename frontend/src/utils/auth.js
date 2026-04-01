export const getHomeRouteForUser = (user) => {
  if (!user) return '/login'
  if (user.mustChangePassword) return '/change-password'
  if (user.role === 'STUDENT' && !user.profileCompleted) return '/student/profile'

  const normalizedRole = String(user.role || '').toUpperCase()

  if (normalizedRole === 'ADMIN') return '/admin'
  if (normalizedRole === 'COORDINATOR') return '/coordinator'
  if (normalizedRole === 'GATEKEEPER') return '/gate'
  if (normalizedRole === 'INSTRUCTOR') return '/instructor'
  if (normalizedRole === 'STUDENT') return '/student'

  return '/login'
}
