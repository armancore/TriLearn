import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/auth/Login'

// Admin pages
import AdminDashboard from './pages/admin/Dashboard'
import Users from './pages/admin/Users'
import Subjects from './pages/admin/Subjects'
import Notices from './pages/admin/Notices'
import AdminRoutine from './pages/admin/Routine'

// Instructor pages
import InstructorDashboard from './pages/instructor/Dashboard'
import InstructorSubjects from './pages/instructor/Subjects'
import Attendance from './pages/instructor/Attendance'
import Assignments from './pages/instructor/Assignments'
import Marks from './pages/instructor/Marks'
import InstructorNotices from './pages/instructor/Notices'
import InstructorMaterials from './pages/instructor/Materials'

// Student pages
import StudentDashboard from './pages/student/Dashboard'
import StudentSubjects from './pages/student/Subjects'
import StudentAttendance from './pages/student/Attendance'
import StudentAssignments from './pages/student/Assignments'
import StudentMarks from './pages/student/Marks'
import StudentNotices from './pages/student/Notices'
import StudentMaterials from './pages/student/Materials'
import StudentRoutine from './pages/student/Routine'


const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500">Loading...</p>
    </div>
  )
  if (!user) return <Navigate to="/login" />
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" />
  return children
}

const AppRoutes = () => {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={!user ? <Login /> : <Navigate to={`/${user.role.toLowerCase()}`} />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['ADMIN']}><Users /></ProtectedRoute>} />
      <Route path="/admin/subjects" element={<ProtectedRoute allowedRoles={['ADMIN']}><Subjects /></ProtectedRoute>} />
      <Route path="/admin/notices" element={<ProtectedRoute allowedRoles={['ADMIN']}><Notices /></ProtectedRoute>} />
      <Route path="/admin/routine" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminRoutine /></ProtectedRoute>} />

      {/* Instructor Routes */}
      <Route path="/instructor" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorDashboard /></ProtectedRoute>} />
      <Route path="/instructor/subjects" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorSubjects /></ProtectedRoute>} />
      <Route path="/instructor/attendance" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Attendance /></ProtectedRoute>} />
      <Route path="/instructor/assignments" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Assignments /></ProtectedRoute>} />
      <Route path="/instructor/marks" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><Marks /></ProtectedRoute>} />
      <Route path="/instructor/notices" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorNotices /></ProtectedRoute>} />
      <Route path="/instructor/materials" element={<ProtectedRoute allowedRoles={['INSTRUCTOR']}><InstructorMaterials /></ProtectedRoute>} />

      {/* Student Routes */}
      <Route path="/student" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentDashboard /></ProtectedRoute>} />
      <Route path="/student/subjects" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentSubjects /></ProtectedRoute>} />
      <Route path="/student/attendance" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAttendance /></ProtectedRoute>} />
      <Route path="/student/assignments" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentAssignments /></ProtectedRoute>} />
      <Route path="/student/marks" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMarks /></ProtectedRoute>} />
      <Route path="/student/notices" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentNotices /></ProtectedRoute>} />
      <Route path="/student/materials" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentMaterials /></ProtectedRoute>} />
      <Route path="/student/routine" element={<ProtectedRoute allowedRoles={['STUDENT']}><StudentRoutine /></ProtectedRoute>} />
      

      <Route path="*" element={<Navigate to="/login" />} />
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