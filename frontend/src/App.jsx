import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ReferenceDataProvider } from './context/ReferenceDataContext'
import { ThemeProvider } from './context/ThemeContext'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import ChangePassword from './pages/auth/ChangePassword'
import StudentIntakeForm from './pages/auth/StudentIntakeForm'
import HomePage from './pages/shared/HomePage'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import CoordinatorDashboard from './pages/coordinator/Dashboard'
import Users from './pages/admin/Users'
import StudentApplications from './pages/admin/StudentApplications'
import Departments from './pages/admin/Departments'
import Subjects from './pages/admin/Subjects'
import Notices from './pages/admin/Notices'
import AdminRoutine from './pages/admin/Routine'
import StudentQrSettings from './pages/admin/StudentQrSettings'
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
import InstructorRequests from './pages/instructor/Requests'

// Student pages
import StudentDashboard from './pages/student/Dashboard'
import StudentSubjects from './pages/student/Subjects'
import StudentAttendance from './pages/student/Attendance'
import StudentTickets from './pages/student/Tickets'
import StudentAssignments from './pages/student/Assignments'
import StudentMarks from './pages/student/Marks'
import StudentNotices from './pages/student/Notices'
import StudentMaterials from './pages/student/Materials'
import StudentRoutine from './pages/student/Routine'
import StudentIdCard from './pages/student/IdCard'
import ProfilePage from './pages/shared/ProfilePage'
import NotFound from './pages/shared/NotFound'
import { getHomeRouteForUser } from './utils/auth'
import LoadingSkeleton from './components/LoadingSkeleton'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'

const withRouteBoundary = (element) => <ErrorBoundary>{element}</ErrorBoundary>

const AppRoutes = () => {
  const { user, loading } = useAuth()
  const homeRoute = getHomeRouteForUser(user)

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-5xl">
          <LoadingSkeleton rows={4} itemClassName="h-24" />
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to={homeRoute} /> : withRouteBoundary(<HomePage />)} />
      <Route path="/login" element={!user ? withRouteBoundary(<Login />) : <Navigate to={homeRoute} />} />
      <Route path="/student-intake" element={withRouteBoundary(<StudentIntakeForm />)} />
      <Route path="/forgot-password" element={!user ? withRouteBoundary(<ForgotPassword />) : <Navigate to={homeRoute} />} />
      <Route path="/reset-password" element={!user ? withRouteBoundary(<ResetPassword />) : <Navigate to={homeRoute} />} />
      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Users /></ProtectedRoute>} />
      <Route path="/admin/applications" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><StudentApplications /></ProtectedRoute>} />
      <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={['ADMIN']}><Departments /></ProtectedRoute>} />
      <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Subjects /></ProtectedRoute>} />
      <Route path="/admin/notices" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><Notices /></ProtectedRoute>} />
      <Route path="/admin/routine" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><AdminRoutine /></ProtectedRoute>} />
      <Route path="/admin/student-qr" element={<ProtectedRoute allowedRoles={['ADMIN', 'COORDINATOR']}><StudentQrSettings /></ProtectedRoute>} />

      {/* Coordinator Routes */}
      <Route path="/coordinator" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><CoordinatorDashboard /></ProtectedRoute>} />
      <Route path="/coordinator/users" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Users /></ProtectedRoute>} />
      <Route path="/coordinator/applications" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><StudentApplications /></ProtectedRoute>} />
      <Route path="/coordinator/subjects" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Subjects /></ProtectedRoute>} />
      <Route path="/coordinator/notices" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Notices /></ProtectedRoute>} />
      <Route path="/coordinator/routine" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><AdminRoutine /></ProtectedRoute>} />
      <Route path="/coordinator/student-qr" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><StudentQrSettings /></ProtectedRoute>} />
      <Route path="/coordinator/attendance" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Attendance /></ProtectedRoute>} />
      <Route path="/coordinator/assignments" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Assignments /></ProtectedRoute>} />
      <Route path="/coordinator/marks" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><Marks /></ProtectedRoute>} />
      <Route path="/coordinator/materials" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><InstructorMaterials /></ProtectedRoute>} />
      <Route path="/coordinator/requests" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><InstructorRequests /></ProtectedRoute>} />
      <Route path="/coordinator/profile" element={<ProtectedRoute allowedRoles={['COORDINATOR']}><ProfilePage /></ProtectedRoute>} />

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
      <Route path="/instructor/requests" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorRequests /></ProtectedRoute>} />
      <Route path="/instructor/profile" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><ProfilePage /></ProtectedRoute>} />

      {/* Student Routes */}
      <Route path="/student" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/profile" element={<ProtectedRoute allowedRoles={['STUDENT']}><ProfilePage /></ProtectedRoute>} />
      <Route path="/student/id-card" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentIdCard /></ProtectedRoute>} />
      <Route path="/student/scan" element={<ProtectedRoute allowedRoles={['STUDENT']}><Navigate to="/student/attendance?scan=1" replace /></ProtectedRoute>} />
      <Route path="/student/subjects" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentSubjects /></ProtectedRoute>} />
      <Route path="/student/attendance" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/requests" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentTickets /></ProtectedRoute>} />
      <Route path="/student/tickets" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentTickets /></ProtectedRoute>} />
      <Route path="/student/assignments" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAssignments /></ProtectedRoute>} />
      <Route path="/student/marks" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMarks /></ProtectedRoute>} />
      <Route path="/student/notices" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentNotices /></ProtectedRoute>} />
      <Route path="/student/materials" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMaterials /></ProtectedRoute>} />
      <Route path="/student/routine" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentRoutine /></ProtectedRoute>} />
      <Route path="/admin/profile" element={<ProtectedRoute allowedRoles={['ADMIN']}><ProfilePage /></ProtectedRoute>} />
      
      <Route path="*" element={withRouteBoundary(<NotFound />)} />
    </Routes>
  )
}

const App = () => (
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <ReferenceDataProvider>
        <ToastProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </ToastProvider>
        </ReferenceDataProvider>
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>
)

export default App
