import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ErrorBoundary from './ErrorBoundary'
import LoadingSkeleton from './LoadingSkeleton'

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <LoadingSkeleton rows={4} itemClassName="h-24" />
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" />
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" />
  }
  if (
    user.role === 'STUDENT' &&
    !user.profileCompleted &&
    location.pathname !== '/student/profile' &&
    location.pathname !== '/change-password'
  ) {
    return <Navigate to="/student/profile" />
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" />

  return <ErrorBoundary>{children}</ErrorBoundary>
}

export default ProtectedRoute
