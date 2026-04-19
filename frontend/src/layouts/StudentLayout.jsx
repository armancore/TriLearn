import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  IdCard,
  LayoutDashboard,
  Percent,
  UserCircle2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'
import ErrorBoundary from '../components/ErrorBoundary'

const StudentLayout = ({ children, noticesCount = 0 }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const activePath = location.pathname.startsWith('/student/subjects/')
    ? '/student/subjects'
    : location.pathname

  const sidebarItems = useMemo(() => ([
    { path: '/student', label: 'Dashboard', icon: LayoutDashboard, meta: 'Overview and quick access' },
    { path: '/student/subjects', label: 'Subjects', icon: BookOpenText, meta: 'Enrolled subjects' },
    { path: '/student/assignments', label: 'Tasks', icon: ClipboardList, meta: 'Assignments and deadlines' },
    { path: '/student/attendance', label: 'Attendance', icon: Percent, meta: 'Attendance records' },
    { path: '/student/requests', label: 'Requests', icon: FileText, meta: 'Absence explanations' },
    { path: '/student/marks', label: 'Results', icon: FileText, meta: 'Exam results' },
    { path: '/student/materials', label: 'Books', icon: FolderOpen, meta: 'Books and materials' },
    { path: '/student/id-card', label: 'ID Card', icon: IdCard, meta: 'Student identity card' },
    { path: '/student/profile', label: 'Profile', icon: UserCircle2, meta: 'My details' },
  ]), [])

  const topItems = [
    { path: '/student/routine', label: 'Routine', icon: CalendarDays },
    { path: '/student/notices', label: 'Notices', icon: Bell, badge: noticesCount },
    { path: '/student/requests', label: 'Requests', icon: ClipboardList },
    { path: '/student/assignments', label: 'Tasks', icon: FileText }
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppShell
      roleLabel="Student Panel"
      roleTheme="student"
      user={user}
      sidebarItems={sidebarItems}
      topItems={topItems}
      activePath={activePath}
      onLogout={handleLogout}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}

export default StudentLayout
