import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import ChangePassword from './pages/auth/ChangePassword'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import Users from './pages/admin/Users'
import Departments from './pages/admin/Departments'
import Subjects from './pages/admin/Subjects'
import Notices from './pages/admin/Notices'
import AdminRoutine from './pages/admin/Routine'
import GateDashboard from './pages/gate/Dashboard'

// Instructor pages
import InstructorDashboard from './pages/instructor/Dashboard'
import InstructorSubjects from './pages/instructor/Subjects'
import Attendance from './pages/instructor/Attendance'
import Assignments from './pages/instructor/Assignments'
import Marks from './pages/instructor/Marks'
import InstructorNotices from './pages/instructor/Notices'
import InstructorMaterials from './pages/instructor/Materials'
import InstructorRoutine from './pages/instructor/Routine'

// Student pages
import StudentDashboard from './pages/student/Dashboard'
import StudentSubjects from './pages/student/Subjects'
import StudentAttendance from './pages/student/Attendance'
import StudentAssignments from './pages/student/Assignments'
import StudentMarks from './pages/student/Marks'
import StudentNotices from './pages/student/Notices'
import StudentMaterials from './pages/student/Materials'
import StudentRoutine from './pages/student/Routine'
import ProfileSetup from './pages/student/ProfileSetup'
import { getHomeRouteForUser } from './utils/auth'

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )
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
  return children
}

const AppRoutes = () => {
  const { user } = useAuth()
  const homeRoute = getHomeRouteForUser(user)

  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={homeRoute} />} />
      <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to={homeRoute} />} />
      <Route path="/reset-password" element={!user ? <ResetPassword /> : <Navigate to={homeRoute} />} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Users /></ProtectedRoute>} />
      <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={['ADMIN']}><Departments /></ProtectedRoute>} />
      <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Subjects /></ProtectedRoute>} />
      <Route path="/admin/notices" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Notices /></ProtectedRoute>} />
      <Route path="/admin/routine" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><AdminRoutine /></ProtectedRoute>} />

      {/* Coordinator Routes */}
      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/coordinator/users" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Users /></ProtectedRoute>} />
      <Route path="/coordinator/subjects" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Subjects /></ProtectedRoute>} />
      <Route path="/coordinator/notices" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Notices /></ProtectedRoute>} />
      <Route path="/coordinator/routine" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><AdminRoutine /></ProtectedRoute>} />
      <Route path="/coordinator/attendance" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Attendance /></ProtectedRoute>} />
      <Route path="/coordinator/assignments" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Assignments /></ProtectedRoute>} />
      <Route path="/coordinator/marks" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Marks /></ProtectedRoute>} />
      <Route path="/coordinator/materials" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><InstructorMaterials /></ProtectedRoute>} />

      {/* Gatekeeper Routes */}
      <Route path="/gatekeeper" element={<ProtectedRoute allowedRoles={['GATEKEEPER']}><GateDashboard /></ProtectedRoute>} />
      <Route path="/gate" element={<ProtectedRoute allowedRoles={['GATEKEEPER']}><GateDashboard /></ProtectedRoute>} />

      {/* Instructor Routes */}
      <Route path="/instructor" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorDashboard /></ProtectedRoute>} />
      <Route path="/instructor/subjects" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorSubjects /></ProtectedRoute>} />
      <Route path="/instructor/attendance" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Attendance /></ProtectedRoute>} />
      <Route path="/instructor/assignments" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Assignments /></ProtectedRoute>} />
      <Route path="/instructor/marks" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Marks /></ProtectedRoute>} />
      <Route path="/instructor/notices" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorNotices /></ProtectedRoute>} />
      <Route path="/instructor/materials" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorMaterials /></ProtectedRoute>} />
      <Route path="/instructor/routine" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorRoutine /></ProtectedRoute>} />

      {/* Student Routes */}
      <Route path="/student" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute allowedRoles={['STUDENT']}><ProfileSetup /></ProtectedRoute>} />
      <Route path="/student/scan" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/subjects" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentSubjects /></ProtectedRoute>} />
      <Route path="/student/attendance" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/assignments" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAssignments /></ProtectedRoute>} />
      <Route path="/student/marks" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMarks /></ProtectedRoute>} />
      <Route path="/student/notices" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentNotices /></ProtectedRoute>} />
      <Route path="/student/materials" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMaterials /></ProtectedRoute>} />
      <Route path="/student/routine" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentRoutine /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to={user ? homeRoute : '/login'} />} />
    </Routes>
  )
}

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
)

export default App
