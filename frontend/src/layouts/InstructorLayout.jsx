import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BookOpenText,
  CalendarDays,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Percent,
  UserCircle2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import AppShell from '../components/AppShell'
import CoordinatorLayout from './CoordinatorLayout'
import ErrorBoundary from '../components/ErrorBoundary'

const InstructorLayout = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const basePath = '/instructor'

  const sidebarItems = useMemo(() => ([
    { path: `${basePath}`, label: 'Dashboard', icon: LayoutDashboard, meta: 'Overview' },
    { path: `${basePath}/subjects`, label: 'Modules', icon: BookOpenText, meta: 'Assigned modules' },
    { path: `${basePath}/assignments`, label: 'Assignments', icon: ClipboardList, meta: 'Module assignments' },
    { path: `${basePath}/attendance`, label: 'Attendance', icon: Percent, meta: 'Subject attendance' },
    { path: `${basePath}/marks`, label: 'Exam Results', icon: FileText, meta: 'Subject exam marks' },
    { path: `${basePath}/profile`, label: 'Profile', icon: UserCircle2, meta: 'My account' }
  ]), [])

  if (user?.role === 'COORDINATOR') {
    return <CoordinatorLayout>{children}</CoordinatorLayout>
  }

  const topItems = [
    { path: `${basePath}/routine`, label: 'Routine', icon: CalendarDays },
    { path: `${basePath}/notices`, label: 'Notices', icon: Bell },
    { label: 'Events', icon: CalendarDays },
    { path: `${basePath}/requests`, label: 'Requests', icon: ClipboardList },
    { label: 'Key Dates', icon: CalendarDays },
    { label: 'Survey', icon: FileText },
    { label: 'Weekly', icon: Bell }
  ]

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <AppShell
      roleLabel="Instructor Panel"
      roleTheme="instructor"
      user={user}
      sidebarItems={sidebarItems}
      topItems={topItems}
      activePath={location.pathname}
      onLogout={handleLogout}
    >
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </AppShell>
  )
}

export default InstructorLayout
